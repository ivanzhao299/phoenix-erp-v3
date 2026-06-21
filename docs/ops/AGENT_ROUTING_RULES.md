# Agent Routing Rules

> Purpose: route requirements to fixed Phoenix ERP Delivery Factory Agents by risk and impact surface.

## Agents

| Agent | Responsibility |
| --- | --- |
| Codex-Orchestrator | Overall command, intake, planning, risk classification, dispatch, final synthesis. |
| A1-CI-Runtime-Gate | Build, type-check, tests, startup, CI workflow/runtime evidence. |
| A2-Security-Regression-Gate | Permissions, auth, logs, external interface security, regression risk. |
| A3-Backend-Critical-Path | Backend implementation and critical path behavior. |
| A4-Frontend-UAT-Smoke | Frontend user paths, UAT smoke, screenshots where relevant. |
| A5-Data-Readiness | Master data, data baseline, gray data, data integrity checks. |
| A6-Staging-Deploy-Runbook | Staging deployment, runbooks, rollback readiness. |
| A7-Final-QA-Gate | Final release acceptance, go/no-go recommendation. |

## Risk Levels

| Level | Definition |
| --- | --- |
| Low | Docs, tests, isolated UI copy/style, no auth/data/finance/deploy effect. |
| Medium | One module behavior change, non-critical data read/write, routine API/page change. |
| High | Auth/RBAC/DataScope, finance, master data, third-party interface, migration, deploy, core workflow. |
| Critical | Production incident, data loss/corruption risk, security bypass, payment/accounting error, irreversible migration, production deploy/rollback. |

## Natural Language Risk Levels

| Level | Definition | Auto-development |
| --- | --- | --- |
| L0 | No-code coordination, read-only status, task board update. | No code. |
| L1 | Docs, templates, isolated UI text. | Yes inside approved docs/UI copy scope. |
| L2 | Low-risk UI/test change with no sensitive data or behavior change. | Yes inside explicit scope. |
| L3 | Product behavior, login/menu/permission visibility, finance display, external diagnostics. | Limited; human approval before behavior changes. |
| L4 | Master data, data shape, migration/schema/deploy-adjacent, financial data correctness. | No by default; human approval required. |
| L5 | Production deploy/rollback, irreversible data repair, security bypass, accounting mutation. | No; GO/NO-GO required. |

## Routing Matrix

| Trigger keywords or signals | Risk | Trigger Agents | Auto-fix allowed | Human confirmation | Migration allowed | Production deploy allowed | Forbidden actions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| build, typecheck, lint, test, startup, CI, workflow, pnpm, Docker build | Medium | A1 | Yes, for scripts/config/docs inside approved scope | If workflow/deploy changes | No by default | No | Bypassing CI, weakening gates without approval |
| login, current user, JWT, auth, dev login, token, session | High/Critical | A2, A1, A7 | No for behavior; yes for docs/tests after approval | Yes | No | No | Auth bypass, secret exposure, weakening guards |
| permission, role, RBAC, menu, DataScope, CODEOWNERS/security owner | High | A2, A3, A7 | No for logic during freeze | Yes | No | No | Permission business logic changes during freeze |
| notification, presence, SSE, WebSocket, realtime | Medium/High | A2, A3, A4, A1 | Limited to tests/docs unless approved | If user-visible or auth-sensitive | No | No | Unbounded reconnect/logging sensitive payloads |
| Chanjet, Yonyou, 用友, external API, signature, webhook, sync | High/Critical | A2, A3, A7 | No for sync logic during freeze | Yes | No | No | Changing signature/sync business logic during freeze |
| procurement, sales, finance, POS, receipt, payment, invoice, delivery | High | A3, A4, A2, A7 | No for core behavior during freeze | Yes | No | No | Core business changes during freeze |
| master data, baseline, seed, import, migration, schema, entity, table, column | High/Critical | A5, A2, A1, A7 | No | Yes | Only with explicit non-freeze approval | No | New migration/schema/entity/table/column in W5-limited mode |
| staging, deploy, rollback, release, go-live, production | Critical | A6, A1, A7, Codex-Orchestrator | Docs/runbook only | Yes | No unless separately approved | Only after GO decision | Direct production deploy, deployment chain changes during freeze |
| page, UI, UAT, smoke, screenshot, browser path | Medium | A4, A1 | Yes within approved UI scope | If financial/security/master data page | No | No | Hiding failed UAT evidence |
| docs, template, governance, delivery process, runbook | Low/Medium | Codex-Orchestrator, A7 as reviewer | Yes | Optional unless release policy changes | No | No | Duplicating existing files without audit |

## Natural Language Keyword Routing

| Natural language keywords | Agents | Minimum risk | Required handling |
| --- | --- | --- | --- |
| 登录 / 权限 / 菜单 / 角色 / 看不到数据 | A2 + A3 + A4 | L3 | Clarify role, menu code, account, environment; no permission behavior change without approval. |
| 财务 / 收款 / 付款 / 应收 / 应付 / 账套 | A3 + A5 + A2 | L3 | Clarify period, company, counterparty, evidence; no accounting/data mutation without approval. |
| 主数据 / 公司 / 项目 / 养殖场 / 门店 / 仓库 | A5 first, read-only | L4 | Read-only baseline first; require approval before data import, workflow, or selector behavior changes. |
| 用友 / 畅捷通 / webhook / callback / token | A2 + A3 + A6 | L3 | Treat secrets and signatures as sensitive; require approval before auth/sync changes. |
| 页面 / 按钮 / 表格 / 显示 / 文案 | A4 | L1-L2 | Auto-development allowed only when no sensitive module behavior changes. |
| 上线 / 部署 / 回滚 / 服务器 | A6 + A7 | L3 | Runbook/GO gate first; production deploy forbidden until explicit GO. |
| migration / schema / 字段 / 表结构 | A5 + A1 + A7 | L4-L5 | Must ask for human confirmation before any implementation. |

## Dispatch Rules

1. If any high-risk keyword appears, route to at least Codex-Orchestrator, A2, and A7.
2. If data shape or baseline is touched, add A5 and require human confirmation.
3. If deployment or rollback is mentioned, add A6; production deploy remains forbidden until GO_NO_GO.
4. If CI output is required or missing, add A1.
5. If frontend user path is affected, add A4 and require UAT smoke criteria.
6. During W5-RESUME-LIMITED, docs and templates may proceed; migrations, schema, production deploy, and core business changes remain blocked.
