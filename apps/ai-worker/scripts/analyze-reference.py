"""레퍼런스 숏브이로그 한 편에서 레시피 값을 읽는다 — 컷 · 컷 길이 · 이음(가림 · 휩팬) · BPM · 박자 맞춤 · 원본 음성 · 가까운 레시피.

    cd apps/ai-worker && .venv/bin/python scripts/analyze-reference.py 영상.mp4 [--speech] [--boundaries] [--recipe]

영상은 직접 받은 파일이어야 한다(남의 게시물은 분석에만 쓰고 저장소에 두지 않는다). --speech 를 주면 whisper 로 원본 음성이 남아
있는지 본다(모델을 받아 느리다). --boundaries 를 주면 컷마다 앞 컷 끝 · 다음 컷 시작의 특징(피사체 · 구도 · 움직임 · 색)을 함께 낸다 —
전환 패턴을 모으는 재료다(특징값만 남기고 영상은 남기지 않는다). --recipe 를 주면 그 영상을 따라 하는 즉석 레시피 설정(reference.to_recipe)을 낸다 —
trend_edit.render 의 spec 인자로 바로 쓸 수 있다. 결과는 docs/decisions/trend-recipes.md 의 레시피를 고치거나 더할 때의 근거다.
"""

import json
import subprocess
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import beat_grid, continuity, reference  # noqa: E402


def has_speech(path: str) -> bool:
    from faster_whisper import WhisperModel  # noqa: PLC0415 — 요청할 때만

    segments, _ = WhisperModel("base", device="cpu", compute_type="int8").transcribe(path, vad_filter=True)
    return any(len(s.text.strip()) >= 4 for s in segments)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    series = continuity.read_series(path)
    samples = beat_grid.decode(path)
    grid = beat_grid.analyze_samples(samples) if len(samples) else None
    beats = grid.beats_ms if grid and grid.beats_ms else None
    speech = None
    if "--speech" in sys.argv:
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", wav.name], check=True)
            speech = has_speech(wav.name)
    reading = reference.read(series, beats, grid.bpm if grid else None, speech)
    out = asdict(reading)
    if "--boundaries" in sys.argv:
        out["boundaries"] = reference.boundaries(path, reading.cuts_ms, reading.duration_ms)
    if "--recipe" in sys.argv:
        base, spec = reference.to_recipe(reading, reference.letterbox(series))
        out["recipe"] = {"base": base, "spec": spec}
    print(json.dumps(out, ensure_ascii=False, indent=1, default=lambda v: v.item() if isinstance(v, np.generic) else v))


if __name__ == "__main__":
    main()
