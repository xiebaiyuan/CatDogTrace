#!/usr/bin/env node
/**
 * 把 24 张品种头像包成 TS 模块，供 `src/client/avatars.ts` 的 `loadBreedAvatars()` 动态 import。
 *
 * 为什么生成而不是运行时读文件：宿主插件是浏览器产物，没有 fs；只有写成模块，动态 `import()` 才拆得出
 * 独立 chunk。写成静态 import 的话，255KB base64 会直接进 `lib/client.js` —— 与指纹库 chunk 同一个理由。
 *
 * 产物必须可重复：键按字典序、不写时间戳、base64 直接来自源文件字节，同一份输入连跑两次逐字节相同。
 *
 * 键集必须**严格等于**指纹库的 24 个 model id：有图无品种、有品种无图都直接报错退出。否则以后换图或换库
 * 会静默错位 —— 排行榜上「萨摩耶」配了波斯猫的脸，肉眼看不出来，但这个仓库的全部结论都建立在对号入座上。
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const repoRoot = join(pluginRoot, '..')

/**
 * 三个路径都可以用环境变量顶掉，测试靠它把生成器指向临时目录，从而在没有图 / 多图 / 假 PNG 的输入上
 * 验证它会失败。生产调用不设环境变量，走下面这三条默认值。
 */

/** 头像源目录。只读：那是网页侧与其它成员共用的素材。 */
export const SOURCE_DIR = process.env.CATDOG_AVATAR_SOURCE ?? join(repoRoot, 'static', 'assets', 'breeds')

/** 指纹库唯一来源，与 `scripts/gen-bank.mjs` 一致。 */
export const BANK_SOURCE = process.env.CATDOG_BANK_SOURCE ?? join(repoRoot, 'data', 'unified_bank.json')

/**
 * 生成物。路径对外暴露，测试用它比对「磁盘上的文件 === 现在重新生成的结果」。
 *
 * 文件名决定 chunk 名：动态 import 的产物按被 import 模块的文件名命名（`avatars.ts` →
 * `lib/client.avatars.js`）。acceptance 与宿主加载都按这个名字对，所以这里不能改叫 `breeds.ts`。
 */
export const TARGET = process.env.CATDOG_AVATAR_TARGET
  ?? join(pluginRoot, 'src', 'client', 'assets', 'avatars.ts')

/** PNG 文件签名：只收真正的 PNG，别把 `.png` 后缀当证据。 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 指纹库里的 24 个品种 id，字典序。 */
export function readBankIds(bankPath = BANK_SOURCE) {
  const raw = readFileSync(bankPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
    throw new Error(`指纹库无效：${bankPath} 的 models 字段缺失或没有条目。`)
  }
  const ids = parsed.models.map((model) => model?.id)
  for (const id of ids) {
    if (typeof id !== 'string' || id.trim() === '') throw new Error(`指纹库里有 id 为空的品种：${bankPath}`)
  }
  if (new Set(ids).size !== ids.length) throw new Error(`指纹库里有重复的品种 id：${bankPath}`)
  return [...ids].sort()
}

/** 头像目录里的 `id -> Buffer`，只认 PNG 签名。 */
export function readImages(dir = SOURCE_DIR) {
  const names = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.png')).sort()
  const images = new Map()
  for (const name of names) {
    const bytes = readFileSync(join(dir, name))
    if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error(`不是 PNG：${join(dir, name)}（扩展名是 .png，内容不是）`)
    }
    images.set(name.slice(0, -'.png'.length), bytes)
  }
  return images
}

/**
 * 纯函数：给定图片表与品种 id，返回模块源码。
 *
 * 键集两个方向都查，且给出可直接执行的错误信息 —— 这类错位不该靠人去数 24 个文件名。
 */
export function buildModule(images, ids) {
  const idSet = new Set(ids)
  const missing = ids.filter((id) => !images.has(id))
  const stray = [...images.keys()].filter((id) => !idSet.has(id)).sort()
  if (missing.length > 0) {
    throw new Error(
      `缺少头像：${missing.join(', ')} —— 指纹库有这些品种，${SOURCE_DIR} 里没有对应的 PNG。`,
    )
  }
  if (stray.length > 0) {
    throw new Error(
      `多余头像：${stray.join(', ')} —— ${SOURCE_DIR} 里有这些 PNG，指纹库里没有对应品种。`,
    )
  }

  const ordered = [...ids].sort()
  let total = 0
  const digest = createHash('sha256')
  const entries = []
  for (const id of ordered) {
    const bytes = images.get(id)
    total += bytes.length
    digest.update(id).update('\0').update(bytes)
    // 单引号键：id 全是 kebab-case，不需要转义；base64 里没有引号。
    entries.push(`  '${id}': 'data:image/png;base64,${bytes.toString('base64')}',`)
  }
  const sha256 = digest.digest('hex')

  return [
    '/**',
    ' * 由 dsh-plugin/scripts/gen-avatars.mjs 生成，不要手改。',
    ` * 来源：${relative(pluginRoot, SOURCE_DIR)}/*.png（${ordered.length} 张，${total} 字节，sha256 ${sha256}）`,
    ' *',
    ' * 键就是指纹库的 model id；键集与指纹库严格相等由生成器和测试双向守着。',
    ' * 图片是不透明的米底方片（漫画插画的浅色部位与背景同色，抠图会啃掉口鼻与胸口），',
    ' * 所以渲染侧给圆角与细边，不假定透明。',
    ' */',
    '',
    '/** 品种 id → PNG data URI。 */',
    'export type BreedAvatarMap = Readonly<Record<string, string>>',
    '',
    'export default {',
    ...entries,
    '} as const satisfies BreedAvatarMap',
    '',
  ].join('\n')
}

/** 读源、校验、写产物。返回写出的字节数，方便 CLI 打印。 */
export function generate({ images = readImages(), ids = readBankIds(), target = TARGET } = {}) {
  const source = buildModule(images, ids)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, source)
  return { bytes: Buffer.byteLength(source, 'utf8'), count: ids.length }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  try {
    const result = generate()
    console.log(`gen-avatars: ${relative(repoRoot, SOURCE_DIR)} -> ${relative(repoRoot, TARGET)}`)
    console.log(`gen-avatars: ${result.count} 个品种, ${result.bytes} 字节`)
  } catch (error) {
    console.error(`gen-avatars: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
