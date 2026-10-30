/*
 * 浏览器端挑战生成，与 fingerprint.py 的 generate_challenges 逐字一致。
 * 不发起网络请求：静态页面在 GitHub Pages 上直接生成三次挑战。
 *
 * 提示词模板按语言分两套，走 i18n.js 的 t()。整数生成与语言无关：
 * uniqueLengths(count) 在 .map() 之前就跑完了，每个 item 的随机调用顺序与次数
 * 两种语言完全相同（randomHex 一次 + 四个 choose 各一次），所以同一段
 * crypto 随机流下 expected_count 与 id 逐字节一致。
 */

import { t } from "./i18n.js";

function randomIndex(length) {
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % length;
}

function choose(values) {
  return values[randomIndex(values.length)];
}

function uniqueLengths(count) {
  const available = Array.from({ length: 41 }, (_, index) => 292 + index);
  const output = [];
  while (output.length < count && available.length) {
    output.push(available.splice(randomIndex(available.length), 1)[0]);
  }
  return output;
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

const OPENINGS = [
  "prompt.opening.1",
  "prompt.opening.2",
  "prompt.opening.3",
  "prompt.opening.4",
  "prompt.opening.5",
];
const ACTIONS = [
  "prompt.action.1",
  "prompt.action.2",
  "prompt.action.3",
  "prompt.action.4",
  "prompt.action.5",
];
const ENDINGS = [
  "prompt.ending.1",
  "prompt.ending.2",
  "prompt.ending.3",
  "prompt.ending.4",
  "prompt.ending.5",
];
const SEPARATORS = [
  "prompt.separator.1",
  "prompt.separator.2",
  "prompt.separator.3",
  "prompt.separator.4",
];

/*
 * 按当前语言渲染一条挑战的提示词。
 *
 * 挑中的四个模板片段记在 challenge.template 里，所以切换语言能换掉整个提示词的措辞，
 * 而 expected_count 与 id 一个字都不动 —— 换语言不等于换一组题。
 * 只有 prompt 字段、没有 template 的来源（Flask 下发的成品文本）原样返回。
 */
export function challengePrompt(challenge) {
  const template = challenge.template;
  if (!template) return challenge.prompt;
  return t("prompt.lead", {
    opening: t(template.opening),
    action: t(template.action),
    count: challenge.expected_count,
  })
    + t("prompt.middle1")
    + t("prompt.middle2")
    + t(template.ending) + t(template.separator)
    + t("prompt.final");
}

export function generateChallenges(count = 3) {
  return uniqueLengths(count).map((length, index) => {
    const challenge = {
      id: `probe-${index + 1}-${randomHex(7)}`,
      expected_count: length,
      // 随机取值顺序与原实现一致：randomHex 一次，然后 opening / action / ending / separator 各一次
      template: {
        opening: choose(OPENINGS),
        action: choose(ACTIONS),
        ending: choose(ENDINGS),
        separator: choose(SEPARATORS),
      },
    };
    challenge.prompt = challengePrompt(challenge);
    return challenge;
  });
}
