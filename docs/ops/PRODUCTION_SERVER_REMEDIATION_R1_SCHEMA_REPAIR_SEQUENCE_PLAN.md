# Production Server Remediation R1 Schema Repair Sequence Plan

Date: 2026-06-23

## Objective

Define the minimum-risk execution sequence after R1 migration-state audit and schema repair precheck.

## Recommended Order

### 1. REMOTE_CODE_ALIGNMENT_EXECUTION_GATE

Goal: align remote code from `main@87b5781` to the user-approved verified commit containing File Metadata migration and current remediation docs.

Allowed after approval:

- code alignment only.
- no migration.
- no DB write.
- no deploy.
- no service restart unless separately approved.

Validation:

- remote migration files exist.
- remote commit recorded.
- rollback commit remains `87b5781`.

### 2. STORE_PAYMENT_SCHEMA_DRIFT_RECONCILIATION_GATE

Goal: resolve Store Payment history/table inconsistency before running any schema repair.

Required:

- DB identity check.
- schema/search_path check.
- migration table row check.
- cross-schema table check.
- decision on whether history row is wrong, table is missing, or target DB is wrong.

Forbidden:

- blind migration re-run.
- destructive history update without approval.

### 3. FILE_METADATA_MIGRATION_EXECUTION_GATE

Goal: execute approved File Metadata migration after remote code contains `1782042418112-CreateFileMetadata.ts`.

Required:

- DB backup.
- migration hash.
- no data DML check.
- down() check.
- A1/A2 approval.

### 4. STORE_PAYMENT_SCHEMA_REPAIR_EXECUTION_GATE

Goal: ensure `store_payment_accounts` and `store_payment_records` exist.

Required:

- Store Payment drift classification complete.
- repair action chosen.
- no business data destruction.
- rollback notes approved.

### 5. MENU_ROLE_DATASCOPE_REMOTE_SYNC_GATE

Goal: repair `MENU_STORE_PAYMENT*`, role grants, and DataScope readiness.

Required:

- schema repaired first.
- A2 RBAC/DataScope review.
- A5 user/store readiness validation.

### 6. MASTER_DATA_REMEDIATION_GATE

Goal: clean company, organization, store, project, and farm readiness for controlled trial.

Required:

- read-only duplicate/missing scans.
- user-approved data owner decisions.

## Why Code Alignment First

File Metadata cannot be repaired through the reviewed migration path while the migration file is absent from remote code. Code alignment is the least invasive next step because it can be executed without DB write, migration, restart, or deploy if scoped correctly.

## Safety Boundaries

| Action | Current default |
| --- | --- |
| migration | forbidden until dedicated Gate |
| DB write | forbidden until dedicated Gate |
| deploy | forbidden until dedicated Gate |
| service restart | forbidden until dedicated Gate |
| push main | forbidden until dedicated Gate |
| cleanup / reset | forbidden |

## Current Recommendation

Next single Gate: `REMOTE_CODE_ALIGNMENT_EXECUTION_GATE`.

