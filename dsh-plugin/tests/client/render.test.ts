/**
 * Render smoke for the sidebar panel.
 *
 * Mounted with the props the `sidebar.right.pane.tab` seat hands a tab body (`{ sessionId }`), and with
 * `src/core` mocked: the unit run must not pay for the 700KB bank, and the real artifact's loading path
 * is covered separately by `artifact.test.ts`.
 *
 * The paste path is exercised through a real `paste` event because that is the behaviour the rewrite
 * exists for: one paste advances one slot by itself, and the box empties.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CatdogPanel } from '../../src/client/components/catdogPanel'
import { resetPanelStores } from '../../src/client/panelStore'
import { TEXT } from '../../src/client/logic'

vi.mock('../../src/core', async (importOriginal) => {
  // Keep the real pure functions (`parseNumbers` counts what the core will score); replace only the
  // three the unit run must not pay for.
  const actual = await importOriginal<typeof import('../../src/core')>()
  return {
    ...actual,
    loadBankChunk: () => Promise.resolve({ models: new Array(24).fill({}) }),
    generateChallenges: (count = 3) => Array.from({ length: count }, (_unused, index) => ({
      id: `probe-${index + 1}`,
      expected_count: 292 + index * 10,
      prompt: `请给出 ${292 + index * 10} 个 1 到 355 的整数。`,
    })),
    analyzeGlobalOutputs: () => ({
      prediction: 'shiba',
      prediction_name: '柴犬',
      probability: 0.42,
      used_outputs: 3,
      results: [{
        model: 'shiba',
        display_name: '柴犬',
        probability: 0.42,
        profile_similarity: 0.9,
        score: 1,
        nuisance_score: 0,
        family: 'dog',
        family_name: '犬族',
        conditional_probability: 0.7,
      }],
      diagnostics: [{ index: 0, parsed_numbers: 292, minimum_numbers: 161, accepted: true }],
      calibration: { queries: '3', beta: 12, cv_accuracy: 0.98 },
      method: 'ordered-block + nuisance-Hellinger',
      family_prediction: 'dog',
      family_prediction_name: '犬族',
      family_probability: 0.55,
      family_probabilities: [
        { family: 'dog', display_name: '犬族', probability: 0.55 },
        { family: 'cat', display_name: '猫族', probability: 0.45 },
      ],
    }),
  }
})

/** A deterministic in-range answer of `count` numbers. */
function answer(count: number): string {
  let seed = 20261029
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    values.push((seed % 355) + 1)
  }
  return values.join(' ')
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

const mounted: Array<{ root: Root; host: HTMLDivElement }> = []

async function mount(): Promise<HTMLDivElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  root.render(h(CatdogPanel, { sessionId: 'render-smoke' }))
  await flush()
  return host
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === label)
  if (found === undefined) throw new Error(`no button labelled ${label}`)
  return found as HTMLButtonElement
}

function paste(host: HTMLElement, text: string): void {
  const box = host.querySelector('textarea') as HTMLTextAreaElement
  const event = new Event('paste', { bubbles: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  box.dispatchEvent(event)
}

beforeEach(() => {
  resetPanelStores()
})

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    host.remove()
  }
})

describe('侧栏面板', () => {
  it('画出三块、一个粘贴框、一个 JSON 折叠框与免责声明', async () => {
    const host = await mount()
    const text = host.textContent ?? ''

    expect(text).toContain('出题')
    expect(text).toContain('收答')
    expect(text).toContain('判定')
    expect(text).toContain('第 1/3 段')
    expect(text).toContain('已收 0/3')
    // One paste box plus the collapsed JSON passthrough.
    expect(host.querySelectorAll('textarea')).toHaveLength(2)
    expect(host.querySelector('a[href*="GLOSSARY.md"]')).not.toBeNull()
    // No dialog furniture survived the move: no backdrop, no close button.
    expect(host.querySelector('.cdt-backdrop')).toBeNull()
    expect([...host.querySelectorAll('button')].some(node => node.textContent?.trim() === '×')).toBe(false)
  })

  it('没出题时明说门槛按 80 算', async () => {
    const host = await mount()
    expect(host.textContent).toContain('门槛按 80 算')
    expect(host.textContent).toContain(TEXT.bareText)
  })

  it('粘一段就自动进位：输入框清空、进度前移、行内报出门槛', async () => {
    const host = await mount()
    button(host, '生成 3 道挑战').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    paste(host, answer(292))
    await flush()

    const box = host.querySelector('textarea') as HTMLTextAreaElement
    expect(box.value).toBe('')
    expect(host.textContent).toContain('第 2/3 段')
    expect(host.textContent).toContain('已收 1/3')
    expect(host.textContent).toContain('已收 292 个数字，门槛 161 ✓')
    // 292 is below twice the threshold, so no merged-paste warning.
    expect(host.textContent).not.toContain(TEXT.merged)
  })

  it('未收满时判定按钮禁用，收满三段后启用', async () => {
    const host = await mount()
    button(host, '生成 3 道挑战').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(button(host, '判定').disabled).toBe(true)
    expect(host.textContent).toContain('还差 3 段')

    paste(host, answer(292))
    await flush()
    expect(button(host, '判定').disabled).toBe(true)
    expect(host.textContent).toContain('还差 2 段')

    paste(host, answer(311))
    paste(host, answer(327))
    await flush()

    expect(button(host, '判定').disabled).toBe(false)
    expect(host.textContent).toContain('三段已收满')
  })

  it('撤回上一段把文本退回输入框，重新开始清空', async () => {
    const host = await mount()
    button(host, '生成 3 道挑战').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    const first = answer(292)
    paste(host, first)
    await flush()

    button(host, '撤回上一段').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    const box = host.querySelector('textarea') as HTMLTextAreaElement
    expect(box.value).toBe(first)
    expect(host.textContent).toContain('已收 0/3')

    button(host, '重新开始').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  })

  it('JSON 非空时优先：不必收满也能判定，且界面说明用 JSON', async () => {
    const host = await mount()
    const boxes = [...host.querySelectorAll('textarea')]
    const json = boxes[1] as HTMLTextAreaElement

    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(json, '{"outputs":[{"text":"一","expected_count":218}]}')
    json.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    expect(button(host, '判定').disabled).toBe(false)
    expect(host.textContent).toContain('JSON 区非空')
  })
})

describe('随机填充并计算', () => {
  it('没出题时先出题、再按每题长度收满三段、然后直接出结果', async () => {
    const host = await mount()

    // Nothing drawn yet: no prompts, no candidates for a length.
    expect(host.querySelectorAll('pre.cdt-prompt')).toHaveLength(0)
    expect(host.textContent).toContain('已收 0/3')

    button(host, '随机填充并计算').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    // Step 1: a challenge set appeared.
    expect(host.querySelectorAll('pre.cdt-prompt')).toHaveLength(3)
    // Step 2: all three slots went through the ordinary advance path.
    expect(host.textContent).toContain('已收 3/3')
    expect(host.textContent).toContain('已收 292 个数字，门槛 161 ✓')
    expect(host.textContent).toContain('已收 302 个数字，门槛 167 ✓')
    expect(host.textContent).toContain('已收 312 个数字，门槛 172 ✓')
    // Step 3: it judged on its own and rendered the result.
    expect(host.textContent).toContain('柴犬')
    expect(button(host, '判定').disabled).toBe(false)
    // The button is back to its label after the run.
    expect(button(host, '随机填充并计算').disabled).toBe(false)
  })

  it('按钮文案与网页版一致', async () => {
    const host = await mount()
    expect(button(host, '随机填充并计算').textContent?.trim()).toBe('随机填充并计算')
  })
})
