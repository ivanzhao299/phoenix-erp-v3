# A2 Security Design Report: Store Payment 001

> Request: `REQ-STORE-PAYMENT-UNIFIED-CODE-001`  
> Scope: MVP-1 security design read-only review for direct-store unified company collection code records.  
> Result: report-only. No application code, schema, migration, database write, deployment, or A1 blocker repair was performed.

## 1. Execution Environment

| Item | Value |
| --- | --- |
| pwd | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| branch | `w5-a2-security-regression-gate` |
| HEAD | `25f4329 docs(ops): assess data readiness for unified store payment` |
| working tree before audit | clean |
| AGENTS.md tracked | yes |

## 2. Read Documents

1. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md`
2. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md`
3. `docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md`
4. `docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md`
5. `docs/ops/AGENT_TASK_BOARD.md`

## 3. Read-Only Check Commands

Environment gate:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -5
git ls-files AGENTS.md
git rev-parse --short HEAD
```

Document review:

```bash
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_AGENT_CONTRACTS.md
sed -n '1,260p' docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SCHEMA_GATE_CHECKLIST.md
sed -n '1,320p' docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md
sed -n '320,520p' docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md
sed -n '1,260p' docs/ops/AGENT_TASK_BOARD.md
```

Read-only source inspection:

```bash
rg -n "RequireMenu|MenuGuard|sys_role_menu_permission|MENU_STORE|MENU_FIN|MENU_MD|CONFIRM|VOID|DataScope|allowedSiteCodes|allowedCompanyCodes|AttachmentUploader|upload/contract|sys_operation_logs|OperationLog|mst_audit|Audit" apps/api apps/web docs/ops -S
rg --files apps/api/src | rg 'guard|decorator|upload|operation|audit|data-scope|menu|role|attachment|file'
rg --files apps/web/src | rg 'AttachmentUploader|shared-selectors|Store|Payment|permission|menu'
sed -n '1,240p' apps/api/src/common/guards/menu.guard.ts
sed -n '1,180p' apps/api/src/common/guards/menu-registry.service.ts
sed -n '1,260p' apps/api/src/modules/org/services/data-scope.service.ts
sed -n '260,420p' apps/api/src/modules/org/services/data-scope.service.ts
sed -n '1,120p' apps/api/src/modules/org/guards/data-scope.guard.ts
sed -n '1,220p' apps/api/src/modules/org/helpers/data-scope.helper.ts
sed -n '1,260p' apps/api/src/modules/upload/upload.controller.ts
sed -n '1,260p' apps/api/src/common/entities/sys-operation-log.entity.ts
sed -n '1,360p' apps/api/src/common/interceptors/operation-log.interceptor.ts
sed -n '1,260p' apps/api/src/modules/master-data/master-data-audit.service.ts
sed -n '190,235p' apps/api/migrations/20260531_role_runtime_phase_a.sql
sed -n '1,120p' apps/api/migrations/20260601_finance_hardening_p2_menu_visibility.sql
sed -n '1,180p' apps/api/src/auth/permissions.util.ts
sed -n '1,260p' apps/web/src/hooks/usePermission.ts
sed -n '1,260p' apps/web/src/components/design-system/forms/AttachmentUploader.tsx
rg -n "store_code|STORE|ROLE_CASHIER|ROLE_STORE_MGR|allowedSiteCodes|MENU_STORE_POS|MENU_MD_STORE|storeCode" apps/api/src apps/api/migrations docs/ops -S
```

## 4. RBAC Design Recommendation

Findings:

1. Backend RBAC is enforced by `@RequireMenu(menu, perm)` plus `MenuGuard`.
2. Valid permission bits are `V/C/E/D/A/X`: view, create, edit, delete, approve, export.
3. `MenuGuard` rejects unregistered menu codes through the runtime menu registry. New menu codes must be inserted into `sys_menu` before protected APIs can work.
4. Existing `MENU_STORE_POS` must not be reused for this MVP because POS completion paths can write inventory, AR, and cash transactions.
5. Existing finance/master-data menus such as `MENU_FIN2_CASH_MASTER`, `MENU_MD_CASH_ACCOUNT`, and `MENU_MD_BANK_ACCOUNT` are useful references, but they do not express store collection QR code maintenance with store binding and screenshot-style evidence.

Recommendation:

1. Add dedicated design-only menu codes in Schema Gate; do not implement seed in this A2 round.
2. Use `MENU_STORE_PAYMENT` for operational payment records.
3. Use `MENU_STORE_PAYMENT_ACCOUNT` for company collection account/code maintenance.
4. Put these under the store/finance information architecture only after UX approval. Security-wise, record entry is store operations, while account/code maintenance is finance/admin control.

Recommended permission matrix:

| Role | Menu | Permission | Boundary |
| --- | --- | --- | --- |
| Store clerk / `ROLE_CASHIER` | `MENU_STORE_PAYMENT` | `V,C,E` | Create own records; view own records and approved own-store scope; edit only own `PENDING_CONFIRM` records before confirmation. |
| Store manager / `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT` | `V,A` plus optional `E` | View own-store records; confirm/reject own-store records; `E` only if manager correction before confirm is approved. |
| Finance confirmer | `MENU_STORE_PAYMENT` | `V,A,X` | View and confirm all authorized stores; export only if explicitly granted. |
| Admin / `ROLE_ADMIN` | `MENU_STORE_PAYMENT` | all by super role | View all records; operational changes should still prefer named permissions for traceability. |
| Finance admin / system admin | `MENU_STORE_PAYMENT_ACCOUNT` | `V,E` | Maintain enabled company collection accounts/codes and QR images. |
| Store clerk | `MENU_STORE_PAYMENT_ACCOUNT` | none or `V` via filtered selector only | Must not create, edit, disable, or delete account/code records. |

Permission mapping:

1. Record list/detail: `MENU_STORE_PAYMENT:V`.
2. Record create: `MENU_STORE_PAYMENT:C`.
3. Edit own pending record: `MENU_STORE_PAYMENT:E` plus ownership and status checks.
4. Confirm: `MENU_STORE_PAYMENT:A`.
5. Reject: `MENU_STORE_PAYMENT:A` plus required reason.
6. Void after confirmation: prefer separate menu code `MENU_STORE_PAYMENT_VOID:A` if the project allows a new menu; otherwise use `MENU_STORE_PAYMENT:D` or `A` only with explicit service-level stronger role check. A separate menu is cleaner because void is higher risk than confirm.
7. Export: `MENU_STORE_PAYMENT:X`.
8. Account/code maintenance: `MENU_STORE_PAYMENT_ACCOUNT:E`; view: `MENU_STORE_PAYMENT_ACCOUNT:V`.

## 5. DataScope Design Recommendation

Findings:

1. `DataScopeContext` supports `allowedCompanyCodes`, `allowedProjectCodes`, `allowedWarehouseCodes`, `allowedFarmCodes`, and `allowedSiteCodes`.
2. `sys_data_scopes.scope_type` is currently `SELF/PROJECT/COMPANY/REGION/GROUP`; no first-class `STORE` type was found in `DataScopeService`.
3. `DataScopeGuard` only resolves scope into CLS and always returns true. It does not enforce row-level access by itself.
4. `DataScopeHelper` can apply company/project/farm/site filters, but store-level filtering must be explicitly designed.
5. A5 identified `store_code` as semantically overloaded across POS store, historical site/farm compatibility, JWT fallback, and master-data compatibility.

Recommendation:

1. Schema Gate must choose the canonical MVP-1 store identifier before table/entity design. The safest design is `store_payment_records.store_code` referencing the same canonical code used by `mst_stores.store_code` and matching `sys_organizations.org_code` for `STORE` nodes.
2. Service-layer filters must combine RBAC permission and record-level scope:
   - Clerk view: `receiver_user_id = currentUserId` OR own-store scope, only if own-store visibility is approved.
   - Clerk create: `store_code` must equal the user's assigned pilot store; request body must not be trusted blindly.
   - Store manager view/confirm: `store_code IN allowedStoreCodes`.
   - Finance view/confirm: authorized company/store scope, or global only for approved finance roles.
   - Admin: global by `ROLE_ADMIN`, but still audited.
3. Because existing `DataScopeService` does not expose `allowedStoreCodes`, Schema Gate must define how own-store scope is derived:
   - Option A: map `sys_user_orgs` rows where `sys_organizations.org_type='STORE'` to store codes.
   - Option B: treat store nodes as `allowedSiteCodes` only if the organization model formally says store is a site subtype.
   - Option C: add a dedicated store-scope helper later.
4. Schema Gate should reject implementation if it only uses `company_code` for clerk/manager access. Company scope is too broad for own-store confirmation.
5. Query, detail, confirm, reject, void, attachment preview, and export paths must all reuse the same record ownership check.

## 6. Attachment ACL Design Recommendation

Findings:

1. Existing upload endpoint is `POST /api/upload/contract`, guarded by JWT.
2. Upload returns a bare URL under `/uploads/contracts/<file>`.
3. `AttachmentUploader` previews and opens returned URLs directly in the browser.
4. No generic business-record ACL was found for `/uploads/contracts` URLs.
5. A5 also found no generic attachment table with `biz_type` and `biz_id`.

Recommendation:

1. Existing upload format and UI component can be reused for the upload action, but bare URL access is not sufficient for payment screenshots.
2. Payment screenshot access must follow payment record permission, meaning preview/download should go through a protected endpoint such as a future design-only `GET /api/v2/store-payments/:id/attachments/:attachmentId`.
3. Store clerk must not be able to view screenshots from other clerks outside their allowed own-store/own-record scope.
4. Store manager can view screenshots for own-store records.
5. Finance can view screenshots for authorized finance scope; all-store access needs explicit finance role and DataScope.
6. Admin can view all, subject to audit.
7. Schema Gate must choose one of:
   - Design a business attachment reference table with `biz_type`, `biz_id`, `url/storage_key`, `uploaded_by`, and `created_at`.
   - Store screenshot reference on `store_payment_records`, but require protected proxy access and forbid direct URL rendering in the MVP page.
8. Permission-denied attachment access should be logged as an audit/security event.

## 7. Audit Log Design Recommendation

Findings:

1. `sys_operation_logs` exists and can store actor, role, action, business type/id/no, request path, result, and after-data.
2. `OperationLogInterceptor` only logs paths that match explicit `LOG_RULES`; new store-payment APIs would not be logged until rules or service-level logging are added.
3. The interceptor currently stores `afterData` using `safeSlice`, which truncates but does not mask sensitive fields.
4. `mst_audit_trail` exists for master-data operations and can be reused only if collection accounts/codes are implemented as master-data-like records.

Required audit events:

| Event | Required | Suggested biz/action |
| --- | --- | --- |
| Account/code create | Yes | `STORE_PAYMENT_ACCOUNT / CREATE` |
| Account/code update | Yes | `STORE_PAYMENT_ACCOUNT / MODIFY` |
| Account/code enable/disable | Yes | `STORE_PAYMENT_ACCOUNT / ENABLE` / `DISABLE` |
| Payment record create | Yes | `STORE_PAYMENT_RECORD / CREATE` |
| Payment record confirm | Yes | `STORE_PAYMENT_RECORD / CONFIRM` |
| Payment record reject | Yes | `STORE_PAYMENT_RECORD / REJECT` |
| Payment record void | Yes if allowed | `STORE_PAYMENT_RECORD / VOID` |
| Screenshot upload/change | Yes | `STORE_PAYMENT_ATTACHMENT / UPLOAD` / `CHANGE` |
| Amount/currency/store/account change | Yes | `STORE_PAYMENT_RECORD / MODIFY_SENSITIVE_FIELDS` |
| Attachment access denied | Yes | `STORE_PAYMENT_ATTACHMENT / ACCESS_DENIED` |
| Record access denied | Yes | `STORE_PAYMENT_RECORD / ACCESS_DENIED` |
| Query/list | Not generally required | Log only export, abnormal bulk query, or denied query. |
| Export | Yes | `STORE_PAYMENT_RECORD / EXPORT` |

Recommendation:

1. Reuse `sys_operation_logs` for MVP-1 unless timeline reconstruction requires a dedicated `store_payment_audit` table.
2. If `OperationLogInterceptor` is used, add explicit store-payment path rules during implementation.
3. For high-value transitions such as confirm/reject/void, prefer service-level audit writes so before/after status and reason are captured deterministically.
4. Store `module_code` as the actual menu code when possible; current interceptor leaves it blank.

## 8. Sensitive Fields And Log Masking Recommendation

Sensitive classification:

| Field | Sensitivity | Rule |
| --- | --- | --- |
| QR code image / collection code image | Sensitive business payment instrument | Store by protected attachment reference; do not expose raw storage path in logs. |
| Account number / wallet number | Sensitive financial identifier | Store masked display value where possible; full value only if finance approves and protected. |
| Payment screenshot | Sensitive payment evidence | Protected access; no raw URL in logs or exports unless explicitly approved. |
| Payer remark / clerk remark | Potential personal/business sensitive text | Log short masked summary only; avoid full free-text in operation logs. |
| Amount and currency | Business-sensitive but required for audit | May log exact amount in audit for financial traceability; restrict audit-log viewers. |
| Store/account/receiver identifiers | Operational identifiers | May log codes; names should follow existing audit policy. |

Masking rules:

1. Do not record full `bank_account_no`, QR payload, screenshot URL, or storage key in generic logs.
2. Store account display as masked, for example `****1234`, plus optional salted hash/fingerprint for duplicate checks.
3. Log screenshot changes as attachment id/hash and action, not full URL.
4. Log remarks as presence flag or short masked preview; avoid dumping full free text into `after_data`.
5. `safeSlice` is not masking. Store-payment implementation must add field-level redaction before writing `sys_operation_logs`.

Export:

1. Export should be disabled by default for clerks and store managers.
2. Export requires `MENU_STORE_PAYMENT:X`.
3. Export should exclude screenshot raw URLs by default and show masked account values.
4. Every export must be audited with filters, row count, actor, scope, and timestamp.

## 9. Confirmation Flow Security Recommendation

Recommended status machine:

```text
PENDING_CONFIRM -> CONFIRMED
PENDING_CONFIRM -> REJECTED
PENDING_CONFIRM -> VOIDED
CONFIRMED -> VOIDED only by higher permission and reason
REJECTED -> PENDING_CONFIRM only via explicit resubmit path, if approved
```

Rules:

1. Clerk-created records must always start as `PENDING_CONFIRM`; request body must not be allowed to set `CONFIRMED`.
2. Screenshot is required before create succeeds.
3. Clerk may edit only own `PENDING_CONFIRM` records, and only non-confirmation fields allowed by policy.
4. Clerk must not delete records. Deletion should be unavailable; use void/reject/correction for evidence preservation.
5. Clerk should not void confirmed records.
6. Store manager may confirm/reject own-store records only.
7. Finance may confirm/reject records in approved finance scope.
8. Confirmed records must not be silently edited. Changes after confirmation require void/correction flow and higher permission.
9. Void/reject/反确认 must require a non-empty reason.
10. 反确认 is not recommended for MVP-1. If business demands it, model it as `CONFIRMED -> VOIDED/CORRECTED` with `MENU_STORE_PAYMENT_VOID` or equivalent high-risk permission, not a silent status rollback.

## 10. Schema Gate Security Preconditions

Schema Gate should not approve implementation until these conditions are satisfied:

1. Menu codes:
   - Approve `MENU_STORE_PAYMENT`.
   - Approve `MENU_STORE_PAYMENT_ACCOUNT`.
   - Decide whether a separate `MENU_STORE_PAYMENT_VOID` is needed.
2. Permission matrix:
   - Clerk, store manager, finance, admin, audit/export roles mapped to `V/C/E/D/A/X`.
   - Confirm/reject use `A`; export uses `X`; account maintenance uses account menu `E`.
3. DataScope strategy:
   - Canonical `store_code` selected.
   - Store-level scope derivation approved.
   - Query/detail/action/export/attachment paths all use the same record-level scope check.
4. Attachment ACL:
   - Decide protected endpoint/reference table vs bare URL acceptance.
   - If screenshots are sensitive, bare URL access must be rejected for MVP-1.
5. Audit events:
   - Define `biz_type` and `action_code` list.
   - Decide interceptor rules vs service-level audit writes.
6. Log masking:
   - Define redaction for account numbers, QR image references, screenshot URLs, and free-text remarks.
   - Confirm whether exact amount is allowed in restricted audit logs.
7. State machine:
   - Approve statuses and allowed transitions.
   - Decide whether `REJECTED` is in MVP-1.
8. Reverse-operation control:
   - Confirmed record edits forbidden.
   - Void/correction requires reason, higher permission, and audit.
9. Data export:
   - Approve `X` permission, export fields, masking, row-count limits if needed, and audit event.
10. Gray permission:
   - Pilot store and user-role assignments must be identified before development.
   - Feature/menu enablement must be single-store gray, not all-store rollout.

## 11. Blockers

1. No approved dedicated menu codes or permission matrix exist yet.
2. Store-level DataScope is not first-class in current `DataScopeService`; service-level design is required before implementation.
3. Attachment system currently returns bare URLs and has no proven record-level ACL for payment screenshots.
4. Audit path rules for store-payment routes do not exist.
5. Existing operation-log truncation is not field-level masking and may leak screenshot URLs or account identifiers if used as-is.
6. Pilot store, company mapping, and user-role assignments remain pending from A5.
7. `store_code` canonical meaning remains unresolved.
8. Void/reject/反确认 policy is not yet approved.

## 12. Deferrable Items

1. Third-party payment callback security: signature verification, replay protection, token rotation, idempotency, and callback environment separation are MVP-4 concerns.
2. Mandatory POS/sales receipt binding is MVP-2.
3. Automatic finance posting, AR settlement, and Chanjet sync are outside MVP-1.
4. Long-term archive/delete policy can follow after MVP-1, provided evidence is retained during pilot.
5. Dedicated `store_payment_audit` table can be deferred if `sys_operation_logs` plus record fields satisfy timeline needs.
6. Export row limits can be refined before rollout; export permission and audit must still be designed before Schema Gate approval.

## 13. Frozen Items Touched

No.

This task did not modify `apps/api/**`, `apps/web/**`, schema, migrations, entities, DTOs, controllers, services, deployment files, or database state.

## 14. Schema Gate Recommendation

**YES WITH CONDITIONS**

MVP-1 may enter Schema Gate only if the gate explicitly resolves the security prerequisites above. The most important conditions are dedicated RBAC menu codes, store-level DataScope design, protected attachment access, audit event mapping, log masking, and state-transition controls.

## 15. A3/A4/A6/A7 Start Recommendation

**NO**

Do not start A3/A4/A6/A7 from this A2 round. Wait for user review, pilot-store confirmation, Schema Gate decisions, and explicit implementation approval.

## 16. Write/Deployment Statement

| Item | Result |
| --- | --- |
| Database write | No |
| INSERT/UPDATE/DELETE/ALTER/DROP/CREATE executed against DB | No |
| Migration added | No |
| Application code changed | No |
| Deployment | No |
| A1 blocker touched | No |
| A3/A4/A6/A7 started | No |
