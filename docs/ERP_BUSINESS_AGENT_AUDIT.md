# ERP Business Agent — 第一阶段静态审计报告

> 范围:采购(procurement / procurement-v2)、销售(sales-v2)、库存(wms)、门店(store / store-pos)、工作流(workflow)、相关前端业务页面
>
> 目的:列出所有"组织/项目/养殖场/客户/供应商/物料/角色/字典"依赖点,为后续主数据治理与冲突消解提供地图
>
> 输出日期:2026-06-20
>
> 方法:`Explore` 子代理静态 grep / Read,**未运行**,**未修改任何文件**

---

## 0. 总览

| 模块 | 主要 Entity 数 | 业务表前缀 | 主权限菜单码 | 主要风险等级 |
|---|---|---|---|---|
| procurement (v1) | 2 | `prc_*` / `biz_purchase_order` | (已停用)硬编码角色 | 🟡 双轨残留 |
| procurement-v2 | 14 | `prc2_*` | `MENU_PRC2_*` | 🔴 双外键(code/id) + supplier/物料弱关联 |
| sales-v2 | 13 | `sal_*` | `MENU_SALES2_*` | 🟡 渠道软关联 + 信用主数据 |
| wms | 7 | `wms_*` / `inv_*` | `MENU_WMS_*` / `MENU_INV_BATCH` | 🔴 store_code 语义二义 + 默认仓硬编码 |
| store / store-pos | 4 | `sal_store_*` / `daily_close` / `acc_ledger` | `MENU_STORE_POS` | 🔴 POS 客户主数据缺、FIFO 双路径 |
| workflow | — | `wf_*` + 跨业务表 | `MENU_WORKFLOW` | 🟡 审批人解析依赖多张表 |

**核心冲突总评**:
1. ⚠️ **供应商 / 项目 / 仓库**:`code` 列与 `*_id` 外键列共存(`prc2_ap_ledger.supplier_code` + `supplier_id`),保存路径不一致会埋雷
2. ⚠️ **`store_code` 一词三义**:`mst_stores.store_code`(门店)、`inv_batches.store_code`(库存所属公司)、`wms_locations.store_code`(默认 ALL),后续主数据治理必须先约定语义
3. ⚠️ **物料 / SKU 双轨**:V2 加了 `product_code` 但只快照不外键;POS FIFO 同时按 `sku_code`(Path A) 与 `product_code+grade_code`(Path B) 扣减,易出"幽灵库存"
4. ⚠️ **POS 客户主数据缺**:`sal_store_sales.customer_code` 无 `mst_customers` FK 约束,赊销路径 AR 对账风险高
5. ⚠️ **DataScope 三层覆盖不齐**:仅 `allowedCompanyCodes` 完整覆盖;`allowedProjectCodes` / `allowedWarehouseCodes` 在 sales-v2 / store-pos 多处缺失
6. ⚠️ **角色硬编码**:`assignment-resolver.service.ts:215` 写死 `[ROLE_FACTORY_ACCOUNTANT, ROLE_GROUP_FINANCE, ROLE_FIN_CFO]`;`workflow.service.ts:84` 写死 `ADMIN_ROLES`;v1 `procurement.service.ts:60` 写死多个 ROLE_ 串
7. ⚠️ **工作流审批人引用 `prc2_projects.project_manager_user_id`**:若未来项目主数据迁回 `biz_projects`,审批链断裂

---

## 1. 采购模块(procurement / procurement-v2)

### 1.1 实体清单

V1(冻结):
- `prc_purchase_orders`(`PurchaseOrderEntity`)— `supplier_code` / `store_code` / `currency_code`
- `biz_purchase_order` — 仅读归档

V2(现行,14 张):

| 表 | 关键依赖列 |
|---|---|
| `prc2_purchase_orders` | `company_code` / `company_id` / `project_code` / `project_id` / `supplier_code` / `supplier_id` / `currency_code` |
| `prc2_purchase_requests` | `company_code/id` / `project_code/id` / `currency_code` / `requester_id` |
| `prc2_order_items` | `project_code`(允许跨项目)/ `product_code` / `item_code` / `warehouse_code` |
| `prc2_request_items` | `project_code` / `item_code` / `warehouse_code` |
| `prc2_suppliers` | `supplier_code` / `owner_company_code` / `owner_project_code` / `shared_scope`(GROUP\|COMPANY\|PROJECT) |
| `prc2_projects` | `(company_code, project_code)` 唯一 / `company_id` / `project_manager_user_id` |
| `prc2_shipments` | `company_code` / `project_code` / `shipment_type` / `tracking_no` |
| `prc2_receipts` | `company_code` / `project_code` / `warehouse_code` / `po_id` |
| `prc2_payments` | `company_code` / `project_code` / `shareholder_id` / `payer_type` / `payment_method` |
| `prc2_shareholder_funds` | `company_code` / `project_code` / `shareholder_id` / `fund_nature` |
| `prc2_ap_ledger` | `company_code` / `project_code` / `supplier_code` + `supplier_id` / `currency_code` |
| `prc2_approvals` | `bizType`(PR\|PO)/ `bizId` / `approver_id` |
| `prc2_init_batches` | `batch_type` / `status` |
| `sys_exchange_rates` | `from_currency` / `to_currency` / `rate_date` |

### 1.2 关键依赖点

- **PR/PO 流转** 跨项目(行级 `project_code`),`source_request_id` 追溯
- **付款三维语义** `company_*`(财务主体)/ `project_*`(成本归集)/ `payer_*`(出资方)
- **股东代付** 多服务协同:`prc2_payments` + `prc2_shareholder_funds` + `prc2_payment_allocation`
- **多币种** `sys_exchange_rates` 单表无 `company_code` 分隔
- **DataScope** `prc2_receipts` 已用 `warehouseField='warehouseCode'`(G85-C);其余 service 未完全验证

### 1.3 角色 / 权限硬编码点

- v1: `apps/api/src/modules/procurement/procurement.service.ts:60` — `ROLE_ADMIN, ROLE_REGION_MGR, ROLE_CEO, ROLE_FIN_CFO`
- v2 菜单:`MENU_PRC2` / `MENU_PRC2_MASTER` / `MENU_PRC2_SHIPMENT` / `MENU_PRC2_RECEIPT` / `MENU_PRC2_PAYMENT` / `MENU_PRC2_FUND` / `MENU_PRC2_INIT` / `MENU_PRC2_ORDER`(V/C/E)

### 1.4 潜在冲突

1. 🔴 **双轨表**:`prc_purchase_orders` ↔ `prc2_purchase_orders` 并存,旧表仅留只读但未明确 cut-off
2. 🔴 **`supplier_code` + `supplier_id` 双字段**:`prc2_ap_ledger` 同时存 code 与 bigint,任一保存路径漂移就埋雷(参考 [project_g139_g147_payment_chain] 的 22P02 教训)
3. 🟡 **物料无 FK**:`prc2_order_items.product_code` / `item_code` 仅快照,无 `mst_products` 强约束
4. 🟡 **汇率表全局共享**:`sys_exchange_rates` 无 `company_code`,多公司不同策略会冲突
5. 🟡 **跨项目行级**:PO/PR 明细可跨项目,收货后按 `po_id` 归集时,成本可能错配
6. 🟡 **`prc2_projects` 与 `biz_projects` 主权**:项目主档治理已统一到 `biz_projects`(参见 G83 备忘),但 `prc2_projects` 仍存在,工作流的 `byProjectManager` 仍读它

---

## 2. 销售模块(sales-v2)

### 2.1 实体清单

| 表 | 关键依赖列 |
|---|---|
| `sal_customers` | `company_code` / `channel_code` / `region_code` / `credit_limit` / `credit_status` |
| `sal_channels` | `company_code` / `channel_code` / `status` |
| `sal_sales_orders` | `company_code` / `customer_code` / `channel_code` / `price_book_id` / `ar_invoice_id`(→ `fin_ar_invoices.id`) |
| `sal_order_items` | `sales_order_id` / `product_code` / `sku_code` |
| `sal_price_books` | `company_code` / `customer_code` / `channel_code` / `priority` |
| `sal_price_items` | `price_book_id` / `product_code` / `grade_code` / `packaging_spec` / `sku_code` |
| `sal_drivers` | `company_code` / `driver_code` / `status` |
| `sal_vehicles` | `company_code` / `vehicle_no` / `status` |
| `sal_delivery_orders` | `company_code` / `driver_id` / `vehicle_id` |
| `sal_delivery_order_items` | `delivery_order_id` / `sales_order_item_id` |
| `sal_return_orders` | `company_code` / `customer_code` / `sales_order_id` / `delivery_order_id` / `credit_note_id` |
| `sal_return_items` | `return_order_id` / `product_code` / `batch_no`(→`inv_batches.batch_no`) |
| `sal_receipts` | `company_code` / `customer_code` |

### 2.2 关键依赖点

- **价格运行时** `apps/api/src/modules/sales-v2/services/price-runtime.service.ts` — 优先级 `customer_code → channel_code → default`
- **AR 生成路径** `FinanceArAdapter.createArForOrder()` 在 `RECEIVED` 时写 `fin_ar_invoices`(`source_type='SALES_ORDER'`)
- **退货 Credit Note** `FinanceCreditNoteAdapter` 直写 `fin_ar_invoices`(负数)
- **信用控制** `customer-credit.service.ts` 按 `customer_no + company_code` 查 AR 快照,`FROZEN` 拦截订单提交
- **配送** `sal_delivery_orders.driver_id` / `vehicle_id` 为 FK 引用

### 2.3 角色 / 权限硬编码点

- 菜单:`MENU_SALES2_ORDER` / `MENU_SALES2_CUSTOMER` / `MENU_SALES2_CHANNEL` / `MENU_SALES2_PRICE` / `MENU_SALES2_RETURN` / `MENU_SALES2_DELIVERY` / `MENU_SALES2_CREDIT` / `MENU_SALES2_INVENTORY` / `MENU_SALES2_REPORT`(V/C/E/A/D)
- 硬编码角色:`apps/api/src/modules/sales-v2/controllers/mobile-delivery.controller.ts:34` — `roles.includes('ROLE_DRIVER')`

### 2.4 潜在冲突

1. 🔴 **客户主数据双轨**:`sal_customers`(Phase 0)与历史 `ord_customers` / `b2b_customers`(冻结)并存,价格匹配若未对齐则错价
2. 🔴 **价格册按 sku/grade/spec 多重匹配**:同一商品可能命中多本 price book,优先级仅靠 `priority` 列
3. 🟡 **DataScope 单层**:仅 `allowedCompanyCodes`,无 `allowedProjectCodes` / `allowedWarehouseCodes`,跨公司隔离全靠 Guard 中间件
4. 🟡 **门店渠道软关联**:`sal_channels.channel_code` ↔ `sal_customers.channel_code` 非外键,客户无 channel 则渠道价废
5. 🟡 **超卖窗口**:订单提交时未做预留,扣减在 `ALLOCATED` 状态,中间窗口可超卖
6. 🟡 **AR 生成两路径**:`FinanceArAdapter` / `FinanceCreditNoteAdapter` 都直写 `fin_ar_invoices`,需防止历史 `fin_transactions` 残留调用
7. 🟡 **移动端权限孤岛**:`ROLE_DRIVER` 不走 `@RequireMenu`,与 `MENU_SALES2_*` 不统一

---

## 3. 库存 / 门店 / POS(wms / store / store-pos)

### 3.1 实体清单

WMS:
- `wms_inbound` / `wms_inbound_items` — `warehouse_code` / `store_code` / `task_no`
- `wms_transfer` — `from_warehouse` / `to_warehouse` / `operator_id`
- `wms_stocktake` — `stocktake_no` / `auditor`(日结复用前缀 `DC-`)
- `wms_zones` — `warehouse_code`
- `wms_locations` — `warehouse_code` / `zone_code` / `store_code`(默认 `ALL`)
- `wms_stock_balance` — `warehouse_code` / `location_code` / `spec_code` / `batch_no` / `store_code`
- `wms_stock_ledger` — 同上 + `change_type`

库存核心:
- `inv_batches` — `batch_no` / `product_code` / `sku_code` / `warehouse_code` / `location_code` / `store_code` / `status`(AVAILABLE/QUARANTINE/EXPIRED/LOCKED)
- `inv_ledger` — `batch_no` / `change_type`(INBOUND / OUTBOUND / FIFO_OUT / TRANSFER_IN / TRANSFER_OUT / STOCKTAKE_UP / STOCKTAKE_DOWN / LOSS)/ `store_code` / `sku_code`

门店 POS:
- `sal_store_sales` — `store_code` / `company_code` / `customer_code` / `sale_type`(CASH/CREDIT/MIXED)/ `shift_closing_id` / `cash_account_id` / `ar_invoice_id`
- `sal_store_sale_items` — `sale_id` / `product_code` / `sku_code`(Phase H5)/ `batch_no`
- `sal_store_shift_closings` — `store_code` / `company_code` / `operator_id`
- `daily_close` / `acc_ledger`(`SALES_REVENUE` / `CASH_OVERAGE`)/ `fin_cash_transactions`(`source_type=STORE_SALE`)/ `fin_ar_invoices`(`source_type=STORE_SALE`)

### 3.2 关键依赖点

- **入库** `wms.service.ts:80-201 confirmInbound` 写 `inv_batches`(AVAILABLE/QUARANTINE)+ `inv_ledger`;默认仓硬编码 `WMS-VTE-MAIN` / `INBOUND-DOCK`(`wms.service.ts:122,139`)
- **采购联动** `inboundFromReceipt()`(`wms.service.ts:209-248`)供 procurement 调用
- **出库** `outbound.controller.ts` → `advanceOutboundOrder()`(`wms.service.ts:303-360`),`SHIPPED` 时扣 `inv_batches.qty`
- **调拨/盘点/损耗** `confirmTransfer / approveStocktake / approveLoss`
- **日结二重性** WMS 日结借 `wms_stocktake(DC-)`;门店日结独立流程写 `daily_close` + `acc_ledger` + `fin_transactions`
- **POS** `store-pos.service.ts:438-549 fifoDeductItems` 同时支持 Path A(`sku_code`)与 Path B(`product_code+grade_code`)
- **现金 / 赊销** `writeCashTransaction()`(562-615)、`createArInvoice()`(619-657)

### 3.3 角色 / 权限硬编码点

| 菜单码 | 文件 | 操作 |
|---|---|---|
| `MENU_WMS_INOUT` (V/C/E) | `wms/inbound.controller.ts:13-31` / `outbound.controller.ts:13-37` | 入出库 |
| `MENU_WMS_VIEW` (V) | `wms/inventory.controller.ts:32` | 库存查看 |
| `MENU_INV_BATCH` (E) | `wms/inventory.controller.ts:20,50,63,70,77` | 调拨/盘点/损耗审批 |
| `MENU_PDA` (C) | `wms/inventory.controller.ts:56` | PDA 同步 |
| `MENU_STORE_POS` (V/C/E/D) | `store-pos/controllers/store-pos.controller.ts:47-199` | 门店销售 |

### 3.4 潜在冲突

1. 🔴 **`store_code` 一词三义**:
   - `mst_stores.store_code`:门店实体
   - `inv_batches.store_code`:批次所属公司(实际语义≈ `company_code`)
   - `wms_locations.store_code`:默认值 `'ALL'`
   - 跨公司采购入库时 `store_code='ALL'` 直接破坏隔离
2. 🔴 **POS 客户主数据缺**:`sal_store_sales.customer_code` 无 FK,赊销路径靠 `customer_name` 辨识(`store-pos.service.ts:649`)
3. 🔴 **FIFO 双路径**:Path A(sku)与 Path B(product+grade)共存,无优先级文档,易出幽灵库存
4. 🟡 **状态字段无 sys_dict 约束**:`inv_batches.status` 文本枚举硬编码在 `wms.service.ts:148-149,157-159,180-181,470-477`(违反 CLAUDE.md 第 7 条"库存状态唯一来源")
5. 🟡 **日结二重性**:WMS / 门店两套日结独立,财务对账风险
6. 🟡 **跨模块库存接口分散**:`WmsService.inboundFromReceipt` / `StorePosService.fifoDeductItems` 各写各的台账(违反 CLAUDE.md 第 6 条"库存台账唯一性")
7. 🟡 **DataScope 降至 Controller 层**:Service(尤其 POS FIFO)无 `allowedWarehouseCodes` 强制过滤
8. 🟢 **硬编码默认值**:`WMS-VTE-MAIN` / `INBOUND-DOCK` / `ST-VTE-001` / `ALL` 散落在 service,应入 `sys_config`

---

## 4. 工作流(workflow)+ 前端业务页面

### 4.1 workflow 后端核心依赖

`assignment-resolver.service.ts`:
- `byRole`(:83-88)— JOIN `sys_user_role` ↔ `sys_role`(role_code)
- `byCompanyRole`(:122-131)— + `sys_user_orgs` ↔ `sys_organizations`(company_code)
- `byProjectRole`(:154-163)— `sys_user_project_scopes`
- `byOrgManager`(:189)— `sys_organizations.manager_user_id`
- `byProjectManager`(:203)— **`prc2_projects.project_manager_user_id`**(若迁回 `biz_projects` 会断链)
- `byCompanyFinance`(:215)— **硬编码** `['ROLE_FACTORY_ACCOUNTANT','ROLE_GROUP_FINANCE','ROLE_FIN_CFO']`
- `byDirectManager`(:229)— `sys_user.manager_user_id`
- `resolveEligibleApprovers`(:272-290)— JOIN `sys_role_menu_permission` ↔ `sys_menu`,perm 位 `LIKE '%*%'` 或精确匹配

`workflow.service.ts`:
- 数据源(1911-1920):`SYS_USERS / SYS_ROLES / SYS_ORGS` + 业务表 `sal_customers / prc_suppliers / wms_warehouses / mst_stores`
- 字典查询(:1171)— `sys_dict WHERE dict_type=$1`
- `ADMIN_ROLES`(:84)硬编码 `['ROLE_ADMIN','ROLE_SYSOPS']`
- 审批节点角色(:2042-2056)硬编码 `['ROLE_SYSOPS','ROLE_PRC_BUYER','ROLE_FIN_CFO']`

### 4.2 前端业务页面 Selector 使用清单

| 页面 | Selector | DictSelect | AttachmentUploader |
|---|---|---|---|
| `/procurement2/payments` | Company / Project / CashAccount / Supplier / Shareholder | `FIN_PAYER_TYPE` / `SYS_CURRENCY` / `PRC_PAYMENT_METHOD` / `FIN_FUND_NATURE` | ✅ |
| `/procurement2/requests` | Company / Project / Warehouse | `PRC_PURCHASE_TYPE` / `PRC_URGENCY` / `SYS_CURRENCY` | ❌ |
| `/procurement2/receipts` | Warehouse / User / Material | `PRC_QUALITY_STATUS` / `SYS_COUNTRY` | ❌ |
| `/procurement2/suppliers` | Company / Project | `SYS_COUNTRY` / `SYS_CURRENCY` | ❌ |
| `/procurement2/orders` | Company / Warehouse / Supplier | — | ✅ |
| `/sales2/orders` | Company / Customer / Channel / Sku | — | ❌ |
| `/sales2/returns` | Customer / Sku | `SAL_RETURN_REASON` | ❌ |
| `/sales2/delivery` | — | `SAL_DELIVERY_EXCEPTION` | ❌ |

关键 Selector 端点(`shared-selectors/MasterDataSelectors.tsx`):

| 端点 | 行 | 备注 |
|---|---|---|
| `/lookup/companies` | 128 | **无 DataScope 过滤** |
| `/lookup/customers` / `/lookup/suppliers` | 83 / 89 | OK |
| `/lookup/warehouses` / `/lookup/stores` / `/lookup/farms` | — | 支持 type / companyCode |
| `/lookup/projects` | 104-119 | `biz_projects` 按 companyCode 过滤 |
| `/lookup/users` / `/lookup/cash-accounts` | 203 / 147 | OK |
| `/lookup/shareholders` | 178 | 支持 companyCode |
| `/crud/wms_zones` / `/crud/wms_locations` | 257 / 275 | **绕过 lookup,直接 crud**,每次 `pageSize=500` 全拉 |
| `/v2/sales/channels` / `/v2/sales/delivery/drivers` | 293 / 326 | OK |

### 4.3 前端硬编码菜单码点

- `/sales2/orders/page.tsx:207` — `usePermission('MENU_SALES2_ORDER')`
- `/sales2/credit/page.tsx` — `usePermission('MENU_SALES2_CREDIT')`
- `/sales2/channels/page.tsx` — `usePermission('MENU_SALES2_CHANNEL')`
- `workflow-definition.controller.ts:13-67` — `@RequireMenu('MENU_WORKFLOW','V|C|E')`
- `workflow-runtime.controller.ts:35` — `@RequireMenu('MENU_WORKFLOW','V')`

### 4.4 潜在冲突

1. 🔴 **`byProjectManager` 依赖 `prc2_projects`**:若主数据治理把项目主权迁回 `biz_projects`(已是 lookup 端点的数据源),工作流的项目经理审批节点会断
2. 🔴 **`/lookup/companies` 无 DataScope**:采购专员也能拿到全公司列表,前端假定"DataScope 自动过滤"与实现不符,实际依赖后端在保存时校验
3. 🟡 **`byCompanyFinance` 硬编码角色优先级**:角色变更需改代码
4. 🟡 **`/crud/wms_zones` / `/crud/wms_locations` 绕过 lookup**:无缓存、无 DataScope hint,每次 500 条全拉
5. 🟡 **AttachmentUploader 仅采购 / 财务用**:销售 / 库存 / 门店页面均未使用;若有凭证 / 资质 / 照片字段则违反 CLAUDE.md 第 4 条
6. 🟡 **菜单码与权限码无统一注册表**:前后端各自硬编码,易漂移
7. 🟡 **`workflow.service.ts:84,2042-2056` 多处硬编码角色串**:与 G118 PBAC 治理思路冲突

---

## 5. 跨模块依赖矩阵

> 行=业务模块,列=主数据/治理项

|  | sys_organizations | biz_projects | mst_stores / sal_channels | mst_customers / sal_customers | prc2_suppliers | mst_products / product_master | sys_role / RBAC | sys_dict |
|---|---|---|---|---|---|---|---|---|
| procurement | company_code | project_code(`prc2_projects` 双轨) | — | — | ★ supplier_code+supplier_id | ⚠ product_code 仅快照 | MENU_PRC2_* + v1 硬编码 ROLE_* | PRC_* / SYS_CURRENCY |
| sales-v2 | company_code(仅一层) | — | channel_code 软关联 | ★ sal_customers 与历史表双轨 | — | sku_code + product_code | MENU_SALES2_* + ROLE_DRIVER 硬编码 | SAL_RETURN_REASON 等 |
| wms | company_code(隐式) | — | store_code(语义二义)| — | — | product_code / sku_code | MENU_WMS_INOUT / MENU_INV_BATCH | INV_STOCK_STATUS(未真正接) |
| store-pos | company_code | — | store_code(门店主)| ⚠ customer_code 无 FK | — | sku_code + product_code(FIFO 双路径)| MENU_STORE_POS | PKG_EGG_GRADE / PKG_EGG_DEFECT |
| workflow | ★ sys_organizations.manager_user_id | ★ `prc2_projects.project_manager_user_id` | — | — | — | — | ★ sys_role_menu_permission / 硬编码 ADMIN_ROLES | APPROVAL 数据源单独 |

★ = 强依赖;⚠ = 弱关联 / 漂移风险

---

## 6. 建议(供主数据 / 治理 Agent 决策参考)

> 本审计**不动代码**。下列为后续治理优先级建议,需由 Architect / Audit Agent 拍板。

### P0(数据一致性红线)
1. **统一 `store_code` 语义**:`inv_batches.store_code` 与 `mst_stores.store_code` 必须分家——前者改名为 `owning_company_code`(或加 FK 到 `sys_organizations`),后者保留为门店标识
2. **POS `customer_code` 加 FK**:`sal_store_sales` / AR 赊销路径必须强制 `mst_customers` 主档
3. **`prc2_ap_ledger` 供应商主外键二选一**:决定走 `supplier_code` 还是 `supplier_id`,清除另一列

### P1(主数据双轨清账)
4. **项目主权**:`prc2_projects` 与 `biz_projects` 二选一;`assignment-resolver.byProjectManager`(:203)随之改表
5. **客户主权**:`sal_customers` 与历史 `ord_customers`/`b2b_customers` 退役表彻底清账
6. **物料主权**:`product_code` 在采购 / 销售 / POS / WMS 加 `mst_products` FK

### P2(角色 / 权限统一)
7. 删除 `procurement.service.ts:60` / `workflow.service.ts:84,2042-2056` 的硬编码角色串,改走 `sys_role_menu_permission`
8. 把 `byCompanyFinance`(:215)的角色优先级落到字典或配置表
9. `ROLE_DRIVER` 接入 `MOBILE_*` 菜单码体系

### P3(库存 / 工作流硬伤)
10. `inv_batches.status` 真正接上 `INV_STOCK_STATUS` 字典(CLAUDE.md 第 7 条)
11. 统一 FIFO 引擎,拆掉 POS 内的双路径
12. WMS 默认仓 / 库位硬编码迁入 `sys_config`
13. `/lookup/companies` 端点补 DataScope;`/crud/wms_zones` 端点改用 `/lookup/*` 形态

### P4(前端遵规)
14. 全模块巡检凭证 / 合同 / 资质 / 照片字段,统一改为 `AttachmentUploader`(销售 / 库存 / 门店当前缺位)
15. 菜单码 / 权限码建统一注册表,前后端共享 type

---

## 7. 关键文件索引

**采购:**
- `apps/api/src/modules/procurement-v2/services/orders.service.ts:11-15`
- `apps/api/src/modules/procurement-v2/entities/prc2-supplier.entity.ts:81`
- `apps/api/src/modules/procurement-v2/services/dashboard.service.ts:7`
- `apps/api/src/modules/procurement/procurement.service.ts:60`

**销售:**
- `apps/api/src/modules/sales-v2/sales-v2.module.ts`
- `apps/api/src/modules/sales-v2/adapters/finance-ar.adapter.ts`
- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts`
- `apps/api/src/modules/sales-v2/services/price-runtime.service.ts`
- `apps/api/src/modules/sales-v2/services/customer-credit.service.ts`
- `apps/api/src/modules/sales-v2/controllers/mobile-delivery.controller.ts:34`

**库存 / 门店 / POS:**
- `apps/api/src/modules/wms/wms.service.ts:80-201, 209-248, 303-360, 523-586, 595-630, 682-706, 708-737`
- `apps/api/src/modules/wms/entities/wms-location.entity.ts:9-24`
- `apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts:10-28`
- `apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts:8-36`
- `apps/api/src/modules/store-pos/services/store-pos.service.ts:118-145, 153-162, 438-549, 562-615, 619-657`
- `apps/api/src/modules/store-pos/services/store-pos-shift.service.ts:56-68, 84-146`
- `apps/api/src/modules/store/store.service.ts:72, 112-239`

**工作流 + 前端:**
- `apps/api/src/modules/workflow/assignment-resolver.service.ts:79-234, 272-290`
- `apps/api/src/modules/workflow/workflow.service.ts:84, 1171, 1911-1920, 2042-2056`
- `apps/api/src/modules/workflow/workflow-definition.controller.ts:13-67`
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:83, 89, 104-119, 128, 147, 178, 203, 257, 275, 293, 326`
- `apps/web/src/app/(admin)/sales2/orders/page.tsx:207`

---

*本报告由 ERP Business Agent 在 `feature/agent-erp-business` 分支静态审计输出,未执行任何代码或数据库变更。*
