# Global RBAC Menu Gate Audit

Date: 2026-06-25

## Objective

Run a global audit and tightening pass for role permissions, left navigation visibility, menu gate accuracy, and permission granularity.

The production rule is:

> If a user does not have permission for a menu or action, the frontend must not show that menu/action, and the backend must still reject direct API access.

## What Was Fixed In This Pass

### 1. Daily Work cash shortcuts

`/daily-work` cash receive/pay shortcuts previously required:

- `MENU_FIN2_CASH:C`

They now require:

- `MENU_FIN2_CASH_TXN:C`

Reason: receiving/payment entry is a transaction action, not a generic cash-account view or parent permission.

### 2. Home procurement shortcut

The procurement home tile and CTA now prefer atomic procurement permissions:

- `MENU_PRC2_DASHBOARD`
- `MENU_PRC2_SUPPLIER`
- `MENU_PRC2_PROJECT`
- `MENU_PRC2_REQUEST`
- `MENU_PRC2_ORDER`
- `MENU_PRC2_PAYMENT`
- `MENU_PRC2_RECEIPT`
- `MENU_PRC2_SHIPMENT`
- `MENU_PRC2_FUND`

Legacy `MENU_PRC2` and `MENU_PRC2_MASTER` remain transition fallbacks.

### 3. Home cash CTA

The cash CTA now prefers:

- `MENU_FIN2_CASH_VIEW`

Legacy fallback:

- `MENU_FIN2_CASH`

### 4. Static CI gate

Added:

- `scripts/ci/check-menu-permission-atomicity.mjs`

W5 closeout gate now runs this check.

The gate blocks known regressions:

- Daily-work cash create shortcut using coarse `MENU_FIN2_CASH:C`.
- Procurement V2 backend controllers directly using `@RequireMenu('MENU_PRC2_MASTER', ...)` instead of atomic `MENU_PRC2_*` primary guards.
- Packaging terminal shortcut rendered without `MENU_PKG_OP` / `MENU_PKG_MGR` gating.

## Database Permission Snapshot

Local `phoenix_erp` still has legacy broad grants:

| Menu Code | Role Grant Count |
| --- | ---: |
| `MENU_FIN2_CASH` | 10 |
| `MENU_PRC2` | 9 |
| `MENU_PRC2_MASTER` | 6 |
| `MENU_STORE_MGR` | 5 |
| `MENU_WMS_INOUT` | 9 |
| `MENU_WORKFLOW` | 25 |

These are not all bugs. Some are legacy parent or module-level permissions. But they are now high-priority review candidates because they can hide real role intent.

## Key Findings

### P0 / Fixed

1. Sidebar and home/daily-work entry points now use atomic procurement and cash permissions where atomic codes already exist.
2. Procurement V2 backend supplier/project/request controllers now enforce atomic guards with legacy fallback.
3. A W5 static gate now blocks the most likely regression patterns.

### P1 / Needs Follow-up

1. `MENU_WORKFLOW` is still used for many different concepts:
   - My todo / my done
   - Notifications
   - Approval flow configuration
   - Approval rules
   - Form runtime management
   - Metrics

   The frontend uses action bits (`V`, `C`, `E`, `X`) to separate some of these, but the menu code itself is broad. Recommended next step is to introduce or map existing atomic workflow codes:

   - `MENU_WORKFLOW_TODO`
   - `MENU_WORKFLOW_HISTORY`
   - `MENU_WORKFLOW_NOTIFY`
   - `MENU_WORKFLOW_CONFIG`
   - `MENU_WORKFLOW_FORM`
   - `MENU_WORKFLOW_METRICS`

2. `MENU_STORE_MGR` gates many store pages:
   - Workbench
   - Receiving
   - Inventory
   - Replenishment
   - Losses
   - Daily close

   Store payment has already been atomized. Store operations should follow the same pattern.

3. `MENU_WMS_INOUT` gates multiple WMS write workflows:
   - Inbound
   - Outbound
   - Transfer
   - Stocktake
   - Daily close
   - Loss report

   Recommended atomization:

   - `MENU_WMS_INBOUND`
   - `MENU_WMS_OUTBOUND`
   - `MENU_WMS_TRANSFER`
   - `MENU_WMS_STOCKTAKE`
   - `MENU_WMS_DAILY_CLOSE`
   - `MENU_WMS_LOSS`

4. Generic CRUD still maps some broad menu codes, but V2 Runtime tables are already blocked before fallback access:
   - `prc2_*`
   - `fin_cash_*`
   - `fin_ar_*`
   - `fin_ap_*`
   - `fin_expense_*`
   - `fin_shareholder_*`

   Remaining generic CRUD review should focus on non-runtime tables such as `store_*`, `wms_*`, and older master tables.

## Recommended Remediation Order

1. Workflow atomization:
   - Split configuration pages from ordinary todo/history visibility.
   - Make "approval center has too much permission" measurable and fixable.

2. Store operations atomization:
   - Split `MENU_STORE_MGR` by child page.
   - Keep DataScope by store.

3. WMS in/out atomization:
   - Split inbound/outbound/transfer/stocktake/loss/daily-close.
   - Preserve warehouse DataScope.

4. Role grant cleanup:
   - Remove broad menu grants from operational roles after atomic grants are added.
   - Keep broad grants only for manager/admin roles that truly need the whole module.

5. User acceptance test:
   - Use real operational users such as 王乐金 to verify:
     - Sidebar shows only authorized menus.
     - Home/daily-work shortcuts match the sidebar.
     - Page buttons align with backend action bits.
     - Direct URL access is blocked server-side.

## Current Risk

Current risk after this pass: MEDIUM.

The most visible procurement/cash menu confusion has been tightened. Remaining risk is concentrated in workflow, store, WMS, and role grant cleanup.

## Validation

Required:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- API typecheck
- Web typecheck
- W5 closeout gate

