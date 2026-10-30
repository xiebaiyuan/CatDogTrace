import { describe, expect, it } from 'vitest'
import {
  barWidth,
  buildJudgeInputs,
  DEFAULT_THRESHOLD_NOTICE,
  errorMessage,
  familyBars,
  NO_INPUT_MESSAGE,
  parseJsonPayload,
  percent,
  rankedResults,
  rejectedDiagnostics,
} from '../../src/client/logic'
import type { Challenge } from '../../src/core'

function challenge(expected_count: number, id: string): Challenge {
  return { id, expected_count, prompt: `请给出 ${expected_count} 个 1 到 355 的整数。` }
}

const THREE = [challenge(292, 'a'), challenge(311, 'b'), challenge(327, 'c')]

describe('收答：三个框各自带 expected_count', () => {
  it('把每题的门槛绑到同一个下标的框上', () => {
    const result = buildJudgeInputs(['一', '二', '三'], THREE)
    expect(result.outputs).toEqual([
      { text: '一', expected_count: 292 },
      { text: '二', expected_count: 311 },
      { text: '三', expected_count: 327 },
    ])
    expect(result.unboundThreshold).toBe(false)
  })

  it('下标错位时不会串用别的题的门槛', () => {
    // Only the third box is filled: it must carry challenge 3's count, not challenge 1's.
    const result = buildJudgeInputs(['', '', '三'], THREE)
    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0]).toEqual({ text: '三', expected_count: 327 })
  })

  it('空框被丢掉，不当成空输入送去判定', () => {
    const result = buildJudgeInputs(['  \n ', '二', ''], THREE)
    expect(result.outputs).toEqual([{ text: '二', expected_count: 311 }])
  })

  it('没出过题时按 80 算门槛，并标记出来', () => {
    const result = buildJudgeInputs(['一'], [])
    expect(result.outputs).toEqual([{ text: '一' }])
    expect(result.unboundThreshold).toBe(true)
    expect(DEFAULT_THRESHOLD_NOTICE).toContain('80')
  })

  it('没有非空回答时输出为空，由调用方报「没有可用回答」', () => {
    const result = buildJudgeInputs(['', '   ', ''], THREE)
    expect(result.outputs).toEqual([])
    expect(NO_INPUT_MESSAGE.startsWith('没有可用回答：')).toBe(true)
  })
})

describe('收答：JSON 直通', () => {
  it('原样接受 outputs，不做门槛重绑', () => {
    const parsed = parseJsonPayload(JSON.stringify({
      outputs: [
        { text: '一', expected_count: 218 },
        { text: '二', expected_count: 300 },
      ],
    }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.outputs).toEqual([
      { text: '一', expected_count: 218 },
      { text: '二', expected_count: 300 },
    ])
    expect(parsed.unboundThreshold).toBe(false)
  })

  it('缺 expected_count 时透传 text 并标记门槛回落到 80', () => {
    const parsed = parseJsonPayload('{"outputs":[{"text":"只有文本"}]}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.outputs).toEqual([{ text: '只有文本' }])
    expect(parsed.unboundThreshold).toBe(true)
  })

  it('拒绝既没有 outputs 也不是数组的载荷', () => {
    expect(parseJsonPayload('{"inputs":[]}').ok).toBe(false)
    expect(parseJsonPayload('{"outputs":[]}').ok).toBe(false)
    expect(parseJsonPayload('{}').ok).toBe(false)
  })

  it('拒绝坏 JSON 与错误字段类型，并给出可读原因', () => {
    const broken = parseJsonPayload('{"outputs":[{')
    expect(broken.ok).toBe(false)
    if (broken.ok) return
    expect(broken.error).toContain('JSON 解析失败')

    const wrongType = parseJsonPayload('{"outputs":[{"text":"一","expected_count":"218"}]}')
    expect(wrongType.ok).toBe(false)
    if (wrongType.ok) return
    expect(wrongType.error).toContain('expected_count 必须是数字')
  })

  it('空白载荷提示先粘贴', () => {
    const parsed = parseJsonPayload('   \n  ')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('还没有粘贴 JSON')
  })
})

describe('判定：全部被拒时的报错文案', () => {
  const noUsable = '没有可用回答：请粘贴完整数字序列；拒答或严重截断的回答不会计入。'

  it('把核心抛出的中文原文原样透出，不加前缀不改写', () => {
    expect(errorMessage(new Error(noUsable))).toBe(noUsable)
    expect(errorMessage(noUsable)).toBe(noUsable)
  })

  it('非 Error 的空抛出给一句兜底文案，而不是 "undefined"', () => {
    expect(errorMessage(undefined)).toBe('判定失败，原因不明。')
    expect(errorMessage(null)).toBe('判定失败，原因不明。')
    expect(errorMessage(new Error(''))).toBe('判定失败，原因不明。')
  })

  it('被拒的输入从 diagnostics 里挑出来，接受的不进列表', () => {
    const rejected = rejectedDiagnostics([
      { index: 0, parsed_numbers: 12, minimum_numbers: 160, accepted: false },
      { index: 1, parsed_numbers: 214, minimum_numbers: 160, accepted: true },
      { index: 2, parsed_numbers: 3, minimum_numbers: 171, accepted: false },
    ])
    expect(rejected.map(entry => entry.index)).toEqual([0, 2])
  })
})

describe('展示层的小函数', () => {
  it('概率按一位小数、并按 0..1 夹紧成条宽', () => {
    expect(percent(0.1234)).toBe('12.3%')
    expect(percent(Number.NaN)).toBe('—')
    expect(barWidth(0.5)).toBe('50.00%')
    expect(barWidth(1.4)).toBe('100.00%')
    expect(barWidth(-1)).toBe('0.00%')
  })

  it('品种榜按归因概率降序，不改原数组', () => {
    const rows = [{ model: 'a', probability: 0.1 }, { model: 'b', probability: 0.7 }]
    expect(rankedResults(rows).map(row => row.model)).toEqual(['b', 'a'])
    expect(rows.map(row => row.model)).toEqual(['a', 'b'])
  })

  it('族概率条固定犬族在前、猫族在后', () => {
    const bars = familyBars({
      family_probabilities: [
        { family: 'cat', display_name: '猫族', probability: 0.4 },
        { family: 'dog', display_name: '犬族', probability: 0.6 },
      ],
    })
    expect(bars.map(bar => bar.family)).toEqual(['dog', 'cat'])
  })
})
