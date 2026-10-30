/**
 * 一键启动：Ollama 本地模型 + 开发数据库 + UniFlow 后端
 *
 * 用法（在 backend/ 下）：
 *   npm run start:ollama           # 完整启动（Ollama + MySQL + 后端）
 *   node scripts/start-with-ollama.mjs --no-db   # 跳过数据库检查（外部已有 MySQL）
 *   node scripts/start-with-ollama.mjs --model qwen2.5:3b  # 指定模型
 *
 * 流程：
 *   1) 定位 ollama.exe（PATH / %LOCALAPPDATA%\Programs\Ollama / OLLAMA_PATH）
 *   2) 若 11434 未监听 → 后台拉起 `ollama serve`（detached，随系统存活）
 *   3) 检查模型是否已拉取（默认 qwen2.5:7b，可用 --model 或环境变量 OLLAMA_MODEL 覆盖）
 *      未拉取则自动 `ollama pull`（首次下载约 4.7GB，耐心等待）
 *   4) （可选）确保开发数据库就绪：node scripts/dev-db.mjs start
 *   5) 后端未编译则先 tsc 编译，然后以当前进程启动 node lib/index.js
 *
 * 停止：Ctrl+C 停止后端（ollama serve 保持后台运行，便于下次秒启）
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BACKEND = resolve(ROOT, 'backend')
const OLLAMA_PORT = 11434
const OLLAMA_HOST = 'http://127.0.0.1:11434'

// ---- 参数解析 ----
const args = process.argv.slice(2)
const noDb = args.includes('--no-db')
const modelArg = (() => {
  const i = args.indexOf('--model')
  return i >= 0 && args[i + 1] ? args[i + 1] : null
})()

// ---- 工具函数 ----
function findOllama() {
  const candidates = [
    process.env.OLLAMA_PATH,
    process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe') : null,
    resolve(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
  ].filter(Boolean)
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // PATH 兜底
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama'], { encoding: 'utf-8' })
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0]
  return null
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

function waitPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(tryOnce, 500)
      })
    }
    tryOnce()
  })
}

function readDotEnv() {
  const file = resolve(ROOT, '.env')
  if (!existsSync(file)) return {}
  const result = {}
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#')) result[m[1]] = m[2]
  }
  return result
}

function log(msg) {
  console.log(`[start:ollama] ${msg}`)
}

// ---- 主流程 ----
async function main() {
  const ollama = findOllama()
  if (!ollama) {
    console.error(`
[start:ollama] 未找到 ollama。
请先安装 Ollama：https://ollama.com/download （Windows 安装包），
或设置环境变量 OLLAMA_PATH 指向 ollama.exe 的完整路径。
`)
    process.exit(1)
  }
  log(`ollama: ${ollama}`)

  // 1) 确保 serve 运行
  if (!(await isPortOpen(OLLAMA_PORT))) {
    log(`Ollama 未运行，后台启动 ollama serve ...`)
    const child = spawn(ollama, ['serve'], { stdio: 'ignore', detached: true })
    child.unref()
    if (!(await waitPort(OLLAMA_PORT, 30000))) {
      console.error('[start:ollama] ollama serve 启动失败（30 秒内未监听 11434）')
      process.exit(1)
    }
    log('ollama serve 已就绪')
  } else {
    log('ollama serve 已在运行')
  }

  // 2) 确保模型已拉取
  const env = readDotEnv()
  const model = modelArg ?? process.env.OLLAMA_MODEL ?? env.LLM_MODEL ?? 'qwen2.5:7b'
  const list = spawnSync(ollama, ['list'], { encoding: 'utf-8' })
  const hasModel = list.status === 0 && list.stdout.includes(model)
  if (!hasModel) {
    log(`模型 ${model} 未找到，开始拉取（首次下载可能较大，请耐心等待）...`)
    const pull = spawn(ollama, ['pull', model], { stdio: 'inherit' })
    const code = await new Promise((resolve) => pull.on('exit', resolve))
    if (code !== 0) {
      console.error(`[start:ollama] 拉取模型 ${model} 失败（exit ${code}）`)
      process.exit(1)
    }
  } else {
    log(`模型 ${model} 已就绪`)
  }

  // 3) 确保开发数据库（可选）
  if (!noDb) {
    log('检查开发数据库 ...')
    const db = spawnSync(process.execPath, [resolve(BACKEND, 'scripts', 'dev-db.mjs'), 'start'], { stdio: 'inherit' })
    if (db.status !== 0) {
      console.error('[start:ollama] 开发数据库启动失败，可先手动修复后加 --no-db 跳过')
      process.exit(1)
    }
  }

  // 4) 确保后端已编译
  const entry = resolve(BACKEND, 'lib', 'index.js')
  if (!existsSync(entry)) {
    log('后端未编译，执行 tsc ...')
    const tsc = spawnSync(process.execPath, [resolve(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', resolve(BACKEND, 'tsconfig.json')], { stdio: 'inherit', cwd: BACKEND })
    if (tsc.status !== 0) {
      console.error('[start:ollama] 后端编译失败')
      process.exit(1)
    }
  }

  if (!noDb) {
    const seed = spawnSync(process.execPath, [resolve(BACKEND, 'lib', 'seedDemo.js')], { stdio: 'inherit', cwd: BACKEND })
    if (seed.status !== 0) {
      console.error('[start:ollama] 演示数据初始化失败')
      process.exit(1)
    }
  }

  // 5) 启动后端（当前进程，便于 Ctrl+C）
  log(`启动后端：node lib/index.js（LLM = Ollama/${model}）`)
  process.env.LLM_PROVIDER = 'ollama'
  process.env.LLM_BASE_URL = process.env.LLM_BASE_URL ?? `${OLLAMA_HOST}/v1`
  process.env.LLM_MODEL = model
  process.env.LLM_API_KEY = process.env.LLM_API_KEY ?? 'ollama'

  const server = spawn(process.execPath, ['lib/index.js'], { stdio: 'inherit', cwd: BACKEND })
  server.on('exit', (code) => process.exit(code ?? 0))
  process.on('SIGINT', () => server.kill('SIGINT'))
  process.on('SIGTERM', () => server.kill('SIGTERM'))
}

main().catch((error) => {
  console.error('[start:ollama] 启动失败:', error)
  process.exit(1)
})
