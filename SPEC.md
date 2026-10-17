# DogCatTrace 冻结契约

本文件是唯一接口事实源。四个执行成员并行开工，任何改动先改这里。

## 0. 一句话

用参考实现的同一套数学（Hellinger 质心 + 有序块 + nuisance 投影 + softmax），把候选从"AI 模型"换成"狗猫品种"，然后一本正经地宣布：**隔壁老王-v9 有 97% 的概率属于哈士奇族，因此它是从哈士奇族蒸馏而来的。**

## 1. 靶子（每条附本仓库行号）

| # | 靶子 | 证据 |
|---|---|---|
| T1 | softmax 的输入是"随机数字分布的余弦相似度"，输出被当成概率，中间没有任何一步接触训练谱系 | `fingerprint.py:269` |
| T2 | 品种族概率 = 该族成员概率之和，加总出来的数被读成"这一族是源头" | `fingerprint.py:198-205`、`fingerprint.py:214` |
| T3 | 温度 β 的搜索网格上界 12.0，2/3 次查询的 β 都打在上界 `11.99999999999999` | `bank_builder.py:238-239` |
| T4 | 闭集 + 均匀先验；库外样本仍会被归到最相似候选；3 次查询 cv_accuracy=1.0 | `data/unified_bank.json`、README.md 的「声明」一节 |

DogCatTrace 的每一处代码都**忠实复刻**参考实现的这些行为，一个字不为笑话改。笑话靠换主语产生，不靠歪曲算法。

## 2. 目录结构

```
CatDogTrace/
├── SPEC.md                  ← 本文件（Lead 独占）
├── README.md                ← 冷面学术体，末节"现实检查"
├── GLOSSARY.md              ← 领域词表
├── LICENSE                  ← MIT，Copyright (c) 2026 DogCatTrace Contributors
├── requirements.txt         ← numpy>=1.26,<3 ; Flask>=3.0,<4 ; pytest>=8
├── .gitignore
├── fingerprint.py           ← 1:1 复刻
├── bank_builder.py          ← 1:1 复刻
├── challenge_suite.py       ← 12 环境 × 3 查询
├── enrollment.py            ← 合成语料生成器（无 HTTP）
├── rebuild_unified_bank.py  ← 合并两族
├── report.py                ← 跑一遍，产出 docs/归因报告.md
├── app.py                   ← Flask：/ /api/challenges /api/analyze /api/bank
├── start.py                 ← 127.0.0.1:7860
├── data/
│   ├── husky_reference.jsonl
│   ├── ragdoll_reference.jsonl
│   ├── husky_bank.json
│   ├── ragdoll_bank.json
│   └── unified_bank.json
├── static/
│   ├── index.html  app.js  fingerprint-core.js  challenge-browser.js
│   ├── pages-app.js  styles.css  repository-link.css
│   └── data/unified_bank.json      ← 由 rebuild_unified_bank.py 生成
├── templates/index.html
├── docs/
│   ├── 归因报告.md                  ← report.py 生成
│   ├── satire-targets.md           ← 逐条拆解 T1-T4
│   └── adr/
│       ├── 0001-synthetic-corpus.md
│       └── 0002-family-is-a-label.md
└── tests/test_fingerprint.py
```

## 3. 冻结契约：数据 schema

### 3.1 参考行（JSONL，每行一条）

字段名与参考实现 **完全一致**：

```json
{
  "row_id": "husky-2.0__query-01",
  "parent_row_id": "husky-2.0__query-01",
  "bank_id": "husky",
  "source": "husky-2.0",
  "model_id": "husky-2.0",
  "exact_version": "husky-2.0",
  "condition_id": "environment-01",
  "nuisance_condition_id": "environment-01",
  "wrapper_id": "environment-01",
  "wrapper_transport": "clean",
  "challenge_id": "query-01",
  "task_index": 0,
  "requested_count": 218,
  "parsed_count": 218,
  "strict_threshold": 120,
  "strict_valid": true,
  "temperature": "synthetic",
  "config_id": "breed-simulator",
  "provider": "synthetic",
  "prompt": "<challenge_suite 生成的原样提示词>",
  "text": "17 233 88 ...",
  "error": null,
  "collected_at": "<ISO8601 UTC>"
}
```

`strict_threshold = max(80, ceil(requested_count * 0.55))`。

**`display_name` 不是行字段**（与参考实现一致，行里只有 `model_id`）。中文显示名由 `bank_builder.py` 的 `BREED_DISPLAY_NAMES` 常量在建模时映射，名册见 §5.1。

### 3.2 指纹库（`*_bank.json` / `unified_bank.json`）

```json
{
  "schema": "robust-number-fingerprint-bank",
  "built_at": "<ISO8601>",
  "method": {
    "name": "Ordered-block + nuisance-Hellinger",
    "range": [1, 355], "alpha": 0.5, "ordered_block_weight": 0.25,
    "parser": "longest digit run; alphabetic separators split runs; retain values 1..355",
    "response_score": "shared nuisance-Hellinger and ordered-block environment/nuisance fusion",
    "aggregation": "mean of response-wise fused class z-scores",
    "probability": "uniform-prior softmax with fusion-specific grouped cross-validation temperature scaling"
  },
  "recommended_queries": 3,
  "minimum_valid_numbers": 80,
  "source_scope": "...",
  "providers": ["synthetic"],
  "models": [{"id","display_name","family","family_name","response_count","valid_number_count","conditions","counts"}],
  "robust": {
    "model_order": ["..."], "robust_ready": true, "training_rows": 288,
    "complete_environments": ["environment-01", "..."],
    "hellinger": {"feature_mean","feature_scale","nuisance_rank","nuisance_environments","nuisance_basis","centroids"},
    "ordered_blocks": {"weight","feature","feature_mean","feature_scale","nuisance_rank","nuisance_basis","centroids","environment_centroids"}
  },
  "calibration": {"1": {"beta","cv_accuracy","cv_correct","cv_samples","cv_nll","fallback"}, "2": {...}, "3": {...}}
}
```

`family` / `family_name` 只在 `unified_bank.json` 的 models 里出现（与参考实现一致：单族库里为 null）。

## 4. 冻结契约：函数签名

### fingerprint.py
```python
VALUE_MIN=1; VALUE_MAX=355; DIMENSION=355; ALPHA=0.5; ORDERED_BLOCK_WEIGHT=0.25
FAMILY_DISPLAY_NAMES = {"husky": "哈士奇族", "ragdoll": "布偶族"}

parse_numbers(text: str) -> list[int]
count_numbers(numbers) -> list[int]                       # 长度 355
hellinger_feature(counts) -> np.ndarray                   # 长度 355
ordered_block_feature(numbers) -> np.ndarray              # 长度 74 (4*16 + 10)
robust_score_counts(counts, bank) -> dict                 # {"fused", "nuisance"}
ordered_block_scores(numbers, bank) -> list[float]
robust_score_numbers(numbers, bank) -> dict               # {"fused","marginal_fused","ordered","nuisance"}
softmax(values) -> list[float]
js_similarity(left, right) -> float
load_bank(path) -> dict
analyze_outputs(outputs, bank) -> dict
analyze_global_outputs(outputs, bank) -> dict
generate_challenges(count=3) -> list[dict]                # {"id","expected_count","prompt"}
```

`analyze_outputs` 返回键：`prediction, prediction_name, probability, used_outputs, results[], diagnostics[], calibration{queries,beta,cv_accuracy}, method`。
`results[]` 每项：`model, display_name, probability, profile_similarity, score, nuisance_score`。
`analyze_global_outputs` 追加：`family_prediction, family_prediction_name, family_probability, family_probabilities[]`，并给每个 result 补 `family, family_name, conditional_probability`。

### bank_builder.py
```python
BREED_DISPLAY_NAMES = {"husky-2.0": "哈士奇-2.0", ...}     # 见 §5.1，行里没有 display_name
read_rows(path) -> list[dict]                              # 只留 strict_valid，补 numbers/counts
fit_robust_artifacts(rows, model_ids) -> dict
build_bank(rows, fallback_calibration=None) -> dict
main()                                                     # argparse --responses --output
```

### challenge_suite.py
```python
ENVIRONMENTS: tuple[dict, ...]        # 12 项，每项 {transport, style, counts(3元), templates}
fingerprint_suite() -> list[dict]     # 36 项 {condition, system, user_prefix, transport, challenge_id, expected_count, prompt}
```
**提示词任务内容必须与参考实现完全一致**（要求模型凭第一反应给出 N 个 1..355 整数，禁止工具）。只改外层包装语与计数。

### enrollment.py
```python
BREEDS: dict[str, dict]      # 见 §5
simulate_output(breed_id, count, challenge_id, seed) -> str      # 空格分隔整数
make_row(...) -> dict        # 签名同参考实现
append_rows(rows, path) -> None
build_reference(seed=20261017) -> dict   # 写 data/husky_reference.jsonl + data/ragdoll_reference.jsonl
bank_summary(bank) -> dict
```
**不得发起任何网络请求**。

### report.py
```python
build_report(seed=20261017) -> str       # 返回 markdown 全文
main()                                   # 写 docs/归因报告.md
```

### app.py
路由：`GET /`、`GET /api/challenges`、`POST /api/analyze`、`GET /api/bank`。

## 5. 品种参数

### 5.1 名册

| id | display_name | family | family_name |
|---|---|---|---|
| husky-2.0 | 哈士奇-2.0 | husky | 哈士奇族 |
| husky-3.1 | 哈士奇-3.1 | husky | 哈士奇族 |
| husky-3.1-pro | 哈士奇-3.1-pro | husky | 哈士奇族 |
| alaskan-mix-2.0 | 阿拉斯加混血-2.0 | husky | 哈士奇族 |
| ragdoll-4.6 | 布偶-4.6 | ragdoll | 布偶族 |
| ragdoll-5.0 | 布偶-5.0 | ragdoll | 布偶族 |
| siamese-2.0 | 暹罗-2.0 | ragdoll | 布偶族 |
| orange-7b | 橘猫-7B | ragdoll | 布偶族 |

待测样本（**不入库**）：`laowang-v9` / 隔壁老王-v9 / 无 family。

### 5.2 生成模型

每品种一条 355 维权重向量：

```
weight[v] = (1.0
             + Σ gauss(v; center_i, sigma=2.5) * height_i
             + band_lift(v))
            * digit_bias[v % 10]
            * (1 + drift[block_of_position])
```

采样：对每个位置按 weight 归一化后做 categorical 抽样。

### 5.3 参数表

| 品种 | peaks (center, height) | band_lift | digit_bias（10 维，1.0 为基准） | drift（4 块） |
|---|---|---|---|---|
| husky 族基准 | (7,3.2) (13,2.6) (21,2.1) (42,1.9) (77,1.7) (88,1.5) | v∈[1,60] ×1.35 | 0:0.60 3:1.30 7:1.60 | [-0.10, 0.00, +0.08, +0.16] |
| ragdoll 族基准 | (200,3.0) (233,2.5) (271,2.2) (314,1.9) (355,1.6) | v∈[250,355] ×1.40 | 0:1.55 5:1.30 7:0.65 | [+0.16, +0.08, 0.00, -0.10] |
| laowang-v9 | 族基准混合 + (111,1.4) | 同 husky | husky×0.75 + ragdoll×0.25 | husky |

成员扰动：`height_i *= (1 + 0.12*sin(hash(member,i)))`，`digit_bias *= (1 + 0.08*sin(...))`，按成员 id 稳定确定。

laowang-v9 权重 = `0.80 * husky_profile + 0.20 * ragdoll_profile`，再叠加 `(111, 1.4)` 峰。

### 5.4 品种签名与位置结构

§5.3 的族基准只把两族分开，族内 4 个品种几乎不可分。若语料逐位置独立同分布抽样，`ordered_block_feature` 的 4×16 个值域桶维度全是采样噪声（只有末位数字那 10 维有信号），占 0.25 权重的那一路特征等于空转。两个后果：复刻不忠实；`cv_accuracy` 偏低，读者可以用"工具烂"回避论证。

因此每个品种除族基准外，再叠加三层**品种签名**（值全部按品种 id 稳定确定，不得依赖内建 `hash()`）：

| 层 | 作用 | 约束 |
|---|---|---|
| 品种专属峰 | 2 个该品种独有的 (center, height) | center 落在族基准峰之外的区间，两族各自错开 |
| 品种专属末位偏好 | 10 维乘子，作用在 `digit_bias` 之上 | 品种之间错开，避免全部偏向同一位 |
| 位置漂移 | 4 个整数偏移，按输出序号分块，对值域轴做平移 | 品种之间错开，这是有序块通道的信号来源 |

位置漂移按**输出序号**分块（第 i 个位置属于第 `floor(4*i/n)` 块），对权重向量做值域平移：第 b 块用 `weight(v - shift[b])`。这与 §5.2 里按**值域**分块的 drift 不是一回事，两者共存。

**验收指标**（不再是"族对了就行"）：

- 3 次查询的 `cv_accuracy` ≥ 0.90，逼近参考项目的 0.96 / 0.997 / 1.0
- 3 次查询的 β 打在上界 `11.99999999999999`，与参考项目 T3 的表现一致
- unified_bank 上跑 laowang-v9 的三份输出，品种族概率仍是哈士奇族最高，top-1 具体品种仍落在 husky 族内

**目标**：unified_bank 上跑 laowang-v9 的三份输出，家族概率必须是哈士奇族最高，且 top-1 具体成员落在 husky 族内。

## 6. 写作用域（互斥，别越界）

| 成员 | 独占写入 |
|---|---|
| math-core | `fingerprint.py` `bank_builder.py` `challenge_suite.py` `rebuild_unified_bank.py` `static/data/` |
| corpus | `enrollment.py` `data/`（除 `unified_bank.json`） |
| web | `app.py` `start.py` `templates/` `static/`（除 `static/data/`） |
| docs | `report.py` `README.md` `GLOSSARY.md` `LICENSE` `requirements.txt` `.gitignore` `docs/` `tests/` |

## 7. 验收

1. `python3 enrollment.py --seed 20261017` → 两份 jsonl，各 144 行（8 模型... 实为 4 模型 × 36）
2. `python3 bank_builder.py --responses data/husky_reference.jsonl --output data/husky_bank.json`（ragdoll 同）
3. `python3 rebuild_unified_bank.py` → `data/unified_bank.json` + `static/data/unified_bank.json`
4. `python3 report.py` → `docs/归因报告.md`，含真实 β / cv_accuracy / softmax 百分比，家族结论 = 哈士奇族
5. `python3 start.py` → http://127.0.0.1:7860 可打开并算出结果
6. `python3 -m pytest tests/` 全绿
7. README 末节"现实检查"逐条拆 T1–T4

## 8. 语气约束

- 代码注释与 README：冷面学术体，不出现"这是个玩笑""讽刺"等自我说明
- 唯一的例外：`docs/satire-targets.md` 与 README 末节"现实检查"，那里明着拆
- 不编造量化数据：报告里每个百分号都来自一次真实运行
