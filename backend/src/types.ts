/**
 * 数据行类型 + Tables 声明合并
 * 字段名与 MySQL 现有表结构一致（snake_case）
 */

declare module '@cordisjs/plugin-database' {
  interface Tables {
    user: User
    course: Course
    todo: Todo
    notification: Notification
    knowledge_chunk: KnowledgeChunk
    task: Task
    study_plan: StudyPlan
    study_session: StudySession
    schedule_event: ScheduleEvent
  }
}

/** 用户 */
export interface User {
  id: number
  student_id: string
  username: string
  email: string
  phone: string
  hashed_password: string
  avatar: string
  college: string
  major: string
  grade: string
  is_active: boolean
  is_admin: boolean
  /** 可空列：运行期可能为 null */
  created_at: Date | null
  updated_at: Date | null
}

/** 课程 */
export interface Course {
  id: number
  user_id: number
  name: string
  teacher: string
  classroom: string
  /** 星期几: 1-7 */
  weekday: number
  start_week: number
  end_week: number
  /** e.g. 08:00 */
  start_time: string
  /** e.g. 09:40 */
  end_time: string
  location: string
  credit: number
  created_at: Date | null
}

/** 待办 */
export interface Todo {
  id: number
  user_id: number
  title: string
  description: string
  course_name: string
  /** 优先级: 1-5 */
  priority: number
  due_date: Date | null
  is_completed: boolean
  is_reminded: boolean
  created_at: Date | null
  updated_at: Date | null
}

/** 通知 */
export interface Notification {
  id: number
  user_id: number
  title: string
  content: string
  /** school/college/competition/general */
  category: string
  source: string
  source_url: string
  is_read: boolean
  published_at: Date | null
  summary: string | null
  is_important: boolean
  /** RAG 向量（JSON 数组字符串），可为 null */
  embedding: string | null
  created_at: Date | null
}

/** RAG 知识片段 */
export interface KnowledgeChunk {
  id: number
  notification_id: number
  user_id: number
  chunk_index: number
  content: string
  title: string
  category: string
  source: string
  source_url: string
  published_at: Date | null
  embedding: string | null
  created_at: Date | null
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface Task {
  id: number
  user_id: number
  source: string
  source_type: string
  source_id: string | null
  title: string
  description: string
  course_id: number | null
  course_name: string
  due_at: Date | null
  estimated_minutes: number | null
  priority: number
  status: TaskStatus
  user_modified: boolean
  estimate_source: string
  created_at: Date | null
  updated_at: Date | null
}

export interface StudyPlan {
  id: number
  user_id: number
  title: string
  status: 'draft' | 'proposed' | 'confirmed' | 'cancelled' | 'completed'
  source: string
  version: number
  based_on_plan_id: number | null
  created_at: Date | null
  confirmed_at: Date | null
}

export interface StudySession {
  id: number
  plan_id: number
  task_id: number
  start_at: Date
  end_at: Date
  status: string
  created_by: string
  note: string
  locked: boolean
}

export interface ScheduleEvent {
  id: number
  user_id: number
  event_type: string
  title: string
  task_id: number | null
  session_id: number | null
  start_at: Date
  end_at: Date
  is_fixed: boolean
  source: string
  status: string
}

/** 对外 API 的用户信息（不含密码哈希） */
export interface UserProfile {
  id: number
  student_id: string
  username: string
  email: string
  college: string
  major: string
  grade: string
  avatar: string
}

/** JWT 载荷 */
export interface TokenPayload {
  uid: number
}
