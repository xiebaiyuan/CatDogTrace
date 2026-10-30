/**
 * 数学核的单点性质。
 *
 * 对拍（`parity.test.ts`）管「与 Python 完全一致」，这里管「不依赖基准文件也不会写错的形态」：
 * 解析器的游程规则、直方图的维度和归一、特征的尺寸与归一、softmax 的取值范围。
 */

import { describe, expect, it } from 'vitest'

import {
  ALPHA,
  DIMENSION,
  countNumbers,
  hellingerFeature,
  orderedBlockFeature,
  parseNumbers,
  softmax,
  VALUE_MAX,
  VALUE_MIN,
} from '../../src/core/index'

describe('parseNumbers', () => {
  it('取最长的一段连续数字', () => {
    expect(parseNumbers('1 2 3 4 5 6 7')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(parseNumbers('说明 1 2 3 然后是 4 5 6 7 8 9')).toEqual([4, 5, 6, 7, 8, 9])
  })

  it('字母分隔符切断游程，逗号空格换行不切', () => {
    expect(parseNumbers('1 2 3\n4,5\t6, 7')).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(parseNumbers('1 2 3 甲 4 5 6 7')).toEqual([4, 5, 6, 7])
    // 只有字母才切；数字与标点都不切。
    expect(parseNumbers('1 2 3 - 4 5 6 7')).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('丢弃 1..355 之外的值，但不打断游程', () => {
    expect(parseNumbers('0 1 2 356 3 357 4 999999999999999999999 5')).toEqual([1, 2, 3, 4, 5])
  })

  it('没有数字时返回空数组', () => {
    expect(parseNumbers('')).toEqual([])
    expect(parseNumbers('拒答，不作答。')).toEqual([])
  })

  it('开头的前导字母不切断（因为还没有游程可切）', () => {
    expect(parseNumbers('回答如下：7 8 9')).toEqual([7, 8, 9])
  })

  it('等长取先出现的那段', () => {
    expect(parseNumbers('1 2 甲 3 4')).toEqual([1, 2])
  })
})

describe('countNumbers / hellingerFeature', () => {
  it('直方图定长 355，总和等于输入长度', () => {
    const numbers = [1, 1, 355, 200]
    const counts = countNumbers(numbers)
    expect(counts).toHaveLength(DIMENSION)
    expect(DIMENSION).toBe(VALUE_MAX - VALUE_MIN + 1)
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(numbers.length)
    expect(counts[0]).toBe(2)
    expect(counts[354]).toBe(1)
    expect(counts[199]).toBe(1)
  })

  it('Hellinger 特征每个分量都是概率的平方根，平方和为 1', () => {
    const counts = countNumbers([7, 7, 8, 9, 100])
    const feature = hellingerFeature(counts)
    expect(feature).toHaveLength(DIMENSION)
    const squares = feature.reduce((sum, value) => sum + value * value, 0)
    expect(Math.abs(squares - 1)).toBeLessThan(1e-12)
    for (const value of feature) {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    // 平滑项保证零计数桶也不为零。
    expect(feature[0]).toBeGreaterThan(0)
    expect(Math.abs(feature[0] ** 2 - ALPHA / (5 + ALPHA * DIMENSION))).toBeLessThan(1e-15)
  })
})

describe('orderedBlockFeature', () => {
  it('尺寸是 4*16+10 = 74', () => {
    expect(orderedBlockFeature(Array.from({ length: 120 }, (_, index) => (index % 355) + 1))).toHaveLength(74)
  })

  it('每段 16 桶与末位 10 桶各自平方和为 1', () => {
    const numbers = Array.from({ length: 137 }, (_, index) => ((index * 37) % 355) + 1)
    const feature = orderedBlockFeature(numbers)
    for (let block = 0; block < 4; block += 1) {
      const slice = feature.slice(block * 16, block * 16 + 16)
      expect(Math.abs(slice.reduce((sum, value) => sum + value * value, 0) - 1)).toBeLessThan(1e-12)
    }
    const digits = feature.slice(64, 74)
    expect(Math.abs(digits.reduce((sum, value) => sum + value * value, 0) - 1)).toBeLessThan(1e-12)
  })

  it('四段按位置切分：前段全是低位值时，只有第一段的前几个桶被抬高', () => {
    const numbers = [...Array.from({ length: 80 }, () => 1), ...Array.from({ length: 80 }, () => 355)]
    const feature = orderedBlockFeature(numbers)
    // 第一段（前 40 个 1）全落在第 0 桶，所以第 0 桶远高于第 1 桶。
    expect(feature[0]).toBeGreaterThan(feature[1])
    // 末段（后 40 个 355）落在第 15 桶。
    expect(feature[3 * 16 + 15]).toBeGreaterThan(feature[3 * 16 + 0])
  })
})

describe('softmax', () => {
  it('和为 1，保持单调', () => {
    const probabilities = softmax([1, 2, 3])
    expect(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1)).toBeLessThan(1e-15)
    expect(probabilities[2]).toBeGreaterThan(probabilities[1])
    expect(probabilities[1]).toBeGreaterThan(probabilities[0])
  })

  it('平移不变且不溢出', () => {
    const shifted = softmax([1000, 1001, 1002])
    const baseline = softmax([0, 1, 2])
    shifted.forEach((value, index) => {
      expect(Math.abs(value - baseline[index])).toBeLessThan(1e-12)
    })
  })
})
