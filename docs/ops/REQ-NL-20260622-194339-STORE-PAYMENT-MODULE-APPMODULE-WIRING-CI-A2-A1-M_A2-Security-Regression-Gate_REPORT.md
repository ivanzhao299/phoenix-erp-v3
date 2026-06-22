# A2 Security Regression Gate Report

## Result

**PASS WITH CONDITIONS**

No new security bypass was found in the current `StorePaymentModule` AppModule wiring. The wiring loads the existing Store Payment runtime module and still depends on the previously reviewed controller/service safeguards.

Release remains conditional because runtime RBAC menu grants, Store Payment table availability, protected attachment preview/download ACL, store-scope semantics, frontend completion, and inherited A1 blockers are not closed by this A2 review.

## Task Context

| Item | Value |
| --- | --- |
| Request ID | `REQ-NL-20260622-194339-STORE-PAYMENT-MODULE-APPMODULE-WIRING-CI-A2-A1-M` |
| Agent | `A2-Security-Regression-Gate` |
| Worktree | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | `w5-a2-security-regression-gate` |
| Scope | Read-only security review and docs/ops report |
| Forbidden actions | No merge, push, deploy, migration execution, database write, or business-code change |

## Execution Gate

Initial contract checks passed:

| Command | Result |
| --- | --- |
| `pwd` | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| `git branch --show-current` | `w5-a2-security-regression-gate` |
| `git status --short` | clean |
| `git log --oneline --decorate -8` | HEAD `fb31a0ab chore(ops): add approved parallel execution to orchestrator`; includes local `main`, `w5-a2-security-regression-gate`, `w5-a1-ci-runtime-gate`, `w5-codex-orchestrator` labels |

## Reviewed Evidence

| Evidence | Assessment |
| --- | --- |
| `apps/api/src/app.module.ts:70` | Imports `StorePaymentModule`. |
| `apps/api/src/app.module.ts:142` | Registers `StorePaymentModule` in `AppModule.imports`. |
| `apps/api/src/modules/store-payment/store-payment.module.ts:10-18` | Registers only Store Payment entities, `SysOperationLogEntity`, controller, and service. |
| `apps/api/src/modules/store-payment/store-payment.controller.ts:25-26` | Controller base path is `store-payment` and class-level guards are `MenuGuard` and `DataScopeGuard`. |
| `apps/api/src/modules/store-payment/store-payment.controller.ts:30-80` | All exposed account/record/confirm/reject/void routes have explicit `@RequireMenu(...)`. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:305-343` | List paths apply role/store DataScope filters and default unsupported roles to `1 = 0`. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:345-368` | Detail, transitions, and create-store selection enforce record/store scope for non-admin/non-finance users. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:376-382` | Status transitions reject invalid confirm/reject/void moves. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:385-399` | Raw `/uploads`, `http://`, and `https://` attachment references are rejected. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:423-450` | Service-level audit writes to `sys_operation_logs`. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:453-499` | Normal responses expose attachment-bound booleans, not raw proof/QR attachment IDs. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:502-543` | Audit redaction avoids raw attachment IDs and free-text reason/remark bodies. |
| `docs/ops/A1_APP_MODULE_WIRING_POST_MERGE_VALIDATION_STORE_PAYMENT_001_REPORT.md:23-29` | Prior A1 report records API tsc, Web tsc, freeze, security, and W5 closeout gates as PASS in the A1 worktree. |

## Security Findings

### 1. Runtime RBAC Enablement Still Depends On Menu Seed And Grants

Severity: **Medium / release condition**

The loaded routes are guarded and fail closed if menu permissions are absent, but runtime use requires these menu codes and role grants to exist:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`

Required remediation: register approved menu codes, grant only approved pilot roles, and smoke-test unprivileged 403 plus privileged in-scope access.

Release impact: **Blocks runtime enablement, not the minimal AppModule wiring itself.**

### 2. Store Scope Semantics Remain Policy-Dependent

Severity: **Medium / release condition**

The service derives store access from `user.storeCode` and `dataScope.allowedSiteCodes`; finance roles bypass store filters. This is implementation-visible and not a new wiring defect, but broad rollout still needs confirmation that `allowedSiteCodes` is canonical for stores and that finance all-store access is approved.

Required remediation: confirm canonical store-scope source, confirm finance role policy, and add route-level store A versus store B smoke evidence.

Release impact: **Blocks broad rollout until confirmed and tested.**

### 3. Protected Attachment Preview/Download ACL Is Still Not Complete

Severity: **Medium / release condition**

The service rejects raw URLs and avoids returning raw proof/QR attachment IDs. However, `proofPreviewAllowed: true` is returned and no reviewed protected preview/download endpoint was found that reuses Store Payment record-level ACL.

Required remediation: implement or disable protected preview/download before exposing proof/QR preview to users.

Release impact: **Blocks attachment preview release.**

### 4. Runtime DB State Remains Required

Severity: **High / operational condition**

`StorePaymentModule` imports repositories for `store_payment_accounts` and `store_payment_records`. This A2 run did not execute migrations or write a database. Any runtime environment without the approved S1 tables can fail when endpoints query repositories.

Required remediation: verify required tables exist through the approved release process; do not execute migrations from this A2 task.

Release impact: **Blocks runtime use in non-upgraded environments.**

### 5. Local CI Re-Run Was Partially Blocked By Missing Dependencies

Severity: **Validation condition**

This A2 worktree has no `apps/api/node_modules`, no local `node_modules/.bin/tsc`, and `pnpm --filter ... exec tsc --noEmit` failed with `Command "tsc" not found`. No install was performed because the contract does not require dependency installation and network access is restricted.

Prior A1 evidence in `docs/ops/A1_APP_MODULE_WIRING_POST_MERGE_VALIDATION_STORE_PAYMENT_001_REPORT.md` records API and Web typecheck as PASS in the A1 worktree. This A2 report does not independently re-validate those tsc results.

Required remediation: use A1 CI evidence for the CI gate, or rerun tsc in a prepared worktree with dependencies installed.

Release impact: **A2 security conclusion can stand; CI closure depends on A1 evidence.**

## Checks Run In This A2 Worktree

| Command | Result | Notes |
| --- | --- | --- |
| `rg -n "@UseGuards|@RequireMenu|Controller\\('store-payment'\\)|StorePaymentModule" ...` | PASS | Found AppModule registration, class guards, and per-route menu requirements. |
| `rg -n "uploads/|http://|https://|proofAttachmentId|qrAttachmentId|proofPreviewAllowed|writeAudit|redact" ...` | PASS WITH CONDITIONS | Confirms raw URL rejection and redaction; preview ACL remains a release condition. |
| `rg -n "allowedSiteCodes|allowedStoreCodes|isFinance|isAdmin|1 = 0|assertRecordScope|resolveCreateStoreCode|assertTransition" ...` | PASS WITH CONDITIONS | Confirms store-scope checks are present; semantics remain policy-dependent. |
| `./node_modules/.bin/tsc --noEmit` in `apps/api` | BLOCKED | `no such file or directory: ./node_modules/.bin/tsc`. |
| `pnpm --filter phoenix-erp-v3-nest exec tsc --noEmit` | BLOCKED | `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsc" not found`. |
| `pnpm --filter web exec tsc --noEmit` | BLOCKED | `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsc" not found`. |
| `node scripts/ci/check-security-regression.mjs` | PASS | `0 changed source file(s) inspected`; no signal. |
| `node scripts/ci/check-freeze-boundaries.mjs` | PASS | `0 changed file(s) inspected`; no frozen boundary touched. |
| `node scripts/ci/check-w5-closeout-gate.mjs` | PASS | W5 closeout static gates passed. |

## Review Focus Assessment

| Area | Result |
| --- | --- |
| RBAC | **PASS WITH CONDITIONS**. Route-level menu requirements exist; menu registration and grants remain required. |
| DataScope | **PASS WITH CONDITIONS**. Store filters/assertions exist; `allowedSiteCodes` and finance all-store policy need confirmation. |
| JWT/session | **PASS**. AppModule wiring does not modify JWT strategy, guards, auth controller, cookies, or session behavior. |
| SSE/WebSocket | **Not applicable**. No SSE/WebSocket behavior is exposed by this wiring. |
| Third-party interface security | **PASS**. No Chanjet/payment callback/signature/token code changed by this wiring. |
| Logs redaction | **PASS**. Service audit writes redacted presence flags rather than raw attachment IDs or free-text bodies. |
| Attachment ACL | **PASS WITH CONDITIONS**. Raw URLs are rejected and hidden; protected preview/download ACL remains incomplete. |
| Status transitions | **PASS**. Confirm/reject require `PENDING`; void rejects already `VOIDED`. |
| Sensitive data handling | **PASS WITH CONDITIONS**. Responses avoid raw attachment refs; scoped metadata exposure relies on RBAC/DataScope readiness. |

## Forbidden Actions Check

| Action | Result |
| --- | --- |
| Business code modified | No |
| Schema/entity/table/column changed | No |
| Migration executed | No |
| Database written | No |
| Deployment | No |
| Merge | No |
| Push | No |
| Task board modified by this A2 task | No |

## Release Impact

Do not enable Store Payment runtime access for users until these conditions are closed or explicitly accepted:

1. Store Payment menu codes registered and role grants approved.
2. Target runtime DB confirmed to contain Store Payment S1 tables through approved release process.
3. Protected attachment preview/download implemented or preview disabled.
4. Store-scope semantics and finance all-store policy confirmed with route-level smoke tests.
5. A1 CI evidence accepted or tsc rerun in a dependency-ready worktree.
6. Inherited A1/runtime blockers triaged outside this A2 read-only task.

## Final Conclusion

**PASS WITH CONDITIONS**

The `StorePaymentModule` AppModule wiring is acceptable as a minimal runtime registration change from an A2 security perspective. No hard security bypass was found. Runtime release remains blocked by the listed operational and validation conditions.
