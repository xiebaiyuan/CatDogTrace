/**
 * Copy to clipboard, with the fallback every non-secure context needs.
 *
 * `navigator.clipboard` is undefined outside a secure context and rejects when the document is not
 * focused; the overlay is opened by a keyboard shortcut, so both happen in practice. The fallback is
 * the same one `static/pages-app.js` uses (a hidden textarea + `execCommand`), kept here so a
 * silently failed copy cannot look like a successful one: the caller gets a boolean.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through to the selection-based path.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    // Off-screen rather than display:none — a hidden element cannot be selected.
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}
