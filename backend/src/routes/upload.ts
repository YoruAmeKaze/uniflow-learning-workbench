/**
 * 文件上传解析 API（输入处理步骤① → 步骤②）
 * POST /api/chat/upload：multipart 上传文件（字段名 file，限 PDF/TXT/MD）
 * → 解析为文本 → 意图识别（生成待办 / 存入知识库 / 普通聊天）
 */
import { Context } from 'cordis'
import { HttpError, route, requireUser, send } from '../utils/http'
import { config } from '../config'
import { isSupportedFile, parseFileToText } from '../services/fileParser'
import { describeLlmError } from '../services/agent'

export function apply(ctx: Context) {
  ctx.server.post('/api/chat/upload', route(async (req, res) => {
    const user = await requireUser(ctx, req)

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new HttpError(400, '缺少上传文件（字段名 file）')
    }

    const maxBytes = config.upload.maxMb * 1024 * 1024
    if (file.size > maxBytes) {
      throw new HttpError(413, `文件过大，最大支持 ${config.upload.maxMb}MB`)
    }
    if (!isSupportedFile(file.name)) {
      throw new HttpError(415, '不支持的文件类型，请上传 PDF / TXT / Markdown 文件')
    }

    // 步骤①：解析文件 → 文本
    let parsed
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      parsed = await parseFileToText(file.name, buffer)
    } catch (error) {
      ctx.logger('upload').warn(`文件解析失败: ${String(error)}`)
      throw new HttpError(422, error instanceof Error ? error.message : '文件解析失败')
    }
    if (!parsed.text.trim()) {
      throw new HttpError(422, '未能从文件中提取到文字内容（扫描版 PDF 暂不支持，请上传文字版 PDF 或 TXT）')
    }

    // 步骤②：意图识别 + 落库（todo / notification tool）
    try {
      const result = await ctx.agent.processIncoming(
        `【文件名】${parsed.filename}\n【文件内容】\n${parsed.text}`,
        {
          userId: user.id,
          inputKind: 'document',
          tools: ctx.tool.list(),
        },
      )
      send(res, {
        filename: parsed.filename,
        reply: result.reply,
        created_todos: result.createdTodos,
        saved_knowledge: result.savedKnowledge,
        sources: result.sources,
      })
    } catch (error) {
      ctx.logger('upload').warn(`意图识别失败: ${describeLlmError(error)}`)
      throw new HttpError(502, 'AI 服务暂时不可用，请稍后再试')
    }
  }))
}

apply.inject = ['server', 'database', 'auth', 'agent', 'tool']
