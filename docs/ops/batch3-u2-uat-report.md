# Batch 3 Track U2 — Isolated Business UAT

**Baseline:** `8b127efad80c799c79e7ee6285768b3b1d0a1377`  
**Environment policy:** disposable PostgreSQL 16 only; no production credentials or writes.

## Execution result

`AUTOMATED_UAT=BLOCKED_ENVIRONMENT`
`HUMAN_UAT=NOT_CONFIRMED`
`READY_FOR_BATCH3_INTEGRATION=NO`
`PRODUCTION_WRITES=0`

The U2 worktree contains no running API/Web service or disposable database endpoint. The existing U1 seed scripts were inspected and intentionally not changed or executed against an unspecified database. `scripts/seed-uat-fixture.sh` and `scripts/seed-uat-users.sh` target a database selected by environment (`DB_NAME`/`DATABASE_URL`) and require a running application/database contract; using them without an explicitly identified disposable PG16 database would violate the isolation requirement.

## Journey coverage required

| Journey | API/UI execution | DB state assertion | Result |
|---|---|---|---|
| Purchase request → approval → purchase order → receipt → AP → payment | not run | required: request/approval/order, inbound receipt, invoice and payment status/amount | BLOCKED: no isolated runtime |
| Sales order → inventory allocation → outbound → delivery → receipt | not run | required: order, reservation/ledger, outbound, delivery and receivable status | BLOCKED: no isolated runtime |
| Store collection | not run | required: POS sale/session/close and finance transaction | BLOCKED: no isolated runtime |
| Attachment permissions | not run | required: authorized download succeeds; unauthorized role is denied; no cross-company object | BLOCKED: no isolated runtime |
| Inventory query | not run | required: company/warehouse scoped rows and batch quantities | BLOCKED: no isolated runtime |
| Master data | not run | required: supplier/warehouse/company records and lifecycle state | BLOCKED: no isolated runtime |

## Fixture and identity consumption

U2 will consume the existing U1-controlled fixture and identities when an explicit disposable runtime is supplied. The inspected seeds provide UAT-prefixed business data and nine role personas, including `ROLE_STORE_MGR`, `ROLE_WMS_OP`, `ROLE_CASHIER`, and `ROLE_FIN_ACCT`; U2 does not duplicate or modify those seeds. No approved human credentials were supplied, so human acceptance cannot be claimed.

## Blocker to clear

Provide a disposable PG16 database identity (container/network, database name, credentials through environment only), the API/Web startup command or already-running service URLs, and confirmation that the U1 fixture has been applied there. U2 can then run the journeys, capture request/response evidence, and query before/after DB state in that isolated database.

## Safety evidence

* No production host or production database was contacted.
* No account was created or modified.
* No migrations or business writes were executed.
* No files outside U2-owned report artifacts were modified.

## Runtime attempt (U1 isolated environment, 2026-10-01)

U1 supplied a disposable PostgreSQL 16.14 service on host port `55437`, with API `http://127.0.0.1:33102`. The API health and readiness probes passed and reported `env=test`, `db.connected=true`, and `status=READY`. The database is `phoenix_erp_u1` inside the isolated container; no production endpoint was contacted.

A read-only baseline query returned: purchase orders `0`, sales orders `0`, AP invoices `0`, AR invoices `0`, POS sales `0`, inventory batches `45`. This confirms the service is isolated and provides a DB-state baseline.

The supplied runtime did not expose U2 an approved test password/token for the seeded users (`admin`, `test_pkg_op`, `test_qc`, `test_wh_clk`, `test_sup`). U2 therefore did not guess credentials or attempt writes. Authenticated business journeys and before/after DB assertions remain blocked at the credential handoff:

* procurement → approval → PO → receipt → AP → payment: **BLOCKED_AUTH_CREDENTIAL**
* sales → allocation → outbound → delivery → receipt → AR: **BLOCKED_AUTH_CREDENTIAL**
* store collection and attachment authorization: **BLOCKED_AUTH_CREDENTIAL**
* authenticated inventory query and master-data operations: **BLOCKED_AUTH_CREDENTIAL**

`AUTOMATED_UAT=BLOCKED_AUTH_CREDENTIAL`; `HUMAN_UAT=NOT_CONFIRMED`; `READY_FOR_BATCH3_INTEGRATION=NO`. No business mutation was executed, so post-state deltas are intentionally absent rather than inferred.

## Authenticated runtime evidence (2026-10-01)

Using the internally supplied disposable-only E2E password (not recorded here), login succeeded for `E2E_ADMIN`, `E2E_REPLENISH_MANAGER`, and `E2E_REPLENISH_WMS` against API `:33102`. Read-only probes as E2E_ADMIN returned HTTP 200 for procurement requests/orders/suppliers, sales orders/inventory batches, AP invoices, AR invoices, and active supplier/warehouse master data. Empty business collections were returned for requests, orders, sales orders, batches, AP and AR invoices; supplier and warehouse active lists returned data.

No create/approve/receive/pay/dispatch/collect/upload request was issued because the disposable database has no U2 business transaction fixture and the exact workflow payload contract requires additional approved fixture data. Consequently no DB state mutation is claimed. The authenticated read probes validate service reachability and role login only; they do not constitute business UAT.

`AUTOMATED_UAT=PARTIAL_READONLY`
`HUMAN_UAT=NOT_CONFIRMED`
`READY_FOR_BATCH3_INTEGRATION=NO`
