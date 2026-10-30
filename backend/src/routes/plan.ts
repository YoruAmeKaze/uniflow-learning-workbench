import { Context } from 'cordis'
import z from 'schemastery'
import { HttpError, formatDateTime, parseBody, route, requireUser, send } from '../utils/http'

const PreviewSchema = z.object({
  title: z.string().default('AI 学习计划'),
  task_ids: z.array(z.number()).default([]),
  from: z.string().default(''),
  days: z.number().default(7),
})

function asDate(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function serializeSession(row: any) {
  return { ...row, start_at: formatDateTime(row.start_at), end_at: formatDateTime(row.end_at) }
}

async function planDetail(ctx: Context, id: number, userId: number) {
  const plans = await ctx.database.get('study_plan', { id, user_id: userId })
  if (!plans.length) throw new HttpError(404, '计划不存在')
  const sessions = await ctx.database.get('study_session', { plan_id: id }, { sort: { start_at: 'asc' } })
  return { ...plans[0], created_at: formatDateTime(plans[0].created_at), confirmed_at: formatDateTime(plans[0].confirmed_at), sessions: sessions.map(serializeSession) }
}

function overlaps(start: Date, end: Date, ranges: Array<[Date, Date]>) {
  return ranges.some(([a, b]) => start < b && end > a)
}

async function generateSessions(ctx: Context, userId: number, taskIds: number[], from: Date, days: number) {
  const taskQuery: Record<string, unknown> = { user_id: userId, status: { $in: ['pending', 'in_progress'] } }
  const tasks = await ctx.database.get('task', taskQuery)
  const selected = tasks.filter((task: any) => !taskIds.length || taskIds.includes(task.id))
  const courses = await ctx.database.get('course', { user_id: userId })
  const events = await ctx.database.get('schedule_event', { user_id: userId, status: 'active' })
  const blocked: Array<[Date, Date]> = events.map((event: any) => [new Date(event.start_at), new Date(event.end_at)])
  const sessions: Array<{ task_id: number; start_at: Date; end_at: Date; status: string; created_by: string; note: string; locked: boolean }> = []
  const cursor = new Date(from)
  cursor.setMinutes(0, 0, 0)
  const limit = new Date(from)
  limit.setDate(limit.getDate() + Math.max(1, Math.min(14, days)))
  for (let day = new Date(cursor); day < limit; day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue
    for (const task of selected as any[]) {
      const minutes = Math.max(30, Math.min(180, Number(task.estimated_minutes ?? 60)))
      const existing = sessions.filter((item) => item.task_id === task.id).reduce((sum, item) => sum + (item.end_at.getTime() - item.start_at.getTime()) / 60000, 0)
      if (existing >= minutes) continue
      for (let hour = 9; hour <= 20 && existing + minutes > 0; hour++) {
        const start = new Date(day); start.setHours(hour, 0, 0, 0)
        const end = new Date(start); end.setMinutes(start.getMinutes() + Math.min(60, minutes - existing))
        if (start < from || (task.due_at && end > new Date(task.due_at)) || overlaps(start, end, blocked) || overlaps(start, end, sessions.map((s) => [s.start_at, s.end_at]))) continue
        sessions.push({ task_id: task.id, start_at: start, end_at: end, status: 'proposed', created_by: 'ai', note: '', locked: false })
        blocked.push([start, end])
        break
      }
    }
  }
  return { selected, sessions }
}

export function apply(ctx: Context) {
  ctx.server.post('/api/plans/preview', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<any>(req, PreviewSchema)
    const from = asDate(body.from) ?? new Date()
    const generated = await generateSessions(ctx, user.id, body.task_ids, from, body.days)
    const byTask = new Set(generated.sessions.map((s) => s.task_id))
    const infeasible = generated.selected.filter((task: any) => !byTask.has(task.id)).map((task: any) => ({ task_id: task.id, reason: task.due_at ? '可用时间不足或存在冲突' : '任务缺少截止时间，未能安排' }))
    send(res, { title: body.title, source: 'ai', status: 'proposed', sessions: generated.sessions.map(serializeSession), infeasible })
  }))

  ctx.server.post('/api/plans', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await req.json() as any
    if (!Array.isArray(body.sessions)) throw new HttpError(400, 'sessions 必须为数组')
    const plan = await ctx.database.create('study_plan', { user_id: user.id, title: body.title || '学习计划', status: body.status === 'draft' ? 'draft' : 'proposed', source: body.source || 'ai', version: 1 })
    for (const session of body.sessions) {
      const task = await ctx.database.get('task', { id: Number(session.task_id), user_id: user.id })
      if (!task.length) throw new HttpError(400, `任务不存在: ${session.task_id}`)
      const start = asDate(session.start_at); const end = asDate(session.end_at)
      if (!start || !end || end <= start || (task[0].due_at && end > new Date(task[0].due_at))) throw new HttpError(400, '学习时段不合法或晚于截止时间')
      await ctx.database.create('study_session', { plan_id: plan.id, task_id: task[0].id, start_at: start, end_at: end, status: 'proposed', created_by: session.created_by || 'user', note: session.note || '', locked: Boolean(session.locked) })
    }
    send(res, await planDetail(ctx, plan.id, user.id), 201)
  }))

  ctx.server.get('/api/plans', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const rows = await ctx.database.get('study_plan', { user_id: user.id }, { sort: { created_at: 'desc' } })
    send(res, { items: rows.map((row: any) => ({ ...row, created_at: formatDateTime(row.created_at), confirmed_at: formatDateTime(row.confirmed_at) })) })
  }))

  ctx.server.get('/api/plans/:id', route<{ id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    send(res, await planDetail(ctx, Number(req.params.id), user.id))
  }))

  ctx.server.post('/api/plans/:id/confirm', route<{ id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const id = Number(req.params.id)
    const plans = await ctx.database.get('study_plan', { id, user_id: user.id })
    if (!plans.length) throw new HttpError(404, '计划不存在')
    if (plans[0].status === 'confirmed') return send(res, await planDetail(ctx, id, user.id))
    const sessions = await ctx.database.get('study_session', { plan_id: id })
    for (const session of sessions as any[]) {
      await ctx.database.set('study_session', { id: session.id }, { status: 'confirmed' })
      const duplicate = await ctx.database.get('schedule_event', { user_id: user.id, session_id: session.id })
      if (!duplicate.length) {
        const task = await ctx.database.get('task', { id: session.task_id, user_id: user.id })
        await ctx.database.create('schedule_event', { user_id: user.id, event_type: 'study', title: task[0]?.title ?? '学习', task_id: session.task_id, session_id: session.id, start_at: session.start_at, end_at: session.end_at, is_fixed: true, source: 'plan', status: 'active' })
      }
    }
    await ctx.database.set('study_plan', { id, user_id: user.id }, { status: 'confirmed', confirmed_at: new Date() })
    send(res, await planDetail(ctx, id, user.id))
  }))

  ctx.server.post('/api/plans/:id/cancel', route<{ id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const id = Number(req.params.id)
    const result = await ctx.database.set('study_plan', { id, user_id: user.id }, { status: 'cancelled' })
    if (!result.matched) throw new HttpError(404, '计划不存在')
    await ctx.database.set('study_session', { plan_id: id }, { status: 'cancelled' })
    await ctx.database.set('schedule_event', { user_id: user.id, session_id: { $in: (await ctx.database.get('study_session', { plan_id: id })).map((s: any) => s.id) } }, { status: 'cancelled' })
    send(res, await planDetail(ctx, id, user.id))
  }))
}

apply.inject = ['server', 'database', 'auth']
