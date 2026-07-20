# Chanjet Report Endpoint Parameter Repair Gate

Date: 2026-07-20  
Decision: GO WITH CONDITIONS

## Result

The four blocked report families now use the production-observed parameter contracts instead of guessed payloads. The authenticated production sync completed all 12 book/report targets across three account books.

| Evidence | Result |
| --- | --- |
| Report targets | 12/12 successful |
| Missing report targets | 12 -> 0 |
| GL balance rows | 104 / 70 / 57 |
| Balance sheet, income statement and cash-flow rows | 33 / 43 / 38 per account book |
| Readonly mirror freshness | 46/46, 100% |
| External Chanjet write/delete/modify | Not executed |
| Voucher push | Not executed |
| Migration | Not added or executed by this Gate |

## Root Cause And Repair

The report endpoints require account-book and period parameters that differ from ordinary list APIs. Earlier calls used incomplete contracts and received HTTP-200 business-failure envelopes. The repair locks the observed contracts, rejects business-failure envelopes, and counts only valid report rows as evidence.

The first production repair was released in commit `f550e2bc` by CI/CD run `29712420408`. A second repair in commit `bed250d4` removed a timestamp-shape false negative; CI/CD run `29712880495` then verified all 46 targets fresh.

## Gate Decision

The report-parameter debt is closed. Report evidence can enter the readonly semantic layer, but no report becomes a primary business value until its field semantics and card authority Gate pass.

