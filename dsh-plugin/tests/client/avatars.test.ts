/**
 * The breed avatars: the generator's key set, and the loader's cache.
 *
 * Two things are asserted here that a reviewer cannot eyeball: that the committed module's keys are
 * exactly the fingerprint bank's 24 model ids (a silent mis-pairing would put a Persian face on the
 * Samoyed row and nothing else would notice), and that the loader resolves the lazy chunk once.
 *
 * The generator is exercised as a black-box CLI: it is run into a temp directory, twice, and against
 * three broken inputs it must reject. That keeps the test honest about the real entry point instead of
 * re-implementing its checks.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBreedAvatars } from '../../src/client/avatars'
import breedAvatars from '../../src/client/assets/avatars'
import bankDocument from '../../src/core/bank/unified_bank'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const repoRoot = join(packageRoot, '..')
const SCRIPT = join(packageRoot, 'scripts', 'gen-avatars.mjs')
const SOURCE_DIR = join(repoRoot, 'static', 'assets', 'breeds')
const COMMITTED = join(packageRoot, 'src', 'client', 'assets', 'avatars.ts')

/** The bank's 24 model ids, which are exactly the keys the avatars must carry. */
const BANK_IDS = (bankDocument as { models: { id: string }[] }).models.map(model => model.id).sort()

const scratch: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'catdog-avatars-'))
  scratch.push(dir)
  return dir
}

function runGenerator(env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('指纹库与头像的键集', () => {
  it('指纹库是 24 个品种', () => {
    expect(BANK_IDS).toHaveLength(24)
  })

  it('生成物的键集严格等于指纹库的 id，一个不多一个不少', () => {
    expect(Object.keys(breedAvatars).slice().sort()).toEqual(BANK_IDS)
  })

  it('每个值都是 PNG data URI，且解码后是 PNG 字节', () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    for (const [id, uri] of Object.entries(breedAvatars)) {
      expect(uri.startsWith('data:image/png;base64,'), id).toBe(true)
      const bytes = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64')
      expect(bytes.subarray(0, signature.length).equals(signature), id).toBe(true)
      expect(bytes.length, id).toBeGreaterThan(0)
    }
  })
})

describe('gen-avatars.mjs', () => {
  it('连跑两次逐字节相同，且与仓库里提交的生成物一致', () => {
    const first = join(tempDir(), 'first.ts')
    const second = join(tempDir(), 'second.ts')

    expect(runGenerator({ CATDOG_AVATAR_TARGET: first }).status).toBe(0)
    expect(runGenerator({ CATDOG_AVATAR_TARGET: second }).status).toBe(0)

    const a = readFileSync(first)
    expect(a.equals(readFileSync(second))).toBe(true)
    // The committed artifact is what the current sources produce — a stale check-in fails here.
    expect(a.equals(readFileSync(COMMITTED))).toBe(true)
  })

  it('有品种没图 → 报错退出，并点名缺了谁', () => {
    const dir = tempDir()
    const names = readdirSync(SOURCE_DIR).filter(name => name.endsWith('.png')).sort()
    for (const name of names.slice(1)) copyFileSync(join(SOURCE_DIR, name), join(dir, name))

    const result = runGenerator({
      CATDOG_AVATAR_SOURCE: dir,
      CATDOG_AVATAR_TARGET: join(tempDir(), 'out.ts'),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('缺少头像')
    expect(result.stderr).toContain(names[0].replace(/\.png$/, ''))
  })

  it('有图没品种 → 报错退出，并点名多的是谁', () => {
    const dir = tempDir()
    const names = readdirSync(SOURCE_DIR).filter(name => name.endsWith('.png'))
    for (const name of names) copyFileSync(join(SOURCE_DIR, name), join(dir, name))
    copyFileSync(join(SOURCE_DIR, names[0]), join(dir, 'persian-cat.png'))

    const result = runGenerator({
      CATDOG_AVATAR_SOURCE: dir,
      CATDOG_AVATAR_TARGET: join(tempDir(), 'out.ts'),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('多余头像')
    expect(result.stderr).toContain('persian-cat')
  })

  it('扩展名是 .png 但内容不是 PNG → 报错，而不是把垃圾塞进 base64', () => {
    const dir = tempDir()
    for (const name of readdirSync(SOURCE_DIR).filter(name => name.endsWith('.png'))) {
      copyFileSync(join(SOURCE_DIR, name), join(dir, name))
    }
    writeFileSync(join(dir, 'zzz-not-a-png.png'), 'this is not a png')

    const result = runGenerator({
      CATDOG_AVATAR_SOURCE: dir,
      CATDOG_AVATAR_TARGET: join(tempDir(), 'out.ts'),
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('不是 PNG')
  })

  it('写到不存在的目录也能自己建出来', () => {
    const target = join(tempDir(), 'nested', 'deeper', 'avatars.ts')
    expect(runGenerator({ CATDOG_AVATAR_TARGET: target }).status).toBe(0)
    expect(readFileSync(target, 'utf8')).toContain('data:image/png;base64,')
  })
})

describe('loadBreedAvatars', () => {
  it('缓存的是同一个 promise，解析后是同一份映射（chunk 只抓一次）', async () => {
    const first = loadBreedAvatars()
    const second = loadBreedAvatars()
    expect(first).toBe(second)

    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(breedAvatars)
    expect(a).toBe(b)
    expect(Object.keys(a)).toHaveLength(24)

    // A later call after resolution still rides the same cache.
    expect(loadBreedAvatars()).toBe(first)
  })
})
