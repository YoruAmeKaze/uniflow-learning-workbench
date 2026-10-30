/**
 * 手动执行一次校园通知爬取（教务处官网 → notifications 表）
 * 运行：npm run crawl:notices  （需数据库已启动）
 */
import { Context } from 'cordis'
import Database from '@cordisjs/plugin-database'
import MySQLDriver from '@cordisjs/plugin-database-mysql'

import { config } from './config'
import { apply as models } from './models/index'
import { apply as noticeCrawler } from './services/noticeCrawler'

async function main() {
  const ctx = new Context()

  // 基础插件顺序加载（规避 cordis rc.8 并发竞态，见 index.ts 注释）
  await ctx.plugin(Database)
  await ctx.plugin(MySQLDriver, {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: config.db.charset,
  })
  await ctx.plugin(models)
  await ctx.plugin(noticeCrawler)

  console.log('开始抓取教务处官网通知...')
  const result = await ctx.noticeCrawler.sync()
  console.log(`✅ 完成：本次新增 ${result.added} 条，跳过已存在 ${result.skipped} 条，共 ${result.total} 条`)
  process.exit(0)
}

main().catch((error) => {
  console.error('爬取失败:', error instanceof Error ? error.message : error)
  process.exit(1)
})
