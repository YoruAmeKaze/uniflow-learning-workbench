import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import type { Tool } from '../tools'
import { config, setConfig } from '../config'
import { AgentService } from '../services/agent'
import { detectPlanIntent, resolvePlanDate, runPlanner } from '../services/planner'
import { collectPlan, defaultProposal, validateProposal, renderPlan, within } from './planning'

const now = new Date('2026-09-21T10:00:00+08:00')
function fixtures(overrides: Record<string, Record<string, unknown>[]> = {}, calls: Record<string, unknown>[] = []): Tool[] {
  const items = {
    course: [{ id: 1, name: '电路原理', weekday: 1, start_week: 1, end_week: 18, start_time: '10:00', end_time: '11:40', location: 'A101' }],
    todo: [
      { id: 1, title: '今日交表', due_date: new Date('2026-09-21T17:00:00+08:00'), priority: 5, is_completed: false },
      { id: 2, title: '无截止复习', due_date: null, priority: 2, is_completed: false },
      { id: 3, title: '已完成项目', due_date: null, is_completed: true },
    ],
    assignment: [{ id: 4, title: '逾期报告', due_time: new Date('2026-09-20T17:00:00+08:00'), is_completed: false }],
    ...overrides,
  }
  return Object.entries(items).map(([name, rows]) => ({ name, description: name, inputSchema: {}, execute: (args) => {
    calls.push({ tool: name, ...args }); return { success: true, data: { items: rows } }
  } }))
}
const context = (tools = fixtures(), clock = now) => ({ tools, userId: 22, now: clock, semesterStart: '2026-09-07' })

test('明确计划直达；新增/普通查询/其他日期不被接管', () => {
  assert.equal(detectPlanIntent('帮我安排今天，晚上再复习'), 'daily')
  assert.equal(detectPlanIntent('帮我安排今天，不要安排在上午'), 'daily')
  assert.equal(detectPlanIntent('今天按截止时间安排任务'), 'daily')
  assert.equal(detectPlanIntent('给我做一个本周计划'), 'weekly')
  assert.equal(detectPlanIntent('作业我该先做什么'), 'deadline')
  assert.equal(detectPlanIntent('帮我安排明天'), 'daily')
  assert.equal(detectPlanIntent('明天我可以干什么'), 'daily')
  assert.equal(detectPlanIntent('帮我安排9月24日'), 'daily')
  for (const message of ['今天作业是什么', '提醒我今天写计划', '不要安排今天', '帮我查作业截止时间']) assert.equal(detectPlanIntent(message), null)
  assert.equal(resolvePlanDate('明天我可以干什么', now)?.toISOString(), '2026-09-21T16:00:00.000Z')
  assert.equal(resolvePlanDate('三天后我可以干什么', now)?.toISOString(), '2026-09-23T16:00:00.000Z')
  assert.equal(resolvePlanDate('5天后我可以干什么', now)?.toISOString(), '2026-09-25T16:00:00.000Z')
})
test('同一用户的只读工具、逾期和无日期任务；时间块避开课程和过去时间', async () => {
  const calls: Record<string, unknown>[] = []
  const plan = await collectPlan('daily', context(fixtures({}, calls)))
  assert.deepEqual(calls.map((call) => call.user_id), [22, 22, 22])
  assert.equal(calls[0].week, 3)
  assert.equal(calls[0].weekday, 1)
  assert.ok(calls.every((call) => !['create', 'delete'].includes(String(call.action))))
  assert.deepEqual(plan.tasks.map((task) => task.id), ['assignment:4', 'todo:1', 'todo:2'])
  assert.equal(plan.tasks[0].overdue, true)
  assert.ok(plan.slots.every((slot) => Date.parse(slot.start) >= Date.parse('2026-09-21T13:00:00+08:00')))
  const proposal = defaultProposal(plan)
  assert.ok(validateProposal(proposal, plan))
  assert.ok(!proposal.sessions.some((session) => session.taskId === 'assignment:4'))
  assert.match(renderPlan(plan, proposal, true), /已逾期/)
})
test('单日Skill按目标日期查询课程并生成目标日时间块', async () => {
  const calls: Record<string, unknown>[] = []
  const plan = await collectPlan('daily', context(fixtures({ course: [
    { id: 9, name: '明日课程', weekday: 2, start_week: 1, end_week: 18, start_time: '10:00', end_time: '11:40', location: 'B202' },
  ] }, calls)))
  const target = new Date('2026-09-22T00:00:00+08:00')
  const tomorrow = await collectPlan('daily', { ...context(fixtures({ course: [
    { id: 9, name: '明日课程', weekday: 2, start_week: 1, end_week: 18, start_time: '10:00', end_time: '11:40', location: 'B202' },
  ] }, [])), targetDate: target })
  assert.equal(calls[0].weekday, 1)
  assert.equal(tomorrow.courses[0].title, '明日课程')
  assert.ok(tomorrow.slots.every((slot) => slot.start.startsWith('2026-09-22')))
})
test('本周截止于北京时间周日；不包含下周一', async () => {
  const plan = await collectPlan('weekly', context(fixtures({
    todo: [
      { id: 1, title: '周日任务', due_date: '2026-09-27T23:59:00+08:00' },
      { id: 2, title: '下周一任务', due_date: '2026-09-28T00:00:00+08:00' },
    ], assignment: [], course: [],
  }), new Date('2026-09-26T16:30:00Z')))
  assert.equal(plan.end, '2026-09-28T00:00:00+08:00')
  assert.deepEqual(plan.tasks.map((task) => task.title), ['周日任务'])
  assert.ok(plan.slots.every((slot) => slot.start.startsWith('2026-09-27')))
})
test('课程冲突可见，格式损坏的课程阻止不可靠的时间分配', async () => {
  const plan = await collectPlan('daily', context(fixtures({ course: [
    { name: 'A', weekday: 1, start_time: '10:00', end_time: '11:30' },
    { name: 'B', weekday: 1, start_time: '11:00', end_time: '12:00' },
    { name: 'C', weekday: 1, start_time: '第3节', end_time: '第4节' },
  ] })))
  assert.ok(plan.warnings.some((warning) => warning.includes('课程时间冲突')))
  assert.equal(plan.slots.length, 0)
})
test('工具失败不等于没有任务，缺少用户不运行工具', async () => {
  const tools = fixtures({ todo: [], assignment: [] })
  tools[0].execute = () => { throw new Error('sensitive internal error') }
  tools[1].execute = () => ({ success: false, error: 'private error' })
  const plan = await collectPlan('daily', context(tools))
  assert.equal(plan.steps[0].status, 'failed')
  assert.equal(plan.slots.length, 0)
  const reply = renderPlan(plan, defaultProposal(plan), true)
  assert.match(reply, /数据不完整/)
  assert.doesNotMatch(reply, /private|sensitive/)
  const calls: Record<string, unknown>[] = []
  await collectPlan('daily', { ...context(fixtures({}, calls)), userId: 0 })
  assert.equal(calls.length, 0)
})
test('模型计划拒绝虚构id、重复时间块和超截止时间', async () => {
  const plan = await collectPlan('daily', context())
  const base = defaultProposal(plan)
  assert.equal(validateProposal({ ...base, order: ['fake'] }, plan), null)
  assert.equal(validateProposal({ ...base, sessions: [{ taskId: 'todo:1', slotId: 'fake' }] }, plan), null)
  assert.equal(validateProposal({ ...base, sessions: [{ taskId: 'todo:1', slotId: plan.slots[0].id }, { taskId: 'todo:2', slotId: plan.slots[0].id }] }, plan), null)
  const late = plan.slots.find((slot) => slot.start.includes('19:00'))!
  assert.equal(validateProposal({ ...base, sessions: [{ taskId: 'todo:1', slotId: late.id }] }, plan), null)
})
test('模糊请求通过模型选Skill；模型可按偏好选择晚间时间块', async () => {
  let calls = 0
  const result = await runPlanner('最近事情好多，帮我理一下，复习放晚上', { tools: fixtures(), userId: 22, now,
    model: async (_, input) => {
      if (++calls === 1) return '{"skill":"deadline_priority","confidence":0.95}'
      const data = JSON.parse(input)
      return JSON.stringify({ order: data.tasks.map((task: { id: string }) => task.id), sessions: [] })
    },
  })
  assert.equal(result?.plan.routing, 'model')
  assert.equal(result?.plan.generation, 'model')
  assert.match(result!.reply, /建议执行顺序/)
})
test('模型无效输出或不可用时仍有基础计划，不执行模型捏造的工具', async () => {
  for (const model of [async () => 'not json', async () => { throw new Error('offline') }]) {
    const result = await runPlanner('帮我安排今天', { tools: fixtures(), userId: 22, now, model })
    assert.equal(result, null)
  }
  const result = await runPlanner('帮我理一下任务', { tools: fixtures(), userId: 22, now, model: async () => '{"skill":"delete_all","confidence":1}' })
  assert.equal(result, null)
})
test('模型路由明确返回none时回归普通Agent', async () => {
  let calls = 0
  assert.equal(await runPlanner('你好', { tools: [], model: async () => { calls++; return '{"skill":"none","confidence":1}' } }), null)
  assert.equal(calls, 1)
  assert.equal(await runPlanner('计划是什么意思', { tools: [], model: async () => '{"skill":"none","confidence":1}' }), null)
  assert.equal(await runPlanner('学校培养计划通知什么时候发布？', { tools: [], model: async () => '{"skill":"none","confidence":1}' }), null)
})
test('超时Promise会按预算返回', async () => {
  await assert.rejects(within(new Promise(() => {}), 10), /timeout/)
})
test('真实Agent入口使用Skill并保留百炼非流式参数，返回执行记录', async () => {
  const original = config
  setConfig({ ...config, llm: { ...config.llm, apiKey: 'test-key' } })
  try {
    const agent = new AgentService(new Context())
    const requests: Record<string, unknown>[] = []
    ;(agent as any).client = { chat: { completions: { create: async (request: any) => {
      requests.push(request)
      if (requests.length === 1) return { choices: [{ message: { content: '{"skill":"deadline_priority","confidence":0.95}' } }] }
      const data = JSON.parse(request.messages[1].content)
      return { choices: [{ message: { content: JSON.stringify({ order: data.tasks.map((task: { id: string }) => task.id), sessions: [] }) } }] }
    } } } }
    const result = await agent.processIncoming('作业我该先做什么', { tools: fixtures(), userId: 22 })
    assert.equal(result.plan?.skill, 'deadline_priority')
    assert.equal(result.plan?.steps.length, 2)
    assert.equal(result.plan?.generation, 'model')
    assert.ok(requests.every((request) => request.enable_thinking === false))
    assert.deepEqual(result.createdTodos, [])
    assert.deepEqual(result.sources, [])
  } finally { setConfig(original) }
})
