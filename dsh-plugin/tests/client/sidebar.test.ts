/**
 * The sidebar registration: three calls, one identity.
 *
 * A fake context records what the plugin asks the host to register. The registry itself throws on a
 * duplicate `id` or a kind collision, so the assertions here are the ones that would otherwise only
 * show up as a blank tab on a user's machine.
 */

import { describe, expect, it, vi } from 'vitest'
import { CatdogIcon, mountSidebarTab } from '../../src/client/sidebar'
import { CatdogPanel } from '../../src/client/components/catdogPanel'
import type { ClientCtx, SidebarTabDefinition, SlotProps, SlotRegistration } from '../../src/client/services'

interface Captured {
  tab: SidebarTabDefinition | null
  slots: Array<{ registration: SlotRegistration; component: (props: SlotProps) => unknown }>
  slotWaits: string[]
  disposed: number
}

interface FakeOptions {
  /** Registry face to hand back; `undefined` models an older host without the service. */
  tabs?: unknown
  /** Throw from `register`, as the real registry does on a duplicate id. */
  registerThrows?: boolean
  /** What `slots.entries()` reports for our key, to exercise the duplicate-mount guard. */
  seated?: boolean
}

function fakeCtx(options: FakeOptions = {}): { ctx: ClientCtx; captured: Captured } {
  const captured: Captured = { tab: null, slots: [], slotWaits: [], disposed: 0 }
  const tabs = options.tabs === undefined
    ? {
      register(definition: SidebarTabDefinition): () => void {
        if (options.registerThrows === true) throw new Error('sidebarRight: tab type id "dsh-catdogtrace" is already registered')
        captured.tab = definition
        return () => { captured.disposed += 1 }
      },
    }
    : options.tabs

  const scoped: ClientCtx = {
    slots: {
      inject(name: string, callback: () => unknown): unknown {
        captured.slotWaits.push(name)
        return callback()
      },
      register(registration: SlotRegistration, component: (props: SlotProps) => unknown): unknown {
        captured.slots.push({ registration, component })
        return () => { captured.disposed += 1 }
      },
      entries(name: string): unknown {
        if (options.seated !== true || name !== 'sidebar.right.pane.tab') return []
        return [{ options: { key: 'dsh-catdogtrace' } }]
      },
    },
    effect(callback: () => unknown): unknown { return callback() },
    inject(): void {},
    get(name: string): unknown { return name === 'sidebarRightTabs' ? tabs : undefined },
  }

  const ctx: ClientCtx = {
    ...scoped,
    inject(_names: readonly string[], callback: (inner: ClientCtx) => void): unknown {
      callback(scoped)
      return undefined
    },
  }
  return { ctx, captured }
}

describe('右侧栏 tab 注册', () => {
  it('注册一个带命名空间的 kind，标题与引导项都在', () => {
    const { ctx, captured } = fakeCtx()
    mountSidebarTab(ctx)

    expect(captured.tab).not.toBeNull()
    const tab = captured.tab as SidebarTabDefinition
    expect(tab.id).toBe('dsh-catdogtrace')
    expect(tab.kind).toBe('dsh-catdogtrace')
    expect(tab.title()).toBe('猫狗判定')
    expect(tab.guide).toHaveLength(1)
    expect(tab.guide?.[0].order).toBe(20)
    expect(tab.guide?.[0].title()).toBe('猫狗判定')
    expect(tab.guide?.[0].description?.()).toContain('犬猫品种')
    expect(tab.guide?.[0].icon).toBe(CatdogIcon)
  })

  it('两个 keyed 席位都等到了槽位声明，并用 tab id 作 key', () => {
    const { ctx, captured } = fakeCtx()
    mountSidebarTab(ctx)

    expect(captured.slotWaits).toEqual(['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
    expect(captured.slots.map(entry => entry.registration.name))
      .toEqual(['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title'])
    expect(captured.slots.map(entry => entry.registration.key))
      .toEqual(['dsh-catdogtrace', 'dsh-catdogtrace'])
  })

  it('正文席位挂的是面板本体，标题席位是个组件', () => {
    const { ctx, captured } = fakeCtx()
    mountSidebarTab(ctx)

    expect(captured.slots[0].component).toBe(CatdogPanel)
    expect(typeof captured.slots[1].component).toBe('function')
  })

  it('宿主没有 sidebarRightTabs 时安静退出，不注册也不抛', () => {
    const { ctx, captured } = fakeCtx({ tabs: undefined })
    // The fake only answers the service when it was provided; blank it out to model the old host.
    const old: ClientCtx = { ...ctx, inject: (_names, callback) => { callback({ ...ctx, get: () => undefined }) } }
    mountSidebarTab(old)

    expect(captured.tab).toBeNull()
    expect(captured.slots).toHaveLength(0)
  })

  it('注册被拒（重复 id）时不抛给宿主，并释放已拿到的东西', () => {
    const { ctx, captured } = fakeCtx({ registerThrows: true })
    // The plugin logs the refusal on purpose; the test asserts it does not become a host-level throw.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => { mountSidebarTab(ctx) }).not.toThrow()
    } finally {
      quiet.mockRestore()
    }
    expect(captured.tab).toBeNull()
  })

  it('同一 key 已经坐好了就不再注册第二份', () => {
    const { ctx, captured } = fakeCtx({ seated: true })
    mountSidebarTab(ctx)

    expect(captured.tab).toBeNull()
    expect(captured.slots).toHaveLength(0)
  })
})
