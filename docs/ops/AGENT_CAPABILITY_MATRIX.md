# Agent Capability Matrix

| Agent | Modify Code | Modify Docs | Execute Tests | Execute Migration | Deploy | Approval Required | Risk Domains |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Codex-Orchestrator | No | Yes | Yes | No | No | No | routing, planning, governance |
| A1-CI-Runtime-Gate | No | Yes | Yes | No | No | Yes | CI, runtime, startup, typecheck |
| A2-Security-Regression-Gate | No | Yes | Yes | No | No | Yes | Auth, RBAC, DataScope, audit, JWT, attachment ACL, Chanjet, finance, payment |
| A3-Backend-Critical-Path | Yes | Yes | Yes | No | No | Yes | backend, API, service, controller, RBAC, DataScope, audit |
| A4-Frontend-UAT-Smoke | Yes | Yes | Yes | No | No | Yes | frontend, UAT, permissions UI, smoke |
| A5-Data-Readiness | No | Yes | Yes | No | No | Yes | master data, baseline, pilot data |
| A6-Staging-Deploy-Runbook | No | Yes | Yes | No | No | Yes | staging, runbook, rollback, health check |
| A7-Final-QA-Gate | No | Yes | Yes | No | No | Yes | final QA, GO / HOLD / ROLLBACK decision |

## Hard Rules

1. No Agent can execute migration automatically.
2. No Agent can deploy production automatically.
3. No Agent can write databases automatically.
4. A3/A4 code work requires explicit user approval and later A2/A1 gates.
5. Migration/schema/entity/table/column requests are `HOLD`.
