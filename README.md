# WorkersStatus (MVP)

**Observe work. Remove waiting. Ship faster.**

WorkersStatus 是一个用于观察 6 人小团队工作状态的实时面板，包含：

- **Landing**：展示产品能力的首页，风格接近 `voxyz` 的 Products
- **Dashboard**：6 人状态墙 + 顶部 KPI + 简单队列区

## 团队设定：6 个 AI 员工

在默认示例中，6 个 `users` 都是具备固定分工的 AI：

- **User_1 – Atlas（后端工程 AI）**
  - 负责 Domain / 数据建模、对局逻辑、API 设计和性能。
  - 在 `gomoku` 项目中实现对局引擎、房间/匹配、持久化抽象。
  - 不确定规则（如禁手、平局）时，会将自己设为 `WAITING for PM/Designer` 并写清 `reason`。
- **User_2 – Nova（前端工程 AI）**
  - 负责 UI 实现与交互逻辑。
  - 在 `gomoku` 中实现棋盘渲染、下子动画、胜负高亮、与后端 API 对接。
  - 若后端接口未定，会 `WAITING for Atlas`，reason 写 “等待接口定义/Mock”。
- **User_3 – Muse（设计 / 体验 AI）**
  - 负责信息架构、布局、交互 flow、视觉基调。
  - 在任何人开始具体实现前先产出简单 wireframe/交互说明。
  - 需求模糊时 `WAITING for PM`，reason 写“需要产品目标/约束”。
- **User_4 – Orion（PM / 产品 AI）**
  - 负责拆目标、排优先级、维护任务树（IDEA → DONE）、协调其它 5 名 AI。
  - 所有 `gomoku - ...` 任务由 Orion 创建并分配 owner。
  - 每当看到 WAITING 黄/红卡，会新建/调整任务（例如 “确认禁手规则”）并指派合适的 AI。
- **User_5 – Echo（QA / 验证 AI）**
  - 负责用例设计、功能/回归测试。
  - 在 `gomoku` 中设计测试矩阵（单人对局、网络抖动、边界条件），执行回归。
  - 测试环境/数据不足时会 `BLOCKED`，reason 精确到是哪一项有问题。
- **User_6 – Forge（Ops / SRE AI）**
  - 负责部署、监控、可观测性。
  - 在 `gomoku` 中负责本地→云环境一致性、上线步骤与简单监控。
  - 发现性能或错误率问题时，会创建新的 “gomoku - 可靠性改进” 任务并指派给 Atlas/Nova。

### 示例：用 `gomoku` 跑一遍完整工作流

以 PM AI（Orion）视角，典型的 `gomoku` 工作流是：

1. **IDEA / 拆解**
   - 创建顶层任务：`gomoku`（stage = IDEA, owner = Orion）。
   - 拆成若干子任务（都以 `gomoku - ...` 开头），并分配到不同 AI：
     - `gomoku - 产品目标 & 骨架需求`（Orion, DESIGN）
     - `gomoku - UI 草图 & 交互（桌面版）`（Muse, DESIGN）
     - `gomoku - 后端房间/对局模型`（Atlas, BUILD）
     - `gomoku - 前端棋盘 & 下子逻辑`（Nova, BUILD）
     - `gomoku - QA 用例 & 回归清单`（Echo, BUILD/REVIEW）
     - `gomoku - 上线 & 发布说明`（Forge, RELEASE）
2. **DESIGN 阶段**
   - Muse 在 DESIGN 任务上把自己设置为 `WORKING`，产出 wireframe / 交互说明。
   - 需要产品决策时，把自己设为 `WAITING for Orion`，reason 写明问题。
3. **BUILD 阶段**
   - Atlas 和 Nova 接各自 BUILD 任务，status 切到 `WORKING`。
   - 依赖不满足时（规则/接口/设计），会用 `WAITING` + `waiting_for_user_id` 精确指向阻塞来源。
4. **REVIEW / QA 阶段**
   - Echo 在 QA 相关任务上 `WORKING`，发现问题时创建 `gomoku - Bug: ...` 子任务并指派给 Atlas/Nova。
   - Atlas/Nova 修完后切回 `WORKING` / `WAITING`，直到问题关闭。
5. **RELEASE / DONE**
   - Forge 承接 `gomoku - 上线 & 发布说明`，在 `RELEASE` 阶段工作。
   - 所有子任务完成后，将它们的 `stage` 标为 `DONE`，最后将顶层 `gomoku` 标为 `DONE`，作为收尾。

Orion（PM AI）只需要每天在 Dashboard 中盯住两件事：

- 哪些 `gomoku - ...` 任务还停在 IDEA/DESIGN/BUILD，没有 owner 或没有向前推进？
- 哪些 WAITING 卡片已经变黄/变红，需要他主动协调解除阻塞？

## 页面结构

### Landing

- **Hero**
  - 大标题：`Observe work. Remove waiting. Ship faster.`
  - 副标题：一句话讲清实时可见：6 人在做什么、在等谁、卡在哪里
  - 按钮：
    - **Open Dashboard**：跳转 `/dashboard.html`
    - **Create Task**：滚动到下方 CTA / 引导（当前为静态）
- **Products / Modules（核心卡片网格）**
  - 用产品卡片的方式展示 4–6 个能力（标题 + 3–5 bullet + 链接/按钮）
  - 建议的 6 张卡：
    - **Live Presence**：每人状态 Working / Waiting / Blocked / Idle
    - **Pipeline Handoff**：6 阶段交付链（当前部分仅文案，功能待实现）
    - **Waiting Graph**：依赖图，谁在等谁（当前仅文案）
    - **SLA Heat**：超时 / 快超时提醒（当前仅文案）
    - **Audit Trail**：操作审计（当前仅文案）
    - **Alerts**：阻塞 / 超时推送（当前仅文案）
- **CTA**
  - 文案：`Start monitoring in 2 minutes (local) / Deploy to cloud`
  - 引导本地启动 + 未来可部署到云端

### Dashboard

分为三块：**Global Overview / Team Wall / Queue**

- **Global Overview（顶栏 KPI）**
  - Working: X
  - Waiting: X
  - Blocked: X
  - Idle: X
  - Longest waiting: User_3 42m（根据 WAITING 时长计算）
- **Team Wall（6 人状态墙，核心）**
  - 每人一张暗色卡片（类似 voxyz）
  - 展示字段：
    - 名字 + 角色 + 小头像（首字母）
    - 当前状态（WORKING / WAITING / BLOCKED / IDLE，颜色标签）
    - 当前任务（无则显示 `—`）
    - Waiting for（如果 WAITING，显示被依赖的人）
    - Reason（WAITING / BLOCKED 必填）
    - 计时器：`since 00:42:13`，根据 `since_time` 实时更新
  - 卡片上的操作按钮（模拟「员工自己」操作）：
    - Set Working / Set Waiting / Set Blocked / Set Idle（填表单预填 state）
- **Queue / Tasks（右侧）**
  - Open tasks 列表（从 presence 中的 `task_title` 推导）
  - Create task：当前简化为「更新 presence」表单，未来可扩展真正的任务系统

## 视觉风格（接近 voxyz）

- **底色**：非常深的灰黑（非纯黑），有轻微渐变与光晕
- **大字**：Hero 标题很大，字距略紧
- **卡片**：
  - 圆角较大、细边框
  - 轻微发光，hover 时卡片抬起 2–4px
- **点缀**：
  - 使用青绿 / 紫色渐变线、光晕做点缀
  - 顶部 KPI、用户卡、产品卡都有细节光晕
- **动效**：
  - 进入时轻微上浮 + 淡入（由 CSS 阴影 + hover 效果模拟）
  - hover 时卡片抬起少量、边框变亮
- **布局**：
  - 近似 12 栅格布局，合理留白
  - 信息以短句 bullet 展示，每卡 3–5 条

## 数据模型（MVP）

当前仅在内存中保存「可观察性」数据和简单任务数据：

- **表 1：users（固定 6 人）**
  - `id`：1–6
  - `name`：`User_1` ... `User_6`
  - `role`：Engineer / Designer / PM / QA / Ops
- **表 2：presence（每人一行最新状态）**
  - `user_id`
  - `state`：`WORKING` / `WAITING` / `BLOCKED` / `IDLE`
  - `task_title`：文本即可（后面可替换为 `task_id`）
  - `waiting_for_user_id`：可空
  - `reason`：WAITING/BLOCKED 必填
  - `since_time`
  - `last_updated_at`

- **表 3：tasks（MVP 任务系统）**
  - `id`：自增
  - `title`：任务标题
  - `stage`：`IDEA` / `DESIGN` / `BUILD` / `REVIEW` / `RELEASE` / `DONE`
  - `owner_user_id`：任务负责人（关联 `users.id`）
  - `status`：`OPEN` / 未来可以支持 `DONE`
  - `created_at`
  - `updated_at`

### 交互规则（重要约束）

- **WORKING** 必须有 `task_title`（或将来接入 `task_id`）
- **WAITING** 必须有 `waiting_for_user_id` + `reason`
- **BLOCKED** 必须有 `reason`
- 超过阈值时卡片高亮：
  - WAITING > 30 min：卡片变黄（`user-card--waiting-warning`）
  - WAITING > 120 min：卡片变红（`user-card--waiting-critical`）

## 接口设计（MVP）

- **GET `/api/dashboard`**
  - 功能：拉取 dashboard 全量数据
  - 返回：
    - `users`：6 人列表
    - `presence`：数组，每项 `{ user, presence }`
    - `tasks`：数组，每项 `{ id, title, stage, owner_user_id, status, created_at, updated_at }`
    - `summary`：
      - `working / waiting / blocked / idle`
      - `longest_waiting_user`
      - `longest_waiting_minutes`
- **POST `/api/presence/update`**
  - 功能：更新某个人的状态
  - 请求体：
    - `user_id`（必填，1–6）
    - `state`：`WORKING` / `WAITING` / `BLOCKED` / `IDLE`
    - `task_title`（WORKING 时必填）
    - `waiting_for_user_id`（WAITING 时必填）
    - `reason`（WAITING/BLOCKED 时必填）
  - 校验规则见「交互规则」
  - 成功后：
    - 更新内存中的 presence
    - 通过 WebSocket 广播变化
- **POST `/api/tasks`**
  - 功能：创建一个任务
  - 请求体：
    - `title`（必填）
    - `stage`：`IDEA` / `DESIGN` / `BUILD` / `REVIEW` / `RELEASE` / `DONE`
    - `owner_user_id`（必填，1–6）
  - 返回：
    - `task`：新建任务对象
- **GET `/api/tasks`**
  - 功能：获取所有 `status = OPEN` 的任务（方便调试）
  - 返回：
    - `tasks`：任务数组
- **WebSocket**
  - 地址：与 HTTP 同域（`ws://localhost:3000`）
  - 消息：
    - `type: "presence_update"`
    - `payload: { user, presence }`
  - Dashboard 收到后只更新对应卡片 + 重新计算 summary

## 本地运行

```bash
npm install
npm start
```

然后访问：

- Landing: `http://localhost:3000/index.html`
- Dashboard: `http://localhost:3000/dashboard.html`

## 当前实现进度（对照需求）

- **Landing**
  - [x] Hero：标题 / 副标题 / CTA 按钮
  - [x] 6 张 Products 卡：Live Presence / Pipeline Handoff / Waiting Graph / SLA Heat / Audit Trail / Alerts
  - [x] CTA：Start monitoring in 2 minutes（引导本地试用）
  - [x] 深色 + 霓虹渐变视觉、卡片 hover 抬起
- **Dashboard**
  - [x] Global Overview 顶栏 KPI（Working / Waiting / Blocked / Idle / Longest waiting）
  - [x] 6 人状态墙（暗色卡片 + 标签 + 计时器）
  - [x] Queue / Tasks（基于内存 tasks 表：title / stage / owner）
  - [x] 表单更新 presence（模拟 Set Working / Waiting / Blocked / Idle）
- **后端 / 实时**
  - [x] 内存 users + presence 数据模型
  - [x] `POST /api/presence/update`
  - [x] `GET /api/dashboard`
  - [x] WebSocket 广播 presence 更新
  - [ ] 持久化存储（未来接 DB）
  - [x] 内存 tasks 系统（Task 表 + Create API + Dashboard Queue + 简单任务详情）
  - [ ] 任务状态流转 / 任务完成 / 关联 presence 的 task_id

> 每次改需求时，可以在这里勾选/补充条目，方便跟踪进度。

"# WokerStatus"

## 进一步设计（自治 AI 公司）

如果你要把本项目升级为“6 个 AI 员工可自主找灵感、处理问题、产出产品”的自治公司模型，请参考：

- `docs/AI_AUTONOMOUS_COMPANY_DESIGN.md`
