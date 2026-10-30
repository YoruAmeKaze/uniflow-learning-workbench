<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { todoAPI } from "../api";
import { priorityMeta, dueStatus } from "../utils/format";

interface Todo {
  id: number;
  title: string;
  description: string;
  course_name: string;
  priority: number;
  due_date: string | null;
  is_completed: boolean;
}

const items = ref<Todo[]>([]);
const loading = ref(true);
const filter = ref("pending");
const expanded = ref(new Set<number>());
const editingId = ref<number | null>(null);
const editForm = ref({ title: "", description: "", due_date: "" });

async function load() {
  loading.value = true;
  try {
    const res = await todoAPI.list(filter.value);
    items.value = res.data.items;
  } finally {
    loading.value = false;
  }
}

async function toggleDone(t: Todo) {
  await todoAPI.update(t.id, { is_completed: !t.is_completed });
  t.is_completed = !t.is_completed;
}

async function remove(id: number) {
  if (!confirm("确定删除这条待办吗？")) return;
  await todoAPI.delete(id);
  items.value = items.value.filter((i) => i.id !== id);
}

function toggleExpand(id: number) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function startEdit(t: Todo) {
  editingId.value = t.id;
  // due_date 格式化为 datetime-local 能识别的 YYYY-MM-DDTHH:mm
  const dueDateVal = t.due_date
    ? t.due_date.slice(0, 16)
    : "";
  editForm.value = { title: t.title, description: t.description, due_date: dueDateVal };
}

async function saveEdit(t: Todo) {
  const patch: Record<string, unknown> = {
    title: editForm.value.title,
    description: editForm.value.description,
  };
  if (editForm.value.due_date) {
    patch.due_date = editForm.value.due_date;
  } else {
    patch.due_date = null;
  }
  await todoAPI.update(t.id, patch);
  t.title = editForm.value.title;
  t.description = editForm.value.description;
  t.due_date = editForm.value.due_date ? editForm.value.due_date + ":00" : null;
  editingId.value = null;
}

function cancelEdit() {
  editingId.value = null;
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h2>待办事项</h2>
      <div class="filters" role="tablist" aria-label="筛选待办">
        <button
          v-for="f in [{ key: 'pending', label: '待完成' }, { key: 'completed', label: '已完成' }, { key: '', label: '全部' }]"
          :key="f.key"
          class="filter-btn"
          :class="{ active: filter === f.key }"
          role="tab"
          :aria-selected="filter === f.key"
          @click="filter = f.key; load()"
        >{{ f.label }}</button>
      </div>
    </header>

    <!-- 加载骨架 -->
    <div v-if="loading" class="list" aria-busy="true">
      <div v-for="i in 4" :key="i" class="item card-surface skeleton" style="height: 64px" />
    </div>

    <!-- 空状态 -->
    <div v-else-if="!items.length" class="empty-state card-surface">
      <span class="empty-icon"><AppIcon name="check" :size="30" /></span>
      <div class="empty-title">{{ filter === "completed" ? "还没有已完成的待办" : "暂无待办事项" }}</div>
      <p class="empty-desc">{{ filter === "completed" ? "完成一条待办后会出现在这里" : "去 AI 助手说一句「帮我记个作业」试试" }}</p>
      <router-link class="empty-action" to="/chat">去 AI 助手</router-link>
    </div>

    <div v-else class="list">
      <div
        v-for="t in items"
        :key="t.id"
        class="item card-surface"
        :class="{ done: t.is_completed, 'is-expanded': expanded.has(t.id) }"
      >
        <div class="item-main">
          <input
            type="checkbox"
            :checked="t.is_completed"
            class="check"
            :aria-label="`标记「${t.title}」为${t.is_completed ? '未完成' : '已完成'}`"
            @change="toggleDone(t)"
          />

          <!-- 编辑模式 -->
          <div v-if="editingId === t.id" class="edit-form">
            <input v-model="editForm.title" class="edit-title-input" @keydown.enter="saveEdit(t)" @keydown.escape="cancelEdit" placeholder="待办标题" />
            <input type="datetime-local" v-model="editForm.due_date" class="edit-date-input" />
            <textarea v-model="editForm.description" class="edit-desc-input" placeholder="添加详细描述…" rows="3" />
            <div class="edit-actions">
              <button class="btn-save" @click="saveEdit(t)">保存</button>
              <button class="btn-cancel-edit" @click="cancelEdit">取消</button>
            </div>
          </div>

          <!-- 普通模式 -->
          <template v-else>
            <div class="body">
              <div class="title-row">
                <span class="title">{{ t.title }}</span>
                <span v-if="!t.is_completed" class="badge" :class="priorityMeta(t.priority).level">
                  {{ priorityMeta(t.priority).label }}
                </span>
              </div>
              <div class="meta">
                <span v-if="t.course_name" class="course">{{ t.course_name }}</span>
                <span v-if="!t.is_completed" class="due" :class="dueStatus(t.due_date).level">
                  {{ dueStatus(t.due_date).label }}
                </span>
                <span v-else class="due ok">已完成</span>
              </div>
            </div>

            <!-- 操作按钮组 -->
            <div class="actions">
              <button
                v-if="t.description"
                class="btn-expand"
                :aria-label="expanded.has(t.id) ? '收起详情' : '展开详情'"
                @click="toggleExpand(t.id)"
              >
                <span class="chevron" :class="{ rotated: expanded.has(t.id) }">
                  <AppIcon name="chevron-down" :size="14" />
                </span>
              </button>
              <button class="btn-edit" :aria-label="`编辑「${t.title}」`" @click="startEdit(t)">
                <AppIcon name="edit" :size="14" />
              </button>
              <button class="del" :aria-label="`删除「${t.title}」`" @click="remove(t.id)">✕</button>
            </div>
          </template>
        </div>

        <!-- 展开的详情 -->
        <Transition name="slide">
          <div v-if="expanded.has(t.id) && t.description && editingId !== t.id" class="detail">
            {{ t.description }}
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 680px; margin: 0 auto; padding: var(--space-4); }
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-3);
}
.page-header h2 { font-size: 20px; font-weight: 700; }
.filters { display: flex; gap: var(--space-1); background: var(--surface-2); padding: 3px; border-radius: 999px; }
.filter-btn {
  padding: var(--space-1) var(--space-3); border: none; border-radius: 999px;
  background: transparent; color: var(--text-secondary); font-size: 13px;
  font-family: inherit; cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.filter-btn.active { background: var(--surface); color: var(--brand); font-weight: 600; box-shadow: var(--shadow-card); }

.list { display: flex; flex-direction: column; gap: var(--space-2); }
.item {
  display: flex; flex-direction: column;
  padding: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.item.done { opacity: 0.55; }
.item-main {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.check {
  width: 20px; height: 20px; accent-color: var(--brand); flex-shrink: 0; cursor: pointer;
}
.body { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: var(--space-2); }
.title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.done .title { text-decoration: line-through; }
.badge {
  flex-shrink: 0; font-size: 11px; padding: 1px var(--space-2); border-radius: 999px; font-weight: 600;
}
.badge.high { background: var(--danger-soft); color: var(--danger); }
.badge.mid { background: var(--warning-soft); color: var(--warning); }
.badge.low { background: var(--surface-2); color: var(--text-tertiary); }
.meta { display: flex; align-items: center; gap: var(--space-2); margin-top: 2px; font-size: 12px; }
.course { color: var(--text-secondary); }
.due { font-weight: 500; }
.due.overdue { color: var(--danger); }
.due.today { color: var(--warning); font-weight: 600; }
.due.soon { color: var(--warning); }
.due.ok { color: var(--text-tertiary); }

.actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.btn-expand {
  background: none; border: none; cursor: pointer; color: var(--text-tertiary);
  padding: 4px; border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.btn-expand:hover { color: var(--text); background: var(--surface-2); }
.chevron { display: flex; transition: transform var(--duration-fast) var(--ease-out); }
.chevron.rotated { transform: rotate(180deg); }

.btn-edit {
  background: none; border: none; cursor: pointer; color: var(--text-tertiary);
  padding: 4px; border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.btn-edit:hover { color: var(--brand); background: var(--brand-soft); }

.del {
  background: none; border: none; color: var(--text-tertiary); cursor: pointer;
  font-size: 14px; padding: 4px; border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.del:hover { color: var(--danger); background: var(--danger-soft); }

/* 详情展开 */
.detail {
  padding: var(--space-2) var(--space-4) var(--space-3) calc(20px + var(--space-3) + var(--space-4));
  font-size: 13px; color: var(--text-secondary);
  border-top: 1px solid var(--border); margin-top: 0;
  line-height: 1.6; white-space: pre-wrap;
}
.slide-enter-active, .slide-leave-active {
  transition: all var(--duration-fast) var(--ease-out);
  overflow: hidden;
}
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.slide-enter-to, .slide-leave-from { opacity: 1; max-height: 200px; }

/* 编辑表单 */
.edit-form { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.edit-title-input {
  width: 100%; padding: 6px 10px; border: 1.5px solid var(--brand); border-radius: var(--radius-md);
  font-size: 14px; font-family: inherit; background: var(--surface-2); color: var(--text);
  box-sizing: border-box;
}
.edit-title-input:focus { outline: none; }
.edit-date-input {
  width: 100%; padding: 6px 10px; border: 1.5px solid var(--border); border-radius: var(--radius-md);
  font-size: 14px; font-family: inherit; background: var(--surface-2); color: var(--text);
  box-sizing: border-box;
}
.edit-date-input:focus { outline: none; border-color: var(--brand); }
.edit-desc-input {
  width: 100%; padding: 6px 10px; border: 1.5px solid var(--border); border-radius: var(--radius-md);
  font-size: 13px; font-family: inherit; background: var(--surface-2); color: var(--text);
  resize: vertical; line-height: 1.5; box-sizing: border-box;
}
.edit-desc-input:focus { outline: none; border-color: var(--brand); }
.edit-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.btn-save {
  padding: 5px 14px; border-radius: 999px; border: none;
  background: var(--brand); color: #fff; font-size: 13px; font-family: inherit; cursor: pointer;
}
.btn-cancel-edit {
  padding: 5px 14px; border-radius: 999px; border: none;
  background: var(--surface-2); color: var(--text-secondary); font-size: 13px; font-family: inherit; cursor: pointer;
}

.empty-state { text-align: center; padding: 48px var(--space-4); }
.empty-icon {
  width: 56px; height: 56px; margin: 0 auto var(--space-3);
  display: flex; align-items: center; justify-content: center;
  background: var(--success-soft); color: var(--success); border-radius: var(--radius-lg);
}
.empty-title { font-size: 15px; font-weight: 600; margin-bottom: var(--space-2); }
.empty-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-4); }
.empty-action {
  display: inline-block; padding: 8px 24px; border-radius: 999px; border: 1.5px solid var(--brand);
  background: transparent; color: var(--brand); font-size: 14px; font-weight: 600; font-family: inherit;
  cursor: pointer; text-decoration: none;
}
</style>
