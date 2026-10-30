<script setup lang="ts">
import { watch } from "vue";
import { useRoute } from "vue-router";
import AppIcon from "./components/AppIcon.vue";

const route = useRoute();
const showNav = () => route.name !== "login";

// 路由标题跟随（显示逻辑）
watch(
  () => route.meta.title,
  (title) => {
    document.title = title ? `${title} · UniFlow` : "UniFlow";
  },
  { immediate: true },
);

const navItems = [
  { to: "/", icon: "home" as const, label: "学习工作台" },
  { to: "/tasks", icon: "check" as const, label: "全部任务" },
  { to: "/plans", icon: "zap" as const, label: "AI 学习规划" },
  { to: "/chat", icon: "chat" as const, label: "AI 助手" },
  { to: "/notifications", icon: "bell" as const, label: "通知" },
  { to: "/todos", icon: "check" as const, label: "待办" },
  { to: "/assignments", icon: "book-open" as const, label: "作业" },
  { to: "/courses", icon: "book" as const, label: "课程" },
  { to: "/profile", icon: "user" as const, label: "我的" },
];

const isActive = (item: { to: string }) =>
  item.to === "/" ? route.path === "/" : route.path.startsWith(item.to);
</script>

<template>
  <div class="app" :class="{ 'app-nav': showNav() }">
    <!-- 桌面侧边栏（Creator Studio 风格 · 浅色低饱和） -->
    <aside v-if="showNav()" class="sidebar" aria-label="主导航">
      <router-link to="/" class="brand">
        <span class="brand-mark"><AppIcon name="graduation" :size="20" /></span>
        <span class="brand-name">UniFlow</span>
      </router-link>

      <nav class="side-nav">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="side-link"
          :class="{ active: isActive(item) }"
        >
          <AppIcon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="side-foot">
        <span class="side-foot-dot" aria-hidden="true" />
        <span>校园执行型 AI Agent</span>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="content">
      <router-view />
    </main>

    <!-- 移动端底部导航 -->
    <nav v-if="showNav()" class="tab-bar" aria-label="主导航">
      <router-link to="/" class="tab" exact-active-class="active">
        <AppIcon name="home" :size="20" /><span>首页</span>
      </router-link>
      <router-link to="/chat" class="tab" active-class="active">
        <AppIcon name="chat" :size="20" /><span>AI</span>
      </router-link>
      <router-link to="/notifications" class="tab" active-class="active">
        <AppIcon name="bell" :size="20" /><span>通知</span>
      </router-link>
      <router-link to="/tasks" class="tab" active-class="active">
        <AppIcon name="check" :size="20" /><span>任务</span>
      </router-link>
      <router-link to="/plans" class="tab" active-class="active">
        <AppIcon name="zap" :size="20" /><span>规划</span>
      </router-link>
      <router-link to="/profile" class="tab" active-class="active">
        <AppIcon name="user" :size="20" /><span>我的</span>
      </router-link>
    </nav>
  </div>
</template>

<style>
/* ===== 设计令牌（frontend-design-pro 规范 · 浅色低饱和）===== */
:root {
  color-scheme: light;
  /* 字体：中文优先的个性栈（避免通用 system-ui） */
  --font-sans: "HarmonyOS Sans SC", "MiSans", "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif;

  /* 色彩：OKLCH 感知均匀，中性色带冷色调，整体低饱和 */
  --bg: oklch(0.972 0.004 250);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.968 0.005 250);
  --text: oklch(0.28 0.015 250);
  --text-secondary: oklch(0.52 0.015 250);
  --text-tertiary: oklch(0.64 0.015 250);
  --border: oklch(0.915 0.006 250);
  --border-strong: oklch(0.87 0.01 262);
  --brand: oklch(0.56 0.13 262);
  --brand-strong: oklch(0.48 0.12 262);
  --brand-soft: oklch(0.955 0.018 262);
  --danger: oklch(0.58 0.15 25);
  --danger-soft: oklch(0.955 0.02 25);
  --success: oklch(0.55 0.1 150);
  --success-soft: oklch(0.955 0.02 150);
  --warning: oklch(0.68 0.1 80);
  --warning-soft: oklch(0.965 0.025 90);
  --overlay: oklch(1 0 0 / 0.92);
  --skeleton-mid: oklch(0.95 0.004 250);

  /* 空间：8px 基础体系 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* 圆角 / 阴影 */
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.04);
  --shadow-pop: 0 4px 16px oklch(0 0 0 / 0.08);

  /* 动效：快入慢出，微交互 100-200ms */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 140ms;
  --duration-slow: 260ms;

  /* 布局 */
  --sidebar-width: 240px;

  /* 安全区（刘海屏） */
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

/* ===== 夜间模式：跟随系统（prefers-color-scheme），同时支持 data-theme 手动覆盖 ===== */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: oklch(0.16 0.008 250);
    --surface: oklch(0.195 0.01 250);
    --surface-2: oklch(0.235 0.012 250);
    --text: oklch(0.93 0.006 250);
    --text-secondary: oklch(0.73 0.01 250);
    --text-tertiary: oklch(0.56 0.01 250);
    --border: oklch(0.3 0.012 250);
    --border-strong: oklch(0.43 0.02 262);
    --brand: oklch(0.72 0.13 262);
    --brand-strong: oklch(0.78 0.12 262);
    --brand-soft: oklch(0.3 0.05 262);
    --danger: oklch(0.74 0.15 25);
    --danger-soft: oklch(0.31 0.05 25);
    --success: oklch(0.76 0.1 150);
    --success-soft: oklch(0.29 0.045 150);
    --warning: oklch(0.81 0.11 80);
    --warning-soft: oklch(0.33 0.05 80);
    --shadow-card: 0 1px 2px oklch(0 0 0 / 0.35), 0 4px 12px oklch(0 0 0 / 0.35);
    --shadow-pop: 0 4px 16px oklch(0 0 0 / 0.5);
    --overlay: oklch(0.19 0.01 250 / 0.9);
    --skeleton-mid: oklch(0.27 0.01 250);
  }
}
/* 手动覆盖钩子（未来可加切换按钮；测试时也可用 <html data-theme="dark">） */
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: oklch(0.16 0.008 250);
  --surface: oklch(0.195 0.01 250);
  --surface-2: oklch(0.235 0.012 250);
  --text: oklch(0.93 0.006 250);
  --text-secondary: oklch(0.73 0.01 250);
  --text-tertiary: oklch(0.56 0.01 250);
  --border: oklch(0.3 0.012 250);
  --border-strong: oklch(0.43 0.02 262);
  --brand: oklch(0.72 0.13 262);
  --brand-strong: oklch(0.78 0.12 262);
  --brand-soft: oklch(0.3 0.05 262);
  --danger: oklch(0.74 0.15 25);
  --danger-soft: oklch(0.31 0.05 25);
  --success: oklch(0.76 0.1 150);
  --success-soft: oklch(0.29 0.045 150);
  --warning: oklch(0.81 0.11 80);
  --warning-soft: oklch(0.33 0.05 80);
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.35), 0 4px 12px oklch(0 0 0 / 0.35);
  --shadow-pop: 0 4px 16px oklch(0 0 0 / 0.5);
  --overlay: oklch(0.19 0.01 250 / 0.9);
  --skeleton-mid: oklch(0.27 0.01 250);
}

/* 手动强制浅色（优先级高于系统的 prefers-color-scheme，留给未来的主题切换按钮） */
:root[data-theme='light'] {
  color-scheme: light;
  --bg: oklch(0.972 0.004 250);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.968 0.005 250);
  --text: oklch(0.28 0.015 250);
  --text-secondary: oklch(0.52 0.015 250);
  --text-tertiary: oklch(0.64 0.015 250);
  --border: oklch(0.915 0.006 250);
  --border-strong: oklch(0.87 0.01 262);
  --brand: oklch(0.56 0.13 262);
  --brand-strong: oklch(0.48 0.12 262);
  --brand-soft: oklch(0.955 0.018 262);
  --danger: oklch(0.58 0.15 25);
  --danger-soft: oklch(0.955 0.02 25);
  --success: oklch(0.55 0.1 150);
  --success-soft: oklch(0.955 0.02 150);
  --warning: oklch(0.68 0.1 80);
  --warning-soft: oklch(0.965 0.025 90);
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.04);
  --shadow-pop: 0 4px 16px oklch(0 0 0 / 0.08);
  --overlay: oklch(1 0 0 / 0.92);
  --skeleton-mid: oklch(0.95 0.004 250);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}

/* 可见焦点态（无障碍） */
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
  border-radius: 4px;
}

.app {
  min-height: 100vh;
}
.app-nav { padding-bottom: calc(64px + var(--safe-bottom)); }

/* ===== 全局按钮系统 ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
}
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary { background: var(--brand); color: white; }
.btn-primary:hover:not(:disabled) { background: var(--brand-strong); }
.btn-primary:active:not(:disabled) { transform: scale(0.98); }
.btn-ghost { color: var(--brand); }
.btn-ghost:hover:not(:disabled) { background: var(--brand-soft); }
.btn-outline { background: var(--surface); border-color: var(--border); color: var(--text-secondary); }
.btn-outline:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.btn-danger { border-color: var(--danger); color: var(--danger); background: var(--surface); }
.btn-danger:hover:not(:disabled) { background: var(--danger); color: white; }
.btn-sm { padding: 5px 12px; font-size: 13px; border-radius: 8px; }
.btn-lg { padding: 12px 20px; font-size: 15px; border-radius: 12px; }

/* 页面标题区（统一样式） */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.page-header h2 { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }

/* 通用卡片 */
.card-surface {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border);
}

/* 加载骨架 */
.skeleton {
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--skeleton-mid) 50%, var(--surface-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: var(--space-6) var(--space-4);
  color: var(--text-secondary);
}
.empty-state .empty-icon { display: block; margin-bottom: var(--space-3); }
.empty-state .empty-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: var(--space-1); }
.empty-state .empty-desc { font-size: 13px; margin-bottom: var(--space-4); }
.empty-state .empty-action {
  display: inline-block;
  padding: var(--space-2) var(--space-5);
  background: var(--brand);
  color: white;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--duration-fast) var(--ease-out);
}
.empty-state .empty-action:hover { background: var(--brand-strong); }

/* ===== 桌面侧边栏（Creator Studio 风格）===== */
.sidebar { display: none; }
@media (min-width: 1024px) {
  .app-nav {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    padding-bottom: 0;
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    padding: var(--space-5) var(--space-3);
    background: var(--surface);
    border-right: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: var(--space-1) var(--space-2) var(--space-4);
    text-decoration: none;
    color: var(--text);
  }
  .brand-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brand-soft);
    color: var(--brand);
  }
  .brand-name { font-size: 16px; font-weight: 750; letter-spacing: -0.02em; }
  .side-nav { display: flex; flex-direction: column; gap: 2px; }
  .side-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
  }
  .side-link:hover { background: var(--surface-2); color: var(--text); }
  .side-link.active { background: var(--brand-soft); color: var(--brand); font-weight: 600; }
  .side-foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--space-3) var(--space-2);
    font-size: 12px;
    color: var(--text-tertiary);
  }
  .side-foot-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
  }
  .content { min-width: 0; }
}

/* 底部导航（仅移动端显示） */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--overlay);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  padding: var(--space-2) 0 calc(var(--space-1) + var(--safe-bottom));
  z-index: 100;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-tertiary);
  font-size: 11px;
  padding: var(--space-1) 0;
  border-radius: var(--radius-sm);
  transition: color var(--duration-fast) var(--ease-out);
}
.tab > svg { opacity: 0.55; transition: opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out); }
.tab:hover { color: var(--text-secondary); }
.tab:hover > svg { opacity: 0.8; }
.tab.active { color: var(--brand); font-weight: 600; }
.tab.active > svg { opacity: 1; transform: translateY(-1px); }

@media (min-width: 1024px) {
  .tab-bar { display: none; }
}

/* 尊重减弱动效偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
