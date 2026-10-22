"""텍스트 액센트 층 c(생성)를 실제 모델로 한 번 돌려 본다 — 문구 · 이모지 · 버린 것 · 토큰 · 지연을 찍는다.

    cd apps/ai-worker && .venv/bin/python scripts/try-accent-writer.py [모델]

입력은 아래의 지어낸 장면 설명이다 — 사용자 스냅을 보내지 않는다. `OPENAI_API_KEY` 는 `apps/api/.env` 에서 읽는다
(config.py). 호출 한 번(컷 8개)이 든다. 결과는 backlog A-19 의 "층 c — 생성" 판단(문구 품질 · 문턱에서 버려지는 비율 · 비용)에 쓴다.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import config  # noqa: E402
from pipeline import accent_writer as aw  # noqa: E402
from pipeline.accent_writer import WriterCut  # noqa: E402

CUTS = [
    WriterCut("t1", "라떼 아트가 올라간 커피잔을 들어 한 모금 마신다", ("커피", "마시기", "카페"), "low", "꿀꺽"),
    WriterCut("t2", "갓 구운 크루아상을 반으로 찢자 결이 보인다", ("빵", "빵집"), "mid", "바삭!"),
    WriterCut("t3", "강아지가 잔디밭을 전력으로 달려온다", ("반려동물", "공원"), "high", "귀여워!!"),
    WriterCut("t4", "파도가 발목까지 밀려왔다 빠진다", ("바다",), "mid", "철썩~"),
    WriterCut("t5", "친구 셋이 바닷가에서 동시에 점프한다", ("친구", "바다", "활기"), "high", "신난다!!"),
    WriterCut("t6", "노을 진 하늘 아래 두 사람의 실루엣", ("노을", "데이트", "감성"), "low", "두근두근"),
    WriterCut("t7", "딸기 케이크에 포크를 넣는다", ("케이크", "아늑함"), "low", "사르르"),
    WriterCut("t8", "전시장 큰 그림 앞에 서서 올려다본다", ("전시",), "low", "영감 충전"),
]


def main() -> None:
    if not config.OPENAI_API_KEY:
        sys.exit("OPENAI_API_KEY 가 없습니다 — apps/api/.env 에 넣고 다시 실행하세요.")
    model = sys.argv[1] if len(sys.argv) > 1 else None
    written, usage = aw.write(CUTS, model)
    for cut in CUTS:
        w = written.get(cut.cut_id)
        emoji = " ".join(aw.emoji_char(cp) for cp in w.emoji) if w else ""
        print(f"{cut.cut_id} [{cut.energy:4}] {cut.summary}")
        print(f"      사전: {cut.dictionary:8}  생성: {(w.text if w else None) or '—':10} ({w.category if w else '-'}) {emoji}")
        if w and w.rejected:
            print(f"      버림: {', '.join(w.rejected)}")
    print(json.dumps({"model": model or config.EDIT_AGENT_MODEL, **usage}, ensure_ascii=False))


if __name__ == "__main__":
    main()
