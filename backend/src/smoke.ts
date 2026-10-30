/**
 * 冒烟测试：内存数据库驱动 + 桩 Agent，端到端验证 Cordis 装配与全部 API
 * 运行：node lib/smoke.js
 */
import { Context } from 'cordis'
import Server from '@cordisjs/plugin-server'
import Database from '@cordisjs/plugin-database'
import MemoryDriver from '@cordisjs/plugin-database-memory'

import { apply as models } from './models/index'
import { apply as authService } from './services/auth'
import { apply as crawlerService } from './services/crawler'
import { apply as knowledgeService } from './services/knowledge'
import { apply as noticeCrawlerService } from './services/noticeCrawler'
import { apply as toolCenter } from './tools/index'
import { apply as toolCourse } from './tools/course'
import { apply as toolTodo } from './tools/todo'
import { apply as toolNotification } from './tools/notification'
import { apply as toolRag } from './tools/rag'
import { apply as toolUserProfile } from './tools/userProfile'
import { apply as toolAssignment } from './tools/assignment'
import { apply as corsMiddleware } from './routes/cors'
import { apply as healthRoutes } from './routes/health'
import { apply as authRoutes } from './routes/auth'
import { apply as chatRoutes } from './routes/chat'
import { apply as uploadRoutes } from './routes/upload'
import { apply as courseRoutes } from './routes/course'
import { apply as todoRoutes } from './routes/todo'
import { apply as notificationRoutes } from './routes/notification'
import { apply as assignmentRoutes } from './routes/assignment'
import { parseClassifyJson, type ChatOptions } from './services/agent'
import { buildPlan, runPlanner } from './services/planner'

let failures = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✔ ${name}`)
  } else {
    failures++
    console.error(`  ✘ ${name}`, detail ?? '')
  }
}

async function main() {
  const port = 19100 + Math.floor(Math.random() * 500)
  const base = `http://127.0.0.1:${port}`
  const ctx = new Context()

  // 用桩 Agent 替换真实 LLM（避免冒烟测试触发外部 API）
  ctx.provide('agent', {
    chat: async (message: string) => `[stub] 已收到: ${message}`,
    processIncoming: async (text: string, options: ChatOptions) => {
      const planned = options.inputKind === 'document' ? null : await runPlanner(text, {
        ...options,
        tools: options.tools ?? [],
        model: async (system, input) => {
          if (system.includes('Skill 路由器')) return /安排|计划|规划/.test(input)
            ? '{"skill":"daily_schedule","confidence":0.99}'
            : '{"skill":"none","confidence":0.99}'
          const data = JSON.parse(input)
          return JSON.stringify({ order: data.tasks.map((task: { id: string }) => task.id), sessions: [] })
        },
      })
      return { reply: planned?.reply ?? `[stub] 已处理: ${text.slice(0, 50)}`, plan: planned?.plan,
        createdTodos: [], savedKnowledge: null, sources: [] }
    },
  } as any)

  // 基础插件顺序加载（规避 cordis rc.8 并发 notify 竞态，见 src/index.ts 注释）
  await ctx.plugin(Database)
  await ctx.plugin(MemoryDriver, {})
  await ctx.plugin(Server, { host: '127.0.0.1', port })

  await Promise.all([
    ctx.plugin(models),
    ctx.plugin(authService),
    ctx.plugin(crawlerService),
    ctx.plugin(knowledgeService),
    ctx.plugin(noticeCrawlerService),
    ctx.plugin(toolCenter),
    ctx.plugin(toolCourse),
    ctx.plugin(toolTodo),
    ctx.plugin(toolNotification),
    ctx.plugin(toolRag),
    ctx.plugin(toolUserProfile),
    ctx.plugin(toolAssignment),
    ctx.plugin(corsMiddleware),
    ctx.plugin(healthRoutes),
    ctx.plugin(authRoutes),
    ctx.plugin(chatRoutes),
    ctx.plugin(uploadRoutes),
    ctx.plugin(courseRoutes),
    ctx.plugin(todoRoutes),
    ctx.plugin(notificationRoutes),
    ctx.plugin(assignmentRoutes),
  ])
  console.log(`server listening at ${base}`)

  // ---- 工具函数 ----
  async function req(method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const resp = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data: unknown = null
    try { data = await resp.json() } catch { /* ignore */ }
    return { status: resp.status, data }
  }

  // ---- 1. 健康检查 ----
  console.log('\n[1] 健康检查')
  const health = await req('GET', '/health')
  check('GET /health → 200', health.status === 200)
  check('health.status === ok', (health.data as any)?.status === 'ok')

  // ---- 2. 注册 ----
  console.log('\n[2] 注册 / 登录')
  const reg = await req('POST', '/api/auth/register', { student_id: '20240001', username: '测试用户', password: 'pass123' })
  check('POST /api/auth/register → 200', reg.status === 200, reg.data)
  const regToken = (reg.data as any)?.access_token
  check('注册返回 access_token', typeof regToken === 'string')

  const dup = await req('POST', '/api/auth/register', { student_id: '20240001', username: 'x', password: 'y' })
  check('重复注册 → 400', dup.status === 400)
  const tooLongStudentId = await req('POST', '/api/auth/register', {
    student_id: 'student-id-is-longer-than-twenty', username: '长度测试', password: 'test-pass',
  })
  check('过长学号 → 422（不触发数据库 500）', tooLongStudentId.status === 422, tooLongStudentId.data)

  const bad = await req('POST', '/api/auth/login', { student_id: '20240001', password: 'wrong' })
  check('错误密码登录 → 401', bad.status === 401)

  const login = await req('POST', '/api/auth/login', { student_id: '20240001', password: 'pass123' })
  check('正确登录 → 200', login.status === 200, login.data)
  const token = (login.data as any)?.access_token

  const me = await req('GET', '/api/auth/me', undefined, token)
  check('GET /api/auth/me → 200', me.status === 200, me.data)
  check('me.username === 测试用户', (me.data as any)?.username === '测试用户')

  const noAuth = await req('GET', '/api/auth/me')
  check('未带 token → 401', noAuth.status === 401)

  // ---- 3. 课程 ----
  console.log('\n[3] 课程')
  const c1 = await req('POST', '/api/courses', { name: '软件工程', teacher: '王老师', weekday: 1, start_time: '08:00', end_time: '09:40', location: 'A101' }, token)
  check('POST /api/courses → 200', c1.status === 200, c1.data)
  const c2 = await req('POST', '/api/courses', { name: '高等数学', teacher: '李老师', weekday: new Date().getDay() || 7, start_time: '10:15', end_time: '11:55' }, token)
  check('POST /api/courses(今日) → 200', c2.status === 200)

  const list = await req('GET', '/api/courses', undefined, token)
  check('GET /api/courses → 2 门', (list.data as any)?.items?.length === 2, list.data)

  const today = await req('GET', '/api/courses/today', undefined, token)
  check('GET /api/courses/today → 至少 1 门', (today.data as any)?.items?.length >= 1, today.data)
  check('today.weekday 为 1-7', ((today.data as any)?.weekday ?? 0) >= 1 && ((today.data as any)?.weekday ?? 0) <= 7)

  // 周课表（c1/c2 均默认 start_week=1..end_week=18）
  const wk2 = await req('GET', '/api/courses/week?week=2', undefined, token)
  check('GET /api/courses/week?week=2 → 2 门', (wk2.data as any)?.items?.length === 2, wk2.data)
  check('week 响应含 week=2 与 currentWeek', (wk2.data as any)?.week === 2 && ((wk2.data as any)?.currentWeek ?? 0) >= 1, wk2.data)
  check('weekStart 为 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test((wk2.data as any)?.weekStart ?? ''), wk2.data)
  const wkFar = await req('GET', '/api/courses/week?week=30', undefined, token)
  check('week=30 超出开课周 → 0 门', (wkFar.data as any)?.items?.length === 0, wkFar.data)
  const wkDefault = await req('GET', '/api/courses/week', undefined, token)
  check('week 缺省 → 取 currentWeek', (wkDefault.data as any)?.week === (wkDefault.data as any)?.currentWeek && ((wkDefault.data as any)?.week ?? 0) >= 1, wkDefault.data)

  const cid = (c1.data as any)?.id
  const del = await req('DELETE', `/api/courses/${cid}`, undefined, token)
  check('DELETE /api/courses/:id → 200', del.status === 200, del.data)

  // ---- 3b. 导入教务系统课表（stub crawler，避免依赖外网）----
  // stub 替换 ctx.crawler.crawlAndParse 为固定返回一条 fake 课
  ;(ctx.crawler as any).crawlAndParse = async () => [{
    name: '爬取课A',
    teacher: '老师A',
    location: 'A101',
    day_of_week: 1,
    start_week: 1,
    end_week: 16,
    start_slot: 1,
    end_slot: 2,
    start_time: '08:00',
    end_time: '09:40',
  }]
  const imp = await req('POST', '/api/courses/import', {}, token)
  check('POST /api/courses/import → 200', imp.status === 200, imp.data)
  check('import 响应 imported=1, total=1', (imp.data as any)?.imported === 1 && (imp.data as any)?.total === 1, imp.data)
  const listAfter = await req('GET', '/api/courses', undefined, token)
  check('导入后课表 → 1 门（已替换）', (listAfter.data as any)?.items?.length === 1, listAfter.data)
  check('导入后唯一课程名为「爬取课A」', (listAfter.data as any)?.items?.[0]?.name === '爬取课A', listAfter.data)

  // ---- 4. 待办 ----
  console.log('\n[4] 待办')
  const t1 = await req('POST', '/api/todos', { title: '交实验报告', course_name: '软件工程', priority: 3, due_date: '2025-12-31' }, token)
  check('POST /api/todos → 200', t1.status === 200, t1.data)
  const t1data = t1.data as any
  check('due_date 序列化保留日期', String(t1data?.due_date ?? '').startsWith('2025-12-31T00:00:00'), t1data?.due_date)

  const pending = await req('GET', '/api/todos?status=pending', undefined, token)
  check('GET /api/todos?status=pending → 1 条', (pending.data as any)?.items?.length === 1)

  const upd = await req('PUT', `/api/todos/${t1data?.id}`, { is_completed: true }, token)
  check('PUT /api/todos/:id → 200', upd.status === 200, upd.data)

  const completed = await req('GET', '/api/todos?status=completed', undefined, token)
  check('完成后 status=completed → 1 条', (completed.data as any)?.items?.length === 1)

  const upcoming = await req('GET', '/api/todos/upcoming?days=30', undefined, token)
  check('GET /api/todos/upcoming → 0 条（已完成）', (upcoming.data as any)?.items?.length === 0, upcoming.data)

  const badDate = await req('POST', '/api/todos', { title: 'x', due_date: '2025/12/31' }, token)
  check('非法日期 → 400', badDate.status === 400, badDate.data)

  // ---- 5. 通知 ----
  console.log('\n[5] 通知')
  await ctx.database.create('notification', {
    user_id: (me.data as any)?.id,
    title: '创新学分申请通知',
    content: '2025 年创新学分开始申请',
    category: 'school',
    published_at: new Date(),
  })
  await ctx.database.create('notification', {
    user_id: (me.data as any)?.id,
    title: '程序设计大赛报名',
    content: '校内程序设计大赛开始报名',
    category: 'competition',
    published_at: new Date(),
  })

  const notif = await req('GET', '/api/notifications', undefined, token)
  check('GET /api/notifications → 2 条', (notif.data as any)?.items?.length === 2, notif.data)
  check('分页字段存在', (notif.data as any)?.total === 2 && (notif.data as any)?.page === 1)

  const cat = await req('GET', '/api/notifications/categories', undefined, token)
  check('分类列表包含 school/competition', Array.isArray(cat.data) && (cat.data as string[]).includes('school') && (cat.data as string[]).includes('competition'), cat.data)

  const nid = (notif.data as any)?.items?.[0]?.id
  const mark = await req('PUT', `/api/notifications/${nid}/read`, undefined, token)
  check('PUT /api/notifications/:id/read → 200', mark.status === 200, mark.data)

  const filtered = await req('GET', '/api/notifications?category=school', undefined, token)
  check('按分类筛选 → 1 条', (filtered.data as any)?.items?.length === 1, filtered.data)

  const searched = await req('GET', '/api/notifications?search=大赛', undefined, token)
  check('关键词搜索 → 1 条', (searched.data as any)?.items?.length === 1, searched.data)

  // ---- 6. 聊天（桩）----
  console.log('\n[6] 聊天')
  const chat = await req('POST', '/api/chat', { message: '你好' }, token)
  check('POST /api/chat → 200', chat.status === 200, chat.data)
  check('返回 reply', typeof (chat.data as any)?.reply === 'string')
  const plannedChat = await req('POST', '/api/chat', { message: '帮我安排今天' }, token)
  check('规划 API 返回 daily_schedule', (plannedChat.data as any)?.plan?.skill === 'daily_schedule', plannedChat.data)
  check('规划 API 真实工具查询全部成功', (plannedChat.data as any)?.plan?.steps?.length === 3 &&
    (plannedChat.data as any).plan.steps.every((step: any) => step.status === 'success'), plannedChat.data)

  // ---- 6b. 文件上传（桩 Agent；multipart 走真实解析管线）----
  console.log('\n[6b] 文件上传解析')
  async function upload(form: FormData, authToken?: string) {
    const headers: Record<string, string> = {}
    if (authToken) headers.Authorization = `Bearer ${authToken}`
    const resp = await fetch(`${base}/api/chat/upload`, { method: 'POST', headers, body: form })
    let data: unknown = null
    try { data = await resp.json() } catch { /* ignore */ }
    return { status: resp.status, data }
  }

  const txtForm = new FormData()
  txtForm.append('file', new File(['软件工程实验报告，请于 2026-09-01 前提交'], '实验报告.txt', { type: 'text/plain' }))
  const upOk = await upload(txtForm, token)
  check('上传 TXT → 200', upOk.status === 200, upOk.data)
  check('上传返回 filename + reply', (upOk.data as any)?.filename === '实验报告.txt' && typeof (upOk.data as any)?.reply === 'string')

  const badForm = new FormData()
  badForm.append('file', new File(['not an image'], 'photo.png', { type: 'image/png' }))
  const upBad = await upload(badForm, token)
  check('不支持的文件类型 → 415', upBad.status === 415, upBad.data)

  const noAuthForm = new FormData()
  noAuthForm.append('file', new File(['x'], 'a.txt', { type: 'text/plain' }))
  const upNoAuth = await upload(noAuthForm)
  check('未登录上传 → 401', upNoAuth.status === 401)

  // ---- 6c. parseClassifyJson（LLM 输出解析）----
  console.log('\n[6c] 意图识别 JSON 解析')
  const good = parseClassifyJson('{"intent":"todo","todos":[{"title":"交实验报告","course_name":"软件工程","due_date":"2026-09-01"}],"knowledge":null,"reply":"已生成待办"}')
  check('解析 todo 意图', good?.intent === 'todo' && good?.todos?.[0]?.title === '交实验报告')
  const codeBlock = parseClassifyJson('```json\n{"intent":"knowledge","todos":[],"knowledge":{"title":"奖学金通知","content":"开始申请"},"reply":"已存入知识库"}\n```')
  check('解析代码块包裹的 JSON', codeBlock?.intent === 'knowledge' && codeBlock?.knowledge?.title === '奖学金通知')
  const noisy = parseClassifyJson('好的，以下是结果：{"intent":"none","todos":[],"knowledge":null,"reply":"你好"}')
  check('解析前后有多余文字的 JSON', noisy?.intent === 'none')
  const broken = parseClassifyJson('这不是 JSON')
  check('非法输出返回 null（降级）', broken === null)
  const badIntent = parseClassifyJson('{"intent":"hack","todos":[],"knowledge":null,"reply":"x"}')
  check('非法 intent 返回 null', badIntent === null)

  // ---- 6d. 作业 CRUD ----
  console.log('\n[6d] 作业')
  const hwList = await req('GET', '/api/assignments', undefined, token)
  check('GET /api/assignments → 200', hwList.status === 200)
  check('空账号 → []', Array.isArray(hwList.data) && (hwList.data as any[]).length === 0)

  const hwDel = await req('DELETE', '/api/assignments/99999', undefined, token)
  check('DELETE 不存在的作业 → 404', hwDel.status === 404)

  const hwRefreshBad = await req('POST', '/api/assignments/refresh', {}, token)
  check('POST /api/assignments/refresh 缺参数 → 400', hwRefreshBad.status === 400)

  // ---- 7. Tool 注册 ----
  console.log('\n[7] Tool 中心')
  const tools = ctx.tool.list()
  check('已注册 6 个工具', tools.length === 6, tools.map((t) => t.name))
  check('rag tool 已注册', ctx.tool.get('rag')?.name === 'rag')
  check('rag tool schema 含 query 必填', Array.isArray(ctx.tool.get('rag')?.inputSchema?.required) && (ctx.tool.get('rag')?.inputSchema?.required as string[]).includes('query'))
  const todayTool = await ctx.tool.get('course')!.execute({ user_id: (me.data as any)?.id, action: 'today' })
  check('course tool(today) 可用', todayTool.success === true)
  const profileTool = await ctx.tool.get('user_profile')!.execute({ user_id: (me.data as any)?.id })
  check('user_profile tool 可用', profileTool.success === true)
  const assignmentTool = await ctx.tool.get('assignment')!.execute({ user_id: (me.data as any)?.id, action: 'list' })
  check('assignment tool(list) 可用', assignmentTool.success === true)
  const deadlinePlan = await buildPlan('deadline', tools, (me.data as any)?.id, new Date('2026-09-21T09:00:00'))
  check('Planner 可汇总工具数据', deadlinePlan.includes('截止优先级计划'), deadlinePlan)

  console.log(failures ? `\n❌ 冒烟测试完成，${failures} 项失败` : '\n✅ 冒烟测试全部通过')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error('冒烟测试异常:', error)
  process.exit(1)
})
