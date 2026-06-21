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

## Dispatch Rules

1. If any high-risk keyword appears, route to at least Codex-Orchestrator, A2, and A7.
2. If data shape or baseline is touched, add A5 and require human confirmation.
3. If deployment or rollback is mentioned, add A6; production deploy remains forbidden until GO_NO_GO.
4. If CI output is required or missing, add A1.
5. If frontend user path is affected, add A4 and require UAT smoke criteria.
6. During W5-RESUME-LIMITED, docs and templates may proceed; migrations, schema, production deploy, and core business changes remain blocked.
