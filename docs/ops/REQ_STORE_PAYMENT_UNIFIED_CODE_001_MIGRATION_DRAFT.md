# Migration Draft: Unified Store Payment Code 001

> Draft only. Do not create a migration file from this document without explicit user approval.

## Expected New Tables

1. `store_payment_accounts`
2. `store_payment_records`

Not expected:

1. `store_payment_audit`, unless later rejected reuse of `sys_operation_logs`.
2. finance receipt tables.
3. POS/inventory linkage tables.

## `store_payment_accounts` Field Draft

| Field | Type suggestion | Null strategy | Notes |
| --- | --- | --- | --- |
| id | uuid or bigint, project convention | NOT NULL | Primary key. |
| account_code | varchar(64) | NOT NULL | Business code. |
| account_name | varchar(160) | NOT NULL | Display name. |
| company_code | varchar(64) | NOT NULL | Company scope. |
| store_code | varchar(64) | NOT NULL default '' if scoped unique includes it | `STORE-VTE-001` style, final DB confirmed. |
| cash_account_code | varchar(64) | NULL or NOT NULL default '' if unique/index strategy needs it | Optional reference to `fin_cash_accounts`. |
| payment_method | varchar(64) | NOT NULL | Reuse existing dict if stable. |
| currency_code | varchar(16) | NOT NULL | Active currency. |
| qr_attachment_ref | varchar(255) or uuid | NULL | Protected attachment reference, not raw public URL if possible. |
| masked_account_no | varchar(128) | NULL | Masked only. |
| status | varchar(32) | NOT NULL default 'ACTIVE' | ACTIVE / DISABLED. |
| effective_from | timestamp | NULL | Optional. |
| effective_to | timestamp | NULL | Optional. |
| remarks | text | NULL | Do not log raw sensitive text. |
| created_by | varchar(64) | NOT NULL default '' | Audit. |
| updated_by | varchar(64) | NOT NULL default '' | Audit. |
| created_at | timestamp | NOT NULL default now() | Audit. |
| updated_at | timestamp | NOT NULL default now() | Audit. |
| deleted_at | timestamp | NULL | Prefer soft delete only if project convention requires. |

## `store_payment_records` Field Draft

| Field | Type suggestion | Null strategy | Notes |
| --- | --- | --- | --- |
| id | uuid or bigint, project convention | NOT NULL | Primary key. |
| record_no | varchar(64) | NOT NULL | Unique business number. |
| company_code | varchar(64) | NOT NULL | Company scope. |
| store_code | varchar(64) | NOT NULL | Store scope. |
| account_code | varchar(64) | NOT NULL | Selected store payment account. |
| receiver_user_id | varchar(64) | NOT NULL default '' | Recorder id if available. |
| receiver_username | varchar(128) | NOT NULL | Recorder username. |
| payment_method | varchar(64) | NOT NULL | Dict-backed. |
| currency_code | varchar(16) | NOT NULL | Dict/master-backed. |
| amount | numeric(18, 2) or project money convention | NOT NULL | CHECK amount > 0. |
| payment_time | timestamp | NOT NULL | Customer payment time. |
| proof_attachment_ref | varchar(255) or uuid | NOT NULL | Protected payment screenshot reference. |
| order_no | varchar(64) | NOT NULL default '' | Optional soft reference; avoid nullable unique risk. |
| sale_no | varchar(64) | NOT NULL default '' | Optional POS/store sale soft reference. |
| status | varchar(32) | NOT NULL default 'PENDING' | PENDING / CONFIRMED / REJECTED / VOIDED. |
| reject_reason | text | NOT NULL default '' | Required by service when status REJECTED. |
| void_reason | text | NOT NULL default '' | Required by service when status VOIDED. |
| confirmed_by | varchar(64) | NOT NULL default '' | Required by service when confirmed. |
| confirmed_at | timestamp | NULL | Required by service when confirmed. |
| rejected_by | varchar(64) | NOT NULL default '' | Required by service when rejected. |
| rejected_at | timestamp | NULL | Required by service when rejected. |
| voided_by | varchar(64) | NOT NULL default '' | Required by service when voided. |
| voided_at | timestamp | NULL | Required by service when voided. |
| remarks | text | NOT NULL default '' | Redact in logs. |
| created_by | varchar(64) | NOT NULL default '' | Audit. |
| updated_by | varchar(64) | NOT NULL default '' | Audit. |
| created_at | timestamp | NOT NULL default now() | Audit. |
| updated_at | timestamp | NOT NULL default now() | Audit. |
| deleted_at | timestamp | NULL | Prefer not to hard delete. |

## Nullable / Not Null Strategy

1. Unique/index participating business fields should be NOT NULL.
2. Optional text references should use `''` when they may be part of unique/index logic.
3. Timestamps for status transitions may be NULL until transition happens.
4. Use service checks for conditional requirements such as reason on reject/void.

## Default Value Strategy

1. `status`: `ACTIVE` for accounts, `PENDING` for records.
2. audit users: `''` only if project convention does this; otherwise use authenticated user in service.
3. optional references: `''`.
4. `created_at` / `updated_at`: `now()`.

## FK Strategy

Prefer soft references at first unless project conventions and DB state are confirmed:

1. `store_code` references `mst_stores.store_code` or `sys_organizations.org_code` only after DB confirmation.
2. `cash_account_code` references `fin_cash_accounts.account_code` only if finance approves.
3. `order_no` / `sale_no` remain soft references in MVP-1.
4. attachment reference strategy depends on protected ACL design.

## Index Strategy

1. `store_payment_accounts(account_code)` unique.
2. `store_payment_accounts(company_code, store_code, status)`.
3. `store_payment_accounts(cash_account_code)`, if referenced.
4. `store_payment_records(record_no)` unique.
5. `store_payment_records(store_code, payment_time)`.
6. `store_payment_records(receiver_username, payment_time)`.
7. `store_payment_records(currency_code, payment_method, payment_time)`.
8. `store_payment_records(status, payment_time)`.
9. Optional `order_no` / `sale_no` indexes if MVP-1 query needs them.

## Unique Constraint Strategy

1. `record_no` unique.
2. `account_code` unique or scoped unique by `company_code + store_code + account_code`, pending design.
3. Avoid nullable columns in unique constraints.
4. If partial unique indexes are required, document why and add tests.

## Check Constraint Strategy

1. `amount > 0`.
2. `store_payment_accounts.status IN ('ACTIVE','DISABLED')`.
3. `store_payment_records.status IN ('PENDING','CONFIRMED','REJECTED','VOIDED')`.
4. Optional currency/payment method checks should prefer dictionaries over DB hardcoding.

## Timestamp / Delete Strategy

1. Include `created_at` and `updated_at`.
2. Include `deleted_at` only for soft delete convention; MVP-1 should not expose delete.
3. Do not hard delete payment records.

## Rollback Strategy

1. Rollback migration may drop new tables only before production/pilot data exists.
2. After pilot data exists, prefer disable/read-only rollback over destructive rollback.
3. Any down migration must be explicit and reviewed.
4. No `DROP COLUMN` against existing tables.

## Forbidden Migration Actions

1. No destructive changes to existing finance/POS/inventory tables.
2. No `DROP COLUMN`.
3. No rewrite of existing `fin_cash_accounts`.
4. No business data seed in migration unless separately approved by migration policy.
5. No production DDL without approval.

## Data Initialization Strategy

1. Pilot store, users, roles, and finance confirmer must be confirmed by DB read-only check.
2. Account/code records should be initialized through admin UI or approved seed path, not hidden migration business seed.
3. Menu/permission seeds require separate approval.

## Seed Strategy

1. Menu seed: separate approval.
2. Permission seed: separate approval.
3. Dict seed: reuse existing dict first; only propose `STORE_PAYMENT_METHOD` if required.
4. Business seed: avoid in migration.

## Still Requires User Approval

1. Migration creation.
2. Table and field final names.
3. FK strictness.
4. Attachment reference table or protected endpoint strategy.
5. Menu/permission seed scope.
6. Payment method dictionary decision.
