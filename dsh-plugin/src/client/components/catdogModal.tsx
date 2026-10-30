/**
 * The `/catdog` overlay: draw the challenges, collect the answers, judge, rank the 24 breeds.
 *
 * Three inputs lead to the same judge:
 *
 * 1. Three answer boxes, each bound to the challenge at its index. The binding is what carries
 *    `expected_count` into the admission threshold; an answer without one falls back to the flat 80
 *    floor and the overlay says so out loud.
 * 2. A collapsed paste-JSON box taking the same body `app.py` takes, passed through untouched.
 * 3. Either of the above with an empty box silently omitted — an empty textarea is not an input.
 *
 * The fingerprint bank arrives through `loadBankChunk()`, which is a dynamic import the bundler
 * splits into its own chunk: the 700KB bank never enters `lib/client.js`, and the panel shows a
 * loading state while that sibling script is fetched.
 */

import {
  createElement as h,
  useCallback,
  useEffect,
  useSyncExternalStore,
  useState,
  type ReactElement,
} from 'react'
import {
  analyzeGlobalOutputs,
  generateChallenges,
  loadBankChunk,
  type AnalysisResult,
  type Bank,
  type Challenge,
  type InputOutput,
} from '../../core'
import { copyText } from '../copy'
import { useEscapeClose } from '../escapeClose'
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
} from '../logic'
import { GLOSSARY_URL } from '../meta'
import { modalStoreOf, takePendingConsume, type ModalStore } from '../modalStore'
import type { ClientCtx, SessionsFace, SlotProps } from '../services'
import { OverlayBoundary } from './errorBoundary'

/** The spec fixes three challenges and three answer boxes; the boxes are the challenges' indices. */
const CHALLENGE_COUNT = 3

const STATUS: Record<BankPhase, string> = {
  loading: '指纹库加载中…',
  ready: '指纹库已就绪：24 个品种',
  failed: '指纹库加载失败',
}

type BankPhase = 'loading' | 'ready' | 'failed'

interface BankState {
  phase: BankPhase
  error?: string
}

/** The per-session open flag, injected by the slot registration with a fallback to the module singleton. */
function storeOf(props: SlotProps): ModalStore {
  const injected = props.modalStore
  if (injected !== undefined && injected !== null && typeof injected === 'object' && 'getSnapshot' in injected) {
    return injected as ModalStore
  }
  return modalStoreOf(typeof props.sessionId === 'string' ? props.sessionId : '')
}

function sessionIdOf(props: SlotProps): string {
  return typeof props.sessionId === 'string' ? props.sessionId : ''
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

function ResultPanel({ result }: { result: AnalysisResult }): ReactElement {
  const ranked = rankedResults(result.results)
  const rejected = rejectedDiagnostics(result.diagnostics)
  return h('div', null,
    h('div', { className: 'cdt-champion' },
      h('span', { className: 'cdt-sub' }, '冠军品种'),
      h('span', { className: 'cdt-champion-name' }, result.prediction_name),
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
        h('td', null, breed.display_name),
        h('td', { className: 'cdt-num' }, percent(breed.probability)),
        h('td', { className: 'cdt-num' }, percent(breed.conditional_probability)),
        h('td', { className: 'cdt-tag' }, breed.family_name),
      ))),
    ),
    rejected.length === 0 ? null : h('div', null,
      h('p', { className: 'cdt-notice' }, `被拒的输入 ${rejected.length} 条：`),
      h('ul', { className: 'cdt-rejected' }, rejected.map(entry => h('li', { key: entry.index },
        `第 ${entry.index + 1} 条：解析出 ${entry.parsed_numbers} 个整数，门槛 ${entry.minimum_numbers}`,
      ))),
    ),
  )
}

function Body({ ctx, props }: { ctx: ClientCtx; props: SlotProps }): ReactElement {
  const store = storeOf(props)
  const sessionId = sessionIdOf(props)
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [answers, setAnswers] = useState<string[]>(() => Array.from({ length: CHALLENGE_COUNT }, () => ''))
  const [payload, setPayload] = useState('')
  const [bank, setBank] = useState<BankState>({ phase: 'loading' })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // First open is the trigger: the bank chunk is fetched now, not when the bundle materializes.
  useEffect(() => {
    let live = true
    loadBankChunk().then(
      () => { if (live) setBank({ phase: 'ready' }) },
      (error: unknown) => { if (live) setBank({ phase: 'failed', error: errorMessage(error) }) },
    )
    return () => { live = false }
  }, [])

  const close = useCallback(() => {
    store.set(false)
    // Hand the trigger token back to the input shell, or `/catdog` stays in the draft.
    const guard = takePendingConsume(sessionId)
    if (guard === undefined) return
    try {
      const sessions = ctx.get('sessions') as SessionsFace | undefined
      const scope = sessions?.scope(sessionId)
      scope?.bail(scope, 'slash/input-consume-token', { guard })
    } catch {
      // A stale guard fails soft: the token stays, the overlay still closed.
    }
  }, [ctx, sessionId, store])

  useEscapeClose(true, close)

  const drawChallenges = (): void => {
    try {
      const drawn = generateChallenges(CHALLENGE_COUNT)
      setChallenges(drawn)
      setAnswers(Array.from({ length: drawn.length }, () => ''))
      setResult(null)
      setFailure(null)
      setNotice(null)
    } catch (error) {
      setFailure(errorMessage(error))
    }
  }

  const setAnswer = (index: number, text: string): void => {
    setAnswers((previous) => {
      const next = [...previous]
      next[index] = text
      return next
    })
  }

  const judge = async (): Promise<void> => {
    setFailure(null)
    setResult(null)
    setNotice(null)

    let outputs: InputOutput[] = []
    let unboundThreshold = false
    if (payload.trim() === '') {
      const built = buildJudgeInputs(answers, challenges)
      outputs = built.outputs
      unboundThreshold = built.unboundThreshold
    } else {
      const parsed = parseJsonPayload(payload)
      if (!parsed.ok) {
        setFailure(parsed.error)
        return
      }
      outputs = parsed.outputs
      unboundThreshold = parsed.unboundThreshold
    }
    setNotice(unboundThreshold ? DEFAULT_THRESHOLD_NOTICE : null)
    if (outputs.length === 0) {
      setFailure(NO_INPUT_MESSAGE)
      return
    }

    setBusy(true)
    let loaded: Bank
    try {
      loaded = await loadBankChunk()
      setBank({ phase: 'ready' })
    } catch (error) {
      setBank({ phase: 'failed', error: errorMessage(error) })
      setFailure(errorMessage(error))
      setBusy(false)
      return
    }
    try {
      setResult(analyzeGlobalOutputs(outputs, loaded))
    } catch (error) {
      // The core's own sentence — "没有可用回答：…" — is the useful text here; do not wrap it.
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const thresholdHint = challenges.length === 0
    ? '还没有出题。裸文本也能判定，但门槛按 80 算。'
    : `三个框分别绑定第 1、2、3 道挑战的 ${challenges.map(entry => entry.expected_count).join(' / ')} 个整数门槛。`

  return (
    <div className="cdt-backdrop" onClick={close}>
      <div className="cdt-card" onClick={(event) => { event.stopPropagation() }}>
        <div className="cdt-head">
          <span className="cdt-title">猫狗判定</span>
          <span className="cdt-sub">{STATUS[bank.phase]}</span>
          <button type="button" className="cdt-close" aria-label="关闭" onClick={close}>×</button>
        </div>

        <div className="cdt-body">
          {bank.phase === 'failed' ? <p className="cdt-error">{bank.error ?? STATUS.failed}</p> : null}

          <section className="cdt-block">
            <div className="cdt-block-head">
              <span className="cdt-block-title">出题</span>
              <span className="cdt-count">{challenges.length === 0 ? '还没出题' : `${challenges.length} 道`}</span>
              <div className="cdt-actions">
                <button type="button" className="cdt-btn cdt-btn-primary" onClick={drawChallenges}>
                  生成 3 道挑战
                </button>
              </div>
            </div>
            {challenges.length === 0
              ? <p className="cdt-empty">点「生成 3 道挑战」，把 prompt 发给待测模型，再把它的完整输出贴回下面的框里。</p>
              : challenges.map((challenge, index) => (
                <article className="cdt-challenge" key={challenge.id}>
                  <div className="cdt-challenge-head">
                    <span className="cdt-challenge-name">挑战 {index + 1}</span>
                    <span className="cdt-threshold">期望 {challenge.expected_count} 个整数</span>
                    <CopyButton text={challenge.prompt} />
                  </div>
                  <pre className="cdt-prompt">{challenge.prompt}</pre>
                </article>
              ))}
          </section>

          <section className="cdt-block">
            <div className="cdt-block-head">
              <span className="cdt-block-title">收答</span>
              <span className="cdt-count">每个框绑定对应那题的门槛</span>
            </div>
            <p className="cdt-notice">{thresholdHint}</p>
            {Array.from({ length: challenges.length === 0 ? CHALLENGE_COUNT : challenges.length }, (_unused, index) => (
              <label className="cdt-field" key={index}>
                <span className="cdt-field-label">
                  <span>第 {index + 1} 题输出</span>
                  <span className="cdt-threshold">
                    {challenges[index] === undefined ? '门槛 80（未绑定）' : `门槛 ${challenges[index].expected_count}`}
                  </span>
                </span>
                <textarea
                  className="cdt-textarea"
                  spellCheck={false}
                  placeholder="粘贴完整的数字序列，保留文字、标点与代码块；拒答或截断的回答会被拒"
                  value={answers[index] ?? ''}
                  onChange={(event) => { setAnswer(index, event.target.value) }}
                />
              </label>
            ))}
            <details className="cdt-disclosure">
              <summary className="cdt-summary">粘贴 JSON（直通判定，覆盖上面三个框）</summary>
              <p className="cdt-notice">
                形如 {'{"outputs":[{"text":"...","expected_count":218}]'}，与 Flask 版 /api/analyze 的请求体一致。
              </p>
              <textarea
                className="cdt-textarea"
                spellCheck={false}
                placeholder={'{"outputs":[{"text":"...","expected_count":218}]}'}
                value={payload}
                onChange={(event) => { setPayload(event.target.value) }}
              />
            </details>
          </section>

          <section className="cdt-block">
            <div className="cdt-block-head">
              <span className="cdt-block-title">判定</span>
              <div className="cdt-actions">
                <button type="button" className="cdt-btn cdt-btn-primary" onClick={() => { void judge() }} disabled={busy}>
                  {busy ? '判定中…' : '判定'}
                </button>
              </div>
            </div>
            {notice === null ? null : <p className="cdt-notice">{notice}</p>}
            {failure === null ? null : <p className="cdt-error">{failure}</p>}
            {result === null ? null : <ResultPanel result={result} />}
          </section>
        </div>

        <footer className="cdt-foot">
          这是玩笑项目：数字分布相似不等于同源，谱系和蒸馏都证明不了（
          <a href={GLOSSARY_URL} target="_blank" rel="noreferrer noopener">GLOSSARY.md「不能证明什么」</a>）。
        </footer>
      </div>
    </div>
  )
}

/** Reads the open flag without mounting the reader: a closed overlay must not fetch the bank. */
function Gate({ ctx, props }: { ctx: ClientCtx; props: SlotProps }): ReactElement | null {
  const store = storeOf(props)
  const open = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return open ? h(Body, { ctx, props }) : null
}

export function makeCatdogModal(ctx: ClientCtx): (props: SlotProps) => ReactElement | null {
  return function CatdogModal(props: SlotProps): ReactElement | null {
    const store = storeOf(props)
    const onClose = (): void => { store.set(false) }
    // The boundary sits inside a renderable shell so a crash still offers a way out.
    return h(OverlayBoundary, { onClose, children: h(Gate, { ctx, props }) })
  }
}
