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
- main CI/security run `29226428504`: PASS.
- full CI/CD deploy run `29226428523`: PASS; API/Web images, migrations Gate, regressions, deploy, and health checks completed.
- authenticated production readonly run `29226762516`: PASS.
- production evidence collection: read-only, PASS; 3/3 account books and 46/46 book-scoped targets are fresh.
- Chanjet write/delete/modify: NO.
- ERP business-table overwrite: NO.
- mapping auto-approval: NO.
- migration: NO.
- push/deploy: YES for the audited ERP patch only; no Chanjet data was changed.

## Production Gate Evidence

The authenticated production Gate completed at `2026-07-13T05:38:07.881Z` with `GO_WITH_CONDITIONS`:

1. Baseline freshness: `GO`; 16 readonly scopes, 46 expected targets, 46 fresh, 0 stale, 0 missing.
2. Account-book Gate: `GO`; 3 cached books, 3 enabled mappings, 3 valid company bindings, 0 blockers.
3. Company bindings:
   - `3533914511118750` -> `COMP-LAO-AGRI`
   - `3537748712226818` -> `COMP-LAO-XINGCHI`
   - `3539743721526654` -> `COMP-LAO-FOOD`
4. Counterparty Gate: `GO_WITH_CONDITIONS`; 315 source counterparties produced 404 role-specific candidates.
5. Candidate state: 51 matched, 353 pending, 0 conflicts, 0 unknown roles, 0 approved automatically.
6. High-volume evidence includes 1,275 voucher rows, 47 cash accounts, 43 AP-statistic rows, 71 AR-statistic rows, 100 AP payment rows, 100 AR receipt rows, and 43 purchase-order rows in the latest pull.
7. Request-method guardrail: Chanjet-facing evidence calls are GET-only.

## Decision

Production runtime result: `GO_WITH_CONDITIONS`.

The deploy, cache refresh, 16-scope mirror rerun, PENDING-only candidate generation, and authenticated GET-only Gate audit are complete. The next single Gate is `CHANJET_COUNTERPARTY_MAPPING_CANDIDATE_REVIEW`:

1. review the 353 pending customer/supplier role-specific candidates against ERP masters;
2. keep conflict and unknown-role items fail-closed;
3. do not silently overwrite ERP customer/supplier masters;
4. do not approve mappings in bulk without candidate evidence;
5. keep Chanjet writeback and voucher push on HOLD.
