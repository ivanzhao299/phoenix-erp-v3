# Production Server Remediation R1 Store Payment Schema Drift Precheck

Date: 2026-06-23

## Objective

Classify the Store Payment migration history/table inconsistency without repairing it.

## Known Evidence

| Evidence | Result |
| --- | --- |
| Store Payment migration file on remote | present |
| Store Payment migration file hash | matches local approved file |
| Store Payment history match | present in R1 audit summary |
| `store_payment_accounts` table | missing |
| `store_payment_records` table | missing |
| migration execution in this Gate | no |
| DB write in this Gate | no |

## Required DB Identity Checks

The approved precheck requested fresh read-only checks for:

- `current_database()`
- `current_schema()`
- `search_path`
- `information_schema.tables`
- `pg_catalog.pg_tables`
- `migrations` table
- Store Payment table presence across schemas

Fresh SSH session attempts failed with banner timeout after the R1 audit, so these identity checks remain a required condition for the next drift reconciliation Gate. The R1 evidence still proves that the audited DB target had no Store Payment tables.

## Possible Causes

| Possible cause | Status |
| --- | --- |
| migration history from old DB / wrong DB | not ruled out |
| migration table manually written | not ruled out |
| migration executed then table dropped | not ruled out |
| transaction rollback but history row remained | not ruled out |
| different schema namespace | not ruled out |
| API health DB differs from audited DB | not ruled out |
| query permission / search_path issue | not ruled out |
| history/table drift in same DB | likely based on current evidence |

## Drift Classification

Primary classification: `HISTORY_TABLE_DRIFT`.

Reason:

- R1 evidence shows Store Payment migration history text matches exist.
- R1 evidence also shows Store Payment tables are absent in the audited DB.

Condition:

- This classification must be revalidated with DB identity and cross-schema queries before any migration repair execution.

## Repair Boundary

Do not blindly re-run Store Payment migration. The next Store Payment schema Gate must first determine whether the inconsistency is caused by wrong target, wrong schema, deleted tables, manual history, or partial migration state.

## Recommended Next Gate

`STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE`

This Gate should:

1. Confirm DB identity.
2. Confirm schema/search_path.
3. Confirm exact migration table rows.
4. Confirm whether any Store Payment tables exist outside `public`.
5. Decide whether to repair migration history, recreate tables, or stop as HOLD.

## A1 / A2 / A5

| Agent | Conclusion |
| --- | --- |
| A1 | PASS WITH CONDITIONS |
| A2 | PASS WITH CONDITIONS |
| A5 | HOLD |

## Safety Record

| Action | Result |
| --- | --- |
| DB write | no |
| migration | no |
| deploy | no |
| restart | no |
| push | no |

## Conclusion

READY_FOR_RECONCILIATION_APPROVAL, but not ready for migration execution.

