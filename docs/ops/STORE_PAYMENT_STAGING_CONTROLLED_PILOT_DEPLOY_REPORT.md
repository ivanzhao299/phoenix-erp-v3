# Store Payment Staging Controlled Pilot Deploy Report

Date: 2026-06-23

## 1. Summary

Current conclusion: HOLD.

Reason: the approved push was executed safely to the non-main `w5-codex-orchestrator` branch, but no staging deployment target, staging DB connection, staging SSH credentials, staging environment variables, or staging-specific workflow were discoverable locally. The repository workflow `deploy.yml` deploys only on `push main` and targets the `production` environment, so pushing `main` would violate the user's explicit production prohibition.

No staging deploy, staging migration, staging menu/role sync, remote DB write, production migration, production deploy, seed, cleanup, reset, or destructive data operation was executed.

## 2. A1 Precheck

Conclusion: PASS WITH CONDITIONS.

Checks:

| Check | Result |
| --- | --- |
| main/worktree clean before execution | PASS |
| W5 gate | PASS |
| API typecheck | PASS |
| Web typecheck | PASS |
| migration down() gate | PASS |
| migration no-data-DML gate | PASS |
| nullable unique gate | PASS |
| deployment precheck | HOLD, staging target not found |

Evidence:

1. `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS.
2. API TypeScript check: PASS.
3. Web TypeScript check: PASS.
4. `bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations`: PASS.
5. `bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations`: PASS.
6. `node scripts/check-nullable-in-unique.js`: PASS.

## 3. A2 Precheck

Conclusion: PASS WITH CONDITIONS / HOLD FOR DEPLOY EXECUTION.

Security checks:

1. RBAC design: PASS from A7 evidence.
2. DataScope design: PASS WITH CONDITIONS.
3. protected attachment ACL: PASS WITH CONDITIONS.
4. rawUrl exposure must remain false.
5. `/uploads` exposure must remain false.
6. staging file storage risk: HOLD until staging storage target is provided.
7. production HOLD: PASS, production remains explicitly forbidden.

Deploy execution condition:

- Do not deploy until a staging-only target and workflow are confirmed.

## 4. A5 Precheck

Conclusion: HOLD FOR STAGING DATA EXECUTION.

Known local readiness:

1. `STORE-VTE-001 / 万象直营店`: ready locally.
2. `COMP-LAO-AGRI`: ready locally.
3. Store Payment account/record readiness: ready locally with conditions.
4. `file_metadata` readiness: ready locally with conditions.

Missing staging evidence:

1. staging `STORE-VTE-001`.
2. staging `COMP-LAO-AGRI`.
3. staging Store Payment tables.
4. staging `file_metadata`.
5. staging menu/role/user store scope.
6. staging file storage.

## 5. Push To Remote

Push executed: yes.

| Field | Value |
| --- | --- |
| Remote | `origin` |
| Remote URL | `git@github.com:ivanzhao299/phoenix-erp-v3.git` |
| Branch pushed | `w5-codex-orchestrator` |
| Commit pushed | `0e71753c` |
| Push result | PASS |

Safety note:

- `main` was not pushed.
- This avoided the repository `deploy.yml` production workflow, which is triggered by `push main`.

## 6. Staging DB Migration

Staging DB migration executed: no.

Reason:

1. No staging DB connection was discoverable.
2. No staging migration command or environment was available.
3. Production migration remains forbidden.

Approved migration scope remains:

1. `store_payment_accounts`
2. `store_payment_records`
3. `file_metadata`

Validation result:

- Not executed; no staging table/field/index validation could be performed.

## 7. Staging Menu / Role Sync

Menu / role sync executed: no.

Reason:

1. No staging DB connection was discoverable.
2. No staging menu/role sync script or target was available.

Approved scope remains:

1. `MENU_STORE_PAYMENT_ACCOUNT`
2. `MENU_STORE_PAYMENT`
3. `MENU_STORE_PAYMENT_CONFIRM`
4. `MENU_STORE_PAYMENT_VOID`
5. `MENU_STORE_PAYMENT_EXPORT`
6. corresponding pilot role grants only.

## 8. Staging File Storage Configuration

File storage configuration executed: no.

Reason:

1. No staging file storage path was discoverable.
2. No staging host or deployment target was available.

Required future checks:

1. protected endpoint uses controlled streaming.
2. `rawUrl = null`.
3. no `/uploads` exposure.
4. no `storage_path` leak.
5. `file_metadata` can reference staging file.
6. no-auth returns 401.
7. missing returns 404.
8. denied fails closed.

## 9. Staging Deploy

Staging deploy executed: no.

Reason:

1. No staging-specific workflow exists in the repo.
2. `.github/workflows/deploy.yml` triggers on `push main` and uses `environment: production`.
3. Pushing `main` would violate the user's explicit prohibition against production deploy.
4. No staging SSH target, staging env, or staging deploy command was available.

## 10. Protected Attachment Staging Smoke

Protected attachment staging smoke: not executed.

Reason:

- staging deploy did not execute, so staging endpoints are unavailable.

Local prior evidence remains:

1. account QR protected status/preview/download: PASS locally.
2. record proof protected status/preview/download: PASS locally.
3. no-auth: 401 locally.
4. missing: 404 locally.
5. rawUrl not displayed locally.
6. `/uploads` not exposed locally.
7. `storage_path` not leaked locally.

## 11. `/store-payment` Staging Page Smoke

Staging page smoke: not executed.

Reason:

- staging deployment target is missing.

Local prior evidence:

1. `/store-payment` implemented.
2. menu `销售管理 / 统一收款` implemented.
3. account list implemented.
4. payment record list implemented.
5. confirm/reject/void permission buttons implemented.
6. protected attachment UI passed local UAT.

## 12. Business UAT Guide

Business UAT guide generated: yes.

File:

- `docs/ops/STORE_PAYMENT_STAGING_BUSINESS_UAT_GUIDE.md`

Business users are not allowed to enter staging UAT yet because staging deploy is HOLD.

## 13. Forbidden Production Actions

| Action | Executed |
| --- | --- |
| production deploy | No |
| production migration | No |
| remote production DB write | No |
| push to main | No |
| seed | No |
| cleanup / reset | No |
| destructive data operation | No |

## 14. Runtime Memory

Runtime Memory updated: yes.

New state:

- current stage: `STORE_PAYMENT_STAGING_DEPLOY_HOLD`
- active decision: `HOLD`
- next actions:
  1. `PROVIDE_STAGING_DEPLOY_TARGET`
  2. `PROVIDE_STAGING_DB_CONNECTION`
  3. `PROVIDE_STAGING_FILE_STORAGE_PATH`
  4. `CONFIRM_STAGING_WORKFLOW_OR_MANUAL_RUNBOOK`

## 15. Rollback / Recovery

No runtime rollback is required because no staging deploy, DB migration, DB write, menu/role sync, file storage configuration, production deploy, or production migration was executed.

Push rollback, if required:

1. Do not force push.
2. Leave remote branch as audit evidence or delete only after explicit approval.
3. If a PR was created later, close it rather than rewriting history.

## 16. Current Conclusion

Current conclusion: HOLD.

Store Payment cannot proceed to staging deployment until staging target information is supplied. The safe next action is to provide a staging-only deployment target and DB/file-storage configuration that is clearly separated from production.
