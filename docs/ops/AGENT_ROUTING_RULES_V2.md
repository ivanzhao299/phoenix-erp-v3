# Agent Routing Rules V2

## Core Routing

| Request Signal | Agents | Minimum Risk | Notes |
| --- | --- | --- | --- |
| CI, typecheck, startup, runtime validation | A1 | L1 | Can run with A2/A5 when read-only. |
| Login, permission, RBAC, DataScope, JWT, audit, attachment ACL | A2, A1 | L3 | A2 must review before merge. |
| Backend API, service, controller, module wiring | A3, A2, A1 | L3 | A3 code requires approval. |
| Frontend page, form, table, button, UAT smoke | A4, A1 | L2 | A4 starts after backend/API readiness. |
| Master data, pilot store, baseline data, data readiness | A5, A2 | L3 | A5 is read-only unless explicitly approved. |
| Staging, runbook, rollback plan, health check | A6, A7 | L3 | A6 does not deploy. |
| Final QA, GO / GO WITH CONDITIONS / HOLD / ROLLBACK | A7 | L3 | A7 does not production deploy. |
| Finance, payment, Chanjet | A2, A3, A5, A1 | L4 | Security review first. |
| migration, schema, entity, table, column | HOLD | L5 | No parallel work; requires manual Schema Gate. |
| production deploy, DB write, migration execution | HOLD | L5 | Human GO only. |

## Seven-Agent Dry-Run

Requests that explicitly ask for all seven Agents, `seven-agent`, or `A1/A2/A5/A3/A4/A6/A7` route to all A1-A7 for planning only unless separately approved.
