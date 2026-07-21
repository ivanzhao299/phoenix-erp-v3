# BUG-20260713-0002 Price Book Root Cause and Repair Report

## Conclusion

The reported issue was not fully resolved by the previous Agent cycle. The production data repair was partially complete, but the page still used an obsolete authentication path and the repair runner incorrectly treated a lagging lifecycle status as missing implementation evidence.

Current conclusion: **GO WITH CONDITIONS**. The code defects are fixed and covered by regression tests. The empty cancelled duplicate price book can now be deleted through the guarded administrator action after deployment; no production business data was changed by this repair.

## Root Causes

1. **Split authentication state on the pricing page**
   - The page read `localStorage.phoenix_token` before the active session token.
   - The global authentication flow uses the current `sessionStorage` token.
   - A stale token could therefore be sent while the header showed the newly logged-in administrator, producing `MENU_PERMISSION_DENIED` even though the administrator role had the required permission.

2. **The duplicate price book was cancelled but could not be removed**
   - The service and UI only allowed deletion of `DRAFT` price books.
   - The duplicate `孟赛标准价格册（试运行版）重建` was already `CANCELLED`, had no price items and no business references, so the previous workflow had no safe terminal action.

3. **False HOLD in the Bug Intake lifecycle**
   - A3/A4/A1 result artifacts existed, but `repairTaskStatus` remained `AGENT_RUNNING` when the local runner checked the report.
   - The runner trusted that lagging status instead of recomputing evidence from the selected Agent results, so it returned `implementation evidence gate is not ready: AGENT_RUNNING`.

## Production Read-only Evidence

- `PB-MENGSE-2026-STD` / `孟赛标准价格册（试运行版）`: `ACTIVE`, 12 price items.
- `PB-20260708-00001` / `孟赛标准价格册（试运行版）重建`: `CANCELLED`, 0 price items.
- Administrator user is active and holds `ROLE_ADMIN` and `ROLE_MASTER_DATA_APPROVER`.
- `ROLE_ADMIN` has `MENU_SALES2_PRICE` actions `V/C/E/D/A/X`.

## Repairs

- The pricing page now uses the shared API client, including session-first token selection, token refresh and global authentication failure handling.
- A guarded `删除空册` action is exposed only with delete permission.
- The backend permits deletion of a cancelled price book only when it has zero price items and no sales order or order-item references.
- Bug Intake now derives implementation readiness from active-cycle Agent evidence and rejects any selected Agent result with `HOLD` or `FAIL`.
- Regression tests cover stale-token prevention, cancelled empty-book deletion and lifecycle status lag.

## Verification

- API focused tests: PASS (22 tests).
- Web pricing lifecycle tests: PASS (5 tests).
- API TypeScript check: PASS.
- Web TypeScript check: PASS.
- Production data checks were read-only.

## Boundaries

- Migration executed: No.
- Database write: No.
- Production business data changed: No.
- Duplicate row automatically deleted: No. It remains a deliberate, permission-gated administrator action.
- Push/deploy: recorded after CI/CD completion.

