# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U |
| Risk | MEDIUM |
| Mode | closed-loop |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

推进 Store Payment 进入可试点状态：补齐菜单码和角色授权方案、附件 protected preview/download 方案、前端 UI/UX 和 UAT 页面计划、数据 readiness 检查、migration 执行前置清单、预发部署 runbook 和终验 Gate；按七 Agent 闭环分配任务，不改未授权业务代码，不执行 migration，不写数据库，不部署

## Selected Agents

- A4-Frontend-UAT-Smoke
- A1-CI-Runtime-Gate
- A5-Data-Readiness
- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

## Held Reasons

- None

## Dispatch Groups

- Group 1: A1-CI-Runtime-Gate, A5-Data-Readiness
- Group 2: A4-Frontend-UAT-Smoke
- Group 3: A6-Staging-Deploy-Runbook, A7-Final-QA-Gate

## Next Commands

```bash
node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-agent-contract-A4-Frontend-UAT-Smoke.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-assembled-prompt-A4-Frontend-UAT-Smoke.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-agent-contract-A1-CI-Runtime-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-assembled-prompt-A1-CI-Runtime-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-agent-contract-A5-Data-Readiness.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-assembled-prompt-A5-Data-Readiness.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A6-Staging-Deploy-Runbook --worktree /Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook --prompt docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-agent-contract-A6-Staging-Deploy-Runbook.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-assembled-prompt-A6-Staging-Deploy-Runbook.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A7-Final-QA-Gate --worktree /Users/mac/phoenix-erp-worktrees/a7-final-qa-gate --prompt docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-agent-contract-A7-Final-QA-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-234451-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U-assembled-prompt-A7-Final-QA-Gate.md --dry-run
```
