<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { courseAPI, notificationAPI, taskAPI, planAPI } from "../api";
import { weekdayName, todayWeekday, dueStatus } from "../utils/format";

const courses = ref<any[]>([]);
const todos = ref<any[]>([]);
const sessions = ref<any[]>([]);
const unreadCount = ref(0);
const loading = ref(true);

const today = todayWeekday();
const dateText = `${new Date().getMonth() + 1}月${new Date().getDate()}日 · ${weekdayName(today)}`;

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return "夜深了，注意休息";
  if (h < 12) return "早上好，新的一天";
  if (h < 14) return "中午好，记得吃饭";
  if (h < 18) return "下午好，继续加油";
  return "晚上好，辛苦了";
});

/* 统计卡（Creator Studio 版式 · 低饱和浅色） */
const stats = computed(() => [
  {
    key: "courses",
    icon: "book" as const,
    label: "今日课程",
    value: courses.value.length,
    unit: "节",
    tint: "var(--brand-soft)",
    color: "var(--brand)",
  },
  {
    key: "todos",
    icon: "check" as const,
    label: "待完成任务",
    value: todos.value.length,
    unit: "个",
    tint: "var(--warning-soft)",
    color: "var(--warning)",
  },
  {
    key: "unread",
    icon: "bell" as const,
    label: "未读通知",
    value: unreadCount.value,
    unit: "条",
    tint: "var(--danger-soft)",
    color: "var(--danger)",
  },
]);

const quickLinks = [
  { to: "/chat", name: "AI 问答", desc: "提问即解答", icon: "zap" as const, tint: "var(--brand-soft)", color: "var(--brand)" },
  { to: "/courses", name: "本周课表", desc: "查看整周课程", icon: "book" as const, tint: "var(--warning-soft)", color: "var(--warning)" },
  { to: "/tasks", name: "全部任务", desc: "统一管理学习事项", icon: "check" as const, tint: "var(--success-soft)", color: "var(--success)" },
  { to: "/plans", name: "AI 学习规划", desc: "生成可执行安排", icon: "zap" as const, tint: "var(--brand-soft)", color: "var(--brand)" },
  { to: "/assignments", name: "作业", desc: "课程作业列表", icon: "book-open" as const, tint: "var(--danger-soft)", color: "var(--danger)" },
  { to: "/notifications", name: "校园通知", desc: "最新消息", icon: "bell" as const, tint: "var(--surface-2)", color: "var(--text-secondary)" },
];

onMounted(async () => {
  try {
    const [c, t, n, p] = await Promise.all([
      courseAPI.today(),
      taskAPI.list({ status: "pending" }),
      notificationAPI.list({ page: 1 }),
      planAPI.list(),
    ]);
    courses.value = c.data.items;
    todos.value = t.data.items;
    sessions.value = p.data.items;
    unreadCount.value = n.data.items.filter((x: any) => !x.is_read).length;
  } catch {
    /* 数据加载失败时静默降级：仅展示问候 */
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="home">
    <!-- 问候区（桌面端日期靠右，仿 Creator Studio headline） -->
    <section class="hero">
      <div>
        <p class="date">{{ dateText }}</p>
        <h1 class="greeting">{{ greeting }}<span class="dot">.</span></h1>
        <p class="hero-sub">新的一天，从掌握今天开始</p>
      </div>
      <span class="date-chip" aria-hidden="true">{{ dateText }}</span>
    </section>

    <!-- 统计卡 -->
    <section class="stats" aria-label="今日概览">
      <div v-for="s in stats" :key="s.key" class="stat card-surface">
        <span class="stat-icon" :style="{ background: s.tint, color: s.color }">
          <AppIcon :name="s.icon" :size="20" />
        </span>
        <div class="stat-body">
          <span class="stat-value">{{ loading ? "—" : `${s.value} ${s.unit}` }}</span>
          <span class="stat-label">{{ s.label }}</span>
        </div>
      </div>
    </section>

    <!-- 双栏面板：今日课程 + 近期待办 -->
    <div class="cols">
      <section v-if="loading || courses.length" class="panel card-surface">
        <div class="panel-head">
          <h2>今日课程</h2>
          <router-link to="/courses" class="btn btn-ghost btn-sm">全部</router-link>
        </div>
        <div v-if="loading" class="stack">
          <div class="row skeleton" style="height: 52px" />
          <div class="row skeleton" style="height: 52px" />
        </div>
        <div v-else class="stack">
          <router-link v-for="c in courses.slice(0, 4)" :key="c.id" to="/courses" class="row">
            <span class="row-time">{{ c.start_time }}</span>
            <span class="row-main">{{ c.name }}</span>
            <span v-if="c.location || c.classroom" class="row-sub">{{ c.location || c.classroom }}</span>
          </router-link>
        </div>
      </section>

      <section v-if="loading || todos.length" class="panel card-surface">
        <div class="panel-head">
          <h2>近期待办</h2>
          <router-link to="/todos" class="btn btn-ghost btn-sm">全部</router-link>
        </div>
        <div v-if="loading" class="stack">
          <div class="row skeleton" style="height: 52px" />
          <div class="row skeleton" style="height: 52px" />
        </div>
        <div v-else class="stack">
          <router-link v-for="t in todos.slice(0, 4)" :key="t.id" to="/todos" class="row">
            <span class="row-check"><AppIcon name="check" :size="15" /></span>
            <span class="row-main">{{ t.title }}</span>
            <span class="row-sub" :class="dueStatus(t.due_date).level">{{ dueStatus(t.due_date).label }}</span>
          </router-link>
        </div>
      </section>
    </div>

    <!-- 快捷入口 -->
    <section class="section">
      <div class="section-head"><h2>快捷入口</h2></div>
      <div class="quick-grid">
        <router-link v-for="q in quickLinks" :key="q.to" :to="q.to" class="tile">
          <span class="tile-icon" :style="{ background: q.tint, color: q.color }">
            <AppIcon :name="q.icon" :size="22" />
          </span>
          <span class="tile-label">{{ q.name }}</span>
          <span class="tile-desc">{{ q.desc }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home { max-width: 960px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-6); }

/* ===== 问候区 ===== */
.hero { padding: var(--space-2) 0 var(--space-5); }
.date { font-size: 13px; color: var(--text-secondary); letter-spacing: 0.04em; margin-bottom: var(--space-2); }
.date-chip { display: none; }
.greeting { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; margin: 0; }
.greeting .dot { color: var(--brand); }
.hero-sub { font-size: 13px; color: var(--text-tertiary); margin-top: var(--space-2); }

/* ===== 统计卡 ===== */
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.stat {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.stat:hover { transform: translateY(-1px); box-shadow: var(--shadow-pop); }
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.stat-value { font-size: 20px; font-weight: 750; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stat-label { font-size: 12px; color: var(--text-tertiary); }

/* ===== 面板 ===== */
.cols { display: grid; gap: var(--space-3); margin-bottom: var(--space-5); }
.panel { padding: var(--space-2) var(--space-4); }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
}
.panel-head h2 { font-size: 15px; font-weight: 650; }
.stack { display: flex; flex-direction: column; }

/* 面板内平铺行（分隔线，Creator Studio 风格） */
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  transition: color var(--duration-fast) var(--ease-out);
}
.row:last-child { border-bottom: none; }
.row:hover .row-main { color: var(--brand); }
.row-time {
  font-size: 13px;
  font-weight: 650;
  color: var(--brand);
  min-width: 44px;
  font-variant-numeric: tabular-nums;
}
.row-main { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color var(--duration-fast) var(--ease-out); }
.row-sub { font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; }
.row-sub.overdue { color: var(--danger); font-weight: 600; }
.row-sub.today { color: var(--warning); font-weight: 600; }
.row-sub.soon { color: var(--warning); }
.row-check {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--success-soft);
  color: var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* ===== 快捷入口 ===== */
.section { margin-top: var(--space-5); }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-head h2 { font-size: 15px; font-weight: 650; }
.quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}
.tile:hover { transform: translateY(-2px); box-shadow: var(--shadow-pop); border-color: var(--border-strong); }
.tile-icon {
  width: 42px;
  height: 42px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-2);
}
.tile-label { font-size: 15px; font-weight: 650; color: var(--text); }
.tile-desc { font-size: 12px; color: var(--text-tertiary); }

/* ===== 宽屏（横屏 / 桌面）响应式 ===== */
@media (min-width: 768px) {
  .home { padding: var(--space-6) var(--space-6) var(--space-6); }
  .hero { display: flex; align-items: flex-end; justify-content: space-between; padding: var(--space-3) 0 var(--space-5); }
  .greeting { font-size: 36px; }
  .date-chip {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px var(--space-3);
    white-space: nowrap;
  }
  .cols { grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .quick-grid { grid-template-columns: repeat(4, 1fr); }
  .tile { padding: var(--space-5); }
}
</style>
