# Next-Agent Decision Engine

## 1. Phase 5.3 Goal

Phase 5.3 converts parsed Agent result JSON into a follow-up dispatch plan. It decides whether the next step should be HOLD or a controlled dry-run plan for A1, A2, A4, A6, A7, or other mapped Agents.

This phase is orchestration infrastructure only and does not develop business functionality.

## 2. Input result-json

The input is produced by `scripts/ops/parse-agent-result.mjs` and should include:

1. `task_id`
2. `agent`
3. `conclusion`
4. `changed_files`
5. `frozen_items_touched` or `touched_frozen_boundary`
6. `business_code_changed` or `modified_business_code`
7. `migration_added` or `added_migration`
8. `migration_executed` or `executed_migration`
9. `database_written` or `wrote_database`
10. `deployed`
11. `recommend_next_agent` or `next_agents`
12. `conditions`
13. `blockers`
14. `missing_fields`

## 3. Agent Dispatch Map

`docs/ops/AGENT_DISPATCH_MAP.json` defines each Agent's canonical:

1. Agent name.
2. Branch.
3. Worktree path.
4. Prompt file.
5. Default role.
6. Allowed execution phase.

The decision engine uses this file instead of hardcoding paths in the script.

## 4. Decision Rules

1. Read result JSON.
2. If missing fields exist, return HOLD.
3. If result is FAIL or HOLD, return HOLD.
4. If migration execution, DB write, or deployment occurred, return HOLD.
5. If migration was added, prioritize A2 or A1.
6. If business code was modified, prioritize A2 or A1.
7. If result recommends A2 or A1, generate follow-up dispatches.
8. Every follow-up requires approval and is dry-run only by default.

## 5. HOLD Rules

HOLD is mandatory when:

1. `missing_fields` is not empty.
2. `conclusion` is FAIL or HOLD.
3. `executed_migration` is true.
4. `wrote_database` is true.
5. `deployed` is true.
6. The requested next Agent is not present in `AGENT_DISPATCH_MAP.json`.

HOLD must not be skipped by manual instruction alone. If fields are missing because an older Agent report used a non-standard format, the recovery path is to generate a normalized result with `scripts/ops/normalize-agent-result.mjs`. The normalized result must include `normalization_evidence`, and any field that cannot be safely inferred must remain in `missing_fields`.

## 6. A2 Priority Rule

A2 is prioritized when:

1. Business code changed.
2. Frozen boundary was touched.
3. Auth/RBAC/DataScope/audit/attachment ACL/security conditions exist.
4. Static security checks required allow flags or human explanation.

## 7. A1 Validation Rule

A1 is prioritized when:

1. Code was modified.
2. Typecheck/build/startup evidence is required.
3. Post-merge validation is required.
4. W5 closeout gates need rerun.

## 8. A4 Frontend Entry Conditions

A4 should only be considered after:

1. Backend implementation is present.
2. A2 security conditions are accepted or resolved.
3. A1 validation evidence is acceptable.
4. Frontend scope is explicitly approved.

## 9. A6 Deploy Entry Conditions

A6 should only be considered after:

1. Staging planning is requested.
2. Backend/frontend/security/validation gates are acceptable.
3. Deployment is still runbook-only unless GO approval exists.

## 10. A7 Final QA Entry Conditions

A7 should be considered after:

1. Implementation, security, validation, frontend, data, and staging evidence is complete.
2. The Orchestrator needs GO / GO WITH CONDITIONS / HOLD / ROLLBACK synthesis.

## 11. approval_required Design

Every follow-up dispatch includes `approval_required: true`. The decision engine does not execute Agents. It only writes a plan and generated contracts. Human approval is required before `run-agent-task.mjs` is executed without `--dry-run`.

## 12. End-to-End Example

```bash
node scripts/ops/decide-next-agent.mjs \
  --result-json docs/ops/runs/a3-app-module-wiring-result.json \
  --output-plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --output-contract-dir docs/ops/runs \
  --dry-run
```

Expected result: a plan containing A2 and A1 follow-up dispatches, generated follow-up contract files, and dry-run `run-agent-task.mjs` commands. No Agent is executed.

## 13. Normalized Result Example

```bash
node scripts/ops/normalize-agent-result.mjs \
  --input-json docs/ops/runs/a2-app-module-wiring-follow-up-result.json \
  --source-report docs/ops/A2_REQ-STORE-PAYMENT-APP-MODULE-WIRING-001_FOLLOW_UP_REPORT.md \
  --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate \
  --output-json docs/ops/runs/a2-app-module-wiring-follow-up-result.normalized.json \
  --output-md docs/ops/runs/a2-app-module-wiring-follow-up-result.normalized.md \
  --dry-run

node scripts/ops/decide-next-agent.mjs \
  --result-json docs/ops/runs/a2-app-module-wiring-follow-up-result.normalized.json \
  --output-plan docs/ops/runs/a2-app-module-wiring-next-agent-plan.normalized.json \
  --output-contract-dir docs/ops/runs \
  --dry-run
```

Expected result: if normalization safely clears `missing_fields`, the decision engine may return a follow-up plan. If not, it remains HOLD.
