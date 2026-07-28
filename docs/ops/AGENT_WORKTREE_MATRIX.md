# Agent Worktree Matrix

## Execution Policy

The paths below are template/reference worktrees. They may be used to inspect prompts, capabilities and repository state, but must not execute or merge a generated Agent task.

Executable tasks use:

```text
worktree: /Users/mac/phoenix-erp-worktrees/agent-tasks/<task-id>-g<generation>-<agent>
branch:   codex/task/<task-id>/g<generation>/<agent>
```

Redispatch and stale-lease recovery always allocate the next generation. A branch or worktree from an earlier generation is retired, never rebound to a new run.

| Agent | Template Worktree | Template Branch | Task Execution | Merge Path |
| --- | --- | --- | --- | --- | --- |
| Codex-Orchestrator | `/Users/mac/phoenix-erp-worktrees/codex-orchestrator` | `w5-codex-orchestrator` | Isolated task generation | `agent-sync-and-merge.mjs` |
| A1-CI-Runtime-Gate | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` | `w5-a1-ci-runtime-gate` | Isolated task generation | `agent-sync-and-merge.mjs` |
| A2-Security-Regression-Gate | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` | `w5-a2-security-regression-gate` | Isolated task generation | `agent-sync-and-merge.mjs` |
| A3-Backend-Critical-Path | `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path` | `w5-a3-backend-critical-path` | Isolated task generation | `agent-sync-and-merge.mjs --allow-code` or schema gate |
| A4-Frontend-UAT-Smoke | `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke` | `w5-a4-frontend-uat-smoke` | Isolated task generation | `agent-sync-and-merge.mjs --allow-code` |
| A5-Data-Readiness | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` | `w5-a5-data-readiness` | Isolated task generation | `agent-sync-and-merge.mjs` |
| A6-Staging-Deploy-Runbook | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` | `w5-a6-staging-deploy-runbook` | Isolated task generation | docs/runbook merge only |
| A7-Final-QA-Gate | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` | `w5-a7-final-qa-gate` | Isolated task generation | docs/final QA merge only |

Dirty task worktrees are quarantined. The next bounded retry receives a fresh generation from `origin/main`; automation must not clean, reset or reuse the retired workspace.
