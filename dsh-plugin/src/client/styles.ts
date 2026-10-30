/**
 * The overlay's stylesheet, injected as one `<style>` tag.
 *
 * No Tailwind, no CSS-module pipeline, no lightningcss: the whole surface is one hand-written sheet,
 * so the build carries no CSS machinery at all. Colours come from the host's `--dsw-*` design tokens
 * with literal fallbacks, which is what makes the overlay follow the page theme (light, dark, or the
 * user's custom one) instead of hard-coding a palette.
 *
 * The tag is attributed two ways on purpose: `data-plugin` is the loader's own bookkeeping attribute
 * (it evicts a plugin's styles when the plugin unloads), and `data-plugin-css` is the per-sheet key
 * that makes a second injection a no-op.
 */

import { PACKAGE_NAME, STYLE_TAG_ID } from './meta'

const CSS = `
.cdt-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.45));
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.cdt-card {
  width: min(780px, 100%); max-height: min(86vh, 900px);
  display: flex; flex-direction: column; box-sizing: border-box;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0, 0, 0, 0.35));
  color: var(--dsw-alias-label-primary, #1a1a1a);
  font-size: 13px; line-height: 1.55;
}
.cdt-head { display: flex; align-items: center; gap: 10px; padding: 14px 18px 10px; flex: none; }
.cdt-title { font-weight: 600; font-size: 14px; }
.cdt-sub { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }
.cdt-close {
  margin-left: auto; border: 0; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-secondary, #6b7280); font: inherit; font-size: 18px; line-height: 1;
  padding: 2px 6px; border-radius: 6px;
}
.cdt-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); color: var(--dsw-alias-label-primary, #1a1a1a); }
.cdt-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 18px 14px; }
.cdt-block { border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08)); padding: 12px 0 4px; }
.cdt-block-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cdt-block-title { font-weight: 600; font-size: 12.5px; letter-spacing: 0.02em; }
.cdt-count { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }
.cdt-actions { margin-left: auto; display: flex; gap: 8px; }
.cdt-btn {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14));
  background: transparent; color: var(--dsw-alias-label-primary, #1a1a1a);
  font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
  transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
}
.cdt-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }
.cdt-btn:disabled { cursor: default; opacity: 0.5; background: transparent; }
.cdt-btn-primary {
  background: var(--dsw-alias-button-primary-fill, #1f6feb);
  border-color: transparent; color: var(--dsw-alias-label-primary-foreground, #fff);
}
.cdt-btn-primary:hover { filter: brightness(1.05); }
.cdt-challenge { margin-bottom: 10px; }
.cdt-challenge-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.cdt-challenge-name { font-weight: 600; font-size: 12px; }
.cdt-prompt {
  margin: 0; padding: 8px 10px; max-height: 132px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11.5px; line-height: 1.6;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04));
  border-radius: 8px;
}
.cdt-empty { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }
.cdt-field { display: block; margin-bottom: 10px; }
.cdt-field-label { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; font-size: 12px; }
.cdt-threshold { color: var(--dsw-alias-label-secondary, #6b7280); font-family: var(--dsw-font-family-mono, monospace); }
.cdt-textarea {
  width: 100%; box-sizing: border-box; min-height: 76px; resize: vertical;
  padding: 6px 8px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.14));
  background: var(--dsw-alias-bg-layer-1, #fff); color: inherit;
  font-family: var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11.5px; line-height: 1.5;
}
.cdt-textarea:focus { outline: 2px solid var(--dsw-alias-button-primary-fill, #1f6feb); outline-offset: -1px; }
.cdt-disclosure { margin-top: 4px; }
.cdt-summary { cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-summary:hover { color: var(--dsw-alias-label-primary, #1a1a1a); }
.cdt-notice { margin: 6px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-error { margin: 6px 0; font-size: 12px; color: var(--dsw-alias-label-error, #d1242f); white-space: pre-wrap; }
.cdt-status { font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-bars { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.cdt-bar-row { display: grid; grid-template-columns: 92px 1fr 56px; align-items: center; gap: 8px; font-size: 12px; }
.cdt-bar-track { height: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08)); overflow: hidden; }
.cdt-bar-fill { height: 100%; border-radius: 4px; background: var(--dsw-alias-button-primary-fill, #1f6feb); }
.cdt-bar-fill-cat { background: var(--dsw-alias-label-warning, #bf8700); }
.cdt-bar-value { text-align: right; font-family: var(--dsw-font-family-mono, monospace); }
.cdt-champion { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.cdt-champion-name { font-size: 16px; font-weight: 600; }
.cdt-champion-value { font-family: var(--dsw-font-family-mono, monospace); font-size: 13px; }
.cdt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cdt-table th {
  text-align: left; font-weight: 600; font-size: 11px; letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary, #6b7280); padding: 4px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
}
.cdt-table td { padding: 3px 6px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.06)); }
.cdt-table td.cdt-num { text-align: right; font-family: var(--dsw-font-family-mono, monospace); }
.cdt-rank { color: var(--dsw-alias-label-secondary, #6b7280); font-family: var(--dsw-font-family-mono, monospace); }
.cdt-tag { font-size: 11px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-rejected { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b7280); }
.cdt-foot {
  flex: none; border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
  padding: 8px 18px 12px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #6b7280);
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
