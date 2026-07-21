# Chanjet Wave 6 Production Closeout

Date: 2026-07-21

Decision: `GO_WITH_CONDITIONS`

Next Gate: `CHANJET_WAVE_7_EXTERNAL_MINIMAL_WRITE_APPROVAL`

## Scope Closed

Waves 0 through 6 of `CHANJET-E2E-20260720` are implemented and verified in production. The delivered boundary includes full authorized readonly mirroring, field normalization, book-scoped master mapping, finance authority/read models, reconciliation visibility, scheduled alignment reliability, administrator-only governance, and ERP-internal writeback preparation.

No external Chanjet write, delete, modify, voucher push, or ERP business-table overwrite was performed.

## Production Evidence

- Revision: `df404cec890e316d5f8bed96a2811960a9511c66`.
- Full deployment workflow: `29795997695`, PASS.
- Repository/API image/Web image revisions: aligned.
- Real alignment run: `CHANJET-RO-1784601556414`, `COMPLETED`, one attempt, 56 targets.
- Completion audit: 17/17 endpoints PASS.
- Readonly mirror: 56/56 fresh, 0 missing.
- Field mappings: 3,341, with 0 blocking unmapped fields.
- Master data: 1,005 valid source rows, 41 exact matches, 0 pending mappings, 0 conflicts.
- Sync jobs: latest 100 checked, 0 failures.
- API after alignment: restart count 0, `OOMKilled=false`, about 93.72 MiB of 512 MiB.
- Writeback safety: 0 unsafe drafts, 0 unsafe Outbox rows, external network transport absent, external write disabled.

## Reliability Closure

1. Alignment status is persisted in `chanjet_sync_jobs` and recovered after API restart.
2. Manual and scheduled alignment use the same advisory-locked execution path.
3. The redundant full current-state aggregation that caused heap exhaustion was removed.
4. The API V8 heap is explicitly bounded at 320 MB inside the 512 MB container.
5. Alert SQL parameter types are explicit and no longer fail with inconsistent inference.
6. Deployment runs are serialized; a later Web-only pipeline cannot cancel an in-flight full deployment.

## Conditional Items

Four reconciliation differences remain visible: AR open balance, AP open balance, cash balance, and today's payment. They are retained for traceability because ERP operational records and Chanjet accounting evidence use different grain, lifecycle, date, currency, or account-book scope. The system does not force equality and does not silently overwrite either source.

The production readiness score is 89/B because only five of eight finance cards qualify as single-number Chanjet authority cards and four reconciliation differences remain open. The other three cards are deliberately row-level readonly statutory reports; this is a semantic boundary rather than missing endpoint coverage.

## Wave 7 Boundary

Wave 7 remains HOLD until a separate approval names one exact and reversible canary: environment, account book, company, document type and payload, amount, currency, period, maker, reviewer, operator, execution window, readback, and reversal method. Existing deployment or readonly approval cannot be reused.
