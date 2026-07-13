# Chanjet P0 Production Readonly Gate Evidence Report

## Scope

This stage hardens the production-readonly Gate for the Chanjet middle layer. It does not write, delete, or modify Chanjet data, does not push vouchers, and does not approve customer or supplier mappings.

## Production Readonly Evidence

Read-only production queries confirmed:

1. Three enabled `chanjet_book_company_map` rows already bind the three Chanjet books to active ERP companies.
2. `chanjet_account_books` was empty even though `ACCOUNT_BOOKS` entity snapshots existed.
3. The account-book response stores identity under `tenant.id` and `tenant.name`; the former parser only inspected top-level `id/name`.
4. The existing mirror contains all 16 configured readonly scopes, but the latest snapshots/jobs were older than the 24-hour freshness Gate.
5. Existing latest snapshot jobs were successful; the blocker is freshness and account-book cache integrity, not a known Chanjet API write failure.
6. The customer/supplier mirror contains 292 source rows across the enabled books.
7. Observed production role evidence uses numeric `partyRoleTypeId` values:
   - `100001`: customer
   - `100101`: supplier
   - `100400`: both customer and supplier
8. Existing customer/supplier mapping rows are still pending; no mapping is automatically approved.

No bank account numbers, storage paths, tokens, secrets, or voucher payloads are included in this report.

## Root Causes Fixed

### 1. Empty account-book cache

The mirror sync fell back to `chanjet_book_company_map` when the cache was empty, so it never called the account-book refresh path. In addition, the `ACCOUNT_BOOKS` mirror response was recorded as a snapshot but not persisted to `chanjet_account_books`.

Fix:

- book-scoped sync refreshes the account-book cache when it is empty;
- every `ACCOUNT_BOOKS` mirror response is persisted to the middle-layer cache;
- account-book persistence is shared by manual refresh and mirror sync;
- nested `tenant.id/name` is parsed and duplicate book rows are removed;
- normalized account-book snapshots now carry the real external ID, name, status, and opening period where present.

### 2. Customer/supplier role misclassification

The prior classifier handled textual flags but did not understand the numeric role enum used by the production response.

Fix:

- lock the three observed numeric role values;
- unknown numeric values remain `UNKNOWN` and HOLD;
- balances and names are not used to guess a role;
- candidate evidence records the observed role enum without exposing raw payloads.

### 3. Invalid ERP target names

Field-gap suggestions still referenced historical `mst_customers` / `mst_suppliers` targets. The real ERP masters are `sal_customers.customer_no` and `prc2_suppliers.supplier_code`.

Fix:

- new customer suggestions target `sal_customers`;
- new supplier suggestions target `prc2_suppliers`;
- ambiguous counterparties remain in `chanjet_master_mapping`;
- historical invalid targets are moved back to the middle-layer review state before re-analysis.

## New Audit Command

`scripts/ops/chanjet-p0-production-readonly-gate-audit.mjs` reads only:

- baseline readiness;
- account-book/company mapping Gate;
- counterparty mapping candidate preview.

It issues GET requests only and writes JSON/Markdown audit artifacts under `docs/ops/runs/`. It fails closed when authentication or any Gate evidence is unavailable.

## Validation

- Chanjet integration unit tests: PASS, 12/12.
- API TypeScript check: PASS.
- audit script syntax check: PASS.
- audit dry-run: `DRY_RUN_READY`.
- W5 closeout: default freeze/security review correctly blocked the changed branch; authorized `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` rerun PASS.
- production evidence collection: read-only, PASS.
- Chanjet write/delete/modify: NO.
- ERP production DB write: NO.
- migration: NO.
- deploy: NO in this evidence stage.
- push: NO in this evidence stage.

## Decision

Implementation result: `GO_WITH_CONDITIONS`.

Production runtime Gate remains `HOLD` until this commit is deployed and the authenticated GET-only audit is rerun. After deployment, the permitted sequence is:

1. refresh the account-book cache through the approved readonly-to-Chanjet middle-layer path;
2. rerun the 16-scope readonly mirror to restore 24-hour freshness;
3. generate customer/supplier candidates as `PENDING` only;
4. rerun the GET-only Gate audit;
5. keep individual approvals and all Chanjet writes on HOLD.
