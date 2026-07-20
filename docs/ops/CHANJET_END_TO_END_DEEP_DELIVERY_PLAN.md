# Chanjet End-to-End Deep Delivery Plan

Date: 2026-07-20

Program ID: `CHANJET-E2E-20260720`

Decision: **PLAN_READY**

Machine queue: `docs/ops/CHANJET_END_TO_END_EXECUTION_QUEUE.json`

Acceptance matrix: `docs/ops/CHANJET_END_TO_END_ACCEPTANCE_MATRIX.md`

## 1. Program objective

Complete the Chanjet integration as one governed delivery program instead of a sequence of disconnected patches. The finished system must:

1. Mirror every authorized and readable Chanjet domain into the ERP integration layer without modifying Chanjet.
2. Preserve complete source payloads and field catalogs while exposing normalized, typed ERP read models.
3. Lock the accounting meaning, dimensions, date rules, status rules and authority source for every finance metric.
4. Map ERP companies, counterparties, departments, projects, cash accounts, currencies and subjects to account-book-scoped Chanjet identities.
5. Make ordinary ERP users consume finance data without seeing the integration plumbing.
6. Show source, freshness and differences explicitly; never silently overwrite or fabricate equality.
7. Operate continuously with token health, rate limiting, retry, idempotency, drift detection, alerts and replay.
8. Prepare a controlled writeback path, but keep all external Chanjet writes disabled until a separate explicit approval Gate.

## 2. Confirmed baseline

The queue starts from the following verified state and must not redo it as fresh implementation work:

- Three account books are available through authenticated production readonly evidence.
- The readonly mirror has reached `46/46` fresh targets for the current catalog.
- Four expanded scopes are working: sales orders, purchase applications, stock-in and sales stock-out.
- Deterministic master review is `90/90`: 41 exact ERP matches and 49 approved source-only identities.
- Subject references: 919. Counterparty source-only identities: 371. Mapping conflicts: 0.
- Account-book-scoped mapping identity is deployed.
- Two ERP integration-layer canaries passed readback, idempotency and compensating rollback with zero residue.
- Chanjet external write, delete, modify and voucher push remain disabled.

## 3. Real open problems

The program is not complete while any of these remain unresolved:

1. `AR_OPEN` and `AP_OPEN` compare different grains and lifecycles.
2. `CASH_BALANCE` still needs a full book/company/currency/account/date semantic lock.
3. `TODAY_RECEIPT` and `TODAY_PAYMENT` need durable document identity, status, reversal and date contracts across all books.
4. Subject balance, balance sheet, income statement, cash flow and voucher list are readonly Chanjet reports without an ERP statutory peer.
5. Ordinary finance pages are not yet fully governed by one source/fallback/difference contract.
6. The authorized endpoint catalog can change; the current `46/46` target count is not permanent proof of full coverage.
7. Readonly reliability needs a measured soak period, induced-failure recovery and stale-backlog proof.
8. Writeback preparation exists only as internal drafts and canaries; external write credentials, approvals and rollback are not approved.

## 4. Non-negotiable boundaries

- Chanjet remains read-only through Waves 0-6.
- No Chanjet create, update, delete, voucher push or callback-side mutation is allowed before Wave 7 approval.
- No ERP business table may be silently overwritten by Chanjet aggregate data.
- `fin_ar_invoices` must never receive Chanjet aggregate receivable rows.
- Financial totals are never compared across unmatched books, companies, currencies, dates, statuses or document identities.
- Fuzzy master-data matches cannot be auto-approved.
- Ordinary users must not see the Chanjet integration console, raw payloads, tokens or provider diagnostics.
- Schema and migration work is serialized behind a Schema Gate.
- Production deploy, migration and external write each retain an independent approval and rollback Gate.

## 5. Delivery waves

### Wave 0 - Baseline freeze and evidence refresh

Freeze the endpoint catalog, enabled books, current revision, tokens, schedules, permissions and known exceptions. A1, A2 and A5 run in parallel after the orchestrator publishes the frozen contract.

Exit criteria:

- Authenticated current-state evidence is fresh.
- Enabled books and authorized endpoint catalog are enumerated.
- The readonly/write credential boundary is explicit.
- No unresolved transport/business-envelope failure is counted as valid data.
- The five semantic differences have reproducible row-level evidence.

### Wave 1 - Finance semantic lock

Resolve the five real differences by explicit dimensions. AR/AP retain Chanjet accounting aggregates as financial authority and ERP invoices/orders as explanatory detail. Cash is split by account book, ERP company, account, currency, original/base currency and balance date. Daily receipts/payments use effective document identity, business/accounting date, status and reversal rules.

Exit criteria:

- Every metric publishes source, dimensions, included statuses, excluded statuses, date field, amount field and aggregation rule.
- Each mismatch becomes `OK`, an accepted explained difference, or a named `HOLD`; no unexplained P0 difference remains.
- A2 confirms no cross-company or cross-book leakage.
- A1 focused tests and typecheck pass.

### Wave 2 - Full authorized readonly coverage

Discover and mirror every currently authorized readable scope, rather than treating a hard-coded count as permanent completeness. Coverage includes account books, subjects, counterparties, departments, projects, cash accounts, receivables, payables, receipts, payments, vouchers and lines, statements, purchase/sales documents and stock movements where the provider exposes them.

Exit criteria:

- Endpoint catalog coverage is 100% for discovered authorized readonly endpoints.
- Pagination, empty-result, rate-limit and business-failure envelopes are tested.
- Raw payload, normalized payload and field catalog are traceable by book and sync job.
- Unknown fields are captured and reported without breaking existing adapters.
- Missing/unsupported provider domains are recorded explicitly, not fabricated.

### Wave 3 - Master-data identity closure

Complete account-book-scoped mappings for company/book, customer/supplier, department, project, cash account, currency, subject/expense type, warehouse and product references needed by readonly reconciliation or future writeback.

Exit criteria:

- Required P0 mappings have no ambiguity or conflict.
- Deterministic auto-confirmation is at least 90%; all remaining candidates have an explicit reason and owner.
- Duplicate names/codes and inactive identities are fail-closed.
- Source-only identities remain readonly and cannot become write targets.
- Mapping changes are audited and reversible.

### Wave 4 - ERP finance fusion

Make the ERP ordinary-user experience consume governed finance read models. The middle layer remains administrator-only. Finance cards, ledgers, statements, voucher views and reconciliation pages show authority source, freshness and variance.

Exit criteria:

- AR, AP, cash, daily receipt, daily payment, subject balance and statutory statement views expose a consistent source contract.
- Chanjet-ready values are primary; ERP operational detail remains drill-down evidence.
- Differences are visible and explainable.
- RBAC and DataScope restrict company/book/account data.
- Chinese, English and Lao labels pass i18n checks.
- Desktop and mobile smoke tests pass.

### Wave 5 - Production reliability and observability

Harden token lifecycle, scheduler locks, bounded retry, rate limiting, replay, stale detection, drift alerts and operator workflows.

Exit criteria:

- A 24-hour readonly soak has no duplicate mirror rows and no stuck jobs.
- Token expiry, provider 429/5xx and malformed business envelopes recover or enter visible HOLD.
- Freshness SLO and alert-to-human delivery are measured.
- Field and endpoint drift create actionable alerts.
- Manual replay is idempotent and scoped.
- Integration health is visible to administrators without exposing secrets.

### Wave 6 - Writeback preparation, external write still disabled

Build the internal outbox and voucher candidate lifecycle: draft, validate, review, approve, push-ready, sending, acknowledged, failed, retryable, reversed and cancelled. Validate balanced entries, mapping completeness, periods, currency and duplicate identity.

Exit criteria:

- Contract tests and a local/provider-stub simulator cover success, duplicate, timeout, rejection and compensating reversal.
- Read and write credentials are separated.
- Dual approval and immutable audit evidence are required.
- Idempotency keys and provider receipts are durable.
- `PUSH_READY` remains an internal state and cannot call Chanjet.

### Wave 7 - External minimal-write approval Gate

This wave is deliberately `HOLD_FOR_APPROVAL`. It may run only after the user approves the exact environment, book, document type, amount, reviewer, rollback and time window.

Exit criteria:

- One approved canary is written, read back, duplicate-retried and compensated or reversed according to the approved method.
- No residue or duplicate financial effect remains.
- A2, A1 and A7 all pass.
- A failed canary stops the program before controlled pilot rollout.

### Wave 8 - Controlled staging/pilot rollout

Limit execution to approved books, companies, roles and document types. Require manual approval for every write and daily reconciliation.

Exit criteria:

- Staging and controlled-pilot runbooks pass.
- Business UAT covers creation, approval, push receipt, duplicate prevention, rejection and reversal.
- No unauthorized company, book, role or document type can write.
- Daily reconciliation has no unexplained financial difference.

### Wave 9 - Production rollout and stabilization

Use gradual enablement with rollback toggles and 7/14/30-day observations. Production release remains an A7 and user GO decision.

Exit criteria:

- Release metrics, incident runbooks and rollback paths are verified.
- No P0/P1 open defect, unresolved mapping conflict or stale sync exists.
- Thirty-day reconciliation meets the agreed SLO.
- Final closeout documents the source of truth for every finance domain.

## 6. Parallel execution policy

1. Maximum planned concurrency is three.
2. A1, A2 and A5 readonly evidence tasks may run together.
3. AR, AP, cash, receipt and payment analysis may run concurrently only when they do not edit the same service file. Shared service refactors are serialized through A3.
4. A3 and A4 may run together only after the API contract is frozen and their paths remain `apps/api/**` and `apps/web/**` respectively.
5. Any migration/entity/table/column task is serialized and requires Schema Gate approval.
6. A6 produces deployment/runback instructions; it does not deploy without approval.
7. A7 renders GO/HOLD/ROLLBACK; it does not release by itself.
8. Any external write, production migration, production deploy or push is a separate Gate even if its predecessor passes.

## 7. Agent ownership

| Agent | Primary ownership |
| --- | --- |
| Codex-Orchestrator | Contract freeze, dependency graph, queue state, evidence aggregation and Gate decisions |
| A1-CI-Runtime-Gate | Typecheck, unit/contract/integration tests, migration gates, build, runtime and soak verification |
| A2-Security-Regression-Gate | Token secrecy, callback signature, RBAC, DataScope, audit, external-write and financial-risk review |
| A3-Backend-Critical-Path | Adapters, normalizers, semantic contracts, mappings, reconciliation, scheduler, outbox and writeback code |
| A4-Frontend-UIUX-UAT | Ordinary finance views, admin integration console, difference UX, responsive design and UAT |
| A5-Data-Readiness | Book/company/master evidence, mapping quality, fixtures, source completeness and reconciliation data readiness |
| A6-Staging-Deploy-Runbook | Environment matrix, deploy/migration order, rollback and operator runbooks |
| A7-Final-QA-Gate | Wave exit decisions, controlled-pilot acceptance and production GO/HOLD/ROLLBACK |

## 8. Queue activation rules

- The JSON queue is a planning queue and has `dispatch_enabled: false`.
- Waves 0-6 may be promoted to the live Agent queue after one execution approval for this program.
- Wave 7 and later cannot inherit that approval. Each external-write/deploy Gate needs its own explicit approval.
- A task becomes `READY` only when every `depends_on` task is complete and its Gate conditions are satisfied.
- A failed or incomplete evidence Gate moves dependent tasks to `HOLD`, never to fake completion.
- Same-file conflicts, missing result fields or unverified runtime evidence also cause HOLD.

## 9. Definition of complete

The Chanjet program is complete only when all of the following are true:

1. Authorized readonly endpoint coverage is 100% of the discovered catalog for every enabled account book.
2. Required field capture is 100%; semantic coverage is at least 95%, with every remainder explicitly unsupported or non-authoritative.
3. Five P0 finance differences are resolved or accepted with a stable, visible explanation; unexplained count is zero.
4. Required master mappings have zero conflict and zero ambiguous auto-confirmation.
5. Ordinary ERP finance views use governed authority/fallback/difference contracts and pass role/DataScope tests.
6. A 24-hour soak passes freshness, retry, idempotency, alert and replay criteria.
7. Internal writeback preparation passes simulator and audit tests while external write remains disabled.
8. Any external canary, pilot or production release passes its own explicit Gate and rollback proof.
9. API/Web typecheck, focused tests, security gate, migration gate and W5 closeout gate pass.
10. Runtime Memory, task board, operator runbooks and final reconciliation evidence are current.

## 10. Immediate execution slice

The first executable slice is Waves 0-1:

1. Refresh authenticated evidence and freeze the current endpoint/book/field baseline.
2. Produce row-level evidence for AR, AP, cash, receipt and payment.
3. Lock their semantic contracts and update tests.
4. Run A2 security/DataScope review and A1 validation.
5. Promote only verified metrics; keep every unresolved item visible and fail-closed.

No external Chanjet write is included in this slice.
