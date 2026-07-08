# Chanjet Readonly Field Adapter Patch and Sample Review

Date: 2026-07-08

## Objective

Continue the Chanjet / 好业财 readonly integration after Bug Intake queue closeout.

This gate focuses on the next blocker from `CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`:

1. Voucher header status semantics.
2. Voucher line subject code / subject name semantics.
3. Counterparty customer / supplier mapping evidence.

## Scope

Modified:

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `scripts/ops/chanjet-readonly-adapter-sample-review.mjs`
- `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.json`
- `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.md`

Not modified:

- Chanjet data.
- ERP business data.
- migrations.
- deployment configuration.

## Adapter Fix

The production sample showed that voucher line subject fields were present in nested 好业财 evidence:

- `glAccount.code`
- `glAccount.name`
- `glAccount.longName`

The previous adapter only searched flat fields such as `subjectName`, `subject.code`, and `accountName`, so the line adapter displayed `subjectCode = —` and `subjectName = —`.

The adapter now reads the nested `glAccount` fields before marking subject code/name as missing.

Voucher header status now also has a readonly inference path:

- explicit `status` / `voucherStatus` / `auditStatus` / `state` / `billStatus`
- `cancelUserId` with content -> `CANCELLED`
- `hasAdjusted = true` -> `ADJUSTED`
- `hasEditAuth = false` -> `POSTED_LOCKED`
- `hasEditAuth = true` -> `EDITABLE`

This is still readonly evidence. It does not write 好业财 or push vouchers.

## Sample Review Tool

Added:

```bash
node scripts/ops/chanjet-readonly-adapter-sample-review.mjs --output-dir docs/ops/runs
```

The tool reads the latest authenticated adapter audit artifact and produces field-level semantic coverage:

- `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.json`
- `docs/ops/runs/chanjet-readonly-adapter-sample-review-latest.md`

## Current Sample Review Result

The current local sample artifact was produced before this adapter patch was deployed. It therefore remains useful as baseline evidence:

- decision: `GO_WITH_CONDITIONS`
- semantic coverage: `73.3%`
- voucher header locked fields: `voucherId`, `voucherNo`, `voucherDate`
- voucher header open field: `status`
- voucher line locked fields: `lineNo`, `debitAmount`, `creditAmount`, `currency`
- voucher line open fields: `subjectCode`, `subjectName`
- counterparty locked fields: `externalId`, `externalCode`, `externalName`, `mappingReviewStatus`
- counterparty open field: `roleCandidate`

## Authenticated Production Rerun Result

After the adapter patch was pushed to `main`, CI/CD completed successfully and the production API health check passed.

Authenticated production smoke:

- workflow: `AI Delivery CI Smoke`
- target: `chanjet-readonly-adapter-production`
- run: `28935902663`
- result: `success`
- Chanjet write: no
- voucher push: no

Rerun adapter audit:

- decision: `GO_WITH_CONDITIONS`
- total adapters: `3`
- ready adapters: `2`
- partial adapters: `1`
- waiting sample: `0`
- hold: `0`
- voucher header rows: `60`
- voucher line rows: `160`
- counterparty rows: `120`
- field coverage: `96.6%`

Adapter readiness:

| Adapter | Status | Missing critical fields |
| --- | --- | --- |
| `CHANJET_VOUCHER_HEADER` | `READY` | none |
| `CHANJET_VOUCHER_LINE` | `READY` | none |
| `CHANJET_COUNTERPARTY` | `PARTIAL` | `approved_customer_supplier_mapping` |

Post-patch sample semantic review:

- decision: `GO_WITH_CONDITIONS`
- semantic coverage: `93.3%`
- locked fields: `14/15`
- open fields: `1/15`
- remaining open field: `counterparty.roleCandidate` / approved customer-supplier mapping semantics

The patch therefore clears the voucher header status and voucher line subject code/name blockers. The remaining Chanjet blocker is the customer / supplier / current-account mapping approval gate.

## Guardrails

- Chanjet write: no.
- Chanjet modify: no.
- Chanjet delete: no.
- Voucher push: no.
- ERP business overwrite: no.
- DB write: no.
- Migration: no.
- Deploy config change: no.

## A1 Result

- API typecheck: PASS.
- Sample review script syntax: PASS.
- Sample review execution: PASS, `GO_WITH_CONDITIONS`.
- W5 closeout gate: PASS.
- CI/CD build and deploy: PASS.
- Production health: PASS.

## A2 Result

PASS WITH CONDITIONS.

The adapter continues to fail closed:

- nested subject extraction is readonly only.
- status inference is evidence-labeled, not a write-back status.
- ordinary finance pages must not treat counterparty mapping as approved while `mappingReviewStatus = PENDING`.
- Chanjet write and voucher push remain forbidden.

## Current Decision

GO WITH CONDITIONS.

The adapter patch has been deployed and authenticated production rerun evidence confirms the voucher adapters are now READY.

Counterparty role and approved customer/supplier mapping remain a separate condition and should not block readonly admin evidence, but they still block ordinary business-page authority adoption.

## Next Gate

`CHANJET_COUNTERPARTY_MAPPING_APPROVAL_GATE`

1. Approve or hold customer / supplier / current-account mapping semantics.
2. Promote voucher header / line readonly evidence to the admin reconciliation view.
3. Keep ordinary finance card authority gated by semantic locks.
4. Continue forbidding Chanjet write-back and voucher push.
