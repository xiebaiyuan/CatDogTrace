/**
 * Per-session panel state, module-level.
 *
 * Why it lives outside React: the right Sidebar unmounts a tab body when the user switches to another
 * tab (unless the type registers `keepMounted`), so component state would silently eat the drawn
 * challenges, the segments already collected, and the result. Everything the user must not lose is in
 * this store; the component is a pure reader over it through `useSyncExternalStore`.
 *
 * The snapshot is replaced on every transition, never mutated, so the hook's identity comparison works
 * and a closed/remounted panel reads the same object it left.
 */

import { emptyPanelState, type PanelState } from './logic'

export interface PanelStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): PanelState
  /** Apply one pure transition from `logic.ts` and notify. */
  update(transition: (state: PanelState) => PanelState): void
}

const stores = new Map<string, PanelStore>()

export function panelStoreOf(sessionId: string): PanelStore {
  const existing = stores.get(sessionId)
  if (existing !== undefined) return existing

  let state = emptyPanelState()
  const listeners = new Set<() => void>()
  const store: PanelStore = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    update(transition) {
      const next = transition(state)
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
  }
  stores.set(sessionId, store)
  return store
}

/** Drop every session's state. Tests only: a live page has exactly one reader per session. */
export function resetPanelStores(): void {
  stores.clear()
}
