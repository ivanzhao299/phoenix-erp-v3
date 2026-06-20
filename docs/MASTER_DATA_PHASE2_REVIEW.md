# 主数据二阶段方案审查

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：
> - `PROJECT_COMMAND_CENTER.md`
> - `CLAUDE.md`
> - `docs/MULTI_AGENT_PHASE2_PLAN.md`
> - `docs/MASTER_DATA_PHASE2_DESIGN.md`（被审对象）
>
> 本评审不修改业务代码、不新增 migration；只对 Architect Agent 第二阶段母规划
> 给出"通过 / 有条件通过 / 暂缓"决议，并把放行条件、风险点、ERP/Finance
> 启动判定一次说清。

---

## 0. 结论速读

| 维度 | 结论 |
|---|---|
| L1-L5 模型是否自洽 | ⚠️ **基本自洽，但 3 处定义边界未澄清**（详 §1） |
| company / project / site / bu / dept 五字段覆盖度 | ✅ 覆盖采购 / 销售 / 库存 / 财务 / 权限主路径，⚠️ 但工作流"按部门 / 按事业群"路由场景未充分演示 |
| `biz_site_projects` / `biz_site_aliases` / `sys_user_scopes` 合表风险 | 🟡 中等：单 alias 表低风险；biz_site_projects 与 biz_projects.site_code 的双源冲突需先解；sys_user_scopes 含 `SHAREHOLDER` 维度时**语义可能错配**（详 §3） |
| 可立即进入 W4 的内容 | sys_organization_type_rules（建表 + seed）、`biz_site_aliases` 中**无歧义子集** 的 seed；biz_site_projects 与 biz_projects 字段扩列需先解依赖 |
| 必须先由用户拍板的内容 | §10 全部 7 项 + 本评审 §5 列的 4 项澄清 |
| ERP Agent 可启动改造 | ✅ 可立即启动 **E6**（角色硬编码清理）；❌ E1-E5 / E7 必须等 M1/M2/M3 子文档 + 用户拍板 |
| Finance Agent 可启动改造 | ✅ 可立即启动 **F1 / F2 / F3 / F4 / F5**；❌ F6（股东对账）必须等 M2 |
| **整体决议** | **🟡 有条件通过**（详 §8） |

---

## 1. L1-L5 模型逻辑冲突分析

### 1.1 自洽部分

- L1（COMPANY）+ I-1（org_code = company_code）：单字段 + 唯一约束清晰。
- L2（biz_projects）+ I-2 ~ I-4：项目和 site 是多对多桥（biz_site_projects），
  这条线一致；biz_projects.company_code NOT NULL 把项目锚定到法人也合理。
- L4（biz_business_units 横切）+ I-5 + I-8（BU 不在树里）：BU 与 L1/L3/L5 拓扑
  正交，避免了 org 树里塞 BU 的怪味。**推荐保留 biz_business_units（横切）** 与
  设计 §4 / §10-2 一致。
- L5（DEPARTMENT）通过 sys_organizations 承载，code 规范 `DEPT-{COMPANY}-{FUNC}`
  也合理。

### 1.2 冲突 / 模糊 3 处（必须澄清）

#### C-1 站点 vs 仓库（L3 与"辅 warehouse"重叠）

`§1.1` 把 WAREHOUSE 写成 L3 站点的一个 `site_business_type`，同一节又另起
"辅 warehouse_code → wms_warehouses"。I-7 说：

> "warehouse 要么自己就是 SITE-*-WAREHOUSE（一对一），要么挂在 site 内部
> （多仓时 mapped_site_code 必填）"

含义：
- 单仓 = 一行 sys_organizations(SITE, WAREHOUSE) + 一行 wms_warehouses，二者
  code 相同。
- 多仓 = 一行 sys_organizations(SITE) + N 行 wms_warehouses，每行 mapped_site_code
  指向上面那个 SITE。

但 §3.1 库存表必填字段写：

> 库存 (inv_* / wms_*) 必填：owning_company_code、**site_code（仓库）**、sku_code
> 选填：location_code、batch_no
> （未列 warehouse_code）

**问题**：
- 多仓场景下 `site_code` 不足以唯一定位库存（需 site + warehouse 才行）。
- 已存在的 `inv_batches.warehouse_code` / `wms_stock_balance.warehouse_code` /
  `wms_stock_ledger.warehouse_code` 字段去留没说。
- FIFO 引擎按 `(warehouse_code, sku_code)` 维度扣减；若退化为 site_code 维度，
  扣减语义会变。

**澄清要求**：M3 文档必须明确：
1. inv_batches / wms_stock_balance / wms_stock_ledger 是否保留 warehouse_code？
2. 单仓场景 site_code = warehouse_code 是约定还是约束？
3. FIFO 引擎维度（sku × warehouse 还是 sku × site？）。

#### C-2 mst_stores 的归宿

§1.1 把门店纳入 SITE 子类（site_business_type=STORE）。
§4 又把 mst_stores 列为"主表收口到 master-data-runtime/store；门店实体走
SITE-*-STORE"。

**问题**：
- master-data-runtime 现行 store 类型指向 `mst_stores`（含审批工作流、company
  隔离、code 生成），是个独立 entity。
- SITE-*-STORE 是 sys_organizations 行。
- 二者要不要合并？是 mst_stores 退化为 sys_organizations 上的视图，还是 mst_stores
  当作"门店运营补丁数据"挂在 SITE-*-STORE 上？

设计**没说**。这是新一轮"主数据双源"的潜在再生点。

**澄清要求**：M1 / M5 文档之一必须给出 mst_stores ↔ SITE-*-STORE 的精确关系
图（CREATE VIEW、CASCADE FK、或独立保留+对账）。

#### C-3 brd_houses 命名规则与 house_code 全局唯一

§1.1 `house_code` 命名规范 `HOUSE_{SITE_SHORT}_{NN}`，且要求 (house_code) 全局
唯一。

**问题**：
- "SITE_SHORT" 不是规范化字段，若 site rename 不会同步触发 house rename，可能
  退化为脏前缀。
- I-6 规定 house 必属一个 site，但没有要求 `house_code` 必须由 site_code 派生
  或加 FK 约束到 site_code。

**澄清要求**：M1 文档需要在"养殖场内部细化"段补一段：house ↔ site 关系是否
通过 `brd_houses.site_code FK→sys_organizations(org_code)` 强制；house_code
是否冻结为不可重命名。

---

## 2. 五字段（company/project/site/bu/dept）对采购 / 销售 / 库存 / 财务 / 权限的支撑度

### 2.1 已覆盖（无需补）

| 模块 | 已覆盖字段 | 证据 |
|---|---|---|
| 采购 PR/PO/AP/Payment | company / project（可空）/ site（收货地）/ supplier_code | §3.1 |
| 销售 SO/AR | company / project（可空）/ customer / channel | §3.1 |
| 库存批次 / 台账 | company（owning_company_code）/ site / sku / location | §3.1（保留 C-1 警告） |
| 财务 AP/AR/Cash/Expense | company / project（可空）+ 各自专属 code | §3.1 + Finance F2 已规划 |
| 数据权限 | allowedCompanyCodes / allowedProjectCodes / allowedSiteCodes / allowedWarehouseCodes / allowedShareholderCodes | §3.3（6 维 dataScope） |

### 2.2 部分覆盖 / 有缺口

#### Gap-1 工作流"按部门 / 按事业群"路由场景缺演示

`assignment-resolver.service.ts` 现有 7 种策略（byRole / byCompanyRole /
byProjectRole / byOrgManager / byProjectManager / byCompanyFinance /
byDirectManager）。本设计：
- 把 `byProjectManager` 切到 biz_projects（OK，已规划）；
- 但**没说**：要不要引入 `byDepartmentRole`（按 dept_code）和 `byBuRole`（按 bu_code）？

dept_code / bu_code 在数据模型里有，但 workflow.assignment-resolver 现在并不
基于这两个维度路由。若未来要按部门审批（HR、采购部内审、财务部内审），需要
新策略。本设计没有承诺也没有禁止。

**判定**：不算阻塞 W4，但需要在 M2 / M4 文档里说一句"workflow 短期不引入
byDepartmentRole/byBuRole；如未来要加，单独提案"——否则容易在 W7-W9 又出意外。

#### Gap-2 销售配送的 site 粒度

§3.1 销售配送（sal_delivery_*）目前只 `company_code` + `driver_id` + `vehicle_id`，
无 site_code / project_code。若一个公司有 N 个站点，driver/vehicle 跨站点流动
时，DataScope 只能粗到 company。

**判定**：现状如此，本设计不要求改。但 §3.3 `allowedSiteCodes` 引入后，
sal_delivery_* 是否要补 site_code 字段需 ERP Agent 决定。不阻塞 W4。

#### Gap-3 sys_exchange_rates 没有 company / site 隔离

ERP 第一阶段审计提到"汇率表全局共享，多公司不同策略会冲突"。本设计未触及。

**判定**：超出本设计范围；记入 R2 治理欠债，由 Finance Agent 在后续 wave 提案。

### 2.3 设计已声明、待落地

- `allowedSiteCodes` 新维度需要 DataScopeService 输出新字段（§3.3）。
- finance-v2 现行 `scopeAll/companyCodes` 必须废弃（Finance F1）。
- `ProjectSelector` 在 ap/ar/expenses 表单加（Finance F2）。

以上由 Finance Agent W3 / Architect W7 落地，方向一致，无冲突。

---

## 3. biz_site_aliases / biz_site_projects / sys_user_scopes 合表风险

### 3.1 `biz_site_aliases`：🟢 低风险

- 表已建（migrations/mdm1_02），W4 只做 seed INSERT。
- 设计 §6.4 红线明文："不允许在 W5 之前接 biz_site_aliases service 消费路径"。
- 数据回滚靠 `DELETE WHERE alias_type IN (...)`，可逆。
- ⚠️ **唯一前置**：seed 内容必须基于 `mdm-coding-standard.md §9` 完整对照表，
  且该对照表本身已被运维 / 业务方审过（本评审无法访问 mdm-coding-standard 的
  §9 内容做穿透核对）。

**通行条件**：W4 提交 seed 迁移时，PR 描述必须贴出"哪些 alias_type 已全量、
哪些只入了已知子集"。

### 3.2 `biz_site_projects` 新表：🟡 中风险

#### 风险 a：与 `biz_projects.site_code`（§5.3 W5 扩列）形成双源

设计 W5 在 biz_projects 新增 `site_code` 列作为"单 site 项目快捷字段"，同时
W4 又新增 `biz_site_projects(site_code, project_code, weight_pct, is_primary)`
桥表。结果：

- 单 site 项目：biz_projects.site_code 和 biz_site_projects 各一份；
- 多 site 项目：biz_projects.site_code = NULL，biz_site_projects N 行。

**问题**：service 查 "项目 P 对应哪些 site" 时该查哪张表？写 "site S 服务哪些
项目" 时只能查桥表？两张表数据不一致谁说了算？

#### 风险 b：W4 seed 依赖 W5 才上线的列

§5.1 "biz_site_projects 初始 seed：把现有 biz_projects.site_code（如有）直接
迁入"——但 biz_projects.site_code 这列要到 W5 才加。W4 seed 时该列尚不存在，
无法迁入。

**澄清要求**：
1. 把 biz_projects.site_code 字段扩列改到 W4，与 biz_site_projects 桥表同 wave 落；
2. 或 biz_site_projects 桥表延后到 W5；
3. 同时明文：单 site 项目以**桥表 is_primary=true 那一行为权威**，biz_projects.site_code
   只是冗余冷字段（service 只读不写）；或反之。

**通行条件**：M2 文档必须先解此双源决策；W4 内不允许 biz_site_projects 独立
落地（除非声明"先建空表，seed 留 W5"）。

### 3.3 `sys_user_scopes` 合表：🟠 中高风险

#### 风险 a：`shr_shareholder_scope` 主体是 shareholder，不是 user

Master 第一阶段审计 §1.7 明确写：

> shr_shareholder_scope 是又一张范围表——再次平行于 sys_user_orgs（但 scope
> 主体是 **shareholder** 而非 **user**）。

但本设计 §5.7 把 shr_shareholder_scope 列入"数据迁移源"，与 sys_user_project_scopes
等同处理后并入 `sys_user_scopes(user_id, scope_type, scope_code)`。

**矛盾**：sys_user_scopes 的 PK 是 `user_id`，而 shr_shareholder_scope 的 PK
是 `shareholder_code`。把"shareholder X 能看哪些 company/project"翻译成"user Y
对 shareholder X 有 SHAREHOLDER 类 scope"完全是两套语义。

**澄清要求**：M-Architect 必须明确：
1. sys_user_scopes.scope_type='SHAREHOLDER' 语义=user 可见 shareholder 列表？
   还是 user 可代某 shareholder 操作？
2. shr_shareholder_scope（shareholder 视角）是否**独立保留**，不参与本次合表？
3. dataScope.allowedShareholderCodes 是从 sys_user_scopes 算还是从 shr_shareholder_scope
   反查？

不澄清直接合表 → 现行所有"按股东查项目/资金"接口会语义错配。

#### 风险 b：sys_user_orgs.data_scope_level 未并入

Master 审计原始建议"5 表合一"。本设计实际合 4 张（project/farm/warehouse/
shareholder），**保留** sys_user_orgs.data_scope_level。这是合理取舍（前者是
"隶属关系"，后者是"看的范围"），但需要明文：

- data-scope.service 解析顺序：先按 data_scope_level 展开默认可见范围，再 union
  sys_user_scopes 显式追加；
- 二者不一致时按"并集"or"显式优先"？

**澄清要求**：M-Architect 在 §5.7 落地文档里给出确定算法（伪代码即可）。

#### 风险 c：登录链路侧影响

sys_user_scopes 数据迁移后，data-scope.service 改读 → DataScopeGuard 写入 CLS
的字段变更 → 业务 service 读到新 6 维（含 allowedSiteCodes、allowedShareholderCodes）
→ 旧 service 仍读 `allowedFarmCodes`（farm 兼容字段）需要 alias 一段时间。

**通行条件**：
1. data-scope.service 改造必须保留旧字段名 alias 至少 1 个 wave（W7→W8）；
2. Audit Agent W1-W4 完成后才能动登录链路（CLAUDE.md "触登录链路按 G116-G119
   节奏分阶段灰度"）；
3. 必须有验收脚本对比"旧 4 表并集结果"与"新 1 表结果"差异 = 0。

---

## 4. 可立即进入 W4 的内容

> **W4 入门票**：seed-only / 新增 nullable 列 / 新建独立表；不动现有 service 行为。

| 候选 | 评估 | 决策 |
|---|---|---|
| `sys_organization_type_rules` 建表 + seed（§5.2） | 纯加表，service 不接入。9 条规则 seed 是稳定数据。 | ✅ **可入 W4**（前提：9 条规则 seed 内容需用户拍板，但内容简单可在 PR 内 review） |
| `biz_site_aliases` seed（§5.1）—— 无歧义子集 | WAREHOUSE_LEGACY_CODE / OLD_SITE_CODE 对照（仓库 + 旧 site code）属机械对照。 | ✅ **可入 W4**（seed 范围必须在 PR 描述列清） |
| `biz_site_aliases` seed —— FARM_CODE / STORE_CODE / EXCEL_NAME / LEGACY_NAME / LEGACY_COMPANY_CODE | 需 mdm-coding-standard.md §9 完整对照，且涉及 LPH→COMP-LAO-AGRI 这类对应业务方拍板 | ⚠️ **建议等 M1 拍板后再入**（拆为 W4-late 或 W4.5） |
| `biz_site_projects` 新表（§5.1） | 与 biz_projects.site_code 双源未解；seed 依赖 W5 列。 | ❌ **不入 W4**，必须先在 M2 文档解决双源问题（条件见 §3.2） |
| biz_projects 扩列（§5.3） | 涉及 capital_status / equity_status 等股权字段，与 shr_projects 改造同一根链路。 | ❌ **不入 W4**（属 W5；且需 M2 拍板） |
| shr_projects → shr_project_attrs（§5.4） | 表改名 + 视图过渡，跨域改动。 | ❌ **不入 W4** |
| inv_batches.store_code rename（§5.5） | 双写期 + 回填脚本，影响 ERP service。 | ❌ **不入 W4**（属 W6） |
| sal_store_sales.customer_code FK（§5.6） | service 先收口，DDL 后落。 | ❌ **不入 W4** |
| sys_user_scopes 合表（§5.7） | shareholder scope 语义未澄清；触登录链路。 | ❌ **不入 W4**（属 W7） |
| wms_warehouses.mapped_site_code（§5.8） | 需先解 C-1（单仓 vs 多仓约束）。 | ❌ **不入 W4** |
| BU 收口（§5.9） | 需用户拍板二选一。 | ❌ **不入 W4** |
| master-data-runtime TYPES 扩展（§5.10） | 纯 service 加法，不触 DDL。 | 🟡 **可入 W4 末尾**（不归 W4 DDL 批，归 M4 service 加法批） |

**W4 最小可放行集**（Audit 推荐）：

1. `sys_organization_type_rules` 表 + seed（含 9 条规则）；
2. `biz_site_aliases` seed **限定 `WAREHOUSE_LEGACY_CODE` + `OLD_SITE_CODE` 两个
   alias_type 的对照**；
3. `master-data-runtime` 治理 TYPES 扩展 4 类（service 加法，无 DDL）；
4. `scripts/check-master-data-references.mjs` 验收脚本（无 DDL，CI 红线候选）。

其余必须挂在 M1/M2/M3 子文档拍板后进入 W4-late / W5。

---

## 5. 必须先由用户拍板的内容

合并设计 §10 与本评审新增的澄清项：

### 5.1 设计 §10 已列出（直接转引）

1. M1 SiteSelector 是否本 wave 启动；
2. biz_business_units 与 sys_organizations.BU 二选一（推荐前者，待用户确认）；
3. shr_projects 是否退化为 shr_project_attrs（Finance 团队节奏评估）；
4. sys_user_scopes 是否 W7 启动（Audit 评估时间窗）；
5. 物料 vs 产品 SOP（业务方拍板）；
6. `/api/master/*` 退役时点；
7. biz_site_projects 与 biz_projects 字段扩列是否同 wave 落。

### 5.2 本评审新增

8. **C-1 仓库/站点关系**：inv_batches / wms_stock_balance 是保留 warehouse_code
   还是只用 site_code？单仓约定还是约束？FIFO 维度？（影响 W6 ERP E1 实施）
9. **C-2 mst_stores 归宿**：与 SITE-*-STORE 是合并、视图、还是独立？（影响
   master-data-runtime/store 与 W6 ERP E2）
10. **C-3 brd_houses 与 site 关系**：house_code 是否冻结、是否加 FK？（影响 M1
    SiteSelector 的 house 联动）
11. **Risk 3.3-a shareholder scope 合表语义**：sys_user_scopes.scope_type='SHAREHOLDER'
    到底是"user 可见的 shareholder 列表"还是"user 可代某 shareholder 操作"？
    shr_shareholder_scope 是否独立保留？

**任一未拍板 → W4-late 及之后不允许启动**。

---

## 6. ERP Agent 是否可基于本方案开始改造？

### 6.1 可立即启动（不依赖 M1/M2/M3）

| Wave | 任务 | 评估 |
|---|---|---|
| W7 | **E6 角色硬编码清理** | ✅ 完全独立。procurement.service:60 / workflow.service:84,2042-2056 / assignment-resolver:215 改读 sys_role_menu_permission，无主数据依赖。Audit Agent 可协助验"角色去掉后无回归"。 |

### 6.2 准备工作可启动，落地必须等

| Wave | 任务 | 何时启动 | 何时落地 |
|---|---|---|---|
| W6 | E1 inv_batches.store_code 分家 | ⏳ 可写迁移脚本草稿 / 默认仓 sys_config 配置草稿 | 等 M3 拍板 + Architect 出 DDL + 用户拍板 §5 #8 |
| W6 | E2 sal_store_sales.customer_code FK | ⏳ 可改 service 写入端做"customer_code 必须存在" guard | 等 M3 + 数据清洗完成 |
| W7 | E3 supplier_code/id 二选一 | ⏳ 可 grep + 标注双写点 | 直接做（与主数据治理无强依赖）✅ |
| W7 | E4 FIFO 双路径合并 | ⏳ 可写灰度开关 | 等 §5 #8 澄清 FIFO 维度 |
| W7 | E5 inv_batches.status → INV_STOCK_STATUS 字典 | ✅ 与主数据治理无强依赖，可直接做 | 直接做 |
| W8 | E7 workflow.byProjectManager 切 biz_projects | ⏳ 可写 service 灰度逻辑 | 等 M2 + biz_projects.project_manager_user_id 列上线（W5） |

### 6.3 ERP Agent 启动判定

✅ **可立即启动**：E3 / E5 / E6（无依赖）
🟡 **可做准备**：E1 / E2 / E4 / E7（草稿 + grep，落地等 M 文档）
❌ **暂不可启动**：以上以外

---

## 7. Finance Agent 是否可基于本方案开始改造？

### 7.1 可立即启动（CLS 现行 6 维 + 主数据契约稳定）

| Wave | 任务 | 评估 |
|---|---|---|
| W3 | **F1 DataScope CLS 收口** | ✅ 现行 org/data-scope.service 已写 `isGlobal`/`allowedCompanyCodes`（Finance 审计 §5.2 证实），finance-v2 改读 CLS 不依赖未来 6 维输出。 |
| W5 | **F2 项目维度补齐** | ✅ `allowedProjectCodes` 已在 CLS 里。F2 加过滤 + 前端 ProjectSelector，与本设计 §3.2 完全一致。 |
| W5 | **F3 报销旁路收口** | ✅ 独立改造（reimbursements.pay 走 CashTransactionsService），与主数据无关。 |
| W5 | **F4 AP 手工付款端点** | ✅ 独立新功能。 |
| W2 | **F5 fin_ap/ar attachment_urls 方案文档** | ✅ 纯文档。Architect 后续评 DDL。 |

### 7.2 必须等 M2

| Wave | 任务 | 阻塞原因 |
|---|---|---|
| 跨域 | **F6 shareholder ↔ finance bridge 方案** | shr_capital_contributions 与 fin_shareholder_contributions 单向投影方向需要先解 §5 #3（shr_projects → shr_project_attrs）和 §5 #11（shareholder scope 语义）。 |

### 7.3 Finance Agent 启动判定

✅ **可立即启动**：F1 / F2 / F3 / F4 / F5（5/6 项绿灯）
❌ **必须等 M2**：F6

**额外建议**：F2 加项目过滤时，service 字段名直接用 `allowedProjectCodes`（本
设计已定型），不要复用旧 finance-v2 自定义命名——避免 W3 收口与 W5 二次切换。

---

## 8. 决议

### 8.1 总评：🟡 有条件通过

**通过理由**：

1. L1-L5 主轴清晰（法人 / 经营 / 地点 / 业务单元 / 部门）；
2. 五字段对采购 / 销售 / 库存 / 财务 / 权限的覆盖度足够（仅工作流部门/BU 路由
   是治理欠债，不阻塞）；
3. W4 有"无歧义子集"可放行（§4 推荐的最小集）；
4. ERP / Finance 多数任务可在不等主数据 M1-M3 落地的情况下并行启动；
5. 与 PROJECT_COMMAND_CENTER §5 和 CLAUDE.md（entity 对齐 / 唯一约束 / 迁移
   红线）一致。

**条件**：

| # | 条件 | 截止时点 |
|---|---|---|
| 1 | 设计 §10 列出的 7 项全部由用户拍板 | W4-late 启动前 |
| 2 | 本评审 §5.2 新增 4 项澄清（C-1 / C-2 / C-3 / shareholder scope）写入 M1 / M2 / M3 | M-文档定稿前 |
| 3 | M1 / M2 / M3 / M4 / M5 五份子文档全部出稿并被各 Agent 评审 | W5 启动前 |
| 4 | W4 落地的迁移严格限定为 §4 "最小可放行集" | W4 PR 评审时 |
| 5 | `biz_site_projects` 与 `biz_projects.site_code` 双源决策（§3.2）写入 M2 | W4 之前 |
| 6 | shareholder scope 是否参与 sys_user_scopes 合表（§3.3-a）明文 | W7 启动前 |
| 7 | `scripts/check-master-data-references.mjs` 验收脚本上线 | W4 PR 合入前 |

**未满足任一条件 = W4 不放行**。

### 8.2 与 MULTI_AGENT_PHASE2_PLAN 的对接调整

- §5 闭环顺序保持不变（Step 1 Audit R0 → Step 3 Architect 方案 → Step 4 Finance
  CLS → Step 6 biz_site_aliases seed → Step 7 ERP store_code）。
- 在 Step 6 与 Step 7 之间插入"M1/M2/M3 文档定稿 + 用户拍板"硬关卡。
- W4 拆为 **W4-early（§4 最小集）** + **W4-late（M1/M2 拍板后再上）**。
- Finance W3 / W5 可与 Architect W2 / W4 并行，不必串行等。
- ERP E5 / E6 可与 Architect W2 并行（独立改造）。

### 8.3 跨 Agent 协同清单

| 协同点 | 主 Agent | 协 Agent | Audit 角色 |
|---|---|---|---|
| 五字段引用契约（§3.1 / §3.3） | Architect | ERP / Finance | 验 service 引用一致性 |
| `sys_user_scopes` 合表登录链路灰度 | Architect | Audit | 必须出验收脚本对比新旧并集差异 |
| RBAC 元数据补充（如 `MENU_SYS_ORG`、`MENU_BIZ_PROJECT`） | Audit | Architect | 主导 |
| shareholder 模块跨边界 | Architect | Finance | 双签 |
| 验收脚本 `check-master-data-references.mjs` | Architect 出 | Audit 接入 CI red-line | 接入 |

### 8.4 风险监测点（Audit 后续每 wave 跑）

- ✅ `node scripts/check-master-data-references.mjs`：业务表使用的 code 字段是否落 canonical。
- ✅ `node scripts/check-public-controllers.mjs`：主数据相关 controller 是否裸奔（与 Audit W1 红线同源）。
- ✅ `bash scripts/check-entity-drift-baseline.sh`：每个 wave 后跑，确保 entity↔DB 漂移不增。
- ✅ `node scripts/check-nullable-in-unique.js`：sys_user_scopes / biz_site_projects 多列 PK 必须 NOT NULL。
- ✅ `bash scripts/g5c-rbac-audit.sh`：每个动登录链路的 wave 后跑。

---

**评审完毕。建议 Architect Agent 优先输出 M2 与 M3 子文档（这两份是 W4-late /
W5 / W6 的瓶颈），M1 / M4 / M5 可与之并行。Finance Agent 可立即启动 F1 / F2 /
F3 / F4 / F5。ERP Agent 可立即启动 E3 / E5 / E6，并行做 E1 / E2 / E4 / E7 的
草稿工作。**
