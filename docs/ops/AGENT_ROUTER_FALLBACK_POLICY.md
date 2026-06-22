# Agent Router Fallback Policy

## Purpose

Agent Router is the mandatory first step before `agent-orchestrator.mjs` creates an Agent task pool. Its fail-down policy favors HOLD and human review whenever confidence, risk, or scope is unclear.

## Confidence Bands

| Confidence | Decision | Action |
| --- | --- | --- |
| `>= 0.80` | `PLAN_READY` | May enter task pool. |
| `0.50 - 0.79` | `ROUTE_REVIEW` | Send to Codex-Orchestrator route-review before task creation. |
| `< 0.50` | `HOLD` | Do not create executable dispatch. |

## Hard HOLD Rules

1. If the request hits `migration`, `schema`, `entity`, `table`, or `column` as an actual change or execution request, route to `HOLD + Schema Gate`.
2. If the request hits production deploy, direct deploy, DB write, or migration execution, route to `HOLD + A6/A7 + human GO`.
3. If risk cannot be determined, route to `HOLD`.
4. If selected scope conflicts with explicit forbidden terms, route to Codex-Orchestrator review.

## Mandatory Agent Rules

1. Auth, RBAC, DataScope, Payment, Finance, or Chanjet risk requires `A2-Security-Regression-Gate` first or in the first read-only review group.
2. Master data, store, company, account, role, dictionary, mapping, readiness, or data preparation requires `A5-Data-Readiness`.
3. UI, UX, page, style, interaction, form, table, responsive, or UAT wording requires `A4-Frontend-UAT-Smoke` as `A4-Frontend-UIUX-UAT`.
4. API, service, controller, module, DTO, backend, or endpoint wording requires `A3-Backend-Critical-Path`.
5. Test, typecheck, CI, build, runtime, startup, smoke, or validation wording requires `A1-CI-Runtime-Gate`.
6. Staging deploy runbook, rollback plan, environment matrix, or health check wording requires `A6-Staging-Deploy-Runbook`.
7. Final gate, GO, HOLD, ROLLBACK, or go/no-go wording requires `A7-Final-QA-Gate`.

## Ambiguous Scope Rules

1. If the request cannot determine frontend versus backend, split into `Codex-Orchestrator + A3 API draft + A4 UI draft + A2 review`.
2. If the request only says `CI readiness` without data, master data, store, company, account, role, organization, or mapping context, do not force A5.
3. If the request says `readiness` with pilot, store, data, mapping, account, company, role, dictionary, organization, or explicit A5 context, A5 is mandatory.

## Execution Boundary

Router never executes Codex CLI, never modifies business code, never merges, never pushes, never deploys, never executes migrations, and never writes databases.
