# A2 Security Regression Gate Report

Request ID: `REQ-NL-20260623-003928-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3`

Assigned agent: `A2-Security-Regression-Gate`

Result: **PASS WITH CONDITIONS**

## 1. Execution Guardrail

| Check | Result | Evidence |
|---|---:|---|
| Worktree | PASS | `pwd` => `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | PASS | `git branch --show-current` => `w5-a2-security-regression-gate` |
| Initial cleanliness | PASS | `git status --short` returned empty |
| Recent HEAD | PASS | `bad5bc67 docs(ops): add A2 store payment readiness gate` |
| Forbidden operations | PASS | No merge, push, deploy, migration execution, database write, schema/entity/table/column edit, or business-code edit was performed. |

## 2. Review Scope

Read-only Store Payment pilot readiness review for RBAC, DataScope, JWT/session guard path, attachment ACL, audit/log redaction, status transitions, sensitive data handling, and local static gates.

No Store Payment SSE/WebSocket surface or third-party payment interface was found in the reviewed code path.

## 3. Findings

### A2-001: Store Payment Proof/QR Attachment Read ACL Is Still Not Proven

Severity: **Medium**

Status: **Release condition**

Evidence:

1. Store Payment rejects raw `/uploads/...` and HTTP(S) references for `qrAttachmentId` and `proofAttachmentId`: `apps/api/src/modules/store-payment/store-payment.service.ts:385`.
2. Account and record responses expose attachment booleans rather than raw attachment references: `apps/api/src/modules/store-payment/store-payment.service.ts:453`, `apps/api/src/modules/store-payment/store-payment.service.ts:472`.
3. Record response still hard-codes `proofPreviewAllowed: true`: `apps/api/src/modules/store-payment/store-payment.service.ts:484`.
4. Upload itself is JWT-protected, but returns `/uploads/contracts/<file>`: `apps/api/src/modules/upload/upload.controller.ts:14`, `apps/api/src/modules/upload/upload.controller.ts:55`.
5. `/uploads` is served as static assets without record-level Store Payment authorization: `apps/api/src/main.ts:16`.

Impact:

Payment proof screenshots and QR account images are sensitive financial evidence. Current Store Payment responses avoid leaking raw attachment IDs/URLs, but a protected preview/download endpoint with the same record/store ACL as `getRecord` is not implemented or proven.

Required remediation:

Before enabling preview/download in pilot, route Store Payment proof/QR access through an authenticated endpoint that checks `MENU_STORE_PAYMENT:V` or `MENU_STORE_PAYMENT_ACCOUNT:V` plus the same store/finance/admin scope rules. If this is deferred, keep proof/QR preview disabled in UI and API.

### A2-002: Current A2 Worktree Cannot Independently Produce API/Web Typecheck Evidence

Severity: **Medium**

Status: **CI evidence gap**

Evidence:

1. `cd apps/api && ./node_modules/.bin/tsc --noEmit` failed with `no such file or directory: ./node_modules/.bin/tsc`.
2. `cd apps/web && ./node_modules/.bin/tsc --noEmit` failed with the same missing local dependency path.
3. `test -x apps/api/node_modules/.bin/tsc`, `test -x apps/web/node_modules/.bin/tsc`, and `test -x node_modules/.bin/tsc` all returned non-zero in this worktree.

Impact:

A2 can provide source-level security evidence, but cannot replace A1/CI verification for compile readiness from this dependency-incomplete worktree.

Required remediation:

Use A1/CI logs for this exact commit/branch, or rerun API/Web typecheck in a dependency-complete workspace before pilot release.

## 4. Positive Evidence

### RBAC / JWT

Result: **PASS**

Evidence:

1. `StorePaymentController` is class-guarded by `MenuGuard` and `DataScopeGuard`: `apps/api/src/modules/store-payment/store-payment.controller.ts:25`.
2. `MenuGuard` extends JWT auth, writes `req.user` into CLS, checks menu registration, and enforces permission codes unless `ROLE_ADMIN`: `apps/api/src/common/guards/menu.guard.ts:49`.
3. All Store Payment endpoints have explicit `@RequireMenu`: account `V/E`, record `V/C`, confirm/reject `A`, and void `A`: `apps/api/src/modules/store-payment/store-payment.controller.ts:30`.
4. `StorePaymentModule` is registered in `AppModule`, so the guarded routes are actually loadable: `apps/api/src/app.module.ts:70`, `apps/api/src/app.module.ts:142`.

### DataScope / Store Scope

Result: **PASS WITH CONDITIONS**

Evidence:

1. `DataScopeGuard` resolves scope into CLS after RBAC metadata is found: `apps/api/src/modules/org/guards/data-scope.guard.ts:21`.
2. Non-admin/non-finance account list is filtered by allowed store codes and active account state: `apps/api/src/modules/store-payment/store-payment.service.ts:305`.
3. Record list restricts managers to scoped stores, clerks to own submissions or scoped stores, and unsupported roles to `1 = 0`: `apps/api/src/modules/store-payment/store-payment.service.ts:317`.
4. Detail and transition paths call `assertRecordScope`: `apps/api/src/modules/store-payment/store-payment.service.ts:345`.
5. Create rejects body `storeCode` outside allowed store codes for non-admin/non-finance actors: `apps/api/src/modules/store-payment/store-payment.service.ts:362`.
6. Allowed store codes derive from JWT `storeCode` plus `dataScope.allowedSiteCodes`: `apps/api/src/modules/store-payment/store-payment.service.ts:546`.

Condition:

A5 must still confirm pilot-store rows, company mapping, and role grants in data. This A2 task did not query or write any database.

### Status Transitions

Result: **PASS**

Evidence:

`assertTransition` allows confirm/reject only from `PENDING`, prevents any transition from `VOIDED`, and restricts void to `PENDING`, `REJECTED`, or `CONFIRMED`: `apps/api/src/modules/store-payment/store-payment.service.ts:376`.

### Audit / Redaction

Result: **PASS WITH CONDITIONS**

Evidence:

1. Store Payment writes service-level audit records for account create/update and record create/transition: `apps/api/src/modules/store-payment/store-payment.service.ts:423`.
2. Audit payloads record attachment booleans and `remarkPresent` / `reasonPresent`, not raw proof/QR references or full free-text reason/remark: `apps/api/src/modules/store-payment/store-payment.service.ts:502`, `apps/api/src/modules/store-payment/store-payment.service.ts:519`.

Condition:

Attachment access-denied audit is not present because a protected attachment read endpoint is not present.

## 5. Local Check Results

| Command | Result | Notes |
|---|---:|---|
| `node scripts/ci/check-security-regression.mjs` | PASS | `0 changed source file(s) inspected`; no security regression signal. |
| `node scripts/ci/check-freeze-boundaries.mjs` | PASS | `2 changed file(s) inspected`; docs-only scans skipped; no frozen boundary touched. |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | FAIL | Missing local dependency path. |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | FAIL | Missing local dependency path. |

## 6. Release Impact

No new RBAC, JWT, DataScope, audit-redaction, or status-transition bypass was found in the reviewed Store Payment controller/service path.

Pilot release remains conditional on:

1. Protected Store Payment proof/QR preview/download ACL, or explicit proof/QR preview disablement.
2. Fresh A1/CI API and Web typecheck evidence from a dependency-complete environment.
3. Menu registration and role grants for `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, and `MENU_STORE_PAYMENT_VOID`.
4. A5 confirmation of pilot store, company mapping, users/roles, collection account, currency, payment method, and attachment policy.
5. Continued adherence to this request's constraints: no migration execution, no DB writes, no deploy, no push.

## 7. Final Decision

**PASS WITH CONDITIONS**

Store Payment pilot readiness is acceptable for low-risk parallel validation only. It is not a full release PASS until attachment read ACL and current-commit CI/typecheck evidence are complete.
