/**
 * 应用配置：从环境变量读取（.env 显式指向项目根目录，与 Python 版一致）
 * 对应原 backend/config.py
 */
import dotenv from 'dotenv'
import path from 'node:path'

// .env 路径：项目根目录（lib/config.js → ../../.env）
const ENV_FILE = path.resolve(__dirname, '../../.env')
dotenv.config({ path: ENV_FILE })

export interface AppConfig {
  /** 调试模式 */
  debug: boolean
  /** MySQL 连接 */
  db: {
    host: string
    port: number
    user: string
    password: string
    database: string
    charset: string
  }
  /** JWT */
  jwt: {
    secret: string
    /** 过期时间（分钟） */
    expiresInMinutes: number
  }
  /** LLM (OpenAI Compatible：DeepSeek 云端 / Ollama 本地) */
  llm: {
    provider: 'ollama' | 'openai'
    apiKey: string
    baseUrl: string
    model: string
  }
  /** HTTP Server */
  server: {
    host: string
    port: number
  }
  /** 文件上传 */
  upload: {
    /** 单次上传大小上限（MB） */
    maxMb: number
  }
  /** Embedding（RAG 向量：Ollama 或 OpenAI 兼容接口） */
  embedding: {
    provider: 'ollama' | 'openai'
    /** API 地址；Ollama 不含 /v1，OpenAI 兼容接口含 /v1 */
    baseUrl: string
    /** 向量模型名 */
    model: string
    /** OpenAI 兼容接口的密钥；为空时复用 LLM_API_KEY */
    apiKey: string
  }
  /** 学期校历（周课表按周显示） */
  semester: {
    /** 开学第 1 周周一日期（YYYY-MM-DD），用于推算当前周次；为空时默认第 1 周 */
    start: string
  }
  /** 数你最灵（作业平台）*/
  smartestu: {
    school_code: string
  }
  /** 学习通（超星）*/
  chaoxing: {
    enabled: boolean
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const debug = env.DEBUG !== 'false'
  // 应用调试开关只进入 config.debug；从环境变量移除 DEBUG，
  // 避免 OpenAI SDK 在 process.env.DEBUG === 'true' 时打印全量请求/响应日志（OpenAI:DEBUG 刷屏）
  if (env === process.env) delete process.env.DEBUG
  return {
    debug,
    db: {
      host: env.DB_HOST ?? '127.0.0.1',
      port: Number(env.DB_PORT ?? 3306),
      user: env.DB_USER ?? 'root',
      password: env.DB_PASSWORD ?? '',
      database: env.DB_NAME ?? 'uniflow',
      charset: env.DB_CHARSET ?? 'utf8mb4_general_ci',
    },
    jwt: {
      secret: env.SECRET_KEY ?? 'change-me-to-a-random-secret-key',
      expiresInMinutes: Number(env.ACCESS_TOKEN_EXPIRE_MINUTES ?? 1440),
    },
    llm: buildLlmConfig(env),
    server: {
      host: env.SERVER_HOST ?? '127.0.0.1',
      port: Number(env.SERVER_PORT ?? 8000),
    },
    upload: {
      maxMb: Number(env.UPLOAD_MAX_MB ?? 10),
    },
    embedding: buildEmbeddingConfig(env),
    semester: {
      start: env.SEMESTER_START ?? '2026-09-07',
    },
    smartestu: {
      school_code: env.SMARTESTU_SCHOOL_CODE ?? 'cqupt',
    },
    chaoxing: {
      // 账号由刷新接口按需传入；未配置开关时应允许抓取，只有显式 false 才禁用。
      enabled: env.CHAOXING_ENABLED !== 'false',
    },
  }
}

function buildEmbeddingConfig(env: NodeJS.ProcessEnv): AppConfig['embedding'] {
  const provider = env.EMBEDDING_PROVIDER === 'openai' ? 'openai' : 'ollama'
  if (provider === 'openai') {
    return {
      provider,
      baseUrl: env.EMBEDDING_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: env.EMBEDDING_MODEL ?? 'text-embedding-v4',
      apiKey: env.EMBEDDING_API_KEY ?? env.LLM_API_KEY ?? '',
    }
  }
  return {
    provider,
    baseUrl: env.EMBEDDING_BASE_URL ?? 'http://127.0.0.1:11434',
    model: env.EMBEDDING_MODEL ?? 'nomic-embed-text',
    apiKey: '',
  }
}

/** LLM 配置：LLM_PROVIDER=ollama 时默认指向本地 Ollama，否则按 OpenAI 兼容云端处理 */
function buildLlmConfig(env: NodeJS.ProcessEnv): AppConfig['llm'] {
  const provider = env.LLM_PROVIDER === 'ollama' ? 'ollama' : 'openai'
  if (provider === 'ollama') {
    return {
      provider,
      // Ollama 的 /v1 端点不校验 key，但 openai 客户端要求非空
      apiKey: env.LLM_API_KEY ?? 'ollama',
      baseUrl: env.LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1',
      model: env.LLM_MODEL ?? env.OLLAMA_MODEL ?? 'qwen2.5:7b',
    }
  }
  return {
    provider,
    apiKey: env.LLM_API_KEY ?? '',
    baseUrl: env.LLM_BASE_URL ?? 'https://api.deepseek.com',
    model: env.LLM_MODEL ?? 'deepseek-chat',
  }
}

/** 全局单例配置（入口加载 .env 后调用 loadConfig 生成） */
export let config: AppConfig = loadConfig()

export function setConfig(value: AppConfig): void {
  config = value
}
