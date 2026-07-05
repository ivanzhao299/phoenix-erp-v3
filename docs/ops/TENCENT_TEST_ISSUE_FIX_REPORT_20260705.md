# Tencent Test Issue Fix Report - 2026-07-05

## Scope

Source: Tencent Docs issue sheet `DZXpwS0ZOUkpTWXBT`, tab `BB08J2`.

This pass focused on production-blocking issues that can be fixed safely in code:

- finance cash account creation
- WMS / inventory DataScope visibility
- generic CRUD warehouse scope leakage
- menu label consistency
- menu visibility and shortcut routing verification

No database write, migration, deploy, or push was executed while preparing this report.

## Issue Matrix

| # | Area | Reported issue | Root cause | Fix / status |
|---|------|----------------|------------|--------------|
| 1 | Finance cash account | Account code says optional auto-generated, but blank create fails: `accountCode must be string`. | Backend DTO still required `accountCode` even though service supports auto generation. | Fixed. `CreateCashAccountDto.accountCode` is optional, and service trims manual code or generates one when blank. |
| 2 | Finance cash role | Role description says no `fin_cash MASTER`, but user can create cash account. | Code path already requires `MENU_FIN2_CASH_MASTER:C`; likely role permission data grants that menu op in production. | Code verified. Create button and API are both guarded by `MENU_FIN2_CASH_MASTER`. Next data task: audit `sys_role_menu_permission` for this role and remove unexpected `C/E` grants. |
| 3 | Warehouse dashboard | Menu visible but page reports insufficient permission. | Frontend sidebar already hides child menus without permission; remaining risk is old shortcut/deep-link access. | Verified code path. No child menu should be displayed without permission. Deep-link still returns 403 by design. |
| 4 | Finance parent menu name | Different users see different finance parent menu names. | Fallback label and i18n label differed: `财务管理` vs `财务结算中心`. | Fixed fallback label to `财务结算中心` to keep parent menu stable when translation misses. |
| 5 | Operations workbench | Procurement center shortcut opens 403. | Current code resolves shortcuts to first accessible child menu. Older production build may still use static parent links. | Verified current code. No additional local patch required. |
| 6 | Packaging exceptions | Finance role opens exception handling and gets package permission error. | Correct backend guard requires `MENU_PKG_OP`; finance role should not see this child menu. | Verified sidebar child filtering. If still visible in production, deploy current menu build and clear stale frontend cache. |
| 7 | WMS inbound | Warehouse user creates inbound order, list shows empty; admin can see it. | Generic CRUD used legacy `site_code` filter, while WMS facts use `warehouse_code`. Warehouse scope was not derived from authorized company. | Fixed. DataScope now expands authorized companies to active warehouses; Generic CRUD filters WMS/INV by `warehouse_code`; create/update/delete are warehouse scoped. |
| 8 | WMS outbound | Same issue as inbound. | Same root cause as #7. | Fixed by same WMS/INV warehouse scope correction. |
| 9 | Inventory query / ledger | Warehouse user sees no inventory; admin can see data. | Generic CRUD and WMS services had inconsistent empty-scope semantics. | Fixed. WMS reads fail closed when no warehouse scope; Generic CRUD uses derived warehouse scope and supports array `ANY($n)` filters. |

## Code Changes

- `apps/api/src/modules/finance-v2/dto/cash-account.dto.ts`
- `apps/api/src/modules/finance-v2/services/cash-accounts.service.ts`
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/modules/org/services/data-scope.service.ts`
- `apps/api/src/modules/wms/wms.service.ts`
- `apps/web/src/components/layout/Sidebar.tsx`

## Safety Notes

- No business data was written.
- No migration was added or executed.
- No deployment was executed during this report stage.
- WMS / inventory generic reads now use parameterized array filters, not string interpolation.
- WMS / inventory write paths now reject missing or mismatched warehouse scope.

## Follow-Up Data Audit

For issue #2, run a role-permission data audit before changing production grants:

```sql
SELECT role_code, menu_code, can_view, can_create, can_edit, can_delete, can_export
FROM sys_role_menu_permission
WHERE menu_code = 'MENU_FIN2_CASH_MASTER'
ORDER BY role_code;
```

Unexpected `can_create` or `can_edit` grants should be removed through the role permission management workflow, not by bypassing the API guard.

## Verification

- API typecheck: PASS (`cd apps/api && ./node_modules/.bin/tsc --noEmit`).
- Web typecheck: PASS (`cd apps/web && ./node_modules/.bin/tsc --noEmit`).
- W5 closeout gate: PASS (`ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`).
