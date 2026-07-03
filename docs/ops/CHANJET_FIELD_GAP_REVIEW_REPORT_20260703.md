# 好业财字段差异复核报告

日期: 2026-07-03
阶段: CHANJET_FIELD_GAP_REVIEW_GATE
结论: GO WITH CONDITIONS

## 1. 目标

基于生产端已经同步到 ERP 中间层的好业财只读镜像数据，复核 `chanjet_erp_field_mapping` 中的字段差异候选，判断哪些字段可以映射、哪些字段需要 ERP 端适配、哪些字段不能作为业务字段处理。

本轮仍然保持只读边界：不写好业财、不删除好业财、不修改好业财、不推送凭证。

## 2. 输入数据

- 原始快照: 46
- 原始行数: 1956
- 实体镜像行数: 1846
- 字段差异候选: 1677
- HIGH: 1518
- MEDIUM: 63
- LOW: 96

## 3. 关键发现

1. 字段候选数量较大，但不能直接等同于 ERP 缺字段。候选里包含大量好业财响应 envelope 字段，例如 `code`、`msg`、`success`、`requestId`、`validateResult`。
2. `PAYABLE_STATISTICS` 和 `RECEIVABLE_STATISTICS` 原始行数多于实体镜像行数，说明当前实体归一化 key 过粗，可能把同类统计行聚合为少量实体；这是 P0 数据保真问题。
3. `CUSTOMER_SUPPLIER` 被映射到 `mst_customers/mst_suppliers` 这种组合表名，说明当前自动候选需要拆分为客户、供应商两条正式映射规则。
4. `VOUCHER_SEARCH`、`GL_BALANCE`、`BALANCE_SHEET`、`INCOME_STATEMENT`、`CASH_FLOW` 当前被粗略归入 `chanjet_master_mapping`，不能作为最终 ERP 模型；应建立只读财务镜像/报表模型，而不是塞进主数据映射表。
5. 当前所有候选仍为 PENDING，下一步不能直接改 schema 或写回好业财，必须先按业务域出 ERP 适配方案。

## 4. 按 Endpoint / 风险汇总

| Chanjet Endpoint | Risk | Count |
|---|---:|---:|
| /accounting/asr/CashFlow/3533914511118750 | HIGH | 11 |
| /accounting/asr/CashFlow/3537748712226818 | HIGH | 11 |
| /accounting/asr/CashFlow/3539743721526654 | HIGH | 11 |
| /accounting/fin/getOldBalanceSheet/3533914511118750 | HIGH | 11 |
| /accounting/fin/getOldBalanceSheet/3537748712226818 | HIGH | 11 |
| /accounting/fin/getOldBalanceSheet/3539743721526654 | HIGH | 11 |
| /accounting/fin/getOldIncomeStatement/3533914511118750 | HIGH | 11 |
| /accounting/fin/getOldIncomeStatement/3537748712226818 | HIGH | 11 |
| /accounting/fin/getOldIncomeStatement/3539743721526654 | HIGH | 11 |
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750 | HIGH | 152 |
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818 | HIGH | 166 |
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3539743721526654 | HIGH | 142 |
| /accounting/gl/balance/rpt/3533914511118750 | HIGH | 11 |
| /accounting/gl/balance/rpt/3537748712226818 | HIGH | 11 |
| /accounting/gl/balance/rpt/3539743721526654 | HIGH | 11 |
| /accounting/gl/statistics/pay/3533914511118750 | HIGH | 51 |
| /accounting/gl/statistics/pay/3537748712226818 | HIGH | 51 |
| /accounting/gl/statistics/receive/3533914511118750 | HIGH | 51 |
| /accounting/gl/statistics/receive/3537748712226818 | HIGH | 51 |
| /accounting/openapi/cc/book/findByEnterpriseId | HIGH | 3 |
| /accounting/openapi/cc/book/findByEnterpriseId | LOW | 96 |
| /accounting/openapi/cc/department/list/3533914511118750 | MEDIUM | 5 |
| /accounting/openapi/cc/department/list/3537748712226818 | MEDIUM | 5 |
| /accounting/openapi/cc/department/list/3539743721526654 | MEDIUM | 5 |
| /accounting/openapi/cc/finaccount/list/3533914511118750 | HIGH | 21 |
| /accounting/openapi/cc/finaccount/list/3537748712226818 | HIGH | 21 |
| /accounting/openapi/cc/finaccount/list/3539743721526654 | HIGH | 12 |
| /accounting/openapi/cc/party/custvendor/query/3533914511118750 | HIGH | 113 |
| /accounting/openapi/cc/party/custvendor/query/3537748712226818 | HIGH | 112 |
| /accounting/openapi/cc/party/custvendor/query/3539743721526654 | HIGH | 28 |
| /accounting/openapi/cc/payment/ap/list/3533914511118750 | HIGH | 44 |
| /accounting/openapi/cc/payment/ap/list/3533914511118750 | MEDIUM | 9 |
| /accounting/openapi/cc/payment/ap/list/3537748712226818 | HIGH | 48 |
| /accounting/openapi/cc/payment/ap/list/3537748712226818 | MEDIUM | 9 |
| /accounting/openapi/cc/payment/ap/list/3539743721526654 | HIGH | 8 |
| /accounting/openapi/cc/payment/ar/list/3533914511118750 | HIGH | 50 |
| /accounting/openapi/cc/payment/ar/list/3533914511118750 | MEDIUM | 9 |
| /accounting/openapi/cc/payment/ar/list/3537748712226818 | HIGH | 50 |
| /accounting/openapi/cc/payment/ar/list/3537748712226818 | MEDIUM | 9 |
| /accounting/openapi/cc/payment/ar/list/3539743721526654 | HIGH | 8 |
| /accounting/openapi/cc/project/list/3533914511118750 | HIGH | 47 |
| /accounting/openapi/cc/project/list/3537748712226818 | HIGH | 36 |
| /accounting/openapi/cc/project/list/3539743721526654 | HIGH | 8 |
| /accounting/openapi/cc/purchaseorder/list/3533914511118750 | HIGH | 62 |
| /accounting/openapi/cc/purchaseorder/list/3533914511118750 | MEDIUM | 9 |
| /accounting/openapi/cc/purchaseorder/list/3537748712226818 | HIGH | 28 |
| /accounting/openapi/cc/purchaseorder/list/3537748712226818 | MEDIUM | 3 |
| /accounting/openapi/cc/purchaseorder/list/3539743721526654 | HIGH | 8 |
| /accounting/openapi/cc/subject/list/3533914511118750 | HIGH | 5 |
| /accounting/openapi/cc/subject/list/3537748712226818 | HIGH | 5 |
| /accounting/openapi/cc/subject/list/3539743721526654 | HIGH | 5 |

## 5. ERP 字段存在性 Top 30

| Endpoint | Risk | ERP Domain | ERP Table | Total | Existing Fields | Missing Fields |
|---|---|---|---|---:|---:|---:|
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 166 | 18 | 148 |
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 152 | 18 | 134 |
| /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3539743721526654 | HIGH | accounting | chanjet_master_mapping | 142 | 18 | 124 |
| /accounting/openapi/cc/party/custvendor/query/3533914511118750 | HIGH | counterparty | mst_customers/mst_suppliers | 113 | 0 | 113 |
| /accounting/openapi/cc/party/custvendor/query/3537748712226818 | HIGH | counterparty | mst_customers/mst_suppliers | 112 | 0 | 112 |
| /accounting/openapi/cc/book/findByEnterpriseId | LOW | company | chanjet_account_books | 96 | 0 | 96 |
| /accounting/openapi/cc/purchaseorder/list/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 56 | 3 | 53 |
| /accounting/openapi/cc/payment/ap/list/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 46 | 3 | 43 |
| /accounting/openapi/cc/payment/ar/list/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 44 | 3 | 41 |
| /accounting/openapi/cc/payment/ar/list/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 44 | 3 | 41 |
| /accounting/openapi/cc/payment/ap/list/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 42 | 3 | 39 |
| /accounting/openapi/cc/project/list/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 47 | 9 | 38 |
| /accounting/gl/statistics/pay/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 36 | 3 | 33 |
| /accounting/gl/statistics/receive/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 36 | 3 | 33 |
| /accounting/gl/statistics/receive/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 36 | 3 | 33 |
| /accounting/gl/statistics/pay/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 36 | 3 | 33 |
| /accounting/openapi/cc/project/list/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 36 | 6 | 30 |
| /accounting/openapi/cc/party/custvendor/query/3539743721526654 | HIGH | counterparty | mst_customers/mst_suppliers | 28 | 0 | 28 |
| /accounting/openapi/cc/purchaseorder/list/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 26 | 1 | 25 |
| /accounting/openapi/cc/finaccount/list/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 21 | 0 | 21 |
| /accounting/openapi/cc/finaccount/list/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 21 | 0 | 21 |
| /accounting/gl/statistics/receive/3533914511118750 | HIGH | counterparty | mst_customers/mst_suppliers | 15 | 0 | 15 |
| /accounting/gl/statistics/pay/3533914511118750 | HIGH | counterparty | mst_customers/mst_suppliers | 15 | 0 | 15 |
| /accounting/gl/statistics/receive/3537748712226818 | HIGH | counterparty | mst_customers/mst_suppliers | 15 | 0 | 15 |
| /accounting/gl/statistics/pay/3537748712226818 | HIGH | counterparty | mst_customers/mst_suppliers | 15 | 0 | 15 |
| /accounting/openapi/cc/finaccount/list/3539743721526654 | HIGH | accounting | chanjet_master_mapping | 12 | 0 | 12 |
| /accounting/asr/CashFlow/3533914511118750 | HIGH | accounting | chanjet_master_mapping | 11 | 0 | 11 |
| /accounting/asr/CashFlow/3539743721526654 | HIGH | accounting | chanjet_master_mapping | 11 | 0 | 11 |
| /accounting/asr/CashFlow/3537748712226818 | HIGH | accounting | chanjet_master_mapping | 11 | 0 | 11 |
| /accounting/gl/balance/rpt/3539743721526654 | HIGH | accounting | chanjet_master_mapping | 11 | 0 | 11 |

## 6. ERP Domain / Table 聚合 Top 30

| ERP Domain | ERP Table | Risk | Count |
|---|---|---|---:|
| accounting | chanjet_master_mapping | HIGH | 1181 |
| counterparty | mst_customers/mst_suppliers | HIGH | 337 |
| company | chanjet_account_books | LOW | 96 |
| organization | sys_organizations | MEDIUM | 63 |

## 7. P0 整改任务

### P0-1 好业财响应 envelope 字段剥离

范围:

- `$.code`
- `$.msg`
- `$.success`
- `$.requestId`
- `$.validateResult`
- `$.multiFieldErrors`
- `$.msgArgs`
- `$.verbose`

处理方式:

- 不进入 ERP 业务 schema。
- 只作为 API 调用审计元数据保存在 raw snapshot。
- 字段差异分析器后续应把这些字段标记为 `API_ENVELOPE_IGNORE`。

### P0-2 应收/应付统计实体保真修复

问题:

- `PAYABLE_STATISTICS`: raw 43，entity 2。
- `RECEIVABLE_STATISTICS`: raw 71，entity 2。

风险:

- 当前实体快照无法完整代表好业财应收/应付统计明细。

处理方式:

- 调整只读镜像实体归一化 key，至少纳入 `book_id + endpoint_key + counterparty/source subject + period + row index/hash`。
- 不写好业财。
- 修复后重跑只读同步并确认 entity rows 与 raw rows 的业务保真关系。

### P0-3 客户/供应商映射拆分

问题:

- 当前候选表名为 `mst_customers/mst_suppliers`，不是实际 ERP 表。

处理方式:

- 按好业财往来单位类型拆分为客户和供应商。
- 匹配 ERP `mst_customers`、`mst_suppliers` 或当前实际主数据表。
- 对名称、编码、税号、联系人、电话、地址、状态、账套归属建立人工审核映射候选。

### P0-4 凭证与财务报表只读镜像模型

问题:

- `VOUCHER_SEARCH` 有 1242 行，是最大数据集。
- 当前自动候选粗归到 `chanjet_master_mapping`，业务语义错误。

处理方式:

- 建立或完善只读财务镜像模型：凭证、凭证分录、科目余额、三大报表。
- ERP 业务端只引用这些镜像做对账和分析，不直接改写好业财。

## 8. P1 整改任务

1. 资金账户 `FIN_ACCOUNT` 与 ERP 现金账户 / 银行账户字段对齐。
2. 项目 `PROJECT` 与 ERP 项目主数据字段对齐。
3. 采购订单 `PURCHASE_ORDER` 与 ERP 采购订单字段差异审查。
4. `PAYMENT_AP` / `PAYMENT_AR` 与 ERP 付款单 / 收款单状态、金额、币种、往来单位、核销关系对齐。
5. 账套 `ACCOUNT_BOOKS` 建立 ERP 公司/账套映射，不直接新建业务公司。

## 9. P2 整改任务

1. 字段差异页面支持按 endpoint、risk、ERP domain 过滤。
2. 字段候选加入人工决策状态：IGNORE / MAP / ADD_ERP_FIELD / TRANSFORM / REJECT。
3. 生成可审计的字段映射导出表，供财务负责人复核。

## 10. 三步走状态

### 第一步：好业财 -> ERP 只读镜像

状态: 已完成，GO WITH CONDITIONS。

### 第二步：字段差异复核与 ERP 适配

状态: 本报告已完成第一轮复核，下一步进入 P0/P1 实施。

### 第三步：用户分工和写回策略

状态: HOLD。

未经用户单独批准，继续禁止向好业财写入、删除、修改或推送凭证。

## 11. 下一步建议

立即启动 `CHANJET_FIELD_GAP_P0_REPAIR`：

1. 修复字段差异分析器，剥离 API envelope 字段。
2. 修复应收/应付统计实体保真 key。
3. 拆分客户/供应商映射目标。
4. 为凭证和财务报表建立只读镜像模型方案。

## 12. 当前结论

GO WITH CONDITIONS。

好业财生产只读数据已经进入 ERP 中间层；字段差异已完成第一轮复核。下一步应优先修复中间层分析和归一化质量，不应直接大规模改 ERP schema，也不应写好业财。
