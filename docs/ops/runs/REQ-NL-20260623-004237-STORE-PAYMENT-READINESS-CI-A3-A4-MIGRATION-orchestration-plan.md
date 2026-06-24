# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION |
| Risk | LOW/MEDIUM |
| Mode | supervised |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

检查 Store Payment 数据 readiness 和 CI 验证，不允许 A3/A4，不改业务代码，不执行 migration，不部署

## Selected Agents

- A1-CI-Runtime-Gate
- A5-Data-Readiness

## Held Reasons

- None

## Dispatch Groups

- Group 1: A1-CI-Runtime-Gate, A5-Data-Readiness

## Next Commands

```bash
node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-agent-contract-A1-CI-Runtime-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-assembled-prompt-A1-CI-Runtime-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-agent-contract-A5-Data-Readiness.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION-assembled-prompt-A5-Data-Readiness.md --dry-run
```
