/** Shared read-only data collection and scheduling constraints. All calendar math uses Asia/Shanghai. */
import type { SkillContext, SkillResult, Scope, PlanTask, PlanSlot, PlanProposal } from './types'

const DAY = 86400000
export function chinaDate(time: number): string { return new Date(time + 8 * 3600000).toISOString().slice(0, 10) }
export function chinaTime(time: number): string { return new Date(time + 8 * 3600000).toISOString().slice(0, 19) + '+08:00' }
function midnight(time: number): number { return Date.parse(chinaDate(time) + 'T00:00:00+08:00') }
function weekday(time: number): number { return new Date(time + 8 * 3600000).getUTCDay() || 7 }
function dateValue(value: unknown): number | null {
  if (value == null || value === '') return null
  let text = String(value)
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+08:00'
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) text = text.replace(' ', 'T') + '+08:00'
  const time = Date.parse(text)
  return Number.isFinite(time) ? time : null
}
function timeOn(day: number, raw: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(raw))
  if (!match || +match[1] > 23 || +match[2] > 59) return null
  return day + (+match[1] * 60 + +match[2]) * 60000
}
export async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) })])
  } finally { if (timer) clearTimeout(timer) }
}

export async function collectPlan(scope: Scope, ctx: SkillContext): Promise<SkillResult> {
  const now = ctx.now.getTime()
  const today = midnight(now)
  const target = scope === 'daily' ? midnight((ctx.targetDate ?? ctx.now).getTime()) : today
  const monday = target - (weekday(target) - 1) * DAY
  const end = scope === 'daily' ? target + DAY : monday + 7 * DAY
  const semester = Date.parse(ctx.semesterStart + 'T00:00:00+08:00')
  const week = Math.floor((target - semester) / (7 * DAY)) + 1
  const warnings: string[] = []
  const queries = scope === 'deadline'
    ? [
      { name: 'todo', label: '待办', args: { action: 'upcoming', days: 7 } },
      { name: 'assignment', label: '作业', args: { action: 'upcoming' } },
    ]
    : [
      { name: 'course', label: '课程', args: scope === 'daily' ? { week, weekday: weekday(target) } : { week } },
      { name: 'todo', label: '待办', args: { action: 'list' } },
      { name: 'assignment', label: '作业', args: { action: 'list', is_completed: false } },
    ]
  const results = await Promise.all(queries.map(async (query) => {
    const start = Date.now()
    const step = { tool: query.name, label: query.label, status: 'success' as 'success' | 'failed', count: 0, durationMs: 0 }
    try {
      if (!Number.isInteger(ctx.userId) || ctx.userId <= 0) throw new Error('user required')
      const tool = ctx.tools.find((tool) => tool.name === query.name)
      if (!tool) throw new Error('tool missing')
      const response = await within(Promise.resolve().then(() => tool.execute({ ...query.args, user_id: ctx.userId })), 8000)
      const data = response.data as { items?: Record<string, unknown>[] } | undefined
      if (!response.success || !Array.isArray(data?.items) || data.items.some((item) => !item || typeof item !== 'object')) throw new Error('invalid result')
      step.count = data.items.length
      return { step, items: data.items }
    } catch {
      step.status = 'failed'
      return { step, items: [] as Record<string, unknown>[] }
    } finally { step.durationMs = Date.now() - start }
  }))
  for (const result of results) if (result.step.status === 'failed') warnings.push(`${result.step.label}查询失败，相关安排可能不完整，请刷新后再试。`)
  const tasks: PlanTask[] = []
  const upcomingAssignments: PlanTask[] = []
  const courseResult = results.find((result) => result.step.tool === 'course')
  const todoResult = results.find((result) => result.step.tool === 'todo')!
  const assignmentResult = results.find((result) => result.step.tool === 'assignment')!
  for (const [result, kind, field] of [[todoResult, '待办', 'due_date'], [assignmentResult, '作业', 'due_time']] as const) {
    for (const row of result.items) {
      if (row.is_completed || !row.title) continue
      const due = dateValue(row[field])
      const priority = Number(row.priority ?? (kind === '作业' ? 3 : 1))
      const task = { id: `${kind === '作业' ? 'assignment' : 'todo'}:${row.id}`, title: String(row.title), course: String(row.course_name ?? ''), kind,
        due: due === null ? null : chinaTime(due), priority: Number.isFinite(priority) ? Math.min(5, Math.max(1, priority)) : 1,
        overdue: due !== null && due < now }
      if (scope !== 'deadline' && due !== null && due >= end) {
        if (kind === '作业' && due <= now + 7 * DAY) upcomingAssignments.push(task)
        continue
      }
      tasks.push(task)
      if (scope !== 'deadline' && kind === '作业' && due !== null && due <= now + 7 * DAY) upcomingAssignments.push(task)
    }
  }
  tasks.sort((a, b) => (dateValue(a.due) ?? Infinity) - (dateValue(b.due) ?? Infinity) || b.priority - a.priority || a.id.localeCompare(b.id))
  const courses: SkillResult['courses'] = []
  const blockedDays = new Set<number>()
  for (const row of courseResult?.items ?? []) {
    const dayNumber = Number(row.weekday)
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
      for (let day = today; day < end; day += DAY) blockedDays.add(day)
      continue
    }
    if (Number(row.start_week) > week || Number(row.end_week) < week) continue
    const day = monday + (dayNumber - 1) * DAY
    if (day < today || day >= end) continue
    const start = timeOn(day, row.start_time)
    const finish = timeOn(day, row.end_time)
    if (start === null || finish === null || finish <= start) { blockedDays.add(day); continue }
    courses.push({ title: String(row.name ?? '未命名课程'), start: chinaTime(start), end: chinaTime(finish), location: String(row.location ?? '') })
  }
  courses.sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  if (blockedDays.size) warnings.push('部分课程时间格式不完整，相关日期暂不分配学习时间块。')
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length && Date.parse(courses[j].start) < Date.parse(courses[i].end); j++) {
      warnings.push(`课程时间冲突：${courses[i].title} 与 ${courses[j].title}，请核实课表。`)
    }
  }
  const slots: PlanSlot[] = []
  // Half-hour suggestions, with 10-minute margins around classes and fixed meal breaks.
  if (courseResult?.step.status === 'success') for (let day = scope === 'daily' ? target : today; day < end; day += DAY) {
    if (blockedDays.has(day)) continue
    for (let minute = 8 * 60; minute + 30 <= 22 * 60; minute += 30) {
      const start = day + minute * 60000
      const finish = start + 30 * 60000
      if (start < now || (minute >= 12 * 60 && minute < 13 * 60) || (minute >= 18 * 60 && minute < 19 * 60)) continue
      if (courses.some((course) => start < Date.parse(course.end) + 600000 && finish > Date.parse(course.start) - 600000)) continue
      slots.push({ id: `slot:${slots.length}`, start: chinaTime(start), end: chinaTime(finish) })
    }
  }
  return {
    scope,
    title: scope === 'daily' ? `${chinaDate(target)} 单日计划` : { weekly: '本周计划', deadline: '截止优先级计划' }[scope],
    now: chinaTime(now), end: chinaTime(end), tasks: tasks.slice(0, 12), upcomingAssignments: upcomingAssignments.slice(0, 12), omitted: Math.max(0, tasks.length - 12),
    courses, slots, steps: results.map((result) => result.step), warnings,
  }
}

export function defaultProposal(plan: SkillResult): PlanProposal {
  const used = new Set<string>()
  const sessions: PlanProposal['sessions'] = []
  for (const task of plan.tasks) {
    if (task.overdue) continue
    const slot = plan.slots.find((slot) => !used.has(slot.id) && (!task.due || Date.parse(slot.end) <= Date.parse(task.due)))
    if (slot) { used.add(slot.id); sessions.push({ taskId: task.id, slotId: slot.id }) }
  }
  return { order: plan.tasks.map((task) => task.id), sessions }
}

/** Model can only reorder known tasks and choose validated slots; it cannot invent facts or execute tools. */
export function validateProposal(value: unknown, plan: SkillResult): PlanProposal | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as PlanProposal
  if (!Array.isArray(raw.order) || !Array.isArray(raw.sessions) || raw.order.length !== plan.tasks.length || new Set(raw.order).size !== raw.order.length) return null
  if (raw.order.some((id) => !plan.tasks.some((task) => task.id === id))) return null
  const usedTasks = new Set<string>(), usedSlots = new Set<string>()
  for (const session of raw.sessions) {
    if (!session || typeof session !== 'object') return null
    const task = plan.tasks.find((task) => task.id === session.taskId)
    const slot = plan.slots.find((slot) => slot.id === session.slotId)
    if (!task || !slot || task.overdue || usedTasks.has(task.id) || usedSlots.has(slot.id)) return null
    if (task.due && Date.parse(slot.end) > Date.parse(task.due)) return null
    usedTasks.add(task.id); usedSlots.add(slot.id)
  }
  return { order: raw.order, sessions: raw.sessions.map(({ taskId, slotId }) => ({ taskId, slotId })) }
}

function display(time: string): string { return time.slice(5, 16).replace('T', ' ') }
export function renderPlan(plan: SkillResult, proposal: PlanProposal, fallback: boolean): string {
  const lines = [`${plan.title}（北京时间）`, ...plan.warnings]
  if (fallback) lines.push('以下为基础排序计划。')
  if (plan.scope !== 'deadline') {
    if (plan.courses.length) {
      lines.push('', '课程安排：')
      lines.push(...plan.courses.map((course) => `${display(course.start)}–${course.end.slice(11, 16)} ${course.title}${course.location ? `（${course.location}）` : ''}`))
    }
    if (plan.upcomingAssignments.length) {
      lines.push('', '临近截止作业：')
      lines.push(...plan.upcomingAssignments.map((task) => `${task.title}${task.course ? `（${task.course}）` : ''}；${task.due ? `截止 ${display(task.due)}` : '未设置截止时间'}`))
    }
  }
  const assignments = plan.tasks.filter((task) => task.kind === '作业')
  const todos = plan.tasks.filter((task) => task.kind === '待办')
  const taskLine = (task: PlanTask) => `${task.title}${task.course ? `（${task.course}）` : ''}；${task.due ? `截止 ${display(task.due)}` : '未设置截止时间'}${task.overdue ? '；已逾期' : ''}${task.priority >= 4 ? '；高优先级' : ''}`
  if (plan.scope === 'deadline') {
    if (assignments.length) {
      lines.push('', '临近截止作业：')
      lines.push(...assignments.map(taskLine))
    }
  }
  if (todos.length) {
    lines.push('', '待办事项：')
    lines.push(...todos.map(taskLine))
  }
  if (proposal.order.length) {
    lines.push('', '建议执行顺序：')
  }
  for (const [index, id] of proposal.order.entries()) {
    const task = plan.tasks.find((task) => task.id === id)!
    const session = proposal.sessions.find((session) => session.taskId === id)
    const slot = plan.slots.find((slot) => slot.id === session?.slotId)
    lines.push(`${index + 1}. ${task.kind}：${task.title}${task.course ? `（${task.course}）` : ''}；${task.due ? `截止 ${display(task.due)}` : '未设置截止时间'}${task.overdue ? '；已逾期，先核实是否已完成或可补交' : ''}${task.priority >= 4 ? '；高优先级' : ''}。`)
    if (slot) lines.push(`建议先投入 ${display(slot.start)}–${slot.end.slice(11, 16)}。`)
    else if (!task.overdue) lines.push('暂未分配时间块，请自行确认可用时间。')
  }
  if (!plan.tasks.length) lines.push(plan.steps.some((step) => step.status === 'failed') ? '任务数据不完整，暂无法判断是否有待处理事项。' : '当前没有需要处理的作业或待办。')
  if (plan.omitted) lines.push(`另有 ${plan.omitted} 项未展示，请到作业或待办页查看。`)
  lines.push('', '时间块是建议的30分钟起步投入，并非预计完成时间；未自动创建或修改日程。')
  return lines.join('\n')
}
