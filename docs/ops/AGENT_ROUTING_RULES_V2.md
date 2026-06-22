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
