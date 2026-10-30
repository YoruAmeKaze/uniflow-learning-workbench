/**
 * 创建可重复执行的评委演示数据。
 * 只写入固定演示账号，不修改其他用户的数据。
 */
import { Context } from 'cordis'
import Database from '@cordisjs/plugin-database'
import MySQLDriver from '@cordisjs/plugin-database-mysql'
import bcrypt from 'bcryptjs'

import { loadConfig, setConfig, config } from './config'
import { apply as models } from './models/index'

const DEMO_STUDENT_ID = '2026000001'
const DEMO_PASSWORD = 'UniFlowDemo2026!'

function chinaDate(daysFromToday: number, hour: number, minute = 0): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + daysFromToday)
  return new Date(`${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`)
}

async function seed() {
  setConfig(loadConfig())
  const ctx = new Context()
  await ctx.plugin(Database)
  await ctx.plugin(MySQLDriver, {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: config.db.charset,
  })
  await ctx.plugin(models)

  const existing = (await ctx.database.get('user', { student_id: DEMO_STUDENT_ID }))[0]
  const user = existing ?? await ctx.database.create('user', {
    student_id: DEMO_STUDENT_ID,
    username: '评委演示账号',
    email: 'demo@uniflow.local',
    hashed_password: bcrypt.hashSync(DEMO_PASSWORD, 10),
    college: '计算机学院',
    major: '软件工程',
    grade: '2026级',
  })
  if (existing) {
    await ctx.database.set('user', { id: existing.id }, {
      username: '评委演示账号',
      hashed_password: bcrypt.hashSync(DEMO_PASSWORD, 10),
      college: '计算机学院',
      major: '软件工程',
      grade: '2026级',
      is_active: true,
    })
  }
  const userId = user.id

  const courses = [
    { name: '高等数学', teacher: '李老师', classroom: 'A101', weekday: 3, start_time: '08:00', end_time: '09:40', location: '教学楼 A101' },
    { name: '数据结构', teacher: '王老师', classroom: 'B203', weekday: 4, start_time: '10:00', end_time: '11:40', location: '教学楼 B203' },
    { name: '软件工程实践', teacher: '周老师', classroom: '实验楼 302', weekday: 5, start_time: '14:00', end_time: '15:40', location: '实验楼 302' },
  ]
  for (const course of courses) {
    const duplicate = await ctx.database.get('course', { user_id: userId, name: course.name, weekday: course.weekday })
    if (!duplicate.length) await ctx.database.create('course', { ...course, user_id: userId, start_week: 1, end_week: 18 })
  }

  const todos = [
    { title: '整理本周课程笔记', course_name: '高等数学', priority: 3, due_date: chinaDate(2, 20), description: '整理课堂例题并标记不懂的知识点。' },
    { title: '准备小组项目会议', course_name: '软件工程实践', priority: 4, due_date: chinaDate(4, 18), description: '提前准备项目进度和待讨论问题。' },
    { title: '阅读校园创新创业通知', course_name: '', priority: 2, due_date: chinaDate(7, 21), description: '了解报名条件和截止时间。' },
  ]
  for (const todo of todos) {
    const duplicate = await ctx.database.get('todo', { user_id: userId, title: todo.title, is_completed: false })
    if (!duplicate.length) await ctx.database.create('todo', { ...todo, user_id: userId, is_completed: false, is_reminded: false })
  }

  const assignments = [
    { remote_id: 'demo-math-01', source: 'smartestu', title: '高等数学第三章习题', course_name: '高等数学', description: '完成课本第三章 1-10 题并提交照片。', due_time: chinaDate(1, 23) },
    { remote_id: 'demo-data-01', source: 'chaoxing', title: '数据结构实验报告', course_name: '数据结构', description: '完成链表实验并上传实验报告。', due_time: chinaDate(3, 23, 30) },
  ]
  for (const assignment of assignments) {
    const duplicate = await ctx.database.get('assignment', { user_id: userId, remote_id: assignment.remote_id })
    if (!duplicate.length) await ctx.database.create('assignment', { ...assignment, user_id: userId, is_completed: false })
  }

  const notifications = [
    { title: '2026年秋季奖学金申请通知', category: 'school', content: '本学期奖学金申请开放。请在规定时间内准备申请材料，并通过学生事务系统提交。具体评审条件、材料清单和截止日期以学院通知为准。', source: '演示通知' },
    { title: '校园创新创业大赛报名开始', category: 'competition', content: '校园创新创业大赛现已开放报名，鼓励同学结合专业方向组队参赛。请关注报名条件、赛道说明和材料提交要求。', source: '演示通知' },
  ]
  for (const notification of notifications) {
    const duplicate = await ctx.database.get('notification', { user_id: userId, title: notification.title })
    if (!duplicate.length) await ctx.database.create('notification', { ...notification, user_id: userId, source_url: '', is_read: false, is_important: true, published_at: new Date() })
  }

  console.log(`[seed-demo] 演示账号已就绪：${DEMO_STUDENT_ID} / ${DEMO_PASSWORD}`)
  process.exit(0)
}

seed().catch((error) => {
  console.error('[seed-demo] 初始化失败:', error)
  process.exitCode = 1
})
