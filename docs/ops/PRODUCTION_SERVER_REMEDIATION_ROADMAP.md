# Production Server Remediation Roadmap

Date: 2026-06-23

## R0 - Backup And Freeze Point

Goal: Create a recovery baseline before any write.

1. DB backup.
2. App directory snapshot.
3. Uploads/file storage snapshot.
4. Env backup.
5. Current commit/image record.
6. Current nginx config backup.
7. Evidence bundle stored off the live deploy path.

Exit criteria:

- Backup artifacts exist and are restorable in principle.
- No remediation write begins before this Gate is approved.

## R1 - Migration State Audit

Status: completed with conditions.

Evidence:

1. Remote audit directory: `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510`.
2. Remote code: `main@87b5781`.
3. Store Payment migration file exists remotely and matches local hash.
4. File Metadata migration file is missing remotely.
5. Audited DB lacks `store_payment_accounts`, `store_payment_records`, and `file_metadata`.
6. `file_metadata` missing cause is classified as `CODE_NOT_DEPLOYED`.
7. No migration, DB write, deploy, restart, or push was executed.

## R2 - Database / Migration Repair

1. Remote code alignment is complete: `87b5781` → `7507b12a`.
2. Store Payment schema drift reconciliation is complete with conditions: Store Payment tables currently exist in `phoenix_erp.public`.
3. Do not execute Store Payment schema repair unless a future audit contradicts current table presence evidence.
4. Approve `FILE_METADATA_MIGRATION_EXECUTION_GATE`.
5. Execute only File Metadata migration after A1/A2/A5 prechecks.
6. Run read-only validation for `file_metadata`, columns, indexes, constraints, and migration history.
7. Keep Store Payment business trial HOLD until menu, role, DataScope, and protected attachment metadata evidence pass.

## R3 - Master Data Cleanup

1. Company / organization / store / project / farm audit.
2. `STORE-VTE-001` / `ST-VTE-001` mapping audit.
3. `COMP-LAO-AGRI` audit.
4. Duplicate and missing key scan.
5. Data owner confirmation.

## R4 - Permission And Menu Cleanup

1. Menu code audit.
2. Role grant audit.
3. User role audit.
4. DataScope audit.
5. Store Payment trial role matrix verification.

## R5 - Attachment And File Security Cleanup

1. Upload directory inventory.
2. Nginx `/uploads/` exposure review.
3. `file_metadata` audit.
4. Protected streaming smoke.
5. Storage path leak check.
6. Store Payment proof / QR attachment ownership verification.

## R6 - Store Payment Controlled Pilot Recovery

1. Verify remote Store Payment schema.
2. Verify remote menu / role grants.
3. Verify pilot account placeholders.
4. Verify protected QR and proof attachments.
5. Verify `/store-payment` UI path.
6. Run business UAT with approved users only.

## R7 - Full Regression And Pre-production Confirmation

1. A1 CI/runtime validation.
2. A2 security regression.
3. A5 data readiness.
4. A6 runbook update.
5. A7 GO / GO WITH CONDITIONS / HOLD / ROLLBACK decision.
