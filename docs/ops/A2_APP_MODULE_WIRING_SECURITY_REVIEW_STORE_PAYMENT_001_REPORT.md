# A2 AppModule Wiring Security Review: Store Payment 001

> Scope: read-only review of A3 `StorePaymentModule` AppModule wiring.  
> Result: report-only. No A3 merge, no code change, no migration execution, no database write, no deployment.

## 1. Execution Environment

| Item | Value |
| --- | --- |
| pwd | `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate` |
| branch | `w5-a2-security-regression-gate` |
| HEAD before report | `6a118dd chore(ops): connect natural language dispatch to Codex CLI runner` |
| working tree before review | clean |
| A3 branch | `w5-a3-backend-critical-path` |
| A3 commit reviewed | `a10a823cc68fd664ea58d0e1a0acee29a9f76d8e` |

## 2. Reviewed A3 Commit

| Item | Value |
| --- | --- |
| Commit | `a10a823` |
| Subject | `feat(api): wire store payment module` |
| Changed files | `apps/api/src/app.module.ts`; `docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md` |

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
git show w5-a3-backend-critical-path:docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md
sed -n '1,260p' docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md
sed -n '1,260p' docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md
sed -n '1,320p' docs/ops/A2_BACKEND_S2_SECURITY_REVIEW_STORE_PAYMENT_001_REPORT.md
git show w5-a3-backend-critical-path:docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md
sed -n '1,300p' docs/ops/A1_BACKEND_S2_POST_MERGE_VALIDATION_STORE_PAYMENT_001_REPORT.md
```

A3 diff:

```bash
git rev-parse --verify w5-a3-backend-critical-path
git log --oneline --decorate -3 w5-a3-backend-critical-path
git diff --name-only main...w5-a3-backend-critical-path
git diff --stat main...w5-a3-backend-critical-path
git diff main...w5-a3-backend-critical-path -- apps/api/src/app.module.ts
git diff main...w5-a3-backend-critical-path -- docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md
git show w5-a3-backend-critical-path:apps/api/src/app.module.ts | sed -n '1,180p'
```

## 4. AppModule Wiring Review

Result: **PASS**

Findings:

1. A3 adds exactly one new source import:
   - `import { StorePaymentModule } from './modules/store-payment/store-payment.module';`
2. A3 adds exactly one `imports` array entry:
   - `StorePaymentModule,     // Store Payment: 直营店缴款 runtime endpoints`
3. No other `AppModule` imports, providers, controllers, interceptors, filters, guards, or TypeORM configuration are changed.
4. `ChanjetModule` import and `imports` registration are unchanged.
5. Auth, RBAC, DataScope, Finance, Sales, POS, Procurement, Upload, and deployment-related modules are not modified.
6. The module is registered after `ChanjetModule` near the end of the existing feature-module list. No obvious module-order risk was introduced.

Assessment:

The wiring is minimal and matches the A3 contract: it only loads the already-implemented `StorePaymentModule`.

## 5. Store Payment Exposure Risk Review

Result: **PASS WITH CONDITIONS**

Findings:

1. Registering `StorePaymentModule` will make the existing `StorePaymentController` load in NestJS.
2. The existing Store Payment controller was previously reviewed in A2 Backend S2 and had route-level `@UseGuards(MenuGuard, DataScopeGuard)`.
3. Every Store Payment route had `@RequireMenu`.
4. Account maintenance uses `MENU_STORE_PAYMENT_ACCOUNT`.
5. Record list/create/detail uses `MENU_STORE_PAYMENT`.
6. Confirm/reject uses `MENU_STORE_PAYMENT_CONFIRM`.
7. Void uses `MENU_STORE_PAYMENT_VOID`.
8. Menu seed / role authorization is still not part of this A3 wiring change.

Security interpretation:

If menu codes are not registered or not granted, the endpoints should fail closed through `MenuGuard` with `MENU_PERMISSION_NOT_REGISTERED` or `MENU_PERMISSION_DENIED`, rather than opening unauthenticated or unpermissioned access.

Conditions:

1. Before runtime use, menu codes must be registered in `sys_menu` and role grants must be approved.
2. A post-wiring smoke should verify that an unprivileged user receives 403 for Store Payment routes.
3. A privileged pilot user should be tested only after menu seed, role grant, DataScope, and pilot-store data are ready.
4. Existing S2 conditions still apply: protected proof/QR preview/download is not implemented, export is deferred, and migration/DB upgrade is not performed.

## 6. Chanjet Static Scan Review

Result: **PASS WITH CONDITIONS**

Findings:

1. `git diff` shows no modification to `ChanjetModule`, Chanjet controller, Chanjet service, webhook, signature, token, or API proxy code.
2. The only source file touched is `apps/api/src/app.module.ts`.
3. Security regression scanning flags existing Chanjet lines in `app.module.ts`:
   - Chanjet comment
   - `import { ChanjetModule } ...`
   - `ChanjetModule` in `imports`
4. Those Chanjet lines are present because `app.module.ts` is scanned as a changed file, not because A3 changed Chanjet behavior.

Assessment:

The Chanjet security-regression signal is a static-scan false positive for this wiring diff. It still requires explicit A2 acknowledgement because `app.module.ts` contains Chanjet critical-path references, but no true Chanjet code or behavior change was found.

Freeze boundary:

The freeze boundary hit on `apps/api/src/app.module.ts` is expected and within the explicitly approved minimal wiring scope. Merge review should use an explicit override trail rather than treating this as an unreviewed frozen-boundary bypass.

## 7. Conditions

1. Menu code registration and role grants remain required before runtime access.
2. Migration has not been executed and DB may not contain S1 tables in runtime environments.
3. Protected attachment preview/download remains incomplete.
4. Frontend is not implemented.
5. A1 historical runtime/security blockers were not repaired by this wiring.
6. Store-level DataScope assumptions from A2 Backend S2 remain open: especially `allowedSiteCodes` as pilot store scope and finance all-store role policy.
7. Post-merge validation should run API typecheck, security regression, freeze boundary, W5 closeout, and a route-level unauthorized smoke once menu state is available.

## 8. Blockers

None for controlled A3 merge review.

No hard security blocker was found in the AppModule wiring diff. The change is minimal and does not modify security-sensitive implementation logic.

## 9. Deferrable Items

1. Menu/permission seed and role assignment.
2. Store Payment protected attachment preview/download endpoint.
3. Frontend pages and UAT smoke.
4. Export endpoint and export audit.
5. DB migration execution and environment upgrade.
6. A1 legacy runtime/security blocker repair.
7. Chanjet static gate allow/override documentation for this specific `app.module.ts` false positive.

## 10. Conclusion

**PASS WITH CONDITIONS**

A3 AppModule wiring is security-acceptable as a minimal runtime registration change. It loads the Store Payment module but relies on the previously reviewed controller RBAC/DataScope/service safeguards. Remaining risks are operational conditions, not new code defects in this wiring diff.

## 11. A3 Merge Recommendation

**YES WITH CONDITIONS**

A3 can proceed to controlled merge review if the merge owner records the explicit freeze/security override rationale for `apps/api/src/app.module.ts` and keeps menu seed, migration execution, protected attachment access, frontend, and pilot rollout as separate approved steps.

## 12. No-Write Statement

| Item | Result |
| --- | --- |
| Code changed by A2 | No |
| A3 merged | No |
| Migration executed | No |
| Database written | No |
| Deployment | No |
