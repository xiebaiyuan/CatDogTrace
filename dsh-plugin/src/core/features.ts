/**
 * Numeric kernels: the browser port of `static/fingerprint-core.js`, which in turn mirrors
 * `fingerprint.py` function for function.
 *
 * Where the browser file and the Python file disagree, this module follows Python — `fingerprint.py`
 * is the only numeric source of truth in this repo (`SPEC.md §4`). The one such case is noted on
 * `robustScoreCounts`.
 *
 * Nothing here imports the 1.2MB bank: these are pure functions over already-loaded artifacts.
 */

import { ALPHA, DIMENSION, VALUE_MAX, VALUE_MIN } from './api'
import type { BankDocument } from './api'

/** Number of value-range buckets per positional block. `fingerprint.py:74` (`bins=16`). */
const BLOCK_BINS = 16

/** Number of positional blocks. `np.array_split(values, 4)`, `fingerprint.py:73`. */
const BLOCKS = 4

/** Number of last-digit buckets. `fingerprint.py:77`. */
const LAST_DIGITS = 10

/**
 * Longest digit run, letter separators break runs, values outside 1..355 are dropped.
 * Port of `fingerprint.py:28-44` / `static/fingerprint-core.js:15-31`.
 *
 * A letters-only separator does *not* break a run when nothing has been collected yet, which is why
 * the `current.length > 0` guard is here and not folded into the test.
 */
export function parseNumbers(text: string): number[] {
  const source = String(text)
  const digitRun = /\d+/g
  const letter = /\p{L}/u
  const runs: number[][] = []
  let current: number[] = []
  let previousEnd = 0
  let match = digitRun.exec(source)
  while (match !== null) {
    const separator = source.slice(previousEnd, match.index)
    const value = Number(match[0])
    if (current.length > 0 && letter.test(separator)) {
      runs.push(current)
      current = []
    }
    if (value >= VALUE_MIN && value <= VALUE_MAX) current.push(value)
    previousEnd = match.index + match[0].length
    match = digitRun.exec(source)
  }
  if (current.length > 0) runs.push(current)

  // `max(runs, key=len)` keeps the first longest run; the manual loop does the same.
  let longest: number[] = []
  for (const run of runs) {
    if (run.length > longest.length) longest = run
  }
  return longest
}

/** 355-bin count histogram, index = value - VALUE_MIN. Port of `fingerprint.py:47-52`. */
export function countNumbers(numbers: number[]): number[] {
  const counts = new Array<number>(DIMENSION).fill(0)
  for (const number of numbers) counts[number - VALUE_MIN] += 1
  return counts
}

function mean(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total / values.length
}

/** Zero mean, unit variance, standard deviation floored at 1e-12. Port of `fingerprint.py:55-60`. */
function standardize(values: number[]): number[] {
  const center = mean(values)
  let squares = 0
  for (const value of values) squares += (value - center) ** 2
  const scale = Math.max(Math.sqrt(squares / values.length), 1e-12)
  return values.map((value) => (value - center) / scale)
}

function dot(left: number[], right: number[]): number {
  let total = 0
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index]
  return total
}

function norm(values: number[]): number {
  return Math.sqrt(dot(values, values))
}

function normalized(values: number[]): number[] {
  const scale = Math.max(norm(values), 1e-12)
  return values.map((value) => value / scale)
}

/**
 * Gram-Schmidt style projection removal: `v -= (v·bᵀ)b` for every basis row.
 * Port of `fingerprint.py:93-94` / `static/fingerprint-core.js:65-72`.
 */
function subtractBasis(values: number[], basis: number[][]): number[] {
  const output = values.slice()
  for (const vector of basis) {
    const projection = dot(output, vector)
    for (let index = 0; index < output.length; index += 1) output[index] -= projection * vector[index]
  }
  return output
}

/** Smoothed Hellinger feature (square root of the smoothed distribution). Port of `fingerprint.py:63-66`. */
export function hellingerFeature(counts: number[]): number[] {
  let total = 0
  for (const value of counts) total += value
  const denominator = total + ALPHA * DIMENSION
  return counts.map((value) => Math.sqrt((value + ALPHA) / denominator))
}

/**
 * Four positional blocks of 16 value-range buckets plus the last-digit distribution, 4*16+10 = 74 dims.
 * Port of `fingerprint.py:69-79` / `static/fingerprint-core.js:79-108`.
 *
 * Bucket index: `floor((value - 1) / 355 * 16)` clamped to 15. The `355` is the histogram range width
 * (`356 - 1`), not `VALUE_MAX - VALUE_MIN`; keep it literal so it cannot drift.
 */
export function orderedBlockFeature(numbers: number[]): number[] {
  const pieces: number[] = []
  for (const chunk of splitIntoFour(numbers)) {
    const bins = new Array<number>(BLOCK_BINS).fill(0.5)
    for (const value of chunk) {
      const index = Math.min(BLOCK_BINS - 1, Math.floor(((value - 1) / 355) * BLOCK_BINS))
      bins[index] += 1
    }
    let total = 0
    for (const value of bins) total += value
    for (const value of bins) pieces.push(Math.sqrt(value / total))
  }

  const lastDigits = new Array<number>(LAST_DIGITS).fill(0.5)
  for (const value of numbers) lastDigits[value % 10] += 1
  let lastTotal = 0
  for (const value of lastDigits) lastTotal += value
  for (const value of lastDigits) pieces.push(Math.sqrt(value / lastTotal))
  return pieces
}

/** `np.array_split(values, 4)`: the first `length % 4` chunks get one extra element. */
function splitIntoFour(values: number[]): number[][] {
  const base = Math.floor(values.length / BLOCKS)
  const remainder = values.length % BLOCKS
  const chunks: number[][] = []
  let start = 0
  for (let index = 0; index < BLOCKS; index += 1) {
    const size = base + (index < remainder ? 1 : 0)
    chunks.push(values.slice(start, start + size))
    start += size
  }
  return chunks
}

/** Marginal scores: standardize, nuisance-project, cosine against centroids, standardize twice. */
export interface MarginalScores {
  /** Fused marginal score used downstream. `fingerprint.py:100` standardizes a second time. */
  fused: number[]
  /** Pre-second-standardization values, reported as `nuisance_score`. */
  nuisance: number[]
}

/**
 * Port of `fingerprint.py:82-105`.
 *
 * The browser file returns a single `standardize(cosines)` and uses it as both `fused` and `nuisance`
 * (`static/fingerprint-core.js:110-118`). Python standardizes twice: `nuisance` then `fused`. Double
 * standardization is idempotent up to rounding, so the two agree to ~1e-16 and both clear the 1e-12
 * parity tolerance — this module keeps Python's shape.
 */
export function robustScoreCounts(counts: number[], bank: BankDocument): MarginalScores {
  const artifact = bank.robust.hellinger
  const feature = hellingerFeature(counts)
  let projected = feature.map((value, index) => (value - artifact.feature_mean[index]) / artifact.feature_scale[index])
  projected = subtractBasis(projected, artifact.nuisance_basis)
  projected = normalized(projected)
  const cosines = artifact.centroids.map((centroid) => dot(projected, centroid))
  const nuisance = standardize(cosines)
  return { fused: standardize(nuisance), nuisance }
}

/**
 * Ordered-block scores: environment template takes the max across environments, then equal-weight
 * fusion with the nuisance centroids, then standardize. Port of `fingerprint.py:108-130`.
 */
export function orderedBlockScores(numbers: number[], bank: BankDocument): number[] {
  const artifact = bank.robust.ordered_blocks
  if (artifact === undefined) throw new Error('指纹库缺少 robust.ordered_blocks 工件。')
  const feature = orderedBlockFeature(numbers)
  const standardizedFeature = feature.map(
    (value, index) => (value - artifact.feature_mean[index]) / artifact.feature_scale[index],
  )

  const unit = normalized(standardizedFeature)
  const environmentScores = artifact.environment_centroids.map((centroids) =>
    centroids.map((centroid) => dot(unit, centroid)),
  )
  const template = standardize(
    artifact.centroids.map((_, modelIndex) =>
      Math.max(...environmentScores.map((scores) => scores[modelIndex])),
    ),
  )

  const projected = normalized(subtractBasis(standardizedFeature, artifact.nuisance_basis))
  const nuisance = standardize(artifact.centroids.map((centroid) => dot(projected, centroid)))
  return standardize(template.map((value, index) => 0.5 * value + 0.5 * nuisance[index]))
}

/** Components of one answer's score. `nuisance` mirrors `fingerprint.py:139`/`:145`. */
export interface ResponseScores {
  fused: number[]
  marginal_fused: number[]
  ordered: number[]
  nuisance: number[]
}

/**
 * `(1-w)*marginal + w*ordered`. Falls back to the marginal score when the bank has no ordered-block
 * artifact or its weight is zero. Port of `fingerprint.py:133-145`.
 */
export function robustScoreNumbers(numbers: number[], bank: BankDocument): ResponseScores {
  const marginal = robustScoreCounts(countNumbers(numbers), bank)
  const artifact = bank.robust.ordered_blocks
  const weight = artifact === undefined ? 0 : Number(artifact.weight ?? 0)
  if (artifact === undefined || weight === 0) {
    return { fused: marginal.fused, marginal_fused: marginal.fused, ordered: marginal.fused, nuisance: marginal.nuisance }
  }
  const ordered = orderedBlockScores(numbers, bank)
  const fused = marginal.fused.map((value, index) => (1 - weight) * value + weight * ordered[index])
  return { fused, marginal_fused: marginal.fused, ordered, nuisance: marginal.nuisance }
}

/** Numerically stable softmax. Port of `fingerprint.py:148-153`. */
export function softmax(values: number[]): number[] {
  const maximum = Math.max(...values)
  const weights = values.map((value) => Math.exp(value - maximum))
  let total = 0
  for (const weight of weights) total += weight
  return weights.map((weight) => weight / total)
}

/**
 * Jensen-Shannon similarity. Display only — it never feeds `probability`
 * (`fingerprint.py:277`). Port of `fingerprint.py:156-168`.
 */
export function jsSimilarity(left: number[], right: number[]): number {
  let leftTotal = 0
  for (const value of left) leftTotal += value
  let rightTotal = 0
  for (const value of right) rightTotal += value
  rightTotal += ALPHA * DIMENSION

  const p = left.map((value) => value / leftTotal)
  const q = right.map((value) => (value + ALPHA) / rightTotal)
  const midpoint = p.map((value, index) => (value + q[index]) / 2)

  const divergence = (values: number[]): number => {
    let total = 0
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index]
      if (value) total += value * Math.log(value / midpoint[index])
    }
    return total
  }

  const js = (divergence(p) + divergence(q)) / 2
  return 1 - Math.sqrt(js / Math.log(2))
}
