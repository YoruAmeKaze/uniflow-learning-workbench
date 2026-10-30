<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { taskAPI } from '../api'

const tasks = ref<any[]>([])
const loading = ref(true)
const filter = ref('')
const draft = ref({ title: '', description: '', course_name: '', due_at: '', estimated_minutes: 60, priority: 3 })
const message = ref('')

async function load() {
  loading.value = true
  try { tasks.value = (await taskAPI.list(filter.value ? { status: filter.value } : undefined)).data.items } finally { loading.value = false }
}
async function create() {
  if (!draft.value.title.trim()) return
  await taskAPI.create(draft.value)
  draft.value = { title: '', description: '', course_name: '', due_at: '', estimated_minutes: 60, priority: 3 }
  message.value = '任务已创建'
  await load()
}
async function complete(task: any) { await taskAPI.complete(task.id); await load() }
onMounted(load)
</script>

<template>
  <div class="page task-page">
    <header class="page-header"><div><p class="eyebrow">学习工作台</p><h1>全部任务</h1><p class="muted">课程作业、手动事项和导入任务集中管理。</p></div><router-link class="btn btn-primary" to="/plans"><AppIcon name="zap" :size="16" />生成计划</router-link></header>
    <section class="card-surface create-box">
      <div class="section-title"><h2>快速添加</h2><span v-if="message" class="success-text">{{ message }}</span></div>
      <div class="form-grid"><input v-model="draft.title" placeholder="任务名称" @keyup.enter="create" /><input v-model="draft.course_name" placeholder="课程（可选）" /><input v-model="draft.due_at" type="datetime-local" /><input v-model.number="draft.estimated_minutes" type="number" min="15" step="15" placeholder="预计分钟" /><select v-model.number="draft.priority"><option :value="1">优先级 1</option><option :value="3">优先级 3</option><option :value="5">优先级 5</option></select><button class="btn btn-primary" @click="create"><AppIcon name="inbox" :size="16" />添加任务</button></div>
    </section>
    <div class="toolbar"><div class="tabs"><button class="tab-btn" :class="{ active: !filter }" @click="filter = ''; load()">全部</button><button class="tab-btn" :class="{ active: filter === 'pending' }" @click="filter = 'pending'; load()">待完成</button><button class="tab-btn" :class="{ active: filter === 'completed' }" @click="filter = 'completed'; load()">已完成</button></div><span class="muted">{{ tasks.length }} 项</span></div>
    <section class="card-surface task-list"><div v-if="loading" class="empty-state">正在加载任务…</div><div v-else-if="!tasks.length" class="empty-state"><AppIcon class="empty-icon" name="check" :size="28" /><p class="empty-title">暂无任务</p><p class="empty-desc">添加第一个学习事项，开始安排你的时间。</p></div><div v-else v-for="task in tasks" :key="task.id" class="task-row"><button v-if="task.status !== 'completed'" class="check-btn" title="完成任务" @click="complete(task)"><AppIcon name="check" :size="15" /></button><span v-else class="check-btn done"><AppIcon name="check" :size="15" /></span><div class="task-main"><strong :class="{ doneText: task.status === 'completed' }">{{ task.title }}</strong><span class="task-meta">{{ task.source_type }} · {{ task.course_name || '未归类' }} · {{ task.estimated_minutes || '—' }} 分钟</span></div><time v-if="task.due_at" class="due">{{ new Date(task.due_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</time><span class="priority">P{{ task.priority }}</span></div></section>
  </div>
</template>

<style scoped>
.page{max-width:1000px;margin:0 auto;padding:var(--space-6) var(--space-4)}.eyebrow{font-size:12px;color:var(--brand);font-weight:700;margin-bottom:4px}.page-header h1{font-size:28px}.muted{color:var(--text-tertiary);font-size:13px}.create-box{padding:var(--space-4);margin:var(--space-5) 0}.section-title,.toolbar{display:flex;align-items:center;justify-content:space-between}.section-title h2{font-size:15px}.success-text{color:var(--success);font-size:13px}.form-grid{display:grid;grid-template-columns:2fr 1.2fr 1.5fr 1fr .8fr auto;gap:8px;margin-top:12px}input,select{min-width:0;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;padding:9px 10px;font:inherit;font-size:13px}.toolbar{margin-bottom:10px}.tabs{display:flex;gap:4px}.tab-btn{border:0;background:transparent;color:var(--text-secondary);padding:7px 12px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px}.tab-btn.active{background:var(--brand-soft);color:var(--brand);font-weight:600}.task-list{overflow:hidden}.task-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)}.task-row:last-child{border-bottom:0}.check-btn{width:25px;height:25px;border:1px solid var(--border-strong);background:transparent;border-radius:7px;color:var(--success);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}.check-btn.done{background:var(--success-soft);border-color:transparent}.task-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}.task-main strong{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.doneText{text-decoration:line-through;color:var(--text-tertiary)}.task-meta{font-size:12px;color:var(--text-tertiary)}.due{font-size:12px;color:var(--warning);white-space:nowrap}.priority{font-size:11px;color:var(--text-tertiary);border:1px solid var(--border);border-radius:5px;padding:2px 5px}@media(max-width:800px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .btn{grid-column:span 2}.page-header{align-items:flex-start;gap:12px}.page-header .btn{white-space:nowrap}}@media(max-width:520px){.form-grid{grid-template-columns:1fr}.form-grid .btn{grid-column:auto}.task-row{padding:12px}.due{display:none}}
</style>
