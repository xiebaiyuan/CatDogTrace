/**
 * The 24 breed avatars, fetched as a lazy chunk.
 *
 * Same rule as the fingerprint bank: 255KB of base64 must not sit in `lib/client.js`. The module is
 * reached only through the dynamic `import()` below, which the client build turns into
 * `require.async("./client.avatars.js")` — a sibling script the loader fetches on first use.
 *
 * The cache is the promise, not the map: two callers in the same tick (the champion row and the
 * ranking both ask) share one import, and a rejected import is retried on the next call rather than
 * cached forever — a transient transport failure should not cost the whole page its avatars.
 */

import type { BreedAvatarMap } from './assets/avatars'

let pending: Promise<BreedAvatarMap> | undefined

/** Resolve the avatar map once; later calls reuse the same promise. */
export function loadBreedAvatars(): Promise<BreedAvatarMap> {
  pending ??= import('./assets/avatars').then((module) => module.default).catch((error: unknown) => {
    // Drop the cache so the next open can retry; the caller degrades to names only.
    pending = undefined
    throw error
  })
  return pending
}
