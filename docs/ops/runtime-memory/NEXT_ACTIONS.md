# Next Actions

## 2026-07-30 - New-window Chanjet endpoint handoff enabled

Current stage: `CHANJET_READINESS_RUNTIME_STABLE_PROVIDER_PERMISSION_HOLD`

Decision: `HOLD`

Completed:

1. Added `docs/ops/runtime-memory/CHANJET_ENDPOINT_HANDOFF.md` as the durable
   route, authentication and fail-closed contract.
2. Made `GET /api/chanjet/integration/current-state` the mandatory first live
   probe for a new window.
3. Recorded the readiness, baseline, diagnostics, token health, readonly sync,
   alignment and exact-mapping endpoints without storing credentials.
4. Added the machine-readable handoff contract to `PROJECT_STATE.json`.

Next actions:

1. A new window reads Runtime Memory and probes `current-state` before using
   historical reports.
2. Repair provider grants for `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`.
3. Rerun only the six blocked targets after the provider permission changes.
4. Keep Chanjet external writes and ERP business-fact promotion disabled.

## 2026-07-29 - Readiness runtime stabilized; provider permission Gate is authoritative

Current stage: `CHANJET_READINESS_RUNTIME_STABLE_PROVIDER_PERMISSION_HOLD`

Decision: `HOLD`

Completed:

1. Removed full snapshot-body hydration from readiness evidence calculation.
2. Added bounded cache and in-flight coalescing for expensive readiness requests.
3. Deployed revision `64fb5558` through CI/CD run `30464528298`.
4. Verified production API/Web healthy, API restart count zero and OOM log count zero.
5. Classified all six missing targets as provider `50111` permission HOLDs.
6. Aligned production-readiness and current-state to the exact next Gate
   `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`.
7. Confirmed 79/85 targets fresh, zero stale, and no unresolved exact mapping conflicts.

Next actions:

1. Grant readonly access to `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT` for all three
   enabled books.
2. Rerun only those six targets; do not retry them before the provider grant changes.
3. Require 85/85 fresh targets before clearing the provider permission HOLD.
4. Reconcile the five non-OK finance comparisons and improve finance authority
   coverage without silently overwriting ERP business facts.
5. Keep all Chanjet external writes disabled.

Evidence:

- `docs/ops/CHANJET_READINESS_OOM_AND_PROVIDER_PERMISSION_GATE_REVIEW_20260729.md`

## 2026-07-29 - 好业财 P0-P5 代码闭环，进入策略迁移与运行审核 Gate

Current stage: `CHANJET_WMS_DOMAIN_POLICY_IMPLEMENTED_MIGRATION_PROVIDER_HOLD`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added fail-closed house-to-real-warehouse/location policy and product-specific UOM conversion policy.
2. Added administrator review APIs and usable review controls under `/finance2/chanjet-integration`.
3. Hardened token health response classification and stopped automatic retry for provider `50111` permission failures.
4. Made ERP inbound accounting mirror opt-in instead of a misleading readonly scheduler default.
5. Made finance-card API calls obey atomic permissions and made administrator panels degrade independently.
6. Replaced the stale universal `56/56` claim with a dynamic current target: 29 contracts and three books produce 85 theoretical targets.
7. Kept Chanjet external write, ERP inventory promotion, push, deploy and migration execution disabled in this batch.

Next actions:

1. Obtain explicit approval for `1785500000000-AddChanjetWmsDomainPolicies`.
2. Apply the ERP-only migration and verify both policy tables.
3. Review house/location and product/UOM policies against real ERP masters.
4. Obtain provider access for six `OTHER_STOCK_IN` / `RETAIL_STOCK_OUT` scopes.
5. Rebuild the dynamic 85-target readonly baseline and promotion candidates.
6. Keep all Chanjet external writes disabled until a separate exact canary approval.

Evidence:

- `docs/ops/CHANJET_COMPLETE_IMPLEMENTATION_LONG_TASK_PLAN_20260729.md`
- `docs/ops/CHANJET_WMS_DOMAIN_POLICY_AND_READONLY_RESILIENCE_REPORT_20260729.md`

## 2026-07-29 - 好业财 WMS 映射闭环已部署，主数据与供应商权限继续 HOLD

Current stage: `CHANJET_WMS_MAPPING_CLOSURE_DEPLOYED_PROVIDER_PERMISSION_HOLD`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Deployed revision `39e79ff3` through CI/CD run `30377709519`; production API, Web and PostgreSQL are healthy.
2. Applied `AddChanjetWmsMappingEntityType1785420000000`.
3. Refreshed all 187 WMS source identities with authenticated readonly APIs.
4. Closed 16 exact mappings and retained 171 explicit mapping gaps with zero conflicts.
5. Measured real coverage at 8.56%: warehouse 0/25, product/SKU/material 10/134 and UOM 6/28.
6. Kept six provider permission failures explicit: three `OTHER_STOCK_IN` and three `RETAIL_STOCK_OUT`, all provider error `50111`.
7. Verified `inv_batches`, `inv_ledger` and `fin_cash_accounts` fingerprints are unchanged.
8. Verified zero approved/promoted candidates, zero writeback Outbox rows and zero Chanjet external writes.

Next actions:

1. Enter `CHANJET_WMS_ERP_MASTER_DATA_GAP_CLOSURE_AND_PROVIDER_AUTHORIZATION`.
2. Add or repair same-company ERP warehouse and location masters; do not map chicken houses directly as warehouses.
3. Close product, SKU, material and live-bird model gaps using explicit evidence.
4. Define SKU-level package/UOM conversions; do not use global fuzzy conversion.
5. Obtain provider authorization for the six blocked readonly scopes and rerun only those scopes.
6. Keep promotion approval, ERP inventory mutation and all Chanjet write/delete/modify disabled.

Evidence: `docs/ops/runs/chanjet-wms-mapping-closure-runtime-20260729.json`.

## 2026-07-28 - 好业财映射源身份与 WMS 运行态验收完成

Current stage: `CHANJET_MAPPING_SOURCE_IDENTITY_DEPLOYED_WMS_RUNTIME_ACCEPTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Deployed both WMS bridge and source-identity migrations through CI/CD run `30369742061`.
2. Archived 37 deterministic stale cash-account mapping candidates and reduced duplicate source identities to zero.
3. Preserved all 49 approved cash-account mappings.
4. Refreshed 187 WMS master-data identities: 14 exact, 173 source-only and zero conflicts.
5. Generated 2,625 evidence-only promotion candidates: 2,623 `NEED_MAPPING` and two source-document `HOLD`.
6. Verified zero approved/promoted candidates, zero writeback Outbox rows and no Chanjet external write.
7. Verified ERP inventory and finance business-fact fingerprints remained unchanged.

Next actions:

1. Enter `CHANJET_WMS_MANUAL_MAPPING_CLOSURE_AND_PROVIDER_PERMISSION`.
2. Resolve warehouse, product and UOM mappings from explicit evidence; do not guess by similar names.
3. Obtain provider permissions for `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`.
4. Rerun blocked readonly scopes and regenerate promotion candidates.
5. Run A2/A1/A7 before any separately approved single-document ERP promotion canary.
6. Keep Chanjet write/delete/modify and automatic ERP inventory promotion disabled.

Evidence: `docs/ops/CHANJET_MAPPING_IDENTITY_AND_WMS_RUNTIME_ACCEPTANCE_REPORT_20260728.md`.

## 2026-07-28 - 好业财 WMS / 财务单向同步已回验

Current stage: `CHANJET_WMS_FINANCE_ONE_WAY_SYNC_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Refreshed 21 production readonly contracts; 19 passed and two provider-permission contracts stayed HOLD.
2. Verified 3,999 WMS production snapshots in the ERP middle layer.
3. Persisted 185 WMS source identities: 14 exact mappings, 171 source-only identities and zero conflicts.
4. Refreshed 49 cash accounts, 292 GL balance rows, AR/AP statistics and receipt/payment snapshots.
5. Verified the latest three-book cash/bank leaf base balance is CNY `1,634,534.07`.
6. Kept ERP inventory facts and finance transaction balances unchanged.
7. Fixed source-identity idempotency in code and added an archival deduplication migration.

Next actions:

1. Deploy the reviewed mapping source-identity migration and archive the 37 stale cash-account candidate duplicates.
2. Complete exact warehouse, product and UOM mappings before any WMS document promotion.
3. Obtain provider permissions for `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`.
4. Refresh promotion candidates and run A2/A1/A7 acceptance.
5. Keep all external Chanjet writes disabled.

Evidence: `docs/ops/CHANJET_WMS_FINANCE_ONE_WAY_SYNC_REPORT_20260728.md`.

## 2026-07-28 - 好业财 WMS 生产级实现完成，运行态保持 HOLD

Current stage: `CHANJET_WMS_PRODUCTION_GRADE_IMPLEMENTED_RUNTIME_HOLD`

Decision: `HOLD`

Completed:

1. Completed WMS inbound/outbound domain policies for purchase, sales, production, logistics, spares, office, maintenance, return, adjustment, transfer, stocktake and loss.
2. Completed canonical identity, exact master mapping, red/blue, dual-UOM and document/line reconciliation.
3. Added evidence-only promotion candidates and a dedicated WMS writeback Outbox.
4. Kept automatic ERP inventory mutation and all Chanjet external writes disabled.
5. Added administrator bridge readiness and ordinary-user source/reconciliation indicators.
6. Passed 58 API tests, 3 Web tests, API/Web TypeScript, WMS DataScope and migration gates.

Next actions:

1. Open `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT` for all three books and rerun only the six blocked scopes.
2. Run the reviewed TypeORM migration Gate; do not treat `currency_code` as deployed before that succeeds.
3. Refresh promotion candidates and resolve every real `NEED_MAPPING`, `NEED_MANUAL_REVIEW` and `HOLD`.
4. Run A2/A1/A7 runtime acceptance.
5. Keep the external WMS write endpoint absent until a separately approved single-document canary.

Evidence: `docs/ops/CHANJET_WMS_PRODUCTION_GRADE_IMPLEMENTATION_REPORT_20260728.md`.

## 2026-07-28 - Agent task-generation workspace isolation

Current stage: `AGENT_TASK_WORKSPACE_ISOLATION_V2_ACTIVE`

Decision: `GO`

Completed:

1. Replaced long-lived A1-A7 execution branches/worktrees with immutable task-generation identities.
2. Applied the same identity gate to Orchestrator, Bug Intake, generic queue, workers, direct runner, follow-up dispatch and all merge layers.
3. Made explicit release, stale lease recovery and technical redispatch allocate a new generation.
4. Quarantined dirty interrupted workspaces without reset, cleanup or reuse.
5. Rejected canonical Agent branches, legacy Bug Intake A3/A4 branches and task branches not owned by the active queue.
6. Passed 99 platform tests and real entrypoint rejection checks.
7. Added Baseline Autopilot main-authority classification so a diverged local main is
   rejected before any historical replay starts.
8. Preserved the stale July 10 local main at
   `backup/local-main-pre-authority-realign-20260728` and realigned local main to
   authoritative `origin/main` without deleting historical commits.

Next actions:

1. Keep canonical A1-A7 worktrees as read-only templates only.
2. Alert if a future task lacks `workspace_policy`, `workspace_generation`, `task_id`, or a matching branch/worktree identity.
3. Periodically archive retired and quarantined generations after their audit retention period; never reuse their identity.
4. Recompose Agent roles by capability when useful without weakening task-generation isolation.

Evidence: `docs/ops/AGENT_TASK_WORKSPACE_ISOLATION_V2.md`.

## 2026-07-28 - 好业财 WMS 完整只读基线

Current stage: `CHANJET_WMS_FULL_READONLY_BASELINE_PARTIAL`

Decision: `HOLD`

Completed:

1. Expanded the readonly inventory baseline from two document APIs to 11 official scopes.
2. Covered on-hand, lot on-hand, purchase/sales/production/other inbound and outbound, transfer, count and retail stock-out.
3. Kept all source data in the ERP middle layer; no Chanjet write and no ERP inventory-fact mutation occurs.
4. Added 33-scope freshness/row evidence and explicit reverse-sync readiness.
5. Changed the mirror runner to bounded resilient synchronization with at most three attempts.
6. Deployed the pagination correction and completed the production batch: 27/33 scopes succeeded.
7. Read 3,490 rows in the latest batch; the middle layer currently retains 3,659 entities, 2,625 documents and 9,655 lines.
8. Confirmed 100% lossless raw-mirror coverage and 98.1% ERP business-column coverage.

Next actions:

1. Enter `CHANJET_WMS_SOURCE_PERMISSION_AND_SCHEMA_CLOSURE`.
2. Obtain official API permission for `OTHER_STOCK_IN` and `RETAIL_STOCK_OUT`, then rerun only the six blocked targets.
3. Close `wms_outbound.department` and `wms_outbound.currency_code`.
4. Build exact company, warehouse, SKU/product, UOM, lot, counterparty, project and department mappings.
5. Add on-hand/batch/document reconciliation against `inv_batches`, `inv_ledger`, WMS documents and packaging facts.
6. Implement the dedicated WMS Outbox and provider write-contract preflight while external write remains disabled.
7. Allow only a separately approved single-document canary after A2/A1/A7 Gates.

Evidence: `docs/ops/CHANJET_WMS_FULL_READONLY_BASELINE_REPORT_20260728.md`.

## 2026-07-28 - WMS / 好业财库存单据只读等效

Current stage: `CHANJET_WMS_READONLY_EQUIVALENCE_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Replaced the obsolete global purchase-stock-in path with the official book-scoped endpoint.
2. Added full pagination for purchase inbound and sales outbound; no 5,000-row entity truncation remains.
3. Added canonical inbound/outbound contracts and ERP business columns for header, line, dual-UOM, tax, cost, logistics, source-order and serial evidence.
4. Added administrator-only alignment UI and reusable audit command.
5. Kept Chanjet write/delete/modify disabled and prevented readonly mirrors from changing ERP inventory.

Next actions:

1. Deploy the ERP migrations and refresh six readonly scopes across the three enabled books.
2. Verify the official purchase-inbound path has replaced all active old global scopes.
3. Capture real non-empty document samples when available; empty successful lists remain `GO_WITH_CONDITIONS`.
4. Build reconciliation candidates only after company, warehouse, product, unit and counterparty mappings are locked.
5. Keep every Chanjet write path HOLD.

## 2026-07-26 - Bug Intake HOLD queue cleared without false completion

Current stage: `QUEUE_RECOVERED_WAITING_BUSINESS_UAT`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Fixed the docs-only release barrier so the Runner no longer waits for a Security workflow that GitHub intentionally does not create for ops-only audit commits.
2. Fixed local route reconciliation so a remote report already in `FIX_READY_FOR_UAT` or `BUSINESS_VERIFIED` archives its stale local HOLD tasks.
3. Archived four stale local HOLD routes and restored the local execution queue to zero active tasks.
4. Recorded release evidence for `BUG-20260718-0004`; CI/CD run `30165198894` and production health both passed.
5. Verified the production report set contains 13 `FIX_READY_FOR_UAT`, one `BUSINESS_VERIFIED`, zero HOLD and zero `AGENT_EXECUTION_FINISHED`.
6. Kept business acceptance separate from technical completion; no report was auto-promoted to `BUSINESS_VERIFIED`.

Next actions:

1. Business-retest the 13 `FIX_READY_FOR_UAT` reports, prioritizing delivery creation, inventory outbound linkage and packaging inbound re-entry.
2. Redispatch only a report that fails its acceptance criteria; do not reactivate historical HOLD routes.
3. Keep the resident Runner active and alert on any new HOLD, stale claim, CI timeout or false-complete attempt.
4. Continue Chanjet readonly alignment independently from the Bug Intake lane.

Evidence: `docs/ops/BUG_INTAKE_HOLD_QUEUE_AND_CHANJET_OOM_CLEARANCE_20260726.md`.

## 2026-07-22 - Chanjet to ERP accounting inbound production verified

Current stage: `CHANJET_TO_ERP_ACCOUNTING_INBOUND_PRODUCTION_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Deployed the fail-closed, idempotent one-way synchronization from Chanjet `4001` facts to the ERP accounting mirror.
2. Executed production batch `722f85f4-47dd-448d-998d-656b2de4059b`: 13 source rows, 12 deterministic person mappings, one non-person `SOURCE_ONLY`, zero conflicts.
3. Verified three zero-valued `4001` parent rows are structural placeholders and retained the leaf-only condition explicitly.
4. Verified ERP legal equity and contribution ledgers are byte-stable by deterministic fingerprints.
5. Verified Chanjet writeback Outbox remains empty and all external writes remain disabled.

Next actions:

1. Let the four-hour readonly scheduler refresh the verified accounting mirror under the same fail-closed gates.
2. Reconcile the ERP legal/operational totals against the Chanjet accounting mirror without silent overwrite.
3. Keep `直营店投资` source-only until its legal ownership is separately established.
4. Keep Chanjet write/delete/modify and voucher push disabled.

Evidence: `docs/ops/CHANJET_TO_ERP_SHAREHOLDER_ACCOUNTING_INBOUND_SYNC_REPORT_20260722.md`.

## 2026-07-21 - Chanjet Wave 7 approval precheck ready

Current stage: `CHANJET_WAVE_7_APPROVAL_PRECHECK_READY`

Decision: `WAITING_EXPLICIT_APPROVAL`

Completed:

1. Added a fail-closed machine precheck for one exact external canary approval.
2. Bound approval evidence to one `PUSH_READY` voucher draft and one `READY` Outbox item.
3. Added expiry, payload hash, idempotency, dual-control, amount, readback, compensation and stop-rule checks.
4. Exposed the Gate state in the administrator integration page.
5. Kept approval persistence, external network transport and Chanjet writes disabled.

Next actions:

1. Keep Wave 7 on HOLD unless the user approves one exact canary package.
2. After a complete package passes precheck, run A2/A1/A7 pre-execution review.
3. Do not implement or execute provider transport from an incomplete or inherited approval.
4. Keep scheduled readonly alignment active.

Evidence: `docs/ops/CHANJET_WAVE7_EXTERNAL_MINIMAL_WRITE_APPROVAL_PRECHECK_REPORT_20260721.md`.

## 2026-07-21 - Chanjet Wave 6 production closeout verified

Current stage: `CHANJET_WAVE_6_WRITEBACK_PREPARATION_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Deployed `df404cec` through full CI/CD run `29795997695`; repository, API image and Web image revisions match.
2. Completed real alignment run `CHANJET-RO-1784601556414` in one attempt for 56 targets.
3. Verified 17/17 contracts, 56/56 fresh targets, 3,341 field mappings with zero blocking gaps, and 41 exact mappings with zero conflicts.
4. Verified durable restart recovery, no OOM, no API restart and no recent readonly sync failure.
5. Kept four real accounting-versus-operational differences visible and kept external Chanjet writes disabled.

Next actions:

1. Keep the four reconciliation differences visible; do not manufacture equality or overwrite ERP business tables.
2. Continue scheduled readonly alignment and runtime drift monitoring without user intervention.
3. Enter `CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL` only if one exact, reversible external canary is separately approved.
4. Until that approval, keep voucher push, external transport, Chanjet write/delete/modify and production accounting mutation disabled.

Evidence:

- `docs/ops/CHANJET_WAVE6_PRODUCTION_CLOSEOUT_20260721.md`
- `docs/ops/runs/chanjet-readonly-completion-audit-latest.json`
- `docs/ops/runs/chanjet-current-state-latest.json`

## 2026-07-21 - Chanjet Wave 6 complete; external write remains HOLD

Current stage: `CHANJET_WAVE_6_WRITEBACK_PREPARATION_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Closed the agreed readonly scope at 56/56 fresh targets and 15/15 endpoint contracts.
2. Preserved 3,341 field mappings with zero runtime blocking unmapped fields.
3. Completed book-scoped mapping, finance card authority/read-only fusion and explicit difference retention.
4. Replaced the long synchronous alignment UI call with enqueue/status polling.
5. Implemented ERP-only voucher lifecycle, dual control, payload hashing, idempotent Outbox, bounded retries, dead-letter and provider receipt/reversal simulation.
6. Kept all external write flags false and omitted the real provider write transport.

Next actions:

1. Review `docs/ops/CHANJET_EXTERNAL_MINIMAL_WRITE_APPROVAL_PACKAGE.md`.
2. Keep Wave 7 on HOLD unless one exact, reversible canary is explicitly approved.
3. If approved, run A2/A1/A7 prechecks before creating any external transport call.
4. Do not infer batch, pilot or production approval from a single canary approval.


## 2026-07-20 - Chanjet end-to-end long queue planned

Current stage: `CHANJET_END_TO_END_EXECUTION_PLANNED`

Decision: `PLAN_READY`

Program: `CHANJET-E2E-20260720`

Queue summary:

1. Ten waves and 51 dependency-linked tasks cover baseline evidence, five finance semantic locks, full authorized readonly coverage, master-data identity, ordinary ERP finance fusion, reliability, internal writeback preparation, external canary, controlled pilot and production stabilization.
2. Waves 0-6 do not write to Chanjet.
3. Wave 7 remains `HOLD_FOR_EXPLICIT_APPROVAL` and requires a separate approval naming environment, account book, document, amount, reviewer and rollback.
4. The plan queue is not live-dispatched by this planning task (`dispatch_enabled=false`).

Next actions:

1. Promote Wave 0 baseline tasks and Wave 1 finance semantic tasks into the live Agent queue.
2. Run A5/A2/A1 baseline evidence in parallel, maximum concurrency three.
3. Serialize the shared A3 authority-model consolidation after AR/AP/cash/receipt/payment analysis.
4. Keep external write, voucher push and silent ERP business-table overwrite disabled.

Artifacts:

- `docs/ops/CHANJET_END_TO_END_DEEP_DELIVERY_PLAN.md`
- `docs/ops/CHANJET_END_TO_END_EXECUTION_QUEUE.json`
- `docs/ops/CHANJET_END_TO_END_ACCEPTANCE_MATRIX.md`

## 2026-07-20 - Chanjet readonly gaps closed and minimal write precheck passed

Current stage: `CHANJET_MINIMAL_WRITE_PRECHECK_PASSED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Fixed the obsolete sales-order endpoint and verified four expanded readonly scopes in production.
2. Corrected the Chanjet master identity model from a global external ID to an account-book-scoped external ID.
3. Confirmed 90/90 deterministic master-data rows with zero pending/conflict/error; a repeated run returned 90 unchanged.
4. Passed two consecutive ERP middle-layer canaries with readback, idempotency and compensating rollback; residue is zero.
5. Deployed revisions `adec6338` and `5f3dc613`; CI/CD runs `29744366181` and `29745034623` passed.
6. Preserved five real finance differences with explicit diagnosis instead of silently overwriting either system.

Next actions:

1. Execute `CHANJET_P3_FIELD_SEMANTIC_LOCK` for AR, AP, cash, daily receipt, and daily payment differences.
2. Split evidence by book, company, currency, original/base currency, accounting/business date, status, and document identity.
3. Keep ERP operational detail explanatory while Chanjet statutory/accounting aggregates remain the finance authority.
4. Keep `CHANJET_EXTERNAL_MINIMAL_WRITE` as a separate approval Gate; it is not enabled by the ERP canary.
5. Continue showing unresolved differences explicitly; never convert non-comparable totals into fake equality.

Hard boundary: ERP middle-layer precheck has passed, but no external Chanjet write, delete, modify, or voucher push is approved.

## 2026-07-20 - Chanjet P2 master-data mapping review verified

Current stage: `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Corrected project and cash-account domain field extraction.
2. Excluded six historical provider failure envelopes without deleting production data.
3. Restored 37 deterministic cash-account exact matches and four currency exact matches.
4. Confirmed 18 non-exact candidates remain visible and conflict-free.
5. Passed 49 focused tests, API typecheck, W5 20/20, all CI workflows, production deploy, health, and authenticated audit 8/8.

Next actions:

1. Prepare `CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE` for 41 deterministic candidates.
2. Keep 12 cash-account and 6 project non-exact candidates in review; do not guess.
3. Obtain valid provider source evidence before department or subject mapping.
4. Keep Chanjet writes, voucher push, ERP business overwrite, and unapproved middle-layer confirmation disabled.

Hard boundary: an abnormal provider code plus 4xx/5xx status and request ID is a failure even when `message` is absent.

## 2026-07-20 - Chanjet receipt/payment daily authority verified

Current stage: `CHANJET_RECEIPT_PAYMENT_DAILY_RECONCILIATION_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Closed the deployment blocker caused by nine Chanjet i18n security-gate literals.
2. Deployed the daily receipt/payment authority contract.
3. Corrected historical amount debt so only target-date rows govern daily authority.
4. Passed all four CI/CD workflows and production health checks on `55dfc828`.
5. Passed authenticated production reconciliation 9/9.
6. Locked today's receipt to 0 after excluding five `SUBMITTED` rows.
7. Locked today's payment to 9,140 from two `EFFECTIVE` rows.

Next actions:

1. Execute `CHANJET_P3_CASH_BALANCE_FIELD_LOCK`.
2. Lock cash/bank account identifier, account-book scope, accounting date and balance field semantics.
3. Reconcile Chanjet cash balances against ERP auxiliary account evidence without silent overwrite.
4. Run an authenticated production audit before promoting any cash balance card.
5. Keep Chanjet writes, voucher push and ERP business overwrite disabled.

Hard boundary: historical mirror debt may be reported separately but must not corrupt a valid target-date total.

## 2026-07-20 - Chanjet finance card authority verified

Current stage: `CHANJET_FINANCE_CARD_AUTHORITY_WIRING_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Closed report endpoint parameter debt with 12/12 successful report targets.
2. Verified 46/46 readonly mirror targets fresh.
3. Locked receipt/payment direction 2/2 without amount-sign guessing.
4. Verified AR/AP primary cards use Chanjet readonly authority.
5. Verified the other six finance cards fail closed and retain ERP fallback.
6. Passed authenticated production authority audit 8/8 and full deploy run `29713655532`.

Next actions:

1. Execute `CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION`.
2. Lock provider business date, valid document status, reversal handling and daily aggregation.
3. Keep today receipt/payment cards on ERP fallback until that Gate passes.
4. Continue cash-account mapping and statement semantic Gates independently.

Hard boundary: cumulative provider totals are not today's values; Chanjet writes and voucher push remain disabled.

## 2026-07-20 - Chanjet authenticated evidence repair

Current stage: `CHANJET_AUTHENTICATED_CURRENT_STATE_DEBT_REPAIRED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Confirmed production deployment baseline `771026e8` and API health.
2. Ran an authenticated production current-state audit.
3. Identified that HTTP-200 business failure envelopes were being counted as valid mirror rows.
4. Added fail-closed business response handling and invalid-snapshot filtering.
5. Removed response metadata from financial semantic matching.
6. Fixed false pending exact-mapping counts and runtime-evidence promotion rules.
7. Added focused regression tests; 32/32 tests and API typecheck pass.

Next actions:

1. Deploy the evidence repair and rerun the authenticated production audit.
2. Execute `CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR` for GL balance, balance sheet, income statement and cash-flow reads.
3. Promote only valid runtime evidence to finance card authority.
4. Keep Chanjet write, delete, modify and voucher push disabled.

Hard boundary: never treat a success transport status as business success without validating the Chanjet response envelope.

## 2026-07-14 — Chanjet Continuous Readonly Alignment

Current stage: `CHANJET_CONTINUOUS_READONLY_ALIGNMENT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added P0-P6 production-readiness aggregation and an administrator dashboard.
2. Added resilient full readonly sync with at most three attempts; unresolved failures remain HOLD and generate alerts.
3. Added a four-hour scheduler with a PostgreSQL advisory lock and cron heartbeat monitoring.
4. Added deterministic system confirmation only for book/company + code + normalized name + ACTIVE exact matches.
5. Preserved manual review for code-only, name-only, fuzzy, ambiguous, inactive, cross-company, and conflict candidates.
6. Kept the middle-layer console under `MENU_SETTINGS_CHANJET`; ordinary business users remain unaware of integration plumbing.
7. Kept Chanjet write, delete, modify, voucher push, and silent ERP business-table overwrite disabled.

Next actions:

## 2026-07-19 - Chanjet P0-P5 runtime contract

1. `CHANJET_CURRENT_STATE_AUTHENTICATED_AUDIT`
   - After an approved deployment, capture live `/api/chanjet/integration/current-state` evidence.
2. `CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`
   - Promote only `AUTHORITY_READY` values; keep ERP details as visible auxiliary evidence.
3. `CHANJET_OPEN_RECONCILIATION_AND_FIELD_GAP_BURN_DOWN`
   - Resolve deterministic field and master-data gaps without fuzzy approval or silent overwrite.
4. `CHANJET_VOUCHER_WRITEBACK_SEPARATE_GATE`
   - Keep external writes disabled; a future Gate must separately approve credentials, idempotency, rollback and pilot scope.

Hard boundary: old `docs/ops/runs/*latest*` files are historical snapshots and cannot override the runtime current-state endpoint.

1. Deploy and run authenticated production readiness smoke.
2. Execute one resilient readonly synchronization and verify cron heartbeat / alert behavior.
3. System-confirm only deterministic exact mappings; review all remaining candidates individually.
4. Continue semantic extraction and card authority promotion until each finance metric reaches its explicit Gate.
5. Keep all Chanjet writeback on HOLD until a separately approved write Gate.

## 2026-07-13 — Chanjet P0 Production Readonly Gate Verified

Current stage: `CHANJET_P0_PRODUCTION_READONLY_GATE_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Confirmed the production account-book response uses nested `tenant.id/name`.
2. Fixed account-book cache persistence and duplicate removal.
3. Fixed `partyRoleTypeId` role classification for customer, supplier, and dual-role counterparties.
4. Replaced invalid historical ERP target names with real `sal_customers` / `prc2_suppliers` masters.
5. Added a GET-only production Gate audit script.
6. Passed 12 Chanjet unit tests and API typecheck.
7. Pushed and completed full CI/CD deploy run `29226428523`.
8. Completed authenticated production readonly run `29226762516`.
9. Verified 3/3 account books, 16/16 scopes, and 46/46 fresh book-scoped targets.
10. Generated 404 counterparty candidates: 51 matched, 353 pending, 0 conflicts, 0 unknown roles.

Next actions:

1. Enter `CHANJET_COUNTERPARTY_MAPPING_CANDIDATE_REVIEW`.
2. Review the 353 pending role-specific customer/supplier candidates against `sal_customers` and `prc2_suppliers`.
3. Preserve 0-conflict and 0-unknown-role fail-closed invariants.
4. Keep individual mapping approval explicit; do not bulk auto-approve.
5. Keep Chanjet writeback and voucher push on HOLD.

## 2026-07-08 — Chanjet Readonly Adapter Patch and Sample Review

Current stage: `CHANJET_READONLY_ADAPTER_PATCH_AUTHENTICATED_RERUN_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Patched the readonly voucher line adapter to read subject code/name from nested 好业财 `glAccount`.
2. Added readonly voucher header status inference from existing evidence fields.
3. Added `scripts/ops/chanjet-readonly-adapter-sample-review.mjs`.
4. Generated sample review artifacts:
   - `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.json`
   - `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.md`
5. Confirmed pre-patch sample semantic coverage baseline is `73.3%`.
6. Deployed the adapter patch through CI/CD.
7. Re-ran authenticated production smoke `chanjet-readonly-adapter-production`, run `28935902663`.
8. Confirmed post-patch adapter field coverage is `96.6%`.
9. Confirmed post-patch semantic coverage is `93.3%`.
10. Confirmed `CHANJET_VOUCHER_HEADER` and `CHANJET_VOUCHER_LINE` are READY.

Next actions:

1. Run `CHANJET_COUNTERPARTY_MAPPING_APPROVAL_GATE`.
2. Approve / hold customer, supplier, and current-account mapping semantics.
3. Promote voucher header / line readonly evidence to admin reconciliation views.
4. Keep ordinary finance card authority and all Chanjet write-back on HOLD until counterparty semantics are explicit.

## 2026-07-08 — Bug Intake Pipeline Closeout and Chanjet Handoff

Current stage: `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Drained the current Bug Intake Agent queue.
2. Confirmed 103 BUGTASK items are either `completed` or `COMPLETED_MERGED`.
3. Confirmed no open or running BUGTASK items remain at handoff time.
4. Confirmed the resident Bug Intake runner remains active.
5. Added queue-lane filtering and safe redispatch gates to the Bug Intake admin panel.
6. Confirmed latest CI/CD and production health are passing.

Next actions:

1. Resume Chanjet / 好业财 integration as the active implementation track.
2. Run `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`.
3. Lock voucher status, subject code/name, and counterparty mapping semantics.
4. Promote only authority-ready Chanjet fields to business-facing finance cards.
5. Keep all Chanjet writes and voucher push on HOLD until a separate approved Gate.


Last updated: 2026-07-07

## 2026-07-07 — Chanjet Readonly Adapter Authenticated Audit CI Gate

Current stage: `CHANJET_READONLY_ADAPTER_AUTHENTICATED_CI_GATE_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added GitHub Actions smoke target `chanjet-readonly-adapter-production`.
2. The target reuses the production deploy SSH/proxy path.
3. The target mints a short-lived runtime admin JWT inside the production API container.
4. The target runs `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` against `https://erp.eggslao.com/api`.
5. The target pulls `chanjet-readonly-field-adapter-audit-latest.json/md` as CI artifacts.
6. No long-lived token is stored in GitHub, docs, scripts, or runtime memory.
7. Executed workflow run `28834627546`; authenticated audit completed with real production sample evidence.

Authenticated audit result:

- decision: `GO_WITH_CONDITIONS`
- voucher header rows: `60`
- voucher line rows: `160`
- counterparty rows: `120`
- field coverage: `86.2%`
- partial adapters: `3/3`

Next actions:

1. `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`
   - Lock `voucher_status`.
   - Lock `subject_code` / `subject_name`.
   - Approve or hold customer / supplier mapping semantics.
2. Start `CHANJET_BUSINESS_FUSION_UI_PASS` only after the partial adapter conditions are cleared or explicitly displayed as non-authoritative evidence.
4. Keep `CHANJET_WRITE_BACK_HOLD`.

## 2026-07-07 — Chanjet Readonly Adapter Production Audit Gate

Current stage: `CHANJET_READONLY_ADAPTER_PRODUCTION_AUDIT_GATE_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added `fieldCoverage` to the readonly adapter API summary.
2. Updated the admin-only readonly adapter tab to show field coverage.
3. Hardened `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` with token or service-account login support.
4. Re-ran the production audit against `https://erp.eggslao.com/api`.
5. Verified fail-closed behavior: without a runtime token or service-account credentials, the audit writes a HOLD report instead of fabricating adapter evidence.

Current blocker:

- Production adapter sample audit returned `HTTP 401` because no approved runtime token or service-account login was available in the local runner environment.

Next actions:

1. `CHANJET_READONLY_ADAPTER_AUTHENTICATED_AUDIT`
   - Provide a dedicated readonly audit service account or short-lived admin token to the runner.
   - Re-run `scripts/ops/chanjet-readonly-field-adapter-audit.mjs` against production.
   - Verify voucher header / voucher line / counterparty sample rows and field coverage.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Only after authenticated audit evidence is available, wire adapter rows into reconciliation views.
   - Ordinary users still see only business-level source badges, differences, and mapping state.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet writes and voucher push until a separate approved Gate.

## 2026-07-07 — Chanjet Readonly Field Adapter Implementation

Current stage: `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/readonly-field-adapters`.
2. Implemented adapter contracts for:
   - `CHANJET_VOUCHER_HEADER`
   - `CHANJET_VOUCHER_LINE`
   - `CHANJET_COUNTERPARTY`
3. Added admin UI tab `/finance2/chanjet-integration#readonlyAdapters`.
4. Added executable audit tool `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`.
5. Kept Chanjet write/delete/modify/voucher push disabled.

Next actions:

1. `CHANJET_READONLY_ADAPTER_UI_UAT_AND_RECONCILIATION_WIRING`
   - Verify production samples for voucher header / line / counterparty adapters.
   - Wire adapter rows into reconciliation views without exposing the middle layer to ordinary users.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Show only business-level source badges, differences, and mapping states on ordinary finance pages.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet writes and voucher push until a separate approved Gate.

## 2026-07-06 — Chanjet / ERP Fusion Admin Boundary

Current stage: `CHANJET_ADMIN_BOUNDARY_LOCKED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Locked Chanjet middle-layer governance UI behind `MENU_SETTINGS_CHANJET`.
2. Updated `/finance2/chanjet-sync` and `/finance2/chanjet-integration` entry permissions so ordinary finance users do not see the middle layer.
3. Updated backend Chanjet proxy / integration-control permission constant to `MENU_SETTINGS_CHANJET`.
4. Added architecture plan:
   - `docs/ops/CHANJET_ERP_FUSION_ADMIN_BOUNDARY_PLAN_20260706.md`

Next actions:

1. `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`
   - Implement voucher line, voucher header, and counterparty readonly adapters.
2. `CHANJET_BUSINESS_FUSION_UI_PASS`
   - Keep ordinary business pages focused on business metrics, source badges, and reconciliation states; do not expose raw middle-layer details.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a separate approved Gate.

## 2026-07-06 — Chanjet Field Gap Review Gate

Current stage: `CHANJET_FIELD_GAP_REVIEW_GATE_READY`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/field-gap-review-gate`.
2. Added executable review tool `scripts/ops/chanjet-field-gap-review-gate.mjs`.
3. Converted Chanjet open high-risk fields into 7 implementation buckets.
4. Generated review artifacts:
   - `docs/ops/runs/chanjet-field-gap-review-gate-latest.json`
   - `docs/ops/runs/chanjet-field-gap-review-gate-latest.md`
5. Locked the next implementation gate as `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`.

Next actions:

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
   - Implement readonly voucher line adapter.
   - Keep voucher push forbidden.
2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
   - Implement readonly voucher header adapter.
   - Lock voucher date/status semantics.
3. `FIELD-GAP-CHANJET_COUNTERPARTY`
   - Complete customer/supplier/current-account mapping review.
4. Keep `CHANJET_WRITE_BACK_HOLD`.

## 2026-07-06 — Chanjet P0 Remote Readonly Coverage and Alignment

Current stage: `CHANJET_P0_REMOTE_READONLY_COVERAGE_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added remote readonly audit tool `scripts/ops/chanjet-remote-readonly-coverage-audit.mjs`.
2. Verified production middle-layer mirror coverage:
   - Endpoint coverage: `100%`.
   - Finance card dependency coverage: `100%`.
   - Field classification coverage: `10.9%`.
   - HIGH / CRITICAL open fields: `1348`.
3. Fixed finance AR runtime alignment so AR comparison reads `chanjet_entity_snapshots` / `AR_STATISTICS` first, with legacy `chanjet_ar_snapshot` fallback.
4. Confirmed local DB 0% coverage is a local mirror-state issue, not proof that production Chanjet mirror is empty.

Next actions:

1. `CHANJET-FIELD-GAP-REVIEW-GATE`
   - Convert HIGH / CRITICAL pending fields into ERP mapping, transform, ignore, or manual-review decisions.
2. `CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE`
   - Make future audits explicitly separate local development DB evidence from production mirror evidence.
3. `CHANJET-FINANCE-CARD-AUTHORITY-VERIFY`
   - Re-verify which finance cards may safely use Chanjet as the primary display authority.
4. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-05 — Chanjet Receipt / Payment Date Status Lock Continue

Current stage: `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Extended receipt/payment locks with system-side confirmation status.
2. Added safe query filter metadata for business date, posted date, approval status, void status, direction, and amount.
3. Explicitly kept `TODAY_RECEIPT` and `TODAY_PAYMENT` blocked from finance card primary authority.
4. Added `scripts/ops/chanjet-receipt-payment-lock-audit.mjs`.

Next actions:

1. `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT`
   - Expose subject balance and statement rows as readonly Chanjet reports with clear evidence, missing fields, and blocker reasons.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Prepare ERP voucher draft generation only; do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-05 — Chanjet Cash Balance Field Lock

Current stage: `CHANJET_P3_CASH_BALANCE_FIELD_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly API `GET /api/chanjet/integration/cash-balance-field-lock`.
2. Added `scripts/ops/chanjet-cash-balance-field-lock-audit.mjs`.
3. Locked `CASH_BALANCE` read model so Chanjet `amountSum=0` is not treated as real cash / bank balance.
4. Kept cash / bank balance card ERP-primary until raw balance fields, currency, account status, and balance date are locked.

Next actions:

1. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUE`
   - Continue locking receipt/payment business date, posted date, approval status, void status, direction, and amount semantics.
2. `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT`
   - Expose subject balance as a readonly Chanjet report with clear field coverage and blocker reasons.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card Semantic Review

Current stage: `CHANJET_P3_FINANCE_CARD_SYSTEM_CONFIRMATION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly review API `GET /api/chanjet/integration/finance-card-semantic-review`.
2. Added review audit tool `scripts/ops/chanjet-finance-card-semantic-review-audit.mjs`.
3. Generated finance card semantic review artifacts:
   - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.json`
   - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.md`
4. Generated report `docs/ops/CHANJET_P3_FINANCE_CARD_SEMANTIC_REVIEW_REPORT_20260704.md`.
5. Review result: 8/8 cards covered; system confirmation completed with 2 Chanjet authority cards, 3 Chanjet readonly report cards, 3 ERP-primary blocked cards, 0 manual finance confirmation required.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT`
   - System-side confirmation is now the authority: AR/AP can use Chanjet primary values; subject balance, balance sheet, and income statement stay Chanjet readonly; cash balance and today receipt/payment stay ERP-primary until field proof is complete.
   - Audit `/finance2` card source switching so only `SYSTEM_CONFIRMED_AUTHORITY` cards can become primary values.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Prepare ERP voucher draft generation only; still do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card System Confirmation

Current stage: `CHANJET_P3_FINANCE_CARD_SYSTEM_CONFIRMATION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added readonly system confirmation API `GET /api/chanjet/integration/finance-card-system-confirmation`.
2. Added audit tool `scripts/ops/chanjet-finance-card-system-confirmation-audit.mjs`.
3. Generated artifacts:
   - `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.json`
   - `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.md`
4. System confirmation result:
   - Chanjet authority cards: `AR_OPEN`, `AP_OPEN`.
   - Chanjet readonly report cards: `SUBJECT_BALANCE`, `BALANCE_SHEET`, `INCOME_STATEMENT`.
   - ERP-primary blocked cards: `CASH_BALANCE`, `TODAY_RECEIPT`, `TODAY_PAYMENT`.
   - Manual finance confirmation required: `0`.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT`
   - Ensure finance cards only use Chanjet primary values for system-confirmed authority cards.
   - Keep cash balance and today receipt/payment ERP-primary until actual field proof is complete.
2. `CHANJET_P3_READONLY_STATEMENT_UI`
   - Expose subject balance, balance sheet, and income statement as Chanjet readonly reports, not as fabricated ERP values.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-04 — Chanjet P3 Finance Card Diff Visual QA

Current stage: `CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

1. Added reusable QA tool `scripts/ops/chanjet-finance-card-authority-qa.mjs`.
2. Verified 8/8 finance card authority checks.
3. Verified all 8 cards are covered by the backend authority service and `/finance2/reports` UI panel.
4. Verified the UI exposes source, Chanjet readonly value, ERP auxiliary value, visible difference, and blocker reason.
5. Verified primary card switch is guarded by `AUTHORITY_READY`; receipt/payment also requires `readyForCardAuthority`.

Artifacts:

- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.json`
- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.md`
- `docs/ops/CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA_REPORT_20260704.md`

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION`
   - Lock cash/bank balance fields.
   - Lock subject balance current/initial/debit/credit/end-balance semantics.
   - Lock balance sheet and income statement row semantics.
   - Keep today receipt/payment blocked until finance confirms date/status/direction.
2. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Build ERP voucher draft generation only; do not push to Chanjet.
3. `CHANJET_WRITE_BACK_HOLD`
   - Continue forbidding Chanjet write/delete/modify/voucher push until a dedicated approved write-back Gate.

## 2026-07-03 好业财只读中间层 Phase 1

当前状态: `CHANJET_READONLY_MIRROR_PHASE1_READY`，结论 `GO_WITH_CONDITIONS`。

已完成:

1. 建立好业财只读镜像中间层表: `chanjet_read_snapshots`、`chanjet_entity_snapshots`、`chanjet_erp_field_mapping`。
2. 接入只读镜像同步 API、镜像快照查询 API、ERP 字段差异候选分析 API。
3. 前端 `/finance2/chanjet-integration` 新增“只读镜像”和“字段差异”视图。
4. 明确保持好业财只读: 不写入、不删除、不修改、不推送凭证。

下一步:

1. `CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE` — 在有效好业财 token 环境执行只读镜像同步，生成真实快照。
2. `CHANJET_FIELD_GAP_REVIEW_GATE` — 复核字段差异候选，确认 ERP 哪些字段需要补齐或映射。
3. `CHANJET_ENTITY_MAPPING_PHASE2` — 对客户、供应商、科目、项目、部门、账户、应收应付、凭证查询做分页/增量同步增强。
4. `CHANJET_WRITE_BACK_HOLD` — 未经单独批准，继续禁止向好业财写入、删除、修改或推送凭证。

## 2026-07-03 好业财只读镜像真实同步 Gate

当前状态: `CHANJET_READONLY_MIRROR_EXECUTE_WITH_RUNTIME_TOKEN_DONE`，结论 `GO_WITH_CONDITIONS`。

已完成:

1. 新增 `scripts/ops/chanjet-readonly-mirror-sync.mjs`，用于受控执行好业财只读镜像 Gate。
2. 本地 ERP DB 已创建只读镜像中间层表。
3. dry-run 报告已生成:
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`
4. 审计报告已生成:
   - `docs/ops/CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE_REPORT_20260703.md`
5. 已在生产服务器端使用短时 ERP admin Bearer token 调用受保护只读镜像同步 API。
6. 本次同步写入 ERP 中间层，不写好业财、不删除好业财数据、不修改好业财数据、不推送凭证。
## 2026-07-04 — Chanjet Finance Alignment Audit P2

本轮完成了可复跑的好业财财务对齐审计工具:

- `scripts/ops/chanjet-finance-alignment-audit.mjs`
- `docs/ops/CHANJET_FINANCE_ALIGNMENT_AUDIT_P2_REPORT_20260704.md`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.json`
- `docs/ops/runs/chanjet-finance-alignment-audit-latest.md`

最新本地只读审计结论:

1. Decision: `GO_WITH_CONDITIONS`.
2. Endpoint coverage: `0%`.
3. Finance card coverage: `0%`.
4. Field coverage: `0%`.
5. Core readonly mirror tables exist, but local mirror rows are absent.
6. `chanjet_sync_jobs` is optional local audit evidence and is currently unavailable in this database.
7. ERP finance cards must not claim Chanjet-aligned numbers unless readonly mirror evidence exists.

Next recommended Gate:

1. `CHANJET-P0-READONLY-SYNC-GAPS`.
   - Run or repair readonly sync for all default Chanjet finance scopes.
   - Keep Chanjet write / delete / modify / voucher push forbidden.
   - Rerun `scripts/ops/chanjet-finance-alignment-audit.mjs` after sync.
2. `CHANJET-P1-SYNC-JOB-AUDIT-EVIDENCE`.
   - Restore or replace sync job evidence for local/production observability.
3. `CHANJET-P1-FINANCE-CARD-SOURCE-BADGES`.
   - Keep finance cards source-labelled and mismatch-visible until coverage reaches business-accepted threshold.

---

7. 生产同步报告:
   - `docs/ops/CHANJET_READONLY_MIRROR_PRODUCTION_SYNC_REPORT_20260703.md`

同步结果:

1. 原始快照: 46。
2. 原始行数: 1956。
3. 实体镜像行数: 1846。
4. 字段差异候选: 1677。
5. HIGH 风险字段候选: 1518。

下一步:

1. `CHANJET_FIELD_GAP_REVIEW_GATE` — 已完成第一轮复核，报告见 `docs/ops/CHANJET_FIELD_GAP_REVIEW_REPORT_20260703.md`。
2. `CHANJET_FIELD_GAP_P0_REPAIR` — 先修字段分析器和实体归一化质量:
   - 剥离好业财 API envelope 字段，不作为 ERP 业务字段候选。
   - 修复应收/应付统计实体保真 key。
   - 拆分客户/供应商映射目标，避免 `mst_customers/mst_suppliers` 组合伪表名。
   - 为凭证、科目余额、三大报表建立只读镜像模型方案。
   - 状态: 已完成代码修复和本地验证，报告见 `docs/ops/CHANJET_FIELD_GAP_P0_REPAIR_REPORT_20260703.md`。
3. `CHANJET_FIELD_GAP_P0_REPAIR_DEPLOY_GATE` — 部署 P0 修复后重跑只读同步，验证 envelope 降噪、统计实体保真、客户/供应商拆分是否生效。
4. `CHANJET_ERP_SCHEMA_ADAPTATION_PLAN` — P0 修复重跑后再生成 ERP 端字段适配计划，不直接改 schema。
5. `CHANJET_WRITE_BACK_HOLD` — 继续禁止写好业财，直到用户另行批准写回 Gate。

## ⚠️ 2026-06-27 重大状态变更 — 已执行全量生产部署

用户授权下,已对 `main` 做一次 **full 生产部署**(run 28277134665, sha 6eba2829, **全绿**)。
这与本文件下方早期"不部署"基线相矛盾;以本节为准。

- 已落盘:TS 尾迁移 1782045-1782052(原子菜单 seed + 1782052 矩阵修复:删 56 条非 ADMIN 粗授予 + D3 资金子菜单),Phase C 验证通过。
- 部署链 bug 已修(workflow_dispatch detect-changes HEAD~1)。

**部署后待办(优先级序):**
1. `POST_DEPLOY_5USER_RELOGIN_SMOKE` — 王乐金/刘汉涛/财务/采购/admin 重登核 菜单·卡片·按钮·接口四向一致(清单 `docs/ops/POST_DEPLOY_5USER_SMOKE_CHECKLIST_20260627.md`)。perms_version 已 bump,在线用户须重登。
2. `W4_FRONTEND_D1_D2` — 侧菜单 requiredPerm:'V' + procurement 按钮 gating(冻结期撤回的,现可复位)。
3. `W5_ATTACHMENT_CONVERGENCE` / `W6_PROCUREMENT_APPROVER_FLOW` / `W7_CHANJET_SIGNED_SMOKE` / `W8_STORE_PAYMENT_PROD_LINE`(各自 Gate)。
4. 旧基线 Store Payment 线(下方)继续按原 Gate 推进。

---

## (历史) 早期 Next Actions — 部署前基线,保留备查

1. `USE_AGENT_INBOX_FOR_SHORT_COMMANDS`.
2. `USER_WRITES_SHORT_INTENT_TO_AGENT_INBOX`.
3. `AGENT_EXPANDS_CONTEXT_FROM_RUNTIME_MEMORY`.
4. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`.
   - Fresh read-only evidence confirms production-side Store Payment account and record tables are empty; next write must be a narrow disabled/pending account-placeholder Gate only.
5. `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - Candidate SQL and rollback SQL are prepared for exactly three disabled/inactive placeholder accounts under `STORE-VTE-001 / COMP-LAO-AGRI`.
   - Latest short-probe precheck confirmed `accounts=0`, `records=0`, `menus=5`, `STORE-VTE-001/COMP-LAO-AGRI ACTIVE`, and `grants=11`.
   - Completed with conditions: exactly three disabled/inactive placeholder accounts were inserted. Post-check confirmed `accounts_total=3`, `candidate_accounts=3`, `records_total=0`, and Store Payment `file_metadata=0`.
   - Do not activate accounts, attach QR files, or create payment records without separate Gates.
6. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`.
   - Master-data repair plan is now docs-complete: keep `STORE-VTE-001 / COMP-LAO-AGRI` canonical, keep `ST-VTE-001` as Store Payment legacy alias only, and do not perform broad auto-rewrites.
7. `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`.
   - Local Store Payment runtime already uses target `E` for write actions; remaining cleanup is a narrow future DB Gate to remove temporary Store Payment-only `C/A` grants after runtime verification.
   - Completed: removed six temporary Store Payment-only `C/A` grants. Post-check confirmed `legacy_ca_rows=0` and export remains `X`.
8. `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS`.
   - Manual scope cleanup is ready for business review: users 296, 299, and 1460 remain excluded; no automatic global/store scope grant is allowed.
   - Decision matrix is prepared under `APPROVE_MANUAL_SCOPE_USER_DECISIONS`.
9. `HOLD_UNRESOLVED_UPLOADS_MANUAL_REVIEW`.
   - Manual review matrix is prepared under `APPROVE_UNRESOLVED_UPLOADS_MANUAL_REVIEW_DECISIONS`; 59 files remain fail-closed and must not be auto-claimed.
10. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN`.
11. `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION`.
12. `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN`.
13. `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`.
   - Completed as read-only runtime-static verification; follow-up compatibility fix changes upload response `url` to protected `fileId` while keeping `rawUrl: null` and `LEGACY_PENDING`. Remaining authenticated write probe requires separate approval after deploy.
14. `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN`.
15. `APPROVE_STORE_PAYMENT_REMOTE_UAT_FIXTURE_SETUP`.
   - Remote Store Payment runtime shell is verified.
   - Latest refresh shows `store_payment_accounts=3`, all disabled/inactive, `store_payment_records=0`, and Store Payment `file_metadata=0`.
   - Business UAT remains HOLD until authenticated smoke, QR metadata fixture, or finance-confirmed account activation is separately approved.
16. `APPROVE_AUTH_COOKIE_CREDENTIAL_SMOKE`.
   - P1-006 fixed local `/store-payment` route guarding and confirmed production JWT fallback is off; cookie flags still require a credentialed login smoke after deployment.
17. `APPROVE_ROLLBACK_RESTORE_VALIDATION_FIX_GATE`.
   - P1-007 captured current runtime image IDs, but rollback readiness remains HOLD until `/opt/phoenix-erp` git ownership/safe-directory inspection, backup location, compose path, and previous known-good image evidence are proven under an A6 gate.
18. `REPAIR_PRODUCTION_SSH_EVIDENCE_CHANNEL_OR_APPROVE_ALTERNATE_EVIDENCE`.
   - Latest `PRD-P0-003` remote refresh retry after commit `8833269c` still failed with SSH banner exchange timeout / no-output hangs. Deploy-chain governance remains HOLD until remote checkout, Nginx diff, backup artifacts, compose path, and rollback evidence can be refreshed reliably.

## Recommended Immediate Sequence

1. Use Agent Inbox for short commands instead of long prompt copy/paste.
2. Review `APPROVE_STORE_PAYMENT_ACCOUNT_PLACEHOLDER_WRITE_EXECUTION`.
   - This is the next narrow production DB write candidate: three disabled/inactive Store Payment account placeholders only, with rollback SQL. Do not execute without explicit approval.
3. Keep `APPROVE_LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE` as GO WITH CONDITIONS.
   - Local compatibility fix is complete: generic upload UI now accepts protected `fileId` and blocks raw `/uploads` or `http(s)` links.
   - Production runtime-static evidence now shows the running API returns the hardened upload shape. Do not run the upload write probe unless separately approved.
4. Refresh `APPROVE_DEPLOY_CHAIN_HARDENING_DRY_RUN` remote evidence only after SSH command-level stability improves or an alternate trusted evidence channel is approved; latest retry still failed.
5. Refresh `APPROVE_INITIAL_DATA_IMPORT_REPAIR_DRY_RUN_REFRESH_OR_EXECUTION_PLAN` with SSH concurrency 1 before any execution manifest.
6. Keep `PRD-P0-002 A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` in GO WITH CONDITIONS and rerun full A1 closeout after deploy-chain and runtime verification gates.
7. Keep master data remediation separate from initial import repair.
   - P1-004 is closed as GO WITH CONDITIONS unless a future formal alias mapping Schema Gate is requested.
8. Prepare `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN` to remove Store Payment-only `C/A` compatibility after runtime action-bit alignment.
9. Keep MANUAL_REVIEW_REQUIRED users out of automatic repair.
10. Keep the 59 unresolved historical files out of scope until manual review or broader owner evidence exists.
11. Keep `/uploads` and raw URL exposure forbidden for Store Payment and legacy upload responses.
12. Do not enter Store Payment remote business UAT until a narrow UAT fixture/data setup Gate is approved and re-smoked.
13. Do not claim rollback/restore readiness until P1-007 owner-correct git status, backup evidence, compose evidence, and rollback/restore dry-run plan are complete.

## 2026-07-04 — Chanjet P0 Readonly Sync Evidence Ready

Current stage: `CHANJET_P0_READONLY_SYNC_EVIDENCE_READY`

Decision: `GO_WITH_CONDITIONS`

Evidence:

- Production readonly sync workflow run: `28702850632`
- Report: `docs/ops/CHANJET_P0_READONLY_SYNC_GAPS_EXECUTION_REPORT_20260704.md`
- Latest JSON: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
- Latest Markdown: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`

Results:

- P0 readonly endpoint coverage: `16/16`
- Field mapping coverage: `1684/1684`
- Matched mappings: `183`
- Pending semantic mapping review: `1501`

Next actions:

1. `CHANJET_P1_FINANCE_CARD_ALIGNMENT`
   - Align ERP financial dashboard/card figures to Chanjet readonly mirror口径.
   - Do not mix ERP business detail totals into financial-authority figures without a visible difference state.
2. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`
   - Review pending company/customer/supplier/project/cash-account/subject mappings.
3. `CHANJET_P3_RECONCILIATION_CENTER`
   - Build visible OK/WARN/MISMATCH/HOLD/NEED_MAPPING statuses for ERP vs Chanjet figures.

Do not start:

- Chanjet writes.
- Voucher push.
- Production DB manual writes.
- Silent overwrite of ERP figures with unmatched Chanjet mappings.

## 2026-07-04 — Chanjet P1 Finance Card Alignment Implemented

Current stage: `CHANJET_P1_FINANCE_CARD_ALIGNMENT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Finance report backend now distinguishes `covered` from `authorityEligible`.
- Finance metrics support `OK` / `WARN` / `MISMATCH` / `ERP_FALLBACK` / `NEEDS_MAPPING`.
- `/finance2/reports` now displays a Chanjet alignment panel for eight finance metrics.
- Today receipt/payment remain ERP current-day cash-flow authority until Chanjet payment business-date semantics are locked.
- Chanjet payment mirrors are comparison evidence only for now, not silent card overrides.

Evidence:

- Report: `docs/ops/CHANJET_P1_FINANCE_CARD_ALIGNMENT_IMPLEMENTATION_REPORT_20260704.md`
- API: `apps/api/src/modules/finance-v2/services/financial-reports.service.ts`
- Web: `apps/web/src/app/(admin)/finance2/reports/page.tsx`

Next actions:

1. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`
   - Build mapping review for company/account-book, customer/supplier/counterparty, project, cash account, subject, and expense type.
   - Generate confidence levels and manual-review rows.
2. `CHANJET_P3_RECONCILIATION_CENTER`
   - Surface OK/WARN/MISMATCH/HOLD/NEED_MAPPING differences between ERP operational detail and Chanjet financial authority.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until readonly coverage, mapping, and reconciliation are production-stable.

## 2026-07-04 — Chanjet P2 Master Data Alignment Audited

Current stage: `CHANJET_P2_MASTER_DATA_ALIGNMENT_AUDITED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime API: `GET /api/chanjet/integration/master-data-alignment`
- Ops runner: `scripts/ops/chanjet-master-data-alignment-audit.mjs`
- Report: `docs/ops/CHANJET_P2_MASTER_DATA_ALIGNMENT_AUDIT_REPORT_20260704.md`
- Latest outputs:
  - `docs/ops/runs/chanjet-master-data-alignment-latest.json`
  - `docs/ops/runs/chanjet-master-data-alignment-latest.md`

Results:

- Master-data mirror coverage: `100%`
- Scoped Chanjet mirror rows: `5959`
- Field mapping candidates: `1677`
- Pending semantic mappings: `1494`
- P0 domains needing review:
  1. `COUNTERPARTY`
  2. `SUBJECT`
  3. `CASH_ACCOUNT`

Next actions:

1. `CHANJET_P3_RECONCILIATION_CENTER`
   - Build visible ERP vs Chanjet rows with `OK / WARN / MISMATCH / HOLD / NEED_MAPPING`.
   - Start with AP/AR, cash account balance, subject balance, receipt/payment, and key financial statement figures.
2. `CHANJET_P2_MAPPING_REVIEW_QUEUE_UI`
   - Optional UI follow-up for reviewing P0 mapping domains.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P2/P3 are stable and separately approved.

## 2026-07-04 — Chanjet P3 Reconciliation Center Audited

Current stage: `CHANJET_P3_RECONCILIATION_CENTER_AUDITED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime API: `GET /api/chanjet/integration/finance-reconciliation`
- Ops runner: `scripts/ops/chanjet-reconciliation-center-audit.mjs`
- Report: `docs/ops/CHANJET_P3_RECONCILIATION_CENTER_AUDIT_REPORT_20260704.md`
- Latest outputs:
  - `docs/ops/runs/chanjet-reconciliation-center-latest.json`
  - `docs/ops/runs/chanjet-reconciliation-center-latest.md`

Results:

- P0 reconciliation items open: `8`
- `NEED_MAPPING`: `6`
- `NEED_MANUAL_REVIEW`: `2`
- No Chanjet write, no voucher push, no ERP business-table overwrite.

Next actions:

1. `CHANJET_P3_RECONCILIATION_CENTER_UI`
   - Surface visible rows for AR/AP, cash balance, today receipt/payment, subject balance, balance sheet, and income statement.
   - Show `OK / WARN / MISMATCH / HOLD / NEED_MAPPING / NEED_MANUAL_REVIEW` directly on the finance pages.
2. `CHANJET_P3_FIELD_SEMANTIC_LOCK`
   - Prioritize cash-account balance fields, GL balance opening/debit/credit/closing fields, and statement row amount fields.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 reconciliation statuses are reviewed and stable.

## 2026-07-04 — Chanjet P3 Reconciliation Center UI Implemented

Current stage: `CHANJET_P3_RECONCILIATION_CENTER_UI_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- UI entry: `/finance2/chanjet-integration`
- Tab: `对账差异`
- Runtime API consumed: `GET /api/chanjet/integration/finance-reconciliation`
- Report: `docs/ops/CHANJET_P3_RECONCILIATION_CENTER_UI_IMPLEMENTATION_REPORT_20260704.md`

Visible fields:

- Chanjet value.
- ERP auxiliary value.
- Difference.
- Status: `OK / WARN / MISMATCH / HOLD / NEED_MAPPING / NEED_MANUAL_REVIEW`.
- Evidence row counts and latest mirror pull time.
- Recommended action and reason.

Next actions:

1. `CHANJET_P3_FIELD_SEMANTIC_LOCK`
   - Lock cash-account balance, GL balance, balance sheet, income statement, and receipt/payment date/status semantics.
2. `CHANJET_P3_MAPPING_REVIEW_QUEUE`
   - Convert high-confidence field mappings into reviewed mapping decisions.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 has no P0 `NEED_MAPPING` / `NEED_MANUAL_REVIEW`.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
- Reusing production DB as staging DB.
- Reusing production file storage as staging file storage.
- DB writes before backup.
- further migration execution without a dedicated Gate.
- service restart before rollback plan.
- file_metadata/schema repair before migration-state audit.
- broad historical metadata backfill without explicit approval.
- actual historical metadata claim writes before a dry-run manifest is reviewed and explicitly approved.
- runtime deploy/restart of the legacy upload metadata change without a separate approved deploy or runtime verification Gate.
- rerunning live menu / role / user-scope repair except as idempotent verification or separately approved rollback/reconcile Gate.
- high-throughput write execution; high-throughput mode is read-only diagnosis/reporting only.
- deploy-chain mutation before `APPROVE_DEPLOY_CHAIN_HARDENING_PLAN`.
- executing MANUAL_REVIEW_REQUIRED user-scope rows from the dry-run package.
- executing action-bit legacy cleanup before a dedicated cleanup plan is approved.

## 2026-07-04 — Chanjet P3 Field Semantic Lock Implemented

Current stage: `CHANJET_P3_FIELD_SEMANTIC_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Runtime semantic locks are attached to `GET /api/chanjet/integration/finance-reconciliation` items.
- New readonly API: `GET /api/chanjet/integration/finance-semantic-locks`.
- UI `/finance2/chanjet-integration` now shows semantic lock status, authority eligibility, pending fields, and next action.
- Report: `docs/ops/CHANJET_P3_FIELD_SEMANTIC_LOCK_IMPLEMENTATION_REPORT_20260704.md`

Next actions:

1. `CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS`
   - Extract cash-account real balance fields from raw snapshots.
   - Extract GL balance opening/debit/credit/closing fields.
   - Extract balance sheet and income statement line amount fields.
2. Lock receipt/payment business date and approval status filters before using Chanjet values for today receipt/payment cards.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 P0 semantic pending items are closed or explicitly accepted.

## 2026-07-04 — Chanjet P3 Field Semantic Extractors Implemented

Current stage: `CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-semantic-extractors`.
- UI entry: `/finance2/chanjet-integration`, tab `语义提取器`.
- The extractor scans ERP middle-layer `chanjet_entity_snapshots.raw_data` samples and proposes field candidates for each finance reconciliation metric.
- It does not call Chanjet write APIs, does not push vouchers, and does not overwrite ERP business tables.

Next actions:

1. `CHANJET_P3_FINANCE_READ_MODEL`
   - Build a readonly finance read model from READY extractors only.
   - Keep `CASH_BALANCE`, statements, and today receipt/payment blocked until required fields are confirmed.
2. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`
   - Lock business date and approval/void status filters before using Chanjet receipt/payment values for daily cards.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until the read model is stable and reviewed.

## 2026-07-04 — Chanjet P3 Finance Read Model Implemented

Current stage: `CHANJET_P3_FINANCE_READ_MODEL_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-read-model`.
- UI entry: `/finance2/chanjet-integration`, tab `财务 Read Model`.
- Metrics are classified as `AUTHORITY_READY`, `READONLY_READY`, `BLOCKED_MAPPING`, `WAITING_SAMPLE`, `NEED_MANUAL_REVIEW`, or `HOLD`.
- Only `AUTHORITY_READY` metrics may feed primary finance cards.

Next actions:

1. `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`
   - Lock receipt/payment business date, posting date, approved status, void status, and direction semantics.
2. `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`
   - Wire only `AUTHORITY_READY` values into finance cards and keep ERP auxiliary values visible.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked.

## 2026-07-04 — Chanjet P3 Finance Card Semantic Lock Expansion Implemented

Current stage: `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-card-semantic-expansion`.
- New audit runner: `scripts/ops/chanjet-finance-card-semantic-expansion-audit.mjs`.
- Latest artifacts:
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.json`
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.md`
- Verified all 8 finance cards have readonly endpoint evidence.
- Preserved the hard guardrail that coverage is not authority.

Key decision:

- `AUTHORITY_READY` remains the only primary-card switch.
- `FIN_ACCOUNT`, `GL_BALANCE`, and statement endpoint `amountSum=0` values are not treated as real business zeroes until field semantics are locked.
- Today receipt/payment remain blocked until date/status/direction semantics are finance-confirmed.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW`
   - Use the new runtime API after deploy to inspect live per-card blockers.
   - Promote only `AUTHORITY_READY` cards.
2. `CHANJET_P3_RECEIPT_PAYMENT_FINANCE_CONFIRMATION`
   - Confirm business date, posting date, approved status, void status, direction, and amount rules.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until voucher draft/review/idempotency/rollback Gates are separately approved.

## 2026-07-04 — Chanjet P3 Receipt/Payment Date Status Lock Implemented

Current stage: `CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/receipt-payment-locks`.
- UI entry: `/finance2/chanjet-integration`, tab `收付款日期状态锁`.
- Locks required dimensions for today receipt/payment metrics: business date, posting date, approved status, void status, direction, and amount.
- Keeps finance card authority switching blocked until finance confirms these dimensions and the next wiring gate is implemented.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`
   - Wire only finance-reviewed, authority-ready values into finance cards.
   - Keep ERP auxiliary values and differences visible.
2. Finance confirms receipt/payment business date, posting date, approval/void status, and direction semantics.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until card authority wiring and review are complete.

## 2026-07-04 — Chanjet P3 Finance Card Authority Wiring Implemented

Current stage: `CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING_IMPLEMENTED`

## 2026-07-13 — Chanjet P0 Baseline / Counterparty / Book Mapping Gate

Current stage: `CHANJET_P0_BASELINE_COUNTERPARTY_BOOK_MAPPING_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. Deploy and execute the new read-only `baseline-readiness` and `account-book-mapping-gate` endpoints.
2. Preview customer/supplier counterparty candidates, then generate only `PENDING` exact-match candidates.
3. Resolve `CONFLICT`, `UNKNOWN`, and unmatched rows before approving mappings.
4. Rerun the finance Read Model authority Gate after approved mapping coverage is sufficient.
5. Keep Chanjet writeback, voucher push, and silent ERP business-table overwrite blocked.

Decision: `GO_WITH_CONDITIONS`

Implemented:

- New readonly API: `GET /api/chanjet/integration/finance-card-authority`.
- `/api/v2/finance/reports/overview` now uses Chanjet as a primary card value only when the matching read model metric is `AUTHORITY_READY`.
- `/finance2/reports` now shows card authority wiring, read model status, Chanjet value, ERP auxiliary value, and visible difference.
- Today receipt/payment remain blocked from Chanjet primary authority until finance confirms business date / posting date / approval status / void status / direction semantics.

Next actions:

1. `CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA`
   - Smoke the finance report UI and verify each card clearly shows source, status, Chanjet value, ERP auxiliary value, and difference.
2. `CHANJET_P3_RECEIPT_PAYMENT_FINANCE_CONFIRMATION`
   - Finance confirms the date/status/direction rules for receipt/payment before today cards can switch authority.
3. Keep `CHANJET_P4_WRITEBACK_PREP` blocked.

## 2026-07-04 — Chanjet P3 Finance Card Source Switch Audit

Current gate: `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT_IMPLEMENTED`.

System-enforced source switch rule:

1. `AR_OPEN` and `AP_OPEN` are the only cards allowed to use Chanjet primary values.
2. `CASH_BALANCE`, `TODAY_RECEIPT`, and `TODAY_PAYMENT` must remain ERP-primary until field/date/status/direction semantics are locked.
3. `SUBJECT_BALANCE`, `BALANCE_SHEET`, and `INCOME_STATEMENT` are Chanjet readonly report sources, not ERP operational primary cards.
4. Finance reports must show source, pulled time, ERP auxiliary value, diff, and blocker reason where applicable.

Next action:

1. `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA`
2. Verify `/finance2/reports` source badges and diff display.
3. Verify no page silently treats blocked Chanjet values as primary values.

## 2026-07-05 — Bug Intake AI Repair Pipeline V2

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. `BUG_REPORT_ADMIN_TIMELINE_UI`
   - Show user report, triage, Agent plan, queue state, worker result, local runner lifecycle, push and CI/CD result in one timeline.
2. `CI_CD_DEPLOY_CALLBACK_TO_BUG_REPORT`
   - Let remote CI/CD write deployment result back into the originating bug report when available.
3. `BUG_INTAKE_RETRY_POLICY_FOR_SAFE_UI_FIXES`
   - Add a controlled retry policy for safe A4/A1 UI-only repairs.

## 2026-07-06 — Bug Intake Pipeline V3 Resilience

Decision: `GO_WITH_CONDITIONS`

Next actions:

1. `CI_CD_DIRECT_BUG_CORRELATION_CALLBACK`
   - When a deployment can identify one or more source bug numbers, CI/CD should write `BugIntakeCICD` results directly to those reports.
2. `AUTHENTICATED_PLAYWRIGHT_POST_DEPLOY_SMOKE`
   - Upgrade HTTP route smoke to authenticated browser smoke for high-impact UI fixes.

## 2026-07-06 — Chanjet P3 Subject Balance Readonly Report

Current stage: `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Backend API: `GET /api/chanjet/integration/subject-balance-readonly-report`.
- UI entry: `/finance2/chanjet-integration`, tab `科目/报表只读`.
- Readonly report coverage: `SUBJECT_BALANCE`, `BALANCE_SHEET`, `INCOME_STATEMENT`.
- Audit artifact: `docs/ops/runs/chanjet-subject-balance-readonly-report-latest.*`.

Next actions:

1. `CHANJET_P4_VOUCHER_DRAFT_PREP`
   - Generate ERP voucher drafts from approved readonly evidence only.
   - Keep Chanjet writeback and voucher push blocked.
2. Keep finance-card primary source switches gated by explicit authority rules.
3. Continue data mapping cleanup for subject, project, cash account, counterparty, and report-line fields.

## 2026-07-20 — Chanjet Cash Balance Field Lock Verified

Current stage: `CHANJET_CASH_BALANCE_FIELD_LOCK_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

- Cash/bank balance authority now uses each enabled book's latest valid `GL_BALANCE` period and only `1001*` / `1002*` leaf rows.
- `FIN_ACCOUNT` remains directory-only and can no longer masquerade as a balance source.
- Authenticated production audit passed 12/12 with 3/3 books, 29 eligible rows, zero invalid rows and zero duplicate rows.
- The production finance report and authority card both resolve to the same readonly CNY total.
- CI/CD deploy run `29722818642` passed for `cee62b47`.

Next actions:

1. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`
2. Reconcile deterministic subject, project and cash-account mappings against the three valid account books.
3. Review ordinary-user finance fusion only after the mapping Gate passes.
4. Keep Chanjet writeback and voucher push blocked.

## 2026-07-14 — Chanjet Full Readonly Functional Closeout

Current stage: `CHANJET_FULL_READONLY_FUNCTIONAL_CLOSEOUT_IMPLEMENTED`

Decision: `GO_WITH_CONDITIONS`

Implemented:

- Complete readonly cycle: mirror sync → exact mapping → idempotent reconciliation → production readiness.
- Four-hour scheduler now runs the complete cycle under the existing advisory lock and retry policy.
- Reconciliation no longer duplicates an unchanged open issue and automatically closes issues that disappeared.
- Admin console can run and inspect the complete cycle; ordinary users remain unaware of the integration middle layer.

Next actions:

1. `CHANJET_FULL_READONLY_ALIGNMENT_PRODUCTION_VERIFY`
2. `CHANJET_NON_DETERMINISTIC_MAPPING_REVIEW` (353 pending candidates; no fuzzy auto-approval)
3. `KEEP_CHANJET_WRITEBACK_BLOCKED`

## 2026-07-23 — Chanjet Shareholder Subject Name Write Experiment

Current stage: `CHANJET_SHAREHOLDER_NAME_WRITE_EXPERIMENT_COMPLETED`

Decision: `GO`

Completed:

- Five approved `4001` child-subject aliases now use ERP-confirmed formal shareholder names.
- The official business UI force path was required because the public OpenAPI returns `result:true` without persisting used-subject renames.
- Final OpenAPI verification returned `GO`, with all five targets already matching the approved names.
- Subject IDs, hierarchy, classification, direction and balances remain unchanged.
- Routine readonly synchronization remains API-based and does not require browser login.

Next actions:

1. `CHANJET_SHAREHOLDER_4001_READONLY_RECONCILIATION_REFRESH`
2. Refresh the shareholder accounting mirror and verify that title-alias differences are eliminated.
3. Keep generic Chanjet writeback, voucher push and delete operations disabled.
4. Keep provider-admin corrections on HOLD until a durable official API contract exists; do not use browser login as a fallback.

## 2026-07-22 - Shareholder equity accounting reconciliation

Current implementation: `GO_WITH_CONDITIONS`; current business close decision: `HOLD`.

1. Approve and execute the ERP-only shareholder reconciliation migration as a separate Gate.
2. Run production read-only overview for every company/book and generate shareholder/4001 candidates.
3. Confirm only unique evidence-backed shareholder mappings and voucher-line links.
4. Resolve period, currency, direct-store investment and XINGCHI attribution differences without silently changing either source.
5. Keep Chanjet external write and voucher push disabled; Wave 7 remains a separate approval.

## 2026-07-14 — Chanjet Counterparty Autonomous Resolution

Current stage: `CHANJET_COUNTERPARTY_AUTONOMOUS_RESOLUTION_DEPLOYED`

Decision: counterparty mapping `GO`; wider readonly lifecycle `GO_WITH_CONDITIONS`.

Completed:

- 411 / 411 live customer/supplier candidates now have approved deterministic outcomes.
- 51 candidates map to unique ACTIVE ERP masters.
- 360 candidates remain isolated `SOURCE_ONLY` readonly identities.
- Live pending, conflict, unknown-role, and human-review counts are all zero.
- 72 historical CUSTOMER records with current SUPPLIER role evidence were rejected with an audit trail, not deleted.

Next actions:

1. `CHANJET_FINANCE_READ_MODEL_PROMOTION_REVIEW`
2. Promote only authority-ready readonly finance metrics with visible ERP differences.
3. `KEEP_CHANJET_WRITEBACK_BLOCKED`

## 2026-07-28 — Chanjet WMS Readonly Equivalence Deployed

Current stage: `CHANJET_WMS_READONLY_EQUIVALENCE_PRODUCTION_VERIFIED`

Decision: `GO_WITH_CONDITIONS`

Completed:

- Production revision `7606c623053705b6b9ae8b0f12a85840fdec59a9` passed CI/CD run `30321257352`.
- WMS issue-outbound governance and Chanjet-equivalent field migrations are applied.
- `STOCK_IN` and `SALES_STOCK_OUT` completed for all three enabled books: 6/6 SUCCESS.
- The current books returned zero inventory documents. Interface reachability and contracts are verified; value-level document reconciliation remains conditional.
- No Chanjet write, update, delete or voucher push was executed.

Next actions:

1. `CHANJET_WMS_REAL_DOCUMENT_VALUE_RECONCILIATION`
2. Rerun the six readonly scopes when the first real purchase stock-in or sales stock-out document exists.
3. Compare header, lines, quantity, dual UOM, tax, cost, warehouse, lot and serial values without silently changing ERP inventory facts.
4. `KEEP_CHANJET_WRITEBACK_BLOCKED`
# Agent workspace lifecycle

1. Use task-generation-isolated workspaces for every new Agent task.
2. Observe the first resident-runner redispatch and verify g1 is retired before g2 starts.
3. Remove remaining display-only references that describe canonical Agent worktrees as execution locations.
4. Keep canonical worktrees clean as templates; never merge task commits from them.

## 2026-07-30 — 好业财 WMS / 银行账户同步下一 Gate

当前真实状态：

- 好业财 WMS 已进入只读中间层：27/33 目标新鲜、4,242 行、2,685 张单据、9,930 条明细。
- WMS 字段模型覆盖 100%，但主数据映射仅 16/187（8.56%），ERP 库存业务台账晋升仍为 0。
- 好业财银行账户目录 49 条，37 条已映射（75.51%）；好业财 CNY 本位币余额为 1,634,534.07。
- ERP 42 个 ACTIVE 账户的原币余额不能跨 CNY/LAK/THB/USD 直接求和后与 CNY 本位币比较。
- ERP → 好业财仅有 Outbox/状态机准备，真实外部传输仍禁用。

顺序执行：

1. `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`
2. `CHANJET_BANK_BALANCE_COMPARABILITY_FIX`
3. `CHANJET_WMS_AND_BANK_MASTER_MAPPING_CLOSURE`
4. `CHANJET_WMS_OPENING_BALANCE_CANARY_PRECHECK`
5. `CHANJET_WMS_INCREMENTAL_INBOUND`
6. `CHANJET_BANK_ACCOUNT_READ_MODEL_ALIGNMENT`
7. `CHANJET_BIDIRECTIONAL_SINGLE_DOCUMENT_CANARY_PRECHECK`

执行边界：

- 不把 2,685 张历史单据直接重放进 ERP。
- 先用即时库存建立期初，再从水位点以后增量同步。
- 任何库存写入必须走 ERP WMS 统一服务。
- 不直接写银行余额；ERP 出站只允许审批后的业务单据/凭证。
- 未经单据级批准，不执行好业财外部写入。

## 2026-07-30 — 好业财现金余额口径与 WMS 权限阻断整改

已完成：

- 禁止好业财 CNY 本位币余额与 ERP 多币种原币总和直接求差。
- ERP 现金账户改为按 CNY / LAK / THB / USD 分币种辅助展示。
- reconciliation、read model、card authority 三层统一使用可比性标记。
- 六个 `50111` Scope 标记为不可自动重试，页面只允许“授权后复检”。

下一步：

1. `OPEN_CHANJET_OTHER_STOCK_IN_AND_RETAIL_STOCK_OUT_READONLY_PERMISSIONS_FOR_THREE_BOOKS`
2. `RERUN_ONLY_SIX_PROVIDER_BLOCKED_TARGETS_AND_REQUIRE_85_OF_85_FRESH`
3. `CHANJET_WMS_AND_BANK_MASTER_MAPPING_CLOSURE`
4. `CHANJET_WMS_OPENING_BALANCE_CANARY_PRECHECK`
5. `KEEP_CHANJET_EXTERNAL_WRITE_AND_ERP_INVENTORY_PROMOTION_BLOCKED`

## 2026-07-29 - Chanjet WMS ERP master-data gap closure

Current stage: `CHANJET_WMS_MASTER_GAP_CLOSURE_PRODUCTION_VERIFIED_PROVIDER_HOLD`

Decision: `GO_WITH_CONDITIONS`

Completed:

- All 171 open WMS source identities now have a domain class, risk and executable next action.
- Chicken houses cannot be mapped directly to warehouses.
- Egg products require SKU targets; material identities require MATERIAL targets.
- Livestock and package/context UOM mappings fail closed until their policies exist.
- Provider permission failures can be retried through the readonly resilient sync only.
- Production revision `f1c6568a` passed full CI/CD run `30410308259`.
- Production API rejected house-to-warehouse mapping with HTTP 400 before any write.
- The provider readonly retry confirmed six `50111` permission failures and no external or
  ERP business-table write.

Next actions:

1. `CHANJET_WMS_ERP_MASTER_STAGING_AND_HOUSE_LOCATION_POLICY`
2. Stage evidence-backed warehouse, material and SKU candidates without fuzzy approval.
3. Define `brd_houses` to WMS warehouse/location ownership.
4. Define base UOM and product-specific package conversions.
5. Recheck the six provider scopes after provider authorization.
6. Keep Chanjet external write and ERP inventory-fact promotion disabled.
