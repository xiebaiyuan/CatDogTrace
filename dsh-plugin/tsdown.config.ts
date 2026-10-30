import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { join } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'

/**
 * Two artifacts from one source tree.
 *
 * `lib/index.js` is the host half: a plain ESM Cordis plugin, loaded by the loader row that
 * `cordis.patch.yml` inserts.
 *
 * `lib/client.js` is the browser half. It is NOT an ES module and NOT a Node module: the shell
 * loads it as a classic script whose body calls `window.__ModuleLoader__.load({ id, factory })`
 * once, and the factory's `module.exports` becomes the plugin object. That handoff is why the
 * whole bundle has to sit inside the closure written by `makeModuleLoaderWrapper` below — without
 * it the host has nothing to `require`.
 *
 * `lib/client.<name>.js` files are package-local lazy chunks. The loader answers a source
 * `import()` compiled to `require.async('./client.<name>.js')` by fetching that sibling file from
 * the same `/plugins` URL tree; each chunk must register itself with the id
 * `<package>/client.<name>.js`, which is what the wrapper's `chunk:` field does.
 */

interface PackageManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  dsh?: { client?: { external?: string[] } }
}

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageManifest

/** The React runtime the shell seeds into its frozen browser module table (the host's PLATFORM_MODULES). */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
]

const requested = new Set([
  ...PLATFORM_MODULES,
  ...(pkg.dsh?.client?.external ?? []),
])

const productionDeps = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
])

const escapeSpecifier = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const productionPatterns = [...productionDeps].map(name => new RegExp(`^${escapeSpecifier(name)}(/|$)`))
const isProductionDependency = (specifier: string): boolean =>
  productionPatterns.some(pattern => pattern.test(specifier))

const MODULE_LOADER_ID = JSON.stringify(pkg.name)

/**
 * Wrap every emitted client artifact in the loader closure.
 *
 * `renderChunk` rather than `outputOptions.banner`: the closure differs per chunk (the entry has no
 * `chunk` field, a lazy chunk carries its own file name), and this hook hands over the chunk object
 * that says which one this is.
 *
 * It also repairs the chunk request. Rolldown lowers a source `import()` in CJS output to
 * `Promise.resolve().then(() => require("./client.<name>.js"))`, which is wrong twice over here: the
 * loader's `require` is the frozen module table (a sibling chunk is not in it), and the chunk has not
 * been fetched yet. The host's own convention is `require.async("./client.<name>.js")`, which the
 * module system answers by fetching `/plugins/<package>/<file>` and materializing it.
 *
 * The rewrite is a build-time contract, so `generateBundle` asserts it instead of trusting it: a lazy
 * chunk the entry never asks for by name, or any surviving synchronous relative `require`, fails the
 * build.
 */
const ENTRY_FILE = 'client.js'
const SYNC_CHUNK_REQUIRE = /Promise\.resolve\(\)\.then\(\(\)\s*=>\s*require\((["'])(\.\/[^"']+)\1\)\)/g
const ANY_SYNC_RELATIVE_REQUIRE = /\brequire\((["'])\.\//

interface RenderedChunkLike {
  fileName: string
}

interface OutputChunkLike {
  type: string
  fileName: string
  code?: string
}

function moduleLoaderWrapper(): {
  name: string
  renderChunk(code: string, chunk: RenderedChunkLike): string
  generateBundle(options: unknown, bundle: Record<string, OutputChunkLike>): void
} {
  return {
    name: 'dsh-catdogtrace-module-loader',
    renderChunk(code: string, chunk: RenderedChunkLike): string {
      const rewritten = code.replace(
        SYNC_CHUNK_REQUIRE,
        (_match: string, quote: string, specifier: string) => `require.async(${quote}${specifier}${quote})`,
      )
      const isEntry = chunk.fileName === ENTRY_FILE
      const head = isEntry
        ? `window.__ModuleLoader__.load({ id: ${MODULE_LOADER_ID}, factory: (require) => {`
        : `window.__ModuleLoader__.load({ id: ${MODULE_LOADER_ID}, chunk: ${JSON.stringify(chunk.fileName)}, factory: (require) => {`
      return [
        head,
        'var module = { exports: {} }; var exports = module.exports;',
        rewritten,
        'return module.exports; } });',
        '',
      ].join('\n')
    },
    generateBundle(_options: unknown, bundle: Record<string, OutputChunkLike>): void {
      const chunks = Object.values(bundle).filter(entry => entry.type === 'chunk')
      const entry = chunks.find(candidate => candidate.fileName === ENTRY_FILE)
      if (entry === undefined || entry.code === undefined) return
      for (const chunk of chunks) {
        if (chunk.fileName === ENTRY_FILE) continue
        const request = `require.async(${JSON.stringify(`./${chunk.fileName}`)})`
        if (!entry.code.includes(request)) {
          throw new Error(
            `dsh-catdogtrace: lazy chunk ${chunk.fileName} is never reached through ${request} — `
            + 'the loader cannot fetch a chunk the entry does not ask for by name',
          )
        }
      }
      if (ANY_SYNC_RELATIVE_REQUIRE.test(entry.code)) {
        throw new Error('dsh-catdogtrace: a synchronous relative require survived into lib/client.js; the loader module table cannot answer one')
      }
    },
  }
}

const configs: UserConfig[] = [
  {
    name: pkg.name,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    sourcemap: false,
    minify: false,
    clean: true,
    deps: {
      neverBundle: isProductionDependency,
      alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier),
    },
  },
  {
    name: `${pkg.name}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    // A classic script the shell evaluates, not an ES module: `cjs` is what puts `module.exports`
    // in scope for the loader closure.
    format: ['cjs'],
    platform: 'browser',
    // Without an explicit browser-flavoured target tsdown falls back to `engines.node` and trips
    // its legacy-CJS warning.
    target: 'es2024',
    fixedExtension: false,
    // A .d.cts has no meaning for a bundle the browser evaluates; the entry's types are the
    // package root's.
    dts: false,
    sourcemap: false,
    clean: false,
    minify: false,
    deps: {
      // Anything the frozen module table already answers must stay a `require`: bundling React
      // would hand the page a second instance and break hooks.
      neverBundle: (specifier: string) => requested.has(specifier),
      alwaysBundle: (specifier: string) => !requested.has(specifier),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      // Comments in the emitted bundle are build input, not output: dropping them keeps `grep unified_bank`
      // meaning "the one import path" instead of matching the core's prose about the chunk.
      comments: false,
      // Lazy bank chunk lands next to the entry as `client.unified_bank.js`; the loader's chunk
      // grammar is `^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$`.
      chunkFileNames: 'client.[name].js',
    },
    plugins: [moduleLoaderWrapper()],
  },
]

export default defineConfig(configs)
