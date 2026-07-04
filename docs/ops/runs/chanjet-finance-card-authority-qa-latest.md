# Chanjet Finance Card Authority QA

Generated: 2026-07-04T15:11:15.581Z

Decision: GO_WITH_CONDITIONS

## Summary

- Checks: 8/8 passed.
- Card service coverage: 8/8.
- Card UI coverage: 8/8.
- Endpoint coverage: 100%.
- Card mirror coverage: 100%.
- Field coverage: 100%.

## Checks

|Check|Result|Evidence|
|---|---|---|
|Finance card authority endpoint exists|PASS|GET /api/chanjet/integration/finance-card-authority is protected by MENU_FIN2_AR V.|
|Only AUTHORITY_READY can feed primary cards|PASS|Authority is enabled only when read model is AUTHORITY_READY and receipt/payment lock permits card authority.|
|Chanjet write boundaries are explicit|PASS|Finance authority/read-model guardrails keep Chanjet write/delete/modify/voucher push disabled.|
|All eight finance cards are covered by authority service|PASS|arOpen:yes, apOpen:yes, cashBalance:yes, todayInflow:yes, todayOutflow:yes, subjectBalance:yes, balanceSheet:yes, incomeStatement:yes|
|All eight finance cards are rendered in finance report panel|PASS|arOpen:yes, apOpen:yes, cashBalance:yes, todayInflow:yes, todayOutflow:yes, subjectBalance:yes, balanceSheet:yes, incomeStatement:yes|
|UI shows source, Chanjet value, ERP auxiliary value, diff, and lock reason|PASS|好业财财务卡片权威接线:yes, 主值来源:yes, 权威接线:yes, Read Model:yes, 好业财:yes, ERP 辅助:yes, 差异:yes, 只有 AUTHORITY_READY:yes, 不静默覆盖:yes|
|Finance overview consumes Chanjet authority as guarded evidence|PASS|FinancialReportsService pulls read model and receipt/payment locks before exposing card source authority.|
|Today receipt/payment remain blocked unless date/status/direction lock is approved|PASS|Receipt/payment cards expose lock blockers instead of silently using list amountSum.|

## Card Coverage

|Card|Service|UI|
|---|---|---|
|arOpen|PASS|PASS|
|apOpen|PASS|PASS|
|cashBalance|PASS|PASS|
|todayInflow|PASS|PASS|
|todayOutflow|PASS|PASS|
|subjectBalance|PASS|PASS|
|balanceSheet|PASS|PASS|
|incomeStatement|PASS|PASS|

## Conditions

- none

## Boundaries

- Chanjet write/delete/modify/voucher push: NO.
- ERP business overwrite: NO.
- Migration / DB write / deploy / push in this QA: NO.

## Next Actions

- Keep AUTHORITY_READY as the only primary-card switch.
- Use /finance2/reports to review card source, Chanjet value, ERP auxiliary value, diff, and blockers.
- Lock cash balance, subject balance, statement rows, and receipt/payment date/status semantics before promoting more cards.
- Continue Chanjet write-back HOLD until voucher draft review, approval, idempotency, and rollback Gates are complete.
