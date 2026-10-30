/**
 * 认证 API
 * 对应原 backend/api/auth.py
 */
import { Context } from 'cordis'
import z from 'schemastery'

import { HttpError, parseBody, route, requireUser, send } from '../utils/http'

interface LoginBody {
  student_id: string
  password: string
}

interface RegisterBody {
  student_id: string
  username: string
  password: string
  email: string
}

interface UpdateProfileBody {
  college?: string
  major?: string
  grade?: string
}

export function apply(ctx: Context) {
  // ---- 登录 ----
  ctx.server.post('/api/auth/login', route(async (req, res) => {
    const body = await parseBody<LoginBody>(req, z.object({
      student_id: z.string().max(20).required(),
      password: z.string().max(72).required(),
    }))
    const rows = await ctx.database.get('user', { student_id: body.student_id })
    const user = rows[0]
    if (!user || !ctx.auth.verifyPassword(body.password, user.hashed_password)) {
      throw new HttpError(401, '学号或密码错误')
    }
    const token = await ctx.auth.signToken(user.id)
    send(res, {
      access_token: token,
      token_type: 'bearer',
      user_id: user.id,
      username: user.username,
    })
  }))

  // ---- 注册 ----
  ctx.server.post('/api/auth/register', route(async (req, res) => {
    const body = await parseBody<RegisterBody>(req, z.object({
      student_id: z.string().max(20).required(),
      username: z.string().max(50).required(),
      password: z.string().max(72).required(),
      email: z.string().max(100).default(''),
    }))
    const exists = await ctx.database.get('user', { student_id: body.student_id })
    if (exists.length) throw new HttpError(400, '该学号已注册')
    const user = await ctx.database.create('user', {
      student_id: body.student_id,
      username: body.username,
      email: body.email,
      hashed_password: ctx.auth.hashPassword(body.password),
    })
    const token = await ctx.auth.signToken(user.id)
    send(res, {
      access_token: token,
      token_type: 'bearer',
      user_id: user.id,
      username: user.username,
    })
  }))

  // ---- 当前用户 ----
  ctx.server.get('/api/auth/me', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    send(res, {
      id: user.id,
      student_id: user.student_id,
      username: user.username,
      email: user.email,
      college: user.college,
      major: user.major,
      grade: user.grade,
      avatar: user.avatar,
    })
  }))

  // ---- 更新个人信息（学院 / 专业 / 年级）----
  ctx.server.put('/api/auth/me', route(async (req, res) => {
    const user = await requireUser(ctx, req)
    const body = await parseBody<UpdateProfileBody>(req, z.object({
      college: z.string().max(100).default(''),
      major: z.string().max(100).default(''),
      grade: z.string().max(20).default(''),
    }))
    const update = {
      college: (body.college ?? '').trim(),
      major: (body.major ?? '').trim(),
      grade: (body.grade ?? '').trim(),
    }
    await ctx.database.set('user', { id: user.id }, update)
    send(res, {
      id: user.id,
      student_id: user.student_id,
      username: user.username,
      email: user.email,
      college: update.college,
      major: update.major,
      grade: update.grade,
      avatar: user.avatar,
    })
  }))
}

apply.inject = ['server', 'database', 'auth']
