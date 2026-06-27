# A2 Contract: Store Payment S1 Approval Precheck

Task ID: `STORE-PAYMENT-S1-APPROVAL-PRECHECK-A2`

Assigned Agent: `A2-Security-Regression-Gate`

## Goal

Perform a read-only security precheck of the Store Payment S1 approval matrix and decision.

## Required Review

1. Migration risk.
2. Menu role permission risk.
3. RBAC / DataScope risk.
4. Store-code normalization risk.
5. Protected attachment ACL risk.
6. Over-authorization / unauthorized access risk.
7. Whether any item may enter a single Gate execution request.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- schema/entity/table/column files
- deploy/production files

## Output File

`docs/ops/A2_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md`

## Stop Rules

Stop on forbidden path changes, need for DB write, need for migration execution, need for deploy, or missing source docs.

