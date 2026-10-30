/**
 * 用户信息 Tool：让 AI 读取当前用户的个人信息（学院/专业/年级等）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'

export class UserProfileTool implements Tool {
  name = 'user_profile'
  description = '读取当前用户的个人信息：姓名、学号、学院、专业、年级。用户提到"我的信息/我是哪个专业/完善过什么"时使用。'
  inputSchema = { type: 'object', properties: {}, additionalProperties: false }

  constructor(private ctx: Context) {}

  async execute(args: { user_id?: number }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }

    const rows = await this.ctx.database.get('user', { id: userId })
    const user = rows[0]
    if (!user) return { success: false, error: '用户不存在' }

    return {
      success: true,
      data: {
        username: user.username,
        student_id: user.student_id,
        college: user.college ?? '',
        major: user.major ?? '',
        grade: user.grade ?? '',
        profile_completed: Boolean(user.college || user.major || user.grade),
      },
    }
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new UserProfileTool(ctx))
}

apply.inject = ['tool', 'database']
