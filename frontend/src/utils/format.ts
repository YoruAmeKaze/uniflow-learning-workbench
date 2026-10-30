/* 前端显示工具：相对时间 / 优先级 / 星期 */

/** 相对时间：今天/昨天/x天前/x月x日 */
export function formatRelativeTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (diffDays <= 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 待办优先级文案与颜色等级（1-5，数值越高越紧急） */
export const PRIORITY_META: Record<number, { label: string; level: "high" | "mid" | "low" }> = {
  5: { label: "紧急", level: "high" },
  4: { label: "高", level: "high" },
  3: { label: "中", level: "mid" },
  2: { label: "低", level: "low" },
  1: { label: "低", level: "low" },
};

export function priorityMeta(priority: number) {
  return PRIORITY_META[priority] ?? { label: "中", level: "mid" as const };
}

/** 到期状态：支持 YYYY-MM-DD 和 YYYY-MM-DDTHH:mm 格式，精确到分钟 */
export function dueStatus(dueDate?: string | null): { label: string; level: "overdue" | "today" | "soon" | "ok" } {
  if (!dueDate) return { label: "无截止日", level: "ok" };
  // 有时分秒：带 T 或带空格
  const hasTime = /T| /.test(dueDate);
  const date = hasTime ? new Date(dueDate) : new Date(dueDate + "T00:00:00");
  if (Number.isNaN(date.getTime())) return { label: "无截止日", level: "ok" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 0) {
    if (hasTime) {
      const overdue = new Date(today.getTime() - diffMs);
      const h = overdue.getHours(), m = overdue.getMinutes();
      return { label: `已过期 ${Math.abs(diffDays)} 天 ${h}:${String(m).padStart(2,'0')}`, level: "overdue" };
    }
    return { label: `已过期 ${-diffDays} 天`, level: "overdue" };
  }
  if (diffDays === 0) {
    if (hasTime) {
      const h = date.getHours(), m = date.getMinutes();
      return { label: `今天 ${h}:${String(m).padStart(2,'0')} 截止`, level: "today" };
    }
    return { label: "今天截止", level: "today" };
  }
  if (diffDays === 1) {
    if (hasTime) {
      const h = date.getHours(), m = date.getMinutes();
      return { label: `明天 ${h}:${String(m).padStart(2,'0')} 截止`, level: "soon" };
    }
    return { label: "明天截止", level: "soon" };
  }
  if (diffDays <= 3) return { label: `${diffDays} 天后截止`, level: "soon" };
  if (hasTime) {
    const month = date.getMonth() + 1, d = date.getDate(), h = date.getHours(), m = date.getMinutes();
    return { label: `${month}/${d} ${h}:${String(m).padStart(2,'0')}`, level: "ok" };
  }
  return { label: `${diffDays} 天后截止`, level: "ok" };
}

/** 星期几（1-7）→ 中文 */
export function weekdayName(weekday: number): string {
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekday] ?? "";
}

/** 今日星期几（1-7，周日=7） */
export function todayWeekday(): number {
  return new Date().getDay() || 7;
}
