# UniFlow

> 校园执行型 AI Agent —— 从「对话」到「执行」，帮助大学生完成校园事务

## ✨ 项目简介

UniFlow 是一个面向大学生的**校园执行型 AI Agent**，核心理念是 **Execution over Conversation**：不止于回答，而是真正帮用户完成校园事务——查询课表、管理待办、获取校园通知、答疑解惑。

当前版本采用 Vue 3 前端 + Cordis（TypeScript）后端，具备意图识别自动执行（文字/文件 → 生成待办 / 存入知识库）、RAG 知识问答、Tool Calling Agent 与 Planner/Skill 多工具规划能力。比赛链路使用阿里云百炼 Qwen SFT 微调模型和 `text-embedding-v4` 向量模型。

本地开发时，浏览器访问前端 `http://127.0.0.1:5173`；`http://127.0.0.1:8000` 是后端 API，健康检查地址为 `http://127.0.0.1:8000/health`，后端根路径不提供网页。

## 🚀 功能特性

- 🔐 **用户系统**：注册 / 登录（JWT 认证，bcrypt 密码加密）
- 🤖 **AI 聊天**：接入阿里云百炼 Qwen 微调模型或本地 Ollama；自动识别输入意图（生成待办 / 存入知识库 / 普通聊天）；严格区分作业（assignment 工具）与待办事项（todo 工具）
- 📄 **文件解析**：上传老师发布的 PDF / TXT / MD（实验指导书、作业要求、通知），AI 自动提取 DDL 生成待办，或把通知存入知识库
- 🧠 **RAG 知识问答**：基于校园通知知识库做语义检索，百炼 `text-embedding-v4` 向量配合余弦相似度 Top-K 回答政策、比赛、奖学金等问题
- 📚 **课表管理**：周课表视图（按校历周次，周一~周日分组，支持前后翻周）+ 课程增删查 + 今日课程展示，支持教务系统课表爬虫导入
- ✅ **待办管理**：优先级 / 截止日期（精确到分钟）/ 详细描述 / 完成状态；可展开查看详情，支持内联编辑（标题、描述、截止时间）
- 📝 **作业管理**：从教务系统（smartestu）和学习通（chaoxing）自动拉取作业列表，截止时间精确到分钟，近期待办提醒
- 🔔 **校园通知**：后端启动时 + 每天凌晨 00:05 自动爬取教务处官网通知入库；AI 结合用户个人信息判断重要通知并高亮展示（蓝标 + 摘要）；仅显示学校官方通知
- 📱 **移动优先**：底部导航栏，触屏友好的响应式页面

> **学校适配范围**：教务课表和校园通知爬虫需要按学校系统分别适配。目前仅完成重庆邮电大学教务系统适配；接入其他学校时需要重新实现登录、页面解析和接口配置。作业平台适配也可能因学校接入方式不同而需要调整。

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 · TypeScript · Vite · Vue Router · Pinia · Axios |
| 后端 | **Cordis 4**（依赖注入容器）· @cordisjs/plugin-server（Koa HTTP）· @cordisjs/plugin-database（Minato 类型化数据库）|
| 数据库 | MySQL 8.x（可切换内存驱动做测试）|
| LLM | 阿里云百炼 Qwen 微调模型（OpenAI 兼容 API）；本地 Ollama 可选 |
| Embedding | 阿里云百炼 text-embedding-v4（OpenAI 兼容 API）；Ollama 可选 |
| PDF 解析 | unpdf（pdf.js 纯 JS 提取文字版 PDF 文本）|
| 爬虫 | Node fetch + Cheerio |

## 🏗 Cordis 架构

后端以 Cordis 的 `Context`（依赖注入容器）为核心，一切皆为可注入的服务：

```
Context (容器)
├── plugin-database        → ctx.model（定义数据模型）/ ctx.database（查询 API）
│   └── plugin-database-mysql（MySQL 驱动，自动建表/迁移）
├── plugin-server          → ctx.server（Koa HTTP 路由）
├── services/              → 业务服务
│   ├── auth               → JWT + bcrypt（ctx.auth）
│   ├── agent              → LLM 对话（ctx.agent）
│   ├── crawler            → 教务课表爬虫（ctx.crawler）
│   ├── noticeCrawler      → 教务处通知爬虫（启动时+每天凌晨自动爬取，LLM 判断重要通知）
│   └── embedding          → RAG 向量（百炼 text-embedding-v4 / Ollama）
├── tools/                 → Tool 中心（ctx.tool）：course / todo / notification / user_profile / rag / assignment
└── routes/                → API 路由插件（auth / chat / upload / course / todo / notification）
```

- **依赖注入**：插件通过 `apply.inject = ['server', 'database', ...]` 声明依赖，加载顺序自动解析
- **生命周期**：`ctx.plugin()` 注册插件，启动/关闭由 Cordis fiber 管理
- **事件系统**：`ctx.on / ctx.emit / ctx.serial` 等事件机制贯穿服务间通信

## 📁 项目结构

```
UniFlow/
├── backend/               # Cordis (TypeScript) 后端
│   └── src/
│       ├── index.ts       # 应用入口（Context 装配 + 生命周期）
│       ├── config.ts      # 环境变量配置（.env）
│       ├── types.ts       # 数据行类型 + Tables 声明
│       ├── models/        # 数据模型定义（ctx.model.extend）
│       ├── services/      # 业务服务（auth / agent / crawler / noticeCrawler / embedding / fileParser）
│       ├── tools/         # Agent 工具（course / todo / notification / user_profile / rag / assignment）
│       ├── routes/        # API 路由插件（auth / chat / upload / course / todo / notification / cors / health）
│       ├── utils/         # HTTP 辅助（错误 / 鉴权 / 日期序列化）
│       └── smoke.ts       # 冒烟测试（内存数据库驱动，端到端验证全部 API）
├── frontend/              # Vue3 前端
│   └── src/
│       ├── api/           # Axios 封装 + API 调用
│       ├── router/        # 路由配置 + 登录守卫
│       ├── components/    # 通用组件（AppIcon 图标系统）
│       └── views/         # 页面组件（登录/首页/聊天/通知/课表/待办/个人）
├── .env.example           # 环境变量模板
├── CHANGELOG.md           # 版本变更记录
└── 开发规范.md / 技术文档.md  # 项目文档
```

## 🏁 快速开始

### 评委一键启动

在 Windows 中双击项目根目录的 BAT 文件，或在终端运行：

```bat
启动评委演示.bat
```

脚本会按需安装依赖，并分别打开后端和前端窗口。后端启动时会自动初始化开发数据库、创建演示账号和写入课程、作业、待办及校园通知示例数据。演示数据脚本可重复执行，不会重复添加相同记录。

演示账号：`2026000001`
演示密码：`UniFlowDemo2026!`

> 该账号和数据仅用于比赛演示，部署到正式环境前请修改或删除。

### 环境要求

- Node.js 22.12+
- MySQL 8.x

### 1. 初始化数据库

```sql
CREATE DATABASE IF NOT EXISTS uniflow DEFAULT CHARACTER SET utf8mb4;
```

> 后端启动时会自动创建数据表（Minato schema 同步），无需手工建表。

### 2. 配置环境变量

```powershell
# 在项目根目录执行，复制模板并填写真实值
Copy-Item .env.example .env
```

`.env` 必须放在项目根目录（与 `backend`、`frontend` 同级）。云端模式至少填写 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`；不要把 `.env` 提交到 Git。

### 3. 安装依赖并启动后端

```bash
cd backend
npm install
npm run start:dev    # 编译、启动项目内开发数据库，然后启动后端
```

`npm run start:dev` 会自动执行演示数据初始化；也可以单独运行 `npm run seed:demo` 补充演示数据。

后端默认运行在 `http://127.0.0.1:8000`，健康检查见 `http://127.0.0.1:8000/health`。看到 `数据库 uniflow 就绪` 和 `LLM 已连接` 后，再打开前端页面。

如果已有外部 MySQL，也可以分开执行：

```powershell
npm run build
npm start
```

**没有可用的 MySQL？** 运行内置的开发数据库助手（无需管理员权限、不触碰系统 MySQL，数据保存在 `%LOCALAPPDATA%\uniflow-mysql`，端口与 `.env` 的 `DB_PORT` 一致）：

```bash
npm run db:start     # 启动（首次自动初始化 + 按 .env 设置 root 密码 + 建库）
npm start            # 另开终端启动后端
npm run db:stop      # 停止开发数据库
npm run db:status    # 查看状态
```

> 注意：若 `.env` 的 `DB_PORT` 与本机系统 MySQL 冲突，请修改 `.env` 后同时重启数据库与后端。

开发模式（自动重编译）：

```bash
npm run dev          # tsc --watch
# 另开终端运行 npm start
```

### 3b. 一键启动：本地 Ollama 模型（可选，临时替代云端 LLM）

后端通过 OpenAI 兼容接口支持任意 LLM。想暂时用**本地模型**（不消耗云端额度、离线可用），一条命令拉起全部：

```bash
cd backend
npm run start:ollama   # 自动：拉起 ollama serve → 拉取模型 → 启动开发数据库 → 启动后端
```

- 首次运行会自动下载模型（默认使用 `.env` 的 `LLM_MODEL`，未设置时为 `qwen2.5:7b`，约 4-7GB，纯 CPU 也可运行）
- 指定其他模型：`npm run start:ollama -- --model qwen2.5:3b`（或设环境变量 `OLLAMA_MODEL`）
- 数据库已由外部 MySQL 提供时：`npm run start:ollama -- --no-db`
- 停止：`Ctrl+C` 停止后端；`ollama serve` 保持后台运行，下次启动秒级就绪
- 切回云端：把 `.env` 中 `LLM_PROVIDER=ollama` 段注释、DeepSeek 段取消注释即可

> 前置：安装 [Ollama](https://ollama.com/download)（Windows 安装包）。本脚本会自动定位 `ollama.exe`。
>
> 默认 RAG 使用百炼 `text-embedding-v4`，不需要启动 Ollama。若切回本地向量，再执行 `ollama pull nomic-embed-text`。

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://127.0.0.1:5173`（开发环境建议用 127.0.0.1 访问，避免 localhost 解析到 IPv6 导致跨域问题）。

如需指定后端地址，在 `frontend/.env.local` 中设置：

```env
VITE_API_BASE=http://127.0.0.1:8000
```

### 5. 冒烟测试（无需真实数据库）

```bash
cd backend
npm run smoke        # 使用内存数据库驱动端到端验证全部 API
npm run test:planner # Planner/Skill 离线回归测试
```

提交前建议执行完整检查：

```powershell
npm --prefix backend run typecheck
npm --prefix backend run smoke
npm --prefix backend run test:planner
npm --prefix frontend run build
```

### 6. 导入课表（可选）

```ts
// 见 backend/src/services/crawler.ts
const courses = await ctx.crawler.crawlAndParse('你的学号')
```

## ⚙️ 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SERVER_HOST` / `SERVER_PORT` | 后端监听地址和端口 | `127.0.0.1` / `8000` |
| `DB_HOST` / `DB_PORT` | MySQL 地址和端口 | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` | MySQL 账号密码 | `root` / `123456` |
| `DB_NAME` | 数据库名 | `uniflow` |
| `DB_CHARSET` | 数据库字符集 | `utf8mb4_general_ci` |
| `SECRET_KEY` | JWT 签名密钥 | 建议改为随机值 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT 过期时间（分钟） | `1440` |
| `LLM_PROVIDER` | LLM 提供方：`ollama`（本地，当前默认）或 `openai`（云端） | `openai`（模板） |
| `LLM_API_KEY` | LLM API Key（Ollama 模式可填任意非空值） | 空 |
| `LLM_BASE_URL` | LLM API 地址 | `https://api.deepseek.com` |
| `LLM_MODEL` | 模型名称（Ollama 模式为本地模型名） | `deepseek-chat` |
| `OLLAMA_MODEL` | `start:ollama` 脚本使用的本地模型（未设置时取 `LLM_MODEL`） | `qwen2.5:7b` |
| `UPLOAD_MAX_MB` | 文件上传大小上限（MB） | `10` |
| `EMBEDDING_PROVIDER` | 向量服务：`openai`（百炼）或 `ollama` | `ollama` |
| `EMBEDDING_BASE_URL` | Embedding 服务地址（RAG 向量） | 百炼兼容接口 / Ollama 地址 |
| `EMBEDDING_MODEL` | Embedding 模型名 | `text-embedding-v4`（百炼）或 `nomic-embed-text`（Ollama） |
| `SEMESTER_START` | 开学第 1 周周一的日期（周课表据此推算当前周，`YYYY-MM-DD`） | `2026-09-07` |

## Planner 与项目内 Skills

聊天支持单日安排、本周计划和任务优先级三个 Skill。单日安排支持今天、明天、后天、几天后和明确日期；模型选择技能、按偏好建议时间块，服务器查询真实工具数据、校验课程冲突及截止时间，并在模型不可用时返回基础计划。聊天中的“查看安排依据”可展开查询记录。

实现、边界与测试说明见 [Skills 文档](backend/src/skills/README.md)。后端运行 `npm run test:planner` 可执行离线回归测试。

比赛提交所需的模型/算法、运行、评测和 Demo 说明见 [比赛交付说明](比赛交付说明.md)。

## 🧪 微调与评测数据

微调数据和百炼上传说明位于 `data/finetune/`，当前包含 train 141 条、validation 26 条、独立 test 32 条。重新生成数据：

```powershell
cd backend
npm run generate:finetune
```

`data/finetune/bailian-eval.xlsx` 是百炼模型评测使用的 Excel 模板；评测分数以百炼控制台结果为准，不把本地工程测试通过率当作模型准确率。

## 🔧 常见问题

- 浏览器显示 `8000` 无法访问网页：这是后端 API 端口，请打开 `http://127.0.0.1:5173`；后端只用 `/health` 检查。
- 前端提示网络错误：确认后端仍在运行，并检查 `frontend/.env.local` 的 `VITE_API_BASE` 是否为 `http://127.0.0.1:8000`。
- 3306 端口被系统 MySQL 占用：让 `.env` 的 `DB_PORT` 与实际端口一致，或停止冲突服务后重新运行 `npm run start:dev`。
- 云端模型返回 404：检查百炼控制台中的模型部署名称、地域和 API Key 是否属于同一账号；模型名称必须完整匹配。
- 百炼 Qwen3 非流式请求报 `enable_thinking`：项目已在 Agent 和通知同步请求中关闭思考模式，修改模型调用时需保留该参数。

## 📜 License

[MIT](LICENSE)
