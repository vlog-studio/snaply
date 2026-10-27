"""실제 ffmpeg 를 돌려 **산출물의 성질**을 검사한다.

나머지 파이썬 테스트는 ffmpeg 없이 돌도록 명령줄만 검사한다. 그 방식으로는 잡히지 않는
결함이 실제로 두 번 났다:

- 쇼츠 앱인데 편집 결과가 **가로 1920x1080** 으로 나왔다. 명령줄은 멀쩡했고 합성 클립이
  가로라서 통과했다 — 진짜 아이폰 영상을 손으로 돌려 보고서야 발견했다.
- 배포본이 아이폰 원본(HEVC/HDR) 그대로라 **다른 기기에서 재생되지 않았다.**

그래서 여기서는 명령줄이 아니라 **파일**을 본다. ffprobe 가 말하는 해상도·코덱·픽셀 포맷이
계약이다.

입력은 저장소에 두지 않고 ffmpeg 로 만든다(`lavfi`) — 바이너리 픽스처는 커지고 썩는다.

**ffmpeg 이 없으면 건너뛴다.** 로컬에서 ffmpeg 없이 테스트를 돌리는 것이 이 저장소의 관행이라
그걸 깨지 않는다. 다만 CI 에서까지 조용히 건너뛰면 검사가 있으나 마나이므로,
`REQUIRE_FFMPEG=1` 이면 건너뛰지 않고 **실패한다**. CI 가 그 값을 준다.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from pipeline import accent_render, ass, ass_caption, color_match, hdr, music, rendition, subtitle, text_accent  # noqa: E402
from pipeline import editor  # noqa: E402
from pipeline.editor import (  # noqa: E402
    ClipSource,
    _parse_ebur128,
    clip_level_filter,
    edit,
    edit_timeline,
    finalize,
    get_preset,
    measure_loudness,
)
from pipeline.transition import Transition  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402


def _has(tool: str) -> bool:
    try:
        subprocess.run([tool, "-version"], capture_output=True, check=True)
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


FFMPEG_AVAILABLE = _has("ffmpeg") and _has("ffprobe")
REQUIRE_FFMPEG = os.environ.get("REQUIRE_FFMPEG") == "1"

if REQUIRE_FFMPEG and not FFMPEG_AVAILABLE:
    raise RuntimeError(
        "REQUIRE_FFMPEG=1 인데 ffmpeg/ffprobe 가 없다. "
        "이 검사를 건너뛴 채로 초록이 되면 안 된다 — CI 의 설치 단계를 확인할 것."
    )


def probe(path: str) -> dict:
    """첫 비디오 스트림과 포맷 정보."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(out.stdout)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    return {"video": video, "format": data["format"], "streams": data["streams"]}


def make_clip(path: str, *, width: int, height: int, seconds: float = 1.0) -> None:
    """합성 입력. 오디오를 함께 넣어 오디오 경로도 같이 탄다."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"testsrc=size={width}x{height}:rate=30:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            path,
        ],
        capture_output=True,
        check=True,
    )


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class EditOutputContract(unittest.TestCase):
    """편집 산출물은 **세로**여야 한다 — 쇼츠 앱이다."""

    def test_landscape_input_still_produces_a_vertical_short(self) -> None:
        # 가로 입력이 그대로 새어 나간 것이 실제 결함이었다. 그래서 일부러 가로로 넣는다.
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "landscape.mp4")
            make_clip(src, width=1280, height=720)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            info = probe(out)["video"]
            self.assertEqual((info["width"], info["height"]), (1080, 1920))

    def test_output_plays_everywhere(self) -> None:
        """H.264 + yuv420p. 이걸 벗어나면 기기에 따라 재생되지 않는다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "portrait.mp4")
            make_clip(src, width=1080, height=1920)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            info = probe(out)["video"]

            self.assertEqual(info["codec_name"], "h264")
            self.assertEqual(info["pix_fmt"], "yuv420p")

    def test_the_movie_leaves_without_where_the_source_was_shot(self) -> None:
        """
        휴대폰 원본에는 찍은 곳(`location`) · 기기 · 소프트웨어 태그가 있다. ffmpeg 은 첫 입력의 전역 메타데이터를
        옮기므로, 그대로 두면 무비가 공유 · SNS 게시로 첫 컷을 찍은 좌표를 싣고 나갔다(backlog E-17). 컷 편집 → BGM →
        자막까지 거친 마지막 파일을 본다.
        """
        with tempfile.TemporaryDirectory() as work:
            plain = os.path.join(work, "plain.mp4")
            make_clip(plain, width=720, height=1280, seconds=2.0)
            src = os.path.join(work, "tagged.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", plain, "-c", "copy",
                    "-metadata", "location=+37.5665+126.9780/",
                    "-metadata", "make=samsung", "-metadata", "model=SM-S908N",
                    src,
                ],
                capture_output=True,
                check=True,
            )
            self.assertIn("location", probe(src)["format"].get("tags", {}))

            edited = edit([ClipSource(src, 0, 1500)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)
            v3_work = os.path.join(work, "v3")
            os.makedirs(v3_work)
            timeline = edit_timeline(
                [ClipSource(src, 0, 1000), ClipSource(src, 500, 1500)],
                [Transition("crossfade", 300)],
                get_preset("일상"),
                DEFAULT_RENDER_SPEC,
                v3_work,
            )
            bgm = os.path.join(work, "bgm.m4a")
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-c:a", "aac", bgm],
                capture_output=True,
                check=True,
            )
            with_bgm = os.path.join(work, "with_bgm.mp4")
            music.mix(edited, bgm, with_bgm, 1.5)
            srt = os.path.join(work, "captions.srt")
            with open(srt, "w", encoding="utf-8") as f:
                f.write("1\n00:00:00,000 --> 00:00:01,000\n안녕\n")
            final = os.path.join(work, "final.mp4")
            subtitle.embed_soft(with_bgm, srt, final)

            for out in (edited, timeline, final):
                tags = probe(out)["format"].get("tags", {})
                leaked = {key for key in tags if key.split("-")[0] in {"location", "make", "model"}}
                self.assertEqual(leaked, set(), out)


def make_color_clip(path: str, color: str, *, seconds: float = 3.0, box: str | None = None) -> None:
    """단색(선택: 가운데 상자) 세로 입력과 소리. 전환을 색으로 읽으려고 단색을 쓴다."""
    video = f"color=c={color}:s=1080x1920:rate=30:duration={seconds}"
    if box is not None:
        video += f",drawbox=x=270:y=480:w=540:h=960:color={box}:t=fill"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", video,
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            path,
        ],
        capture_output=True,
        check=True,
    )


def pixel(path: str, at: float, x: int = 540, y: int = 300) -> tuple[int, int, int]:
    """`at` 초 프레임의 (x, y) 주변 8x8 평균 RGB."""
    out = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", f"{at:.3f}", "-i", path, "-frames:v", "1",
            "-vf", f"crop=8:8:{x - 4}:{y - 4},scale=1:1:flags=area",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return out[0], out[1], out[2]


def darkest_near(path: str, at: float, span: float = 0.1) -> int:
    """`at` 앞뒤 `span` 초 안 프레임 중 가장 어두운 것의 가장 밝은 채널.

    한 시점만 집으면 ffmpeg 버전마다 `-ss` 가 앞뒤 프레임으로 갈려(로컬 7.1 은 경계 프레임, CI 의
    Ubuntu 빌드는 1~2프레임 뒤) 짧은 dip 의 바닥을 놓친다. 바닥이 그 근처에 있는지만 본다.
    """
    steps = int(span * 2 * 30) + 1
    return min(max(pixel(path, at - span + i / 30)) for i in range(steps))


def duration_of(path: str) -> float:
    return float(probe(path)["format"]["duration"])


def make_tone_clip(path: str, *, volume: float, seconds: float = 2.0, color: str = "gray") -> None:
    """세로 단색에 `volume` 배 크기의 소리 — 컷마다 녹음 크기가 다른 휴대폰 영상의 대역."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={color}:s=1080x1920:rate=30:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-af", f"volume={volume}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            path,
        ],
        capture_output=True,
        check=True,
    )


def _parse_loudnorm(stderr: str) -> dict | None:
    """`loudnorm=print_format=json` 이 stderr 끝에 찍는 측정값 — 트루 피크(`input_tp`)를 재려고 테스트에서만 쓴다."""
    start, end = stderr.rfind("{"), stderr.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        return json.loads(stderr[start : end + 1])
    except json.JSONDecodeError:
        return None


def _loudness_stats(path: str) -> dict[str, float]:
    """통합 음량(`i`, LUFS)과 트루 피크(`tp`, dBTP) — loudnorm 측정."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "loudnorm=print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    measured = _parse_loudnorm(proc.stderr)
    assert measured is not None, proc.stderr[-500:]
    return {"i": float(measured["input_i"]), "tp": float(measured["input_tp"])}


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class AudioBasicsContract(unittest.TestCase):
    """기본 처리(decisions/auto-edit-draft.md §6.3) — 컷이 바뀔 때 소리가 튀지 않고, 무비는 플랫폼 크기다."""

    def test_measures_the_same_loudness_as_loudnorm(self) -> None:
        # 측정을 loudnorm 에서 ebur128 로 바꿨다(backlog E-52) — 같은 소리를 같은 크기로 재야 컷 · 무비의 이득이 그대로다.
        with tempfile.TemporaryDirectory() as work:
            for volume in (0.4, 1.6):
                path = os.path.join(work, f"tone-{volume}.mp4")
                make_tone_clip(path, volume=volume, seconds=3.0)
                with self.subTest(volume=volume):
                    self.assertAlmostEqual(measure_loudness(path), _loudness_stats(path)["i"], delta=0.3)

    def test_silence_measures_below_the_silence_line(self) -> None:
        # 소리가 없으면 ebur128 은 절대 게이트(−70)를 낸다 — 호출하는 쪽이 무음(−50 아래)으로 보고 크기를 맞추지 않는다.
        with tempfile.TemporaryDirectory() as work:
            path = os.path.join(work, "silent.mp4")
            make_tone_clip(path, volume=0.0)
            loudness = measure_loudness(path)
            self.assertTrue(loudness is None or loudness < -50, loudness)

    def test_cuts_recorded_at_different_levels_come_out_alike(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            quiet, loud = os.path.join(work, "quiet.mp4"), os.path.join(work, "loud.mp4")
            make_tone_clip(quiet, volume=0.4)
            make_tone_clip(loud, volume=1.6)
            # 원본은 약 12dB 다르다 — 컷 하나에 주는 이득의 상한(±12dB) 안이다.
            self.assertGreater(measure_loudness(loud) - measure_loudness(quiet), 10)

            out = edit_timeline(
                [ClipSource(quiet), ClipSource(loud)],
                [Transition("hardcut")],
                get_preset("일상"),
                DEFAULT_RENDER_SPEC,
                work,
            )

            first, second = measure_loudness(out, 0.2, 1.6), measure_loudness(out, 2.2, 1.6)
            self.assertLess(abs(first - second), 2.0, (first, second))

    def test_a_cut_starts_with_its_fade_not_with_silence_then_a_jump(self) -> None:
        """
        리미터는 미리보기(attack 5ms)만큼 소리를 늦춘다. 그걸 되돌리지 않으면 컷의 첫 5ms 가 0 이고 진짜 소리는 그 뒤에
        제 크기로 갑자기 시작해, 페이드가 0 위에 걸려 '틱' 이 남았다(2026-10-13). AAC 를 거치면 샘플이 번지므로 필터만
        PCM 으로 돌려 본다.
        """
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.1",
                "-af", "aformat=sample_fmts=fltp:channel_layouts=mono," + clip_level_filter(0.0, 0.1),
                "-f", "f32le", "-",
            ],
            capture_output=True,
            check=True,
        )
        samples = struct.unpack(f"<{len(result.stdout) // 4}f", result.stdout)

        def peak(start_ms: float, end_ms: float) -> float:
            return max(abs(x) for x in samples[int(start_ms * 48) : int(end_ms * 48)])

        steady = peak(5, 10)
        self.assertGreater(peak(0, 5), steady / 4, "첫 5ms 가 비었다 — 소리가 리미터만큼 늦게 나온다")
        self.assertLess(peak(0, 1), steady / 2, "첫 1ms 가 이미 제 크기다 — 페이드인이 걸리지 않았다")
        self.assertEqual(len(samples), 4800, "길이가 바뀌었다 — 끝이 잘리거나 늘었다")

    def test_a_peaky_movie_still_reaches_platform_loudness_within_the_true_peak(self) -> None:
        """
        말소리처럼 음절마다 오르내리는 소리에 짧고 큰 파열음 — 피크와 평균의 차가 크다. loudnorm 의 `linear=true` 는
        이런 소리에서 말없이 동적 모드로 돌아가 −14 에 못 미쳤다(2026-10-13 리뷰). 크기와 트루 피크를 둘 다 지켜야 한다.
        """
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "speech-like.mp4")
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "color=c=gray:s=320x240:rate=30:duration=12",
                    "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.25:sample_rate=48000:duration=12:seed=7",
                    "-f", "lavfi", "-i", "sine=frequency=180:sample_rate=48000:duration=12",
                    "-filter_complex",
                    "[1:a]volume=volume=0.15+0.85*abs(sin(2*PI*2.5*t)):eval=frame,lowpass=f=4000[n];"
                    "[2:a]volume=enable=lt(mod(t\\,0.7)\\,0.012):volume=6,"
                    "volume=enable=gte(mod(t\\,0.7)\\,0.012):volume=0[p];"
                    "[n][p]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]",
                    "-map", "0:v", "-map", "[a]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    src,
                ],
                capture_output=True,
                check=True,
            )
            source = _loudness_stats(src)
            # 이 입력은 loudnorm 의 선형 조건(피크 − 평균 ≤ 12.5dB)을 넘는다 — 넘지 않으면 이 테스트는 아무것도 안 본다.
            self.assertGreater(source["tp"] - source["i"], 12.5, source)
            out = os.path.join(work, "final.mp4")

            finalize(src, out)

            final = _loudness_stats(out)
            self.assertAlmostEqual(final["i"], -14.0, delta=0.5, msg=final)
            self.assertLessEqual(final["tp"], -1.5, final)

    def test_the_movie_is_finished_at_platform_loudness_and_plays_while_downloading(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "tone.mp4")
            make_tone_clip(src, volume=0.1, seconds=4.0)
            out = os.path.join(work, "final.mp4")

            finalize(src, out)

            self.assertAlmostEqual(measure_loudness(out), -14.0, delta=1.0)
            # +faststart: moov 가 mdat 앞에 있어야 받으면서 바로 재생된다.
            with open(out, "rb") as f:
                head = f.read(4096)
            self.assertIn(b"moov", head)
            info = probe(out)
            self.assertEqual(info["video"]["codec_name"], "h264")

    def test_a_portrait_shot_stored_sideways_comes_out_upright(self) -> None:
        """
        세로로 찍은 휴대폰 영상은 가로로 인코딩되고 회전 메타데이터를 단다(§6.1 — 검증된 적이 없었다). 위가
        빨강 · 아래가 파랑으로 보이게 찍은 것이 결과물에서도 그렇게 서 있어야 한다 — 누우면 좌우로 갈린다.
        """
        with tempfile.TemporaryDirectory() as work:
            stored = os.path.join(work, "stored-sideways.mp4")
            # 인코딩된 가로 화면: 왼쪽 빨강 · 오른쪽 파랑. 90° 회전 표시 → 세로로 보면 위아래로 나뉜다.
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "lavfi", "-i", "color=c=red:s=1920x1080:rate=30:duration=2",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                    "-vf", "drawbox=x=960:y=0:w=960:h=1080:color=blue:t=fill",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    stored,
                ],
                capture_output=True,
                check=True,
            )
            rotated = os.path.join(work, "rotated.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-display_rotation", "90", "-i", stored, "-c", "copy", rotated],
                capture_output=True,
                check=True,
            )

            out = edit([ClipSource(rotated)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            top, bottom = pixel(out, 1.0, 540, 300), pixel(out, 1.0, 540, 1620)
            left, right = pixel(out, 1.0, 200, 960), pixel(out, 1.0, 880, 960)
            # 위아래가 다른 색이고, 같은 높이의 좌우는 같은 색이다 — 서 있다.
            self.assertNotEqual(top[0] > top[2], bottom[0] > bottom[2], (top, bottom))
            self.assertEqual(left[0] > left[2], right[0] > right[2], (left, right))


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class ColorMatchContract(unittest.TestCase):
    """컷 사이 색 맞춤 — 찍은 곳마다 다른 밝기 · 색이 무비 안에서 가까워진다(auto-edit-draft §6.3)."""

    def test_cuts_shot_in_different_light_come_closer_and_a_single_cut_is_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            paths = []
            for name, color in (("a", "0x8C8C8C"), ("b", "0x8C8C8C"), ("dim_blue", "0x50608C")):
                path = os.path.join(work, f"{name}.mp4")
                make_color_clip(path, color, seconds=1.5)
                paths.append(path)

            def gap(path_out: str, times: tuple[float, float]) -> float:
                first, last = pixel(path_out, times[0]), pixel(path_out, times[1])
                return sum(abs(x - y) for x, y in zip(first, last))

            before = sum(abs(x - y) for x, y in zip(pixel(paths[0], 0.7), pixel(paths[2], 0.7)))
            out = edit_timeline(
                [ClipSource(p) for p in paths],
                [Transition("hardcut"), Transition("hardcut")],
                get_preset("일상"),
                DEFAULT_RENDER_SPEC,
                work,
            )
            after = gap(out, (0.7, 3.7))

            # 어둡고 푸른 컷이 다른 둘 쪽으로 다가온다 — 같아지지는 않는다(절반만 옮기고 상한이 있다).
            self.assertLess(after, before * 0.75, (before, after))
            self.assertGreater(after, 0)

            single_work = os.path.join(work, "single")
            os.makedirs(single_work)
            single = edit([ClipSource(paths[2])], get_preset("일상"), DEFAULT_RENDER_SPEC, single_work)
            source_px, out_px = pixel(paths[2], 0.7), pixel(single, 0.7)
            self.assertLess(sum(abs(x - y) for x, y in zip(source_px, out_px)), 15, (source_px, out_px))


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class MeasuredTrackContract(unittest.TestCase):
    """음량 · 색은 렌더와 같은 첫 트랙을 잰다 — ffmpeg 의 기본 선택(채널이 가장 많은 오디오 · 가장 큰 영상)이 아니다
    (2026-10-14 리뷰, backlog E-48)."""

    def test_a_second_track_does_not_change_what_is_measured(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            first_only = os.path.join(work, "first.mp4")
            both = os.path.join(work, "both.mp4")
            subprocess.run(
                ["ffmpeg", "-y",
                 "-f", "lavfi", "-i", "color=c=0xB03020:s=64x64:rate=30:duration=1.5",
                 "-f", "lavfi", "-i", "sine=frequency=440:duration=1.5,volume=-20dB",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", first_only],
                capture_output=True, check=True,
            )
            # 더 큰 파란 영상과, 채널이 더 많고 더 큰 소리를 두 번째 트랙으로 붙이고 그쪽을 기본(default)으로 둔다 —
            # ffmpeg 의 기본 선택은 기본 표시가 있는 트랙을 먼저 고른다. 렌더는 표시와 상관없이 첫 트랙이다.
            subprocess.run(
                ["ffmpeg", "-y", "-i", first_only,
                 "-f", "lavfi", "-i", "color=c=0x2030B0:s=320x320:rate=30:duration=1.5",
                 "-f", "lavfi", "-i", "anoisesrc=d=1.5:a=0.5,aformat=channel_layouts=5.1",
                 "-map", "0:v", "-map", "0:a", "-map", "1:v", "-map", "2:a",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
                 "-disposition:v:0", "0", "-disposition:v:1", "default",
                 "-disposition:a:0", "0", "-disposition:a:1", "default",
                 "-shortest", both],
                capture_output=True, check=True,
            )

            self.assertAlmostEqual(measure_loudness(both), measure_loudness(first_only), delta=0.5)
            colour = color_match.measure_color(both, 0.0, 1.5)
            self.assertIsNotNone(colour)
            self.assertGreater(colour.r, colour.b)  # 붉은 첫 트랙이다


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class TimelineContract(unittest.TestCase):
    """경계별 전환(editSpec v3)의 산출물. 색으로 읽는다 — 빨강 → 파랑 → 초록."""

    def render(self, work: str, transitions: list[Transition], *, last_to_end: bool = False) -> str:
        paths = []
        for color in ("red", "blue", "green"):
            path = os.path.join(work, f"{color}.mp4")
            make_color_clip(path, color)
            paths.append(path)
        # 각 컷은 0.5~2.5초 — 앞뒤 0.5초가 여분 프레임이다.
        clips = [ClipSource(path, 500, 2500) for path in paths]
        if last_to_end:
            clips[0] = ClipSource(paths[0], 1000, None)
        return edit_timeline(clips, transitions, get_preset("일상"), DEFAULT_RENDER_SPEC, work)

    def test_crossfade_mixes_and_dip_darkens_while_length_is_the_sum_of_cuts(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            out = self.render(work, [Transition("crossfade", 400), Transition("dip", 400)])

            # 겹침형이 여분 프레임을 쓰므로 길이는 컷 길이의 합(2+2+2)이다.
            self.assertAlmostEqual(duration_of(out), 6.0, delta=0.1)
            red, mid, blue, green = (pixel(out, t) for t in (1.0, 2.0, 3.0, 5.0))
            self.assertGreater(red[0], 200)
            self.assertTrue(red[2] < 40)
            # 경계(2.0초)에서는 두 컷이 반씩 섞인다.
            self.assertTrue(60 < mid[0] < 200 and 60 < mid[2] < 200, mid)
            self.assertGreater(blue[2], 200)
            # dip 경계(4.0초) 근처에서 검정에 가깝게 내려간다.
            self.assertLess(darkest_near(out, 4.0), 40)
            self.assertGreater(green[1], 90)

    def test_crossfade_without_spare_frames_falls_back_to_a_dip(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            # 첫 컷이 원본 끝(3초)까지라 뒤 여분이 없다 → dip(400ms). 길이는 그대로 2 + 2 + 2.
            out = self.render(work, [Transition("crossfade", 400), Transition("hardcut")], last_to_end=True)

            self.assertAlmostEqual(duration_of(out), 6.0, delta=0.1)
            before, after = pixel(out, 1.5), pixel(out, 2.5)
            self.assertGreater(before[0], 200)
            # 섞이지 않고 어두워진다 — 두 컷이 겹친 프레임이 없다.
            self.assertLess(darkest_near(out, 2.0), 40)
            self.assertGreater(after[2], 200)

    def test_zoompunch_starts_enlarged_and_settles(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            first = os.path.join(work, "plain.mp4")
            boxed = os.path.join(work, "boxed.mp4")
            make_color_clip(first, "green")
            make_color_clip(boxed, "red", box="blue")
            clips = [ClipSource(first, 500, 2500), ClipSource(boxed, 500, 2500)]

            out = edit_timeline(
                clips, [Transition("zoompunch", 300)], get_preset("일상"), DEFAULT_RENDER_SPEC, work
            )

            # 상자의 왼쪽 가장자리는 x=270. 1.08배로 시작하면 x≈248 까지 넓어진다 → x=258 은
            # 처음에는 파랑(상자 안), 0.3초 뒤에는 빨강(상자 밖)이다.
            at_start, settled = pixel(out, 2.02, x=258, y=960), pixel(out, 2.6, x=258, y=960)
            self.assertGreater(at_start[2], 150, at_start)
            self.assertGreater(settled[0], 150, settled)
            self.assertAlmostEqual(duration_of(out), 4.0, delta=0.1)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class RenditionContract(unittest.TestCase):
    """배포본은 "어디서나 재생되는 사본" 이다. 그 말이 파일에서도 사실이어야 한다."""

    def test_rendition_is_h264_sdr_and_starts_without_full_download(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_clip(src, width=720, height=1280, seconds=2.0)

            outcome = rendition.build(src, work)

            info = probe(outcome.video_path)
            self.assertEqual(info["video"]["codec_name"], "h264")
            self.assertEqual(info["video"]["pix_fmt"], "yuv420p")
            # faststart: moov 가 앞에 없으면 플레이어가 전체를 받고서야 시작한다.
            self.assertIn("faststart", _movflags_state(outcome.video_path))

    def test_duration_is_measured_not_reported(self) -> None:
        """클라이언트가 보고한 길이가 아니라 **실측값**이어야 한다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_clip(src, width=720, height=1280, seconds=2.0)

            outcome = rendition.build(src, work)

            self.assertIsNotNone(outcome.duration_ms)
            self.assertAlmostEqual(outcome.duration_ms / 1000, 2.0, delta=0.3)

    def test_tall_source_is_capped_not_upscaled(self) -> None:
        """세로 상한(1920)은 넘기지 않고, 그보다 작은 원본을 키우지도 않는다."""
        with tempfile.TemporaryDirectory() as work:
            small = os.path.join(work, "small.mp4")
            make_clip(small, width=360, height=640)
            small_out = rendition.build(small, work).video_path
            self.assertEqual(probe(small_out)["video"]["height"], 640)

        with tempfile.TemporaryDirectory() as work:
            tall = os.path.join(work, "tall.mp4")
            make_clip(tall, width=1440, height=2560)
            tall_out = rendition.build(tall, work).video_path
            self.assertLessEqual(probe(tall_out)["video"]["height"], 1920)

    def test_dimensions_follow_display_orientation(self) -> None:
        """
        세로로 찍은 아이폰 영상은 **가로로 인코딩되고 회전 메타데이터**를 단다. 인코딩 치수를
        그대로 기록하면 다른 기기가 그 스냅을 가로로 안다 — 표시 기준 치수여야 한다.
        """
        with tempfile.TemporaryDirectory() as work:
            landscape = os.path.join(work, "encoded-landscape.mp4")
            make_clip(landscape, width=1280, height=720)
            rotated = os.path.join(work, "rotated.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-display_rotation", "90", "-i", landscape, "-c", "copy", rotated],
                capture_output=True,
                check=True,
            )

            outcome = rendition.build(rotated, work)

            self.assertEqual((outcome.width, outcome.height), (720, 1280))
            info = probe(outcome.video_path)["video"]
            self.assertEqual((info["width"], info["height"]), (outcome.width, outcome.height))

    def test_rendition_keeps_the_sources_capture_time(self) -> None:
        """
        ffmpeg 은 전역 메타데이터를 옮기면서 `creation_time` 만 지운다. 그러면 서버 사본을 앨범에 저장했을 때
        갤러리가 저장한 날 자리에 놓는다(backlog E-12). 앱이 보낸 촬영 시각보다 원본의 태그가 먼저다.
        """
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "tagged.mp4")
            make_clip(src, width=360, height=640)
            tagged = os.path.join(work, "tagged-src.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-i", src, "-c", "copy", "-metadata", "creation_time=2026-09-29T13:14:06Z", tagged],
                capture_output=True,
                check=True,
            )

            outcome = rendition.build(tagged, work, datetime(2026, 1, 1, tzinfo=timezone.utc))

            tags = probe(outcome.video_path)["format"].get("tags", {})
            self.assertEqual(tags.get("creation_time"), "2026-09-29T13:14:06.000000Z")

    def test_rendition_without_a_tag_takes_the_snaps_capture_time(self) -> None:
        """원본에 태그가 없으면(합성 클립이 그렇다) 앱이 보낸 촬영 시각을 UTC 로 적는다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "untagged.mp4")
            make_clip(src, width=360, height=640)
            self.assertNotIn("creation_time", probe(src)["format"].get("tags", {}))
            seoul = timezone(timedelta(hours=9))

            outcome = rendition.build(src, work, datetime(2026, 9, 29, 22, 14, 6, tzinfo=seoul))

            tags = probe(outcome.video_path)["format"].get("tags", {})
            self.assertEqual(tags.get("creation_time"), "2026-09-29T13:14:06.000000Z")

    def test_silent_source_still_produces_a_rendition(self) -> None:
        """오디오가 없는 원본도 있다(무음 촬영). 그때 변환이 실패하면 안 된다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "silent.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=1",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", src],
                capture_output=True,
                check=True,
            )

            outcome = rendition.build(src, work)

            self.assertTrue(os.path.exists(outcome.video_path))
            self.assertFalse([s for s in probe(outcome.video_path)["streams"] if s["codec_type"] == "audio"])


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class HdrContract(unittest.TestCase):
    """
    HDR 원본을 내릴 때 **파일이 자기 자신에 대해 거짓말하면 안 된다** (2026-09-15 실검증).

    픽셀만 8bit 로 내리고 색 태그를 PQ 로 남겨 두면, 플레이어가 이미 평평해진 영상에 HDR
    톤매핑을 한 번 더 걸어 화면이 망가진다. 실제로 그 상태였다.

    톤매핑 자체는 빌드에 `zscale`+`tonemap` 이 있어야 제대로 되지만(워커 이미지에는 있고
    macOS Homebrew 빌드에는 없다), **태그가 bt709 여야 한다는 것은 어느 빌드에서나 같다.**
    그래서 여기서는 태그를 검사한다.
    """

    def make_hdr10(self, path: str) -> None:
        subprocess.run(
            ["ffmpeg", "-y",
             "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=1",
             "-c:v", "libx265", "-pix_fmt", "yuv420p10le",
             "-x265-params", "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc",
             "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc",
             "-tag:v", "hvc1", path],
            capture_output=True,
            check=True,
        )

    def assert_sdr_tagged(self, path: str) -> None:
        info = probe(path)["video"]
        self.assertEqual(info["pix_fmt"], "yuv420p", "8bit SDR 로 내려와야 한다")
        self.assertEqual(info.get("color_transfer"), "bt709")
        self.assertEqual(info.get("color_primaries"), "bt709")
        self.assertEqual(info.get("color_space"), "bt709")

    def test_rendition_of_hdr_source_is_tagged_sdr(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "hdr.mov")
            self.make_hdr10(src)

            self.assert_sdr_tagged(rendition.build(src, work).video_path)

    def test_edit_of_hdr_source_is_tagged_sdr(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "hdr.mov")
            self.make_hdr10(src)

            out = edit([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work)

            self.assert_sdr_tagged(out)

    # 톤매핑을 프레임 줄이기 · 축소보다 먼저 걸면 구간의 모든 프레임을 원본 크기로 톤매핑했다(2026-10-14 리뷰, backlog E-49).
    # 순서를 바꿔도 잰 색은 같아야 한다.
    @unittest.skipUnless(hdr.has_tonemap(), "zscale·tonemap 이 없는 빌드")
    def test_hdr_colour_is_measured_the_same_after_shrinking_first(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "hdr.mov")
            self.make_hdr10(src)

            quick = color_match.measure_color(src, 0.0, 1.0)
            full = subprocess.run(
                ["ffmpeg", "-v", "error", "-i", src, "-map", "0:v:0",
                 "-vf", ",".join([*hdr.source_filters(src), "fps=5/1.000", "scale=64:-2:flags=area", "format=rgb24"]),
                 "-frames:v", "5", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                capture_output=True, check=True,
            ).stdout
            pixels = len(full) // 3
            reference = [sum(full[i::3]) / pixels / 255 for i in range(3)]

            self.assertIsNotNone(quick)
            for measured, expected in zip((quick.r, quick.g, quick.b), reference):
                self.assertAlmostEqual(measured, expected, delta=0.03)

    def test_hdr_cut_with_colour_match_keeps_the_whole_picture(self) -> None:
        """톤매핑 직후의 부동소수 RGB 에 색 맞춤(colorchannelmixer)이 걸리면 화면 폭이 1/4 로 깨졌다(2026-10-22, Debian 7.1)."""
        from pipeline import cut_fx

        with tempfile.TemporaryDirectory() as work:
            hdr_src, sdr_src = os.path.join(work, "hdr.mov"), os.path.join(work, "sdr.mp4")
            self.make_hdr10(hdr_src)
            make_tone_clip(sdr_src, volume=0.2, seconds=1.0, color="0x806040")  # 색이 달라 색 맞춤이 걸린다
            band = cut_fx.band_spec(DEFAULT_RENDER_SPEC)
            hdr_seg, _ = editor.prepare_segments([ClipSource(hdr_src), ClipSource(sdr_src)], get_preset("일상"), band, work, fast=True)
            self.assertEqual((probe(hdr_seg)["video"]["width"], probe(hdr_seg)["video"]["height"]), (1080, 608))
            # testsrc 의 오른쪽에서 둘째 줄(빨강, x≈810~945) — 폭이 깨지면 이 자리가 검다(맨 오른쪽 줄은 원래 검정)
            self.assertGreater(pixel(hdr_seg, 0.5, x=880, y=520)[0], 100)

    def test_sdr_source_tags_are_left_alone(self) -> None:
        """SDR 원본의 태그는 이미 사실이다 — 덮어쓸 이유가 없다."""
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "sdr.mp4")
            make_clip(src, width=720, height=1280)

            info = probe(rendition.build(src, work).video_path)["video"]

            self.assertNotEqual(info.get("color_transfer"), "smpte2084")


def _movflags_state(path: str) -> str:
    """moov 가 mdat 보다 앞에 있으면 faststart 다. 박스 순서를 직접 읽는다."""
    with open(path, "rb") as f:
        head = f.read(1_000_000)
    moov = head.find(b"moov")
    mdat = head.find(b"mdat")
    if moov == -1:
        return "moov-not-in-head"
    if mdat == -1 or moov < mdat:
        return "faststart"
    return "moov-after-mdat"


def burn_ass(work: str, document: str | None, at: float, crop: str) -> tuple[bytes, str]:
    """검은 1080x1920 의 `at` 초 프레임에 ASS 를 구워 `crop` 영역의 회색조 화소와 libass 로그를 돌려준다."""
    vf = crop
    if document is not None:
        path = os.path.join(work, "doc.ass")
        with open(path, "w", encoding="utf-8") as f:
            f.write(document)
        vf = f"{ass.filter_arg(path)},{crop}"
    result = subprocess.run(
        [
            "ffmpeg", "-v", "verbose", "-f", "lavfi",
            "-i", f"color=c=black:s={ass.PLAY_RES_X}x{ass.PLAY_RES_Y}:rate=30:duration=6",
            "-ss", f"{at:.3f}", "-frames:v", "1", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "gray", "-",
        ],
        capture_output=True,
        check=True,
    )
    return result.stdout, result.stderr.decode("utf-8", "replace")


def missing_glyphs(log: str) -> list[str]:
    return [line for line in log.splitlines() if "Glyph" in line and "not found" in line]


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class AssCaptionContract(unittest.TestCase):
    """말소리 자막 — libass 가 번들 글꼴로 **한글**을 그리고, 하단 여백 위에 놓고, 정해진 시각에 내린다."""

    def test_both_styles_draw_korean_while_the_line_is_up(self) -> None:
        words = [ass_caption.Word(200, 700, "오늘은"), ass_caption.Word(700, 1200, "성수동")]
        band_bottom = ass.PLAY_RES_Y - ass_caption.MARGIN_V
        crop = f"crop={ass.PLAY_RES_X}:200:0:{band_bottom - 160}"
        for style in ass_caption.STYLES:
            with self.subTest(style=style), tempfile.TemporaryDirectory() as work:
                document = ass_caption.build_document(ass_caption.group_lines(words), style)
                self.assertLess(max(burn_ass(work, None, 1.0, crop)[0]), 40)
                pixels, log = burn_ass(work, document, 1.0, crop)
                self.assertEqual(missing_glyphs(log), [])
                self.assertGreater(max(pixels), 150)
                # 줄은 마지막 단어 끝 + LINGER_MS 에 내려간다
                self.assertLess(max(burn_ass(work, document, 1.8, crop)[0]), 40)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class TextAccentContract(unittest.TestCase):
    """텍스트 액센트 — 네 종류의 번들 글꼴이 전부 한글을 그리고, 액센트가 고른 자리에 그려진다."""

    def test_every_category_draws_korean_where_it_was_placed(self) -> None:
        cuts = [
            text_accent.CutContext("a", 0, 1000, {"objects": ("coffee",)}, (0.30, 0.40, 0.70, 0.70)),
            text_accent.CutContext("b", 1000, 2000, {"moods": ("calm",)}, (0.30, 0.40, 0.70, 0.70)),
            text_accent.CutContext("c", 2000, 3000, {"moods": ("lively",)}, (0.30, 0.40, 0.70, 0.70)),
            text_accent.CutContext("d", 3000, 4000, {"places": ("office",)}, (0.30, 0.40, 0.70, 0.70)),
        ]
        accents = text_accent.plan(cuts, 500, 7).accents
        self.assertEqual([a.choice.category for a in accents], ["sound", "feeling", "exclaim", "keyword"])
        document = accent_render.build_document(accents)
        for accent in accents:
            with self.subTest(category=accent.choice.category), tempfile.TemporaryDirectory() as work:
                x0, y0, x1, y1 = accent.rect
                crop = (f"crop={int((x1 - x0) * ass.PLAY_RES_X)}:{int((y1 - y0) * ass.PLAY_RES_Y)}:"
                        f"{int(x0 * ass.PLAY_RES_X)}:{int(y0 * ass.PLAY_RES_Y)}")
                at = (accent.start_ms + 400) / 1000
                pixels, log = burn_ass(work, document, at, crop)
                self.assertEqual(missing_glyphs(log), [])
                self.assertGreater(max(pixels), 150)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class StickerOverlayContract(unittest.TestCase):
    """이모지 스티커 트랙 — 알파가 살아 있어 스티커 자리만 덮고 나머지는 원본 그대로다."""

    def test_overlay_track_keeps_alpha_and_draws_the_sticker(self) -> None:
        from pipeline import sticker, sticker_render

        placed = sticker.Sticker("a", "1f525", "", "freezone.topLeft", (0.3, 0.3), 240, 0.0, "popBob", 0, 1500, (0, 500, 1000))
        with tempfile.TemporaryDirectory() as work:
            track = sticker_render.bake_overlay([placed], 1500, os.path.join(work, "stickers.mov"))
            base = os.path.join(work, "base.mp4")
            make_tone_clip(base, volume=0.1, seconds=1.5, color="0x204060")
            out = os.path.join(work, "out.mp4")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", base, "-i", track,
                 "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto", "-c:v", "libx264", "-pix_fmt", "yuv420p", out],
                capture_output=True, check=True,
            )
            sticker_px = pixel(out, 0.8, x=int(0.3 * 1080), y=int(0.3 * 1920))
            untouched = pixel(out, 0.8, x=900, y=1700)
            self.assertGreater(max(sticker_px) - min(sticker_px), 60, sticker_px)  # 🔥 의 주황
            self.assertLess(sum(abs(a - b) for a, b in zip(untouched, (0x20, 0x40, 0x60))), 30, untouched)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class AccentInputsContract(unittest.TestCase):
    """대표 프레임의 휘도 격자 — 위가 밝고 아래가 어두운 프레임이면 격자도 그렇다(대비 규칙의 입력)."""

    def test_luma_grid_reads_the_frame_top_down(self) -> None:
        from pipeline import accent_inputs

        with tempfile.TemporaryDirectory() as work:
            path = os.path.join(work, "sky.mp4")
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=720x1280:rate=30:duration=1",
                 "-vf", "drawbox=x=0:y=0:w=iw:h=ih/2:color=white:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", path],
                capture_output=True, check=True,
            )
            grid = accent_inputs.luma_grid(path, 500)
            self.assertEqual((len(grid), len(grid[0])), (accent_inputs.ROWS, accent_inputs.COLS))
            self.assertGreater(min(grid[0]), 0.85)
            self.assertLess(max(grid[-1]), 0.15)
            with self.assertRaises(accent_inputs.AccentInputError):
                accent_inputs.luma_grid(os.path.join(work, "missing.mp4"), 0)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class BeatGridContract(unittest.TestCase):
    """실제 음원 파일(ffmpeg 디코딩)에서 템포와 박자를 찾고, 곡 옆에 캐시를 남긴다."""

    def test_a_120_bpm_click_track(self) -> None:
        from pipeline import beat_grid

        with tempfile.TemporaryDirectory() as work:
            track = os.path.join(work, "click.m4a")
            kick = "0.9*sin(2*PI*(50*mod(t\\,0.5)+130/18*(1-exp(-18*mod(t\\,0.5)))))*exp(-mod(t\\,0.5)*9)"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc={kick}:s=44100:d=12",
                            "-c:a", "aac", track], capture_output=True, check=True)
            grid = beat_grid.load_or_analyze(track)
            self.assertAlmostEqual(grid.bpm, 120, delta=2.5)
            on_grid = [min(abs(b - k * 500) for k in range(25)) for b in grid.beats_ms]
            self.assertLess(max(on_grid), 60, grid.beats_ms[:8])  # aac 앞의 지연(priming)까지 포함한 여유
            self.assertTrue(os.path.exists(track + beat_grid.SIDECAR_SUFFIX))


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class AccentStageContract(unittest.TestCase):
    """편집 워커의 액센트 단계를 실제로 굽는다 — 규격 · 길이 · 소리는 그대로, 글 · 스티커가 화면에 생긴다."""

    def test_burns_accents_and_stickers_onto_the_edited_movie(self) -> None:
        from pipeline import accent_stage

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_tone_clip(src, volume=0.2, seconds=3.0, color="0x203040")
            cuts = [accent_stage.CutSource("v1", src, 0, 1500, 3000), accent_stage.CutSource("v1", src, 1500, 3000, 3000)]
            analyses = {"v1": {"places": ["카페"], "objects": ["라떼"], "moods": ["활기"]}}
            out = os.path.join(work, "with_accents.mp4")
            path, outcome = accent_stage.apply(src, cuts, analyses, {}, None, 3000, "movie-1", work, out)

            self.assertTrue(outcome.applied, outcome.reason)
            self.assertEqual(path, out)
            self.assertTrue(outcome.accents and outcome.stickers > 0)
            before, after = probe(src), probe(out)
            self.assertEqual((after["video"]["width"], after["video"]["height"]),
                             (before["video"]["width"], before["video"]["height"]))
            self.assertAlmostEqual(float(after["format"]["duration"]), float(before["format"]["duration"]), delta=0.1)
            audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
                                    "-of", "csv=p=0", out], capture_output=True, text=True, check=True).stdout
            self.assertIn("audio", audio)
            # 배경은 단색이다 — 무언가 그려졌으면 프레임 어딘가가 배경과 크게 다르다
            frame = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.8", "-i", out, "-frames:v", "1", "-vf", "scale=108:192",
                                    "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
            self.assertGreater(max(frame) - min(frame), 120)


def audio_level(path: str, start: float, seconds: float) -> float:
    """[start, start+seconds) 구간 소리의 RMS(0~1)."""
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{seconds:.3f}", "-i", path, "-ac", "1",
                          "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
    return (sum(v * v for v in samples) / max(1, len(samples))) ** 0.5 / 32768


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class TrendRecipeContract(unittest.TestCase):
    """트렌드 레시피의 렌더 능력 — 배속, 효과음 자리, 타이틀 한글, 이음 재기, 그리고 한 편 전체."""

    def test_retime_halves_the_cut_and_keeps_sound(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_tone_clip(src, volume=0.3, seconds=3.0)
            fast = editor.retime_clip(editor.ClipSource(src, 0, 2000), 2.0, os.path.join(work, "fast.mp4"))
            self.assertAlmostEqual(float(probe(fast.path)["format"]["duration"]), 1.0, delta=0.1)
            self.assertGreater(audio_level(fast.path, 0.2, 0.5), 0.01)

    def test_sound_effects_land_where_planned_on_a_silent_movie(self) -> None:
        from pipeline import sfx

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "silent.mp4")
            make_tone_clip(src, volume=0.0, seconds=3.0)
            event = sfx.SfxEvent(1500, "apple-bite.mp3", 800, 0.0, "아삭")
            out = sfx.mix_into(src, [event], os.path.join(work, "with_sfx.mp4"))
            self.assertLess(audio_level(out, 0.2, 1.0), 0.002)
            self.assertGreater(audio_level(out, 1.5, 0.8), 0.005)

    def test_ducking_lowers_the_music_under_a_sound_effect(self) -> None:
        from pipeline import sfx

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "music.mp4")
            # 음원 대신 계속 울리는 스테레오 소리(무비 구간은 늘 스테레오다 — editor.normalize_clip 의 -ac 2)
            subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=gray:s=1080x1920:rate=30:duration=4",
                            "-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-af", "volume=0.5", "-ac", "2",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src],
                           capture_output=True, check=True)
            loud = sfx.SfxEvent(2000, "crunch-chips.mp3", 900, 0.0, "바삭")
            plain = sfx.mix_into(src, [loud], os.path.join(work, "plain.mp4"))
            ducked = sfx.mix_into(src, [loud], os.path.join(work, "ducked.mp4"), duck=True)
            self.assertAlmostEqual(duration_of(ducked), duration_of(plain), delta=0.1)
            def music(path: str, start: float, seconds: float) -> float:
                """330Hz(음원) 대역만의 크기 — 효과음 소리를 빼고 음원이 줄었는지만 본다."""
                pcm = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{seconds:.3f}", "-i", path,
                                      "-af", "bandpass=f=330:width_type=q:w=8", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                                     capture_output=True, check=True).stdout
                samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
                return (sum(v * v for v in samples) / max(1, len(samples))) ** 0.5 / 32768

            self.assertAlmostEqual(music(ducked, 0.5, 1.0), music(plain, 0.5, 1.0), delta=0.003)  # 효과음 전에는 같다
            self.assertLess(music(ducked, 2.05, 0.25), music(plain, 2.05, 0.25) * 0.7)  # 효과음이 날 때 음원이 내려간다
            # 마지막 효과음(2.9초)이 끝나도 음원은 무비 끝까지 — 사이드체인이 끝나며 소리가 끊긴 적이 있다(2026-10-22)
            self.assertAlmostEqual(music(ducked, 3.3, 0.5), music(plain, 3.3, 0.5), delta=0.01)

    def test_title_fonts_draw_korean(self) -> None:
        from pipeline import title_card

        doc = ass.document(title_card.styles(), title_card.events("typewriter", [{"topics": ["가족 나들이"]}], 3000, None)
                           + title_card.events("script", [{"places": ["실내 수족관"]}], 3000, 3000))
        with tempfile.TemporaryDirectory() as work:
            pixels, log = burn_ass(work, doc, 1.0, f"crop={ass.PLAY_RES_X}:400:0:{int(ass.PLAY_RES_Y * 0.3)}")
            self.assertEqual(missing_glyphs(log), [])
            self.assertGreater(max(pixels), 150)

    def test_continuity_reads_a_covered_lens(self) -> None:
        from pipeline import continuity

        with tempfile.TemporaryDirectory() as work:
            path = os.path.join(work, "cover.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=30:duration=3",
                            "-vf", "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,1.5,1.8)'",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", path], capture_output=True, check=True)
            dark = continuity.covers(continuity.read_series(path))
            self.assertTrue(dark and 14 <= dark[0] <= 16, dark)

    def test_many_cuts_join_in_groups_without_losing_time(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            clips = []
            # 9컷 — 8 + 1 로 나뉘어 마지막 묶음이 구간 하나다(2026-10-22 샘플 9컷 무비가 여기서 죽었다)
            for i in range(9):
                path = os.path.join(work, f"c{i}.mp4")
                make_tone_clip(path, volume=0.2, seconds=0.6, color=("0x303060" if i % 2 else "0x603030"))
                clips.append(ClipSource(path))
            out = edit_timeline(clips, [Transition("hardcut")] * 8, get_preset("일상"), DEFAULT_RENDER_SPEC, work)
            self.assertTrue(os.path.exists(os.path.join(work, "group_1.mp4")))
            self.assertAlmostEqual(float(probe(out)["format"]["duration"]), 5.4, delta=0.25)
            self.assertGreater(audio_level(out, 4.9, 0.4), 0.01)  # 마지막 한 구간의 소리도 남는다

    def test_a_whole_trend_movie_renders(self) -> None:
        from pipeline import trend_edit

        with tempfile.TemporaryDirectory() as work:
            snaps = []
            for i, color in enumerate(("0x305070", "0x705030", "0x407040")):
                path = os.path.join(work, f"s{i}.mp4")
                make_tone_clip(path, volume=0.3, seconds=2.5, color=color)
                snaps.append(trend_edit.Snap(path, {"objects": ["사과"], "topics": ["가족 나들이"]} if i == 0 else {"actions": ["걷기"]}))
            track = os.path.join(work, "bgm.m4a")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=12",
                            "-c:a", "aac", track], capture_output=True, check=True)
            out = os.path.join(work, "trend.mp4")
            result = trend_edit.render(snaps, "trend-routine", track, "m-1", work, out)
            info = probe(out)
            self.assertEqual((info["video"]["width"], info["video"]["height"]), (1080, 1920))
            self.assertEqual(result.title[0], "가족 나들이")
            self.assertTrue(any("아삭" in reason for reason in result.sfx), result.sfx)
            # 15초를 못 채우는 원본(2.5초 × 3)이면 배속을 풀고 거의 전부 쓴다
            self.assertGreater(duration_of(out), 6.0)
            self.assertIsNotNone(result.look)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class CutFxContract(unittest.TestCase):
    """컷 효과의 렌더 — 전환 효과 · 줌 · 색 필터가 이 ffmpeg 에서 돌고 길이를 지키는지, 화면 분할이 칸을 차례로 쌓는지."""

    def test_every_effect_zoom_and_look_renders_and_keeps_the_length(self) -> None:
        from pipeline import cut_fx, look

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "src.mp4")
            make_tone_clip(src, volume=0.2, seconds=1.2, color="0x406080")
            cases = [cut_fx.CutFx(intro=k, outro=k) for k in cut_fx.EDGE_MS]
            cases += [cut_fx.CutFx(zoom="push"), cut_fx.CutFx(zoom="pull"), cut_fx.CutFx(zoom="punch", punch_ms=500)]
            for i, fx in enumerate(cases):
                with self.subTest(fx=fx):
                    out = cut_fx.apply(src, os.path.join(work, f"fx{i}.mp4"), fx, 1.2, DEFAULT_RENDER_SPEC, None)
                    self.assertAlmostEqual(duration_of(out), 1.2, delta=0.1)
                    self.assertEqual((probe(out)["video"]["width"], probe(out)["video"]["height"]), (1080, 1920))
            for name in look.LOOKS:
                with self.subTest(look=name):
                    out = cut_fx.apply(src, os.path.join(work, f"look_{name}.mp4"), cut_fx.CutFx(), 1.2, DEFAULT_RENDER_SPEC, name)
                    self.assertAlmostEqual(duration_of(out), 1.2, delta=0.1)
            mono = os.path.join(work, "look_mono.mp4")
            r, g, b = pixel(mono, 0.6)
            self.assertLess(max(r, g, b) - min(r, g, b), 6)  # 흑백

    def test_split_stacks_panels_one_after_another(self) -> None:
        from pipeline import cut_fx

        with tempfile.TemporaryDirectory() as work:
            panels = []
            for i, color in enumerate(("red", "green", "blue")):
                path = os.path.join(work, f"p{i}.mp4")
                make_tone_clip(path, volume=0.2, seconds=0.6, color=color)
                panels.append(path)
            out = cut_fx.split(panels, [0.6, 0.6, 0.6], os.path.join(work, "split.mp4"), DEFAULT_RENDER_SPEC, None)
            self.assertAlmostEqual(duration_of(out), 1.8, delta=0.1)
            top, middle = pixel(out, 0.2, y=320), pixel(out, 0.2, y=960)
            self.assertGreater(top[0], 150)
            self.assertGreater(min(middle), 200)  # 둘째 칸은 0.3초에 들어온다 — 아직 흰 바탕
            late = [pixel(out, 1.6, y=y) for y in (320, 960, 1600)]
            self.assertGreater(late[0][0], 150)  # 첫 칸은 마지막 프레임에 멈춰 남는다
            self.assertGreater(late[1][1], 90)
            self.assertGreater(late[2][2], 150)

    def test_many_prepared_segments_join_by_copy_without_the_sound_drifting(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            clips = []
            for i in range(12):
                path = os.path.join(work, f"c{i}.mp4")
                make_tone_clip(path, volume=0.4 if i % 2 else 0.0, seconds=0.5, color=("0x303060" if i % 2 else "0x603030"))
                clips.append(ClipSource(path))
            prepared = editor.prepare_segments(clips, get_preset("일상"), DEFAULT_RENDER_SPEC, work, level_audio=False, fast=True)
            out = editor.join_prepared(prepared, [Transition("hardcut")] * 11, DEFAULT_RENDER_SPEC, work)
            self.assertFalse(os.path.exists(os.path.join(work, "group_0.mp4")))  # 다시 인코딩하는 결합을 타지 않았다
            self.assertAlmostEqual(duration_of(out), 6.0, delta=0.1)
            # 끝쪽 구간들(짝수 번째는 무음) — 경계 앞뒤 100ms 를 비우고 잰다. 100ms 넘게 밀렸다면 소리 있는 구간과 없는 구간이 섞인다
            # (Debian ffmpeg 7.1 에서 경계 몇 곳이 25~50ms 밀린다 — 9.0 은 0. 음원만 레시피는 원본 소리를 빼므로 영향이 없다)
            self.assertLess(audio_level(out, 5.1, 0.3), 0.005)
            self.assertGreater(audio_level(out, 5.6, 0.3), 0.015)  # 모노 원본이 스테레오가 되며 -3dB(0.035 → 0.025)
            self.assertGreater(audio_level(out, 4.6, 0.3), 0.015)
            self.assertLess(audio_level(out, 4.1, 0.3), 0.005)
            self.assertGreater(abs(pixel(out, 5.25)[0] - pixel(out, 5.75)[0]), 30)  # 영상도 제자리

    def test_speed_and_effects_go_in_the_one_normalize_pass(self) -> None:
        from pipeline import cut_fx

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "s.mp4")
            make_tone_clip(src, volume=0.3, seconds=2.0, color="0x406080")
            vf = cut_fx.video_filter(cut_fx.CutFx(zoom="push", outro="flash"), 1.0, DEFAULT_RENDER_SPEC, "mono")
            out, = editor.prepare_segments([ClipSource(src)], get_preset("일상"), DEFAULT_RENDER_SPEC, work,
                                          speeds=[2.0], extras=[vf], fast=True)
            self.assertAlmostEqual(duration_of(out), 1.0, delta=0.06)
            self.assertGreater(audio_level(out, 0.3, 0.3), 0.02)
            r, g, b = pixel(out, 0.4)
            self.assertLess(max(r, g, b) - min(r, g, b), 6)  # 색 필터(흑백)도 같은 인코딩에
            self.assertGreater(min(pixel(out, 0.95)), 150)  # 끝의 flash

    def test_subject_is_read_in_the_segment_shape_and_reference_keeps_boundary_pairs(self) -> None:
        from pipeline import match_cut, reference

        with tempfile.TemporaryDirectory() as work:
            src = os.path.join(work, "s.mp4")
            # 세로 영상 오른쪽 위의 빨간 원판
            subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=gray:s=1080x1920:rate=30:duration=2",
                            "-vf", "geq=r='if(lt(hypot(X-760,Y-760),150),230,128)':g='if(lt(hypot(X-760,Y-760),150),40,128)':"
                                   "b='if(lt(hypot(X-760,Y-760),150),40,128)'",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", src], capture_output=True, check=True)
            start, end = match_cut.ends_of(src, 0, 2000, match_cut.read_size(1080, 1920))
            self.assertAlmostEqual(start.cx, 760 / 1080, delta=0.08)
            self.assertAlmostEqual(start.cy, 760 / 1920, delta=0.06)
            # 띠(16:9) 모양으로 읽으면 세로 가운데가 잘려 원판의 세로 자리가 달라진다 — 구간 좌표와 같아야 한다
            band = match_cut.ends_of(src, 0, 2000, match_cut.read_size(1080, 608))[0]
            self.assertAlmostEqual(band.cy, (760 - (1920 - 608) / 2) / 608, delta=0.12)
            pairs = reference.boundaries(src, [1000], 2000, match_cut.read_size(1080, 1920))
            self.assertEqual(len(pairs), 1)
            self.assertEqual(set(pairs[0]), {"at_ms", "prev_end", "next_start", "link"})

    def test_prepared_segments_join_with_a_flash(self) -> None:
        with tempfile.TemporaryDirectory() as work:
            clips = []
            for i, color in enumerate(("0x303060", "0x603030")):
                path = os.path.join(work, f"c{i}.mp4")
                make_tone_clip(path, volume=0.2, seconds=1.0, color=color)
                clips.append(ClipSource(path))
            prepared = editor.prepare_segments(clips, get_preset("일상"), DEFAULT_RENDER_SPEC, work)
            out = editor.join_prepared(prepared, [Transition("flash", 200)], DEFAULT_RENDER_SPEC, work)
            self.assertAlmostEqual(duration_of(out), 2.0, delta=0.1)
            self.assertGreater(max(pixel(out, 1.0)), 180)


@unittest.skipUnless(FFMPEG_AVAILABLE, "ffmpeg/ffprobe 없음")
class FailureMessageContract(unittest.TestCase):
    """도중에 죽은 ffmpeg 도 원인이 오류에 남는다(backlog E-64 ①)."""

    def test_a_killed_encode_names_the_signal_instead_of_progress_lines(self) -> None:
        real_popen = subprocess.Popen

        def popen(*args, **kwargs):
            proc = real_popen(*args, **kwargs)
            # 진행 표시줄이 몇 번 찍힐 만큼 돌린 뒤, 메모리가 모자랄 때 커널이 하듯 SIGKILL 로 끝낸다
            threading.Timer(1.5, proc.kill).start()
            return proc

        with mock.patch("subprocess.Popen", side_effect=popen), self.assertRaises(RuntimeError) as caught:
            editor._run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=600",
                         "-c:v", "libx264", "-preset", "ultrafast", "-f", "null", "-"])
        message = str(caught.exception)
        self.assertNotIn("frame=", message)
        self.assertTrue(message.endswith("(SIGKILL — 메모리 부족으로 강제 종료됐을 수 있다)"), message[-200:])


class ParseEbur128Test(unittest.TestCase):
    """ffmpeg 없이 — ebur128 이 stderr 끝에 찍는 요약에서 통합 음량을 읽는다."""

    SUMMARY = (
        "[Parsed_ebur128_0 @ 0x1] Summary:\n\n"
        "  Integrated loudness:\n    I:         -16.4 LUFS\n    Threshold: -26.7 LUFS\n\n"
        "  Loudness range:\n    LRA:         2.1 LU\n"
    )

    def test_reads_the_integrated_loudness(self) -> None:
        self.assertEqual(_parse_ebur128(self.SUMMARY), -16.4)

    def test_reads_silence_and_nothing(self) -> None:
        self.assertEqual(_parse_ebur128(self.SUMMARY.replace("-16.4", "-70.0")), -70.0)
        self.assertIsNone(_parse_ebur128("no summary here"))


if __name__ == "__main__":
    unittest.main()
