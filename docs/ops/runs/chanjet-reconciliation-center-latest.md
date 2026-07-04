# Chanjet P3 Reconciliation Center Audit

- Generated at: 2026-07-04T11:07:27.581Z
- Decision: GO_WITH_CONDITIONS
- Endpoint coverage: 100%
- Card coverage: 100%
- P0 open items: 8
- Chanjet write: false

| Item | Status | Chanjet value | Rows | Action |
| --- | --- | ---: | ---: | --- |
| 应收待收 | NEED_MAPPING | -10936306.32 | 71 | 用运行时 API /api/chanjet/integration/finance-reconciliation 拆解 ERP vs 好业财差异。 |
| 应付待付 | NEED_MAPPING | -7084274.34 | 43 | 用运行时 API /api/chanjet/integration/finance-reconciliation 拆解 ERP vs 好业财差异。 |
| 现金 / 银行余额 | NEED_MAPPING | 0 | 47 | 优先解析资金账号 rawData 中余额字段，并对齐 ERP fin_cash_accounts。 |
| 今日收款 | NEED_MANUAL_REVIEW | 5763304971 | 171 | 锁定业务日/入账日/审核状态过滤规则后，再允许影响今日收款卡片。 |
| 今日付款 | NEED_MANUAL_REVIEW | 9003331626.45 | 109 | 锁定业务日/入账日/审核状态过滤规则后，再允许影响今日付款卡片。 |
| 科目余额 | NEED_MAPPING | 0 | 3 | 建立科目余额字段映射，按科目编码、期间、借贷方向出对账行。 |
| 资产负债表关键项 | NEED_MAPPING | 0 | 3 | 建立报表项目字段映射，禁止把 amountSum=0 当成报表为 0。 |
| 利润表关键项 | NEED_MAPPING | 0 | 3 | 建立利润表字段映射后，才能让 ERP 经营驾驶舱显示好业财利润口径。 |

## Notes

- This audit is artifact-first and does not query production databases.
- Runtime ERP-vs-Chanjet differences are exposed by `/api/chanjet/integration/finance-reconciliation`.
- Payment list totals and statement zero amount sums are intentionally marked as review/mapping items, not as final card numbers.
