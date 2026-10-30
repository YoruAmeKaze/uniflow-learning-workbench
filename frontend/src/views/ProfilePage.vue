<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import { authAPI } from "../api";

const router = useRouter();
const user = ref<any>(null);
const loading = ref(true);

// 编辑状态
const editing = ref(false);
const saving = ref(false);
const saveError = ref("");
const saveOk = ref(false);
const form = ref({ college: "", major: "", grade: "" });

const profileCompleted = () =>
  Boolean(user.value?.college || user.value?.major || user.value?.grade);

onMounted(async () => {
  try {
    const res = await authAPI.me();
    user.value = res.data;
  } catch {
    /* 未登录时由路由守卫处理 */
  } finally {
    loading.value = false;
  }
});

function startEdit() {
  form.value = {
    college: user.value?.college ?? "",
    major: user.value?.major ?? "",
    grade: user.value?.grade ?? "",
  };
  saveError.value = "";
  saveOk.value = false;
  editing.value = true;
}

async function saveProfile() {
  if (saving.value) return;
  saving.value = true;
  saveError.value = "";
  saveOk.value = false;
  try {
    const res = await authAPI.updateProfile(form.value);
    user.value = { ...user.value, ...res.data };
    editing.value = false;
    saveOk.value = true;
  } catch (err: any) {
    saveError.value = err.response?.data?.message || "保存失败，请稍后再试";
  } finally {
    saving.value = false;
  }
}

function logout() {
  if (!confirm("确定退出登录吗？")) return;
  localStorage.removeItem("token");
  router.push("/login");
}
</script>

<template>
  <div class="page">
    <header class="page-header"><h2>个人中心</h2></header>

    <!-- 加载骨架 -->
    <div v-if="loading" class="profile-card card-surface skeleton" style="height: 220px" aria-busy="true" />

    <template v-else-if="user">
      <div class="profile-card card-surface">
        <div class="avatar">{{ user.username?.charAt(0) || "?" }}</div>
        <div class="name">{{ user.username || "未设置姓名" }}</div>
        <div class="id-badge">学号 {{ user.student_id }}</div>

        <!-- 学院 / 专业 / 年级 -->
        <div class="info-list">
          <div class="info-row">
            <span class="info-label">学院</span>
            <span class="info-value" :class="{ empty: !user.college }">{{ user.college || "未填写" }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">专业</span>
            <span class="info-value" :class="{ empty: !user.major }">{{ user.major || "未填写" }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">年级</span>
            <span class="info-value" :class="{ empty: !user.grade }">{{ user.grade || "未填写" }}</span>
          </div>
        </div>

        <!-- 编辑按钮 / 编辑表单 -->
        <button v-if="!editing" class="btn btn-outline edit-btn" @click="startEdit">
          <AppIcon name="edit" :size="14" />
          {{ profileCompleted() ? "编辑信息" : "完善信息" }}
        </button>

        <div v-else class="edit-panel">
          <label class="field">
            <span class="field-label">学院</span>
            <input v-model="form.college" placeholder="如：计算机学院" maxlength="100" />
          </label>
          <label class="field">
            <span class="field-label">专业</span>
            <input v-model="form.major" placeholder="如：软件工程" maxlength="100" />
          </label>
          <label class="field">
            <span class="field-label">年级</span>
            <input v-model="form.grade" placeholder="如：2024 级" maxlength="20" />
          </label>
          <p v-if="saveError" class="save-error" role="alert">{{ saveError }}</p>
          <div class="edit-actions">
            <button class="btn btn-ghost" :disabled="saving" @click="editing = false">取消</button>
            <button class="btn btn-primary" :disabled="saving" @click="saveProfile">
              {{ saving ? "保存中…" : "保存" }}
            </button>
          </div>
        </div>

        <p v-if="saveOk" class="save-ok">
          <AppIcon name="check" :size="14" /> 已保存，AI 助手可以读取这些信息了
        </p>
      </div>

      <button class="btn btn-danger btn-lg logout" @click="logout">退出登录</button>
    </template>

    <div v-else class="empty-state card-surface">
      <span class="empty-icon"><AppIcon name="user" :size="30" /></span>
      <div class="empty-title">登录状态已失效</div>
      <router-link class="empty-action" to="/login">重新登录</router-link>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 680px; margin: 0 auto; padding: var(--space-4); }
.empty-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--text-tertiary);
  border-radius: var(--radius-lg);
}
.profile-card {
  text-align: center;
  padding: var(--space-6);
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), oklch(0.6 0.11 285));
  color: white;
  font-size: 26px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-3);
  box-shadow: 0 4px 12px oklch(0.55 0.13 262 / 0.2);
}
.name { font-size: 18px; font-weight: 650; margin-bottom: var(--space-1); }
.id-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 2px var(--space-3);
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

/* 信息列表 */
.info-list {
  text-align: left;
  max-width: 360px;
  margin: var(--space-4) auto 0;
  border-top: 1px solid var(--border);
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-1);
  border-bottom: 1px solid var(--border);
}
.info-label { font-size: 13px; color: var(--text-tertiary); flex-shrink: 0; }
.info-value { font-size: 14px; font-weight: 500; color: var(--text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.info-value.empty { color: var(--text-tertiary); font-weight: 400; }

/* 编辑 */
.edit-btn { margin-top: var(--space-4); }
.edit-panel {
  margin-top: var(--space-4);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-4);
}
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.edit-panel input {
  padding: 9px var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: inherit;
  background: var(--surface);
  color: var(--text);
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.edit-panel input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
  outline: none;
}
.save-error {
  color: var(--danger);
  font-size: 13px;
  background: var(--danger-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  margin: 0;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
.save-ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-4);
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
}

.logout { display: block; width: 100%; margin-top: var(--space-4); }
</style>
