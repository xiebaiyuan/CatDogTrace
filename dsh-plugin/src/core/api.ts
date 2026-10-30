/**
 * Core seam: the only surface the client UI may import.
 *
 * Lead wrote this file as the frozen contract between the two halves of the plugin.
 * `plugin-core` owns it from here: extend freely, never rename or reshape an existing field —
 * the UI is written against these exact names, and the field names mirror
 * `fingerprint.py`'s frozen result keys (`fingerprint.py:284-297`, `fingerprint.py:215-229`).
 *
 * Why these names and not prettier ones: the repo already ships a Python result shape and a
 * browser result shape that agree field-for-field (`static/fingerprint-core.js`). A third
 * vocabulary in the plugin would make "same thing, three spellings" — GLOSSARY.md's whole
 * complaint about this repo. Keep the wire names.
 */

/** Inclusive lower bound of the value domain. Pinned by `fingerprint.py:10`. */
export const VALUE_MIN = 1

/** Inclusive upper bound of the value domain. Pinned by `fingerprint.py:11`. */
export const VALUE_MAX = 355

/** Width of the count histogram. Pinned by `fingerprint.py:21`. */
export const DIMENSION = VALUE_MAX - VALUE_MIN + 1

/** Laplace smoothing added to every histogram bin. Pinned by `fingerprint.py:22`. */
export const ALPHA = 0.5

/** Weight of the ordered-block score inside the fused score. Pinned by `fingerprint.py:23`. */
export const ORDERED_BLOCK_WEIGHT = 0.25

/** An opaque loaded fingerprint bank. Only `loadBank`/`loadBankChunk` mint one; the UI never reads inside. */
export type Bank = unknown

/** One generated challenge. `expected_count` must travel with the prompt or the admission threshold drifts. */
export interface Challenge {
  id: string
  expected_count: number
  prompt: string
}

/**
 * One pasted answer.
 *
 * `expected_count` is what sets the admission threshold `max(80, ceil(expected_count * 0.55))`
 * (`fingerprint.py:239-241`). Omit it and the threshold collapses to a flat 80, which accepts
 * truncated answers that a real challenge would reject. Always bind it to the challenge.
 */
export interface InputOutput {
  text: string
  expected_count?: number
}

/** The two breed families. `bank.models[].family` carries this same vocabulary. */
export type FamilyId = 'dog' | 'cat'

/** One breed's attribution result. Sorted by `probability` descending in `AnalysisResult.results`. */
export interface BreedResult {
  model: string
  display_name: string
  /** Global softmax share. `GLOSSARY.md` calls this 「归因概率」. */
  probability: number
  /** Display-only JS similarity of pooled counts. Never feeds `probability` (`fingerprint.py:277`). */
  profile_similarity: number
  score: number
  nuisance_score: number
  family: FamilyId
  family_name: string
  /** Share inside its own family. `GLOSSARY.md` calls this 「族内条件概率」. */
  conditional_probability: number
}

/** Per-input admission record. A rejected input still appears here, with `accepted: false`. */
export interface Diagnostic {
  index: number
  parsed_numbers: number
  minimum_numbers: number
  accepted: boolean
}

/** One family's summed share. `GLOSSARY.md` calls this 「品种族概率」. */
export interface FamilyProbability {
  family: FamilyId
  display_name: string
  probability: number
}

/** The full frozen result. Field names are the contract; do not translate them. */
export interface AnalysisResult {
  prediction: string
  prediction_name: string
  probability: number
  used_outputs: number
  results: BreedResult[]
  diagnostics: Diagnostic[]
  calibration: {
    queries: string
    beta: number
    cv_accuracy: number
  }
  method: string
  family_prediction: FamilyId
  family_prediction_name: string
  family_probability: number
  family_probabilities: FamilyProbability[]
}

/** Fallback family labels when the bank carries no `family_name`. Mirrors `fingerprint.py:25`. */
export const FAMILY_DISPLAY_NAMES: Record<FamilyId, string> = { dog: '犬族', cat: '猫族' }

/**
 * The part of the bank the algorithm actually reads.
 *
 * `Bank` stays `unknown` on purpose — the UI never reaches inside. This interface exists for the
 * core module and the parity tests; it is not a promise that the JSON has nothing else in it.
 */
export interface BankModel {
  id: string
  display_name: string
  /** `fingerprint.py:31-32` groups by this; a bank without it collapses into one `"models"` family. */
  family?: string
  family_name?: string
  /** 355-bin training histogram. Feeds `profile_similarity` only (`fingerprint.py:277`). */
  counts: number[]
}

/** One calibrated temperature, keyed by the number of accepted answers (`"1"`..`"3"`). */
export interface BankCalibration {
  beta: number
  cv_accuracy: number
}

/** The readable view of `data/unified_bank.json`. */
export interface BankDocument {
  models: BankModel[]
  calibration: Record<string, BankCalibration>
  method?: { name?: string }
  robust: {
    hellinger: {
      feature_mean: number[]
      feature_scale: number[]
      nuisance_basis: number[][]
      centroids: number[][]
    }
    ordered_blocks?: {
      weight?: number
      feature_mean: number[]
      feature_scale: number[]
      nuisance_basis: number[][]
      centroids: number[][]
      environment_centroids: number[][][]
    }
  }
}
