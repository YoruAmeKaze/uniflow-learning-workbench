# Changelog

本项目所有**设计变更**与**代码修改**均记录在此文件，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格。

- 设计变更的详细说明见《技术文档.md》附录 B（按版本记录）
- 版本格式：`[主.次.修订] - YYYY-MM-DD`，按时间倒序

## [Unreleased]

### Added

- **assignment tool**：新增作业查询工具（`action=list` / `action=upcoming`），支持按平台（smartestu/chaoxing）和完成状态过滤，后端注册到 Tool 中心，agent 可调用查询用户作业
- **通知自动定时爬取**：`noticeCrawler.startScheduledSync()` 在后端启动时立即执行一次，此后每天凌晨 00:05 自动爬取教务处官网通知入库，无需手动触发（`npm run crawl:notices` 废弃）
- **LLM 判断重要通知**：每次新增通知后，结合所有用户的个人信息（姓名/学院/专业/年级）逐条调 LLM 判断是否与用户相关，`is_important=true` + `summary` 摘要字段写入数据库
- **通知页重要通知蓝标**：前端通知页顶部独立区域展示 `is_important=true` 的通知（蓝色边框卡片，含 AI 摘要）
- **待办详情可展开**：每条待办左侧新增展开箭头按钮（`chevron-down` 图标），点击旋转 180° 展开详细描述（description 字段）
- **待办截止时间可精确到分钟**：后端 `due_date` 字段从 `date` 升级为 `timestamp`，支持 `YYYY-MM-DDTHH:mm` 格式；前端编辑弹窗新增 `datetime-local` 时间选择器，显示端 `dueStatus()` 精确到分钟（"今天 16:00 截止"）
- **前端通知页重构**：去掉「官网实时」live banner（已由自动爬取替代）；默认 Tab 硬编码为 `school`（学校通知），去掉「全部」分类切换

### Changed

- **agent 系统提示词**：严格区分作业 vs 待办——「作业」（来自教务系统/超星）→ `assignment` 工具；「待办事项」（手动创建的提醒、会议、申请表提交等）→ `todo` 工具。群通知/老师消息 → `todo.create`，不进通知页
- **notification 模型**：新增 `is_important`（boolean）+ `summary`（text）字段，`types.ts` / `models/index.ts` 同步
- **notification 路由**：`serializeTodo` 改用 `formatDateTime`（支持时分秒），`parseDateOnly` → `parseDueDate` 支持多种日期格式

### Fixed

- **agent 无法区分作业和待办**：用户说"有作业吗"时 agent 调用 todo 工具创建待办，而非查作业记录。修复：系统提示词明确 assignment vs todo 的边界

## [0.5.5] - 2026-09-06（爬虫适配新版教务课表页）

### Fixed

- **课表导入失败（502 "教务系统未返回课表数据"）**：重邮教务课表页结构更新后 `<table class='kbtable'>` 改为无 class 的 `<table>`，且每个 `div.kbTd` 自身即为内容容器（不再嵌套 `<div>`）。原 `parseKbTd` 寻找 `kbTd` 的「子 `<div>`」找不到 → 全部 25 门课程返回 null → import 端点 502
  - `parseKbTd` 改为直接读取 `kbTd` 的文本内容
  - `parseWeekRange` 支持逗号分隔 / `单周`/`双周` 等格式，取所有出现周次的 min/max（单双周 / 跳周不精确建模，仅做区间近似）
  - 教师字段跳过 `N节连上` 等实验课标注

## [0.5.4] - 2026-09-06（教务系统课表导入）

### Added

- 后端 `POST /api/courses/import`：调用 `ctx.crawler.crawlAndParse` 从重邮教务系统（`http://jwzx.cqupt.edu.cn/kebiao/kb_stu.php?xh=<学号>`）抓取课表写入数据库；支持 body `{ student_id?, replace? }`，默认 `replace=true` 清空当前用户全部课程再写入；缺学号或抓取/解析失败返回 4xx/502
- 前端 `/courses` 页面顶部「导入课表」折叠面板：默认填登录用户学号（取自 `/api/auth/me`），可手动改；导入成功后自动刷新当前周视图
- 冒烟测试：用桩 crawler（避免依赖外网）验证 import 流程与替换语义

### Docs

- 《技术文档.md》附录 B.7 末尾补充导入流程
- README 功能特性补充「教务系统课表导入」

## [0.5.3] - 2026-09-06（周课表视图）

### Added

- 后端 `GET /api/courses/week?week=N`：返回某周课表（含 `week` / `currentWeek` / `weekStart`(周一日期) / `items`），按 `start_week ≤ week ≤ end_week` 过滤并按星期、开始时间排序；不传 `week` 时自动取当前周
- 后端 `config.ts` 新增 `semester.start`（env `SEMESTER_START`，默认 `2026-09-07`，开学第 1 周周一），用于推算当前周次
- 后端 `routes/course.ts` 导出周次工具函数：`weekIndexOf()`（日期 → 学期周次）、`mondayOfWeek()`（周次 → 周一日期）
- 前端 `/courses` 页面改造为**周课表**：按周一~周日分组展示课程，周次切换条（‹ / › 箭头切周、非本周时显示「回本周」、当前周显示「本周」标签），分组日期与周区间随 `SEMESTER_START` 推算；整周无课显示空态
- 前端 HomePage 快捷入口文案「今日课表」→「本周课表」（入口不变，仍指向 /courses）
- 冒烟测试：周课表接口用例（week=2 全量 / week=30 越界空 / week 缺省取 currentWeek / weekStart 格式）

### Changed

- 课程 API 语义：周课表按「开课周区间」判断，不再只按星期几（原 `/api/courses/today` 保留给首页「今日课程」卡片用）

### Docs

- 《技术文档.md》附录 B 新增 B.7（周课表设计）
- README 功能特性 / 环境变量表补充 `SEMESTER_START`

## [0.5.1] - 2026-08-25（项目全面更名 + README 清理）

### Changed

- **项目全面更名 CampusPilot → UniFlow**（产品名、仓库名、代码、配置、文档、数据库全量统一）：
  - 代码：`index.ts`（入口注释 + 启动日志）、`health.ts`（app 标识）、`package.json`（name/description → uniflow-server）
  - 前端：`App.vue`（页面标题 + 侧边栏品牌）、`LoginPage.vue`（品牌名 + 登录卡标题）、`index.html`（title + description）
  - 配置：`.env` / `.env.example` 注释 + `DB_NAME` → `uniflow`；`config.ts` 默认库名 → `uniflow`
  - 脚本：`dev-db.mjs` 数据目录 `campus-pilot-mysql` → `uniflow-mysql`（%LOCALAPPDATA%）、默认库名 → `uniflow`；`start-with-ollama.mjs` 注释
  - 文档：`README.md` / `技术文档.md` / `开发规范.md` 标题与正文全部替换；项目结构目录 `campusPilot/` → `UniFlow/`
  - 设计产物：`design/*/entry.html` 标题与品牌
  - **数据库迁移**：`campus_pilot` → `uniflow`（含用户/课表/待办/通知数据），开发库目录同步迁移
- README 过时内容清理（v0.5.1 首轮）：
  - 「第一阶段（Foundation）」→ 当前 v0.5.0（意图识别 + RAG 已完成）
  - 「接入 DeepSeek」→ 本地 Ollama 为主（qwythos/Qwen），DeepSeek 为云端备选
  - 技术栈 LLM 行更新；项目结构补齐 v0.5.0 实际文件（embedding/fileParser/rag/upload/noticeCrawler 等）
  - `localhost` → `127.0.0.1`（规避 IPv6 解析坑）
  - Ollama 模型说明 + RAG 需 `ollama pull nomic-embed-text` 提示
  - 环境变量表 LLM_PROVIDER 默认值说明对齐

## [0.3.0] - 2026-08-25

### 设计变更

- **输入处理拆为两个独立步骤**（附录 B.2）：①解析文件（PDF/TXT/MD → 文本）②意图识别（判断是否需要生成待办 / 存入知识库 / 普通聊天）。老师发布的通知不限于 PDF，纯文字（QQ/微信/邮件）同样处理。
- **输入统一抽象为「文件或文字」两条入口**：文件先经步骤①，再与纯文字一起进入步骤②；后续邮件/链接/爬虫渠道可复用步骤②。
- **知识库 MVP 复用 notification 表**：不引入向量库/embedding（第四阶段再评估 RAG）。
- **落库走 Tool 中心**（遵守《开发规范》单向依赖）：Todo 经 `todo` Tool，知识经 `notification` Tool，Agent 不直接访问数据库。

### Added

- 后端 `services/fileParser.ts`：文件解析服务（`unpdf` 提取 PDF 文本，TXT/MD 直接解码；不支持的类型报错）
- 后端 `routes/upload.ts`：`POST /api/chat/upload`（multipart 上传，字段 `file`，限 PDF/TXT/MD，大小上限 `UPLOAD_MAX_MB` 默认 10MB；415/413/422 错误处理）
- 后端 `AgentService.processIncoming()`：意图识别（单次 LLM 调用输出结构化 JSON：intent=todo|knowledge|none + 抽取字段 + 回复），LLM 输出不可信，含宽松 JSON 解析 `parseClassifyJson()`（容忍代码块/多余文字，非法字段降级为普通聊天）
- `TodoTool` 创建待办支持 `course_name` / `description` / `priority`，并按（title + course_name）对未完成待办去重
- `NotificationTool` 新增 `action=create`（知识落库，按 title 去重，category 限 school/college/competition/general）
- 前端 ChatPage：上传按钮（PDF/TXT/MD）+ 结构化反馈徽章（「N 条待办已生成」「已存入知识库」）
- 冒烟测试：文件上传用例（TXT 成功 / 类型不支持 415 / 未登录 401）+ `parseClassifyJson` 解析用例（含代码块、多余文字、非法输出）

### Changed

- `POST /api/chat` 接入意图识别管线，响应新增 `created_todos` / `saved_knowledge` 字段（`reply` 不变，向后兼容）
- `config.ts` 新增 `upload.maxMb`；`.env.example` 新增 `UPLOAD_MAX_MB`
- `index.ts` / `smoke.ts` 注册 upload 路由

### Fixed

- **待办去重失效**：`TodoTool` 去重原先叠加 `course_name` 条件，当两轮 LLM 抽取的课程名不一致（首轮缺失）时去重不命中导致重复创建。修复为**仅按 title 去重**，且命中时自动补全旧记录缺失的课程名/截止日期。
- **OpenAI:DEBUG 日志刷屏**：`.env` 的 `DEBUG=true`（应用调试开关）经 dotenv 加载进 `process.env` 后，被 OpenAI SDK 判定为全量调试模式（`process.env.DEBUG === 'true'`），每次 LLM 请求/响应都打印完整日志。修复：`config.ts` 在 `loadConfig` 中读取 `debug` 后从 `process.env` 移除 `DEBUG`（应用开关保留在 `config.debug`）。
- **前端 AI 对话误报「抱歉，我暂时无法回答」**：根因是 axios 超时 30s，而本地 Ollama 9B 模型实测响应 17–31s（复杂查询链路 >30s）；后端实际每次都成功（HTTP 200），但前端提前中断请求。修复：`frontend/src/api/index.ts` 超时 30s → 120s。

### Changed

- **本地 LLM 模型切换**：`.env` 的 `LLM_MODEL` 由 `qwythos:latest` 换为 `hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q4_K_M`（qwythos-v2，Q4_K_M 量化，实测首响应 13.8s）。备选模型注释同步更新（qwythos:latest / qwen2.5:7b 保留可选）。

### Docs

- 《技术文档.md》新增附录 B（设计变更记录 v0.3.0）
- README 功能特性与环境变量表更新
- 《开发规范.md》架构更新说明补充 v0.3.0
- 本文件（CHANGELOG.md）建立：此后每次设计/代码修改必须记录于此

## [0.5.0] - 2026-08-25（轻量 RAG）

### Added

- 后端 `services/embedding.ts`：文本向量（Ollama `nomic-embed-text`，`/api/embeddings`）+ 余弦相似度
- 后端 `tools/rag.ts`：`rag` Tool——语义检索「我的 + 系统全局」通知，余弦相似度 Top-K（阈值 >0.25，默认 3 条），旧数据 embedding 懒回填（首次检索补齐落库），失败降级
- `notification` 表新增 `embedding` 列（text，存 JSON 数组向量）；`types.ts` / `models/index.ts` 同步
- `config.ts` 新增 `embedding` 段（`EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`，默认本地 Ollama + nomic-embed-text）；`.env.example` 同步
- `AgentService.buildRagContext()`：chat() 前做语义检索，命中内容注入 system prompt（含标题/分类/来源，注明「优先据此回答、不要编造」）；检索失败静默降级为普通对话
- 冒烟测试：rag tool 注册 + schema（query 必填）断言；工具数 3 → 4

### Changed

- 本地 LLM 模型切换（上一条）配套：`qwythos:latest` → `hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q4_K_M`（见上版本条目）

### Design

- **注入式 RAG 而非依赖 function calling**（技术文档附录 B.6）：本地 qwythos 系不支持 tools，改由 agent 在 chat 前无条件检索注入，任何模型可用；rag Tool 同时注册供云端模型主动调用

### Docs

- 《技术文档.md》附录 B.6（RAG 落地实现）
- README 功能特性/技术栈/架构/环境变量表更新
- 《开发规范.md》第四阶段落地标注（见上版本）

## [0.4.0] - 2026-08-25（比赛方案调整，仅文档，无代码）

### 设计变更

- **比赛要求 RAG + Agent + 微调三项能力**，经评估原方案主线（渐进式架构）不变，调整落地策略并新增微调决策（详见《技术文档.md》附录 B.5）：
  - **RAG**（原第四阶段）：落地选型改为「Ollama nomic-embed-text + MySQL 存向量」或「阿里云百炼知识库」二选一，MVP 先做纯向量 Top-K，Hybrid + ReRank 后置
  - **Agent**：比赛展示定位 = 现有单 Agent + Tool Calling + 意图识别；Planner（第五阶段）为演示亮点；Multi-Agent 比赛前禁止不变
  - **微调**（原方案未涉及，新增）：选型阿里云百炼 Qwen SFT（LoRA），目标小而明确（意图识别 JSON 稳定性 + 校园语气），数据数百条（真实记录 + 合成校园场景），交付为百炼 API 经 OpenAI 兼容接口接入
  - **红线**：本地 `qwythos:latest` 为第三方开源模型（Empero AI 基于 Qwen3.5 训练），仅作开发期运行模型，不得作为比赛「微调」成果展示

### Docs

- 《技术文档.md》附录 B 新增 B.5（比赛方案调整：RAG / Agent / 微调）
- 《开发规范.md》第四阶段补充 RAG 落地选型 + 新增「第四阶段补充：微调」章节
- README 无改动（功能未变）

## [0.2.0] - 2026-08

### 变更（历史记录，来自 git 提交前阶段）

- 后端由 FastAPI (Python) 重写为 TypeScript + Cordis 4（详见《技术文档.md》附录 A）
