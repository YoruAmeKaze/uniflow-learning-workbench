/**
 * 健康检查
 */
import { Context } from 'cordis'

export function apply(ctx: Context) {
  ctx.server.get('/health', async (req, res) => {
    res.json({ status: 'ok', app: 'UniFlow' })
  })
}

apply.inject = ['server']
