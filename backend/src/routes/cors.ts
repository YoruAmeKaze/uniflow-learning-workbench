/**
 * CORS 中间件（前端 :5173 → 后端 :8000）
 */
import { Context } from 'cordis'

export function apply(ctx: Context) {
  ctx.server.use(async (req, res, next) => {
    res.headers.set('Access-Control-Allow-Origin', '*')
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      res.status = 204
      return
    }
    await next()
  })
}

apply.inject = ['server']
