# Chanjet Full Integration Phase 1 Implementation Report - 2026-07-03

## Objective

Implement the first production-grade foundation from `CHANJET_FULL_INTEGRATION_ARCHITECTURE_PLAN_20260703.md`:

- Keep Chanjet / 好业财 as an external accounting system.
- Keep ERP business facts in ERP business tables.
- Use an ERP middle layer for read-only probes, field cataloging, mapping candidates, sync job audit, and later human-reviewed reconciliation.

## Implemented Scope

### Middle-Layer Tables

Added a TypeORM migration:

- `apps/api/src/database/migrations/1782740000000-CreateChanjetIntegrationFoundation.ts`

It creates:

1. `chanjet_account_books`
   - Caches Chanjet account books.
   - Links to ERP company only through existing reviewed `chanjet_book_company_map`.

2. `chanjet_master_mapping`
   - Stores ERP-to-Chanjet mapping candidates for company, department, customer, supplier, cash account, subject, project, warehouse, product, and currency.
   - Uses `review_status` so automatic probes cannot silently become authoritative mappings.

3. `chanjet_api_field_catalog`
   - Stores API field paths, sample types, and masked sample values.
   - Does not store tokens, certificates, app tickets, access tokens, or raw secrets.

4. `chanjet_sync_jobs`
   - Audits probe/book-refresh/snapshot/reconcile/import jobs.
   - Records request scope, result summary, and error message.

### Backend Entities

Added:

- `chanjet-account-book.entity.ts`
- `chanjet-master-mapping.entity.ts`
- `chanjet-api-field-catalog.entity.ts`
- `chanjet-sync-job.entity.ts`

### Backend Service

Added:

- `chanjet-integration.service.ts`

Capabilities:

- Refresh Chanjet account books into `chanjet_account_books`.
- Record field catalog from read-only Chanjet API responses.
- Create `chanjet_master_mapping` candidates with `PENDING` review status.
- Record `chanjet_sync_jobs` for success/failure audit.
- Mask sensitive sample values.
- Keep writes limited to the Chanjet middle-layer tables.

### Backend API

Added controlled endpoints under existing `/api/chanjet`:

- `GET /api/chanjet/integration/probe-endpoints`
- `GET /api/chanjet/integration/account-books`
- `POST /api/chanjet/integration/account-books/refresh`
- `POST /api/chanjet/integration/probe`
- `GET /api/chanjet/integration/field-catalog`
- `GET /api/chanjet/integration/sync-jobs`
- `GET /api/chanjet/integration/master-mappings`
- `POST /api/chanjet/integration/master-mappings/:id/review`

All are protected by the existing Chanjet finance integration menu:

- View: `MENU_FIN2_AR_LEDGER:V`
- Execute probe/refresh/review: `MENU_FIN2_AR_LEDGER:E`

## Explicitly Not Implemented

- No write to Chanjet.
- No voucher push.
- No production deployment.
- No external DB write outside ERP middle-layer migration.
- No writes to procurement, sales, inventory, Store Payment, or finance business fact tables.
- No automatic approval of mappings.
- No direct connection between Chanjet data and `fin_ar_invoices`.

## First Probe Scopes

The controlled probe can sample:

- `ACCOUNT_BOOKS`
- `DEPARTMENT`
- `CUSTOMER_SUPPLIER`
- `SUBJECT`
- `PROJECT`
- `FIN_ACCOUNT`
- `PAYABLE_STATISTICS`

The default safe scope is:

- `ACCOUNT_BOOKS`
- `DEPARTMENT`
- `CUSTOMER_SUPPLIER`
- `SUBJECT`

## Validation

- API TypeScript check: PASS
- Migration down() gate: PASS
- Migration no-data-DML gate: PASS
- Nullable unique gate: PASS
- W5 closeout gate: PASS

## Current Conclusion

GO WITH CONDITIONS.

The middle-layer foundation is ready for a controlled Chanjet field sample run after migration execution and user-approved staging/production rollout. The next implementation phase should add a small admin UI for field catalog and mapping review, then run read-only probes to populate real field samples.
