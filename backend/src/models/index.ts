/**
 * 数据模型定义（Minato / ctx.model）
 * 对应原 backend/models/*.py，字段与现有 MySQL 表结构一致
 */
import { Context } from 'cordis'
import '@cordisjs/plugin-database'

// 声明所有表名，使 ctx.database.get('assignment') 等通过类型检查
declare module '@cordisjs/plugin-database' {
  interface Tables {
    assignment: {
      id: number
      user_id: number
      source: string
      remote_id: string
      title: string
      course_name: string
      description: string
      due_time: Date | null
      is_completed: boolean
      created_at: Date | null
    }
  }
}

export function apply(ctx: Context) {
  // ---- 用户 ----
  ctx.model.extend('user', {
    id: 'unsigned',
    student_id: { type: 'string', length: 20 },
    username: { type: 'string', length: 50 },
    email: { type: 'string', length: 100, initial: '' },
    phone: { type: 'string', length: 20, initial: '' },
    hashed_password: { type: 'string', length: 255 },
    avatar: { type: 'string', length: 500, initial: '' },
    college: { type: 'string', length: 100, initial: '' },
    major: { type: 'string', length: 100, initial: '' },
    grade: { type: 'string', length: 20, initial: '' },
    is_active: { type: 'boolean', initial: true },
    is_admin: { type: 'boolean', initial: false },
    created_at: { type: 'timestamp', nullable: true },
    updated_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    unique: [['student_id']],
  })

  // ---- 课程 ----
  ctx.model.extend('course', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    name: { type: 'string', length: 100 },
    teacher: { type: 'string', length: 50, initial: '' },
    classroom: { type: 'string', length: 100, initial: '' },
    weekday: { type: 'unsigned' },
    start_week: { type: 'unsigned', initial: 1 },
    end_week: { type: 'unsigned', initial: 18 },
    start_time: { type: 'string', length: 20 },
    end_time: { type: 'string', length: 20 },
    location: { type: 'string', length: 200, initial: '' },
    credit: { type: 'float', initial: 0 },
    created_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- 待办 ----
  ctx.model.extend('todo', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    title: { type: 'string', length: 200 },
    description: { type: 'text', initial: '' },
    course_name: { type: 'string', length: 100, initial: '' },
    priority: { type: 'unsigned', initial: 1 },
    due_date: { type: 'timestamp', nullable: true },
    is_completed: { type: 'boolean', initial: false },
    is_reminded: { type: 'boolean', initial: false },
    created_at: { type: 'timestamp', nullable: true },
    updated_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- 通知 ----
  ctx.model.extend('notification', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    title: { type: 'string', length: 200 },
    content: { type: 'text' },
    category: { type: 'string', length: 50, initial: 'general' },
    source: { type: 'string', length: 200, initial: '' },
    /** 可点击的原文链接；source 可继续保存来源名称/标记 */
    source_url: { type: 'string', length: 500, initial: '' },
    is_read: { type: 'boolean', initial: false },
    published_at: { type: 'timestamp', nullable: true },
    /** AI 总结的重要通知摘要（仅 is_important=true 时生成） */
    summary: { type: 'text', nullable: true },
    /** 是否标记为重要（与用户相关） */
    is_important: { type: 'boolean', initial: false },
    /** RAG 向量（JSON 数组字符串），由 embedding 服务生成，首次检索时懒回填 */
    embedding: { type: 'text', nullable: true },
    created_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- RAG 知识片段 ----
  // 一条通知可拆成多个 300–500 token 的 chunk，各 chunk 独立向量化并携带来源元数据。
  ctx.model.extend('knowledge_chunk', {
    id: 'unsigned',
    notification_id: { type: 'unsigned' },
    user_id: { type: 'unsigned' },
    chunk_index: { type: 'unsigned', initial: 0 },
    content: { type: 'text' },
    title: { type: 'string', length: 200 },
    category: { type: 'string', length: 50, initial: 'general' },
    source: { type: 'string', length: 200, initial: '' },
    source_url: { type: 'string', length: 500, initial: '' },
    published_at: { type: 'timestamp', nullable: true },
    embedding: { type: 'text', nullable: true },
    created_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['notification_id'], ['user_id']],
  })

  // ---- 作业 ----
  ctx.model.extend('assignment', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    /** 来源平台：smartestu | chaoxing */
    source: { type: 'string', length: 20 },
    /** 第三方作业 ID（去重用） */
    remote_id: { type: 'string', length: 100 },
    title: { type: 'string', length: 200 },
    course_name: { type: 'string', length: 100, initial: '' },
    description: { type: 'text', initial: '' },
    due_time: { type: 'timestamp', nullable: true },
    is_completed: { type: 'boolean', initial: false },
    created_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id'], ['user_id', 'remote_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- 统一任务 ----
  ctx.model.extend('task', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    source: { type: 'string', length: 20 },
    source_type: { type: 'string', length: 30 },
    source_id: { type: 'string', length: 100, nullable: true },
    title: { type: 'string', length: 200 },
    description: { type: 'text', initial: '' },
    course_id: { type: 'unsigned', nullable: true },
    course_name: { type: 'string', length: 100, initial: '' },
    due_at: { type: 'timestamp', nullable: true },
    estimated_minutes: { type: 'unsigned', nullable: true },
    priority: { type: 'unsigned', initial: 3 },
    status: { type: 'string', length: 20, initial: 'pending' },
    user_modified: { type: 'boolean', initial: false },
    estimate_source: { type: 'string', length: 20, initial: 'user' },
    created_at: { type: 'timestamp', nullable: true },
    updated_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id'], ['user_id', 'source', 'source_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- 学习计划 ----
  ctx.model.extend('study_plan', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    title: { type: 'string', length: 200 },
    status: { type: 'string', length: 20, initial: 'draft' },
    source: { type: 'string', length: 20, initial: 'ai' },
    version: { type: 'unsigned', initial: 1 },
    based_on_plan_id: { type: 'unsigned', nullable: true },
    created_at: { type: 'timestamp', nullable: true },
    confirmed_at: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id'], ['based_on_plan_id']],
    foreign: { user_id: ['user', 'id'] },
  })

  // ---- 学习时段 ----
  ctx.model.extend('study_session', {
    id: 'unsigned',
    plan_id: { type: 'unsigned' },
    task_id: { type: 'unsigned' },
    start_at: 'timestamp',
    end_at: 'timestamp',
    status: { type: 'string', length: 20, initial: 'proposed' },
    created_by: { type: 'string', length: 20, initial: 'ai' },
    note: { type: 'string', length: 500, initial: '' },
    locked: { type: 'boolean', initial: false },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['plan_id'], ['task_id']],
  })

  // ---- 日程事件 ----
  ctx.model.extend('schedule_event', {
    id: 'unsigned',
    user_id: { type: 'unsigned' },
    event_type: { type: 'string', length: 20 },
    title: { type: 'string', length: 200 },
    task_id: { type: 'unsigned', nullable: true },
    session_id: { type: 'unsigned', nullable: true },
    start_at: 'timestamp',
    end_at: 'timestamp',
    is_fixed: { type: 'boolean', initial: false },
    source: { type: 'string', length: 20, initial: 'user' },
    status: { type: 'string', length: 20, initial: 'active' },
  }, {
    autoInc: true,
    primary: 'id',
    indexes: [['user_id'], ['session_id'], ['task_id']],
    foreign: { user_id: ['user', 'id'] },
  })
}

apply.inject = ['model', 'database']
