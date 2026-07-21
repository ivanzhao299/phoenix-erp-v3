# Chanjet End-to-End Execution Report

Date: 2026-07-21

Program: `CHANJET-E2E-20260720`

Decision: `GO_WITH_CONDITIONS`

External Chanjet write decision: `HOLD_FOR_EXPLICIT_APPROVAL`

## Delivered Scope

1. Readonly coverage is complete for the agreed accounting and business-document scope: 56/56 fresh mirror targets and 15/15 completion contracts.
2. Field capture contains 3,341 mappings with zero runtime blocking unmapped fields. Reviewed adapter differences remain visible but no longer masquerade as missing ERP columns.
3. Current book-scoped mapping evidence is 41/41 with zero conflicts. `book_id` is part of external identity.
4. Five authority cards and three readonly report cards expose source, freshness and difference state.
5. Three remaining finance differences are retained because ERP operational grain and Chanjet accounting grain/lifecycle are not directly equal. No value is silently overwritten.
6. Manual full alignment now uses an asynchronous enqueue/status contract, avoiding false nginx 504 responses while the server continues the job.
7. Field-gap analysis preserves reviewed decisions across synchronization instead of resetting them to `PENDING`.

## Wave 6 Writeback Preparation

Implemented inside ERP only:

- voucher lifecycle: `DRAFT -> VALIDATED -> REVIEWED -> APPROVED -> PUSH_READY`;
- double-entry validation and deterministic source-business idempotency key;
- immutable payload hash before Outbox preparation;
- maker/reviewer-approver separation;
- durable `chanjet_writeback_outbox` with bounded retry, dead-letter, request/response hash, receipt and compensation reference;
- provider stub outcomes for acknowledgement, retry, rejection, cancellation and reversal;
- duplicate simulation is idempotent;
- admin UI for lifecycle review, Outbox creation and stub simulation;
- audit endpoint: `GET /api/chanjet/integration/writeback-preparation`.

Hard invariants:

- `push_allowed=false`;
- `external_write_enabled=false` at both entity and database CHECK levels;
- no provider write transport exists;
- no Chanjet write/delete/modify API was called;
- ordinary users cannot see middleware administration.

## Root Causes Closed

| Defect | Root cause | Resolution |
| --- | --- | --- |
| Mapping sync unique violation | Production uniqueness is book-scoped while upsert omitted `bookId` | Upsert conflict identity now includes `bookId` |
| Reviewed field decisions reopened | Analysis rebuilt every row with `PENDING` | Existing decision is preserved; deterministic matches default approved |
| False open field debt | Provider/nested/transform adapters were counted as absent ERP schema | Adapter-covered differences are separated from true blocking fields |
| Alignment UI showed 504 | Long synchronous request exceeded reverse-proxy timeout | Immediate 202 enqueue plus status polling |

## Reliability Evidence

- Scheduler uses PostgreSQL advisory lock and maximum three attempts.
- Manual and scheduled alignment share one execution path.
- Recent runtime job success rate is 100%.
- Historical 24-hour scheduled evidence is available; induced production fault injection remains intentionally conditional.
- Failed business envelopes are rejected even when HTTP status is 200.

## Validation

- Focused API tests: 66/66 PASS.
- API TypeScript: PASS.
- Web TypeScript: PASS.
- Migration `down()` gate: PASS.
- Migration no-data-DML gate: PASS.
- Nullable unique gate: PASS.
- Security regression and freeze boundaries: PASS with authorized Chanjet scope declaration.
- W5 closeout gate: PASS.
- `git diff --check`: PASS.

## Remaining Gate

Wave 7 is not inherited from any earlier approval. Before one external canary, the user must approve the exact environment, book, company, document payload, amount/currency/period, maker/reviewer/operator, execution window, readback and reversal method. Until then the system remains fail-closed.
