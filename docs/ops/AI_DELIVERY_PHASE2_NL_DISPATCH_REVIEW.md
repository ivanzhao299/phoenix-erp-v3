# AI Delivery Phase 2 NL Dispatch Review

## 1. Phase Goal

Phase 2 establishes the automation pattern for:

自然语言需求 → 结构化需求 → Agent 自动分发 → 验收标准 → 任务板更新 → Agent 回报汇总 → GO / GO WITH CONDITIONS / HOLD / ROLLBACK.

This phase does not fix ERP runtime, security, finance, or business blockers.

## 2. New Files

| File | Purpose |
| --- | --- |
| `docs/ops/NATURAL_LANGUAGE_DISPATCH_FLOW.md` | End-to-end orchestration flow. |
| `docs/ops/ORCHESTRATOR_PROMPT.md` | Copy-ready prompt for Codex-Orchestrator. |
| `docs/ops/NATURAL_LANGUAGE_REQUEST_EXAMPLES.md` | Request examples and classification samples. |
| `docs/ops/AI_DELIVERY_PHASE2_NL_DISPATCH_REVIEW.md` | Phase 2 review report. |

## 3. Modified Files

| File | Change |
| --- | --- |
| `docs/ops/AGENT_ROUTING_RULES.md` | Added L0-L5 natural language keyword routing. |
| `docs/ops/AGENT_TASK_CONTRACT.md` | Added auto-generated contract format. |
| `docs/ops/AGENT_TASK_BOARD.md` | Added Phase 2 task and marked A1 FAIL as future sample. |

## 4. Dispatch Flow Summary

Codex-Orchestrator now has a documented flow to:

1. Preserve the original user request.
2. Decide whether the request is clear.
3. Ask follow-up questions when risk or ambiguity requires it.
4. Convert the request into a structured requirement.
5. Classify risk using L0-L5.
6. Route to one or more fixed Agents.
7. Generate Agent task contracts.
8. Generate acceptance criteria.
9. Update the task board.
10. Wait for Agent reports.
11. Synthesize PR/report evidence.
12. Output GO / GO WITH CONDITIONS / HOLD / ROLLBACK.

## 5. Agent Routing Summary

| Request area | Primary Agents | Minimum risk |
| --- | --- | --- |
| Login / permission / menu / role / data visibility | A2 + A3 + A4 | L3 |
| Finance / AR / AP / payment / account set | A3 + A5 + A2 | L3 |
| Master data / company / project / farm / store / warehouse | A5 read-only first | L4 |
| Yonyou / Chanjet / webhook / callback / token | A2 + A3 + A6 | L3 |
| Page / button / table / display / copy | A4 | L1-L2 |
| Go-live / deploy / rollback / server | A6 + A7 | L3 |
| Migration / schema / field / table structure | Human approval first | L4-L5 |

## 6. Risk Level Summary

| Level | Meaning |
| --- | --- |
| L0 | No-code coordination or read-only status. |
| L1 | Docs, templates, isolated text. |
| L2 | Low-risk UI or test scope. |
| L3 | Product behavior or security-adjacent work. |
| L4 | Master data, data shape, migration/schema/deploy-adjacent work. |
| L5 | Production, irreversible, security bypass, data repair, or accounting correctness risk. |

## 7. Requests That Allow Auto-Development

Auto-development is allowed only when:

1. Risk is L0-L2.
2. File scope is explicit and allowed.
3. No frozen items are touched.
4. The task contract says `Auto-code allowed: Yes`.
5. Acceptance criteria are measurable.

Examples: docs updates, templates, isolated copy, low-risk UI smoke support.

## 8. Requests That Require Human Confirmation

Human confirmation is required for:

1. L4-L5 work.
2. Auth, permission, RBAC, menu, JWT, or security behavior changes.
3. Finance, accounting, payment, AR/AP, POS, or Chanjet behavior changes.
4. Master data, data baseline, migration, schema, entity, table, or column changes.
5. Staging deploy, production deploy, rollback, or server state changes.

## 9. A1 FAIL As Future Flow Sample

A1-CI-Runtime-Gate has produced a `FAIL` result. Phase 2 records this as a future natural language dispatch sample:

| Field | Value |
| --- | --- |
| Sample source | A1 runtime/security blocker report |
| Current action | Record only |
| Not in this phase | Fix runtime/security blockers, start A2-A7, change app code |
| Future use | Convert the FAIL report into structured repair tasks with risk, contracts, and acceptance criteria |

## 10. Next Recommendations

1. Use a single user-provided natural language request as the first dry-run input.
2. Generate a structured requirement and Agent task contract without code changes.
3. Update the task board with the dry-run task.
4. Ask user approval before starting any L3+ Agent work.
5. Use A1 FAIL as the first realistic sample only after user explicitly starts the repair flow.
