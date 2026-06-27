# AI Delivery Phase 5.3 Next-Agent Decision Engine Review

## 1. Stage Goal

Phase 5.3 adds a decision engine that reads parsed Agent result JSON and generates a follow-up dispatch plan. It bridges Agent result parsing and future controlled `run-agent-task.mjs` dry-runs.

This phase does not develop business functionality.

## 2. Added Files

1. `scripts/ops/decide-next-agent.mjs`
2. `docs/ops/AGENT_DISPATCH_MAP.json`
3. `docs/ops/prompts/FOLLOW_UP_AGENT_CONTRACT_TEMPLATE.md`
4. `docs/ops/NEXT_AGENT_DECISION_ENGINE.md`
5. `docs/ops/AI_DELIVERY_PHASE5_3_NEXT_AGENT_DECISION_ENGINE_REVIEW.md`

## 3. decide-next-agent.mjs Capability

The script:

1. Reads parser result JSON.
2. Reads `AGENT_DISPATCH_MAP.json`.
3. Applies HOLD rules.
4. Prioritizes A2/A1 when business code, frozen boundary, or migration signals exist.
5. Generates follow-up dispatch plan JSON.
6. Generates per-Agent follow-up contract files.
7. Emits `run-agent-task.mjs --dry-run` commands.
8. Does not execute Agents, modify task board, merge, push, deploy, execute migrations, or write DB.

## 4. AGENT_DISPATCH_MAP.json Summary

The map covers:

1. Codex-Orchestrator
2. A1-CI-Runtime-Gate
3. A2-Security-Regression-Gate
4. A3-Backend-Critical-Path
5. A4-Frontend-UAT-Smoke
6. A5-Data-Readiness
7. A6-Staging-Deploy-Runbook
8. A7-Final-QA-Gate

Each entry includes canonical branch, worktree path, prompt file, default role, and allowed execution phase.

## 5. Follow-Up Contract Rule

Each generated contract includes:

1. Source task id.
2. Source Agent.
3. Source conclusion.
4. Follow-up task id.
5. Next Agent.
6. Changed files.
7. Conditions.
8. Blockers.
9. Required review scope.
10. Allowed and forbidden actions.
11. Required output report.
12. Stop rules.

## 6. Dry-Run Test Result

Command:

```bash
node scripts/ops/decide-next-agent.mjs \
  --result-json docs/ops/runs/a3-app-module-wiring-result.json \
  --output-plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --output-contract-dir docs/ops/runs \
  --dry-run
```

Actual result:

```text
Decision: DISPATCH_PLAN_READY
Plan: docs/ops/runs/a3-app-module-wiring-next-agent-plan.json
Follow-up dispatch count: 2
- REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP: A2-Security-Regression-Gate
  Contract: docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP.md
  Dry-run: node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --task-contract docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP.md --assembled-prompt-output docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP-assembled-prompt.md --dry-run
- REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A1-FOLLOWUP: A1-CI-Runtime-Gate
  Contract: docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A1-FOLLOWUP.md
  Dry-run: node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --task-contract docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A1-FOLLOWUP.md --assembled-prompt-output docs/ops/runs/REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A1-FOLLOWUP-assembled-prompt.md --dry-run
No run-agent-task command executed. Task board not modified.
```

## 7. Current Limits

1. Decision input depends on parser output quality.
2. The engine generates contracts but does not update task board.
3. The engine does not execute follow-up dry-runs automatically.
4. A4/A6/A7 are deliberately gated behind prior evidence and approval.

## 8. Next Recommendation

Add an Orchestrator command that chains:

1. `parse-agent-result.mjs`
2. `update-task-board-from-result.mjs --dry-run`
3. `decide-next-agent.mjs --dry-run`
4. selected `run-agent-task.mjs --dry-run`

Keep non-dry-run Agent execution behind explicit user approval.
