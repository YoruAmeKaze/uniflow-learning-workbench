/**
 * Agent 服务：Chat → LLM（支持 Tool Calling）→ 返回
 * 对应原 backend/services/agent.py；工具调用实现 PRD 第二阶段
 */
import { Context } from 'cordis'
import OpenAI from 'openai'

import { config } from '../config'
import type { Tool } from '../tools'
import { runPlanner } from './planner'
import type { PlanTrace } from '../skills/types'

declare module 'cordis' {
  interface Context {
    agent: AgentService
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ChatOptions {
  /** 上传文件内容不作为用户的规划指令。 */
  inputKind?: 'message' | 'document'
  /** 当前用户 id（自动注入工具参数，LLM 无需感知） */
  userId?: number
  /** 可用工具列表（来自 Tool 中心） */
  tools?: Tool[]
}

/** RAG 命中来源，前端据此渲染可点击原文链接。 */
export interface ChatSource {
  notification_id: number
  chunk_id: number
  title: string
  source: string
  url: string
  published_at: string | null
  score: number
}

export interface ChatResult {
  reply: string
  sources: ChatSource[]
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 注入今天的日期，让模型能正确换算"明天/后天/本周"等相对时间 */
function buildSystemPrompt(): string {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return (
    '你是一个帮助大学生完成校园事务的助手。你可以调用提供的工具来查询课程、作业、待办、校园通知，以及创建新的待办事项。' +
    `今天是 ${date}（${WEEKDAY_CN[now.getDay()]}），当前是本学期第 ${Math.floor((now.getTime() - new Date(config.semester.start).getTime()) / 604800000) + 1} 周。` +
    '提到"今天/明天/后天/本周/下周"等相对日期时，先换算成具体日期和周次再调用工具。' +
    '需要真实数据时务必调用工具，不要凭空编造；调用后把工具返回的结果整理成简洁自然的中文回答。' +
    '回答必须使用纯文本，禁止输出 Markdown 或其他标记语言：不要使用 ** 加粗、* 斜体、# 标题、- 或 * 列表符号、` 行内代码或代码块。' +
    '需要分条时直接使用「1. 2. 3.」这类普通编号，条目之间用普通换行分隔。' +
    '【作业 vs 待办 — 必须严格区分】' +
    '· "作业"（来自教务系统/超星平台的任务，如"明天交英语作业"、"数电实验报告"）：调用 assignment 工具查询，不要调用 todo 工具。' +
    '· "待办事项"（用户手动创建的提醒、会议、申请表提交等非教务系统任务）：调用 todo 工具的 create action。' +
    '· 用户说"有作业吗/作业是什么/作业截止时间" → assignment 工具；说"提醒我/记一下/待办" → todo 工具。' +
    '【通知页】只展示学校官方通知（爬虫自动抓取），不要往通知页写内容。群通知、老师消息等需完成的任务 → todo 工具。'
  )
}

const MAX_TOOL_ROUNDS = 5

/** 意图识别抽取出的待办 */
export interface IncomingTodo {
  title: string
  course_name?: string
  due_date?: string
  priority?: number
  description?: string
}

/** 意图识别抽取出的知识/通知 */
export interface IncomingKnowledge {
  title: string
  content?: string
  category?: string
}

/** 输入处理结果（步骤②） */
export interface ProcessResult {
  plan?: PlanTrace
  reply: string
  createdTodos: { title: string; id?: number; duplicated?: boolean }[]
  savedKnowledge: { title: string; id?: number; duplicated?: boolean } | null
  sources: ChatSource[]
}

interface ClassifyResult {
  intent: 'todo' | 'knowledge' | 'none'
  todos?: IncomingTodo[]
  knowledge?: IncomingKnowledge | null
  reply?: string
}

const KNOWLEDGE_CATEGORIES = ['school', 'college', 'competition', 'general']

/**
 * 生成可安全写入日志的 LLM 错误摘要。
 * 不记录 Authorization、API Key、请求正文或用户输入，仅保留服务端诊断所需字段。
 */
export function describeLlmError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const detail = error as Error & {
    status?: number
    code?: string | number | null
    type?: string | null
    request_id?: string | null
  }
  const message = detail.message.replace(/sk-[A-Za-z0-9_.-]+/g, 'sk-***')
  return JSON.stringify({
    name: detail.name,
    status: detail.status ?? null,
    code: detail.code ?? null,
    type: detail.type ?? null,
    requestId: detail.request_id ?? null,
    message,
  })
}

export class AgentService {
  private client: OpenAI

  constructor(private ctx: Context) {
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    })
    console.log(
      `[agent] LLM 已连接: provider=${config.llm.provider} baseUrl=${config.llm.baseUrl} model=${config.llm.model}`,
    )
  }

  /** 把 Tool 中心注册的工具转成 OpenAI function calling schema */
  private buildTools(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  /**
   * 百炼 Qwen3 微调模型默认会开启思考模式；非流式请求必须显式关闭。
   * OpenAI SDK 的类型未声明百炼扩展字段，但会将其原样序列化到请求体。
   */
  private createCompletion(params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, options?: { timeout: number; maxRetries: number }) {
    return this.client.chat.completions.create({
      ...params,
      enable_thinking: false,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, options)
  }

  /**
   * 输入处理（设计文档附录 B 步骤②）：
   * 对一段文本（来自纯文字消息或文件解析结果）做意图识别——是否需要生成待办 / 存入知识库，
   * 落库走 Tool 中心（todo / notification），Agent 不直接访问数据库。
   * - intent=todo：逐个创建待办（tool 内部去重）
   * - intent=knowledge：写入通知库（notification tool）
   * - intent=none 或 LLM 输出无法解析：降级为普通聊天（tool calling 循环）
   */
  async processIncoming(text: string, options: ChatOptions = {}): Promise<ProcessResult> {
    const planned = options.inputKind === 'document' ? null : await runPlanner(text, {
      tools: options.tools ?? [], userId: options.userId,
      model: async (system, input) => {
        const response = await this.createCompletion({
          model: config.llm.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: input }],
          temperature: 0.2, max_tokens: 1600,
        }, { timeout: 20000, maxRetries: 0 })
        return response.choices[0]?.message?.content ?? ''
      },
    })
    if (planned) {
      console.info(`[planner] skill=${planned.plan.skill} routing=${planned.plan.routing} generation=${planned.plan.generation} steps=${planned.plan.steps.map((step) => `${step.tool}:${step.status}`).join(',')}`)
      return {
        reply: planned.reply,
        plan: planned.plan,
        sources: [],
        createdTodos: [],
        savedKnowledge: null,
      }
    }

    const classify = await this.classify(text)

    // 降级：LLM 输出不可信/未识别出动作 → 走原有聊天流程（含工具调用）
    if (!classify || classify.intent === 'none' || !classify.reply) {
      const result = await this.chatWithSources(text, [], options)
      return { reply: result.reply, sources: result.sources, createdTodos: [], savedKnowledge: null }
    }

    const createdTodos: ProcessResult['createdTodos'] = []
    let savedKnowledge: ProcessResult['savedKnowledge'] = null

    if (classify.intent === 'todo' && Array.isArray(classify.todos) && classify.todos.length) {
      for (const item of classify.todos) {
        const title = String(item?.title ?? '').trim()
        if (!title) continue
        const result = await this.runTool(options.tools ?? [], 'todo', {
          action: 'create',
          title,
          course_name: String(item.course_name ?? ''),
          description: String(item.description ?? ''),
          priority: Number(item.priority ?? 1),
          due_date: item.due_date || undefined,
        }, options.userId)
        const data = result?.data as { id?: number; duplicated?: boolean } | undefined
        createdTodos.push({ title, id: data?.id, duplicated: Boolean(data?.duplicated) })
      }
    }

    if (classify.intent === 'knowledge' && classify.knowledge?.title) {
      const knowledge = classify.knowledge
      const category = KNOWLEDGE_CATEGORIES.includes(knowledge.category ?? '')
        ? knowledge.category
        : 'general'
      const result = await this.runTool(options.tools ?? [], 'notification', {
        action: 'create',
        title: String(knowledge.title).trim(),
        content: String(knowledge.content ?? ''),
        category,
        source: 'user-input',
      }, options.userId)
      const data = result?.data as { id?: number; duplicated?: boolean } | undefined
      savedKnowledge = { title: String(knowledge.title).trim(), id: data?.id, duplicated: Boolean(data?.duplicated) }
    }

    return { reply: classify.reply, createdTodos, savedKnowledge, sources: [] }
  }

  /** 单次 LLM 调用做意图分类 + 结构化抽取，输出解析失败返回 null */
  private async classify(text: string): Promise<ClassifyResult | null> {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const system = (
      '你是校园助手，负责判断用户发来的内容属于哪一类。用户可能直接发送一段老师发的通知/作业要求（纯文字），' +
      '也可能是从文件里提取出的文本。请判断：' +
      '1) 若包含需要完成的作业/任务/截止时间（DDL），intent=todo，并抽取 todos 数组（title 任务名、course_name 课程名、' +
      'due_date 截止日期 YYYY-MM-DD、priority 优先级 1-5、description 说明），没有则 todos 为空数组；' +
      '2) 若是值得保存的通知/知识（如政策、安排、报名信息）但不构成具体待办，intent=knowledge，抽取 knowledge 对象' +
      '（title 标题、content 正文、category 分类 school/college/competition/general），没有则为 null；' +
      '3) 若只是普通提问/闲聊/查询，intent=none。' +
      '同时给出 reply：给用户的简短中文回复（若创建了待办/存入知识库，请告知用户已自动完成）。' +
      `今天是 ${date}，相对日期请换算成具体日期。` +
      '只输出一个 JSON 对象（不要 Markdown 代码块、不要多余文字），格式：' +
      '{"intent":"todo|knowledge|none","todos":[{title,course_name,due_date,priority,description}],"knowledge":{title,content,category},"reply":"..."}'
    )
    try {
      const resp = await this.createCompletion({
        model: config.llm.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
      })
      return parseClassifyJson(resp.choices[0]?.message?.content ?? '')
    } catch (error) {
      const diagnostic = `意图识别失败，降级为普通聊天: model=${config.llm.model} ${describeLlmError(error)}`
      this.ctx.logger('agent').warn(diagnostic)
      console.warn(`[agent] ${diagnostic}`)
      return null
    }
  }

  /** 执行单个工具（user_id 由服务端注入；失败不中断整体流程） */
  private async runTool(
    tools: Tool[],
    name: string,
    args: Record<string, unknown>,
    userId?: number,
  ) {
    const tool = tools.find((t) => t.name === name)
    if (!tool) {
      this.ctx.logger('agent').warn(`未知工具: ${name}`)
      return null
    }
    try {
      return await tool.execute({ ...args, user_id: userId })
    } catch (error) {
      this.ctx.logger('agent').warn(`工具 ${name} 执行失败: ${String(error)}`)
      return null
    }
  }

  /**
   * RAG 上下文构建：调用 rag Tool 做语义检索，命中时生成知识片段注入 system prompt。
   * 失败/无命中返回空串；不抛出（降级为普通对话）。
   */
  private async buildRagContext(message: string, options: ChatOptions): Promise<{ prompt: string; sources: ChatSource[] }> {
    const ragTool = options.tools?.find((t) => t.name === 'rag')
    if (!ragTool || !message.trim()) return { prompt: '', sources: [] }
    try {
      const result = await ragTool.execute({ query: message, user_id: options.userId, top_k: 3 })
      const items = (result as { data?: { items?: unknown[] } })?.data?.items ?? []
      if (!items.length) return { prompt: '', sources: [] }
      const sourceMap = new Map<string, ChatSource>()
      const parts = items.map((raw) => {
        const item = raw as {
          id?: number
          notification_id?: number
          chunk_id?: number
          title?: string
          content?: string
          category?: string
          source?: string
          source_url?: string
          published_at?: string | Date | null
          score?: number
        }
        const notificationId = Number(item.notification_id ?? item.id ?? 0)
        const key = `${notificationId}:${item.source_url ?? item.source ?? item.title ?? ''}`
        if (!sourceMap.has(key)) {
          const published = item.published_at instanceof Date
            ? item.published_at.toISOString()
            : item.published_at ? String(item.published_at) : null
          sourceMap.set(key, {
            notification_id: notificationId,
            chunk_id: Number(item.chunk_id ?? 0),
            title: item.title ?? '',
            source: item.source ?? '',
            url: item.source_url || (/^https?:\/\//i.test(item.source ?? '') ? item.source ?? '' : ''),
            published_at: published,
            score: Number(item.score ?? 0),
          })
        }
        const sourceIndex = [...sourceMap.keys()].indexOf(key) + 1
        const publishedText = item.published_at ? String(item.published_at) : '未知'
        return `${sourceIndex}. ${item.title ?? ''}（分类:${item.category ?? ''}，发布时间:${publishedText}）\n${(item.content ?? '').slice(0, 1500)}`
      })
      const prompt = (
        '\n\n以下是从校园知识库中检索到的、可能与本次问题相关的内容（回答时优先据此回答；' +
        '若与问题无关请忽略，不要编造知识库中没有的信息）。不要输出网页链接或来源标记：\n' +
        parts.join('\n')
      )
      // 用户选择不展示网页来源；来源仅用于内部构建检索上下文，不返回给前端。
      return { prompt, sources: [] }
    } catch (error) {
      this.ctx.logger('agent').warn(`RAG 检索降级: ${String(error)}`)
      return { prompt: '', sources: [] }
    }
  }

  /** 兼容旧调用方：仅返回回答文本。 */
  async chat(message: string, history: ChatMessage[] = [], options: ChatOptions = {}): Promise<string> {
    const result = await this.chatWithSources(message, history, options)
    return result.reply
  }

  /** 发送消息给 LLM；带工具时自动执行工具调用并返回回答与来源。 */
  async chatWithSources(message: string, history: ChatMessage[] = [], options: ChatOptions = {}): Promise<ChatResult> {
    // RAG 注入：先用语义检索找出知识库中相关内容拼进 system prompt。
    // 不依赖模型 function calling（本地 qwythos 不支持 tools），检索失败时静默降级为普通对话。
    const ragContext = await this.buildRagContext(message, options)
    const systemPrompt = buildSystemPrompt() + ragContext.prompt
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]
    const tools = options.tools?.length ? this.buildTools(options.tools) : undefined

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await this.createCompletion({
        model: config.llm.model,
        messages,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        temperature: 0.7,
      })
      const choice = resp.choices[0]
      const msg = choice?.message
      if (!msg?.tool_calls?.length) {
        return { reply: msg?.content ?? '', sources: ragContext.sources }
      }

      // 1) 记录 assistant 的工具调用请求
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      })

      // 2) 逐个执行工具，结果回填为 tool 消息
      for (const tc of msg.tool_calls) {
        const tool = options.tools?.find((t) => t.name === tc.function.name)
        let result: string
        if (!tool) {
          result = JSON.stringify({ success: false, error: `未知工具: ${tc.function.name}` })
        } else {
          let args: Record<string, any> = {}
          try {
            args = JSON.parse(tc.function.arguments ?? '{}')
          } catch {
            args = {}
          }
          // user_id 由服务端注入，LLM 不需要知道
          args.user_id = options.userId
          try {
            result = JSON.stringify(await tool.execute(args))
          } catch (error) {
            result = JSON.stringify({ success: false, error: String(error) })
          }
        }
        this.ctx.logger('agent').info(`[tool] ${tc.function.name} → ${result.slice(0, 200)}`)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }
    return { reply: '抱歉，这次请求的步骤太多没有完成，请换个简洁的说法再试一次。', sources: ragContext.sources }
  }
}

/**
 * 宽松解析 LLM 输出的 JSON：容忍 ```json 代码块与前后多余文字，
 * 并从对象中提取所需字段（LLM 输出不可信，字段均做类型校验）。
 */
export function parseClassifyJson(content: string): ClassifyResult | null {
  if (!content) return null
  // 提取第一个 { 到最后一个 } 之间的内容（含代码块剥离）
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let raw: unknown
  try {
    raw = JSON.parse(content.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const intent = obj.intent
  if (intent !== 'todo' && intent !== 'knowledge' && intent !== 'none') return null
  const reply = typeof obj.reply === 'string' ? obj.reply.trim() : ''

  const result: ClassifyResult = { intent, reply }

  if (intent === 'todo' && Array.isArray(obj.todos)) {
    result.todos = obj.todos
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        title: typeof item.title === 'string' ? item.title.trim() : '',
        course_name: typeof item.course_name === 'string' ? item.course_name : '',
        description: typeof item.description === 'string' ? item.description : '',
        priority: typeof item.priority === 'number' ? item.priority : 1,
        due_date: typeof item.due_date === 'string' ? item.due_date : '',
      }))
      .filter((item) => item.title)
  }

  if (intent === 'knowledge' && typeof obj.knowledge === 'object' && obj.knowledge !== null) {
    const k = obj.knowledge as Record<string, unknown>
    result.knowledge = {
      title: typeof k.title === 'string' ? k.title.trim() : '',
      content: typeof k.content === 'string' ? k.content : '',
      category: typeof k.category === 'string' ? k.category : 'general',
    }
  }

  return result
}

export function apply(ctx: Context) {
  ctx.provide('agent', new AgentService(ctx))
}

apply.inject = ['tool']
