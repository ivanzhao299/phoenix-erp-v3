# 仓库类型体系与权限管理模型基础调研（2026-08-25）

> 性质：只读研究与决策依据，不实施 A2。调研执行日为 2026-08-26（Asia/Singapore）。  
> 生产证据：GitHub Actions `Production Inbound Master Data Readonly Audit` run `32916729032` 与 `Mobile Egg Houses Production Readonly Audit` run `32916732281`，均成功；数据库连接同时启用 `PGOPTIONS default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`。未传 `WRITE_GRADE1_X1`，无生产写入、DDL、部署或分支合并。生产 checkout/API/Web revision 均为 `03ac9710...74d3df8c`。  
> 代码基线：本地 `main` / `893635fc2ab086b6beb48d0a04d7b0f22604767a`。A2 分支 `fix/site-warehouse-min-scope-20260825` 未触碰。

## 1. 执行摘要

1. 当前没有一个统一的“仓库类型体系”。至少并存四套值域：G15 七类业务用途、主数据页面六类物理形态、好业财导入三类推断值，以及 `NULL`。数据库 `type VARCHAR(32)` 无 CHECK、enum 或 DTO 白名单；仓库 migrations/seed 也没有仓库类型字典（生产 `sys_dict` 本轮固定 workflow 未覆盖，不能据此断言生产零行）。
2. 用户提出的“工厂/配送/门店/中转/冷库/隔离”并非完整既有规范：`FACTORY/DISTRIBUTION/RETAIL/TRANSIT/COLD/QUARANTINE` 已硬编码在主数据页面，但只有 FACTORY/STORE 的“场站形态”在组织设计中有历史依据；冷藏/冷冻/隔离现有权威语义主要在 `WMS_ZONE_TYPE` 与 `INV_STOCK_STATUS`，不是仓库 type。
3. 生产 17 仓全部 ACTIVE。9 个 `CJ-WH-*` 的 remark 明确写着“好业财只读主档映射；no balance/fact import”，却与 8 个 ERP 仓一起进入仓储 lookup。`linhong` 当前看到的 7 仓全部是“6 个星驰财务映射仓 + 1 个测试仓”，没有一个已建模的正式东鹏业务操作仓。
4. 菜单权限与数据权限是两层，但仓库数据范围没有端到端闭合：事实表和多数 WMS 写入使用 `allowedWarehouseCodes`；仓库 lookup 只按公司过滤；`wms_warehouses/zones/locations` 被列入 Generic CRUD `GLOBAL_TABLES`，完全绕过仓库行级范围；若干明细、日结及旧出库查询也存在缺口。
5. 因而不建议直接合入原 A2。优先把“财务映射身份”和“仓储操作身份”分域，并补建东鹏正式操作仓；之后再决定场站默认公司全仓还是显式仓授权。类型驱动权限只适合作为二期策略，不能代替显式范围授权。

## 2. 类型体系现状

### 2.1 四套并存值域

| 来源 | 值域 | 约束性质 | 证据 |
|---|---|---|---|
| G15 仓库 seed | `EGG_FARM/EGG_SALES/MEDICINE/FEED/RAW_MATERIAL/PURCHASE_RECV/FINISHED` | 历史 seed，注释误称 6 类，实际 7 类 | `apps/api/migrations/20260607_g15_warehouses_seed.sql:4-15,34-49` |
| 主数据中心仓库页 | `FACTORY/DISTRIBUTION/RETAIL/TRANSIT/COLD/QUARANTINE` | 前端硬编码，可直接写 runtime | `apps/web/src/app/(admin)/master-data/warehouses/page.tsx:29-33` |
| 好业财导入推断 | 名称含冷库→`COLD_STORAGE`，粮仓→`RAW_MATERIAL`，否则→`GENERAL` | service 推断并写入 | `apps/api/src/modules/chanjet/chanjet-erp-master-business-review.service.ts:214-218,1208-1231,1505-1521` |
| 生产存量 | 上述部分值 + `NULL` | 任意字符串可落库 | 本报告 §4 |

`wms_warehouses.type` 只是 `VARCHAR(32)`；未发现 DB CHECK、TypeScript enum、DTO 校验或 entity 约束（`apps/api/migrations/v3_schema_complete.sql:836`）。`MasterDataRuntimeService` 允许 warehouse 更新 `type`（`apps/api/src/modules/master-data/master-data-runtime.service.ts:149-154`）。旧 `/warehouse/warehouses` CRUD 页甚至不展示 type（`apps/web/src/app/(admin)/warehouse/warehouses/page.tsx:19-37`）。

### 2.2 字典现状

仓库 migrations/seed 中没有 `sys_dict` 仓库类型定义；生产 `sys_dict WHERE dict_type ILIKE '%WAREHOUSE%' OR dict_type ILIKE '%WMS%'` 未被本轮既有 workflow 查询，须列入下一轮只读补证。静态可确认的仓储相关字典是业务单据或库区维度：

- `WMS_ZONE_TYPE = NORMAL/CHILLED/FROZEN/STAGING/RETURN/QUARANTINE`，用于库区，不是仓库（`apps/api/migrations/20260611_g83_drawer_field_dict_seed.sql:23-29`）。
- `WMS_OUTBOUND_DESTINATION = HOUSE/KITCHEN/OFFICE/OTHER`，用于出库目的地（`migrations/20260605_glp1a2_production_extension.sql:78-90`）。
- `INV_STOCK_STATUS = AVAILABLE/RESERVED/QUARANTINE/DAMAGED/FROZEN`，用于库存批次状态（`migrations/20260604_g4d_inventory_dict_seed.sql:134-150`）。

因此 `QUARANTINE` 已分别表示“隔离库区”和“隔离库存状态”；若再把它直接定义为仓库类型，会形成第三套同名但不同层级的语义。

### 2.3 前端选项来源

- `/master-data/warehouses`：六值硬编码选项，保存到 runtime。
- `/warehouse/warehouses`：不显示/编辑 type。
- `WarehouseSelector`：不加载字典；`type?: string` 原样传给 `/api/lookup/warehouses?type=`，注释列的是 G15 七值（`apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:247-266`）。
- 后端 lookup 只做字符串相等过滤，无白名单（`apps/api/src/modules/product-master/controllers/lookup.controller.ts:534-563`）。

### 2.4 功能耦合

| 逻辑 | 当前耦合 | 结论 |
|---|---|---|
| 日产蛋入库 | `ProductionInboundService.resolveWarehouse()` 只认 ACTIVE `EGG_FARM`；未指定时要求公司内唯一 | 唯一明确按仓库 type 分叉的核心业务（`production-inbound.service.ts:102-121`） |
| 日产蛋页面 | Selector 固定 `type="EGG_FARM"` | 与后端一致（`breeding/daily-inbound/page.tsx:277`） |
| 普通入/出/调拨/盘点/报损 | 未发现按仓库 type 分叉 | 主要按单据 type、仓码和 DataScope 工作 |
| `inv_source_mode` | 仅 `TEMP_PRODUCTION_INBOUND/PACKAGING_INBOUND`，按 GROUP/COMPANY/SITE 解析 | 与 warehouse type 无直接关系（`inventory-source-mode.service.ts:6-52`） |
| 温层 | `WMS_ZONE_TYPE` 与 zone `temp_range` | 尚无仓库级温层授权模型 |
| 隔离/检疫 | `inv_batches.status=QUARANTINE`、隔离库区/库位；破损入库、不可售包装、POS 退货均可进入隔离 | 已实现的是状态/库区流程，不是“隔离仓 type”权限分叉（`wms.service.ts:379-400`、`packaging.service.ts:739-742`） |

## 3. 权限模型现状

### 3.1 菜单权限

实际表为 `sys_menu` 与 `sys_role_menu_permission`，后者按 `(role_id, menu_id)` 唯一，`perm_codes` 支持 `V/C/E/D/A/X/*`。角色直绑、角色权限集、用户权限集由 `resolvePermissions()` 合并，deny 后置覆盖 grant；JWT 携带结果。后端 `MenuGuard` 校验 `@RequireMenu`，`ROLE_ADMIN` 直接放行（`permissions-resolver.ts:53-87`；`menu.guard.ts:59-106`）。前端 `AuthContext.hasPermission()`/`usePermission()` 决定菜单和按钮；侧栏叶节点通常要求 `V`，父节点只要有可见子项即显示。

WMS 前端菜单树如下：

| 页面 | Route | 入口权限 |
|---|---|---|
| 库存总览、库存查询、临期库存、出入库流水 | `/warehouse`、`/warehouse/query`、`/warehouse/expiry`、`/warehouse/ledger` | `MENU_WMS_VIEW:V`（流水页面虽有 `MENU_INV_LEDGER` seed，侧栏入口仍用 WMS_VIEW） |
| 成品批次 | `/sales2/inventory` | `MENU_INV_BATCH:V` |
| 库存来源模式 | `/warehouse/source-mode` | `MENU_INV_SOURCE_MODE:V` |
| 入库、出库、调拨、盘点、日结、损耗 | `/warehouse/inbound` 等 | `MENU_WMS_INOUT:V` |
| 领用 | `/warehouse/issues` | `MENU_WMS_ISSUE:V` |
| 仓库主档、库区、库位 | `/warehouse/warehouses|zones|locations` | `MENU_WMS_MASTER:V` |
| 主数据中心仓库 | `/master-data/warehouses` | `MENU_MD_WAREHOUSE:V` |

前端树证据：`apps/web/src/components/layout/Sidebar.tsx:117-135,232-247,298-327`。后端操作位并非完全等同页面：例如入库确认要求 `MENU_WMS_INOUT:C`，出库推进/签收要求 `E`；库存写动作部分要求 `MENU_INV_BATCH:E`（`inbound.controller.ts:7-33`、`outbound.controller.ts:7-61`、`inventory.controller.ts:26-95`）。

边界：菜单权限回答“能否进页面/调用某动作”；它不应决定“能看到哪几个仓”。仓库集合必须由 DataScope 独立裁剪，不能因为有 `MENU_WMS_VIEW:V` 就默认公司全仓。

### 3.2 DataScope 全链路

```text
sys_user_role + sys_data_scopes
              └─ 决定菜单/角色最高 scopeType
sys_user_orgs ── 组织节点 company/project/warehouse/site 投影
  SITE/DEPT ──── 向上找到 COMPANY
  COMPANY ────── 展开该公司全部 ACTIVE wms_warehouses
sys_user_farm_scopes ───────┐
sys_user_warehouse_scopes ──┼─ 额外授权取并集
sys_user_project_scopes ────┘
              ↓
DataScopeContext: allowedCompany/Site/Farm/WarehouseCodes
              ↓ CLS / req.dataScope
各 service/raw SQL 自行消费（Guard 不会自动改 SQL）
```

关键规则：

- ADMIN 或 GROUP 为 `isGlobal=true`（`data-scope.service.ts:95-145`）。
- `sys_user_orgs` 的 SITE 绑定保留 `allowedSiteCodes`，并向上得到父公司；SITE 再通过 `brd_farms.mapped_site_code` 投影 ACTIVE farm（`:151-253,302-307`）。
- 公司范围会展开公司下所有 ACTIVE 仓进入 `allowedWarehouseCodes`；`sys_user_warehouse_scopes` 再做并集（`:267-300`）。这正是场站用户获得公司全仓的来源。
- 行上的 `data_scope_level` 目前除 GROUP 判定外，并不真正驱动逐行 SELF/SITE/COMPANY 展开；`topLevel` 来自 `sys_data_scopes`。历史 M1 文档描述的逐行算法与现代码不一致。
- 前端不计算四维 scope，依赖 API 过滤。

### 3.3 消费点矩阵与绕过面

| 入口 | 公司 | SITE/farm | 仓库 | 当前行为/缺口 |
|---|---:|---:|---:|---|
| `/api/lookup/warehouses` | 是 | 可按请求参数 | **否** | 只按 ACTIVE、company/site/type；不用 `allowedWarehouseCodes`，所以 `linhong` 得到星驰公司 7 仓 |
| Generic CRUD `wms_warehouses/zones/locations` | 否 | 否 | **否** | 三表在 `GLOBAL_TABLES`，读写均绕过 warehouse scope（`generic-crud.controller.ts:429-443`） |
| Generic CRUD `inv_batches/inv_ledger/wms_*` 事实表 | 不直接 | breeding 分支 | 是 | 空范围 fail-closed；仓码过滤（`:447-460`；`generic-crud.service.ts:2315-2347`） |
| WMS 入库、库存批次、收货 | 间接 | 否 | 是 | `warehouseScope()` 非全局空集合 `1=0`，写入 `assertWritableWarehouse()` |
| 旧出库 dashboard/orders | 否 | legacy `store_code` | **否** | 与 allowedWarehouseCodes 不等价 |
| 收货明细 `/receiving/orders/:no/items` | 否 | 否 | **否** | 只按 task_no，知道他仓单号可能读取明细 |
| 日结摘要 | 否 | 否 | **否** | inv_ledger/inv_batches raw SQL 未加仓库范围 |
| Procurement receipts | 是 | 否 | 部分 | list 非空范围才过滤；详情只校验 company/project；写入有仓校验 |
| Product lookup scope payload | 是 | 是 | 是 | 返回四维集合供查询层使用 |

另有同维度语义不一致：`WmsService`/库存 CRUD 对空仓集合 fail-closed；`DataScopeHelper.applyToQb()` 对空 warehouse/farm/site 不收窄；`assertWritableWarehouse()` 对空集合直接放行（`data-scope.helper.ts:22-80,216-228`）。

## 4. 生产实况矩阵

### 4.1 17 个仓库全量

生产表没有独立 `site` 名称字段；以下 site 取 `site_code`，空即未关联。全部状态为 ACTIVE。

| warehouse_code | name | type | company | site | status | 身份判断 |
|---|---|---|---|---|---|---|
| CJ-WH-AGRI-03 | 会晒仓库 | GENERAL | COMP-LAO-AGRI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-FOOD-01 | 总仓 | GENERAL | COMP-LAO-FOOD | — | ACTIVE | 好业财只读映射 |
| CJ-WH-FOOD-03 | 会晒仓库 | GENERAL | COMP-LAO-FOOD | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-01 | 总仓 | GENERAL | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-03 | 会晒仓库 | GENERAL | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-04 | 沙耶武里仓库 | GENERAL | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-05 | 1号粮仓 | RAW_MATERIAL | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-06 | 2号粮仓 | RAW_MATERIAL | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| CJ-WH-XINGCHI-07 | 冷库 | COLD_STORAGE | COMP-LAO-XINGCHI | — | ACTIVE | 好业财只读映射 |
| LPH_MS_EGG_FARM | 孟赛农场鸡蛋暂存仓 | EGG_FARM | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_EGG_SALES | 孟赛鸡蛋销售成品仓 | EGG_SALES | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_FEED | 孟赛饲料仓 | FEED | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_FINISHED | 孟赛包装成品仓 | FINISHED | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_MEDICINE | 孟赛药品/疫苗仓 | MEDICINE | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_PURCHASE | 孟赛采购到货仓 | PURCHASE_RECV | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| LPH_MS_RAW | 孟赛原料/包材仓 | RAW_MATERIAL | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | ACTIVE | ERP 业务仓 |
| WH-0001 | 东鹏农场鸡蛋暂存仓（测试） | NULL | COMP-LAO-XINGCHI | — | ACTIVE | 测试仓 |

类型分组：`GENERAL 6`、`RAW_MATERIAL 3`、`COLD_STORAGE 1`、`EGG_FARM 1`、`EGG_SALES 1`、`FEED 1`、`FINISHED 1`、`MEDICINE 1`、`PURCHASE_RECV 1`、`NULL 1`。公司分组：AGRI 8、XINGCHI 7、FOOD 2。生产 JSON 的 9 个 CJ 行 remark 均明确为“好业财只读主档映射；no balance/fact import”。

### 4.2 `linhong` 绑定全景

| 维度 | 生产事实 |
|---|---|
| 用户 | `user_id=7`，林宏，ACTIVE，legacy `store_code=SITE-DONGPENG-LAYER` |
| 组织 | 唯一绑定 `SITE-DONGPENG-LAYER`（东鹏蛋鸡养殖场），`is_primary=true`；行上 `data_scope_level=COMPANY`；父公司 `COMP-LAO-XINGCHI` |
| farm 投影 | `FARM-DP`，company `COMP-LAO-XINGCHI`，mapped site 为东鹏 SITE |
| 角色 | 主角色 `ROLE_FARM_MGR`，附加 `ROLE_VET`，均 visible |
| `sys_data_scopes` | 这两个角色本次查询为 0 行 |
| 仓库 API | 7 个：`CJ-WH-XINGCHI-01/03/04/05/06/07` + `WH-0001` |
| 结论 | 7 仓完全由“场站上卷公司→公司 ACTIVE 全仓”产生；其中 6 个财务映射仓、1 个测试仓，没有正式东鹏操作仓 |

本次既有 workflow 没有查询 `sys_user_warehouse_scopes`，因此不能把 `linhong` 或全体用户的显式授权行数宣称为 0；只能确认其 API 集合可由公司展开完整解释。它也没有导出其他活跃账号全景与 90 天 `wms_inbound/outbound/transfer` 足迹。仓库现有只读通道不接受任意 SQL，本轮又禁止新增/修改 workflow，故这两项标记为**未取证，不伪造结论**。在任何 A2 实施前必须补跑专用只读审计，至少输出：活跃账号×组织×角色×WMS 菜单、显式 farm/warehouse scope，以及近 90 天 operator/picker/operator_id × from/to warehouse 汇总；出库列须先以生产 `information_schema` 核验。

## 5. 设计考古

1. G4-D 的重点是库存状态、Selector 和 WarehouseScope，不是仓库分类。其文档曾声称 Selector 继承 warehouse scope，但当时 `/crud/wms_warehouses` 的实现前提已被后续 `GLOBAL_TABLES` 现实推翻（`docs/g4d-inventory-governance.md:130-205`）。
2. G15 是唯一落库的仓库业务用途分类；它把旧 `MEDICINE` 和把 SITE 当仓码的鸡蛋库存迁到正式仓码（`20260607_g15_warehouses_seed.sql:51-62`）。
3. 组织模型曾出现独立 `FACTORY/STORE/WAREHOUSE` org_type，最终 M1 决议收敛为 `org_type=SITE + site_business_type`。因此“工厂/门店”首先是场站形态；仓库是 `wms_warehouses` 下的业务主数据，而非组织树新增层级（`docs/M1_ORGANIZATION_MODEL.md:364-420,527-539`）。
4. `DISTRIBUTION/TRANSIT` 未发现作为后端仓库 type 的既有规范；distribution 多用于配送/发放业务。`COLD` 未成为运行时仓库类型，生产实际是 `COLD_STORAGE`；冷藏/冷冻已在 zone type。`QUARANTINE` 已在 zone 与 batch status。

判断：用户目标包含既有设计遗留，但不是一套已闭合的规范。它与 G15 不是简单替代关系：目标六类偏“物理形态/运营网络角色”，G15 七类偏“库存用途/货类”。若强塞进单一 `type` 列，必然丢信息；正确方向是并存两个正交维度，而非一张映射表硬替换。

## 6. 目标—现状差距矩阵

| 目标 | 现状 | 差距/决策 |
|---|---|---|
| 工厂仓 | 前端有 FACTORY；组织 SITE 可有 FACTORY；生产仓无此值 | 明确是 warehouse facility class 还是 SITE business type |
| 配送仓 | 前端有 DISTRIBUTION；后端/生产无规范 | 需定义与销售配送、跨仓调拨的边界 |
| 门店仓 | 前端用 RETAIL，组织模型用 STORE | 术语和值不一致；门店库存是否独立 warehouse 尚未裁定 |
| 中转仓 | 前端有 TRANSIT；无后端逻辑 | 需定义在途库存、所有权和停留时限 |
| 冷库 | 前端 `COLD`、好业财 `COLD_STORAGE`、zone `CHILLED/FROZEN` | 三层混杂；温控应优先落 zone/capability |
| 隔离仓 | 前端 QUARANTINE；zone 与 batch status 已有同名语义 | 宜做隔离 zone/capability，不宜仅凭仓 type 控制质量状态 |
| G15 业务用途 | 7 类已落库，日产蛋强依赖 EGG_FARM | 不能直接删除；需保留 usage 维度及兼容期 |
| 类型字典/校验 | 无字典、无 DB/DTO 校验、多入口可写 | 需单一权威值域与迁移前数据清洗方案 |
| 菜单权限 | RBAC 已较完整 | 页面可进与数据可看需保持分层 |
| 仓库范围 | 公司展开 + 显式授权并集 | 场站最小权限无法表达；空集合语义不一致 |
| 主档/lookup/单据一致过滤 | 多条路径绕过或仅公司过滤 | A2 不能只改 `resolve()`，必须做入口矩阵收口 |
| 财务映射仓 | 与操作仓同表、同 ACTIVE、同 lookup | 缺少 domain/purpose 标记与操作面排除规则 |
| 冷库/隔离角色规则 | 未实现 | 先定义能力与职责，不应从名称/type 猜权限 |

## 7. 类型迁移映射草案（文档，不动库）

建议未来拆成两个正交维度：

- `facility_class`：`FACTORY/DISTRIBUTION/STORE/TRANSIT/GENERAL`，描述网络节点/设施角色；冷链、隔离更适合 capability，而非互斥 class。
- `usage_type`：兼容 G15 的 `EGG_FARM/EGG_SALES/MEDICINE/FEED/RAW_MATERIAL/PURCHASE_RECV/FINISHED/GENERAL`，描述库存用途。
- capabilities：`COLD_CHAIN/QUARANTINE/FINANCE_MAPPING/OPERATIONAL` 等可多选；温区细节仍在 zone。

| 现值 | facility 草案 | usage 草案 | capability/处理 |
|---|---|---|---|
| EGG_FARM | FACTORY 或 GENERAL（按 SITE 裁定） | EGG_FARM | OPERATIONAL；保留业务硬依赖 |
| EGG_SALES | DISTRIBUTION | EGG_SALES | OPERATIONAL |
| MEDICINE | GENERAL | MEDICINE | OPERATIONAL；可附 QUARANTINE zone |
| FEED | GENERAL/FACTORY | FEED | OPERATIONAL |
| RAW_MATERIAL | GENERAL/FACTORY | RAW_MATERIAL | OPERATIONAL；CJ 行则 FINANCE_MAPPING |
| PURCHASE_RECV | TRANSIT 或 GENERAL | PURCHASE_RECV | OPERATIONAL；是否 transit 需业务确认 |
| FINISHED | FACTORY/DISTRIBUTION | FINISHED | OPERATIONAL |
| GENERAL（CJ） | GENERAL | GENERAL | FINANCE_MAPPING，默认不进入 WMS 操作面 |
| COLD_STORAGE（CJ） | GENERAL | GENERAL | FINANCE_MAPPING + COLD_CHAIN，不因“冷库”自动变操作仓 |
| NULL（WH-0001） | 未定 | 未定 | TEST；正式环境操作面默认排除 |

这只是迁移调查表，不是最终 schema。尤其不能把 `CJ-WH-XINGCHI-07` 因名称“冷库”就授给质检或冷链操作员；它当前是财务映射身份。

## 8. A2 调整选项

### 方案 A：先分域，再做显式最小授权（建议）

规则：先将 `FINANCE_MAPPING` 与 `TEST` 身份从仓储操作 lookup、事实单据和范围计算中排除；财务对账仍可使用其专用入口。为东鹏创建经业务确认的正式操作仓主数据后，场站用户只取“所属 SITE 的 OPERATIONAL 仓 ∩ 显式授权”，零授权 fail-closed；管理员/集团角色例外。

| 维度 | 评估 |
|---|---|
| 影响账号 | 至少 `linhong`；还需专用只读审计列出所有星驰公司/WMS 活跃账号 |
| 数据准备 | 仓库身份清单；东鹏正式仓码、用途、site、库区/库位；用户显式授权；财务接口依赖清单；90 天足迹 |
| 契合度 | 高：真正实现菜单+数据范围双层，并自然消解 6 个 CJ 仓暴露 |
| 优点 | 权限语义清楚；财务/操作解耦；最小授权可审计；不依赖模糊 type 名称 |
| 风险 | 若先收紧而未建正式东鹏仓，`linhong` 将零仓可用；lookup、GLOBAL_TABLES、单据详情必须同批收口；需兼容历史单据引用 CJ 仓 |

### 方案 B：先做“操作仓视图”，暂保公司范围

规则：DataScope 仍由公司展开，但只展开 `OPERATIONAL` 且非 TEST 的 ACTIVE 仓；SITE 不立即要求显式授权。同步收口 lookup/CRUD/业务查询。待足迹和职责配置完成后再切显式授权。

| 维度 | 评估 |
|---|---|
| 影响账号 | 所有通过公司范围看仓的账号；`linhong` 在正式东鹏仓建立前仍会变成零仓 |
| 数据准备 | 至少补齐 warehouse domain/capability 与东鹏正式仓；不必首日完成用户逐仓授权 |
| 契合度 | 中高：先解决财务映射仓污染，但仍是公司全量，不满足最终最小权限 |
| 优点 | 迁移阻力较低；先修正最明显的领域混用；可作为 A 的过渡阶段 |
| 风险 | 同公司多场/多操作仓仍互见；若临时规则长期化，会形成第二套隐式授权 |

### 方案 C：类型/能力驱动角色可见性

规则示例：质检角色可见含 `QUARANTINE` capability 的仓/区；冷链角色可见 `COLD_CHAIN`；普通仓管按 usage；再与显式 WarehouseScope 取交集。

| 维度 | 评估 |
|---|---|
| 影响账号 | WMS、质检、生产、场长、兽医、采购收货等角色 |
| 数据准备 | 统一 facility/usage/capability；角色×能力矩阵；zone 温区与隔离能力；职责分离评审 |
| 契合度 | 表面高，实质只能作为 A/B 上层策略，不能单独替代逐仓授权 |
| 优点 | 新仓可继承角色规则；适合冷链/隔离等专业流程 |
| 风险 | 当前 type 脏且多义，直接上线会误授权；隔离是状态/zone，不一定是整仓；角色交叉时规则复杂 |

### 推荐顺序

1. 选择 **B 作为安全过渡、A 作为目标态**：先分离财务映射/测试身份与操作面，同时补建东鹏正式仓；再基于真实账号和 90 天足迹配置显式授权。
2. A2 的代码范围必须是端到端入口矩阵，而不是只改 `DataScopeService`：warehouse lookup、三张主档 CRUD、zone/location 继承、WMS raw SQL 详情/日结/旧出库、采购收货详情、空范围统一 fail-closed。
3. 类型治理单独立项：保留 G15 usage 兼容，新增 facility/capability 的权威字典/校验；不要在未裁定前将六类硬替换进现有 `type`。
4. 方案 C 延后到数据干净且职责矩阵明确后；“隔离仓仅质检可见”应细化为页面权限、仓/区可见、质量状态操作权三件事，避免把查看、操作和审批绑死。

## 9. 上线前必须补齐的只读证据与验收

本轮已完成 17 仓与 `linhong` 真实 API 集合；以下因既有 workflow 固定 SQL 不覆盖而未取证：

1. `sys_user_warehouse_scopes` 总行数、涉及用户数及孤儿仓码；`linhong` 是否有显式行。
2. 所有 ACTIVE 用户的组织、farm、warehouse、角色及 WMS 菜单权限全景。
3. 近 90 天 `wms_inbound.operator × warehouse_code`、`wms_outbound.operator/picker × warehouse_code`、`wms_transfer.operator_id × from/to warehouse`；先以 `information_schema` 适配生产列。
4. 五象限 HTTP 基线：ADMIN、公司级仓管、SITE 有显式仓、SITE 无显式仓、跨公司额外授权；分别比对 lookup、主档 CRUD、库存事实、入/出/调/盘/损、采购收货。
5. 历史单据引用 CJ 仓的数量与来源；若存在业务事实，必须区分“财务身份被误用于操作”与合法历史追溯，不能直接隐藏后破坏详情页。

所有补证继续采用 GitHub production environment、`PGOPTIONS default_transaction_read_only=on`、`psql -X -v ON_ERROR_STOP=1`、`BEGIN TRANSACTION READ ONLY`；报告只记录真实输出，不以静态 seed 或旧报告冒充当前生产。

## 10. B 阶段执行记录（2026-08-26）

### 10.1 上线前只读补证

专用 workflow：`.github/workflows/warehouse-domain-readonly-audit.yml`。成功运行 `32919546130`，生产 checkout/API/Web revision 与审计日志一并留存；连接级 `default_transaction_read_only=on` 与事务级 `BEGIN TRANSACTION READ ONLY` 同时生效。

- `sys_user_warehouse_scopes`：0 行、0 用户、0 仓码、0 孤儿；`linhong` 无显式仓授权。
- ACTIVE 账号全景：35 个账号；组织、SITE、farm、显式仓、角色与 WMS 菜单已逐账号输出。东鹏 WMS 相关账号至少包含 `fuqiang`、`linhong`、`liushanjun`、`zhuhuiran` 等；孟赛仓储账号包括 `songshoujiang`、`xuefeng`、`tangzhiwen` 等。
- 近 90 天足迹：11 个 operator×warehouse 分组。正式仓业务包括孟赛入库、出库、调拨；CJ 仓命中 3 条 ERP 入库，见下表。
- HTTP 基线：admin `/api/lookup/warehouses` 为 17 仓。既有 `linhong` 基线为 7 仓（6 CJ + `WH-0001`）。生产没有任何显式仓授权，因此“SITE 有显式仓/跨公司额外仓”两象限当前不存在真实账号，不伪造 PASS；B 阶段仍按公司展开，仅做 domain 剥离。

| operator | warehouse | 单号 | 来源 | 处置 |
|---|---|---|---|---|
| admin | `CJ-WH-FOOD-01` | `INB-20260825-87YI` | ERP | 存量保留、只读追溯；新单禁止 |
| fuqiang | `CJ-WH-XINGCHI-01` | `INB-20260825-XRFT` | ERP | 存量保留、只读追溯；新单禁止 |
| linhong | `CJ-WH-XINGCHI-01` | `INB-20260825-25QJ` | ERP | 存量保留、只读追溯；新单禁止 |

审计未发现 CJ 仓的出库、调拨、盘点、库存批次或库存台账引用。3 条误用规模不构成“大量真实操作单据”停止条件，但证明不能删除或改写历史行；B 阶段采用“新单禁止 + 存量事实不变”的兼容策略。

### 10.2 身份 schema 与数据分类

- TS 迁移 `1787724000000-AddWarehouseDomain.ts` 新增 `domain VARCHAR(32) NOT NULL DEFAULT 'OPERATIONAL'`，含幂等 `up()` 与真实 `down()`；不改 `type`，不迁移既有 type 值。
- 生产分类由 `.github/workflows/warehouse-domain-production-classify.yml` 显式执行：先断言 9 个 `CJ-WH-*`、1 个 `WH-0001`、7 个 `LPH_MS_*`，再逐组 `UPDATE ... RETURNING`，最后断言 `9/1/7` 并提交。
- 分类结果：CJ 9 仓=`FINANCE_MAPPING`；`WH-0001`=`TEST`；LPH 7 仓=`OPERATIONAL`。
- 回滚 SQL（只回滚本轮数据分类，不删除 schema）：

```sql
BEGIN;
UPDATE wms_warehouses SET domain='OPERATIONAL'
 WHERE warehouse_code LIKE 'CJ-WH-%' OR warehouse_code='WH-0001' OR warehouse_code LIKE 'LPH_MS_%';
COMMIT;
```

### 10.3 操作入口矩阵

| 入口 | B 阶段规则 | 依据/兼容 |
|---|---|---|
| DataScope 公司展开与显式仓并集 | 排除 `FINANCE_MAPPING` | 非全局用户的查询、写入统一继承；TEST 暂保留 |
| `/api/lookup/warehouses` | 排除 `FINANCE_MAPPING`，返回 domain | 覆盖通用 WarehouseSelector 与直接 lookup 页面 |
| Generic CRUD warehouse/zone/location | 仓按 domain 排除；zone/location 经 warehouse 归属继承 | 覆盖主档页与 Zone/Location selector |
| WMS 入/出/调/盘/损及采购收货写入 | DB 边界拒绝 `FINANCE_MAPPING`，管理员也不例外 | 防止绕过 selector 直接提交仓码 |
| Generic CRUD WMS 写旁路 | 对 warehouse/from/to 仓码统一拒绝 | 覆盖通用 create/update 入口 |
| 日产蛋入库 | `EGG_FARM + ACTIVE + 非 FINANCE_MAPPING` | 孟赛 `LPH_MS_EGG_FARM` 不受影响 |
| 库存查询/报表 | 通过剥离后的 allowedWarehouseCodes 收窄 | TEST 在 B 阶段仍保留；A 阶段再排除 |
| Chanjet 财务对账/只读桥 | 不应用操作面过滤 | 财务映射仓仍由专用 Chanjet 链使用 |

### 10.4 东鹏主数据与过渡影响

本轮不伪造仓码或业务名称。建议参照孟赛用途，待业务确认后至少创建：东鹏蛋品暂存仓（EGG_FARM）、销售成品仓（EGG_SALES）、饲料仓（FEED）、药品/疫苗仓（MEDICINE）；是否同步创建采购到货、原料/包材、包装成品仓由实际流程确认。每仓仍需确认仓码、中老英名称、company=`COMP-LAO-XINGCHI`、site=`SITE-DONGPENG-LAYER`、库区/库位与负责人。

B 阶段只剥离 `FINANCE_MAPPING`，不从操作面排除 `TEST`。因此 `linhong` 由 7 仓过渡为仅 `WH-0001` 1 仓，admin 从 17 仓变为 8 个非财务仓（7 OPERATIONAL + 1 TEST），不是原执行草案中的 9；`domain` 是互斥身份，9+1+7=17。该过渡避免东鹏立即零仓，但 `WH-0001` 仍是测试仓，只能作为短期兜底；东鹏正式仓确认后应尽快创建并进入 A 阶段显式授权。

### 10.5 A 阶段留项

- SITE 操作仓 ∩ 显式授权、零授权 fail-closed；补齐真实的五象限账号与 HTTP 集合断言。
- `TEST` 从操作面排除；在此之前保持 `WH-0001` 的过渡可见性。
- facility/usage/capability 双维度治理继续冻结，本轮未触碰 `type` 语义。
- 旧 CJ 入库三单提供专用历史审计/详情追溯，不恢复其新建或编辑能力。
