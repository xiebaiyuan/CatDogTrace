# dsh-catdogtrace

A DSH client plugin: a 「猫狗判定」 tab in the right sidebar that draws three number challenges, takes
the model's answers back one segment at a time, and ranks 24 dog and cat breeds by how closely the
numbers move. Type `/catdog` in the composer to jump there.

This is a joke project with a real algorithm. The joke is the sentence at the end ("this output came
from the canine family"); the algorithm — cosine similarity over a 355-bin number distribution, then
softmax over 24 breeds — is the honest part. It is **not** a research tool. Read
[GLOSSARY.md](https://github.com/xiebaiyuan/DogCatTrace/blob/main/GLOSSARY.md) before quoting a
number out of it: 「相似不等于同源」.

## Install

```sh
dsh plugin --profile <your-profile> add dsh-catdogtrace
```

Requires a DSH host that serves client bundles (`dsh` `>=0.2.1-rc.2`, `platform: web`). After
installing, restart `dsh` — the host composes its browser module graph at boot.

## Use

Open the **「猫狗判定」** tab in the right sidebar: it sits after the host's own Files entry. Typing
`/catdog` in the composer does the same thing — it opens that tab and removes the token you typed.

The tab mounts when you open it, so there is nothing to switch on or close. Draw a set of challenges,
send each prompt to the model under test, then paste its reply back:

| Step | What you do | What the panel does |
|---|---|---|
| 出题 | Click 「生成 3 道挑战」, send each prompt to the model | Shows the three prompts with their expected number counts; each has a 复制 button |
| 收答 | Paste one reply into the single box | Counts the numbers the core will actually score, drops them into the next slot, clears the box, and advances the progress line: `第 2/3 段 · 已收 1/3`, `已收 292 个数字，门槛 161 ✓` |
| 判定 | Click 「判定」 once all three segments are in | Shows the two family shares, the champion breed, the full descending ranking of all 24 breeds, and any input the core rejected |

The threshold is `max(80, ceil(expected_count × 0.55))` — the same gate the core applies. Paste three
segments that were never drawn against a challenge and every one of them falls back to the flat 80, and
the panel says 「门槛按 80 算」 out loud.

「撤回上一段」 puts the last segment back into the box; 「重新开始」 clears all three segments and the
result but keeps the drawn challenges; 「重新出题」 draws a fresh set and discards everything.

A paste that looks like several replies strung together (two answers' worth of numbers) is warned about
and **kept as one segment** — never split. A wrong split yields a wrong percentage, which is the exact
mistake this repository exists to make fun of. Withdraw it and paste the parts separately.

### JSON passthrough

The collapsed 「粘贴 JSON」 section takes the same body `POST /api/analyze` takes in the Flask version of
this repository:

```json
{"outputs":[{"text":"...","expected_count":218}]}
```

While that box holds text it wins outright over the three collected segments — the panel states this,
and a malformed body is reported as-is rather than silently falling back.

Switching to another tab and back does not lose anything: the drawn challenges, the collected segments,
the JSON text, and the result live in a per-session store, not in the component.

## How it is built

- The algorithm is `src/core/` — a TypeScript port of the repository's `static/fingerprint-core.js`,
  whose numeric truth is `fingerprint.py`.
- The 700KB fingerprint bank is a lazy chunk (`lib/client.unified_bank.js`), reached only through
  `loadBankChunk()`'s dynamic `import()`. It never enters `lib/client.js`, and it is only fetched the
  first time the panel is mounted.
- React is the only UI dependency, and it comes from the host's frozen module table (a peer, never
  bundled). There is no Tailwind: the whole panel is one hand-written stylesheet injected as a single
  `<style>` tag, coloured with the host's `--dsw-*` tokens so it follows the page theme.
- The tab type is declared through `ctx.sidebarRightTabs.register({ id, kind })` with a namespaced
  `kind`, and its body and chip are the two keyed `sidebar.right.pane.tab*` seats.

## License

MIT. The parent repository is [DogCatTrace](https://github.com/xiebaiyuan/DogCatTrace).
