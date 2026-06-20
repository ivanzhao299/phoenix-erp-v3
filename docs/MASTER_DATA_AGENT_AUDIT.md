# Master Data Agent 主数据 / 组织 / 权限范围审计

> Agent：Architect / MasterData Agent
> 分支：`feature/agent-architect-masterdata`
> 日期：2026-06-20
> 范围：仅审计，不写业务功能。覆盖 `apps/api/src/modules/{master, master-data, org, business-unit, farm, product-master, shareholder, store}` 与 `migrations/` 中已存在的 MDM 治理基线。
> 配套文档：`docs/mdm-coding-standard.md` (MDM-1)、`docs/mdm-0-master-data-audit.md` (MDM-0)、`docs/g55a/c/d` 系列、`docs/g4d`/`g4e`、`docs/g79-three-centers-cleanup-plan.md`、`docs/g109-henhouse-governance.md`（记忆索引）。

---

## 0. 速读结论

| 维度 | 现状 | 主要问题 |
|---|---|---|
| 公司 (Company) | `sys_organizations.org_type='COMPANY'` 是 canonical；业务表全部冗余 `company_code` 字段做隔离 | 旧编码 `LPH` / `CO-FHA` 仍在数据里，MDM-1 规范的 `COMP-*` 没有强制落地；业务表的 company_code 与 sys_organizations.org_code 没有 FK 约束 |
| 项目 (Project) | `biz_projects`（运营）+ `shr_projects`（股东）双源 | 两张表都有 project_code，但语义维度不同（运营 vs 资本/股权），并发同名 project_code 时无强约束；MDM-1 规范只承认 biz_projects |
| 养殖场 (Farm) | `brd_farms.farm_code`（旧 `LPH_*`） + `sys_organizations.org_type='FARM'/'SITE'`（新 `SITE-*-LAYER`） | 4 套并行命名（farm/site/sys_store/mst_stores）；`farm.service.ts` 仍按 farm_code/site_code OR 取并集做 scope；`biz_site_aliases` 表已建但 service 未真正消费 |
| 组织 (Org) | `sys_organizations` 同时承担：法人 / BU / 站点 / 仓库 / 门店 / 部门 7 种 org_type | org_type 是松枚举，没有"角色对应字段必填"的约束，导致同一行 org 既是 COMPANY 又像 SITE；biz_business_units 与之并存做横切 BU |
| 客户 / 供应商 | `sal_customers` / `prc2_suppliers` 由 master-data-runtime 统一 CRUD | OK；隔离靠 company_code，已生效；与好业财（畅捷通）外部主数据无主从映射表（记忆 [[project_yonyou_chanjet_integration]]） |
| 物料 / 产品 / SKU | `mst_materials`（采购投入品） + `mst_products`（销售产品） + `product_grades` + `packaging_specs` + `product_skus` | materials/products 双源没有边界硬约束；前者免审批后者需审批；业务方常把"鸡蛋"既建产品又建物料 |
| 门店 (Store) | `sys_store`（V2 老表，仍被 master.controller fallback 读） + `mst_stores`（master-data-runtime canonical） + `sys_organizations.org_type='STORE'` + `biz_store_daily_close`（操作） | 3 张主表 + 1 张交易表，3 张主表无主从；记忆 [[project_impersonate_qa_store_code]] 显示 store_code 系统性错位还在追尾 |
| 权限范围 (Scope) | `sys_user_orgs.data_scope_level` + `sys_user_project_scopes` + `sys_user_farm_scopes` + `sys_user_warehouse_scopes` + `sys_data_scopes`（角色×模块） | 5 张表做同一件事（用户可见哪些公司/项目/场/仓）。data_scope_level 是声明，scope 表是兜底；当两者不一致时 DataScopeService 的并集逻辑可读性差，新模块经常忘记接入 |

---

## 1. 责任目录结构盘点

### 1.1 `apps/api/src/modules/master`

| 路由 | 行为 | 表 |
|---|---|---|
| `GET /api/master/stores` | 优先读 `sys_store` (status='1')，失败回退 `mst_stores` (status='ACTIVE') | `sys_store` / `mst_stores` |
| `GET /api/master/products` | 直读 `mst_products` (status='ACTIVE') | `mst_products` |
| `system-users.controller.ts` | 用户 CRUD（与 org/user 模块功能重叠） | `sys_user`, `sys_user_orgs` |

**问题**：
- 同一个"门店"概念在三处读取（master.controller / mst_stores / sys_organizations），且这里还保留 `sys_store` fallback——明确是历史遗留，应在 MDM-6 阶段冻结后随之退役。
- `system-users.controller.ts` 与 `/modules/master/users`（如有）功能粘连。建议剥离到 `apps/api/src/modules/auth` 或归入 org 模块。

### 1.2 `apps/api/src/modules/master-data`（运行时主表）

这是当前主数据治理的核心。`master-data-runtime.service.ts` 采用**配置驱动**的 14 类主数据 CRUD：

| type | 表 | 审批 | 公司隔离 | 备注 |
|---|---|---|---|---|
| customer | sal_customers | ✅ | ✅ company_code | OK |
| supplier | prc2_suppliers | ✅ | ✅ owner_company_code | OK |
| project | **biz_projects** | ✅ | ✅ company_code | 与 shr_projects 重叠 |
| material | mst_materials | ❌ | ❌（集团共享） | 与 product 边界模糊 |
| product | mst_products | ✅ | ❌（集团共享） | 同上 |
| grade | product_grades | ❌ | ❌ | OK |
| spec | packaging_specs | ❌ | ❌ | OK |
| sku | product_skus | ❌ | ❌（继承 product/grade/spec） | OK |
| store | mst_stores | ✅ | ✅ company_code | 与 sys_organizations type=STORE 重叠 |
| warehouse | wms_warehouses | ✅ | ✅ company_code | 与 sys_organizations type=WAREHOUSE 重叠 |
| driver | sal_drivers | ❌ | ✅ company_code | OK |
| cash-account | fin_cash_accounts | ✅ | ✅ company_code | 由 Finance Agent 治理 |
| bank-account | fin_bank_accounts | ✅ | ✅ company_code | 由 Finance Agent 治理 |

旁挂服务：
- `code-generator.service.ts` 统一编码生成（CASH-00001 等），未覆盖 site/project/farm
- `governance.service.ts` + `dict-governance.service.ts` 出 5 维评分（暂未含 farm/site/org 维度）
- `operations.service.ts` 出"待处理 / 重复 / 缺数据" 三类 todo
- `master-data-references.service.ts` 出"该主数据被几张单据引用"

**问题**：
- type 表里没有 "site / organization / farm / business_unit / shareholder" —— 它们仍各自走专门 controller，导致一站式治理图谱**漏掉公司、站点、组织节点、股东这四类核心主数据**。
- material 与 product 没有写明边界规则，前端 selector 看不出来"这条饲料用 material 选还是 product 选"。

### 1.3 `apps/api/src/modules/org`（组织树 + 数据范围）

- `sys_organizations`：单表多角色（GROUP / BU / COMPANY / SITE / FACTORY / PROJECT / WAREHOUSE / STORE / DEPARTMENT）。`parent_id` 自指，`level` + `path` 自动维护。
- `sys_user_orgs`：用户与 org 的多对多 + `data_scope_level`（SELF/PROJECT/COMPANY/REGION/GROUP/BU/SITE/DEPARTMENT/STORE/WAREHOUSE）。
- `sys_user_{project|farm|warehouse}_scopes`：三张并列范围表，各自独立 user_id + scope_code。
- `sys_data_scopes`：角色×模块的 scope_type 配置。
- `data-scope.service.ts`：把以上 5 张表聚合成 CLS 里的 `dataScope`（allowedCompanyCodes / allowedFarmCodes / allowedWarehouseCodes / allowedProjectCodes / isGlobal）。

**问题**：
- `sys_organizations.org_type` 是单字段多角色，**没有约束**："如果 org_type=COMPANY，则 company_code 不能为空且 parent_id 必须指向 GROUP" 这类不变量靠业务 service 自觉。
- `data_scope_level` 字段名义在 org 表里声明"这个用户能看到的最大范围层级"，但 `sys_user_*_scopes` 三张表又是另一层"额外扩展授权"，二者关系靠口口相传。新业务模块（养殖、屠宰、孵化）经常忘记一起读。
- 缺失 `sys_user_site_scopes` 或 `sys_user_company_scopes`，导致跨公司、跨站点的特例授权只能通过 sys_user_orgs 加多行实现。

### 1.4 `apps/api/src/modules/business-unit`

- `biz_business_units` + `biz_bu_membership`
- 用途：把若干 org（公司 / 站点）打包成"业务单元"做横切汇总（如"老挝养殖板块"）。
- 与 `sys_organizations.org_type='BU'` 并存（org 表里也允许建 BU 节点）。

**问题**：
- 两套 BU 概念并行：org 树里的 BU（层级式）+ biz_business_units（横切多对多）。建议保留其一。

### 1.5 `apps/api/src/modules/farm`（养殖业务，非主数据）

- 主要写 `brd_daily_logs`（日报）、`brd_flocks`（鸡群）、读 `brd_houses`（鸡舍）。
- scope 解析采用 `(farm_code OR site_code OR company_code) 并集`——这是 G98 阶段的妥协，反映了"还没切完 site_code 化"的过渡态。
- 没有 `brd_farms` CRUD 端点——养殖场作为主数据没有归口（既不在 master-data-runtime 也不在 org controller）。

**问题**：
- 养殖场主数据**无主**：brd_farms 由 [[project_g109_henhouse_governance]] 阶段做过去重，但仍没有官方治理 controller；前端"建养殖场"目前依赖直接 INSERT 或 site_code 替代。

### 1.6 `apps/api/src/modules/product-master`

- `product_grades` / `packaging_specs` / `product_skus` 三张表，由 product-master.service.ts 管理。
- 与 master-data-runtime 的 grade/spec/sku 类型**共用同一张表**——controller 是双入口（`/api/product-master/*` 与 `/api/master-data/runtime/sku/active`），但写入路径不同：product-master 走直 CRUD，master-data-runtime 走审批工作流。
- `lookup.controller.ts` 暴露聚合 SKU 选择，含 sku_code / product_code / grade_code / spec_code 一并返回（[[project_g83_g85_procurement_golive]] 锁的物料根治路径）。

**问题**：
- 双入口造成"前端调哪个"靠口诀：销售/采购选 SKU 用 master-data-runtime，仓库/包装编辑 SKU 用 product-master——容易写错。
- `mst_products` ↔ `product_skus` 关系：1 产品 N SKU，但没有 FK 约束（product_skus.product_code 是 varchar，product_code 列没有 NOT NULL）。

### 1.7 `apps/api/src/modules/shareholder`

- `shr_shareholders`、`shr_projects`、`shr_capital_contributions`、`shr_beneficial_equity`、`shr_project_equity`、`shr_shareholder_scope`。
- `shr_projects` 与 `biz_projects` **平行存在**：前者 project_code 含 `capital_status / equity_status` 状态机，后者只承担运营经营单元。
- `shr_shareholder_scope` 是又一张范围表——再次平行于 sys_user_orgs（但 scope 主体是 shareholder 而非 user）。

**问题**：
- 两套项目主数据没有主从——若 biz_projects 是 canonical，shr_projects 应该只存"资本/股权附加字段"并外键引用 biz_projects.project_code。

### 1.8 `apps/api/src/modules/store`

- `biz_store_daily_close`：门店日结操作单据（DRAFT→SUBMITTED→CLOSED）。
- 不存在 `store.entity` 指向"门店主数据"——主数据由 master-data-runtime/store 管 `mst_stores`，业务层只管"今天某门店的日结记录"。

**与 sys_store / mst_stores / sys_organizations.STORE 的关系混乱程度**：3 张主表 + 1 张交易表。

---

## 2. 重复 / 冲突清单（按严重程度排序）

### ⚠️ S1：养殖场 / 站点 / 门店 / 仓库 命名空间四源混乱

**症状**：
- `brd_farms.farm_code`（LPH_MENGSAI、LPH_DONGPENG）
- `sys_organizations.org_code` org_type=FARM 或 SITE（SITE-MENGSAI-LAYER）
- `mst_stores.store_code`（MS-STORE-01）
- `sys_store.store_code`（V2 老表，仍被读）
- `wms_warehouses.warehouse_code`（0 行，按规范应转为 SITE-*-WAREHOUSE）
- `biz_site_aliases` 表存在但 service 没用上

**影响**：
- farm.service.ts 用 `(farm_code OR site_code OR company_code) 并集`兜底；
- 用户 scope 字段（sys_user.store_code）和真实 org 绑定漂移（[[project_impersonate_qa_store_code]] 真实事故）；
- 主数据治理评分（governance.service.ts）漏掉这部分主数据，永远拿不到准确分。

**根因**：
MDM-1 规范（mdm-coding-standard.md §3-6）规划的"SITE-* 一统天下 + biz_site_aliases 兼容历史"，迁移 SQL（migrations/mdm1_*）建好了，但**第 4 步（业务 service 改造）和第 6 步（老表冻结）没做完**。

### ⚠️ S1：项目主数据双源（biz_projects vs shr_projects）

**症状**：两张表都有 project_code、project_name、status，无主从约束。生产期间可能并存"同 code 不同状态"的两行。

**影响**：
- 业务单据（采购、销售、财务）按 biz_projects 出运营报表；
- 股东出资/分红按 shr_projects 出资本报表；
- 两套数据出账时，"同一个项目"在两套报表里的实际归集口径不一致。

**根因**：shareholder 模块独立演进，建表时没和 master-data 团队对齐 canonical 选谁；MDM-1 规范只钦定了 biz_projects。

### ⚠️ S2：权限范围 5 张表的并集逻辑

**症状**：
- `sys_user_orgs.data_scope_level` 声明用户在某 org 下的可见层级（隐式扩展）；
- `sys_user_project_scopes` / `sys_user_farm_scopes` / `sys_user_warehouse_scopes` 显式追加；
- `sys_data_scopes` 角色×模块层做"角色默认 scope_type"；
- DataScopeService 并集后注入 CLS。

**影响**：
- 新业务模块（养殖 / 屠宰 / 孵化 / 食品厂）接入时经常漏读其中一张；
- 审计角色"我能看到哪些公司/场/项目"时，没有单一权威 SQL 可查；
- 范围表 schema 类似但字段不一致（farm_scope 用 farm_code，project_scope 用 project_code），写通用 helper 麻烦。

**根因**：每加一类业务实体就新建一张 scope 表，没有抽象为 `sys_user_scopes(user_id, scope_type, scope_code)`。

### ⚠️ S2：组织表 sys_organizations 是"万能表"

**症状**：org_type 字段 9 个枚举值（GROUP / BU / COMPANY / SITE / FACTORY / PROJECT / WAREHOUSE / STORE / DEPARTMENT），同一张表存所有组织节点。

**影响**：
- 难写校验："如果 org_type=COMPANY，则 company_code 必须等于 org_code"——靠 service 自觉；
- 查询时 `WHERE org_type='COMPANY'` 满布业务代码；
- biz_business_units 同时存在做横切 BU，进一步分裂。

### ⚠️ S3：物料 (mst_materials) 与 产品 (mst_products) 边界不清

**症状**：
- material：采购投入品（饲料、疫苗、包装、燃料），免审批，集团共享；
- product：销售产品（鸡蛋、淘汰鸡、有机肥），需审批，集团共享；
- 但"鸡蛋"既是销售产品也是阶段投入品（如孵化场的种蛋）；
- 现状 mst_materials.product_code 字段（如有）与 mst_products.product_code 无 FK。

**影响**：业务方常把同一个东西在两张表都建一份，库存对账时出错。

### ⚠️ S3：门店三源 + 操作单据

**症状**：sys_store / mst_stores / sys_organizations(STORE) + biz_store_daily_close（[[project_impersonate_qa_store_code]] 触发的连锁）。

**影响**：用户 store_code 与门店主数据归属漂移；POS / 日结过账靠 store_code 反查时容易错位。

### ⚠️ S4：master / master-data 两个模块名易混淆

**症状**：`/api/master/stores` 与 `/api/master-data/runtime/store/active` 是两套路由，调用方向上没有强约束。

**影响**：新开发者经常调错；建议 master 模块明确退役或并入 master-data-center。

---

## 3. 改造建议（按优先级排序）

> 本节只提出方案，不在本阶段写代码或迁移。每项落地前都要先出"方案文档 + 评审 + 用户拍板"，符合 PROJECT_COMMAND_CENTER.md §5（高风险变更）。

### 🥇 P0 — MDM-1 落地收尾（养殖场 / 站点 / 门店 / 仓库 一统）

**目标**：让 `sys_organizations`（type=SITE，前缀 `SITE-*`）成为唯一的站点 canonical；`brd_farms / mst_stores / sys_store / wms_warehouses` 全转 alias。

**步骤**：
1. **数据盘点**：跑 `scripts/`（新增 audit 脚本）出 `brd_farms / mst_stores / sys_store / wms_warehouses` 全量行 + 别名映射缺口报告。
2. **biz_site_aliases 补齐 seed**：对照 mdm-coding-standard.md §9 表格，把 LPH_*, MS-STORE-*, CO-FHA 等全部 INSERT。
3. **业务 service 改造**：farm.service.ts / farm-feed.service.ts / store-pos / wms.service.ts 的 scope 解析改为"先解析为 site_code 再下沉到查询"；保留 `(farm_code OR site_code)` 兼容期 ≥ 1 个 release。
4. **前端 Selector 改造**：新增 `SiteSelector`（支持 site_business_type 过滤），逐步替换 `FarmSelector`、旧 `StoreSelector`。
5. **老表冻结**：brd_farms / mst_stores 写入路径打日志 → 标记 ARCHIVED → 移到 readonly view。

**风险**：影响 farm/store/wms 三个核心业务流，必须分批切，每批配 scope-audit + 真实数据对账。

### 🥇 P0 — 项目主数据收口到 biz_projects

**目标**：biz_projects 是唯一 canonical project 主表；shr_projects 退化为 `shr_project_attrs`，只存资本/股权附加字段，主键外键 biz_projects.project_code。

**步骤**：
1. 数据比对：列出 biz_projects 和 shr_projects 中 project_code 的交集 / 差集；
2. 缺失补齐：shr_projects 独有的 project_code（如纯股东出资项目）补建到 biz_projects（state='ACTIVE'）；
3. 改造 shareholder service：所有读 shr_projects 的查询改为 `LEFT JOIN biz_projects USING (project_code)`；
4. shr_projects 表名重命名为 `shr_project_attrs`，主键由 project_code 改为 (project_code) FK→biz_projects；
5. 在 master-data-runtime 添加 `project` 类型的附加字段视图（含 capital_status / equity_status）。

**风险**：shareholder 资金、出资单据多，改造期需双写或冻结新建。

### 🥈 P1 — sys_organizations org_type 拆分约束

**目标**：每个 org_type 上"必填字段、关联约束"显式化。

**步骤**：
1. 新增 `sys_organization_type_rules` 配置表：每种 org_type 声明"必填字段 / parent 允许类型 / 子节点允许类型"；
2. 写 service 校验（不下沉为 DB CHECK，因要兼容历史脏数据）；
3. 出 G 阶段报告：每种 org_type 当前坏行清单。

**风险**：低，纯增量约束。

### 🥈 P1 — 权限范围 5 表合一为 `sys_user_scopes`

**目标**：
```sql
sys_user_scopes (
  user_id    bigint,
  scope_type varchar(32),  -- COMPANY / PROJECT / FARM / SITE / WAREHOUSE / STORE
  scope_code varchar(64),  -- 对应 canonical code
  granted_by bigint,
  granted_at timestamp,
  expires_at timestamp NULL,
  PRIMARY KEY (user_id, scope_type, scope_code)
)
```

**步骤**：
1. 新表上线但旧表保留；DataScopeService 改为先读新表，回退旧表（一个 release）；
2. 写迁移脚本把 sys_user_project_scopes / sys_user_farm_scopes / sys_user_warehouse_scopes 数据导入新表；
3. 旧表标 ARCHIVED → 删除。

**风险**：触碰登录链路，按 [[project_g116_g119_role_governance]] 的节奏分阶段灰度。

### 🥈 P1 — 物料 / 产品边界规则书面化

**目标**：明文出 SOP："鸡蛋一律先建 mst_products，作为投入品时通过 product_skus.is_input_eligible=true 标志"；mst_materials 仅限"不会作为对外销售产品"的投入品（饲料、疫苗、燃料、包装、办公耗材）。

**步骤**：
1. 写 `docs/material-vs-product-sop.md`；
2. 增加 DB CHECK：mst_materials.material_code 与 mst_products.product_code 不可同时存在（unique across the two via uniqueness constraint or partial index）；
3. master-data-runtime 增加"创建前检查冲突"逻辑；
4. 现存重复数据出报告 → 业务方拍板归并。

**风险**：低-中，主要业务侧讨论。

### 🥉 P2 — master 模块退役

**目标**：把 `/api/master/stores`、`/api/master/products` 全部并入 `/api/master-data/runtime/{store,product}/active`，删除 master.controller.ts。

**步骤**：
1. 前端逐个端点切换；
2. nginx 加 deprecation header；
3. 删除 master.module；
4. `system-users.controller.ts` 迁入 org 模块或独立 user 模块。

**风险**：低，只是路由迁移。

### 🥉 P2 — biz_business_units 与 sys_organizations BU 角色二选一

**目标**：选择保留 biz_business_units（横切式）或 sys_organizations.org_type=BU（层级式），不并存。

**推荐**：保留 biz_business_units（横切式），sys_organizations 取消 BU 枚举。理由：BU 在金凤凰的语义是"老挝养殖板块、食品板块"这类横跨多公司的虚拟集群，硬塞到 org 树会迫使设置不存在的 parent。

**风险**：中，要审计现存 sys_organizations.org_type='BU' 行的引用方。

### 🥉 P2 — 主数据治理图谱补齐

**目标**：`governance.service.ts`、`operations.service.ts`、`master-data-references.service.ts` 把 company / site / business_unit / shareholder 四类纳入。

**步骤**：扩展 TYPES 配置；每类补 CRUD 端点（或挂载到现有 org / shareholder controller，但走统一审计）。

---

## 4. 待用户确认的关键决策

1. **MDM-1 P0 是否启动**：把 brd_farms / mst_stores 全转 SITE-*，是大动作（影响 farm / store / wms / pos）。需要业务方排期。
2. **shr_projects 是否退化为 shr_project_attrs**：股东模块的开发节奏与 finance 团队冲突的话，可能延迟。
3. **sys_user_scopes 合表**：触登录链路，需要在低峰窗口分阶段灰度。
4. **biz_business_units 与 sys_organizations BU 角色二选一**：业务侧需要明确 BU 在分析报表里的口径。
5. **物料 vs 产品 SOP**：业务方（采购 / 销售 / 养殖）须共同拍板。

---

## 5. 不在本阶段做的事

按 agents/architect-agent.md 第一阶段任务约束：
- ❌ 本阶段不写代码、不创建迁移、不改 service；
- ❌ 不改财务运行逻辑（属于 Finance Agent）；
- ❌ 不动采购、销售、库存、POS 业务流（属于 ERP Business Agent）；
- ❌ 不动飞书、用友、通知接口（属于 Audit / Integration Agent）；
- ✅ 本文档输出后等待用户拍板，再分别为每个 P0/P1/P2 出独立的"方案文档 + 迁移草案 + 切换计划"。

---

## 6. 附：被审计文件 / 表清单

**Service / Controller**：
- apps/api/src/modules/master/master.controller.ts
- apps/api/src/modules/master/system-users.controller.ts
- apps/api/src/modules/master-data/* (12 个文件)
- apps/api/src/modules/org/* (entities + services + controllers)
- apps/api/src/modules/business-unit/*
- apps/api/src/modules/farm/* (12 个文件)
- apps/api/src/modules/product-master/* (controllers + services)
- apps/api/src/modules/shareholder/entities/*
- apps/api/src/modules/store/*

**主表清单**：
- sys_organizations, sys_user_orgs, sys_user_project_scopes, sys_user_farm_scopes, sys_user_warehouse_scopes, sys_data_scopes
- biz_projects, biz_business_units, biz_bu_membership, biz_site_aliases (待激活), biz_store_daily_close
- brd_farms, brd_houses, brd_flocks, brd_daily_logs
- mst_products, mst_materials, mst_stores
- product_grades, packaging_specs, product_skus
- wms_warehouses
- sal_customers, sal_drivers
- prc2_suppliers
- shr_projects, shr_shareholders, shr_capital_contributions, shr_beneficial_equity, shr_project_equity, shr_shareholder_scope
- fin_cash_accounts, fin_bank_accounts
- sys_store, sys_settings, sys_user (legacy / 跨模块)
- md_audit_logs（治理日志）

**参考治理文档**：
- docs/mdm-coding-standard.md
- docs/mdm-0-master-data-audit.md
- docs/mdm-1-implementation-report.md
- docs/g4a/g4b/g4c/g4d/g4e（单据主数据化系列）
- docs/g55a/g55c/g55d/g55e（master-data center 演进）
- docs/g79-three-centers-cleanup-plan.md
- docs/g109-henhouse-governance.md
- docs/organization-architecture.md
- docs/role-organization-runtime-audit.md
