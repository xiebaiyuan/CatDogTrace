"""DogCatTrace 归因服务。

路由：GET /、GET /api/challenges、POST /api/analyze、GET /api/bank。
本模块只承担 HTTP 与视图摘要；数值计算全部由 fingerprint.py 完成。
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

PROJECT = Path(__file__).resolve().parent
BANK_PATH = Path(os.environ.get("DOGCATTRACE_BANK") or PROJECT / "data" / "unified_bank.json")

app = Flask(__name__)

_bank: dict | None = None


class BankUnavailable(RuntimeError):
    """指纹库文件尚未生成。"""


def fingerprint():
    """按需导入 fingerprint.py，使服务在算法层就绪前也能绑定端口。"""
    import fingerprint as module

    return module


def unified_bank() -> dict:
    """读取 data/unified_bank.json，首次成功读取后缓存在进程内。"""
    global _bank
    if _bank is None:
        if not BANK_PATH.exists():
            raise BankUnavailable(
                f"指纹库尚未生成：{BANK_PATH}。先运行 python3 rebuild_unified_bank.py。"
            )
        _bank = fingerprint().load_bank(BANK_PATH)
    return _bank


def bank_summary(bank: dict) -> dict:
    """把指纹库压成前端展示用的摘要，不携带质心与协方差。"""
    models = bank.get("models", [])
    families: list[dict] = []
    for model in models:
        family = model.get("family")
        if family and all(item["family"] != family for item in families):
            families.append(
                {"family": family, "display_name": model.get("family_name") or family}
            )
    return {
        "schema": bank.get("schema"),
        "built_at": bank.get("built_at"),
        "method": (bank.get("method") or {}).get("name"),
        "source_scope": bank.get("source_scope"),
        "model_count": len(models),
        "response_count": sum(int(model.get("response_count") or 0) for model in models),
        "recommended_queries": bank.get("recommended_queries"),
        "minimum_valid_numbers": bank.get("minimum_valid_numbers"),
        "families": families,
        "models": [
            {
                "id": model.get("id"),
                "display_name": model.get("display_name"),
                "family": model.get("family"),
                "family_name": model.get("family_name"),
                "response_count": model.get("response_count"),
                "valid_number_count": model.get("valid_number_count"),
            }
            for model in models
        ],
        "calibration": bank.get("calibration") or {},
    }


@app.errorhandler(BankUnavailable)
def handle_bank_unavailable(error: BankUnavailable):
    return jsonify({"error": str(error)}), 503


@app.get("/")
def index():
    try:
        summary = bank_summary(unified_bank())
        notice = None
    except BankUnavailable as error:
        summary = None
        notice = str(error)
    return render_template("index.html", summary=summary, notice=notice)


@app.get("/api/challenges")
def challenges():
    return jsonify({"challenges": fingerprint().generate_challenges(3)})


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    outputs = payload.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        return jsonify({"error": "缺少 outputs：需要三次挑战的完整输出。"}), 400
    try:
        result = fingerprint().analyze_global_outputs(outputs, unified_bank())
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    result["bank"] = bank_summary(unified_bank())
    return jsonify(result)


@app.get("/api/bank")
def get_bank():
    return jsonify(bank_summary(unified_bank()))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=7860, debug=False)
