/**
 * `/catdog`: consume the typed token, then open the panel.
 *
 * Both halves are asserted because both were easy to get wrong: returning `'handled'` does NOT delete
 * the token (the input-trigger service's `execute()` returns early for it), and `openTab` may be
 * absent, throw, or have no on-screen session — none of which may break the pick.
 */

import { describe, expect, it } from 'vitest'
import { registerCatdogCommand } from '../../src/client/command'
import { TAB_KIND } from '../../src/client/meta'
import type { ClientCtx, InputTriggersFace, TokenSpan } from '../../src/client/services'

interface Source {
  name: string
  candidates(
    session: { sessionId: string },
    request: { query: string; position: string; signal: AbortSignal },
  ): Promise<readonly { name: string; description?: string }[]>
  onPick(pick: {
    candidate: { name: string }
    session: { sessionId: string }
    position: string
    via: string
    span: TokenSpan
  }): 'handled' | undefined
  matchEnter(session: { sessionId: string }, line: string, signal: AbortSignal): Promise<'handled' | undefined>
}

interface Captured {
  source: Source | null
  bails: Array<{ event: string; guard: unknown }>
  opened: string[]
}

interface Options {
  /** Face to hand back for `ctx.get('sidebarRight')`. */
  sidebarRight?: unknown
  /** Face for `ctx.get('sessions')`. */
  sessions?: unknown
}

function fakeCtx(options: Options = {}): { ctx: ClientCtx; captured: Captured } {
  const captured: Captured = { source: null, bails: [], opened: [] }
  const defaults = {
    sidebarRight: {
      openTab(kind: string): void { captured.opened.push(kind) },
    },
    sessions: {
      scope(): { bail(subject: unknown, event: string, payload: { guard: unknown }): void } {
        return {
          bail(_subject: unknown, event: string, payload: { guard: unknown }): void {
            captured.bails.push({ event, guard: payload.guard })
          },
        }
      },
    },
  }
  const faces: Record<string, unknown> = {
    ...defaults,
    ...options,
  }

  const scoped: ClientCtx = {
    slots: { inject: () => undefined, register: () => () => {} },
    effect(callback: () => unknown): unknown { return callback() },
    inject(): void {},
    get(name: string): unknown { return faces[name] },
  }

  const ctx: ClientCtx = {
    ...scoped,
    inject(names: readonly string[], callback: (inner: ClientCtx) => void): unknown {
      if (!names.includes('inputTriggers')) return undefined
      callback({
        ...scoped,
        get(name: string): unknown {
          if (name !== 'inputTriggers') return faces[name]
          const face: InputTriggersFace = {
            registerSource(source) {
              captured.source = source as unknown as Source
              return () => {}
            },
          }
          return face
        },
      })
      return undefined
    },
  }
  return { ctx, captured }
}

const SPAN: TokenSpan = { start: 0, end: 7, draftRev: 3 }
const SESSION = { sessionId: 'session-1' }

describe('/catdog 触发器', () => {
  it('leading 位置的 /cat 出候选，描述写明面板在右侧栏', async () => {
    const { ctx, captured } = fakeCtx()
    registerCatdogCommand(ctx)

    const source = captured.source as Source
    const list = await source.candidates(SESSION, { query: '', position: 'leading', signal: new AbortController().signal })
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('catdog')
    expect(list[0].description).toContain('右侧栏')
    expect(list[0].description).toContain('猫狗判定')
  })

  it('不是 leading 位置、或查询对不上时不出候选', async () => {
    const { ctx, captured } = fakeCtx()
    registerCatdogCommand(ctx)
    const source = captured.source as Source
    const signal = new AbortController().signal

    expect(await source.candidates(SESSION, { query: '', position: 'trailing', signal })).toHaveLength(0)
    expect(await source.candidates(SESSION, { query: 'xyz', position: 'leading', signal })).toHaveLength(0)
    expect(await source.candidates(SESSION, { query: 'cat', position: 'leading', signal })).toHaveLength(1)
  })

  it('onPick 吃掉 token（span guard）并打开面板', () => {
    const { ctx, captured } = fakeCtx()
    registerCatdogCommand(ctx)

    const outcome = (captured.source as Source).onPick({
      candidate: { name: 'catdog' },
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: SPAN,
    })

    expect(outcome).toBe('handled')
    expect(captured.bails).toHaveLength(1)
    expect(captured.bails[0].event).toBe('slash/input-consume-token')
    expect(captured.bails[0].guard).toEqual({ kind: 'span', span: SPAN })
    expect(captured.opened).toEqual([TAB_KIND])
  })

  it('回车输入整行 /catdog 也吃 token 并打开面板（bare-token guard）', async () => {
    const { ctx, captured } = fakeCtx()
    registerCatdogCommand(ctx)

    const outcome = await (captured.source as Source).matchEnter(SESSION, '/catdog', new AbortController().signal)

    expect(outcome).toBe('handled')
    expect(captured.bails[0].guard).toEqual({ kind: 'bare-token', token: '/catdog' })
    expect(captured.opened).toEqual([TAB_KIND])
  })

  it('回车输入别的东西不接管', async () => {
    const { ctx, captured } = fakeCtx()
    registerCatdogCommand(ctx)

    const outcome = await (captured.source as Source).matchEnter(SESSION, '/catdogtrace', new AbortController().signal)
    expect(outcome).toBeUndefined()
    expect(captured.opened).toEqual([])
  })

  it('宿主没有 sidebarRight 时照样吃 token，不抛', () => {
    const { ctx, captured } = fakeCtx({ sidebarRight: undefined })
    registerCatdogCommand(ctx)

    const outcome = (captured.source as Source).onPick({
      candidate: { name: 'catdog' },
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: SPAN,
    })
    expect(outcome).toBe('handled')
    expect(captured.bails).toHaveLength(1)
  })

  it('openTab 抛错不影响 pick 的结果', () => {
    const { ctx, captured } = fakeCtx({
      sidebarRight: { openTab(): void { throw new Error('no on-screen session') } },
    })
    registerCatdogCommand(ctx)

    const outcome = (captured.source as Source).onPick({
      candidate: { name: 'catdog' },
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: SPAN,
    })
    expect(outcome).toBe('handled')
  })

  it('sessions 缺失时也不抛', () => {
    const { ctx, captured } = fakeCtx({ sessions: undefined })
    registerCatdogCommand(ctx)

    const outcome = (captured.source as Source).onPick({
      candidate: { name: 'catdog' },
      session: SESSION,
      position: 'leading',
      via: 'menu',
      span: SPAN,
    })
    expect(outcome).toBe('handled')
    expect(captured.bails).toHaveLength(0)
  })
})
