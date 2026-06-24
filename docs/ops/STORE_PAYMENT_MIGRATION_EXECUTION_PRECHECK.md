# Store Payment Migration Execution Precheck

Task ID: `STORE_PAYMENT_PILOT_GATE_S1`

Status: `READY_FOR_APPROVAL`

This document is a precheck package only. It does not execute migration and does not write database.

## Current DB State

Read-only DB evidence confirms the target DB is missing:

- `store_payment_accounts`
- `store_payment_records`

## Existing Migration File

Approved migration artifact:

`apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`

Expected objects:

- `store_payment_accounts`
- `store_payment_records`

The migration contains `down()` and does not include menu seed, role seed, business data seed, finance posting, POS binding, or attachment ACL implementation.

## Required User Approval

Migration execution is forbidden until the user explicitly approves:

1. Target environment.
2. Exact migration file.
3. Execution window.
4. Backup/restore readiness.
5. Rollback owner.
6. A2 and A1 prechecks.

## Pre-execution Checklist

| Check | Required result |
| --- | --- |
| Target environment selected | Explicitly named by user |
| DB backup status | Backup exists and restore path is known |
| Migration file hash | Captured before execution |
| `down()` availability | Present and reviewed |
| Data DML | None, unless separately approved; current S1 migration should remain no data DML |
| Destructive change | None |
| A2 security review | PASS WITH CONDITIONS or better |
| A1 migration gate | PASS |
| Freeze boundary approval | Schema Gate approval exists |
| Read-only pre-state snapshot | Tables absent or expected state captured |

## Suggested Static Validation Commands

These are precheck commands only and must not execute the migration:

```bash
node scripts/ci/check-migration-down.mjs
node scripts/ci/check-migration-data-dml.mjs
node scripts/ci/check-freeze-boundaries.mjs
node scripts/ci/check-w5-closeout-gate.mjs
shasum -a 256 apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts
```

## Post-execution Read-only Verification

After a separately approved migration execution, verify with read-only queries:

1. `to_regclass('public.store_payment_accounts')`.
2. `to_regclass('public.store_payment_records')`.
3. `information_schema.columns` for required fields.
4. `information_schema.table_constraints` for PK/unique/check constraints.
5. `pg_indexes` for expected indexes.
6. `SELECT count(*)` from the new tables, expecting no unexpected data.
7. Verify no unrelated table/schema changes.

## Rollback Plan

Rollback requires a separate user-approved DB rollback gate.

Preferred rollback order:

1. Stop Store Payment traffic or keep feature disabled.
2. Confirm no production Store Payment records exist.
3. If safe and approved, execute migration `down()`.
4. If data exists or integrity is uncertain, restore from backup instead of destructive rollback.
5. Re-run read-only catalog verification.

## This Round Boundary

This round does not:

- Execute migration.
- Run seed.
- Insert/update/delete data.
- Write DB.
- Deploy.
- Modify business code.

