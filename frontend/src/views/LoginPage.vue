<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import { authAPI } from "../api";

const router = useRouter();
const isRegister = ref(false);
const studentId = ref("");
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

const features = [
  { icon: "book" as const, text: "今日课表一眼掌握" },
  { icon: "check" as const, text: "待办 DDL 不再错过" },
  { icon: "bell" as const, text: "校园通知实时送达" },
  { icon: "zap" as const, text: "AI 答疑即问即答" },
];

async function handleSubmit() {
  if (loading.value) return;
  error.value = "";
  loading.value = true;
  try {
    let res;
    if (isRegister.value) {
      res = await authAPI.register({
        student_id: studentId.value,
        username: username.value,
        password: password.value,
      });
    } else {
      res = await authAPI.login(studentId.value, password.value);
    }
    localStorage.setItem("token", res.data.access_token);
    router.push("/");
  } catch (err: any) {
    // 具体、可操作的错误提示（替代 alert）
    error.value = err.response?.data?.message
      || err.response?.data?.detail
      || "网络开小差了，请稍后再试";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <!-- 品牌区（桌面端分栏显示） -->
      <aside class="brand-panel">
        <div class="brand-head">
          <span class="brand-mark-lg" aria-hidden="true"><AppIcon name="graduation" :size="24" /></span>
          <span class="brand-name">UniFlow</span>
        </div>
        <h1>校园事务，<br />交给 AI 去执行。</h1>
        <p class="brand-desc">不是聊天机器人，而是能帮你完成课表、待办、通知等校园事务的执行型 Agent。</p>
        <ul class="feature-list">
          <li v-for="f in features" :key="f.text">
            <span class="f-icon"><AppIcon :name="f.icon" :size="15" /></span>
            {{ f.text }}
          </li>
        </ul>
      </aside>

      <!-- 登录表单区 -->
      <div class="login-card">
        <!-- 移动端品牌头 -->
        <div class="card-brand">
          <span class="brand-mark" aria-hidden="true"><AppIcon name="graduation" :size="28" /></span>
          <h1>UniFlow</h1>
          <p class="subtitle">校园执行型 AI Agent</p>
        </div>
        <!-- 桌面端标题 -->
        <div class="card-title-block">
          <h2>{{ isRegister ? "创建账号" : "欢迎回来" }}</h2>
          <p>{{ isRegister ? "注册后即可管理你的校园事务" : "登录后管理你的校园事务" }}</p>
        </div>

        <form @submit.prevent="handleSubmit" novalidate>
          <label class="field">
            <span class="field-label">学号</span>
            <input v-model="studentId" placeholder="请输入学号" autocomplete="username" required />
          </label>
          <label v-if="isRegister" class="field">
            <span class="field-label">姓名</span>
            <input v-model="username" placeholder="请输入姓名" autocomplete="name" required />
          </label>
          <label class="field">
            <span class="field-label">密码</span>
            <input v-model="password" type="password" placeholder="请输入密码" :autocomplete="isRegister ? 'new-password' : 'current-password'" required />
          </label>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button type="submit" class="btn btn-primary btn-lg submit-btn" :disabled="loading">
            {{ loading ? (isRegister ? "注册中…" : "登录中…") : (isRegister ? "注册" : "登录") }}
          </button>
        </form>

        <p class="switch">
          {{ isRegister ? "已有账号？" : "还没有账号？" }}
          <button type="button" class="switch-link" @click="isRegister = !isRegister; error = ''">
            {{ isRegister ? "去登录" : "去注册" }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: var(--space-4);
  background:
    radial-gradient(120% 80% at 50% 0%, var(--brand-soft) 0%, transparent 60%),
    var(--bg);
}
.login-shell { width: 100%; max-width: 380px; }

/* ===== 登录卡片（移动端默认） ===== */
.login-card {
  background: var(--surface);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  border: 1px solid var(--border);
  width: 100%;
  text-align: center;
}
.brand-mark {
  width: 56px;
  height: 56px;
  margin: 0 auto var(--space-3);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-soft);
  color: var(--brand);
  border-radius: var(--radius-lg);
}
.card-brand h1 {
  margin: 0 0 var(--space-1);
  font-size: 24px;
  letter-spacing: -0.02em;
  font-weight: 700;
}
.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: var(--space-5);
}
.card-title-block { display: none; }
form { display: flex; flex-direction: column; gap: var(--space-3); text-align: left; }
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
input {
  padding: 10px var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-family: inherit;
  background: var(--surface);
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
  outline: none;
}
.form-error {
  color: var(--danger);
  font-size: 13px;
  background: var(--danger-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
}
.submit-btn { display: block; width: 100%; margin-top: var(--space-2); }
.switch {
  margin-top: var(--space-4);
  color: var(--text-secondary);
  font-size: 14px;
}
.switch-link {
  background: none;
  border: none;
  color: var(--brand);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.switch-link:hover { text-decoration: underline; }

/* ===== 品牌区（仅桌面端） ===== */
.brand-panel { display: none; }

/* ===== 桌面端分栏 ===== */
@media (min-width: 1024px) {
  .login-page { padding: var(--space-6); }
  .login-shell {
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    max-width: 940px;
    min-height: 560px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .brand-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-6);
    background: linear-gradient(165deg, var(--brand-soft) 0%, var(--bg) 55%, var(--surface) 100%);
    border-right: 1px solid var(--border);
  }
  .brand-head { display: flex; align-items: center; gap: 10px; }
  .brand-mark-lg {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand);
    color: white;
    box-shadow: 0 4px 12px oklch(0.55 0.13 262 / 0.25);
  }
  .brand-name { font-size: 18px; font-weight: 750; letter-spacing: -0.02em; }
  .brand-panel h1 {
    margin: var(--space-2) 0 0;
    font-size: 32px;
    line-height: 1.2;
    letter-spacing: -0.025em;
    font-weight: 800;
  }
  .brand-desc {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.7;
    margin: 0;
    max-width: 34ch;
  }
  .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-2) 0 0;
    padding: 0;
  }
  .feature-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--text);
  }
  .f-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--surface);
    color: var(--brand);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    box-shadow: var(--shadow-card);
  }

  /* 卡片：去边框，垂直居中 */
  .login-card {
    border: none;
    border-radius: 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 100%;
  }
  .card-brand { display: none; }
  .card-title-block { display: block; margin-bottom: var(--space-5); }
  .card-title-block h2 { margin: 0 0 var(--space-1); font-size: 24px; font-weight: 750; letter-spacing: -0.02em; }
  .card-title-block p { margin: 0; color: var(--text-secondary); font-size: 14px; }
  .submit-btn { margin-top: var(--space-3); }
  .switch { margin-top: var(--space-5); }
}
</style>
