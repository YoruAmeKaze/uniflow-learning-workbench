<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { courseAPI, authAPI } from "../api";
import { weekdayName, todayWeekday } from "../utils/format";

const items = ref<any[]>([]);
const loading = ref(true);
const week = ref(0); // 当前查看的周次
const currentWeek = ref(0); // 后端按 SEMESTER_START 推算的"本周"
const weekStart = ref(""); // 查看周周一日期 YYYY-MM-DD
const errorMsg = ref("");

// ---- 导入课表面板 ----
const showImport = ref(false);
const importStudentId = ref("");
const importing = ref(false);
const importMsg = ref("");

const todayWk = todayWeekday();

/** "YYYY-MM-DD" + n 天 → Date */
function addDays(dateStr: string, days: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d + days);
}

/** Date → "M月D日" */
function md(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 周区间文案：如 9月7日 – 9月13日 */
const weekRange = computed(() => {
  if (!weekStart.value) return "";
  const end = addDays(weekStart.value, 6);
  return `${md(addDays(weekStart.value, 0))} – ${md(end)}`;
});

/** 周一到周日（模板遍历用） */
const DAY_KEYS = [1, 2, 3, 4, 5, 6, 7] as const

/** 重邮标准作息时间段；没有课程的时间段也固定展示。 */
const DEFAULT_SLOTS = [
  { start: "08:00", end: "09:40" },
  { start: "10:15", end: "11:55" },
  { start: "14:00", end: "15:40" },
  { start: "16:15", end: "17:55" },
  { start: "19:00", end: "20:40" },
  { start: "20:50", end: "22:30" },
]

/** "HH:MM" → 分钟数（用于时间比较） */
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 上/下午/晚上分类（分钟界） */
function periodOf(t: string): "morning" | "afternoon" | "evening" {
  const m = toMin(t);
  return m < 12 * 60 ? "morning" : m < 18 * 60 ? "afternoon" : "evening";
}

/** 详情弹窗当前选中的课程 */
const selected = ref<any>(null);
function openDetail(c: any) { selected.value = c; }
function closeDetail() { selected.value = null; }

/** 今天列高亮 */
function isTodayCol(d: number): boolean {
  return week.value === currentWeek.value && d === todayWk;
}

/** 上下晚三档颜色 */
function periodColor(startTime: string): string {
  const p = periodOf(startTime);
  return p === "morning" ? "oklch(0.62 0.14 215)"
    : p === "afternoon" ? "oklch(0.65 0.14 75)"
    : "oklch(0.62 0.15 280)";
}

/** 弹窗地点文案 */
const detailPlace = computed(() => {
  const c = selected.value;
  return c && (c.location || c.classroom) ? (c.location || c.classroom) : "";
});

/** 弹窗周次文案 */
const detailWeeks = computed(() => {
  const c = selected.value;
  if (!c || !c.start_week) return "";
  return c.end_week && c.end_week !== c.start_week
    ? `第 ${c.start_week} – ${c.end_week} 周`
    : `第 ${c.start_week} 周`;
});

/**
 * 网格课表：行=时间段，列=周一~周日。
 * matrix: Array of { slot, cells: { [weekday]: course[] } }
 */
const matrix = computed(() => {
  const slotMap = new Map<string, { start: string; end: string }>();
  for (const slot of DEFAULT_SLOTS) slotMap.set(`${slot.start}|${slot.end}`, slot);
  for (const c of items.value) {
    const key = `${c.start_time}|${c.end_time}`;
    if (!slotMap.has(key))
      slotMap.set(key, { start: c.start_time, end: c.end_time });
  }
  const slots = Array.from(slotMap.values()).sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  return slots.map((slot) => ({
    slot,
    cells: Object.fromEntries(
      DAY_KEYS.map((d) => [
        d,
        items.value.filter(
          (c) =>
            c.weekday === d &&
            c.start_time === slot.start &&
            c.end_time === slot.end,
        ),
      ]),
    ) as Record<number, any[]>,
  }));
});

/** 表头：7 天日期（M月D日），供模板渲染 */
const dayDates = computed(() => {
  if (!weekStart.value) return [] as string[]
  return [1, 2, 3, 4, 5, 6, 7].map((d) => md(addDays(weekStart.value, d - 1)))
})

async function load(target?: number) {
  loading.value = true;
  errorMsg.value = "";
  try {
    const res = await courseAPI.week(target);
    const data = res.data;
    items.value = data.items ?? [];
    week.value = data.week ?? 1;
    currentWeek.value = data.currentWeek ?? 1;
    weekStart.value = data.weekStart ?? "";
  } catch {
    // 旧后端/网络错误：保持当前 week 不变，给出空态提示，避免静默回到「第 0 周」
    errorMsg.value = "周课表接口暂不可用，请确认后端已重新编译并重启";
  } finally {
    loading.value = false;
  }
}

function prevWeek() {
  if (week.value > 1) load(week.value - 1);
}

function nextWeek() {
  load(week.value + 1);
}

function goCurrentWeek() {
  load(currentWeek.value);
}

function toggleImport() {
  showImport.value = !showImport.value;
  if (showImport.value && !importStudentId.value) {
    // 默认填登录用户的学号
    authAPI.me()
      .then((res) => {
        if (res.data?.student_id) importStudentId.value = res.data.student_id;
      })
      .catch(() => {/* 静默：仍允许手动输入 */});
  }
  importMsg.value = "";
}

async function runImport() {
  const sid = importStudentId.value.trim();
  if (!sid) {
    importMsg.value = "请输入学号";
    return;
  }
  importing.value = true;
  importMsg.value = "正在抓取教务系统课表…";
  try {
    const res = await courseAPI.import({ student_id: sid });
    const data = res.data as { imported: number; total: number };
    importMsg.value = `已导入 ${data.imported} 门课程（共 ${data.total} 条）`;
    showImport.value = false;
    // 刷新当前周视图
    load(week.value || currentWeek.value || undefined);
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || "导入失败";
    importMsg.value = `导入失败：${msg}`;
  } finally {
    importing.value = false;
  }
}

onMounted(() => load());
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h2>课表</h2>
      <div class="header-actions">
        <button
          v-if="week && week !== currentWeek"
          class="btn btn-ghost btn-sm"
          @click="goCurrentWeek"
        >
          回本周
        </button>
        <button class="btn btn-outline btn-sm" @click="toggleImport">
          {{ showImport ? "取消" : "导入课表" }}
        </button>
      </div>
    </header>

    <!-- 导入课表（折叠面板） -->
    <section v-if="showImport" class="import-panel card-surface">
      <label class="import-label">
        <span>教务系统学号</span>
        <input
          v-model="importStudentId"
          class="import-input"
          placeholder="例如 2026000001"
          :disabled="importing"
          @keyup.enter="runImport"
        />
      </label>
      <p class="import-hint">
        将从 <code>jwzx.cqupt.edu.cn/kebiao/kb_stu.php</code> 抓取当前学期课表，导入会替换该账号原有全部课程。
      </p>
      <div class="import-actions">
        <button class="btn btn-primary btn-sm" :disabled="importing" @click="runImport">
          {{ importing ? "抓取中…" : "开始导入" }}
        </button>
        <span v-if="importMsg" class="import-msg">{{ importMsg }}</span>
      </div>
    </section>

    <!-- 周次切换 -->
    <nav class="week-bar card-surface" aria-label="周次切换">
      <button class="arrow" :disabled="loading || week <= 1" aria-label="上一周" @click="prevWeek">
        ‹
      </button>
      <div class="week-mid">
        <div class="week-title">
          第 {{ week || "—" }} 周
          <span v-if="week && week === currentWeek" class="week-tag">本周</span>
        </div>
        <div class="week-range">{{ weekRange || "整学期课程" }}</div>
      </div>
      <button class="arrow" :disabled="loading" aria-label="下一周" @click="nextWeek">
        ›
      </button>
    </nav>

    <div v-if="loading" class="list" aria-busy="true">
      <div v-for="i in 4" :key="i" class="card skeleton" style="height: 72px" />
    </div>

    <div v-else-if="errorMsg" class="empty-state card-surface">
      <span class="empty-icon"><AppIcon name="book" :size="30" /></span>
      <div class="empty-title">暂时无法加载课表</div>
      <p class="empty-desc">{{ errorMsg }}</p>
    </div>

    <!-- 周课表网格：列=周一~周日，行=时间段 -->
    <div v-else class="course-grid card-surface">
      <table class="course-table">
        <thead>
          <tr>
            <th class="col-time-head">时间</th>
            <th
              v-for="d in DAY_KEYS"
              :key="d"
              class="col-day-head"
              :class="{ today: isTodayCol(d) }"
            >
              <div class="day-name">{{ weekdayName(d) }}</div>
              <div class="day-date">{{ dayDates[d - 1] }}</div>
              <span v-if="isTodayCol(d)" class="today-chip">今天</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrix" :key="row.slot.start + row.slot.end">
            <td class="col-time-cell">
              <div class="time-range">
                <span>{{ row.slot.start }}</span>
                <span class="time-sep">–</span>
                <span>{{ row.slot.end }}</span>
              </div>
            </td>
            <td
              v-for="d in DAY_KEYS"
              :key="d"
              class="col-day-cell"
              :class="[
                `period-${periodOf(row.slot.start)}`,
                { today: isTodayCol(d) },
              ]"
            >
              <div
                v-for="c in row.cells[d]"
                :key="c.id"
                class="grid-course"
                :class="`period-${periodOf(c.start_time)}`"
                role="button"
                tabindex="0"
                :aria-label="`查看 ${c.name} 详情`"
                @click="openDetail(c)"
                @keydown.enter="openDetail(c)"
              >
                <div class="grid-name">{{ c.name }}</div>
                <div v-if="c.teacher || c.location || c.classroom" class="grid-meta">
                  <span v-if="c.teacher">{{ c.teacher }}</span>
                  <span v-if="c.location || c.classroom">
                    <template v-if="c.teacher"> · </template>{{ c.location || c.classroom }}
                  </span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 课程详情弹窗 -->
    <div v-if="selected" class="detail-mask" @click.self="closeDetail">
      <div class="detail-card card-surface" role="dialog" aria-modal="true" aria-label="课程详情">
        <div class="detail-head">
          <span class="detail-dot" :style="{ background: periodColor(selected.start_time) }" />
          <h3 class="detail-title">{{ selected.name }}</h3>
          <button type="button" class="detail-close" aria-label="关闭" @click="closeDetail">✕</button>
        </div>
        <dl class="detail-list">
          <div class="detail-row"><dt>星期</dt><dd>{{ weekdayName(selected.weekday) }}</dd></div>
          <div class="detail-row"><dt>时间</dt><dd>{{ selected.start_time }} – {{ selected.end_time }}</dd></div>
          <div v-if="detailWeeks" class="detail-row"><dt>周次</dt><dd>{{ detailWeeks }}</dd></div>
          <div v-if="detailPlace" class="detail-row"><dt>地点</dt><dd>{{ detailPlace }}</dd></div>
          <div v-if="selected.teacher" class="detail-row"><dt>教师</dt><dd>{{ selected.teacher }}</dd></div>
          <div v-if="selected.credit" class="detail-row"><dt>学分</dt><dd>{{ selected.credit }}</dd></div>
        </dl>
      </div>
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
  background: var(--warning-soft);
  color: var(--warning);
  border-radius: var(--radius-lg);
}
.list { display: flex; flex-direction: column; gap: var(--space-3); }

/* 周次切换条 */
.week-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-2);
  margin-bottom: var(--space-4);
}
.arrow {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out);
}
.arrow:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand); }
.arrow:disabled { opacity: 0.35; cursor: not-allowed; }
.week-mid { text-align: center; min-width: 0; padding: 0 var(--space-2); }
.week-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
.week-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand);
  background: var(--brand-soft);
  padding: 1px var(--space-2);
  border-radius: 999px;
}
.week-range { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

/* 表头「今天」小角标 */
.today-chip {
  display: inline-block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--success);
  background: var(--success-soft);
  padding: 1px 6px;
  border-radius: 999px;
}

/* ===== 周课表网格 =====
   布局：table（列=周一~周日，行=时间段），桌面/移动均不出现横向滚动条 */
.course-grid {
  overflow: hidden;      /* 去掉滑块 */
}
.course-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}
.course-table th,
.course-table td {
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 8px 10px;
  vertical-align: top;
}
.course-table th:last-child,
.course-table td:last-child { border-right: 0; }
.course-table tbody tr:last-child td { border-bottom: 0; }

/* 列宽 */
.col-time-head { width: 80px; background: var(--surface-2); }
.col-day-head,
.col-day-cell { width: calc((100% - 80px) / 7); }

/* 表头 */
.col-time-head {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  vertical-align: middle;
  min-height: 64px;
  background: var(--surface-2);
}
.col-day-head {
  background: var(--surface-2);
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  vertical-align: middle;
  min-height: 64px;
}
.col-day-head .day-name { color: var(--text-secondary); font-size: 13px; }
.col-day-head .day-date { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; font-weight: 500; }
.col-day-head.today { background: var(--brand-soft); }
.col-day-head.today .day-name { color: var(--brand); }

/* 时间格：统一高度 + 水平/垂直居中 */
.col-time-cell {
  background: var(--surface-2);
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  vertical-align: middle;
  min-height: 64px;
  padding: 0 8px;
}
.time-range {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1px;
  color: var(--brand);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.time-sep { font-size: 10px; color: var(--text-tertiary); line-height: 1; }

/* 课程格：统一最小高度 + 上下对齐 */
.col-day-cell {
  min-height: 64px;
  vertical-align: top;
  padding: 6px 8px;
}
.col-day-cell.today { background: oklch(from var(--brand-soft) l c h / 0.35); }

/* 扁平课程块：去掉边框和彩色，纯色底，相邻块无间隙连接 */
.grid-course {
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  margin: 0;                    /* 紧贴上下相邻课程 */
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
  text-align: left;
  font-family: inherit;
  width: 100%;
  display: block;
  box-sizing: border-box;
  min-height: 52px;            /* 统一最小高度 */
  background: var(--surface-2); /* 扁平灰底 */
}
.grid-course:hover { background: var(--border); }
.grid-course:active { background: var(--surface-2); filter: brightness(0.95); }

/* 上午/下午/晚上：仅左色条区分，无彩色背景 */
.grid-course.period-morning { border-left: 3px solid oklch(0.62 0.14 215); }
.grid-course.period-afternoon { border-left: 3px solid oklch(0.65 0.14 75); }
.grid-course.period-evening { border-left: 3px solid oklch(0.62 0.15 280); }

.grid-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
  word-break: break-word;
}
.grid-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.4;
  word-break: break-word;
}

/* ---- 课程详情弹窗 ---- */
.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--overlay);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.detail-card {
  width: 100%;
  max-width: 340px;
  padding: var(--space-4);
  box-shadow: var(--shadow-pop);
  animation: detail-pop 0.18s var(--ease-out);
}
@keyframes detail-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.detail-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.detail-dot { width: 12px; height: 12px; border-radius: 4px; flex: 0 0 auto; }
.detail-title {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.01em;
  word-break: break-word;
}
.detail-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.detail-close:hover { background: var(--brand-soft); color: var(--brand); }
.detail-list { margin: 0; }
.detail-row {
  display: flex;
  gap: var(--space-3);
  padding: 8px 0;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.detail-row dt { flex: 0 0 44px; color: var(--text-tertiary); }
.detail-row dd { margin: 0; flex: 1; color: var(--text); word-break: break-word; }

/* 顶部按钮组 */
.header-actions { display: flex; gap: var(--space-2); align-items: center; }

/* 导入面板 */
.import-panel {
  padding: var(--space-4);
  margin-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.import-label { display: flex; flex-direction: column; gap: var(--space-1); font-size: 13px; color: var(--text-secondary); }
.import-input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.import-input:focus { outline: none; border-color: var(--brand); }
.import-input:disabled { opacity: 0.55; cursor: not-allowed; }
.import-hint { font-size: 12px; color: var(--text-tertiary); line-height: 1.55; }
.import-hint code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.import-actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.import-msg { font-size: 13px; color: var(--text-secondary); }
</style>
