/**
 * One error boundary around the overlay body.
 *
 * Why a local one: a throw inside a host slot is swallowed by the host's own boundary, which leaves a
 * blank rectangle with no way back — the user cannot even close it. Catching here keeps the failure
 * visible (the message) and dismissible (the close button).
 */

import { Component, createElement as h, type ErrorInfo, type ReactNode } from 'react'
import { errorMessage } from '../logic'

export interface OverlayBoundaryProps {
  /** Closes the overlay from the fallback: an unclosable error card would trap the composer. */
  onClose: () => void
  children: ReactNode
}

interface OverlayBoundaryState {
  error: unknown
}

export class OverlayBoundary extends Component<OverlayBoundaryProps, OverlayBoundaryState> {
  state: OverlayBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): OverlayBoundaryState {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Nothing to report to: the host keeps slot errors private, so the console is the only sink.
    console.error('dsh-catdogtrace: overlay crashed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return h('div', { className: 'cdt-backdrop' }, h('div', { className: 'cdt-card' },
      h('div', { className: 'cdt-head' },
        h('span', { className: 'cdt-title' }, '猫狗判定'),
        h('button', {
          type: 'button',
          className: 'cdt-close',
          'aria-label': '关闭',
          onClick: () => { this.props.onClose() },
        }, '×'),
      ),
      h('div', { className: 'cdt-body' },
        h('div', { className: 'cdt-block' },
          h('p', { className: 'cdt-error' }, `浮层出错了：${errorMessage(error)}`),
          h('p', { className: 'cdt-notice' }, '关掉浮层再输入 /catdog 可以重来。'),
        ),
      ),
    ))
  }
}
