# A6 Store Payment Staging Deploy Runbook

Date: 2026-06-23

## 1. Current Store Payment State

Store Payment is at `STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_VERIFIED`.

Current decision: GO WITH CONDITIONS.

Confirmed state:

1. Store Payment migration has been executed in the approved local `phoenix_erp` target.
2. `store_payment_accounts` exists.
3. `store_payment_records` exists.
4. `file_metadata` exists.
5. `MENU_STORE_PAYMENT_ACCOUNT`, `MENU_STORE_PAYMENT`, `MENU_STORE_PAYMENT_CONFIRM`, `MENU_STORE_PAYMENT_VOID`, and `MENU_STORE_PAYMENT_EXPORT` are registered.
6. Store Payment role grants have been written: 23 grants.
7. Canonical store code is `STORE-VTE-001`.
8. Legacy alias is `ST-VTE-001`.
9. Pilot company code is `COMP-LAO-AGRI`.
10. `/store-payment` is implemented.
11. Store Payment account QR protected attachment UAT passed.
12. Store Payment record proof protected attachment UAT passed.
13. Protected status / preview / download use Store Payment controlled endpoints.
14. `rawUrl` is not displayed.
15. `/uploads` is not exposed through the Store Payment UI.
16. `storage_path` is not leaked.
17. no-auth attachment access returns 401.
18. missing attachment access returns 404.
19. A2 conclusion: PASS WITH CONDITIONS.
20. A1 conclusion: PASS WITH CONDITIONS.
21. A5 conclusion: GO WITH CONDITIONS.

## 2. Pilot Goal

Prepare a controlled staging deployment path for the Store Payment pilot so a later approved Gate can validate the Laos direct-store unified collection workflow in a staging environment before any production GO decision.

## 3. Pilot Scope

In scope for the staging runbook:

1. Store Payment account list.
2. Store Payment record list.
3. Create payment record UI.
4. Confirm / reject / void UI and backend boundaries.
5. Store Payment permissions and action bits.
6. Store Payment DataScope for `STORE-VTE-001`.
7. `ST-VTE-001` legacy alias handling.
8. Protected QR attachment status / preview / download.
9. Protected proof attachment status / preview / download.
10. UAT users, roles, menus, and store scope.
11. Rollback and disablement plans.

## 4. Out Of Scope For This Runbook Gate

This Gate does not execute:

1. Staging deployment.
2. Push.
3. Remote DB write.
4. Production migration.
5. Seed.
6. Cleanup.
7. Reset.
8. Destructive data operation.
9. Production GO.
10. POS hard binding.
11. Finance auto-reconciliation.
12. Chanjet / 好业财 sync.
13. Real bank or payment platform callback.

## 5. Environment Prerequisites

Before any staging execution is approved, the operator must confirm:

1. Staging host and project path.
2. Staging environment variables.
3. Staging DB connection target.
4. Staging DB backup status.
5. Whether Store Payment migration must be run in staging.
6. Whether `file_metadata` migration must be run in staging.
7. File storage path for staging.
8. Whether legacy upload endpoints remain isolated from Store Payment preview/download.
9. Whether Store Payment menu codes are synced.
10. Whether Store Payment role grants are synced.
11. Test users and their store scopes.
12. `STORE-VTE-001` exists in staging.
13. `COMP-LAO-AGRI` exists in staging.
14. Whether file metadata UAT rows should be migrated, recreated, or skipped in staging.
15. Whether proof / QR UAT test data is allowed in staging.

## 6. Code Version Requirements

The staging candidate must include the Store Payment backend, frontend, attachment, runtime memory, and runbook commits already merged into main at or after:

| Area | Required State |
| --- | --- |
| Store Payment schema | Migration executed locally and migration file merged |
| Menu / role | Store Payment menu and role Gates completed locally |
| Backend | Store Payment protected attachment endpoints implemented |
| Frontend | `/store-payment` page and protected attachment UI implemented |
| UAT | Account QR and record proof UAT passed locally |
| Ops | A6 runbook committed and merged |

## 7. Commit Hash Checklist

At minimum, staging candidate review must include:

1. Current main HEAD before deployment approval.
2. Store Payment schema implementation commit.
3. Store Payment fast-track pilot execution commit.
4. A3 protected streaming / file metadata / ACL commits.
5. A4 Store Payment frontend and protected attachment UI commits.
6. Store Payment account QR UAT smoke commit.
7. Store Payment record proof UAT fixture commit.
8. This A6 runbook commit.

The latest local baseline before this runbook was `7438caa8 docs(ops): record baseline lifecycle report`.

## 8. DB Migration State

Local state:

1. Store Payment migration executed.
2. Store Payment tables exist.
3. `file_metadata` table exists.
4. No production migration was executed by this runbook Gate.

Staging requirement:

1. Confirm whether staging already has Store Payment migrations applied.
2. If not, run migration only under a separate approved staging DB Gate.
3. Do not run production migration from this runbook.
4. Do not run seed from this runbook.

## 9. Menu / Role State

Required menu codes:

1. `MENU_STORE_PAYMENT_ACCOUNT`
2. `MENU_STORE_PAYMENT`
3. `MENU_STORE_PAYMENT_CONFIRM`
4. `MENU_STORE_PAYMENT_VOID`
5. `MENU_STORE_PAYMENT_EXPORT`

Required staging role coverage:

1. Clerk can view / create within store scope.
2. Store manager can view / confirm / reject within store scope.
3. Finance can view / confirm / reject across approved scope.
4. Admin can maintain accounts and view all approved scope.
5. Export remains reserved unless separately approved.

## 10. Store Payment Table State

Required tables:

1. `store_payment_accounts`
2. `store_payment_records`

Required staging checks:

1. Both tables exist.
2. Required columns exist.
3. Status columns support pending / confirmed / rejected / voided and disabled / pending account states.
4. `proof_attachment_id` exists on records.
5. `qr_attachment_id` exists or equivalent account QR reference is supported.
6. Audit columns exist.
7. No unapproved business data is inserted.

## 11. file_metadata Table State

Required table:

1. `file_metadata`

Required staging checks:

1. Table exists.
2. `file_id` exists and is unique.
3. `module_code`, `owner_type`, `owner_id`, `company_code`, `store_code`, `status`, `visibility`, and `storage_path` are present.
4. `storage_path` is never returned to the frontend.
5. UAT metadata should be recreated in staging only if user approves staging UAT fixtures.

## 12. Pilot UAT Data Notes

Local-only UAT evidence:

1. Account QR file: `FILE-SP-UAT-001`.
2. Record proof file: `FILE-SP-PROOF-UAT-001`.
3. Proof payment number: `SP-UAT-PROOF-001`.

Staging policy:

1. Local UAT fixture data must not be blindly copied to staging.
2. Staging test files must be non-sensitive and explicitly approved.
3. No real bank, customer, or payment privacy files may be used without a separate data handling Gate.

## 13. Protected Streaming State

Current controlled attachment behavior:

1. Status uses Store Payment protected endpoints.
2. Preview uses Store Payment protected endpoints.
3. Download uses Store Payment protected endpoints.
4. RBAC is checked.
5. DataScope is checked.
6. Store Payment ownership is checked.
7. `rawUrl` remains `null`.
8. `/uploads` is not exposed.
9. `storage_path` is not exposed.
10. no-auth returns 401.
11. missing returns 404.

## 14. Permission And DataScope State

Required staging behavior:

1. `STORE-VTE-001` is canonical.
2. `ST-VTE-001` is legacy alias only.
3. Frontend must not write `ST-VTE-001` into new Store Payment records.
4. Store Payment APIs must enforce RBAC and DataScope.
5. Protected attachments must be visible only when the user can access the owning Store Payment account or record.

## 15. Frontend Entry

Page entry:

- `/store-payment`

Menu entry:

- 销售管理 / 统一收款

Required page behaviors:

1. Account list.
2. Payment record list.
3. New payment record form.
4. Detail drawer.
5. Confirm / reject / void buttons.
6. Filters.
7. Status labels.
8. Protected QR preview/download.
9. Protected proof preview/download.
10. Fail-closed attachment messages.

## 16. Backend Interfaces

Store Payment interfaces expected in staging:

1. Account list and maintenance endpoints.
2. Payment record list / create / detail endpoints.
3. Confirm / reject / void endpoints.
4. `GET /store-payment/attachments/:attachmentId/status`
5. `GET /store-payment/attachments/:attachmentId/preview`
6. `GET /store-payment/attachments/:attachmentId/download`
7. Record proof attachment status proxy.

## 17. Deployment Precheck Checklist

Before staging deployment:

| # | Check | Required |
| --- | --- | --- |
| 1 | main / worktree clean | PASS |
| 2 | W5 gate | PASS |
| 3 | API typecheck | PASS |
| 4 | Web typecheck | PASS |
| 5 | migration gate | PASS |
| 6 | Store Payment tables exist | PASS |
| 7 | `file_metadata` table exists | PASS |
| 8 | `MENU_STORE_PAYMENT*` exist | PASS |
| 9 | role permissions exist | PASS |
| 10 | `STORE-VTE-001` canonical policy confirmed | PASS |
| 11 | `ST-VTE-001` legacy alias risk accepted or mitigated | PASS |
| 12 | protected attachment endpoints | PASS |
| 13 | rawUrl exposure | false |
| 14 | `/uploads` exposure for Store Payment | false |
| 15 | `storage_path` exposure | false |
| 16 | no-auth attachment access | 401 |
| 17 | missing attachment access | 404 |
| 18 | A2 PASS WITH CONDITIONS accepted | required |
| 19 | A5 GO WITH CONDITIONS accepted | required |
| 20 | rollback plan reviewed | required |

## 18. Deployment Steps Draft

These are draft steps for a future approved staging deployment. They were not executed in this Gate.

1. Confirm user approval for staging deployment.
2. Confirm staging DB backup.
3. Confirm staging env variables.
4. Confirm target commit hash.
5. Confirm migration status on staging.
6. If migration is needed, run only the approved staging DB Gate.
7. Deploy API and Web to staging using the approved staging procedure.
8. Verify API health.
9. Verify Web health.
10. Verify Store Payment route `/store-payment`.
11. Verify menu visibility.
12. Verify RBAC / DataScope test users.
13. Verify protected QR and proof attachment behavior with approved staging UAT files.
14. Verify no raw URL, `/uploads`, or `storage_path` exposure.
15. Record staging evidence.

## 19. Post-Deployment Validation Checklist

After a future approved staging deployment:

1. API health PASS.
2. Web health PASS.
3. Login PASS.
4. Menu entry visible to approved roles.
5. Unauthorized users cannot see or operate Store Payment.
6. `/store-payment` route loads.
7. Account list loads.
8. Payment record list loads.
9. New record form validates fields.
10. Confirm / reject / void are permission-gated.
11. QR status / preview / download uses protected endpoints.
12. Proof status / preview / download uses protected endpoints.
13. rawUrl exposure remains false.
14. `/uploads` exposure remains false.
15. `storage_path` exposure remains false.
16. no-auth returns 401.
17. missing returns 404.
18. DataScope keeps store users inside `STORE-VTE-001`.
19. A2 staging security review passes.
20. A7 final QA can make GO / GO WITH CONDITIONS / HOLD / ROLLBACK recommendation.

## 20. Rollback Plan

Rollback must be explicit and approved.

1. Code rollback: revert staging deployment to the last known good commit.
2. DB migration rollback: use the reviewed migration `down()` only under an approved DB rollback Gate.
3. Menu / role rollback: remove or disable Store Payment menu and role grants under an approved access rollback Gate.
4. `file_metadata` rollback: remove only approved staging UAT metadata rows under an approved DB data rollback Gate.
5. UAT fixture cleanup: remove only approved non-sensitive staging UAT files and metadata, never broad cleanup.
6. Disable frontend entry: hide or remove Store Payment menu entry in staging.
7. Disable attachment preview/download: force UI and backend status to disabled / access pending.
8. Return to disabled state: disable Store Payment accounts and block new payment record creation if pilot must pause.

## 21. Risk Items

| Risk | Mitigation |
| --- | --- |
| Staging DB differs from local DB | Require staging schema precheck before deployment |
| Menu / role not synced | Verify `MENU_STORE_PAYMENT*` and role grants before UAT |
| Store scope mismatch | Verify `STORE-VTE-001`, `ST-VTE-001`, and user scope |
| File storage path missing | Confirm staging file storage before attachment UAT |
| Legacy upload endpoint exposure | Keep Store Payment UI and API on protected endpoints only |
| Local UAT fixtures copied accidentally | Recreate approved staging UAT fixtures only |
| A2 conditions ignored | Require A2 review before A7 final decision |

## 22. User Approval Items

Required before staging deployment:

1. Approve staging deployment target.
2. Approve target commit hash.
3. Approve staging DB backup status.
4. Approve whether staging migration execution is needed.
5. Approve whether staging Store Payment UAT fixture data may be created.
6. Approve test users and roles.
7. Accept A2 PASS WITH CONDITIONS.
8. Accept A5 GO WITH CONDITIONS.
9. Approve rollback owner and rollback timing.

## 23. A7 Final QA Gate Input Conditions

A7 can start after this runbook if:

1. A6 runbook is complete.
2. Runtime Memory is updated.
3. A2 runbook review is PASS WITH CONDITIONS or better.
4. A1 runbook validation is PASS WITH CONDITIONS or better.
5. A5 staging data review is GO WITH CONDITIONS or better.
6. No staging deployment, push, remote DB write, or production migration was executed by this Gate.

## 24. A2 / A1 / A5 Runbook Review

### A2 Review

Conclusion: PASS WITH CONDITIONS.

Reviewed areas:

1. RBAC boundaries are stated.
2. DataScope boundaries are stated.
3. Attachment ACL boundaries are stated.
4. raw URL exposure remains forbidden.
5. `/uploads` remains forbidden for Store Payment.
6. staging risks are listed.

Conditions:

1. Staging deployment must be separately approved.
2. Staging attachment UAT files must be non-sensitive.
3. A2 must review staging evidence before final GO.

### A1 Validation

Conclusion: PASS WITH CONDITIONS.

Validated areas:

1. Runbook completeness.
2. Deployment precheck checklist completeness.
3. W5 gate remains required before deployment.
4. API / Web typecheck remain required before deployment.

Condition:

This runbook did not execute deployment or staging commands.

### A5 Data Review

Conclusion: GO WITH CONDITIONS.

Reviewed areas:

1. `STORE-VTE-001` / `COMP-LAO-AGRI` staging prerequisites.
2. test user / role / store scope prerequisites.
3. Store Payment account and record fixture prerequisites.
4. file metadata fixture policy.

Condition:

Staging UAT fixture data should be recreated under a separate approved staging UAT setup Gate, not copied blindly from local.

## 25. Conclusion

Current conclusion: GO WITH CONDITIONS.

Allowed next Gate:

1. `A7_FINAL_QA_GATE`
2. `STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION`

Not allowed without explicit user approval:

1. staging deployment
2. push
3. remote DB write
4. production migration
5. production GO
