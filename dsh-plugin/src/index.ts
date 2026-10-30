/**
 * Host-half package entry: the bundle patch row loads this module as a Cordis plugin.
 *
 * It is deliberately empty. Every behaviour of this plugin is browser-side — the `/catdog`
 * trigger, the overlay, and the analysis all run in the page against the bundled fingerprint
 * bank — so the host half exists only because the browser half is discovered through an active
 * loader entry for the same package. Keep `name` in sync with the patch row id and the
 * `dsh-catdogtrace` bundle id.
 */

/** The Cordis plugin name; the loader row id in `cordis.patch.yml` must match it. */
export const name = 'dsh-catdogtrace'

/** No host services are consumed: nothing here registers a tool, projection, or route. */
export const inject: readonly string[] = []

/** No host-side behaviour to set up. */
export function apply(): void {}
