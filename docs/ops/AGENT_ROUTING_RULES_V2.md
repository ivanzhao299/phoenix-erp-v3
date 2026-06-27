# Agent Routing Rules V2

## Mandatory Router Entry

All natural language requests must pass `scripts/ops/agent-route-request.mjs` before `agent-orchestrator.mjs` creates a task pool. If Router returns `HOLD`, the Orchestrator must HOLD. If Router returns `selected_agents` or `parallel_groups`, the Orchestrator must use them and must not drop A4 or A5.

## Core Routing

| Request Signal | Agents | Minimum Risk | Notes |
| --- | --- | --- | --- |
| CI, typecheck, startup, runtime validation | A1 | L1 | Can run with A2/A5 when read-only. |
| Login, permission, RBAC, DataScope, JWT, audit, attachment ACL | A2, A1 | L3 | A2 must review before merge. |
| Backend API, service, controller, module wiring | A3, A2, A1 | L3 | A3 code requires approval. |
| Frontend page, UI/UX, style, layout, form, table, button, responsive, UAT smoke | A4, A1 | L2 | A4 owns frontend implementation and UI/UX polish; A1 validates after changes. |
| Master data, pilot store, baseline data, data readiness | A5, A2 | L3 | A5 is read-only unless explicitly approved. |
| Staging, runbook, rollback plan, health check | A6, A7 | L3 | A6 does not deploy. |
| Final QA, GO / GO WITH CONDITIONS / HOLD / ROLLBACK | A7 | L3 | A7 does not production deploy. |
| Finance, payment, Chanjet | A2, A3, A5, A1 | L4 | Security review first. |
| migration, schema, entity, table, column | HOLD | L5 | No parallel work; requires manual Schema Gate. |
| production deploy, DB write, migration execution | HOLD | L5 | Human GO only. |

## Store Payment Authorization / Protected Attachment Routing

The following signals must route to `A3-Backend-Critical-Path` because they imply backend wiring, controller/service boundaries, permission registration, or protected attachment endpoints:

菜单码, 角色授权, 权限 seed, 权限 register, 后端授权, protected preview, protected download, attachment preview, attachment download, 附件 protected, 附件预览, 附件下载, 接口方案, 后端边界, API draft, service, controller, module.

The following signals must route to `A2-Security-Regression-Gate` because they imply permission, RBAC, protected attachment ACL, or overreach risk:

权限, 菜单码, 角色授权, RBAC, DataScope, protected attachment, protected preview, protected download, 附件 ACL, 附件访问控制, 越权, 敏感日志, 安全审查, security review.

If the request contains both menu/role authorization and protected preview/download attachment wording, Router must select both A2 and A3.

## Seven-Agent Dry-Run

Requests that explicitly ask for all seven Agents, `seven-agent`, or `A1/A2/A5/A3/A4/A6/A7` route to all A1-A7 for planning only unless separately approved.

## A5 Data Readiness Keywords

The following keywords route to `A5-Data-Readiness` when they refer to data readiness, pilot preparation, master data, or mapping checks:

中文: 数据准备, 数据检查, 数据 readiness, readiness, 主数据, 门店, 门店映射, 公司映射, 账户映射, 角色映射, 字典, 组织, 组织映射, 基础数据, 数据核查, 数据就绪, 试点 readiness, 试点准备.

English: data readiness, readiness, master data, store mapping, company mapping, account mapping, role mapping, organization mapping, data check, data validation, pilot readiness.

Explicit Agent mentions also route to A5: `A5`, `A5 数据`, `A5-Data-Readiness`, `Data Readiness`.

Avoidance rule: `CI readiness` alone does not force A5 unless data, master data, store, company, account, role, organization, mapping, or explicit A5 context is present.

## A4 UI/UX Keywords

The following natural language keywords route primarily to A4:

页面, 前端, UI, UX, 样式, 美化, 好看, 清爽, 现代化, 布局, 按钮, 表格, 表单, 弹窗, 抽屉, 筛选, 状态标签, 颜色, 间距, 响应式, 移动端, PC端, 交互, 用户体验, UAT, smoke.

## A4 Collaboration Rules

1. Pure frontend style optimization:
   - Primary: A4.
   - Post-validation: A1.
   - A3 is not required.
2. Frontend page needs new API:
   - A3 owns backend API.
   - A4 owns frontend page and UI/UX.
   - A2 reviews permissions and overreach risk.
   - A1 runs typecheck / smoke.
3. Frontend permission buttons and menu visibility:
   - A4 owns display logic.
   - A2 owns RBAC / DataScope security review.
   - A1 validates.
4. Production deployment:
   - A6 owns deployment runbook.
   - A7 owns final GO / HOLD / ROLLBACK.

## Allowlist / Denylist Constraint Parser

Natural language constraints must be parsed before final Agent selection.

Priority:

1. denylist
2. allowlist
3. keyword routing

Allowlist markers include `只允许`, `仅允许`, `only allow`, and `allow only`.

Examples:

- `只允许 A1/A2/A5` restricts final `selected_agents` to A1, A2, and A5.
- `只允许 A2 安全审查、A1 CI、A5 数据 readiness` restricts final `selected_agents` to A2, A1, and A5.

Denylist markers include `不允许`, `禁止`, `不要`, `不得`, `disallow`, and `exclude`.

Examples:

- `不允许 A3/A4` must not trigger A3 or A4.
- `不允许后端代码` denies A3.
- `不允许前端代码` denies A4.
- `不改业务代码` denies A3/A4 for execution routing.
- `不修改 apps/api` denies A3.
- `不修改 apps/web` denies A4.

Hard constraints that must be preserved in route-plan:

- `不执行 migration`
- `不写数据库` / `不写库`
- `不部署`
- `不 push`
- `不改业务代码`
- `不修改 apps/api`
- `不修改 apps/web`

If allowlist and denylist conflict, Router must HOLD with a clear conflict reason.
