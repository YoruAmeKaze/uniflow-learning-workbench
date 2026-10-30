/**
 * 生成 UniFlow 百炼 SFT 数据集。
 *
 * 输出：data/finetune/train.jsonl、validation.jsonl、test.jsonl
 * 数据全部为合成校园场景，不含真实个人信息；输出协议与 AgentService.classify() 一致。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = resolve(ROOT, 'data/finetune')
const SYSTEM = '你是 UniFlow 校园事务助手。请判断用户内容属于 todo、knowledge 或 none，并严格只输出 JSON：包含 intent、todos、knowledge、reply 四个字段。todo 抽取 title、course_name、due_date（YYYY-MM-DD 或 YYYY-MM-DDTHH:mm）、priority（1-5）、description；knowledge 抽取 title、content、category（school/college/competition/general）；none 时 todos 为空数组、knowledge 为 null。'

function todo(user, title, course = '', due = '', priority = 2, description = '') {
  return { intent: 'todo', todos: [{ title, course_name: course, due_date: due, priority, description: description || title }], knowledge: null, reply: `已为你创建“${title}”待办。` }
}
function todos(user, items, reply = '已为你创建这些待办。') {
  return { intent: 'todo', todos: items, knowledge: null, reply }
}
function knowledge(title, content, category = 'school') {
  return { intent: 'knowledge', todos: [], knowledge: { title, content, category }, reply: `已将“${title}”保存到知识库。` }
}
function none(reply = '好的，我可以帮你查询课程、作业、待办和校园通知。') {
  return { intent: 'none', todos: [], knowledge: null, reply }
}
function make(user, answer) {
  return { messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }, { role: 'assistant', content: JSON.stringify(answer, ensureAscii) }] }
}
function ensureAscii(key, value) {
  return typeof value === 'string' ? value : value
}

const train = []
const val = []
const test = []
const add = (bucket, user, answer) => bucket.push(make(user, answer))

// 训练集：同一意图覆盖不同说法、日期粒度、字段缺失和多任务。
const todoCases = [
  ['提醒我9月20日交高数作业', '提交高等数学作业', '高等数学', '2026-09-20', 2],
  ['软件工程实验报告下周五前交，帮我记一下', '提交软件工程实验报告', '软件工程', '2026-09-25', 2],
  ['明天下午三点参加学生会例会，加入待办', '参加学生会例会', '', '2026-09-16T15:00', 2],
  ['记得在10月1日之前提交奖学金申请表', '提交奖学金申请表', '', '2026-10-01', 3],
  ['帮我安排一个待办：周三晚上复习数据库', '复习数据库', '数据库', '2026-09-16T19:00', 2],
  ['操作系统课程设计周末要交', '提交操作系统课程设计', '操作系统', '2026-09-20', 3],
  ['下周一提醒我去教务处办理证明', '去教务处办理证明', '', '2026-09-21', 2],
  ['请记下：9月30日缴纳学费', '缴纳学费', '', '2026-09-30', 3],
  ['今天18:30参加实验室组会', '参加实验室组会', '', '2026-09-15T18:30', 2],
  ['帮我创建待办，明早八点打印开题报告', '打印开题报告', '', '2026-09-16T08:00', 2],
  ['提醒我周五给导师发周报', '给导师发送周报', '', '2026-09-18', 2],
  ['英语演讲稿后天要交，别忘了', '提交英语演讲稿', '大学英语', '2026-09-17', 2],
  ['把“预约图书馆研讨室”记成待办，9月22日下午两点', '预约图书馆研讨室', '', '2026-09-22T14:00', 1],
  ['我需要在本周四完成体测报名', '完成体测报名', '', '2026-09-17', 2],
  ['创建一个高优先级待办：明天交电路实验', '提交电路实验', '电路', '2026-09-16', 5],
  ['请提醒我月底前续校园卡', '续办校园卡', '', '2026-09-30', 1],
  ['下个月5号交科研项目中期报告', '提交科研项目中期报告', '', '2026-10-05', 3],
  ['把参加志愿服务培训加入我的待办，时间是9月19日10点', '参加志愿服务培训', '', '2026-09-19T10:00', 1],
  ['记一下，周六整理宿舍材料', '整理宿舍材料', '', '2026-09-19', 1],
  ['请安排：今天买实验耗材，优先级4', '购买实验耗材', '', '2026-09-15', 4],
  ['提醒我联系辅导员确认转专业材料', '联系辅导员确认转专业材料', '', '', 2],
  ['帮我记住补交上学期成绩单', '补交上学期成绩单', '', '', 2],
  ['加入待办：准备普通话考试资料', '准备普通话考试资料', '', '', 1],
  ['有一个任务，完成校园网实名认证', '完成校园网实名认证', '', '', 2],
  ['请把下面两件事都记下来：周三交实验报告；周四参加答辩', 'ignored', '', '', 2],
]
const variants = ['帮我记一下：', '请创建待办：', '提醒我，', '加入待办，', '别忘了，']
for (let i = 0; i < todoCases.length; i++) {
  const [u, title, course, due, p] = todoCases[i]
  if (title === 'ignored') {
    add(train, '请把下面两件事都记下来：周三交实验报告；周四参加答辩', todos('x', [
      { title: '提交实验报告', course_name: '', due_date: '2026-09-16', priority: 2, description: '提交实验报告' },
      { title: '参加答辩', course_name: '', due_date: '2026-09-17', priority: 2, description: '参加答辩' },
    ]))
    continue
  }
  add(train, u, todo(u, title, course, due, p))
  add(train, variants[i % variants.length] + u.toLowerCase(), todo(u, title, course, due, p))
}

const knowledgeCases = [
  ['学校发布了2026年国庆放假安排：10月1日至10月7日放假。帮我保存。', '国庆放假安排', '2026年10月1日至10月7日放假。', 'school'],
  ['请把这条通知存进知识库：计算机学院本周五举办就业分享会。', '计算机学院就业分享会', '计算机学院本周五举办就业分享会。', 'college'],
  ['有一则比赛信息，2026校园程序设计大赛开始报名，截止9月30日，记录一下。', '2026校园程序设计大赛报名', '2026校园程序设计大赛开始报名，截止2026年9月30日。', 'competition'],
  ['保存政策：本科生奖学金评定按照综合测评办法执行。', '本科生奖学金评定政策', '本科生奖学金评定按照综合测评办法执行。', 'school'],
  ['把这段知识记下来：图书馆周末开放时间为8:30到22:00。', '图书馆周末开放时间', '图书馆周末开放时间为8:30到22:00。', 'school'],
  ['学院通知：软件工程专业将于下周进行培养方案宣讲，请存档。', '软件工程培养方案宣讲', '软件工程专业将于下周进行培养方案宣讲。', 'college'],
  ['收藏这个活动信息：志愿者服务月招募开始，面向全校学生。', '志愿者服务月招募', '志愿者服务月招募开始，面向全校学生。', 'competition'],
  ['下面是校园卡使用说明，请保存：挂失后可在自助机补办。', '校园卡使用说明', '校园卡挂失后可在自助机补办。', 'general'],
  ['记录通知：学校将于周三晚22点进行网络维护。', '校园网络维护通知', '学校将于周三晚22点进行网络维护。', 'school'],
  ['存入知识库，内容是：研究生创新项目申报指南已发布。', '研究生创新项目申报指南', '研究生创新项目申报指南已发布。', 'school'],
]
for (let i = 0; i < knowledgeCases.length; i++) {
  const [u, t, c, cat] = knowledgeCases[i]
  add(train, u, knowledge(t, c, cat))
  add(train, '请帮我保存这条信息：' + u.replace(/请把这条通知存进知识库：|保存政策：|把这段知识记下来：|学院通知：|收藏这个活动信息：|下面是校园卡使用说明，请保存：|记录通知：|存入知识库，内容是：/g, ''), knowledge(t, c, cat))
}

const noneCases = [
  ['你好，你能做什么？', '你好！我可以帮你查询课程、作业、待办和校园通知。'],
  ['今天星期几？', '今天是星期二。'],
  ['我的本周课表是什么？', '我可以帮你查询本周课表，请稍等。'],
  ['最近有什么作业？', '我可以帮你查询作业列表和截止时间。'],
  ['帮我看看明天的课', '我可以帮你查询明天的课程安排。'],
  ['校园通知里有奖学金消息吗？', '我来帮你检索相关校园通知。'],
  ['最近有哪些学校通知？', '我来帮你检索最近的校园通知。'],
  ['帮我查一下校园公告', '我来帮你检索校园公告。'],
  ['学校最近发了什么消息？', '我来帮你检索最近的学校通知。'],
  ['查询教务处通知', '我来帮你检索教务处通知。'],
  ['有没有新的学院通知？', '我来帮你检索最新的学院通知。'],
  ['找一下奖学金相关的通知', '我来帮你检索奖学金相关通知。'],
  ['看看近期比赛公告', '我来帮你检索近期比赛公告。'],
  ['我想浏览官方通知', '我来帮你检索学校官方通知。'],
  ['列出最近的校园公告', '我来帮你查询最近的校园公告。'],
  ['教务处有没有新通知', '我来帮你检索教务处最新通知。'],
  ['什么是RAG？', 'RAG 是先检索知识库，再让模型结合检索内容回答问题。'],
  ['谢谢你', '不客气，有校园事务需要处理时随时告诉我。'],
  ['我不想创建待办，只是想知道怎么报名体测', '好的，我可以帮你查询体测报名相关通知。'],
  ['作业和待办有什么区别？', '作业通常来自教务或学习平台，待办是你主动设置的提醒。'],
  ['列出我未完成的任务，但不要修改数据', '我可以帮你查询未完成的任务。'],
  ['给我讲个笑话', '我主要负责校园事务，也可以陪你简单聊聊。'],
]
for (const [u, r] of noneCases) {
  add(train, u, none(r))
  add(train, u.replace(/[？?。！]/g, '') + '。', none(r))
  add(train, '我想问一下，' + u, none(r))
}

// 边界样本：明确区分“查询作业”与“创建待办”，以及不完整信息。
const boundaries = [
  ['有作业吗？', none('我来帮你查询作业列表和截止时间。')],
  ['提醒我完成作业', todo('x', '完成作业', '', '', 2)],
  ['把老师发的通知保存，不需要提醒', knowledge('老师通知', '老师发来的校园通知。', 'general')],
  ['只问一下奖学金什么时候开始，不要保存', none('我来帮你查询奖学金相关通知。')],
  ['明天交作业，记一下', todo('x', '提交作业', '', '2026-09-16', 2)],
  ['报名比赛的通知是什么？', none('我来帮你检索比赛相关校园通知。')],
]
for (const [u, a] of boundaries) add(train, u, a)

// 验证集：与训练样本不同的表达。
const valCases = [
  ['9月28日之前交线性代数作业，提醒我', todo('x', '提交线性代数作业', '线性代数', '2026-09-28', 2)],
  ['周四上午十点去参加创新创业讲座，加入待办', todo('x', '参加创新创业讲座', '', '2026-09-17T10:00', 2)],
  ['帮我存一下：学校将开展消防安全演练。', knowledge('消防安全演练通知', '学校将开展消防安全演练。', 'school')],
  ['保存学院信息：本学期转专业申请指南发布。', knowledge('转专业申请指南', '本学期转专业申请指南发布。', 'college')],
  ['查询一下今天有没有课', none('我来帮你查询今天的课程安排。')],
  ['作业平台上有哪些未完成作业？', none('我来帮你查询未完成的作业。')],
  ['记下：准备英语四级报名材料', todo('x', '准备英语四级报名材料', '', '', 2)],
  ['把这个比赛公告放入知识库，大学生创新竞赛报名开始。', knowledge('大学生创新竞赛报名', '大学生创新竞赛报名开始。', 'competition')],
  ['请查询一下近期发布的学院公告', none('我来帮你检索近期学院公告。')],
  ['学校有什么最新消息可以看吗？', none('我来帮你检索学校最新通知。')],
  ['最近的教务公告有哪些？', none('我来帮你检索最近的教务公告。')],
  ['你好，明天的天气怎么样？', none('我目前主要负责校园事务，可以帮你查询课程、作业和通知。')],
  ['不要创建任何东西，告诉我RAG是什么', none('RAG 是先检索知识库，再让模型结合检索内容回答问题。')],
]
for (const [u, a] of valCases) add(val, u, a)
for (const [u, a] of valCases) add(val, '请处理一下：' + u, a)

// 独立测试集：用于比赛报告，不能参与训练。
const testCases = [
  ['请在9月23日18:00提醒我提交机器学习实验', todo('x', '提交机器学习实验', '机器学习', '2026-09-23T18:00', 3)],
  ['下周二参加班级会议，帮我记到待办', todo('x', '参加班级会议', '', '2026-09-22', 1)],
  ['帮我添加待办：联系图书馆处理逾期费用', todo('x', '联系图书馆处理逾期费用', '', '', 2)],
  ['请收录这条学校消息：秋季学期注册时间为9月7日至9月11日。', knowledge('秋季学期注册时间', '秋季学期注册时间为9月7日至9月11日。', 'school')],
  ['知识库保存：数学建模竞赛报名截止10月10日。', knowledge('数学建模竞赛报名', '数学建模竞赛报名截止2026年10月10日。', 'competition')],
  ['学院通知说本周有就业双选会，存一下', knowledge('学院就业双选会', '学院本周有就业双选会。', 'college')],
  ['我下周有哪些课程？', none('我来帮你查询下周课程安排。')],
  ['帮我找最近的校园通知', none('我来帮你检索最近的校园通知。')],
  ['查询待办列表即可，不要新建', none('我来帮你查询待办列表。')],
  ['这段话只是咨询：怎么导入课表？', none('我可以告诉你课表导入的操作方法。')],
  ['期末考试安排通知请保存：考试周为第18周。', knowledge('期末考试安排', '考试周为第18周。', 'school')],
  ['周五前完成科研伦理课程学习', todo('x', '完成科研伦理课程学习', '科研伦理', '2026-09-18', 2)],
]
for (const [u, a] of testCases) add(test, u, a)
for (const [u, a] of testCases) add(test, '用户说：' + u, a)
for (const [u, a] of testCases) add(test, u.replace(/请|帮我|一下|，/g, ''), a)

// 去重并写出，确保每个分片至少包含三种 intent。
function unique(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    const key = row.messages[1].content
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const outputs = { train: unique(train), validation: unique(val), test: unique(test) }
mkdirSync(OUT, { recursive: true })
for (const [name, rows] of Object.entries(outputs)) {
  writeFileSync(resolve(OUT, `${name}.jsonl`), rows.map((r) => JSON.stringify(r, ensureAscii)).join('\n') + '\n')
}
writeFileSync(resolve(OUT, 'stats.json'), JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([k, rows]) => [k, { total: rows.length, intents: Object.fromEntries(['todo', 'knowledge', 'none'].map((intent) => [intent, rows.filter((r) => JSON.parse(r.messages[2].content).intent === intent).length])) }])), null, 2) + '\n')
console.log(`generated ${outputs.train.length} train, ${outputs.validation.length} validation, ${outputs.test.length} test samples in ${OUT}`)
