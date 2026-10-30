import type { AgentSkill } from './types'
import { collectPlan } from './planning'
export const dailySchedule: AgentSkill = {
  name: 'daily_schedule', label: '单日安排',
  description: '规划指定日期的课程和任务，综合该日截止、逾期任务与无截止日期待办。',
  instructions: '优先处理目标日期前的紧急事项，结合用户精力和时段偏好，在目标日期可用时间块中安排学习；已逾期事项应先核实补交。',
  execute: (context) => collectPlan('daily', context),
}
