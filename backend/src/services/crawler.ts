/**
 * 重庆邮电大学教务系统课表爬虫（fetch + cheerio）
 * 对应原 backend/crawler/jwxt_crawler.py
 */
import { Context } from 'cordis'
import * as cheerio from 'cheerio'

declare module 'cordis' {
  interface Context {
    crawler: JwxtCrawlerService
  }
}

/** 重邮标准作息时间表（节次 → [开始, 结束]） */
const SLOT_TIME_MAP: Record<number, [string, string]> = {
  1: ['08:00', '09:40'],
  2: ['08:00', '09:40'],
  3: ['10:15', '11:55'],
  4: ['10:15', '11:55'],
  5: ['14:00', '15:40'],
  6: ['14:00', '15:40'],
  7: ['16:15', '17:55'],
  8: ['16:15', '17:55'],
  9: ['19:00', '20:40'],
  10: ['19:00', '20:40'],
  11: ['20:50', '22:30'],
  12: ['20:50', '22:30'],
}

export interface ParsedCourse {
  name: string
  teacher: string
  location: string
  day_of_week: number
  start_week: number
  end_week: number
  start_slot: number
  end_slot: number
  start_time: string
  end_time: string
}

/** 解析节次文本 → [起始节, 结束节] */
export function parseSlot(text: string): [number, number] | null {
  const nums = text
    .split(/[、\-]/)
    .map((part) => /(\d+)/.exec(part)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
  if (!nums.length) return null
  return [nums[0], nums[nums.length - 1]]
}

/** 解析周次文本 → [起始周, 结束周]
 * 支持格式：
 *  - "X-Y周" / "X~Y周" → [X, Y]
 *  - "X周"（单个）→ [X, X]
 *  - "X周,Y-Z周"（逗号分隔，含跳周 / "单周"/"双周"）→ 取所有出现周次的 min/max
 *  - "第N周" → [N, N]
 * 备注：单双周/跳周不会精确建模，仅做区间近似；课程数据无 zc 位的精确信息。
 */
export function parseWeekRange(text: string): [number, number] | null {
  const cleaned = text.replace(/单周|双周/g, '')
  const ranges = [...cleaned.matchAll(/(\d+)\s*[-~]\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])])
  const singles = [...cleaned.matchAll(/(\d+)周/g)].map((m) => Number(m[1]))
  const weeks: number[] = []
  ranges.forEach((r) => weeks.push(r[0], r[1]))
  weeks.push(...singles)
  if (weeks.length) {
    return [Math.min(...weeks), Math.max(...weeks)]
  }
  const m = /第\s*(\d+)\s*周/.exec(text)
  if (m) {
    return [Number(m[1]), Number(m[1])]
  }
  return null
}

export class JwxtCrawlerService {
  static BASE_URL = 'http://jwzx.cqupt.edu.cn/kebiao/kb_stu.php'

  constructor(private ctx: Context) {}

  /** 抓取课表页面 HTML，支持重试 */
  async fetchHtml(studentId: string, maxRetries = 3): Promise<string> {
    if (!studentId) throw new Error('学号不能为空')
    const url = `${JwxtCrawlerService.BASE_URL}?xh=${encodeURIComponent(studentId)}`
    const headers = {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    let lastError: unknown
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(30_000),
          redirect: 'follow',
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const html = await resp.text()
        if (html.length < 500) {
          this.ctx.logger('crawler').warn(`页面内容过短(${html.length}字节)`)
        }
        this.ctx.logger('crawler').info(`抓取成功 (${html.length} 字节)`)
        return html
      } catch (error) {
        lastError = error
        this.ctx.logger('crawler').warn(`第 ${attempt}/${maxRetries} 次抓取失败: ${String(error)}`)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
        }
      }
    }
    throw new Error(`抓取课表失败（已重试 ${maxRetries} 次）: ${String(lastError)}`)
  }

  /** 解析课表 HTML，返回课程列表 */
  parseCourses(html: string): ParsedCourse[] {
    const $ = cheerio.load(html)
    let table = $('table.kbtable').first()
    if (!table.length) table = $('#kbtable').first()
    if (!table.length) {
      table = $('table')
        .filter((_, el) => /周一|星期/.test($(el).text()))
        .first()
    }
    if (!table.length) {
      const title = $('title').text()
      this.ctx.logger('crawler').warn(`未找到课表表格 (页面标题: ${title || 'N/A'})`)
      return []
    }

    const courses: ParsedCourse[] = []
    table.find('tr').each((_, row) => {
      const cells = $(row).find('td, th')
      if (cells.length < 8) return
      const slots = parseSlot(cells.eq(0).text())
      if (!slots) return
      const [startSlot, endSlot] = slots
      for (let day = 1; day < Math.min(cells.length, 8); day++) {
        $(cells[day])
          .find('div.kbTd')
          .each((_, kbTd) => {
            const course = this.parseKbTd($, kbTd, day, startSlot, endSlot)
            if (course) courses.push(course)
          })
      }
    })
    this.ctx.logger('crawler').info(`解析完成，共 ${courses.length} 门课程`)
    return courses
  }

  /** 解析单个 kbTd div 中的课程信息 */
  parseKbTd(
    $: cheerio.CheerioAPI,
    kbTd: any,
    dayOfWeek: number,
    startSlot: number,
    endSlot: number,
  ): ParsedCourse | null {
    // 当前教务课表页 kbTd 自身就是内容容器（文本 + <font>/<span>/<a>），不再嵌套 <div>
    const lines: string[] = []
    $(kbTd).contents().each((_, elem) => {
      if (elem.type === 'text') {
        const text = elem.data ?? ''
        if (text.trim()) lines.push(text.trim())
      } else {
        const text = $(elem).text().trim()
        if (text) lines.push(text)
      }
    })

    if (lines.length < 4) return null

    // 课程名（形如 "课程-名称"）
    const namePart = lines[1]
    const name = namePart.includes('-') ? namePart.split('-', 2)[1] : namePart

    // 地点
    let location = ''
    const locPart = lines[2]
    const sepIndex = Math.max(locPart.indexOf('：'), locPart.indexOf(':'))
    location = sepIndex >= 0 ? locPart.slice(sepIndex + 1).trim() : locPart.trim()

    // 周次
    let startWeek = 1
    let endWeek = 20
    const weekRange = parseWeekRange(lines[3])
    if (weekRange) [startWeek, endWeek] = weekRange

    // 教师
    let teacher = ''
    if (lines.length > 4) {
      for (const part of lines.slice(4).join(' ').split(/\s+/)) {
        if (part !== '必修' && part !== '选修' && part.length >= 2 && !part.startsWith('http') && !/^\d+节连上$/.test(part)) {
          teacher = part
          break
        }
      }
    }

    // kbTd 内部可能标注实际节数（如 "4节连上"、"1-4节"），行首默认只给两节
    // （如 "1-2节"），若节数大于行首覆盖范围，则向后扩展到真实节次，避免
    // 四节/六节连上的课程被压缩成两节。
    let effectiveStart = startSlot
    let effectiveEnd = endSlot
    const multiSlot = lines.find((l) => /^\d+\s*[-~]\s*\d+\s*节/.test(l) || /^\d+\s*节\s*连上$/.test(l))
    if (multiSlot) {
      const m = /(\d+)\s*[-~]\s*(\d+)\s*节|(\d+)\s*节\s*连上/.exec(multiSlot)
      if (m) {
        if (m[1] && m[2]) {
          effectiveStart = Number(m[1])
          effectiveEnd = Number(m[2])
        } else if (m[3]) {
          // "N节连上"：从行首节次起连续 N 节
          effectiveEnd = startSlot + Number(m[3]) - 1
        }
      }
    }

    const [startTime] = SLOT_TIME_MAP[effectiveStart] ?? ['08:00', '09:40']
    const [, endTime] = SLOT_TIME_MAP[effectiveEnd] ?? ['08:00', '09:40']

    return {
      name: name || `未知课程-${dayOfWeek}-${effectiveStart}`,
      teacher,
      location,
      day_of_week: dayOfWeek,
      start_week: startWeek,
      end_week: endWeek,
      start_slot: effectiveStart,
      end_slot: effectiveEnd,
      start_time: startTime,
      end_time: endTime,
    }
  }

  /** 一键抓取并解析课表 */
  async crawlAndParse(studentId: string): Promise<ParsedCourse[]> {
    const html = await this.fetchHtml(studentId)
    return this.parseCourses(html)
  }
}

export function apply(ctx: Context) {
  ctx.provide('crawler', new JwxtCrawlerService(ctx))
}
