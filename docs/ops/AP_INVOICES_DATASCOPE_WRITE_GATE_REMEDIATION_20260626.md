# AP Invoices DataScope Write Gate Remediation — 2026-06-26

## Scope

This remediation tightens Finance V2 AP invoice runtime access and write boundaries.

## Problem

`ApInvoicesService` still read scope from `user.companyCodes/scopeAll` instead of the `DataScopeGuard` CLS context. In some request paths this can drift from the authoritative data domain.

The service also treated non-global users with an empty `companyCodes` array as unfiltered for several list/summary/import paths.

## Fix

- Read `DataScopeContext` from CLS in `currentUser()`.
- Preserve project-level scope for write checks.
- Remove service-level `permissions.includes('*')` bypass from AP import permission helper.
- Add `assertWritableOwnership()` for manual create, PO create, and prc2 import row writes.
- Treat non-global empty company scope as `1=0` or `403` instead of broad access.
- Keep controller-level `@RequireMenu('MENU_FIN2_AP', 'E')` as the AP import authority.

## Changed Files

- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts`
- `docs/ops/AP_INVOICES_DATASCOPE_WRITE_GATE_REMEDIATION_20260626.md`

## Safety

- Migration executed: no.
- DB write executed locally: no.
- Schema/entity/table/column changed: no.
- Frontend changed: no.
- Production deployment: only through validated CI/CD after push.

## Expected Impact

AP invoice list, aging, summary, manual creation, PO-based creation, and prc2 import now align with the resolved data domain. Users without configured company scope no longer see or import all AP records by accident.

## Validation Plan

- API typecheck.
- Web typecheck.
- W5 closeout gate.
- CI/CD build and deploy.
- Production health smoke.

