# Agent Routing Rules V2

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
