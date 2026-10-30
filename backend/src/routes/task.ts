import { Context } from 'cordis'
import z from 'schemastery'
import { HttpError, formatDateTime, parseBody, queryInt, route, requireUser, send } from '../utils/http'
import type { Task } from '../types'

const CreateSchema = z.object({
  title: z.string().required(),
  description: z.string().default(''),
  source_type: z.string().default('todo'),
  course_id: z.union([z.number(), z.const(null)]).default(null),
  course_name: z.string().default(''),
  due_at: z.string().default(''),
  estimated_minutes: z.union([z.number(), z.const(null)]).default(null),
  priority: z.number().default(3),
})
const UpdateSchema = z.object({
  title: z.string(), description: z.string(), source_type: z.string(),
  course_id: z.union([z.number(), z.const(null)]), course_name: z.string(), due_at: z.string(),
  estimated_minutes: z.union([z.number(), z.const(null)]), priority: z.number(), status: z.string(),
})

function parseDate(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, '日期格式不合法')
  return date
}

function serialize(row: Task) {
  return { ...row, due_at: formatDateTime(row.due_at), created_at: formatDateTime(row.created_at), updated_at: formatDateTime(row.updated_at) }
}

async function ensureLegacyTasks(ctx: Context, userId: number): Promise<void> {
  const [todos, assignments] = await Promise.all([
    ctx.database.get('todo', { user_id: userId }),
    ctx.database.get('assignment', { user_id: userId }),
  ])
  const existing = await ctx.database.get('task', { user_id: userId })
  const keys = new Set(existing.map((row: any) => `${row.source}:${row.source_id}`))
  for (const todo of todos as any[]) {
    const key = `manual:${todo.id}`
    if (keys.has(key)) continue
    await ctx.database.create('task', {
      user_id: userId, source: 'manual', source_type: 'todo', source_id: String(todo.id),
      title: todo.title, description: todo.description ?? '', course_name: todo.course_name ?? '',
      due_at: todo.due_date ?? null, priority: todo.priority ?? 3,
      status: todo.is_completed ? 'completed' : 'pending', user_modified: false, estimate_source: 'user',
    })
  }
  for (const assignment of assignments as any[]) {
    const sourceId = assignment.remote_id || String(assignment.id)
    const key = `${assignment.source}:${sourceId}`
    if (keys.has(key)) continue
    await ctx.database.create('task', {
      user_id: userId, source: assignment.source || 'platform', source_type: 'assignment', source_id: sourceId,
      title: assignment.title, description: assignment.description ?? '', course_name: assignment.course_name ?? '',
      due_at: assignment.due_time ?? null, priority: 4,
      status: assignment.is_completed ? 'completed' : 'pending', user_modified: false, estimate_source: 'user',
    })
  }
}

export function apply(ctx: Context) {
  ctx.server.get('/api/tasks', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    await ensureLegacyTasks(ctx, user.id)
    const status = req.query.get('status') ?? ''
    const source = req.query.get('source') ?? ''
    const sourceType = req.query.get('source_type') ?? ''
    const query: Record<string, unknown> = { user_id: user.id }
    if (status) query.status = status
    if (source) query.source = source
    if (sourceType) query.source_type = sourceType
    const rows = await ctx.database.get('task', query, { sort: { priority: 'desc', due_at: 'asc' } })
    send(res, { items: rows.map((row: any) => serialize(row)) })
  }))

  ctx.server.post('/api/tasks', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<any>(req, CreateSchema)
    const row = await ctx.database.create('task', {
      user_id: user.id, source: 'manual', source_type: body.source_type,
      title: body.title, description: body.description, course_id: body.course_id,
      course_name: body.course_name, due_at: parseDate(body.due_at),
      estimated_minutes: body.estimated_minutes, priority: Math.max(1, Math.min(5, body.priority)),
      status: 'pending', user_modified: true, estimate_source: 'user',
    })
    send(res, serialize(row as Task), 201)
  }))

  ctx.server.put('/api/tasks/:task_id', route<{ task_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const id = Number(req.params.task_id)
    const body = await parseBody<any>(req, UpdateSchema)
    const update: Record<string, unknown> = { user_modified: true, updated_at: new Date() }
    for (const key of ['title', 'description', 'source_type', 'course_id', 'course_name', 'estimated_minutes', 'priority', 'status']) {
      if (body[key] !== undefined) update[key] = body[key]
    }
    if (body.due_at !== undefined) update.due_at = parseDate(body.due_at)
    const result = await ctx.database.set('task', { id, user_id: user.id }, update)
    if (!result.matched) throw new HttpError(404, '任务不存在')
    const rows = await ctx.database.get('task', { id, user_id: user.id })
    send(res, serialize(rows[0] as Task))
  }))

  ctx.server.post('/api/tasks/:task_id/complete', route<{ task_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const id = Number(req.params.task_id)
    const result = await ctx.database.set('task', { id, user_id: user.id }, { status: 'completed', user_modified: true, updated_at: new Date() })
    if (!result.matched) throw new HttpError(404, '任务不存在')
    const rows = await ctx.database.get('task', { id, user_id: user.id })
    send(res, serialize(rows[0] as Task))
  }))

  ctx.server.delete('/api/tasks/:task_id', route<{ task_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const result = await ctx.database.remove('task', { id: Number(req.params.task_id), user_id: user.id })
    if (!result.removed) throw new HttpError(404, '任务不存在')
    send(res, { ok: true })
  }))
}

apply.inject = ['server', 'database', 'auth']
