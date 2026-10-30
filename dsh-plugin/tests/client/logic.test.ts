import { describe, expect, it } from 'vitest'
import {
  bankStatusText,
  barWidth,
  canJudge,
  commitDraft,
  emptyPanelState,
  errorMessage,
  familyBars,
  judgeHint,
  makeSegment,
  minimumNumbers,
  missingSegments,
  parseJsonPayload,
  percent,
  planJudge,
  progressLabel,
  randomAnswer,
  randomNumbers,
  rankedResults,
  rejectedDiagnostics,
  restart,
  segmentSummary,
  SEGMENTS_REQUIRED,
  TEXT,
  undoSegment,
  withBank,
  withChallenges,
  withDraft,
  withPayload,
  withRandomAnswers,
  type PanelState,
} from '../../src/client/logic'
import type { Challenge } from '../../src/core'

function challenge(expected_count: number, index = 1): Challenge {
  return { id: `probe-${index}`, expected_count, prompt: `请给出 ${expected_count} 个 1 到 355 的整数。` }
}

const THREE = [challenge(292, 1), challenge(311, 2), challenge(327, 3)]

/** A deterministic in-range answer of `count` numbers, joined with spaces. */
function answer(count: number): string {
  let seed = 20261029
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    values.push((seed % 355) + 1)
  }
  return values.join(' ')
}

/** A fresh state with the three challenges drawn. */
function drawn(): PanelState {
  return withChallenges(emptyPanelState(), THREE)
}

/** Feed three whole answers through the real transition, as the panel does. */
function filled(counts: readonly number[] = [292, 311, 327]): PanelState {
  let state = drawn()
  for (const count of counts) {
    state = commitDraft(withDraft(state, answer(count)))
  }
  return state
}

describe('门槛：与核心同一口径', () => {
  it('max(80, ceil(expected_count * 0.55))', () => {
    expect(minimumNumbers(292)).toBe(161) // ceil(160.6)
    expect(minimumNumbers(218)).toBe(120) // ceil(119.9)
    expect(minimumNumbers(100)).toBe(80) // ceil(55) → floor wins
    expect(minimumNumbers(undefined)).toBe(80)
    expect(minimumNumbers(0)).toBe(80)
  })
})

describe('自动进位：一段一粘，进度自己走', () => {
  it('空框不收，给一句提示而不是静默', () => {
    const state = commitDraft(withDraft(drawn(), '   '))
    expect(state.segments).toHaveLength(0)
    expect(state.notice).toBe(TEXT.draftEmpty)
  })

  it('粘贴一段后：落位、清空输入框、进度前移、行内报出门槛', () => {
    const state = commitDraft(withDraft(drawn(), answer(292)))

    expect(state.segments).toHaveLength(1)
    expect(state.draft).toBe('')
    expect(state.segments[0].numbers).toBe(292)
    expect(state.segments[0].expected_count).toBe(292)
    expect(state.segments[0].threshold).toBe(161)
    expect(state.segments[0].accepted).toBe(true)
    expect(segmentSummary(state.segments[0])).toBe('已收 292 个数字，门槛 161 ✓')
    expect(progressLabel(state)).toBe('第 2/3 段 · 已收 1/3')
  })

  it('第二段用第二道题的门槛，不是第一道的', () => {
    let state = commitDraft(withDraft(drawn(), answer(292)))
    state = commitDraft(withDraft(state, answer(311)))

    expect(state.segments.map(segment => segment.expected_count)).toEqual([292, 311])
    expect(state.segments.map(segment => segment.threshold)).toEqual([161, 172])
    expect(progressLabel(state)).toBe('第 3/3 段 · 已收 2/3')
  })

  it('收满三段后不再收第四段', () => {
    const state = commitDraft(withDraft(filled(), answer(200)))
    expect(state.segments).toHaveLength(SEGMENTS_REQUIRED)
    expect(state.notice).toBe(TEXT.full)
  })

  it('数字个数按核心的口径算：越界值丢掉、字母断开时取最长一段', () => {
    // A short run first, then a letter separator, then the longest run of 120.
    const text = `1 2 3 4 5 xxx ${answer(120)} 999 0`
    const segment = makeSegment(text, challenge(292))
    expect(segment.numbers).toBe(120)
  })
})

describe('撤回与重来', () => {
  it('撤回上一段把文本退回输入框，进度回退', () => {
    const full = filled()
    const state = undoSegment(full)

    expect(state.segments).toHaveLength(2)
    expect(state.draft).toBe(full.segments[2].text)
    expect(missingSegments(state)).toBe(1)
  })

  it('没有段可撤时撤回是空操作', () => {
    const state = undoSegment(drawn())
    expect(state.segments).toHaveLength(0)
    expect(state.draft).toBe('')
  })

  it('重新开始清空三段、输入框与 JSON，但保留已出的题', () => {
    const state = restart(withPayload(filled(), '{"outputs":[]}'))

    expect(state.segments).toHaveLength(0)
    expect(state.draft).toBe('')
    expect(state.payload).toBe('')
    expect(state.challenges).toHaveLength(3)
  })

  it('重新出题丢掉旧的三段与结果', () => {
    const state = withChallenges(filled(), [challenge(300, 9)])
    expect(state.challenges).toHaveLength(1)
    expect(state.segments).toHaveLength(0)
  })
})

describe('判定按钮的门槛', () => {
  it('未收满时禁用，并说还差几段', () => {
    let state = drawn()
    expect(canJudge(state)).toBe(false)
    expect(judgeHint(state)).toContain('还差 3 段')

    state = commitDraft(withDraft(state, answer(292)))
    expect(canJudge(state)).toBe(false)
    expect(judgeHint(state)).toContain('还差 2 段')

    state = commitDraft(withDraft(state, answer(311)))
    expect(canJudge(state)).toBe(false)
    expect(judgeHint(state)).toContain('还差 1 段')
  })

  it('收满三段后启用', () => {
    const state = filled()
    expect(canJudge(state)).toBe(true)
    expect(judgeHint(state)).toBe(TEXT.full)
  })

  it('裸文本也要收三段，门槛明说按 80 算', () => {
    let state = emptyPanelState()
    expect(TEXT.bareText).toContain('80')

    state = commitDraft(withDraft(state, answer(90)))
    expect(state.segments[0].expected_count).toBeUndefined()
    expect(state.segments[0].threshold).toBe(80)
    expect(segmentSummary(state.segments[0])).toBe('已收 90 个数字，门槛 80 ✓')
    expect(canJudge(state)).toBe(false)
  })
})

describe('JSON 直通：非空时优先', () => {
  it('JSON 非空时判定用 JSON，忽略已收的段，且不要求收满', () => {
    const state = withPayload(drawn(), '{"outputs":[{"text":"一","expected_count":218}]}')

    expect(canJudge(state)).toBe(true)
    expect(judgeHint(state)).toBe(TEXT.jsonWins)

    const plan = planJudge(state)
    expect(plan.ready).toBe(true)
    if (!plan.ready) return
    expect(plan.source).toBe('json')
    expect(plan.outputs).toEqual([{ text: '一', expected_count: 218 }])
  })

  it('收满三段但没有 JSON 时，用三段且各自带上 expected_count', () => {
    const plan = planJudge(filled())
    expect(plan.ready).toBe(true)
    if (!plan.ready) return
    expect(plan.source).toBe('segments')
    expect(plan.outputs.map(entry => entry.expected_count)).toEqual([292, 311, 327])
  })

  it('JSON 坏了就说坏在哪，不回退去用段', () => {
    const plan = planJudge(withPayload(filled(), '{"outputs":[{'))
    expect(plan.ready).toBe(false)
    if (plan.ready) return
    expect(plan.message).toContain('JSON 解析失败')
  })

  it('解析器接受 app.py 的请求体形状，缺 expected_count 时标记门槛回落', () => {
    const parsed = parseJsonPayload('{"outputs":[{"text":"一","expected_count":218},{"text":"二"}]}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.outputs).toEqual([{ text: '一', expected_count: 218 }, { text: '二' }])
    expect(parsed.unboundThreshold).toBe(true)
  })

  it('拒绝空 outputs 与错误类型', () => {
    expect(parseJsonPayload('{"outputs":[]}').ok).toBe(false)
    expect(parseJsonPayload('{}').ok).toBe(false)
    expect(parseJsonPayload('{"outputs":[{"text":1}]}').ok).toBe(false)
    expect(parseJsonPayload('{"outputs":[{"text":"一","expected_count":"218"}]}').ok).toBe(false)
  })
})

describe('多段拼在一起：提示，不切分', () => {
  it('一段明显是两倍门槛以上时给出撤回重贴的提示，但只收成一段', () => {
    const state = commitDraft(withDraft(drawn(), answer(340))) // 门槛 161，两倍 322

    expect(state.segments).toHaveLength(1)
    expect(state.segments[0].numbers).toBe(340)
    expect(state.segments[0].looksMerged).toBe(true)
    expect(state.notice).toBe(TEXT.merged)
    // Never split: one paste is one segment, however long.
    expect(state.draft).toBe('')
    expect(progressLabel(state)).toBe('第 2/3 段 · 已收 1/3')
  })

  it('刚好一倍半的段落不误报', () => {
    const state = commitDraft(withDraft(drawn(), answer(240))) // 240 < 322
    expect(state.segments[0].looksMerged).toBe(false)
    expect(state.notice).toBeNull()
  })
})

describe('全部被拒时的报错文案', () => {
  const noUsable = '没有可用回答：请粘贴完整数字序列；拒答或严重截断的回答不会计入。'

  it('把核心抛出的中文原文原样透出，不加前缀不改写', () => {
    expect(errorMessage(new Error(noUsable))).toBe(noUsable)
    expect(errorMessage(noUsable)).toBe(noUsable)
  })

  it('非 Error 的空抛出给一句兜底文案', () => {
    expect(errorMessage(undefined)).toBe('判定失败，原因不明。')
    expect(errorMessage(new Error(''))).toBe('判定失败，原因不明。')
  })

  it('被拒的输入从 diagnostics 里挑出来', () => {
    expect(rejectedDiagnostics([
      { index: 0, parsed_numbers: 12, minimum_numbers: 161, accepted: false },
      { index: 1, parsed_numbers: 214, minimum_numbers: 161, accepted: true },
      { index: 2, parsed_numbers: 3, minimum_numbers: 172, accepted: false },
    ]).map(entry => entry.index)).toEqual([0, 2])
  })
})

describe('指纹库状态行', () => {
  it('加载中 / 就绪（带品种数）/ 失败', () => {
    expect(bankStatusText(emptyPanelState())).toBe('指纹库加载中…')
    expect(bankStatusText(withBank(drawn(), 'ready', null, 24))).toBe('指纹库已就绪：24 个品种')
    expect(bankStatusText(withBank(drawn(), 'ready'))).toBe('指纹库已就绪')
    expect(bankStatusText(withBank(drawn(), 'failed', '炸了'))).toBe('指纹库加载失败')
  })
})

describe('展示层的小函数', () => {
  it('概率一位小数、条宽夹紧到 0..1', () => {
    expect(percent(0.1234)).toBe('12.3%')
    expect(percent(Number.NaN)).toBe('—')
    expect(barWidth(0.5)).toBe('50.00%')
    expect(barWidth(1.4)).toBe('100.00%')
    expect(barWidth(-1)).toBe('0.00%')
  })

  it('品种榜降序且不改原数组', () => {
    const rows = [{ model: 'a', probability: 0.1 }, { model: 'b', probability: 0.7 }]
    expect(rankedResults(rows).map(row => row.model)).toEqual(['b', 'a'])
    expect(rows.map(row => row.model)).toEqual(['a', 'b'])
  })

  it('族概率条固定犬族在前', () => {
    const bars = familyBars({
      family_probabilities: [
        { family: 'cat', display_name: '猫族', probability: 0.4 },
        { family: 'dog', display_name: '犬族', probability: 0.6 },
      ],
    })
    expect(bars.map(bar => bar.family)).toEqual(['dog', 'cat'])
  })
})

describe('随机填充：crypto + 拒绝采样', () => {
  /** The largest word a uniform mapping may use; anything from here up must be discarded. */
  const LIMIT = Math.floor(0x1_0000_0000 / 355) * 355 // 65320

  /** A source that hands out the given batches in order, repeating the last one. */
  function sourceOf(...batches: number[][]): (length: number) => ArrayLike<number> {
    let cursor = 0
    return (length: number) => {
      const batch = batches[Math.min(cursor, batches.length - 1)]
      cursor += 1
      return batch.slice(0, Math.max(length, 1))
    }
  }

  it('把样本均匀映射到 1..355', () => {
    expect(randomNumbers(3, sourceOf([0, 1, 354]))).toEqual([1, 2, 355])
  })

  it('拒绝会引入偏差的样本（≥ 355 的整除上界），不拿它凑数', () => {
    // 65320 itself is already outside the fair range: 65320 % 355 === 0 would double-count value 1.
    expect(randomNumbers(1, sourceOf([LIMIT], [0]))).toEqual([1])
  })

  it('真随机源下长度与值域都对', () => {
    const values = randomNumbers(292)
    expect(values).toHaveLength(292)
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(355)
    }

    const text = randomAnswer(292)
    const tokens = text.trim().split(/\s+/)
    expect(tokens).toHaveLength(292)
    expect(tokens.every(token => Number(token) >= 1 && Number(token) <= 355)).toBe(true)
  })

  it('长度为 0 时是空数组；随机源交白卷时报错而不是死循环', () => {
    expect(randomNumbers(0)).toEqual([])
    expect(() => randomNumbers(1, () => [])).toThrow('随机源没有返回任何样本')
  })

  it('越界或非整数的样本直接报错，不静默取模', () => {
    expect(() => randomNumbers(1, sourceOf([-1]))).toThrow('越界样本')
    expect(() => randomNumbers(1, sourceOf([0x1_0000_0000]))).toThrow('越界样本')
    expect(() => randomNumbers(1, sourceOf([1.5]))).toThrow('越界样本')
  })

  it('负长度是调用方的错', () => {
    expect(() => randomNumbers(-1)).toThrow('非负整数')
  })
})

describe('随机填充：走正常进位路径', () => {
  it('没出题时每段按对应题的 expected_count 收下，门槛照旧', () => {
    const state = withRandomAnswers(drawn(), (count: number) => randomAnswer(count))

    expect(state.segments).toHaveLength(SEGMENTS_REQUIRED)
    expect(state.segments.map(segment => segment.expected_count)).toEqual([292, 311, 327])
    expect(state.segments.map(segment => segment.numbers)).toEqual([292, 311, 327])
    expect(state.segments.map(segment => segment.threshold)).toEqual([161, 172, 180])
    expect(state.segments.every(segment => segment.accepted)).toBe(true)
    // One answer's worth of numbers is not a merged paste.
    expect(state.notice).toBeNull()
    expect(state.draft).toBe('')
    expect(canJudge(state)).toBe(true)
  })

  it('已经收了的段不动，只补空位', () => {
    const pasted = commitDraft(withDraft(drawn(), answer(292)))
    const state = withRandomAnswers(pasted, (count: number) => randomAnswer(count))

    expect(state.segments).toHaveLength(SEGMENTS_REQUIRED)
    expect(state.segments[0].text).toBe(answer(292))
    expect(state.segments[1].numbers).toBe(311)
  })

  it('三段已满时是空操作', () => {
    const full = filled()
    expect(withRandomAnswers(full)).toBe(full)
  })

  it('先清掉非空的 JSON 区，否则它会盖掉这次随机', () => {
    const state = withRandomAnswers(withPayload(drawn(), '{"outputs":[{"text":"一"}]}'))
    expect(state.payload).toBe('')
    expect(state.segments).toHaveLength(SEGMENTS_REQUIRED)
  })

  it('没有题就没有可依据的长度，什么都不填', () => {
    const state = withRandomAnswers(emptyPanelState())
    expect(state.segments).toHaveLength(0)
  })
})
