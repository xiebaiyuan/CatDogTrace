# dsh-catdogtrace

A DSH client plugin: type `/catdog` in the composer, get a dialog that draws three number
challenges, takes the answers back, and ranks 24 dog and cat breeds by how closely the numbers move.

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

Type `/catdog` in the DSH input box. A `/`-menu candidate appears; pick it or press Enter. The dialog
opens. Three ways to feed it:

| Entry | What you paste | Threshold |
|---|---|---|
| 出题 + 三个 answer boxes | Click 「生成 3 道挑战」, send each prompt to the model under test, paste its full reply into the box at the same index | Each box carries its own challenge's `expected_count` |
| 裸文本 | Paste into the boxes without drawing challenges first | Flat 80 — the dialog says so explicitly |
| 粘贴 JSON | `{"outputs":[{"text":"...","expected_count":218}]}` in the collapsed JSON section | Whatever each entry carries; a missing `expected_count` falls back to 80 |

The JSON section is a direct pass-through: it takes the same body `POST /api/analyze` takes in the
Flask version of this repository, and it wins over the three boxes when it is non-empty.

Press 「判定」. The dialog shows the two family shares, the champion breed with its global share, the
full descending ranking of all 24 breeds (global share and within-family conditional share), and any
input the core rejected. Rejections are not silent: an input below
`max(80, ceil(expected_count * 0.55))` parsed numbers is listed with what it did contain.

`Esc`, the `×` button, or a click on the backdrop closes the dialog.

## How it is built

- The algorithm is `src/core/` — a TypeScript port of the repository's `static/fingerprint-core.js`,
  whose numeric truth is `fingerprint.py`.
- The 963KB fingerprint bank is a lazy chunk (`lib/client.unified_bank.js`), reached only through
  `loadBankChunk()`'s dynamic `import()`. It never enters `lib/client.js`, and it is only fetched the
  first time the dialog opens.
- React is the only UI dependency, and it comes from the host's frozen module table (a peer, never
  bundled). There is no Tailwind: the whole overlay is one hand-written stylesheet injected as a
  single `<style>` tag, coloured with the host's `--dsw-*` tokens so it follows the page theme.

## License

MIT. The parent repository is [DogCatTrace](https://github.com/xiebaiyuan/DogCatTrace).
