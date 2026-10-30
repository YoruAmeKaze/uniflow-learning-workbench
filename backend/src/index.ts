/**
 * UniFlow Cordis 架构后端入口
 * 对应原 backend/main.py
 */

import { Context } from 'cordis'
import Server from '@cordisjs/plugin-server'
import Database from '@cordisjs/plugin-database'
import MySQLDriver from '@cordisjs/plugin-database-mysql'

import { loadConfig, setConfig, config } from './config'

// 数据模型
import { apply as models } from './models/index'

// 基础设施服务
import { apply as authService } from './services/auth'
import { apply as agentService } from './services/agent'
import { apply as crawlerService } from './services/crawler'
import { apply as noticeCrawlerService } from './services/noticeCrawler'
import { apply as knowledgeService } from './services/knowledge'

// Tool 中心与工具
import { apply as toolCenter } from './tools/index'
import { apply as toolCourse } from './tools/course'
import { apply as toolTodo } from './tools/todo'
import { apply as toolNotification } from './tools/notification'
import { apply as toolUserProfile } from './tools/userProfile'
import { apply as toolRag } from './tools/rag'
import { apply as toolAssignment } from './tools/assignment'

// 路由
import { apply as corsMiddleware } from './routes/cors'
import { apply as healthRoutes } from './routes/health'
import { apply as authRoutes } from './routes/auth'
import { apply as chatRoutes } from './routes/chat'
import { apply as uploadRoutes } from './routes/upload'
import { apply as courseRoutes } from './routes/course'
import { apply as todoRoutes } from './routes/todo'
import { apply as notificationRoutes } from './routes/notification'
import { apply as assignmentRoutes } from './routes/assignment'
import { apply as taskRoutes } from './routes/task'
import { apply as planRoutes } from './routes/plan'

async function main() {
  setConfig(loadConfig())
  const ctx = new Context()
  const logger = ctx.logger('app')

  // 1) 基础插件顺序加载：
  //    数据库（Database → MySQLDriver）与 HTTP Server 必须等各自 [Service.init] 完整执行。
  //    注意：cordis 4.0.0-rc.8 并发加载时存在 notify 竞态，含异步 init（网络连接）的
  //    服务 fiber 会在 init 完成前被 await() 提前放行（服务延后提供），导致依赖它的
  //    路由静默不加载，因此这里显式顺序 await。
  await ctx.plugin(Database)
  await ctx.plugin(MySQLDriver, {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: config.db.charset,
  })
  await ctx.plugin(Server, {
    host: config.server.host,
    port: config.server.port,
  })

  // 2) 其余插件并发加载（依赖注入自动排序）
  await Promise.all([
    // 模型
    ctx.plugin(models),
    // 服务
    ctx.plugin(authService),
    ctx.plugin(agentService),
    ctx.plugin(crawlerService),
    ctx.plugin(noticeCrawlerService),
    ctx.plugin(knowledgeService),
    // 工具
    ctx.plugin(toolCenter),
    ctx.plugin(toolCourse),
    ctx.plugin(toolTodo),
    ctx.plugin(toolNotification),
    ctx.plugin(toolUserProfile),
    ctx.plugin(toolRag),
    ctx.plugin(toolAssignment),
    // 路由
    ctx.plugin(corsMiddleware),
    ctx.plugin(healthRoutes),
    ctx.plugin(authRoutes),
    ctx.plugin(chatRoutes),
    ctx.plugin(uploadRoutes),
    ctx.plugin(courseRoutes),
    ctx.plugin(todoRoutes),
    ctx.plugin(notificationRoutes),
    ctx.plugin(assignmentRoutes),
    ctx.plugin(taskRoutes),
    ctx.plugin(planRoutes),
  ])

  logger.info('UniFlow server ready at http://%s:%d', ctx.server.host, ctx.server.port)

  // 启动通知定时爬取（启动时爬一次 + 每天凌晨 00:05 自动爬）
  ctx.noticeCrawler.startScheduledSync()

  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal}，正在关闭服务器...`)
    const force = setTimeout(() => process.exit(1), 5000)
    force.unref()
    const server = ctx.get('server')
    if (server?._http?.listening) {
      await new Promise<void>((resolve) => server._http.close(() => resolve()))
    }
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('启动失败:', error)
  if (/ECONNREFUSED|ETIMEDOUT|ER_ACCESS_DENIED|ENOTFOUND/.test(message)) {
    console.error('')
    console.error('提示：无法连接 MySQL。请任选一种方式解决：')
    console.error('  1) 启动本机的 MySQL 服务（管理员 PowerShell）：Start-Service MySQL80')
    console.error('  2) 启动项目内置的开发数据库（无需管理员权限）：node scripts/dev-db.mjs start')
    console.error('  3) 检查/修改 .env 中的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME')
  }
  process.exit(1)
})
