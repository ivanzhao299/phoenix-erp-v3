# 好业财财务语义映射 P0 报告

日期：2026-07-04
阶段：CHANJET_FINANCE_SEMANTIC_MAPPING_P0
结论：GO WITH CONDITIONS

## 1. 本轮目标

在好业财只读镜像与字段候选已完成的基础上，把字段差异从“字段路径列表”推进为“财务语义映射图谱”。

本轮不写好业财、不删除好业财、不修改好业财、不推送凭证、不写 ERP 业务表、不执行 migration、不部署。

## 2. 输入

- `docs/ops/runs/chanjet-field-mapping-report-latest.json`
- `docs/ops/runs/chanjet-field-mapping-report-latest.md`

输入基线：

- 字段候选：1677
- 已匹配：183
- 待处理：1494
- 高风险/核心开放项：1341
- API metadata：183
- envelope 误分类残留：0
- 虚假客户/供应商目标表残留：0

## 3. 新增产物

- `scripts/ops/chanjet-finance-semantic-map.mjs`
- `docs/ops/runs/chanjet-finance-semantic-map-latest.json`
- `docs/ops/runs/chanjet-finance-semantic-map-latest.md`

## 4. 语义映射桶

本轮生成 6 个财务语义桶，其中 4 个 P0：

| 优先级 | 语义桶 | 说明 | 当前处理方式 |
|---|---|---|---|
| P0 | CHANJET_VOUCHER_HEADER | 凭证头 | 只读适配 DTO / API / 页面，不推送好业财 |
| P0 | CHANJET_VOUCHER_LINE | 凭证明细 | 借贷、本币/原币、数量、摘要、行号分开保留 |
| P0 | CHANJET_COUNTERPARTY | 往来单位 | 人工审核后拆分客户/供应商映射 |
| P0 | CHANJET_AP_AR_AGGREGATE | 应收/应付统计 | 只进入总账/报表对账视图，禁止写入 `fin_ar_invoices` |
| P1 | CHANJET_PAYMENT_DOCUMENT | 收付款单 | 只读对照 ERP 收付款，不自动生成单据 |
| P1 | CHANJET_PURCHASE_LINKAGE | 采购订单关联 | 只读差异分析，不自动调整采购/库存/财务 |

## 5. P0 关键边界

### 5.1 凭证

- 当前只允许做只读凭证适配层。
- 不允许凭证推送。
- 不允许直接写好业财。
- 不允许直接写 ERP 财务事实表。
- 后续如要生成 ERP 凭证草稿，必须进入单独 Gate，并经 A2 复核。

### 5.2 往来单位

- `custvendor` / `party` 不能直接判定为客户或供应商。
- 必须先进入 `chanjet_master_mapping` 人工审核。
- 只有审核通过后，才允许映射到 ERP 客户或供应商主数据。
- 禁止自动覆盖 ERP 主数据。

### 5.3 应收/应付统计

- 好业财应收/应付统计是客户/供应商级汇总。
- 不含发票号、账龄、到期日等发票级字段。
- 严禁写入 `fin_ar_invoices`。
- 后续只能进入总账/报表对账视图或 `fin_ar_ledger` 审核入账流程。

## 6. 下一 Gate 建议

1. `CHANJET_P0_READONLY_FINANCE_ADAPTER_GATE`
   - 建立只读财务适配模型。
   - 输出凭证头/明细、往来单位、应收/应付统计的 API DTO 草案。
   - 不写好业财。

2. `CHANJET_COUNTERPARTY_REVIEW_QUEUE_GATE`
   - 建立往来单位人工审核队列。
   - 输出客户/供应商/双重属性/无法判断状态。
   - 不覆盖 ERP 主数据。

3. `CHANJET_AP_AR_AGGREGATE_READ_MODEL_GATE`
   - 建立应收/应付统计只读查询模型。
   - 明确排除 `fin_ar_invoices`。
   - 支撑财务总监审核和后续对账。

## 7. 验证

- `node --check scripts/ops/chanjet-finance-semantic-map.mjs`：PASS
- `node scripts/ops/chanjet-finance-semantic-map.mjs --input-json docs/ops/runs/chanjet-field-mapping-report-latest.json --output-dir docs/ops/runs`：PASS

运行结果：

- Decision: GO_WITH_CONDITIONS
- Semantic buckets: 6
- P0 buckets: 4

说明：当前 `chanjet-field-mapping-report-latest.json` 只保留 Top Open Fields 样例，因此应收/应付、往来单位、收付款、采购关联的语义桶以 endpoint 覆盖为主；完整字段样例仍以生产中间层 `chanjet_erp_field_mapping` 为准，后续进入只读适配层 Gate 时应从生产只读镜像重新生成全量字段样本。

## 8. 边界确认

- 写好业财：否
- 删除好业财数据：否
- 修改好业财数据：否
- 推送凭证：否
- 写 ERP 业务表：否
- 执行 migration：否
- 部署：否

## 9. 当前结论

GO WITH CONDITIONS。

好业财字段已经从“候选字段列表”推进到“财务语义映射图谱”。下一步应进入只读财务适配层 Gate，先让 ERP 能清晰、稳定、可审计地重现好业财财务数据语义，再考虑后续字段补齐和写回审批链。
