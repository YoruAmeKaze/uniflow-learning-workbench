/**
 * 通知查询 Tool
 * 对应原 backend/tools/notification.py（补全为真实查询）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'
import { normalizeSourceUrl } from '../services/knowledge'

export class NotificationTool implements Tool {
  name = 'notification'
  description = '查询或保存用户的校园通知/知识。action=list 返回通知列表（可加 category 按分类筛选）；action=unread 只返回未读通知；action=create 保存一条通知/知识到用户通知库（title 必填，建议提供完整 content，可带 category、source 和 source_url；系统会自动分成 300–500 token 的 RAG 片段并建立向量）。同一用户相同 title 已存在时自动去重。'
  inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'unread', 'create'], description: '操作类型' },
      category: { type: 'string', description: '通知分类：school/college/competition/general（action=list 或 create 时可选）' },
      title: { type: 'string', description: '通知标题（action=create 时必填）' },
      content: { type: 'string', description: '通知正文（action=create 时可选）' },
      source: { type: 'string', description: '来源标记，如 user-input / 文件名（action=create 时可选）' },
      source_url: { type: 'string', description: '原文 URL（可选，回答时会显示为可点击来源）' },
    },
    required: ['action'],
  }

  constructor(private ctx: Context) {}

  async execute(args: { action?: string; user_id?: number; category?: string; title?: string; content?: string; source?: string; source_url?: string }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }

    if (args.action === 'create') {
      const title = String(args.title ?? '').trim()
      if (!title) return { success: false, error: '缺少 title' }
      // 去重：同一用户存在相同 title 的通知则不重复创建
      const dup = await this.ctx.database.get('notification', { user_id: userId, title })
      if (dup[0]) {
        return { success: true, data: { duplicated: true, notification: dup[0] } }
      }
      const notification = await this.ctx.database.create('notification', {
        user_id: userId,
        title,
        content: String(args.content ?? ''),
        category: args.category || 'general',
        source: String(args.source ?? 'user-input'),
        source_url: normalizeSourceUrl(String(args.source_url ?? '')),
        is_read: false,
        published_at: new Date(),
      })
      ;(this.ctx as any).knowledge?.scheduleIndex?.(notification.id)
      return { success: true, data: notification }
    }

    if (args.action === 'unread') {
      const rows = await this.ctx.database.get(
        'notification',
        { user_id: userId, is_read: false },
        { sort: { published_at: 'desc' } },
      )
      return { success: true, data: { items: rows } }
    }

    const query: Record<string, unknown> = { user_id: userId }
    if (args.category) query.category = args.category
    const rows = await this.ctx.database.get('notification', query, { sort: { published_at: 'desc' } })
    return { success: true, data: { items: rows } }
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new NotificationTool(ctx))
}

apply.inject = ['tool', 'database', 'knowledge']
