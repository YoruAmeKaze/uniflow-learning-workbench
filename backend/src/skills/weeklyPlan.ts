import type { AgentSkill } from './types'
import { collectPlan } from './planning'
export const weeklyPlan: AgentSkill = {
  name: 'weekly_plan', label: '本周计划',
  description: '规划本自然周剩余时间（截至周日），汇总课程与本周截止事项。',
  instructions: '在本周剩余日期中分散安排任务，优先保证临近截止事项，结合用户偏好选择时段，不安排在截止之后。',
  execute: (context) => collectPlan('weekly', context),
}
