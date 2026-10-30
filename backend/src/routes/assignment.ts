/**
 * 作业路由：增删查
 * GET  /api/assignments          → 列出当前用户作业（可选 ?source=smartestu|chaoxing）
 * POST /api/assignments/refresh  → 触发爬虫刷新作业
 * DELETE /api/assignments/:id    → 删除某条作业
 * POST /api/assignments/clear    → 清空当前用户作业
 */
import { Context } from 'cordis'
import { route, send, requireUser } from '../utils/http'
import { AssignmentCrawlerService, fetchFromCquptLms } from '../services/assignmentCrawler'
import { config } from '../config'

function currentSemesterRange(): { start: Date; end: Date } {
  const start = new Date(`${config.semester.start}T00:00:00`)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 6)
  return { start, end }
}

export function apply(ctx: Context) {
  /** 列表 */
  ctx.server.get('/api/assignments', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const source = req.query.get('source') as 'smartestu' | 'chaoxing' | undefined

    const filter: Record<string, any> = { user_id: user.id }
    if (source) filter.source = source

    const rows = await ctx.database.get('assignment', filter)

    const { start: semesterStart, end: semesterEnd } = currentSemesterRange()
    const currentSemesterRows = rows.filter((row: any) => {
      if (!row.due_time) return false
      const dueTime = new Date(row.due_time)
      return dueTime >= semesterStart && dueTime < semesterEnd
    })

    send(res, currentSemesterRows
      .sort((a: any, b: any) => {
        // 未完成优先，按截止时间从近到远；已完成在下面，按截止时间从新到老。
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1
        const aTime = new Date(a.due_time).getTime()
        const bTime = new Date(b.due_time).getTime()
        return a.is_completed ? bTime - aTime : aTime - bTime
      })
      .map((r: any) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      course_name: r.course_name,
      description: r.description,
      due_time: r.due_time,
      is_completed: r.is_completed,
      created_at: r.created_at,
    })))
  }))

  /** 刷新 */
  ctx.server.post('/api/assignments/refresh', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await req.json() as any
    const {
      smartestu_id,
      smartestu_password,
      chaoxing_username,
      chaoxing_password,
    } = body ?? {}

    if (!smartestu_id && !chaoxing_username) {
      return send(res, { error: '请至少提供一个平台的账号' }, 400)
    }

    const svc = new AssignmentCrawlerService(ctx)
    const count = await svc.crawlAndUpsert(
      user.id,
      smartestu_id,
      smartestu_password,
      chaoxing_username,
      chaoxing_password,
    )

    send(res, { imported: count })
  }))

  /** 打开本机浏览器完成统一认证，并导入学校 LMS 作业 */
  ctx.server.post('/api/assignments/lms/refresh', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const items = await fetchFromCquptLms()
    const count = await new AssignmentCrawlerService(ctx).upsert(user.id, items)
    send(res, { imported: count })
  }))

  /** 清空当前用户的全部作业记录 */
  ctx.server.post('/api/assignments/clear', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    await ctx.database.remove('assignment', { user_id: user.id })
    send(res, { ok: true })
  }))

  /** 删除 */
  ctx.server.delete('/api/assignments/:id', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const id = Number((req.params as Record<string, string>)['id'])
    if (!id) return send(res, { error: '无效 ID' }, 400)

    const rows = await ctx.database.get('assignment', { id, user_id: user.id })
    if (!rows.length) return send(res, { error: '作业不存在' }, 404)

    await ctx.database.remove('assignment', { id })
    send(res, { ok: true })
  }))
}

apply.inject = ['server', 'database', 'auth'] as const
