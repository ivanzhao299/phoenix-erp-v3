# Chanjet P3 Finance Card Source Switch Audit Report

Date: 2026-07-04

Decision: `GO WITH CONDITIONS`

## 1. Purpose

This gate turns the system-confirmed finance card semantic matrix into an executable source-switch policy.

The user clarified that ERP must perform the confirmation. This gate therefore checks the actual runtime path used by `/finance2/reports` and prevents unsafe finance cards from silently switching to Chanjet values.

## 2. Source Switch Matrix

| Card | Switch status | Primary source | Can feed primary card | Required UI behavior |
|---|---|---|---|---|
| 应收待收款 | `SWITCH_READY` | Chanjet | YES | Show Chanjet primary value, ERP auxiliary value, difference, source, and pulled time. |
| 应付待付款 | `SWITCH_READY` | Chanjet | YES | Show Chanjet primary value, ERP auxiliary value, difference, source, and pulled time. |
| 现金 / 银行余额 | `SWITCH_BLOCKED` | ERP | NO | Keep ERP primary value; show Chanjet evidence only after balance field, currency, and balance time are locked. |
| 今日收款 | `SWITCH_BLOCKED` | ERP | NO | Keep ERP primary value; Chanjet receipt mirror remains comparison-only until date/status/direction semantics are locked. |
| 今日付款 | `SWITCH_BLOCKED` | ERP | NO | Keep ERP primary value; Chanjet payment mirror remains comparison-only until date/status/direction semantics are locked. |
| 科目余额 | `READONLY_REPORT_READY` | Chanjet readonly report | NO | Show as readonly finance report / reconciliation rows, not as an ERP operational card. |
| 资产负债表 | `READONLY_REPORT_READY` | Chanjet readonly report | NO | Show as readonly statutory report source, not fabricated from ERP operational facts. |
| 利润表 | `READONLY_REPORT_READY` | Chanjet readonly report | NO | Show as readonly statutory report source, not fabricated from ERP operational facts. |

## 3. Runtime Enforcement

`FinancialReportsService` now requires both conditions before a Chanjet value can become a finance-card primary value:

1. The Chanjet read model must be `AUTHORITY_READY`.
2. The system confirmation matrix must mark the card as `SYSTEM_CONFIRMED_AUTHORITY`.

This means only `AR_OPEN` and `AP_OPEN` can currently switch to Chanjet primary values.

## 4. API

New readonly endpoint:

- `GET /api/chanjet/integration/finance-card-source-switch-audit`

Permission:

- `MENU_FIN2_AR_LEDGER:V`

The endpoint does not write Chanjet, does not push vouchers, and does not overwrite ERP business facts.

## 5. Audit Artifacts

Generated artifacts:

- `docs/ops/runs/chanjet-finance-card-source-switch-audit-latest.json`
- `docs/ops/runs/chanjet-finance-card-source-switch-audit-latest.md`

Expected audit result:

- Checks: `7/7 PASS`
- Switch ready: `2`
- Readonly report ready: `3`
- Switch blocked: `3`
- Unsafe switches prevented: `6`

## 6. Guardrails

1. No Chanjet write/delete/modify.
2. No voucher push.
3. No ERP business fact overwrite.
4. No migration.
5. No DB write.
6. No deploy action from this gate.
7. No card may use `amountSum=0` as proof of a real zero amount unless the business field is semantically locked.

## 7. Next Gate

Next gate: `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA`

Required checks:

1. `/finance2/reports` must visibly show source, pulled time, ERP auxiliary value, and difference for switched cards.
2. Cash balance and today receipt/payment must remain ERP-primary.
3. Subject balance, balance sheet, and income statement must be exposed as readonly report sources.
4. No page may silently hide mismatch or blocker state.

## 8. Final Conclusion

Current conclusion: `GO WITH CONDITIONS`.

The source-switch policy is now system-enforced. The next work should focus on UI QA and production smoke, not finance-user confirmation.
