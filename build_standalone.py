"""把 DogCatTrace 网页拼装成单文件 HTML，双击即可在 file:// 下运行。

源文件全部来自仓库现有文件，本脚本不复制任何业务逻辑：
  static/styles.css             -> 内联 <style>
  static/repository-link.css    -> 内联 <style>
  static/fingerprint-core.js    -> 去掉 export，包进 IIFE
  static/challenge-browser.js   -> 去掉 export，包进 IIFE
  static/pages-app.js           -> 去掉 import，改写库读取，包进 IIFE
  static/data/unified_bank.json -> 内联 window.UNIFIED_BANK
  static/assets/breeds/*.png    -> 内联 window.BREED_AVATARS（每张一个 data URI）
  static/assets/favicon.png     -> 内联 <link rel="icon"> 的 data URI
  templates/index.html          -> 提取 <body> 骨架

源文件改了重跑本脚本即可同步。任一源文件的预期形态缺失时构建直接失败，
不产出半成品。

指纹库（static/data/unified_bank.json）重建后必须重跑本脚本，否则产物里内联的
仍是旧库，界面数字会与 data/ 对不上。

用法：
    python3 build_standalone.py
    python3 build_standalone.py --output /tmp/x.html
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent
STATIC = PROJECT / "static"
TEMPLATES = PROJECT / "templates"
BREEDS = STATIC / "assets" / "breeds"
FAVICON = STATIC / "assets" / "favicon.png"
OUTPUT = STATIC / "DogCatTrace-standalone.html"

# 单文件版必须出现的 DOM 节点，缺一个就说明骨架提取错了
REQUIRED_DOM_IDS = (
    "topbar-bank-count",
    "active-bank-badge",
    "challenge-list",
    "regenerate",
    "analyze",
    "test-message",
    "result",
)


class BuildError(RuntimeError):
    """源文件形态与预期不符，构建中止。"""


def read(path: Path) -> str:
    if not path.exists():
        raise BuildError(f"缺少源文件：{path}")
    return path.read_text(encoding="utf-8")


def strip_module_keywords(source: str, name: str) -> str:
    """把 export 关键字去掉，其余一字不改。"""
    stripped, count = re.subn(r"^export\s+", "", source, flags=re.MULTILINE)
    if count == 0:
        raise BuildError(f"{name} 里没找到 export，形态与预期不符")
    return stripped


def extract_imports(source: str, name: str) -> tuple[list[str], str]:
    """拆出 import 语句引入的符号名，并从源码里删掉这些语句。

    返回 (符号名列表, 去掉 import 后的源码)。
    """
    pattern = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*[\"'][^\"']+[\"']\s*;?\s*$", re.MULTILINE)
    symbols: list[str] = []
    for match in pattern.finditer(source):
        for item in match.group(1).split(","):
            symbol = item.strip()
            if symbol:
                symbols.append(symbol)
    if not symbols:
        raise BuildError(f"{name} 里没找到 import 语句，形态与预期不符")
    remaining = pattern.sub("", source)
    return symbols, remaining


def replace_bank_loading(source: str, name: str) -> str:
    """把 pages-app.js 里 fetch 读库的那三行换成直接读内联的 window.UNIFIED_BANK。

    file:// 下 fetch 会被浏览器拦掉，所以这里必须换成同步读内存。
    匹配不上就报错，避免源文件改动后悄悄产出坏产物。
    """
    pattern = re.compile(
        r"[ \t]*const response = await fetch\([^\n]*\);\n"
        r"[ \t]*if \(!response\.ok\) throw new Error\([^\n]*\);\n"
        r"[ \t]*state\.bank = loadBank\(await response\.json\(\)\);"
    )
    replacement = "    state.bank = loadBank(window.UNIFIED_BANK);"
    updated, count = pattern.subn(replacement, source)
    if count != 1:
        raise BuildError(
            f"{name} 里读指纹库的 fetch 代码块没匹配到（命中 {count} 次），"
            "源文件可能改过，先更新 build_standalone.py 的 replace_bank_loading"
        )
    return updated


def extract_body_skeleton(template: str) -> str:
    """从 templates/index.html 取出 <body> 骨架，去掉 Jinja 与脚本标签。"""
    match = re.search(r"<body>(.*)</body>", template, flags=re.DOTALL)
    if not match:
        raise BuildError("templates/index.html 里没找到 <body>")
    body = match.group(1)
    body = re.sub(r"<script\b.*?</script>", "", body, flags=re.DOTALL)
    body = "\n".join(line for line in body.splitlines() if "{%" not in line and "{{" not in line)
    body = body.strip()
    missing = [node_id for node_id in REQUIRED_DOM_IDS if f'id="{node_id}"' not in body]
    if missing:
        raise BuildError(f"骨架里缺少这些节点：{', '.join(missing)}")
    return body


def inline_bank(bank: dict) -> str:
    """把指纹库序列化成可内联进 <script> 的 JS 字面量。"""
    text = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
    # </script> 会提前闭合脚本块；U+2028/2029 在旧解析器里是换行
    text = text.replace("</", "<\\/")
    text = text.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return text


def png_data_uri(path: Path) -> str:
    """把一张 PNG 读成 data URI。base64 字母表只有 A-Za-z0-9+/=，不含引号和空格。"""
    if not path.is_file():
        raise BuildError(f"缺少图片：{path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def inline_avatars(directory: Path) -> list[str]:
    """把品种头像编码成 window.BREED_AVATARS 赋值语句，返回可拼进 <script> 的行。

    单文件版没有同目录的 assets/，图片只能内联；键就是指纹库里的 model.id。
    一行一张图：按文件名排序保证逐字节可复现，`grep -c` 也能直接数出内联了几张。
    """
    if not directory.is_dir():
        raise BuildError(f"缺少头像目录：{directory}")
    paths = sorted(directory.glob("*.png"))
    if not paths:
        raise BuildError(f"{directory} 里没有 PNG 头像，单文件版的图片会全部裂开")
    lines = ["    window.BREED_AVATARS = {"]
    for path in paths:
        lines.append(f"      {json.dumps(path.stem)}: {json.dumps(png_data_uri(path))},")
    lines.append("    };")
    return lines


def build() -> str:
    """返回单文件 HTML 全文。"""
    styles = read(STATIC / "styles.css") + "\n" + read(STATIC / "repository-link.css")
    core_source = read(STATIC / "fingerprint-core.js")
    challenge_source = read(STATIC / "challenge-browser.js")
    controller_source = read(STATIC / "pages-app.js")
    template = read(TEMPLATES / "index.html")
    bank = json.loads(read(STATIC / "data" / "unified_bank.json"))

    core_js = strip_module_keywords(core_source, "fingerprint-core.js")
    challenge_js = strip_module_keywords(challenge_source, "challenge-browser.js")
    controller_symbols, controller_js = extract_imports(controller_source, "pages-app.js")
    controller_js = replace_bank_loading(controller_js, "pages-app.js")

    core_exports = re.findall(r"^export\s+(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)", core_source, flags=re.MULTILINE)
    challenge_exports = re.findall(r"^export\s+(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)", challenge_source, flags=re.MULTILINE)
    if not core_exports or not challenge_exports:
        raise BuildError("导出名解析失败")

    body = extract_body_skeleton(template)
    bank_literal = inline_bank(bank)
    avatar_lines = inline_avatars(BREEDS)
    favicon_uri = png_data_uri(FAVICON)

    script = "\n".join(
        [
            "(function () {",
            '  "use strict";',
            "  var DogCatTraceModules = {};",
            "",
            "  // ---- static/fingerprint-core.js ----",
            "  (function () {",
            core_js.rstrip(),
            "",
        ]
        + [f"    DogCatTraceModules.{name} = {name};" for name in core_exports]
        + [
            "  })();",
            "",
            "  // ---- static/challenge-browser.js ----",
            "  (function () {",
            challenge_js.rstrip(),
            "",
        ]
        + [f"    DogCatTraceModules.{name} = {name};" for name in challenge_exports]
        + [
            "  })();",
            "",
            "  // ---- static/pages-app.js ----",
            "  (function () {",
            f"    const {{ {', '.join(controller_symbols)} }} = DogCatTraceModules;",
            controller_js.rstrip(),
            "  })();",
            "",
            "  // 供自动化校验读取算法入口，页面本身不依赖这个挂载点",
            "  window.DogCatTraceModules = DogCatTraceModules;",
            "})();",
        ]
    )

    html = "\n".join(
        [
            "<!doctype html>",
            '<html lang="zh-CN">',
            "<head>",
            '  <meta charset="utf-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1">',
            '  <meta name="description" content="DogCatTrace：在浏览器本地对整数序列做品种归因，单文件版可直接双击打开">',
            "  <title>DogCatTrace</title>",
            f'  <link rel="icon" href="{favicon_uri}" type="image/png">',
            "  <!-- 本文件由 build_standalone.py 从仓库源文件拼装生成，不要手改。 -->",
            "  <style>",
            styles.rstrip(),
            "  </style>",
            "</head>",
            "<body>",
            body,
            "",
            "  <script>",
            *avatar_lines,
            f"    window.UNIFIED_BANK = {bank_literal};",
            "  </script>",
            "  <script>",
            script,
            "  </script>",
            "</body>",
            "</html>",
            "",
        ]
    )
    return html


def verify(html: str) -> None:
    """产物自检：单文件版不能残留模块语法与网络请求，图片必须全部内联。"""
    lowered = html.lower()
    for banned, hint in (
        ("fetch(", "还有 fetch 调用，file:// 下会被拦"),
        ('type="module"', "还有 type=\"module\"，file:// 下会被拦"),
        ("import ", "还有 import 语句"),
        ("from \"./", "还有模块相对路径引用"),
    ):
        if banned in lowered:
            raise BuildError(f"产物里出现了 {banned}：{hint}")
    if re.search(r"^export\s", html, flags=re.MULTILINE):
        raise BuildError("产物里还有 export 语句")
    if "window.UNIFIED_BANK" not in html:
        raise BuildError("产物里没有内联指纹库")
    if "<style>" not in lowered:
        raise BuildError("产物里没有内联样式")
    if 'rel="icon"' not in lowered:
        raise BuildError("产物里没有内联站点图标")
    # 24 张头像 + 1 张 favicon，少一张就说明内联环节漏了文件
    expected_images = len(list(BREEDS.glob("*.png"))) + 1
    inlined_images = html.count("data:image/png;base64,")
    if inlined_images < expected_images:
        raise BuildError(f"内联图片只有 {inlined_images} 张，应为 {expected_images} 张（头像 + 图标）")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成 DogCatTrace 单文件 HTML")
    parser.add_argument("--output", type=Path, default=OUTPUT, help=f"输出路径，默认 {OUTPUT}")
    args = parser.parse_args(argv)

    try:
        html = build()
        verify(html)
    except BuildError as error:
        print(f"构建失败：{error}", file=sys.stderr)
        return 1

    args.output.write_text(html, encoding="utf-8")
    print(f"已生成 {args.output}")
    print(f"  {len(html.encode('utf-8'))} 字节 / {len(html.splitlines())} 行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
