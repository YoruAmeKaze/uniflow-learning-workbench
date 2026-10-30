/**
 * 待办查询 Tool
 * 对应原 backend/tools/todo.py（补全为真实查询）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'

export class TodoTool implements Tool {
  name = 'todo'
  description = '查询或创建用户的待办事项。action=list 返回全部待办；action=upcoming 返回未来 days 天内未完成的待办；action=create 新建待办（title 必填，可带 due_date 截止日期时间、course_name 课程、description 详细描述、priority 优先级 1-5；同一用户相同 title 且未完成的待办已存在时自动去重，不重复创建）。'
  inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'upcoming', 'create'], description: '操作类型' },
      title: { type: 'string', description: '待办标题（action=create 时必填）' },
      course_name: { type: 'string', description: '所属课程（action=create 时可选）' },
      description: { type: 'string', description: '详细描述/备注（action=create 时可选）' },
      priority: { type: 'number', description: '优先级 1-5（action=create 时可选，默认 1）' },
      due_date: { type: 'string', description: '截止日期时间，格式 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm，如 2026-09-07T14:30（action=create 时可选）' },
      days: { type: 'number', description: '未来天数（action=upcoming 时可选，默认 7）' },
    },
    required: ['action'],
  }

  constructor(private ctx: Context) {}

  async execute(args: { action?: string; user_id?: number; title?: string; course_name?: string; description?: string; priority?: number; due_date?: string; days?: number }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }

    if (args.action === 'upcoming') {
      const days = Number(args.days ?? 7)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const end = new Date(today)
      end.setDate(end.getDate() + days)
      const rows = await this.ctx.database.get(
        'todo',
        { user_id: userId, is_completed: false, due_date: { $gte: today, $lte: end } },
        { sort: { due_date: 'asc', priority: 'desc' } },
      )
      return { success: true, data: { items: rows } }
    }

    if (args.action === 'create') {
      const title = String(args.title ?? '').trim()
      if (!title) return { success: false, error: '缺少 title' }
      const courseName = String(args.course_name ?? '').trim()
      // 去重：同一用户存在相同 title 的未完成待办则不重复创建（title 已含课程信息，不叠加 course_name，
      // 避免两轮 LLM 抽取的课程名不一致时去重失效）。若旧记录缺课程名/截止日期而本次更完整，顺手补全。
      const dup = await this.ctx.database.get('todo', { user_id: userId, title, is_completed: false })
      if (dup[0]) {
        const patch: Record<string, unknown> = {}
        if (!dup[0].course_name && courseName) patch.course_name = courseName
        if (!dup[0].due_date && args.due_date) patch.due_date = new Date(args.due_date)
        if (Object.keys(patch).length) {
          await this.ctx.database.set('todo', { id: dup[0].id }, { ...patch, updated_at: new Date() })
        }
        return { success: true, data: { duplicated: true, todo: { ...dup[0], ...patch } } }
      }
      const todo = await this.ctx.database.create('todo', {
        user_id: userId,
        title,
        course_name: courseName,
        description: String(args.description ?? ''),
        priority: Number(args.priority ?? 1),
        due_date: args.due_date ? new Date(args.due_date) : undefined,
      })
      return { success: true, data: todo }
    }

    const rows = await this.ctx.database.get('todo', { user_id: userId })
    return { success: true, data: { items: rows } }
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new TodoTool(ctx))
}

apply.inject = ['tool', 'database']
