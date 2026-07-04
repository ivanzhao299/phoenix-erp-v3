# Chanjet P3 Finance Card System Confirmation Report

Date: 2026-07-04

Decision: `GO WITH CONDITIONS`

## 1. Purpose

The previous semantic review left six finance cards waiting for "finance confirmation". The user clarified that the ERP system owner must complete the confirmation instead of handing the work back to finance users.

This report records the system-side confirmation result for each finance card. The goal is to prevent unsafe card-number switches while still moving the Chanjet integration forward.

## 2. Confirmation Result

| Card | System decision | Primary source | Authority allowed | Reason |
|---|---|---|---|---|
| 应收待收款 | `SYSTEM_CONFIRMED_AUTHORITY` | Chanjet | YES | Chanjet AR statistics are the finance-side aggregate balance; ERP invoice/receipt details remain auxiliary differences. |
| 应付待付款 | `SYSTEM_CONFIRMED_AUTHORITY` | Chanjet | YES | Chanjet AP statistics are the finance-side aggregate balance; ERP purchase/payment details remain auxiliary differences. |
| 现金 / 银行余额 | `SYSTEM_BLOCKED_FROM_AUTHORITY` | ERP | NO | Current Chanjet cash-account mirror proves account existence but not the true balance field, currency balance, or balance time point. |
| 今日收款 | `SYSTEM_BLOCKED_FROM_AUTHORITY` | ERP | NO | Chanjet receipt mirror is not yet proven to match ERP's "today" business-date, status, direction, and reversal rules. |
| 今日付款 | `SYSTEM_BLOCKED_FROM_AUTHORITY` | ERP | NO | Chanjet payment mirror is not yet proven to match ERP's "today" business-date, status, direction, and reversal rules. |
| 科目余额 | `SYSTEM_CONFIRMED_READONLY` | Chanjet readonly | NO | Chanjet GL balance is the correct finance report source, but ERP currently has no equivalent ledger fact table for business overwrite. |
| 资产负债表 | `SYSTEM_CONFIRMED_READONLY` | Chanjet readonly | NO | Chanjet balance sheet is a finance report source; ERP operational data must not fabricate statutory statement figures. |
| 利润表 | `SYSTEM_CONFIRMED_READONLY` | Chanjet readonly | NO | Chanjet income statement is a finance report source; ERP operational data remains explanatory only. |

## 3. Manual Finance Confirmation

Manual finance confirmation required: `0`.

The system-side decision is sufficient for the next engineering gate because it is based on:

1. ERP's known business semantics.
2. Chanjet readonly mirror coverage.
3. Existing semantic lock and read-model guardrails.
4. The hard rule that only `SYSTEM_CONFIRMED_AUTHORITY` cards can become primary card values.

## 4. Guardrails

1. No Chanjet write/delete/modify.
2. No voucher push.
3. No ERP business fact overwrite.
4. No migration.
5. No DB write.
6. No deployment action from this gate.
7. No finance card may use `amountSum=0` as proof of a real zero amount unless the true business field is locked.

## 5. Audit Result

Generated artifacts:

- `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.json`
- `docs/ops/runs/chanjet-finance-card-system-confirmation-latest.md`

Audit result:

- Checks: `6/6 PASS`
- System authority cards: `2`
- System readonly report cards: `3`
- System blocked from authority cards: `3`
- Manual finance confirmation required: `0`

## 6. Next Gate

Next gate: `CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT`

Required checks:

1. `/finance2` must use Chanjet primary values only for `AR_OPEN` and `AP_OPEN`.
2. Cash balance, today receipt, and today payment must remain ERP-primary.
3. Subject balance, balance sheet, and income statement must be exposed as Chanjet readonly report sources, not fabricated ERP values.
4. The UI must show source, pulled time, ERP auxiliary value, difference, and blocker reason where applicable.

## 7. Final Conclusion

Current conclusion: `GO WITH CONDITIONS`.

The Chanjet finance card semantics are now system-confirmed. The project no longer waits for finance users to confirm the semantic matrix, but it still blocks unsafe authority promotion for cards that lack field proof.
