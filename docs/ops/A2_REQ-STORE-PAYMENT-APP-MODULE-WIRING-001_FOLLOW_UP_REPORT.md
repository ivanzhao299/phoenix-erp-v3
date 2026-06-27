# A2 Follow-Up Security Review: Store Payment AppModule Wiring

## Result

**PASS WITH CONDITIONS**

No new security bypass was found in the reviewed AppModule wiring. The wiring loads the existing `StorePaymentModule` and relies on the previously reviewed Store Payment controller/service RBAC, DataScope, status-transition, audit, and attachment-reference controls.

Runtime release remains conditional because menu registration/grants, DB migration execution, protected attachment preview/download, frontend completion, store-scope semantics, and prior A1 blockers remain outside this follow-up change.

## Task Context

| Item | Value |
| --- | --- |
| Source task | `REQ-STORE-PAYMENT-APP-MODULE-WIRING-001` |
| Follow-up task | `REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP` |
| Agent | `A2-Security-Regression-Gate` |
| Worktree | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| Branch | `w5-a2-security-regression-gate` |
| Source conclusion | `PASS WITH CONDITIONS` |
| Report scope | Read-only security review plus this docs/ops report |

## Execution Gate

Required checks passed before review:

```bash
pwd
# /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate

git branch --show-current
# w5-a2-security-regression-gate

git status --short
# clean

git log --oneline --decorate -8
# f050408 (HEAD -> w5-a2-security-regression-gate) docs(ops): review store payment AppModule wiring security
# 1c00f77 docs(ops): record A3 Codex CLI wiring run
# 6a118dd chore(ops): connect natural language dispatch to Codex CLI runner
# 6b03a09 chore(ops): add Codex CLI agent orchestration scaffolding
# 27102d4 test(ops): validate store payment backend S2 merge
# 13676d2 feat(api): add store payment backend MVP endpoints
# b6e5317 docs(ops): review store payment backend S2 security
# ea1fc75 docs(ops): draft backend S2 package for unified store payment
```

Evidence boundary: this A2 branch is behind `main`. The checked-out `apps/api/src/app.module.ts` does not contain `StorePaymentModule`, while `main` and `w5-a3-backend-critical-path` do. This report reviews the merged/source wiring evidence via `git show main:apps/api/src/app.module.ts` and the local Store Payment module/controller/service code.

## Reviewed Evidence

| Evidence | Finding |
| --- | --- |
| `main:apps/api/src/app.module.ts:70` | Adds `StorePaymentModule` import. |
| `main:apps/api/src/app.module.ts:142` | Adds `StorePaymentModule` to `AppModule.imports`. |
| `apps/api/src/modules/store-payment/store-payment.controller.ts:25-26` | Controller is `@Controller('store-payment')` and class-level guarded by `MenuGuard` and `DataScopeGuard`. |
| `apps/api/src/modules/store-payment/store-payment.controller.ts:30-80` | All account/record/confirm/reject/void routes have `@RequireMenu(...)`. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:305-343` | Account and record list paths apply role/store DataScope filters, defaulting to `1 = 0` for unsupported roles. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:345-368` | Detail, transitions, and create-store selection enforce store scope for non-admin/non-finance users. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:376-382` | Status transition rules prevent invalid direct transitions. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:385-399` | Raw `/uploads`, `http://`, and `https://` attachment references are rejected. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:423-450` | Service-level audit writes to `sys_operation_logs`. |
| `apps/api/src/modules/store-payment/store-payment.service.ts:502-516` and `:519+` | Audit redaction stores attachment-bound booleans and presence flags instead of raw attachment refs or free-text bodies. |

## Findings

### 1. Runtime Access Still Depends On Menu Registration And Grants

Severity: **Medium / release condition**

The controller uses `MenuGuard` and explicit `@RequireMenu` codes for all routes:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`

This is acceptable only if the menu codes exist and approved roles are granted before runtime access. Without that seed/grant step, endpoints should fail closed, but the feature cannot be released to pilot users.

Required remediation:

1. Register the menu codes in the approved RBAC/menu seed path.
2. Grant only approved roles.
3. Smoke-test an unprivileged user gets 403 and an approved pilot user gets access only within intended scope.

Release impact: **Blocks runtime enablement, not AppModule wiring merge.**

### 2. Store Scope Semantics Remain Unconfirmed

Severity: **Medium / release condition**

Service scope derives store access from `user.storeCode` and `dataScope.allowedSiteCodes`. Finance roles bypass store filters entirely. This matches the prior source condition but still requires policy confirmation:

- Whether `allowedSiteCodes` is the canonical store-scope source for Store Payment.
- Whether finance roles should receive all-store access by role alone.

Required remediation:

1. Confirm `allowedSiteCodes` mapping for stores.
2. Confirm finance all-store policy and role list.
3. Add a route-level smoke for store A user denied from store B records.

Release impact: **Blocks broad rollout until confirmed.**

### 3. Protected Attachment Preview/Download Is Still Incomplete

Severity: **Medium / release condition**

The service rejects raw upload URLs and does not return raw `proofAttachmentId` or `qrAttachmentId` in normal responses, which is good. However, the response exposes `proofPreviewAllowed: true` while there is no reviewed protected preview/download endpoint that enforces payment-record ACL on attachment access.

Required remediation:

1. Implement protected preview/download through a permission-checked endpoint.
2. Reuse the same record-level scope check as payment detail.
3. Keep raw storage URLs out of list/detail/export/log responses.

Release impact: **Blocks screenshot/QR preview release.**

### 4. DB Migration State Is A Runtime Blocker

Severity: **High / operational condition**

`StorePaymentModule` imports entities for `store_payment_accounts` and `store_payment_records`. If S1 migrations are not executed in the target runtime DB, loaded endpoints can fail at runtime when repositories query missing tables.

Required remediation:

1. Execute approved migrations only through the release process.
2. Verify target DB contains required S1 tables before enabling routes.

Release impact: **Blocks runtime use in environments without S1 tables.**

### 5. Existing A1 Runtime/Security Blockers Were Not Fixed Here

Severity: **Inherited condition**

The follow-up scope was AppModule wiring security review only. It did not authorize product fixes, schema changes, migration execution, frontend completion, deployment, or task-board changes.

Required remediation:

1. Track A1 blockers as separate approved work.
2. Do not treat this A2 result as closure for non-wiring runtime blockers.

Release impact: **Depends on unresolved A1 blocker severity; not cleared by this report.**

## Security Surface Assessment

| Area | Assessment |
| --- | --- |
| RBAC | **Conditionally acceptable.** Route-level `@RequireMenu` is present for every Store Payment route; menu seed/grants still required. |
| DataScope | **Conditionally acceptable.** Service-level filters and assertions exist; canonical store scope and finance all-store policy remain open. |
| JWT/session | **No new regression found.** Wiring does not alter auth strategy, filters, guards, or session handling. |
| SSE/WebSocket | **Not applicable.** No SSE/WebSocket code touched or exposed by this wiring. |
| Third-party interface | **No new regression found.** No payment callback or Chanjet behavior changed by the Store Payment wiring. |
| Logs redaction | **Acceptable for service audit.** Attachment IDs/free text are not written raw by service audit redaction. Global operation log rules do not add a new store-payment raw response log path. |
| Attachment ACL | **Conditionally acceptable.** Raw URLs are rejected and hidden, but protected preview/download ACL is not implemented. |
| Status transitions | **Acceptable for reviewed service code.** Confirm/reject require `PENDING`; void disallows already `VOIDED`. |
| Sensitive data handling | **Conditionally acceptable.** Responses avoid raw attachment refs; account/payment metadata remains visible to authorized users and must stay scoped by RBAC/DataScope. |

## Release Impact

**Do not enable Store Payment runtime access for users until conditions are closed.**

The AppModule wiring itself is acceptable as a minimal module-registration change. Runtime/pilot release requires:

1. Menu codes registered and role grants approved.
2. S1 tables present in target DB.
3. Protected attachment preview/download implemented or preview disabled.
4. Store-scope semantics confirmed and smoke-tested.
5. A1 inherited blockers triaged and remediated as applicable.
6. Frontend completed and tested without implying payment gateway, auto-arrival, or finance settlement behavior.

## Forbidden Actions Check

| Action | Result |
| --- | --- |
| Code changed | No |
| Migration/schema/entity/table/column changed | No |
| Migration executed | No |
| Database written | No |
| Deployment | No |
| Merge | No |
| Push | No |
| Product implementation | No |

## Final Conclusion

**PASS WITH CONDITIONS**

No hard security bypass was found in the AppModule wiring. The change can remain accepted as wiring-only evidence, but Store Payment must not be released to runtime users until the listed RBAC, DataScope, DB, attachment ACL, frontend, and inherited A1 conditions are closed or explicitly risk-accepted.
