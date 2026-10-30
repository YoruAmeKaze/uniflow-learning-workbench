/**
 * 待办 API
 * 对应原 backend/api/todo.py
 */
import { Context } from 'cordis'
import z from 'schemastery'

import { HttpError, formatDateTime, parseBody, queryInt, route, requireUser, send } from '../utils/http'
import type { Todo } from '../types'

interface TodoCreateBody {
  title: string
  description: string
  course_name: string
  priority: number
  due_date: string
}

interface TodoUpdateBody {
  title?: string
  description?: string
  course_name?: string
  priority?: number
  due_date?: string
  is_completed?: boolean
}

const TodoCreateSchema = z.object({
  title: z.string().required(),
  description: z.string().default(''),
  course_name: z.string().default(''),
  priority: z.number().default(1),
  due_date: z.string().default(''),
})

const TodoUpdateSchema = z.object({
  title: z.string(),
  description: z.string(),
  course_name: z.string(),
  priority: z.number(),
  due_date: z.string(),
  is_completed: z.boolean(),
})

/** 解析截止日期，支持 YYYY-MM-DD / YYYY-MM-DDTHH:mm / YYYY-MM-DD HH:mm:ss（本地时区） */
function parseDueDate(value: string): Date {
  // YYYY-MM-DDTHH:mm
  let m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', s = '0'] = m
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  }
  // YYYY-MM-DD HH:mm:ss
  m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (m) {
    const [, y, mo, d, h, mi, s] = m
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  }
  // YYYY-MM-DD
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) {
    const [, y, mo, d] = m
    const date = new Date(Number(y), Number(mo) - 1, Number(d))
    if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
      throw new HttpError(400, '日期格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm')
    }
    return date
  }
  throw new HttpError(400, '日期格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm')
}

function serializeTodo(todo: Todo) {
  return {
    ...todo,
    due_date: formatDateTime(todo.due_date),
  }
}

export function apply(ctx: Context) {
  // ---- 列表 ----
  ctx.server.get('/api/todos', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const status = req.query.get('status') ?? ''
    const query: Record<string, unknown> = { user_id: user.id }
    if (status === 'completed') query.is_completed = true
    else if (status === 'pending') query.is_completed = false
    const items = await ctx.database.get('todo', query, { sort: { priority: 'desc', due_date: 'asc' } })
    send(res, { items: items.map(serializeTodo) })
  }))

  // ---- 近期待办 ----
  ctx.server.get('/api/todos/upcoming', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const days = queryInt(req.query, 'days', 7, 1, 30)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(today)
    end.setDate(end.getDate() + days)
    const items = await ctx.database.get(
      'todo',
      { user_id: user.id, is_completed: false, due_date: { $gte: today, $lte: end } },
      { sort: { due_date: 'asc', priority: 'desc' } },
    )
    send(res, { items: items.map(serializeTodo) })
  }))

  // ---- 新增 ----
  ctx.server.post('/api/todos', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<TodoCreateBody>(req, TodoCreateSchema)
    const data: Record<string, unknown> = {
      user_id: user.id,
      title: body.title,
      description: body.description,
      course_name: body.course_name,
      priority: body.priority,
    }
    if (body.due_date) data.due_date = parseDueDate(body.due_date)
    const todo = await ctx.database.create('todo', data)
    send(res, serializeTodo(todo))
  }))

  // ---- 更新 ----
  ctx.server.put('/api/todos/:todo_id', route<{ todo_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const todoId = Number(req.params.todo_id)
    const body = await parseBody<TodoUpdateBody>(req, TodoUpdateSchema)
    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title
    if (body.description !== undefined) update.description = body.description
    if (body.course_name !== undefined) update.course_name = body.course_name
    if (body.priority !== undefined) update.priority = body.priority
    if (body.is_completed !== undefined) update.is_completed = body.is_completed
    if (body.due_date !== undefined) update.due_date = body.due_date ? parseDueDate(body.due_date) : null
    update.updated_at = new Date()
    const result = await ctx.database.set('todo', { id: todoId, user_id: user.id }, update)
    if (!result.matched) throw new HttpError(404, '待办不存在')
    const rows = await ctx.database.get('todo', { id: todoId })
    send(res, serializeTodo(rows[0]))
  }))

  // ---- 删除 ----
  ctx.server.delete('/api/todos/:todo_id', route<{ todo_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const todoId = Number(req.params.todo_id)
    const result = await ctx.database.remove('todo', { id: todoId, user_id: user.id })
    if (!result.removed) throw new HttpError(404, '待办不存在')
    send(res, { ok: true })
  }))
}

apply.inject = ['server', 'database', 'auth']
