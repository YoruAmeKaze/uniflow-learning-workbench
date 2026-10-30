<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { notificationAPI } from "../api";
import { formatRelativeTime } from "../utils/format";

const items = ref<any[]>([]);
const categories = ref<string[]>([]);
const activeCat = ref("school"); // 默认只看学校通知
const loading = ref(true);
const loadingMore = ref(false);
const page = ref(1);
const total = ref(0);
const showComposer = ref(false);
const saving = ref(false);
const saveError = ref("");
const knowledgeForm = ref({
  title: "",
  content: "",
  category: "general",
  source: "手工录入",
  source_url: "",
});

const hasMore = () => items.value.length < total.value;
const categoryLabel = (category: string) => category === "school" ? "校园通知" : category === "competition" ? "比赛" : category === "college" ? "学院" : "我的知识";

async function load() {
  loading.value = true;
  page.value = 1;
  try {
    const res = await notificationAPI.list({ category: activeCat.value, page: 1 });
    items.value = res.data.items;
    total.value = res.data.total;
    // 更新分类 tab
    const catRes = await notificationAPI.categories();
    categories.value = catRes.data;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore()) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const res = await notificationAPI.list({ category: activeCat.value, page: next });
    const seen = new Set(items.value.map((n) => n.id));
    items.value.push(...res.data.items.filter((n: any) => !seen.has(n.id)));
    total.value = res.data.total;
    page.value = next;
  } finally {
    loadingMore.value = false;
  }
}

async function markRead(n: any) {
  if (n.is_read) return;
  await notificationAPI.markRead(n.id);
  n.is_read = true;
}

async function selectCategory(category: string) {
  if (category === activeCat.value) return;
  activeCat.value = category;
  await load();
}

async function saveKnowledge() {
  if (!knowledgeForm.value.title.trim() || !knowledgeForm.value.content.trim() || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    await notificationAPI.create({
      title: knowledgeForm.value.title.trim(),
      content: knowledgeForm.value.content.trim(),
      category: knowledgeForm.value.category,
      source: knowledgeForm.value.source.trim() || "手工录入",
      source_url: knowledgeForm.value.source_url.trim(),
    });
    activeCat.value = knowledgeForm.value.category;
    knowledgeForm.value = { title: "", content: "", category: "general", source: "手工录入", source_url: "" };
    showComposer.value = false;
    await load();
  } catch (error: any) {
    saveError.value = error?.response?.data?.message || "保存失败，请稍后重试";
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h2>校园通知</h2>
      <div class="header-actions">
        <button class="btn btn-primary btn-small" @click="showComposer = !showComposer">
          {{ showComposer ? "取消录入" : "录入知识" }}
        </button>
        <span v-if="items.length" class="unread-count" :class="{ none: !items.some((n) => !n.is_read) }">
          {{ items.filter((n) => !n.is_read).length }} 条未读
        </span>
      </div>
    </header>

    <form v-if="showComposer" class="composer card-surface" @submit.prevent="saveKnowledge">
      <div class="composer-title">新增知识</div>
      <input v-model="knowledgeForm.title" required maxlength="200" placeholder="标题，例如：奖学金申请要求" aria-label="知识标题" />
      <textarea v-model="knowledgeForm.content" required rows="6" placeholder="粘贴或输入完整正文，系统会自动分成 300–500 token 片段用于检索" aria-label="知识正文" />
      <div class="composer-grid">
        <select v-model="knowledgeForm.category" aria-label="知识分类">
          <option value="general">我的知识</option>
          <option value="school">校园通知</option>
          <option value="college">学院通知</option>
          <option value="competition">比赛活动</option>
        </select>
        <input v-model="knowledgeForm.source" placeholder="来源名称（可选）" aria-label="来源名称" />
      </div>
      <input v-model="knowledgeForm.source_url" type="url" placeholder="原文链接（可选，回答中可点击）" aria-label="原文链接" />
      <p v-if="saveError" class="form-error">{{ saveError }}</p>
      <button class="btn btn-primary" type="submit" :disabled="saving || !knowledgeForm.title.trim() || !knowledgeForm.content.trim()">
        {{ saving ? "保存中…" : "保存并建立知识索引" }}
      </button>
    </form>

    <!-- 重要通知高亮区 -->
    <section v-if="items.filter((n) => n.is_important).length" class="important-section" aria-label="重要通知">
      <div v-for="n in items.filter((n) => n.is_important)" :key="n.id" class="important-item card-surface">
        <div class="important-header">
          <span class="important-tag">重要</span>
          <span class="important-title">{{ n.title }}</span>
        </div>
        <p v-if="n.summary" class="important-summary">{{ n.summary }}</p>
        <div class="important-meta">
          <span>{{ formatRelativeTime(n.published_at) }}</span>
        </div>
      </div>
    </section>

    <!-- 官方通知与人工录入知识分开浏览 -->
    <div class="tabs" role="tablist" aria-label="通知分类">
      <button
        v-for="category in ['school', ...categories.filter((c) => c !== 'school')]"
        :key="category"
        class="tab"
        :class="{ active: activeCat === category }"
        @click="selectCategory(category)"
      >{{ categoryLabel(category) }}</button>
    </div>

    <div v-if="loading" class="list" aria-busy="true">
      <div v-for="i in 5" :key="i" class="item skeleton" style="height: 76px" />
    </div>

    <div v-else-if="!items.length" class="empty-state card-surface">
      <span class="empty-icon"><AppIcon name="inbox" :size="30" /></span>
      <div class="empty-title">暂时没有通知</div>
      <p class="empty-desc">新的校园通知会第一时间出现在这里</p>
    </div>

    <div v-else class="list">
      <div
        v-for="n in items"
        :key="n.id"
        class="item card-surface"
        :class="{ unread: !n.is_read }"
        role="button"
        tabindex="0"
        :aria-label="`${n.title}，${n.is_read ? '已读' : '未读'}，点击标记已读`"
        @click="markRead(n)"
        @keyup.enter="markRead(n)"
      >
        <div class="item-top">
          <span class="item-title">{{ n.title }}</span>
          <span v-if="!n.is_read" class="dot" aria-hidden="true" />
        </div>
        <div class="item-meta">
          <span class="cat">{{ n.category }}</span>
          <span>{{ formatRelativeTime(n.published_at) }}</span>
        </div>
      </div>

      <div class="pager">
        <button
          v-if="hasMore()"
          class="btn btn-outline"
          :disabled="loadingMore"
          @click="loadMore"
        >
          <template v-if="loadingMore">加载中…</template>
          <template v-else>加载更多（{{ items.length }}/{{ total }}）</template>
        </button>
        <p v-else class="all-loaded">已显示全部 {{ total }} 条通知</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 680px; margin: 0 auto; padding: var(--space-4); }
.empty-icon {
  width: 56px; height: 56px; margin: 0 auto var(--space-3);
  display: flex; align-items: center; justify-content: center;
  background: var(--success-soft); color: var(--success); border-radius: var(--radius-lg);
}
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-3);
}
.page-header h2 { font-size: 20px; font-weight: 700; }
.header-actions { display: flex; align-items: center; gap: var(--space-2); }
.btn-small { padding: 6px 10px; font-size: 12px; }
.composer {
  display: flex; flex-direction: column; gap: var(--space-2);
  padding: var(--space-4); margin-bottom: var(--space-3);
}
.composer-title { font-size: 15px; font-weight: 650; }
.composer input, .composer textarea, .composer select {
  width: 100%; box-sizing: border-box; padding: 9px 10px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text); font: inherit; font-size: 13px;
}
.composer textarea { resize: vertical; line-height: 1.5; }
.composer input:focus, .composer textarea:focus, .composer select:focus { outline: none; border-color: var(--brand); }
.composer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.form-error { margin: 0; color: var(--danger); font-size: 12px; }
.unread-count {
  font-size: 12px; font-weight: 600; padding: 2px 10px;
  border-radius: 999px; background: var(--danger-soft); color: var(--danger);
}
.unread-count.none { background: var(--surface-2); color: var(--text-tertiary); }

/* 重要通知 */
.important-section { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
.important-item {
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
  padding: var(--space-3);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.important-header { display: flex; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-1); }
.important-tag {
  flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 1px 6px;
  border-radius: 999px; background: var(--brand); color: #fff;
}
.important-title { font-size: 14px; font-weight: 600; color: var(--brand); line-height: 1.4; }
.important-summary { font-size: 13px; color: var(--text-secondary); margin: var(--space-1) 0 var(--space-2); line-height: 1.5; }
.important-meta { font-size: 12px; color: var(--text-tertiary); }

.tabs { display: flex; gap: var(--space-1); background: var(--surface-2); padding: 3px; border-radius: 999px; margin-bottom: var(--space-3); }
.tab {
  padding: var(--space-1) var(--space-3); border: none; border-radius: 999px;
  background: transparent; color: var(--text-secondary); font-size: 13px;
  font-family: inherit; cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.tab.active { background: var(--surface); color: var(--brand); font-weight: 600; box-shadow: var(--shadow-card); }

.list { display: flex; flex-direction: column; gap: var(--space-2); }
.item {
  display: flex; flex-direction: column; gap: 4px;
  padding: var(--space-3) var(--space-4);
  transition: opacity var(--duration-fast) var(--ease-out);
  cursor: pointer;
}
.item.unread .item-title { font-weight: 600; }
.item-top { display: flex; align-items: center; gap: var(--space-2); }
.item-title { font-size: 14px; color: var(--text); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); flex-shrink: 0; }
.item-meta { display: flex; align-items: center; gap: var(--space-2); font-size: 12px; color: var(--text-tertiary); }
.cat { font-weight: 500; }
.pager { margin-top: var(--space-3); }
.btn {
  display: block; width: 100%; padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md); font-size: 13px; font-family: inherit; cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}
.btn-outline { background: transparent; border: 1.5px solid var(--border); color: var(--text-secondary); }
.btn-outline:not(:disabled):hover { background: var(--surface-2); }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.all-loaded { text-align: center; font-size: 13px; color: var(--text-tertiary); padding: var(--space-3); }
</style>
