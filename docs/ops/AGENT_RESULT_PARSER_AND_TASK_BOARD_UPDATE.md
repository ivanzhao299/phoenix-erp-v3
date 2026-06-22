# Agent Result Parser and Task Board Update

## 1. Phase 5.2 Goal

Phase 5.2 adds result parsing after Codex CLI Agent execution. It converts Agent reports into a standard JSON result, a Markdown summary, and a dry-run task board update recommendation.

This phase is automation infrastructure only. It does not develop Store Payment or any business feature.

## 2. Agent Result Parser Role

`scripts/ops/parse-agent-result.mjs` reads an Agent report and extracts:

1. Commit hash.
2. Changed files.
3. Freeze boundary status.
4. Business code status.
5. Migration and DB status.
6. Verification results.
7. Conclusion.
8. Suggested next Agents.
9. Conditions.
10. Blockers.
11. Missing fields.

## 3. Standard Agent Return Fields

Every Agent report should include:

1. `commit hash`
2. `Changed Files`
3. `Frozen items touched`
4. `Business code changed`
5. `Migration added`
6. `Migration executed`
7. `Database written`
8. `Deployment`
9. `Verification Commands And Results`
10. `Conclusion`
11. `Suggested next Agent`
12. `Conditions`
13. `Blockers`

## 4. result-json Schema Draft

```json
{
  "task_id": "string",
  "agent": "string",
  "worktree": "string",
  "worktree_branch": "string",
  "result_file": "string",
  "parsed_at": "string",
  "commit_hash": "string|null",
  "changed_files": ["string"],
  "frozen_items_touched": true,
  "business_code_changed": true,
  "migration_added": false,
  "migration_executed": false,
  "database_written": false,
  "deployed": false,
  "verification_results": [
    { "command": "string", "result": "PASS|FAIL|WARN|PASS WITH CONDITIONS", "summary": "string" }
  ],
  "conclusion": "PASS|PASS WITH CONDITIONS|FAIL|HOLD|ROLLBACK",
  "recommend_next_agent": ["A2-Security-Regression-Gate"],
  "conditions": ["string"],
  "blockers": ["string"],
  "missing_fields": ["string"]
}
```

## 5. result-md Summary Format

The Markdown summary contains:

1. Header table with Agent, task, commit, conclusion, and safety flags.
2. Changed file list.
3. Verification results.
4. Conditions.
5. Blockers.
6. Missing fields.

## 6. Task Board Update Rules

`scripts/ops/update-task-board-from-result.mjs` reads result JSON and proposes:

1. `PASS` -> `completed`
2. `PASS WITH CONDITIONS` -> `completed-with-conditions`
3. `FAIL` or `HOLD` -> `blocked`
4. `ROLLBACK` -> `rollback-required`
5. Suggested next Agent rows with `ready-next`

## 7. dry-run vs apply

Dry-run:

1. Default mode.
2. Prints suggested task board rows.
3. Does not modify `AGENT_TASK_BOARD.md`.

Apply:

1. Requires `--apply`.
2. Refuses if `missing_fields` is not empty.
3. Modifies `AGENT_TASK_BOARD.md`.
4. Does not commit, merge, push, deploy, execute migrations, or write DB.

## 8. States Entering A2

Enter A2 when result mentions:

1. RBAC.
2. DataScope.
3. Security-sensitive backend code.
4. Auth or menu guard.
5. Attachment ACL.
6. Static security gate condition.

## 9. States Entering A1

Enter A1 when:

1. Code was merged or is proposed for merge.
2. Typecheck/build/startup evidence is required.
3. W5 closeout gates need validation.
4. Post-merge validation is needed.

## 10. States Entering A4

Enter A4 when:

1. Backend APIs are available.
2. A2 security review has passed or conditions are accepted.
3. Frontend pages, UAT smoke, screenshot, or user-flow testing is required.

## 11. States Entering A6

Enter A6 when:

1. Staging deployment planning is requested.
2. Environment matrix or release runbook is needed.
3. Rollback plan needs dry-run documentation.

## 12. States Entering A7

Enter A7 when:

1. All implementation and review gates are complete.
2. GO / GO WITH CONDITIONS / HOLD / ROLLBACK synthesis is needed.
3. Production readiness needs final review.

## 13. States Requiring HOLD

HOLD is mandatory when:

1. Migration execution is required but not approved.
2. DB write is required but not approved.
3. Production deploy is requested without GO.
4. Security bypass or auth regression is detected.
5. Accounting correctness or data loss risk is unresolved.
6. Required Agent report fields are missing for apply mode.

## 14. Human Gate Boundary

The parser and updater do not approve work. Humans must still approve:

1. Agent execution.
2. Code merge.
3. Push.
4. Migration/schema gates.
5. DB writes.
6. Deployment.
7. GO / HOLD decisions.

## 15. HOLD Recovery Through Normalization

If `parse-agent-result.mjs` reports `missing_fields`, `decide-next-agent.mjs` must return HOLD. The Orchestrator must not bypass HOLD by verbal approval or manual editing of the original Agent report.

Allowed recovery path:

1. Run `scripts/ops/normalize-agent-result.mjs` against the parser output and original source report.
2. Normalize only fields that can be safely inferred from the source report, worktree git log/show, or existing input JSON.
3. Preserve `normalization_evidence` in the normalized JSON.
4. Leave any unsafe field in `missing_fields`.
5. Run `decide-next-agent.mjs` against the normalized result.

Normalization still does not execute Agents, modify task board, merge, push, deploy, execute migrations, or write databases.

## 16. End-to-End Example

```bash
node scripts/ops/parse-agent-result.mjs \
  --agent A3-Backend-Critical-Path \
  --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path \
  --task-id REQ-STORE-PAYMENT-APP-MODULE-WIRING-001 \
  --result-file docs/ops/examples/AGENT_RESULT_A3_APP_MODULE_WIRING_EXAMPLE.md \
  --output-json docs/ops/runs/a3-app-module-wiring-result.json \
  --output-md docs/ops/runs/a3-app-module-wiring-result-summary.md

node scripts/ops/update-task-board-from-result.mjs \
  --task-board docs/ops/AGENT_TASK_BOARD.md \
  --result-json docs/ops/runs/a3-app-module-wiring-result.json \
  --dry-run
```
