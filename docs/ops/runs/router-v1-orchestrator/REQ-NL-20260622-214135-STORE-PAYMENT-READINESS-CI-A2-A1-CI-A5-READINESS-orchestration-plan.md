# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS |
| Risk | LOW/MEDIUM |
| Mode | supervised |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

对 Store Payment 试点 readiness 做只读安全复核、CI 验证和数据准备检查；只允许 A2 安全审查、A1 CI 验证、A5 数据 readiness，不改业务代码，不执行 migration，不写数据库，不部署

## Selected Agents

- A2-Security-Regression-Gate
- A1-CI-Runtime-Gate
- A5-Data-Readiness

## Held Reasons

- None

## Dispatch Groups

- Group 1: A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness

## Next Commands

```bash
node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --request-spec docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-requirement-spec.md --task-contract docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-agent-contract-A2-Security-Regression-Gate.md --assembled-prompt-output docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-assembled-prompt-A2-Security-Regression-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --request-spec docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-requirement-spec.md --task-contract docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-agent-contract-A1-CI-Runtime-Gate.md --assembled-prompt-output docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-assembled-prompt-A1-CI-Runtime-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --request-spec docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-requirement-spec.md --task-contract docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-agent-contract-A5-Data-Readiness.md --assembled-prompt-output docs/ops/runs/router-v1-orchestrator/REQ-NL-20260622-214135-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS-assembled-prompt-A5-Data-Readiness.md --dry-run
```
