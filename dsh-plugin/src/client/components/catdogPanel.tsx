/**
 * The right Sidebar's 「猫狗判定」 tab body: draw three challenges, collect three pastes, judge.
 *
 * The body is a stateless reader over `panelStoreOf(sessionId)` — the sidebar unmounts a tab body when
 * the user switches tabs, so nothing that matters may live in component state. Only the transient
 * `busy` flag stays local.
 *
 * Collection is one box that advances by itself: paste → the core's `parseNumbers` count → the next
 * empty slot → the box clears and the progress line states what was taken and against which threshold.
 * A paste that looks like several replies is warned about and NEVER split — a wrong split yields a
 * wrong percentage, which is the exact mistake this repository makes fun of.
 */

import {
  createElement as h,
  useCallback,
  useEffect,
  useSyncExternalStore,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import {
  analyzeGlobalOutputs,
  generateChallenges,
  loadBankChunk,
  type AnalysisResult,
  type Bank,
} from '../../core'
import { loadBreedAvatars } from '../avatars'
import type { BreedAvatarMap } from '../assets/avatars'
import { copyText } from '../copy'
import {
  bankStatusText,
  barWidth,
  canJudge,
  commitDraft,
  errorMessage,
  familyBars,
  judgeHint,
  missingSegments,
  percent,
  planJudge,
  progressLabel,
  randomAnswer,
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
  withFailure,
  withPayload,
  withRandomAnswers,
  withResult,
  type PanelState,
  type Segment,
} from '../logic'
import { GLOSSARY_URL } from '../meta'
import { panelStoreOf, type PanelStore } from '../panelStore'
import type { SlotProps } from '../services'
import { PanelBoundary } from './errorBoundary'

/** Sessions without an id still get one shared panel state rather than a crash. */
const NO_SESSION = 'no-session'

function sessionKeyOf(props: SlotProps): string {
  return typeof props.sessionId === 'string' && props.sessionId !== '' ? props.sessionId : NO_SESSION
}

/** The loaded bank's breed count, or null when the payload is not the shape we expect. */
function modelCountOf(bank: Bank): number | null {
  const models = (bank as { models?: unknown[] }).models
  return Array.isArray(models) ? models.length : null
}

/**
 * One breed's avatar, or nothing.
 *
 * The images are opaque cream squares, so the stylesheet gives them a radius and a hairline edge — in a
 * dark theme that edge is what stops them reading as pasted paper. `size` decides 22px in a ranking row
 * or 40px on the champion line.
 *
 * Renders nothing (not a broken image) while the lazy chunk is still in flight or when the map has no
 * entry for this breed: the name alone is always correct, the face is decoration.
 */
function BreedAvatar(props: {
  avatars: BreedAvatarMap | null
  id: string
  name: string
  large?: boolean
}): ReactElement | null {
  const src = props.avatars === null ? undefined : props.avatars[props.id]
  if (src === undefined) return null
  return h('img', {
    className: props.large === true ? 'cdt-avatar cdt-avatar-lg' : 'cdt-avatar',
    src,
    alt: props.name,
    width: props.large === true ? 40 : 22,
    height: props.large === true ? 40 : 22,
    draggable: false,
  })
}

function CopyButton({ text }: { text: string }): ReactElement {
  const [label, setLabel] = useState('复制')
  return h('button', {
    type: 'button',
    className: 'cdt-btn',
    onClick: () => {
      void copyText(text).then((copied) => {
        setLabel(copied ? '已复制' : '复制失败')
        window.setTimeout(() => { setLabel('复制') }, 1200)
      })
    },
  }, label)
}

function SegmentRow({ index, segment }: { index: number; segment: Segment }): ReactElement {
  return h('li', { className: 'cdt-seg' },
    h('span', { className: 'cdt-seg-index' }, `第 ${index + 1} 段`),
    h('span', { className: segment.accepted ? 'cdt-seg-ok' : 'cdt-seg-bad' }, segmentSummary(segment)),
    segment.looksMerged ? h('span', { className: 'cdt-warn' }, TEXT.merged) : null,
  )
}

function FamilyBars({ result }: { result: AnalysisResult }): ReactElement {
  return h('div', { className: 'cdt-bars' }, familyBars(result).map(bar => h('div', {
    className: 'cdt-bar-row',
    key: bar.family,
  },
  h('span', null, bar.display_name),
  h('div', { className: 'cdt-bar-track' }, h('div', {
    className: bar.family === 'cat' ? 'cdt-bar-fill cdt-bar-fill-cat' : 'cdt-bar-fill',
    style: { width: barWidth(bar.probability) },
  })),
  h('span', { className: 'cdt-bar-value' }, percent(bar.probability)),
  )))
}

function ResultPanel({ result, avatars }: { result: AnalysisResult; avatars: BreedAvatarMap | null }): ReactElement {
  const ranked = rankedResults(result.results)
  const rejected = rejectedDiagnostics(result.diagnostics)
  return h('div', { className: 'cdt-result' },
    h('div', { className: 'cdt-champion' },
      h(BreedAvatar, { avatars, id: result.prediction, name: result.prediction_name, large: true }),
      h('span', { className: 'cdt-champion-text' },
        h('span', { className: 'cdt-hint' }, '冠军品种'),
        h('span', { className: 'cdt-champion-name' }, result.prediction_name),
      ),
      h('span', { className: 'cdt-champion-value' }, percent(result.probability)),
      h('span', { className: 'cdt-tag' }, `用掉 ${result.used_outputs} 条回答`),
    ),
    h(FamilyBars, { result }),
    h('table', { className: 'cdt-table' },
      h('thead', null, h('tr', null,
        h('th', null, '#'),
        h('th', null, '品种'),
        h('th', null, '归因概率'),
        h('th', null, '族内条件概率'),
        h('th', null, '品种族'),
      )),
      h('tbody', null, ranked.map((breed, index) => h('tr', { key: breed.model },
        h('td', { className: 'cdt-rank' }, String(index + 1)),
        h('td', { className: 'cdt-breed' },
          h(BreedAvatar, { avatars, id: breed.model, name: breed.display_name }),
          h('span', null, breed.display_name),
        ),
        h('td', { className: 'cdt-num' }, percent(breed.probability)),
        h('td', { className: 'cdt-num' }, percent(breed.conditional_probability)),
        h('td', { className: 'cdt-tag' }, breed.family_name),
      ))),
    ),
    rejected.length === 0 ? null : h('div', null,
      h('p', { className: 'cdt-hint' }, `被拒的输入 ${rejected.length} 条：`),
      h('ul', { className: 'cdt-rejected' }, rejected.map(entry => h('li', { key: entry.index },
        `第 ${entry.index + 1} 条：解析出 ${entry.parsed_numbers} 个整数，门槛 ${entry.minimum_numbers}`,
      ))),
    ),
  )
}

function Body({ store }: { store: PanelStore }): ReactElement {
  const state: PanelState = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [avatars, setAvatars] = useState<BreedAvatarMap | null>(null)

  // First mount is the trigger. The store remembers the outcome, so remounting does not refetch.
  useEffect(() => {
    if (store.getSnapshot().bank !== 'loading') return
    let live = true
    loadBankChunk().then(
      (bank) => {
        if (!live) return
        store.update(current => withBank(current, 'ready', null, modelCountOf(bank)))
      },
      (error: unknown) => {
        if (!live) return
        store.update(current => withBank(current, 'failed', errorMessage(error)))
      },
    )
    return () => { live = false }
  }, [store])

  // The avatar chunk is a second lazy script; a failure here is silent by design (names still render).
  useEffect(() => {
    let live = true
    loadBreedAvatars().then(
      (map) => { if (live) setAvatars(map) },
      () => { /* names only */ },
    )
    return () => { live = false }
  }, [])

  const commit = useCallback((text: string) => {
    store.update(current => commitDraft(withDraft(current, text)))
  }, [store])

  const drawChallenges = useCallback(() => {
    try {
      const drawn = generateChallenges(SEGMENTS_REQUIRED)
      store.update(current => withChallenges(current, drawn))
    } catch (error) {
      store.update(current => withFailure(current, errorMessage(error)))
    }
  }, [store])

  const judge = useCallback(async () => {
    const plan = planJudge(store.getSnapshot())
    if (!plan.ready) {
      store.update(current => withFailure(current, plan.message))
      return
    }
    store.update(current => ({ ...current, failure: null, result: null }))
    setBusy(true)
    let bank: Bank
    try {
      bank = await loadBankChunk()
    } catch (error) {
      const message = errorMessage(error)
      store.update(current => withFailure(withBank(current, 'failed', message), message))
      setBusy(false)
      return
    }
    store.update(current => withBank(current, 'ready', null, modelCountOf(bank)))
    try {
      const result = analyzeGlobalOutputs(plan.outputs, bank)
      store.update(current => withResult(current, result))
    } catch (error) {
      // The core's own sentence — "没有可用回答：…" — is the useful text here; do not wrap it.
      store.update(current => withFailure(current, errorMessage(error)))
    } finally {
      setBusy(false)
    }
  }, [store])

  /**
   * 「随机填充并计算」: draw a set if the panel has none, fill each empty slot with an answer of that
   * challenge's length through the ordinary transitions, then judge.
   *
   * Deliberately not the shipped web page's short-cut (fill the boxes, then analyze): going through
   * `commitDraft` is what keeps the progress line, the per-segment threshold marks, and undo honest —
   * a random answer is judged by the same gate as a pasted one.
   */
  const randomize = useCallback(async () => {
    if (store.getSnapshot().challenges.length < SEGMENTS_REQUIRED) {
      try {
        store.update(current => withChallenges(current, generateChallenges(SEGMENTS_REQUIRED)))
      } catch (error) {
        store.update(current => withFailure(current, errorMessage(error)))
        return
      }
    }
    store.update(current => withRandomAnswers(current, randomAnswer))
    await judge()
  }, [judge, store])

  const missing = missingSegments(state)
  const bareText = state.challenges.length === 0
  const nextSlot = Math.min(state.segments.length + 1, SEGMENTS_REQUIRED)

  return h('div', { className: 'cdt-panel' },
    h('div', { className: 'cdt-status' },
      h('span', { className: state.bank === 'failed' ? 'cdt-status-bad' : 'cdt-status-ok' }, bankStatusText(state)),
      state.bank === 'failed' && state.bankError !== null
        ? h('span', { className: 'cdt-error' }, state.bankError)
        : null,
    ),

    h('section', { className: 'cdt-block' },
      h('div', { className: 'cdt-block-head' },
        h('span', { className: 'cdt-block-title' }, '出题'),
        h('span', { className: 'cdt-hint' }, state.challenges.length === 0 ? '还没出题' : `${state.challenges.length} 道`),
        h('button', {
          type: 'button',
          className: 'cdt-btn cdt-btn-primary',
          onClick: drawChallenges,
        }, state.challenges.length === 0 ? '生成 3 道挑战' : '重新出题'),
      ),
      state.challenges.length === 0
        ? h('p', { className: 'cdt-hint' }, '点「生成 3 道挑战」，把每道 prompt 发给待测模型，再把它的完整输出贴回下面。')
        : state.challenges.map((challenge, index) => h('article', { className: 'cdt-challenge', key: challenge.id },
          h('div', { className: 'cdt-challenge-head' },
            h('span', { className: 'cdt-challenge-name' }, `挑战 ${index + 1}`),
            h('span', { className: 'cdt-threshold' }, `期望 ${challenge.expected_count} 个整数`),
            h(CopyButton, { text: challenge.prompt }),
          ),
          h('pre', { className: 'cdt-prompt' }, challenge.prompt),
        )),
    ),

    h('section', { className: 'cdt-block' },
      h('div', { className: 'cdt-block-head' },
        h('span', { className: 'cdt-block-title' }, '收答'),
        h('span', { className: 'cdt-progress' }, progressLabel(state)),
      ),
      bareText ? h('p', { className: 'cdt-warn' }, TEXT.bareText) : null,
      h('textarea', {
        className: 'cdt-textarea',
        spellCheck: false,
        placeholder: `粘贴第 ${nextSlot} 段回答，粘完自动收下；保留文字、标点与代码块`,
        value: state.draft,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
          const value = event.target.value
          store.update(current => withDraft(current, value))
        },
        onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
          const pasted = event.clipboardData.getData('text')
          if (pasted.trim() === '') return
          // The paste IS the segment: taken verbatim, never split.
          event.preventDefault()
          commit(pasted)
        },
        onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
          event.preventDefault()
          commit(store.getSnapshot().draft)
        },
      }),
      h('div', { className: 'cdt-actions' },
        h('button', {
          type: 'button',
          className: 'cdt-btn',
          disabled: state.draft.trim() === '' || missing === 0,
          onClick: () => { commit(store.getSnapshot().draft) },
        }, '收下这段'),
        h('button', {
          type: 'button',
          className: 'cdt-btn',
          disabled: state.segments.length === 0,
          onClick: () => { store.update(undoSegment) },
        }, '撤回上一段'),
        h('button', {
          type: 'button',
          className: 'cdt-btn',
          disabled: state.segments.length === 0 && state.result === null && state.draft === '',
          onClick: () => { store.update(restart) },
        }, '重新开始'),
      ),
      state.notice === null ? null : h('p', { className: 'cdt-warn' }, state.notice),
      state.segments.length === 0 ? null : h('ol', { className: 'cdt-segs' },
        state.segments.map((segment, index) => h(SegmentRow, { index, segment, key: index })),
      ),
      h('details', { className: 'cdt-disclosure' },
        h('summary', { className: 'cdt-summary' }, '粘贴 JSON（非空时优先，忽略上面已收的段）'),
        h('p', { className: 'cdt-hint' },
          '形如 {"outputs":[{"text":"...","expected_count":218}]}，与 Flask 版 /api/analyze 的请求体一致。'),
        h('textarea', {
          className: 'cdt-textarea',
          spellCheck: false,
          placeholder: '{"outputs":[{"text":"...","expected_count":218}]}',
          value: state.payload,
          onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value
            store.update(current => withPayload(current, value))
          },
        }),
      ),
    ),

    h('section', { className: 'cdt-block' },
      h('div', { className: 'cdt-block-head' },
        h('span', { className: 'cdt-block-title' }, '判定'),
        h('span', { className: 'cdt-hint' }, judgeHint(state)),
      ),
      h('div', { className: 'cdt-actions' },
        h('button', {
          type: 'button',
          className: 'cdt-btn',
          disabled: busy,
          onClick: () => { void randomize() },
        }, '随机填充并计算'),
        h('button', {
          type: 'button',
          className: 'cdt-btn cdt-btn-primary',
          disabled: busy || !canJudge(state),
          onClick: () => { void judge() },
        }, busy ? '判定中…' : '判定'),
      ),
      state.failure === null ? null : h('p', { className: 'cdt-error' }, state.failure),
      state.result === null ? null : h(ResultPanel, { result: state.result, avatars }),
    ),

    h('footer', { className: 'cdt-foot' },
      '这是玩笑项目：数字分布相似不等于同源，谱系和蒸馏都证明不了（',
      h('a', { href: GLOSSARY_URL, target: '_blank', rel: 'noreferrer noopener' }, 'GLOSSARY.md「不能证明什么」'),
      '）。',
    ),
  )
}

/** The tab body. One store per session; the sidebar may unmount and remount this freely. */
export function CatdogPanel(props: SlotProps): ReactElement {
  const store = panelStoreOf(sessionKeyOf(props))
  return h(PanelBoundary, { children: h(Body, { store }) })
}
