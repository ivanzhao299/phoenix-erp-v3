# Store Payment Staging Business UAT Guide

Date: 2026-06-23

## 1. Pilot Store

- Store code: `STORE-VTE-001`
- Store name: 万象直营店
- Legacy alias: `ST-VTE-001`, compatibility/display only

## 2. Pilot Company

- Company code: `COMP-LAO-AGRI`

## 3. Pilot Roles

Approved business UAT roles:

1. 店员
2. 店长
3. 财务
4. 管理员

## 4. UAT Operation Path

1. Login to staging after deployment is separately completed.
2. Open menu: 销售管理 / 统一收款.
3. Open page: `/store-payment`.
4. Execute role-specific test cases below.
5. Record evidence with user, role, store, action, expected result, actual result, and screenshot if non-sensitive.

## 5. Clerk Test Items

1. View only own or assigned-store Store Payment records.
2. Create a pending payment record for `STORE-VTE-001`.
3. Select an approved company collection account.
4. Enter amount, currency, payment method, payment time, and optional order/sale reference.
5. Attach or reference approved non-sensitive proof evidence if staging fixture is available.
6. Confirm the record stays pending and does not auto-post to finance.
7. Confirm records outside scope are not visible.

## 6. Store Manager Test Items

1. View `STORE-VTE-001` payment records.
2. Filter by date, status, collector, account, and payment method.
3. Confirm one valid pending record.
4. Reject one invalid pending record with a reason.
5. Confirm records outside the store are not visible.
6. Confirm proof attachments use protected preview/download only.

## 7. Finance Test Items

1. View all approved pilot Store Payment records.
2. Filter by store, date, currency, payment method, and status.
3. Review proof attachment protected status.
4. Confirm or reject records according to finance review policy.
5. Verify no automatic financial reconciliation is executed.
6. Verify export remains reserved unless separately approved.

## 8. Administrator Test Items

1. Verify Store Payment menu visibility.
2. Verify `MENU_STORE_PAYMENT*` role grants.
3. Verify account list and disabled/pending account states.
4. Verify store/company display uses `STORE-VTE-001 / COMP-LAO-AGRI`.
5. Verify admin actions do not bypass audit expectations.

## 9. Attachment Test Items

1. QR status uses protected endpoint.
2. QR preview uses protected endpoint.
3. QR download uses protected endpoint.
4. Proof status uses protected endpoint.
5. Proof preview uses protected endpoint.
6. Proof download uses protected endpoint.
7. no-auth access returns 401.
8. missing file id returns 404.
9. `rawUrl` is not displayed.
10. `/uploads` is not exposed.
11. `storage_path` is not leaked.

## 10. Feedback Method

Each issue must include:

1. UAT role.
2. user.
3. store.
4. menu/page.
5. action.
6. expected result.
7. actual result.
8. non-sensitive evidence.
9. severity.
10. whether it blocks UAT.

Routing:

1. permission/security issue: A2.
2. backend/API issue: A3.
3. frontend/UI issue: A4.
4. data readiness issue: A5.
5. CI/smoke issue: A1.
6. release/rollback issue: A6/A7.

## 11. Acceptance Criteria

Business UAT can pass only if:

1. clerk flow passes.
2. store manager flow passes.
3. finance flow passes.
4. administrator flow passes.
5. protected attachment smoke passes.
6. no raw URL is displayed.
7. no `/uploads` path is exposed.
8. no `storage_path` is leaked.
9. DataScope keeps users inside approved scope.
10. no production deploy is executed.
11. no production DB write is executed.

## 12. Forbidden Items

1. Production deploy.
2. Production migration.
3. Production remote DB write.
4. Push to `main` without an explicit production-safe release decision.
5. Full-group rollout.
6. Non-Store Payment module changes.
7. Real bank/customer privacy files without separate approval.
8. Direct `/uploads` access.
9. Raw URL exposure.
10. Cleanup, reset, or destructive data operation.
