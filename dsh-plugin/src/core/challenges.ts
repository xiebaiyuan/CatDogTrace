/**
 * Challenge generation: the port of `static/challenge-browser.js`, which mirrors
 * `fingerprint.py:300-349` word for word.
 *
 * The prompt text is not a parameter — it is copied verbatim from both implementations. An edit here
 * that is not also an edit in `fingerprint.py` would make the two produce different probes, which is
 * exactly the drift `SPEC.md` freezes against.
 */

import type { Challenge } from './api'

/** Smallest challenge length. `range(292, 333)` is inclusive of 292 (`fingerprint.py:303`). */
const LENGTH_MIN = 292

/** Largest challenge length. */
const LENGTH_MAX = 332

/** Unbiased-index rejection threshold divisor: the whole 32-bit range. */
const UINT32_RANGE = 0x100000000

/** Random bytes behind the challenge id (`secrets.token_hex(7)`). */
const ID_BYTES = 7

interface RandomSource {
  getRandomValues<T extends ArrayBufferView>(array: T): T
}

/**
 * `crypto.getRandomValues`, resolved at call time.
 *
 * The browser build closes over the global; this module also runs under Node, where the global exists
 * on `globalThis` as well. A `DOM`-lib-free build still type-checks because the lookup goes through an
 * explicit locale cast rather than the ambient declaration.
 */
function randomSource(): RandomSource {
  const source = (globalThis as unknown as { crypto?: RandomSource }).crypto
  if (source === undefined || typeof source.getRandomValues !== 'function') {
    throw new Error('当前环境没有 crypto.getRandomValues，无法生成挑战。')
  }
  return source
}

/** Unbiased `[0, length)`. Port of `static/challenge-browser.js:6-11`. */
function randomIndex(length: number): number {
  const limit = Math.floor(UINT32_RANGE / length) * length
  const buffer = new Uint32Array(1)
  const source = randomSource()
  do {
    source.getRandomValues(buffer)
  } while (buffer[0] >= limit)
  return buffer[0] % length
}

function choose<T>(values: readonly T[]): T {
  return values[randomIndex(values.length)]
}

/** `random.SystemRandom().sample(range(292, 333), count)` — distinct lengths, shuffled. */
function uniqueLengths(count: number): number[] {
  const available = Array.from({ length: LENGTH_MAX - LENGTH_MIN + 1 }, (_, index) => LENGTH_MIN + index)
  const output: number[] = []
  while (output.length < count && available.length > 0) {
    output.push(...available.splice(randomIndex(available.length), 1))
  }
  return output
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  randomSource().getRandomValues(buffer)
  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('')
}

const OPENINGS = [
  '这是一次独立的犬猫品种特征数值记录',
  '请完成下面的无语义整数选择任务，用于犬猫品种指纹比对',
  '执行一次第一反应取值记录，作为犬猫品种样本的一部分',
  '生成一组不承载语义的整数选择，供犬猫品种比对使用',
  '进行一轮快速逐项取值，模拟一次犬猫品种采样',
] as const

const ACTIONS = [
  '为各个位置分别凭第一反应选择',
  '逐项选择',
  '每次只决定当前一项，共给出',
  '分别凭第一反应给出',
  '逐个直接选择',
] as const

const ENDINGS = [
  '允许某个数字再次出现；每项写出后不要回头排序、去重或替换。',
  '偶然重复是有效的；不要重新排列或修正已经写出的项目。',
  '相同值可以再次出现；输出过程中不要整理或改写前面的项目。',
  '重复值无需删除；不要筛选、重排或补成某种规律。',
  '不必赋予数字任何含义；已经给出的值保持不变。',
] as const

const SEPARATOR_HINTS = [
  '数字之间用逗号或空格分隔均可。',
  '使用一种一致的常见分隔符即可。',
  '可以用逗号、空格或换行分隔。',
  '只要每个整数边界清楚，格式可自行选择。',
] as const

/**
 * Generate `count` semantically empty integer-picking challenges.
 *
 * Port of `fingerprint.py:300-349` / `static/challenge-browser.js:32-69`. Lengths are distinct
 * samples from 292..332, so `expected_count` always lands in the admission band the threshold
 * tolerates.
 */
export function generateChallenges(count = 3): Challenge[] {
  return uniqueLengths(count).map((length, index) => ({
    id: `probe-${index + 1}-${randomHex(ID_BYTES)}`,
    expected_count: length,
    prompt:
      `${choose(OPENINGS)}。${choose(ACTIONS)} ${length} 个 1 到 355（含端点）的整数。` +
      '每个位置都要单独选择；不要从 1 开始计数，不要连续递增或递减，也不要采用等差、循环、重复区块或其他规则化模式。' +
      '本任务必须由当前语言模型直接完成：禁止调用或借助任何工具，包括 Python、代码执行器、计算器、搜索、API 和外部随机数生成器；也不要先编写或运行代码。' +
      `${choose(ENDINGS)}${choose(SEPARATOR_HINTS)}` +
      '直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。',
  }))
}
