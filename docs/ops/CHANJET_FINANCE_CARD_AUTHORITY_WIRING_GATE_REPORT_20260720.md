# Chanjet Finance Card Authority Wiring Gate

Date: 2026-07-20  
Decision: GO WITH CONDITIONS

## Production Result

Commit `c756aa2d4c7ca88091928cc47b97d1dd88d199e9` passed full CI/CD run `29713655532`. API/Web typecheck, build, migration gates, entity-drift Gate and system/breeding/packaging/WMS/finance regression all passed. Production checkout matches the commit and the API/Web containers are healthy.

The authenticated production audit passed 8/8 checks:

| Card | Primary source | Authority |
| --- | --- | --- |
| Open receivables | `CHANJET_AR_STATISTICS_MIRROR` | Enabled |
| Open payables | `CHANJET_AP_STATISTICS_MIRROR` | Enabled |
| Cash balance | ERP fallback | Blocked pending mapping |
| Today receipt | ERP fallback | Blocked pending daily reconciliation |
| Today payment | ERP fallback | Blocked pending daily reconciliation |
| Subject balance | ERP fallback | Readonly evidence only |
| Balance sheet | ERP fallback | Readonly evidence only |
| Income statement | ERP fallback | Readonly evidence only |

## Safety Findings

- AR/AP use valid Chanjet aggregate evidence and retain ERP values as visible auxiliary comparison.
- Six unapproved cards fail closed.
- Receipt/payment provider totals are cumulative; they were not promoted to today's cards.
- Chanjet write/delete/modify, voucher push and ERP business overwrite remain disabled.
- No migration was added or directly executed by this Gate.

## Next Gate

`CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION`

It must lock provider business date, document status and daily aggregation semantics before either today card can use Chanjet as its primary source.

