/**
 * Escape closes the overlay.
 *
 * Capture phase, not bubble: the harness routes Escape on the bubble phase, so a bubble-phase
 * listener loses the key to the shell's own handler (which would close something else, or nothing).
 */

import { useEffect, useRef } from 'react'

function isBareEscape(event: KeyboardEvent): boolean {
  return event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

export function useEscapeClose(active: boolean, onClose: () => void): void {
  // A latest-ref, so a per-render resubscribe cannot yank focus out of a textarea mid-typing.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active) return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isBareEscape(event)) return
      // During IME composition Escape belongs to the input method, not the dialog.
      if (event.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      if (previous !== null && document.contains(previous)) previous.focus()
    }
  }, [active])
}
