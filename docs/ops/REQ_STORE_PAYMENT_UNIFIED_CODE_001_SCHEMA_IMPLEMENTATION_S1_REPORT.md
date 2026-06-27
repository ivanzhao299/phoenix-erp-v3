# Schema Implementation S1: Unified Store Payment Code 001

## Scope

This S1 change implements only the minimum reviewable schema layer for MVP-1 manual store payment records.

Included:

1. TypeORM TS migration for `store_payment_accounts`.
2. TypeORM TS migration for `store_payment_records`.
3. Minimal TypeORM entities aligned to the migration columns.
4. Minimal DTO draft for account and record create/query/transition shapes.

Excluded:

1. No frontend page.
2. No business service/controller/module wiring.
3. No POS, inventory, finance auto posting, Chanjet sync, or third-party callback.
4. No menu seed, permission seed, dict seed, or business data seed.
5. No production database write and no migration execution.

## Files Added

1. `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`
2. `apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts`
3. `apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts`
4. `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`

## Table Design

### `store_payment_accounts`

Uses `company_code` and `store_code` because existing project docs and A5 findings identify these as the current operational scope fields. `fin_cash_account_id` is nullable and intentionally has no hard FK in S1.

Key columns:

1. `id`
2. `account_code`
3. `account_name`
4. `company_code`
5. `store_code`
6. `fin_cash_account_id`
7. `currency`
8. `payment_method`
9. `qr_attachment_id`
10. `status`
11. `is_active`
12. audit timestamps and users
13. `deleted_at`

### `store_payment_records`

Uses `payment_no` as the unique business number per the S1 task. Payment screenshots are stored as `proof_attachment_id`, not a naked public upload URL.

Key columns:

1. `id`
2. `payment_no`
3. `company_code`
4. `store_code`
5. `payment_account_id`
6. `amount`
7. `currency`
8. `payment_method`
9. `paid_at`
10. `proof_attachment_id`
11. `order_no`
12. `sale_no`
13. `status`
14. submitted/confirmed/rejected/voided actor and time columns
15. `reason`
16. `remark`
17. audit timestamps and users
18. `deleted_at`

## Constraints And Indexes

Implemented:

1. `store_payment_accounts(company_code, store_code, account_code)` unique scoped business code.
2. `store_payment_records(payment_no)` unique.
3. `store_payment_records.amount >= 0` check.
4. `store_payment_accounts.status IN ('ACTIVE', 'DISABLED')` check.
5. `store_payment_records.status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'VOIDED')` check.
6. Store, status, paid-at, creator, submitter, payment-account, and soft-delete indexes.

g198 nullable unique rule:

1. All columns participating in unique constraints are `NOT NULL`.
2. Nullable fields are not part of unique constraints.

## Seed Decision

No seed is included in S1.

Menu codes remain report-only:

1. `MENU_STORE_PAYMENT_ACCOUNT`
2. `MENU_STORE_PAYMENT`
3. `MENU_STORE_PAYMENT_CONFIRM`
4. `MENU_STORE_PAYMENT_VOID`
5. `MENU_STORE_PAYMENT_EXPORT`

Payment method dictionary remains report-only. Existing dictionaries should be checked first; if insufficient, propose `STORE_PAYMENT_METHOD` in a later approved seed task.

## Attachment Protected Access

S1 stores `qr_attachment_id` and `proof_attachment_id` as protected-reference-oriented fields. It does not implement the protected file controller.

Residual risk:

1. Existing upload mechanics may still return `/uploads/contracts/...` URLs.
2. Store-payment UI/API must not expose raw screenshot URLs in list/export/log output.
3. A later approved backend task must implement permission-checked preview/download using the same record-level scope as payment detail.

## Entity Wiring

Entities are created under `apps/api/src/modules/store-payment/entities`.

They are not wired into a Nest module, service, or controller in S1 because the task explicitly limits implementation to the schema/entity/DTO layer and forbids a complete business service.

## Rollback

Migration `down()` drops only indexes and tables created by this migration:

1. `store_payment_records`
2. `store_payment_accounts`

It does not alter, drop, or rewrite any existing table.

## Remaining Questions For Later Phases

1. Confirm `STORE-VTE-001 / 万象直营店` and its company mapping by read-only DB check.
2. Decide whether `fin_cash_account_id` should later become a hard FK.
3. Decide canonical payment-method dictionary.
4. Implement store-level DataScope service checks before exposing APIs.
5. Implement protected attachment preview/download.
6. Decide and seed menu/permission records in a separately approved task.
