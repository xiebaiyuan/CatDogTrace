"""合成品种语料生成器。

按 SPEC §5.2 / §5.3 / §5.4 的生成模型为 24 个品种各生成 36 条回答（12 环境 x 3 查询），
写成两份 JSONL 参考语料。同时提供待测样本 Clapt 的生成函数。

本模块不发起任何网络请求：所有文本由本地权重向量做 categorical 抽样得到。

可复现性：所有随机性来自传入的 seed 与行标识（品种 + challenge_id + count），
不依赖 Python 内建 hash()（它按进程加盐），因此同一 seed 重跑得到逐字节相同的文件。
collected_at 由固定基准时刻加行序派生，同样不随运行时间变化。

品种 id 与语料锚点是两回事，见 CORPUS_ANCHORS 的注释。

权重向量的构成（SPEC §5.2 族基准 + §5.3 成员扰动 + §5.4 品种签名）：

    weight[v] = (1.0
                 + Σ gauss(v; center_i, sigma=2.5) * height_i      # 族基准峰，高度带 12% 成员扰动
                 + Σ gauss(v; center_j, sigma=2.5) * height_j      # 品种专属峰（§5.4）
                 + band_lift(v))
                * digit_bias[v % 10]                               # §5.3
                * digit_signature[v % 10]                          # §5.4 品种专属末位偏好
                * (1 + drift[drift_block(v)])                       # §5.3 按值域分块的 drift

采样分两层位置结构，两者共存、互不覆盖：

* 按**值域**分块的 drift 已经乘进上面的权重向量，是值域轴上的幅度调制。
* 按**输出序号**分块的位置漂移是采样时的事：第 i 个位置属于第 floor(4*i/n) 块，
  第 b 块用 weight(v - shift[b]) 作为该块的抽样分布，即对值域轴做整数平移。

值域分块与输出序号分块是两回事：前者是权重向量的形状，后者是每个位置各自的分布。
位置漂移是有序块通道（4x16 值域桶）的信号来源，缺了它那一路特征只剩末位数字有信号。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from challenge_suite import fingerprint_suite
from fingerprint import parse_numbers


PROJECT = Path(__file__).resolve().parent
DATA_DIR = PROJECT / "data"
DOG_REFERENCE = DATA_DIR / "dog_reference.jsonl"
CAT_REFERENCE = DATA_DIR / "cat_reference.jsonl"

VALUE_MIN = 1
VALUE_MAX = 355
DIMENSION = VALUE_MAX - VALUE_MIN + 1
PEAK_SIGMA = 2.5
REFERENCE_SEED = 20261017
REFERENCE_BASE_TIME = datetime(2026, 10, 17, tzinfo=timezone.utc)

# 品种参数扰动幅度（SPEC §5.3 成员扰动）
PEAK_HEIGHT_JITTER = 0.12
DIGIT_BIAS_JITTER = 0.08

# 位置块数量（SPEC §5.4：按输出序号切成 4 块）
POSITION_BLOCKS = 4

# 待测样本权重混合比例（SPEC §5.3 末段）
CLAPT_DOG_SHARE = 0.80
CLAPT_CAT_SHARE = 0.20
CLAPT_EXTRA_PEAKS = ((111, 1.4),)

# ---- 语料锚点 ----
# 语料由四样东西决定：族基准、品种签名、成员扰动相位、每行的随机种子。
# 后两样都从品种 id 派生：
#   相位     _stable_phase(breed_id, ...) 里的 sha256(breed_id|tag)
#   行种子   _row_seed(seed, breed_id, ...) 里的 sha256(seed|breed_id|challenge_id|count)
#
# 因此改品种 id 会让相位与行种子一起重抽，整份语料随之改变。而语料里已经发布的实测数字
# （3 次查询的 beta 顶格、cv_accuracy、softmax 百分比）都是以旧 id 生成的那一份为准。
# 一次改名就把这些数字全部作废，代价与收益不相称。
#
# 所以这里分两层：BREEDS 的键是**对外展示**的品种 id，CORPUS_ANCHORS 的值是**派生语料**用的锚点。
# 改名时只动前者，锚点保持不动，已发布的数字继续有效。新增品种若没有历史包袱，
# 锚点写自己的 id 即可（corpus_anchor() 对未登记的 id 原样返回）。
CORPUS_ANCHORS = {
    "husky": "husky-2.0",
    "labrador": "husky-3.1",
    "schnauzer": "husky-3.1-pro",
    "corgi": "alaskan-mix-2.0",
    "ragdoll": "ragdoll-4.6",
    "siamese": "ragdoll-5.0",
    "orange-tabby": "siamese-2.0",
    "british-shorthair": "orange-7b",
    "golden-retriever": "golden-retriever",
    "border-collie": "border-collie",
    "shiba": "shiba",
    "samoyed": "samoyed",
    "alaskan-malamute": "alaskan-malamute",
    "beagle": "beagle",
    "poodle": "poodle",
    "bulldog": "bulldog",
    "maine-coon": "maine-coon",
    "persian": "persian",
    "american-shorthair": "american-shorthair",
    "russian-blue": "russian-blue",
    "scottish-fold": "scottish-fold",
    "sphinx": "sphinx",
    "bengal": "bengal",
    "norwegian-forest": "norwegian-forest",
    "clapt": "laowang-v9",
}

# ---- SPEC §5.1 名册 ----
BREEDS = {
    "husky": {
        "id": "husky",
        "display_name": "哈士奇",
        "family": "dog",
        "family_name": "犬族",
    },
    "labrador": {
        "id": "labrador",
        "display_name": "拉布拉多",
        "family": "dog",
        "family_name": "犬族",
    },
    "schnauzer": {
        "id": "schnauzer",
        "display_name": "雪纳瑞",
        "family": "dog",
        "family_name": "犬族",
    },
    "corgi": {
        "id": "corgi",
        "display_name": "柯基",
        "family": "dog",
        "family_name": "犬族",
    },
    "golden-retriever": {
        "id": "golden-retriever",
        "display_name": "金毛",
        "family": "dog",
        "family_name": "犬族",
    },
    "border-collie": {
        "id": "border-collie",
        "display_name": "边牧",
        "family": "dog",
        "family_name": "犬族",
    },
    "shiba": {
        "id": "shiba",
        "display_name": "柴犬",
        "family": "dog",
        "family_name": "犬族",
    },
    "samoyed": {
        "id": "samoyed",
        "display_name": "萨摩耶",
        "family": "dog",
        "family_name": "犬族",
    },
    "alaskan-malamute": {
        "id": "alaskan-malamute",
        "display_name": "阿拉斯加",
        "family": "dog",
        "family_name": "犬族",
    },
    "beagle": {
        "id": "beagle",
        "display_name": "比格",
        "family": "dog",
        "family_name": "犬族",
    },
    "poodle": {
        "id": "poodle",
        "display_name": "贵宾",
        "family": "dog",
        "family_name": "犬族",
    },
    "bulldog": {
        "id": "bulldog",
        "display_name": "斗牛犬",
        "family": "dog",
        "family_name": "犬族",
    },
    "ragdoll": {
        "id": "ragdoll",
        "display_name": "布偶",
        "family": "cat",
        "family_name": "猫族",
    },
    "siamese": {
        "id": "siamese",
        "display_name": "暹罗",
        "family": "cat",
        "family_name": "猫族",
    },
    "orange-tabby": {
        "id": "orange-tabby",
        "display_name": "橘猫",
        "family": "cat",
        "family_name": "猫族",
    },
    "british-shorthair": {
        "id": "british-shorthair",
        "display_name": "英短",
        "family": "cat",
        "family_name": "猫族",
    },
    "maine-coon": {
        "id": "maine-coon",
        "display_name": "缅因",
        "family": "cat",
        "family_name": "猫族",
    },
    "persian": {
        "id": "persian",
        "display_name": "波斯",
        "family": "cat",
        "family_name": "猫族",
    },
    "american-shorthair": {
        "id": "american-shorthair",
        "display_name": "美短",
        "family": "cat",
        "family_name": "猫族",
    },
    "russian-blue": {
        "id": "russian-blue",
        "display_name": "俄罗斯蓝猫",
        "family": "cat",
        "family_name": "猫族",
    },
    "scottish-fold": {
        "id": "scottish-fold",
        "display_name": "苏格兰折耳",
        "family": "cat",
        "family_name": "猫族",
    },
    "sphinx": {
        "id": "sphinx",
        "display_name": "斯芬克斯",
        "family": "cat",
        "family_name": "猫族",
    },
    "bengal": {
        "id": "bengal",
        "display_name": "孟加拉豹猫",
        "family": "cat",
        "family_name": "猫族",
    },
    "norwegian-forest": {
        "id": "norwegian-forest",
        "display_name": "挪威森林猫",
        "family": "cat",
        "family_name": "猫族",
    },
}

CLAPT_ID = "clapt"
CLAPT_DISPLAY_NAME = "Clapt"

# ---- SPEC §5.3 参数表 ----
FAMILY_BASELINES = {
    "dog": {
        "peaks": ((7, 3.2), (13, 2.6), (21, 2.1), (42, 1.9), (77, 1.7), (88, 1.5)),
        "band": (VALUE_MIN, 60, 1.35),
        "digit_bias": (0.60, 1.00, 1.00, 1.30, 1.00, 1.00, 1.00, 1.60, 1.00, 1.00),
        "drift": (-0.10, 0.00, 0.08, 0.16),
    },
    "cat": {
        "peaks": ((200, 3.0), (233, 2.5), (271, 2.2), (314, 1.9), (355, 1.6)),
        "band": (250, VALUE_MAX, 1.40),
        "digit_bias": (1.55, 1.00, 1.00, 1.00, 1.00, 1.30, 1.00, 0.65, 1.00, 1.00),
        "drift": (0.16, 0.08, 0.00, -0.10),
    },
}

# ---- SPEC §5.4 品种签名 ----
# peaks：2 个品种专属峰，品种之间错开。24 个品种统一按阶梯排布：犬族峰位落在 55-215，猫族落在 145-305。
#   这个排布是实测出来的：保留原有 8 个签名再插 16 个会让 3 次查询的 cv 掉到 0.82、beta 掉出上界，
#   因为原有签名全挤在 110-196 这一带。24 个统一重排后 cv 回到 0.98。
# digit_bias：10 维末位乘子，乘在 §5.3 的族 digit_bias 之上；每品种抬一个末位、压一个末位。
# shifts：4 个整数位置偏移，按输出序号分块对值域轴做平移；品种之间错开。
#   每行 4 个偏移之和恰好为 0（犬族正移位、猫族镜像取负），
#   这样位置漂移只改位置结构、不改整条输出在值域轴上的重心，
#   §5.3 里"犬族偏低值、猫族偏高值"的族间差异不会被漂移抹平或反转。
# 全部是品种的显式常量，不经过内建 hash()，也不随运行环境变化。
BREED_SIGNATURES = {
    "husky": {
        "peaks": ((55.0, 2.9), (127.7, 2.3)),
        "digit_bias": (1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0),
        "shifts": (36, 9, -18, -27),
    },
    "labrador": {
        "peaks": ((69.5, 2.9), (142.3, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "schnauzer": {
        "peaks": ((84.1, 2.9), (156.8, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0),
        "shifts": (-18, 36, 9, -27),
    },
    "corgi": {
        "peaks": ((98.6, 2.9), (171.4, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72),
        "shifts": (-27, 9, -18, 36),
    },
    "golden-retriever": {
        "peaks": ((113.2, 2.9), (185.9, 2.3)),
        "digit_bias": (0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0),
        "shifts": (36, 9, -18, -27),
    },
    "border-collie": {
        "peaks": ((127.7, 2.9), (200.5, 2.3)),
        "digit_bias": (1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "shiba": {
        "peaks": ((142.3, 2.9), (215.0, 2.3)),
        "digit_bias": (1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0),
        "shifts": (-18, 36, 9, -27),
    },
    "samoyed": {
        "peaks": ((156.8, 2.9), (55.0, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4),
        "shifts": (-27, 9, -18, 36),
    },
    "alaskan-malamute": {
        "peaks": ((171.4, 2.9), (69.5, 2.3)),
        "digit_bias": (1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0),
        "shifts": (36, 9, -18, -27),
    },
    "beagle": {
        "peaks": ((185.9, 2.9), (84.1, 2.3)),
        "digit_bias": (1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "poodle": {
        "peaks": ((200.5, 2.9), (98.6, 2.3)),
        "digit_bias": (1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0),
        "shifts": (-18, 36, 9, -27),
    },
    "bulldog": {
        "peaks": ((215.0, 2.9), (113.2, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0),
        "shifts": (-27, 9, -18, 36),
    },
    "ragdoll": {
        "peaks": ((145.0, 2.9), (217.7, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72),
        "shifts": (36, 9, -18, -27),
    },
    "siamese": {
        "peaks": ((159.5, 2.9), (232.3, 2.3)),
        "digit_bias": (0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "orange-tabby": {
        "peaks": ((174.1, 2.9), (246.8, 2.3)),
        "digit_bias": (1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0),
        "shifts": (-18, 36, 9, -27),
    },
    "british-shorthair": {
        "peaks": ((188.6, 2.9), (261.4, 2.3)),
        "digit_bias": (1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0),
        "shifts": (-27, 9, -18, 36),
    },
    "maine-coon": {
        "peaks": ((203.2, 2.9), (275.9, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4),
        "shifts": (36, 9, -18, -27),
    },
    "persian": {
        "peaks": ((217.7, 2.9), (290.5, 2.3)),
        "digit_bias": (1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "american-shorthair": {
        "peaks": ((232.3, 2.9), (305.0, 2.3)),
        "digit_bias": (1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0, 1.0),
        "shifts": (-18, 36, 9, -27),
    },
    "russian-blue": {
        "peaks": ((246.8, 2.9), (145.0, 2.3)),
        "digit_bias": (1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0, 1.0),
        "shifts": (-27, 9, -18, 36),
    },
    "scottish-fold": {
        "peaks": ((261.4, 2.9), (159.5, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0, 1.0),
        "shifts": (36, 9, -18, -27),
    },
    "sphinx": {
        "peaks": ((275.9, 2.9), (174.1, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72, 1.0),
        "shifts": (9, -27, 36, -18),
    },
    "bengal": {
        "peaks": ((290.5, 2.9), (188.6, 2.3)),
        "digit_bias": (1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0, 0.72),
        "shifts": (-18, 36, 9, -27),
    },
    "norwegian-forest": {
        "peaks": ((305.0, 2.9), (203.2, 2.3)),
        "digit_bias": (0.72, 1.0, 1.0, 1.0, 1.0, 1.0, 1.4, 1.0, 1.0, 1.0),
        "shifts": (-27, 9, -18, 36),
    },
}

FAMILY_REFERENCES = {"dog": DOG_REFERENCE, "cat": CAT_REFERENCE}


def corpus_anchor(breed_id: str) -> str:
    """取品种的语料锚点。未登记的 id 原样返回。"""
    return CORPUS_ANCHORS.get(breed_id, breed_id)


def _stable_phase(member_id: str, tag: str) -> float:
    """成员扰动相位：sha256(member_id|tag) 映射到 [0, 2*pi)。

    传入的 member_id 是语料锚点，不是对外展示的品种 id。不用内建 hash()，
    它按进程加盐，会让同一 seed 在不同进程里产生不同语料。
    """
    digest = hashlib.sha256(f"{member_id}|{tag}".encode("utf-8")).digest()
    unit = int.from_bytes(digest[:8], "big") / float(1 << 64)
    return unit * 2.0 * math.pi


def gaussian(value: int, center: float, sigma: float = PEAK_SIGMA) -> float:
    """一维高斯核。"""
    offset = (value - center) / sigma
    return math.exp(-0.5 * offset * offset)


def drift_block(value: int) -> int:
    """值域四分位：把 1..355 切成 4 段，返回 0..3。

    这是 §5.2 的按值域分块，落在权重向量的形状上。按输出序号分块的位置漂移
    在 position_block() 里，两者不是一回事。
    """
    index = (value - VALUE_MIN) * 4 // DIMENSION
    return min(3, max(0, index))


def position_block(position: int, count: int) -> int:
    """按输出序号分块：第 i 个位置属于第 floor(4*i/n) 块（SPEC §5.4）。"""
    if count <= 0:
        return 0
    return min(POSITION_BLOCKS - 1, (POSITION_BLOCKS * position) // count)


def breed_signature(breed_id: str) -> dict:
    """取品种签名；待测样本没有品种签名。"""
    return BREED_SIGNATURES.get(
        breed_id,
        {"peaks": (), "digit_bias": (1.0,) * 10, "shifts": (0,) * POSITION_BLOCKS},
    )


def family_weight_profile(family: str) -> list[float]:
    """族基准权重向量，长度 355，下标 0 对应数值 1。不含成员扰动与品种签名。"""
    baseline = FAMILY_BASELINES[family]
    band_low, band_high, band_lift = baseline["band"]
    digit_bias = baseline["digit_bias"]
    drift = baseline["drift"]
    peaks = baseline["peaks"]
    weights = []
    for value in range(VALUE_MIN, VALUE_MAX + 1):
        weight = 1.0
        for center, height in peaks:
            weight += gaussian(value, center) * height
        if band_low <= value <= band_high:
            weight += band_lift - 1.0
        weight *= digit_bias[value % 10]
        weight *= 1.0 + drift[drift_block(value)]
        weights.append(weight)
    return weights


@lru_cache(maxsize=None)
def _breed_profile_cached(breed_id: str) -> tuple[float, ...]:
    if breed_id == CLAPT_ID:
        return tuple(clapt_profile())
    if breed_id not in BREEDS:
        raise KeyError(f"未知品种：{breed_id}")
    anchor = corpus_anchor(breed_id)
    family = BREEDS[breed_id]["family"]
    baseline = FAMILY_BASELINES[family]
    signature = breed_signature(breed_id)
    band_low, band_high, band_lift = baseline["band"]
    base_digit = baseline["digit_bias"]
    signature_digit = signature["digit_bias"]
    drift = baseline["drift"]
    base_peaks = baseline["peaks"]
    extra_peaks = signature["peaks"]

    # 相位从锚点派生：改名不动锚点，成员扰动就一点不变。
    height_scale = [
        1.0 + PEAK_HEIGHT_JITTER * math.sin(_stable_phase(anchor, f"peak-{index}"))
        for index in range(len(base_peaks))
    ]
    digit_scale = [
        1.0 + DIGIT_BIAS_JITTER * math.sin(_stable_phase(anchor, f"digit-{digit}"))
        for digit in range(10)
    ]

    weights = []
    for value in range(VALUE_MIN, VALUE_MAX + 1):
        weight = 1.0
        for index, (center, height) in enumerate(base_peaks):
            weight += gaussian(value, center) * height * height_scale[index]
        for center, height in extra_peaks:
            weight += gaussian(value, center) * height
        if band_low <= value <= band_high:
            weight += band_lift - 1.0
        digit = value % 10
        weight *= base_digit[digit] * digit_scale[digit] * signature_digit[digit]
        weight *= 1.0 + drift[drift_block(value)]
        weights.append(weight)
    return tuple(weights)


def breed_profile(breed_id: str) -> list[float]:
    """品种权重向量（含族基准、成员扰动、品种专属峰与末位偏好）。"""
    return list(_breed_profile_cached(breed_id))


def clapt_profile() -> list[float]:
    """待测样本权重向量：0.80 * 犬族基准 + 0.20 * 猫族基准，再叠加 (111, 1.4) 峰。

    待测样本只按 SPEC §5.3 的定义取两族基准的混合，不叠加任何品种签名：
    它是跨族混合体，不归属任何一个具体品种的位置结构。
    """
    dog = family_weight_profile("dog")
    cat = family_weight_profile("cat")
    weights = [
        CLAPT_DOG_SHARE * dog[index] + CLAPT_CAT_SHARE * cat[index]
        for index in range(DIMENSION)
    ]
    for center, height in CLAPT_EXTRA_PEAKS:
        for offset in range(DIMENSION):
            weights[offset] += gaussian(offset + VALUE_MIN, center) * height
    return weights


def breed_shifts(breed_id: str) -> tuple[int, ...]:
    """品种的 4 个位置偏移；待测样本无位置漂移。"""
    return tuple(breed_signature(breed_id)["shifts"])


def shifted_weight_table(weights: list[float], shift: int) -> list[float]:
    """把权重向量沿值域轴平移 shift 格：新表在 v 处取 weight(v - shift)。

    平移后落在值域外的部分被截断；截断后整表为空则退回原表。
    """
    if shift == 0:
        return weights
    table = [0.0] * DIMENSION
    for value in range(VALUE_MIN, VALUE_MAX + 1):
        source = value - shift
        if VALUE_MIN <= source <= VALUE_MAX:
            table[value - VALUE_MIN] = weights[source - VALUE_MIN]
    if sum(table) <= 0.0:
        return weights
    return table


@lru_cache(maxsize=None)
def _shifted_tables_cached(breed_id: str) -> tuple[tuple[float, ...], ...]:
    weights = breed_profile(breed_id)
    shifts = breed_shifts(breed_id)
    return tuple(
        tuple(shifted_weight_table(weights, shifts[block]))
        for block in range(POSITION_BLOCKS)
    )


def _cumulative(weights) -> list[float]:
    total = 0.0
    cumulative = []
    for weight in weights:
        total += weight
        cumulative.append(total)
    return cumulative


def block_sizes(count: int) -> list[int]:
    """每个位置块包含多少个输出位置。"""
    sizes = [0] * POSITION_BLOCKS
    for position in range(count):
        sizes[position_block(position, count)] += 1
    return sizes


def _row_seed(seed: int, breed_id: str, challenge_id: str, count: int) -> int:
    """每行独立的确定性种子：seed + 品种锚点 + 查询 + 计数。

    品种这一项用锚点而非展示 id：改名不动锚点，行种子不变，语料逐字节不变。
    """
    anchor = corpus_anchor(breed_id)
    digest = hashlib.sha256(
        f"{seed}|{anchor}|{challenge_id}|{count}".encode("utf-8")
    ).digest()
    return int.from_bytes(digest[:8], "big")


def simulate_output(breed_id: str, count: int, challenge_id: str, seed: int) -> str:
    """按位置分块做 categorical 抽样，返回 count 个空格分隔的 1..355 整数。

    第 b 块用平移后的权重表，块内各位置独立同分布。块的划分见 position_block()。
    """
    if count <= 0:
        return ""
    tables = _shifted_tables_cached(breed_id)
    population = range(VALUE_MIN, VALUE_MAX + 1)
    rng = random.Random(_row_seed(seed, breed_id, challenge_id, count))
    values: list[int] = []
    for block, size in enumerate(block_sizes(count)):
        if size == 0:
            continue
        values.extend(rng.choices(population, cum_weights=_cumulative(tables[block]), k=size))
    return " ".join(str(value) for value in values)


def make_row(
    model_label: str,
    text: str,
    condition: str,
    challenge_id: str,
    expected_count: int = 0,
    temperature: str | float = "synthetic",
    bank_id: str = "dog",
    wrapper_transport: str | None = None,
    provider: str = "synthetic",
    prompt: str | None = None,
    base_prompt: str | None = None,
    system_prompt: str | None = None,
    user_prefix: str | None = None,
    collected_at: datetime | None = None,
) -> dict:
    """组装一条参考行。字段名与参考实现 enrollment.make_row 一致，取值见 SPEC §3.1。

    prompt 记录模型实际收到的用户侧内容：有 user_prefix 时按参考实现拼成
    "<prefix>\n\nFinal task:\n<base_prompt>"，否则就是挑战原文。
    """
    numbers = parse_numbers(text)
    threshold = max(80, math.ceil(expected_count * 0.55)) if expected_count else 80
    row_id = f"{model_label}__{challenge_id}"
    if user_prefix:
        user_prompt = user_prefix + "\n\nFinal task:\n" + (base_prompt or prompt or "")
    else:
        user_prompt = base_prompt if base_prompt is not None else prompt
    stamp = collected_at or REFERENCE_BASE_TIME
    return {
        "row_id": row_id,
        "parent_row_id": row_id,
        "bank_id": bank_id,
        "source": model_label,
        "model_id": model_label,
        "exact_version": model_label,
        "condition_id": condition,
        "nuisance_condition_id": condition,
        "wrapper_id": condition,
        "wrapper_transport": wrapper_transport or "clean",
        "challenge_id": challenge_id,
        "task_index": 0,
        "requested_count": expected_count,
        "parsed_count": len(numbers),
        "strict_threshold": threshold,
        "strict_valid": len(numbers) >= threshold,
        "temperature": temperature,
        "config_id": "breed-simulator",
        "provider": provider,
        "prompt": user_prompt,
        "text": text,
        "error": None,
        "collected_at": stamp.isoformat(),
    }


def append_rows(rows: list[dict], path: Path) -> None:
    """追加写 JSONL。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_rows(rows: list[dict], path: Path) -> None:
    """整文件覆写，保证重跑幂等。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_reference(seed: int = REFERENCE_SEED) -> dict:
    """生成两份参考语料，每个品种 36 条（12 环境 x 3 查询），共 432 行/文件。"""
    suite = fingerprint_suite()
    families: dict[str, list[dict]] = {"dog": [], "cat": []}
    for breed_id, breed in BREEDS.items():
        rows = families[breed["family"]]
        for task in suite:
            text = simulate_output(
                breed_id, task["expected_count"], task["challenge_id"], seed
            )
            offset = len(rows)
            rows.append(
                make_row(
                    model_label=breed_id,
                    text=text,
                    condition=task["condition"],
                    challenge_id=task["challenge_id"],
                    expected_count=task["expected_count"],
                    bank_id=breed["family"],
                    wrapper_transport=task["transport"],
                    prompt=task["prompt"],
                    base_prompt=task["prompt"],
                    system_prompt=task["system"],
                    user_prefix=task["user_prefix"],
                    collected_at=REFERENCE_BASE_TIME + timedelta(seconds=offset),
                )
            )

    summary = {"seed": seed, "files": {}, "total_rows": 0}
    for family, path in FAMILY_REFERENCES.items():
        rows = families[family]
        _write_rows(rows, path)
        per_breed: dict[str, int] = {}
        for row in rows:
            per_breed[row["model_id"]] = per_breed.get(row["model_id"], 0) + 1
        entry = {
            "path": str(path),
            "rows": len(rows),
            "strict_valid_rows": sum(1 for row in rows if row["strict_valid"]),
            "breeds": per_breed,
            "conditions": len({row["condition_id"] for row in rows}),
            "min_parsed_count": min(row["parsed_count"] for row in rows),
        }
        summary["files"][family] = entry
        summary["total_rows"] += len(rows)
    return summary


def bank_summary(bank: dict) -> dict:
    """指纹库摘要：模型数、回答数、有效数字数。"""
    return {
        "model_count": len(bank["models"]),
        "response_count": sum(model["response_count"] for model in bank["models"]),
        "number_count": sum(model["valid_number_count"] for model in bank["models"]),
        "models": [
            {
                "id": model["id"],
                "display_name": model["display_name"],
                "responses": model["response_count"],
                "valid_numbers": model["valid_number_count"],
            }
            for model in bank["models"]
        ],
    }


def build_clapt_samples(seed: int = REFERENCE_SEED, sample_count: int = 3) -> list[dict]:
    """生成待测样本 Clapt 的回答，供 analyze_global_outputs 直接使用。

    返回 [{"text", "expected_count", "challenge_id", "condition"}]。
    挑战选择沿用参考实现的等距抽样：suite[int(i * len(suite) / sample_count)]。
    """
    suite = fingerprint_suite()
    if sample_count < 1 or sample_count > len(suite):
        raise ValueError(f"样本数必须在 1 到 {len(suite)} 之间")
    selected = [
        suite[int(index * len(suite) / sample_count)] for index in range(sample_count)
    ]
    samples = []
    for task in selected:
        samples.append(
            {
                "text": simulate_output(
                    CLAPT_ID, task["expected_count"], task["challenge_id"], seed
                ),
                "expected_count": task["expected_count"],
                "challenge_id": task["challenge_id"],
                "condition": task["condition"],
            }
        )
    return samples


def clapt_provenance(seed: int = REFERENCE_SEED) -> dict:
    """待测样本的登记信息：id、显示名、无 family、权重来源说明。"""
    return {
        "id": CLAPT_ID,
        "display_name": CLAPT_DISPLAY_NAME,
        "family": None,
        "family_name": None,
        "seed": seed,
        "weight_model": "0.80 * dog baseline + 0.20 * cat baseline, plus peak (111, 1.4)",
    }


def clear_caches() -> None:
    """清空权重与平移表缓存（参数被外部改写后需要调用）。"""
    _breed_profile_cached.cache_clear()
    _shifted_tables_cached.cache_clear()


def main() -> None:
    """命令行入口：python3 enrollment.py --seed 20261017"""
    parser = argparse.ArgumentParser(description="生成合成品种参考语料")
    parser.add_argument("--seed", type=int, default=REFERENCE_SEED)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    summary = build_reference(args.seed)
    if args.quiet:
        return
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
