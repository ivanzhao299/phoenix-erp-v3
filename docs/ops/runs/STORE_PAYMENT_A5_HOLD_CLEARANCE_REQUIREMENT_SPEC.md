# Store Payment A5 HOLD Clearance Requirement Spec

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Source Request

Clear the Store Payment pilot readiness A5 HOLD blocker with read-only evidence. Only A5 data readiness, A2 read-only security review, and A1 read-only validation are allowed. Do not enter A3/A4 implementation.

## Goal

Confirm whether Store Payment pilot readiness can move from A5 `HOLD` to `GO WITH CONDITIONS`, based on read-only DB evidence where available and static evidence where DB access is unavailable.

## Required Evidence Areas

1. Pilot store readiness: `STORE-VTE-001`, 万象直营店, Vientiane pilot store, or another existing store in `mst_stores` / `sys_organizations`.
2. Company / organization mapping: `company_code`, `organization_code`, `store_code`, business unit / project / farm / store relationships.
3. Company collection account readiness: `store_payment_accounts`, `fin_cash_accounts`, company/store/account/currency/active state, QR/proof attachment strategy.
4. Store Payment table readiness: `store_payment_accounts`, `store_payment_records`, required fields, status fields, account/store/company consistency, audit fields, `proof_attachment_id`.
5. User role and store scope readiness: cashier / store manager / finance / admin / super admin; user-role-menu relationship; user organization / store / `allowedSiteCodes` / data scope.
6. Menu and role grant readiness for:
   - `MENU_STORE_PAYMENT_ACCOUNT`
   - `MENU_STORE_PAYMENT`
   - `MENU_STORE_PAYMENT_CONFIRM`
   - `MENU_STORE_PAYMENT_VOID`
   - `MENU_STORE_PAYMENT_EXPORT`
7. Attachment proof / QR association readiness.
8. Whether A5 HOLD can be lifted.
9. Whether A3 Backend Gate and A4 Frontend Gate may be opened.

## Hard Boundaries

1. Do not modify business code.
2. Do not modify `apps/api/**`.
3. Do not modify `apps/web/**`.
4. Do not add or run migrations.
5. Do not modify schema/entity/table/column.
6. Do not insert/update/delete data.
7. Do not write databases.
8. Do not deploy.
9. Do not push.
10. Do not enter A3/A4 implementation.

## Evidence Rule

If real DB connection evidence is unavailable, the Agent must explicitly state:

- DB evidence unavailable.
- Current conclusion is based on static inference only.
- Missing connection/query evidence.
- Evidence required before entering A3/A4.

The Agent must not fabricate DB evidence.

## Output

Primary A5 output:

`docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

Follow-up review outputs:

- A2: `docs/ops/A2_STORE_PAYMENT_A5_HOLD_CLEARANCE_REVIEW.md`
- A1: `docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md`

