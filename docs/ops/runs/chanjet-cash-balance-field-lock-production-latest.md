# Chanjet Cash Balance Field Lock Production Audit

Generated: 2026-07-21T01:31:06.453Z

Decision: GO_WITH_CONDITIONS

Next Gate: CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW

|Check|Result|Evidence|
|---|---|---|
|authority_ready|PASS|status=AUTHORITY_READY|
|exact_source_fields|PASS|{"book":"$entity.bookId","period":"$entity.period","subjectCode":"rawData.glAccountCode","subjectName":"rawData.glAccountName","baseBalance":"rawData.baseEndingBalance","originalBalance":"rawData.endingBalance","currency":"rawData.currency","leaf":"rawData.leaf"}|
|eligible_rows_present|PASS|eligible=29|
|contract_rows_clean|PASS|invalid=0, duplicate=0|
|all_enabled_books_covered|PASS|3/3|
|base_balance_is_numeric|PASS|total=3017799.97|
|mirror_fresh|PASS|latest=2026-07-21T01:28:39.957Z|
|authority_card_enabled|PASS|enabled=true|
|authority_card_matches_lock|PASS|3017799.97/3017799.97|
|business_page_uses_gl_source|PASS|source=CHANJET_GL_CASH_BALANCE_MIRROR|
|business_page_matches_lock|PASS|3017799.97/3017799.97|
|external_write_disabled|PASS|{"chanjetWrite":false,"chanjetDelete":false,"chanjetModify":false,"voucherPush":false,"erpBusinessOverwrite":false,"migration":false,"dbWrite":false,"amountSumZeroAsBusinessZero":false,"balanceSource":"GL_BALANCE_latest_period_cash_bank_leaf_baseEndingBalance","accountDirectorySource":"FIN_ACCOUNT_directory_only","rule":"本接口只读 ERP 好业财中间层。集团主值只使用总账 1001/1002 叶子科目本位币期末余额；资金账户目录和 amountSum 均不得冒充余额。"}|

## Locked Balance

- Base currency: CNY
- Total base balance: 3017799.97
- Current periods: 202607
- Eligible rows: 29
- Book coverage: 3/3
- Invalid rows: 0
- Duplicate rows: 0

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- FIN_ACCOUNT remains directory-only evidence.
- A legitimate exact zero balance is allowed; missing contract evidence is not.

