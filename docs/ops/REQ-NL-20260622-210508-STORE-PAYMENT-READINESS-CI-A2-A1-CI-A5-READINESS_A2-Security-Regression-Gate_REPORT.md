# A2 Security Regression Gate Report

Request ID: `REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS`

Assigned agent: `A2-Security-Regression-Gate`

Result: **PASS WITH CONDITIONS**

## 1. Execution Guardrail

| Check | Result | Evidence |
|---|---:|---|
| Worktree | PASS | `pwd` => `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | PASS | `git branch --show-current` => `w5-a2-security-regression-gate` |
| Initial cleanliness | PASS | `git status --short` returned empty |
| Recent HEAD | PASS | `4e73e528 docs(ops): add A2 store payment wiring CI review` |
| Forbidden operations | PASS | No merge, push, deployment, migration execution, DB command, schema/entity/table/column edit, or business-code edit performed. |

## 2. Review Scope

Read-only security review of Store Payment pilot readiness across:

1. RBAC and endpoint exposure.
2. DataScope / store-scope enforcement.
3. JWT/session guard path.
4. Attachment ACL and sensitive proof handling.
5. Audit/log redaction.
6. Status transitions.
7. CI/static gate evidence.
8. A5 data readiness evidence.

No SSE or WebSocket Store Payment surface was found in the reviewed module. No third-party Store Payment interface was modified or invoked.

## 3. Security Findings

### Finding A2-001: Store Payment Attachment Preview ACL Is Not Proven

Severity: **Medium**

Status: **Release condition**

Evidence:

1. Store Payment rejects raw upload/HTTP URLs for `qrAttachmentId` and `proofAttachmentId`: `apps/api/src/modules/store-payment/store-payment.service.ts:385`.
2. Normal account/record responses expose only `qrAttachmentBound` / `proofAttachmentBound`: `apps/api/src/modules/store-payment/store-payment.service.ts:453`, `apps/api/src/modules/store-payment/store-payment.service.ts:472`.
3. Record response still hard-codes `proofPreviewAllowed: true`: `apps/api/src/modules/store-payment/store-payment.service.ts:484`.
4. Upload returns a static `/uploads/contracts/...` URL: `apps/api/src/modules/upload/upload.controller.ts:53`.
5. `main.ts` serves `/uploads` as static assets: `apps/api/src/main.ts:16`.
6. Prior A5 report already recorded that upload is JWT-protected but returned URLs are plain `/uploads/contracts/...`, with no business-record-level download/preview authorization.

Impact:

Payment screenshots can be treated as sensitive payment evidence. The module avoids returning raw proof IDs in its normal Store Payment response, but protected preview/download is not implemented or proven. Pilot release should not expose screenshot preview/download unless access is routed through a permission-checked endpoint that reuses record-level Store Payment ACL.

Required remediation:

Add or prove a protected attachment preview/download path that checks `MENU_STORE_PAYMENT:V` plus the same store/finance/admin record scope as `getRecord`. Do not expose raw `/uploads/contracts/...` URLs for payment proof in Store Payment UI/API.

### Finding A2-002: Current Worktree Cannot Independently Complete API/Web Typecheck

Severity: **Medium**

Status: **CI evidence gap**

Evidence:

1. `cd apps/api && ./node_modules/.bin/tsc --noEmit` failed with `no such file or directory: ./node_modules/.bin/tsc`.
2. `cd apps/web && ./node_modules/.bin/tsc --noEmit` failed with the same missing local dependency path.
3. `apps/api/node_modules/.bin`, `apps/web/node_modules/.bin`, and root `node_modules/.bin` are absent in this worktree.
4. `pnpm --version` is available: `9.12.0`.
5. Prior A1 report `docs/ops/A1_APP_MODULE_WIRING_POST_MERGE_VALIDATION_STORE_PAYMENT_001_REPORT.md` records API tsc, Web tsc, freeze boundary, security regression, and W5 closeout gates as PASS in the A1 worktree.

Impact:

A2 cannot claim current-worktree API/Web tsc verification. Historical A1 evidence is useful but does not replace a fresh CI verification for this worktree.

Required remediation:

Run API and Web typecheck in an environment with workspace dependencies installed, or attach CI logs for this exact commit/branch.

## 4. Positive Evidence

### RBAC / JWT

Result: **PASS**

Evidence:

1. `StorePaymentController` is guarded by `MenuGuard` and `DataScopeGuard`: `apps/api/src/modules/store-payment/store-payment.controller.ts:25`.
2. `MenuGuard` extends `AuthGuard('jwt')`, writes `req.user` into CLS, checks menu registration, and enforces `JWT.permissions` unless admin: `apps/api/src/common/guards/menu.guard.ts`.
3. Every Store Payment endpoint has explicit `@RequireMenu`:
   - Account list: `MENU_STORE_PAYMENT_ACCOUNT:V`.
   - Account create/update: `MENU_STORE_PAYMENT_ACCOUNT:E`.
   - Record list/detail: `MENU_STORE_PAYMENT:V`.
   - Record create: `MENU_STORE_PAYMENT:C`.
   - Confirm/reject: `MENU_STORE_PAYMENT_CONFIRM:A`.
   - Void: `MENU_STORE_PAYMENT_VOID:A`.

### DataScope / Store Scope

Result: **PASS WITH CONDITIONS**

Evidence:

1. Account list applies store-code filtering for non-admin/non-finance users and hides disabled accounts: `apps/api/src/modules/store-payment/store-payment.service.ts:305`.
2. Record list applies manager/clerk scope restrictions, otherwise `1 = 0`: `apps/api/src/modules/store-payment/store-payment.service.ts:317`.
3. Detail/transition paths call `assertRecordScope`: `apps/api/src/modules/store-payment/store-payment.service.ts:345`.
4. Create path rejects body `storeCode` outside allowed store codes for non-admin/non-finance users: `apps/api/src/modules/store-payment/store-payment.service.ts:362`.
5. Allowed store codes are derived from JWT `storeCode` plus `dataScope.allowedSiteCodes`: `apps/api/src/modules/store-payment/store-payment.service.ts:546`.

Condition:

A5 still requires user/DB confirmation of the pilot store, canonical store identifier, and final company mapping. The prior candidate is `STORE-VTE-001 / 万象直营店`, but this A2 task did not query the database.

### Status Transitions

Result: **PASS**

Evidence:

`assertTransition` allows confirm/reject only from `PENDING`, blocks changes from `VOIDED`, and restricts void to `PENDING`, `REJECTED`, or `CONFIRMED`: `apps/api/src/modules/store-payment/store-payment.service.ts:376`.

### Audit / Redaction

Result: **PASS WITH CONDITIONS**

Evidence:

1. Create/update/transition paths call `writeAudit` with `STORE_PAYMENT_ACCOUNT` or `STORE_PAYMENT_RECORD` business types.
2. Audit payloads use redacted attachment booleans and `remarkPresent` / `reasonPresent`, not raw attachment IDs or free-text bodies: `apps/api/src/modules/store-payment/store-payment.service.ts:502`, `apps/api/src/modules/store-payment/store-payment.service.ts:519`.

Condition:

Attachment access-denied audit is still not implemented because protected attachment access is not implemented.

## 5. Local Static Gate Results

| Command | Result | Notes |
|---|---:|---|
| `node scripts/ci/check-security-regression.mjs` | PASS | `0 changed source file(s) inspected`; no security regression signal. |
| `node scripts/ci/check-freeze-boundaries.mjs` | PASS | `1 changed file(s) inspected`; docs-only scan skipped; no frozen boundary touched. |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | FAIL | Missing dependency path in this worktree. |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | FAIL | Missing dependency path in this worktree. |

## 6. A5 Data Readiness Carry-Forward

Result: **PASS WITH CONDITIONS**

Evidence from `docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md`:

1. Store master data and organization tree have code/document evidence, but pilot row was not DB-confirmed.
2. Store-level DataScope is service-enforced, not automatic.
3. Finance cash accounts can be referenced but should not be overloaded as operational Store Payment records.
4. Attachment upload exists, but business-record-level ACL is incomplete.
5. Single-store gray data remains pending for pilot store, company mapping, clerk/manager/finance users, collection account, currency, payment method, and attachment permission model.

## 7. Release Impact

Pilot readiness is **not blocked by a new RBAC/DataScope bypass** in the reviewed Store Payment service/controller code.

Pilot release remains **conditional** on:

1. Protected Store Payment proof/QR preview/download ACL, or explicit decision to keep previews disabled.
2. Fresh API/Web typecheck evidence from a dependency-complete CI/runtime environment.
3. Menu registration and role grants for `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, and `MENU_STORE_PAYMENT_VOID`.
4. Pilot store and company mapping confirmation.
5. No migration execution or database write until separately approved.

## 8. Final Decision

**PASS WITH CONDITIONS**

No security bypass was found in the reviewed RBAC, DataScope, status transition, or service audit paths. The release gate cannot be upgraded to full PASS until attachment ACL and current-worktree/CI typecheck evidence are complete.
