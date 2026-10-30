/**
 * Per-session open flag for the `/catdog` overlay.
 *
 * Module-level on purpose: the slot outlet remounts the component on every composition change, and
 * the state has to outlive the component it belongs to. Same shape the reference plugin uses, so the
 * `useSyncExternalStore` contract (stable `subscribe`/`getSnapshot` identity, snapshot by value)
 * holds across remounts.
 */

export interface ModalStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): boolean
  set(open: boolean): void
}

const stores = new Map<string, ModalStore>()

export function modalStoreOf(sessionId: string): ModalStore {
  const existing = stores.get(sessionId)
  if (existing !== undefined) return existing
  let open = false
  const listeners = new Set<() => void>()
  const store: ModalStore = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => open,
    set(next) {
      if (next === open) return
      open = next
      for (const listener of listeners) listener()
    },
  }
  stores.set(sessionId, store)
  return store
}

/**
 * The guard that tells the input shell which trigger token to consume back.
 *
 * Opening the overlay from `/catdog` has to remove the token the user typed. The shell understands
 * two forms: a span compare-and-swap for a menu pick, and bare-token equality for Enter. A stale
 * guard fails soft (nothing is removed) rather than eating unrelated text.
 */
export type ConsumeGuard =
  | { kind: 'span'; span: { start: number; end: number; draftRev: number } }
  | { kind: 'bare-token'; token: string }

const pendingConsume = new Map<string, ConsumeGuard>()

export function setPendingConsume(sessionId: string, guard: ConsumeGuard): void {
  pendingConsume.set(sessionId, guard)
}

export function takePendingConsume(sessionId: string): ConsumeGuard | undefined {
  const guard = pendingConsume.get(sessionId)
  if (guard !== undefined) pendingConsume.delete(sessionId)
  return guard
}
