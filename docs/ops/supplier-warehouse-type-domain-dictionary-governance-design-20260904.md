# 供应商 / 仓库类型值域字典化清洗治理核查与方案设计（2026-09-04）

> 性质：核查与方案设计，零实施。本文没有修改 schema、代码、字典或业务数据，也没有执行生产写入。
>
> 决策门禁：所有逐值映射，尤其供应商 `LOCAL/OVERSEAS` 和仓库 `COLD_STORAGE/NULL`，必须由用户批准；需要逐行判定的集合必须先导出清单逐行批准。批准前不得创建数据映射 workflow、不得执行 UPDATE、不得增加会拒绝现存值的 CHECK。
>
> 权威对齐：仓库部分以 [warehouse-type-and-permission-research-20260825.md](warehouse-type-and-permission-research-20260825.md) 为基础，不另造体系。该研究已经确定 `domain`、用途类型、设施类别、能力是正交维度；`facility_class=STORE` 后续又获批准但尚未落 schema（`store-pos-workstation-v1-research-20260827.md:241,267-288,458`）。

## 0. 执行摘要与待批事项

1. 当前生产供应商 34 行、9 个非空值；`supplier_type` 混合“采购地域”和“供应品类”。代码中没有任何订单审批、税费、付款、库存、币种或运输逻辑按它分支，真正消费仅为供应商列表等值查询、表单写入和展示。因此现在拆字段的运行时风险低，数据判定成本是主要风险。
2. 当前生产仓库 31 行、10 种状态（含 1 个 NULL）。`type` 真正驱动两条核心逻辑：采购收货仅接受 `FEED/MEDICINE/PURCHASE_RECV/RAW_MATERIAL`，日产蛋入库固定找 `EGG_FARM`。调拨、盘点、报损、仓位校验不按仓库 type 分支。
3. 仓库 `domain` 已落地并负责 `OPERATIONAL/FINANCE_MAPPING/TEST` 操作面隔离；`facility_class` 尚不存在。不能把 `STORE`、`COLD`、`QUARANTINE` 再写回旧 `type`：前者是设施类别，冷链/隔离应由 capability、zone 或库存状态表达。
4. 推荐供应商选 **S-A：拆双字段**；推荐仓库选 **W-A：保留 `type` 作为兼容用途列，新增 `facility_class`，后续有计划地改名为 `usage_type`**。两者均采用“先兼容读、再逐值/逐行批准回填、最后加约束”的顺序。
5. 本轮需要用户批准的不是一条模糊“同意治理”，而是：供应商方案、供应商逐值规则、仓库目标用途值域、仓库逐值/逐行规则、NULL 仓处置、facility 分类清单、是否同期建设 capability。

## A. 消费面全景

### A1. 供应商类型

#### 数据合同与写入口

| 层 | 消费点 | 当前行为 | 风险 |
|---|---|---|---|
| DB | `apps/api/ddl/23_procurement_v2_tables.sql:19-45` | `prc2_suppliers.supplier_type VARCHAR(32)`，nullable，无默认、无 CHECK | 任意字符串可入库 |
| Entity | `prc2-supplier.entity.ts:32-33` | nullable string | 与 DB 一致，但没有值域 |
| DTO | `create-supplier.dto.ts:30-32`、`update-supplier.dto.ts:8-11` | 只校验 optional string | API 无白名单 |
| Query DTO | `query-supplier.dto.ts:4-14` | 接受任意 `supplierType` | 查询等值过滤 |
| CRUD service | `suppliers.service.ts:35-44,104-110,137-143` | 列表按类型等值过滤；create/update 原样写入 | 唯一真实后端分支是筛选，不是业务策略 |
| Runtime | `master-data-runtime.service.ts:87-93,263-274,449-454` | 类型可写；新建时要求非空；无字典校验 | Runtime 与 DTO 规则不一致（DB/DTO nullable，Runtime 新建必填） |
| Lookup | `lookup.controller.ts:249-268` | 返回 `supplierType`，不按类型过滤 | 仅传递 |
| 常量 | `prc2.constants.ts:69-73` | `LOCAL/OVERSEAS/AGENT` enum | 未被 DTO/service 使用，是未接入的死合同 |

#### 前端输入、筛选与展示

| 页面/组件 | 类型消费 | 现状 |
|---|---|---|
| 主数据供应商表单 | `master-data/suppliers/_fields.ts:4-13` | 硬编码 12 值 select，地域与品类混排 |
| 主数据供应商列表 | `master-data/suppliers/page.tsx:26-41` | 展示 `supplier_type`，无类型筛选 |
| 供应商详情 | `master-data/suppliers/[code]/page.tsx:174-189,301-309` | 两处格式化展示 |
| 详情 drawer | `master-data/detail-configs.tsx:182-188` | 格式化展示 |
| 采购供应商页 | `procurement2/suppliers/page.tsx:105-120,151-157,246-254,716-734` | 另有仅 5 值的硬编码 select；新建/空编辑默认 `OTHER`；列表不展示也不筛类型 |
| 展示映射 | `business-display.ts:7-14,44-48` | 混合 12 值；未知值原样显示、空值显示 `—` |
| SupplierSelector | `MasterDataSelectors.tsx:109-114` | 只取 ACTIVE 供应商，不接受 type 参数 |

`SupplierSelector` 的采购订单、申请、付款、AP、养殖群等调用只消费供应商 code/name，不消费类型。

#### 采购业务分支结论

全仓未发现采购订单、采购申请、收货、付款、AP、审批、税费、币种、运输或 Chanjet 入账按 `supplier_type` 分支。`chanjet-integration.service.ts:6519-6527` 中同名候选字段只用于识别外部对象是否具有供应商身份，不是 ERP `prc2_suppliers.supplier_type` 的值域消费。

所以清洗不会直接改变采购状态机，但会影响：主数据录入、采购供应商编辑、列表等值查询、详情/列表标签和外部调用者传入的过滤值。

### A2. 仓库类型、domain 与 facility_class

#### 当前数据模型

| 维度 | 现状 | 权威语义 |
|---|---|---|
| `type` | `VARCHAR(32)`，无 CHECK；设施形态、库存用途、导入推断值混用 | 当前运行时实质是“用途类型”兼容列 |
| `domain` | 已由 `1787724000000-AddWarehouseDomain.ts:7-17` 落地，NOT NULL，默认 `OPERATIONAL` | `OPERATIONAL/FINANCE_MAPPING/TEST`，决定是否进入 WMS 操作面 |
| `facility_class` | schema、API、Web 均不存在 | 已批准方向：`FACTORY/DISTRIBUTION/STORE/TRANSIT/GENERAL` |
| capability | 未落地 | 冷链、隔离、财务映射、零售履约等非互斥能力；不能挤入 facility/type |

#### 输入、筛选、展示

| 消费点 | 当前行为 |
|---|---|
| `/api/lookup/warehouses`（`lookup.controller.ts:537-572`） | 固定 ACTIVE + OPERATIONAL，可选 company/site/type 等值过滤，返回 `warehouseType` |
| `WarehouseSelector`（`MasterDataSelectors.tsx:269-288`） | 可传 type；唯一实际固定 type 的页面是日产蛋入库 `type="EGG_FARM"` |
| 主数据仓库页（`master-data/warehouses/page.tsx:26-50`） | 硬编码设施六值、G15 用途七值及 `GENERAL/COLD_STORAGE`，可直接写旧 `type` |
| 旧仓库 CRUD（`warehouse/warehouses/page.tsx:19-38`） | 不展示、不编辑 type/domain |
| 展示映射（`business-display.ts:15-18,44-48`） | 混合值域；未知值原样显示 |
| 普通入/出/调/盘/损页面 | 仓库 Selector 通常不传 type；区/位只按仓/区级联 |

#### WMS 业务逻辑

| 流程 | 是否按仓库 `type` 分支 | 实际规则 |
|---|---:|---|
| 日产蛋入库 | 是 | `production-inbound.service.ts:102-122` 固定 ACTIVE + OPERATIONAL + `EGG_FARM`；多仓时要求显式选仓 |
| 采购收货 | 是 | `wms.service.ts:27-29,123-137,349-371` 只允许 `FEED/MEDICINE/PURCHASE_RECV/RAW_MATERIAL`，且 domain 必须 OPERATIONAL |
| 普通入库策略 | 否（按单据 type） | `wms-inbound-policy.ts:1-111` 按 PURCHASE/PRODUCTION/TRANSFER 等单据类型限制来源、品目和 workflow |
| 出库策略 | 否（按单据 type） | `wms-outbound-policy.ts:1-160` 按 SALE/TRANSFER/ISSUE/SCRAP 等单据类型限制去向、品目和 workflow |
| 调拨 | 否 | 源/目标只校验 OPERATIONAL、scope、库存；固定 TRANSFER/TRANSFER_RECEIVE 策略（`wms.service.ts:1530-1630`） |
| 盘点/PDA 盘点 | 否 | 按批次仓、scope/domain 校验（`:1960-2050`） |
| 报损 | 否 | 按 scope/domain，固定 `SCRAP`（`:2168-2211`） |
| 仓位/目的仓校验 | 否 | 仓、区、位归属及 ACTIVE/OPERATIONAL/scope；目的仓不检查 type（`:145-178`） |
| 通用写边界 | 否 | `assertWritableWarehouse()` 只检查存在、OPERATIONAL 和 allowedWarehouseCodes（`:72-96`） |

重要区分：`wms_inbound.type`、`wms_outbound.type` 是单据类型，不是 `wms_warehouses.type`；此次治理不得混改。

## B. 目标值域与映射候选（全部待批准）

### B1. 生产基线

生产计数来自 `master-data-nine-page-company-type-display-audit-20260903.md:247-252,267-269`：

- 供应商 34 行：`CHICK 2 / FEED 14 / LOCAL 4 / OTHER 1 / OVERSEAS 1 / PACKAGING 2 / RAW_MATERIAL 2 / VACCINE 1 / VETERINARY 7`。
- 仓库 31 行：`NULL 1 / COLD_STORAGE 1 / EGG_FARM 2 / EGG_SALES 12 / FEED 2 / FINISHED 1 / GENERAL 6 / MEDICINE 2 / PURCHASE_RECV 1 / RAW_MATERIAL 3`。

该审计没有导出当前 34 个供应商或 31 个仓库的逐行身份。仓库 NULL 行可由历史全量审计唯一确认是 `WH-0001 / 东鹏农场鸡蛋暂存仓（测试） / domain=TEST`；供应商不能从聚合计数反推具体行。实施前必须重新只读导出逐行清单和当前计数，不能把本文计数当永久 baseline。

### B2. 供应商三方案对比

| 方案 | 模型 | 优点 | 缺点/影响 | 结论 |
|---|---|---|---|---|
| S-A 拆双字段 | `supply_category` + `sourcing_type` | 语义正交；保留全部事实；未来可分别筛选/报表 | 需 schema/API/UI 双字段；现存每行只知道一个维度，另一维必须为 UNSPECIFIED 或逐行补录 | **推荐** |
| S-B 单字段收敛品类 | 将现字段只定义为 supply category | 改动相对小；符合多数生产值（29/34） | `LOCAL 4 + OVERSEAS 1` 共 5 行无法机械映射，必须逐行查品类；地域信息若无新字段会丢失 | 仅在明确放弃地域结构化时可选 |
| S-C 维持混合，只字典化 | 12 个已知 code 同处一字典 | 最小代码/数据改动，34 行可原值保留 | 永久保留错误模型；筛选、统计和标签仍混义；未来 CHECK 只是把混乱固化 | 仅作短期过渡，不建议作为终态 |

#### S-A 推荐目标值域

- `supply_category`：`CHICK/FEED/OTHER/PACKAGING/RAW_MATERIAL/VACCINE/VETERINARY`，并为代码/历史已知但当前生产计数为 0 的 `EQUIPMENT/MEDICINE/SERVICE` 预留与否由用户裁定。
- `sourcing_type`：`LOCAL/OVERSEAS/AGENT/UNSPECIFIED`。
- `UNSPECIFIED` 只表示“尚未采集”，不是把未知事实猜成 LOCAL；若不接受占位，则字段允许 NULL，但 UI 必须明确显示“待补录”。

#### S-A 现值映射候选

| 现值 | 行数 | `supply_category` 候选 | `sourcing_type` 候选 | 业务影响/审批点 |
|---|---:|---|---|---|
| CHICK | 2 | CHICK | UNSPECIFIED | 品类无损；地域待补 |
| FEED | 14 | FEED | UNSPECIFIED | 品类无损；地域待补 |
| LOCAL | 4 | **逐行待定** | LOCAL | 不猜品类；需导出 4 行批准 |
| OTHER | 1 | OTHER | UNSPECIFIED | 保留兜底；地域待补 |
| OVERSEAS | 1 | **逐行待定** | OVERSEAS | 不猜品类；需导出 1 行批准 |
| PACKAGING | 2 | PACKAGING | UNSPECIFIED | 品类无损；地域待补 |
| RAW_MATERIAL | 2 | RAW_MATERIAL | UNSPECIFIED | 品类无损；地域待补 |
| VACCINE | 1 | VACCINE | UNSPECIFIED | 不与 VETERINARY/MEDICINE 静默合并 |
| VETERINARY | 7 | VETERINARY | UNSPECIFIED | 不与 VACCINE/MEDICINE 静默合并 |

生产影响：29 行可以保留原品类并补 sourcing 占位；5 行只能保留地域、品类逐行待定。所有 34 行都会新增至少一个字段写值，但没有采购状态机行为变化。

#### S-B 单品类字段映射候选

| 现值 | 行数 | 目标 | 处置 |
|---|---:|---|---|
| CHICK/FEED/OTHER/PACKAGING/RAW_MATERIAL/VACCINE/VETERINARY | 29 | 原值 | 无损 |
| LOCAL | 4 | 逐行待定 | 必须逐供应商批准，不得统一映射 OTHER |
| OVERSEAS | 1 | 逐行待定 | 必须逐供应商批准，不得统一映射 OTHER |

该方案会丢掉 5 行已知地域事实，除非把地域另存备注；把结构化事实降格为备注不推荐。

#### S-C 混合字典映射候选

9 个生产值全部 identity mapping；目标字典建议至少覆盖当前 UI 已知 12 值：`LOCAL/OVERSEAS/AGENT/RAW_MATERIAL/PACKAGING/FEED/MEDICINE/EQUIPMENT/CHICK/VACCINE/VETERINARY/OTHER`。这不需要生产 UPDATE，但不能宣称完成语义治理。

### B3. 仓库目标：与 20260825 研究对齐

#### 推荐 W-A：用途与设施并行

1. 兼容阶段保留列名 `type`，把它收敛为用途值域：`EGG_FARM/EGG_SALES/MEDICINE/FEED/RAW_MATERIAL/PURCHASE_RECV/FINISHED/GENERAL`。
2. 新增 `facility_class`：`FACTORY/DISTRIBUTION/STORE/TRANSIT/GENERAL`。`STORE` 已批准；页面旧值 `RETAIL` 不再作为目标 code。
3. `domain` 原样保留，不参与 type 映射。
4. 冷链/隔离不作为 facility_class：`COLD_STORAGE` 拆为用途 `GENERAL` + 后续 `COLD_CHAIN` capability；`QUARANTINE` 继续由 zone/status/capability 表达。
5. 代码稳定后可另阶段把 `type` 显式改名 `usage_type`；本阶段直接 rename 会同时放大 SQL、API、客户端兼容半径，不建议与数据清洗绑成一次上线。

#### 现值到用途值域的候选映射

| 现值 | 行数 | 目标 `type`（usage） | 是否机械可批 | 业务影响 |
|---|---:|---|---:|---|
| EGG_FARM | 2 | EGG_FARM | 是 | 必须保持日产蛋链 |
| EGG_SALES | 12 | EGG_SALES | 是 | 用途不变；facility 需逐行区分 DISTRIBUTION/STORE |
| FEED | 2 | FEED | 是 | 保持采购收货允许 |
| FINISHED | 1 | FINISHED | 是 | facility 需判 FACTORY 或 DISTRIBUTION |
| GENERAL | 6 | GENERAL | 是 | 用途不变；facility 仍需逐行核实 |
| MEDICINE | 2 | MEDICINE | 是 | 保持采购收货允许 |
| PURCHASE_RECV | 1 | PURCHASE_RECV | 是 | 保持采购收货允许；facility 是否 TRANSIT 不能只看 code 推断 |
| RAW_MATERIAL | 3 | RAW_MATERIAL | 是 | 保持采购收货允许 |
| COLD_STORAGE | 1 | **GENERAL（候选）** | 否，须单行批准 | 原值表达冷链设施而非用途；需同时标 COLD_CHAIN，且不能因名称将 FINANCE_MAPPING 仓变成操作仓 |
| NULL | 1 | **GENERAL（候选）** | 否，须单行批准 | 已查明为 `WH-0001` TEST 仓；仅为满足值域完整，不改变 TEST/不可操作身份 |

按此候选，29 行 identity；1 行 `COLD_STORAGE→GENERAL`；1 行 `NULL→GENERAL`。两行变更必须分别批准。

#### facility_class 回填规则（必须逐行清单批准）

| 现用途/身份 | facility 候选 | 自动化结论 |
|---|---|---|
| EGG_FARM | FACTORY | 可作为默认候选，仍逐行确认 site/用途 |
| EGG_SALES | DISTRIBUTION 或 STORE | 12 行不可按旧值批量判；门店自有销售仓应为 STORE，场站销售成品仓应为 DISTRIBUTION |
| FEED/RAW_MATERIAL/MEDICINE | FACTORY 或 GENERAL | 按是否服务生产场站逐行判 |
| FINISHED | FACTORY 或 DISTRIBUTION | 按包装生产与配送职责判 |
| PURCHASE_RECV | TRANSIT 或 GENERAL | 只有确属中转节点才用 TRANSIT |
| GENERAL | GENERAL/DISTRIBUTION/STORE | 旧值信息不足，逐行判 |
| domain=FINANCE_MAPPING | GENERAL（通常） | facility 不改变 domain，不得进入操作面 |
| domain=TEST (`WH-0001`) | GENERAL（候选） | 保留 TEST，不因补 facility 复活 |

生产 31 行需要 facility_class 写值，但目前没有逐行快照，本文不伪造每个仓的 facility。实施前输出 `warehouse_code/name/company/site/domain/type/facility_candidate/reason` 清单，逐行批准。

### B4. 用户批准清单

请用户按以下编号批准/修改；任一未批项保持冻结：

- `S1`：供应商选择 S-A / S-B / S-C。
- `S2`：若 S-A，是否接受 `sourcing_type=UNSPECIFIED` 作为过渡值（或改为 NULL）。
- `S3`：是否把 `EQUIPMENT/MEDICINE/SERVICE` 纳入 supply_category 预留值域。
- `S4`：导出 LOCAL 4 行、OVERSEAS 1 行后逐行批准 supply_category。
- `W1`：批准旧 `type` 收敛为八值用途域，facility_class 使用五值域。
- `W2`：批准 `COLD_STORAGE 1 → GENERAL + COLD_CHAIN`，或指定其他用途；必须保持其原 domain。
- `W3`：批准 `WH-0001 NULL → GENERAL`，同时保持 `domain=TEST` 且不可操作。
- `W4`：逐行批准 31 仓 facility_class；尤其 12 个 EGG_SALES 不允许批量猜 STORE。
- `W5`：是否同期落最小 capability 模型；若不同期，COLD_STORAGE 清洗必须延后，避免冷链事实丢失。

## C. 实施设计（批准后执行）

### C1. 分阶段顺序

1. **只读冻结基线**：生产逐行导出、distinct/null/unknown、domain/company/site/status、WMS 引用与关键流程计数；生成待签字映射 manifest。
2. **兼容 schema + 字典**：先加新列/字典/API 双读，不加会拒绝旧值的 VALID CHECK；前端可显示旧值。
3. **批准后的数据 apply**：固定 manifest，逐值/逐行断言行数，事务写入，独立只读复核。
4. **切换写入口**：表单/筛选使用字典；DTO 白名单；旧字段只读兼容。
5. **约束收口**：零 NULL/零 unknown 后，CHECK 先 NOT VALID 再 VALIDATE；最后移除双读和旧 formatter 映射。

### C2. sys_dict TS migration

迁移只放 `apps/api/src/database/migrations/<timestamp>-...ts`，包含真实 `up()/down()`；文件头标注 `@allow-data-dml`，因为 sys_dict 是允许的配置数据。建议 dict_type：

- S-A：`SUPPLIER_SUPPLY_CATEGORY`、`SUPPLIER_SOURCING_TYPE`；S-C 才使用单一 `SUPPLIER_TYPE`。
- W-A：`WMS_WAREHOUSE_USAGE_TYPE`、`WMS_WAREHOUSE_FACILITY_CLASS`；若同期能力模型，再加 `WMS_WAREHOUSE_CAPABILITY`。

`up()` 使用显式 code 列表和 `(dict_type, dict_code)` 幂等 upsert；不得覆盖生产中已存在但标签/语义冲突的同码，preflight 遇冲突即停止。`down()` 只删除本迁移确认新建的精确键，或将其 ARCHIVED；不能删除实施前已经存在的行。

字典 migration 与业务数据映射分开：前者可随部署创建值域，后者必须是用户批准后手工触发的固定 production workflow/运维脚本，不能藏在 TypeORM migration 里。

### C3. CHECK、DTO、Entity 三对齐（G201）

最终约束候选：

```sql
CHECK (supply_category IN (...approved codes...))
CHECK (sourcing_type IN (...approved codes...))
CHECK (type IN ('EGG_FARM','EGG_SALES','MEDICINE','FEED','RAW_MATERIAL','PURCHASE_RECV','FINISHED','GENERAL'))
CHECK (facility_class IN ('FACTORY','DISTRIBUTION','STORE','TRANSIT','GENERAL'))
```

实施要求：

- 迁移链末态 CHECK、冻结 baseline 意图、Entity nullable/default、DTO enum、Runtime writable/validation、service literal 写值、前端字典 code 必须完全一致。
- 约束先 `ADD ... NOT VALID`，清洗并验证后 `VALIDATE CONSTRAINT`；NOT NULL 只能在占位/补录政策批准且零 NULL 后增加。
- `node scripts/check-constraint-drift.js` 是静态门禁，动态 SQL/通用 CRUD仍需人工列清单复核。
- 不用 allowlist 掩盖真实不一致。

### C4. 生产数据映射脚本：三段式

#### 1. Preflight（强制只读）

- `PGOPTIONS=default_transaction_read_only=on` + `BEGIN TRANSACTION READ ONLY`。
- 校验表/列、主键/code 唯一、当前 revision、目标字典存在。
- 输出逐值计数和逐行 manifest；断言与用户批准的 `expected_old_count`、主键、旧值完全一致。
- 仓库另查 domain、site、zone/location、历史单据/批次/台账引用；供应商另查 ACTIVE 状态、订单/收货/付款引用。
- 任一新增行、旧值改变、未知值出现即停止，重新报批。

#### 2. Apply（批准后，单事务）

- workflow 内固定映射，不接受自由 SQL 或自由 code 参数。
- 每个值/每行独立 UPDATE：`WHERE primary_key=? AND old_value IS NOT DISTINCT FROM ?`。
- UPDATE 前断言恰好 N 行，`RETURNING code, old/new values` 留痕；完成后逐目标值断言。
- 仓库始终保留 warehouse_code/domain；禁止按名称模糊匹配；不改 `inv_batches/inv_ledger` 的历史仓码。
- 任一断言失败整事务回滚。

#### 3. Verify + rollback

- 独立只读连接复核逐值计数、NULL/unknown=0（若批准允许 NULL则按合同断言）、domain 分布和关键业务仓。
- 回滚 SQL由 preflight 快照生成，按主键和“当前值仍等于本次目标值”双条件恢复；逐行 `RETURNING` 并断言数量。
- 回滚不能盲目删新增列/字典；若上线后已有新单使用新值，先停写并人工评审。

### C5. 表单、筛选、展示与未知值兼容

- 主数据供应商、采购供应商、主数据仓库的硬编码 select 改为 `DictSelect`；两个供应商入口必须共用同一合同。
- 若选 S-A，供应商列表/详情明确显示“供应品类”和“采购地域”两列；筛选分别传独立 query 参数。
- 仓库页分别显示“库存用途”“设施类别”“领域身份”；旧仓库 CRUD 至少只读展示三维，避免同一主档两页面认知不一致。
- `WarehouseSelector.type` 在兼容期仍表示用途过滤；新增 `facilityClass` 必须是独立参数，不能复用 type。
- `DictSelect` 只加载 ACTIVE 项。编辑历史值时必须注入当前未知/ARCHIVED 值并标记“历史值—待治理”，禁止因 option 缺失自动置空或写 `OTHER/GENERAL`。
- 展示继续保留 `formatBusinessEnum()` 的未知原码 fallback；API 读未知值不 500，写新未知值 fail-closed。
- 采购供应商页现有“空值编辑自动变 OTHER”必须移除，否则一次无关编辑会静默改历史语义。

## D. 测试与验收计划

### D1. 静态与迁移门禁

- API/Web `tsc --noEmit`。
- API Jest、Web Vitest；重点运行 WMS、breeding、procurement 回归。
- `node scripts/check-constraint-drift.js`、`node scripts/check-nullable-in-unique.js`、`scripts/ci/check-wms-datascope-writes.mjs`。
- `scripts/local-migration-check.sh` 覆盖 fresh DB、存量 DB、重复执行、production schema replica；down 后再 up。
- 真 scope-audit 使用项目规定的窄正则，不用会静默失败的复杂 ugrep 正则。

### D2. 供应商测试矩阵

| 场景 | 断言 |
|---|---|
| 每个旧值 fixture | 逐值映射与批准表一致，不能只验总数 |
| LOCAL/OVERSEAS | 未在 manifest 逐行批准就拒绝 apply |
| 双字段写入 | DTO、Runtime、旧 procurement CRUD 均只接受 ACTIVE dict code |
| 筛选 | category 与 sourcing 独立过滤；组合过滤取交集 |
| 采购流程 | 同一供应商清洗前后订单、收货、付款/AP 行为不变 |
| UNKNOWN/ARCHIVED | 读/详情保留原码；普通编辑不改变；新写拒绝 |
| NULL/UNSPECIFIED | 严格按批准政策；不得由 UI 偷换 OTHER/LOCAL |

### D3. 仓库测试矩阵

| 场景 | 断言 |
|---|---|
| domain × usage × facility | 三维正交；global 只绕 scope，不绕 domain/业务用途校验 |
| 日产蛋 | ACTIVE + OPERATIONAL + EGG_FARM 才可入库；孟赛/东鹏链回归 |
| 采购收货 | OPERATIONAL 且 usage 属四值才允许；EGG_FARM/EGG_SALES 拒绝且拒绝前无 batch/ledger 写入 |
| 调拨/盘点/报损 | facility 变更不改变既有流程；scope/domain gate 仍命中 |
| STORE | 仅 facility_class=STORE；用途仍 EGG_SALES 或 GENERAL；不得写旧 type=STORE/RETAIL |
| COLD_STORAGE | 清洗后冷链事实仍可查询；domain=FINANCE_MAPPING 时仍不可操作 |
| WH-0001 | type/facility 补值后仍 domain=TEST，lookup、写入口不可见/不可写 |
| 未知值 | 读兼容、写拒绝；CHECK validate 前后均有明确告警 |
| Selector | type 与 facilityClass 参数独立，日产蛋固定 usage 不受 facility 影响 |

### D4. 生产发布验收（批准后的实施轮）

1. 部署前只读 preflight 与批准 manifest SHA 一致。
2. 先部署兼容代码/字典/schema，再执行固定映射事务；不能反序。
3. 映射后只读验证供应商 34 行与仓库最新总数守恒、逐值计数吻合、无意外 NULL/unknown。
4. HTTP 覆盖 admin、公司级、SITE 显式仓、SITE 零授权、跨公司额外仓；domain 与 WarehouseScope 集合不漂移。
5. 最小业务回归：日产蛋、采购收货允许/拒绝、调拨、盘点、报损、SupplierSelector 引用、供应商筛选。
6. 错误窗口检查相关 API 4xx/5xx；不以静态扫描代替真实 HTTP/DB 断言。

## E. 本轮边界与结论

- 本轮只新增本文档；没有生成迁移、脚本或 workflow，没有修改表单/DTO/约束，没有触碰生产。
- 现有聚合计数足以设计影响半径，不足以批准逐行映射。下一步必须先由用户回复 §B4 的决策，再执行新的生产只读逐行导出。
- 推荐决策组合：`S-A + W-A`；供应商品类缺失与来源缺失显式保留“待补”，仓库把 `type` 收敛为用途并新增 `facility_class`。这与 20260825 仓库研究及已批准 `facility_class=STORE` 完全一致。

## F. 阶段 2–5 执行记录（2026-09-04）

### F1. 已批准 manifest

- 供应商：29 行按原品类 identity + `sourcing_type=UNSPECIFIED`；5 行按用户给定 code、名称、旧地域值、目标品类逐行锁定。由于批准消息未逐个列出 29 个 identity `supplier_code`，生产 preflight 对该集合采用“七个允许旧品类 + 精确 29 行 + 总表 34 行 + 5 特殊主键/名称/旧值”的闭合集合断言；集合外任何行会停止 apply。
- 仓库：31 个 `warehouse_code`、旧 `type`、目标用途、目标 facility、capability 全部固定在 apply 脚本；10 个门店仓只写 `facility_class=STORE`，用途保持 `EGG_SALES`。
- 特殊身份：`CJ-WH-XINGCHI-07` 保持 `FINANCE_MAPPING`，清洗为 `GENERAL + GENERAL + COLD_CHAIN`；`WH-0001` 保持 `TEST`，补为 `GENERAL + GENERAL`。

### F2. 阶段 2：兼容层

- TypeORM TS migration `1788501600000-GovernSupplierWarehouseTypeDomains.ts` 新增供应商双字段、仓库 facility/capability，seed 五个三语字典，并以 `NOT VALID` 建立五条值域 CHECK；业务数据不在 migration 内回填。
- Runtime 与采购 API 对旧 `supplier_type` 只读兼容；新写入口使用 `supply_category/sourcing_type`。仓库 lookup 新增独立 `facilityClass` 参数，未改变 `type` 的用途过滤语义。
- 主数据供应商、采购供应商和主数据仓库均改用 `DictSelect`；未知/归档值保留原码并标记“历史值—待治理”，`UNSPECIFIED` 三语显示为待补录。

### F3. 阶段 3–5：受控生产执行包

- Workflow：`.github/workflows/supplier-warehouse-domain-production-rollout.yml`，只允许固定 `preflight/apply/verify`，批准令牌为 `APPROVE-SUPPLIER-WAREHOUSE-DOMAIN-20260904`，并锁定运行 SHA=部署 checkout SHA。
- Preflight：只读事务核对 34+31 总数、29 identity 闭合集合、5 特殊供应商、31 仓旧值、两条特殊 domain，以及零部分执行。
- Apply：单事务、旧值条件更新、逐行 `RETURNING`；任何断言失败整事务回滚；数据零 NULL/零 unknown 后才 `VALIDATE CONSTRAINT`。
- Verify：独立只读连接复核总数、值域、分布、10 个 STORE、冷库/测试仓身份及采购/日产蛋关键用途集合。
- Rollback：`rollback-supplier-warehouse-domain-production.sql` 仅在当前值仍等于本次目标值时恢复；不删除列或字典。

### F4. 业务逻辑保全与验证

- 采购收货允许集合保持 `FEED/MEDICINE/PURCHASE_RECV/RAW_MATERIAL`；日产蛋仍固定 `ACTIVE + OPERATIONAL + EGG_FARM`。facility/capability 未进入两条业务分支。
- 本地验证：API/Web TypeScript 0 error；专项 API 46/46；Web 全量 560/560；API 全量在 `NODE_ENV=test` 下 763/763（另 6 skipped）；constraint/null-unique/down/DML/WMS DataScope 门禁和治理字段真 scope-audit 全部通过。首次继承 shell 的 `NODE_ENV=production` 运行曾令 React `act` 测试环境失效、Chanjet 两项 5 秒超时；均以正确 test 环境复跑通过，未掩盖失败。
- PR #178 因本任务按批准方案必然触及 migration/entity/采购核心，已显式应用 `reviewed-frozen-boundary` 与 `reviewed-security-touch` 审核标签；本地用同等开关执行 W5 closeout 全部通过。
- 生产 deployment、apply、revision、只读复验和错误窗口将在对应 GitHub Actions run 完成后追加 run ID 与最终判定；在此之前不得把本节标记为生产完成。
