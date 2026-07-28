# 好业财与 Phoenix ERP WMS 生产级实现验收报告

## 1. 验收结论

- **代码实现**：`GO_WITH_CONDITIONS`
- **生产运行**：`HOLD`
- **好业财写入**：禁用
- **ERP 库存事实写入**：本轮未执行
- **迁移执行**：本轮未执行
- **推送 / 部署**：本轮未执行

生产 HOLD 不代表代码未完成。当前阻断是好业财 `OTHER_STOCK_IN`、`RETAIL_STOCK_OUT` 在三个账套共 6 个 scope 返回 `50111`，以及新迁移尚未部署。系统不会把 27/33 伪报为完整生产基线。

## 2. 已完成能力

### WMS 业务策略

1. 入库覆盖采购、生产完工、销售退货、生产退料、其他/调整及调拨接收。
2. 出库覆盖销售、生产领用、后勤、配件、办公、维修、退货供应商、报废/损耗、调整、零售和调拨。
3. 销售出库只允许 SKU；生产/后勤/配件等领用只允许材料。
4. 调拨校验源仓、目标仓、批次状态、可用量和三位小数精度，并保留目标批次追溯身份。
5. 盘点、损耗和调拨在事务内逐批次执行 DataScope 校验，事务错误不再被吞掉。
6. 损耗不得超过可用库存，台账保留精确业务类型。

### 好业财只读合同与差异引擎

1. 11 类官方库存合同覆盖 3 个启用账套，共 33 个 scope。
2. 统一 canonical document/line，覆盖状态、红蓝单、仓库、商品、批次、双计量、税额、成本、源单和附件证据。
3. 唯一身份为 `book + entity_type + external_id`；只有编码时强制 `NEED_MANUAL_REVIEW`，无身份时持久化为 `HOLD`，不再静默跳过。
4. 精确映射覆盖公司、仓库、商品/SKU、UOM、币种；名称相似不能自动批准。
5. 差异状态固定为 `OK / WARN / MISMATCH / HOLD / NEED_MAPPING / NEED_MANUAL_REVIEW`。

### Promotion 与反向同步准备

1. 新增 `chanjet_wms_promotion_candidates`，只保存证据，不旁路写 `inv_batches`、`inv_ledger` 或 WMS 单据。
2. 新增 `chanjet_wms_writeback_outbox`，具备幂等键、payload hash、审批引用、状态历史、重试上限、回执、回读和补偿字段。
3. Outbox 只接受已审查的 WMS 单据类型和明确 ERP 单号。
4. `externalWriteEnabled=false`；没有外部执行 API，调用执行方法必定返回 `CHANJET_WMS_EXTERNAL_WRITE_DISABLED`。
5. 普通业务页只显示来源、新鲜度和差异；中间层候选/Outbox 只在管理员控制台显示。

## 3. 数据证据

| 指标 | 结果 |
| --- | ---: |
| 启用账套 | 3 |
| 官方库存合同 | 11 |
| 预期 scope | 33 |
| 新鲜成功 scope | 27 |
| 权限失败 scope | 6 |
| 最新成功批次行 | 3,490 |
| 中间层实体 | 3,659 |
| 标准化单据 | 2,625 |
| 标准化明细 | 9,655 |
| 原始镜像覆盖率 | 100% |
| 当前生产业务列覆盖率 | 98.1% |

六个失败项均为 `OTHER_STOCK_IN`、`RETAIL_STOCK_OUT` × 三账套，错误为好业财 `50111 openToken无调用该接口的权限`。

## 4. Schema 处理

1. 旧合同中的 `wms_outbound.department` 是审计命名错误，已更正为现有 `department_code`，不新增重复列。
2. 新迁移 `1785400000000-CompleteChanjetWmsBridge.ts` 增加 `wms_outbound.currency_code`。
3. 同一迁移创建 promotion candidate 与 WMS Outbox 表。
4. 迁移具备完整 `down()`，通过 no-data-DML 和 nullable-unique 门禁。
5. 本轮未执行迁移，生产 DB 未变更。

## 5. 验证结果

| 验证 | 结果 |
| --- | --- |
| Chanjet 合同/差异/桥接测试 | 3 suites / 29 tests PASS |
| WMS 策略与 service 测试 | 3 suites / 29 tests PASS |
| 前端 WMS view model | 3 tests PASS |
| API TypeScript | PASS |
| Web TypeScript | PASS |
| WMS DataScope 写门禁 | PASS |
| migration down() | PASS |
| migration no-data-DML | PASS |
| nullable unique | PASS |
| security regression | 显式授权审查 PASS/WARN |
| freeze boundary | 显式授权审查 PASS/WARN |

静态门禁在不带授权标志时正确拒绝本轮敏感 WMS、好业财和迁移改动；使用本轮批准范围的显式标志后通过。该行为属于门禁有效，不是绕过。

## 6. 修改文件摘要

- 后端：WMS 入出库策略、事务实现、好业财 canonical 合同、差异引擎、promotion、Outbox、受控 API。
- 前端：好业财管理员控制台、库存分析/销售/门店/终端业务来源与差异提示。
- 数据库：一个 TypeORM TS 迁移，未执行。
- CI：WMS DataScope 门禁同步为逐批次校验契约。

## 7. 生产放行条件

1. 好业财开通 6 个失败 scope，重跑后达到 33/33。
2. 经 migration Gate 执行新迁移，复核业务列覆盖率 100%。
3. 刷新 promotion candidates，解决真实 `NEED_MAPPING / NEED_MANUAL_REVIEW / HOLD`。
4. A2 复核权限、DataScope、幂等、外部写入禁用和审计。
5. A1 复核迁移、类型检查、W5 与回归。
6. A7 给出 canary 的 GO/HOLD。
7. 未得到独立单笔批准前，不开放任何好业财 WMS 写入。
