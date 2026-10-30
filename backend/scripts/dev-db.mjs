/**
 * 开发数据库助手：在项目内启动一个隔离的 MySQL 实例（无需管理员权限、不触碰系统 MySQL）
 *
 * 用法：
 *   node scripts/dev-db.mjs start     # 初始化（如需要）并启动，自动按 .env 设置密码/建库
 *   node scripts/dev-db.mjs stop      # 停止开发数据库
 *   node scripts/dev-db.mjs status    # 查看状态
 *
 * 设计说明：
 * - 数据目录放在 C 盘用户目录 %LOCALAPPDATA%\uniflow-mysql（无需管理员权限、不触碰系统 MySQL）
 * - 端口取 .env 的 DB_PORT（默认 3307），root 密码/库名与 .env 的 DB_PASSWORD/DB_NAME 保持一致
 * - mysqld 的 PID 记录在数据目录的 mysqld.pid，stop 据此关闭
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BACKEND = resolve(ROOT, 'backend')
// 数据目录放在 C 盘用户目录（与 MySQL basedir 同盘）。
// 注意：MySQL 8.0.46 在 Windows 上，数据目录与 basedir 跨盘时 InnoDB 会出现
// "Can't create UNDO tablespace ... already exists" 回归导致无法启动，因此不要放 D 盘。
const DATA_DIR = process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, 'uniflow-mysql')
  : resolve(os.homedir(), 'AppData', 'Local', 'uniflow-mysql')
const PID_FILE = resolve(DATA_DIR, 'mysqld.pid')
const DEFAULT_PORT = 3307

const MYSQLD_CANDIDATES = [
  process.env.MYSQLD_PATH,
  'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe',
  'C:\\Program Files (x86)\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe',
].filter(Boolean)

function findMysqld() {
  for (const p of MYSQLD_CANDIDATES) {
    if (existsSync(p)) return p
  }
  throw new Error('未找到 mysqld.exe，请设置环境变量 MYSQLD_PATH 指向 MySQL 的 bin\\mysqld.exe')
}

/** 读取项目根 .env 中的键值（简单解析，不做插值） */
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

function isRunning(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
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

/** 进程是否存活（pid 文件可能过期） */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 用 netstat 找到监听指定端口的进程 PID（Windows 通用，无本地化问题） */
function findPidByPort(port) {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf-8' })
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid)) return Number(pid)
    }
  } catch { /* ignore */ }
  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function run(cmd, args, silent = false) {
  execFileSync(cmd, args, { stdio: silent ? 'ignore' : 'inherit' })
}

const mode = process.argv[2] ?? 'start'
const env = readDotEnv()
const port = Number(env.DB_PORT) || DEFAULT_PORT
const dbName = env.DB_NAME || 'uniflow'
const password = env.DB_PASSWORD ?? ''

if (mode === 'stop') {
  // 1) 优先按 pid 文件结束
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf-8').trim())
    if (isAlive(pid)) {
      try {
        process.kill(pid)
        console.log(`已停止开发数据库 (pid ${pid})`)
      } catch {
        console.log(`无法结束进程 ${pid}，尝试按端口结束`)
      }
    }
    rmSync(PID_FILE, { force: true })
  }
  // 2) 按端口兜底（pid 文件缺失/过期/进程残留时）
  let pid = findPidByPort(port)
  if (pid) {
    process.kill(pid)
    console.log(`已按端口 ${port} 结束进程 ${pid}`)
  }
  // 3) 等待端口释放（mysqld 优雅关闭需要几秒）
  for (let i = 0; i < 12; i++) {
    if (!(await isRunning(port))) break
    await sleep(1000)
  }
  if (!(await isRunning(port))) {
    console.log('开发数据库已停止')
  } else {
    console.log(`警告：端口 ${port} 仍被占用，请手动检查`)
  }
  process.exit(0)
}

if (mode === 'status') {
  console.log((await isRunning(port)) ? `开发数据库运行中: 127.0.0.1:${port}` : `开发数据库未运行 (端口 ${port})`)
  process.exit(0)
}

// ---- start ----
const mysqld = findMysqld()
const baseDir = dirname(dirname(mysqld))
const mysqlBin = mysqld.replace(/mysqld\.exe$/i, 'mysql.exe')

console.log(`[dev-db] mysqld: ${mysqld}`)
console.log(`[dev-db] datadir: ${DATA_DIR}`)
console.log(`[dev-db] port: ${port}   database: ${dbName}`)

if (await isRunning(port)) {
  console.log(`[dev-db] 端口 ${port} 已有 MySQL 在运行，跳过启动`)
} else {
  if (!existsSync(DATA_DIR)) {
    console.log('[dev-db] 初始化数据目录（首次启动，约 10-30 秒）...')
    mkdirSync(DATA_DIR, { recursive: true })
    try {
      run(mysqld, ['--no-defaults', '--initialize-insecure', `--basedir=${baseDir}`, `--datadir=${DATA_DIR}`])
    } catch (error) {
      rmSync(DATA_DIR, { recursive: true, force: true })
      throw new Error(`初始化失败：${error.message}\n请尝试删除 ${DATA_DIR} 后重试`)
    }
    console.log('[dev-db] 初始化完成')
  }

  console.log(`[dev-db] 启动 mysqld (端口 ${port}) ...`)
  const child = spawn(mysqld, [
    '--no-defaults',
    `--basedir=${baseDir}`,
    `--datadir=${DATA_DIR}`,
    `--port=${port}`,
    '--bind-address=127.0.0.1',
    `--log-error=${resolve(DATA_DIR, 'error.log')}`,
  ], { stdio: 'ignore', detached: true })
  child.unref()
  writeFileSync(PID_FILE, String(child.pid))

  if (!(await waitPort(port, 30000))) {
    const log = resolve(DATA_DIR, 'error.log')
    const tail = existsSync(log) ? readFileSync(log, 'utf-8').split(/\r?\n/).slice(-8).join('\n') : '(无日志)'
    rmSync(PID_FILE, { force: true })
    throw new Error(`mysqld 启动失败（30 秒内未监听 ${port}）:\n${tail}`)
  }
  console.log(`[dev-db] mysqld 已启动: 127.0.0.1:${port}`)
}

// 确保数据库存在 + root 密码与 .env 一致（静默探测，避免噪音）
const tryConnect = (pass) => {
  const args = ['-u', 'root', ...(pass ? ['-p' + pass] : []), '-h', '127.0.0.1', '-P', String(port), '-e', 'SELECT 1']
  try {
    run(mysqlBin, args, true)
    return true
  } catch {
    return false
  }
}

if (tryConnect(password)) {
  run(mysqlBin, ['-u', 'root', ...(password ? ['-p' + password] : []), '-h', '127.0.0.1', '-P', String(port), '-e',
    `CREATE DATABASE IF NOT EXISTS ${dbName} DEFAULT CHARACTER SET utf8mb4;`], true)
  console.log(`[dev-db] 数据库 ${dbName} 就绪`)
} else if (tryConnect('')) {
  run(mysqlBin, ['-u', 'root', '-h', '127.0.0.1', '-P', String(port), '-e',
    `ALTER USER 'root'@'localhost' IDENTIFIED BY '${password}'; FLUSH PRIVILEGES; CREATE DATABASE IF NOT EXISTS ${dbName} DEFAULT CHARACTER SET utf8mb4;`], true)
  console.log(`[dev-db] root 密码已设置为 .env 中的 DB_PASSWORD，数据库 ${dbName} 就绪`)
} else {
  console.log('[dev-db] 警告：无法使用 .env 的 DB_PASSWORD 或空密码连接 root，请手动检查')
}

console.log('')
console.log('开发数据库已就绪，直接启动后端：')
console.log('  cd backend && npm start')
console.log('（端口与 .env 的 DB_PORT 一致，无需额外配置）')
console.log('停止数据库：node scripts/dev-db.mjs stop')
