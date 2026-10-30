/**
 * One error boundary around the panel body.
 *
 * Why a local one: a throw inside a host slot is swallowed by the host's own boundary, which leaves a
 * blank tab body with no explanation. Catching here keeps the failure visible and says how to retry
 * (switch tabs and come back), since the panel has no close button of its own.
 */

import { Component, createElement as h, type ErrorInfo, type ReactNode } from 'react'
import { errorMessage } from '../logic'

export interface PanelBoundaryProps {
  children: ReactNode
}

interface PanelBoundaryState {
  error: unknown
}

export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  state: PanelBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): PanelBoundaryState {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Nothing to report to: the host keeps slot errors private, so the console is the only sink.
    console.error('dsh-catdogtrace: panel crashed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children
    return h('div', { className: 'cdt-panel' },
      h('p', { className: 'cdt-error' }, `面板出错了：${errorMessage(error)}`),
      h('p', { className: 'cdt-hint' }, '切到别的标签再切回来可以重来。'),
    )
  }
}
