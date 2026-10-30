/**
 * Bank admission: turn an `unknown` payload into the readable `BankDocument` view.
 *
 * The check is deliberately the same one the browser build makes (`static/fingerprint-core.js:167-172`) —
 * deep validation of a 1.2MB artifact buys nothing the first `analyzeGlobalOutputs` call would not
 * surface anyway, and a cryptic mid-computation `undefined` is worse than a plain message.
 */

import type { Bank, BankDocument } from './api'

/** Message shipped by the browser build; the UI shows it verbatim, so keep it identical. */
export const EMPTY_BANK_MESSAGE = '指纹库为空：models 字段缺失或没有条目。'

/**
 * Narrow an opaque bank to `BankDocument`, throwing on a payload without models.
 *
 * `Bank` is `unknown` by contract (`api.ts:22`), so every entry point that needs the inside has to
 * come through here. The check is two comparisons — cheap enough to repeat at each boundary.
 */
export function assertBankDocument(raw: Bank): BankDocument {
  if (typeof raw !== 'object' || raw === null) throw new Error(EMPTY_BANK_MESSAGE)
  const candidate = raw as { models?: unknown }
  if (!Array.isArray(candidate.models) || candidate.models.length === 0) throw new Error(EMPTY_BANK_MESSAGE)
  return raw as BankDocument
}

/** Port of `fingerprint.py:171-173` / `static/fingerprint-core.js:167-172`. */
export function loadBank(raw: unknown): Bank {
  return assertBankDocument(raw)
}
