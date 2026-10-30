/**
 * The right Sidebar tab: the type registration plus the two keyed seats that render its body and chip.
 *
 * Three calls, all inside one `ctx.inject(['sidebarRightTabs'])` because the registry is the only
 * service that must exist first — the seats are keyed slots and `slots.inject` waits for their
 * declarations on its own.
 *
 * The tab mounts when the user opens it: there is no open/closed flag to carry, and the tab bodies the
 * host unmounts on a tab switch read their state back out of the per-session store.
 */

import { createElement as h, type ReactElement } from 'react'
import { CatdogPanel } from './components/catdogPanel'
import {
  GUIDE_ORDER,
  PANE_TAB_SLOT,
  PANE_TAB_TITLE_SLOT,
  TAB_DESCRIPTION,
  TAB_ID,
  TAB_KIND,
  TAB_TITLE,
} from './meta'
import { entrySeated, type ClientCtx, type SidebarTabsFace } from './services'

/** The guide capsule's glyph: a paw, in the harness icon set's line weight. */
export function CatdogIcon({ size = 16 }: { size?: number }): ReactElement {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'currentColor',
    'aria-hidden': 'true',
  },
    h('ellipse', { cx: 8, cy: 11, rx: 3.1, ry: 2.6 }),
    h('ellipse', { cx: 3.5, cy: 7.4, rx: 1.5, ry: 1.8 }),
    h('ellipse', { cx: 6.5, cy: 4.6, rx: 1.5, ry: 1.8 }),
    h('ellipse', { cx: 9.5, cy: 4.6, rx: 1.5, ry: 1.8 }),
    h('ellipse', { cx: 12.5, cy: 7.4, rx: 1.5, ry: 1.8 }),
  )
}

/** The chip the tab strip draws; the host owns the wrapper, this is its content. */
function CatdogTabTitle(): ReactElement {
  return h('span', { className: 'cdt-chip' }, TAB_TITLE)
}

export function mountSidebarTab(ctx: ClientCtx): void {
  ctx.inject(['sidebarRightTabs'], (scoped) => {
    const tabs = scoped.get('sidebarRightTabs') as SidebarTabsFace | undefined
    if (tabs === undefined || typeof tabs.register !== 'function') return
    // A second registration of the same id throws inside the registry, so refuse before trying.
    if (entrySeated(scoped, PANE_TAB_SLOT, TAB_ID)) return

    scoped.effect(() => {
      const disposers: (() => void)[] = []
      const own = (result: unknown): void => {
        if (typeof result === 'function') disposers.push(result as () => void)
      }
      try {
        own(tabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          title: () => TAB_TITLE,
          guide: [{
            // Pin identity is `kind:id`, so this only has to be unique inside this one registration.
            id: TAB_ID,
            order: GUIDE_ORDER,
            title: () => TAB_TITLE,
            description: () => TAB_DESCRIPTION,
            icon: CatdogIcon,
          }],
        }))
        own(scoped.slots.inject(PANE_TAB_SLOT, () => scoped.slots.register(
          { name: PANE_TAB_SLOT, key: TAB_ID },
          CatdogPanel,
        )))
        own(scoped.slots.inject(PANE_TAB_TITLE_SLOT, () => scoped.slots.register(
          { name: PANE_TAB_TITLE_SLOT, key: TAB_ID },
          CatdogTabTitle,
        )))
      } catch (error) {
        for (const dispose of disposers) dispose()
        console.error('dsh-catdogtrace: sidebar tab registration failed', error)
        return () => {}
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-catdogtrace: sidebar tab')
  })
}
