# Chanjet Authenticated Current State and Next Gate Report

Date: 2026-07-20  
Owner: Codex-Orchestrator  
Decision: GO WITH CONDITIONS

## Deployment Baseline

- Production baseline commit: `771026e8832ee113794d192703a7173f4cd34dae`
- Full deployment workflow: `29711095052`
- Workflow result: PASS
- Production API health: PASS
- Production checkout and API/Web image revisions: aligned to the baseline commit

## Authenticated Pre-fix Evidence

The authenticated production current-state audit completed at `2026-07-20T01:47:19.439Z`.

- Reported score: 58 / D
- Reported mirror freshness: 46/46 targets, 100%
- Finance authority-ready cards: 0/8
- Finance readonly-ready cards: 0/8
- Mapping-ready domains: 1/7
- Open reconciliation items: 10
- Recent job success rate: 100%
- Chanjet external writes: disabled

The 46/46 mirror result was not trustworthy. Several report endpoints returned a business-failure envelope with HTTP 200, and that envelope was stored and counted as a financial row.

## Root Causes

1. Chanjet can return business failures in an HTTP 200 response, for example `success=false`, `code=pub.e9002`, `data=null`.
2. `ChanjetAuthService.callApi` previously treated every HTTP 200 response except token expiry as success.
3. `extractRows` fell back to the response object itself, so error metadata was persisted as entity data.
4. Mirror freshness, endpoint coverage, field coverage and financial semantics then consumed those invalid rows.
5. Semantic matching included response metadata and sample values, allowing `requestId`, `msg` and `code` to become false amount candidates.
6. Deterministic mapping counts included already-approved rows as new system-approval candidates.
7. Static confirmation rules could claim report readiness without valid runtime samples.
8. Aggregate AR/AP authority was incorrectly blocked by invoice-detail fields that Good Finance does not provide and that aggregate cards do not require.

## Implemented Repair

- Added a shared Chanjet business-failure detector and fail-closed API error handling.
- Prevented failed envelopes from being extracted or persisted as mirror entities.
- Excluded historical failed envelopes from baseline, field coverage, aggregation and semantic analysis.
- Removed response metadata from financial semantic matching and required numeric evidence for numeric metrics.
- Required runtime evidence before system confirmation can promote a finance card.
- Stopped counting approved mappings as pending exact confirmations.
- Allowed aggregate AR/AP readiness to use valid aggregate evidence while preserving ERP invoice detail as auxiliary evidence.
- Routed missing report evidence to `CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR`.

## Validation

- Chanjet focused Jest suites: PASS, 32/32 tests
- API TypeScript check: PASS
- Web TypeScript check: PASS
- W5 closeout gate: PASS with explicit frozen/security review flags for the approved Chanjet module scope
- Security review: PASS WITH CONDITIONS; the change tightens fail-closed behavior and does not add credentials, callbacks or external writes
- Chanjet external write/delete/modify: not executed
- Voucher push: not executed
- Migration: not executed
- ERP or Chanjet business-data write: not executed

## Truth-first Expected Result

After deployment, mirror coverage may decrease because invalid report envelopes no longer count as data. A lower honest score is preferred to a false 46/46 result. AR/AP aggregate cards may become eligible only when their valid aggregate snapshots pass freshness and semantic checks. Balance-sheet, income-statement, cash-flow and subject-balance evidence must remain blocked until the required read-only report parameters are verified.

## Next Gate

`CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR`

Scope:

1. Capture sanitized failures for GL balance, balance sheet, income statement and cash-flow endpoints.
2. Determine the documented account-book, period and report parameter contract without guessing.
3. Re-run read-only mirror synchronization.
4. Promote only valid report rows that pass runtime semantics.
5. Keep all Chanjet writes and voucher push disabled.

## Conclusion

GO WITH CONDITIONS. The historical evidence-chain defect is repaired in code and covered by regression tests. Final production score, coverage and Gate decision must be taken from the post-deployment authenticated audit, not from the pre-fix 58/D snapshot.

## Post-deployment Gate Progression

The repair has now completed its production lifecycle:

1. Report endpoint parameter repair: 12/12 report targets successful.
2. Mirror freshness: 46/46 fresh targets, 100%.
3. Receipt/payment direction: 2/2 locks complete, with no partial lock.
4. Finance card authority: authenticated production audit 8/8 PASS.
5. AR/AP primary values use Chanjet readonly authority; six other cards remain fail-closed.
6. Full CI/CD run `29713655532` deployed commit `c756aa2d4c7ca88091928cc47b97d1dd88d199e9`; production API/Web are healthy.

The current authoritative next Gate is `CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION`. The earlier report-parameter Gate is closed and must not be restored from historical run artifacts.
