<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { assignmentAPI } from "../api";
import { dueStatus } from "../utils/format";

interface Assignment {
  id: number
  source: "smartestu" | "chaoxing"
  title: string
  course_name: string
  description: string
  due_time: string | null
  is_completed: boolean
  created_at: string | null
}

const LS_KEY_SID = "hw_sid";
const LS_KEY_SPWD = "hw_spwd";
const LS_KEY_CXUSER = "hw_cxuser";
const LS_KEY_CXPWD = "hw_cxpwd";

// 账号表单
const credForm = ref({
  smartestu_id: "",
  smartestu_password: "",
  chaoxing_username: "",
  chaoxing_password: "",
});
const showCredModal = ref(false);
const credError = ref("");
const credSaving = ref(false);

// 刷新状态
const refreshing = ref(false);
const lmsRefreshing = ref(false);
const refreshError = ref("");
const clearing = ref(false);

// 作业列表
const items = ref<Assignment[]>([]);
const loading = ref(true);
const filter = ref(""); // "" | "smartestu" | "chaoxing"

const hasCredentials = computed(() =>
  !!(credForm.value.smartestu_id && credForm.value.smartestu_password) ||
  !!(credForm.value.chaoxing_username && credForm.value.chaoxing_password),
);

onMounted(() => {
  credForm.value.smartestu_id = localStorage.getItem(LS_KEY_SID) ?? "";
  credForm.value.smartestu_password = localStorage.getItem(LS_KEY_SPWD) ?? "";
  credForm.value.chaoxing_username = localStorage.getItem(LS_KEY_CXUSER) ?? "";
  credForm.value.chaoxing_password = localStorage.getItem(LS_KEY_CXPWD) ?? "";
  load();
});

async function load() {
  loading.value = true;
  try {
    const res = await assignmentAPI.list(filter.value || undefined);
    items.value = res.data;
  } finally {
    loading.value = false;
  }
}

/** 保存账号信息（不改作业） */
async function saveCred() {
  const hasS = credForm.value.smartestu_id && credForm.value.smartestu_password;
  const hasC = credForm.value.chaoxing_username && credForm.value.chaoxing_password;
  if (!hasS && !hasC) {
    credError.value = "请至少填写一个平台的完整账号和密码";
    return;
  }
  credSaving.value = true;
  credError.value = "";
  try {
    localStorage.setItem(LS_KEY_SID, credForm.value.smartestu_id);
    localStorage.setItem(LS_KEY_SPWD, credForm.value.smartestu_password);
    localStorage.setItem(LS_KEY_CXUSER, credForm.value.chaoxing_username);
    localStorage.setItem(LS_KEY_CXPWD, credForm.value.chaoxing_password);
    showCredModal.value = false;
  } finally {
    credSaving.value = false;
  }
}

/** 刷新作业（需要已有账号） */
async function doRefresh() {
  if (!hasCredentials.value) {
    refreshError.value = "请先配置至少一个平台的账号信息";
    return;
  }
  refreshing.value = true;
  refreshError.value = "";
  try {
    await assignmentAPI.refresh({
      smartestu_id: credForm.value.smartestu_id || undefined,
      smartestu_password: credForm.value.smartestu_password || undefined,
      chaoxing_username: credForm.value.chaoxing_username || undefined,
      chaoxing_password: credForm.value.chaoxing_password || undefined,
    });
    await load();
  } catch (e: any) {
    refreshError.value = e?.response?.data?.error ?? "刷新失败，请检查账号密码";
  } finally {
    refreshing.value = false;
  }
}

async function refreshLms() {
  lmsRefreshing.value = true;
  refreshError.value = "";
  try {
    const response = await assignmentAPI.refreshLms();
    await load();
    if (response.data?.imported) {
      refreshError.value = `学校 LMS 已导入 ${response.data.imported} 条作业`;
    }
  } catch (e: any) {
    refreshError.value = e?.response?.status === 404
      ? "学校 LMS 接口未加载，请重启后端后再试"
      : e?.response?.data?.error ?? e?.message ?? "学校 LMS 刷新失败";
  } finally {
    lmsRefreshing.value = false;
  }
}

async function remove(id: number) {
  await assignmentAPI.delete(id);
  items.value = items.value.filter((i) => i.id !== id);
}

async function clearAll() {
  if (clearing.value || !items.value.length) return;
  clearing.value = true;
  try {
    await assignmentAPI.clear();
    items.value = [];
  } catch (e: any) {
    refreshError.value = e?.response?.data?.error ?? "清空作业失败";
  } finally {
    clearing.value = false;
  }
}

function sourceLabel(s: string) {
  if (s === "smartestu") return "数你最灵";
  if (s === "cqupt-lms") return "学校 LMS";
  return "学习通";
}
function sourceColor(s: string) {
  return s === "smartestu" ? "var(--brand)" : s === "cqupt-lms" ? "var(--success)" : "var(--warning)";
}
function sourceBg(s: string) {
  return s === "smartestu" ? "var(--brand-soft)" : s === "cqupt-lms" ? "var(--success-soft)" : "var(--warning-soft)";
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h2>作业</h2>
      <div class="header-actions">
        <button
          v-if="hasCredentials"
          class="btn-refresh"
          :disabled="refreshing"
          @click="doRefresh"
        >
          <AppIcon name="refresh-cw" :size="14" />
          {{ refreshing ? "刷新中…" : "刷新" }}
        </button>
        <button
          class="btn-lms"
          :disabled="lmsRefreshing"
          title="打开浏览器完成统一认证并同步学校 LMS 作业"
          @click="refreshLms"
        >
          <AppIcon name="graduation" :size="14" />
          {{ lmsRefreshing ? "等待登录…" : "学校 LMS" }}
        </button>
        <button
          v-if="hasCredentials"
          class="btn-clear"
          :disabled="clearing || !items.length"
          title="删除全部作业"
          aria-label="删除全部作业"
          @click="clearAll"
        >
          <AppIcon name="trash" :size="14" />
          {{ clearing ? "删除中…" : "清空" }}
        </button>
        <button class="btn-config" @click="showCredModal = true">
          <AppIcon name="user" :size="14" />
          {{ hasCredentials ? "修改信息" : "配置账号" }}
        </button>
      </div>
    </header>

    <!-- 刷新失败提示 -->
    <div v-if="refreshError" class="error-banner">
      <span>{{ refreshError }}</span>
      <button class="error-close" @click="refreshError = ''">✕</button>
    </div>

    <div class="filters" role="tablist" aria-label="筛选来源">
      <button
        v-for="f in [{ key: '', label: '全部' }, { key: 'smartestu', label: '数你最灵' }, { key: 'chaoxing', label: '学习通' }]"
        :key="f.key"
        class="filter-btn"
        :class="{ active: filter === f.key }"
        role="tab"
        :aria-selected="filter === f.key"
        @click="filter = f.key; load()"
      >{{ f.label }}</button>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="list" aria-busy="true">
      <div v-for="i in 4" :key="i" class="item card-surface skeleton" style="height: 72px" />
    </div>

    <!-- 状态一：没有记录且未配置账号 -->
    <div v-else-if="!items.length && !hasCredentials" class="empty-state card-surface">
      <span class="empty-icon" style="background: var(--warning-soft); color: var(--warning)">
        <AppIcon name="user" :size="30" />
      </span>
      <div class="empty-title">还未配置作业平台账号</div>
      <p class="empty-desc">点击右上角「配置账号」填写数你最灵学号和密码，保存后可一键刷新作业</p>
      <button class="empty-action" @click="showCredModal = true">去配置账号</button>
    </div>

    <!-- 状态二：没有记录但已有账号 -->
    <div v-else-if="!items.length" class="empty-state card-surface">
      <span class="empty-icon" style="background: var(--brand-soft); color: var(--brand)">
        <AppIcon name="book-open" :size="30" />
      </span>
      <div class="empty-title">暂无作业记录</div>
      <p class="empty-desc">账号已配置，点击刷新拉取作业</p>
      <button class="empty-action" @click="doRefresh" :disabled="refreshing">
        <AppIcon name="refresh-cw" :size="14" />
        {{ refreshing ? "刷新中…" : "刷新作业" }}
      </button>
    </div>

    <!-- 作业列表 -->
    <div v-else class="list">
      <div
        v-for="(a, index) in items"
        :key="a.id"
        class="item card-surface"
      >
        <div
          v-if="index > 0 && a.is_completed && !items[index - 1].is_completed"
          class="completion-divider"
        >
          <span>已完成</span>
        </div>
        <div class="source-badge" :style="{ background: sourceBg(a.source), color: sourceColor(a.source) }">
          {{ sourceLabel(a.source) }}
        </div>
        <div class="body">
          <div class="title-row">
            <span class="title" :class="{ done: a.is_completed }">{{ a.title }}</span>
            <span v-if="a.is_completed" class="tag done-tag">已完成</span>
            <span v-else class="tag" :class="dueStatus(a.due_time).level">
              {{ dueStatus(a.due_time).label }}
            </span>
          </div>
          <div class="meta">
            <span v-if="a.course_name" class="course">{{ a.course_name }}</span>
            <span v-if="a.due_time" class="due-time">{{ a.due_time.replace("T", " ").slice(0, 16) }}</span>
          </div>
        </div>
        <button class="del" :aria-label="`删除「${a.title}」`" @click="remove(a.id)">✕</button>
      </div>
    </div>
  </div>

  <!-- 账号配置弹窗 -->
  <Teleport to="body">
    <div v-if="showCredModal" class="modal-overlay" @click.self="showCredModal = false">
      <div class="modal card-surface">
        <h3 class="modal-title">作业平台账号</h3>
        <p class="modal-desc">填写作业平台登录信息，账号密码仅保存在本地浏览器</p>

        <div class="form">
          <div class="platform-section">
            <div class="platform-label">
              <AppIcon name="book-open" :size="14" />
              数你最灵（smartestu.cn）
            </div>
            <label class="field">
              <span>学号</span>
              <input v-model="credForm.smartestu_id" type="text" placeholder="你的学号" autocomplete="username" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="credForm.smartestu_password" type="password" placeholder="数你最灵登录密码" autocomplete="current-password" />
            </label>
          </div>

          <div class="platform-section">
            <div class="platform-label">
              <AppIcon name="graduation" :size="14" />
              学习通（chaoxing.com）
            </div>
            <label class="field">
              <span>手机号</span>
              <input v-model="credForm.chaoxing_username" type="text" placeholder="绑定的手机号" autocomplete="username" />
            </label>
            <label class="field">
              <span>密码</span>
              <input v-model="credForm.chaoxing_password" type="password" placeholder="学习通登录密码" autocomplete="current-password" />
            </label>
          </div>

          <p v-if="credError" class="form-error">{{ credError }}</p>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="showCredModal = false">取消</button>
          <button class="btn-confirm" :disabled="credSaving" @click="saveCred">
            {{ credSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.page { max-width: 680px; margin: 0 auto; padding: var(--space-4); }
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-3);
}
.page-header h2 { font-size: 20px; font-weight: 700; }
.header-actions { display: flex; gap: var(--space-2); align-items: center; }

.btn-refresh {
  display: flex; align-items: center; gap: 6px;
  padding: 6px var(--space-3); border-radius: 999px;
  border: 1.5px solid var(--brand); color: var(--brand);
  background: transparent; font-size: 13px; font-family: inherit;
  cursor: pointer; transition: background var(--duration-fast) var(--ease-out);
}
.btn-refresh:hover:not(:disabled) { background: var(--brand-soft); }
.btn-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-config {
  display: flex; align-items: center; gap: 6px;
  padding: 6px var(--space-3); border-radius: 999px;
  border: 1.5px solid var(--border-strong); color: var(--text-secondary);
  background: transparent; font-size: 13px; font-family: inherit;
  cursor: pointer; transition: border-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.btn-lms {
  display: flex; align-items: center; gap: 6px;
  padding: 6px var(--space-3); border-radius: 999px;
  border: 1.5px solid var(--brand); color: var(--brand);
  background: transparent; font-size: 13px; font-family: inherit;
  cursor: pointer; transition: background var(--duration-fast) var(--ease-out);
}
.btn-lms:hover:not(:disabled) { background: var(--brand-soft); }
.btn-lms:disabled { opacity: 0.6; cursor: wait; }
.btn-clear {
  display: flex; align-items: center; gap: 6px;
  padding: 6px var(--space-3); border-radius: 999px;
  border: 1.5px solid var(--danger); color: var(--danger);
  background: transparent; font-size: 13px; font-family: inherit;
  cursor: pointer; transition: background var(--duration-fast) var(--ease-out);
}
.btn-clear:hover:not(:disabled) { background: var(--danger-soft); }
.btn-clear:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-config:hover { border-color: var(--brand); color: var(--brand); }

.error-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3);
  background: var(--danger-soft); color: var(--danger);
  border-radius: var(--radius-md); font-size: 13px;
}
.error-close {
  background: none; border: none; cursor: pointer; color: var(--danger);
  font-size: 12px; padding: 2px 6px; border-radius: 4px;
}
.error-close:hover { background: var(--danger); color: #fff; }

.filters {
  display: flex; gap: var(--space-1); background: var(--surface-2);
  padding: 3px; border-radius: 999px; margin-bottom: var(--space-3);
}
.filter-btn {
  padding: var(--space-1) var(--space-3); border: none; border-radius: 999px;
  background: transparent; color: var(--text-secondary); font-size: 13px;
  font-family: inherit; cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.filter-btn.active { background: var(--surface); color: var(--brand); font-weight: 600; box-shadow: var(--shadow-card); }

.list { display: flex; flex-direction: column; gap: var(--space-2); }
.item {
  display: flex; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  transition: opacity var(--duration-fast) var(--ease-out);
  position: relative;
}
.completion-divider {
  position: absolute; left: var(--space-4); right: var(--space-4); top: -8px;
  display: flex; align-items: center; gap: var(--space-2);
  color: var(--text-tertiary); font-size: 11px;
}
.completion-divider::before,
.completion-divider::after { content: ""; height: 1px; flex: 1; background: var(--border); }
.item.done { opacity: 0.5; }
.source-badge {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px; margin-top: 2px;
}
.body { flex: 1; min-width: 0; }
.title-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.title { font-size: 14px; font-weight: 500; }
.title.done { text-decoration: line-through; }
.tag {
  flex-shrink: 0; font-size: 11px; font-weight: 600;
  padding: 1px 8px; border-radius: 999px;
}
.tag.overdue { background: var(--danger-soft); color: var(--danger); }
.tag.today { background: var(--warning-soft); color: var(--warning); }
.tag.soon { background: var(--warning-soft); color: var(--warning); }
.tag.ok { background: var(--surface-2); color: var(--text-tertiary); }
.done-tag { background: var(--success-soft); color: var(--success); }
.meta { display: flex; align-items: center; gap: var(--space-2); margin-top: 4px; font-size: 12px; }
.course { color: var(--text-secondary); }
.due-time { color: var(--text-tertiary); }
.del {
  background: none; border: none; color: var(--text-tertiary); cursor: pointer;
  font-size: 14px; padding: var(--space-2); border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out);
}
.del:hover { color: var(--danger); background: var(--danger-soft); }

.empty-state { text-align: center; padding: 48px var(--space-4); }
.empty-icon {
  width: 56px; height: 56px; margin: 0 auto var(--space-3);
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-lg);
}
.empty-title { font-size: 15px; font-weight: 600; margin-bottom: var(--space-2); }
.empty-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-4); max-width: 280px; margin-left: auto; margin-right: auto; }
.empty-action {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 24px; border-radius: 999px; border: 1.5px solid var(--brand);
  background: transparent; color: var(--brand); font-size: 14px; font-family: inherit;
  cursor: pointer;
}
.empty-action:hover:not(:disabled) { background: var(--brand-soft); }
.empty-action:disabled { opacity: 0.6; cursor: not-allowed; }

/* 弹窗 */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: var(--space-4);
}
.modal { width: 100%; max-width: 380px; padding: var(--space-5); border-radius: var(--radius-xl); }
.modal-title { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
.modal-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-4); }
.form { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.field input {
  padding: 9px 12px; border: 1.5px solid var(--border); border-radius: var(--radius-md);
  font-size: 14px; font-family: inherit; background: var(--surface-2); color: var(--text);
  transition: border-color var(--duration-fast) var(--ease-out);
}
.field input:focus { outline: none; border-color: var(--brand); }
.form-error { font-size: 12px; color: var(--danger); margin: 0; }
.platform-section { display: flex; flex-direction: column; gap: var(--space-2); }
.platform-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
}
.modal-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.btn-cancel {
  padding: 8px 20px; border-radius: 999px; border: none;
  background: var(--surface-2); color: var(--text-secondary); font-size: 14px;
  font-family: inherit; cursor: pointer;
}
.btn-confirm {
  padding: 8px 20px; border-radius: 999px; border: none;
  background: var(--brand); color: #fff; font-size: 14px; font-family: inherit;
  cursor: pointer; transition: opacity var(--duration-fast) var(--ease-out);
}
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
