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

## R1 - Deployment Chain Cleanup

1. Read-only server git/image audit.
2. Align workflow and deploy scripts with explicit remediation gates.
3. Confirm push-main production trigger remains gated.
4. Draft rollback commands.
5. Identify multiple deploy directories or stale releases.

## R2 - Database / Migration Repair

1. Read-only `migrations` table audit.
2. Compare migration table to `apps/api/src/database/migrations/**`.
3. Identify partial/failed migrations.
4. Verify Store Payment, file metadata, menu, role, master-data tables.
5. Draft repair plan; no repair without user approval.

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

