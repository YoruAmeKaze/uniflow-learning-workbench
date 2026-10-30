import { dailySchedule } from './dailySchedule'
import { weeklyPlan } from './weeklyPlan'
import { deadlinePriority } from './deadlinePriority'
import type { AgentSkill, SkillName } from './types'

/** Server-owned allowlist. Model output cannot load files or register executable code. */
export class SkillRegistry {
  private readonly skills = new Map<SkillName, AgentSkill>()
  constructor(skills: AgentSkill[]) {
    for (const skill of skills) {
      if (this.skills.has(skill.name)) throw new Error(`重复 Skill: ${skill.name}`)
      this.skills.set(skill.name, skill)
    }
  }
  list(): AgentSkill[] { return [...this.skills.values()] }
  get(name: unknown): AgentSkill | undefined { return typeof name === 'string' ? this.skills.get(name as SkillName) : undefined }
}
export const skillRegistry = new SkillRegistry([dailySchedule, weeklyPlan, deadlinePriority])
