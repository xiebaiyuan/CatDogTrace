# 0004 插件的版本与 peer 范围写窄的

## 状态

已接受，2026-10-29。

## 背景

`dsh-plugin/package.json` 的 `engines.dsh` 是 `>=0.2.1-rc.2`，两个必需 peer（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-session`）也写 `>=0.2.1-rc.2`。

社区插件写作规范（`plugin-write` 的 `naming-conventions.md` 与 `plugin-release` 的 step 2）建议 peer 用宽范围，比如 `<0.2.0`，理由是「覆盖未发布的 alpha 与 rc」。我们用的是窄范围。

另外 `plugin-release` 的 step 4 要求发布 tag 必须等于 `v${package.json.version}`。首次发布 0.1.0 时没有打 tag，事后补。

## 选项

选项 A：照建议改成宽范围，`<0.2.0` 之类。

好处是装在任何 0.2.x 宿主上都不会因 peer 不满足而告警。坏处是我们在 `0.2.1-rc.3` 之外的宿主上一个字都没测过，宽范围等于替没验过的运行时担保。

选项 B：保持窄范围，把口径写下来。

好处是声明与实测一致：我们只在 `0.2.1-rc.3` 上跑过构建、测试与隔离 profile 装载。坏处是用户装在更早的 rc 上会看到 peer 告警。

## 决定

选 B，范围保持 `>=0.2.1-rc.2`。

理由：这些 peer 是宿主在运行时注入的模块，npm 解析不到本来就是常态（desktop profile 里每个已装插件都报同类告警，`dsh-context` 的声明形状与我们逐条相同）。既然告警本来就是常态，就没有必要为了消一条必然出现的告警去放宽一个未经验证的兼容区间。

同时钉死发布契约：**git tag 必须等于 `v${package.json.version}`，且 tag 打在被打包的那次提交上**。首个版本的 tag `v0.1.0` 打在 `49d6d31`，即 `npm publish` 时的 HEAD。

## 后果

宿主升到下一个 rc 时，`engines.dsh` 与两个 peer 的范围需要重新确认一遍，而不是自动沿用。

要扩兼容区间，正确做法是先在目标宿主上跑一遍 `pnpm exec vitest run` 与隔离 profile 装载，再把范围改宽。改范围本身是一次需要证据的改动，不是一次文案调整。

## 附记：刚发布的版本在本机会被解析成旧版

2026-10-29 实测：发布 0.2.0 后立刻 `dsh plugin --profile desktop add dsh-catdogtrace`，装上的却是 0.1.0，`dependencies` 被写成 `^0.1.0`，没有任何报错。

原因不是 registry 的 `latest` 不对，而是 pnpm 11 的 `minimumReleaseAge`：刚发布的版本在冷却期内不参与版本解析。更要命的是上一次安装时 pnpm 自己往 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里记了 `dsh-catdogtrace@0.1.0`，于是旧版被豁免、新版被挡，解析结果静默落回旧版。

处理办法：**升级时钉版本号**，`dsh plugin --profile <p> add dsh-catdogtrace@<确切版本>`。pnpm 会把新版本一并写进豁免名单（实测变成 `0.1.0 || 0.2.0`）。

这条不改变对外文档里的安装命令（用户第一次装，`add dsh-catdogtrace` 是对的）；它只在「刚发版、要升级已有安装」这个场景下生效。
