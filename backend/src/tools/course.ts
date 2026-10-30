/**
 * 课程查询 Tool
 * 对应原 backend/tools/course.py（补全为真实查询）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'

export class CourseTool implements Tool {
  name = 'course'
  description = '查询用户课程信息。weekday 指定星期几（1=周一…7=周日），week 指定第几周，均为可选；同时传入时返回该周该天的课程；只传 weekday 返所有周的该天课程；只传 week 返该周每天课程；都不传返全部。'
  inputSchema = {
    type: 'object',
    properties: {
      /** 星期几：1=周一，2=周二，…，7=周日 */
      weekday: { type: 'number', description: '星期几：1=周一，2=周二，…，7=周日', minimum: 1, maximum: 7 },
      /** 第几周（学期第几周），用于过滤该周才开课的课程 */
      week: { type: 'number', description: '学期第几周（如当前是第3周则填3），配合 weekday 查该周该天的课', minimum: 1 },
    },
  }

  constructor(private ctx: Context) {}

  async execute(args: { weekday?: number; week?: number; user_id?: number }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }

    const { weekday, week } = args

    // 取全部课程后按条件过滤（数据库不支持跨记录的范围查询，手动过滤）
    let rows = await this.ctx.database.get('course', { user_id: userId })

    if (week != null) {
      rows = rows.filter((c: any) => c.start_week <= week && c.end_week >= week)
    }
    if (weekday != null) {
      rows = rows.filter((c: any) => c.weekday === weekday)
    }

    rows.sort((a: any, b: any) =>
      a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
    )

    return { success: true, data: { weekday, week, items: rows } }
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new CourseTool(ctx))
}

apply.inject = ['tool', 'database']
