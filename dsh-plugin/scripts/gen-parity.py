#!/usr/bin/env python3
"""生成 `tests/core/fixtures/python-parity.json`：用 Python 参考实现算出对拍基准。

用法（仓库根或任意目录都行）：

    /opt/homebrew/bin/python3 dsh-plugin/scripts/gen-parity.py

依赖只有标准库和 `fingerprint.py` 里的 numpy。**不要**加 pytest / flask 依赖。

脚本定位仓库根靠自身路径，不依赖 `PYTHONPATH`；但按任务约定 `PYTHONPATH=<repo root>` 跑同样正确。

产物是可重复的：没有时间戳，浮点用 repr 的最短往返表示。
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

import fingerprint  # noqa: E402  （路径先插入再 import，是本文件唯一允许的破例）

BANK_PATH = REPO_ROOT / "data" / "unified_bank.json"
DOG_ROWS = REPO_ROOT / "data" / "dog_reference.jsonl"
CAT_ROWS = REPO_ROOT / "data" / "cat_reference.jsonl"
FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "core" / "fixtures" / "python-parity.json"

# `fingerprint.py:241`: 门槛 = max(80, ceil(expected * 0.55))，没有 expected 时退化为 80。
MINIMUM_FLOOR = 80
EXPECTED_RATIO = 0.55


def minimum_numbers(expected: int) -> int:
    return max(MINIMUM_FLOOR, math.ceil(expected * EXPECTED_RATIO)) if expected else MINIMUM_FLOOR


def read_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def accepted(row: dict) -> bool:
    expected = int(row.get("requested_count") or 0)
    return len(fingerprint.parse_numbers(str(row.get("text", "")))) >= minimum_numbers(expected)


def pick_rows(rows: list[dict], limit: int, exclude_models: frozenset[str] = frozenset()) -> list[dict]:
    """按文件顺序取前 `limit` 条能过自己门槛的真实回答，可排除指定品种。"""
    picked = []
    for row in rows:
        if row.get("model_id") in exclude_models:
            continue
        if not accepted(row):
            continue
        picked.append(row)
        if len(picked) >= limit:
            break
    return picked


def as_output(row: dict) -> dict:
    """挑出算法真正读的两个字段：真实 text 与 requested_count。"""
    return {"text": row["text"], "expected_count": row["requested_count"]}


def stepped_values(step: int, count: int) -> list[int]:
    """确定性的伪随机取值序列，全落在 1..355。"""
    return [((index * step) % 355) + 1 for index in range(count)]


def plain(value):
    """把 numpy 标量递归摊平成 JSON 原生类型。"""
    if isinstance(value, dict):
        return {str(key): plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, str):
        return value
    if hasattr(value, "item"):
        return plain(value.item())
    return value


def build_cases() -> list[dict]:
    dog_rows = read_rows(DOG_ROWS)
    cat_rows = read_rows(CAT_ROWS)

    dog_first_rows = pick_rows(dog_rows, 1)
    cat_first_rows = pick_rows(cat_rows, 1)
    if not dog_first_rows or not cat_first_rows:
        raise SystemExit("参考语料里找不到能过门槛的回答，无法生成对拍基准。")
    first_dog_model = dog_first_rows[0].get("model_id")
    dog_other_rows = pick_rows(dog_rows, 1, frozenset({first_dog_model}))
    if not dog_other_rows:
        raise SystemExit("参考语料里凑不出第二个犬族品种，无法生成对拍基准。")

    dog_first = as_output(dog_first_rows[0])
    cat_first = as_output(cat_first_rows[0])
    dog_other = as_output(dog_other_rows[0])

    # 140 个合法值，末尾跟一串越界值（400 / 356 / 0 / 超大整数），最后再补 200 和一个字母尾巴。
    # 越界值不打断游程，只被丢弃，所以最长游程仍是那 140 个。
    main_run = stepped_values(37, 140)
    dirty_text = (
        "这是一段脏文本：说明 甲 "
        + " ".join(str(value) for value in main_run)
        + " 400 356 0 999999999999999999999 200 尾 注 "
    )

    # 字母分隔符切断游程：短的 5 个一段，长的 100 个一段，最长游程胜出。
    small_run = stepped_values(53, 5)
    long_run = stepped_values(17, 100)
    split_text = "甲 " + " ".join(str(value) for value in small_run) + " 乙 " + " ".join(str(value) for value in long_run)

    hundred_text = " ".join(str(value) for value in stepped_values(23, 100))

    return [
        # 3 条完整输出 -> calibration key "3"
        {
            "name": "three-real-answers-calibration-3",
            "outputs": [dog_first, cat_first, dog_other],
        },
        # 2 条输出 -> calibration key "2"
        {
            "name": "two-real-answers-calibration-2",
            "outputs": [dog_first, cat_first],
        },
        # 1 条输出 -> calibration key "1"
        {
            "name": "one-real-answer-calibration-1",
            "outputs": [dog_first],
        },
        # 脏文本：越界值被丢弃、字母分隔符不断开合法游程
        {
            "name": "dirty-out-of-range-and-letter-separators",
            "outputs": [{"text": dirty_text}],
        },
        # 字母分隔符切断游程，取最长的一段
        {
            "name": "letter-separator-split-longest-run-wins",
            "outputs": [{"text": split_text}],
        },
        # 同 100 个数字：expected_count 300 -> 门槛 165 -> 拒
        {
            "name": "expected-count-raises-threshold-above-parsed",
            "outputs": [{"text": hundred_text, "expected_count": 300}],
        },
        # 同 100 个数字：expected_count 150 -> 门槛 83 -> 收
        {
            "name": "expected-count-threshold-at-83",
            "outputs": [{"text": hundred_text, "expected_count": 150}],
        },
        # 一条被拒一条通过：diagnostics 要逐条对上，calibration 走 "1"
        {
            "name": "mixed-one-rejected-one-used",
            "outputs": [{"text": "本轮拒答，不作答。"}, dog_first],
        },
        # 全部被拒 -> ValueError
        {
            "name": "all-rejected-raises",
            "outputs": [{"text": "没有数字的回答。"}, {"text": "1 2 3"}],
        },
        # 短到被拒的单条文本 -> ValueError
        {
            "name": "short-text-raises",
            "outputs": [{"text": "只给了几个 7 9 11"}],
        },
    ]


def main() -> int:
    bank = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    cases = build_cases()
    records = []

    for case in cases:
        record = {"name": case["name"], "outputs": case["outputs"], "result": None, "error": None}
        try:
            result = fingerprint.analyze_global_outputs(case["outputs"], bank)
        except ValueError as error:
            record["error"] = {"type": type(error).__name__, "message": str(error)}
        else:
            record["result"] = plain(result)
        records.append(record)

    payload = {
        "generator": "dsh-plugin/scripts/gen-parity.py",
        "numeric_reference": "fingerprint.py::analyze_global_outputs",
        "bank": {
            "path": "data/unified_bank.json",
            "bytes": BANK_PATH.stat().st_size,
        },
        "tolerance": {"probability_abs": 1e-12},
        "cases": records,
    }

    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 生成时的自证信息走 stderr，不进产物。
    for record in records:
        if record["error"] is not None:
            print(f"  {record['name']}: {record['error']['type']} — {record['error']['message']}", file=sys.stderr)
            continue
        result = record["result"]
        diagnostics = " ".join(f"{item['parsed_numbers']}/{item['minimum_numbers']}={item['accepted']}" for item in result["diagnostics"])
        print(
            f"  {record['name']}: prediction={result['prediction']} family={result['family_prediction']}"
            f" used={result['used_outputs']} key={result['calibration']['queries']} [{diagnostics}]",
            file=sys.stderr,
        )
    print(f"wrote {FIXTURE.relative_to(REPO_ROOT)} ({len(records)} cases, {FIXTURE.stat().st_size} bytes)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
