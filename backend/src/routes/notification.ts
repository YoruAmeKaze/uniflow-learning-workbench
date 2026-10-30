/**
 * 通知 API
 * 对应原 backend/api/notification.py
 * 列表/分类/已读均包含「系统用户」发布的全局通知（校园通知爬虫写入）
 */
import { Context } from 'cordis'
import { Eval } from '@cordisjs/plugin-database'
import z from 'schemastery'

import { HttpError, parseBody, queryInt, route, requireUser, send } from '../utils/http'
import { SYSTEM_USER_STUDENT_ID } from '../services/noticeCrawler'
import { normalizeSourceUrl } from '../services/knowledge'

/** 解析系统用户 id（不存在则返回 null，此时退化为只看自己的通知） */
async function resolveSystemUserId(ctx: Context): Promise<number | null> {
  const rows = await ctx.database.get('user', { student_id: SYSTEM_USER_STUDENT_ID })
  return rows[0]?.id ?? null
}

export function apply(ctx: Context) {
  // ---- 人工录入知识 ----
  ctx.server.post('/api/notifications', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<{
      title: string
      content: string
      category: string
      source: string
      source_url: string
    }>(req, z.object({
      title: z.string().required(),
      content: z.string().default(''),
      category: z.string().default('general'),
      source: z.string().default('user-input'),
      source_url: z.string().default(''),
    }))
    const title = body.title.trim()
    if (!title) throw new HttpError(400, '标题不能为空')
    const sourceUrl = normalizeSourceUrl(body.source_url)
    if (body.source_url.trim() && !sourceUrl) throw new HttpError(400, '原文链接必须使用 http 或 https')
    const notification = await ctx.database.create('notification', {
      user_id: user.id,
      title,
      content: body.content.trim(),
      category: body.category.trim() || 'general',
      source: body.source.trim() || 'user-input',
      source_url: sourceUrl,
      is_read: true,
      published_at: new Date(),
      is_important: false,
    })
    ;(ctx as any).knowledge?.scheduleIndex?.(notification.id)
    send(res, notification)
  }))

  // ---- 列表（分类 / 搜索 / 分页；含全局通知）----
  ctx.server.get('/api/notifications', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const category = req.query.get('category') ?? ''
    const search = req.query.get('search') ?? ''
    const page = queryInt(req.query, 'page', 1, 1)
    const pageSize = queryInt(req.query, 'page_size', 20, 1, 100)

    const systemId = await resolveSystemUserId(ctx)
    const query: Record<string, unknown> = systemId
      ? { $or: [{ user_id: user.id }, { user_id: systemId }] }
      : { user_id: user.id }
    if (category) query.category = category
    if (search) query.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

    const total = await ctx.database.eval('notification', (row) => Eval.count(row.id), query)
    const items = await ctx.database.get(
      'notification',
      query,
      { sort: { published_at: 'desc' }, offset: (page - 1) * pageSize, limit: pageSize },
    )
    send(res, { total, page, page_size: pageSize, items })
  }))

  // ---- 分类列表（含全局通知）----
  ctx.server.get('/api/notifications/categories', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const systemId = await resolveSystemUserId(ctx)
    const query = systemId
      ? { $or: [{ user_id: user.id }, { user_id: systemId }] }
      : { user_id: user.id }
    const items = await ctx.database.get('notification', query)
    const categories = [...new Set(items.map((n) => n.category).filter(Boolean))]
    send(res, categories)
  }))

  // ---- 标记已读（含全局通知；is_read 为行级字段，全局通知的已读状态所有用户共享，MVP 简化）----
  ctx.server.put('/api/notifications/:notification_id/read', route<{ notification_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const notificationId = Number(req.params.notification_id)
    const systemId = await resolveSystemUserId(ctx)
    const scope = systemId
      ? { $or: [{ user_id: user.id }, { user_id: systemId }] }
      : { user_id: user.id }
    const result = await ctx.database.set(
      'notification',
      { id: notificationId, ...scope },
      { is_read: true },
    )
    if (!result.matched) throw new HttpError(404, '通知不存在')
    send(res, { ok: true })
  }))

  // ---- 实时列表（教务处官网首页即时抓取，不落库、不进 RAG；详情正文因 WAF 阻挡无法抓取，前端跳官网看原文）----
  ctx.server.get('/api/notifications/live', route(async (req, res) => {
    try {
      const items = await ctx.noticeCrawler.fetchHome().then((html) =>
        ctx.noticeCrawler.parseList(html),
      )
      // 转换为前端友好格式：title / date (YYYY-MM-DD) / url
      // 抓取来源 jwc.cqupt.edu.cn（镜像站，无 WAF），跳转目标 jw.cqupt.edu.cn（主站，浏览器可过 WAF 看正文）
      const data = items.slice(0, 10).map((it) => {
        const d = it.publishedAt
        const date = d
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          : ''
        return { title: it.title, date, url: it.source.replace(/jwc\.cqupt\.edu\.cn/i, 'jw.cqupt.edu.cn') }
      })
      send(res, { ok: true, count: data.length, items: data })
    } catch (error) {
      // 实时抓取失败不阻塞主列表（前端 banner 静默隐藏即可）
      ctx.logger('notification').warn(`实时通知抓取失败: ${String(error)}`)
      send(res, { ok: false, count: 0, items: [], message: String(error) })
    }
  }))
}

apply.inject = ['server', 'database', 'auth', 'noticeCrawler', 'knowledge']
