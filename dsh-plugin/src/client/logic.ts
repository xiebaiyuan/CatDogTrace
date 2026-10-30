/**
 * The panel's pure half: the three-segment state machine and every string the UI shows.
 *
 * Everything here is a plain function over plain data, so the behaviours that are easy to get wrong —
 * one paste advancing one slot, undo, restart, when the judge button may fire, and how the threshold
 * is stated in the two modes — are unit-tested without a DOM and without the 700KB bank.
 *
 * Numbers are counted with the core's own `parseNumbers`, never a local `\d+` scan: the core keeps the
 * LONGEST letter-separated run and drops out-of-range values, so a local count would report a number
 * the judge never sees and the progress line would lie.
 */

import {
  VALUE_MAX,
  VALUE_MIN,
  parseNumbers,
  type AnalysisResult,
  type Challenge,
  type Diagnostic,
  type FamilyId,
  type FamilyProbability,
  type InputOutput,
} from '../core'

/** The spec fixes three challenges and three answer segments. */
export const SEGMENTS_REQUIRED = 3

/** Admission floor; a segment below it is still collected, the core rejects it with a reason. */
export const MINIMUM_NUMBERS = 80

/** `fingerprint.py:241`'s ratio. Kept in sync with `core/analyze.ts` by a test against the real bank. */
export const EXPECTED_COUNT_RATIO = 0.55

/**
 * The admission threshold for one segment.
 *
 * This is the same `max(80, ceil(expected_count * 0.55))` the core applies (`core/analyze.ts:103`).
 * The core does not export it, so the formula lives here too — and `artifact.test.ts` pins the two
 * together: it runs the real bank through `analyzeGlobalOutputs` and asserts the core's reported
 * `minimum_numbers` equals this function's answer, so changing one side alone turns the suite red.
 */
export function minimumNumbers(expectedCount?: number): number {
  const expected = typeof expectedCount === 'number' && Number.isFinite(expectedCount) && expectedCount > 0
    ? expectedCount
    : 0
  if (expected === 0) return MINIMUM_NUMBERS
  return Math.max(MINIMUM_NUMBERS, Math.ceil(expected * EXPECTED_COUNT_RATIO))
}

/** One collected paste. */
export interface Segment {
  /** The pasted text, kept verbatim: the core re-parses it, and a trimmed copy would drift. */
  text: string
  /** In-range numbers in the longest run — what the core will actually score. */
  numbers: number
  /** The challenge this slot belongs to, absent in bare-text mode. */
  expected_count?: number
  threshold: number
  /** `numbers >= threshold`. Display only: the core re-decides and its diagnostics win. */
  accepted: boolean
  /** One paste longer than two answers: warned about, never split. */
  looksMerged: boolean
}

export function makeSegment(text: string, challenge: Challenge | undefined): Segment {
  const numbers = parseNumbers(text).length
  const expected_count = challenge?.expected_count
  const threshold = minimumNumbers(expected_count)
  return {
    text,
    numbers,
    ...(expected_count === undefined ? {} : { expected_count }),
    threshold,
    accepted: numbers >= threshold,
    looksMerged: numbers >= threshold * 2,
  }
}

export type BankPhase = 'loading' | 'ready' | 'failed'

/** The whole panel state for one session. Immutable: every transition returns a new object. */
export interface PanelState {
  challenges: Challenge[]
  segments: Segment[]
  /** The single paste box. Kept in the store so a tab switch cannot eat half-typed text. */
  draft: string
  /** The collapsed JSON passthrough; non-empty wins over the segments. */
  payload: string
  result: AnalysisResult | null
  failure: string | null
  notice: string | null
  bank: BankPhase
  bankError: string | null
  /** How many breeds the loaded bank carries; `null` until it arrives. */
  modelCount: number | null
}

export function emptyPanelState(): PanelState {
  return {
    challenges: [],
    segments: [],
    draft: '',
    payload: '',
    result: null,
    failure: null,
    notice: null,
    bank: 'loading',
    bankError: null,
    modelCount: null,
  }
}

/** Messages in one place, so tests assert prose instead of re-deriving it. */
export const TEXT = {
  bareText: '没出题：每段门槛按 80 算。',
  merged: '这段看起来是多次回复拼在一起的，要不要撤回后分段贴？',
  full: '三段已收满，可以判定了。',
  draftEmpty: '先粘贴一段再收。',
  noInput: '没有可用回答：三段和 JSON 区都是空的。',
  jsonWins: 'JSON 区非空，判定会用 JSON，忽略已收的三段。',
} as const

/** How many more segments the judge needs. */
export function missingSegments(state: PanelState): number {
  return Math.max(0, SEGMENTS_REQUIRED - state.segments.length)
}

/** `第 2/3 段 · 已收 2/3` */
export function progressLabel(state: PanelState): string {
  const slot = Math.min(state.segments.length + 1, SEGMENTS_REQUIRED)
  return `第 ${slot}/${SEGMENTS_REQUIRED} 段 · 已收 ${state.segments.length}/${SEGMENTS_REQUIRED}`
}

/** `已收 292 个数字，门槛 161 ✓` */
export function segmentSummary(segment: Segment): string {
  const mark = segment.accepted ? '✓' : '✗'
  return `已收 ${segment.numbers} 个数字，门槛 ${segment.threshold} ${mark}`
}

/** Why the judge button is enabled or not, in one sentence. */
export function judgeHint(state: PanelState): string {
  if (state.payload.trim() !== '') return TEXT.jsonWins
  const missing = missingSegments(state)
  if (missing > 0) return `还差 ${missing} 段才能判定。`
  return TEXT.full
}

export function canJudge(state: PanelState): boolean {
  return state.payload.trim() !== '' || missingSegments(state) === 0
}

/** Append a drawn challenge set and drop everything that belonged to the previous one. */
export function withChallenges(state: PanelState, challenges: Challenge[]): PanelState {
  return {
    ...state,
    challenges,
    segments: [],
    draft: '',
    payload: '',
    result: null,
    failure: null,
    notice: null,
  }
}

export function withDraft(state: PanelState, draft: string): PanelState {
  return { ...state, draft }
}

export function withPayload(state: PanelState, payload: string): PanelState {
  return { ...state, payload }
}

export function withBank(
  state: PanelState,
  bank: BankPhase,
  bankError: string | null = null,
  modelCount: number | null = null,
): PanelState {
  return { ...state, bank, bankError, modelCount }
}

/** The loaded bank's own breed count, so the status line cannot claim a number the bank does not have. */
export function bankStatusText(state: PanelState): string {
  if (state.bank === 'loading') return '指纹库加载中…'
  if (state.bank === 'failed') return '指纹库加载失败'
  return state.modelCount === null ? '指纹库已就绪' : `指纹库已就绪：${state.modelCount} 个品种`
}

/**
 * Take the draft as the next segment.
 *
 * Refuses when the draft is blank or all three slots are full — both are user mistakes worth a
 * sentence, not a silent no-op. The merged-paste warning is set here so the progress line carries it
 * immediately; the text is NEVER split, because a wrong split yields a wrong percentage, which is the
 * exact mistake this repository exists to make fun of.
 */
export function commitDraft(state: PanelState): PanelState {
  const text = state.draft
  if (text.trim() === '') return { ...state, notice: TEXT.draftEmpty }
  if (state.segments.length >= SEGMENTS_REQUIRED) return { ...state, notice: TEXT.full }
  const segment = makeSegment(text, state.challenges[state.segments.length])
  return {
    ...state,
    segments: [...state.segments, segment],
    draft: '',
    result: null,
    failure: null,
    notice: segment.looksMerged ? TEXT.merged : null,
  }
}

/** Put the last segment back into the box: the user can re-paste it split, or edit it. */
export function undoSegment(state: PanelState): PanelState {
  const last = state.segments[state.segments.length - 1]
  if (last === undefined) return state
  return {
    ...state,
    segments: state.segments.slice(0, -1),
    draft: last.text,
    result: null,
    failure: null,
    notice: null,
  }
}

/** How many values one full turn of the domain holds: 355. */
const VALUE_SPAN = VALUE_MAX - VALUE_MIN + 1

/** 2^32, the width of one sampled word. */
const WORD_SPAN = 0x1_0000_0000

/**
 * The largest word a uniform mapping can use: everything below it divides evenly into the domain, so
 * `word % VALUE_SPAN` stays uniform. Same rejection idea as `static/challenge-browser.js`'s
 * `randomIndex`, applied to a batch instead of one word per draw.
 */
const SAMPLE_LIMIT = Math.floor(WORD_SPAN / VALUE_SPAN) * VALUE_SPAN

/** The default source: the platform CSPRNG. Never `Math.random()` — see `randomNumbers`. */
function secureWords(length: number): Uint32Array {
  const words = new Uint32Array(length)
  crypto.getRandomValues(words)
  return words
}

/**
 * `count` uniform integers in `[VALUE_MIN, VALUE_MAX]`.
 *
 * Why `crypto.getRandomValues` and rejection sampling, when the shipped web page uses `Math.random()`:
 * this tool's control group IS "uniform random integers", so a generator with a bias or a guessable
 * stream makes the comparison meaningless. `Math.random()` guarantees neither. The rejection exists
 * because 355 does not divide 2^32: mapping every word with `% 355` would favour the low end.
 *
 * `words` is injectable so tests can pin the mapping without pinning the entropy.
 */
export function randomNumbers(
  count: number,
  words: (length: number) => ArrayLike<number> = secureWords,
): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`随机填充需要非负整数长度，收到 ${String(count)}`)
  }
  const values: number[] = []
  while (values.length < count) {
    const batch = words(count - values.length)
    if (batch.length === 0) throw new Error('随机源没有返回任何样本')
    for (let index = 0; index < batch.length; index += 1) {
      const word = batch[index]
      if (!Number.isInteger(word) || word < 0 || word >= WORD_SPAN) {
        throw new Error(`随机源返回了越界样本 ${String(word)}`)
      }
      if (word >= SAMPLE_LIMIT) continue
      values.push((word % VALUE_SPAN) + VALUE_MIN)
      if (values.length === count) break
    }
  }
  return values
}

/** One answer of `expectedCount` random integers, in the shape the paste box takes. */
export function randomAnswer(expectedCount: number, words?: (length: number) => ArrayLike<number>): string {
  return randomNumbers(expectedCount, words).join(' ')
}

/**
 * Fill every still-empty slot with a random answer, through the ordinary `commitDraft` transition.
 *
 * Going through the state machine (rather than writing a finished result) is what keeps the progress
 * line, the per-segment threshold marks, undo, and the merged-paste warning honest: a random answer is
 * just an answer, and it is judged by exactly the same gate.
 *
 * A non-empty JSON box is cleared first: it outranks the segments, so leaving it would make the three
 * random answers decorative while the judge quietly used the pasted payload instead.
 */
export function withRandomAnswers(
  state: PanelState,
  answer: (expectedCount: number) => string = randomAnswer,
): PanelState {
  let next = state.payload === '' ? state : withPayload(state, '')
  for (let index = 0; index < SEGMENTS_REQUIRED; index += 1) {
    if (next.segments.length > index) continue
    const expected = next.challenges[index]?.expected_count
    if (expected === undefined) break
    next = commitDraft(withDraft(next, answer(expected)))
  }
  return next
}

/** Clear the three segments and the result. The drawn challenges stay: re-drawing invalidates them. */
export function restart(state: PanelState): PanelState {
  return {
    ...state,
    segments: [],
    draft: '',
    payload: '',
    result: null,
    failure: null,
    notice: null,
  }
}

export function withResult(state: PanelState, result: AnalysisResult): PanelState {
  return { ...state, result, failure: null }
}

export function withFailure(state: PanelState, failure: string): PanelState {
  return { ...state, failure, result: null }
}

export type JudgeSource = 'json' | 'segments'

export type JudgePlan =
  | { ready: true; source: JudgeSource; outputs: InputOutput[] }
  | { ready: false; message: string }

/**
 * What 「判定」 will send.
 *
 * A non-empty JSON box wins outright (it is the Flask version's own request body), so the three
 * collected segments are ignored while it holds text — saying so is part of the plan.
 */
export function planJudge(state: PanelState): JudgePlan {
  if (state.payload.trim() !== '') {
    const parsed = parseJsonPayload(state.payload)
    if (!parsed.ok) return { ready: false, message: parsed.error }
    return { ready: true, source: 'json', outputs: parsed.outputs }
  }
  if (missingSegments(state) > 0) {
    return { ready: false, message: `还差 ${missingSegments(state)} 段才能判定。` }
  }
  const outputs: InputOutput[] = state.segments.map((segment) => (segment.expected_count === undefined
    ? { text: segment.text }
    : { text: segment.text, expected_count: segment.expected_count }))
  if (outputs.length === 0) return { ready: false, message: TEXT.noInput }
  return { ready: true, source: 'segments', outputs }
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
