# Store Payment Business UAT Scope

Date: 2026-06-23

## 1. Pilot Store

- Store code: `STORE-VTE-001`
- Store name: 万象直营店
- Legacy alias: `ST-VTE-001`, display / compatibility only

## 2. Company

- Company code: `COMP-LAO-AGRI`

## 3. Clerk Role

Expected scope:

1. View own or assigned-store Store Payment records.
2. Create pending payment records.
3. Select approved Store Payment account placeholders only.
4. Upload / reference approved proof files only in controlled test scope.
5. Cannot confirm, reject, void, export, maintain accounts, or bypass DataScope.

Validation path:

1. Login as clerk UAT user.
2. Open 销售管理 / 统一收款.
3. Create a pending record for `STORE-VTE-001`.
4. Verify proof attachment status is protected.
5. Verify no records outside assigned scope are visible.

## 4. Store Manager Role

Expected scope:

1. View `STORE-VTE-001` records.
2. Confirm / reject records for the store.
3. See proof attachment through protected endpoints only.
4. Cannot maintain accounts unless explicitly granted.
5. Cannot access other stores.

Validation path:

1. Login as store manager UAT user.
2. Filter pending records.
3. Confirm one approved UAT record.
4. Reject one invalid UAT record with reason.
5. Verify scope remains within `STORE-VTE-001`.

## 5. Finance Role

Expected scope:

1. View all approved pilot Store Payment records.
2. Confirm / reject records according to finance workflow.
3. Review currency, amount, account, proof, and status.
4. No automatic financial reconciliation in this pilot.

Validation path:

1. Login as finance UAT user.
2. Query records by date, store, account, payment method, and status.
3. Confirm finance review actions.
4. Verify no auto-posting to finance ledger occurs.

## 6. Administrator Role

Expected scope:

1. Maintain Store Payment accounts if approved.
2. View all Store Payment pilot records.
3. Review menu / role / account setup.
4. Cannot use admin privilege as an unlogged audit bypass path.

Validation path:

1. Login as admin UAT user.
2. Verify account list and account pending/disabled states.
3. Verify role visibility and action bits.
4. Verify audit evidence exists or is captured as required.

## 7. Forbidden Items

UAT must not:

1. use real customer privacy files without approval.
2. use real bank / QR production evidence without approval.
3. expose `rawUrl`.
4. expose `/uploads`.
5. expose `storage_path`.
6. run production deployment.
7. push without approval.
8. run production migration.
9. write remote DB without approval.
10. expand beyond `STORE-VTE-001` without a separate Gate.

## 8. UAT Data Boundary

Allowed:

1. non-sensitive test payment records.
2. non-sensitive test proof PDFs/images.
3. test account QR metadata.
4. controlled staging-only UAT fixtures after approval.

Not allowed:

1. copied local UAT data without approval.
2. real bank receipts unless explicitly authorized.
3. real customer privacy documents.
4. production financial posting.

## 9. Attachment Test Boundary

Allowed:

1. protected status endpoint.
2. protected preview endpoint.
3. protected download endpoint.
4. no-auth 401 verification.
5. missing 404 verification.

Forbidden:

1. naked `/uploads` links.
2. `rawUrl` display.
3. `storage_path` display.
4. direct storage path access.
5. frontend-built file URLs.

## 10. Feedback Path

Business UAT issues should be recorded with:

1. role.
2. user.
3. store.
4. menu path.
5. action.
6. expected result.
7. actual result.
8. screenshot or non-sensitive evidence.
9. severity.
10. whether it blocks controlled pilot.

Suggested routing:

1. security / permission issue: A2.
2. backend API issue: A3.
3. frontend UI / UX issue: A4.
4. data readiness issue: A5.
5. CI / typecheck / smoke issue: A1.
6. release / rollback issue: A6 + A7.

## 11. Acceptance Criteria

Business UAT may pass when:

1. clerk workflow passes.
2. store manager workflow passes.
3. finance workflow passes.
4. administrator workflow passes.
5. Store Payment attachments remain protected.
6. `rawUrl`, `/uploads`, and `storage_path` are not exposed.
7. DataScope restricts users correctly.
8. no production deploy is performed.
9. no unauthorized remote DB write is performed.
10. A2 / A1 / A5 accept remaining conditions.
