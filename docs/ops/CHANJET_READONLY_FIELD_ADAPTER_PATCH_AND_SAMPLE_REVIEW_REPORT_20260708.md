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
- W5 closeout gate: pending in this local gate until final validation.

## A2 Result

PASS WITH CONDITIONS.

The adapter continues to fail closed:

- nested subject extraction is readonly only.
- status inference is evidence-labeled, not a write-back status.
- ordinary finance pages must not treat counterparty mapping as approved while `mappingReviewStatus = PENDING`.
- Chanjet write and voucher push remain forbidden.

## Current Decision

GO WITH CONDITIONS.

The adapter patch is ready to deploy. After deployment, run the authenticated production audit again:

1. `chanjet-readonly-adapter-production`
2. `chanjet-readonly-adapter-sample-review`

Expected improvement:

- voucher header `status` should no longer be empty.
- voucher line `subjectCode` / `subjectName` should resolve from `glAccount`.

Counterparty role and approved customer/supplier mapping remain a separate condition and should not block readonly admin evidence, but they still block ordinary business-page authority adoption.

## Next Gate

`CHANJET_READONLY_ADAPTER_PATCH_DEPLOY_AND_AUTHENTICATED_RERUN`

After the rerun:

1. Promote voucher header / line readonly evidence to the admin reconciliation view if coverage improves as expected.
2. Keep ordinary finance card authority gated by semantic locks.
3. Continue counterparty mapping review before ordinary user adoption.
