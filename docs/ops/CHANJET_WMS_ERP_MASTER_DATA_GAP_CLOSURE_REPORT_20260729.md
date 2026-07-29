# 好业财 WMS ERP 主数据缺口分层与权限复核报告

## 结论

`GO_WITH_CONDITIONS`。

本轮完成了 WMS 映射缺口的可执行分层、服务端防误映射门禁和供应商权限只读复核入口。没有写好业财，没有修改 ERP 库存事实，没有执行 migration。

当前仍不得晋级库存单据：

- 生产只读基线仍为 27/33，`OTHER_STOCK_IN`、`RETAIL_STOCK_OUT` 在三个账套共 6 个 Scope 返回供应商错误 `50111`。
- 187 条源身份中 16 条已映射，171 条需要补主数据、换算关系或业务归属，当前覆盖率 8.56%。
- 未得到完整主数据证据前，晋级候选和 WMS 写回保持 HOLD。

## 根因

好业财 WMS 源维度不是 ERP 主数据类型的一一对应：

1. 好业财“仓库”同时包含真实仓库、总仓、粮仓、冷库和鸡舍。
2. 好业财“存货”同时包含蛋品 SKU、兽药/疫苗/饲料/包材、活禽。
3. 好业财“单位”同时包含基础计量单位、包装单位和依赖业务对象的计数单位。
4. 原管理页只显示 `NEED_MAPPING` 和一整套候选，缺少实体类型解释，管理员可能误把鸡舍映射成仓库、把“桶/袋”直接映射成无换算率单位。
5. 产品精确匹配原先只允许 `PRODUCT`，即使 ERP 已存在完全相同的 `SKU` 或 `MATERIAL` 也不能闭环。

## 生产只读缺口分层

以下基于 2026-07-29 生产只读 `mapping-gaps` 证据计算。行数是“账套内源身份”数，名称数是跨账套去重后的源名称数。

| 缺口类别 | 行数 | 唯一名称数 | 处理规则 |
| --- | ---: | ---: | --- |
| 蛋品 SKU 待对齐 | 45 | 21 | 只允许映射到 `SKU`；等级/规格不完整时 HOLD |
| 商品实体类型待核准 | 37 | 34 | 核准为 PRODUCT/SKU/MATERIAL/LIVESTOCK 后再映射 |
| 物料主档待补齐 | 33 | 29 | 只允许映射到 `MATERIAL` |
| 活禽主档与核算策略待补齐 | 9 | 6 | 禁止直接晋级 WMS，先定义活禽库存与核算策略 |
| 鸡舍库存归属待桥接 | 14 | 8 | 禁止映射成仓库；建立 `brd_houses` 到标准仓库/库位归属 |
| 仓库主档待补齐 | 11 | 9 | 按账套公司补齐或激活真实仓库后映射 |
| 包装单位换算待定义 | 18 | 11 | 必须有 SKU/物料级换算率，禁止仅凭名称映射 |
| 场景计量单位待定义 | 2 | 1 | “只”等单位依赖活禽/商品上下文，保持 HOLD |
| 基础计量单位待定义 | 2 | 2 | 补入标准 UOM 目录后再映射 |
| 合计 | 171 | - | 所有非精确证据均禁止模糊自动闭环 |

## 本轮实现

### 后端

- 新增 `chanjet-wms-gap-classifier.ts`，输出：
  - `gapClass`
  - `riskLevel`
  - `suggestedEntityType`
  - `classificationReason`
  - `nextAction`
  - `autoCloseEligible`
- `mappingGapOverview()` 新增 `byGapClass` 和可唯一闭环数量。
- 产品源身份的唯一精确匹配支持 ERP `PRODUCT`、`SKU`、`MATERIAL`。
- 唯一候选按 `entity_type + code` 去重，避免不同主档类型同编码被错误折叠。
- `INV_UOM` 字典已接入 ERP UOM 候选读取；当前无该字典时继续使用产品/包装规格的已生效单位。
- 服务端强制拒绝：
  - 鸡舍直接映射仓库。
  - 活禽在未定义库存/核算策略时映射。
  - 桶、袋、件、盘等包装单位在无换算策略时映射。
  - 蛋品映射到非 SKU、物料映射到非 MATERIAL。

### 管理页

- 展示缺口分类汇总、风险等级和中文下一动作。
- 候选下拉按建议实体类型收窄。
- 鸡舍、活禽、包装单位和场景单位不再显示可误选目标。
- 新增供应商权限“只读重试”，只调用现有 resilient readonly mirror，不调用好业财写接口。

## 自动化边界

- 唯一精确、同公司、同实体类型的 ACTIVE ERP 主档可以由候选刷新闭环。
- 相似名称不自动映射。
- 鸡舍不等于仓库。
- 包装单位不等于基础单位。
- 源身份存在不等于允许晋级 ERP 库存。
- 好业财 write/delete/modify 均为 false。
- ERP `inv_batches`、`inv_ledger`、业务出入库单据均未修改。

## 验证

- Chanjet WMS 聚焦单测：28/28 PASS。
- API TypeScript：PASS。
- Web TypeScript：PASS。
- 无 migration。
- 无 DB write。
- 无好业财写入。

## 下一 Gate

`CHANJET_WMS_ERP_MASTER_STAGING_AND_HOUSE_LOCATION_POLICY`

1. 生成 9 个真实仓库唯一候选的 ERP 主档 staging manifest，按账套公司去重。
2. 将 8 个鸡舍名称关联 `brd_houses`，定义其标准仓库和库位归属，不把鸡舍建成仓库。
3. 将 21 个蛋品名称对齐 ERP grade/spec/SKU 组合。
4. 将 29 个可证明物料名称与 `mst_materials` 做确定性候选；仍不做模糊自动审批。
5. 建立基础 UOM 与 SKU/物料包装换算的独立合同。
6. 供应商开放 `OTHER_STOCK_IN` / `RETAIL_STOCK_OUT` 后运行只读重试，目标 33/33。
7. 只有 33/33、新主数据映射完整、A2/A1/A5/A7 全部通过后，才允许单笔 ERP 侧晋级 canary。
