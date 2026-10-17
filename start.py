"""启动 DogCatTrace 本地服务：http://127.0.0.1:7860。"""

from __future__ import annotations

import os
import sys
import threading
import webbrowser

sys.dont_write_bytecode = True

from app import app  # noqa: E402

HOST = "127.0.0.1"
PORT = 7860
URL = f"http://{HOST}:{PORT}"


def open_browser() -> None:
    """在服务开始监听后打开默认浏览器。"""
    webbrowser.open(URL)


def main() -> None:
    if os.environ.get("DOGCATTRACE_NO_BROWSER") != "1":
        threading.Timer(1.0, open_browser).start()
    print(f"DogCatTrace 服务地址：{URL}")
    app.run(host=HOST, port=PORT, debug=False)


if __name__ == "__main__":
    main()
