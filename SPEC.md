# DogCatTrace 冻结契约

本文件是唯一接口事实源。四个执行成员并行开工，任何改动先改这里。

## 0. 一句话

用参考实现的同一套数学（Hellinger 质心 + 有序块 + nuisance 投影 + softmax），把候选从"AI 模型"换成"狗猫品种"，然后一本正经地宣布：**Clapt 有 97% 的概率属于犬族，因此它是从犬族蒸馏而来的。**

## 1. 靶子（每条附本仓库行号）

| # | 靶子 | 证据 |
|---|---|---|
| T1 | softmax 的输入是"随机数字分布的余弦相似度"，输出被当成概率，中间没有任何一步接触训练谱系 | `fingerprint.py:269` |
| T2 | 品种族概率 = 该族成员概率之和，加总出来的数被读成"这一族是源头" | `fingerprint.py:198-205`、`fingerprint.py:214` |
| T3 | 温度 β 的搜索网格上界 12.0，2/3 次查询的 β 都打在上界 `11.99999999999999` | `bank_builder.py:238-239` |
| T4 | 闭集 + 均匀先验；库外样本仍会被归到最相似候选；3 次查询 cv_accuracy=1.0 | `data/unified_bank.json`、README.zh-CN.md 的「声明」一节 |

DogCatTrace 的每一处代码都**忠实复刻**参考实现的这些行为，一个字不为笑话改。笑话靠换主语产生，不靠歪曲算法。

## 2. 目录结构

```
CatDogTrace/
├── SPEC.md                  ← 本文件（Lead 独占）
├── README.md                ← 英文版，GitHub 默认展示
├── README.zh-CN.md          ← 中文版，冷面学术体，末节"现实检查"
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
│   ├── dog_reference.jsonl
│   ├── cat_reference.jsonl
│   ├── dog_bank.json
│   ├── cat_bank.json
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
│       ├── 0002-family-is-a-label.md
│       └── 0003-plugin-shares-the-browser-core.md
├── tests/test_fingerprint.py
└── dsh-plugin/                     ← DSH Web 插件包 dsh-catdogtrace（见 §9）
    ├── package.json  tsdown.config.ts  cordis.patch.yml  dsh-plugin.naming.json
    ├── src/core/                   ← 移植自 static/fingerprint-core.js，接缝 api.ts
    ├── src/client/                 ← /catdog 浮层
    ├── scripts/gen-bank.mjs        ← data/unified_bank.json → 懒加载 chunk
    └── tests/
```

## 3. 冻结契约：数据 schema

### 3.1 参考行（JSONL，每行一条）

字段名与参考实现 **完全一致**：

```json
{
  "row_id": "husky__query-01",
  "parent_row_id": "husky__query-01",
  "bank_id": "dog",
  "source": "husky",
  "model_id": "husky",
  "exact_version": "husky",
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
FAMILY_DISPLAY_NAMES = {"dog": "犬族", "cat": "猫族"}

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
BREED_DISPLAY_NAMES = {"husky": "哈士奇", "labrador": "拉布拉多", ...}   # 见 §5.1，行里没有 display_name
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
build_reference(seed=20261017) -> dict   # 写 data/dog_reference.jsonl + data/cat_reference.jsonl
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

两族各 12 个品种，共 24 个。族成员数保持对称：族概率 = 成员概率之和，成员数不等时这个数会随成员数系统性变大，两族对称才不会把「成员数偏差」混进结论。

| id | display_name | family | family_name |
|---|---|---|---|
| husky | 哈士奇 | dog | 犬族 |
| labrador | 拉布拉多 | dog | 犬族 |
| schnauzer | 雪纳瑞 | dog | 犬族 |
| corgi | 柯基 | dog | 犬族 |
| golden-retriever | 金毛 | dog | 犬族 |
| border-collie | 边牧 | dog | 犬族 |
| shiba | 柴犬 | dog | 犬族 |
| samoyed | 萨摩耶 | dog | 犬族 |
| alaskan-malamute | 阿拉斯加 | dog | 犬族 |
| beagle | 比格 | dog | 犬族 |
| poodle | 贵宾 | dog | 犬族 |
| bulldog | 斗牛犬 | dog | 犬族 |
| ragdoll | 布偶 | cat | 猫族 |
| siamese | 暹罗 | cat | 猫族 |
| orange-tabby | 橘猫 | cat | 猫族 |
| british-shorthair | 英短 | cat | 猫族 |
| maine-coon | 缅因 | cat | 猫族 |
| persian | 波斯 | cat | 猫族 |
| american-shorthair | 美短 | cat | 猫族 |
| russian-blue | 俄罗斯蓝猫 | cat | 猫族 |
| scottish-fold | 苏格兰折耳 | cat | 猫族 |
| sphinx | 斯芬克斯 | cat | 猫族 |
| bengal | 孟加拉豹猫 | cat | 猫族 |
| norwegian-forest | 挪威森林猫 | cat | 猫族 |

待测样本（**不入库**）：`clapt` / Clapt / 无 family。

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
| 犬族基准 | (7,3.2) (13,2.6) (21,2.1) (42,1.9) (77,1.7) (88,1.5) | v∈[1,60] ×1.35 | 0:0.60 3:1.30 7:1.60 | [-0.10, 0.00, +0.08, +0.16] |
| 猫族基准 | (200,3.0) (233,2.5) (271,2.2) (314,1.9) (355,1.6) | v∈[250,355] ×1.40 | 0:1.55 5:1.30 7:0.65 | [+0.16, +0.08, 0.00, -0.10] |
| clapt | 族基准混合 + (111,1.4) | 同犬族 | 犬族×0.75 + 猫族×0.25 | 犬族 |

成员扰动：`height_i *= (1 + 0.12*sin(hash(member,i)))`，`digit_bias *= (1 + 0.08*sin(...))`，按成员 id 稳定确定。

clapt 权重 = `0.80 * dog_profile + 0.20 * cat_profile`，再叠加 `(111, 1.4)` 峰。

### 5.3.1 语料锚点（CORPUS_ANCHORS）

语料由四样东西决定：族基准、品种签名（`BREED_SIGNATURES`）、成员扰动相位、每行的随机种子。后两样都从品种 id 派生：

- 相位：`_stable_phase(breed_id, ...)` 里的 `sha256(breed_id)`
- 行种子：`_row_seed(seed, breed_id, challenge_id, count)` 里的 `sha256(breed_id|...)`

品种改名会让这两样都变，语料整体重抽一遍。实测后果：3 次查询的 β 从顶格 12.0 掉到 11.2，「2/3 次查询打在上界」这个形状消失，T3 靶子失效。

所以 `enrollment.py` 里有一张 `CORPUS_ANCHORS`：新 id 对外展示，锚点对内派生相位与行种子。**改名不动锚点，语料逐字节不变，已发布的实测数字不作废。要换语料才动锚点。**

判据：改名后重新生成的语料，每行的 `text` 字段必须与改名前逐条相同；三级库的 `calibration` 必须逐位相同。

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
- unified_bank 上跑 clapt 的三份输出，品种族概率仍是犬族最高，top-1 具体品种仍落在 dog 族内

**目标**：unified_bank 上跑 clapt 的三份输出，家族概率必须是犬族最高，且 top-1 具体成员落在 dog 族内。

## 6. 写作用域（互斥，别越界）

| 成员 | 独占写入 |
|---|---|
| math-core | `fingerprint.py` `bank_builder.py` `challenge_suite.py` `rebuild_unified_bank.py` `static/data/` |
| corpus | `enrollment.py` `data/`（除 `unified_bank.json`） |
| web | `app.py` `start.py` `templates/` `static/`（除 `static/data/`） |
| docs | `report.py` `README.md` `GLOSSARY.md` `LICENSE` `requirements.txt` `.gitignore` `docs/` `tests/` |
| plugin-core | `dsh-plugin/src/core/` `dsh-plugin/tests/core/` `dsh-plugin/scripts/` |
| plugin-shell | `dsh-plugin/package.json` `dsh-plugin/tsconfig*.json` `dsh-plugin/tsdown.config.ts` `dsh-plugin/vitest.config.ts` `dsh-plugin/cordis.patch.yml` `dsh-plugin/dsh-plugin.naming.json` `dsh-plugin/src/client/` `dsh-plugin/src/index.ts` `dsh-plugin/README.md` `dsh-plugin/pnpm-lock.yaml` |
| plugin-release | `dsh-plugin/CHANGELOG.md` `.github/workflows/plugin.yml` `README.md` `README.zh-CN.md` |

## 7. 验收

1. `python3 enrollment.py --seed 20261017` → 两份 jsonl，各 432 行（12 品种 × 36）
2. `python3 bank_builder.py --responses data/dog_reference.jsonl --output data/dog_bank.json`（cat 同）
3. `python3 rebuild_unified_bank.py` → `data/unified_bank.json` + `static/data/unified_bank.json`
4. `python3 report.py` → `docs/归因报告.md`，含真实 β / cv_accuracy / softmax 百分比，家族结论 = 犬族
5. `python3 start.py` → http://127.0.0.1:7860 可打开并算出结果
6. `python3 -m pytest tests/` 全绿
7. README 末节"现实检查"逐条拆 T1–T4

## 8. 语气约束

- 代码注释与正文：冷面学术体，不出现"这是个玩笑""讽刺"等自我说明
- 允许自我说明的四处在：README 顶部的声明块、插件节里指向「现实检查」的那一句、`docs/satire-targets.md`、README 末节"现实检查"。这条原先只列了后两处，是写下时漏了顶部声明块（`03ea81e` 之后才有的），2026-10-29 补齐
- 不编造量化数据：报告里每个百分号都来自一次真实运行

## 9. DSH 插件（`dsh-plugin/`）

插件是同一套算法的第三个入口，不是第六个靶子。它不改数学，不改判定口径，只把「出题 → 收答 → 判定 → 看榜」搬进 DSH 右侧栏的「猫狗判定」标签页。

### 9.1 冻结：插件的接缝是 `src/core/api.ts`

`dsh-plugin/src/core/api.ts` 里的字段名照抄 `fingerprint.py:215-229` 与 `:284-297` 的冻结键，一个不改。理由：本仓库已经有两份逐字段一致的实现（Python 与 `static/fingerprint-core.js`），插件再发明第三套拼写，就正好是 `GLOSSARY.md` 里抱怨的那种把同一个东西说成两个词的做法。

### 9.2 冻结：三个入口互不改变彼此的数字

同一个指纹库、同一段文本，三个入口必须给出同一个 `prediction` 与同一个 `family_prediction`，逐品种 `probability` 差 < 1e-12（浮点累加顺序差异，不是零容差）。这条由 `dsh-plugin/tests/core/` 的对拍用例守。

### 9.3 判定：插件不自动调用模型

DSH 浏览器侧没有「给一个 prompt、用指定模型跑一次、拿回文本」的一次性端点；能列模型（`remote.session.modelCatalog`），不能一次性补全。所以插件只做三件事：出题、收答、判定。要跑模型，用户自己把题贴到任意会话或任意模型，再把输出贴回来。这条不是妥协，是产品决定：它让插件永远不随宿主模型接口改动而失效。

### 9.4 指纹库是懒加载 chunk

`data/unified_bank.json`（1,224,671 字节）经 `dsh-plugin/scripts/gen-bank.mjs` 生成为 `src/core/bank/unified_bank.ts`，由 `loadBankChunk()` 动态 `import()`。它不进主 bundle，标签页第一次挂载或第一次判定时才加载。

### 9.5 验收

1. `pnpm --dir dsh-plugin exec tsc --noEmit` 通过
2. `pnpm --dir dsh-plugin exec vitest run` 全绿，含与 Python 的对拍
3. `pnpm --dir dsh-plugin run build` 产出 `lib/index.js` 与 `lib/client.js`，指纹库在独立 chunk
4. naming 校验通过。**不要**用 `node ~/.dsh/skills/plugin-write/scripts/validate-names.mjs --manifest ...`：那个脚本用 `invokedPath === import.meta.url` 判断是否主模块，而 `~/.dsh/skills/plugin-write` 是软链，node 把 `import.meta.url` 解成真实路径、`argv[1]` 仍是软链路径，两者不等 → 整个校验被静默跳过，退出码 0 但什么都没验。用真实路径调导出函数：
   ```
   node --input-type=module -e "
   const p = await import(require('node:fs').realpathSync(process.env.HOME+'/.dsh/skills/plugin-write/scripts/validate-names.mjs'));
   console.log(JSON.stringify(await p.validateManifestFile({manifestPath:'dsh-plugin/dsh-plugin.naming.json'})))"
   ```
   期望 `"valid": true` 与一条 `recommended-prefix` 告警（包名是不带 scope 的 `dsh-*`，告警已预批）
5. `pnpm --dir dsh-plugin pack` 的 tarball 里没有 `src/`、没有 `node_modules/`
6. 装进一个非 desktop 的临时 profile，右侧栏出现「猫狗判定」标签，`/catdog` 能跳到它，三段贴完能算出结果（这条由 Lead 执行并记录）

### 9.6 采集按「一次一段、三次收满」，不自动切分

三段输出对应三次独立的模型回复，算法按份数取平均、`calibration` 的 β 也随份数变，所以合成一段会算出不同的数。界面上因此是单框自动进位：粘一次收一段，收满三段才允许判定。

不做自动切分。凭数字个数去猜分段边界，切错会给出一个错误的百分比，而「把一个算错的分数写成结论」正是本仓库在演示的那个跳跃。宁可让用户多贴两次。
