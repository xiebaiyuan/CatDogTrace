/**
 * Client half bundle entry.
 *
 * The loader evaluates this bundle as a classic script inside its closure and keeps the returned
 * `module.exports` as the plugin object. So the export shape — `name`, `inject`, `apply` — is the
 * host's plugin contract, not an ES module's public API.
 *
 * Two registrations, both mounted once per page:
 * - the `/catdog` input-trigger source, which only flips a per-session flag;
 * - the `conversation.input.overlay` slot, which renders that flag.
 *
 * Nothing is fetched or drawn until the flag flips, which is what keeps a plugin that ships a 700KB
 * fingerprint bank free of any cost on a page where nobody types `/catdog`.
 */

import { createElement as h } from 'react'
import { registerCatdogCommand } from './command'
import { makeCatdogModal } from './components/catdogModal'
import { OVERLAY_ID, OVERLAY_SLOT, PACKAGE_NAME } from './meta'
import { modalStoreOf } from './modalStore'
import { entrySeated, type ClientCtx } from './services'
import { injectStyles } from './styles'

export const name = PACKAGE_NAME

/** `slots` is the only service `apply` itself needs; `inputTriggers` is waited for separately. */
export const inject: readonly string[] = ['slots']

export function apply(ctx: ClientCtx): void {
  // The client-plugin runner stamps every registration with a fresh priority, so the slot
  // registry's own same-priority de-duplication cannot catch a second mount of this bundle.
  if (entrySeated(ctx, OVERLAY_SLOT, OVERLAY_ID)) return

  ctx.effect(() => injectStyles(), 'dsh-catdogtrace: overlay styles')

  const CatdogModal = makeCatdogModal(ctx)
  ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register(
    {
      name: OVERLAY_SLOT,
      id: OVERLAY_ID,
      // After the host's own overlay entries: this one is a modal, not a hint strip.
      order: 20,
      // The store is the plugin's own per-session flag; the component reads it through
      // `useSyncExternalStore`, so no host hook compartment is involved.
      inject: (sessionId = '') => ({ modalStore: modalStoreOf(sessionId) }),
    },
    props => h(CatdogModal, props),
  ))

  registerCatdogCommand(ctx)
}
