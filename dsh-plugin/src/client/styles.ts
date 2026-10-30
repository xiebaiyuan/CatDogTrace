/**
 * The panel's stylesheet, injected as one `<style>` tag.
 *
 * No Tailwind, no CSS-module pipeline, no lightningcss: the whole surface is one hand-written sheet,
 * so the build carries no CSS machinery at all. Colours come from the host's `--dsw-*` design tokens
 * with literal fallbacks, which is what makes the panel follow the page theme (light, dark, or the
 * user's custom one) instead of hard-coding a palette.
 *
 * Layout note: this fills a narrow right-hand column, so there is no fixed positioning, no backdrop and
 * no max-width — the column owns the frame, the panel owns only the scroll.
 *
 * The tag is attributed two ways on purpose: `data-plugin` is the loader's own bookkeeping attribute
 * (it evicts a plugin's styles when the plugin unloads), and `data-plugin-css` is the per-sheet key
 * that makes a second injection a no-op.
 */

import { PACKAGE_NAME, STYLE_TAG_ID } from './meta'

const CSS = `
.cdt-chip { font-size: 12px; }
.cdt-panel {
  box-sizing: border-box; height: 100%; overflow-y: auto; overscroll-behavior: contain;
  padding: 10px 12px 16px;
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 12.5px; line-height: 1.55;
}
.cdt-status { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.cdt-status-ok { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-status-bad { font-size: 11.5px; color: var(--dsw-alias-label-error, #d1242f); }
.cdt-block { border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08)); padding: 10px 0 4px; }
.cdt-block-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.cdt-block-title { font-weight: 600; font-size: 12.5px; letter-spacing: 0.02em; }
.cdt-hint { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-progress {
  margin-left: auto; font-size: 11.5px; font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.cdt-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 4px; }
.cdt-btn {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14));
  background: transparent; color: var(--dsw-alias-label-primary, #1a1a1a);
  font: inherit; font-size: 11.5px; padding: 3px 9px; border-radius: 6px; cursor: pointer;
  transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
}
.cdt-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.cdt-btn:disabled { cursor: default; opacity: 0.45; background: transparent; }
.cdt-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #1f6feb);
  border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff);
}
.cdt-btn-primary:hover { filter: brightness(1.05); }
.cdt-challenge { margin-bottom: 10px; }
.cdt-challenge-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.cdt-challenge-name { font-weight: 600; font-size: 11.5px; }
.cdt-threshold {
  font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280);
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
}
.cdt-prompt {
  margin: 0; padding: 8px 10px; max-height: 132px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11px; line-height: 1.6;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04));
  border-radius: 8px;
}
.cdt-textarea {
  width: 100%; box-sizing: border-box; min-height: 92px; resize: vertical;
  padding: 6px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14));
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11px; line-height: 1.5;
}
.cdt-textarea:focus { outline: 2px solid var(--dsw-alias-button-primary-fill, #1f6feb); outline-offset: -1px; }
.cdt-segs { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cdt-seg { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04)); }
.cdt-seg-index { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-seg-ok { font-size: 11.5px; font-family: var(--dsw-font-family-mono, ui-monospace, monospace); }
.cdt-seg-bad { font-size: 11.5px; font-family: var(--dsw-font-family-mono, ui-monospace, monospace); color: var(--dsw-alias-label-error, #d1242f); }
.cdt-warn { margin: 6px 0; font-size: 11.5px; color: var(--dsw-alias-label-warning, #bf8700); }
.cdt-error { margin: 6px 0; font-size: 11.5px; color: var(--dsw-alias-label-error, #d1242f); white-space: pre-wrap; }
.cdt-disclosure { margin-top: 10px; }
.cdt-summary { cursor: pointer; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-summary:hover { color: var(--dsw-alias-label-primary, #1a1a1a); }
.cdt-bars { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 12px; }
.cdt-bar-row { display: grid; grid-template-columns: 56px 1fr 52px; align-items: center; gap: 8px; font-size: 11.5px; }
.cdt-bar-track { height: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08)); overflow: hidden; }
.cdt-bar-fill { height: 100%; border-radius: 4px; background: var(--dsw-alias-button-primary-fill, #1f6feb); }
.cdt-bar-fill-cat { background: var(--dsw-alias-label-warning, #bf8700); }
.cdt-bar-value { text-align: right; font-family: var(--dsw-font-family-mono, monospace); }
.cdt-champion { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 2px; }
.cdt-champion-text { display: flex; flex-direction: column; line-height: 1.25; }
.cdt-champion-name { font-size: 15px; font-weight: 600; }
.cdt-champion-value { font-family: var(--dsw-font-family-mono, monospace); font-size: 12.5px; }
.cdt-result { margin-top: 8px; }
.cdt-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cdt-table th {
  text-align: left; font-weight: 600; font-size: 10.5px; letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary, #6b7280); padding: 4px 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
}
.cdt-table td { padding: 3px 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06)); }
.cdt-table td.cdt-num { text-align: right; font-family: var(--dsw-font-family-mono, monospace); }
.cdt-breed { display: flex; align-items: center; gap: 6px; }
/* The avatars are opaque cream squares, not cut-outs: a radius and a hairline keep them from reading as
   pasted paper on a dark page. A real border rather than an inset box-shadow, because an <img> IS the
   replaced content — an inset shadow paints under it and never shows. */
.cdt-avatar {
  flex: none; box-sizing: border-box; object-fit: cover; background: transparent;
  border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
}
.cdt-avatar-lg { border-radius: 10px; }
.cdt-rank { color: var(--dsw-alias-label-secondary, #6b7280); font-family: var(--dsw-font-family-mono, monospace); }
.cdt-tag { font-size: 10.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-rejected { margin: 6px 0 0; padding-left: 18px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-foot {
  margin-top: 14px; padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280);
}
.cdt-foot a { color: inherit; text-decoration: underline; }
`

/** Inject the sheet once; returns the disposer the caller hands to `ctx.effect`. */
export function injectStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = PACKAGE_NAME
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => {
    tag.remove()
  }
}
