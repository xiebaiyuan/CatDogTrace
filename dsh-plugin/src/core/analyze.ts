/**
 * Attribution: the port of `analyze_outputs` / `analyze_global_outputs`.
 *
 * `fingerprint.py:232-297` and `:176-229` are the numeric truth; `static/fingerprint-core.js:174-252`
 * is the browser twin this was ported from. Two deliberate differences from the browser file, both
 * noted where they happen: `assertBankDocument` on entry, and the family-name lookup picking the
 * first member that *has* a `family_name` (Python's `next(...)`), not just the first member.
 */

import type {
  AnalysisResult,
  Bank,
  BreedResult,
  Diagnostic,
  FamilyId,
  FamilyProbability,
  InputOutput,
} from './api'
import { DIMENSION, FAMILY_DISPLAY_NAMES } from './api'
import { assertBankDocument } from './bank'
import { countNumbers, jsSimilarity, parseNumbers, robustScoreNumbers, softmax } from './features'
import type { ResponseScores } from './features'

/** Hard admission floor: a truncated answer shorter than this never counts (`fingerprint.py:241`). */
const MINIMUM_NUMBERS = 80

/** Answers are scored against a `max(80, ceil(expected_count * 0.55))` threshold (`fingerprint.py:241`). */
const EXPECTED_COUNT_RATIO = 0.55

/** Same string the Python implementation raises, so the UI can show it untranslated. */
export const NO_USABLE_ANSWER_MESSAGE = '没有可用回答：请粘贴完整数字序列；拒答或严重截断的回答不会计入。'

/** Family label used when a bank model carries no `family` (`fingerprint.py:183`). */
const UNFAMILIAR_FAMILY = 'models'

/** One breed's result before family aggregation fills in. */
export interface BreedScore {
  model: string
  display_name: string
  probability: number
  profile_similarity: number
  score: number
  nuisance_score: number
}

/** `analyzeOutputs` result: everything `AnalysisResult` has except the family fields. */
export interface AnalysisWithoutFamily {
  prediction: string
  prediction_name: string
  probability: number
  used_outputs: number
  results: BreedScore[]
  diagnostics: Diagnostic[]
  calibration: {
    queries: string
    beta: number
    cv_accuracy: number
  }
  method: string
}

interface ScoredAnswer {
  counts: number[]
  scores: ResponseScores
}

function mean(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total / values.length
}

/** `int(item.get("expected_count") or 0)` — `fingerprint.py:239`. */
function expectedCount(raw: InputOutput): number {
  const value = Number(raw.expected_count ?? 0)
  if (!Number.isFinite(value)) return 0
  return Math.trunc(value)
}

function familyOf(model: { family?: string }): string {
  return model.family || UNFAMILIAR_FAMILY
}

function fallbackFamilyName(family: string): string | undefined {
  return (FAMILY_DISPLAY_NAMES as Record<string, string>)[family]
}

/**
 * Fuse several answers into one attribution. Response-level z-scores are averaged, then scaled by the
 * calibrated temperature for the accepted-answer count and pushed through a softmax.
 * Port of `fingerprint.py:232-297`.
 */
export function analyzeOutputs(outputs: InputOutput[], bank: Bank): AnalysisWithoutFamily {
  const document = assertBankDocument(bank)
  const modelIds = document.models.map((model) => model.id)
  const modelEntries = new Map(document.models.map((model) => [model.id, model]))

  const valid: ScoredAnswer[] = []
  const diagnostics: Diagnostic[] = []
  outputs.forEach((item, index) => {
    const expected = expectedCount(item)
    const numbers = parseNumbers(item.text ?? '')
    const minimum = expected ? Math.max(MINIMUM_NUMBERS, Math.ceil(expected * EXPECTED_COUNT_RATIO)) : MINIMUM_NUMBERS
    const accepted = numbers.length >= minimum
    diagnostics.push({ index, parsed_numbers: numbers.length, minimum_numbers: minimum, accepted })
    if (accepted) valid.push({ counts: countNumbers(numbers), scores: robustScoreNumbers(numbers, document) })
  })

  if (valid.length === 0) throw new Error(NO_USABLE_ANSWER_MESSAGE)

  const combinedScores = modelIds.map((_, modelIndex) => mean(valid.map((item) => item.scores.fused[modelIndex])))
  const combinedNuisance = modelIds.map((_, modelIndex) => mean(valid.map((item) => item.scores.nuisance[modelIndex])))
  const calibrationKey = String(Math.min(valid.length, 3))
  const calibration = document.calibration[calibrationKey]
  if (calibration === undefined) throw new Error(`指纹库缺少 calibration["${calibrationKey}"]。`)
  const beta = Number(calibration.beta)
  const probabilities = softmax(combinedScores.map((value) => beta * value))
  const pooledCounts = Array.from({ length: DIMENSION }, (_, index) =>
    valid.reduce((sum, item) => sum + item.counts[index], 0),
  )

  const results = modelIds
    .map((model, index): BreedScore => {
      const entry = modelEntries.get(model)
      if (entry === undefined) throw new Error(`指纹库缺少品种 ${model} 的条目。`)
      return {
        model,
        display_name: entry.display_name,
        probability: probabilities[index],
        profile_similarity: jsSimilarity(pooledCounts, entry.counts),
        score: combinedScores[index],
        nuisance_score: combinedNuisance[index],
      }
    })
    .sort((left, right) => right.probability - left.probability)

  return {
    prediction: results[0].model,
    prediction_name: results[0].display_name,
    probability: results[0].probability,
    used_outputs: valid.length,
    results,
    diagnostics,
    calibration: { queries: calibrationKey, beta, cv_accuracy: Number(calibration.cv_accuracy) },
    method: document.method?.name || 'Ordered-block + nuisance-Hellinger',
  }
}

/**
 * `analyzeOutputs` plus family aggregation: a family's probability is the sum of its members'.
 * Port of `fingerprint.py:176-229`.
 */
export function analyzeGlobalOutputs(outputs: InputOutput[], bank: Bank): AnalysisResult {
  const document = assertBankDocument(bank)
  const base = analyzeOutputs(outputs, document)
  const modelEntries = new Map(document.models.map((model) => [model.id, model]))

  // `dict.fromkeys(...)`: first-seen order, no repeats.
  const familyOrder: string[] = []
  for (const model of document.models) {
    const family = familyOf(model)
    if (!familyOrder.includes(family)) familyOrder.push(family)
  }

  // Python takes the first member *with* a family_name (`fingerprint.py:186-197`); the browser file
  // takes the first member and falls back if it happens to have none. Identical on this bank — every
  // model carries a family_name — but Python's rule is the one that cannot silently lose a label.
  const familyNames: Record<string, string> = {}
  for (const family of familyOrder) {
    const owner = document.models.find((model) => familyOf(model) === family && model.family_name)
    familyNames[family] = owner?.family_name || fallbackFamilyName(family) || family
  }

  // Accumulate in sorted-results order, the same order the Python sum sees.
  const familyProbabilities: Record<string, number> = {}
  for (const family of familyOrder) familyProbabilities[family] = 0
  for (const item of base.results) {
    const entry = modelEntries.get(item.model)
    if (entry === undefined) throw new Error(`指纹库缺少品种 ${item.model} 的条目。`)
    const family = familyOf(entry)
    familyProbabilities[family] += item.probability
  }

  const results: BreedResult[] = base.results.map((item) => {
    const entry = modelEntries.get(item.model)
    if (entry === undefined) throw new Error(`指纹库缺少品种 ${item.model} 的条目。`)
    const family = familyOf(entry)
    return {
      ...item,
      family: family as FamilyId,
      family_name: familyNames[family],
      conditional_probability: item.probability / familyProbabilities[family],
    }
  })

  // `max(family_order, key=...)` keeps the first maximum; a strict `>` does the same.
  let winningFamily = familyOrder[0]
  for (const family of familyOrder) {
    if (familyProbabilities[family] > familyProbabilities[winningFamily]) winningFamily = family
  }

  const familyProbabilitiesList: FamilyProbability[] = familyOrder.map((family) => ({
    family: family as FamilyId,
    display_name: familyNames[family],
    probability: familyProbabilities[family],
  }))

  return {
    ...base,
    results,
    family_prediction: winningFamily as FamilyId,
    family_prediction_name: familyNames[winningFamily],
    family_probability: familyProbabilities[winningFamily],
    family_probabilities: familyProbabilitiesList,
    method: '统一全局稳健数字指纹',
  }
}
