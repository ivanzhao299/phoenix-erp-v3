# BATCH 9 INCREMENTAL PRODUCT GAP AUDIT

日期：2026-10-04（Asia/Singapore）  
审计基线：`origin/main`  5425089bcb51338d4780d6f37782440bade8b90c  
工作树：`codex/batch9-product-gap`

本轮只读审计覆盖 Finance（AP/AR/payment/reconciliation/posting）、Sales（订单/配送/退货/AR 生成）、Procurement（已批准 PO/收货/退货/付款关联）和 Store（销售/收款/日结）。WMS receiving/replenishment、价格异常、移动已办计数、门店附件 ACL、临期出库错误反馈沿用既有结论，不重复审计。未连接生产数据库，未执行生产写入。

## Master Status Board

```text
LATEST_MAIN=5425089bcb51338d4780d6f37782440bade8b90c
PRODUCTION_API_COMMIT=5425089bcb51338d4780d6f37782440bade8b90c
PRODUCTION_WEB_COMMIT=5425089bcb51338d4780d6f37782440bade8b90c

BATCH4_STATUS=CLOSED_ENGINEERING; PRODUCT_ACCEPTANCE_QUEUE_RETAINED
BATCH5_STATUS=CLOSED_ENGINEERING; PRODUCT_ACCEPTANCE_QUEUE_RETAINED
BATCH6_STATUS=CLOSED_ENGINEERING; PRODUCT_ACCEPTANCE_QUEUE_RETAINED
BATCH7_STATUS=CLOSED_ENGINEERING; PRODUCT_ACCEPTANCE_QUEUE_RETAINED
BATCH8_STATUS=CLOSURE_PENDING_UAT_REVALIDATION

PRODUCT_ACCEPTANCE_QUEUE=MOBILE_WORKFLOW_REVALIDATION:PENDING; STORE_ATTACHMENT_REVALIDATION:PENDING; SALES_PRICING_REVALIDATION:PENDING; PROCUREMENT_WMS_INVENTORY_CONSOLIDATED:PENDING; EXPIRY_OUTBOUND_ERROR_FEEDBACK_UAT:PENDING

SKU_LEGACY=WAITING_READ_ONLY_DB_EVIDENCE
STORE_EXPORT=WAITING_BUSINESS_DECISION
EXPIRY_PROMOTION=AWAITING_BUSINESS_DECISION

OPEN_P0=0
OPEN_P1=0
OPEN_P2=0

BATCH9_AUDIT=COMPLETE_WITH_TWO_CONFIRMED_GAPS
BATCH9_TRACK=TRACK_A_AR_DATASCOPE; TRACK_B_RECEIPT_INTEGRITY
NEXT_ACTION=RUN_FOCUSED_REGRESSION_AND_FULL_VERIFY; THEN_RELEASE_TRACKS_SERIALLY
```

Batch 8 Engineering is closed. `EXPIRY_OUTBOUND_ERROR_FEEDBACK` is released and its automated contract evidence exists, but `EXPIRY_OUTBOUND_ERROR_FEEDBACK_UAT` remains pending until a business user completes the success, controlled failure, and retry scenarios. No Batch 8 engineering scope is expanded here.

## Product Acceptance Queue

Human acceptance and automated evidence are separate. A human row remains `PENDING` until the relevant business role explicitly confirms it; automated PASS does not change that state.

| Scenario | Role | Environment | Expected | Actual | Result | Business comment |
|---|---|---|---|---|---|---|
| UAT-A Mobile Workflow | Normal business approver | Approved UAT | Correct done count, API `total` when healthy, historical-row/`total=0` behavior, refresh/pagination, usable role | Not executed in this track | `PENDING` | Business confirmation required |
| UAT-B Store Payment Attachment | Authorized store/finance user | Approved UAT | View plus preview/download, clear page errors; no production unauthorized probing | Not executed in this track | `PENDING` | Isolation ACL automation remains the security evidence |
| UAT-C Sales Price Anomaly | Sales manager | Approved UAT | Tab, threshold, refresh, anomaly/below-floor result, empty state, business error and permission behavior | Not executed in this track | `PENDING` | Threshold semantics require sales confirmation |
| UAT-D Procurement/WMS/Inventory journey | Procurement and warehouse roles | Approved UAT | Eligible PO → receipt → inbound → inventory → stocktake/loss → replenishment → transfer → receiving → ledger; committed documents immutable | Not executed in this track | `PENDING` | One consolidated journey replaces repeated Batch 6/7 checks |
| UAT-E Expiry outbound error feedback | Warehouse/expiry operator | Approved isolated UAT | Success removes alert; controlled failure leaves alert and shows backend business error; retry clears stale error and works | Not executed in this track | `PENDING` | Do not manufacture production inventory failure |

Existing automated evidence is reported independently: the expiry feedback contract test verifies failure retention/error display and success removal (`apps/web/src/__tests__/expiry-action-feedback-contract.test.ts`); committed WMS immutability coverage exists (`apps/web/src/__tests__/wms-committed-document-immutability.test.ts`). Those results do not close the human queue.

## Confirmed Product Gap Matrix

The Batch 9 threshold was applied as four simultaneous gates: reachable, business-required, current behavior incorrect/incomplete, and real user or data impact. P1 candidates additionally affect authoritative business state and can create state divergence.

| ID | Classification | Priority | Reachable path | Evidence | Impact | Track |
|---|---|---:|---|---|---|---|
| B9-01 | `CONFIRMED_PRODUCT_GAP` | P1 | `POST /api/v2/finance/ar/invoices`, `POST /api/v2/finance/ar/receipts` | `apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:47-74,99-115` is guarded by Menu/DataScope; `ar-invoices.service.ts:34-41,84-89,173-206` and `ar-receipts.service.ts:46-53,67-73,167-195` read JWT company fields, treat empty scope as unrestricted, and accept caller company codes without ownership checks. | Creates authoritative OPEN AR invoices and DRAFT receipts outside the resolved company/project scope; canonical finance state can diverge across companies. | Track A |
| B9-02 | `CONFIRMED_PRODUCT_GAP` | P1 | Procurement receipt create/confirm API | `apps/api/src/modules/procurement-v2/services/receipts.service.ts:292-307` previously skipped missing/unknown `poItemId` while `:349-359` still posted all actual quantities to WMS; `ReceiptItemDto.poItemId` is optional for drafts (`receipt-item.dto.ts:9-11`). Create also persisted client ownership fields instead of the PO canonical values (`receipts.service.ts:221-232`). | Inventory could increase without PO received quantity/over-receipt control; PO and inventory facts could diverge, and receipt ownership/display could drift from its PO. | Track B |

P1 gate evidence for both rows: authoritative business state is affected, and the behavior can create state divergence. No double-apply or production data loss was observed; the risk is prevented at the canonical service boundary by the focused fixes in this worktree.

## Revalidation and non-gaps

| Domain | Classification | Evidence / conclusion |
|---|---|---|
| Finance AP, AR reconciliation, AR ledger/posting | `ALREADY_FIXED` / no new gap | AP uses CLS DataScope with deny-empty writable ownership; reconciliation and ledger paths are scoped and ledger is read-only. |
| Sales submitted/approved order, delivery/signoff, return, AR generation | `NOT_REPRODUCED` | State transitions, CAS/idempotence, receipt quantity checks and transactional AR generation are present. Return approval/workflow fallback is retained as `AWAITING_BUSINESS_DECISION`, not a confirmed P1 without divergence evidence. |
| Store sales, collection, daily settlement | `ALREADY_FIXED` / no new gap | POS completion, return/void and settlement posting enforce store/company scope, amount checks and idempotent state transitions. |
| Previously completed Batch 6–8 areas | `DEPRECATED` for this audit | Reused existing closure/UAT evidence; no new business evidence justified reopening those audits. |

```text
CONFIRMED_GAPS=B9-01(P1),B9-02(P1)
P0=0
P1=2 (implementation tracks in progress; OPEN_P1 remains 0 for released production)
P2=0
P3=0
NO_ACTIONABLE_PRODUCT_GAPS=NO
```

## Track plan and release gates

### TRACK_A — AR DataScope write boundary

```text
GOAL=Use resolved CLS DataScope for AR reads/writes and deny empty scope.
FILES=apps/api/src/modules/finance-v2/services/ar-invoices.service.ts; apps/api/src/modules/finance-v2/services/ar-receipts.service.ts; focused specs
TEST_PLAN=out-of-scope company create denied; empty scope denied; project scope/list/detail/allocation checks; existing receipt confirmation regression
RELEASE_GATE=API tsc 0 errors; focused AR specs PASS; no schema or production migration; full verify before release
```

### TRACK_B — Procurement receipt/PO integrity

```text
GOAL=Require every confirmed receipt item to reference an existing item of the current PO and persist PO-owned company/project identity.
FILES=apps/api/src/modules/procurement-v2/services/receipts.service.ts; receipts.service.spec.ts
TEST_PLAN=missing poItemId denied before PO/inventory writes; foreign poItemId denied; mismatched company/project denied; valid partial receipt regression
RELEASE_GATE=API tsc 0 errors; focused receipt specs PASS; no schema or production migration; full verify before release
```

### TRACK_C — Sales/Store review

```text
GOAL=Close the incremental audit without inventing a gap.
RESULT=NO_ACTIONABLE_PRODUCT_GAPS=YES for this domain
RELEASE_GATE=No implementation; retain business-decision item for return workflow only if new evidence arrives
```

```text
FILE_OVERLAP=NONE between Track A finance-v2 files and Track B procurement-v2 receipt files; shared authorization semantics reviewed serially.
SEMANTIC_OVERLAP=Both enforce ownership at canonical write boundaries, but they affect separate authoritative tables and have separate focused regressions.
FIRST_TRACK=TRACK_A
GOAL=Close cross-company AR write/read exposure with the smallest service-level fix.
TEST_PLAN=Focused AR specs → API tsc → full API/Web verify → isolated UAT queue unchanged.
RELEASE_GATE=No major business decision; no production credential dependency; no destructive migration; no conflicting UAT P0/P1.

BATCH9_AUDIT_COMPLETE=YES
READY_FOR_BATCH9_IMPLEMENTATION=YES
```

Implementation remains subject to the release gates above. Production deployment and human UAT status changes require their respective external evidence; this report does not claim either has occurred.
