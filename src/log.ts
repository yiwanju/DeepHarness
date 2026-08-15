import { app } from 'electron'
import { createWriteStream, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

let dir: string | undefined
let stream: ReturnType<typeof createWriteStream> | undefined

export function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  // 懒初始化：避免在 app ready 之前访问 userData 路径
  if (dir === undefined) {
    dir = path.join(app.getPath('userData'), 'logs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    stream = createWriteStream(path.join(dir, 'main.log'), { flags: 'a' })
  }
  stream!.write(line + '\n')
}
