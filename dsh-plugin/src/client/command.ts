/**
 * `/catdog` is this plugin's own `/` trigger source — not a host command.
 *
 * The host has no "register a command" API for client plugins. What it does have is the input-trigger
 * service: a source that answers with candidates for a leading `/` query, plus a pick hook and an
 * Enter hook. Returning `'handled'` keeps the token out of the host's own routing; the token itself
 * is removed by the consume guard the overlay hands back when it closes.
 */

import { modalStoreOf, setPendingConsume } from './modalStore'
import { COMMAND_NAME } from './meta'
import type { ClientCtx, InputTriggersFace, TriggerCandidate } from './services'

const LINE = `/${COMMAND_NAME}`

const CANDIDATE: TriggerCandidate = {
  name: COMMAND_NAME,
  label: '/catdog — 猫狗品种指纹判定',
  // A sectioned candidate suppresses the menu's raw source-title row.
  section: '玩笑项目',
  description: '出三道数字挑战，收答，判定最像哪个犬猫品种',
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
        setPendingConsume(pick.session.sessionId, { kind: 'span', span: pick.span })
        modalStoreOf(pick.session.sessionId).set(true)
        return 'handled'
      },
      matchEnter: (session, line) => {
        if (line.trim() !== LINE) return Promise.resolve(undefined)
        setPendingConsume(session.sessionId, { kind: 'bare-token', token: LINE })
        modalStoreOf(session.sessionId).set(true)
        return Promise.resolve<'handled'>('handled')
      },
    }), 'dsh-catdogtrace: /catdog trigger')
  })
}
