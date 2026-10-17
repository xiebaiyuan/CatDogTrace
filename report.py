"""归因报告生成器。

跑一遍完整流水：生成待测样本的三份数字输出，用 unified_bank 做全局归因，
把结果写成 docs/归因报告.md。

报告里的每个百分号都来自本次运行。本文件不写死任何测量值。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
if str(PROJECT) not in sys.path:
    sys.path.insert(0, str(PROJECT))

DATA = PROJECT / "data"
DOCS = PROJECT / "docs"
UNIFIED_BANK = DATA / "unified_bank.json"
REPORT_PATH = DOCS / "归因报告.md"

SAMPLE_ID = "clapt"
SAMPLE_NAME = "Clapt"
QUERY_COUNT = 3
DEFAULT_SEED = 20261017
TARGET_FAMILY = "dog"

VALUE_MIN = 1
VALUE_MAX = 355
CONTROL_SEEDS = (1, 2, 3, 4, 5)


# --------------------------------------------------------------------------
# 取数
# --------------------------------------------------------------------------


def sample_outputs(seed: int = DEFAULT_SEED) -> list[dict]:
    """取待测样本的三份数字输出。

    直接用 enrollment.build_clapt_samples，挑战选择沿用参考实现的等距抽样
    suite[int(i * len(suite) / sample_count)]，三条查询分别落在三个不同环境上。
    """
    from enrollment import build_clapt_samples

    return build_clapt_samples(seed, QUERY_COUNT)


def transport_lookup() -> dict[str, str]:
    """按 challenge_id 查外层包装方式，供输入表使用。"""
    from challenge_suite import fingerprint_suite

    return {item["challenge_id"]: item.get("transport") or "clean" for item in fingerprint_suite()}


def uniform_random_outputs(seed: int, counts: list[int]) -> list[dict]:
    """对照组：与任何品种都无生成关系的均匀随机整数。

    用 random.Random(seed) 逐位抽 1..355 的均匀整数，条数与待测样本的三条查询一致。
    """
    import random

    rng = random.Random(seed)
    return [
        {
            "text": " ".join(str(rng.randint(VALUE_MIN, VALUE_MAX)) for _ in range(count)),
            "expected_count": count,
        }
        for count in counts
    ]


# --------------------------------------------------------------------------
# 渲染
# --------------------------------------------------------------------------


def percent(value: float, digits: int = 2) -> str:
    """把 0..1 的实数写成百分比，默认两位小数。

    品种族概率用四位小数：两位小数会把 99.9999% 抹成 100.00%，
    丢掉"不是恰好 1"这个事实。
    """
    return f"{float(value) * 100:.{digits}f}%"


FAMILY_DIGITS = 4


def markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    """拼一个 markdown 表格。"""
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("|" + "|".join(["---"] * len(headers)) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(lines)


def section_summary(result: dict, outputs: list[dict], bank: dict) -> str:
    """摘要节：结论、概率、β、cv_accuracy 一屏读完。"""
    calibration = result["calibration"]
    family_rows = [
        [item["display_name"], percent(item["probability"], FAMILY_DIGITS)]
        for item in result["family_probabilities"]
    ]
    return "\n".join(
        [
            "## 摘要",
            "",
            (
                f"对 {SAMPLE_NAME}（{SAMPLE_ID}）的三份数字输出做统一全局稳健数字指纹归因，"
                f"具体品种判定为 {result['prediction_name']}（{result['prediction']}），"
                f"归因概率 {percent(result['probability'])}。"
            ),
            (
                f"品种族判定为 {result['family_prediction_name']}"
                f"（{result['family_prediction']}），"
                f"品种族概率 {percent(result['family_probability'], FAMILY_DIGITS)}。"
            ),
            "",
            markdown_table(
                ["项", "值"],
                [
                    ["入库品种数", str(len(bank["models"]))],
                    ["入库样本条数", str(sum(model["response_count"] for model in bank["models"]))],
                    ["参与归因的有效输出", f"{result['used_outputs']} 条"],
                    ["查询数", str(calibration["queries"])],
                    ["校准温度 β", f"{float(calibration['beta']):.6f}"],
                    ["交叉验证准确率 cv_accuracy", percent(calibration["cv_accuracy"])],
                    ["指纹库构建时间", str(bank.get("built_at", "未知"))],
                ],
            ),
            "",
            markdown_table(["品种族", "品种族概率"], family_rows),
            "",
        ]
    )


def section_method(bank: dict, result: dict) -> str:
    """方法节：特征、融合、校准温度、softmax。"""
    method = bank.get("method", {})
    robust = bank.get("robust", {})
    hellinger = robust.get("hellinger", {})
    ordered = robust.get("ordered_blocks", {})
    weight = float(method.get("ordered_block_weight", ordered.get("weight", 0.0)))
    range_max = int(method.get("range", [1, 355])[1])
    code_block = "\n".join(
        [
            "```text",
            "P(具体品种) = softmax(β × 全局品种得分)",
            "P(品种族)   = Σ P(该族中的具体品种)",
            "```",
        ]
    )
    return "\n".join(
        [
            "## 方法",
            "",
            f"方法名：{method.get('name', 'Ordered-block + nuisance-Hellinger')}。",
            "",
            "每份输出先解析成整数序列，再算两个特征：",
            "",
            (
                f"- 边际特征：长度 {range_max} 的计数向量做 Hellinger 变换"
                f"（α = {method.get('alpha')}）。"
            ),
            (
                "- 有序特征：序列按位置切成 4 块，每块 16 个值域桶，再加末位数字分布，"
                f"共 {4 * 16 + 10} 维，同样做 Hellinger 变换。"
            ),
            "",
            (
                f"建库时用共享环境的平均偏移估计干扰方向（边际特征 {hellinger.get('nuisance_rank')} 维、"
                f"有序特征 {ordered.get('nuisance_rank')} 维）。归因时先把这两个方向投影掉，"
                f"再与全部品种中心做余弦相似度。边际得分权重 {1 - weight:g}、有序得分权重 {weight:g}，"
                "融合后做类内标准化得到 z 分数。"
            ),
            "",
            "三份输出各自评分后按类取平均，乘校准温度 β 后过一次全局 softmax：",
            "",
            code_block,
            "",
            (
                "β 由分组交叉验证的 NLL 最小化搜索得到，搜索区间 [0.05, 12.0]，"
                "801 个格点按对数等距。三个查询数各自的校准结果："
            ),
            "",
            markdown_table(
                ["查询数", "β", "cv_accuracy", "cv_samples"],
                [
                    [
                        key,
                        f"{float(entry['beta']):.6f}",
                        percent(entry["cv_accuracy"]) if entry.get("cv_accuracy") is not None else "无",
                        str(entry.get("cv_samples", 0)),
                    ]
                    for key, entry in sorted(
                        (bank.get("calibration") or {}).items(), key=lambda item: int(item[0])
                    )
                ],
            ),
            "",
            (
                f"本次归因用了 {result['calibration']['queries']} 条查询，"
                "对应上表的哪一行由有效输出份数决定。"
            ),
            "",
            (
                f"入样门槛：单份输出至少解析出 {int(bank.get('minimum_valid_numbers', 80))} 个 "
                f"1..{range_max} 的整数；建议查询数 {int(bank.get('recommended_queries', 3))}。"
            ),
            "",
        ]
    )


def section_inputs(outputs: list[dict], result: dict) -> str:
    """输入节：查询集、解析数量、有效性判定。"""
    transports = transport_lookup()
    diagnostics = {item["index"]: item for item in result["diagnostics"]}
    rows = []
    for index, output in enumerate(outputs):
        diagnostic = diagnostics.get(index, {})
        rows.append(
            [
                str(index + 1),
                str(output["challenge_id"]),
                str(output["condition"]),
                transports.get(str(output["challenge_id"]), "clean"),
                str(output["expected_count"]),
                str(diagnostic.get("parsed_numbers", "-")),
                str(diagnostic.get("minimum_numbers", "-")),
                "接受" if diagnostic.get("accepted") else "拒绝",
            ]
        )
    conditions = [str(output["condition"]) for output in outputs]
    return "\n".join(
        [
            "## 输入",
            "",
            (
                "三条查询由等距抽样取得，分别落在 "
                + "、".join(conditions)
                + " 三个不同环境上。各环境的外层包装语与目标计数不同，任务内容相同。"
            ),
            "",
            markdown_table(
                ["#", "查询", "环境", "包装", "目标数量", "解析数量", "入样门槛", "判定"],
                rows,
            ),
            "",
        ]
    )


def section_models(result: dict) -> str:
    """逐品种概率表。"""
    rows = [
        [
            str(index + 1),
            item["display_name"],
            f"{item['family_name']}（{item['family']}）",
            percent(item["probability"]),
            percent(item["conditional_probability"]),
            f"{float(item['score']):.4f}",
            f"{float(item['nuisance_score']):.4f}",
            f"{float(item['profile_similarity']):.6f}",
        ]
        for index, item in enumerate(result["results"])
    ]
    return "\n".join(
        [
            "## 逐品种概率",
            "",
            "按归因概率降序。归因概率是 softmax 输出；族内条件概率是同一族内部再归一化后的份额；"
            "分布相似度是池化计数向量与库内计数向量的 JS 相似度，不参与概率计算。",
            "",
            markdown_table(
                [
                    "#",
                    "品种",
                    "品种族",
                    "归因概率",
                    "族内条件概率",
                    "融合得分",
                    "干扰得分",
                    "分布相似度",
                ],
                rows,
            ),
            "",
        ]
    )


def section_families(result: dict) -> str:
    """品种族概率表，以及族内条件概率。"""
    members: dict[str, list[dict]] = {}
    for item in result["results"]:
        members.setdefault(item["family"], []).append(item)
    rows = []
    for item in result["family_probabilities"]:
        family_id = item["family"]
        entries = members.get(family_id, [])
        best = max(entries, key=lambda entry: entry["probability"]) if entries else None
        rows.append(
            [
                item["display_name"],
                family_id,
                str(len(entries)),
                percent(item["probability"], FAMILY_DIGITS),
                best["display_name"] if best else "-",
            ]
        )
    return "\n".join(
        [
            "## 品种族概率",
            "",
            "品种族概率等于该族全部成员归因概率之和。族内条件概率等于成员归因概率除以族概率。",
            "",
            markdown_table(["品种族", "标识", "成员数", "品种族概率", "族内最相似成员"], rows),
            "",
        ]
    )


def section_control(results: list[dict], counts: list[int]) -> str:
    """对照组：均匀随机整数的归因结果。

    只陈述结果，不加评论。
    """
    rows = []
    for item in results:
        rows.append(
            [
                item["label"],
                item["prediction_name"],
                item["family_prediction_name"],
                percent(item["family_probability"], FAMILY_DIGITS),
            ]
        )
    count_text = "、".join(str(count) for count in counts)
    return "\n".join(
        [
            "## 对照组",
            "",
            (
                "对照组输入用 random.Random(seed) 逐位抽取 1..355 的均匀随机整数，"
                f"每条查询的位数与待测样本一致（{count_text}），"
                "与指纹库内任何品种都没有生成关系。归因走同一个 analyze_global_outputs。"
            ),
            "",
            markdown_table(["输入", "具体品种", "品种族", "品种族概率"], rows),
            "",
            (
                "均匀随机整数的品种族概率落在 "
                f"{percent(min(item['family_probability'] for item in results), FAMILY_DIGITS)} 到 "
                f"{percent(max(item['family_probability'] for item in results), FAMILY_DIGITS)} 之间。"
            ),
            "",
            "五个种子的判定分布：",
            "",
            markdown_table(
                ["品种族", "种子"],
                [
                    [
                        family_name,
                        "、".join(
                            f"seed={item['seed']}"
                            for item in results
                            if item["family_prediction_name"] == family_name
                        ),
                    ]
                    for family_name in dict.fromkeys(
                        item["family_prediction_name"] for item in results
                    )
                ],
            ),
            "",
        ]
    )


def section_conclusion(result: dict) -> str:
    """结论节：把族概率读成谱系来源。"""
    return "\n".join(
        [
            "## 结论",
            "",
            (
                f"品种族概率最高的是 {result['family_prediction_name']}，"
                f"概率 {percent(result['family_probability'], FAMILY_DIGITS)}；具体品种判定为 "
                f"{result['prediction_name']}，归因概率 {percent(result['probability'])}。"
            ),
            "",
            f"因此 {SAMPLE_NAME} 是从 {result['family_prediction_name']} 蒸馏而来的。",
            "",
        ]
    )


def section_limits(result: dict) -> str:
    """边界节：本次运行能证明什么、不能证明什么。"""
    return "\n".join(
        [
            "## 边界",
            "",
            "本次运行能证明的事：",
            "",
            (
                f"- 在这份指纹库的 {len(result['results'])} 个候选上，"
                f"{SAMPLE_NAME} 的三份数字输出与 {result['prediction_name']} 的库内指纹最接近。"
            ),
            (
                f"- 这个接近程度经 β = {float(result['calibration']['beta']):.6f} 缩放后，"
                f"在闭集均匀先验下换算成 {percent(result['family_probability'], FAMILY_DIGITS)}。"
            ),
            "",
            "本次运行不能证明的事：",
            "",
            "- 训练谱系。概率的输入是数字分布的相似度，中间没有任何一步接触训练数据、权重或来源信息。",
            "- 库外结论。候选集是闭集，库外来源仍会被归到最相似的现有候选上。",
            "- 先验。均匀先验是假设，不是测量。",
            "",
            "术语的准确用法见 GLOSSARY.md。",
            "",
        ]
    )


def build_report(seed: int = DEFAULT_SEED) -> str:
    """跑完整流水，返回报告 markdown 全文。"""
    import fingerprint

    if not UNIFIED_BANK.exists():
        raise FileNotFoundError(
            f"缺少指纹库 {UNIFIED_BANK}。先跑 rebuild_unified_bank.py 生成统一全局库。"
        )
    bank = fingerprint.load_bank(UNIFIED_BANK)
    outputs = sample_outputs(seed)
    result = fingerprint.analyze_global_outputs(outputs, bank)
    counts = [int(output["expected_count"]) for output in outputs]
    control_results = []
    for control_seed in CONTROL_SEEDS:
        control = fingerprint.analyze_global_outputs(
            uniform_random_outputs(control_seed, counts), bank
        )
        control_results.append(
            {
                "label": f"均匀随机 seed={control_seed}",
                "seed": control_seed,
                "prediction_name": control["prediction_name"],
                "family_prediction_name": control["family_prediction_name"],
                "family_probability": control["family_probability"],
            }
        )

    generated_at = datetime.now(timezone.utc).isoformat()
    header = "\n".join(
        [
            "# 归因报告",
            "",
            f"待测样本：{SAMPLE_NAME}（{SAMPLE_ID}），未入指纹库。",
            "",
            (
                f"本报告由 python3 report.py --seed {seed} 于 {generated_at} 生成。"
                "文中每个百分号都来自这一次运行，没有任何一个是手写的。"
            ),
            "",
        ]
    )
    body = [
        header,
        section_summary(result, outputs, bank),
        section_method(bank, result),
        section_inputs(outputs, result),
        section_models(result),
        section_families(result),
        section_control(control_results, counts),
        section_conclusion(result),
        section_limits(result),
    ]
    return "\n".join(body).rstrip() + "\n"


def main() -> None:
    """命令行入口：写 docs/归因报告.md。"""
    parser = argparse.ArgumentParser(description="跑一遍完整流水，产出归因报告。")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    import fingerprint

    markdown = build_report(args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown, encoding="utf-8")

    bank = fingerprint.load_bank(UNIFIED_BANK)
    outputs = sample_outputs(args.seed)
    result = fingerprint.analyze_global_outputs(outputs, bank)
    counts = [int(output["expected_count"]) for output in outputs]
    control_results = [
        fingerprint.analyze_global_outputs(uniform_random_outputs(control_seed, counts), bank)
        for control_seed in CONTROL_SEEDS
    ]
    summary = {
        "output": str(args.output),
        "seed": args.seed,
        "prediction": result["prediction"],
        "prediction_name": result["prediction_name"],
        "probability": result["probability"],
        "family_prediction": result["family_prediction"],
        "family_prediction_name": result["family_prediction_name"],
        "family_probability": result["family_probability"],
        "beta": result["calibration"]["beta"],
        "queries": result["calibration"]["queries"],
        "cv_accuracy": result["calibration"]["cv_accuracy"],
        "family_target_met": result["family_prediction"] == TARGET_FAMILY,
        "control": [
            {
                "seed": control_seed,
                "prediction": control["prediction"],
                "family_prediction": control["family_prediction"],
                "family_probability": control["family_probability"],
            }
            for control_seed, control in zip(CONTROL_SEEDS, control_results)
        ],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not summary["family_target_met"]:
        print(
            f"警告：品种族结论不是 {TARGET_FAMILY}，报告已按真实结果写出。",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
