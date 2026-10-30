<script setup lang="ts">
import { ref, nextTick, watch } from "vue";
import AppIcon from "../components/AppIcon.vue";
import { chatAPI } from "../api";

// 对话记录：保存在 sessionStorage（当前标签页会话）
// —— 切换页面/组件卸载不丢失；关闭网页（标签页）时自动清除
const HISTORY_KEY = "campuspilot.chat.history";

interface ChatMsg {
  role: string;
  content: string;
  meta?: {
    createdTodos?: { title: string; duplicated?: boolean }[];
    savedKnowledge?: { title: string; duplicated?: boolean } | null;
    plan?: {
      label: string;
      generation: 'model' | 'fallback';
      steps: { tool: string; label: string; status: 'success' | 'failed'; count: number }[];
    };
  };
}

function loadHistory(): ChatMsg[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((m) => m && typeof m.content === "string")
      : [];
  } catch {
    return [];
  }
}

const messages = ref<ChatMsg[]>(loadHistory());
const input = ref("");
const loading = ref(false);
const msgBox = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// 消息变化即持久化
watch(
  messages,
  (list) => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      /* 存储满/隐私模式等极端情况：忽略即可 */
    }
  },
  { deep: true },
);

async function scrollToBottom() {
  await nextTick();
  msgBox.value?.scrollTo({ top: msgBox.value.scrollHeight });
}

async function send() {
  if (!input.value.trim() || loading.value) return;
  const msg = input.value;
  input.value = "";
  messages.value.push({ role: "user", content: msg });
  loading.value = true;
  await scrollToBottom();
  try {
    const res = await chatAPI.send(msg);
    messages.value.push({
      role: "assistant",
      content: res.data.reply,
      meta: { createdTodos: res.data.created_todos, savedKnowledge: res.data.saved_knowledge, plan: res.data.plan },
    });
  } catch {
    // 具体、可操作的错误提示
    messages.value.push({ role: "assistant", content: "抱歉，我暂时无法回答。请稍后重试，或检查网络连接。" });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
}

// 上传文件（PDF / TXT / MD）→ 解析 + 意图识别（自动生成待办 / 存入知识库）
async function onFilePicked(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  const file = inputEl.files?.[0];
  inputEl.value = ""; // 允许重复选择同一文件
  if (!file || loading.value) return;

  messages.value.push({ role: "user", content: `📄 ${file.name}` });
  loading.value = true;
  await scrollToBottom();
  try {
    const res = await chatAPI.upload(file);
    const data = res.data;
    messages.value.push({
      role: "assistant",
      content: data.reply,
      meta: {
        createdTodos: data.created_todos,
        savedKnowledge: data.saved_knowledge,
      },
    });
  } catch (err: any) {
    const detail = err?.response?.data?.message;
    messages.value.push({
      role: "assistant",
      content: detail || "抱歉，文件处理失败，请稍后重试或换一个文件。",
    });
  } finally {
    loading.value = false;
    await scrollToBottom();
  }
}

// 回车发送：中文输入法选词（composition）期间不触发
function onEnter(e: KeyboardEvent) {
  if (e.isComposing) return;
  send();
}

</script>

<template>
  <div class="chat-page">
    <header><h2>AI 助手</h2></header>
    <div class="messages" ref="msgBox">
      <div v-for="(m, i) in messages" :key="i" :class="m.role">
        <div class="bubble">{{ m.content }}</div>
        <details v-if="m.meta?.plan" class="plan-details">
          <summary>查看安排依据 · {{ m.meta.plan.label }}</summary>
          <p>{{ m.meta.plan.generation === 'model' ? '已根据查询到的课程、作业和待办生成建议' : '当前使用基础排序生成建议' }}</p>
          <div v-for="step in m.meta.plan.steps" :key="step.tool">
            {{ step.label }}：{{ step.status === 'success' ? `已查询 ${step.count} 条` : '查询失败，安排可能不完整' }}
          </div>
        </details>
        <div v-if="m.meta?.createdTodos?.length || m.meta?.savedKnowledge" class="meta-badges">
          <span v-if="m.meta.createdTodos?.length" class="badge badge-todo">
            {{ m.meta.createdTodos.length }} 条待办已生成
          </span>
          <span v-if="m.meta.savedKnowledge" class="badge badge-knowledge">
            已存入知识库
          </span>
        </div>
      </div>
      <div v-if="loading" class="assistant" aria-label="AI 思考中">
        <div class="bubble typing">
          <span /><span /><span />
        </div>
      </div>
      <div v-if="!messages.length" class="empty">
        <span class="empty-icon"><AppIcon name="chat" :size="32" /></span>
        <p>输入问题开始对话</p>
        <p class="empty-hint">试试：「今天有什么安排」「最近有什么作业」</p>
        <p class="empty-hint">或上传老师发的 PDF / 文字通知，自动生成待办</p>
      </div>
    </div>
    <div class="input-bar">
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.txt,.md"
        class="file-input"
        @change="onFilePicked"
        aria-label="上传文件"
      />
      <button
        class="btn btn-ghost upload-btn"
        @click="fileInput?.click()"
        :disabled="loading"
        title="上传 PDF / TXT / MD 文件"
        aria-label="上传文件"
      >
        <AppIcon name="paperclip" :size="18" />
      </button>
      <input
        v-model="input"
        @keydown.enter.prevent="onEnter"
        placeholder="输入你的问题，或粘贴老师发的通知..."
        :disabled="loading"
        aria-label="输入问题"
      />
      <button class="btn btn-primary" @click="send" :disabled="loading || !input.trim()">发送</button>
    </div>
  </div>
</template>

<style scoped>
.plan-details { max-width: 82%; margin-bottom: 12px; padding: 8px 12px; font-size: 12px; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px; }
.plan-details summary { cursor: pointer; }
.plan-details p { margin: 8px 0; }
.chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - env(safe-area-inset-bottom, 0px));
  width: 100%;
}
header { padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border); }
header h2 { margin: 0; font-size: 18px; }
.messages { flex: 1; overflow-y: auto; padding: var(--space-4) var(--space-5); }
.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: var(--radius);
  margin-bottom: var(--space-3);
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 14px;
  box-shadow: var(--shadow-card);
}
.user { display: flex; justify-content: flex-end; }
.user .bubble {
  background: var(--brand);
  color: white;
  border-bottom-right-radius: 4px;
}
.assistant .bubble {
  background: var(--surface);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
/* RAG 命中来源：回答下方展示可点击的原文链接 */
.source-list {
  width: min(82%, 620px);
  margin: -4px 0 var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.source-heading { font-size: 12px; color: var(--text-tertiary); margin-bottom: 2px; }
.source-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface);
  text-decoration: none;
  font-size: 12px;
}
.source-card:hover { border-color: var(--brand); color: var(--brand); }
.source-card-static { cursor: default; }
.source-index {
  width: 18px; height: 18px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-weight: 700;
}
.source-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.source-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.source-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-tertiary); }
/* 结构化反馈徽章（待办已生成 / 已存入知识库） */
.meta-badges {
  display: flex;
  gap: var(--space-2);
  margin: -6px 0 var(--space-3);
  padding-left: 2px;
  flex-wrap: wrap;
}
.assistant .meta-badges { justify-content: flex-start; }
.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}
.badge-todo { background: var(--brand-soft); color: var(--brand); }
.badge-knowledge { background: var(--success-soft); color: var(--success); }
.empty { text-align: center; color: var(--text-secondary); margin-top: 30%; }
.empty-icon {
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
.empty p { font-size: 14px; }
.empty-hint { font-size: 12px; color: var(--text-tertiary); margin-top: var(--space-1); }

/* 打字指示器（骨架风，替代 spinner） */
.typing { display: inline-flex; gap: 4px; padding: 14px; }
.typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--text-tertiary);
  animation: typing-bounce 1.2s var(--ease-out) infinite;
}
.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.input-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.file-input { display: none; }
.upload-btn { padding: 8px; flex-shrink: 0; color: var(--text-tertiary); }
.upload-btn:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand); }
.input-bar input {
  flex: 1;
  padding: 10px var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
}
.input-bar input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.input-bar input:disabled { background: var(--surface-2); }
.input-bar button { flex-shrink: 0; }

/* 桌面端：无底部导航，聊天区占满内容高度并居中限宽 */
@media (min-width: 1024px) {
  .chat-page { height: 100vh; max-width: 820px; margin: 0 auto; }
}
</style>
