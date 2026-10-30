/**
 * HTTP 辅助：错误、响应、鉴权、日期序列化
 */
import { Context } from 'cordis'
import { Request, Response, ValidationError } from '@cordisjs/plugin-server'
import type { Middleware } from '@cordisjs/plugin-server'
import type { StandardSchemaV1 } from '@standard-schema/spec'

/** 业务错误：携带 HTTP 状态码 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** 写入 JSON 响应 */
export function send(res: Response, data: unknown, status = 200): void {
  res.status = status
  res.json(data)
}

/** 读取并校验 JSON 请求体（schemastery schema），返回类型化结果 */
export async function parseBody<T>(req: Request, schema: StandardSchemaV1): Promise<T> {
  return await req.json(schema) as T
}

type RouteHandler<P> = (req: Request & { params: P }, res: Response) => Promise<void> | void

/** 包装路由处理器：HttpError → JSON 状态响应，其余错误上抛（由服务器记 500） */
export function route<P = Record<string, string>>(handler: RouteHandler<P>): Middleware {
  return async (req, res) => {
    try {
      await handler(req as Request & { params: P }, res)
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, { message: error.message }, error.status)
      } else if (error instanceof ValidationError) {
        send(res, { message: '请求参数不合法', issues: error.issues }, 422)
      } else {
        throw error
      }
    }
  }
}

/** 从 Authorization: Bearer <token> 解析并加载当前用户 */
export async function requireUser(ctx: Context, req: Request) {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, '未登录')
  const token = header.slice(7)
  const payload = await ctx.auth.verifyToken(token)
  const rows = await ctx.database.get('user', { id: payload.uid })
  const user = rows[0]
  if (!user || !user.is_active) throw new HttpError(401, '用户不存在或已禁用')
  return user
}

/** 解析查询参数中的整数，非法时回退默认值 */
export function queryInt(query: URLSearchParams, key: string, fallback: number, min?: number, max?: number): number {
  const raw = query.get(key)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date → 'YYYY-MM-DDTHH:MM:SS'（本地时区，与原 FastAPI datetime 序列化一致） */
export function formatDateTime(value: Date | null | undefined): string | null {
  if (!value) return null
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

/** Date → 'YYYY-MM-DD'（本地时区） */
export function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
