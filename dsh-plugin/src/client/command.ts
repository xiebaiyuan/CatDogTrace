/**
 * `/catdog` is this plugin's own `/` trigger source — not a host command.
 *
 * Two things happen on a pick, and both matter:
 *
 * 1. The typed token is removed. Returning `'handled'` does NOT do that: the input-trigger service's
 *    `execute()` returns early for `'handled'`, so a source that wants the token gone has to dispatch
 *    the `slash/input-consume-token` guard itself (the reference plugin does it from its dialog's
 *    close; the panel has no close, so it happens right here).
 * 2. The panel is opened. `ctx.sidebarRight.openTab(kind)` is the navigation controller the sidebar's
 *    own README documents as the way into the column, so no hint-and-hope is needed. Every absence,
 *    a kind not registered yet, or no on-screen session resolves to a no-op: the candidate's
 *    description still tells the user where the panel lives.
 */

import { TAB_KIND, COMMAND_NAME } from './meta'
import type { ClientCtx, InputTriggersFace, SidebarRightFace, TokenSpan, TriggerCandidate } from './services'

const LINE = `/${COMMAND_NAME}`

const CANDIDATE: TriggerCandidate = {
  name: COMMAND_NAME,
  label: '/catdog — 猫狗判定',
  // A sectioned candidate suppresses the menu's raw source-title row.
  section: '玩笑项目',
  description: '判定面板在右侧栏的「猫狗判定」标签里，点一下即可',
}

/** Hand the trigger guard back to the input shell so the `/catdog` token leaves the draft. */
function consumeToken(ctx: ClientCtx, sessionId: string, guard: { kind: 'span'; span: TokenSpan } | { kind: 'bare-token'; token: string }): void {
  try {
    const sessions = ctx.get('sessions') as { scope(id: string): SessionBailer | undefined } | undefined
    const scope = sessions?.scope(sessionId)
    scope?.bail(scope, 'slash/input-consume-token', { guard })
  } catch {
    // A stale guard fails soft: the token stays, nothing else breaks.
  }
}

interface SessionBailer {
  bail(subject: unknown, event: string, payload: unknown): unknown
}

/** Best-effort: open the tab type. Never throws into the trigger path. */
function openPanel(ctx: ClientCtx): void {
  try {
    const face = ctx.get('sidebarRight') as SidebarRightFace | undefined
    if (face === undefined || typeof face.openTab !== 'function') return
    face.openTab(TAB_KIND)
  } catch {
    // No on-screen session, or the kind is not registered yet — the description already says where it is.
  }
}

export function registerCatdogCommand(ctx: ClientCtx): void {
  // Wait for the SERVICE, never for module arrival order: the host composes its client from finer
  // modules, and `inputTriggers` may land after this bundle is materialized.
  ctx.inject(['inputTriggers'], (scoped) => {
    const inputTriggers = scoped.get('inputTriggers') as InputTriggersFace | undefined
    if (inputTriggers === undefined || typeof inputTriggers.registerSource !== 'function') return
    scoped.effect(() => inputTriggers.registerSource({
      trigger: '/',
      name: COMMAND_NAME,
      order: 20,
      candidates: (_session, request) => {
        if (request.position !== 'leading') return Promise.resolve([])
        const query = request.query.trim().toLowerCase()
        if (query !== '' && !COMMAND_NAME.startsWith(query)) return Promise.resolve([])
        return Promise.resolve([CANDIDATE])
      },
      onPick: (pick) => {
        consumeToken(scoped, pick.session.sessionId, { kind: 'span', span: pick.span })
        openPanel(scoped)
        return 'handled'
      },
      matchEnter: (session, line) => {
        if (line.trim() !== LINE) return Promise.resolve(undefined)
        consumeToken(scoped, session.sessionId, { kind: 'bare-token', token: LINE })
        openPanel(scoped)
        return Promise.resolve<'handled'>('handled')
      },
    }), 'dsh-catdogtrace: /catdog trigger')
  })
}
