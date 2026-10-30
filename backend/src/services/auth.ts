/**
 * 认证服务：JWT + bcrypt
 * 对应原 backend/utils/auth.py
 */
import { Context } from 'cordis'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

import { config } from '../config'
import type { TokenPayload } from '../types'
import { HttpError } from '../utils/http'

declare module 'cordis' {
  interface Context {
    auth: AuthService
  }
}

export class AuthService {
  constructor(private ctx: Context) {}

  hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10)
  }

  verifyPassword(plain: string, hashed: string): boolean {
    return bcrypt.compareSync(plain, hashed)
  }

  async signToken(uid: number): Promise<string> {
    return new SignJWT({ uid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(uid))
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + config.jwt.expiresInMinutes * 60)
      .sign(new TextEncoder().encode(config.jwt.secret))
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(config.jwt.secret), {
        algorithms: ['HS256'],
      })
      if (typeof payload.uid !== 'number') throw new Error('missing uid')
      return { uid: payload.uid }
    } catch {
      throw new HttpError(401, '无效的令牌')
    }
  }
}

export function apply(ctx: Context) {
  ctx.provide('auth', new AuthService(ctx))
}
