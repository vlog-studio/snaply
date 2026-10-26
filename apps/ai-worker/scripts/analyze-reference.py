"""레퍼런스 숏브이로그 한 편에서 레시피 값을 읽는다 — 컷 · 컷 길이 · 이음(가림 · 휩팬) · BPM · 박자 맞춤 · 원본 음성 · 가까운 레시피.

    cd apps/ai-worker && .venv/bin/python scripts/analyze-reference.py 영상.mp4 [--speech] [--boundaries] [--recipe]

영상은 직접 받은 파일이어야 한다(남의 게시물은 분석에만 쓰고 저장소에 두지 않는다). --speech 를 주면 whisper 로 원본 음성이 남아
있는지 본다(모델을 받아 느리다). --boundaries 를 주면 컷마다 앞 컷 끝 · 다음 컷 시작의 특징(피사체 · 구도 · 움직임 · 색)을 함께 낸다 —
전환 패턴을 모으는 재료다(특징값만 남기고 영상은 남기지 않는다). --recipe 를 주면 그 영상을 따라 하는 즉석 레시피 설정(reference.to_recipe)을 낸다 —
trend_edit.render 의 spec 인자로 바로 쓸 수 있다. 결과는 docs/decisions/trend-recipes.md 의 레시피를 고치거나 더할 때의 근거다.
"""

import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import reference  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    measured = reference.measure(sys.argv[1], speech="--speech" in sys.argv, with_boundaries="--boundaries" in sys.argv)
    out = asdict(measured.reading)
    if measured.boundaries is not None:
        out["boundaries"] = measured.boundaries
    if "--recipe" in sys.argv:
        base, spec = reference.to_recipe(measured.reading, measured.letterbox)
        out["recipe"] = {"base": base, "spec": spec}
    print(json.dumps(out, ensure_ascii=False, indent=1, default=lambda v: v.item() if isinstance(v, np.generic) else v))


if __name__ == "__main__":
    main()
