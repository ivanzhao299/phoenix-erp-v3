# R4.3 Controlled Transactional UAT — Design and Write Gate Report

## Current gate

```text
TRANSACTIONAL_UAT_WRITE_AUTHORIZED=NO
```

This stage therefore created no production business data and called no business POST, PUT, PATCH or DELETE endpoint. The deliverables are a manifest-driven design and a preflight route inventory only.

## Run definition

| Field | Value |
|---|---|
| Run ID | `UAT-20261006-R4-6b0e3f` |
| Environment | `phoenix-prod / phoenix_erp` |
| Initiated by | `admin` |
| Repository main | `ce93bcabb3dac7a7eeb0047484dc437d65c6cf25` |
| Production deploy head | `017633c5fb0a090d7b8cda375125d1832668f304` |
| API image/revision | `phoenix-m2-api:baseline-017633c5fb0a090d7b8cda375125d1832668f304` |
| Start time | `2026-10-06T14:54:25+08:00` |
| Cleanup status | `NOT_STARTED` |

The sanitized run artifacts are in `artifacts/uat/UAT-20261006-R4-6b0e3f/`. They contain no token, cookie, password or production object identifier.

## Authenticated read-only preflight

The existing `admin` account was previously authenticated in R4.2. This design phase did not log in again. Production identity remains confirmed, API health is HTTP 200, DB is healthy, and Chanjet synchronization remains disabled. No old fixture script is used.

## Real application route inventory

The following routes were confirmed from the current API controllers. They are only eligible after explicit write authorization and a fresh authenticated preflight:

- Procurement: `POST /api/v2/procurement/requests`, `POST /api/v2/procurement/orders`, `POST /api/v2/procurement/requests/:id/convert-to-order`, `POST /api/v2/procurement/receipts`, `POST /api/v2/procurement/receipts/:id/confirm`.
- Sales: `POST /api/v2/sales/orders`, `POST /api/v2/sales/orders/:id/submit`, `POST /api/v2/sales/delivery`, `POST /api/v2/sales/delivery/:id/complete`, `POST /api/v2/sales/returns`.
- WMS: existing authenticated CRUD routes under `/api/crud/wms_inbound`, `/api/crud/wms_outbound`, `/api/crud/wms_transfer`; exact DTOs and permission checks must be revalidated before any write.
- Finance: `POST /api/v2/finance/ar/invoices`, `POST /api/v2/finance/ar/receipts`, `POST /api/v2/finance/ap/invoices`, `POST /api/v2/procurement/payments`, and cash transaction routes under `/api/v2/finance/cash`.
- Workflow: `POST /api/workflow/start` and the task transition routes under `/api/workflow/tasks/:id/*`.

The route inventory is evidence for design only. It is not authorization to call any route.

## Minimal case matrix

| Case | Planned chain | Current status |
|---|---|---|
| T01 | procurement request → approval → PO → receipt | `NOT_RUN` |
| T02 | sales order → allocation → delivery → receipt/signoff | `NOT_RUN` |
| T03 | WMS effects from T01/T02 | `NOT_RUN` |
| T04 | AR/AP/receipt/payment/cash effects from T01/T02 | `NOT_RUN` |
| T05 | workflow instance/task/action lifecycle | `NOT_RUN` |

The order is T01 → T02 → T03 → T04 → T05. Each future write must be followed immediately by an authenticated GET and a read-only database verification. Any P0/P1 defect, cross-company access, inventory inconsistency, cash mismatch or duplicate posting stops the run.

## Cleanup contract design

Every future object must be recorded by module, entity type, primary key, business number, company/store/warehouse/project, parent root, creation time and actor. The cleanup graph classifies transaction descendants as `DELETE_ON_UAT_CLEANUP`, derived balances as `RESET_DERIVED`, audit/operation/security evidence as `RETAIN_ARCHIVE`, masters as `KEEP_MASTER`, and any external effect as `EXTERNAL_SIDE_EFFECT`.

The graph is created alongside each future root object; cleanup is not performed in R4.3. SYSTEM_ALERT rows remain outside the business cleanup graph as approved regenerable system runtime.

```text
T01_PROCUREMENT=NOT_RUN
T02_SALES=NOT_RUN
T03_WMS=NOT_RUN
T04_FINANCE=NOT_RUN
T05_WORKFLOW=NOT_RUN
CREATED_ROOT_OBJECTS=0
CREATED_TOTAL_TRACKED_OBJECTS=0
INVENTORY_ASSERTION=NOT_RUN
FINANCE_ASSERTION=NOT_RUN
DATASCOPE_ASSERTION=DESIGN_READY
UNEXPECTED_SIDE_EFFECTS=0
P0_DEFECTS=0
P1_DEFECTS=0
P2_DEFECTS=0
IOT_ALERT_BUSINESS_REVIEW=PENDING
TRANSACTIONAL_HUMAN_UAT=NOT_STARTED
CLEANUP_MANIFEST_READY=YES_DESIGN_ONLY
NEXT_ACTION=AWAIT_EXPLICIT_TRANSACTIONAL_UAT_WRITE_AUTHORIZATION
```
