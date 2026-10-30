"""FFmpeg 컷편집 파이프라인 — 스타일 프리셋별 편집 + 1080p 렌더링."""

import json
import math
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache

from loguru import logger

import pipeline.hdr as hdr
from pipeline import color_match, ffmpeg_error
from pipeline import transition as tr
from pipeline.render_spec import RenderSpec, build_video_filter


MIN_CLIP_DURATION_SECONDS = 0.1
CLIP_END_TOLERANCE_SECONDS = 0.05

# ── 기본 처리(사용자가 고르지 않는다 — decisions/auto-edit-draft.md §6.3) ──
#
# 컷마다 녹음 레벨이 달라 컷이 바뀔 때마다 소리가 튀었다. 컷 하나하나를 같은 크기로 맞추고(선형 이득 —
# 동적 압축은 짧은 컷에서 숨소리처럼 펌핑한다), 경계에는 몇 ms 페이드를 걸어 파형이 0 을 지나지 않는
# 컷에서 나는 '틱' 을 없앤다. 무비 전체는 마지막에 플랫폼 기준 크기로 한 번 더 맞춘다(`finalize`).
CLIP_TARGET_LUFS = -16.0
# 거의 무음인 컷을 기준 크기로 끌어올리면 잡음만 커진다 — 이보다 작으면 건드리지 않는다.
CLIP_SILENCE_LUFS = -50.0
CLIP_MAX_GAIN_DB = 12.0
MICRO_FADE_SECONDS = 0.005
# 컷 하나를 키운 만큼 넘치지 않게 막는 높이(−1dBFS).
CLIP_PEAK_LIMIT = 0.891
# 릴스 · 틱톡이 맞추는 크기. 안 맞추면 업로드 뒤 플랫폼이 다시 눌러 소리가 뭉개진다.
MOVIE_TARGET_LUFS = -14.0
# 무비 전체를 키운 뒤 피크를 막는 높이(−2.5dBFS = 0.750). 4배로 올려 막아 샘플 사이 피크(트루 피크)까지 잡고,
# 플랫폼 기준 −1.5dBTP 에 AAC 인코딩이 더하는 몫으로 1dB 를 남긴다 — 그 몫은 ffmpeg 의 AAC 인코더 판마다 달라,
# 0.5dB 로는 7.1 에서 −1.66 이던 같은 소리가 6.1(CI)에서 −1.43 이었다.
MOVIE_PEAK_LIMIT = 0.75
MOVIE_MAX_GAIN_DB = 30.0
# 리미터가 피크를 누른 만큼 크기가 줄어 다시 재 보정한다 — 이만큼 가까워지면 멈추고, 이 횟수를 넘기지 않는다.
MOVIE_LEVEL_TOLERANCE_LU = 0.3
MOVIE_LEVEL_PASSES = 4
# 마지막으로 인코딩하는 화질. 중간 파일은 한 번 더 인코딩되므로 조금 높게 둔다.
FINAL_CRF = "20"
INTERMEDIATE_CRF = "18"
# 트렌드 레시피의 중간 구간 — 어차피 마지막 합성에서 다시 인코딩하므로 가장 빠른 설정으로, 이어 붙일 수 있게 타임스케일을 고정
FAST_PRESET = "ultrafast"
# 스피드램프의 빠른 몫(continuity.RAMP_SPAN 과 같다 — 순환 import 를 피해 값을 둔다)
RAMP_SPAN_DEFAULT = (0.3, 0.7)
TIMESCALE = 15360


@dataclass(frozen=True)
class ClipSource:
    path: str
    start_ms: int = 0
    end_ms: int | None = None


@dataclass(frozen=True)
class StylePreset:
    name: str
    # 클립 정규화 시 적용할 색보정(eq) 필터. 빈 문자열이면 원본 색감 유지.
    eq: str
    # 클립 간 전환: "crossfade" | "cut"
    transition: str
    transition_seconds: float
    bgm_tag: str


PRESETS: dict[str, StylePreset] = {
    "감성": StylePreset("감성", "eq=saturation=0.8", "crossfade", 0.8, "calm"),
    "여행": StylePreset("여행", "eq=brightness=0.1", "cut", 0.3, "upbeat"),
    "일상": StylePreset("일상", "", "cut", 0.5, "daily"),
}


def get_preset(name: str) -> StylePreset:
    return PRESETS.get(name, PRESETS["일상"])


def _run(cmd: list[str]) -> None:
    cmd = ffmpeg_error.no_stats(cmd)
    logger.debug("ffmpeg: {}", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 실패: {ffmpeg_error.describe(proc.returncode, proc.stderr)}")


def _file_key(path: str) -> tuple[str, int, int]:
    st = os.stat(path)
    return path, st.st_mtime_ns, st.st_size


@lru_cache(maxsize=512)
def _probe_duration(key: tuple[str, int, int]) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", key[0],
        ],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


@lru_cache(maxsize=512)
def _probe_has_audio(key: tuple[str, int, int]) -> bool:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a",
            "-show_entries", "stream=index", "-of", "json", key[0],
        ],
        capture_output=True, text=True, check=True,
    )
    return bool(json.loads(out.stdout).get("streams"))


# 같은 파일을 여러 단계가 거듭 묻는다(트렌드 한 편에 135번 — 2026-10-22 측정). 경로 · 수정 시각 · 크기가 같으면 다시 묻지 않는다.
def probe_duration(path: str) -> float:
    try:
        key = _file_key(path)
    except OSError:  # 로컬 파일이 아니면(URL 등) 캐시 없이
        return _probe_duration.__wrapped__((path, 0, 0))
    return _probe_duration(key)


def _has_audio(path: str) -> bool:
    try:
        key = _file_key(path)
    except OSError:
        return _probe_has_audio.__wrapped__((path, 0, 0))
    return _probe_has_audio(key)


_EBUR128_INTEGRATED = re.compile(r"^\s*I:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+LUFS\s*$", re.MULTILINE)


def _parse_ebur128(stderr: str) -> float | None:
    """`ebur128` 이 stderr 끝의 요약(Summary)에 찍는 통합 음량(`I:`). 줄마다의 기록은 `framelog=quiet` 로 끈다."""
    found = _EBUR128_INTEGRATED.findall(stderr)
    if not found:
        return None
    try:
        return float(found[-1])
    except ValueError:
        return None


def measure_loudness(
    path: str, start: float = 0.0, duration: float | None = None, pre_filter: str = ""
) -> float | None:
    """구간의 통합 음량(LUFS) — `pre_filter` 가 있으면 그 필터를 거친 소리의 크기. 소리가 없거나 잴 수 없으면 None.

    렌더와 같은 오디오 트랙(`0:a:0`)을 잰다 — ffmpeg 의 기본 선택(채널이 가장 많은 트랙)에 맡기면 트랙이 여럿인 원본에서
    다른 트랙을 쟀다(backlog E-48). 재지 못하면 경고를 남긴다 — 그 컷은 크기를 맞추지 않고 지나간다.

    `ebur128` 로 잰다(BS.1770 통합 음량, 0.1 LU 단위). 처음에는 `loudnorm` 의 측정값을 썼는데, loudnorm 은 재기만 할 때도
    192kHz 로 리샘플해 같은 값을 약 3배 느리게 냈다 — 컷 10개 무비에서 1.6~3.0초 대 0.5~0.9초, 값 차이 0.15 LU 안(backlog E-52).
    소리가 없으면 ebur128 은 −70 LUFS(절대 게이트)를 내고, 호출하는 쪽이 무음 기준(−50)으로 거른다.
    """
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.3f}"]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    measure = f"{pre_filter},ebur128=framelog=quiet" if pre_filter else "ebur128=framelog=quiet"
    cmd += ["-i", path, "-map", "0:a:0", "-af", measure, "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    value = _parse_ebur128(proc.stderr) if proc.returncode == 0 else None
    if value is None:
        logger.warning(
            "음량을 재지 못했다 — 크기를 맞추지 않는다: {} ({})",
            path,
            proc.stderr.strip()[-300:] or f"exit {proc.returncode}",
        )
        return None
    return value if math.isfinite(value) else None


def clip_level_filter(gain_db: float, duration: float) -> str:
    """컷 하나의 소리 손질 — 크기 맞춤 → 키운 만큼 넘치지 않게 막고 → 양 끝 마이크로 페이드.

    리미터의 `latency=1` 이 없으면 미리보기 버퍼(attack 5ms)만큼 소리가 늦게 나와, 컷의 첫 5ms 는 0 이고 진짜 소리는
    그 뒤에 페이드 없이 시작했다 — 페이드가 0 위에 걸려 없애려던 '틱' 이 그대로였고, 끝 5ms 는 잘렸다(2026-10-13 리뷰).
    """
    fade = min(MICRO_FADE_SECONDS, duration / 4)
    return (
        f"volume={gain_db:.2f}dB,alimiter=limit={CLIP_PEAK_LIMIT}:level=0:latency=1,"
        f"afade=t=in:d={fade:.3f},afade=t=out:st={duration - fade:.3f}:d={fade:.3f}"
    )


def clip_gain_db(loudness: float | None) -> float:
    """컷 하나를 기준 크기로 맞추는 이득. 무음 · 측정 불가는 0, 크기는 ±상한 안."""
    if loudness is None or loudness < CLIP_SILENCE_LUFS:
        return 0.0
    gain = CLIP_TARGET_LUFS - loudness
    return max(-CLIP_MAX_GAIN_DB, min(CLIP_MAX_GAIN_DB, gain))


def _resolve_clip_window(
    source_duration: float, start_ms: int, end_ms: int | None
) -> tuple[float, float, float]:
    start = start_ms / 1000
    requested_end = source_duration if end_ms is None else end_ms / 1000
    if start >= source_duration:
        raise ValueError("클립 시작 시간이 원본 영상 길이를 벗어났습니다.")
    if requested_end > source_duration + CLIP_END_TOLERANCE_SECONDS:
        raise ValueError("클립 종료 시간이 원본 영상 길이를 벗어났습니다.")
    end = min(requested_end, source_duration)
    duration = end - start
    if duration < MIN_CLIP_DURATION_SECONDS:
        raise ValueError("클립 길이는 최소 100ms여야 합니다.")
    return start, end, duration


#: 이어 붙일 구간의 프레임 형식 — 원본마다 색 태그(bt470bg · bt709 · 없음)와 범위(앱 스냅은 yuvj 풀 레인지)가 달라, 그대로 이으면 결합 파일
#: 중간에서 속성이 바뀌고 뒤 단계(글 · 스티커 합성)의 필터가 다시 초기화되며 프레임을 버렸다(2026-10-29 — 267ms 멈춤, 영상이 1프레임 늦게 시작).
#: 태그만 바꾸지 않고 행렬 · 범위를 실제로 변환한 뒤(scale) 태그를 적는다(setparams — muxer 가 입력 태그를 되쓰지 않게, hdr.py 와 같은 이유).
UNIFORM_FRAMES = ("scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                  "setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709")


def frame_cut_seconds(seconds: float, fps: int) -> float:
    """`-t` 에 넘길 길이 — `seconds` 를 가장 가까운 프레임 수 n 으로 반올림해 정확히 n 프레임만 남긴다.

    ffmpeg 의 `-t T` 는 **끝나는 시각(pts + 1프레임)이 T 이하인 프레임**만 남긴다(2026-10-29 실측 — `-t 0.4833` 은 14프레임). 컷 길이를
    그대로 넘기면 프레임 수가 버려져(1490ms = 44.7프레임 → 44) 컷마다 짧아졌고, 이어 붙인 경계가 계획에서 밀렸다(10컷에서 최대 184ms).
    n 프레임에 1/4 프레임을 더해 넘기면 n 번째 프레임까지 남고, 끝에 덧댄 프레임(tpad)은 빠진다.
    """
    return (max(1, round(seconds * fps)) + 0.25) / fps


def normalize_clip(
    src: str,
    dst: str,
    eq: str,
    render_spec: RenderSpec,
    start_ms: int = 0,
    end_ms: int | None = None,
    *,
    speed: float = 1.0,
    extra_video: str | None = None,
    level_audio: bool = True,
    preset: str = "veryfast",
    ramp: float = 0.0,
    hold: tuple[int, int] | None = None,
) -> None:
    """Trim and normalize one clip while keeping its audio aligned.

    The keyword options are for the trend recipe's one-pass cut (`prepare_segments(..., fx=...)`) and leave the command
    unchanged at their defaults: `speed` retimes the window (video setpts · audio atempo), `extra_video` is appended to the
    video graph (cut effects · look — `pipeline/cut_fx.py`), `level_audio=False` skips the loudness measure when the
    source sound is dropped anyway (music-only), `preset` is the x264 preset of this intermediate.

    The source's own tags stay behind (`-map_metadata -1`). ffmpeg copies the first input's global metadata into
    every output, and a phone's original carries where it was shot (`location`), the device, and its software —
    which would leave in the movie through sharing and SNS posts (backlog E-17). Every later step (joining, BGM,
    subtitles) starts from these files, so stopping it here keeps the whole movie clean.
    """
    cmd = ["ffmpeg", "-y"]
    has_audio = _has_audio(src)
    source_duration = probe_duration(src)
    start, end, duration = _resolve_clip_window(source_duration, start_ms, end_ms)
    cmd += ["-i", src]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    audio_input = "[0:a:0]" if has_audio else "[1:a:0]"
    # HDR 원본은 트림 직후 SDR 로 내린다 — 이후 스케일·블러 배경은 SDR 에서 돌아야
    # 색이 어긋나지 않는다. 필터가 없는 빌드에서는 빈 목록이라 그대로 지나간다.
    tonemap = "".join("," + f for f in hdr.source_filters(src))
    retime = f",setpts=PTS-STARTPTS,setpts=PTS/{speed:.4f}" if speed != 1.0 else ""
    tempo = f",{atempo_chain(speed)}" if speed != 1.0 else ""
    out_duration = duration / speed
    if ramp:
        # 스피드램프 — 가운데 몫만 ramp 배. 출력 시각은 구간마다 이어 붙인 식, 소리는 평균 배속(음원만 레시피라 원본 소리는 빠진다)
        a, b = RAMP_SPAN_DEFAULT
        A, B = a * duration, b * duration
        retime = (f",setpts=PTS-STARTPTS,setpts='(if(lt(T\\,{A:.4f})\\,T\\,if(lt(T\\,{B:.4f})\\,{A:.4f}+(T-{A:.4f})/{ramp:.4f}"
                  f"\\,{A:.4f}+{B - A:.4f}/{ramp:.4f}+(T-{B:.4f}))))/TB'")
        out_duration = A + (B - A) / ramp + (duration - B)
        tempo = f",{atempo_chain(duration / out_duration)}"
    if hold:
        # 프리즈 — 동작 피크의 한 프레임을 hold 만큼 되풀이한다(loop). 소리는 끝에 그만큼 늘린다(음원만 레시피)
        at_ms, hold_ms = hold
        frames = max(1, round(hold_ms * render_spec.fps / 1000))
        start_frame = max(0, round(at_ms * render_spec.fps / 1000))
        loop = f"loop=loop={frames}:size=1:start={start_frame},setpts=N/({render_spec.fps}*TB)"
        extra_video = f"{loop},{extra_video}" if extra_video else loop
        out_duration += hold_ms / 1000
    video_trim = f"[0:v:0]trim=start={start:.3f}:end={end:.3f}{retime}{tonemap}[trimmed_v]"
    if has_audio:
        gain = clip_gain_db(measure_loudness(src, start, duration)) if level_audio else 0.0
        logger.debug("컷 음량 이득 {:+.2f}dB · 색 {}: {}", gain, eq or "없음", src)
        audio_filter = (
            f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"apad,atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS{tempo}"
            f"{',apad,atrim=duration=' + format(out_duration, '.3f') if hold else ''},"
            f"{clip_level_filter(gain, out_duration)}[a]"
        )
    else:
        audio_filter = (
            f"{audio_input}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"atrim=duration={out_duration:.3f},asetpts=PTS-STARTPTS[a]"
        )
    video_graph = build_video_filter(render_spec, eq, input_label='[trimmed_v]')
    if extra_video:
        video_graph = f"{video_graph[:-len('[v]')]}[base_v];[base_v]{extra_video}[v]"
    video_graph = f"{video_graph[:-len('[v]')]},{UNIFORM_FRAMES}[v]"
    filter_graph = (
        f"{video_trim};"
        f"{video_graph};"
        f"{audio_filter}"
    )
    cmd += [
        "-filter_complex", filter_graph,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264", "-preset", preset, "-crf", INTERMEDIATE_CRF, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-map_metadata", "-1",
    ]
    if preset != "veryfast" or speed != 1.0 or extra_video or ramp or hold:
        # 이어 붙이기(concat copy)할 구간 — 타임스케일을 같게, 소리 · 영상을 같은 길이에서 끊는다. 영상 끝에 한 프레임을 늘려 두고
        # -t 가 자른다: ffmpeg 6.1(Ubuntu 24.04 · CI)의 fps 필터는 원본 끝에서 마지막 프레임을 버려 0.5초 구간이 14프레임이 됐고,
        # 이어 붙이면 구간마다 한 프레임씩 영상이 짧아졌다(12구간 6초 → 5.6초). 7.1 · 9 는 15프레임이다
        cmd[cmd.index("-filter_complex") + 1] = filter_graph.replace(
            f"{video_graph};", f"{video_graph[:-len('[v]')]},tpad=stop_mode=clone:stop_duration={1 / render_spec.fps:.4f}[v];", 1)
        cmd += ["-video_track_timescale", str(TIMESCALE), "-t", f"{frame_cut_seconds(out_duration, render_spec.fps):.4f}"]
    cmd.append(dst)
    _run(cmd)


def _concat(normalized: list[str], out: str) -> None:
    inputs: list[str] = []
    for path in normalized:
        inputs += ["-i", path]
    streams = "".join(f"[{i}:v:0][{i}:a:0]" for i in range(len(normalized)))
    fc = f"{streams}concat=n={len(normalized)}:v=1:a=1[v][a]"
    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", FINAL_CRF, "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-c:a", "aac", out,
    ])


def _crossfade(normalized: list[str], durations: list[float], t: float, out: str) -> None:
    inputs: list[str] = []
    for path in normalized:
        inputs += ["-i", path]

    t = min(t, min(durations) / 2)
    vparts, aparts = [], []
    v_prev, a_prev = "[0:v:0]", "[0:a:0]"
    running = durations[0]
    for i in range(1, len(normalized)):
        offset = max(running - t, 0)
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        vparts.append(
            f"{v_prev}[{i}:v:0]xfade=transition=fade:duration={t}:offset={offset:.3f}{v_out}"
        )
        aparts.append(f"{a_prev}[{i}:a:0]acrossfade=d={t}{a_out}")
        v_prev, a_prev = v_out, a_out
        running += durations[i] - t

    fc = ";".join(vparts + aparts)
    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", fc, "-map", v_prev, "-map", a_prev,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", FINAL_CRF, "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-c:a", "aac", out,
    ])


def movie_gain_db(loudness: float | None) -> float:
    """무비 전체를 플랫폼 크기로 맞추는 첫 이득. 무음 · 측정 불가는 0, 크기는 ±상한 안."""
    if loudness is None or loudness < CLIP_SILENCE_LUFS:
        return 0.0
    gain = MOVIE_TARGET_LUFS - loudness
    return max(-MOVIE_MAX_GAIN_DB, min(MOVIE_MAX_GAIN_DB, gain))


def movie_level_filter(gain_db: float) -> str:
    """무비 전체의 크기 맞춤 — 선형 이득 뒤 4배로 올려 피크(트루 피크)를 막고 48kHz 로 되돌린다."""
    return (
        f"volume={gain_db:.2f}dB,aresample=192000,"
        f"alimiter=limit={MOVIE_PEAK_LIMIT}:level=0:latency=1,aresample=48000"
    )


def settle_movie_gain(video_in: str) -> float:
    """플랫폼 크기에 닿는 이득. 리미터가 피크를 누른 만큼 크기가 줄어, 거친 소리를 다시 재 모자란 만큼 더한다."""
    gain = movie_gain_db(measure_loudness(video_in))
    if gain == 0.0:
        return 0.0
    for _ in range(MOVIE_LEVEL_PASSES):
        reached = measure_loudness(video_in, pre_filter=movie_level_filter(gain))
        if reached is None:
            break
        error = MOVIE_TARGET_LUFS - reached
        if abs(error) < MOVIE_LEVEL_TOLERANCE_LU:
            break
        gain = max(-MOVIE_MAX_GAIN_DB, min(MOVIE_MAX_GAIN_DB, gain + error))
    return gain


def finalize(video_in: str, out: str) -> None:
    """무비의 마지막 손질 — 전체 음량을 플랫폼 기준에 맞추고 첫 재생을 앞당긴다.

    음량은 **선형 이득**으로 플랫폼 크기(−14 LUFS)에 맞추고, 튀어나온 피크만 4배 오버샘플링 리미터로 막는다(트루 피크
    −1.5dB 안). 리미터가 피크를 누른 만큼 크기가 줄므로 다시 재 보정한다(`settle_movie_gain`). 처음에는 loudnorm 의 두
    번째 패스(`linear=true`)를 썼는데, loudnorm 은 피크와 평균의 차가 12.5dB 를 넘으면 말없이 동적 모드로 돌아간다 —
    휴대폰 말소리는 흔히 그 범위라 크기를 계속 조절하며 목표에도 못 미쳤다(말소리 같은 합성 신호 셋 모두 dynamic,
    −14.7 ~ −16.5 LUFS, 2026-10-13 리뷰). 영상 · 자막은 다시 인코딩하지 않는다(`copy`). `+faststart` 는 moov 를 앞으로
    옮겨, 받으면서 바로 재생되게 한다.
    """
    gain = settle_movie_gain(video_in)
    if gain == 0.0:
        logger.warning("무비 음량을 맞추지 않는다(무음이거나 재지 못함) — 피크만 막는다: {}", video_in)
    logger.debug("무비 음량 이득 {:+.2f}dB", gain)
    _run([
        "ffmpeg", "-y", "-i", video_in,
        "-map", "0", "-c", "copy",
        "-af", movie_level_filter(gain), "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        out,
    ])


def extract_thumbnail(video: str, out: str, at_seconds: float = 1.0) -> None:
    """지정 시점(기본 1초) 프레임을 JPG 썸네일로 추출."""
    _run([
        "ffmpeg", "-y", "-ss", str(at_seconds), "-i", video,
        "-frames:v", "1", "-q:v", "3", out,
    ])


def color_filters(clips: list[ClipSource]) -> list[str]:
    """컷마다 걸 색 맞춤 필터(무비 전체의 중간값 쪽으로) — prepare_segments(colors=) 에 넘긴다."""
    return _color_matches(clips)


def _color_matches(clips: list[ClipSource]) -> list[str]:
    """컷마다 걸 색 맞춤 필터 — 사용자가 고른 구간만 잰다(겹침용 여분 프레임은 빼고)."""
    if len(clips) < 2:
        return ["" for _ in clips]
    colors = []
    for clip in clips:
        try:
            start, _end, duration = _resolve_clip_window(
                probe_duration(clip.path), clip.start_ms, clip.end_ms
            )
        except ValueError:
            colors.append(None)
            continue
        colors.append(color_match.measure_color(clip.path, start, duration))
    return color_match.match_filters(colors)


def edit(
    clips: list[ClipSource], preset: StylePreset, render_spec: RenderSpec, work_dir: str
) -> str:
    """원본 클립들을 편집해 편집본(BGM/자막 전) 경로를 반환."""
    matches = _color_matches(clips)
    normalized: list[str] = []
    for i, clip in enumerate(clips):
        dst = f"{work_dir}/norm_{i}.mp4"
        normalize_clip(
            clip.path,
            dst,
            color_match.with_style(matches[i], preset.eq),
            render_spec,
            start_ms=clip.start_ms,
            end_ms=clip.end_ms,
        )
        normalized.append(dst)

    out = f"{work_dir}/edited_base.mp4"
    if len(normalized) == 1:
        # 단일 클립: 정규화본을 그대로 사용
        import shutil

        shutil.copyfile(normalized[0], out)
    elif preset.transition == "crossfade":
        durations = [probe_duration(p) for p in normalized]
        _crossfade(normalized, durations, preset.transition_seconds, out)
    else:
        _concat(normalized, out)

    logger.info(
        "컷편집 완료 preset={} profile={} fit={} clips={}",
        preset.name,
        render_spec.output_profile,
        render_spec.fit_mode,
        len(clips),
    )
    return out


# ── 경계별 전환(editSpec v3) ─────────────────────────────────────────────────────
#
# 컷마다 정규화한 구간을 경계의 전환으로 잇는다(specs/movie.md MOV-22). 전환의 종류·길이·폴백은
# transition-vocabulary.json 이 원천이고, 고른 값을 컷에 맞추는 해석(`resolve_transition`)은 앱
# 미리보기와 같은 규칙이다 — 편집 화면에서 본 전환이 결과물이 된다.
#
# **겹침형(crossfade)은 컷 구간 밖의 여분 프레임을 쓴다**(decisions/transition-director.md §0.2). 경계를
# 가운데에 두고 나가는 컷은 구간 끝 뒤로, 들어오는 컷은 구간 시작 앞으로 절반씩 늘려 정규화한 뒤
# 그만큼 겹친다. 그래서 사용자가 자른 구간은 전부 보이고 무비 길이는 컷 길이의 합이다.
# 경계형(dip·flash·zoompunch)은 각 컷 안에서 끝나므로 구간을 늘리지 않고 이어 붙인다.


@dataclass(frozen=True)
class _Segment:
    path: str
    duration: float  # 정규화된 파일의 실제 길이(초)


def _ms_window(clip: ClipSource) -> tuple[int, int, int]:
    """(구간 시작, 구간 끝, 원본 길이) — 모두 밀리초. 끝이 원본보다 길면 원본 끝에 맞춘다."""
    source_ms = math.floor(probe_duration(clip.path) * 1000)
    start, end, _ = _resolve_clip_window(source_ms / 1000, clip.start_ms, clip.end_ms)
    return clip.start_ms, min(round(end * 1000), source_ms), source_ms


SPEED_RANGE = (0.5, 4.0)


def atempo_chain(speed: float) -> str:
    """atempo 는 한 단에 0.5~2.0 배만 받는다 — 그 밖은 여러 단으로 나눠 곱한다."""
    stages, rest = [], speed
    while rest > 2.0:
        stages.append(2.0)
        rest /= 2.0
    while rest < 0.5:
        stages.append(0.5)
        rest /= 0.5
    stages.append(rest)
    return ",".join(f"atempo={s:.4f}" for s in stages)


def retime_clip(clip: ClipSource, speed: float, dst: str) -> ClipSource:
    """컷 구간을 speed 배로 미리 굽는다(배속 — 빠른 숏폼의 걷기 · 이동 구간). 결과는 그 구간만 담긴 새 클립이라
    이후 단계(정규화 · 전환 · 결합)는 보통 클립처럼 다룬다. 소리도 같은 배로(음 높이는 유지 — atempo).
    1.0 이면 아무것도 하지 않는다."""
    if speed == 1.0:
        return clip
    if not SPEED_RANGE[0] <= speed <= SPEED_RANGE[1]:
        raise ValueError(f"배속은 {SPEED_RANGE[0]}~{SPEED_RANGE[1]} 배입니다: {speed}")
    start, end, _ = _resolve_clip_window(probe_duration(clip.path), clip.start_ms, clip.end_ms)
    has_audio = _has_audio(clip.path)
    graph = f"[0:v:0]trim=start={start:.3f}:end={end:.3f},setpts=(PTS-STARTPTS)/{speed:.4f}[v]"
    maps = ["-map", "[v]"]
    if has_audio:
        graph += f";[0:a:0]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS,{atempo_chain(speed)}[a]"
        maps += ["-map", "[a]"]
    _run([
        "ffmpeg", "-y", "-i", clip.path, "-filter_complex", graph, *maps,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", INTERMEDIATE_CRF, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-map_metadata", "-1", dst,
    ])
    return ClipSource(dst)


def cut_windows(clips: list[ClipSource]) -> list[tuple[int, int, int]]:
    """컷마다 (구간 시작, 구간 끝, 원본 길이) ms — 결과물 시간축의 컷 경계를 잴 때 쓴다(텍스트 액센트)."""
    return [_ms_window(clip) for clip in clips]


def resolve_boundaries(
    windows: list[tuple[int, int, int]], transitions: list[tr.Transition]
) -> list[tr.Transition]:
    """경계마다 고른 전환을 양쪽 컷의 길이·여분 프레임에 맞춘다."""
    resolved = []
    for i, chosen in enumerate(transitions):
        out_start, out_end, out_source = windows[i]
        in_start, in_end, _ = windows[i + 1]
        boundary = tr.Boundary(
            outgoing_cut_ms=out_end - out_start,
            outgoing_spare_after_ms=out_source - out_end,
            incoming_cut_ms=in_end - in_start,
            incoming_spare_before_ms=in_start,
        )
        resolved.append(tr.resolve_transition(chosen, boundary))
    return resolved


def _is_overlap(t: tr.Transition) -> bool:
    return t.kind != tr.HARDCUT and tr.KINDS[t.kind]["timing"] == tr.OVERLAP


def _overlap_half_ms(t: tr.Transition | None) -> int:
    # 올림이어도 여분을 넘지 않는다 — 해석이 여분의 두 배 이하로 길이를 잡고 여분은 정수 ms 다.
    return math.ceil(t.duration_ms / 2) if t is not None and _is_overlap(t) else 0


def _zoompunch_filter(t: tr.Transition, render_spec: RenderSpec) -> str:
    entry = tr.KINDS[t.kind]
    seconds = t.duration_ms / 1000
    extra = entry["scaleFrom"] - 1
    # easeOutCubic: 1 - (1 - x)^3 만큼 제자리로 → 배율 = 1 + extra·(1 - x)^3
    zoom = f"1+{extra:g}*pow(1-min(it/{seconds:g}\\,1)\\,3)"
    # zoompan 은 출력 타임베이스를 1/fps 로 선언하면서 pts 는 입력 것을 그대로 쓴다. 입력이
    # 1/15360 이면 프레임 하나가 17초가 되어 2초 컷이 17분이 됐고, 뒤의 fps 가 그 사이를 복제하느라
    # 메모리가 끝없이 늘었다(2026-10-01). 그래서 먼저 타임베이스를 1/fps, pts 를 프레임 번호로 맞춘다.
    fps = render_spec.fps
    return (
        f"fps={fps},settb=1/{fps},setpts=N,"
        f"zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d=1:s={render_spec.width}x{render_spec.height}:fps={fps}"
    )


def _fade_filter(direction: str, t: tr.Transition, share: float, start: float) -> str:
    entry = tr.KINDS[t.kind]
    seconds = t.duration_ms / 1000 * share
    return f"fade=t={direction}:st={start:.3f}:d={seconds:.3f}:color={entry['color']}"


def _segment_video_filter(
    index: int,
    segment: _Segment,
    incoming: tr.Transition | None,
    outgoing: tr.Transition | None,
    render_spec: RenderSpec,
) -> str:
    """구간 하나의 경계형 효과. 들어오는 경계는 앞에, 나가는 경계는 뒤에 걸린다."""
    filters: list[str] = []
    if incoming is not None and incoming.kind == "zoompunch":
        filters.append(_zoompunch_filter(incoming, render_spec))
    if incoming is not None and incoming.kind in ("dip", "flash"):
        share = tr.KINDS[incoming.kind]["split"]["incoming"]
        filters.append(_fade_filter("in", incoming, share, 0))
    if outgoing is not None and outgoing.kind in ("dip", "flash"):
        share = tr.KINDS[outgoing.kind]["split"]["outgoing"]
        start = max(segment.duration - outgoing.duration_ms / 1000 * share, 0)
        filters.append(_fade_filter("out", outgoing, share, start))
    # xfade 는 두 입력의 타임베이스가 같아야 한다 — fps 가 타임베이스를 다시 바꾸므로 settb 가 마지막이다.
    filters.append(f"fps={render_spec.fps},format=yuv420p,setsar=1,settb=AVTB")
    return f"[{index}:v:0]{','.join(filters)}[s{index}v]"


def edit_timeline(
    clips: list[ClipSource],
    transitions: list[tr.Transition],
    preset: StylePreset,
    render_spec: RenderSpec,
    work_dir: str,
) -> str:
    """경계마다 고른 전환으로 컷을 이어 편집본(BGM/자막 전) 경로를 반환한다."""
    if len(transitions) != len(clips) - 1:
        raise ValueError("전환은 컷 사이마다 하나씩이어야 합니다.")

    windows = [_ms_window(clip) for clip in clips]
    resolved = resolve_boundaries(windows, transitions)
    matches = _color_matches(clips)

    segments: list[_Segment] = []
    for i, (clip, (start_ms, end_ms, _source_ms)) in enumerate(zip(clips, windows)):
        before = _overlap_half_ms(resolved[i - 1] if i > 0 else None)
        after = _overlap_half_ms(resolved[i] if i < len(resolved) else None)
        dst = f"{work_dir}/seg_{i}.mp4"
        normalize_clip(
            clip.path,
            dst,
            color_match.with_style(matches[i], preset.eq),
            render_spec,
            start_ms=start_ms - before,
            end_ms=end_ms + after,
        )
        segments.append(_Segment(dst, probe_duration(dst)))

    out = f"{work_dir}/edited_base.mp4"
    if len(segments) == 1:
        shutil.copyfile(segments[0].path, out)
    else:
        _join(segments, resolved, render_spec, out, work_dir)

    logger.info(
        "컷편집 완료(v3) preset={} profile={} fit={} clips={} transitions={}",
        preset.name,
        render_spec.output_profile,
        render_spec.fit_mode,
        len(clips),
        [t.kind if t.duration_ms is None else f"{t.kind}:{t.duration_ms}" for t in resolved],
    )
    return out


def prepare_segments(
    clips: list[ClipSource],
    preset: StylePreset,
    render_spec: RenderSpec,
    work_dir: str,
    *,
    speeds: list[float] | None = None,
    extras: list[str | None] | None = None,
    level_audio: bool = True,
    fast: bool = False,
    ramps: list[float] | None = None,
    holds: list[tuple[int, int] | None] | None = None,
    colors: list[str] | None = None,
) -> list[str]:
    """컷마다 정규화(트림 · 회전 · HDR · 출력 크기 · 컷 음량 · 색 맞춤 + 스타일)한 구간 경로 — 트렌드 레시피(`pipeline/trend_edit.py`).
    colors 는 미리 잰 색 맞춤 필터(`color_filters`) — 주면 다시 재지 않는다(무비 전체로 잰 값을 구간 일부에 쓸 때).

    배속(`speeds`)과 컷 효과 · 색 필터(`extras` — `cut_fx.video_filter`)를 **같은 인코딩 한 번에** 굽는다(따로 구우면 컷마다 두 번 —
    2026-10-22 측정에서 한 편 렌더의 19%). `fast` 는 중간 파일용 가장 빠른 설정 — 마지막 합성에서 다시 인코딩한다.
    겹침 전환용 여분 프레임은 남기지 않는다."""
    matches = colors if colors is not None else _color_matches(clips)
    paths = []
    for i, clip in enumerate(clips):
        start_ms, end_ms, _ = _ms_window(clip)
        dst = f"{work_dir}/prep_{i}.mp4"
        normalize_clip(
            clip.path, dst, color_match.with_style(matches[i], preset.eq), render_spec, start_ms=start_ms, end_ms=end_ms,
            speed=speeds[i] if speeds else 1.0, extra_video=extras[i] if extras else None, level_audio=level_audio,
            preset=FAST_PRESET if fast else "veryfast",
            ramp=ramps[i] if ramps else 0.0, hold=holds[i] if holds else None,
        )
        paths.append(dst)
    return paths


def _frames_duration(path: str, fps: int) -> float:
    """구간의 영상 길이(프레임 수 / fps) — 이어 붙일 때 다음 구간이 시작하는 자리."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets",
         "-of", "json", path], capture_output=True, text=True, check=True)
    return int(json.loads(out.stdout)["streams"][0]["nb_read_packets"]) / fps


def concat_copy(paths: list[str], fps: int, out: str, work_dir: str) -> str:
    """같은 설정으로 인코딩한 구간들을 영상은 다시 인코딩하지 않고(copy) 잇는다. 각 구간이 시작하는 자리는 영상 프레임 수로
    정하고(concat 의 duration), 소리는 그 자리에 맞춰 다시 맞춘다(aresample async — AAC 마지막 프레임만큼 소리가 길어 구간마다
    조금씩 밀리는 것을 막는다). 소리만 다시 인코딩하므로 싸다.

    영상은 영상 트랙만 고른 목록(`exact_stream_id`)에서 가져온다 — 두 트랙을 함께 읽으면 concat 이 소리의 앞 패딩(AAC 1024샘플 = −21ms)을
    시작으로 잡아 영상을 그만큼 뒤로 밀었고, 다음 인코딩이 프레임 격자로 올려 무비 전체가 음악보다 1프레임 늦었다(2026-10-29 실측).
    구간은 모두 이 워커가 만든 파일이라 트랙 id 는 영상 1 · 소리 2 다."""
    entries = "".join(f"file '{p}'\nduration {_frames_duration(p, fps):.6f}\n" for p in paths)
    listing = f"{work_dir}/concat_{os.path.basename(out)}.txt"
    video_listing = f"{work_dir}/concat_{os.path.basename(out)}.video.txt"
    with open(listing, "w") as f:
        f.write(entries)
    with open(video_listing, "w") as f:
        f.write("ffconcat version 1.0\nstream\nexact_stream_id 0x1\n" + entries)
    _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", video_listing, "-f", "concat", "-safe", "0", "-i", listing,
          "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", "aresample=async=1:first_pts=0",
          "-c:a", "aac", "-ar", "48000", "-ac", "2", out])
    return out


def join_prepared(paths: list[str], transitions: list[tr.Transition], render_spec: RenderSpec, work_dir: str) -> str:
    """정규화 · 효과를 마친 구간들을 경계마다의 전환으로 잇는다. 전부 바로 넘김이면 다시 인코딩하지 않고 이어 붙인다
    (트렌드 레시피는 전환 효과까지 구간 안에 구워 늘 그렇다). 여분 프레임이 없으므로 겹침 전환은 해석에서 dip 으로 바뀐다."""
    if len(transitions) != len(paths) - 1:
        raise ValueError("전환은 구간 사이마다 하나씩이어야 합니다.")
    out = f"{work_dir}/joined.mp4"
    if len(paths) == 1:
        shutil.copyfile(paths[0], out)
        return out
    if all(t.kind == tr.HARDCUT for t in transitions):
        return concat_copy(paths, render_spec.fps, out, work_dir)
    segments = [_Segment(p, probe_duration(p)) for p in paths]
    windows = [(0, round(seg.duration * 1000), round(seg.duration * 1000)) for seg in segments]
    _join(segments, resolve_boundaries(windows, transitions), render_spec, out, work_dir)
    return out


# 한 번에 잇는 구간 수 — 결합은 구간 전부를 동시에 디코딩해 메모리가 구간 수에 비례한다. 넘으면 바로 넘김 경계에서 나눠
# 묶음마다 잇고 묶음끼리 이어 붙인다(backlog E-64 — 8GB 에서 9 · 32컷 결합이 죽었다).
JOIN_GROUP = 8


def join_groups(resolved: list[tr.Transition], count: int, size: int = JOIN_GROUP) -> list[tuple[int, int]]:
    """[시작, 끝) 묶음들. 경계는 바로 넘김(hardcut)에서만 — 겹침 전환 · zoompunch 는 양쪽 구간이 한 결합 안에 있어야 한다.
    size 안에 바로 넘김이 없으면 다음 바로 넘김까지(없으면 끝까지) 늘린다."""
    groups, start = [], 0
    while start < count:
        end = min(start + size, count)
        if end < count:
            cuts = [b for b in range(start + 1, end + 1) if resolved[b - 1].kind == tr.HARDCUT]
            if cuts:
                end = cuts[-1]
            else:
                end = next((b for b in range(end + 1, count) if resolved[b - 1].kind == tr.HARDCUT), count)
        groups.append((start, end))
        start = end
    return groups


def _join(segments: list[_Segment], resolved: list[tr.Transition], render_spec: RenderSpec, out: str, work_dir: str) -> None:
    groups = join_groups(resolved, len(segments))
    if len(groups) == 1:
        _join_segments(segments, resolved, render_spec, out)
        return
    parts = []
    for k, (start, end) in enumerate(groups):
        part = f"{work_dir}/group_{k}.mp4"
        _join_segments(segments[start:end], resolved[start:end - 1], render_spec, part)
        parts.append(part)
    listing = f"{work_dir}/groups.txt"
    with open(listing, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    # 묶음은 같은 설정으로 인코딩돼 다시 인코딩하지 않고 이어 붙인다
    _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", out])


def _join_segments(
    segments: list[_Segment],
    resolved: list[tr.Transition],
    render_spec: RenderSpec,
    out: str,
) -> None:
    # 입력마다 디코더를 한 스레드로 둔다. 기본(자동)은 입력마다 프레임 스레드 버퍼를 따로 잡아 메모리가 컷 수에 비례해
    # 커졌다 — 1080x1920 20컷 조인이 4.5GB 였고 한 스레드로 2.0GB, 시간은 42초 → 31초(2 vCPU, 2026-10-20 실측).
    # 디코딩 결과는 스레드 수와 상관없이 같다.
    inputs: list[str] = []
    for segment in segments:
        inputs += ["-threads", "1", "-i", segment.path]

    parts = [
        _segment_video_filter(
            i,
            segment,
            resolved[i - 1] if i > 0 else None,
            resolved[i] if i < len(resolved) else None,
            render_spec,
        )
        for i, segment in enumerate(segments)
    ]

    acc_v, acc_a, acc_duration = "[s0v]", "[0:a:0]", segments[0].duration
    for i in range(1, len(segments)):
        t = resolved[i - 1]
        next_v, next_a = f"[s{i}v]", f"[{i}:a:0]"
        out_v, out_a = f"[j{i}v]", f"[j{i}a]"
        if _is_overlap(t):
            seconds = t.duration_ms / 1000
            # 앞쪽 누적의 끝(여분 프레임 절반)과 다음 구간의 앞(여분 프레임 절반)을 겹친다.
            offset = max(acc_duration - seconds, 0)
            parts.append(
                f"{acc_v}{next_v}xfade=transition=fade:duration={seconds:.3f}:offset={offset:.3f}{out_v}"
            )
            parts.append(f"{acc_a}{next_a}acrossfade=d={seconds:.3f}{out_a}")
            acc_duration += segments[i].duration - seconds
        else:
            parts.append(f"{acc_v}{acc_a}{next_v}{next_a}concat=n=2:v=1:a=1{out_v}{out_a}")
            acc_duration += segments[i].duration
        acc_v, acc_a = out_v, out_a
    if len(segments) == 1:
        acc_a = "0:a:0"  # 이을 것이 없으면 소리는 입력 그대로 — 필터 그래프 밖의 라벨은 대괄호 없이 매핑한다(묶음 결합의 마지막 한 구간)

    _run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(parts), "-map", acc_v, "-map", acc_a,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", FINAL_CRF, "-profile:v", "high",
        "-pix_fmt", "yuv420p", "-c:a", "aac", out,
    ])
