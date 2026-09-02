# 库存管理与销售管理名称/编码显示统一核查（设计稿，2026-09-02）

## 1. 结论与边界

本轮只做源码与接口契约核查，未修改前后端、数据库或测试。核查确认：表单侧多数已经使用共享 Selector，但列表、详情和统计仍大量直接消费 `*_code`；部分接口只返回单一快照名，部分完全没有名称 JOIN；状态/类型又有一批本地硬编码中文或原始枚举裸显。因此不能用一次前端字符串替换解决，必须按“接口补真实名称列 → 前端 locale 选名 → code 辅助追溯 → 枚举独立 i18n”分层收口。

沿用 `replenishment-localized-master-name-closeout-20260828.md` 的既有基线：

- 名称回退链：当前界面语言 → 中文 → 英文 → 老挝语 → 基础名 → 编码。
- 前端统一调用 `localizedMasterName()` 与 `masterNameWithCode()`（`apps/web/src/lib/localized-master-data.ts:1-24`）。
- 展示采用 `名称（code）`；无真实名称时只显示 code，不伪造翻译。
- code 继续作为筛选、提交、关联和追溯值，不能用 label 覆写业务字段。
- 状态、类型、原因、等级等枚举不走主数据名称 helper；优先 `sys_dict`，否则走稳定 i18n key。未知值保留 code 作为诊断 fallback。

数据事实：`wms_warehouses` 有 `warehouse_name(_zh/_en/_lo)`；`mst_stores`、`product_skus` 有基础名及 en/lo；`wms_zones`、`wms_locations` 只有单一名称。销售侧只有客户与司机存在部分 en/lo 字段；订单、退货、配送、渠道、价格册和价格项没有三语名称列。后续设计必须尊重这一边界。

## 2. 库存页面矩阵

“后端需补”中的“是”均指追加只读返回字段/JOIN，不指新增翻译列或迁移。

| 页面 | 字段/列 | 现状 | 根因 | 设计改法 | 后端需补 |
|---|---|---|---|---|---|
| `/warehouse` 首页 | 库区名称/类型 | `zone_name` 单名；`zone_type` 原码（`warehouse/page.tsx:83-86`） | 区表无三语；类型未取字典 | 名称按真实单名显示为 `名称（zone_code）`；类型取 `WMS_ZONE_TYPE` | 否（列表已有单名）；类型否 |
| `/warehouse` 今日动态 | 仓库、目标、品目 | 直接显示 `warehouse_code`、`dest`、`item`（`:177-200`）；入库变量名 `zoneLabel` 实际承载仓库 | 四个 Generic CRUD 响应无名称展开，且展示语义混杂 | 活动 DTO 明确 `warehouseCode/name*`、目标类型/code/name、item/sku name*；分别格式化 | 是：仓库/SKU/目标主数据 JOIN |
| `/warehouse/warehouses` | 仓库名称 | 独立展示 code、中文名、老挝名；英文列未展示（`warehouses/page.tsx:19-26`） | 页面未采用当前 locale 主显示 | 主列改 `localizedMasterName(row,'warehouse_name',lang)` + code；三语维护列可在详情保留 | 否：Generic CRUD 已返回表列 |
| 同上 | 状态 | 列表无 render，裸显 `ACTIVE/INACTIVE`（`:19-26`） | 表单本地化未覆盖列表 | 统一状态 i18n/字典 formatter | 否 |
| `/warehouse/zones` | 仓库、库区、类型、状态 | 仓库已由 formatter 显示 name+code；库区为单名；类型字典化（`zones/page.tsx:63-95`） | 基本合规 | 仅把库区统一成单名+code；保持字典与 formatter | 否 |
| `/warehouse/locations` | 仓库、库区 | 列表只显 `warehouse_code/zone_code`（`locations/page.tsx:422-472`） | Generic CRUD 无 JOIN | 接口追加仓库三语名、库区单名；前端 helper 双显 | 是 |
| 同上 | 站点/站点编码 | 两列都渲染 `store_code`（`:409-410,439,472`） | 标签与字段重复 | 合并为“站点”，显示门店 locale 名称（code）；或一列名称、一列 code，禁止同值双列 | 是：JOIN `mst_stores` |
| `/warehouse/inbound` | 仓库、品目 | `warehouse_code` 直出；`item` 与 `item_name` 分列（`inbound/page.tsx:162-176`） | `GET /crud/wms_inbound` 仅 `SELECT *` | 仓库名称（code）；品目合并为 locale SKU/产品名（code） | 是：仓库与 SKU/产品 JOIN；先核实真实末态列名 |
| 同上 | 类型/状态 | 已有 `t()` 映射，未知值回退原码（`:54-70`） | 固定映射与字典来源分离 | 类型以 `INV_INBOUND_TYPE` 为权威；状态保持 workflow i18n，补未知值契约 | 类型否，状态否 |
| `/warehouse/outbound`、`/warehouse/issues` | 仓库、品目、目的养殖场 | `warehouse_code/item/destination_house_code` 原码（`outbound/page.tsx:257-273`） | Generic CRUD 无名称 JOIN | 三者各自名称（code）；目的地须按真实 master type JOIN | 是 |
| 同上 | 类型/状态 | 已 `t()`，未知值原码（`:90-109,259-274`） | 固定映射可能漏新值 | 类型优先字典；workflow 状态用集中 formatter | 否 |
| `/warehouse/transfer` | 调出/调入仓、库区、库位 | 六列均 code-only（`transfer/page.tsx:140-167`） | 列表接口 `SELECT *` | 两端仓库三语 helper；zone/location 单名+code | 是 |
| 同上 | 原因/状态 | 原因表单走 `INV_TRANSFER_REASON`；状态已有 i18n | 列表原因仍可能原码 | 列表原因也取字典 label；状态保持集中 formatter | 否 |
| `/warehouse/stocktake` | 仓库、库区、库位、品目 | 列表以 code/`item` 为主（`stocktake/page.tsx:241-252`） | Generic CRUD 无名称展开 | 各主数据名称（code）；zone/location 仅真实单名 | 是 |
| 同上 | 状态 | `STATUS_BADGE` 已 i18n（`:291-298`） | 合规 | 保持 | 否 |
| `/warehouse/loss-report` | `zone_code`、`warehouse_code` | `zone_code` 标“报损品目”，`warehouse_code` 标“批次/库区”（`loss-report/page.tsx:207-218`） | 历史字段/标签反向错配 | 第一层先修标签为“库区”“仓库”；品目使用 `item/item_name`，批次用 `batch_no`，各字段不得复用 | 否（标签）；名称展示需补 JOIN |
| 同上 | 单据模型/数量金额 | 错用 `wms_stocktake` + `LR-` 前缀；`diff_qty/book_qty/actual_qty` 承载报损量、估值、账面量（`:26,87-98,203-205`） | 报损借用盘点表造成语义污染 | 本轮实施可先做显示层修正；数据模型拆表另立治理任务，不在名称修复中暗改 | 否（本轮） |
| `/warehouse/query` | 仓库 | 已显示中文优先 name+code（`query/page.tsx:167`; `warehouse-query.ts:77-104`），不随 locale | 专用 API 只补 `warehouse_name/warehouse_name_zh`（`wms.service.ts:1265-1280`） | API 同时返回 en/lo；helper 替换中文专用 formatter | 是 |
| 同上 | SKU/产品、库存状态 | 品目主要显示 code；状态原码（`query/page.tsx:160-172`） | 批次接口未 JOIN SKU；状态未字典化 | SKU locale 名称（code）；状态取 `INV_STOCK_STATUS` | 是（SKU 名）；状态否 |
| `/warehouse/ledger` | 门店、变动类型 | `store_code` 原码（`ledger/page.tsx:12-39`）；类型需统一检查 formatter 覆盖 | 台账响应无门店名；未知变动类型可能原码 | 门店名称（code）；变动类型集中字典/i18n | 是（门店）；类型否 |
| `/warehouse/expiry` | SKU/产品、仓库 | 商品 code；`warehouse_code || location_code` 被统一标成仓库（`expiry/page.tsx:81-88,200-203`） | 直接消费 `inv_batches`，且错误混用 location fallback | 仓库和库位拆列；分别名称（code）；SKU 名称（code） | 是 |
| `/warehouse/source-mode` | 模式、scope | 模式 label 硬编码中文；`scope_level/scope_code` 原码（`source-mode/page.tsx:18-21,218-235,494-500`） | 枚举与 scope 主数据未解析 | 模式 i18n；按 scope_level 解析公司/门店/仓库名称（code） | 是（scope 名） |
| `/terminal/wms/inbound` | 仓库、产品/规格、状态 | 任务显 `warehouse_code`；明细 `product_code/spec_code`；状态只局部翻译 `PROCESSING`（`inbound/page.tsx:200-208`） | `/inbound/pending` 与详情均 `SELECT *` | 返回仓库/SKU/规格真实名称；PDA 紧凑双显；完整 workflow status formatter | 是 |
| `/terminal/wms/outbound` | 客户、产品、状态 | 客户与产品有 name→code fallback；状态原码（`outbound/page.tsx:194-231`） | 旧订单接口无三语 JOIN；状态裸显 | 有快照名时 `name(code)`；状态集中 i18n | 可选：若要求 locale 客户名则 JOIN；状态否 |
| `/terminal/wms/stocktake` | 仓库、库位、批次状态 | 仓库/库位 code-only；`b.status/r.status` 原码（`stocktake/page.tsx:165-203`） | 任务与 PDA 库存接口无名称 | 仓库三语、库位单名双显；状态取 `INV_STOCK_STATUS` | 是 |
| `/terminal/packaging/warehouse-handover` | 库位 | 自由输入 location code 并原样确认（`warehouse-handover/page.tsx:405-425,565-566`） | 未使用 LocationSelector/lookup | PDA 扫码/选择后显示单名（code），提交仍为 code | 是；交互另需 selector/scan 设计 |
| `/settings/pda-terminals` | 协议、功能、位置 | 协议/功能常量硬编码中文；location 自由文本（`pda-terminals/page.tsx:30-80,420-427,494-515`） | 非字典、非库位关联 | 协议/功能 i18n；若 location 是库位外键则名称（code），否则明确改标签“位置备注” | 视数据语义；不得假定为库位 |

`/warehouse/daily-close` 没有需要名称解析的列表字段，本轮无改动建议。`/warehouse/issues` 复用 outbound 实现，不重复建第二套修复。

## 3. 销售页面矩阵

| 页面 | 字段/列 | 现状 | 根因 | 设计改法 | 后端需补 |
|---|---|---|---|---|---|
| `/sales2` 首页 | 导航标题/说明 | `NAV_CARDS` 裸中文（`sales2/page.tsx:60-67,154-155`） | 未调用 `t()` | 改稳定 i18n key | 否 |
| 同上 | 今日配送/今日损耗 | 前端标“今日”，API `totalDelivered/totalLoss` 为全量（前端 `:139,145`；后端 `sales-analytics.service.ts:86-94,130-137`） | 标签与统计口径错配 | 最小改动先去掉“今日”；如业务确需今日再改 SQL | 否（改标签方案） |
| 同上 | 应收金额 | 固定 `¥`（`:140-141`） | 聚合无币种维度 | API 按币种分组或明确 base currency；禁止把多币种相加后套单一符号 | 是（若多币种） |
| `/sales2/reports` | 公司/渠道聚合 | `company_code/channel_code` 原码（`reports/page.tsx:160-163`） | analytics `byCompany/byChannel` 无名称 JOIN | 返回名称列，locale 名称（code） | 是 |
| 同上 | 低价/退货/信用表 | 产品、原因、信用状态仍有 code-only（`:325,431-434,544-554`） | 聚合接口只返回 code 或前端直出枚举 | 产品/客户真实名称+code；原因取字典；信用状态 i18n | 依接口：产品/客户名需补，枚举否 |
| `/sales2/orders` 列表 | 客户/门店 | 客户 `customerName ?? customerCode`；门店只追加 `storeCode`（`orders/page.tsx:706`） | 订单有单一客户快照名，无门店名/三语 | 客户按真实快照 `name(code)`；门店 JOIN `mst_stores` 后 locale 双显 | 是（门店）；客户 locale 化需 JOIN |
| 同上/详情 | 公司、渠道、客户 | 标题公司 code；详情渠道 code；客户单名 fallback（`:1145-1147,1235-1249`） | 列表/详情无 master JOIN | 公司/渠道/客户均名称（code）；客户单据快照仍保留审计用途 | 是 |
| 同上/详情 | 商品、品级、规格 | 商品 `product_name || product_code`，SKU badge；grade/spec code（`:1311-1356`） | 订单项仅保存单名和 codes | SKU/产品 JOIN现有三语主数据；品级/规格取主数据/字典真实名称 | 是 |
| 同上 | 订单/关联单据/AR/信用状态 | 本地 `STATUS_MAP` 硬编码中文；关联 `doc.type/status`、时间轴状态、AR status、creditStatus 原码（`:41-132,1163-1231,1271,1307`） | 多套局部枚举渲染 | 建销售订单/关联单据/AR/信用状态集中 i18n formatter；未知值显示 code | 否 |
| `/sales2/returns` 列表/详情 | 客户、公司、产品 | 客户列表最接近双显；详情公司仅 code；回库 tab 只显 product_code（`returns/page.tsx:865-870,1001-1012,1328-1342`） | 返回单一快照名，无 locale JOIN；各 tab 渲染不一致 | 所有 tab 统一 `name(code)`；公司/客户/SKU 按现有主数据 JOIN 三语，快照名作最终基础名 fallback | 是 |
| 同上 | 状态、退货类型、质检结果 | `STATUS_CFG/RETURN_TYPE_CFG/INSPECTION_CFG` 硬编码中文（`:89-170`），未知值原码 | 局部配置未 i18n | 原因用 `SAL_RETURN_REASON`；其余稳定 i18n key/现有字典，统一 formatter | 否 |
| 同上 | 原因/回库状态 | 响应有 `reason_code/restock_status`，详情未渲染（类型 `:20-55`，详情 `:1001-1039`） | 展示遗漏 | 原因显示字典 label（code 可作辅助）；按业务确认展示 item 回库状态 | 否 |
| `/sales2/delivery` | 公司、司机、路线、车辆 | 列表有司机名/路线名，详情公司 code；车辆类型原码（`delivery/page.tsx:807-842,929-944,1335-1367`） | 配送存单一快照名；司机三语列未 JOIN；车辆类型未枚举化 | 公司 locale 双显；司机用 `driver_name/en/lo`；路线单名双显；车辆类型 i18n/字典 | 是（公司、司机 locale）；车辆类型否 |
| 同上 | 配送/操作/签收状态 | `STATUS_MAP/ACTIONS/RECEIPT_STATUS_MAP` 硬编码中文（`:47-163,745-746,1017-1040,1188-1198`） | 局部配置 | 集中 i18n formatter，操作文案也使用 `t()` | 否 |
| `/sales2/channels` 分类视图 | 渠道类型 | `DIRECT/DISTRIBUTOR/AGENT/ECOMMERCE` 裸 code+静态中文；与客户类型 `DIRECT_STORE/...` 不同（`channels/page.tsx:69-74,143-151,235-259`） | 展示枚举和统计归类模型错配 | 先定义明确映射/统计口径，再本地化；不能只翻译 label 掩盖漏计 | 后端若改成权威聚合则是 |
| `/sales2/channels` 实体列表 | 渠道、公司、类型、状态 | 渠道 code/name 分列；公司 code-only；类型静态中文（`:824-854`） | 无公司 locale JOIN；局部枚举 | 渠道名称（code）；公司 locale 名称（code）；类型/状态 i18n | 是（公司） |
| `/sales2/customers` | 客户、渠道 | 客户编号/基础名分列；渠道只显 code（`customers/page.tsx:513-560`） | 客户 API含 `customer_name/en/lo`，但页面没 helper；无 channel JOIN | 客户 locale 名称（code）；渠道名称（code） | 是（渠道）；客户否 |
| 同上 | 类型/风险/状态 | 常量 label 均硬编码中文，未知值原码（`:15-93,520-565`） | 局部枚举 | 走 sys_dict 或集中 i18n formatter | 否 |
| `/sales2/credit` | 客户/信用状态 | 客户只显示 `customer_name/name`，状态“冻结/预警/正常”硬编码中文（`credit/page.tsx:70-78,237-255`） | 无 code 双显；状态以中文 label 参与 tone 判断 | 返回 customer_code/name*；显示 locale 名称（code）；tone 按稳定 code 判断，label i18n | 是（客户 code/name*） |
| `/sales2/pricing` 价格册 | 渠道/客户/门店 | 仅 `channel_code/customer_code`，API也仅 codes（`pricing/page.tsx:535-559`; `price-books.service.ts:109-129`） | 无名称 JOIN | 追加真实名称列并 locale 双显 | 是 |
| 同上/明细 | SKU/产品/品级/规格/价格册 | 列表 SKU/product/spec code-only，虽已加载 `sku_name/spec_name`；生效卡也缺名称（`pricing/page.tsx:1025-1036,1360-1413`） | 返回与渲染均不完整 | JOIN SKU/产品三语；品级/规格用现有主数据名；价格册显示 `price_book_name(no)` | 是；已在客户端加载的名称可先复用但接口契约更稳 |
| 同上 | 状态/优先级 | `BOOK_STATUSES`、优先级说明硬编码中文（`:20-76,489-503,543-582`） | 局部配置 | 稳定 i18n key；未知 code 保留 | 否 |
| `/sales2/inventory` | SKU/产品/公司 | 批次、临期、台账多处仅 `sku_code/product_code/company_code`（`inventory/page.tsx:628-645,729-751,1030-1034`） | 库存接口未为销售视图展开名称 | SKU/公司 locale 名称（code）；复用库存侧同一 DTO/helper，禁止销售侧再造 formatter | 是 |
| 同上 | 库存状态/品级/变动类型 | 状态静态中文映射；grade 直接 code；变动类型只覆盖 3 项（`:147-176,573-574,1002`） | 未接 `INV_STOCK_STATUS` 与权威字典 | 状态/品级/变动类型统一字典/i18n | 否 |

`/sales-returns` 路由在当前仓库不存在；实际入口为 `/sales2/returns`（`Sidebar.tsx:162`）。本轮不建议无需求地新增别名路由。

## 4. 后端接口事实与最小补字段方案

| 接口族 | 当前真实返回 | 最小补法 |
|---|---|---|
| Generic CRUD：`wms_inbound/outbound/transfer/stocktake/zones/locations/inv_batches` | `SELECT * FROM table`，不展开名称（`generic-crud.service.ts:2420-2475`） | 对业务列表优先增加专用 read DTO/查询；若扩展 Generic CRUD，必须是表级白名单 JOIN，不能全局猜字段 |
| `GET /api/inventory/batches` | 只 JOIN 仓库，输出 `warehouse_name/warehouse_name_zh`（`wms.service.ts:1265-1280`） | 补 `warehouse_name_en/lo`，并 JOIN `product_skus` 输出 `sku_name/en/lo`；保留原字段兼容 |
| PDA inbound/outbound/stocktake/inventory | 多为 `SELECT *` 或少数字段；无名称（`wms.service.ts:210-238,639-670`; `terminal.service.ts:57-111`） | 针对 PDA 卡片所需字段做窄 JOIN；不要返回整张主数据表 |
| 销售订单列表/详情 | 订单有 `customer_name/company_name` 单一快照；item 有 `product_name`；无三语 JOIN（`sales-orders.service.ts:191-222`） | JOIN company/customer/channel/store/SKU 主数据，追加名称列；原快照名保留为 fallback 与审计证据 |
| 销售退货列表/详情/分析 | customer/product 单一快照名；无三语（`return-orders.service.ts:105-142,581-633`） | 同订单；聚合结果也追加对应名称，不改变 group key |
| 配送列表/详情 | 配送存 `driver_name/company_name/route_name`；司机表有 en/lo，但查询未 JOIN（`delivery-orders.service.ts:136-173,696-704`） | JOIN司机和公司；路线无三语时只返回单名 |
| 渠道/客户 | 渠道只有单名；客户有 `customer_name/en/lo`，列表 `SELECT *`，详情只选少数字段（`channels.service.ts:70-83`; `customers.service.ts:28-45,82-95`） | 客户列表前端即可 locale；详情补 en/lo；渠道仍单名，客户列表补 channel_name |
| 价格册/价格项 | book 只有 store/channel/customer code；item只有 product/SKU/grade/spec codes（`price-books.service.ts:109-129`; `price-items.service.ts:97-110`） | JOIN现有主数据真实名称；无多语言列的品级/规格只返回单名 |
| analytics overview/reports | `byCompany/byChannel` 及若干排行仅 code（`sales-analytics.service.ts:155-200`） | 聚合后按 code JOIN/二次映射名称；名称不能加入 group key 导致口径变化；可用 `MAX(name*)` 保持一对一聚合，复用 2026-08-28 补货修正经验 |

禁止方案：给 `wms_zones/wms_locations/sal_channels` 临时拼出 `_zh/_en/_lo` 相同值；机器翻译后写库；把订单快照 `customer_name/product_name` 当成三语主数据；前端逐行额外请求 lookup；用名称替换 API 中原 code。

## 5. 实施拆分

### P0：字段错配与裸枚举（低耦合）

1. 修正报损列表标签/字段：仓库、库区、批次、品目各归其位；同时补字段契约测试。
2. 修正库位“站点/站点编码”重复列、临期页 warehouse/location 混用。
3. 库存状态统一接 `INV_STOCK_STATUS`；订单、退货、配送、信用等 workflow 枚举建立集中 i18n formatter。
4. 修正销售首页“今日配送/今日损耗”标签口径；多币种金额另列需求，不在 UI 写死符号。

### P1：后端名称列（兼容追加）

1. 库存专用查询：仓库/SKU 三语，zone/location 单名，store/company 三语按现有表事实返回。
2. 单据列表与 PDA：只为页面实际列补窄 JOIN；原 code 和原快照名不删。
3. 销售订单、退货、配送、渠道/客户、价格册、analytics 分批补名称列。
4. 所有聚合查询以 code 为 group key，名称用一对一 JOIN 后 `MAX()`/外层 JOIN，防止重演非聚合列导致生产 SQL 失败。

### P2：前端统一渲染

1. 建通用小组件/formatter：输入 row、name base、code、lang，内部只调用既有 helper；表格、卡片、Modal、PDA 共用。
2. 对只有单名的 zone/location/channel/route，传基础名进入同一 fallback，不制造 locale 列。
3. 页面从“code 列 + name 列”收敛为业务主列 `名称（code）`；主数据维护页可保留独立语言编辑列。
4. 错误/未知枚举显示本地化“未知”并附 code，日志与请求仍用原 code。

建议拆成三组独立 PR：A 库存 Admin + 报损错配；B PDA + 销售库存视图；C 销售订单/退货/配送/主数据/报表。接口补字段与对应页面在同一 PR 内交付，避免半成品 code-only 回退长期存在。

## 6. 测试计划

### 单元测试

- 扩充 `localized-master-data.test.ts`：zh/en/lo、snake/camel、目标语言缺失、空白值、全空、未知 locale；补 `masterNameWithCode` 的 name/code 相同、缺一项、正常双显。
- 参数化验证 Warehouse/Store/SKU selector 在三种语言下均显示 locale 名称并保留 code；已有模式见 `MasterDataSelectors.test.ts:92-106`。
- 为 zone/location 单名场景断言：切换 locale 不伪造翻译，始终显示真实基础名（code）。
- 为所有集中 enum formatter 做“每个已知 code 有三语 key、未知 code 不丢原码”测试。

### API 契约测试

- 库存批次、单据、PDA、订单、退货、配送、价格册、analytics 分别断言：原 code 字段仍在；新增名称字段存在；zh/en/lo 精确来自对应主数据列；无多语言表只返回基础名。
- 用不同语言名称的 fixture 防止把 `name_zh` 复制到 en/lo；用缺失 en/lo fixture 验证前端回退链。
- 聚合接口验证补名称前后 count/sum/group 数完全一致；一对多脏数据下不得放大金额或数量。
- 报损契约直接断言 `warehouse_code/zone_code/batch_no/item` 各自映射，禁止再按表头文本猜字段。

### 页面与 locale 切换断言

- 对每类组件至少跑 zh→en→lo 原地切换：主名称随语言变化，括号内 code 不变；目标语言缺值按既定链回退。
- 列表、详情 Modal、筛选后结果、PDA 卡片、导出（若有）保持同一显示规则。
- 状态/类型切换语言后 label 变化，网络请求参数仍是原枚举 code。
- 重点回归：报损四列、临期仓库/库位、库位站点、订单详情公司/渠道、退货回库产品、价格明细 SKU/规格、analytics 公司/渠道。

### 防回潮契约与 CI

1. 增加源码契约测试，覆盖本报告点名页面：禁止表格/卡片直接渲染裸 `warehouse_code/customer_code/channel_code/product_code/sku_code/store_code`，允许的追溯 code 必须位于统一 formatter/组件内。
2. 为接口建立 required signals：名称字段与 JOIN 必须存在，code 字段不得删除；做法可复用 `sales-activity-ui-contract.test.ts:1-29` 和 `check-product-page-quality-contracts.mjs:31-109`。
3. 将 enum code 清单与 locale key 做双向检查；现有 `check-i18n-keys.js` 和 `check-i18n-hardcoded-literals.mjs` 继续作为基础门禁。
4. CI 执行 Web Vitest、Web/API `tsc --noEmit`、相关 API Jest；库存写路径仍跑 WMS regression，但本项目已退役的 POS-store 脚本不得充当销售展示回归。

## 7. 实施验收口径

- zh/en/lo 三种界面下，范围内所有“主数据名称”列优先显示当前语言名称，并保留 code。
- 无三语列的主数据只显示真实基础名（code），不存在伪造翻译或写库翻译。
- 所有接口补字段均向后兼容，原 code、筛选参数、写入 payload 不变。
- 状态/类型/原因不再裸显英文枚举或硬编码中文；未知值仍能通过 code 追踪。
- 报损、库位、临期三处标签/字段错配有独立契约断言。
- analytics 补名称前后聚合数字完全一致；销售首页“今日”标签与 SQL 时间窗口一致。

## 8. 核查限制

本报告依据当前仓库源码、迁移与 entity 静态核查，未连接生产数据库，也未调用运行中接口。因此凡 Generic CRUD 页面字段与冻结基线存在差异（尤其 `wms_inbound/wms_outbound`），实施前必须按 g197/g201 规则核对迁移末态与真实响应；本报告没有把未验证字段写成“接口已返回”。

## 9. 执行记录

### 2026-09-02 · A 组实施与本地验证

- 已建立共享主数据/业务枚举 formatter，并扩充真实名称回退链测试；未知枚举保留原 code。
- 已修正报损仓库、库区、批次、品目四字段映射；未改变其复用 `wms_stocktake` 的数据模型。
- 已移除库位页重复“站点编码”列，并拆分临期页仓库/库位显示。
- `/api/inventory/batches` 兼容追加仓库、SKU、库位、门店真实名称列；Generic CRUD 仅对 `wms_locations`、`inv_batches` 使用显式表级白名单 JOIN。
- 静态迁移末态已核对；当前执行环境无 `psql`，真实数据库 `\\d` 与运行中响应仍待具备连接条件后只读复验。
- `/warehouse/query` 的品目列也已接入共享 locale formatter；名称缺失时保留原 SKU/产品/物料 code。
- 本地验证：API `tsc --noEmit` 0 错、Web `tsc --noEmit` 0 错；A 组 API 契约 2/2、Web 定向测试 17/17 通过。CI 结果与合入记录见后续交付记录。
- 冻结/安全边界已逐文件复核：改动限定为授权的库存名称只读 JOIN、展示与契约测试；安全扫描对 `generic-crud.service.ts` / `wms.service.ts` 的 Chanjet/DDL 命中来自未修改的既有全文件文本。显式 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的 W5 closeout 20/20 PASS，PR 登记 `reviewed-frozen-boundary` 与 `reviewed-security-touch`。
- i18n hardcoded literal gate：`3378/3378` 已覆盖、`uncovered=0`、locale quality issue `0`。

### 2026-09-02 · A 组交付

- PR [#165](https://github.com/ivanzhao299/phoenix-erp-v3/pull/165) 全部 checks 终态为 7 success、0 failure、3 条条件跳过；未以本机噪声替代 GitHub 结果。
- 已以 merge commit 合入 `main`，merge revision `d24886f59736e05745dc700ba3d41b94e51b188e`。

### 2026-09-02 · B 组实施与本地验证

- Terminal WMS 入库/出库接口由 `SELECT *` 收口为保留原业务列的表别名查询，并分别窄 JOIN 仓库、产品、客户真实名称；入库/出库页面使用共享 locale formatter，筛选和提交 payload 继续使用原 code。
- Terminal WMS 盘点直接复用 `/api/inventory/batches` 的仓库、SKU、库位名称列；状态统一走共享 formatter，批次号与盘点提交字段不变。
- 包装交接库位输入改用 `LocationSelector`，显示真实 `location_name（location_code）`，`confirmHandover.location` 仍提交 `location_code`。
- 销售库存批次与临期查询兼容追加 SKU、产品、公司、仓库、库位名称；库位 JOIN 同时约束 `location_code + warehouse_code`，公司使用单行 lateral lookup，避免放大批次数。页面 SKU/产品/公司改为 locale 名称（code）。
- 新增 API 契约 4/4、Web B 组契约 3/3；API WMS/Egg Inventory 相关测试合计 39/39；API 与 Web `tsc --noEmit` 均 0 错；i18n hardcoded literal gate `3381/3381`、`uncovered=0`。
- 本机 `MasterDataSelectors.test.ts` 复现 12 项同源 `act is not a function`（均在 render/unmount 入口失败，未进入 selector 断言），按任务书作为 React/jsdom 环境噪声记录，最终以 GitHub CI 为准。
- B 组冻结/安全边界逐文件复核后，显式授权 W5 closeout 20/20 PASS；PR [#166](https://github.com/ivanzhao299/phoenix-erp-v3/pull/166) 已登记 `reviewed-frozen-boundary` 与 `reviewed-security-touch`，CI 与 merge revision 待交付后回填。

### 2026-09-02 · B 组交付

- PR [#166](https://github.com/ivanzhao299/phoenix-erp-v3/pull/166) 全部 checks 终态为 7 success、0 failure、3 条条件跳过；本机 React/jsdom 噪声未作为放行依据。
- 已以 merge commit 合入 `main`，merge revision `bf099a07b56370aa086e1f396cc1812bb436c304`。

### 2026-09-02 · C 组实施与本地验证

- 订单 activity/详情兼容追加公司、客户、渠道、门店、SKU/产品/品级/规格真实名称；原 code 和历史快照不删，列表、关联单据、时间轴、AR/信用状态收口到共享 formatter。
- 退货列表/详情/质检/回库统一显示客户、公司、SKU/产品名称（code）及回库状态；分析聚合仅按 customer/product code 分组，名称用 `MAX()` 投影。
- 配送列表/详情窄投影公司与司机多语名称，配送 workflow 走共享 formatter；渠道、客户、信用、价格册/价格项补真实名称投影和前端双显。
- analytics 公司/渠道聚合保持 code group key，名称用 `MAX()`；销售首页的全量指标已从“今日配送/损耗”更正为“累计配送/损耗”。
- 新增 API/Web 防回潮契约；API 定向 6 suites / 33 tests、Web 定向 5 tests 全绿，API 与 Web `tsc --noEmit` 均 0 错，i18n `3402/3402`、`uncovered=0`，显式授权 W5 closeout 20/20 PASS。CI、merge revision、部署与生产只读复验见后续交付记录。
