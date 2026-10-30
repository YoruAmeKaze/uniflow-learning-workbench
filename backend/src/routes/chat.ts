/**
 * AI 聊天 API
 * 对应原 backend/api/chat.py
 */
import { Context } from 'cordis'
import z from 'schemastery'

import { HttpError, parseBody, route, requireUser, send } from '../utils/http'
import { describeLlmError } from '../services/agent'
import { config } from '../config'

interface ChatBody {
  message: string
}

export function apply(ctx: Context) {
  ctx.server.post('/api/chat', route(async (req, res) => {
    const body = await parseBody<ChatBody>(req, z.object({ message: z.string().required() }))
    const user = await requireUser(ctx, req)
    // 用 console 保证本地开发终端可见；不记录用户消息正文，避免隐私泄露。
    console.info(`[chat] 收到请求 userId=${user.id} messageLength=${body.message.length}`)
    try {
      // 意图识别：文字中若含作业/DDL/知识性内容，自动生成待办或存入知识库；否则正常聊天
      const result = await ctx.agent.processIncoming(body.message, {
        userId: user.id,
        tools: ctx.tool.list(),
      })
      send(res, {
        reply: result.reply,
        created_todos: result.createdTodos,
        saved_knowledge: result.savedKnowledge,
        sources: result.sources,
        plan: result.plan,
      })
    } catch (error) {
      const diagnostic = `LLM 调用失败: provider=${config.llm.provider} model=${config.llm.model} ${describeLlmError(error)}`
      ctx.logger('chat').warn(diagnostic)
      console.error(`[chat] ${diagnostic}`)
      throw new HttpError(502, 'AI 服务暂时不可用，请稍后再试')
    }
  }))
}

apply.inject = ['server', 'database', 'auth', 'agent', 'tool']
