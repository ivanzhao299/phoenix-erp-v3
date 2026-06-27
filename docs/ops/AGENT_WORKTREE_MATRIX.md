# Agent Worktree Matrix

| Agent | Worktree | Branch | Clean Required | Auto Rebase | Merge Path |
| --- | --- | --- | --- | --- | --- |
| Codex-Orchestrator | `/Users/mac/phoenix-erp-worktrees/codex-orchestrator` | `w5-codex-orchestrator` | Yes | Via sync script | `agent-sync-and-merge.mjs` |
| A1-CI-Runtime-Gate | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` | `w5-a1-ci-runtime-gate` | Yes | Worker/sync | `agent-sync-and-merge.mjs` |
| A2-Security-Regression-Gate | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` | `w5-a2-security-regression-gate` | Yes | Worker/sync | `agent-sync-and-merge.mjs` |
| A3-Backend-Critical-Path | `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path` | `w5-a3-backend-critical-path` | Yes | Sync only | `agent-sync-and-merge.mjs --allow-code` or schema gate |
| A4-Frontend-UAT-Smoke | `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke` | `w5-a4-frontend-uat-smoke` | Yes | Sync only | `agent-sync-and-merge.mjs --allow-code` |
| A5-Data-Readiness | `/Users/mac/phoenix-erp-worktrees/a5-data-readiness` | `w5-a5-data-readiness` | Yes | Worker/sync | `agent-sync-and-merge.mjs` |
| A6-Staging-Deploy-Runbook | `/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook` | `w5-a6-staging-deploy-runbook` | Yes | Sync only | docs/runbook merge only |
| A7-Final-QA-Gate | `/Users/mac/phoenix-erp-worktrees/a7-final-qa-gate` | `w5-a7-final-qa-gate` | Yes | Sync only | docs/final QA merge only |

Dirty worktrees must stop automation. Conflict resolution remains manual.
