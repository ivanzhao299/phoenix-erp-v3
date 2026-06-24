# Store Payment Attachment Metadata UAT Data Setup Report

Date: 2026-06-23

## 1. Scope

Task: `STORE_PAYMENT_ATTACHMENT_METADATA_UAT_DATA_SETUP`

Goal: prepare local Store Payment protected attachment UAT metadata and verify protected status / preview / download behavior.

## 2. Modified Files

Repository files:

- `docs/ops/STORE_PAYMENT_ATTACHMENT_METADATA_UAT_DATA_SETUP_REPORT.md`
- `docs/ops/runs/store-payment-attachment-metadata-uat-db-evidence.txt`
- `docs/ops/runs/store-payment-attachment-metadata-uat-endpoint-smoke.json`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/STORE_PAYMENT_STATE.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

Local environment files, not committed:

- `uploads/store-payment-uat/store-payment-proof-uat.pdf`
- `apps/api/uploads/store-payment-uat/store-payment-proof-uat.pdf`

## 3. DB Write

DB write executed: Yes.

Scope:

- Local database only: `phoenix_erp`.
- Inserted / upserted one `file_metadata` UAT row.
- Updated one Store Payment pilot account QR attachment reference.

No remote production DB write was executed.

## 4. Target DB

- Database: `phoenix_erp`
- User: `mac`
- Environment: local development
- Production: No

Production check result:

- No production host / remote database was used.
- API was started in `NODE_ENV=development`.

## 5. Test File

Generated local non-sensitive UAT PDF:

- File name: `store-payment-proof-uat.pdf`
- Content: UAT only / no real business data
- MIME: `application/pdf`
- Size: 466 bytes
- SHA-256: `b9701beb44389b50df77bb0b7b26f2127a5475eb5afaead590427e2b3488bf84`

The file is local-only and excluded from git.

## 6. file_metadata Result

Inserted / updated:

- `file_id`: `FILE-SP-UAT-001`
- `original_name`: `store-payment-proof-uat.pdf`
- `stored_name`: `store-payment-proof-uat.pdf`
- `mime_type`: `application/pdf`
- `size_bytes`: `466`
- `module_code`: `STORE_PAYMENT`
- `owner_type`: `STORE_PAYMENT_ACCOUNT`
- `owner_id`: `1`
- `company_code`: `COMP-LAO-AGRI`
- `store_code`: `STORE-VTE-001`
- `uploaded_by`: `codex_uat`
- `status`: `ACTIVE`
- `visibility`: `PROTECTED`

Current `file_metadata` row count: 1.

## 7. Store Payment Reference Result

Associated account:

- `store_payment_accounts.id`: `1`
- `account_code`: `SP-VTE-BCEL-LAK-PENDING`
- `company_code`: `COMP-LAO-AGRI`
- `store_code`: `STORE-VTE-001`
- `qr_attachment_id`: `FILE-SP-UAT-001`

No Store Payment payment record was created. This avoids fabricating a business collection record for UAT.

## 8. Status Endpoint Smoke

Endpoint:

- `GET /store-payment/attachments/FILE-SP-UAT-001/status`

Result:

- HTTP 200
- `fileId`: `FILE-SP-UAT-001`
- `originalName`: `store-payment-proof-uat.pdf`
- `mimeType`: `application/pdf`
- `sizeBytes`: 466
- `accessStatus`: `allowed`
- `previewAvailable`: true
- `downloadAvailable`: true
- `rawUrl`: null

Safety:

- `storage_path` was not returned.
- `/uploads` was not returned.
- raw URL was not returned.

## 9. Preview Endpoint Smoke

Endpoint:

- `GET /store-payment/attachments/FILE-SP-UAT-001/preview`

Result:

- HTTP 200
- `Content-Type`: `application/pdf`
- `Content-Disposition`: `inline; filename="store-payment-proof-uat.pdf"`
- bytes returned: 466

Safety:

- No raw URL returned.
- No `/uploads` link returned.
- Backend streamed the file through the protected endpoint.

## 10. Download Endpoint Smoke

Endpoint:

- `GET /store-payment/attachments/FILE-SP-UAT-001/download`

Result:

- HTTP 200
- `Content-Type`: `application/pdf`
- `Content-Disposition`: `attachment; filename="store-payment-proof-uat.pdf"`
- bytes returned: 466

Safety:

- No raw URL returned.
- No `/uploads` link returned.
- Backend streamed the file through the protected endpoint.

## 11. Fail-Closed Smoke

- No auth status request: HTTP 401.
- Missing file id status request: HTTP 404.

## 12. Raw URL / Storage Exposure

- raw URL returned: No.
- `/uploads` exposed: No.
- `storage_path` leaked: No.

## 13. A2 Review

Conclusion: PASS WITH CONDITIONS.

Review notes:

- Metadata does not expose `storage_path` via protected status.
- Protected endpoints did not expose raw URL.
- No `/uploads` path was returned.
- Endpoint access is still mediated by backend RBAC / DataScope / ownership checks.
- No-auth and missing file cases fail closed.
- Condition: this used dev admin quick login for smoke; a role-specific non-admin UAT user should be used before production enablement.
- Condition: API development startup emitted existing bootstrap / seed logs; these are outside Store Payment attachment metadata setup but should remain visible as environment risk.

## 14. A1 Validation

Conclusion: PASS WITH CONDITIONS.

Validation:

- API typecheck: to be run before final baseline.
- Web typecheck: to be run before final baseline.
- W5 closeout gate: to be run by Baseline Autopilot.
- Endpoint smoke: PASS.
- No production write: PASS.
- No deploy: PASS.
- No push: PASS.

## 15. A5 Review

Conclusion: GO WITH CONDITIONS.

Readiness:

- `file_metadata` UAT data exists.
- Store Payment account reference exists.
- `STORE-VTE-001` and `COMP-LAO-AGRI` are consistent.
- Controlled QR attachment UAT may proceed.

Condition:

- Proof attachment UAT for a payment record still requires an approved record fixture or real controlled UAT record.

## 16. Runtime Memory

Updated:

- `PROJECT_STATE.json`
- `STORE_PAYMENT_STATE.md`
- `NEXT_ACTIONS.md`
- `DECISION_LOG.md`

New state:

- `current_stage`: `STORE_PAYMENT_ATTACHMENT_UAT_READY`
- `attachment_preview`: `protected_uat_ready`
- `next_gate`: `STORE_PAYMENT_PROTECTED_ATTACHMENT_UAT_SMOKE`

## 17. Rollback / Recovery

If the local UAT fixture must be removed:

1. Set `store_payment_accounts.qr_attachment_id` for `id=1` back to null.
2. Delete only `file_metadata.file_id = 'FILE-SP-UAT-001'`.
3. Remove local files under `uploads/store-payment-uat/` and `apps/api/uploads/store-payment-uat/`.

Do not use cleanup/reset. Do not delete business data.

## 18. Explicit Non-Actions

- Migration executed: No.
- Production DB write: No.
- Remote DB write: No.
- Deployment: No.
- Push: No.
- Cleanup/reset: No.
- Destructive data operation: No.
- Real bank account / QR / customer privacy file used: No.

## 19. Current Conclusion

GO WITH CONDITIONS.

Store Payment protected attachment metadata UAT data is ready for the QR account path. Status, preview, download, no-auth, and missing-file smoke checks passed locally. The next step is controlled UI UAT using `FILE-SP-UAT-001`, followed by A2 review before any production enablement.
