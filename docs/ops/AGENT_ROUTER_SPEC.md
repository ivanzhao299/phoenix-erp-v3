# Agent Router Spec

## Why Agent Router Exists

Natural language routing had started to depend on scattered keyword checks inside the Orchestrator. That made A5 Data Readiness easy to miss and made UI/UX routing hard to reason about. Agent Router centralizes routing rules in a machine-readable file and exposes one reusable routing function.

## Router vs Orchestrator

| Component | Responsibility |
| --- | --- |
| `agent-route-request.mjs` | Convert natural language into selected Agents, confidence, risk domains, HOLD reasons, recommended sequence, and parallel groups. |
| `agent-orchestrator.mjs` | Use the route plan to create requirement specs, Agent contracts, assembled prompts, task queue entries, and dry-run execution plans. |

## Rule File

Rules live in `docs/ops/AGENT_ROUTER_RULES.json`. Each Agent entry includes:

- `agent_name`
- `canonical_agent`
- `role`
- `primary_domains`
- `keywords_zh`
- `keywords_en`
- `explicit_mentions`
- `negative_keywords`
- `allowed_task_types`
- `forbidden_task_types`
- `risk_domains`
- `requires_pre_review`
- `requires_post_validation`
- `default_handoff`
- `parallel_allowed_with`
- `confidence_weight`

`canonical_agent` preserves current worktree and dispatch-map compatibility. For example, A4 is positioned as `A4-Frontend-UIUX-UAT`, while the canonical worker key remains `A4-Frontend-UAT-Smoke`.

## Confidence Algorithm

The router combines:

1. Explicit Agent mentions.
2. Chinese keyword matches.
3. English keyword matches.
4. Mandatory fail-down domain rules.
5. Agent confidence weights.
6. Hard HOLD detection for migration/schema/entity/table/column, DB write, and production deploy.

Confidence `>= 0.80` may enter a task pool. Confidence below that falls down to route-review or HOLD.

## Multi-Agent Routing

Common combinations:

| Request shape | Selected Agents |
| --- | --- |
| CI / validation / smoke | A1 |
| Security / RBAC / DataScope | A2 + A1 |
| Backend API + permission | A3 + A2 + A1 |
| Frontend UI/UX only | A4 + A1 |
| Data readiness / mapping | A5 |
| Staging runbook / rollback | A6 + A7 |
| Migration + deploy | HOLD |

## Fail-down and HOLD

The router must prefer a HOLD over unsafe execution. It holds for schema changes, DB writes, production deploy, or unclear risk. It routes sensitive domains through A2 and data readiness through A5.

## Seven Agent Examples

| Agent | Example wording |
| --- | --- |
| Codex-Orchestrator | `拆分需求并生成任务池` |
| A1 | `跑 CI、typecheck、smoke 验证` |
| A2 | `审查 RBAC、DataScope、附件 ACL` |
| A3 | `新增后端 API controller/service` |
| A4 | `优化页面 UI、表格、表单、按钮、响应式` |
| A5 | `检查门店、公司、账户、角色映射 readiness` |
| A6 | `准备预发部署 runbook 和回滚方案` |
| A7 | `输出最终 GO/HOLD/ROLLBACK 判断` |

## Store Payment Example

For Store Payment pilot readiness with security review, CI validation, and data readiness, the router must select:

1. `A2-Security-Regression-Gate`
2. `A1-CI-Runtime-Gate`
3. `A5-Data-Readiness`

For Store Payment UI polish without backend changes, the router must select:

1. `A4-Frontend-UAT-Smoke`
2. `A1-CI-Runtime-Gate`

## Orchestrator Integration

`agent-orchestrator.mjs` imports `routeRequest()` from `agent-route-request.mjs`. It uses:

1. `selected_agents` for task generation.
2. `parallel_groups` for dispatch grouping.
3. `held_reasons` to stop unsafe plans.
4. `route_decision` to HOLD when the router says HOLD.

The Orchestrator's older classifier remains a fallback only when Router has no selected Agents.
