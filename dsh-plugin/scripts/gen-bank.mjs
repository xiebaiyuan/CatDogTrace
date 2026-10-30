#!/usr/bin/env node
/**
 * 把 1.2MB 的指纹库包成 TS 模块，供 `src/core/index.ts` 的 `loadBankChunk()` 动态 import。
 *
 * 为什么要生成而不是直接读 JSON：
 * - 宿主插件是 ESM 打包产物，运行时没有 `fs`，也没有「从插件目录读文件」的约定；
 * - 只有写成模块，动态 `import()` 才拆得出独立 chunk。写成静态 import 会被塞进 `lib/client.js`，1.2MB 直接变主包体积。
 *
 * 产物必须可重复：同一个输入连跑两次逐字节相同。做法是读原文 -> `JSON.parse` -> `JSON.stringify`
 * （不带缩进），并把源文件大小与 sha256 写进 banner。数值不会变：`JSON.stringify` 输出的是能往返的最短表示，
 * 再解析回同一个双精度数。
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const repoRoot = join(pluginRoot, '..')

const SOURCE = join(repoRoot, 'data', 'unified_bank.json')
const TARGET = join(pluginRoot, 'src', 'core', 'bank', 'unified_bank.ts')

const raw = readFileSync(SOURCE, 'utf8')
const parsed = JSON.parse(raw)

if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
  throw new Error(`指纹库无效：${SOURCE} 的 models 字段缺失或没有条目。`)
}

const compact = JSON.stringify(parsed)
const sha256 = createHash('sha256').update(raw).digest('hex')
const bytes = Buffer.byteLength(raw, 'utf8')

const banner = [
  '/**',
  ' * 由 dsh-plugin/scripts/gen-bank.mjs 生成，不要手改。',
  ` * 来源：${relative(pluginRoot, SOURCE)}（${bytes} 字节，sha256 ${sha256}）`,
  ` * 品种数：${parsed.models.length}`,
  ' *',
  ' * 类型标成 unknown 是有意的：让 tsc 不去推断 20 多万个数字的字面量类型，',
  ' * 读起来由 loadBank()/assertBankDocument() 负责收窄。',
  ' */',
  '',
  `const bank: unknown = ${compact}`,
  '',
  'export default bank',
  '',
].join('\n')

mkdirSync(dirname(TARGET), { recursive: true })
writeFileSync(TARGET, banner)
console.log(`gen-bank: ${relative(repoRoot, SOURCE)} -> ${relative(repoRoot, TARGET)}`)
console.log(`gen-bank: ${bytes} 字节, ${parsed.models.length} 个品种, sha256 ${sha256}`)
