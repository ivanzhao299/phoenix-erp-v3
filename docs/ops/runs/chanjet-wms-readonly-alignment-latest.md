# 好业财 WMS 只读对齐审计

生成时间：2026-07-28T09:45:13.365Z

结论：**HOLD**

## 摘要

- 启用账套：3
- 官方库存接口：11
- 新鲜 scope：27/33
- 最近失败 scope：6
- 中间层库存行：3659
- 只读单据/明细：2625/9655
- 官方字段：120
- ERP 业务字段覆盖：98.1%
- 缺失业务列：2

## 账套 Scope

|库存范围|账套|bookId|镜像行数|同步状态|最近同步|
|---|---|---|---:|---|---|
|入库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|0|SUCCESS|2026-07-28T09:42:17.655Z|
|销售出库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|0|SUCCESS|2026-07-28T09:42:32.482Z|
|库存现存量|老挝东鹏县星驰农业发展有限公司|3537748712226818|251|SUCCESS|2026-07-28T09:42:47.291Z|
|库存批次现存量|老挝东鹏县星驰农业发展有限公司|3537748712226818|178|SUCCESS|2026-07-28T09:43:03.642Z|
|产成品入库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|308|SUCCESS|2026-07-28T09:43:21.277Z|
|材料出库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|436|SUCCESS|2026-07-28T09:43:41.273Z|
|其他入库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|0|FAIL|MISSING|
|其他出库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|622|SUCCESS|2026-07-28T09:44:01.533Z|
|调拨单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|9|SUCCESS|2026-07-28T09:44:15.015Z|
|盘点单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|2|SUCCESS|2026-07-28T09:44:28.223Z|
|零售出库单列表|老挝东鹏县星驰农业发展有限公司|3537748712226818|0|FAIL|MISSING|
|入库单列表|老挝凤凰农业发展有限公司|3533914511118750|0|SUCCESS|2026-07-28T09:42:17.403Z|
|销售出库单列表|老挝凤凰农业发展有限公司|3533914511118750|0|SUCCESS|2026-07-28T09:42:32.261Z|
|库存现存量|老挝凤凰农业发展有限公司|3533914511118750|280|SUCCESS|2026-07-28T09:42:46.832Z|
|库存批次现存量|老挝凤凰农业发展有限公司|3533914511118750|325|SUCCESS|2026-07-28T09:43:02.831Z|
|产成品入库单列表|老挝凤凰农业发展有限公司|3533914511118750|390|SUCCESS|2026-07-28T09:43:19.341Z|
|材料出库单列表|老挝凤凰农业发展有限公司|3533914511118750|418|SUCCESS|2026-07-28T09:43:38.219Z|
|其他入库单列表|老挝凤凰农业发展有限公司|3533914511118750|0|FAIL|MISSING|
|其他出库单列表|老挝凤凰农业发展有限公司|3533914511118750|436|SUCCESS|2026-07-28T09:43:57.431Z|
|调拨单列表|老挝凤凰农业发展有限公司|3533914511118750|0|SUCCESS|2026-07-28T09:44:14.607Z|
|盘点单列表|老挝凤凰农业发展有限公司|3533914511118750|2|SUCCESS|2026-07-28T09:44:27.900Z|
|零售出库单列表|老挝凤凰农业发展有限公司|3533914511118750|0|FAIL|MISSING|
|入库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:42:17.864Z|
|销售出库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:42:32.716Z|
|库存现存量|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:42:47.527Z|
|库存批次现存量|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:43:03.864Z|
|产成品入库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:43:21.518Z|
|材料出库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:43:41.449Z|
|其他入库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|FAIL|MISSING|
|其他出库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:44:01.718Z|
|调拨单列表|老挝凤凰食品集团有限公司|3539743721526654|0|SUCCESS|2026-07-28T09:44:15.220Z|
|盘点单列表|老挝凤凰食品集团有限公司|3539743721526654|2|SUCCESS|2026-07-28T09:44:28.529Z|
|零售出库单列表|老挝凤凰食品集团有限公司|3539743721526654|0|FAIL|MISSING|

## 字段契约

|单据|好业财字段|标准字段|ERP 落点|存储层|必需|
|---|---|---|---|---|---|
|入库单列表|id|externalDocumentId|wms_inbound.external_document_id|BUSINESS_COLUMN|Y|
|入库单列表|code|externalDocumentCode|wms_inbound.external_document_no|BUSINESS_COLUMN|Y|
|入库单列表|externalCode|externalCode|wms_inbound.external_document_id|BUSINESS_COLUMN|N|
|入库单列表|voucherStatusEnum|status|wms_inbound.external_status|BUSINESS_COLUMN|Y|
|入库单列表|redBlueFlagEnum|redBlueFlag|wms_inbound.red_blue_flag|BUSINESS_COLUMN|N|
|入库单列表|bizDate|businessDate|wms_inbound.date|BUSINESS_COLUMN|Y|
|入库单列表|custVendorCode|counterpartyCode|wms_inbound.counterparty_code|BUSINESS_COLUMN|N|
|入库单列表|custVendorName|counterpartyName|wms_inbound.counterparty_name|BUSINESS_COLUMN|N|
|入库单列表|vendorCode|counterpartyCode|wms_inbound.counterparty_code|BUSINESS_COLUMN|N|
|入库单列表|vendorName|counterpartyName|wms_inbound.counterparty_name|BUSINESS_COLUMN|N|
|入库单列表|departmentCode|departmentCode|wms_inbound.department_code|BUSINESS_COLUMN|N|
|入库单列表|departmentName|departmentName|wms_inbound.department_name|BUSINESS_COLUMN|N|
|入库单列表|bizEmployeeCode|employeeCode|wms_inbound.biz_employee_code|BUSINESS_COLUMN|N|
|入库单列表|bizEmployeeName|employeeName|wms_inbound.biz_employee_name|BUSINESS_COLUMN|N|
|入库单列表|expenseNoteTypeEnum|expenseNoteType|wms_inbound.expense_note_type|BUSINESS_COLUMN|N|
|入库单列表|invoiceNo|invoiceNo|wms_inbound.invoice_no|BUSINESS_COLUMN|N|
|入库单列表|invoiceAmount|invoiceAmount|wms_inbound.invoice_amount|BUSINESS_COLUMN|N|
|入库单列表|comments|comments|wms_inbound.comments|BUSINESS_COLUMN|N|
|入库单列表|refVoucherCode|sourceOrderNo|wms_inbound.source_order_no|BUSINESS_COLUMN|N|
|入库单列表|srcPurchaseOrderId|sourceOrderId|wms_inbound.source_order_id|BUSINESS_COLUMN|N|
|入库单列表|warehouseCode|warehouseCode|wms_inbound.warehouse_code|BUSINESS_COLUMN|Y|
|入库单列表|warehouseName|warehouseName|wms_inbound.warehouse_name|BUSINESS_COLUMN|N|
|入库单列表|attachmentList|attachments|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|入库单列表|voucherDetailList[].id|externalLineId|wms_inbound_items.external_line_id|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].externalCode|externalLineCode|wms_inbound_items.external_line_code|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].productCode|productCode|wms_inbound_items.product_code|BUSINESS_COLUMN|Y|
|入库单列表|voucherDetailList[].productName|productName|wms_inbound_items.product_name|BUSINESS_COLUMN|Y|
|入库单列表|voucherDetailList[].productSpecNo|productSpecNo|wms_inbound_items.product_spec_no|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].itemBarcode|itemBarcode|wms_inbound_items.item_barcode|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].warehouseCode|warehouseCode|wms_inbound_items.warehouse_code|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].warehouseName|warehouseName|wms_inbound_items.warehouse_name|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].inventoryLotNo|inventoryLotNo|wms_inbound_items.inventory_lot_no|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].transQty|quantity|wms_inbound_items.trans_qty|BUSINESS_COLUMN|Y|
|入库单列表|voucherDetailList[].transUomName|unitName|wms_inbound_items.trans_uom_name|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].trans2Qty|secondaryQuantity|wms_inbound_items.trans2_qty|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].trans2UomName|secondaryUnitName|wms_inbound_items.trans2_uom_name|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].listPrice|listPrice|wms_inbound_items.list_price|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netPriceWithTax|netPriceWithTax|wms_inbound_items.net_price_with_tax|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netPriceWithoutTax|netPriceWithoutTax|wms_inbound_items.net_price_without_tax|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netAmountWithTax|netAmountWithTax|wms_inbound_items.net_amount_with_tax|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netAmountWithoutTax|netAmountWithoutTax|wms_inbound_items.net_amount_without_tax|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].taxPct|taxRate|wms_inbound_items.tax_rate|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netTax|taxAmount|wms_inbound_items.tax_amount|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].costPrice|costPrice|wms_inbound_items.cost_price|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].costAmount|costAmount|wms_inbound_items.cost_amount|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].netDiscount|discountAmount|wms_inbound_items.discount_amount|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].vBaseAllocatedExpenseAmount|allocatedExpenseAmount|wms_inbound_items.allocated_expense_amount|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].isFreeGift|freeGift|wms_inbound_items.is_free_gift|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].srcPurchaseOrderId|sourceOrderId|wms_inbound_items.source_order_id|BUSINESS_COLUMN|N|
|入库单列表|voucherDetailList[].hierarchyPkgQtysText|packageQuantityText|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|入库单列表|voucherDetailList[].isDirectStockOut|directStockOut|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|入库单列表|voucherDetailList[].serialNumberList|serialNumbers|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|销售出库单列表|id|externalDocumentId|wms_outbound.external_document_id|BUSINESS_COLUMN|Y|
|销售出库单列表|code|externalDocumentCode|wms_outbound.external_document_no|BUSINESS_COLUMN|Y|
|销售出库单列表|externalCode|externalCode|wms_outbound.external_document_id|BUSINESS_COLUMN|N|
|销售出库单列表|voucherStatusEnum|status|wms_outbound.external_status|BUSINESS_COLUMN|Y|
|销售出库单列表|srcWebsiteEnum|source|wms_outbound.external_source|BUSINESS_COLUMN|N|
|销售出库单列表|redBlueFlagEnum|redBlueFlag|wms_outbound.red_blue_flag|BUSINESS_COLUMN|N|
|销售出库单列表|bizDate|businessDate|wms_outbound.date|BUSINESS_COLUMN|Y|
|销售出库单列表|soldToCustomerCode|soldToCustomerCode|wms_outbound.sold_to_customer_code|BUSINESS_COLUMN|N|
|销售出库单列表|soldToCustomerName|soldToCustomerName|wms_outbound.sold_to_customer_name|BUSINESS_COLUMN|N|
|销售出库单列表|billToCustomerCode|billToCustomerCode|wms_outbound.bill_to_customer_code|BUSINESS_COLUMN|N|
|销售出库单列表|billToCustomerName|billToCustomerName|wms_outbound.bill_to_customer_name|BUSINESS_COLUMN|N|
|销售出库单列表|departmentCode|departmentCode|wms_outbound.department|BUSINESS_COLUMN|N|
|销售出库单列表|departmentName|departmentName|wms_outbound.department_name|BUSINESS_COLUMN|N|
|销售出库单列表|bizEmployeeCode|employeeCode|wms_outbound.biz_employee_code|BUSINESS_COLUMN|N|
|销售出库单列表|bizEmployeeName|employeeName|wms_outbound.biz_employee_name|BUSINESS_COLUMN|N|
|销售出库单列表|projectCode|projectCode|wms_outbound.project_code|BUSINESS_COLUMN|N|
|销售出库单列表|projectName|projectName|wms_outbound.project_name|BUSINESS_COLUMN|N|
|销售出库单列表|warehouseCode|warehouseCode|wms_outbound.warehouse_code|BUSINESS_COLUMN|Y|
|销售出库单列表|warehouseName|warehouseName|wms_outbound.warehouse_name|BUSINESS_COLUMN|N|
|销售出库单列表|currencyId|currencyId|wms_outbound.currency_id|BUSINESS_COLUMN|N|
|销售出库单列表|currencyCode|currencyCode|wms_outbound.currency_code|BUSINESS_COLUMN|N|
|销售出库单列表|currencyName|currencyName|wms_outbound.currency_name|BUSINESS_COLUMN|N|
|销售出库单列表|refVoucherId|sourceOrderId|wms_outbound.source_order_id|BUSINESS_COLUMN|N|
|销售出库单列表|refVoucherCode|sourceOrderNo|wms_outbound.source_order_no|BUSINESS_COLUMN|N|
|销售出库单列表|srcSalesOrderId|sourceOrderId|wms_outbound.source_order_id|BUSINESS_COLUMN|N|
|销售出库单列表|srcSalesOrderCode|sourceOrderNo|wms_outbound.source_order_no|BUSINESS_COLUMN|N|
|销售出库单列表|expectedDeliveryDate|expectedDeliveryDate|wms_outbound.expected_delivery_date|BUSINESS_COLUMN|N|
|销售出库单列表|deliveryAddress|deliveryAddress|wms_outbound.delivery_address|BUSINESS_COLUMN|N|
|销售出库单列表|contact|contact|wms_outbound.contact_name|BUSINESS_COLUMN|N|
|销售出库单列表|contactPhone|contactPhone|wms_outbound.contact_phone|BUSINESS_COLUMN|N|
|销售出库单列表|shipMethodName|shipMethod|wms_outbound.ship_method|BUSINESS_COLUMN|N|
|销售出库单列表|pickUpPerson|pickupPerson|wms_outbound.pickup_person|BUSINESS_COLUMN|N|
|销售出库单列表|pickUpTel|pickupPhone|wms_outbound.pickup_phone|BUSINESS_COLUMN|N|
|销售出库单列表|trackingNo|trackingNo|wms_outbound.tracking_no|BUSINESS_COLUMN|N|
|销售出库单列表|driverName|driverName|wms_outbound.driver_name|BUSINESS_COLUMN|N|
|销售出库单列表|truckNo|truckNo|wms_outbound.truck_no|BUSINESS_COLUMN|N|
|销售出库单列表|carrierCode|carrierCode|wms_outbound.carrier_code|BUSINESS_COLUMN|N|
|销售出库单列表|carrierName|carrierName|wms_outbound.carrier_name|BUSINESS_COLUMN|N|
|销售出库单列表|comments|comments|wms_outbound.comments|BUSINESS_COLUMN|N|
|销售出库单列表|invoiceTypeEnum|invoiceType|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|销售出库单列表|customFieldMap|customFields|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|销售出库单列表|voucherDetailList[].id|externalLineId|wms_outbound_items.external_line_id|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].externalCode|externalLineCode|wms_outbound_items.external_line_code|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].productCode|productCode|wms_outbound_items.product_code|BUSINESS_COLUMN|Y|
|销售出库单列表|voucherDetailList[].productName|productName|wms_outbound_items.product_name|BUSINESS_COLUMN|Y|
|销售出库单列表|voucherDetailList[].productSpecNo|productSpecNo|wms_outbound_items.product_spec_no|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].itemBarcode|itemBarcode|wms_outbound_items.item_barcode|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].warehouseCode|warehouseCode|wms_outbound_items.warehouse_code|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].warehouseName|warehouseName|wms_outbound_items.warehouse_name|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].inventoryLotNo|inventoryLotNo|wms_outbound_items.inventory_lot_no|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].issuedQty|quantity|wms_outbound_items.trans_qty|BUSINESS_COLUMN|Y|
|销售出库单列表|voucherDetailList[].transQty|quantity|wms_outbound_items.trans_qty|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].transUomName|unitName|wms_outbound_items.trans_uom_name|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].trans2Qty|secondaryQuantity|wms_outbound_items.trans2_qty|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].trans2UomName|secondaryUnitName|wms_outbound_items.trans2_uom_name|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].listPrice|listPrice|wms_outbound_items.list_price|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netPriceWithTax|netPriceWithTax|wms_outbound_items.net_price_with_tax|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netPriceWithoutTax|netPriceWithoutTax|wms_outbound_items.net_price_without_tax|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netAmountWithTax|netAmountWithTax|wms_outbound_items.net_amount_with_tax|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netAmountWithoutTax|netAmountWithoutTax|wms_outbound_items.net_amount_without_tax|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].taxPct|taxRate|wms_outbound_items.tax_rate|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netTax|taxAmount|wms_outbound_items.tax_amount|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].netDiscount|discountAmount|wms_outbound_items.discount_amount|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].isFreeGift|freeGift|wms_outbound_items.is_free_gift|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].srcSalesOrderId|sourceOrderId|wms_outbound_items.source_order_id|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].srcSalesOrderCode|sourceOrderNo|wms_outbound_items.source_order_no|BUSINESS_COLUMN|N|
|销售出库单列表|voucherDetailList[].customFieldMap|lineCustomFields|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|
|销售出库单列表|voucherDetailList[].serialNumberList|serialNumbers|chanjet_entity_snapshots.raw_data|MIDDLE_LAYER_JSON|N|

## 条件项

- 6 个账套单据 scope 缺失或超过 24 小时
- 6 个账套单据 scope 最近同步失败
- ERP 业务字段仍缺 2 列

## 反向同步就绪度

- 当前结论：HOLD
- 好业财写入开关：关闭
- 库存专用 Outbox：未实现
- 前置：账套与 ERP company_code 一一核准
- 前置：仓库、商品/SKU/规格、计量单位、批次映射覆盖率达到 100%
- 前置：好业财写入接口、字段、状态机和红蓝单规则完成官方合同审查
- 前置：建立库存专用 outbox、幂等键、回执和补偿策略，不复用凭证 outbox
- 前置：A2 安全、A1 回归、A7 发布 Gate 通过
- 前置：先单笔草稿 canary，人工批准后写入并立即只读回查

## 安全边界

- 好业财写入、修改、删除：否。
- ERP 出入库业务表写入：否。
- 裸附件 URL 向业务页面暴露：否。
- 审计仅读取 ERP 中间层、字段元数据和已镜像的好业财只读响应。
