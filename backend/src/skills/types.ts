import type { Tool } from '../tools'

export type SkillName = 'daily_schedule' | 'weekly_plan' | 'deadline_priority'
export type Scope = 'daily' | 'weekly' | 'deadline'
export interface SkillContext { tools: Tool[]; userId: number; now: Date; semesterStart: string; targetDate?: Date }
export interface SkillStep {
  tool: string
  label: string
  status: 'success' | 'failed'
  count: number
  durationMs: number
}
export interface PlanTask {
  id: string
  title: string
  course: string
  kind: '作业' | '待办'
  due: string | null
  priority: number
  overdue: boolean
}
export interface PlanCourse { title: string; start: string; end: string; location: string }
export interface PlanSlot { id: string; start: string; end: string }
export interface SkillResult {
  scope: Scope
  title: string
  now: string
  end: string
  tasks: PlanTask[]
  upcomingAssignments: PlanTask[]
  courses: PlanCourse[]
  slots: PlanSlot[]
  steps: SkillStep[]
  warnings: string[]
  omitted: number
}
export interface AgentSkill {
  name: SkillName
  label: string
  description: string
  instructions: string
  execute(context: SkillContext): Promise<SkillResult>
}
export interface PlanProposal { order: string[]; sessions: { taskId: string; slotId: string }[] }
export interface PlanTrace {
  skill: SkillName
  label: string
  routing: 'rule' | 'model' | 'fallback'
  generation: 'model' | 'fallback'
  steps: SkillStep[]
}
