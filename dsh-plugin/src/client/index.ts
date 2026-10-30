/**
 * Client half bundle entry.
 *
 * The loader evaluates this bundle as a classic script inside its closure and keeps the returned
 * `module.exports` as the plugin object. So the export shape — `name`, `inject`, `apply` — is the
 * host's plugin contract, not an ES module's public API.
 *
 * Two registrations, both once per page:
 * - the sidebar tab type and its two keyed seats, which render the panel;
 * - the `/catdog` input-trigger source, which opens that tab and eats its own token.
 *
 * Nothing is fetched or drawn until the tab is opened, which keeps a plugin that ships a 700KB
 * fingerprint bank free on a page where nobody opens the panel.
 */

import { registerCatdogCommand } from './command'
import { PACKAGE_NAME } from './meta'
import { mountSidebarTab } from './sidebar'
import type { ClientCtx } from './services'
import { injectStyles } from './styles'

export const name = PACKAGE_NAME

/** `slots` is the only service `apply` itself needs; the sidebar registries are waited for separately. */
export const inject: readonly string[] = ['slots']

export function apply(ctx: ClientCtx): void {
  ctx.effect(() => injectStyles(), 'dsh-catdogtrace: panel styles')
  mountSidebarTab(ctx)
  registerCatdogCommand(ctx)
}
