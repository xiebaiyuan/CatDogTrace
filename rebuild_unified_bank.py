"""把犬族与猫族两族参考行合并成统一指纹库。

输出两份逐字节相同的文件：data/unified_bank.json 与 static/data/unified_bank.json。
"""

from __future__ import annotations

import json
from pathlib import Path

from bank_builder import build_bank, read_rows


PROJECT = Path(__file__).resolve().parent
OUTPUT = PROJECT / "data" / "unified_bank.json"
MIRROR = PROJECT / "static" / "data" / "unified_bank.json"
SOURCES = {
    "dog": ("犬族", PROJECT / "data" / "dog_reference.jsonl"),
    "cat": ("猫族", PROJECT / "data" / "cat_reference.jsonl"),
}


def main() -> None:
    """构建统一库，并把同一份字节写到 data/ 与 static/data/ 两处。"""
    rows = []
    for family_id, (family_name, path) in SOURCES.items():
        rows.extend(
            {
                **row,
                "family_id": family_id,
                "family_name": family_name,
            }
            for row in read_rows(path)
        )
    bank = build_bank(rows)
    payload = json.dumps(bank, ensure_ascii=False, indent=2) + "\n"
    for target in (OUTPUT, MIRROR):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload, encoding="utf-8")
    print(
        json.dumps(
            {
                "outputs": [str(OUTPUT), str(MIRROR)],
                "models": len(bank["models"]),
                "responses": sum(model["response_count"] for model in bank["models"]),
                "calibration": bank["calibration"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
