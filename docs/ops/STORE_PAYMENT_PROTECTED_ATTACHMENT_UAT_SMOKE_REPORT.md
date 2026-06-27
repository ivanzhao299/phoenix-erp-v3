# Store Payment Protected Attachment UAT Smoke Report

Date: 2026-06-23

## Scope

This Gate verified the Store Payment page-level protected attachment UAT smoke for the local pilot QR file.

- Page entry: `/store-payment`
- Test file id: `FILE-SP-UAT-001`
- Associated object: `store_payment_accounts.id=1`
- Associated field: `qr_attachment_id`
- Backend endpoints used:
  - `/store-payment/attachments/FILE-SP-UAT-001/status`
  - `/store-payment/attachments/FILE-SP-UAT-001/preview`
  - `/store-payment/attachments/FILE-SP-UAT-001/download`

## UI Smoke Results

| Check | Result |
| --- | --- |
| QR status UI smoke | PASS |
| QR preview UI smoke | PASS |
| QR download UI smoke | PASS |
| Protected endpoint used | PASS |
| rawUrl displayed | NO |
| `/uploads` path used | NO |
| `storage_path` leaked | NO |
| Fail-closed behavior | PASS |

Evidence file:

- `docs/ops/runs/store-payment-protected-attachment-uat-page-smoke.json`

## Status UI

The account list displayed the Store Payment QR attachment state for `SP-VTE-BCEL-LAK-PENDING`.

- `accessStatus`: `allowed`
- status text: backend ACL allowed
- `rawUrl`: `null`
- endpoint label: protected

Accounts without metadata remained in `MISSING` state and kept preview/download disabled.

## Preview UI

The preview button was enabled only for the row whose backend status was `allowed` and whose `previewAvailable` flag was true.

The click used:

- `/store-payment/attachments/FILE-SP-UAT-001/preview`

The browser opened a local blob URL only after the protected endpoint streamed the PDF. The page did not open a naked HTTP(S) URL.

## Download UI

The download button was enabled only for the row whose backend status was `allowed` and whose `downloadAvailable` flag was true.

The click used:

- `/store-payment/attachments/FILE-SP-UAT-001/download`

The downloaded file was `store-payment-proof-uat.pdf` from the protected endpoint stream.

## Fail-Closed Verification

Fail-closed behavior was verified for accounts without QR metadata:

- `accessStatus`: `missing`
- preview button: disabled
- download button: disabled
- message: file metadata missing or file unavailable

The page treats unsafe raw URL state as blocked, disables buttons, and does not construct `/uploads` links.

## A2 Review Summary

Conclusion: PASS WITH CONDITIONS.

Security checks:

- raw URL exposure: no.
- `/uploads` path construction: no.
- `storage_path` leak: no.
- protected endpoint bypass: no.
- RBAC bypass: no evidence in frontend path.
- DataScope bypass: no evidence in frontend path.
- fail-closed behavior: pass.

Conditions:

- This was local UAT metadata only.
- Production enablement still requires A6/A7 Gates.
- Record proof attachment UAT requires a separate approved fixture.

## A1 Verification Summary

Conclusion: PASS WITH CONDITIONS.

Verification:

- Web typecheck: PASS.
- Page route smoke: PASS.
- UAT smoke report: generated.
- W5 closeout gate: PASS.
- Backend touched: no.
- DB write: no task-scoped DB write.
- Migration: no.
- Deploy: no.
- Push: no.
- Runtime Memory update: complete.

Condition:

- Web dev was run with webpack mode because Turbopack rejects the existing worktree `node_modules` symlink layout.

## Runtime Memory Update

Runtime Memory was updated:

- `PROJECT_STATE.json`
- `STORE_PAYMENT_STATE.md`
- `NEXT_ACTIONS.md`
- `DECISION_LOG.md`

New stage:

- `STORE_PAYMENT_PROTECTED_ATTACHMENT_UAT_VERIFIED`

Attachment preview state:

- `protected_account_qr_uat_passed`

## Boundaries

- Backend changed: no.
- DB written: no task-scoped DB write.
- Migration executed: no.
- Seed executed: no.
- Deploy executed: no.
- Push executed: no.
- Production command executed: no.
- Proof record fixture created: no.

## Conclusion

Current conclusion: GO WITH CONDITIONS.

Next recommended Gates:

1. `STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_FIXTURE`
2. `A6_STAGING_DEPLOY_RUNBOOK`
3. `A7_FINAL_QA_GATE`
