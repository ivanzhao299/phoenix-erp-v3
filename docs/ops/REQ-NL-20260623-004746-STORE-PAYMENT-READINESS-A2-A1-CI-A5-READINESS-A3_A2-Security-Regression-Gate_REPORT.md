# A2 Security Regression Gate Report

Request ID: `REQ-NL-20260623-004746-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3`

Assigned agent: `A2-Security-Regression-Gate`

Result: **PASS WITH CONDITIONS**

## 1. Execution Guardrail

| Check | Result | Evidence |
|---|---:|---|
| Worktree | PASS | `pwd` => `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | PASS | `git branch --show-current` => `w5-a2-security-regression-gate` |
| Initial cleanliness | PASS | `git status --short` returned empty |
| Recent HEAD | PASS | `c25f71b2 docs(ops): add A2 store payment readiness review` |
| Forbidden operations | PASS | No merge, push, deploy, migration execution, database command/write, schema/entity/table/column edit, task-board edit, or business-code edit was performed. |

## 2. Review Scope

Read-only Store Payment pilot readiness review for RBAC, DataScope/store scope, JWT/session guard path, attachment ACL, audit/log redaction, status transitions, SSE/WebSocket exposure, third-party interface exposure, and sensitive data handling.

No Store Payment SSE/WebSocket route or third-party payment interface was found in the reviewed Store Payment module path.

## 3. Findings

### A2-001: Store Payment Proof/QR Attachment Read ACL Is Still Not Proven

Severity: **Medium**

Status: **Release condition**

Evidence:

1. Store Payment rejects raw `/uploads/...` and HTTP(S) references for `qrAttachmentId` and `proofAttachmentId`: `apps/api/src/modules/store-payment/store-payment.service.ts:385`.
2. Account and record responses expose `qrAttachmentBound` / `proofAttachmentBound`, not raw attachment references: `apps/api/src/modules/store-payment/store-payment.service.ts:453`, `apps/api/src/modules/store-payment/store-payment.service.ts:472`.
3. Record response still returns `proofPreviewAllowed: true`: `apps/api/src/modules/store-payment/store-payment.service.ts:484`.
4. Upload is JWT-protected, but returns `/uploads/contracts/<file>`: `apps/api/src/modules/upload/upload.controller.ts:14`, `apps/api/src/modules/upload/upload.controller.ts:55`.
5. `/uploads` is served as static assets without Store Payment record-level authorization: `apps/api/src/main.ts:16`.

Impact:

Payment screenshots and QR images are sensitive payment evidence. The Store Payment API avoids leaking raw attachment references in its normal responses, but a protected preview/download endpoint with the same record/account ACL as Store Payment read access is not implemented or proven.

Required remediation:

Before enabling proof/QR preview in pilot, route access through an authenticated endpoint that checks `MENU_STORE_PAYMENT:V` or `MENU_STORE_PAYMENT_ACCOUNT:V` plus the same store/finance/admin scope rules. If deferred, keep Store Payment proof/QR preview disabled in UI and API.

### A2-002: Current A2 Worktree Cannot Independently Produce API/Web Typecheck Evidence

Severity: **Medium**

Status: **CI evidence gap**

Evidence:

1. `test -x apps/api/node_modules/.bin/tsc` returned `api_tsc=1`.
2. `test -x apps/web/node_modules/.bin/tsc` returned `web_tsc=1`.
3. `test -x node_modules/.bin/tsc` returned `root_tsc=1`.
4. Prior A2 readiness report recorded direct API/Web `tsc --noEmit` failures in this worktree because local dependency binaries were missing.

Impact:

A2 can provide source-level security evidence, but cannot replace A1/CI compile readiness from this dependency-incomplete worktree.

Required remediation:

Use fresh A1/CI logs for this exact commit/branch, or rerun API/Web typecheck in a dependency-complete workspace before pilot release.

### A2-003: Broader A1 Runtime Security Blockers Remain Release Constraints

Severity: **High**

Status: **Global release condition, not Store Payment-specific**

Evidence:

`docs/ops/A1_CI_RUNTIME_GATE_REPORT.md` records failing W5 runtime/security items outside the Store Payment module: production `ENABLE_DEV_LOGIN=true` startup not failing closed, SSE invalid token returning HTTP 200 with an unauthorized event, admin-to-admin impersonation allowed, Chanjet callback strict signature/timestamp/nonce checks absent, and Chanjet sensitive callback fields logged/consumed.

Impact:

These are not new Store Payment controller/service bypasses, but they block treating the overall readiness package as a release PASS unless formally remediated or risk-accepted by release owners.

Required remediation:

Keep Store Payment pilot validation low-risk/read-only until A1 blockers are resolved or explicitly accepted through the release process.

## 4. Positive Evidence

### RBAC / JWT

Result: **PASS**

Evidence:

1. `StorePaymentController` is class-guarded by `MenuGuard` and `DataScopeGuard`: `apps/api/src/modules/store-payment/store-payment.controller.ts:25`.
2. Every Store Payment endpoint has explicit `@RequireMenu`: account list `MENU_STORE_PAYMENT_ACCOUNT:V`, account create/update `MENU_STORE_PAYMENT_ACCOUNT:E`, record list/detail `MENU_STORE_PAYMENT:V`, record create `MENU_STORE_PAYMENT:C`, confirm/reject `MENU_STORE_PAYMENT_CONFIRM:A`, and void `MENU_STORE_PAYMENT_VOID:A`: `apps/api/src/modules/store-payment/store-payment.controller.ts:30`.
3. `MenuGuard` extends JWT auth, writes `req.user` into CLS, checks menu registration, and enforces permission codes unless admin: `apps/api/src/common/guards/menu.guard.ts:49`.
4. `StorePaymentModule` is registered in `AppModule`, so the guarded routes are loadable: `apps/api/src/app.module.ts:70`, `apps/api/src/app.module.ts:142`.

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

A5 must still confirm pilot-store rows, company mapping, user/role grants, collection account, currency/payment method, and attachment policy in data. This A2 task did not query or write any database.

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

Attachment access-denied audit is not present because a protected Store Payment attachment read endpoint is not present.

## 5. Local Static Gate Results

| Command | Result | Notes |
|---|---:|---|
| `node scripts/ci/check-security-regression.mjs` | PASS | `0 changed source file(s) inspected`; no security regression signal. |
| `node scripts/ci/check-freeze-boundaries.mjs` | PASS | `3 changed file(s) inspected`; docs-only scans skipped; no frozen boundary touched. |
| `test -x apps/api/node_modules/.bin/tsc` | FAIL | Missing local API `tsc` binary in this worktree. |
| `test -x apps/web/node_modules/.bin/tsc` | FAIL | Missing local Web `tsc` binary in this worktree. |
| `test -x node_modules/.bin/tsc` | FAIL | Missing root `tsc` binary in this worktree. |

## 6. Release Impact

No Store Payment-specific RBAC, JWT, DataScope, status-transition, audit-redaction, SSE/WebSocket, or third-party-interface bypass was found in the reviewed controller/service/module path.

Pilot readiness remains conditional on:

1. Protected Store Payment proof/QR preview/download ACL, or explicit proof/QR preview disablement.
2. Fresh A1/CI API and Web typecheck evidence from a dependency-complete environment.
3. Menu registration and role grants for `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, and `MENU_STORE_PAYMENT_VOID`.
4. A5 confirmation of pilot store, company mapping, users/roles, collection account, currency, payment method, and attachment policy.
5. Resolution or formal risk acceptance of broader A1 runtime security blockers before any release progression.
6. Continued adherence to this request's constraints: no migration execution, no DB writes, no deploy, no push.

## 7. Final Decision

**PASS WITH CONDITIONS**

Store Payment pilot readiness is acceptable for low-risk parallel validation only. It is not a full release PASS until attachment read ACL, current-commit CI/typecheck evidence, A5 data confirmation, and broader A1 release-blocking security conditions are complete or formally accepted.
