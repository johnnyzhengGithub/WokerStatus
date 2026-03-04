# 6 个 AI 员工自治公司的项目设计（WorkersStatus 扩展版）

## 1. 项目目标

构建一个“**最小可运营 AI 公司**”：

- 固定 6 个 AI 员工（产品、设计、前端、后端、QA、运维）
- 他们可以**自己找灵感**（提出并筛选产品机会）
- 他们可以**自己处理问题**（发现阻塞、协同决策、闭环修复）
- 他们可以**自己出产品**（从 IDEA 到 RELEASE 的完整流水线）

WorkersStatus 在这个体系中不仅是可视化看板，还应成为“自治流程的操作系统”。

---

## 2. 6 个 AI 员工角色与职责

| AI 员工 | 角色 | 核心职责 | 关键产出 |
|---|---|---|---|
| Orion | PM / 运营中枢 | 定义目标、拆解任务、排优先级、发布节奏 | PRD、路线图、迭代计划 |
| Muse | 设计 / 体验 | 用户研究、信息架构、交互与视觉方案 | Wireframe、UI Spec |
| Atlas | 后端工程 | 领域建模、API、数据层、性能与可靠性 | 服务端代码、API 文档 |
| Nova | 前端工程 | 页面实现、交互、状态管理、可用性优化 | 前端功能、交互实现 |
| Echo | QA / 验证 | 测试策略、回归、缺陷追踪、质量门禁 | 测试报告、缺陷单 |
| Forge | Ops / SRE | 部署、监控、告警、成本与稳定性治理 | 发布流水线、SLO 报告 |

> 关键原则：每个 AI 都有**主责**和**协同责任**，不允许只“接单执行”而不反馈风险。

---

## 3. 自治闭环：Inspire → Build → Learn

### A. 自己找灵感（Inspire）

新增“机会池（Opportunity Backlog）”机制：

1. 每个 AI 可提交机会卡（Opportunity）
   - `title`
   - `problem_statement`
   - `target_user`
   - `expected_value`
   - `confidence`（0-1）
2. Orion 每日触发自动评审（score）
   - 价值（Value）
   - 成本（Effort）
   - 风险（Risk）
   - 时效（Urgency）
3. 得分 Top-N 进入 IDEA 任务池

建议评分公式（MVP）：

```text
score = 0.35 * value + 0.25 * urgency + 0.25 * confidence - 0.15 * effort - 0.10 * risk
```

### B. 自己处理问题（Operate）

建立“阻塞自动治理”规则：

- WAITING > 30m：触发提醒给依赖方
- WAITING > 120m：升级为 BLOCKED，并自动创建协同任务
- BLOCKED > 240m：触发 Orion 主持“快速决策流程”（自动收集上下文并决策）

问题闭环要求：

- 每个 BLOCKED 都必须有 `reason` + `owner` + `next_action`
- 每次状态变更必须带 `decision_log`
- Echo 负责验证“修复是否真实生效”

### C. 自己出产品（Deliver）

统一产品流水线：

`IDEA → DESIGN → BUILD → REVIEW → RELEASE → DONE`

门禁策略（必须满足才可进入下一阶段）：

- DESIGN → BUILD：存在可执行设计说明（Muse + Orion 双确认）
- BUILD → REVIEW：功能与 API 对齐，含最低可运行演示
- REVIEW → RELEASE：Echo 测试通过、Forge 发布检查通过
- RELEASE → DONE：线上指标稳定（错误率、响应时间、关键路径成功率）

---

## 4. 系统模块设计（基于现有 WorkersStatus 演进）

## 4.1 Orchestrator（自治编排器）

新增服务：`orchestrator`

职责：

- 定时轮询 dashboard 数据
- 执行规则引擎（超时、升级、重分配）
- 触发任务创建与状态迁移
- 记录决策日志（可审计）

## 4.2 Inspiration Engine（灵感引擎）

新增对象：`opportunities`

- 来源：用户反馈、异常日志、AI 自主观察
- 输出：按分数排序的机会列表
- 与 tasks 联动：高分机会一键转任务

## 4.3 Problem Solver（问题求解器）

新增对象：`incidents`

- 自动聚合 WAITING/BLOCKED 形成事件
- 自动关联相关任务与责任人
- 提供 RCA（根因分析）模板

## 4.4 Delivery Control（交付控制台）

在 Dashboard 增强：

- 阶段吞吐（每阶段任务数量与停留时长）
- 在制品（WIP）限制提示
- 质量门禁状态（测试通过率、发布准备度）

---

## 5. 数据模型扩展建议

在现有 `users / presence / tasks` 基础上扩展：

### opportunities

- `id`
- `title`
- `problem_statement`
- `proposer_user_id`
- `value_score`
- `effort_score`
- `risk_score`
- `urgency_score`
- `confidence`
- `status` (`NEW`, `SCORING`, `SELECTED`, `DISMISSED`)
- `created_at`, `updated_at`

### incidents

- `id`
- `type` (`WAITING_TIMEOUT`, `BLOCKED_TIMEOUT`, `QUALITY_GATE_FAIL`)
- `severity` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
- `related_user_id`
- `related_task_id`
- `reason`
- `action_plan`
- `status` (`OPEN`, `MITIGATING`, `RESOLVED`)
- `created_at`, `resolved_at`

### decisions

- `id`
- `source` (`ORION`, `RULE_ENGINE`, `HUMAN_OVERRIDE`)
- `context`
- `decision`
- `impact`
- `created_at`

---

## 6. API 扩展建议（MVP+）

- `POST /api/opportunities`：提交灵感机会
- `GET /api/opportunities`：查看机会池
- `POST /api/opportunities/:id/select`：转为任务
- `POST /api/incidents`：创建事件（通常由规则引擎自动触发）
- `GET /api/incidents`：查看问题池
- `POST /api/tasks/:id/stage-transition`：任务阶段流转（带门禁校验）
- `GET /api/decisions`：查询决策日志

---

## 7. KPI 与自治健康度

推荐新增 8 个核心指标：

1. **Inspiration Rate**：每周新增机会数
2. **Opportunity Conversion**：机会转任务比
3. **Lead Time**：IDEA 到 DONE 总时长
4. **Flow Efficiency**：有效工作时长 / 总时长
5. **Waiting Ratio**：WAITING 总时长占比
6. **Blocker MTTR**：阻塞平均恢复时长
7. **Release Success Rate**：发布成功率
8. **Reopen Rate**：已关闭任务重新打开比例

---

## 8. 三阶段落地路线图

### Phase 1（1-2 周）— 看得见

- 完善 tasks 阶段流转与门禁校验
- 加入 WAITING/BLOCKED 超时升级规则
- 增加 decision_log 与 incident 列表

### Phase 2（2-4 周）— 能自治

- 上线 opportunities 机会池与评分机制
- 自动把高分机会转 IDEA 任务
- Orion 自动每日生成“优先级建议”

### Phase 3（4-8 周）— 可优化

- 基于历史数据优化评分参数
- 引入简单的“策略回测”（不同优先级策略对交付速度影响）
- 将自治规则升级为可配置策略模板

---

## 9. MVP 验收标准（你可以直接用）

满足以下条件可判定“6 个 AI 员工公司”最小闭环成立：

- 能自动产生并筛选机会（>= 10 条/周）
- 能自动识别并升级阻塞（超时事件自动创建率 >= 95%）
- 能自动推进任务到发布（无需人工逐条催办）
- Lead Time 连续两周下降
- 发布成功率 >= 95%

---

## 10. 一句话定位

**WorkersStatus 不只是“看板”，而是 6 个 AI 员工协同工作的自治操作系统。**
