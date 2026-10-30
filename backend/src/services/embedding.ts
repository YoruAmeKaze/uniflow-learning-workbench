/**
 * Embedding 服务：支持本地 Ollama 与 OpenAI 兼容接口（例如阿里百炼）。
 * 供 RAG 语义检索使用。
 */
import { config } from '../config'

/** 向量维度（nomic-embed-text = 768） */
export const EMBEDDING_DIM = 768

export interface EmbeddingOptions {
  /** 模型名，默认取配置 */
  model?: string
  /** 超时（毫秒） */
  timeoutMs?: number
}

/**
 * 计算单段文本的 embedding 向量。
 * @throws Error embedding 服务不可用 / 请求失败
 */
export async function embedText(
  text: string,
  options: EmbeddingOptions = {},
): Promise<number[]> {
  const model = options.model ?? config.embedding.model
  const baseUrl = config.embedding.baseUrl
  const timeoutMs = options.timeoutMs ?? 30_000

  const endpoint = config.embedding.provider === 'openai'
    ? `${baseUrl.replace(/\/$/, '')}/embeddings`
    : `${baseUrl.replace(/\/$/, '')}/api/embeddings`
  const body = config.embedding.provider === 'openai'
    ? { model, input: text, encoding_format: 'float' }
    : { model, prompt: text }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.embedding.provider === 'openai' && config.embedding.apiKey) {
    headers.Authorization = `Bearer ${config.embedding.apiKey}`
  }
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) {
    throw new Error(`embedding 请求失败: HTTP ${resp.status}`)
  }
  const data = (await resp.json()) as { embedding?: number[]; data?: Array<{ embedding?: number[] }> }
  const embedding = config.embedding.provider === 'openai' ? data.data?.[0]?.embedding : data.embedding
  if (!Array.isArray(embedding) || !embedding.length) {
    throw new Error('embedding 响应缺少向量数据')
  }
  return embedding
}

/**
 * 余弦相似度（-1 ~ 1）。向量由 embedding 服务保证同维度；空向量返回 0。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
