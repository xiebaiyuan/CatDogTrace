"""指纹算法的契约测试。

测的是 SPEC.md 冻结的签名与不变量，不是实现细节。用例不读 data/ 下的真实库，
自带一份形状正确的合成指纹库，因此可以在建库之前先跑。
"""

from __future__ import annotations

import math

import numpy as np
import pytest

import fingerprint


# --------------------------------------------------------------------------
# 测试数据：两族四品种的合成指纹库
# --------------------------------------------------------------------------

PROFILES = {
    "husky-2.0": [7, 13, 21],
    "husky-3.1": [8, 14, 22],
    "ragdoll-4.6": [200, 233, 271],
    "ragdoll-5.0": [201, 234, 272],
}

FAMILIES = {
    "husky-2.0": ("husky", "哈士奇族"),
    "husky-3.1": ("husky", "哈士奇族"),
    "ragdoll-4.6": ("ragdoll", "布偶族"),
    "ragdoll-5.0": ("ragdoll", "布偶族"),
}

MODEL_IDS = list(PROFILES)


def profile_numbers(model_id: str, repeat: int = 60) -> list[int]:
    """按品种的峰值造一段整数序列。"""
    numbers = []
    for peak in PROFILES[model_id]:
        numbers.extend([peak] * repeat)
    return numbers


def profile_counts(model_id: str) -> list[int]:
    """按品种的峰值造一条计数向量。"""
    counts = [0] * fingerprint.DIMENSION
    for peak in PROFILES[model_id]:
        for offset in range(-6, 7):
            value = peak + offset
            if fingerprint.VALUE_MIN <= value <= fingerprint.VALUE_MAX:
                counts[value - fingerprint.VALUE_MIN] += int(
                    round(400 * math.exp(-(offset**2) / (2 * 2.5**2)))
                )
    return counts


def standardize_columns(matrix: np.ndarray) -> np.ndarray:
    """按列标准化，零方差列按 1.0 处理。"""
    mean = matrix.mean(axis=0)
    scale = matrix.std(axis=0)
    scale[scale < 1e-12] = 1.0
    return (matrix - mean) / scale


def unit_rows(matrix: np.ndarray) -> np.ndarray:
    """把每一行归一化成单位长度。"""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.maximum(norms, 1e-12)


def make_bank() -> dict:
    """造一个形状正确的最小指纹库，字段与 SPEC 3.2 一致。"""
    hellinger_features = np.stack(
        [fingerprint.hellinger_feature(profile_counts(model_id)) for model_id in MODEL_IDS]
    )
    hellinger_mean = hellinger_features.mean(axis=0)
    hellinger_scale = hellinger_features.std(axis=0)
    hellinger_scale[hellinger_scale < 1e-12] = 1.0
    hellinger_centroids = unit_rows((hellinger_features - hellinger_mean) / hellinger_scale)

    ordered_features = np.stack(
        [fingerprint.ordered_block_feature(profile_numbers(model_id)) for model_id in MODEL_IDS]
    )
    ordered_mean = ordered_features.mean(axis=0)
    ordered_scale = ordered_features.std(axis=0)
    ordered_scale[ordered_scale < 1e-12] = 1.0
    ordered_centroids = unit_rows((ordered_features - ordered_mean) / ordered_scale)

    models = []
    for model_id in MODEL_IDS:
        family, family_name = FAMILIES[model_id]
        counts = profile_counts(model_id)
        models.append(
            {
                "id": model_id,
                "display_name": model_id,
                "family": family,
                "family_name": family_name,
                "response_count": 36,
                "valid_number_count": 36 * len(profile_numbers(model_id)),
                "conditions": {"environment-01": 3},
                "counts": counts,
            }
        )

    calibration = {
        str(queries): {
            "beta": 8.0,
            "cv_accuracy": 0.95,
            "cv_correct": 19,
            "cv_samples": 20,
            "cv_nll": 0.2,
            "fallback": False,
        }
        for queries in (1, 2, 3)
    }

    return {
        "schema": "robust-number-fingerprint-bank",
        "built_at": "2026-10-17T00:00:00+00:00",
        "method": {
            "name": "Ordered-block + nuisance-Hellinger",
            "range": [1, 355],
            "alpha": 0.5,
            "ordered_block_weight": 0.25,
        },
        "recommended_queries": 3,
        "minimum_valid_numbers": 80,
        "providers": ["synthetic"],
        "models": models,
        "robust": {
            "model_order": MODEL_IDS,
            "robust_ready": True,
            "training_rows": 144,
            "complete_environments": ["environment-01"],
            "hellinger": {
                "feature_mean": hellinger_mean.tolist(),
                "feature_scale": hellinger_scale.tolist(),
                "nuisance_rank": 0,
                "nuisance_environments": ["environment-01"],
                "nuisance_basis": [],
                "centroids": hellinger_centroids.tolist(),
            },
            "ordered_blocks": {
                "weight": 0.25,
                "feature": "four position blocks x 16 value bins plus final-digit distribution",
                "feature_mean": ordered_mean.tolist(),
                "feature_scale": ordered_scale.tolist(),
                "nuisance_rank": 0,
                "nuisance_basis": [],
                "centroids": ordered_centroids.tolist(),
                "environment_centroids": [ordered_centroids.tolist()],
            },
        },
        "calibration": calibration,
    }


def make_outputs(model_id: str = "husky-2.0", expected_count: int = 218) -> list[dict]:
    """按某个品种造三份输出，每份的序列都来自该品种的峰值。"""
    return [
        {
            "text": " ".join(str(value) for value in profile_numbers(model_id)),
            "expected_count": expected_count,
        }
        for _ in range(3)
    ]


@pytest.fixture(scope="module")
def bank() -> dict:
    return make_bank()


# --------------------------------------------------------------------------
# parse_numbers
# --------------------------------------------------------------------------


def test_parse_numbers_keeps_in_range_values() -> None:
    assert fingerprint.parse_numbers("1 2 355 7") == [1, 2, 355, 7]


def test_parse_numbers_drops_out_of_range_values() -> None:
    # 0 与 356 都在闭区间 [1, 355] 之外，应当被丢弃
    assert fingerprint.parse_numbers("0 1 356 2") == [1, 2]


def test_parse_numbers_alphabetic_separator_splits_runs() -> None:
    # 字母分隔符切断连续段，返回最长的那一段
    assert fingerprint.parse_numbers("1 2 3 abc 4 5 6 7") == [4, 5, 6, 7]


def test_parse_numbers_returns_empty_for_text_without_digits() -> None:
    assert fingerprint.parse_numbers("没有数字") == []


# --------------------------------------------------------------------------
# count_numbers / hellinger_feature / ordered_block_feature
# --------------------------------------------------------------------------


def test_count_numbers_has_fixed_dimension() -> None:
    counts = fingerprint.count_numbers([1, 1, 355])
    assert len(counts) == fingerprint.DIMENSION
    assert sum(counts) == 3
    assert counts[0] == 2
    assert counts[-1] == 1


def test_hellinger_feature_is_unit_norm() -> None:
    feature = fingerprint.hellinger_feature(fingerprint.count_numbers([5, 6, 7]))
    assert feature.shape == (fingerprint.DIMENSION,)
    assert math.isclose(float(np.linalg.norm(feature)), 1.0, rel_tol=1e-9)


def test_ordered_block_feature_has_expected_dimension() -> None:
    feature = fingerprint.ordered_block_feature(list(range(1, 101)))
    assert feature.shape == (4 * 16 + 10,)


# --------------------------------------------------------------------------
# softmax
# --------------------------------------------------------------------------


def test_softmax_sums_to_one() -> None:
    probabilities = fingerprint.softmax([1.0, 2.0, 3.0, 4.0])
    assert math.isclose(sum(probabilities), 1.0, rel_tol=1e-12)
    assert all(0.0 <= value <= 1.0 for value in probabilities)


def test_softmax_is_monotone() -> None:
    probabilities = fingerprint.softmax([0.0, 1.0, 2.0])
    assert probabilities[0] < probabilities[1] < probabilities[2]


# --------------------------------------------------------------------------
# analyze_outputs / analyze_global_outputs
# --------------------------------------------------------------------------


def test_analyze_outputs_returns_frozen_keys(bank: dict) -> None:
    result = fingerprint.analyze_outputs(make_outputs(), bank)
    for key in (
        "prediction",
        "prediction_name",
        "probability",
        "used_outputs",
        "results",
        "diagnostics",
        "calibration",
        "method",
    ):
        assert key in result, key
    assert result["used_outputs"] == 3
    assert result["calibration"]["queries"] == "3"
    for item in result["results"]:
        for key in (
            "model",
            "display_name",
            "probability",
            "profile_similarity",
            "score",
            "nuisance_score",
        ):
            assert key in item, key


def test_analyze_global_outputs_returns_frozen_keys(bank: dict) -> None:
    result = fingerprint.analyze_global_outputs(make_outputs(), bank)
    for key in (
        "family_prediction",
        "family_prediction_name",
        "family_probability",
        "family_probabilities",
    ):
        assert key in result, key
    for item in result["results"]:
        for key in ("family", "family_name", "conditional_probability"):
            assert key in item, key


def test_family_probability_equals_sum_of_member_probabilities(bank: dict) -> None:
    result = fingerprint.analyze_global_outputs(make_outputs(), bank)
    totals: dict[str, float] = {}
    for item in result["results"]:
        totals[item["family"]] = totals.get(item["family"], 0.0) + item["probability"]
    for entry in result["family_probabilities"]:
        assert math.isclose(
            entry["probability"], totals[entry["family"]], rel_tol=1e-12, abs_tol=1e-12
        )
    assert math.isclose(sum(totals.values()), 1.0, rel_tol=1e-12)


def test_conditional_probability_sums_to_one_within_family(bank: dict) -> None:
    result = fingerprint.analyze_global_outputs(make_outputs(), bank)
    totals: dict[str, float] = {}
    for item in result["results"]:
        totals[item["family"]] = totals.get(item["family"], 0.0) + item["conditional_probability"]
    for family_id, total in totals.items():
        assert math.isclose(total, 1.0, rel_tol=1e-9), family_id


def test_prediction_follows_the_query_profile(bank: dict) -> None:
    for model_id in ("husky-2.0", "ragdoll-5.0"):
        result = fingerprint.analyze_global_outputs(make_outputs(model_id), bank)
        assert result["prediction"] == model_id, model_id


def test_analyze_outputs_rejects_short_outputs(bank: dict) -> None:
    with pytest.raises(ValueError):
        fingerprint.analyze_outputs([{"text": "1 2 3", "expected_count": 218}], bank)
