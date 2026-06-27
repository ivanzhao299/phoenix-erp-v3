# A1 Contract: Store Payment Read-only DB Evidence Validation

Task ID: `STORE-PAYMENT-READ-ONLY-DB-EVIDENCE-A1-VALIDATION`

Assigned Agent: `A1-CI-Runtime-Gate`

## Goal

Validate the Store Payment read-only DB evidence report and run allowed ops/CI gates without modifying business code or database.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- Any schema/entity/table/column implementation file
- Any deployment or production config file

## Required Checks

1. Confirm source report exists and contains required safety fields.
2. Confirm `git status --short`.
3. Run available ops gates that do not write database or deploy, at minimum W5 closeout gate if available.
4. Confirm no forbidden files changed.
5. Decide whether the read-only evidence supports GO / GO WITH CONDITIONS / HOLD / FAIL.

## Acceptance Criteria

- Report includes commands run and results.
- Report confirms no migration, DB write, deploy, push, or business code change.
- Report states whether A5 HOLD can be cleared.

## Output File

`docs/ops/A1_STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_VALIDATION.md`

## Stop Rules

Stop on dirty worktree, forbidden path changes, missing source report, or any need to modify business code.

