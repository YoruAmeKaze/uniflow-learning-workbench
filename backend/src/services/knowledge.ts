/**
 * 知识库索引服务：把通知/人工知识切成适合 RAG 的片段，并保存检索元数据。
 *
 * notification 表保留作为知识文档，knowledge_chunk 表保存可检索的 chunk。
 * 这样一条长通知可以有多个向量，且标题、来源、发布时间会跟随每个片段返回。
 */
import { Context } from 'cordis'

import { embedText } from './embedding'

declare module 'cordis' {
  interface Context {
    knowledge: KnowledgeService
  }
}

export const CHUNK_MIN_TOKENS = 300
export const CHUNK_MAX_TOKENS = 500
export const CHUNK_TARGET_TOKENS = 400

export interface KnowledgeDocument {
  id: number
  user_id: number
  title: string
  content: string
  category: string
  source: string
  source_url?: string | null
  published_at: Date | null
  /** 旧版本 notification.embedding，迁移到单 chunk 时可复用 */
  embedding?: string | null
}

export interface KnowledgeChunk {
  id: number
  notification_id: number
  user_id: number
  chunk_index: number
  content: string
  title: string
  category: string
  source: string
  source_url: string
  published_at: Date | null
  embedding: string | null
}

export interface IndexOptions {
  /** 是否在写入 chunk 后立即请求 embedding；默认 false，避免录入被模型服务阻塞。 */
  embed?: boolean
}

/** 估算 token 数：中文/非 ASCII 字符按 1，连续 ASCII 文本约 4 字符按 1。 */
export function estimateTokenCount(text: string): number {
  let tokens = 0
  let asciiRun = 0
  const flushAscii = () => {
    if (asciiRun > 0) {
      tokens += Math.max(1, Math.ceil(asciiRun / 4))
      asciiRun = 0
    }
  }

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x7f && /[A-Za-z0-9]/.test(char)) {
      asciiRun++
      continue
    }
    flushAscii()
    if (/\s/.test(char)) continue
    if (code <= 0x7f && /[.,!?;:'"()[\]{}<>\/\\_+=*#@-]/.test(char)) {
      tokens += 0.25
    } else {
      tokens += 1
    }
  }
  flushAscii()
  return Math.max(1, Math.ceil(tokens))
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 将超长段按 token 预算切开，确保普通 chunk 不超过最大长度。 */
function splitOversized(text: string, maxTokens: number): string[] {
  const result: string[] = []
  let current = ''
  for (const char of text) {
    const candidate = current + char
    if (current && estimateTokenCount(candidate) > maxTokens) {
      result.push(current.trim())
      current = char
    } else {
      current = candidate
    }
  }
  if (current.trim()) result.push(current.trim())
  return result
}

/**
 * 按段落/句子边界切分文本，目标约 400 token，正常片段控制在 300–500 token。
 * 末尾不足 300 token 时尽量与前一段合并；很短的文档保留为一个片段。
 */
export function splitIntoChunks(text: string): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  const units = normalized
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？!?；;])\s*/u))
    .map((unit) => unit.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  let currentTokens = 0
  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
    currentTokens = 0
  }

  for (const unit of units) {
    const unitTokens = estimateTokenCount(unit)
    if (unitTokens > CHUNK_MAX_TOKENS) {
      pushCurrent()
      chunks.push(...splitOversized(unit, CHUNK_MAX_TOKENS))
      continue
    }

    const nextTokens = currentTokens + unitTokens
    if (current && nextTokens > CHUNK_MAX_TOKENS) {
      pushCurrent()
    } else if (current && currentTokens >= CHUNK_TARGET_TOKENS && nextTokens > CHUNK_TARGET_TOKENS) {
      pushCurrent()
    }

    current = current ? `${current}\n${unit}` : unit
    currentTokens = estimateTokenCount(current)
  }
  pushCurrent()

  // 将过短的尾部并入上一段，除非合并会超过上限。
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    const previous = chunks[chunks.length - 2]
    if (estimateTokenCount(last) < CHUNK_MIN_TOKENS &&
        estimateTokenCount(`${previous}\n${last}`) <= CHUNK_MAX_TOKENS) {
      chunks.splice(chunks.length - 2, 2, `${previous}\n${last}`)
    }
  }
  return chunks
}

export function buildEmbeddingText(document: KnowledgeDocument, content: string): string {
  const published = document.published_at?.toISOString() ?? ''
  return [
    `标题：${document.title}`,
    `分类：${document.category}`,
    `来源：${document.source}`,
    document.source_url ? `原文链接：${document.source_url}` : '',
    published ? `发布时间：${published}` : '',
    '正文：',
    content,
  ].filter(Boolean).join('\n')
}

export class KnowledgeService {
  constructor(private ctx: Context) {}

  /** 为一条通知重建 chunk；正文更新时调用，保留标题/来源/时间元数据。 */
  async indexNotification(notificationId: number, options: IndexOptions = {}): Promise<KnowledgeChunk[]> {
    const rows = await this.ctx.database.get('notification', { id: notificationId })
    const document = rows[0] as KnowledgeDocument | undefined
    if (!document) return []

    const body = String(document.content ?? '').trim() || document.title
    const chunks = splitIntoChunks(body)
    await this.ctx.database.remove('knowledge_chunk', { notification_id: notificationId })

    const created: KnowledgeChunk[] = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = await this.ctx.database.create('knowledge_chunk', {
        notification_id: document.id,
        user_id: document.user_id,
        chunk_index: i,
        content: chunks[i],
        title: document.title,
        category: document.category,
        source: document.source,
        source_url: normalizeSourceUrl(document.source_url) || normalizeSourceUrl(document.source),
        published_at: document.published_at,
        embedding: chunks.length === 1 ? (document.embedding ?? null) : null,
      }) as KnowledgeChunk
      created.push(chunk)
    }

    if (options.embed) await this.embedChunks(document, created)
    return created
  }

  /** 确保旧通知至少有 chunk；旧 notification.embedding 不再作为唯一索引。 */
  async ensureNotificationIndexed(notification: KnowledgeDocument): Promise<KnowledgeChunk[]> {
    const existing = await this.ctx.database.get('knowledge_chunk', { notification_id: notification.id })
    if (existing.length) return existing as KnowledgeChunk[]
    return this.indexNotification(notification.id)
  }

  /** 非阻塞索引：适合通知爬虫和人工录入调用。 */
  scheduleIndex(notificationId: number): void {
    void this.indexNotification(notificationId, { embed: true }).catch((error) => {
      this.ctx.logger('knowledge').warn(`通知 ${notificationId} 索引失败: ${String(error)}`)
    })
  }

  private async embedChunks(document: KnowledgeDocument, chunks: KnowledgeChunk[]): Promise<void> {
    for (const chunk of chunks) {
      try {
        const vector = await embedText(buildEmbeddingText(document, chunk.content))
        await this.ctx.database.set('knowledge_chunk', { id: chunk.id }, {
          embedding: JSON.stringify(vector),
        })
        chunk.embedding = JSON.stringify(vector)
      } catch (error) {
        // embedding 服务不可用时保留 chunk，RAG 下次检索会重试。
        this.ctx.logger('knowledge').warn(`chunk ${chunk.id} 向量生成失败: ${String(error)}`)
      }
    }
  }
}

export function isHttpUrl(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

export function normalizeSourceUrl(value?: string | null): string {
  const url = String(value ?? '').trim()
  return isHttpUrl(url) ? url : ''
}

export function apply(ctx: Context) {
  ctx.provide('knowledge', new KnowledgeService(ctx))
}

apply.inject = ['database']
