# A2 Schema Security Review: Store Payment 001

> Request: `REQ-STORE-PAYMENT-UNIFIED-CODE-001`  
> Scope: read-only security review of A3 Schema Implementation S1.  
> Result: report-only. No A3 merge, no migration execution, no database write, no application code change.

## 1. Execution Environment

| Item | Value |
| --- | --- |
| pwd | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| branch | `w5-a2-security-regression-gate` |
| HEAD before report | `bd589c4 chore(ops): improve agent merge branch-state checks` |
| working tree before review | clean |
| A3 branch | `w5-a3-backend-critical-path` |
| A3 branch verify | `ac51773a425c7f6236811ae58ef31798a35675b1` |

## 2. Reviewed A3 Commit

| Item | Value |
| --- | --- |
| Commit | `ac51773a425c7f6236811ae58ef31798a35675b1` |
| Subject | `feat(schema): add store payment MVP tables` |
| Files in A3 diff | 5 files |

A3 changed files:

1. `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`
2. `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`
3. `apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts`
4. `apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts`
5. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_IMPLEMENTATION_S1_REPORT.md`

## 3. Read Files

Required documents:

1. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_PROPOSAL.md`
2. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md`
3. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_STATE_MACHINE.md`
4. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md`
5. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_MIGRATION_DRAFT.md`
6. `docs/ops/A2_SECURITY_DESIGN_STORE_PAYMENT_001_REPORT.md`
7. `docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md`

A3 files read from branch:

1. `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`
2. `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`
3. `apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts`
4. `apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts`
5. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_IMPLEMENTATION_S1_REPORT.md`

## 4. Read-Only Commands

Environment gate:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
git rev-parse --verify w5-a3-backend-critical-path
git log --oneline --decorate -3 w5-a3-backend-critical-path
```

Document review:

```bash
sed -n '1,280p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_PROPOSAL.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_STATE_MACHINE.md
sed -n '1,300p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_IMPLEMENTATION_PLAN.md
sed -n '1,320p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_MIGRATION_DRAFT.md
sed -n '1,360p' docs/ops/A2_SECURITY_DESIGN_STORE_PAYMENT_001_REPORT.md
sed -n '1,430p' docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md
```

A3 diff review:

```bash
git diff --name-only main...w5-a3-backend-critical-path
git diff --stat main...w5-a3-backend-critical-path
git diff main...w5-a3-backend-critical-path -- apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts
git diff main...w5-a3-backend-critical-path -- apps/api/src/modules/store-payment
git show --stat --oneline --name-only ac51773a425c7f6236811ae58ef31798a35675b1
git show w5-a3-backend-critical-path:docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_IMPLEMENTATION_S1_REPORT.md
git show w5-a3-backend-critical-path:apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts | rg -n "CREATE TABLE|DROP TABLE|DROP COLUMN|INSERT|UPDATE|DELETE|CHECK|UNIQUE|CREATE INDEX|DROP INDEX|store_payment|amount|status|deleted_at|submitted_by|payment_account_id|paid_at" -S
git show w5-a3-backend-critical-path:apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts
git show w5-a3-backend-critical-path:apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts
git show w5-a3-backend-critical-path:apps/api/src/modules/store-payment/dto/store-payment.dto.ts
```

## 5. Migration Security Review

Result: **PASS WITH CONDITIONS**

Findings:

1. Migration creates only `store_payment_accounts` and `store_payment_records`.
2. No existing table is altered.
3. No `DROP COLUMN` appears.
4. No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, or business seed DML appears.
5. `down()` drops only indexes and the two new tables from this migration.
6. Status check constraints are present:
   - account: `ACTIVE / DISABLED`
   - record: `PENDING / CONFIRMED / REJECTED / VOIDED`
7. Amount check constraint is present as `amount >= 0`, matching this review request. Note: prior draft text recommended `amount > 0`; final business decision should confirm whether zero-amount records are valid.
8. Unique constraints avoid nullable columns:
   - `store_payment_accounts(company_code, store_code, account_code)` with all fields `NOT NULL`
   - `store_payment_records(payment_no)` with `payment_no NOT NULL`
9. Index coverage is adequate for S1:
   - store: `store_code`
   - status: `status`
   - paid time: `paid_at`
   - submitter: `submitted_by`
   - payment account: `payment_account_id`
   - soft delete: `deleted_at`
   - composite query indexes: `(store_code, paid_at)` and `(status, paid_at)`

Security notes:

1. `CREATE TABLE IF NOT EXISTS` plus `down()` using `DROP TABLE IF EXISTS` can be risky if a table with the same name somehow existed before this migration. In normal controlled Schema Gate flow these are new names, but before merge A3 should confirm no pre-existing objects with these names in target environments or remove `IF NOT EXISTS` to fail fast on drift.
2. No hard FK is created from `store_payment_records.payment_account_id` to `store_payment_accounts.id`. This is acceptable for S1 only if later service logic validates the account exists, is active, belongs to the same store/company scope, and is not soft-deleted.
3. No hard FK is created to `fin_cash_accounts`, `mst_stores`, or attachments. This matches the soft-reference strategy but increases the importance of later service validation.

## 6. Entity / Migration Alignment Review

Result: **PASS WITH CONDITIONS**

Aligned items:

1. Table names match entity `@Entity` declarations.
2. Primary key strategy matches: `bigserial` / `@PrimaryGeneratedColumn('increment', { type: 'bigint' })`.
3. Column names, lengths, nullability, defaults, and timestamp fields are aligned for both entities.
4. Check constraints and unique constraints are represented in entities.
5. Index decorators align with migration index names and fields.
6. `deleted_at`, `created_at`, and `updated_at` exist in migration and entities.
7. `payment_no` uniqueness and account scoped uniqueness are aligned.

Conditions:

1. DTO numeric id fields (`finCashAccountId`, `paymentAccountId`) are typed and validated as strings while migration/entity columns are `bigint`. This may be intentional to avoid JavaScript bigint precision issues, but later service must normalize and validate numeric-id strings before repository save/query.
2. `amount` is TypeScript `number` while DB is `numeric(18,2)`. This is common in TypeORM but can lose exact decimal semantics in service math. Later service should avoid floating-point arithmetic for financial calculations and should validate scale.
3. Field naming uses `currency` instead of the earlier draft's `currency_code`. This is aligned between migration/entity/DTO, so not a drift issue, but API docs and UI should not mix both names.
4. `order_no` and `sale_no` are nullable in S1. They are not in unique constraints, so g198 is not violated.

## 7. RBAC Preconditions Review

Result: **PASS WITH CONDITIONS**

Findings:

1. A3 did not add menu seed.
2. A3 did not add permission seed.
3. A3 did not add controllers, guards, modules, or routes.
4. Proposed menu codes remain design/report-only:
   - `MENU_STORE_PAYMENT_ACCOUNT`
   - `MENU_STORE_PAYMENT`
   - `MENU_STORE_PAYMENT_CONFIRM`
   - `MENU_STORE_PAYMENT_VOID`
   - `MENU_STORE_PAYMENT_EXPORT`

Required before any controller/service exposure:

1. Account/code list/detail: `@RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'V')`.
2. Account/code create/update/disable: `@RequireMenu('MENU_STORE_PAYMENT_ACCOUNT', 'E')`.
3. Record list/detail: `@RequireMenu('MENU_STORE_PAYMENT', 'V')`.
4. Record create: `@RequireMenu('MENU_STORE_PAYMENT', 'C')`.
5. Record edit while pending: `@RequireMenu('MENU_STORE_PAYMENT', 'E')` plus owner/status checks.
6. Confirm/reject: `@RequireMenu('MENU_STORE_PAYMENT_CONFIRM', 'A')` or approved fallback `MENU_STORE_PAYMENT:A`.
7. Void: `@RequireMenu('MENU_STORE_PAYMENT_VOID', 'A')`.
8. Export: `@RequireMenu('MENU_STORE_PAYMENT_EXPORT', 'X')` or approved fallback `MENU_STORE_PAYMENT:X`.

Condition:

Menu and permission seed must remain a separately approved task. S1 must not be merged with hidden runtime access.

## 8. DataScope Preconditions Review

Result: **PASS WITH CONDITIONS**

Positive findings:

1. Both tables include `company_code` and `store_code`, which are necessary for company/store filtering.
2. Records include `submitted_by`, which supports clerk own-record filtering.
3. Records include `payment_account_id`, which supports account ownership and store/account consistency checks.
4. Soft-delete `deleted_at` exists for both tables.

Conditions before service/controller:

1. Clerk create must derive or validate `store_code` from authenticated user/pilot binding, not trust DTO body.
2. Clerk list/detail must enforce `submitted_by = current user` unless own-store visibility is explicitly approved.
3. Store manager list/detail/confirm/reject must enforce `store_code IN allowedStoreCodes`.
4. Finance list/detail/confirm/reject/export must enforce approved finance scope; all-store access requires explicit role/scope approval.
5. Admin global access must still be audited.
6. Service must reject cross-store payment account usage: record `store_code/company_code` must match the selected account.
7. `STORE-VTE-001 / 万象直营店` and company mapping still require read-only DB confirmation before pilot.

Residual risk:

`store_code` remains semantically overloaded in the broader codebase. S1 has the needed column, but later service must document the canonical source and avoid falling back to JWT `storeCode='ALL'` or POS-only semantics.

## 9. Attachment Protected Access Preconditions Review

Result: **PASS WITH CONDITIONS**

Findings:

1. S1 uses `qr_attachment_id` and `proof_attachment_id`, not obvious raw URL fields.
2. This supports a protected-reference-oriented design.
3. S1 correctly does not implement file access logic in this schema layer.

Required later:

1. Implement a protected preview/download controller or equivalent service.
2. Attachment access must reuse payment record detail permission and DataScope.
3. Store clerks must not preview/download other users' proofs outside approved own-record/own-store scope.
4. Store managers must only access own-store proofs.
5. Finance access must follow approved finance scope.
6. Export and operation logs must not expose raw screenshot URLs/storage keys.

Condition:

If the upload subsystem still returns `/uploads/contracts/...` URLs, store-payment APIs and UI must not expose those bare URLs as authorization. `proof_attachment_id` and `qr_attachment_id` must resolve through protected access.

## 10. Audit And State Machine Review

Result: **PASS WITH CONDITIONS**

Positive findings:

1. Record status covers the approved minimum set: `PENDING`, `CONFIRMED`, `REJECTED`, `VOIDED`.
2. Confirmation fields exist: `confirmed_by`, `confirmed_at`.
3. Rejection fields exist: `rejected_by`, `rejected_at`.
4. Void fields exist: `voided_by`, `voided_at`.
5. `reason` exists and can support reject/void/sensitive-edit reason capture.
6. S1 does not add a dedicated `store_payment_audit` table, consistent with the plan to prefer `sys_operation_logs`.

Conditions:

1. Later service must enforce legal transitions; DB check constraint only validates final status values.
2. Later service must require reason for reject, void, and any approved sensitive edit/proof replacement.
3. A single `reason` field is acceptable for S1, but it may be ambiguous after multiple transitions. Before workflow implementation, decide whether to keep one latest-transition reason or split into `rejected_reason` and `void_reason` for clearer audit evidence.
4. Status transition events must be written to `sys_operation_logs` or an approved audit service.
5. Confirmed records must not be silently edited. Corrections require void/correction flow, reason, and audit.

## 11. Sensitive Fields And Logs Review

Result: **PASS WITH CONDITIONS**

Findings:

1. S1 does not store full account numbers.
2. S1 does not store QR/proof raw URL columns by name; it stores attachment id/reference fields.
3. `remark` and `reason` can contain sensitive free text.
4. `qr_attachment_id` and `proof_attachment_id` can still reveal storage references if logged raw.
5. Amount/currency/store/account identifiers are business-sensitive and must be scoped and audited.

Required later:

1. Mask or omit `qr_attachment_id`, `proof_attachment_id`, and any resolved URL/storage key in logs.
2. Mask financial account identifiers if any are introduced later.
3. Redact or summarize `remark` and `reason` in generic operation logs.
4. Avoid dumping full DTO/entity snapshots into `after_data` without field-level redaction.
5. Export must require explicit `X` permission, must be audited, and must not include raw attachment references by default.

## 12. Blockers

None for Schema S1 controlled merge review.

No schema security hard blocker was found in the A3 S1 commit because it is limited to new tables/entities/DTOs, does not alter old tables, does not seed menus/permissions/data, and does not execute runtime access paths.

## 13. Conditions

1. Confirm target DB has no pre-existing `store_payment_accounts` or `store_payment_records` before migration merge/execution, or revise migration to fail fast instead of `CREATE TABLE IF NOT EXISTS`.
2. Before controller/service work, seed/approve RBAC menus in a separate task and attach `@RequireMenu` per the permission matrix.
3. Implement service-level store DataScope; company-only filtering is not enough.
4. Validate payment account ownership/scope and active status before creating records.
5. Implement protected attachment access before exposing proof/QR preview or download.
6. Add audit events for create/edit/confirm/reject/void/proof change/export/access denial.
7. Add log redaction for attachment ids/URLs, remarks, reasons, and any future account identifiers.
8. Decide whether zero-amount records are allowed. If not, change `amount >= 0` to `amount > 0` before migration execution.
9. Decide whether one `reason` field is sufficient or split `rejected_reason` / `void_reason` before workflow implementation.
10. Confirm `STORE-VTE-001 / 万象直营店` and company mapping by read-only DB check before pilot.

## 14. Deferrable Items

1. Hard FK to `fin_cash_accounts`, `mst_stores`, order, POS sale, or attachment table can remain deferred if service validation is explicit.
2. Dedicated `store_payment_audit` table can remain deferred while `sys_operation_logs` is the approved audit path.
3. `STORE_PAYMENT_METHOD` dict seed can be deferred if existing dictionaries are reused.
4. Frontend pages, protected preview UI, export UI, and UAT are later A4/A6/A7 work.
5. Third-party callback, bank auto-arrival, Chanjet sync, POS hard binding, inventory linkage, and finance posting remain out of MVP-1 S1.

## 15. Conclusion

**PASS WITH CONDITIONS**

A3 S1 satisfies the core Schema Gate security prerequisites for a schema-layer change: additive new tables only, no old-table mutation, no data DML, no menu/permission seed, entity/migration alignment, and enough fields for store scope, submitter scope, attachment references, and state audit.

The conditions are mostly pre-controller/pre-service gates and migration execution hygiene. They must be resolved before runtime exposure or migration execution in any shared/staging/production environment.

## 16. Frozen Items Touched

No.

This A2 review did not touch frozen runtime code, A3 files, schema, migrations, entities, controllers, services, deployment files, or database state.

## 17. Code Change Statement

No application code was changed by this A2 review.

Only this report under `docs/ops/**` was added.

## 18. Migration Execution Statement

No migration was executed.

No database command was run.

## 19. A3 Merge Recommendation

**YES WITH CONDITIONS**

A3 can proceed to controlled merge review only if reviewers accept the S1 scope as schema-only and track the listed conditions for the next backend/security tasks. Do not expose controllers/routes or run the migration in any shared environment until RBAC, DataScope, protected attachment access, audit, and log masking conditions are explicitly satisfied.
