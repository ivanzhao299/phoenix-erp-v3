# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION |
| Risk | LOW |
| Mode | closed-loop |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库

## Selected Agents

- A2-Security-Regression-Gate
- A1-CI-Runtime-Gate
- A5-Data-Readiness
- A3-Backend-Critical-Path
- A4-Frontend-UAT-Smoke
- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

## Held Reasons

- None

## Dispatch Groups

- Group 1: A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness
- Group 2: A3-Backend-Critical-Path
- Group 3: A4-Frontend-UAT-Smoke
- Group 4: A6-Staging-Deploy-Runbook, A7-Final-QA-Gate

## Next Commands

```bash
node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A2-Security-Regression-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A2-Security-Regression-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A1-CI-Runtime-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A1-CI-Runtime-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A5-Data-Readiness.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A5-Data-Readiness.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A3-Backend-Critical-Path.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A3-Backend-Critical-Path.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A4-Frontend-UAT-Smoke.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A4-Frontend-UAT-Smoke.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A6-Staging-Deploy-Runbook --worktree /Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook --prompt docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A6-Staging-Deploy-Runbook.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A6-Staging-Deploy-Runbook.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A7-Final-QA-Gate --worktree /Users/mac/phoenix-erp-worktrees/a7-final-qa-gate --prompt docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-agent-contract-A7-Final-QA-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION-assembled-prompt-A7-Final-QA-Gate.md --dry-run
```
