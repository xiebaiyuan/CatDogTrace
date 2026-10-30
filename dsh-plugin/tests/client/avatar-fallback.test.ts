/**
 * The avatar chunk failing must cost nothing but decoration.
 *
 * The panel renders the breed name first and the face second; when the lazy chunk cannot be fetched
 * (offline, a 404 on `client.avatars.js`, a corrupted cache entry) the row still has to read correctly —
 * no broken-image glyphs, no empty hole, no error banner. `../avatars` is mocked here so the failure is
 * the real one the component sees, not a hand-placed null prop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CatdogPanel } from '../../src/client/components/catdogPanel'
import { resetPanelStores } from '../../src/client/panelStore'

vi.mock('../../src/client/avatars', () => ({
  loadBreedAvatars: () => Promise.reject(new Error('client.avatars.js 404')),
}))

vi.mock('../../src/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core')>()
  return {
    ...actual,
    loadBankChunk: () => Promise.resolve({ models: new Array(24).fill({}) }),
    generateChallenges: () => [
      { id: 'probe-1', expected_count: 20, prompt: '第一题' },
      { id: 'probe-2', expected_count: 20, prompt: '第二题' },
      { id: 'probe-3', expected_count: 20, prompt: '第三题' },
    ],
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
      diagnostics: [{ index: 0, parsed_numbers: 20, minimum_numbers: 80, accepted: false }],
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

async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

const mounted: Array<{ root: Root; host: HTMLDivElement }> = []

beforeEach(() => {
  resetPanelStores()
})

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    host.remove()
  }
})

describe('头像 chunk 失败时', () => {
  it('排行榜与冠军行只剩名字：没有 img、没有裂图、没有报错横幅', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push({ root, host })
    root.render(h(CatdogPanel, { sessionId: 'no-avatars' }))
    await flush()

    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === '随机填充并计算')
    expect(button).toBeDefined()
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    // The result rendered normally…
    expect(host.textContent).toContain('柴犬')
    expect(host.textContent).toContain('冠军品种')
    // …with no image and no broken-image placeholder.
    expect(host.querySelectorAll('img')).toHaveLength(0)
    // A rejected avatar fetch is not a panel failure.
    expect(host.textContent).not.toContain('面板出错了')
    expect(host.textContent).not.toContain('client.avatars.js 404')
  })
})
