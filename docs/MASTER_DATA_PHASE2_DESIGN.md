# 主数据中心 · 第二阶段总架构设计（Master Data Phase 2 Design）

> 编排人：Architect / MasterData Agent（feature/agent-architect-masterdata）
> 日期：2026-06-20
> 输入：
> - PROJECT_COMMAND_CENTER.md
> - CLAUDE.md
> - docs/MULTI_AGENT_PHASE2_PLAN.md（Audit Agent 出的 4 份审计汇总规划）
> - docs/MASTER_DATA_AGENT_AUDIT.md（本 Agent 第一阶段）
> - docs/ERP_BUSINESS_AGENT_AUDIT.md
> - docs/FINANCE_AGENT_AUDIT.md
> - docs/AUDIT_INTEGRATION_AGENT_AUDIT.md
> - 旧基线 docs/mdm-coding-standard.md
>
> 本文档是 M1-M5 五个独立落地方案的母规划，给出统一模型 + 字段引用规范 +
> 表级改造方案 + 风险/回滚 + ERP/Finance 引用契约。**只出方案，不写代码、不
> 新增 migration**——按 agents/architect-agent.md 第二阶段约束。

---

## 0. 总览

第一阶段四份审计已经把"主数据多源 / DataScope 五张表 / 项目双轨 / store_code 一
词三义 / RBAC 裸奔 / 财务旁路写流水"等 R0-R3 风险盘点完毕。本文档的使命是把
其中"主数据 / 组织 / 权限范围"这条主线的目标态、过程态、边界规则、字段契约
**一次性定下来**，让 ERP Agent / Finance Agent / Audit Agent 第二阶段后续 Wave
都能基于同一张图执行，避免再出现"shr_projects vs biz_projects"这类双轨。

### 0.1 核心三句话

1. **法人 / 经营 / 地点 三层分离**：公司 (`company_code`) 管钱、项目
   (`project_code`) 管账、站点 (`site_code`) 管物。三者分别在专属字段上落
   canonical，业务表对它们**只快照 code、不快照中文名**作为关联键。
2. **站点是唯一物理地址**：养殖场 / 工厂 / 仓库 / 门店 / 办公室 / 孵化场 →
   全部统一为 `sys_organizations.org_type='SITE'` + `site_business_type` 子类。
   `brd_farms / mst_stores / sys_store / wms_warehouses` 在新业务中冻结为只读
   alias，via `biz_site_aliases` 桥接。
3. **权限范围一张表**：`sys_user_orgs.data_scope_level` 声明 + 三张 `sys_user_*_scopes`
   显式追加，全部合并为 `sys_user_scopes(user_id, scope_type, scope_code)`。
   `data-scope.service` 改为输出统一 6 维 `dataScope`，所有业务 service 通过
   CLS 直读，不再各自映射。

---

## 1. 公司 / 项目 / 养殖场 / 门店 / 业务单元 / 组织：统一模型

### 1.1 实体定位（语义层）

| 层 | 名称 | code 字段 | canonical 表 / 标识 | 命名规范 | 唯一约束 |
|---|---|---|---|---|---|
| L1 | 法人主体 (Legal Entity) | `company_code` | `sys_organizations(org_type='COMPANY')` | `COMP-{COUNTRY}-{BUSINESS}` | (org_code) 全局唯一 |
| L2 | 经营主体 (Operating Project) | `project_code` | `biz_projects` | `PRJ_{SITE_OR_BUSINESS}_{SCOPE}` | (project_code) 全局唯一；(company_code, project_code) 业务唯一 |
| L3 | 业务站点 (Site / Place) | `site_code` | `sys_organizations(org_type='SITE')` + `site_business_type ∈ {FARM, BROILER, HATCHERY, FACTORY, WAREHOUSE, STORE, OFFICE}` | `SITE-{LOCATION}-{TYPE_SUFFIX}` | (org_code) 全局唯一 |
| L4 | 业务单元 (Business Unit) | `bu_code` | `biz_business_units` | `BU-{SECTOR}` | (bu_code) 全局唯一 |
| L5 | 部门 (Department) | `dept_code` | `sys_organizations(org_type='DEPARTMENT')` | `DEPT-{COMPANY}-{FUNC}` | (org_code) 全局唯一 |
| 辅 | 鸡舍 | `house_code` | `brd_houses` | `HOUSE_{SITE_SHORT}_{NN}` | (house_code) 全局唯一 |
| 辅 | 仓库（细分） | `warehouse_code` | `wms_warehouses` | 优先 `SITE-*-WAREHOUSE`；多仓时 `WH_{COMPANY}_{LOC}_{SEQ}` | (warehouse_code) 全局唯一 |
| 辅 | 库区 | `zone_code` | `wms_zones` | 自由编码 | (warehouse_code, zone_code) |
| 辅 | 货位 | `location_code` | `wms_locations` | 自由编码 | (warehouse_code, zone_code, location_code) |

> 注：L3 站点表实质上**就是** sys_organizations 的子集；站点不另起表，避免再生
> 出"sys_organizations vs site 表" 的双源。

### 1.2 关系约束（不变量）

不变量列在这里供 service 校验、未来作为 sys_organization_type_rules 配置表的
seed 依据：

| # | 不变量 | 校验位置 |
|---|---|---|
| I-1 | 每个 `company_code` 必有且仅有 1 行 `sys_organizations(org_type='COMPANY', org_code=company_code, company_code=org_code)` | sys_organizations create/update |
| I-2 | 每个 `project_code` 必有且仅有 1 行 `biz_projects`；可同时挂多个 site（via `biz_site_projects` 多对多）；必属一个 company（biz_projects.company_code NOT NULL） | biz_projects create/update |
| I-3 | 每个 `site_code` 必属一个 company（sys_organizations.company_code NOT NULL when org_type='SITE'） | sys_organizations create/update |
| I-4 | 一个 site 可挂 0 或多个 project；写法走 `biz_site_projects(site_code, project_code)` 桥表 | 桥表插入校验 |
| I-5 | 一个 BU 横切 N 个 company / site，via `biz_bu_membership(bu_code, org_code)` | 已存在 |
| I-6 | 一个 house 必属一个 site（site_business_type ∈ {FARM, BROILER, HATCHERY}） | brd_houses create/update |
| I-7 | 一个 warehouse 要么自己就是 `SITE-*-WAREHOUSE`（一对一），要么挂在 site 内部（多仓时 mapped_site_code 必填） | wms_warehouses create/update |
| I-8 | `sys_organizations.parent_id` 严格按 GROUP → COMPANY → SITE / DEPARTMENT 的链路；BU 不在树里 | sys_organizations service |
| I-9 | 历史 alias（brd_farms.farm_code / mst_stores.store_code / sys_store.store_code / wms_warehouses 旧 code）都进 `biz_site_aliases`，alias_type 严格枚举 | biz_site_aliases insert |

### 1.3 桥接层（兼容历史）

```
biz_site_aliases(alias_code, alias_type, canonical_org_code, notes)
  alias_type ∈ {
    LEGACY_COMPANY_CODE,  -- LPH / CO-FHA → COMP-LAO-AGRI
    FARM_CODE,            -- LPH_MENGSAI → SITE-MENGSAI-LAYER
    STORE_CODE,           -- MS-STORE-01 → SITE-MENGSAI-STORE
    OLD_SITE_CODE,        -- 历史 sys_store.store_code → SITE-*
    HOUSE_LEGACY_CODE,    -- LPH_MS_H1 → HOUSE_MS_01
    EXCEL_NAME,           -- "孟赛蛋鸡场" → SITE-MENGSAI-LAYER
    LEGACY_NAME,          -- "孟赛场" 等口语
    WAREHOUSE_LEGACY_CODE -- 历史 warehouse 编码
  }

biz_site_projects(site_code, project_code, weight_pct DEFAULT 100, is_primary BOOL)
  -- 多对多：一个 site 服务多个 project；一个 project 覆盖多个 site
```

`biz_site_aliases` 表已在 migrations/mdm1_02 建好；桥表 `biz_site_projects` 在
M2 方案里**新增**。两者都是 INSERT-only seed，不动业务 service。

---

## 2. 法人主体 / 经营主体 / 地点：边界划分

下表是给所有 Agent 后续开发用的"语义判别表"。任何字段、Selector、SOP 撞型
请回查此表：

| 对象 | 性质 | 主要用途 | 引用字段（在业务表上的列名） |
|---|---|---|---|
| 凤凰农业 (集团) | 集团节点 (org_type=GROUP) | 报表合并 / BI | 业务表不引用，仅 BI 用 |
| 凤凰老挝农业 / 凤凰食品 | **法人主体** | 签合同、出资、报税、银行户、AP/AR 主体 | `company_code` |
| 孟赛蛋鸡养殖项目 / 万象屠宰场项目 / 万象食品工厂项目 | **经营主体** | 业务损益归集、股东出资归集、PR/PO/费用归口 | `project_code` |
| 孟赛蛋鸡养殖场 (SITE-MENGSAI-LAYER) | **业务站点** (FARM) | 养殖业务发生地、库存归属、生产日报 | `site_code`（兼容期：`farm_code`） |
| 万象 1 号门店 (SITE-VTE-STORE-01) | **业务站点** (STORE) | POS 销售、门店日结 | `site_code`（兼容期：`store_code`） |
| 万象总仓 (SITE-VTE-WAREHOUSE) | **业务站点** (WAREHOUSE) | 一对一 = warehouse_code；多仓场景下 site 与 warehouse 一对多 | `site_code` + `warehouse_code`（多仓时） |
| 老挝养殖板块 (BU-LAO-LAYER) | **业务单元** | 横切汇总、BI 板块切片 | `bu_code`（仅 BI 表用） |
| 财务部 / 采购部 | 部门 (org_type=DEPARTMENT) | HR / 流程发起人 / 审批节点 | `dept_code` |
| 1 号鸡舍 (HOUSE_MS_01) | site 内细化 | 生产细粒度归集 | `house_code` |
| 库区 A / 货位 A-01 | warehouse 内细化 | 库存细粒度 | `zone_code` / `location_code` |
| 客户 / 供应商 / 股东 | 业务主体（非组织） | 财务往来 | `customer_code` / `supplier_code` / `shareholder_code` |
| SKU / 产品 / 物料 / 等级 / 规格 | 物料主数据 | 库存 / 采购 / 销售 | `sku_code` / `product_code` / `material_code` / `grade_code` / `spec_code` |

判别口诀：
- **签合同 / 开发票 / 进银行？** → 用 `company_code`（法人）
- **算项目利润 / 归集成本？** → 用 `project_code`（经营）
- **物在哪 / 谁在那干？** → 用 `site_code`（地点）
- **横切汇总到板块？** → 用 `bu_code`（BI）

---

## 3. 采购 / 销售 / 库存 / 财务 / 权限：统一引用字段规范

> 这是 Wave 5 之后所有 Agent 写新代码必须遵守的契约。旧代码逐 wave 切换。

### 3.1 业务表必填 / 选填字段

| 业务模块 | 必填 (NOT NULL) | 选填 | 禁用 |
|---|---|---|---|
| 采购 (prc2_*) | `company_code`、`supplier_code` | `project_code`、`site_code`（收货地）、`warehouse_code`（多仓时） | `farm_code`、独立 `prc2_projects.project_code` |
| 销售 (sal_*) | `company_code`、`customer_code` | `project_code`、`site_code`（门店）、`channel_code` | 直建客户（必走 master-data-runtime） |
| 库存 (inv_* / wms_*) | `owning_company_code`（原 `inv_batches.store_code`）、`site_code`（仓库）、`sku_code` | `location_code`、`batch_no` | `store_code` 兼容期 ≤ 2 wave，之后删 |
| POS (sal_store_*) | `company_code`、`site_code`（门店）、`sku_code` | `customer_code`（赊销必填）、`channel_code` | 裸 `customer_name` 无 customer_code |
| 财务 AP (fin_ap_*) | `company_code`、`supplier_code` | `project_code` | 自由文本 supplier_name 作为关联键 |
| 财务 AR (fin_ar_*) | `company_code`、`customer_code` | `project_code` | 同上 |
| 财务 Cash (fin_cash_*) | `company_code`、`cash_account_id` | — | 自由文本 account_name |
| 财务费用 (fin_expense_*) | `company_code` | `project_code` | — |
| 股东资金 (fin_shareholder_*) | `company_code`、`shareholder_code`、`cash_account_id` | `project_code` | 现金账户用 varchar bank_account 自由文本（shr_capital_contributions 现状） |
| 工作流 (wf_*) | `company_code`（按数据范围）、`project_code`（按数据范围） | `site_code` | — |

### 3.2 读路径（Selector / lookup）契约

| 字段 | 读端点 | Selector 组件 | DataScope 强制 |
|---|---|---|---|
| `company_code` | `GET /api/org/organizations?type=COMPANY` | `CompanySelector` | ✅ |
| `project_code` | `GET /api/biz/projects/active?companyCode=` | `ProjectSelector` | ✅ |
| `site_code` | **新增** `GET /api/org/sites/active?type=FARM\|STORE\|WAREHOUSE\|FACTORY\|OFFICE&companyCode=` | **新增** `SiteSelector` | ✅ |
| `warehouse_code` | `GET /api/crud/wms_warehouses?companyCode=` | `WarehouseSelector` | ✅（多仓场景，否则等价 site_code） |
| `customer_code` | `GET /api/master-data/runtime/customer/active` | `CustomerSelector` | ✅ |
| `supplier_code` | `GET /api/master-data/runtime/supplier/active` | `SupplierSelector` | ✅ |
| `sku_code` | `GET /api/product-master/skus?status=ACTIVE` | `SkuSelector` | ❌（集团共享） |
| `shareholder_code` | `GET /api/shareholders` | `ShareholderSelector` | ❌（集团共享） |
| `cash_account_id` | `GET /api/v2/finance/cash/accounts` | `CashAccountSelector` | ✅ |
| `bu_code` | `GET /api/business-units` | **新增** `BusinessUnitSelector`（仅 BI 表用） | ❌ |

废弃：
- `FarmSelector` → 由 `SiteSelector(type=FARM)` 替代（M1 文档拍板后切）
- 旧 `StoreSelector`（如有）→ 由 `SiteSelector(type=STORE)` 替代
- `/api/master/stores` / `/api/master/products` → 由 `/api/master-data/runtime/{store,product}/active` 替代（M5）
- `/crud/wms_zones` / `/crud/wms_locations` 全量拉 → 改为 `/lookup/wms-zones?warehouseCode=` / `/lookup/wms-locations?warehouseCode=&zoneCode=`（ERP Agent 配合）

### 3.3 权限范围统一字段

`sys_user_scopes` 合表后，`DataScopeService.resolve()` 输出**统一 6 维**注入
CLS：

```ts
dataScope = {
  isGlobal: boolean,
  allowedCompanyCodes: string[],
  allowedProjectCodes: string[],
  allowedSiteCodes: string[],       // 新增（覆盖 farm + store + 其它 site）
  allowedWarehouseCodes: string[],  // 兼容期保留（多仓场景）
  allowedShareholderCodes: string[],// 新增（shareholder scope 合一）
}
```

业务 service 一律 `clsService.get('dataScope')` 直读；finance-v2 现有
`scopeAll / companyCodes` 自定义包装 **必须废弃**（Finance Agent F1）。

---

## 4. 当前模块的合并 / 保留 / 废弃决策

| 模块路径 | 决策 | 第二阶段动作 | 落地 Wave |
|---|---|---|---|
| `apps/api/src/modules/master` | ❌ **废弃** | M5 文档：`/api/master/stores`、`/api/master/products`、`system-users.controller.ts` 迁移目标清单 | W2 出文档，W10 后续执行 |
| `apps/api/src/modules/master-data` | ✅ **保留 + 扩展**（治理核心） | M4：扩 TYPES 配置覆盖 company / site / business_unit / shareholder | W2 |
| `apps/api/src/modules/org` | ✅ **保留 + 加约束** | 增 `sys_organization_type_rules` 配置表 + service 校验；扩 `data-scope.service` 输出 6 维 | W2 出方案 / W6+ 落地 |
| `apps/api/src/modules/business-unit` | ✅ **保留**（横切式胜出） | `sys_organizations.org_type='BU'` 退役；现存 BU 行迁入 biz_business_units | W2 出方案 / W7+ 落地 |
| `apps/api/src/modules/farm` | ⚠️ **业务保留 / 主数据退役** | brd_daily_logs / brd_flocks 留作业务表；brd_farms 主表冻结，新建走 `SITE-*-FARM`；service 的 (farm_code OR site_code) 兼容期写法收口为 site_code 优先（ERP Agent W6+） | M1 出方案 |
| `apps/api/src/modules/product-master` | ⚠️ **保留 + 与 master-data-runtime 共表** | 不合并；产品 / 等级 / 规格 / SKU 仍走双入口（product-master 直 CRUD + master-data-runtime 审批）。M5 评估是否合并 controller | 暂不动 |
| `apps/api/src/modules/shareholder` | ⚠️ **保留 + 改造** | M2：shr_projects 退化为 `shr_project_attrs`，FK→biz_projects；shr_capital_contributions.bank_account → cash_account_id；shareholder scope 合入 sys_user_scopes | W2 出方案 / W6+ 落地 |
| `apps/api/src/modules/store` | ⚠️ **业务保留**（biz_store_daily_close） | mst_stores 主表收口到 master-data-runtime/store；门店实体走 `SITE-*-STORE`；`sys_store` 标 ARCHIVED | M1 出方案 |

---

## 5. 数据库表级改造方案（仅方案，不写 SQL）

> 全部走 `apps/api/src/database/migrations/` TS 迁移，每条必含 `down()`，
> CI 红线已锁。本节按 Wave 顺序列出。

### 5.1 Wave 4 — biz_site_aliases 激活 + biz_site_projects 新增（M1 P1）

| 改动 | 类型 | 说明 | 回滚 |
|---|---|---|---|
| `biz_site_aliases` seed | INSERT-only | 把 brd_farms / mst_stores / sys_store / wms_warehouses 现存 code 对照 mdm-coding-standard.md §9 全部入库（`@allow-data-dml` 标记） | `DELETE WHERE alias_type IN (...)` |
| `biz_site_projects(site_code, project_code, weight_pct, is_primary)` 新表 | CREATE TABLE | site ↔ project 多对多桥 | DROP TABLE |
| `biz_site_projects` 初始 seed | INSERT-only | 把现有 biz_projects.site_code（如有）直接迁入；缺失补 NULL，由业务方填 | DELETE WHERE 标识列 |

**业务 service 本阶段不消费 alias 表**——只是把数据准备好。M1 文档里规定
service 切换时机由 ERP Agent 在 W6+ 决定。

### 5.2 Wave 4 — sys_organization_type_rules 配置表（M4 一部分）

| 改动 | 类型 | 说明 |
|---|---|---|
| `sys_organization_type_rules(org_type, required_fields[], allowed_parent_types[], allowed_child_types[], code_prefix_regex, status)` 新表 | CREATE TABLE | 把不变量 I-1 ~ I-8 落配置 |
| seed | INSERT | 9 个 org_type 各配一行 |
| `org.service.ts` 改造校验 | service 改 | M4 后续 wave 启用；本 wave 仅建表不接入 |

### 5.3 Wave 5 — biz_projects 字段扩展（M2 P1）

| 改动 | 类型 | 说明 |
|---|---|---|
| `biz_projects.project_manager_user_id` 新增列 | ADD COLUMN nullable | workflow `byProjectManager` 后续从此读取，替代 prc2_projects |
| `biz_projects.site_code` 新增列 | ADD COLUMN nullable | 单 site 项目快捷字段；多 site 走 biz_site_projects |
| `biz_projects.capital_status` 新增列 | ADD COLUMN nullable | 从 shr_projects 迁移而来 |
| `biz_projects.equity_status` 新增列 | ADD COLUMN nullable | 同上 |
| `biz_projects.is_shareholder_managed` 新增列 | ADD COLUMN bool DEFAULT false | 标记是否需要股东视角；从 shr_projects.project_code 存在性反推 |
| 数据迁移 | INSERT INTO / UPDATE FROM | 把 shr_projects / prc2_projects 独有 project_code 同步进 biz_projects |
| 旧列保留 | — | prc2_projects.project_manager_user_id 保留一个 wave 兼容；shr_projects 改名见 5.4 |

**不动主键、不动现有列类型。** 全部新增 nullable。

### 5.4 Wave 6 — shr_projects → shr_project_attrs（M2 P2）

| 改动 | 类型 | 说明 |
|---|---|---|
| `shr_projects` RENAME TO `shr_project_attrs` | RENAME TABLE | 保留所有现存列 |
| `shr_project_attrs.project_code` FK → `biz_projects(project_code)` | ADD CONSTRAINT | DDL 添加外键 |
| `shr_project_attrs` 视图 `shr_projects` | CREATE VIEW | 一个 release 内兼容（旧 service 读到等价数据） |
| shareholder.service.ts 改读 biz_projects + LEFT JOIN shr_project_attrs | service 改造 | 跨 Agent 协同：Architect 出 DDL，shareholder service 改造由 Architect 主导 + Finance 协 |

### 5.5 Wave 6 — inv_batches.store_code → owning_company_code（M3）

| 改动 | 类型 | 说明 |
|---|---|---|
| `inv_batches` ADD COLUMN `owning_company_code` varchar(64) | ADD COLUMN | 新列 NULL，先双写 |
| `inv_batches.owning_company_code` 数据回填 | UPDATE FROM | 由 ERP Agent 出回填脚本（按 batch_no → po → company_code 反推） |
| 双写一个 wave | service 改 | ERP Agent E1 / wms.service.ts / store-pos.service.ts 同时写两列 |
| 改为 owning_company_code NOT NULL | ALTER COLUMN | 双写期满后 |
| `inv_batches.store_code` 列保留只读视图字段 → 后续 wave 删 | DROP COLUMN | W7 之后 |
| `inv_ledger.store_code` 同样改名 | RENAME COLUMN | 一致 |

**默认仓硬编码迁出**（E1 关联）：`WMS-VTE-MAIN` / `INBOUND-DOCK` / `ST-VTE-001` /
`ALL` 进 `sys_config(config_key, config_value, company_code)` 表：

| 改动 | 类型 |
|---|---|
| 现有 `sys_config` / `sys_settings` 扩 key | INSERT seed |
| 新建 sys_config 表（如不存在） | CREATE TABLE |

### 5.6 Wave 6 — sal_store_sales.customer_code FK 强约束（M3 配套）

| 改动 | 类型 | 说明 |
|---|---|---|
| service 收口写入路径 | 由 ERP Agent E2 完成 | 先在 service 层 INSERT 时强制 customer_code 必须存在于 mst_customers |
| 等清掉脏数据后 ADD CONSTRAINT FK | ADD CONSTRAINT | 由 Architect Agent 评审后落迁移 |

### 5.7 Wave 7 — sys_user_scopes 合表

| 改动 | 类型 | 说明 |
|---|---|---|
| `sys_user_scopes(user_id, scope_type, scope_code, granted_by, granted_at, expires_at)` 新表 | CREATE TABLE | scope_type ∈ {COMPANY, PROJECT, SITE, WAREHOUSE, STORE, SHAREHOLDER} |
| `sys_user_scopes` PK = (user_id, scope_type, scope_code) | 多列 unique | 全 NOT NULL（含 g198 铁律） |
| 数据迁移 | INSERT FROM | 把 sys_user_project_scopes / sys_user_farm_scopes / sys_user_warehouse_scopes / shr_shareholder_scopes 数据全部映射进来 |
| `data-scope.service.ts` 改读新表 + 回退旧表 | service 改 | 由 Architect 主导（org 模块责任域） |
| 旧表 ARCHIVED → DROP | DROP TABLE | 一个 release 后 |

### 5.8 Wave 7 — wms_warehouses.mapped_site_code

| 改动 | 类型 | 说明 |
|---|---|---|
| `wms_warehouses.mapped_site_code` 新增列 FK → sys_organizations | ADD COLUMN nullable | 一仓一 site 时 mapped_site_code = warehouse 自己映射的 SITE-*-WAREHOUSE；多仓时 mapped_site_code 指向 site |
| seed | UPDATE | 现存行回填 |

### 5.9 Wave 8 — biz_business_units 收口 + sys_organizations.BU 退役

| 改动 | 类型 | 说明 |
|---|---|---|
| `sys_organizations.org_type='BU'` 行迁移到 `biz_business_units` | UPDATE / INSERT | 现存行 ≤ 5（建议保留只读视图一个 release） |
| `sys_organization_type_rules` 移除 BU 枚举 | UPDATE seed | M4 配套 |
| 业务表 `bu_code` 列加 FK | ADD CONSTRAINT | 由 Architect 评审 |

### 5.10 Wave 8 — master-data-runtime TYPES 扩展（M4 P2）

| 改动 | 类型 |
|---|---|
| TYPES 配置加 4 类 | service 改 |
| `governance.service` 5 维评分覆盖 company / site / BU / shareholder | service 改 |
| `operations.service` todo 列表覆盖 | service 改 |
| 不动 DDL，纯接入 | — |

### 5.11 物料 vs 产品 SOP（M2 后置）

不在 5.x DDL 序列里——仅出 SOP 文档 `docs/material-vs-product-sop.md`，由业务
方拍板后再决定是否加 unique-across-two-tables 的 partial index。

---

## 6. 迁移风险与回滚策略

### 6.1 风险等级分类

| 风险等级 | 改动类型 | 默认回滚动作 |
|---|---|---|
| 🟢 低 | INSERT-only seed（biz_site_aliases、biz_site_projects、sys_organization_type_rules） | `DELETE WHERE ...` |
| 🟢 低 | ADD COLUMN nullable（biz_projects 扩展、wms_warehouses.mapped_site_code） | DROP COLUMN |
| 🟡 中 | RENAME COLUMN（inv_batches.store_code → owning_company_code） | 双写期保留旧列 → 反向重命名 |
| 🟡 中 | RENAME TABLE（shr_projects → shr_project_attrs） + VIEW | 反向 RENAME + DROP VIEW |
| 🟠 高 | CREATE TABLE + 跨表数据迁移（sys_user_scopes 合表） | DROP TABLE（前提：旧表数据未删） |
| 🔴 极高 | DROP COLUMN（inv_batches.store_code 真删） | **不可逆**——必须 W6 双写期满 + 真实场对账后才允许 |
| 🔴 极高 | ADD CONSTRAINT FK（sal_store_sales.customer_code） | 脏数据未清干净会立即 fail；必须 W6 service 收口 + 数据清洗后才落 |

### 6.2 回滚原则

1. **TS 迁移必含 down()**（CLAUDE.md g195-P5 铁律）。对 RENAME / DROP 类型，down()
   必须真的能反向恢复；恢复不可行的（含数据销毁）一律不允许进 W5 之前的 wave。
2. **双写期最少 1 wave**：W6 任何涉及"列改名 + service 改读改写"的改动，service
   必须双写两列、双读优先新列；下一 wave 真删旧列。
3. **数据迁移前必先 dump snapshot** 到 `backups/{table}_{wave}_{ts}.sql.gz`。
   迁移失败回滚直接 LOAD snapshot。
4. **重命名表（5.4 shr_projects）走视图过渡**：先建同名视图指向新表，service 改
   造完成后下一 wave 才删视图。任何 wave 出现"按已删旧名写新业务"立刻 revert。
5. **跨域改动（如 5.4 涉及 shareholder service）必须双签**：Architect + Finance
   联合评审；任何一方未签字不允许合入。
6. **alias / 桥表只读化**：W4 落 biz_site_aliases seed 时**禁止 service 同步消费**；
   service 切换路径必须在 M1 文档拍板后单独 wave 进行（最早 W6）。
7. **生产数据库回滚命令固化**：
   - 代码层：`git revert <merge-commit>` → 走 deploy.yml 流程，禁 force push
   - DB 层：`docker compose exec -T api ./node_modules/.bin/typeorm -d dist/database/data-source.js migration:revert`
   - schema_migrations 表手动清行**仅在确认 DDL 已物理回滚后**

### 6.3 wave 级回滚剧本

| Wave | 主要改动 | 回滚剧本 | 数据损失风险 |
|---|---|---|---|
| W4 (5.1/5.2) | seed + 新建配置表 | `migration:revert` 即可 | 无 |
| W5 (5.3) | biz_projects 扩列 + 跨表数据迁移 | revert + 已写 capital_status 等列变 NULL；shr_projects 数据未动 | 无（数据未销毁） |
| W6 (5.4/5.5/5.6) | 表/列改名 + service 双写 + FK | 视图回滚 / RENAME 反向 / service 关闭新写路径 | 无（双写期内） |
| W7 (5.7/5.8) | sys_user_scopes 合表 + wms_warehouses 加列 | data-scope.service 回退旧表读路径；新表 DROP | 无 |
| W8 (5.9/5.10) | BU 收口 + master-data-runtime TYPES 扩展 | sys_organizations.org_type='BU' 行恢复；TYPES 配置回滚 | 无 |
| W6 后置 (5.6 FK) | sal_store_sales.customer_code 加 FK | DROP CONSTRAINT；service 写入路径保留 | 无（service 已先收口） |

### 6.4 不可触碰的红线

- ❌ 不允许在本阶段动 entity 装饰式（g197 漂移 4 张表：sys_user / sal_customers /
  fin_cash_accounts / prc_purchase_orders + g197 标记的 fin_ar_invoices.sal_customer_id）。
- ❌ 不允许在本阶段连接 fin_ar_invoices 与 chanjet_ar_snapshot（CLAUDE.md §0.6）。
- ❌ 不允许在本阶段直接物理删 brd_farms / mst_stores / sys_store / wms_warehouses
  任何一行（只允许 status='ARCHIVED' + readonly view）。
- ❌ 不允许在 W5 之前接 biz_site_aliases service 消费路径——seed 与 service 收口
  必须分两个 wave。
- ❌ 任何唯一约束含 nullable 列必须配 default '' 占位（CLAUDE.md §0.5），或
  进 `.github/null-in-unique-allowlist.txt` 白名单。

---

## 7. 下一步 ERP Agent 与 Finance Agent 统一引用规范

> 本节是给 ERP Agent / Finance Agent 第二阶段 Wave 5 起所有新代码使用的契约。
> Wave 5 之前是过渡态、双轨期；Wave 5 之后任何新增 service / controller / 前端
> form 都必须遵守。

### 7.1 后端 service 引用规范

**读路径**（一律走以下端点 / Selector，不再裸 SQL JOIN 主数据表）：

```ts
// 公司
GET /api/org/organizations?type=COMPANY          ← CompanySelector
// 项目
GET /api/biz/projects/active?companyCode=        ← ProjectSelector
// 站点（M1 后新增）
GET /api/org/sites/active?type=FARM|STORE|WAREHOUSE|FACTORY|OFFICE&companyCode=
                                                  ← SiteSelector
// 客户
GET /api/master-data/runtime/customer/active     ← CustomerSelector
// 供应商
GET /api/master-data/runtime/supplier/active     ← SupplierSelector
// SKU / 产品 / 等级 / 规格
GET /api/product-master/skus?status=ACTIVE       ← SkuSelector
// 现金 / 银行账户
GET /api/v2/finance/cash/accounts                ← CashAccountSelector
// 股东
GET /api/shareholders                            ← ShareholderSelector
```

**写路径**（INSERT 业务表时）：

| 业务表 | 必写字段 |
|---|---|
| 任意业务表 | `company_code`（NOT NULL）+ `created_by` + `created_at` |
| 含项目维度 | + `project_code`（视业务可空，但若可空则禁止跨项目共享） |
| 含物理地点 | + `site_code`（仓库写入时 site_code 必填） |
| 含 SKU / 物料 | + `sku_code` 或 `product_code`（二选一，禁两列同时写） |

**禁止字段**：
- ❌ `farm_code`（写入路径）—— 兼容期只允许 service 桥接层填，新业务表禁建此列
- ❌ `store_code`（写入路径）—— 同上，例外：`sal_store_sales / sal_store_shift_closings`
  现存历史列在 W6 改名前临时保留
- ❌ `customer_name` / `supplier_name` / `project_name` 作为**关联键**（仅展示用，不参与查询过滤）

### 7.2 后端 service DataScope 引用规范

```ts
// 一律 CLS 直读，禁 controller 手工映射
const ds = this.clsService.get('dataScope');
if (!ds.isGlobal) {
  qb.andWhere('t.company_code IN (:...companyCodes)', { companyCodes: ds.allowedCompanyCodes });
  if (hasProject) qb.andWhere('t.project_code IN (:...projectCodes)', { projectCodes: ds.allowedProjectCodes });
  if (hasSite)    qb.andWhere('t.site_code IN (:...siteCodes)',       { siteCodes: ds.allowedSiteCodes });
}
```

- finance-v2 现有 `scopeAll / companyCodes` 自定义包装必须废弃（Finance F1）。
- 任何 service 漏接 `allowedProjectCodes` / `allowedSiteCodes` → CI 红线（待
  Audit Agent 出 grep 脚本验收）。

### 7.3 前端 form 字段规范

| 表单页面类型 | 必带 Selector |
|---|---|
| 公司维度单据（采购 PR/PO/AP、销售订单、财务 AP/AR/费用） | `CompanySelector`（DataScope 自动过滤） |
| 项目维度单据（同上） | `ProjectSelector`（按 company 过滤） |
| 物理地点维度（养殖日报 / 入出库 / POS / 配送） | `SiteSelector`（按 company + type 过滤） |
| 库存细分单据 | `WarehouseSelector` → `ZoneSelector` → `LocationSelector` 链式过滤 |
| 客户 / 供应商 / SKU / 现金账户 / 股东 | 各自专属 Selector，全部仅 ACTIVE |

**凭证 / 合同 / 资质 / 照片字段一律 AttachmentUploader**（CLAUDE.md §4），不允
许 URL 文本框。Finance §4.3 列出的 AP/AR 发票字段欠缺 attachment_urls，由
F5 文档评估扩列。

### 7.4 跨 Agent 协同点

| 场景 | 主 Agent | 协同 Agent | 何时启动 |
|---|---|---|---|
| service 改造（service 读 alias、改字段名） | ERP / Finance | Architect 出 DDL + 评审 | M1 / M2 / M3 文档拍板后 |
| RBAC 元数据补充（新增 `MENU_SYS_NOTIFY` / `MENU_FIN2_PROJECT` 等） | Audit | Architect 评审 sys_menu 注册 | A1-A4 完成后 |
| 主数据治理图谱扩 4 类 | Architect (M4) | 各业务 Agent 提供 references 配置 | W2 |
| shareholder service 改造（shr_projects → shr_project_attrs） | Architect 主 + Finance 协 | 双签 PR | W6 |
| `inv_batches` 字段改名 service 收口 | ERP | Architect 评审 DDL + Finance 评审是否影响 AR/AP source_id | W6 |
| `sys_user_scopes` 合表 + data-scope.service 改读 | Architect | Audit 验登录链路 + Finance 验数据范围在财务侧仍生效 | W7 |

### 7.5 兼容期承诺（给 ERP / Finance Agent 的"过渡安全网"）

| 旧字段 / 旧路径 | 弃用 wave | 兼容期截止 wave | 兼容期承诺 |
|---|---|---|---|
| `farm_code` 写入 | W6 (E1) | W8 | service 桥接层兼容；新业务表禁建 |
| `store_code` 写入（inv_batches） | W6 (E1) | W8 | 双写 owning_company_code + store_code |
| `prc2_projects.project_manager_user_id` | W5 (5.3) | W7 | biz_projects 同步迁移；workflow service 优先读 biz_projects |
| `shr_projects.project_code` | W5 (5.3) | W7 | shr_project_attrs 视图过渡 |
| finance-v2 自定义 `scopeAll/companyCodes` | W3 (F1) | W5 | CLS 直读后删 |
| `/api/master/stores` / `/api/master/products` | W2 (M5 文档) | W10 | 路由保留，加 deprecation header |
| `/crud/wms_zones` / `/crud/wms_locations` 全量拉 | W2 | W6 | 新建 `/lookup/wms-zones?warehouseCode=` 端点 |

---

## 8. 与 PROJECT_COMMAND_CENTER / CLAUDE.md / MULTI_AGENT_PHASE2_PLAN 的一致性

- ✅ PROJECT_COMMAND_CENTER §5 高风险变更"先文档再代码"：本设计为 M1-M5 五份独立
  方案的母规划，所有 service / DDL 改动必须先有对应 M-文档评审通过。
- ✅ PROJECT_COMMAND_CENTER §3 合并规则：所有改动走 feature/agent-* → main，Audit
  Agent reviewer-required。
- ✅ CLAUDE.md §0 entity↔DB 对齐：所有 ADD COLUMN / RENAME 前先 `\d <table>` 验列。
- ✅ CLAUDE.md §0.5 nullable-in-unique：sys_user_scopes 多列 PK 全 NOT NULL。
- ✅ CLAUDE.md §0.6 好业财铁律：本设计未触碰 fin_ar_invoices ↔ chanjet_ar_snapshot
  关系。
- ✅ CLAUDE.md 迁移走 TS + down() + 无业务 DML：所有改动严格遵守。
- ✅ MULTI_AGENT_PHASE2_PLAN §2.2 Architect 任务：M1 / M2 / M3 / M4 / M5 全部覆盖
  本设计 §4 / §5。
- ✅ MULTI_AGENT_PHASE2_PLAN §4 冻结清单：本设计未在 W1-W3 之前动任何冻结表 schema。
- ✅ MULTI_AGENT_PHASE2_PLAN §5 闭环顺序：本设计严格按 Step 3 / 6 / 9 / 10 时点
  规划，未抢跑 ERP W6+ 之前的 service 改造。

---

## 9. 第二阶段交付清单（Architect Agent 自承）

按 MULTI_AGENT_PHASE2_PLAN §2.2 与本文档：

| 编号 | 文档 / 交付 | 状态 | 落地 Wave |
|---|---|---|---|
| 母规划 | `docs/MASTER_DATA_PHASE2_DESIGN.md`（本文档） | ✅ 本次产出 | W2 |
| M1 | `docs/mdm-1-finalize-plan.md`（biz_site_aliases 激活、SiteSelector、brd_farms / mst_stores 灰度切换） | ⏳ 待写 | W2 |
| M2 | `docs/project-master-consolidation-plan.md`（biz_projects 收口、shr_projects → shr_project_attrs、workflow.byProjectManager 切表） | ⏳ 待写 | W2 |
| M3 | `docs/inv-batches-store-code-rename-plan.md`（owning_company_code 改名 DDL 草案 + 字段映射） | ⏳ 待写 | W2 |
| M4 | `governance.service / operations.service / master-data-references.service` 扩 4 类的 service 改造方案文档（含治理图谱配置 seed） | ⏳ 待写 | W2 |
| M5 | `docs/master-module-retire-plan.md`（`/api/master/*` 退役清单） | ⏳ 待写 | W2 |
| 治理验收 | `scripts/check-master-data-references.mjs`（出"业务表使用的 code 字段哪些已落 canonical / 哪些仍在用 alias"统计） | ⏳ 待写 | W2 末尾 |
| biz_site_aliases TS 迁移 | `apps/api/src/database/migrations/<ts>-SeedBizSiteAliases.ts` | ⏳ 待落 | W4 |
| biz_site_projects TS 迁移 | `apps/api/src/database/migrations/<ts>-CreateBizSiteProjects.ts` | ⏳ 待落 | W4 |
| sys_organization_type_rules TS 迁移 | `apps/api/src/database/migrations/<ts>-CreateOrgTypeRules.ts` | ⏳ 待落 | W4 |
| biz_projects 扩列 TS 迁移 | `apps/api/src/database/migrations/<ts>-ExtendBizProjects.ts` | ⏳ 待落 | W5 |

**本阶段（W2）禁动 service 业务逻辑、禁落 W4+ 的 DDL 迁移**——只出文档。

---

## 10. 待用户拍板的关键决策

1. **M1 SiteSelector 是否本 wave 启动**：影响 farm / store / wms 三个核心业务流，
   ERP Agent 实施在 W6+，Architect 在 W4 之前必须出方案。
2. **biz_business_units 与 sys_organizations.BU 二选一**：本设计推荐保留
   biz_business_units（横切式），sys_organizations 取消 BU 枚举。需要业务侧拍板。
3. **shr_projects 是否退化为 shr_project_attrs**：股东模块的开发节奏是否与
   finance 团队冲突？需要 Finance Agent 评估 W6 是否可行。
4. **sys_user_scopes 合表是否在 W7 启动**：触登录链路，Audit Agent 第一阶段已
   关 RBAC 裸奔（W1）；本设计倾向 W7 启动，需要 Audit Agent 评估时间窗。
5. **物料 vs 产品 SOP**：需要业务方（采购 / 销售 / 养殖）共同拍板"鸡蛋走 product
   还是 material"的边界规则。
6. **`/api/master/*` 路由退役时点**：影响前端调用链；M5 文档需要 ERP Agent 配合
   出前端切换清单。
7. **是否在 W4 同时落 biz_site_projects 桥表**：本设计建议 W4 一并落，避免 W6
   service 切换时还要等桥表上线。

---

**本设计生效日期：2026-06-20。等待 M1-M5 五份子文档落地，再进入 W3 Finance F1。**
