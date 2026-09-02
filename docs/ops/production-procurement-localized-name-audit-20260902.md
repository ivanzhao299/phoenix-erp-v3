# 生产管理与采购管理名称/编码显示统一核查（核查稿，2026-09-02）

## 1. 结论与边界

本轮只做源码、静态迁移末态与接口契约核查，未修改前端、后端、数据库或测试。生产管理实际没有 `/production/*` 主路由：管理端分布在 `/breeding/*`、`/packaging/*`，另有 `/terminal/packaging/*`、`/mobile/mobile/{packaging,henhouse}` 和 `/analytics/production`；采购管理实际位于 `/procurement2/*`。

沿用 `inventory-sales-localized-name-audit-20260902.md` 已验证口径：

- 名称回退链为当前界面语言 → 中文 → 英文 → 老挝语 → 基础名 → 编码，前端统一复用 `localizedMasterName()` / `masterNameWithCode()`（`apps/web/src/lib/localized-master-data.ts:1-23`）。
- 列表、详情和统计显示 `名称（code）`；code 继续承担筛选、提交、关联和追溯，不能被 label 覆写。
- 无三语列时只显示真实单名，不复制基础名伪造 `_en/_lo`，不机器翻译写库。
- 状态、类型、原因、等级等枚举优先走 `sys_dict`，否则走稳定 i18n key；未知值保留原 code。现有 `business-display.ts` 尚未覆盖生产、采购域（`apps/web/src/lib/business-display.ts:7-31`）。
- 聚合补名称保持 code 为 group key，名称使用唯一 JOIN 后 `MAX(name*)` 或聚合后外层 JOIN；Generic CRUD 只允许显式表级白名单 JOIN。

核心结论：生产侧场站、栋舍只有真实单名，鸡群没有名称列；生产分析、蛋品台账、包装任务/日报普遍只返回 code。采购侧只有供应商读取明确带基础/en/lo 三列，PO/PR/收货/运单和 dashboard 多数使用单据快照名或 code。最明确的 P0 问题是生产入库台账、药品台账和设备操作状态裸显中文/英文枚举，采购运输与供应商筛选硬编码中文，以及采购申请/订单的 `PRC_PURCHASE_TYPE` 选项不一致。

## 2. 数据层多语言事实

下表依据冻结 SQL 基线与 `apps/api/src/database/migrations/` 后续 TS 迁移静态推导；不是生产库 `\\d` 结果。实施前仍须按 g197/g201 核对真实表与迁移末态。

| 主数据表 | 真实名称列末态 | 设计边界 | 静态证据 |
|---|---|---|---|
| `brd_farms` | `farm_name` | 场站仅真实单名 | `apps/api/src/modules/generic-crud/generic-crud.service.ts:134-140`; `migrations/20260605_glp1a2_meng_sai_master_data.sql:24-27` |
| `brd_houses` | `house_name` | 栋舍仅真实单名 | `docs/schema-snapshot.sql:550-562`; `migrations/20260605_glp1a2_meng_sai_master_data.sql:29-52` |
| `brd_flocks` | 无名称列；`strain` 是品种文本 | 鸡群只能显示 `flock_no`，不能把 strain 当名称 | `docs/schema-snapshot.sql:520-543`; `generic-crud.service.ts:148-159` |
| `prc2_suppliers` | `supplier_name`, `_en`, `_lo` | 基础名承担默认/中文；可按 locale 回退 | `apps/api/ddl/23_procurement_v2_tables.sql:18-24`; `1782700000000-AddMasterDataMultilingualNames.ts:23-28` |
| `mst_materials` | `material_name`, `_en`, `_lo` | 基础名承担默认/中文 | `apps/api/migrations/20260612_g86_materials_master.sql:10-24`; `1782700000000-AddMasterDataMultilingualNames.ts:23-31` |
| `mst_products` | `product_name`, `_zh`, `_en`, `_lo` | 完整三语加基础名 | `apps/api/migrations/v3_schema_complete.sql:14-24,735-741`; `1782700000000-AddMasterDataMultilingualNames.ts:34` |
| `product_skus` | `sku_name`, `_en`, `_lo` | 基础名承担默认/中文 | `apps/api/migrations/20260530_product_master_h2.sql:92-105`; `1782700000000-AddMasterDataMultilingualNames.ts:37-40` |
| `product_grades` / `packaging_specs` | 基础名、`_en`, `_lo` | 基础名承担默认/中文 | `apps/api/migrations/20260530_product_master_h2.sql:18-31`; `1782700000000-AddMasterDataMultilingualNames.ts:42-43` |
| `wms_warehouses` | `warehouse_name`, `_zh`, `_en`, `_lo` | 完整三语加基础名 | `apps/api/migrations/v3_schema_complete.sql:438-446,836-837`; `1782700000000-AddMasterDataMultilingualNames.ts:40-41` |
| `mst_stores` | `store_name`, `_en`, `_lo` | 基础名承担默认/中文 | `apps/api/migrations/v3_schema_complete.sql:27-36`; `1782700000000-AddMasterDataMultilingualNames.ts:34-36` |
| `sys_organizations` | `org_name`, `org_name_cn` | 公司无 en/lo，按真实单名/中文回退 | `apps/api/migrations/20260530_create_missing_sys_tables.sql:54-78`; `20260531_org_runtime_phase1.sql:24-43` |
| `sal_drivers` | `driver_name`, `_en`, `_lo` | 可 locale；采购运单当前不关联司机 | `apps/api/migrations/20260527_sales_v2_phase4_delivery_runtime.sql:23-37`; `1782700000000-AddMasterDataMultilingualNames.ts:42-45` |
| `sal_vehicles` | 无名称列；仅 `vehicle_no`, `plate_no` | 不能伪造车辆名称 | `apps/api/migrations/20260527_sales_v2_phase4_delivery_runtime.sql:44-58` |

未发现承运商主数据表；`prc2_shipments.carrier_name` 是单据文本快照，不得假定存在承运商三语 JOIN。多语言迁移只加列、未回填历史值（`1782700000000-AddMasterDataMultilingualNames.ts:48` 起），因此前端回退链必须保留。

## 3. 生产管理核查矩阵

| 页面 | 字段/列 | 现状 | 根因 | 改法 | 后端需补 |
|---|---|---|---|---|---|
| `/breeding` | 场站/鸡群总览 | 并行读 `brd_farms/brd_flocks/brd_daily_logs`，消费侧自行组合（`breeding/page.tsx:154-160`） | Generic CRUD 仅 `SELECT *`；鸡群无名称列 | 场站单名（code）；鸡群显示 flock no，不能伪造名称 | 仅跨表卡片需要时做表级白名单 JOIN |
| `/breeding/flock` | 场站、栋舍、品种、状态 | 并行加载 farms/houses/flocks；状态已 i18n；品种字典只取 `dict_label_zh`（`flock/page.tsx:119-153`） | 字典消费未读取 en/lo | 场站/栋舍单名（code）；品种改用字典 locale label；flock no 保持追溯 | 否，字典响应若无 labelEn/Lo 则补 |
| `/breeding/henhouse` | 场站、鸡群、鸡舍类型/状态 | 主数据由三个 CRUD 客户端拼接；`normal/warning` 已 i18n（`henhouse/page.tsx:76-82,313-319`） | house/farm 仅单名；type 未见权威字典 | 单名（code）；鸡舍类型接字典/i18n，不把 strain 当 flock name | 视 type 接口事实 |
| `/breeding/henreport` | 鸡舍、鸡群 | API 已返回 `house_code/house_name/flock_no`（`farm.service.ts:540-624`） | 鸡舍仅单名；无 farm 名 | 鸡舍单名（code），鸡群显示 flock no | 否；若页面新增场站才补 |
| `/analytics/production` | 场站/鸡舍排行 | 前端调用 `/api/breeding/daily-reports?limit=30`，仓内未发现对应后端；现有 API 为 `/api/v2/analytics/production`（前端 `analytics/production/page.tsx:115-119`; 后端 `analytics.controller.ts:36-40`） | 路由契约错位；现有 `byFarm/byHouse` 只按 code 聚合 | P0 先纠正接口契约；按 code 分组后补 farm/house 单名 | 是：`production-analytics.service.ts:63-81` |
| `/breeding/daily-inbound-ledger` | 入库类型、等级、鸡舍、表头/日期 | `change_type/grade/house_code` 原码；表头、按钮、空态及 `zh-CN` 日期硬编码（`daily-inbound-ledger/page.tsx:66-88`） | egg ledger 无 grade/house JOIN；枚举未统一 | change type i18n；grade/house 单名（code）；所有文案/日期随 locale | 是：`farm-egg.service.ts:71-87` |
| `/breeding/feed` | 物料、栋舍、告警 | 返回 `material_name`；`CRITICAL` 在前端直接判断（`feed/page.tsx:61-78,204`） | 未统一生产告警枚举；接口名称契约需固定 | 物料 locale 名称（code）；告警集中 i18n | 是：若 ledger 未返 material name* |
| `/breeding/med-stock` | 药品、流水类型/状态 | 两张表头裸中文，`MED_INBOUND` 原值仅用于着色（`med-stock/page.tsx:261,417,432-433`） | i18n 与枚举 formatter 编失 | 药品真实单名（code）；流水类型/状态集中 i18n | 核对药品主数据与 ledger 返回 |
| `/breeding/device-ops` | 操作状态 | `SUCCESS/RUNNING/FAILED/PARTIAL` 直接输出（`device-ops/page.tsx:145-164`） | 未接 i18n formatter | 新增生产设备操作 enum domain，未知值保留 code | 否 |
| `/packaging` | 班次/批次/鸡舍/状态 | 批次状态局部 i18n，未知值裸显；today source batch 只有单一 `house_name`（`packaging/page.tsx:102,160,205-208`; `bff.controller.ts:1454-1480`） | 多套局部状态；pending source batch 只有 house code | 鸡舍单名（code）；状态集中 i18n | 是：pending 查询补 house 单名 |
| `/packaging/inbound` | 鸡舍、仓库、状态 | `wms_inbound` 行含 `house_code/warehouse/status`；状态三态已 i18n（`packaging/inbound/page.tsx:30-53`） | Generic CRUD 无关联名称；字段 `warehouse` 语义需核实 | house/warehouse 名称（code）；保持 workflow code | 是，实施前核对真实列名 |
| `/packaging/batch` | 等级 | `nameZh || name || code`，不随 locale（`packaging/batch/page.tsx:80-87`） | grade config 消费只认中文 | 返回/消费真实 grade name/en/lo，helper 双显 code | 是：若 config 未返 en/lo |
| `/packaging/daily-report` 与移动包装报表 | 等级聚合 | JSON key 直接作为 grade，API 按 code 聚合（`terminal/packaging.service.ts:846-927`） | 无 `product_grades` 名称投影 | 保持 grade code group key，外层 JOIN/`MAX` 补真实名称 | 是 |
| `/terminal/packaging/*` | source house、grade、dict | tasks 只返 `src_house`；异常字典只返 zh label（`terminal/packaging.service.ts:413-456,615-635`） | 查询未 JOIN house；字典投影丢 en/lo | PDA 紧凑显示单名（code）；字典返回并消费三语 label | 是 |
| `/terminal/packaging/dashboard` | “已入库” | 流程条“已包装”和“已入库”都复用 `packedBoxes`（`dashboard/page.tsx:29,39-56`） | 指标/标签错配，不是名称问题但属同页 P0 | 后端明确 `warehousedBoxes` 或库存已提交量；禁用同值冒充 | 是 |

`/breeding/daily`、`/breeding/immune`、`/breeding/medicine`、`/packaging/exceptions`、`/packaging/print-logs` 的已知状态展示大体已走 `t()`/字典；本轮未发现“应显名称却显编码”的新增确定项。`/breeding/daily` 的班次 fallback 与免疫/药物类型仍应在实施时核对权威字典，不能据前端常量推断后端枚举。

## 4. 采购管理核查矩阵

| 页面 | 字段/列 | 现状 | 根因 | 改法 | 后端需补 |
|---|---|---|---|---|---|
| `/procurement2/dashboard` | 供应商绩效 | `supplierName || supplierCode`，名称来自 PO 快照；无 locale（前端 `dashboard/page.tsx:395-414`; 后端 `dashboard.service.ts:305-340`） | 未 JOIN `prc2_suppliers`；名称也被放进 GROUP BY | 以 supplier code 分组，`MAX(name/name_en/name_lo)` 或外层 JOIN；前端 helper 双显 | 是 |
| 同上 | 项目成本/运单状态 | project/company 都是 PO 快照单名；`statusLabel` 由后端硬编码中文（`dashboard.service.ts:157-201,267-302`） | 本地化落在 API；名称非 locale 主数据 | API 返回稳定 status code；前端 i18n。项目/公司按真实单名（code） | 状态否；名称按需求补 |
| 同上 | 金额币种 | summary UI 固定 `(CNY)`，AP/趋势按 `currency_code` 分组（`dashboard/page.tsx:265-271`; `dashboard.service.ts:114-155,204-234`） | 标签与聚合币种契约未统一 | 明确本位币或按币种展示，禁止固定币种掩盖多币种 | 是：summary 需明确 currency/base 语义 |
| `/procurement2/orders` 列表/详情 | 公司、项目、供应商、明细品目 | 名称优先 code fallback；后端无 JOIN，全部是单据快照，明细也是快照（`orders/page.tsx:575-610`; `orders.service.ts:187-264`） | entity 只存单名，未投影 locale 主数据 | 快照作审计 fallback；供应商/物料追加真实 name*，公司/项目仅真实单名；统一 `name(code)` | 是 |
| `/procurement2/requests` 列表/详情 | 公司、项目、品目 | 无 JOIN，仅 entity 快照（`requests.service.ts:156-225`） | 同订单 | 同订单；item code 保持提交值 | 是 |
| 同上 | 采购类型 | 订单选项含 `CONSTRUCTION`，申请页不含（`orders/page.tsx:168-186`; `requests/page.tsx:129-145`） | 两份前端枚举漂移 | 以 `PRC_PURCHASE_TYPE` 为权威，Selector、筛选、formatter 同源 | 先核对 dict/DTO/CHECK |
| `/procurement2/receipts` | 仓库、收货人、品目 | 列表仓库只显 `warehouseCode`；后端无 JOIN，只有 receiver/company/project 快照（`receipts/page.tsx:447-480`; `receipts.service.ts:92-142`） | 收货接口未 JOIN warehouse/SKU | 仓库 locale 名称（code）；品目 locale 名称（code）；收货人真实单名（id/code 若有） | 是 |
| `/procurement2/shipments` | 国家、公司/项目、承运商 | 国家直接 code；公司/项目和 carrier 是单据快照（`shipments/page.tsx:382-416`; `shipments.service.ts:129-175`） | 无 JOIN；无承运商主表 | 国家用 `SYS_COUNTRY` locale label（code）；公司/项目真实单名（code）；carrier 只显示真实快照名 | 国家否；公司/项目按需求补 |
| 同上 | status/type/customs | 三组 label 全硬编码中文；`DOMESTIC` 与 `LOCAL` 同时存在（`shipments/page.tsx:54-80`） | 局部枚举与潜在语义重复 | P0 对齐 DTO/CHECK/dict 后集中 i18n；未知值保留 code | 否，但先核对末态约束 |
| `/procurement2/suppliers` | 供应商名称 | API 返回 `supplier_name/name_en/name_lo`，页面仍分列/基础名消费（`suppliers.service.ts:30-85`; `suppliers/page.tsx:484-550`） | 消费侧未用 helper | 业务主列按 locale `名称（code）`；维护详情可保留语言列 | 否 |
| 同上 | 国家/币种、类型、状态、共享范围 | 列表国家/货币 code-only；筛选选项和状态/类型/范围硬编码中文（`suppliers/page.tsx:51-117,541-545`） | 列表未用字典 label；局部常量 | 国家/币种用字典 locale label（code）；其余集中 i18n/字典 | 否 |
| 同上 | 主数据治理 | 页面仍有 POST/PATCH 与状态写接口（`suppliers/page.tsx:124-146`） | 与“采购视图只读、主数据下沉”约定存在复核点 | 名称改造 PR 不顺带改流程；另立权限/入口治理核查 | 否 |
| `/procurement2/payments` | 公司/项目/付款方、枚举 | 主要名称快照与 code fallback；枚举已用 `t()`/字典（`payments/page.tsx:80-123`; `PaymentForm.tsx:319-401`） | 无 locale JOIN，但本轮没有确定错配 | 快照显示 `name(code)`；如需主数据 locale 再补窄 JOIN | 可选 |
| `/procurement2/shareholder-funds` | 股东/项目、日期 | 名称来自快照/Selector；`createdAt` 固定 `zh-CN`（`shareholder-funds/page.tsx:468-520,630`） | 日期格式未随 locale | 名称双显；日期按当前 locale | 否 |
| `/procurement2/init` | 批次/错误状态 | 批次类型有 i18n；错误行透传后端 status/error（`init/page.tsx:382-415,716-776`） | 未建立错误状态完整 formatter | 已知状态 i18n，未知保留 code；错误消息不伪翻译 | 否 |
| `/procurement2/projects` | 项目 | 服务端重定向 `/master-data/projects`（`projects/page.tsx:1-15`） | 已完成主数据下沉 | 保持，不另建采购 formatter/CRUD | 否 |

订单、申请、收货、运单列表后端目前都是 TypeORM entity 查询且无 JOIN；不能把当前前端的 `name || code` 写成“接口已有三语名称”。供应商列表/详情是本范围内唯一明确返回基础/en/lo 名称的采购接口（`prc2-supplier.entity.ts:16-104`）。

## 5. 后端最小补字段方案

| 接口族 | 当前真实返回 | 最小兼容补法 |
|---|---|---|
| `/api/v2/analytics/production` | `byFarm/byHouse` 只有 code + 数值 | code 继续 group key；外层 JOIN `brd_farms/brd_houses` 补真实单名 |
| `/api/farm/egg/ledger` | grade、house 均 code-only | JOIN `product_grades` 补 name/en/lo；JOIN house 补单名；保留原 code |
| Packaging source/tasks/reports | source house、grade JSON key code-only；部分字典仅 zh | task 查询窄 JOIN house；grade 聚合后 JOIN；字典响应追加真实 en/lo 字段 |
| Generic CRUD breeding/WMS | 默认 `SELECT * FROM table`（`generic-crud.service.ts:2478-2509`） | 只对确需列表做表级白名单 JOIN；优先专用 read DTO，禁止全局猜关联列 |
| PO/PR/Receipt/Shipment | entity 全字段与单据快照；零主数据 JOIN | 追加只读投影：supplier/material/SKU 的真实 name*，warehouse 的 name*，farm/house/company/project 按真实列能力返回；快照不删 |
| Dashboard supplier/project | 名称随快照一起 GROUP BY | code-only 聚合后外层 JOIN，或 code group + `MAX(name*)`；补名前后 count/sum/group 数必须一致 |

禁止方案：给 farm/house/company/carrier 临时复制 `_zh/_en/_lo`；把 flock strain 当鸡群名称；把 PO/PR 快照单名当多语主数据；前端逐行 lookup；用名称替换 code；为方便 GROUP BY 把 locale 名称加入 key 导致同 code 拆组。

## 6. 实施拆分（另轮执行）

按模块分组 PR，且接口补字段与对应消费页面放在同一 PR，避免长期保留半成品 code-only fallback。

### P0：错配与枚举

1. **PR-PROD-P0**：修正 `/analytics/production` 前后端路由契约；修复 terminal packaging dashboard “已入库=已包装”指标错配；生产入库台账、药品台账、device-ops 文案与状态集中 i18n。
2. **PR-PRC-P0**：运输 status/type/customs、供应商 status/type/scope 全部改稳定 i18n/字典；对齐订单/申请 `PRC_PURCHASE_TYPE`；日期格式随 locale；核对 summary 币种标签。

### P1：后端名称列

1. **PR-PROD-P1**：production analytics、egg ledger、packaging source/tasks/reports 窄 JOIN；farm/house 只补真实单名，grade/SKU/material 按真实 name/en/lo 返回。
2. **PR-PRC-P1**：订单/申请/收货按页面列补 supplier/material/SKU/warehouse 名称；dashboard supplier performance 按 code 聚合补名称；运单国家优先字典，无承运商主表不造 JOIN。
3. 所有 schema/entity/DTO/SQL 变更前执行 g197/g201 三对齐：真实 `\\d`、TS 迁移末态、entity/DTO/写入值；本核查不授权运行生产 DDL。

### P2：前端统一渲染

1. **PR-PROD-P2**：生产 Admin、包装 Terminal/Mobile 的列表、详情、统计统一调用共享 helper；farm/house 单名也通过基础名 fallback，flock 仍显 no。
2. **PR-PRC-P2**：PO/PR/Receipt/Dashboard/Supplier 主列统一 `名称（code）`；国家/币种/状态等走字典或集中 formatter；筛选与 payload 保持 code。

## 7. 测试计划

### Locale 切换断言

- zh → en → lo 原地切换：supplier/material/SKU/warehouse/grade 优先当前语言，括号 code 不变；目标语言为空时严格按既定链回退。
- farm/house/company/carrier 只显示真实可用单名（code），三种 locale 下不得出现复制出来的“翻译”；flock 只显示 flock no。
- 覆盖列表、详情 Modal、dashboard 排行、包装 PDA 卡片与移动报表；日期/金额格式使用当前 locale，业务请求参数不变。
- 生产/采购所有已知枚举在 zh/en/lo 都有 label；未知值显示原 code。特别覆盖 `PACKAGING_INBOUND/TEMP_PRODUCTION_INBOUND`、设备操作状态、运输/报关状态、`CONSTRUCTION`。

### API 与聚合契约

- 每个补名接口断言原 code 字段仍存在，新名称字段精确来自对应真实列；用 en/lo 不同值 fixture 防止复制中文伪造翻译。
- production analytics、packaging grade、supplier performance 补名前后 count/sum/group 数一致；一对多脏数据不放大数量或金额。
- 契约锁定 `/analytics/production` 调用的真实 endpoint，锁定 terminal packaging “已入库”不得读取 `packedBoxes`。
- PO/PR/Receipt/Shipment 明确断言快照名与主数据 locale 名是不同字段；主数据缺失时才回退快照/code。

### 防回潮与验证命令

1. 增加页面源码契约：点名表格/卡片不得直接渲染 `farm_code/house_code/warehouse_code/supplier_code/item_code/grade`；允许 code 只能经统一 `masterNameWithCode` 或枚举 formatter。
2. 增加 API required signals：JOIN/名称字段存在且原 code 不删；Generic CRUD JOIN 必须在表级白名单。
3. 扩展 `business-display.test.ts`，加入生产与采购 enum domain；复用 `localized-master-data.test.ts` 的 snake/camel、缺语言、全空测试。
4. 定向跑生产/采购 API Jest、Web Vitest，再跑 API/Web `tsc --noEmit`、`node scripts/check-i18n-keys.js`、`node scripts/ci/check-i18n-hardcoded-literals.mjs --fail-on-uncovered`、`node scripts/ci/check-procurement-datascope-writes.mjs`；涉及 WMS 入库仍跑现有 WMS policy regression。

## 8. 核查限制与执行门

- 本报告未连接生产数据库、未调用运行中接口，也未执行迁移；“当前真实返回”均以仓库中的 SQL、QueryBuilder 与 entity 序列化路径为证据。
- `brd_*`、包装 `pkg_*` 与采购实体存在历史混合 schema；实施前必须核对真实 `\\d` 与运行响应，尤其 `wms_inbound.warehouse`、包装 JSON grade key、采购枚举 CHECK。
- 本轮不修改业务代码，不新增翻译列，不调整供应商治理流程；供应商页面仍有写能力的问题仅登记为独立治理复核点。
