// scripts/fetch-electron.mjs — 手动下载 electron 二进制到 node_modules/electron/dist
// （受限沙箱中 npm postinstall 被 --ignore-scripts 跳过，此脚本补齐二进制）
import { createWriteStream, mkdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'node_modules', 'electron', 'dist')
const electronExe = path.join(distDir, 'electron.exe')
if (existsSync(electronExe)) { console.log('electron binary already present'); process.exit(0) }

const version = JSON.parse(readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version
const zipPath = path.join(root, 'build', 'electron.zip')
mkdirSync(path.join(root, 'build'), { recursive: true })

const url = `https://npmmirror.com/mirrors/electron/${version}/electron-v${version}-win32-x64.zip`
console.log(`downloading ${url}`)

const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) throw new Error(`HTTP ${res.status}`)
await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath))
console.log('downloaded', statSync(zipPath).size, 'bytes')

mkdirSync(distDir, { recursive: true })
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force`],
  { stdio: 'inherit' })
console.log('electron binary done:', existsSync(electronExe))
