/**
 * 指纹库入口：`loadBank` 的拒绝路径、`loadBankChunk` 的缓存与懒加载形态。
 *
 * 「是不是独立 chunk」只能靠打包验收，这里只能守住代码层面的一半：`loadBankChunk` 不在模块顶层
 * 求值（否则打包器会在主包里就执行它），且多次调用返回同一个 Promise / 同一个对象。
 */

import { describe, expect, it } from 'vitest'

import { EMPTY_BANK_MESSAGE, loadBank, loadBankChunk } from '../../src/core/index'

describe('loadBank', () => {
  it('没有 models 的载荷一律拒绝，文案与浏览器版一致', () => {
    expect(() => loadBank(undefined)).toThrow(EMPTY_BANK_MESSAGE)
    expect(() => loadBank(null)).toThrow(EMPTY_BANK_MESSAGE)
    expect(() => loadBank({})).toThrow(EMPTY_BANK_MESSAGE)
    expect(() => loadBank({ models: [] })).toThrow(EMPTY_BANK_MESSAGE)
    expect(() => loadBank('指纹库')).toThrow(EMPTY_BANK_MESSAGE)
  })

  it('有 models 的载荷原样放行', () => {
    const payload = { models: [{ id: 'husky' }] }
    expect(loadBank(payload)).toBe(payload)
  })
})

describe('loadBankChunk', () => {
  it('多次调用复用同一个 Promise，也拿到同一个对象', async () => {
    const first = loadBankChunk()
    const second = loadBankChunk()
    expect(first).toBe(second)

    const [left, right] = await Promise.all([first, second])
    expect(left).toBe(right)
  })

  it('加载出来的库有 24 个品种、两个族、三个校准温度', async () => {
    const bank = (await loadBankChunk()) as {
      models: Array<{ id: string; family?: string; counts: number[] }>
      calibration: Record<string, { beta: number }>
    }
    expect(bank.models).toHaveLength(24)
    expect(new Set(bank.models.map((model) => model.family))).toEqual(new Set(['dog', 'cat']))
    expect(Object.keys(bank.calibration).sort()).toEqual(['1', '2', '3'])
    expect(bank.models[0].counts).toHaveLength(355)
  })
})
