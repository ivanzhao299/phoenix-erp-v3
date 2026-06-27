# 试运行问题反馈 → 智能体自动修正 · 路线图

> 本批已交付"人性化反馈窗口 + 智能体自愈数据模型脚手架"。本文档说明后续把反馈接入智能体自动修正的管道设计。

## 已就位（本批）

- **反馈窗口**：`apps/web/src/components/uat/FeedbackWidget.tsx`，挂在 `/pilot-run`（试运行执行中心）。
  右下角浮动「问题反馈」→ 弹窗（标题/类型/严重度/描述，自动附带当前页面 `moduleCode`）→ `POST /api/uat/feedbacks`。
  「我的反馈」页签展示状态 + **智能体处理态**徽标。
- **数据模型**：`uat_feedbacks` 加三列（迁移 `1782064418112-AddUatFeedbackAgentFields`）：
  | 列 | 取值 | 含义 |
  |---|---|---|
  | `agent_status` | NONE/QUEUED/ANALYZING/PROPOSED/APPLIED/FAILED/SKIPPED | 智能体处理流转 |
  | `agent_note` | text | 分析结论 / 拟修方案摘要 |
  | `agent_ref` | varchar | 自动修复的 PR/commit/会话引用（可追溯） |
- **回写通道**：`PATCH /api/uat/feedbacks/:id` 已支持 `agentStatus/agentNote/agentRef`，供智能体回写。

## 后续管道（待接入）

```
用户在试运行页提交反馈
   └─ POST /api/uat/feedbacks  (agent_status=NONE)
        │
        ▼  ① 触发器 / 轮询 worker 拾取 NONE 且 feedback_type=BUG 的反馈
   智能体编排（codex-orchestrator 或本仓 Agent）
        ├─ PATCH agent_status=QUEUED → ANALYZING
        ├─ 读 moduleCode + description 定位代码（路由→页面→service）
        ├─ 复现 + 本地 smoke（沿用本仓"原生 PG + 端到端 smoke"纪律）
        ├─ 生成补丁 → 对抗 review → 绿则
        │     PATCH agent_status=PROPOSED, agent_note=方案, agent_ref=分支/PR
        ├─ 低风险且 smoke 绿 → 自动开 PR（draft）→ agent_status=APPLIED
        └─ 失败/高风险 → agent_status=FAILED|SKIPPED + agent_note 说明，转人工
```

### 接入点建议

1. **拾取**：新增 `apps/api/src/modules/uat/services/feedback-agent-dispatch.service.ts`（cron 或 DB 通知），
   选 `agent_status='NONE' AND feedback_type='BUG' AND status='OPEN'` 的反馈入队。
2. **编排**：复用现有多智能体工厂（A1–A7 / codex-orchestrator）或 Workflow，按本仓纪律
   （tsc + 本地 smoke + 对抗 review + 绿部署）执行修复，全程用 `PATCH` 回写 `agent_status`。
3. **门禁**：只对低风险（前端 gate/文案/明确栈）自动开 draft PR；触财务/库存/RBAC/迁移的转人工。
4. **可视**：反馈窗口「我的反馈」已展示 `agent_status` 徽标，用户实时看到"已自动修复 / 转人工"。

### 安全边界

- 智能体自动改动**必须** draft PR + 人工合并，不直接推 main。
- 触红线域（finance/wms/auth/migrations）一律 `SKIPPED` 转人工。
- `agent_ref` 全程留痕，便于审计每一条自动修复的来源。
