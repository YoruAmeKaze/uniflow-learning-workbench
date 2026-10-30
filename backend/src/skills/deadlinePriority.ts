import type { AgentSkill } from './types'
import { collectPlan } from './planning'
export const deadlinePriority: AgentSkill = {
  name: 'deadline_priority', label: '任务优先级',
  description: '只查询临近截止的作业和待办，按截止时间和优先级组织行动顺序。',
  instructions: '解释顺序通过实际排序体现：逾期需先核实，紧急截止优先，同样紧急时优先高优先级；无截止时间的事项不能丢失。',
  execute: (context) => collectPlan('deadline', context),
}
