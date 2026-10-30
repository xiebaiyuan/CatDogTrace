/**
 * 与 Python 参考实现对拍。
 *
 * 基准文件 `fixtures/python-parity.json` 由 `dsh-plugin/scripts/gen-parity.py` 生成，
 * 数字全部来自 `fingerprint.py::analyze_global_outputs`。这里不重算 Python、不重跑脚本，
 * 只把 TS 的输出和冻结下来的基准逐字段比。
 *
 * 容差：`probability` / `conditional_probability` 用 1e-12（浮点累加顺序差异）；
 * `score` / `nuisance_score` / `profile_similarity` 是同一算法的中间量与展示量，给 1e-9。
 * 字符串与整数一律严格相等。
 */

import { beforeAll, describe, expect, it } from 'vitest'

import fixture from './fixtures/python-parity.json'
import { analyzeGlobalOutputs, loadBankChunk } from '../../src/core/index'
import type { AnalysisResult, Bank, InputOutput } from '../../src/core/index'

interface PythonBreedResult {
  model: string
  display_name: string
  probability: number
  profile_similarity: number
  score: number
  nuisance_score: number
  family: string
  family_name: string
  conditional_probability: number
}

interface PythonDiagnostic {
  index: number
  parsed_numbers: number
  minimum_numbers: number
  accepted: boolean
}

interface PythonResult {
  prediction: string
  prediction_name: string
  probability: number
  used_outputs: number
  results: PythonBreedResult[]
  diagnostics: PythonDiagnostic[]
  calibration: { queries: string; beta: number; cv_accuracy: number }
  method: string
  family_prediction: string
  family_prediction_name: string
  family_probability: number
  family_probabilities: Array<{ family: string; display_name: string; probability: number }>
}

interface ParityCase {
  name: string
  outputs: InputOutput[]
  result: PythonResult | null
  error: { type: string; message: string } | null
}

const PROBABILITY_TOLERANCE = fixture.tolerance.probability_abs
const SOFT_TOLERANCE = 1e-9

const cases = fixture.cases as unknown as ParityCase[]

let bank: Bank

beforeAll(async () => {
  bank = await loadBankChunk()
})

function compare(label: string, actual: number, expected: number, tolerance: number, violations: string[]): void {
  if (!Number.isFinite(actual)) {
    violations.push(`${label}: ${actual} 不是有限数`)
    return
  }
  const delta = Math.abs(actual - expected)
  if (delta >= tolerance) violations.push(`${label}: |${actual} - ${expected}| = ${delta} >= ${tolerance}`)
}

function compareText(label: string, actual: unknown, expected: unknown, violations: string[]): void {
  if (actual !== expected) violations.push(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`)
}

function violationsOf(actual: AnalysisResult, expected: PythonResult): string[] {
  const violations: string[] = []

  compareText('prediction', actual.prediction, expected.prediction, violations)
  compareText('prediction_name', actual.prediction_name, expected.prediction_name, violations)
  compareText('family_prediction', actual.family_prediction, expected.family_prediction, violations)
  compareText('family_prediction_name', actual.family_prediction_name, expected.family_prediction_name, violations)
  compareText('used_outputs', actual.used_outputs, expected.used_outputs, violations)
  compareText('method', actual.method, expected.method, violations)
  compareText('calibration.queries', actual.calibration.queries, expected.calibration.queries, violations)
  compare('probability', actual.probability, expected.probability, PROBABILITY_TOLERANCE, violations)
  compare('family_probability', actual.family_probability, expected.family_probability, PROBABILITY_TOLERANCE, violations)
  compare('calibration.beta', actual.calibration.beta, expected.calibration.beta, SOFT_TOLERANCE, violations)
  compare('calibration.cv_accuracy', actual.calibration.cv_accuracy, expected.calibration.cv_accuracy, SOFT_TOLERANCE, violations)

  // diagnostics：逐条严格相同（整数与布尔，没有浮点）。
  if (actual.diagnostics.length !== expected.diagnostics.length) {
    violations.push(`diagnostics.length: ${actual.diagnostics.length} != ${expected.diagnostics.length}`)
  } else {
    actual.diagnostics.forEach((item, index) => {
      const target = expected.diagnostics[index]
      compareText(`diagnostics[${index}].index`, item.index, target.index, violations)
      compareText(`diagnostics[${index}].parsed_numbers`, item.parsed_numbers, target.parsed_numbers, violations)
      compareText(`diagnostics[${index}].minimum_numbers`, item.minimum_numbers, target.minimum_numbers, violations)
      compareText(`diagnostics[${index}].accepted`, item.accepted, target.accepted, violations)
    })
  }

  // 品种榜：顺序、名字、族严格相同；概率按 1e-12 比。
  if (actual.results.length !== expected.results.length) {
    violations.push(`results.length: ${actual.results.length} != ${expected.results.length}`)
  } else {
    actual.results.forEach((item, index) => {
      const target = expected.results[index]
      const at = `results[${index}](${target.model})`
      compareText(`${at}.model`, item.model, target.model, violations)
      compareText(`${at}.display_name`, item.display_name, target.display_name, violations)
      compareText(`${at}.family`, item.family, target.family, violations)
      compareText(`${at}.family_name`, item.family_name, target.family_name, violations)
      compare(`${at}.probability`, item.probability, target.probability, PROBABILITY_TOLERANCE, violations)
      compare(
        `${at}.conditional_probability`,
        item.conditional_probability,
        target.conditional_probability,
        PROBABILITY_TOLERANCE,
        violations,
      )
      compare(`${at}.score`, item.score, target.score, SOFT_TOLERANCE, violations)
      compare(`${at}.nuisance_score`, item.nuisance_score, target.nuisance_score, SOFT_TOLERANCE, violations)
      compare(`${at}.profile_similarity`, item.profile_similarity, target.profile_similarity, SOFT_TOLERANCE, violations)
    })
  }

  // 族概率列表。
  if (actual.family_probabilities.length !== expected.family_probabilities.length) {
    violations.push(
      `family_probabilities.length: ${actual.family_probabilities.length} != ${expected.family_probabilities.length}`,
    )
  } else {
    actual.family_probabilities.forEach((item, index) => {
      const target = expected.family_probabilities[index]
      compareText(`family_probabilities[${index}].family`, item.family, target.family, violations)
      compareText(`family_probabilities[${index}].display_name`, item.display_name, target.display_name, violations)
      compare(
        `family_probabilities[${index}].probability`,
        item.probability,
        target.probability,
        PROBABILITY_TOLERANCE,
        violations,
      )
    })
  }

  return violations
}

describe('与 fingerprint.py 对拍', () => {
  it('基准文件覆盖了要求的矩阵', () => {
    const names = cases.map((item) => item.name)
    expect(names).toContain('one-real-answer-calibration-1')
    expect(names).toContain('two-real-answers-calibration-2')
    expect(names).toContain('three-real-answers-calibration-3')

    const keys = new Set(
      cases
        .map((item) => item.result?.calibration.queries)
        .filter((value): value is string => value !== undefined),
    )
    expect(keys).toEqual(new Set(['1', '2', '3']))

    expect(cases.some((item) => item.error !== null)).toBe(true)
    expect(cases.some((item) => item.error === null && item.outputs.length === 3)).toBe(true)
    expect(cases.some((item) => item.outputs.some((output) => output.text.includes('甲')))).toBe(true)
  })

  for (const testCase of cases) {
    const expected = testCase.result
    if (expected === null) continue
    it(`${testCase.name} 与 Python 逐字段一致`, () => {
      const actual = analyzeGlobalOutputs(testCase.outputs, bank)
      expect(violationsOf(actual, expected)).toEqual([])
    })
  }

  for (const testCase of cases) {
    const expected = testCase.error
    if (expected === null) continue
    it(`${testCase.name} 抛出与 Python 相同的错误文案`, () => {
      let caught: unknown
      try {
        analyzeGlobalOutputs(testCase.outputs, bank)
      } catch (error) {
        caught = error
      }
      expect(caught, '应当抛错但没有抛').toBeInstanceOf(Error)
      // Python 抛 ValueError，JS 侧只有 Error；对拍只认文案。
      expect((caught as Error).message).toBe(expected.message)
    })
  }
})
