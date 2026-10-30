/**
 * The overlay's pure half.
 *
 * Everything here is a plain function so the three behaviours that are easy to get subtly wrong —
 * binding each answer to its own challenge threshold, the JSON pass-through schema, and carrying the
 * core's Chinese error text through untouched — are unit-tested without a DOM or a browser.
 *
 * Field names come from `../core` and are not renamed here: `expected_count` is the wire name that
 * sets the admission threshold `max(80, ceil(expected_count * 0.55))`.
 */

import type { AnalysisResult, Challenge, Diagnostic, FamilyId, FamilyProbability, InputOutput } from '../core'

/**
 * Shown whenever an answer travels without a challenge to bind its threshold to.
 *
 * Not a warning to swallow: a bare answer gets the flat 80 floor, which accepts truncated output a
 * real challenge would reject. The user has to see that the number they are looking at was produced
 * under a weaker gate.
 */
export const DEFAULT_THRESHOLD_NOTICE = '有回答没绑定挑战，门槛按 80 算。'

export interface JudgeInputs {
  outputs: InputOutput[]
  /** True when at least one non-empty answer had no challenge at its index. */
  unboundThreshold: boolean
}

/**
 * Pair the three answer boxes with the three challenges.
 *
 * The index is the binding: answer box `i` belongs to challenge `i`, so its `expected_count` rides
 * along. Empty boxes are dropped rather than sent as empty text — the core would reject them and the
 * diagnostics would fill with rows the user never wrote.
 */
export function buildJudgeInputs(answers: readonly string[], challenges: readonly Challenge[]): JudgeInputs {
  const outputs: InputOutput[] = []
  let unboundThreshold = false
  for (const [index, text] of answers.entries()) {
    if (text.trim() === '') continue
    const expected_count = challenges[index]?.expected_count
    if (expected_count === undefined) {
      unboundThreshold = true
      outputs.push({ text })
      continue
    }
    outputs.push({ text, expected_count })
  }
  return { outputs, unboundThreshold }
}

export type PayloadParse =
  | { ok: true; outputs: InputOutput[]; unboundThreshold: boolean }
  | { ok: false; error: string }

/**
 * Parse the collapsed paste-JSON box.
 *
 * The accepted shape is `{"outputs":[{"text":"...","expected_count":218}]}` — the same body
 * `app.py:101-112` takes, so a payload copied out of the Flask version's network tab works here
 * unchanged. `expected_count` stays optional because the wire schema makes it optional; dropping it
 * only weakens the threshold, and the caller says so.
 */
export function parseJsonPayload(raw: string): PayloadParse {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, error: '还没有粘贴 JSON。' }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${errorMessage(error)}` }
  }

  const outputs = parsed !== null && typeof parsed === 'object'
    ? (parsed as { outputs?: unknown }).outputs
    : undefined
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return { ok: false, error: '缺少 outputs：需要至少一条 {"text": "...", "expected_count": 218}。' }
  }

  const collected: InputOutput[] = []
  let unboundThreshold = false
  for (const [index, entry] of outputs.entries()) {
    if (entry === null || typeof entry !== 'object') {
      return { ok: false, error: `outputs[${index}] 不是对象。` }
    }
    const { text, expected_count } = entry as { text?: unknown; expected_count?: unknown }
    if (typeof text !== 'string') {
      return { ok: false, error: `outputs[${index}].text 必须是字符串。` }
    }
    if (expected_count === undefined || expected_count === null) {
      unboundThreshold = true
      collected.push({ text })
      continue
    }
    if (typeof expected_count !== 'number' || !Number.isFinite(expected_count)) {
      return { ok: false, error: `outputs[${index}].expected_count 必须是数字。` }
    }
    collected.push({ text, expected_count })
  }
  return { ok: true, outputs: collected, unboundThreshold }
}

/**
 * The message an unknown throw carries.
 *
 * The core throws `Error` with a Chinese sentence ("没有可用回答：…"); showing it verbatim is the
 * point — a rewritten wrapper would hide which gate rejected the input.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  // An Error with an empty message stringifies to "Error", which is not something to show anyone.
  if (error instanceof Error) return '判定失败，原因不明。'
  const text = typeof error === 'string' ? error : String(error)
  return text === '' || text === 'undefined' || text === 'null' ? '判定失败，原因不明。' : text
}

/** Hitting a rejected-with-everything-input case: state it once, in the user's language. */
export const NO_INPUT_MESSAGE = '没有可用回答：三个框和 JSON 区都是空的。'

export function percent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'
}

/** Bar width for a probability, clamped so a rounding artifact cannot overflow the track. */
export function barWidth(value: number): string {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  return `${(clamped * 100).toFixed(2)}%`
}

const FAMILY_ORDER: readonly FamilyId[] = ['dog', 'cat']

/** Family shares in a stable dog-then-cat order, so the two bars never swap places between runs. */
export function familyBars(result: Pick<AnalysisResult, 'family_probabilities'>): FamilyProbability[] {
  const bars: FamilyProbability[] = []
  for (const family of FAMILY_ORDER) {
    const found = result.family_probabilities.find(entry => entry.family === family)
    if (found !== undefined) bars.push(found)
  }
  return bars
}

/** The 24-breed ranking, descending by global share. The core already sorts; this keeps the promise local. */
export function rankedResults<T extends { probability: number }>(results: readonly T[]): T[] {
  return [...results].sort((left, right) => right.probability - left.probability)
}

/** Inputs the core rejected, for the diagnostics block. A rejected input still appears in `diagnostics`. */
export function rejectedDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(entry => !entry.accepted)
}
