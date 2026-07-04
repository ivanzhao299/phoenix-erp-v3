# Chanjet P2 Master Data Alignment Audit

Generated at: 2026-07-04T15:11:15.642Z
Decision: GO_WITH_CONDITIONS

## Boundaries

- Chanjet write: no
- Chanjet delete / modify: no
- Voucher push: no
- ERP business table overwrite: no
- Migration: no

## Summary

- Mirror domain coverage: 100%
- P0 domains needing review: 3
- Total Chanjet mirror rows in scoped domains: 5959
- Field mapping candidates: 1677
- Pending semantic mappings: 1494

## Domain Status

|priority|domain|status|rows|entities|high|action|
|---|---|---|---|---|---|---|
|P0|公司 / 账套|READY_FOR_MAPPING_REVIEW|3|6|0|进入人工映射复核，APPROVED 前不得用于写回或自动覆盖。|
|P0|客户 / 供应商 / 往来单位|NEED_REVIEW|1668|406|334|优先做客户/供应商/双重身份审核映射，解决往来余额对齐。|
|P0|会计科目|NEED_REVIEW|135|15|1037|优先固化科目编码、层级、余额方向和三大报表字段口径。|
|P0|项目|READY_FOR_MAPPING_REVIEW|432|48|0|进入人工映射复核，APPROVED 前不得用于写回或自动覆盖。|
|P0|资金账户|NEED_REVIEW|1847|327|1037|优先核对资金账户、币种、余额来源和启停状态。|
|P1|部门 / 组织|READY_FOR_MAPPING_REVIEW|27|3|0|进入人工映射复核，APPROVED 前不得用于写回或自动覆盖。|
|P1|币种|READY_FOR_MAPPING_REVIEW|1847|327|0|进入人工映射复核，APPROVED 前不得用于写回或自动覆盖。|

## Next Gate

1. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`: review P0 domains in this order: counterparty, subject, cash account, project, company/book.
2. `CHANJET_P3_RECONCILIATION_CENTER`: create visible OK/WARN/MISMATCH/HOLD/NEED_MAPPING rows for ERP vs Chanjet.
3. Keep Chanjet write-back disabled until a later P4 approval gate.
