/**
 * 作业查询 Tool
 * 支持查询用户的作业列表（smartestu / chaoxing 两个平台）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'

export class AssignmentTool implements Tool {
  name = 'assignment'
  description = '查询用户的作业记录。action=list 返回作业列表（可加 source 筛选平台 smartestu/chaoxing，is_completed 筛选完成状态）；action=upcoming 返回截止临近（7 天内）未完成的作业。返回字段包括：title 标题、course_name 课程名、description 描述、due_time 截止时间、source 来源平台、is_completed 是否已完成。'
  inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'upcoming'], description: '操作类型' },
      source: { type: 'string', description: '平台来源，可选 smartestu / chaoxing（action=list 时可选）' },
      is_completed: { type: 'boolean', description: '筛选完成状态（action=list 时可选）' },
    },
    required: ['action'],
  }

  constructor(private ctx: Context) {}

  async execute(args: { action?: string; user_id?: number; source?: string; is_completed?: boolean }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }

    if (args.action === 'upcoming') {
      const now = new Date()
      const soon = new Date()
      soon.setDate(soon.getDate() + 7)
      const rows = await this.ctx.database.get(
        'assignment',
        {
          user_id: userId,
          is_completed: false,
          due_time: { $gte: now, $lte: soon },
        },
        { sort: { due_time: 'asc' } },
      )
      return { success: true, data: { items: rows } }
    }

    const query: Record<string, unknown> = { user_id: userId }
    if (args.source) query.source = args.source
    if (typeof args.is_completed === 'boolean') query.is_completed = args.is_completed

    const rows = await this.ctx.database.get(
      'assignment',
      query,
      { sort: { due_time: 'asc' } },
    )
    return { success: true, data: { items: rows } }
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new AssignmentTool(ctx))
}

apply.inject = ['tool', 'database']
