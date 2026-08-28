# 补货及全模块名称显示排查闭环（2026-08-28）

## 结论

本次确认了两类根因：lookup 丢失已有三语列；列表/详情直接渲染业务编码。已统一仓库、门店、SKU 共享 Selector 的 locale 选名逻辑，并闭环补货申请的源仓、目标仓、列表、移动卡、确认页、调拨详情、商品明细和差异卡。编码仍作为辅助追溯信息显示，未修改任何业务编码或状态机语义。

统一回退顺序为：当前界面语言 → 中文 → 英文 → 老挝语 → 基础名称 → 编码。支持 camelCase lookup 响应和 snake_case raw row。

## 数据层盘点

| 表 | 名称列 | 多语言结论 | 本次处理 |
|---|---|---|---|
| `wms_warehouses` | `warehouse_name`, `warehouse_name_zh`, `warehouse_name_en`, `warehouse_name_lo` | 三语列齐全 | lookup/source/list/transfer 全量返回 |
| `mst_stores` | `store_name`, `store_name_en`, `store_name_lo` | 基础名作为中文回退 | `/lookup/stores` 返回三语 |
| `store_master` | `store_name` | 无三语列 | membership 按 `store_code` 左连 `mst_stores`，无匹配时回退单名 |
| `product_skus` | `sku_name`, `sku_name_en`, `sku_name_lo` | 三语列齐全 | Selector 与调拨明细按 locale 显示 |
| `wms_zones` | `zone_name` | 无 `_zh/_en/_lo` | 保留唯一名称，禁止伪造翻译 |
| `wms_locations` | `location_name` | 无 `_zh/_en/_lo` | 保留唯一名称，禁止伪造翻译 |

源码证据：`1782700000000-AddMasterDataMultilingualNames.ts`；生产覆盖率原计划经 `ssh erp` 只读查询，但执行环境 DNS 无法解析该别名，未以失败输出冒充生产 PASS。部署后的 GitHub 只读 workflow 负责最终取证。

## 页面矩阵

| 页面/显示点 | 原现状 | 本次结果 |
|---|---|---|
| 补货新建源仓/审批源仓 | 固定 `warehouseName` | locale 名称（编码），缺值安全回退 |
| 补货目标门店 | `store_master.store_name` 单名 | 左连 `mst_stores` 三语后 locale 显示 |
| 补货列表/移动卡源仓→门店仓 | 仅 code | 两端名称（编码） |
| 补货确认步骤 | 门店 code、仓库 code、紧急度 code | 已选名称（编码）及本地化紧急度 |
| 补货申请/调拨详情 | 仓库 code、SKU code | 仓库和 SKU 名称（编码） |
| 补货差异卡/处理下拉 | `SHORTAGE/DAMAGE/LOSS/ADJUSTMENT` | 三语业务标签 |
| Warehouse/Store/SKU Selector | 固定 name | 统一 locale helper |
| Zone/Location Selector | 唯一名称 | 保持名称（编码），无多语言列时优雅回退 |

全仓审计同时发现的展示层存量（不改变本次补货业务语义）：入库、出库、调拨、盘点、报损、库存查询、库存台账、临期预警、门店库存/损耗、PDA 入出库/盘点、库位管理和仓储首页活动流仍有部分列表仅消费 code。其表单多数已经使用本次修复后的共享 Selector；后续列表应在各自查询端补名称 join 后复用同一 helper，禁止把 code 原地替换为 label，以免污染筛选和写入参数。报损列表另发现 `zone_code` 标为“报损品目”、`warehouse_code` 标为“批次/库区”的历史字段错配，应单独按该页响应契约修复并回归。

## 接口兼容性

- `/api/lookup/warehouses`、`/api/lookup/stores` 和补货 `source-warehouses` 保留原字段，仅追加 `*NameZh/En/Lo`。
- 补货列表保留原 code，追加源/目标仓名称列。
- 调拨详情保留原结构，追加两端仓库名称和 item `sku_name*`。
- 无 schema 迁移、无生产数据写入、无编码变更。

## 回归证据

- 红：`localized-master-data.test.ts` 初次执行因实现文件不存在失败。
- 绿：localized helper + Selector + 补货三语契约共 16/16 通过。
- Web：`tsc --noEmit` 0 error。
- API：`tsc --noEmit` 0 error。
- 约束门禁：`check-constraint-drift` 0 new drift（1 条既有 allowlist）。
- 生产只读直连：当前执行环境 `ssh erp` DNS 解析失败；必须以部署 workflow 的 amei GET、错误窗口与 revision 三方一致性作为最终证据。

## 首轮生产回归与修正

- full 部署 run `33155311408` 成功，checkout/API/Web revision 均为 `8a6da16e5fdb6a19c72a4be1590215ac2238aa2c`。
- amei 只读 run `33156168695` 已证明补货页面 HTTP 200、zh/en/lo bundle 齐全、membership 与 WarehouseScope 正常；在补货列表 GET 处失败。
- 根因：列表是 `json_agg` 聚合查询，首次增强把仓库名称列直接加入 SELECT，仅按 `warehouse_code` GROUP BY；该列不是表主键，生产 PostgreSQL 不接受该函数依赖。
- 修正：名称列使用 `MAX(...)` 聚合，GROUP BY 恢复申请与门店键。名称 join 为一对一，聚合不改变业务结果。
