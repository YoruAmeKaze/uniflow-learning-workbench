<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { planAPI, taskAPI } from '../api'

const tasks = ref<any[]>([])
const preview = ref<any | null>(null)
const plans = ref<any[]>([])
const selected = ref<number[]>([])
const loading = ref(false)
const notice = ref('')

async function load() { tasks.value = (await taskAPI.list({ status: 'pending' })).data.items; plans.value = (await planAPI.list()).data.items }
async function makePreview() { loading.value = true; notice.value = ''; try { preview.value = (await planAPI.preview({ task_ids: selected.value, days: 7 })).data } catch (error: any) { notice.value = error.response?.data?.message || '生成失败' } finally { loading.value = false } }
async function saveAndConfirm() { if (!preview.value) return; loading.value = true; try { const created = (await planAPI.create(preview.value)).data; await planAPI.confirm(created.id); notice.value = '计划已确认，学习时段已进入日程'; preview.value = null; await load() } catch (error: any) { notice.value = error.response?.data?.message || '保存失败' } finally { loading.value = false } }
onMounted(load)
</script>

<template>
  <div class="page plan-page">
    <header class="page-header"><div><p class="eyebrow">AI 学习规划</p><h1>把任务变成可执行安排</h1><p class="muted">AI 负责理解和排序，服务端负责时间冲突与截止时间校验。</p></div><button class="btn btn-primary" :disabled="loading" @click="makePreview"><AppIcon name="zap" :size="16" />{{ loading ? '生成中…' : '生成候选计划' }}</button></header>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <div class="plan-grid"><section class="card-surface task-picker"><div class="panel-head"><h2>选择任务</h2><span class="muted">{{ selected.length ? `已选 ${selected.length} 项` : '默认安排全部待完成任务' }}</span></div><label v-for="task in tasks" :key="task.id" class="pick-row"><input v-model="selected" type="checkbox" :value="task.id" /><span><strong>{{ task.title }}</strong><small>{{ task.due_at ? new Date(task.due_at).toLocaleString('zh-CN') : '无截止时间' }} · {{ task.estimated_minutes || 60 }} 分钟</small></span></label><div v-if="!tasks.length" class="empty-state">暂无待完成任务</div></section><section class="card-surface preview"><div class="panel-head"><h2>候选计划</h2><span v-if="preview" class="status">{{ preview.sessions.length }} 个学习时段</span></div><div v-if="!preview" class="empty-state"><AppIcon class="empty-icon" name="calendar" :size="28" /><p class="empty-title">等待生成计划</p><p class="empty-desc">选择任务后生成未来 7 天的候选安排。</p></div><template v-else><div v-for="session in preview.sessions" :key="`${session.task_id}-${session.start_at}`" class="session-row"><span class="session-time">{{ new Date(session.start_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span><span class="session-title">{{ tasks.find(t => t.id === session.task_id)?.title || `任务 #${session.task_id}` }}</span><span class="session-duration">{{ Math.round((new Date(session.end_at).getTime() - new Date(session.start_at).getTime()) / 60000) }} 分钟</span></div><div v-if="preview.infeasible?.length" class="warning">有 {{ preview.infeasible.length }} 项任务暂时无法安排，请调整截止时间或可用时间。</div><button class="btn btn-primary confirm-btn" :disabled="loading || !preview.sessions.length" @click="saveAndConfirm"><AppIcon name="check" :size="16" />确认并加入日程</button></template></section></div>
    <section v-if="plans.length" class="history"><h2>近期计划</h2><div v-for="plan in plans.slice(0,5)" :key="plan.id" class="history-row"><span>{{ plan.title }}</span><span class="muted">版本 {{ plan.version }} · {{ plan.status }}</span></div></section>
  </div>
</template>

<style scoped>
.page{max-width:1000px;margin:0 auto;padding:var(--space-6) var(--space-4)}.page-header{align-items:flex-start}.eyebrow{font-size:12px;color:var(--brand);font-weight:700;margin-bottom:4px}.page-header h1{font-size:28px}.muted{color:var(--text-tertiary);font-size:13px}.notice{margin:16px 0;padding:10px 12px;border-radius:8px;background:var(--brand-soft);color:var(--brand);font-size:13px}.plan-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;margin-top:24px}.task-picker,.preview{padding:16px;min-height:360px}.panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.panel-head h2,.history h2{font-size:16px}.pick-row{display:flex;gap:10px;padding:12px 4px;border-bottom:1px solid var(--border);cursor:pointer}.pick-row input{accent-color:var(--brand);margin-top:3px}.pick-row span{display:flex;flex-direction:column;gap:3px}.pick-row strong{font-size:14px}.pick-row small{font-size:12px;color:var(--text-tertiary)}.status{color:var(--success);font-size:12px}.session-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--border);font-size:13px}.session-time{width:116px;color:var(--brand);font-variant-numeric:tabular-nums}.session-title{flex:1;font-weight:550}.session-duration{color:var(--text-tertiary);font-size:12px}.warning{margin-top:14px;color:var(--warning);font-size:12px}.confirm-btn{margin-top:18px;width:100%}.history{margin-top:24px}.history h2{margin-bottom:10px}.history-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);font-size:14px}@media(max-width:720px){.plan-grid{grid-template-columns:1fr}.page-header{gap:12px}.page-header .btn{white-space:nowrap}.session-time{width:100px;font-size:12px}}
</style>
