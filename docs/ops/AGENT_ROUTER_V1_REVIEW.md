# Agent Router V1 Review

## Goal

Establish a machine-readable Agent Router for natural language requests before `agent-orchestrator.mjs` creates any Agent task pool.

## Added / Modified Files

| File | Purpose |
| --- | --- |
| `docs/ops/AGENT_ROUTER_RULES.json` | Machine-readable A1-A7 and Codex-Orchestrator routing rules. |
| `scripts/ops/agent-route-request.mjs` | CLI and reusable `routeRequest()` module for natural language routing. |
| `scripts/ops/agent-orchestrator.mjs` | Now uses Router route plans before falling back to legacy classification. |
| `docs/ops/AGENT_ROUTER_SPEC.md` | Router design, confidence rules, examples, and Orchestrator integration. |
| `docs/ops/AGENT_ROUTER_FALLBACK_POLICY.md` | Fail-down and HOLD policy. |
| `docs/ops/AGENT_TASK_BOARD.md` | Records `AGENT-ROUTER-V1`. |

## Router Rule Structure

Each Agent rule includes:

- Agent identity and canonical dispatch key.
- Chinese and English keywords.
- Explicit Agent mentions.
- Negative keywords.
- Allowed and forbidden task types.
- Risk domains.
- Pre-review and post-validation requirements.
- Default handoff and parallel compatibility.
- Confidence weight.

## Fail-down Policy

The Router applies hard fail-down rules before any task pool is created:

1. `migration/schema/entity/table/column` change requests become `HOLD + Schema Gate`.
2. Production deploy, DB write, or migration execution requests become `HOLD`.
3. Auth/RBAC/DataScope/Payment/Finance/Chanjet routes through A2.
4. Data readiness, master data, store, company, account, role, dictionary, and mapping routes through A5.
5. UI/UX, page, style, interaction, responsive, and UAT routes through A4.
6. API/service/controller/module routes through A3.
7. CI/typecheck/smoke routes through A1.
8. Staging runbook and rollback planning routes through A6/A7.

## Validation Results

| Case | Request Summary | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| 1 | Store Payment pilot readiness with A2 security, A1 CI, A5 data readiness | A2 + A1 + A5 | A2 + A1 + A5 | PASS |
| 2 | Store Payment UI polish, no backend API change | A4 + A1 | A4 + A1 | PASS |
| 3 | Store Payment backend confirm API with RBAC/DataScope review | A3 + A2 + A1 | A3 + A2 + A1 | PASS |
| 4 | Add database migration and deploy to production | HOLD | HOLD with migration/schema and deploy/production reasons | PASS |
| 5 | Check store/company/account/role mapping for pilot | A5 | A5 | PASS |
| 6 | Prepare staging deploy runbook and rollback plan, no actual deploy | A6 + A7 | A6 + A7 | PASS |

## A5 Routing Fix

The previous gap was that `readiness` and data mapping could select A1/A2 without A5. Router V1 now forces A5 when the request mentions data readiness, master data, store/company/account/role/organization mapping, dictionary, pilot readiness, or explicit A5 wording.

An Orchestrator dry-run using the original failed request selected `A2-Security-Regression-Gate`, `A1-CI-Runtime-Gate`, and `A5-Data-Readiness` in one parallel group. Codex CLI was not executed.

## A4 UI/UX Routing

A4 is selected for page, frontend, UI, UX, style, polish, layout, form, table, button, status tag, responsive, mobile, desktop, interaction, user experience, UAT, and smoke wording. For UI-only requests, A4 is paired with A1 validation and does not require A3 unless the request asks for backend/API work.

## Safety Result

| Boundary | Result |
| --- | --- |
| Codex CLI executed | No |
| Business code changed | No |
| Database written | No |
| Migration created or executed | No |
| Deployment executed | No |
| Merge executed | No |

## Next Recommendation

Merge Router V1 to main, then make Agent Router the mandatory first step for all natural language delivery requests. Keep the legacy Orchestrator classifier only as a fallback during the transition.

## Autonomous Baseline Revalidation

After baseline autopilot became the default lifecycle hook, Router V1 was revalidated with the six required natural-language cases:

| Case | Expected | Actual | Result |
| --- | --- | --- | --- |
| 1 | A2 + A1 + A5 | A2 + A1 + A5 | PASS |
| 2 | A4 + A1 | A4 + A1 | PASS |
| 3 | A3 + A2 + A1 | A3 + A2 + A1 | PASS |
| 4 | HOLD with migration/schema/deploy/production | HOLD with migration/schema and deploy/production reasons | PASS |
| 5 | A5 | A5 | PASS |
| 6 | A6 + A7 | A6 + A7 | PASS |

Orchestrator regression command selected `A2-Security-Regression-Gate`, `A1-CI-Runtime-Gate`, and `A5-Data-Readiness` before task generation. Output also confirmed:

- `baseline autopilot will run after agent completion`
- `user manual rebase required: false`
- `user manual merge required: false`
- `user manual docs/ops/runs cleanup required: false`

Codex CLI was not executed, no database was written, no deployment occurred, and no migration was created.

## Store Payment Closed-loop Fix

Store Payment closed-loop routing was tightened so menu code, role authorization, protected preview/download, protected attachment, API draft, service/controller/module, and attachment ACL wording routes to A2 and A3. This prevents closed-loop pilot-readiness tasks from selecting only A1/A4/A5/A6/A7 while missing backend and security review.
