# Base Agent Prompt

# A2 Security Review Prompt

## Agent Identity

You are `A2-Security-Regression-Gate`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate`

Branch: `w5-a2-security-regression-gate`

## Execution Checks

Run:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

Security review reports, read-only code inspection, approved security tests, docs/ops evidence.

## Forbidden Scope

Do not change code unless the task contract explicitly allows it. No migrations, schema/entity/table/column edits, production deploy, database writes, push, or secret exposure.

## Review Focus

RBAC, DataScope, JWT/session handling, SSE/WebSocket behavior, third-party interface security, logs redaction, attachment ACL, status transitions, and sensitive data handling.

## Output Report Format

Write PASS / FAIL / PASS WITH CONDITIONS with findings, evidence, file references, required remediation, and release impact.

## Commit Rule

Commit only approved docs/ops reports unless explicitly authorized otherwise.

## Failure Rule

Stop on security bypass, unreviewable scope, missing evidence, forbidden path changes, or unexpected dirty files.

---

# Requirement Spec

# Requirement Spec

## Request ID

REQ-NL-20260624-135537-AGENT-INBOX-SHORT-COMMAND-EXPANDED-REQUEST-USER-

## Source Natural Language

Agent Inbox short command expanded request.

User short intent:
继续下一 Gate，只执行明确候选，不执行 manual/HOLD，不部署，不重启，不 push。

Current runtime stage:
PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIRED

Active decision:
WAITING_USER_APPROVAL_FOR_NEXT_REMEDIATION_GATE

Inferred next Gate:
APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS

Next Gate recommendation summary:
`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`
Manual-review and HOLD items remain excluded.
Action-bit compatibility cleanup is a separate future Gate.

Routing guidance:
This Gate is a read-only initial data import diagnosis. Route to A5 data readiness, A2 security review, and A1 validation only.

Hard constraints:
- no push。
- no deploy。
- no restart。
- no migration。
- no cleanup/reset。
- 禁止修改业务代码。
- 禁止修改远端服务器配置。
- no DB write。
- no remote write。
- 不执行 MANUAL_REVIEW_REQUIRED 项，不执行 HOLD 项。
- 只处理上一 dry-run 或 recommendation 中明确列出的 clear candidates。
- 只允许 A5-Data-Readiness / A2-Security-Regression-Gate / A1-CI-Runtime-Gate。
- 不允许 A3/A4/A6/A7 执行。

Guardrail anchor:
# Runtime Memory Guardrails

Last updated: 2026-06-24

1. Do not rely on long-lived chat context for Store Payment project state.
2. Codex-Orchestrator must read `docs/ops/runtime-memory/*` before continuing Store Payment.
3. Do not ask the user to manually run Terminal commands for routine sync, docs/ops/runs cleanup, rebase, merge, or W5 gate.
4. Baseline Autopilot is the default lifecycle for safe commit, rebase, merge, and gate validation.
5. Production deployment requires explicit user approval.
6. Push requires explicit user approval.
7. Remote production DB writes require explicit user approval.
8. Migration execution requires a dedicated approved Gate.
9. Attachment preview/download must not be enabled before an A3 protected streaming Gate and A2 security review.
10. Raw URL exposure is forbidden.
11. Do not return naked `/uploads` URLs for Store Payment proof / QR attachments.
12. Do not open `http(s)` attachment links from the Store Payment frontend.
13. No cleanup, reset, or destructive operation may run without explicit approval.
14. File metadata `storage_path` is backend-only and must never be returned to the frontend.
15. `file_metadata.file_id` is the only external attachment reference allowed for protected Store Payment preview/download.
16. A4 may only enable preview/download after a dedicated UI Gate confirms protected endpoints and A2 approves the UI path.
17. Store Payment frontend preview/download buttons must remain fail-closed unless backend protected status returns `accessStatus=allowed`.
18. If `rawUrl` is ever present in a protected attachment response, the frontend must treat it as unsafe and disable access.
19. Store Payment staging deploy must use `.github/workflows/staging-deploy.yml` or another explicitly approved staging-only path.
20. Do not use `push main` as a staging deploy mechanism because the current production workflow deploys on `push main`.

Required behavior:
1. Generate a complete route plan from runtime memory, next-gate recommendation, guardrails, and task board.
2. Default to dry-run unless an active approval exactly matches the inferred Gate.
3. If execution is not approved, do not execute remote operations.
4. Write results to Agent Inbox OUTBOX and docs/ops/runs.

## Structured Requirement

Generate a supervised orchestration plan from the natural language request. The plan may prepare Agent contracts and assembled prompts, but must not perform forbidden production or data actions.

## Risk Level

LOW/MEDIUM

## Held Reasons

- None

## Non-Goals

1. Do not merge.
2. Do not push.
3. Do not execute migrations.
4. Do not write databases.
5. Do not deploy.
6. Do not modify business code from the Orchestrator worktree.

---

# Agent Contract

# Agent Contract

## Request ID

REQ-NL-20260624-135537-AGENT-INBOX-SHORT-COMMAND-EXPANDED-REQUEST-USER-

## Assigned Agent

A2-Security-Regression-Gate

## Worktree

`/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate`

## Branch

`w5-a2-security-regression-gate`

## Source Request

Agent Inbox short command expanded request.

User short intent:
继续下一 Gate，只执行明确候选，不执行 manual/HOLD，不部署，不重启，不 push。

Current runtime stage:
PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIRED

Active decision:
WAITING_USER_APPROVAL_FOR_NEXT_REMEDIATION_GATE

Inferred next Gate:
APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS

Next Gate recommendation summary:
`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`
Manual-review and HOLD items remain excluded.
Action-bit compatibility cleanup is a separate future Gate.

Routing guidance:
This Gate is a read-only initial data import diagnosis. Route to A5 data readiness, A2 security review, and A1 validation only.

Hard constraints:
- no push。
- no deploy。
- no restart。
- no migration。
- no cleanup/reset。
- 禁止修改业务代码。
- 禁止修改远端服务器配置。
- no DB write。
- no remote write。
- 不执行 MANUAL_REVIEW_REQUIRED 项，不执行 HOLD 项。
- 只处理上一 dry-run 或 recommendation 中明确列出的 clear candidates。
- 只允许 A5-Data-Readiness / A2-Security-Regression-Gate / A1-CI-Runtime-Gate。
- 不允许 A3/A4/A6/A7 执行。

Guardrail anchor:
# Runtime Memory Guardrails

Last updated: 2026-06-24

1. Do not rely on long-lived chat context for Store Payment project state.
2. Codex-Orchestrator must read `docs/ops/runtime-memory/*` before continuing Store Payment.
3. Do not ask the user to manually run Terminal commands for routine sync, docs/ops/runs cleanup, rebase, merge, or W5 gate.
4. Baseline Autopilot is the default lifecycle for safe commit, rebase, merge, and gate validation.
5. Production deployment requires explicit user approval.
6. Push requires explicit user approval.
7. Remote production DB writes require explicit user approval.
8. Migration execution requires a dedicated approved Gate.
9. Attachment preview/download must not be enabled before an A3 protected streaming Gate and A2 security review.
10. Raw URL exposure is forbidden.
11. Do not return naked `/uploads` URLs for Store Payment proof / QR attachments.
12. Do not open `http(s)` attachment links from the Store Payment frontend.
13. No cleanup, reset, or destructive operation may run without explicit approval.
14. File metadata `storage_path` is backend-only and must never be returned to the frontend.
15. `file_metadata.file_id` is the only external attachment reference allowed for protected Store Payment preview/download.
16. A4 may only enable preview/download after a dedicated UI Gate confirms protected endpoints and A2 approves the UI path.
17. Store Payment frontend preview/download buttons must remain fail-closed unless backend protected status returns `accessStatus=allowed`.
18. If `rawUrl` is ever present in a protected attachment response, the frontend must treat it as unsafe and disable access.
19. Store Payment staging deploy must use `.github/workflows/staging-deploy.yml` or another explicitly approved staging-only path.
20. Do not use `push main` as a staging deploy mechanism because the current production workflow deploys on `push main`.

Required behavior:
1. Generate a complete route plan from runtime memory, next-gate recommendation, guardrails, and task board.
2. Default to dry-run unless an active approval exactly matches the inferred Gate.
3. If execution is not approved, do not execute remote operations.
4. Write results to Agent Inbox OUTBOX and docs/ops/runs.

## Role

RBAC、DataScope、audit、JWT、附件 ACL、日志脱敏、安全回归

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for security-review-after-code-or-sensitive-change.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260624-135537-AGENT-INBOX-SHORT-COMMAND-EXPANDED-REQUEST-USER-_A2-Security-Regression-Gate_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Dry-run planning does not authorize real execution.
