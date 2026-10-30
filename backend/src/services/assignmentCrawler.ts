/**
 * 作业爬虫服务：重写自 campusPilot-old/app/crawlers/
 * 支持：数你最灵（smartestu.cn）、学习通（chaoxing）
 */
import { Context } from 'cordis'
import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { config } from '../config'

export interface ParsedAssignment {
  source: 'smartestu' | 'chaoxing' | 'cqupt-lms'
  remote_id: string
  title: string
  course_name: string
  description: string
  due_time: Date | null
  is_completed: boolean
}

// ─── 数你最灵 ───────────────────────────────────────────────────────────────

const SMARTESTU_BASE = 'https://smartestu.cn'
const CQUpt_LMS_URL = 'http://lms.tc.cqupt.edu.cn/user/index#/'

function findChrome(): string {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const executable = candidates.find(existsSync)
  if (!executable) throw new Error('未找到 Chrome/Edge，请先安装浏览器')
  return executable
}

/**
 * 打开本机浏览器完成统一认证后抓取学校 LMS。
 * 不接收账号密码；登录态保存在本机浏览器用户目录中。
 */
export async function fetchFromCquptLms(): Promise<ParsedAssignment[]> {
  const userDataDir = path.resolve(process.env.LOCALAPPDATA ?? path.resolve(process.cwd(), '.data'), 'uniflow-lms-browser')
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: findChrome(),
    headless: false,
    args: ['--start-maximized'],
    viewport: null,
  })
  const page = context.pages()[0] ?? await context.newPage()
  const jsonBodies: unknown[] = []
  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('json')) return
    try { jsonBodies.push(await response.json()) } catch { /* non-json response */ }
  })

  try {
    await page.goto(CQUpt_LMS_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    // 给用户完成统一身份认证、验证码和二次验证的时间；认证后尽快继续。
    // LMS 登录成功后通常会离开认证域并加载用户首页。
    for (let i = 0; i < 60; i++) {
      const url = page.url()
      const passwordFields = await page.locator('input[type="password"]').count().catch(() => 0)
      const loginForm = await page.locator('form').filter({ has: page.locator('input[type="password"]') }).count().catch(() => 0)
      if (url.includes('lms.tc.cqupt.edu.cn') && passwordFields === 0 && loginForm === 0) break
      await page.waitForTimeout(2_000)
    }
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const html = await page.content()
    const parsed = parseLmsAssignments(html, jsonBodies)
    if (!parsed.length) throw new Error('已打开学校 LMS，但未找到作业数据；请确认登录后已进入作业页面')
    return parsed
  } finally {
    await context.close()
  }
}

function parseLmsAssignments(html: string, jsonBodies: unknown[]): ParsedAssignment[] {
  const results: ParsedAssignment[] = []
  const seen = new Set<string>()
  const add = (item: Partial<ParsedAssignment>) => {
    const title = String(item.title ?? '').trim()
    const due = item.due_time instanceof Date ? item.due_time : item.due_time ? new Date(item.due_time) : null
    if (!title || title.length < 2 || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(title) || !due || Number.isNaN(due.getTime())) return
    const remoteId = md5(`cqupt-lms_${title}_${due.toISOString()}`)
    if (seen.has(remoteId)) return
    seen.add(remoteId)
    results.push({ source: 'cqupt-lms', remote_id: remoteId, title: title.slice(0, 200), course_name: String(item.course_name ?? ''), description: String(item.description ?? ''), due_time: due, is_completed: Boolean(item.is_completed) })
  }

  const walk = (value: unknown, courseName = ''): void => {
    if (Array.isArray(value)) return value.forEach((entry) => walk(entry, courseName))
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const title = record.title ?? record.name ?? record.assignmentName ?? record.homeworkName
    const due = record.dueTime ?? record.deadline ?? record.endTime ?? record.deadlineTime ?? record.end_at
    if (typeof title === 'string' && due) add({ title, course_name: String(record.courseName ?? record.course_name ?? courseName), due_time: new Date(String(due)), description: String(record.description ?? ''), is_completed: Boolean(record.completed ?? record.isCompleted) })
    Object.values(record).forEach((entry) => walk(entry, typeof title === 'string' && !due ? title : courseName))
  }
  jsonBodies.forEach((body) => walk(body))

  const $ = cheerio.load(html)
  $('script,style').remove()
  $('tr').each((_, row) => {
    const cells = $(row).find('td,th').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean)
    const dates = cells.join(' ').match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?/g) ?? []
    if (!dates.length) return
    const title = $(row).find('a,h1,h2,h3,h4,h5').first().text().replace(/\s+/g, ' ').trim() || cells.find((cell) => !/\d{4}[-/]\d{1,2}/.test(cell))
    add({ title, due_time: new Date(dates[dates.length - 1].replace(/\//g, '-')), course_name: '' })
  })
  return results
}

interface SmartestuCreds {
  student_id: string
  password: string
}

/** 登录并抓取数你最灵作业 */
async function fetchFromSmartestu(creds: SmartestuCreds): Promise<ParsedAssignment[]> {
  const { student_id, password } = creds
  const school_code = config.smartestu.school_code
  const schoolUserId = school_code && !student_id.includes('-')
    ? `${school_code}-${student_id}`
    : student_id

  // 1. 登录
  const loginResp = await fetch(`${SMARTESTU_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ schoolUserId, password }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!loginResp.ok) throw new Error(`数你最灵登录失败 HTTP ${loginResp.status}`)

  const loginData = await loginResp.json() as any
  const token = loginData.token ?? loginData.access_token
  if (!token) throw new Error(`数你最灵登录失败：${loginData.message ?? '无 token'}`)

  // 2. 获取作业
  const hwResp = await fetch(`${SMARTESTU_BASE}/api/homework/student/mark/queryHomeworks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: schoolUserId }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!hwResp.ok) throw new Error(`获取作业失败 HTTP ${hwResp.status}`)

  const hwData = await hwResp.json() as any
  if (hwData.code !== 200) throw new Error(`作业接口错误：${hwData.msg}`)

  const courses = hwData.data?.courseHomeworkDTOList ?? []
  const results: ParsedAssignment[] = []

  for (const course of courses) {
    const courseName = course.courseName ?? '未知课程'
    for (const item of (course.studentCourseHomeworkDTOList ?? [])) {
      const title = item.name ?? item.title ?? item.homeworkName ?? ''
      if (!title) continue

      let dueTime: Date | null = null
      const dueStr = item.endTime ?? item.dueTime ?? item.deadline ?? ''
      if (dueStr) {
        try { dueTime = new Date(dueStr) } catch { /* ignore */ }
      }

      const submissionStatus = item.submission_status ?? ''
      const isCompleted = submissionStatus === 'submitted' || submissionStatus === 'completed'
        || (typeof item.score === 'number' && item.score > 0)
        || item.status === 1 || item.status === 2

      results.push({
        source: 'smartestu',
        remote_id: String(item.id ?? item.homeworkId ?? ''),
        title: title.slice(0, 200),
        course_name: courseName.slice(0, 200),
        description: item.description ?? '',
        due_time: dueTime,
        is_completed: isCompleted,
      })
    }
  }

  return results
}

// ─── 学习通（超星）────────────────────────────────────────────────────────

const CX_HOST = 'https://mooc1.chaoxing.com'
const CX_PASSPORT = 'https://passport2.chaoxing.com'
const CX_AES_KEY = 'u2oh6Vu^HWe4_AES'

interface ChaoxingCreds {
  username: string
  password: string
}

/** AES-CBC 加密（Web Crypto API） */
async function aesCbcEncrypt(plaintext: string, keyStr: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyStr),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  )
  const iv = new TextEncoder().encode(keyStr) // CBC IV = key 作为 IV（与 Python 版一致）
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return Buffer.from(encrypted).toString('base64')
}

function md5(text: string): string {
  return createHash('md5').update(text).digest('hex').slice(0, 16)
}

/**
 * Node 的 fetch 不会维护 Cookie。学习通的登录态依赖 passport 域发放的
 * Cookie，因此需要在每次响应后收集 Set-Cookie，并将其带入后续请求。
 */
function createChaoxingSession() {
  const cookies = new Map<string, string>()
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }

  return async (input: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(baseHeaders)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    if (cookies.size) headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '))

    const response = await fetch(input, { ...init, headers })
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';', 1)
      const separator = pair.indexOf('=')
      if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
    }
    return response
  }
}

/** 抓取学习通作业 */
async function fetchFromChaoxing(creds: ChaoxingCreds): Promise<ParsedAssignment[]> {
  if (!config.chaoxing.enabled) {
    throw new Error('学习通爬虫已禁用：请将 CHAOXING_ENABLED 设为 true')
  }

  const { username, password } = creds
  const encPhone = await aesCbcEncrypt(username, CX_AES_KEY)
  const encPwd = await aesCbcEncrypt(password, CX_AES_KEY)
  const request = createChaoxingSession()

  // 1. 登录
  const loginResp = await request(`${CX_PASSPORT}/fanyalogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      uname: encPhone,
      password: encPwd,
      fid: '-1',
      refer: CX_HOST,
      t: 'true',
      forbidotherlogin: 'false',
      validate: '',
    }),
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!loginResp.ok) throw new Error(`学习通登录失败 HTTP ${loginResp.status}`)

  const loginData = await loginResp.json() as any
  if (!loginData.status) throw new Error(`学习通登录失败：${loginData.msg2 ?? '验证未通过'}`)

  // 2. 获取课程列表
  const coursesResp = await request(`${CX_HOST}/visit/courses`, {
    signal: AbortSignal.timeout(20_000),
  })
  if (!coursesResp.ok) throw new Error(`学习通课程列表获取失败 HTTP ${coursesResp.status}`)
  const coursesHtml = await coursesResp.text()
  if (coursesResp.url.includes('passport2.chaoxing.com') || /登录/.test(coursesHtml.slice(0, 1_000))) {
    throw new Error('学习通登录态无效，课程列表被重定向至登录页')
  }
  const $ = cheerio.load(coursesHtml)

  const courses: { courseid: string; clazzid: string; cpi: string; name: string }[] = []
  $('a[href*="stucoursemiddle"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const qs = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''))
    if (qs.courseid) {
      courses.push({
        courseid: qs.courseid,
        clazzid: qs.clazzid ?? '',
        cpi: qs.cpi ?? '',
        name: $(el).attr('title') || $(el).text().trim() || '',
      })
    }
  })

  const results: ParsedAssignment[] = []

  // 3. 每门课获取作业
  for (const c of courses.slice(0, 20)) { // 最多 20 门课，避免太慢
    try {
      const assignments = await fetchChaoxingCourseWork(c, coursesResp.url ?? CX_HOST, request)
      results.push(...assignments)
    } catch {
      // 单门课失败不影响整体
    }
  }

  return results
}

async function fetchChaoxingCourseWork(
  course: { courseid: string; clazzid: string; cpi: string; name: string },
  referer: string,
  request: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<ParsedAssignment[]> {
  // 先访问课程中间页获取 enc 参数
  const midResp = await request(
    `${CX_HOST}/visit/stucoursemiddle?courseid=${course.courseid}&clazzid=${course.clazzid}&vc=1&cpi=${course.cpi}`,
    {
      headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    },
  )
  const midUrl = midResp.url
  const qs = Object.fromEntries(new URLSearchParams(midUrl.split('?')[1] ?? ''))
  let enc = qs.enc ?? ''
  let openc = qs.openc ?? ''

  // 部分账号的中转页不会在最终 URL 中暴露 enc，旧版爬虫会从作业链接中回退提取。
  if (!enc) {
    const midHtml = await midResp.text()
    const match = /data=["']([^"']*getAllWork[^"']*)["']/.exec(midHtml)
    if (match) {
      const workParams = new URLSearchParams(match[1].split('?')[1] ?? '')
      enc = workParams.get('enc') ?? ''
      openc = workParams.get('openc') ?? ''
    }
  }

  if (!enc) return []

  // 获取作业列表页
  const workResp = await request(
    `${CX_HOST}/work/getAllWork?classId=${course.clazzid}&courseId=${course.courseid}&isdisplaytable=2&mooc=1&ut=s&enc=${enc}&cpi=${course.cpi}&openc=${openc}`,
    {
      headers: { Referer: midUrl, 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!workResp.ok) return []

  const workHtml = await workResp.text()
  return parseChaoxingWorkPage(workHtml, course.name)
}

export function parseChaoxingWorkPage(html: string, courseName: string): ParsedAssignment[] {
  const $ = cheerio.load(html)
  $('script, style').remove()
  const results: ParsedAssignment[] = []
  const ignoredTitlePattern = /我的作业|待批作业|^首页$|^作业$|^考试$|课堂作业|抽人的信息|抽签|抽人|点名|课堂活动|签到|抢答|投票|问卷/
  const dateOnlyPattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?$/
  const statusOnlyPattern = /^(查看|做作业|重做|未提交|已提交|待批阅|已批阅|已完成|\d+(?:\.\d+)?分)$/
  const isTitleCandidate = (text: string) => Boolean(text) && !dateOnlyPattern.test(text)
    && !statusOnlyPattern.test(text) && !text.includes('开始时间') && !text.includes('截止时间')

  const parseDate = (value: string): Date | null => {
    const match = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(value)
    if (!match) return null
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 23), Number(match[5] ?? 59))
    return Number.isNaN(date.getTime()) ? null : date
  }

  // 每条作业记录通常是“标题行 + 时间/状态行”。按 tr 读取可避免页面其它
  // 课堂活动、抽签/人员信息插入后破坏全局文本索引。
  $('tr').each((_, row) => {
    const cells = $(row).find('td,th').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean)
    if (!cells.some((cell) => cell.includes('开始时间')) || !cells.some((cell) => cell.includes('截止时间'))) return

    const findTitle = (target: ReturnType<typeof $>): string =>
      target.find('a').map((__, link) => $(link).text().replace(/\s+/g, ' ').trim()).get()
        .find(isTitleCandidate)
      || target.find('td,th').map((__, cell) => $(cell).clone().children().remove().end().text().replace(/\s+/g, ' ').trim()).get()
        .find(isTitleCandidate)
      || ''
    const title = findTitle($(row)) || $(row).prevAll('tr').slice(0, 2).toArray()
      .map((previous) => findTitle($(previous)))
      .find(Boolean) || ''
    if (!title || title.length < 2 || title.length > 200 || dateOnlyPattern.test(title)
      || statusOnlyPattern.test(title) || ignoredTitlePattern.test(title)) return

    const dueIndex = cells.findIndex((cell) => cell.includes('截止时间'))
    const rowText = cells.join(' ')
    // 不能直接解析整个单元格：同一个单元格可能先出现“开始时间”，会误取开始日期。
    const dueMatch = /截止时间\s*[：:]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/.exec(rowText)
    const dueTime = parseDate(dueMatch?.[1] ?? '') || parseDate(cells[dueIndex + 1] ?? '')
    if (!dueTime) return

    const statusText = cells.find((cell) => /已提交|已完成|已批阅|待批阅|未提交|未完成/.test(cell)) ?? ''
    const isCompleted = ['已提交', '已完成', '已批阅', '待批阅'].some((status) => statusText.includes(status))
    const dueTimeStr = dueTime.toISOString()

    results.push({
      source: 'chaoxing',
      remote_id: md5(`${courseName}_${title}_${dueTimeStr}`),
      title,
      course_name: courseName,
      description: statusText ? `状态: ${statusText}` : '',
      due_time: dueTime,
      is_completed: isCompleted,
    })
  })

  // 新版学习通部分课程不再以 table 展示作业。仅当表格解析没有结果时，
  // 再按作业卡片/列表项解析，避免同一条作业被重复写入。
  if (!results.length) {
    $('[class*="work"], li').each((_, card) => {
      const text = $(card).text().replace(/\s+/g, ' ').trim()
      const dueMatch = /截止时间\s*[：:]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/.exec(text)
      const dueTime = parseDate(dueMatch?.[1] ?? '')
      if (!dueTime) return

      const title = $(card).find('h1,h2,h3,h4,h5,.title,a').map((__, el) =>
        $(el).attr('title')?.trim() || $(el).text().replace(/\s+/g, ' ').trim(),
      ).get().find(isTitleCandidate) ?? ''
      if (!title || title.length < 2 || title.length > 200 || ignoredTitlePattern.test(title)) return

      const statusText = /(?:状态\s*[：:]?\s*)?(已提交|已完成|已批阅|待批阅|未提交|未完成)/.exec(text)?.[1] ?? ''
      results.push({
        source: 'chaoxing',
        remote_id: md5(`${courseName}_${title}_${dueTime.toISOString()}`),
        title,
        course_name: courseName,
        description: statusText ? `状态: ${statusText}` : '',
        due_time: dueTime,
        is_completed: ['已提交', '已完成', '已批阅', '待批阅'].includes(statusText),
      })
    })
  }

  return results
}

// ─── 对外接口 ─────────────────────────────────────────────────────────────

export class AssignmentCrawlerService {
  constructor(private ctx: Context) {}

  /**
   * 抓取并写入作业：按 source 去重，已完成的作业不重复写入。
   * 返回本次新增的作业数量。
   */
  async crawlAndUpsert(
    userId: number,
    smartestuId?: string,
    smartestuPwd?: string,
    chaoxingUsername?: string,
    chaoxingPassword?: string,
  ): Promise<number> {
    const assignments: ParsedAssignment[] = []

    // 数你最灵
    if (smartestuId && smartestuPwd) {
      try {
        const items = await fetchFromSmartestu({ student_id: smartestuId, password: smartestuPwd })
        assignments.push(...items)
      } catch (e) {
        this.ctx.logger('crawler').warn(`数你最灵抓取失败：${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 学习通
    if (chaoxingUsername && chaoxingPassword) {
      try {
        const items = await fetchFromChaoxing({ username: chaoxingUsername, password: chaoxingPassword })
        this.ctx.logger('crawler').info(`学习通解析到 ${items.length} 条作业`)
        assignments.push(...items)
      } catch (e) {
        this.ctx.logger('crawler').warn(`学习通抓取失败：${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return this.upsert(userId, assignments)
  }

  async upsert(userId: number, assignments: ParsedAssignment[]): Promise<number> {
    let upserted = 0
    // 同一个平台的作业即使解析器补齐了课程名，remote_id 也可能随之改变；
    // 因此以“平台 + 标题 + 截止时间”作为稳定业务去重键。
    const unique = new Map<string, ParsedAssignment>()
    for (const assignment of assignments) {
      const due = assignment.due_time?.getTime() ?? 0
      const key = `${assignment.source}\u0000${assignment.title.trim()}\u0000${due}`
      const current = unique.get(key)
      // 同一批抓取中优先保留包含课程名的解析结果。
      if (!current || (!current.course_name && assignment.course_name)) unique.set(key, assignment)
    }

    for (const a of unique.values()) {
      const sameTitle = await this.ctx.database.get('assignment', {
        user_id: userId,
        source: a.source,
        title: a.title,
      })
      const sameDue = (sameTitle as any[]).filter((row) =>
        new Date(row.due_time).getTime() === (a.due_time?.getTime() ?? NaN),
      )
      const existing = sameDue.sort((left, right) => {
        const leftQuality = Number(Boolean(left.course_name)) + Number(Boolean(left.description))
        const rightQuality = Number(Boolean(right.course_name)) + Number(Boolean(right.description))
        return rightQuality - leftQuality || left.id - right.id
      })[0] ?? null

      // 清理历史解析器遗留的同一作业副本，优先保留信息更完整的一条。
      for (const duplicate of sameDue) {
        if (duplicate.id !== existing?.id) await this.ctx.database.remove('assignment', { id: duplicate.id })
      }
      if (existing) {
        await this.ctx.database.set('assignment', { id: existing.id }, {
          remote_id: a.remote_id,
          is_completed: a.is_completed,
          due_time: a.due_time,
          title: a.title,
          course_name: a.course_name,
          description: a.description,
        })
      } else {
        await this.ctx.database.create('assignment', { user_id: userId, source: a.source, remote_id: a.remote_id, title: a.title, course_name: a.course_name, description: a.description, due_time: a.due_time, is_completed: a.is_completed })
        upserted++
      }
    }
    return upserted
  }
}

export function apply(ctx: Context) {
  ctx.provide('assignmentCrawler', new AssignmentCrawlerService(ctx))
}

apply.inject = ['database'] as const
