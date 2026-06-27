# A2 Contract: Store Payment Read-only DB Evidence Security Review

Task ID: `STORE-PAYMENT-READ-ONLY-DB-EVIDENCE-A2-REVIEW`

Assigned Agent: `A2-Security-Regression-Gate`

## Goal

Perform a read-only security review of `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- Any schema/entity/table/column implementation file
- Any deployment or production config file

## Required Checks

1. Confirm the evidence report did not leak secrets.
2. Confirm DB queries were read-only and did not write database.
3. Review Store Payment menu/role/readiness findings for RBAC risk.
4. Review user/store scope findings for DataScope risk.
5. Review attachment proof/QR readiness for ACL risk.
6. Decide whether A5 HOLD can be cleared from a security perspective.

## Acceptance Criteria

- Report includes security conclusion: `PASS`, `PASS WITH CONDITIONS`, `HOLD`, or `FAIL`.
- Report states whether A3 Backend Gate may open.
- Report states whether A4 Frontend Gate may open.
- Report confirms no DB write, migration, deploy, push, or business code change.

## Output File

`docs/ops/A2_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REVIEW.md`

## Stop Rules

Stop on dirty worktree, forbidden path changes, missing source report, or any need to modify business code.

