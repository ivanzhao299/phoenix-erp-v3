# AP Import Atomic Permission Remediation - 2026-06-26

## Scope

Closes a residual RBAC audit item where AP import from Procurement V2 still used role-code allowlists.

## Changed Files

- `apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts`
- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts`

## Remediation

`importFromPrc2` now authorizes with `MENU_FIN2_AP:E` instead of hard-coded `ROLE_ADMIN / ROLE_FIN_CFO / ROLE_GROUP_FINANCE` role names.

The import remains DataScope-filtered by company:

- non-global users are restricted to `allowedCompanyCodes`;
- explicit `companyCode` filters are applied on top of DataScope;
- no unrelated finance permissions are granted by role name alone.

## Safety

- Business code changed: Yes, authorization logic only.
- DB migration executed: No.
- DB write executed by this remediation: No.
- Deploy: Pending CI/CD after push.

## Validation

- API typecheck.
- W5 closeout gate.
