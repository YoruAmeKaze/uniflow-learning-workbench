/**
 * RAG Tool：在校园知识库（notification + knowledge_chunk）中做语义检索
 * - 查询向量 = 用户问题经 embedding 服务生成
 * - 检索范围 = 当前用户通知 + 系统用户全局通知（与通知页一致）
 * - 旧数据懒回填：无 chunk/embedding 的通知首次检索时补齐
 * - 返回 Top-K 相似片段（含标题/正文/分类/来源/发布时间/原文链接）
 */
import { Context } from 'cordis'

import type { Tool, ToolResult } from './index'
import { SYSTEM_USER_STUDENT_ID } from '../services/noticeCrawler'
import { embedText, cosineSimilarity } from '../services/embedding'
import { buildEmbeddingText, normalizeSourceUrl, KnowledgeDocument } from '../services/knowledge'

interface RagHit {
  id: number
  notification_id: number
  chunk_id: number
  title: string
  content: string
  category: string
  source: string
  source_url: string
  published_at: Date | null
  score: number
}

export class RagTool implements Tool {
  name = 'rag'
  description = '在校园知识库（通知和人工录入知识）中按 300–500 token 片段语义检索。当用户询问校园通知/政策/比赛/奖学金等知识性问题，或需要依据学校通知回答时使用。返回相关片段及标题、来源、发布时间和原文链接。'
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: '要检索的问题或关键词' },
      top_k: { type: 'number', description: '返回条数（可选，默认 3）' },
    },
    required: ['query'],
  }

  constructor(private ctx: Context) {}

  async execute(args: { query?: string; user_id?: number; top_k?: number }): Promise<ToolResult> {
    const userId = Number(args.user_id)
    if (!userId) return { success: false, error: '缺少 user_id' }
    const query = String(args.query ?? '').trim()
    if (!query) return { success: false, error: '缺少 query' }
    const topK = Math.min(Math.max(Number(args.top_k ?? 3), 1), 10)

    // 检索范围：我的 + 系统全局通知
    const systemRows = await this.ctx.database.get('user', { student_id: SYSTEM_USER_STUDENT_ID })
    const systemId = systemRows[0]?.id ?? null
    const scope = systemId
      ? { $or: [{ user_id: userId }, { user_id: systemId }] }
      : { user_id: userId }
    const items = await this.ctx.database.get('notification', scope)

    // 查询向量
    const queryVec = await embedText(query)

    const hits: RagHit[] = []
    for (const item of items) {
      const document = item as KnowledgeDocument
      const chunks = await this.ctx.knowledge.ensureNotificationIndexed(document)
      for (const chunk of chunks) {
        let vec = parseVector(chunk.embedding)
        // 切换 embedding 模型后维度可能变化（如 Ollama 768 → 百炼 1024），
        // 旧向量无法计算相似度，应在本次检索中自动重建。
        if (vec && vec.length !== queryVec.length) vec = null
        if (!vec) {
          // 懒回填：chunk 已经落库，只有向量服务可用时才生成向量。
          try {
            vec = await embedText(buildEmbeddingText(document, chunk.content))
            await this.ctx.database.set('knowledge_chunk', { id: chunk.id }, {
              embedding: JSON.stringify(vec),
            })
          } catch (error) {
            this.ctx.logger('rag').warn(`通知 ${item.id} 的 chunk ${chunk.id} 向量生成失败: ${String(error)}`)
            continue
          }
        }
        hits.push({
          id: item.id,
          notification_id: item.id,
          chunk_id: chunk.id,
          title: chunk.title || item.title,
          content: chunk.content,
          category: chunk.category || item.category,
          source: chunk.source || item.source,
          source_url: normalizeSourceUrl(chunk.source_url) || normalizeSourceUrl(chunk.source),
          published_at: chunk.published_at ?? item.published_at,
          score: cosineSimilarity(queryVec, vec),
        })
      }
    }

    hits.sort((a, b) => b.score - a.score)
    const top = hits.slice(0, topK).filter((h) => h.score > 0.25)
    return { success: true, data: { items: top } }
  }
}

function parseVector(raw: string | null | undefined): number[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

export function apply(ctx: Context) {
  ctx.tool.register(new RagTool(ctx))
}

apply.inject = ['tool', 'database', 'knowledge']
