# Store Payment Controlled Pilot Release Decision

Date: 2026-06-23

## Decision

Decision: GO WITH CONDITIONS.

Store Payment is allowed to enter controlled pilot readiness and may request a staging deployment approval Gate.

This decision does not approve:

1. production deploy.
2. push.
3. remote DB write.
4. production migration.
5. seed.
6. cleanup.
7. reset.
8. destructive data operation.

## Controlled Pilot Conditions

The controlled pilot is limited to:

1. local or separately approved staging environment.
2. `STORE-VTE-001 / 万象直营店`.
3. `COMP-LAO-AGRI`.
4. Store Payment account QR and record proof attachments accessed only through protected endpoints.
5. no naked raw URL.
6. no `/uploads` URL exposure.
7. no `storage_path` exposure.
8. UAT fixtures must remain distinct from real business payment evidence.
9. staging deployment requires a separate explicit user approval.
10. push requires a separate explicit user approval.
11. remote DB migration / writes require a separate explicit user approval.

## Evidence Summary

1. Store Payment backend MVP endpoints are complete.
2. StorePaymentModule wiring is complete.
3. Store Payment migration has been executed in the local `phoenix_erp` target.
4. `store_payment_accounts` and `store_payment_records` exist locally.
5. `file_metadata` exists locally.
6. `MENU_STORE_PAYMENT*` menu codes exist locally.
7. Store Payment role grants have been written locally.
8. `/store-payment` frontend page exists.
9. Store Payment permission buttons are aligned with V/E/X action bits.
10. Account QR protected attachment UAT passed.
11. Record proof protected attachment UAT passed.
12. `rawUrl` was not displayed.
13. `/uploads` was not exposed.
14. `storage_path` was not leaked.
15. no-auth returned 401.
16. missing returned 404.
17. A6 staging deploy runbook is complete.
18. A2 final review is PASS WITH CONDITIONS.
19. A1 final validation is PASS WITH CONDITIONS.
20. A5 final readiness is GO WITH CONDITIONS.

## Not Approved

The following remain blocked until separately approved:

1. production deployment.
2. push.
3. staging deployment execution.
4. staging DB migration.
5. staging menu / role sync.
6. staging file storage configuration.
7. production DB write.
8. production migration.
9. production GO.

## Required Next Approvals

1. Approve or reject staging deployment.
2. Approve or reject push for the staging candidate.
3. Approve or reject staging DB migration.
4. Approve or reject staging menu / role sync.
5. Approve or reject staging file storage configuration.
6. Approve or reject staging UAT fixture data creation.
7. Approve business pilot users for UAT.

## Staging Deployment Entry Criteria

Before staging deploy can execute, confirm:

1. target commit hash.
2. staging DB backup.
3. staging environment variables.
4. staging Store Payment table status.
5. staging `file_metadata` table status.
6. staging menu / role status.
7. staging `STORE-VTE-001` and `COMP-LAO-AGRI` readiness.
8. staging file storage root.
9. staging test users and DataScope.
10. rollback owner and rollback window.

## Final Decision

Current decision: GO WITH CONDITIONS.

Allowed next steps:

1. `USER_APPROVAL_FOR_STAGING_DEPLOY`
2. `STAGING_DB_MIGRATION_AND_MENU_ROLE_SYNC_APPROVAL`
3. `CONTROLLED_PILOT_BUSINESS_UAT`

Still blocked:

1. production deploy.
2. push.
3. remote DB write.
4. production migration.
