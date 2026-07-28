# 好业财与 Phoenix ERP 出入库映射矩阵

## 1. 单据映射

| 好业财对象 | ERP 对象 | 等效程度 | 说明 |
| --- | --- | --- | --- |
| 采购入库单 | `wms_inbound` + `wms_inbound_items` | 字段等效 | 只对应 `PURCHASE` 入库 |
| 销售出库单 | `wms_outbound` + `wms_outbound_items` | 字段等效 | 只对应 `SALES` 出库 |
| 采购订单来源 | ERP 采购订单/收货源单 | 可追溯 | 保留 source order id/no |
| 销售订单来源 | ERP 销售订单/配送源单 | 可追溯 | 保留 source order id/no |
| 内部领用 | ERP `PRODUCTION/FEED/MEDICINE/LOGISTICS/SPARE_PARTS/OFFICE/MAINTENANCE` | ERP 扩展 | 好业财销售出库不能替代 |
| 调拨 | ERP 原子调拨流程 | ERP 扩展 | 不拆成两个无关联单据 |

## 2. 字段组映射

| 字段组 | 好业财字段 | ERP 标准落点 | 规则 |
| --- | --- | --- | --- |
| 外部身份 | `id/code/externalCode` | `external_document_id/no` | 账套内幂等 |
| 状态 | `voucherStatusEnum` | `external_status` + ERP workflow | 未知值 HOLD |
| 账套 | URL `{bookid}` | `external_book_id` | 每个启用账套单独同步 |
| 日期 | `bizDate` | `date` | 保留业务日期 |
| 红蓝 | `redBlueFlagEnum` | `red_blue_flag` | 冲销语义不丢失 |
| 往来单位 | `custVendor*` / `vendor*` | `counterparty_*` | 采购入库 |
| 客户 | `soldToCustomer*` / `billToCustomer*` | `sold_to_*` / `bill_to_*` | 销售出库 |
| 组织 | `department*` | `department_code/name` | 需公司/数据域映射 |
| 经办人 | `bizEmployee*` | `biz_employee_code/name` | 不用名称猜用户 |
| 项目 | `project*` | `project_code/name` | 销售出库及成本对象 |
| 仓库 | `warehouse*` | `warehouse_code/name` | 必须完成仓库映射 |
| 币种 | `currencyId/code/name` | `currency_*` | 金额口径必需 |
| 源单 | `refVoucher*` / `src*Order*` | `source_order_id/no` | 防重复和链路追溯 |
| 发票 | `invoiceNo/Amount` | `invoice_no/amount` | 采购入库辅助字段 |
| 物流 | 地址、联系人、提货、承运、司机、车牌、运单 | `wms_outbound` 对应列 | 销售履约 |
| 商品 | `productCode/Name/SpecNo/barcode` | item 表标准列 | code 为主，名称只展示 |
| 批号 | `inventoryLotNo` | `inventory_lot_no` | 与 ERP batch 映射后使用 |
| 主计量 | `transQty/transUomName` | `trans_qty/trans_uom_name` | 不跨单位聚合 |
| 辅计量 | `trans2Qty/trans2UomName` | `trans2_qty/trans2_uom_name` | 不丢双计量 |
| 价格税额 | 含/不含税价额、税率、税额、折扣 | item 财务列 | Decimal，不用浮点推断 |
| 成本费用 | `costPrice/costAmount/allocatedExpenseAmount` | 入库 item 成本列 | 只读对账 |
| 赠品 | `isFreeGift` | `is_free_gift` | 金额为零也保留业务语义 |
| 序列号 | `serialNumberList` | `serial_numbers` JSONB | 保留完整数组 |
| 附件 | `attachmentList` | 中间层 raw + 受控元数据 | 禁止裸 URL |
| 未公开/扩展 | `customFieldMap` 等 | `external_raw` / snapshot raw | 无损保存 |

## 3. 差异处理

| 差异 | 状态 | 处理 |
| --- | --- | --- |
| 账套未映射公司 | `NEED_MAPPING` | 不导入业务表 |
| 商品编码无 ERP 主数据 | `NEED_MAPPING` | 不按名称自动创建 |
| 仓库编码无映射 | `HOLD` | 库存数量不可落账 |
| 单位不一致 | `HOLD` | 禁止跨单位相加 |
| 好业财已生效、ERP 未确认 | `MISMATCH` | 进入对账中心 |
| ERP 已确认、好业财无单据 | `WARN` | 检查业务范围/同步 freshness |
| 金额或数量不同 | `MISMATCH` | 展示两端值与差额 |
| 未知状态或红字语义不明 | `HOLD` | 人工 Gate |

## 4. 未来写入前置 Gate

本轮不写好业财。未来若申请写入，必须同时满足：

1. 目标账套、公司、客户/供应商、仓库、商品、单位、税率和源单映射均为 `LOCKED`。
2. 单据草稿通过 A2 权限/DataScope 与 A1 契约/类型/幂等验证。
3. 用户批准具体单据、目标账套和操作类型。
4. 保存请求 hash、幂等键、好业财 requestId、回执和只读回查。
5. 先单笔 canary，再小范围试点；禁止由只读同步自动升级为写入。
