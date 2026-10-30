/**
 * 校园通知爬虫（教务处官网 jwc.cqupt.edu.cn 首页 → notifications 表）
 * 注意：jw.cqupt.edu.cn 全站被瑞数 WAF 拦截（412），jwc 站无 WAF 且镜像同一批通知的标题+日期。
 *
 * 设计约束（见《开发规范》）：
 * - 爬虫只写数据库，禁止调用 LLM
 * - 通知表按 user_id 隔离，全局通知归属一个「系统用户」（student_id = 'system'），
 *   前端通过 API 的 $or 过滤同时看到「我的」和「系统」通知
 */
import { Context } from 'cordis'
import * as cheerio from 'cheerio'

import { config } from '../config'
declare module 'cordis' {
  interface Context {
    noticeCrawler: NoticeCrawlerService
  }
}

/** 系统用户学号（全局通知归属） */
export const SYSTEM_USER_STUDENT_ID = 'system'

const SITE_BASE = 'http://jwc.cqupt.edu.cn'
const HOME_URL = `${SITE_BASE}/`
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface NoticeItem {
  title: string
  source: string
  publishedAt: Date | null
  /** 详情页正文；首页没有正文时由 fetchDetail 尽力补齐 */
  content?: string
}

export class NoticeCrawlerService {
  private cronTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private ctx: Context) {}

  /** 抓取教务处首页 HTML */
  async fetchHome(): Promise<string> {
    const resp = await fetch(HOME_URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`抓取教务处首页失败: HTTP ${resp.status}`)
    const html = await resp.text()
    if (html.length < 1000) throw new Error(`教务处首页内容过短(${html.length}字节)`)
    return html
  }

  /** 解析首页「通知公告」区：标题 + 日期 + 链接 */
  parseList(html: string): NoticeItem[] {
    const $ = cheerio.load(html)

    // 定位「通知公告」区块的 ul（找不到则退回第一个 h2li 列表）
    let list = $('h3.wl')
      .filter((_, el) => $(el).text().includes('通知'))
      .first()
      .parent('.title')
      .next('ul.h2li')
      .first()
    if (!list.length) list = $('ul.h2li').first()

    const items: NoticeItem[] = []
    list.find('li a').each((_, el) => {
      const a = $(el)
      const href = (a.attr('href') ?? '').trim()
      const title = a.find('h3').first().text().trim()
      if (!href || !title) return

      // 日期：<div class="date"><span>13</span><p>2026-08</p></div>
      const day = a.find('.date span').first().text().trim()
      const monthYear = a.find('.date p').first().text().trim()
      let publishedAt: Date | null = null
      const m = /(\d{4})-(\d{1,2})/.exec(monthYear)
      if (m && /^\d{1,2}$/.test(day)) {
        const date = new Date(+m[1], +m[2] - 1, +day)
        if (date.getMonth() === +m[2] - 1) publishedAt = date
      }

      items.push({
        title,
        source: href.startsWith('http') ? href : `${SITE_BASE}/${href.replace(/^\.?\//, '')}`,
        publishedAt,
      })
    })
    return items
  }

  /** 抓取单条通知详情页正文；详情页被 WAF 拦截时返回空串，不影响列表同步。 */
  async fetchDetail(source: string): Promise<string> {
    try {
      const resp = await fetch(source, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(15_000),
        redirect: 'follow',
      })
      if (!resp.ok) return ''
      const html = await resp.text()
      return this.parseDetail(html)
    } catch (error) {
      this.ctx.logger('notice-crawler').warn(`通知正文抓取失败（${source}）: ${String(error)}`)
      return ''
    }
  }

  /** 从常见教务处文章容器中提取正文，去除导航、脚本和样式噪声。 */
  parseDetail(html: string): string {
    const $ = cheerio.load(html)
    $('script, style, noscript, iframe, nav, header, footer, form').remove()
    const selectors = [
      '.v_news_content',
      '.article-content',
      '.article_content',
      '.article',
      '#vsb_content',
      '#article',
      'article',
      'main',
    ]
    let text = ''
    for (const selector of selectors) {
      const candidate = $(selector).first().text()
      if (candidate.trim().length > text.trim().length) text = candidate
    }
    if (!text.trim()) text = $('body').text()
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim()
  }

  /** 确保系统用户存在，返回其 id */
  private async ensureSystemUser(): Promise<number> {
    const rows = await this.ctx.database.get('user', { student_id: SYSTEM_USER_STUDENT_ID })
    if (rows[0]) return rows[0].id
    const user = await this.ctx.database.create('user', {
      student_id: SYSTEM_USER_STUDENT_ID,
      username: '校园通知',
      hashed_password: '',
    })
    return user.id
  }

  /** 获取用户基本信息（用于 LLM 总结） */
  private async getUserProfile(userId: number): Promise<string> {
    const rows = await this.ctx.database.get('user', { id: userId })
    if (!rows[0]) return ''
    const u = rows[0]
    return `姓名：${u.username}，学号：${u.student_id}，学院：${u.college}，专业：${u.major}，年级：${u.grade}`
  }

  /**
   * 启动时爬一次 + 每天凌晨自动爬
   */
  /** 执行一次同步（供 schedule 使用） */
  private async scheduleSync(): Promise<void> {
    await this.sync()
  }

  startScheduledSync() {
    // 启动时立即爬一次
    this.scheduleSync().catch((err: unknown) =>
      this.ctx.logger('notice-crawler').warn(`启动时通知爬取失败: ${err}`),
    )

    // 每天凌晨 00:05 执行
    const scheduleNext = () => {
      const now = new Date()
      const next = new Date(now)
      next.setHours(0, 5, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      const delay = next.getTime() - now.getTime()

      this.ctx.logger('notice-crawler').info(
        `通知定时爬取已注册，下次执行: ${next.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（${Math.round(delay / 86400000)} 天后）`,
      )

      this.cronTimer = setTimeout(async () => {
        await this.scheduleSync().catch((err: unknown) =>
          this.ctx.logger('notice-crawler').warn(`定时通知爬取失败: ${err}`),
        )
        scheduleNext() // 重新注册下一次
      }, delay)
    }
    scheduleNext()
  }

  /** 停止定时爬取（测试用） */
  stopScheduledSync() {
    if (this.cronTimer) {
      clearTimeout(this.cronTimer)
      this.cronTimer = null
    }
  }

  /**
   * 同步一次：抓取 → 解析 → 增量入库 → LLM 总结重要通知
   * @returns { added, total, skipped }
   */
  async sync(): Promise<{ added: number; total: number; skipped: number }> {
    const systemId = await this.ensureSystemUser()
    const html = await this.fetchHome()
    const items = this.parseList(html)

    const existing = await this.ctx.database.get('notification', { user_id: systemId })
    const existingBySource = new Map(existing.map((n) => [n.source, n]))

    // 详情正文是 RAG 的主要语料。只为新通知或历史空正文通知抓取，避免每天重复请求旧页面。
    const enrichedItems = await Promise.all(items.map(async (item) => {
      const current = existingBySource.get(item.source)
      if (current && String(current.content ?? '').trim()) return { ...item, content: current.content }
      return { ...item, content: await this.fetchDetail(item.source) }
    }))

    let added = 0
    let skipped = 0
    const newItems: Array<{ id: number; title: string; source: string; publishedAt: Date | null; content: string }> = []

    for (const item of enrichedItems) {
      const current = existingBySource.get(item.source)
      if (current) {
        const patch: Record<string, unknown> = {}
        if (!String(current.content ?? '').trim() && item.content?.trim()) {
          patch.content = item.content
          // 旧 embedding 可能只由标题生成；正文补齐后必须重新向量化。
          patch.embedding = null
        }
        if (!(current as any).source_url) patch.source_url = item.source
        if (Object.keys(patch).length > 0) {
          await this.ctx.database.set('notification', { id: current.id }, patch)
          ;(this.ctx as any).knowledge?.scheduleIndex?.(current.id)
        }
        skipped++
        continue
      }
      const row = await this.ctx.database.create('notification', {
        user_id: systemId,
        title: item.title,
        content: item.content || '',
        category: 'school',
        source: item.source,
        source_url: item.source,
        is_read: false,
        published_at: item.publishedAt,
        is_important: false,
      })
      newItems.push({
        id: row.id,
        title: item.title,
        source: item.source,
        publishedAt: item.publishedAt,
        content: item.content || '',
      })
      existingBySource.set(item.source, row)
      ;(this.ctx as any).knowledge?.scheduleIndex?.(row.id)
      added++
    }

    // 新增通知 → LLM 总结 + 向量化
    if (newItems.length > 0) {
      await this.summarizeNewNotifications(newItems).catch((err) =>
        this.ctx.logger('notice-crawler').warn(`LLM 总结通知失败: ${err}`),
      )
    }

    this.ctx.logger('notice-crawler').info(
      `教务处通知同步完成: 新增 ${added}，跳过 ${skipped}，共 ${items.length}`,
    )
    return { added, total: items.length, skipped }
  }

  /**
   * 对新增通知逐条 LLM 总结，结合用户信息判断是否重要
   * 只对 systemId 下的系统通知做总结，不打扰用户
   */
  private async summarizeNewNotifications(
    newItems: Array<{ id: number; title: string; source: string; publishedAt: Date | null; content: string }>,
  ) {
    // 取所有真实用户（排除 system 用户）
    const allUsers = await this.ctx.database.get('user', { student_id: { $ne: SYSTEM_USER_STUDENT_ID } })
    if (!allUsers.length) return

    // 批量获取用户画像
    const profiles = await Promise.all(allUsers.map((u) => this.getUserProfile(u.id)))
    const userContext = profiles.join('\n')

    for (const item of newItems) {
      try {
        const prompt = `你是一个校园通知助手。请判断以下通知是否与学生相关。

通知标题：${item.title}
通知正文：${item.content || '（正文暂未抓取到）'}
发布时间：${item.publishedAt ? item.publishedAt.toLocaleDateString('zh-CN') : '未知'}
来源：${item.source}

学生信息：
${userContext || '（暂无学生信息，按通用方式判断）'}

请用 JSON 格式回答，不需要任何其他内容：
{
  "is_important": true或false,
  "summary": "为什么重要/或不重要的简要说明，不超过50字"
}`

        const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.llm.apiKey}`,
          },
          body: JSON.stringify({
            model: config.llm.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 160,
            // 百炼 Qwen3 微调模型在非流式请求中必须关闭思考模式。
            enable_thinking: false,
          }),
          signal: AbortSignal.timeout(30_000),
        })

        if (!response.ok) {
          this.ctx.logger('notice-crawler').warn(`LLM 总结请求失败: HTTP ${response.status}`)
          continue
        }

        const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
        const raw = json?.choices?.[0]?.message?.content ?? ''

        // 提取 JSON
        const m = /\{[\s\S]*\}/.exec(raw)
        if (!m) continue

        const parsed = JSON.parse(m[0]) as { is_important?: boolean; summary?: string }

        const patch: Record<string, unknown> = {}
        if (typeof parsed.is_important === 'boolean') {
          patch.is_important = parsed.is_important
        }
        if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
          patch.summary = parsed.summary.trim()
        }

        if (Object.keys(patch).length > 0) {
          await this.ctx.database.set('notification', { id: item.id }, patch)
          this.ctx.logger('notice-crawler').info(
            `通知「${item.title}」重要=${patch.is_important}，摘要：${patch.summary}`,
          )
        }
      } catch (err) {
        this.ctx.logger('notice-crawler').warn(`总结通知「${item.title}」失败: ${err}`)
      }
    }
  }
}

export function apply(ctx: Context) {
  ctx.provide('noticeCrawler', new NoticeCrawlerService(ctx))
}

apply.inject = ['database', 'knowledge']
