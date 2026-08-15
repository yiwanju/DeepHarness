// scripts/fetch-node.mjs — 下载官方 Windows x64 node.exe 到 build/，供 electron-builder 打包 sidecar
// 用法：node scripts/fetch-node.mjs
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import { get } from 'node:https'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NODE_VERSION = process.env.DSH_NODE_VERSION ?? 'v24.19.0'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const zipPath = path.join(buildDir, 'node.zip')
const nodeExe = path.join(buildDir, 'node.exe')

if (existsSync(nodeExe)) { console.log(`already present: ${nodeExe}`); process.exit(0) }

mkdirSync(buildDir, { recursive: true })
const url = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`
console.log(`downloading ${url}`)

await new Promise((resolve, reject) => {
  const file = createWriteStream(zipPath)
  get(url, (res) => {
    if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
    res.pipe(file)
    file.on('finish', () => file.close(resolve))
  }).on('error', reject)
})

// 解压并拷贝 node.exe（用 Windows 自带 PowerShell，stdio inherit 避免沙箱 named-pipe 限制）
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Expand-Archive -Path '${zipPath}' -DestinationPath '${buildDir}' -Force; ` +
  `Copy-Item '${path.join(buildDir, `node-${NODE_VERSION}-win-x64`, 'node.exe')}' '${nodeExe}' -Force`],
  { stdio: 'inherit' })

console.log(`done: ${nodeExe}`)
