# 好业财 WMS 全量只读基线实施报告

## 1. 最终结论

当前结论：**HOLD**

11 类库存接口、三个启用账套共形成 33 个只读 scope。本轮生产同步 27 个成功，6 个因好业财 `openToken` 缺少接口权限而失败。成功 scope 最新批次读取 3,490 行；ERP 好业财中间层当前保留 3,659 个外部实体、2,625 张单据和 9,655 条明细。

本轮没有写好业财，没有修改 ERP `wms_inbound`、`wms_outbound`、`inv_batches` 或 `inv_ledger`。ERP 到好业财反向同步继续关闭。

## 2. 发现并修复的根因

### 2.1 历史读取范围不完整

历史生产同步仅覆盖 `STOCK_IN` 和 `SALES_STOCK_OUT`。本阶段已扩展到余额、批次余额、产成品入库、材料出库、其他出入库、调拨、盘点和零售出库等 11 类官方库存接口。

### 2.2 分页会静默截断

好业财部分接口即使请求 100 行，也可能每页只返回 50 行。旧逻辑把“返回行数小于请求页大小”误判为最后一页，会把多页数据静默截断。

现已改为：

1. 仅空页或官方声明的总数/总页数可以结束分页。
2. 对相邻页生成指纹；若提供方忽略页码并重复返回同一页，立即 fail closed。
3. 增加分页回归测试，禁止再次把短页当作结束条件。

### 2.3 空结果被误判为未同步

合法成功但为 0 行的 scope 过去会因没有实体快照而被当作缺失。现在新鲜度以成功的 `SNAPSHOT` job 为准，行数从实体镜像和任务摘要读取；空结果可正确记为“成功且为空”，最近失败仍单独暴露。

## 3. 生产同步结果

| Scope | 账套一 | 账套二 | 账套三 | 合计 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| `STOCK_IN` | 0 | 0 | 0 | 0 | PASS |
| `SALES_STOCK_OUT` | 0 | 0 | 0 | 0 | PASS |
| `INVENTORY_ON_HAND` | 278 | 125 | 0 | 403 | PASS |
| `INVENTORY_ON_HAND_LOT` | 323 | 152 | 0 | 475 | PASS |
| `FINISHED_GOODS_STOCK_IN` | 390 | 308 | 0 | 698 | PASS |
| `MATERIAL_STOCK_OUT` | 418 | 424 | 0 | 842 | PASS |
| `OTHER_STOCK_IN` | FAIL | FAIL | FAIL | 0 | HOLD：`50111 openToken无调用该接口的权限` |
| `OTHER_STOCK_OUT` | 436 | 621 | 0 | 1,057 | PASS |
| `STOCK_TRANSFER` | 0 | 9 | 0 | 9 | PASS |
| `STOCK_COUNT` | 2 | 2 | 2 | 6 | PASS |
| `RETAIL_STOCK_OUT` | FAIL | FAIL | FAIL | 0 | HOLD：`50111 openToken无调用该接口的权限` |

账套一为 `3533914511118750`，账套二为 `3537748712226818`，账套三为 `3539743721526654`。

3,490 是本次成功 API 批次的返回行数。3,659 是中间层按 `book_id + entity_type + external_id` 保存的当前/历史外部实体数；中间层不是破坏性全量替换，因此两个数字口径不同，不得互相替代。

## 4. 数据质量与字段覆盖

| 指标 | 结果 |
| --- | ---: |
| 启用账套 | 3 |
| 库存合同 | 11 |
| 预期 scope | 33 |
| 成功且新鲜 scope | 27（81.8%） |
| 失败 scope | 6（18.2%） |
| 中间层实体 | 3,659 |
| 标准化单据 | 2,625 |
| 标准化明细 | 9,655 |
| 官方观测字段 | 120 |
| 原始镜像保真覆盖 | 100% |
| ERP 业务列覆盖 | 98.1% |

ERP 仍缺两列：

- `wms_outbound.department`
- `wms_outbound.currency_code`

字段覆盖率高不等于可直接形成 ERP 库存。公司、仓库、商品/SKU、计量单位、批次、部门、项目及往来单位必须完成精确映射，差异必须可追溯。

## 5. ERP 业务和权威边界

1. 好业财库存数据先进入只读中间层镜像。
2. 好业财现存量和单据用于源数据重现、映射、对账、差异解释和未来 promotion candidate。
3. ERP 实际库存增减仍必须通过 WMS 原子确认事务。
4. 未映射、口径不一致或来源权限不足时必须 `HOLD`，不静默覆盖。
5. 红字单、双计量、成本、税、批次和源单关系必须保留。

## 6. 反向同步就绪度

当前结论：**HOLD**

- `externalWriteEnabled=false`
- 库存专用 Outbox 未实现
- 11 类 canonical write contract 未完成
- 仓库/SKU/UOM/批次映射未达到 100%
- 红蓝单、撤销、回读和补偿合同未完成 A2/A1/A7 审查

ERP 端会按完整业务逻辑准备反向同步，但在单据草稿、幂等、回执、回读、补偿和单笔 canary 全部通过前，不调用好业财写接口。

## 7. 验证和部署

- 聚焦测试：75/75 PASS。
- API typecheck：PASS。
- WMS 分页短页与重复页回归：PASS。
- CI/CD：run `30346579170` SUCCESS。
- 生产部署 commit：`86fe2113200e4c8374edfe820d493482a38fad32`。
- migration：未新增、未执行。
- 好业财写入：否。
- ERP 库存事实写入：否。

## 8. 下一 Gate

进入 `CHANJET_WMS_SOURCE_PERMISSION_AND_SCHEMA_CLOSURE`：

1. 补齐 `OTHER_STOCK_IN` 和 `RETAIL_STOCK_OUT` 的好业财 API 权限并重跑 6 个失败 scope。
2. 增加或建立 `department`、`currency_code` 的受控语义映射。
3. 完成主数据映射基线和逐单/逐批次差异中心。
4. 在 33/33 scope、字段和映射基线全部通过前，反向同步保持 HOLD。

完整实施顺序见 `docs/ops/CHANJET_ERP_WMS_SYNC_BASELINE_AND_GAP_PLAN.md`。
