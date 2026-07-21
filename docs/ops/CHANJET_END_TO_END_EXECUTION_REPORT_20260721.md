# Chanjet End-to-End Execution Report

Date: 2026-07-21

Program: `CHANJET-E2E-20260720`

Decision: `GO_WITH_CONDITIONS`

External Chanjet write decision: `HOLD_FOR_EXPLICIT_APPROVAL`

## Delivered Scope

1. Readonly coverage is complete for the agreed accounting and business-document scope: 56/56 fresh mirror targets and 17/17 completion contracts.
2. Field capture contains 3,341 mappings with zero runtime blocking unmapped fields. Reviewed adapter differences remain visible but no longer masquerade as missing ERP columns.
3. Current book-scoped mapping evidence is 41/41 with zero conflicts. `book_id` is part of external identity.
4. Five authority cards and three readonly report cards expose source, freshness and difference state.
5. Four remaining finance differences are retained because ERP operational grain and Chanjet accounting grain/lifecycle are not directly equal. No value is silently overwritten.
6. Manual full alignment now uses an asynchronous enqueue/status contract, avoiding false nginx 504 responses while the server continues the job.
7. Field-gap analysis preserves reviewed decisions across synchronization instead of resetting them to `PENDING`.
8. Alignment lifecycle state is durable in `chanjet_sync_jobs`; API restart recovery no longer resets an active run to `IDLE`.
9. Deployment concurrency no longer cancels an in-flight API/full deployment when a later Web-only change arrives.

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
| Alignment status disappeared after restart | Scheduler state lived only in process memory | Persisted lifecycle and restart recovery in `chanjet_sync_jobs` |
| API process exhausted V8 heap | Full alignment retained the result and immediately rebuilt the full current-state graph under a 260 MB heap | Removed duplicate aggregation, released the large result before alerting and set an explicit 320 MB heap inside the 512 MB container |
| Current-state alert SQL failed | Reused PostgreSQL parameter inferred incompatible text/enum types | Added explicit `varchar` casts |
| Later pipeline could cancel full deploy | Workflow concurrency used `cancel-in-progress: true` | Serialized deployment runs with `cancel-in-progress: false` |

## Reliability Evidence

- Scheduler uses PostgreSQL advisory lock, durable lifecycle records and maximum three attempts.
- Manual and scheduled alignment share one execution path.
- Recent runtime job success rate is 100%.
- Production alignment `CHANJET-RO-1784601556414` completed in one attempt with decision `GO_WITH_CONDITIONS` and 56 targets.
- The API remained at restart count 0, `OOMKilled=false`, and approximately 93.72 MiB memory after the full run.
- Failed business envelopes are rejected even when HTTP status is 200.
- Production repository, API image and Web image all resolve to `df404cec890e316d5f8bed96a2811960a9511c66`.
- Full CI/CD run `29795997695` passed and deployed the API and Web together.

## Validation

- Focused API tests: 82/82 PASS.
- API TypeScript: PASS.
- Web TypeScript: PASS.
- Migration `down()` gate: PASS.
- Migration no-data-DML gate: PASS.
- Nullable unique gate: PASS.
- Security regression and freeze boundaries: PASS with authorized Chanjet scope declaration.
- W5 closeout gate: PASS.
- `git diff --check`: PASS.

## Production Closeout Evidence

| Control | Result |
| --- | --- |
| Production readonly endpoint contracts | 17/17 PASS |
| Fresh mirror targets | 56/56 |
| Runtime field mappings | 3,341 total; 0 blocking unmapped |
| Exact master mappings | 41; 0 pending; 0 conflicts |
| Recent sync jobs | 100 checked; 0 failed |
| Unsafe voucher drafts | 0 |
| Unsafe writeback Outbox rows | 0 |
| External write transport | Not implemented |
| External write enabled | false |
| API restart / OOM after alignment | 0 / false |

The four open reconciliation items are AR open balance, AP open balance, cash balance, and today's payment. They remain visible because accounting aggregates and ERP operational records have different grain, lifecycle, date, account-book or currency scopes. This is intentional fail-closed behavior, not unfinished field mapping.

## Remaining Gate

Wave 7 is not inherited from any earlier approval. Before one external canary, the user must approve the exact environment, book, company, document payload, amount/currency/period, maker/reviewer/operator, execution window, readback and reversal method. Until then the system remains fail-closed.
