# A2 Backend S2 Security Review: Store Payment 001

> Request: `REQ-STORE-PAYMENT-UNIFIED-CODE-001`  
> Scope: read-only security review of A3 Backend S2 implementation.  
> Result: report-only. No A3 merge, no code change, no migration execution, no database write, no deployment.

## 1. Execution Environment

| Item | Value |
| --- | --- |
| pwd | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| branch | `w5-a2-security-regression-gate` |
| HEAD before report | `ea1fc75 docs(ops): draft backend S2 package for unified store payment` |
| working tree before review | clean |
| A3 branch | `w5-a3-backend-critical-path` |
| A3 branch commit | `a291db61c09de09a5daaaa04ce18d3d9a9daf466` |

## 2. Reviewed A3 Commit

| Item | Value |
| --- | --- |
| Commit | `a291db61c09de09a5daaaa04ce18d3d9a9daf466` |
| Subject | `feat(api): add store payment backend MVP endpoints` |
| A3 files reviewed | 5 |

Reviewed A3 files:

1. `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`
2. `apps/api/src/modules/store-payment/store-payment.controller.ts`
3. `apps/api/src/modules/store-payment/store-payment.module.ts`
4. `apps/api/src/modules/store-payment/store-payment.service.ts`
5. `docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md`

## 3. Read-Only Commands

Environment gate:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Documents:

```bash
sed -n '1,280p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_BACKEND_S2_TASK_PACKAGE.md
sed -n '1,320p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_API_DRAFT.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_PERMISSION_MATRIX.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_STATE_MACHINE.md
sed -n '1,380p' docs/ops/A2_SCHEMA_SECURITY_REVIEW_STORE_PAYMENT_001_REPORT.md
git show w5-a3-backend-critical-path:docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md
```

A3 diff:

```bash
git rev-parse --verify w5-a3-backend-critical-path
git log --oneline --decorate -3 w5-a3-backend-critical-path
git diff --name-only main...w5-a3-backend-critical-path
git diff --stat main...w5-a3-backend-critical-path
git diff main...w5-a3-backend-critical-path -- apps/api/src/modules/store-payment
git diff main...w5-a3-backend-critical-path -- docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md
```

## 4. Controller / RBAC Review

Result: **PASS**

Findings:

1. `StorePaymentController` is class-guarded by `@UseGuards(MenuGuard, DataScopeGuard)`.
2. Every route has `@RequireMenu`.
3. Account list uses `MENU_STORE_PAYMENT_ACCOUNT:V`.
4. Account create/update uses `MENU_STORE_PAYMENT_ACCOUNT:E`.
5. Record list/detail uses `MENU_STORE_PAYMENT:V`.
6. Record create uses `MENU_STORE_PAYMENT:C`.
7. Confirm/reject use `MENU_STORE_PAYMENT_CONFIRM:A`.
8. Void uses `MENU_STORE_PAYMENT_VOID:A`.
9. No high-risk write route is guarded by `V`.
10. Export is not implemented, so `MENU_STORE_PAYMENT_EXPORT:X` remains deferred.

Condition:

Menu registration and role grants are not in A3 S2. Runtime exposure still requires separately approved menu/permission seed or existing registration; otherwise `MenuGuard` will reject unregistered menu codes.

## 5. DataScope Review

Result: **PASS WITH CONDITIONS**

Positive findings:

1. A3 did not refactor global `DataScopeService`.
2. Service implements local minimal filtering with `allowedStoreCodes()` from JWT `storeCode` plus CLS `dataScope.allowedSiteCodes`.
3. `storeCode='ALL'` is filtered out.
4. Manager scope is restricted to `storeCode IN allowedStoreCodes`.
5. Clerk create validates body `storeCode` against allowed stores and does not trust body alone.
6. Clerk list/detail allows own records or allowed-store records, matching A3's stated S2 policy.
7. Unknown roles fall through to `1 = 0` / forbidden.

Conditions:

1. `allowedSiteCodes` as a store-scope substitute must be accepted only as a pilot transition strategy. Before pilot, confirm `STORE-VTE-001` appears in the same code namespace that `allowedSiteCodes` carries.
2. Finance all-store access is currently role-based for `ROLE_FIN_ACCT`, `ROLE_FIN_CFO`, `ROLE_GROUP_FINANCE`, and `ROLE_HQ_FINANCE`. This must be confirmed against final role policy because the matrix says finance all-store access must be explicit.
3. Clerk own-store visibility is allowed by the implementation. If business later chooses "own records only", `applyRecordScope` and `assertRecordScope` must be tightened.
4. Store manager/finance role assignment for the pilot store still needs data confirmation.

## 6. State Machine Review

Result: **PASS**

Findings:

1. Create writes `status: 'PENDING'` server-side; request body cannot set status.
2. Confirm allows only `PENDING -> CONFIRMED`.
3. Reject allows only `PENDING -> REJECTED` and requires non-empty reason.
4. Void allows `PENDING / REJECTED / CONFIRMED -> VOIDED` and requires non-empty reason.
5. `VOIDED` is terminal.
6. Reverse confirmation is not implemented.
7. No edit endpoint for confirmed records is exposed in S2.

Condition:

`ConfirmStorePaymentRecordDto.comment` is stored in the shared `reason` column on confirm. This is acceptable for S2 but should be documented as "latest transition note" semantics, or split reason/comment fields later if audit needs require separate values.

## 7. Account / Record Consistency Review

Result: **PASS**

Findings:

1. Record create checks `paymentAccountId` exists.
2. Deleted accounts are rejected.
3. Account must be `status === 'ACTIVE'` and `isActive === true`.
4. Account `companyCode` and `storeCode` must match the record request.
5. Account `currency` and `paymentMethod` must match the record request.
6. Duplicate `paymentNo` is checked.
7. Auto-generated `paymentNo` uses advisory transaction lock for same-day sequence generation.
8. Amount is validated as `> 0` in service and `@Min(0.01)` in DTO, strengthening the S1 DB `amount >= 0` check.

Condition:

Because there is no hard FK in S1, all future write paths must keep using the same service-level account validation. No alternate raw insert path should be added.

## 8. Attachment ACL Review

Result: **PASS WITH CONDITIONS**

Positive findings:

1. Create requires `proofAttachmentId`.
2. `proofAttachmentId` and `qrAttachmentId` reject `/uploads/...`, `uploads/...`, `http://...`, and `https://...`.
3. Account and record responses return `qrAttachmentBound` / `proofAttachmentBound`, not raw attachment ids.
4. Audit payload uses bound booleans rather than raw QR/proof values.
5. No raw URL fallback endpoint was added.

Conditions:

1. Protected preview/download is not implemented in S2. A4/UI must not attempt to render proof images until a protected endpoint exists.
2. `proofPreviewAllowed: true` is returned for all scoped records. Since no preview endpoint exists, this should be treated as a future capability flag, not as proof of downloadable access. Prefer changing it to a real permission calculation when protected access is implemented.
3. Permission-denied events for proof access cannot be audited yet because the proof access endpoint is deferred.

## 9. Audit Log Review

Result: **PASS WITH CONDITIONS**

Positive findings:

1. Account create/update/disable writes service-level `sys_operation_logs`.
2. Record create/confirm/reject/void writes service-level `sys_operation_logs`.
3. Audit payload redacts QR/proof references into boolean flags.
4. `remark` and `reason` are logged as presence booleans, not full text.
5. Amount, currency, store, account, status, submitter, and transition actors are captured in redacted audit payloads.

Conditions:

1. Permission denied events are not explicitly audited for record access because scope checks throw directly. This is acceptable for S2 if deferred, but should be addressed when protected attachment access/export are added.
2. `toRecordResponse` returns shortened `reason` and `remark`. That is not operation-log leakage, but it is still API exposure; frontend permissions should treat detail access as sensitive.
3. `requestMethod` is set to `SERVICE` and IP/user agent are null in service-level audit. This is acceptable for deterministic service audit, but if forensic requirements increase, controller/request metadata should be added later.

## 10. Module Wiring Review

Result: **PASS WITH CONDITIONS**

Findings:

1. `StorePaymentModule` is implemented with TypeORM repositories, controller, and service.
2. A3 did not register `StorePaymentModule` in `AppModule`.
3. A3 report explicitly states this was intentional because the approved diff scope did not include `apps/api/src/app.module.ts`.

Assessment:

This is not a security blocker for S2 controlled merge review because unregistered routes are not runtime-exposed. It is a functional condition before A4/UI/pilot: a separately approved minimal wiring task must register the module, and that task must re-run RBAC/MenuGuard checks after menu registration.

## 11. CI / Freeze Gate Review

Result: **PASS WITH CONDITIONS**

Findings:

1. Diff is limited to `apps/api/src/modules/store-payment/**` and the A3 report.
2. No migration was added in Backend S2.
3. No schema/entity/table/column change was introduced in S2.
4. No `apps/web/**`, finance/POS/inventory/Chanjet core module, deployment file, or migration file was changed.
5. A3 reports `tsc` and security regression check passed.
6. Freeze boundary gate fails without explicit authorization and passes with `ALLOW_FREEZE_TOUCH=true`.

Assessment:

Using `ALLOW_FREEZE_TOUCH=true` is reasonable for this explicitly authorized Backend S2 task because the diff touches only the approved store-payment backend files. Before final merge, the merge owner should preserve the explicit authorization trail in the merge report.

## 12. Blockers

None for A3 Backend S2 controlled merge review.

No hard security blocker was found in the reviewed A3 S2 implementation. The implementation is intentionally not runtime-wired yet, has route-level RBAC, performs local store/account checks, avoids raw attachment URL exposure, and adds service-level audit.

## 13. Conditions

1. Register `StorePaymentModule` in `AppModule` only in a separately approved minimal wiring task.
2. Seed/register menu codes and role grants separately before runtime exposure.
3. Confirm whether `allowedSiteCodes` safely represents pilot store scope for `STORE-VTE-001`.
4. Confirm final finance roles allowed to view/confirm all stores.
5. Confirm whether clerks may see own-store records or only own records.
6. Implement protected proof/QR preview/download before any UI shows screenshots.
7. Treat `proofPreviewAllowed` as provisional until protected access exists.
8. Add permission-denied audit for protected proof access when that endpoint is implemented.
9. Keep all future write paths behind this service or equivalent account/scope validation.
10. Re-run API typecheck and freeze/security gates after module wiring and menu seed tasks.

## 14. Deferrable Items

1. Export endpoint and `MENU_STORE_PAYMENT_EXPORT:X`.
2. Frontend pages and UAT smoke.
3. Protected attachment controller, as long as no UI exposes screenshots before it exists.
4. Permission-denied audit for attachment access, until attachment endpoint exists.
5. Stronger forensic metadata in service audit logs.
6. POS hard binding, finance posting, Chanjet sync, bank callback, and inventory linkage remain out of MVP-1 S2.

## 15. Conclusion

**PASS WITH CONDITIONS**

A3 Backend S2 satisfies the core security expectations for an unreleased backend module: all routes have `@RequireMenu`, high-risk actions use `A`/`E` rather than `V`, state transitions are constrained, account/record scope consistency is checked, attachment raw URLs are rejected, and audit logging is present with basic redaction.

The remaining items are runtime exposure conditions: module wiring, menu seed, final DataScope semantics, finance role policy, and protected attachment preview/download.

## 16. A3 Merge Recommendation

**YES WITH CONDITIONS**

A3 can proceed to controlled merge review if the team accepts that the module is not yet registered and no runtime endpoint is exposed until a later approved wiring/menu task. Do not start A4 or pilot use until the conditions above are resolved or explicitly accepted.

## 17. No-Write Statement

| Item | Result |
| --- | --- |
| Code changed by A2 | No |
| A3 merged | No |
| Migration executed | No |
| Database written | No |
| Deployment | No |
