# Orchestration Plan

| Field | Value |
| --- | --- |
| Request ID | REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO |
| Risk | LOW/MEDIUM |
| Mode | supervised |
| Dry run | Yes |
| Parallel | 3 |
| Approval required | Yes |

## Request

Run Store Payment pilot data readiness check, store/company/account mapping validation, plus A2 security review and A1 CI validation. Do not modify business code, do not run migration, do not deploy.

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
node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-agent-contract-A2-Security-Regression-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-assembled-prompt-A2-Security-Regression-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A1-CI-Runtime-Gate --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-agent-contract-A1-CI-Runtime-Gate.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-assembled-prompt-A1-CI-Runtime-Gate.md --dry-run
```
```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --request-spec docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-requirement-spec.md --task-contract docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-agent-contract-A5-Data-Readiness.md --assembled-prompt-output docs/ops/runs/REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO-assembled-prompt-A5-Data-Readiness.md --dry-run
```
