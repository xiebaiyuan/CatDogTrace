/**
 * 出题：`generateChallenges` 是 `static/challenge-browser.js` 的移植，逐字对齐 `fingerprint.py:300-349`。
 *
 * 只断言不依赖随机结果的性质：条数、长度区间、长度互不相同、文案非空且互不相同、id 唯一。
 * 文案内容不做快照——随机选的四段模板，快照会天天红。
 */

import { describe, expect, it } from 'vitest'

import { generateChallenges } from '../../src/core/index'

/** `range(292, 333)`：292..332，两端都含。 */
const LENGTH_MIN = 292
const LENGTH_MAX = 332

describe('generateChallenges', () => {
  it('默认出 3 条', () => {
    expect(generateChallenges()).toHaveLength(3)
  })

  it('generateChallenges(3) 三条长度都在 292..332 且互不相同', () => {
    const challenges = generateChallenges(3)
    expect(challenges).toHaveLength(3)
    for (const challenge of challenges) {
      expect(challenge.expected_count).toBeGreaterThanOrEqual(LENGTH_MIN)
      expect(challenge.expected_count).toBeLessThanOrEqual(LENGTH_MAX)
      expect(Number.isInteger(challenge.expected_count)).toBe(true)
    }
    expect(new Set(challenges.map((challenge) => challenge.expected_count)).size).toBe(3)
  })

  it('generateChallenges(1) 出一条', () => {
    expect(generateChallenges(1)).toHaveLength(1)
  })

  it('prompt 非空、互不相同，且写明了本次长度', () => {
    const challenges = generateChallenges(3)
    for (const challenge of challenges) {
      expect(challenge.prompt.length).toBeGreaterThan(0)
      expect(challenge.prompt).toContain(`${challenge.expected_count} 个 1 到 355（含端点）的整数。`)
      expect(challenge.prompt).toContain('不要采用等差、循环、重复区块或其他规则化模式。')
      expect(challenge.prompt.endsWith('直接从第一个取值开始输出，不要在序列前重复数量、范围或任务说明。')).toBe(true)
    }
    expect(new Set(challenges.map((challenge) => challenge.prompt)).size).toBe(3)
  })

  it('id 唯一且带 probe-N- 前缀与 14 位十六进制尾巴', () => {
    const challenges = generateChallenges(3)
    const ids = challenges.map((challenge) => challenge.id)
    expect(new Set(ids).size).toBe(3)
    ids.forEach((id, index) => {
      expect(id).toMatch(new RegExp(`^probe-${index + 1}-[0-9a-f]{14}$`))
    })
  })

  it('连出两轮，长度不保证不同（随机），但每轮内部必须互不相同', () => {
    const first = generateChallenges(5)
    const second = generateChallenges(5)
    expect(new Set(first.map((challenge) => challenge.expected_count)).size).toBe(5)
    expect(new Set(second.map((challenge) => challenge.expected_count)).size).toBe(5)
  })
})
