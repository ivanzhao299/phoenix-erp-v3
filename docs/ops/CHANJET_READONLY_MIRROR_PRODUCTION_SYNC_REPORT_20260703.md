# 好业财只读镜像生产同步报告

日期: 2026-07-03
阶段: CHANJET_READONLY_MIRROR_EXECUTE_WITH_RUNTIME_TOKEN
结论: GO WITH CONDITIONS

## 1. 执行目标

按用户要求在生产服务器端执行好业财只读同步，推进三步走战略的第一步:

1. 先从好业财只读拉取数据到 ERP 中间层，完整重现好业财当前可读数据。
2. 再对比好业财字段类型与 ERP 字段类型，形成差异改造清单。
3. 最后再区分 ERP 使用人群和好业财使用人群；未经单独批准，不向好业财写入。

## 2. 执行环境

- Server: 47.236.122.224
- API container: phoenix-v3-api
- API health: PASS
- Remote code HEAD: a2238258
- Sync endpoint: `POST /api/chanjet/integration/mirror/sync`
- Auth method: short-lived ERP admin Bearer token generated inside the API container from production `JWT_SECRET`; token was not printed or persisted.

## 3. 执行边界

- 写好业财: 否
- 删除好业财数据: 否
- 修改好业财数据: 否
- 推送凭证: 否
- 生产部署: 否
- push: 否
- migration: 否
- 业务代码修改: 否
- ERP 中间层写入: 是，仅写 `chanjet_*` readonly mirror tables

## 4. 同步范围

本次只读同步覆盖:

- ACCOUNT_BOOKS
- DEPARTMENT
- CUSTOMER_SUPPLIER
- SUBJECT
- PROJECT
- FIN_ACCOUNT
- PAYABLE_STATISTICS
- RECEIVABLE_STATISTICS
- PAYMENT_AP
- PAYMENT_AR
- PURCHASE_ORDER
- VOUCHER_SEARCH
- GL_BALANCE
- BALANCE_SHEET
- INCOME_STATEMENT
- CASH_FLOW

识别账套:

- 3533914511118750
- 3537748712226818
- 3539743721526654

## 5. 同步结果

| 指标 | 数量 |
|---|---:|
| 原始快照 | 46 |
| 原始行数 | 1956 |
| 实体镜像行数 | 1846 |
| 字段差异候选 | 1677 |

按 endpoint 汇总:

| Endpoint | Raw Rows | Entity Rows |
|---|---:|---:|
| ACCOUNT_BOOKS | 3 | 3 |
| BALANCE_SHEET | 3 | 3 |
| CASH_FLOW | 3 | 3 |
| CUSTOMER_SUPPLIER | 284 | 284 |
| DEPARTMENT | 3 | 3 |
| FIN_ACCOUNT | 47 | 47 |
| GL_BALANCE | 3 | 3 |
| INCOME_STATEMENT | 3 | 3 |
| PAYABLE_STATISTICS | 43 | 2 |
| PAYMENT_AP | 100 | 100 |
| PAYMENT_AR | 100 | 100 |
| PROJECT | 6 | 6 |
| PURCHASE_ORDER | 42 | 42 |
| RECEIVABLE_STATISTICS | 71 | 2 |
| SUBJECT | 3 | 3 |
| VOUCHER_SEARCH | 1242 | 1242 |

## 6. 字段差异候选

| match_status | decision_status | risk_level | count |
|---|---|---|---:|
| PENDING | PENDING | HIGH | 1518 |
| PENDING | PENDING | MEDIUM | 63 |
| PENDING | PENDING | LOW | 96 |

解释:

- 本次已经完成数据拉取和字段候选生成。
- 字段候选仍是 PENDING，不代表要直接改 ERP schema。
- 下一步必须进入 `CHANJET_FIELD_GAP_REVIEW_GATE`，按 HIGH -> MEDIUM -> LOW 分组复核字段类型、业务含义、是否需要 ERP 适配。

## 7. 验证结果

- API health: PASS
- Sync HTTP status: 201
- Sync success: true
- Read snapshot table count: PASS
- Entity snapshot table count: PASS
- Field mapping candidate count: PASS

## 8. 风险与条件项

1. `PAYABLE_STATISTICS` 与 `RECEIVABLE_STATISTICS` 原始行数多于实体镜像行数，说明当前实体归一化策略有聚合或去重，需要在字段复核阶段确认业务口径。
2. HIGH 字段差异候选数量较多，下一步不能直接做大范围 schema 改造，必须先出字段映射审查表。
3. 本次没有写好业财，后续写回仍保持 HOLD。
4. 好业财凭证、应收应付、订单、科目等字段必须先做只读对齐和样本脱敏审查，再决定 ERP 端改造。

## 9. 下一步

推荐进入:

`CHANJET_FIELD_GAP_REVIEW_GATE`

目标:

1. 读取 `chanjet_erp_field_mapping` 的 1677 个 PENDING 候选。
2. 按 endpoint / risk_level / ERP domain 聚合。
3. 找出 ERP 已覆盖、可映射、缺字段、类型冲突、业务不该映射的项目。
4. 输出 ERP 字段改造优先级，不写好业财。

## 10. 当前结论

GO WITH CONDITIONS。

好业财只读同步第一步已完成。下一步进入字段差异复核和 ERP 适配计划，不进入好业财写回。
