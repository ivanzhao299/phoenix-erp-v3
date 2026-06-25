# Production Readiness Remediation Batch - Procurement and WMS DataScope

Date: 2026-06-25

## Objective

Continue the P0/P1 production readiness remediation by closing practical DataScope gaps in legacy procurement and WMS outbound flows. The goal is to prevent store/site-scoped users from seeing or mutating records outside their allowed business range.

## Changes

### Legacy Procurement

Added store-scoped filtering to legacy procurement aggregate and detail paths:

- supplier KPI spend/order aggregation now scopes joined purchase orders by `po.store_code`
- three-way match now validates the purchase order belongs to the current user's store scope before loading receipts/invoices
- dashboard counters and monthly spend now apply the same store scope used by existing request/order lists

### WMS Outbound

Added sales order store/site scope for outbound operations that read or mutate `ord_orders`:

- outbound dashboard counts
- pending outbound list
- outbound order detail
- outbound status advance
- delivery receive/sign operation

Scope source:

- `DataScopeContext.allowedSiteCodes`
- current JWT `user.storeCode` fallback when not `ALL`
- non-global users with no allowed store/site scope receive an empty result or no mutation target

## Validation

| Check | Result |
| --- | --- |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |

## Safety

- Business code changed: yes, API DataScope enforcement only.
- Frontend changed: no.
- Migration executed: no.
- Database write executed locally: no.
- Deploy status: pending CI/CD after push.

## Remaining Backlog

1. Sweep remaining inventory/reporting read models for warehouse/site/project DataScope.
2. Align frontend high-risk buttons and routes with backend menu/action bits.
3. Continue protected attachment convergence for historical upload links.
4. Complete production master-data readiness and import gaps.
5. Harden CI/CD and operations secrets/rollback procedures.
