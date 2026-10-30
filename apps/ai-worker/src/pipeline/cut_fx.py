"""컷 효과 — 전환 효과 · 줌 · 화면 분할을 컷마다 정하고(`plan`) 정규화된 구간에 굽는다(`apply` · `split`).

트렌드 레시피(docs/decisions/trend-recipes.md §7)의 편집 효과다. 이음(가림 · 휩팬 · 구도 — `continuity`)이 있는 경계는 그대로 두고,
나머지 경계의 일부에 전환 효과를 넣는다. 전환은 두 종류다:

- **어휘 전환** — 전환 어휘(`transition-vocabulary.json`)의 flash · dip · zoompunch. 어휘의 길이 · 나눔 비율 · 확대값 그대로(앱 미리보기와 같은 모양)
- **컷 전환** — whip(휙 밀기 + 가로 흐림) · zoom(확 당기며 흐림) · spin(돌며 확대) · glitch(색 어긋남 + 노이즈) · shake(흔들림).
  나가는 컷의 끝과 들어오는 컷의 앞에 같은 효과를 반씩 걸어 각 컷 안에서 끝난다 — 두 컷의 프레임을 섞지 않아 여분 프레임이 필요 없다.
  전환 어휘에 넣지 않은 것은 앱 미리보기가 그릴 수 없기 때문이다(MOV-22 의 닫힌 집합) — 트렌드 레시피의 렌더 효과로만 둔다

둘 다 경계형이라 **컷 안에서** 굽는다 — 그래서 결합은 다시 인코딩하지 않고 이어 붙인다(`editor.join_prepared`). 효과 · 색은 컷 정규화와
같은 인코딩 한 번에 들어간다(`editor.prepare_segments` 의 extras).

줌은 컷 하나에 push(천천히 확대) · pull(천천히 축소) · punch(컷 안의 박자에 확 확대). 화면 분할은 짧은 컷 2~3개를 위아래 칸에
차례로 밀어 넣는다(0.4초 안팎 간격 — 먼저 들어온 칸은 계속 재생되고, 원본이 끝나면 마지막 프레임에 멈춘다) — 분할 하나의 길이는 칸 길이의 합이라
무비 길이가 그대로다. 색 필터(`look`)는 같은 인코딩에 붙인다.

화면 틀(`frame`)이 letterbox 면 컷의 가운데 16:9 띠만 남기고 위아래를 검게 둔다(시네마틱 레터박스 — 레퍼런스 ⑤). 색 필터 뒤에 붙여
검은 띠는 늘 검다.

같은 입력이면 같은 결과다 — 무작위는 무비 시드에서만 나온다.
"""

import hashlib
import random
from dataclasses import replace
from dataclasses import dataclass, field

from pipeline import editor, look as lk
from pipeline import transition as tr
from pipeline.render_spec import RenderSpec, band_height

JOIN_KINDS = ("flash", "dip", "zoompunch")
# 컷 전환의 한쪽 길이(ms) — 컷 길이의 1/3 을 넘지 않게 줄인다
EDGE_MS = {"whip": 160, "zoom": 220, "spin": 260, "glitch": 160, "shake": 260}
# 어휘 전환의 쪽마다 길이(ms) — 기본 길이 × 나눔 비율(zoompunch 는 들어오는 쪽만)
for _kind in JOIN_KINDS:
    _entry = tr.KINDS[_kind]
    EDGE_MS[_kind] = _entry["durationMs"]["default"] * max(_entry["split"]["outgoing"], _entry["split"]["incoming"])
ZOOMS = ("push", "pull", "punch")
# 이 이음이 있는 경계는 효과 없이 바로 넘긴다 — 영상 속 동작이 이미 넘겨 준다
NATURAL_SEAMS = ("cover", "whip", "match")
PUNCH_ZOOM, PUNCH_EASE_S = 0.16, 0.08
# 분할 칸이 들어오는 간격 — 칸 길이의 절반, 길어도 STAGGER_MAX_S(빈 칸이 오래 남지 않게)
SPLIT_GAP_PX, SLIDE_S, STAGGER_MAX_S = 8, 0.16, 0.4


FRAMES = (None, "letterbox")
# 레터박스: 띠 높이는 너비의 9/16, 띠에 담을 원본 자리는 세로 가운데보다 조금 위(얼굴 · 물건이 위쪽에 많다)
LETTERBOX_FOCUS = 0.42


class CutFxError(ValueError):
    """레시피의 효과 이름이 맞지 않음."""


@dataclass(frozen=True)
class CutFx:
    zoom: str | None = None
    punch_ms: int | None = None  # punch 의 박자 — 컷 시작 기준
    intro: str | None = None  # 들어오는 쪽 컷 전환
    outro: str | None = None  # 나가는 쪽 컷 전환
    zoom_range: float = 0.12  # push · pull 의 확대 몫
    # 매치컷(match_cut): 나가는 쪽은 끝에서 이 피사체로 다가가고, 들어오는 쪽은 시작에서 이 피사체로부터 물러난다 — (중심 x, 중심 y, 배율)
    outro_focus: tuple[float, float, float] | None = None
    intro_focus: tuple[float, float, float] | None = None
    match_share: float = 0.45  # 매치 줌이 컷에서 차지하는 몫
    intro_pan: float = 0.0  # 팬 이어주기 — 앞 컷의 팬 방향(1: 화면이 왼쪽으로 흐름, -1: 오른쪽)으로 시작해 멈춘다


@dataclass
class Plan:
    cuts: list[CutFx]
    boundaries: list[str]  # 경계마다 hardcut · 결합 전환 · 컷 전환 · inside(분할 안)
    splits: list[tuple[int, int]] = field(default_factory=list)  # [시작, 끝) 컷 번호

    def units(self) -> list[tuple[int, int]]:
        """결합할 단위 — 분할은 한 단위, 나머지 컷은 하나씩."""
        out, i, starts = [], 0, {a: b for a, b in self.splits}
        while i < len(self.cuts):
            j = starts.get(i, i + 1)
            out.append((i, j))
            i = j
        return out


def _rng(seed: int, name: str) -> random.Random:
    return random.Random(int.from_bytes(hashlib.sha256(f"{seed}:{name}".encode()).digest()[:8], "big"))


def _weighted(rng: random.Random, palette: dict[str, int], avoid: str | None) -> str | None:
    kinds = [(k, w) for k, w in sorted(palette.items()) if w > 0 and k != avoid] or [(k, w) for k, w in sorted(palette.items()) if w > 0]
    if not kinds:
        return None
    return rng.choices([k for k, _ in kinds], weights=[w for _, w in kinds])[0]


def validate(spec: dict) -> None:
    for kind in spec["transitions"]["palette"]:
        if kind not in JOIN_KINDS and kind not in EDGE_MS:
            raise CutFxError(f"알 수 없는 전환 효과: {kind}")
    for kind in spec["zoom"]["kinds"]:
        if kind not in ZOOMS:
            raise CutFxError(f"알 수 없는 줌: {kind}")
    if any(n not in (2, 3) for n in spec["split"]["sizes"]):
        raise CutFxError("화면 분할은 2 또는 3칸입니다.")
    if spec.get("frame") not in FRAMES:
        raise CutFxError(f"알 수 없는 화면 틀: {spec.get('frame')}")


def _splits(planned, cfg: dict, rng: random.Random) -> list[tuple[int, int]]:
    every, sizes = cfg.get("everyCuts"), cfg.get("sizes") or []
    if not every or not sizes:
        return []
    out, i, since = [], 1, 0  # 첫 컷(타이틀이 얹히는 컷)은 온화면으로
    while i < len(planned):
        if since >= every - 1:
            n = rng.choice(sizes)
            run = planned[i:i + n]
            if (len(run) == n and all(c.out_ms <= cfg["maxPanelMs"] for c in run)
                    and all(c.seam not in NATURAL_SEAMS for c in run[:-1])):
                out.append((i, i + n))
                i, since = i + n, 0
                continue
        i, since = i + 1, since + 1
    return out


def plan(planned, beats: tuple[int, ...], spec: dict, seed: int, links: list[dict | None] | None = None) -> Plan:
    """planned 는 continuity.PlannedCut 목록(결과물 순서), beats 는 결과물 시간축의 박자(ms).
    links 는 경계마다 매치컷(match_cut) — {"out": (cx, cy, 배율), "in": (cx, cy, 배율)} 또는 None. 매치가 있는 경계는 다른 효과를 걸지 않는다."""
    validate(spec)
    n = len(planned)
    links = links or [None] * max(0, n - 1)
    splits = _splits(planned, spec["split"], _rng(seed, "split"))
    inside = {b for a, z in splits for b in range(a, z - 1)}
    trans_cfg, rng = spec["transitions"], _rng(seed, "transitions")
    boundaries, last = [], None
    for b in range(n - 1):
        if b in inside:
            boundaries.append("inside")
            continue
        if links[b] is not None:
            # motion: 원본 줌으로 이어짐(디지털 줌 없음) · pan: 팬 이어주기 · match: 디지털 매치 줌
            boundaries.append("motion" if links[b].get("real") else "pan" if "pan" in links[b] else "match")
            continue
        if planned[b].seam in NATURAL_SEAMS or rng.random() >= trans_cfg["rate"]:
            boundaries.append("hardcut")
            continue
        kind = _weighted(rng, trans_cfg["palette"], last) or "hardcut"
        boundaries.append(kind)
        last = kind
    cuts = [CutFx() for _ in planned]
    zoom_cfg, zrng = spec["zoom"], _rng(seed, "zoom")
    in_split = {k for a, z in splits for k in range(a, z)}
    t, turn = 0, 0
    zoom_range = zoom_cfg.get("range", 0.12)
    for k, cut in enumerate(planned):
        intro = boundaries[k - 1] if k > 0 and boundaries[k - 1] in EDGE_MS else None
        outro = boundaries[k] if k < n - 1 and boundaries[k] in EDGE_MS else None
        zoom, punch = None, None
        outro_focus = links[k].get("out") if k < n - 1 and links[k] is not None else None
        intro_focus = links[k - 1].get("in") if k > 0 and links[k - 1] is not None else None
        matched = (k < n - 1 and links[k] is not None) or (k > 0 and links[k - 1] is not None)
        if not matched and k not in in_split and zoom_cfg["kinds"] and zrng.random() < zoom_cfg["rate"]:
            # alternate 면 줌 인 · 줌 아웃을 번갈아(레퍼런스 ⑤ — A 는 다가가고 B 는 물러난다), 아니면 무작위
            zoom = zoom_cfg["kinds"][turn % len(zoom_cfg["kinds"])] if zoom_cfg.get("alternate") else zrng.choice(zoom_cfg["kinds"])
            turn += 1
            if zoom == "punch":
                beat = next((b for b in beats if t + cut.out_ms * 0.3 <= b <= t + cut.out_ms * 0.8), None)
                zoom, punch = ("punch", beat - t) if beat is not None else ("push", None)
        intro_pan = links[k - 1].get("pan", 0.0) if k > 0 and links[k - 1] is not None else 0.0
        cuts[k] = CutFx(zoom, punch, intro, outro, zoom_range, outro_focus, intro_focus,
                        spec.get("match", {}).get("share", 0.45), intro_pan)
        t += cut.out_ms
    return Plan(cuts, boundaries, splits)


# ── 필터 ──────────────────────────────────────────────────────────────
def _edge_window(kind: str, duration_s: float) -> float:
    return min(EDGE_MS[kind] / 1000, duration_s / 3)


def _terms(fx: CutFx, d: float) -> tuple[str, str, str, list[str], str | None]:
    """(zoom 식, 가로 이동 몫 식, 세로 이동 몫 식, 시간 구간 필터들, 회전 식) — 식의 변수는 zoompan 의 it(초).
    이동 몫은 -1(왼쪽 끝) ~ 1(오른쪽 끝)."""
    zoom = "1"
    if fx.zoom == "push":
        zoom = f"(1+{fx.zoom_range:g}*min(it/{d:.3f}\\,1))"
    elif fx.zoom == "pull":
        zoom = f"(1+{fx.zoom_range:g}*(1-min(it/{d:.3f}\\,1)))"
    elif fx.zoom == "punch" and fx.punch_ms is not None:
        p = fx.punch_ms / 1000
        zoom = f"(1+{PUNCH_ZOOM}*clip((it-{p:.3f})/{PUNCH_EASE_S}\\,0\\,1))"
    sx, sy, timed, rotate = ["0"], ["0"], [], []
    for side, kind in (("out", fx.outro), ("in", fx.intro)):
        if kind is None:
            continue
        w = _edge_window(kind, d)
        a, b = (d - w, d) if side == "out" else (0.0, w)
        # p: 나가는 쪽은 0→1(구간이 끝날수록 세게), 들어오는 쪽은 1→0
        p = f"clip((it-{a:.3f})/{w:.3f}\\,0\\,1)" if side == "out" else f"(1-clip(it/{w:.3f}\\,0\\,1))"
        on = f"between(it\\,{a:.3f}\\,{b:.3f})"
        enable = f"enable='between(t,{a:.3f},{b:.3f})'"
        if kind == "whip":
            zoom += f"*if({on}\\,1.25\\,1)"
            sx.append(p if side == "out" else f"(-1)*{p}")  # ffmpeg 식은 '+-(' 를 읽지 못한다
            timed.append(f"avgblur=sizeX=36:sizeY=1:{enable}")
        elif kind == "zoom":
            zoom += f"*(1+0.6*pow({p}\\,2))"
            timed.append(f"gblur=sigma=10:{enable}")
        elif kind == "spin":
            zoom += f"*(1+0.8*{p})"
            rotate.append(f"{'' if side == 'out' else '(-1)*'}0.45*{p}".replace("it", "t").replace("\\,", ","))
            timed.append(f"gblur=sigma=6:{enable}")
        elif kind == "shake":
            zoom += f"*if({on}\\,1.1\\,1)"
            sx.append(f"if({on}\\,0.8*sin(it*90)\\,0)")
            sy.append(f"if({on}\\,0.8*cos(it*70)\\,0)")
        elif kind == "glitch":
            timed.append(f"rgbashift=rh=-18:bh=18:{enable}")
            timed.append(f"noise=alls=28:allf=t:{enable}")
        elif kind in ("flash", "dip"):
            color = tr.KINDS[kind]["color"]
            timed.append(f"fade=t=out:st={a:.3f}:d={w:.3f}:color={color}" if side == "out" else f"fade=t=in:st=0:d={w:.3f}:color={color}")
        elif kind == "zoompunch" and side == "in":
            # easeOutCubic 로 확대에서 제자리로 — editor._zoompunch_filter 와 같은 모양
            zoom += f"*(1+{tr.KINDS[kind]['scaleFrom'] - 1:g}*pow(1-clip(it/{w:.3f}\\,0\\,1)\\,3))"
    rot = "+".join(rotate) if rotate else None
    return zoom, "+".join(sx), "+".join(sy), timed, rot


MATCH_MAX_S = 0.9


def _match_terms(fx: CutFx, d: float) -> tuple[str, str, str]:
    """(배율 곱, 중심 x 식, 중심 y 식) — 매치 줌. 움직임은 smoothstep 으로 부드럽게 시작하고 멈춘다."""
    zoom, cx, cy = "", "0.5", "0.5"
    w = min(MATCH_MAX_S, d * fx.match_share)
    if fx.intro_pan:
        # 처음 w 동안 화면이 앞 컷의 팬 방향으로 흐르다 멈춘다 — 보이는 창이 한쪽 끝에서 가운데로(확대 1.12 로 움직일 여유를 만든다)
        q = f"(1-clip(it/{w:.3f}\\,0\\,1))"
        e = f"({q}*{q}*(3-2*{q}))"
        zoom += f"*(1+0.12*{e})"
        cx += f"+{0.06 * fx.intro_pan:.3f}*{e}"
    for side, focus in (("out", fx.outro_focus), ("in", fx.intro_focus)):
        if focus is None:
            continue
        fx_, fy_, z = focus
        p = f"clip((it-{d - w:.3f})/{w:.3f}\\,0\\,1)" if side == "out" else f"(1-clip(it/{w:.3f}\\,0\\,1))"
        e = f"({p}*{p}*(3-2*{p}))"
        zoom += f"*(1+{z - 1:.3f}*{e})"
        cx += f"+{fx_ - 0.5:.3f}*{e}"
        cy += f"+{fy_ - 0.5:.3f}*{e}"
    return zoom, cx, cy


def band_spec(render_spec: RenderSpec) -> RenderSpec:
    """레터박스 무비의 컷 정규화 크기 — 원본을 띠(16:9)에 바로 맞춘다. 세로로 먼저 잘랐다 다시 자르면 가로 영상이 너무 잘린다."""
    return replace(render_spec, height=band_height(render_spec.width), fit_mode="cover")


def letterbox_filter(render_spec: RenderSpec, band_input: bool = False) -> str:
    """띠만 남기고 위아래를 검게. band_input 이면 입력이 이미 띠 크기(band_spec)라 검은 띠만 붙인다."""
    band = band_height(render_spec.width)
    pad = f"pad={render_spec.width}:{render_spec.height}:0:({render_spec.height}-{band})/2:color=black"
    if band_input:
        return pad
    return f"crop={render_spec.width}:{band}:0:(ih-{band})*{LETTERBOX_FOCUS},{pad}"


def video_filter(fx: CutFx, duration_s: float, render_spec: RenderSpec, look: str | None, frame: str | None = None,
                 output_spec: RenderSpec | None = None) -> str | None:
    """정규화된 구간(render_spec 크기 · fps) 하나에 거는 필터 — 할 것이 없으면 None.
    output_spec 은 레터박스로 붙일 무비 크기(구간이 band_spec 크기일 때)."""
    if frame not in FRAMES:
        raise CutFxError(f"알 수 없는 화면 틀: {frame}")
    zoom, sx, sy, timed, rot = _terms(fx, duration_s)
    mzoom, cx, cy = _match_terms(fx, duration_s)
    zoom += mzoom
    filters = []
    fps, w, h = render_spec.fps, render_spec.width, render_spec.height
    if zoom != "1" or sx != "0" or sy != "0":
        # zoompan 은 입력 타임베이스를 1/fps · pts 를 프레임 번호로 맞춰야 길이가 늘지 않는다(editor._zoompunch_filter 와 같은 이유).
        # 보이는 창의 중심 = 화면 몫 (cx, cy) + 컷 전환의 이동 몫(sx, sy), 화면 밖으로 나가지 않게 자른다
        if cx == "0.5" and cy == "0.5":
            x = f"(iw-iw/zoom)/2*(1+max(-1\\,min(1\\,{sx})))"
            y = f"(ih-ih/zoom)/2*(1+max(-1\\,min(1\\,{sy})))"
        else:
            x = f"clip(iw*({cx})-iw/zoom/2+(iw-iw/zoom)/2*max(-1\\,min(1\\,{sx}))\\,0\\,iw-iw/zoom)"
            y = f"clip(ih*({cy})-ih/zoom/2+(ih-ih/zoom)/2*max(-1\\,min(1\\,{sy}))\\,0\\,ih-ih/zoom)"
        filters.append(
            f"fps={fps},settb=1/{fps},setpts=N,"
            f"zoompan=z='max(1\\,{zoom})':x='{x}':y='{y}':d=1:s={w}x{h}:fps={fps},setpts=N/({fps}*TB)"
        )
    if rot:
        filters.append(f"rotate=a='{rot}':c=black")
    filters += timed
    look_filter = lk.filter_of(look)
    if look_filter:
        filters.append(look_filter)
    if frame == "letterbox":
        filters.append(letterbox_filter(output_spec, band_input=True) if output_spec else letterbox_filter(render_spec))
    if not filters:
        return None
    filters.append("format=yuv420p")
    return ",".join(filters)


def apply(src: str, dst: str, fx: CutFx, duration_s: float, render_spec: RenderSpec, look: str | None) -> str:
    """이미 정규화된 구간에 효과 · 색만 따로 굽는다. 트렌드 렌더는 정규화와 한 번에 굽고(`editor.prepare_segments` extras) 이것은 쓰지 않는다."""
    vf = video_filter(fx, duration_s, render_spec, look)
    if vf is None:
        return src
    _run(["ffmpeg", "-y", "-i", src, "-filter_complex", f"[0:v:0]{vf}[v]", "-map", "[v]", "-map", "0:a:0?",
          "-c:v", "libx264", "-preset", editor.FAST_PRESET, "-crf", editor.INTERMEDIATE_CRF, "-pix_fmt", "yuv420p",
          "-c:a", "copy", "-video_track_timescale", str(editor.TIMESCALE), "-t", f"{duration_s:.3f}", dst])
    return dst


def split_offsets(durations: list[float]) -> list[float]:
    """칸 k 가 들어오는 시각(초) — 앞 칸 길이의 절반, 길어도 STAGGER_MAX_S 간격."""
    offsets = [0.0]
    for d in durations[:-1]:
        offsets.append(offsets[-1] + min(STAGGER_MAX_S, d / 2))
    return offsets


def split_graph(durations: list[float], render_spec: RenderSpec, look: str | None, edges: CutFx = CutFx(),
                band: int | None = None, lengths: list[float] | None = None, fade_out: float = 0.0) -> tuple[str, float]:
    """칸 n 개(2 · 3)를 위에서부터 차례로(칸 길이의 절반 · 최대 0.4초 간격) 밀어 넣는 필터 그래프와 전체 길이(초 — 칸 길이의 합).
    입력 k 는 칸 k 의 구간 — 소리는 앞 durations[k] 초만 차례로 잇고, 화면은 lengths[k] 초(기본 durations)를 재생한다. 칸은 분할이 끝날
    때까지 보이므로 원본을 그만큼(total - 들어온 시각) 늘려 주면 계속 움직이고, 모자라면 그때만 마지막 프레임에 멈춘다(늘리지 않았더니
    첫 칸이 0.7초 멈춰 보였다 — 2026-10-22). fade_out 초가 있으면 끝에서 검게 닫는다(무비의 마지막 단위)."""
    n, w, h, fps = len(durations), render_spec.width, render_spec.height, render_spec.fps
    total = sum(durations)
    slot = h // n
    # 레터박스 무비(band = 띠 높이): 첫 칸은 원래 띠 자리에 그대로, 둘째 칸은 아래 검은 영역에서, 셋째는 위에서 열린다 — 타이틀('Vlog')이
    # 걸린 띠가 움직이지 않는다(가운데 기준으로 쌓았더니 타이틀이 두 칸 사이 틈에 걸렸다 — 2026-10-22)
    center = (h - band) // 2 if band else 0
    band_y = [center, center + band + SPLIT_GAP_PX, center - band - SPLIT_GAP_PX] if band else []
    parts = [f"color=c={'black' if band else 'white'}:s={w}x{h}:r={fps}:d={total:.3f}[bg0]"]
    offsets = split_offsets(durations)
    for k, (d, offset) in enumerate(zip(lengths or durations, offsets)):
        hold = max(0.0, total - offset - d)
        ph = band if band else slot - SPLIT_GAP_PX
        crop = "" if band else f",crop={w}:{ph}:0:(ih-{ph})*0.35"
        parts.append(
            f"[{k}:v:0]fps={fps},scale={w}:-2{crop},"
            f"tpad=stop_mode=clone:stop_duration={hold:.3f},setpts=PTS-STARTPTS+{offset:.3f}/TB[p{k}]"
        )
        # 왼쪽 · 오른쪽에서 번갈아 미끄러져 들어온다
        sign = "-" if k % 2 == 0 else ""
        x = f"if(lt(t-{offset:.3f}\\,{SLIDE_S})\\,{sign}{w}*(1-(t-{offset:.3f})/{SLIDE_S})\\,0)"
        y = band_y[k] if band else k * slot + SPLIT_GAP_PX // 2
        parts.append(f"[bg{k}][p{k}]overlay=x='{x}':y={y}:enable='gte(t,{offset:.3f})':eof_action=pass[bg{k + 1}]")
    # 분할 앞뒤 경계의 전환 효과와 색은 분할 전체에 건다
    finish = video_filter(CutFx(intro=edges.intro, outro=edges.outro), total, render_spec, look) or "format=yuv420p"
    if fade_out:
        finish += f",fade=t=out:st={max(0.0, total - fade_out):.3f}:d={fade_out:.3f}"
    parts.append(f"[bg{n}]{finish}[v]")
    parts.append("".join(f"[{k}:a:0]atrim=0:{d:.3f},asetpts=PTS-STARTPTS[a{k}];" for k, d in enumerate(durations))
                 + "".join(f"[a{k}]" for k in range(n)) + f"concat=n={n}:v=0:a=1[a]")
    return ";".join(parts), total


def split(panels: list[str], durations: list[float], dst: str, render_spec: RenderSpec, look: str | None,
          edges: CutFx = CutFx(), band: int | None = None, lengths: list[float] | None = None, fade_out: float = 0.0) -> str:
    graph, total = split_graph(durations, render_spec, look, edges, band, lengths, fade_out)
    inputs = [arg for p in panels for arg in ("-i", p)]
    # 다른 구간과 다시 인코딩 없이 이어 붙이므로 정규화 구간과 같은 설정(editor.prepare_segments(fast=True))
    _run(["ffmpeg", "-y", *inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-preset", editor.FAST_PRESET, "-crf", editor.INTERMEDIATE_CRF, "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-ar", "48000", "-ac", "2", "-video_track_timescale", str(editor.TIMESCALE),
          "-t", f"{total:.3f}", dst])
    return dst



def _run(cmd: list[str]) -> None:
    editor._run(cmd)  # 부를 때 찾는다 — 데모가 스레드 수를 줄이려 editor._run 을 바꿔 끼운다
