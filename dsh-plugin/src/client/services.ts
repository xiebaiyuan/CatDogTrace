/**
 * The host web-half surface this plugin consumes — re-declared structurally, not imported.
 *
 * Why re-declare instead of importing the host's own types: the host ships as a packed application,
 * so a build-time dependency on its internal type packages would tie this package's compile to one
 * exact host layout. The surface below is what the reference client plugin (`dsh-context`) actually
 * calls, and every member is read defensively at runtime, so an older host degrades instead of
 * throwing.
 */

import type { ComponentType } from 'react'

/** One slot registration. `inject` contributes plain props; the framework's `hooks` compartment becomes `use<Name>` props. */
export interface SlotRegistration {
  name: string
  id?: string
  order?: number
  key?: string
  /** Slot-face injector: receives the session id and returns the extra props the component needs. */
  inject?: (sessionId?: string) => unknown
  label?: () => string
}

/** The props a slot component receives: the standard session kit plus whatever `inject` returned. */
export type SlotProps = { sessionId?: string } & Record<string, unknown>

export interface SlotsService {
  /** Run `callback` once the named slot exists; the returned value is the registration's disposer. */
  inject(name: string, callback: () => unknown): unknown
  register(registration: SlotRegistration, component: (props: SlotProps) => unknown): unknown
  /** The slot ledger's raw entries; absent on older hosts, which switches the duplicate-mount guard off. */
  entries?(name: string): unknown
}

/**
 * The slice of the Cordis context this plugin touches.
 *
 * `effect` and `inject` are Cordis verbs; `get` reads a sibling service by key. Typing them here
 * keeps the client bundle free of any `@deepseek-ai/*` value import (type-only would be erased, but
 * the structural shape also documents exactly how little of the harness is borrowed).
 */
export interface ClientCtx {
  slots: SlotsService
  effect(callback: () => unknown, label?: string): unknown
  inject(names: readonly string[], callback: (ctx: ClientCtx) => void): unknown
  get(name: string): unknown
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * True when this slot already carries a registration with our id.
 *
 * The client-plugin runner stamps every registration with a fresh priority, so the slot registry's
 * own same-priority de-duplication never fires; without this guard a re-composition mounts a second
 * copy of the overlay against the same store. Fail-open: an absent or hostile ledger reports false,
 * because refusing to mount over a bad read is worse than mounting twice.
 */
export function entrySeated(ctx: ClientCtx, name: string, id: string): boolean {
  try {
    const entries = ctx.slots.entries?.(name)
    if (!Array.isArray(entries)) return false
    for (const entry of entries) {
      const options = asRecord(asRecord(entry)?.options)
      if (options !== null && options.id === id) return true
    }
    return false
  } catch {
    return false
  }
}

/** One `/`-trigger menu entry. */
export interface TriggerCandidate {
  name: string
  label?: string
  /** Group heading; its presence suppresses the menu's raw source-title row. */
  section?: string
  description?: string
  icon?: ComponentType<{ size?: number }>
}

/** Pick-moment snapshot of the trigger token (draftRev compare-and-swap). */
export interface TokenSpan {
  start: number
  end: number
  draftRev: number
}

export interface TriggerPick {
  candidate: TriggerCandidate
  session: { sessionId: string }
  position: string
  via: string
  span: TokenSpan
}

/** `'handled'` keeps the pick/enter out of the host's own routing. */
export type SourcePickOutcome = 'handled' | undefined

/** The harness input-trigger service (`ctx.inputTriggers`). */
export interface InputTriggersFace {
  registerSource(source: {
    trigger: '/'
    name: string
    order?: number
    candidates(
      session: { sessionId: string },
      request: { query: string; position: string; signal: AbortSignal },
    ): Promise<readonly TriggerCandidate[]>
    onPick(pick: TriggerPick): SourcePickOutcome
    matchEnter?(
      session: { sessionId: string },
      line: string,
      signal: AbortSignal,
    ): Promise<SourcePickOutcome>
  }): () => void
}

export interface SessionScopeFace {
  bail(subject: unknown, event: string, payload: unknown): unknown
}

/** `ctx.sessions`: used only to hand back the token guard when the overlay closes. */
export interface SessionsFace {
  scope(id: string): SessionScopeFace | undefined
}
