/**
 * Built-artifact test: load `lib/client.js` and its lazy chunk the way the host does.
 *
 * `render.test.ts` mocks `src/core` on purpose (so a unit run does not pay for the 700KB bank), which
 * leaves the riskiest seam uncovered: the compiled `require.async("./client.unified_bank.js")` request
 * and the chunk that must answer it. Those only exist after a build, and they fail on a user's machine
 * where nobody can attach a debugger — so this file runs the real artifacts with no mocks at all.
 *
 * The harness mirrors `@deepseek-ai/dsh-client-modules` as shipped in the host:
 * - `window.__ModuleLoader__.load({ id, factory })` captures one factory per script;
 * - the factory receives a `require` that only answers the frozen platform table (`react`,
 *   `react/jsx-runtime`) and throws `missed the module table` otherwise;
 * - `require.async("./<file>")` accepts only `client.<name>.js` and fetches that sibling script,
 *   which must register itself with `chunk: "<file>"` under the same package id.
 *
 * It evaluates the bundles in this file's own jsdom window (not a private one) so the last test can
 * mount the real overlay with real React and let the plugin's own `loadBankChunk()` reach the chunk.
 *
 * Deliberately no silent skip in the precondition: CI runs this after `pnpm run build`, so a missing
 * artifact has to be a red test, not a green no-op.
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { analyzeGlobalOutputs, assertBankDocument } from '../../src/core'

const PACKAGE_ID = 'dsh-catdogtrace'
const ENTRY = 'lib/client.js'
const BANK_CHUNK = 'client.unified_bank.js'

/** The loader's own chunk grammar, copied from `@deepseek-ai/dsh-client-modules`. */
const CHUNK_FILE_NAME = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

/** The frozen module table's words this plugin is allowed to ask for. */
const PLATFORM_MODULES = new Set(['react', 'react/jsx-runtime'])

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const nodeRequire = createRequire(join(packageRoot, 'package.json'))

interface Registration {
  id: string
  chunk?: string
  factory(require: LoaderRequire): Record<string, unknown>
}

interface LoaderRequire {
  (specifier: string): unknown
  async(specifier: string): Promise<Record<string, unknown>>
}

/** Fail loudly with a relative path only: the message must read the same on any machine. */
function requireArtifact(relative: string): void {
  if (existsSync(join(packageRoot, relative))) return
  throw new Error(
    `构建产物缺失：dsh-plugin/${relative}。先跑 pnpm run build —— CI 在 build 之后才跑测试，`
    + '这里不静默跳过，缺产物就是红的。',
  )
}

/** One eval'd bundle script, as the host's `<script>` would run it. */
function evaluateBundle(relative: string, registrations: Registration[]): void {
  const before = registrations.length
  // Evaluated in the ambient jsdom window: `window.__ModuleLoader__` is the one installed below.
  window.eval(readFileSync(join(packageRoot, relative), 'utf8'))
  const added = registrations.length - before
  if (added !== 1) {
    throw new Error(`dsh-plugin/${relative} 应注册 1 条 factory，实际 ${added} 条`)
  }
}

function makeLoaderRequire(registrations: Registration[]): LoaderRequire {
  const chunks = new Map<string, Record<string, unknown>>()

  const loadChunk = (specifier: string): Record<string, unknown> => {
    if (!specifier.startsWith('./')) {
      throw new Error(`client-modules: require.async 只接受包内相对 chunk，收到 ${specifier}`)
    }
    const fileName = specifier.slice(2)
    if (!CHUNK_FILE_NAME.test(fileName)) {
      throw new Error(`client-modules: invalid relative chunk request ${JSON.stringify(specifier)}`)
    }
    const cached = chunks.get(fileName)
    if (cached !== undefined) return cached
    const relative = `lib/${fileName}`
    // The host serves `/plugins/<package>/<file>` and 404s an unknown name; a missing local artifact
    // is the same failure one step earlier.
    if (!existsSync(join(packageRoot, relative))) {
      throw new Error(`client-modules: ${relative} 不存在（宿主在这里会 404）`)
    }
    evaluateBundle(relative, registrations)
    const registration = registrations[registrations.length - 1]
    // The module-table key is `${ownerId}/${fileName}`, so a chunk that does not report its own file
    // name would register under the owner id and collide with the entry.
    expect(registration.id).toBe(PACKAGE_ID)
    expect(registration.chunk).toBe(fileName)
    const exports = registration.factory(makeLoaderRequire(registrations))
    chunks.set(fileName, exports)
    return exports
  }

  const require = ((specifier: string) => {
    if (PLATFORM_MODULES.has(specifier)) return nodeRequire(specifier)
    throw new Error(`client-modules: require("${specifier}") missed the module table`)
  }) as LoaderRequire
  require.async = (specifier: string) => Promise.resolve().then(() => loadChunk(specifier))
  return require
}

interface LoadedArtifact {
  plugin: Record<string, unknown>
  require: LoaderRequire
  registrations: Registration[]
}

/** Install the loader facade, evaluate the entry, and hand back its factory product. */
function loadArtifact(): { artifact: LoadedArtifact; restore(): void } {
  requireArtifact(ENTRY)
  requireArtifact(`lib/${BANK_CHUNK}`)

  const registrations: Registration[] = []
  const previous = (window as unknown as { __ModuleLoader__?: unknown }).__ModuleLoader__
  ;(window as unknown as { __ModuleLoader__: { load(entry: Registration): void } }).__ModuleLoader__ = {
    load: (entry) => { registrations.push(entry) },
  }
  const restore = (): void => {
    if (previous === undefined) delete (window as unknown as { __ModuleLoader__?: unknown }).__ModuleLoader__
    else (window as unknown as { __ModuleLoader__?: unknown }).__ModuleLoader__ = previous
  }

  evaluateBundle(ENTRY, registrations)
  const require = makeLoaderRequire(registrations)
  return { artifact: { plugin: registrations[0].factory(require), require, registrations }, restore }
}

/**
 * A deterministic, in-range answer: 240 pseudo-random integers in 1..355.
 *
 * `expected_count: 240` sets the threshold to `max(80, ceil(240 * 0.55)) = 132`, so this passes the
 * admission gate without being a regular sequence.
 */
function sampleAnswer(count = 240): string {
  let seed = 20261029
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    values.push((seed % 355) + 1)
  }
  return values.join(' ')
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await new Promise(resolve => setTimeout(resolve, 5))
}

/** The registration's injected props for one session: `{ modalStore }`, freshly built per call. */
interface OverlayRegistration {
  inject?: (sessionId?: string) => Record<string, unknown>
  component: ComponentType<Record<string, unknown>>
}

/**
 * Apply the artifact with a stub host context and return the overlay registration it made.
 *
 * `slots.inject` is called back immediately (the real one waits for the slot declaration, which in
 * this stub does not exist), which is the same shape the host takes on first composition.
 */
function applyArtifact(artifact: LoadedArtifact): OverlayRegistration {
  let overlay: OverlayRegistration | undefined
  const ctx = {
    slots: {
      inject(_name: string, callback: () => unknown): unknown { return callback() },
      register(registration: { inject?: (sessionId?: string) => Record<string, unknown> }, component: ComponentType<Record<string, unknown>>): unknown {
        overlay = { inject: registration.inject, component }
        return () => {}
      },
    },
    effect(callback: () => unknown): unknown { return callback() },
    // `inputTriggers` never arrives in this stub, so the `/catdog` source stays unregistered — the
    // overlay is what this test is about.
    inject(): void {},
    get(): unknown { return undefined },
  }
  ;(artifact.plugin.apply as (ctx: unknown) => void)(ctx)
  if (overlay === undefined) throw new Error('apply() 没有注册 conversation.input.overlay')
  return overlay
}

const mounted: Array<{ root: Root; host: HTMLDivElement }> = []

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    host.remove()
  }
})

describe('构建产物 lib/client.js', () => {
  it('注册一条 factory，id 是包名，exports 是 name / inject / apply', () => {
    const { artifact, restore } = loadArtifact()
    try {
      expect(artifact.registrations).toHaveLength(1)
      expect(artifact.registrations[0].id).toBe(PACKAGE_ID)
      // The entry must not look like a lazy chunk: the loader keys chunks by `${id}/${file}`.
      expect(Object.hasOwn(artifact.registrations[0], 'chunk')).toBe(false)

      expect(artifact.plugin.name).toBe(PACKAGE_ID)
      expect(artifact.plugin.inject).toEqual(['slots'])
      expect(typeof artifact.plugin.apply).toBe('function')
    } finally {
      restore()
    }
  })
})

describe('构建产物：指纹库 chunk', () => {
  it('require.async 能真加载 client.unified_bank.js，schema 与 24 个品种都在', async () => {
    const { artifact, restore } = loadArtifact()
    try {
      const chunk = await artifact.require.async(`./${BANK_CHUNK}`)
      const raw = chunk.default as { schema?: unknown; models?: unknown[] }

      expect(raw.schema).toBe('robust-number-fingerprint-bank')
      expect(Array.isArray(raw.models)).toBe(true)
      expect(raw.models).toHaveLength(24)
    } finally {
      restore()
    }
  })

  it('入口里那条请求就是 require.async，不是同步 require', () => {
    const code = readFileSync(join(packageRoot, ENTRY), 'utf8')
    expect(code).toContain(`require.async("./${BANK_CHUNK}")`)
    // A relative synchronous require would hit the frozen table and throw at runtime.
    expect(/\brequire\((["'])\.\//.test(code)).toBe(false)
  })

  it('用产物里加载的真指纹库跑一次判定', async () => {
    const { artifact, restore } = loadArtifact()
    try {
      const chunk = await artifact.require.async(`./${BANK_CHUNK}`)
      const bank = assertBankDocument(chunk.default)

      const result = analyzeGlobalOutputs([{ text: sampleAnswer(), expected_count: 240 }], bank)

      expect(typeof result.prediction_name).toBe('string')
      expect(result.prediction_name.length).toBeGreaterThan(0)
      expect(result.family_probabilities).toHaveLength(2)
      expect(result.used_outputs).toBe(1)
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].accepted).toBe(true)
    } finally {
      restore()
    }
  })
})

describe('构建产物：真实组件走完加载链', () => {
  it('挂载浮层后，插件自己的 loadBankChunk() 通过 require.async 把指纹库抓了下来', async () => {
    const { artifact, restore } = loadArtifact()
    try {
      const overlay = applyArtifact(artifact)
      const props: Record<string, unknown> = {
        sessionId: 'artifact-session',
        ...(overlay.inject?.('artifact-session') ?? {}),
      }
      const store = props.modalStore as { set(open: boolean): void }
      store.set(true)

      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)
      mounted.push({ root, host })
      root.render(createElement(overlay.component, props))
      await flush()

      // The status line only reaches this text when the lazy chunk was fetched and admitted.
      expect(host.textContent).toContain('指纹库已就绪：24 个品种')
      expect(host.textContent).toContain('猫狗判定')
    } finally {
      restore()
    }
  })
})
