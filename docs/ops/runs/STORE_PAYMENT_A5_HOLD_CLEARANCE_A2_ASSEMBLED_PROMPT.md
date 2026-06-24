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

# Store Payment A5 HOLD Clearance Requirement Spec

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Source Request

Clear the Store Payment pilot readiness A5 HOLD blocker with read-only evidence. Only A5 data readiness, A2 read-only security review, and A1 read-only validation are allowed. Do not enter A3/A4 implementation.

## Goal

Confirm whether Store Payment pilot readiness can move from A5 `HOLD` to `GO WITH CONDITIONS`, based on read-only DB evidence where available and static evidence where DB access is unavailable.

## Required Evidence Areas

1. Pilot store readiness: `STORE-VTE-001`, 万象直营店, Vientiane pilot store, or another existing store in `mst_stores` / `sys_organizations`.
2. Company / organization mapping: `company_code`, `organization_code`, `store_code`, business unit / project / farm / store relationships.
3. Company collection account readiness: `store_payment_accounts`, `fin_cash_accounts`, company/store/account/currency/active state, QR/proof attachment strategy.
4. Store Payment table readiness: `store_payment_accounts`, `store_payment_records`, required fields, status fields, account/store/company consistency, audit fields, `proof_attachment_id`.
5. User role and store scope readiness: cashier / store manager / finance / admin / super admin; user-role-menu relationship; user organization / store / `allowedSiteCodes` / data scope.
6. Menu and role grant readiness for:
   - `MENU_STORE_PAYMENT_ACCOUNT`
   - `MENU_STORE_PAYMENT`
   - `MENU_STORE_PAYMENT_CONFIRM`
   - `MENU_STORE_PAYMENT_VOID`
   - `MENU_STORE_PAYMENT_EXPORT`
7. Attachment proof / QR association readiness.
8. Whether A5 HOLD can be lifted.
9. Whether A3 Backend Gate and A4 Frontend Gate may be opened.

## Hard Boundaries

1. Do not modify business code.
2. Do not modify `apps/api/**`.
3. Do not modify `apps/web/**`.
4. Do not add or run migrations.
5. Do not modify schema/entity/table/column.
6. Do not insert/update/delete data.
7. Do not write databases.
8. Do not deploy.
9. Do not push.
10. Do not enter A3/A4 implementation.

## Evidence Rule

If real DB connection evidence is unavailable, the Agent must explicitly state:

- DB evidence unavailable.
- Current conclusion is based on static inference only.
- Missing connection/query evidence.
- Evidence required before entering A3/A4.

The Agent must not fabricate DB evidence.

## Output

Primary A5 output:

`docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

Follow-up review outputs:

- A2: `docs/ops/A2_STORE_PAYMENT_A5_HOLD_CLEARANCE_REVIEW.md`
- A1: `docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md`

---

# Agent Task Contract

# A2 Security Review Contract

## Task ID

`STORE-PAYMENT-A5-HOLD-CLEARANCE-A2`

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Assigned Agent

`A2-Security-Regression-Gate`

## Goal

Read-only review of the A5 Store Payment pilot readiness evidence. Confirm whether A5's recommendation misses RBAC, DataScope, menu grant, attachment ACL, audit, sensitive logging, or release safety risks.

## Required Input

`docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

## Required Output

`docs/ops/A2_STORE_PAYMENT_A5_HOLD_CLEARANCE_REVIEW.md`

## Allowed Actions

1. Read files.
2. Run static read-only checks.
3. Write the required `docs/ops/**` review report.

## Forbidden Actions

1. No business-code modification.
2. No `apps/api/**` modification.
3. No `apps/web/**` modification.
4. No migration execution.
5. No schema/entity/table/column modification.
6. No DB writes.
7. No deployment.
8. No push.
9. No A3/A4 implementation.

## Required Review Scope

1. A5 evidence completeness.
2. RBAC/menu grant safety.
3. DataScope/store-scope safety.
4. Attachment proof / QR ACL safety.
5. Audit/log redaction.
6. Whether A5 HOLD may be lifted safely.
7. Whether A3/A4 Gate can open with conditions.

## Conclusion

Use one of: `GO`, `GO WITH CONDITIONS`, `HOLD`, `FAIL`.

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.
