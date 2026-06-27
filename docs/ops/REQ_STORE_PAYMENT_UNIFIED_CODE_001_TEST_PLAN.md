# Test Plan: Unified Store Payment Code 001

> Test plan only. No code or test implementation is approved by this document.

## Schema Tests

1. Tables exist only after approved migration.
2. `record_no` and `account_code` uniqueness works.
3. NOT NULL constraints reject missing required fields.
4. Amount check rejects zero/negative values.
5. Status check allows only PENDING/CONFIRMED/REJECTED/VOIDED.
6. Down migration/rollback is reviewed before any production use.

## API Tests

1. Create record starts as PENDING regardless of request body status.
2. Missing screenshot is rejected.
3. Disabled account/code cannot be selected.
4. Confirm works only from PENDING.
5. Reject requires reason.
6. Void requires reason and high-risk permission.
7. Confirmed record cannot be silently edited.
8. No API creates finance receipt, inventory movement, POS completion, or Chanjet sync.

## Permission Tests

1. Clerk can create only for assigned pilot store.
2. Clerk cannot maintain accounts/codes.
3. Store manager can confirm only own-store records.
4. Finance can confirm according to approved scope.
5. Admin account maintenance is audited.
6. Export requires export permission.

## DataScope Tests

1. List filters are scoped by user role/store.
2. Detail endpoint denies out-of-scope records.
3. Confirm/reject/void deny out-of-scope records.
4. Attachment preview uses same scope as record detail.
5. Company-only scope is not enough for clerk/manager tests.

## Attachment ACL Tests

1. Upload accepts approved image formats.
2. Proof preview/download requires authenticated user.
3. Out-of-scope user cannot preview screenshot.
4. Raw URL is not exposed in table/export/log output.
5. Attachment denied access is audited.

## Audit Log Tests

1. Account/code create/update/enable/disable writes audit.
2. Record create writes audit.
3. Proof upload/replace writes audit.
4. Confirm/reject/void writes audit.
5. Export writes audit with filters and row count.
6. Logs redact screenshot URLs, QR payloads, full account numbers, and long remarks.

## State Machine Tests

1. create -> PENDING.
2. PENDING -> CONFIRMED.
3. PENDING -> REJECTED.
4. PENDING/REJECTED/CONFIRMED -> VOIDED only with permission and reason.
5. VOIDED is terminal.
6. Reverse confirmation is not allowed in MVP-1.

## Frontend Smoke

1. Clerk record creation form renders correct fields.
2. Required validation for amount, payment time, account, screenshot.
3. List filters: store, date, receiver, currency, payment method, status.
4. Manager confirm/reject buttons show only when permitted.
5. Finance view can query approved stores.
6. Admin account maintenance page is isolated from clerk.
7. Protected proof preview does not use raw URL.

## Single-Store Gray Tests

1. Pilot store is `STORE-VTE-001 / 万象直营店` after DB confirmation.
2. Menus enabled only for pilot roles.
3. Non-pilot stores cannot create records.
4. Manual fallback remains available.
5. Daily reconciliation checklist compares ERP records to actual account receipts.

## Rollback Tests

1. Disable feature/menu prevents new records.
2. Existing records remain read-only.
3. Proof access remains controlled.
4. Manual process resumes.
5. No finance receipt rollback is needed because MVP-1 does not auto-post.

## Third-Party Independence

1. Tests must not require bank/payment platform callback.
2. Tests must not require Chanjet/Yonyou.
3. Tests must not require POS completion or inventory mutation.
4. Payment proof and manual confirmation are enough for MVP-1 validation.
