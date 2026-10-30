# 0003 插件复用浏览器核心，且不自动调用模型

## 状态

已接受，2026-10-29。

## 背景

要加一个 DSH 弹层插件，让用户在 DSH 里出题、收答、看品种榜。两个决定绕不开：

**一、判定的数字从哪来。** 仓库已经有两份逐字段一致的实现：`fingerprint.py`（权威）和 `static/fingerprint-core.js`（GitHub Pages 用，浏览器本地算）。再写第三份 TS 版，就有了三个地方会各自漂移。

**二、模型从哪来。** 直觉做法是「在弹层里选一个模型，插件自动跑一遍」。查过宿主实际能力：DSH 浏览器侧能列模型（`remote.session.modelCatalog`），但**没有**「给一个 prompt、用指定模型跑一次、拿回文本」的一次性端点。最接近的是 `session/prompt`，那是一整条会话消息，不是一次性补全。

## 选项

选项 A：插件自己实现算法，再顺手做自动调用。

自动调用的路子只有两条：走 `session/prompt`（等于替用户发消息，污染会话），或者在宿主侧再写一个半边插件去调 `ctx.llm.stream`，自己发 HTTP 路由。后者能跑，代价是插件从「一个纯前端小包」变成「两半包 + RPC + 一份宿主版本兼容层」。

选项 B：插件只做浏览器半边，算法从 `static/fingerprint-core.js` 移植，自动调用不做。

用户自己把题贴到任意会话或任意模型，再把输出贴回来。这就是「外部输入」，一条代码路径同时满足两个需求。

## 决定

选 B。

1. 插件是**纯前端包**（`src/host/index.ts` 只做空实现占位，因为宿主靠 loader entry 发现 `dsh.client` 声明）。
2. 算法从 `static/fingerprint-core.js` 与 `static/challenge-browser.js` 逐函数移植，接缝钉在 `dsh-plugin/src/core/api.ts`，字段名照抄 `fingerprint.py` 的冻结键。
3. 判定的正确性由「与 Python 对拍」保证：`dsh-plugin/tests/core/` 用 `fingerprint.py` 生成基准，JS 侧断言 `prediction`、`family_prediction` 严格相等，逐品种 `probability` 差 < 1e-12。
4. 不做自动调用模型。这条写进 `SPEC.md` §9.3 当冻结契约。

## 后果

好的：插件不随宿主模型接口改动而失效。宿主换掉 `session/prompt` 语义、换掉模型目录结构，插件一行不用改。

好的：判定的数字只有两个来源（Python 与移植自它的 JS），且两者自动对拍。不会出现「网页版说 63.72%，弹层说 61.4%」。

代价：用户要手动搬运文本。这是这款插件唯一的使用摩擦，且不会随时间变好。

如果以后要自动调用：正确做法是加一个宿主侧半边包 + 自己的 `connection.fetch.register` 路由去调 `ctx.llm.stream`，而不是去猜浏览器侧某个隐藏端点。那份工作需要单独一轮，且要带宿主版本兼容层（参考 `dsh-context` 的 `docs/compatibility.md` 那套 feature-detect 做法）。
