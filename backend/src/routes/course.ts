/**
 * 课程 API
 * 对应原 backend/api/course.py
 */
import { Context } from 'cordis'
import z from 'schemastery'

import { HttpError, parseBody, route, requireUser, send } from '../utils/http'
import { config } from '../config'

interface CourseBody {
  name: string
  teacher: string
  classroom: string
  weekday: number
  start_week: number
  end_week: number
  start_time: string
  end_time: string
  location: string
  credit: number
}

const CourseSchema = z.object({
  name: z.string().required(),
  teacher: z.string().default(''),
  classroom: z.string().default(''),
  weekday: z.number().required(),
  start_week: z.number().default(1),
  end_week: z.number().default(18),
  start_time: z.string().required(),
  end_time: z.string().required(),
  location: z.string().default(''),
  credit: z.number().default(0),
})

/** 本地时区安全解析 YYYY-MM-DD → Date（避免 UTC 偏移） */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 按开学第 1 周周一推算某日所在学期周次（最小 1） */
export function weekIndexOf(date: Date, semesterStart: string): number {
  if (!semesterStart) return 1
  const start = parseLocalDate(semesterStart)
  const dayDiff = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, Math.floor(dayDiff / 7) + 1)
}

/** 第 week 周的周一日期（YYYY-MM-DD） */
export function mondayOfWeek(week: number, semesterStart: string): string {
  if (!semesterStart) return ''
  const [y, m, d] = semesterStart.split('-').map(Number)
  const monday = new Date(y, m - 1, d + (week - 1) * 7)
  const mm = String(monday.getMonth() + 1).padStart(2, '0')
  const dd = String(monday.getDate()).padStart(2, '0')
  return `${monday.getFullYear()}-${mm}-${dd}`
}

export function apply(ctx: Context) {
  // ---- 列表 ----
  ctx.server.get('/api/courses', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const items = await ctx.database.get('course', { user_id: user.id })
    send(res, { items })
  }))

  // ---- 今日课程 ----
  ctx.server.get('/api/courses/today', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const today = new Date()
    const weekday = today.getDay() || 7 // JS getDay(): 0=周日 ... 6=周六 → 1-7
    const currentWeek = weekIndexOf(today, config.semester.start)
    const rows = await ctx.database.get('course', { user_id: user.id, weekday })
    // 同一天可能有多条跨周课程；首页只应显示当前学期周次实际开课的课程。
    const items = rows
      .filter((c) => c.start_week <= currentWeek && c.end_week >= currentWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    send(res, { weekday, currentWeek, items })
  }))

  // ---- 某周课表（默认当前周，week=1 起）----
  ctx.server.get('/api/courses/week', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const today = new Date()
    const currentWeek = weekIndexOf(today, config.semester.start)
    const raw = Number(req.query.get('week'))
    const week = Number.isInteger(raw) && raw >= 1 ? raw : currentWeek

    const rows = await ctx.database.get('course', { user_id: user.id })
    // 周次内开课（start_week ≤ week ≤ end_week），按星期、开始时间排序
    const items = rows
      .filter((c) => c.start_week <= week && c.end_week >= week)
      .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))

    send(res, {
      week,
      currentWeek,
      weekStart: mondayOfWeek(week, config.semester.start),
      items,
    })
  }))

  // ---- 新增 ----
  ctx.server.post('/api/courses', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<CourseBody>(req, CourseSchema)
    const course = await ctx.database.create('course', { user_id: user.id, ...body })
    send(res, course)
  }))

  // ---- 删除 ----
  ctx.server.delete('/api/courses/:course_id', route<{ course_id: string }>(async (req, res) => {
    const user = await requireUser(ctx, req)
    const courseId = Number(req.params.course_id)
    const result = await ctx.database.remove('course', { id: courseId, user_id: user.id })
    if (!result.removed) throw new HttpError(404, '课程不存在')
    send(res, { ok: true })
  }))

  // ---- 从教务系统导入课表（替换当前用户全部课程）----
  ctx.server.post('/api/courses/import', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<{ student_id?: string; replace?: boolean }>(req, z.object({
      student_id: z.string().default(''),
      replace: z.boolean().default(true),
    }))
    const studentId = body.student_id?.trim() || (user as any).student_id
    if (!studentId) throw new HttpError(400, '缺少学号')

    let parsed
    try {
      parsed = await ctx.crawler.crawlAndParse(studentId)
    } catch (error) {
      throw new HttpError(502, `教务系统抓取失败：${(error as Error).message}`)
    }
    if (!parsed.length) {
      throw new HttpError(502, '教务系统未返回课表数据，请检查学号或稍后重试')
    }

    if (body.replace) {
      await ctx.database.remove('course', { user_id: user.id })
    }

    let imported = 0
    for (const c of parsed) {
      await ctx.database.create('course', {
        user_id: user.id,
        name: c.name,
        teacher: c.teacher || '',
        classroom: '',
        weekday: c.day_of_week,
        start_week: c.start_week,
        end_week: c.end_week,
        start_time: c.start_time,
        end_time: c.end_time,
        location: c.location || '',
        credit: 0,
      })
      imported++
    }

    send(res, { imported, total: parsed.length, student_id: studentId })
  }))
}

apply.inject = ['server', 'database', 'auth', 'crawler']
