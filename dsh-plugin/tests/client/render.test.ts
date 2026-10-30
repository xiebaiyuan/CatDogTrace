/**
 * Render smoke for the overlay.
 *
 * The pure half is covered by `logic.test.ts`; this covers the part a unit test cannot: that the
 * dialog actually mounts and paints in a DOM, that the three answer boxes line up with the drawn
 * challenges' thresholds, and that the disclaimer link survives to the output. `src/core` is mocked
 * so the 700KB bank is not pulled through the dynamic import on every test run.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AnalysisResult } from '../../src/core'

vi.mock('../../src/core', () => ({
  loadBankChunk: () => Promise.resolve({ models: [] }),
  generateChallenges: (count = 3) => Array.from({ length: count }, (_unused, index) => ({
    id: `probe-${index + 1}`,
    expected_count: 292 + index * 10,
    prompt: `请给出 ${292 + index * 10} 个 1 到 355 的整数。`,
  })),
  analyzeGlobalOutputs: (): AnalysisResult => ({
    prediction: 'shiba',
    prediction_name: '柴犬',
    probability: 0.42,
    used_outputs: 1,
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
    diagnostics: [{ index: 0, parsed_numbers: 200, minimum_numbers: 160, accepted: true }],
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
}))

const { makeCatdogModal } = await import('../../src/client/components/catdogModal')
const { modalStoreOf } = await import('../../src/client/modalStore')

/** A stand-in for the host context: no slots, no services, and a service lookup that always misses. */
function stubCtx(): Parameters<typeof makeCatdogModal>[0] {
  return {
    slots: { inject() {}, register() {} },
    effect() {},
    inject() {},
    get() { return undefined },
  } as never
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

async function mount(): Promise<{ host: HTMLDivElement; root: Root }> {
  const CatdogModal = makeCatdogModal(stubCtx())
  const store = modalStoreOf('render-smoke')
  store.set(true)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(h(CatdogModal, { sessionId: 'render-smoke', modalStore: store }))
  await flush()
  return { host, root }
}

function clickByText(host: HTMLElement, label: string): void {
  const button = [...host.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === label)
  if (button === undefined) throw new Error(`no button labelled ${label}`)
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('浮层渲染', () => {
  it('打开状态画出三块、三个答题框、JSON 折叠区与免责声明', async () => {
    const { host, root } = await mount()
    const text = host.textContent ?? ''

    expect(text).toContain('猫狗判定')
    expect(text).toContain('出题')
    expect(text).toContain('收答')
    expect(text).toContain('判定')
    // No challenges drawn yet: the bare-text threshold has to be stated, not implied.
    expect(text).toContain('门槛按 80 算')
    // Three answer boxes plus the paste-JSON one.
    expect(host.querySelectorAll('textarea')).toHaveLength(4)
    expect(host.querySelector('a[href*="GLOSSARY.md"]')).not.toBeNull()

    root.unmount()
    host.remove()
  })

  it('点「生成 3 道挑战」后每个框带上对应那题的门槛', async () => {
    const { host, root } = await mount()

    clickByText(host, '生成 3 道挑战')
    await flush()

    const prompts = [...host.querySelectorAll('pre.cdt-prompt')].map(node => node.textContent ?? '')
    expect(prompts).toHaveLength(3)
    expect(prompts[0]).toContain('292')
    expect(prompts[2]).toContain('312')

    // Each answer box is labelled with its own challenge's count, in order.
    const labels = [...host.querySelectorAll('.cdt-field-label')].map(node => node.textContent ?? '')
    expect(labels).toHaveLength(3)
    expect(labels[0]).toContain('门槛 292')
    expect(labels[1]).toContain('门槛 302')
    expect(labels[2]).toContain('门槛 312')
    expect(host.textContent).not.toContain('门槛按 80 算')

    // Three copy buttons, one per challenge.
    const copies = [...host.querySelectorAll('button')].filter(node => node.textContent?.trim() === '复制')
    expect(copies).toHaveLength(3)

    root.unmount()
    host.remove()
  })
})
