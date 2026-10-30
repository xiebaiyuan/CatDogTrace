/**
 * Core public surface. The client half imports from here and nowhere else under `src/core/`.
 *
 * Types and constants are re-exported from `./api` (the frozen contract). The functions are the
 * TypeScript port of `static/fingerprint-core.js` + `static/challenge-browser.js`, whose numeric
 * truth is `fingerprint.py`.
 *
 * `loadBankChunk` is the only place the 1.2MB bank is reachable, and it reaches it with a dynamic
 * `import()` so the bundler can split it out. A top-level import here would pull the whole bank into
 * whichever bundle imports this module — the thing the chunk exists to prevent.
 */

import type { Bank } from './api'
import { assertBankDocument } from './bank'

export type {
  AnalysisResult,
  Bank,
  BankCalibration,
  BankDocument,
  BankModel,
  BreedResult,
  Challenge,
  Diagnostic,
  FamilyId,
  FamilyProbability,
  InputOutput,
} from './api'

export {
  ALPHA,
  DIMENSION,
  FAMILY_DISPLAY_NAMES,
  ORDERED_BLOCK_WEIGHT,
  VALUE_MAX,
  VALUE_MIN,
} from './api'

export { assertBankDocument, EMPTY_BANK_MESSAGE, loadBank } from './bank'
export { analyzeGlobalOutputs, analyzeOutputs, NO_USABLE_ANSWER_MESSAGE } from './analyze'
export type { AnalysisWithoutFamily, BreedScore } from './analyze'
export { generateChallenges } from './challenges'
export {
  countNumbers,
  hellingerFeature,
  jsSimilarity,
  orderedBlockFeature,
  orderedBlockScores,
  parseNumbers,
  robustScoreCounts,
  robustScoreNumbers,
  softmax,
} from './features'
export type { MarginalScores, ResponseScores } from './features'

let bankChunk: Promise<Bank> | undefined

/**
 * Load the fingerprint bank on first use and reuse the same promise afterwards.
 *
 * The dynamic `import()` is load-bearing: it is what keeps `unified_bank.ts` in its own chunk instead
 * of inside `lib/client.js`. Do not "simplify" this into a static import.
 */
export function loadBankChunk(): Promise<Bank> {
  bankChunk ??= import('./bank/unified_bank').then((module) => assertBankDocument(module.default))
  return bankChunk
}
