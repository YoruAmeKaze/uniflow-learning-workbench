/**
 * Tool 中心：统一工具注册与查询
 * 对应原 backend/tools/base.py 的设计意图（第二阶段 Tool Calling）
 */
import { Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    tool: ToolRegistry
  }
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface Tool {
  /** 工具名（Agent 调用时使用） */
  name: string
  /** 工具描述（写入 Prompt / 函数调用 schema） */
  description: string
  /** 参数 JSON Schema（OpenAI function calling 格式，供 LLM 生成参数） */
  inputSchema: Record<string, any>
  /** 执行工具（user_id 由 Agent 自动注入，无需 LLM 提供） */
  execute(args: Record<string, any>): Promise<ToolResult> | ToolResult
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }
}

export function apply(ctx: Context) {
  ctx.provide('tool', new ToolRegistry())
}
