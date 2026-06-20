# M2 · Project Consolidation 项目主数据收口

> Architect / MasterData Agent（feature/agent-architect-masterdata）
> 日期：2026-06-20
> 阶段：M2 子文档（W5 启动前置）
> 上游：
> - `docs/M1_ORGANIZATION_MODEL.md` v2.0（架构冻结，含 C-4 / C-5 / C-7 决策）
> - `docs/M1_ORGANIZATION_MODEL_CHANGELOG.md`
> - `docs/M1_DECISIONS_AUDIT.md`（审计 §6 允许启动 M2）
> - `docs/WAVE1_ACCEPTANCE_REVIEW.md`（漂移基线 prc2_projects 6 hit / shr_projects 6 hit）
> - `docs/MASTER_DATA_PHASE2_DESIGN.md` §5.3 / §5.4（W5/W6 biz_projects 扩列 + shr_projects 退化）
>
> 本文件**只做方案**，不写代码、不动 migration、不动业务流程。M2 是
> M1 §4 + §5 + §11 在 project 维度上的工程化落地计划，约束力**仅次于** M1。
> 任何业务 service 实施与本文件冲突需先回到本文件评审更新。

---

## 0. 速读

| 维度 | 决议 |
|---|---|
| 唯一 canonical | `biz_projects`（不可逆，无替代） |
| `prc2_projects` 处置 | W8 service 切表至 biz_projects；entity / 数据保留至 W10+ 评估退役（**不删表**） |
| `shr_projects` 处置 | W6 RENAME TO `shr_project_attrs` + FK → biz_projects；视图兼容期 ≥ 1 wave |
| `sys_organizations.org_type='PROJECT'` 占位行 | M1 §4.2 C-7：保留 + 只读化 + UPDATE 白/黑名单 |
| 字段引用规则 | `project_code` 单一主键；`company_code` 单一法人；`site_code` 桥表多对多；`bu_code` 横切汇总 |
| 命中清单 | prc2_projects 6 hit（4+1+1）/ shr_projects 6 hit（1+1+2+2）+ 白名单内 5 处写入端点（W6+ 切换） |
| 模块迁移边界 | ERP 主切 workflow.byProjectManager；Finance 复审 F2 项目过滤；Workflow 切 biz-registry；Shareholder 切 capital-aggregation；Architect 主导主数据 |
| W5 可执行 | biz_projects 扩 5 列 nullable + 数据回填 + 文档承诺 + 漂移基线对账 |
| W6 冻结 | shr_projects → shr_project_attrs RENAME + FK；service 切换；data-quality 配置更新 |
| W7 后置 | 无 M2 项；W7 是 sys_user_scopes 合表，与 M2 解耦 |
| W8 后置 | workflow.byProjectManager 真正切表；approval-engine biz-registry 替换；prc2_projects 退役评估 |

---

## 1. biz_projects 作为唯一 project 主表 —— 最终定义

### 1.1 主权宣言

```
biz_projects 是凤凰 ERP 唯一的项目主数据 canonical 表。

  - 所有 project_code 的"建档 / 命名 / 状态机 / 删除归档"必须经它
  - 所有业务表的 project_code 字段必须能在 biz_projects 中找到对应行
  - prc2_projects 与 shr_projects 在 W8 / W6 后分别退化为"读取代理"
    或被 RENAME；它们不再产生新的 project_code
  - sys_organizations(org_type='PROJECT') 是 org 树占位,M1 §4.2 C-7
    保留 + 只读化;canonical 写入永远在 biz_projects
```

### 1.2 字段清单（W5 扩列完成后的目标态）

| 字段 | 类型 | NOT NULL | 来源 | 说明 |
|---|---|---|---|---|
| `id` | bigint PK | ✅ | — | 内部 ID |
| `project_code` | varchar(64) UNIQUE | ✅ | 手填 / 主数据中心 | 唯一标识；命名 `PRJ_{SITE}_{SCOPE}`（M1 §4.3） |
| `project_name` | varchar(128) | ✅ | 手填 | 中文名 |
| `project_short_name` | varchar(64) | ❌ | 手填 | 简称 |
| `company_code` | varchar(64) | ✅ | CompanySelector | C-4 ACTIVE 后不可变；C-5 单一 |
| `project_type` | varchar(32) | ❌ | DictSelect (PRJ_TYPE) | 蛋鸡 / 肉鸡 / 食品 / 有机肥 / 综合 |
| `budget_amount` | numeric | ❌ | 手填 | 预算金额 |
| `budget_currency` | varchar(8) | ❌ | DictSelect (SYS_CURRENCY) | 预算币种 |
| `start_date` / `end_date` | date | ❌ | 手填 | 起止时间 |
| `manager_name` | varchar(64) | ❌ | 手填 | 项目负责人姓名（显示用） |
| `status` | varchar(16) | ✅ DEFAULT 'DRAFT' | 状态机 | M1 §4.5 六态 |
| `remark` | text | ❌ | 手填 | 备注 |
| `created_at` / `updated_at` | timestamptz | ✅ | — | 审计 |
| **W5 扩列以下 5 项**（按母规划 §5.3） | | | | |
| `project_manager_user_id` | bigint | ❌ | UserSelector | 工作流 byProjectManager 数据源；W8 起 approval-engine 切此列 |
| `site_code` | varchar(64) | ❌ | SiteSelector（M1 §5） | 单 site 项目快捷字段；与 biz_site_projects 桥表关系详 §3.3 |
| `capital_status` | varchar(32) | ❌ | DictSelect (SHR_CAPITAL_STATUS) | 从 shr_projects 迁移 |
| `equity_status` | varchar(32) | ❌ | DictSelect (SHR_EQUITY_STATUS) | 从 shr_projects 迁移 |
| `is_shareholder_managed` | boolean | ❌ DEFAULT false | 派生 | 标记项目是否需要股东视角；从 shr_projects 存在性反推 |

### 1.3 状态机（与 M1 §4.5 一致，重申）

```
DRAFT → PENDING_APPROVAL → ACTIVE
             ↓                ↓
         REJECTED ⇄ DRAFT   FROZEN ⇄ ACTIVE
                              ↓        ↓
                           ARCHIVED (单向不可逆)
```

- `ARCHIVED → ACTIVE` 永禁（M1 §13.1）；业务重组走"新建项目"（M1 §4.1 C-4 SOP）
- DRAFT / REJECTED 阶段允许改 company_code；ACTIVE / FROZEN / ARCHIVED 不可改

### 1.4 与主数据中心的集成

- `master-data-runtime.service.ts` TYPES.project 已指向 `biz_projects`（无需改）
- approval 流程：`BIZ_TYPE.project = 'MD_PROJECT_CREATE'`（G3-B / G92 已就位）
- Selector：`ProjectSelector` 调 `/api/biz/projects/active`（M1 §3.2）
- governance / operations / references 三服务对 project 类型的统计已正确（W4 落地后）

---

## 2. prc2_projects / shr_projects / sys_organizations.PROJECT 占位行 处置策略

### 2.1 总体决议

| 表 / 行 | 当前角色 | W5 状态 | W6 状态 | W7 状态 | W8 状态 | W10+ 评估 |
|---|---|---|---|---|---|---|
| `biz_projects` | canonical | 扩 5 列 + 数据回填 | 服务消费扩列 | 不动 | byProjectManager 切此 | canonical 永久 |
| `prc2_projects` | 工作流注册表读 / AP 流水 entity | 不动 | 不动 | 不动 | service 切走（assignment-resolver / workflow-biz-registry） | 评估是否 DROP TABLE |
| `shr_projects` | 股东模块独立表 + master-data operations 误用 | 不动 | RENAME TO `shr_project_attrs` + 视图兼容 + FK → biz_projects | 视图退役 | 不动 | 永久保留 attrs |
| `sys_organizations(org_type='PROJECT')` | org 树占位 | 不动（status 各自延续） | type_rules service 接入硬阻新建 | 不动 | 不动 | 永久保留只读占位 |

### 2.2 prc2_projects 处置详情

**当前角色**：
- 历史"采购项目"表，G86 起被 biz_projects 取代
- entity `prc2-project.entity.ts` 仍声明，service 仍 query
- workflow.assignment-resolver.byProjectManager 读 `prc2_projects.project_manager_user_id`
- approval-engine workflow-biz-registry 把 PROJECT 业务对象的 `tableName` 写为 `prc2_projects`
- master-data-references 把项目引用图标的 refTable 写为 `prc2_projects`

**W5 处置**：
- ❌ 不动 schema、不动数据、不删 entity、不切 service
- ✅ 仅扩 biz_projects 5 列（同时把 `project_manager_user_id` 从 prc2_projects 同步过来，详 §6）
- ✅ 文档承诺 W8 切表

**W6 处置**：保持现状（W6 是 shr_projects 改造 wave，prc2_projects 不在范围）

**W8 处置**（关键 wave）：
- workflow.assignment-resolver.byProjectManager service 改读 `biz_projects.project_manager_user_id`
- approval-engine/workflow-biz-registry.service.ts:259-262 的 `tableName / mdAuditHook` 全部替换为 `biz_projects`
- master-data/master-data-references.service.ts:108 refTable 替换为 `biz_projects`
- master-data/master-data-runtime.service.ts:73 删除"prc2_projects 为被取代的空表"注释，留命名记录

**W10+ 评估**：
- 业务真实使用归零后（无 service query / 无前端调用 / 无报表引用），评估是否
  `DROP TABLE prc2_projects`
- 此为永久候选项，不强制；保留也无运行时损耗

### 2.3 shr_projects 处置详情（M2 主战场）

**当前角色**：
- 股东模块（shareholder）独立项目表，含 `capital_status` / `equity_status` 状态字段
- `shr_capital_contributions` / `shr_project_equity` / `shr_beneficial_equity` 均 FK 到此
- shareholder/capital-aggregation.service.ts:35,46 直接 UPDATE / FROM `shr_projects`
- 跨域误用：master-data/operations.service.ts:56,169 把 `shr_projects` 当作 project 主表读
- data-quality 配置把 `shr_projects` 列入 11 张主表健康监控
- product-master/lookup.controller.ts:198,209 通过 `shr_project_equity → shr_projects.company_code` 派生投资关系

**W5 处置**：
- ❌ 不动 schema、不动数据、不切 service
- ✅ 扩 biz_projects 5 列中的 `capital_status` / `equity_status` / `is_shareholder_managed` —— 来源即 shr_projects
- ✅ 数据回填：把 shr_projects 独有的 project_code（即 biz_projects 中不存在的）逐条 INSERT 进 biz_projects（status='ACTIVE'，业务方拍板）
- ✅ master-data/operations.service.ts:56,169 改读 biz_projects（**修 W4 已知问题**，本次不动业务流程仍记入 §6.2 替换清单）
- ✅ 文档承诺 W6 RENAME

**W6 处置**（关键 wave）：
- `shr_projects` RENAME TO `shr_project_attrs`
  - 保留全部现存列；不删任何字段
  - `shr_project_attrs.project_code` FK → `biz_projects(project_code)`
- CREATE VIEW `shr_projects` AS SELECT * FROM `shr_project_attrs`（兼容期 ≥ 1 wave，本 wave 旧 service 仍走视图）
- shareholder/capital-aggregation.service.ts 改读"`biz_projects` LEFT JOIN `shr_project_attrs`"组合查询：
  - 主信息（project_code / project_name / company_code / status）来自 biz_projects
  - 资本附加（capital_status / equity_status）来自 shr_project_attrs
- shareholder/entities/shr-project.entity.ts 改 `@Entity('shr_project_attrs')`
- data-quality/code-governance.service.ts:40 + master-data-health.service.ts:27,52 配置改为 `biz_projects`
- product-master/lookup.controller.ts:198,209 JOIN 改 `biz_projects`（投资关系派生不影响 = company_code 在两表同值）

**W7 处置**：兼容视图 `shr_projects` DROP；service 走最终态

**W8 处置**：保持稳定

### 2.4 sys_organizations(org_type='PROJECT') 占位行处置

完全继承 M1 §4.2 C-7 决议：

| 项 | 决策 | 实施波次 |
|---|---|---|
| 现存占位行 | 保留 | W5 不动 |
| 新建占位行 | 永禁 | W6 type_rules service 接入硬阻；W5 软警告 |
| 物理 DELETE | 永禁 | 永远 |
| UPDATE 白名单 | `status` / `org_name` / `org_name_cn` / `org_short_name` / `manager_user_id` / `manager_name` / `remark` / `sort_order` | M1 §4.2 已明文 |
| UPDATE 黑名单 | `org_code` / `parent_id` / `company_code` / `org_type` / `level` / `path` | M1 §4.2 已明文 |
| canonical 主权 | 永远在 `biz_projects` | 永远 |

**注**：M2 不要求把现存占位行的 manager_user_id 同步到 biz_projects.project_manager_user_id；
两套 manager 字段允许并存。biz_projects.project_manager_user_id 是 W8 后工作流的
唯一数据源；占位行的 manager_user_id 仅作 org 树展示。

---

## 3. project_code / company_code / site_code / bu_code 引用规则

### 3.1 字段语义（重申 M1 §1.3）

| 字段 | 语义 | canonical | 业务表必填 |
|---|---|---|---|
| `project_code` | 经营核算单元 | `biz_projects.project_code` | 多数业务表（视业务） |
| `company_code` | 法人主体 | `sys_organizations(COMPANY).org_code` | AP/AR/Cash/Bank/PR/PO/SO 全部必填 |
| `site_code` | 物理地点 | `sys_organizations(SITE).org_code` | 库存 / 生产 / 门店 / 收货地必填 |
| `bu_code` | 横切汇总 | `biz_business_units.bu_code` | 仅 BI 表使用 |

### 3.2 业务表里 project_code 写入规则

| 模块 | project_code 必填 | 选填 | 不挂 |
|---|---|---|---|
| 采购 PR / PO / 收货 / 付款 | ❌ | ✅（业务发生时挂） | — |
| 销售 SO / 配送 / 退货 / 收款 | ❌ | ✅ | — |
| 库存 inv_batches / wms_inbound / wms_outbound | ❌ | ✅（B/S 关联到项目时挂） | 默认不挂 |
| 财务 AP / AR / Cash / Bank / 报销 | ❌ | ✅（项目核算时挂） | — |
| 财务费用申请 (fin_expense_*) | ❌ | ✅（项目成本归集时挂） | — |
| 股东出资 (shr_capital_contributions) | ✅ 必填 | — | — |
| 工作流 wf_instance | ❌ | ✅（按业务表派生） | — |

> 注：可空允许的核心理由 = 部分单据（如集团总部费用 / 通用采购）不归属
> 任何项目。Finance F2 当前过滤策略 `(project_code IS NULL OR project_code
> = ANY(...))` 是过渡兼容（WAVE1_REVIEW §2.2 观察）；W6+ 历史回填后可升级
> 严格 ANY。M2 不改 F2 策略，只承诺 biz_projects 是唯一可被引用的 project
> 主表。

### 3.3 site_code × project_code 关系（M1 §5.5 重申 + C-5 强化）

```
桥表: biz_site_projects(site_code, project_code, weight_pct, is_primary)
快捷: biz_projects.site_code (W5 新增 nullable)

  一个 SITE 可服务 N 个 project (跨多公司允许)
  一个 PROJECT 可覆盖 N 个 SITE (但只挂一个 COMPANY, C-5)

  写入权威: 桥表 is_primary=true 那一行
  biz_projects.site_code: 冗余冷字段, service 只读不写, 不参与查询过滤
```

**约束**（C-5 决策的桥表表达）：
- biz_site_projects 中允许"两个 project（属不同 company）共享同一 site"
- 但 biz_projects 中每行 project 仍单挂一个 company_code
- 这是合法的"跨公司经营同一地点"（如万象总仓服务 AGRI + FOOD 各自 project）

### 3.4 bu_code × project_code 关系

```
biz_business_units (bu_code, ...)
biz_bu_membership  (bu_code, org_code, org_type, weight_pct, is_primary)
                    org_type 可以是 COMPANY / SITE / DEPARTMENT

  → project 不直接挂 BU
  → project 通过 company_code → biz_bu_membership(org_type=COMPANY) → bu_code
```

**实施承诺**：BI 报表按 BU 维度汇总时，走 `biz_projects.company_code →
biz_bu_membership` 路径派生。M2 不增加 `biz_projects.bu_code` 列（避免双源）。

### 3.5 字段在业务表中的命名约定

```
读路径(选择器):
  ProjectSelector       → /api/biz/projects/active?companyCode=X
  CompanySelector       → /api/org/organizations?type=COMPANY
  SiteSelector (M1)      → /api/org/sites/active?type=Y&companyCode=X
  WarehouseSelector     → /api/crud/wms_warehouses?companyCode=X
  BusinessUnitSelector  → /api/business-units (新增,可选)

写路径(业务表列):
  project_code  (varchar 64)  — 引用 biz_projects.project_code
  company_code  (varchar 64)  — 引用 sys_organizations(COMPANY).org_code
  site_code     (varchar 64)  — 引用 sys_organizations(SITE).org_code
  warehouse_code (varchar 64) — 引用 wms_warehouses.warehouse_code (M1 §6)
  bu_code       (varchar 64)  — 仅 BI 表

禁止:
  ❌ project_name / project_short_name 作为关联键
  ❌ project_id (bigint) 作为业务表 FK (新代码禁,W6 起整顿)
  ❌ 任何其它 *_code 形态 (如 proj_code / prj 等)
```

---

## 4. ACTIVE 后 company_code 不可变规则（C-4 强化）

### 4.1 规则定义

完全继承 M1 §4.1 C-4 决议。本节给 M2 实施细则。

| 状态 | company_code 可改 | 实施层 |
|---|---|---|
| DRAFT | ✅ | UI 允许编辑（默认） |
| PENDING_APPROVAL | ✅（审批人退回 DRAFT 后） | 流程退回机制 |
| ACTIVE | ❌ | ① service update 拒；② DB trigger 兜底 |
| FROZEN | ❌ | 同上 |
| ARCHIVED | ❌ | 同上 |
| REJECTED | ✅（重新提交前） | UI 允许 |

### 4.2 service 层实施（W5）

`master-data-runtime.service.ts` 的 project 类型 update path：
```
- 在已实现的"keyFields 关键字段审批"机制基础上,
  加一条"如果当前 status ∈ {'ACTIVE','FROZEN','ARCHIVED'}
  且写入 payload 含 company_code 且 ≠ 原值 → 抛 400 业务错误"
- 错误码: 'MD_PROJECT_COMPANY_IMMUTABLE'
- 错误文案: '项目处于 X 状态,不可更改归属公司;
            如需业务重组,请新建项目并归档当前项目'
```

### 4.3 DB trigger 兜底（W5 末）

```
BEFORE UPDATE OF company_code ON biz_projects
  WHEN OLD.status IN ('ACTIVE','FROZEN','ARCHIVED')
       AND NEW.company_code IS DISTINCT FROM OLD.company_code
  → RAISE EXCEPTION 'biz_projects.company_code is immutable when status=%',
                    OLD.status
```

- 由 Architect 在 W5 末以 TS 迁移落 trigger
- 必含 down()（DROP TRIGGER）
- DDL 在本文件不出 SQL（按约束）；M2 仅承诺规则，迁移文件由后续 commit 落

### 4.4 业务重组 SOP（M1 §4.1 重申）

```
1. 旧项目 PRJ_X status → 'ARCHIVED'
   - 所有历史 AP/AR/Cash 流水保持原 company_code (永不可改)
2. 新建项目 PRJ_X_V2 (或新命名)
   - company_code = 新法人
3. 历史报表合并: BI 层走"项目族关联"(远期数据湖 §14.6)
```

### 4.5 例外应急

若发现历史 ACTIVE 项目已有错误 company_code（罕见）：
- 由 Architect 走单独应急 PR + Audit + 业务方三方签字
- 应急流程**不**自动化、**不**给端点；必须人工拍板 + 审计落 sys_audit_log

---

## 5. PROJECT 必属唯一 COMPANY 规则（C-5 强化）

### 5.1 规则定义

完全继承 M1 §3.2 / §4.1 / §5.5 C-5 决议。

```
∀ project p ∈ biz_projects:
  |{c : c = p.company_code}| = 1  ← 单一,非空

跨法人经营场景的合规做法:
  1) 多 project 并存: 每法人各建独立 project (各自核算)
  2) BU 横切汇总: biz_business_units + biz_bu_membership
  3) site 共享: biz_site_projects 桥表允许多公司 project 共享同一 site
```

### 5.2 schema 实施

- `biz_projects.company_code` NOT NULL（W4 已 g198 入框，prc2_projects 同步）
- 不为"多公司项目"留 schema 扩展位（无 company_codes[] 等数组列）
- W5 扩列方案中明文承诺"company_code 单值"

### 5.3 service 实施

- master-data-runtime project 类型 create / update DTO 强制 `companyCode` 为单值
  字符串，**永禁** `companyCodes: string[]` 入参
- 任何 PR 出现 `biz_projects` 与多个 `company_code` 关联 = 拒合

### 5.4 例外应急

无。多法人合资 project 永禁，例外走扩展评审（M1 §15.2）。

### 5.5 W5 验收脚本

```
扫描违反 C-5 的现存行:
  SELECT project_code, COUNT(DISTINCT company_code)
    FROM biz_projects
   GROUP BY project_code
   HAVING COUNT(DISTINCT company_code) > 1
   -- 期望 0 行

  同时核 prc2_projects (W8 切表前自查):
  SELECT project_code, COUNT(DISTINCT company_code)
    FROM prc2_projects
   GROUP BY project_code
   HAVING COUNT(DISTINCT company_code) > 1
   -- 期望 0 行 (W4 g198 已 NOT NULL '')
```

由 Architect 在 W5 第 1 天跑；非零 → 业务方拍板拆项目（不允许偷偷改）。

---

## 6. 12 hit 替换清单（漂移基线归零的路径图）

> 本节是 M2 的工程化心脏。基于 W4 `check-master-data-references.mjs` 实跑
> 输出，逐行列出"何时替换、改成什么、风险等级"。

### 6.1 prc2_projects 6 hit（白名单外）替换清单

| # | 文件:行 | 现状 | 替换为 | 实施 wave | 风险 |
|---|---|---|---|---|---|
| P-1 | `approval-engine/workflow-biz-registry.service.ts:258` | 注释 `// FIX UAT-P0-Phase1 2026-06-04: 实际表名 prc2_projects（shr_projects 不存在）` | 改为 `// 2026-Wxx: PROJECT 主数据切到 biz_projects（M2 落地）；shr_projects 已 RENAME shr_project_attrs（W6）` | W8 | 🟢 注释 |
| P-2 | `approval-engine/workflow-biz-registry.service.ts:259` | `tableName: 'prc2_projects'` | `tableName: 'biz_projects'` | W8 | 🟡 影响 PROJECT 业务对象的 workflow 注册；切换时审批历史需对齐 |
| P-3 | `approval-engine/workflow-biz-registry.service.ts:261` | `onApproved: mdAuditHook('PROJECT', 'prc2_projects', ...)` | `onApproved: mdAuditHook('PROJECT', 'biz_projects', ...)` | W8 | 🟡 审计 hook 表名 |
| P-4 | `approval-engine/workflow-biz-registry.service.ts:262` | `onRejected: mdAuditHook('PROJECT', 'prc2_projects', ...)` | `onRejected: mdAuditHook('PROJECT', 'biz_projects', ...)` | W8 | 🟡 同上 |
| P-5 | `master-data/master-data-references.service.ts:108` | `{ refTable: 'prc2_projects', refDocType: '项目', fkColumn: 'company_code', ... }` | `{ refTable: 'biz_projects', refDocType: '项目', fkColumn: 'company_code', ... }` | W8（紧接 P-2~P-4） | 🟢 引用图谱配置 |
| P-6 | `master-data/master-data-runtime.service.ts:73` | 注释 `//   prc2_projects 为被取代的空表，前端 procurement2/projects 已重定向主数据中心）` | 改为 `//   prc2_projects W8 已退役为只读;前端 procurement2/projects 走主数据中心 biz_projects` | W8 | 🟢 注释 |

**白名单内的 prc2_projects 写入端点**（W8 也必须切，列在此作为完整图）：

| # | 文件:行 | 现状 | 替换为 | 实施 wave |
|---|---|---|---|---|
| P-W1 | `workflow/assignment-resolver.service.ts:203` | `SELECT project_manager_user_id, project_manager_name FROM prc2_projects ...` | `SELECT project_manager_user_id, project_manager_name FROM biz_projects ...` | W8（**关键切换**，依赖 W5 扩列已落 + 数据回填） |
| P-W2 | `procurement-v2/entities/prc2-project.entity.ts` | `@Entity('prc2_projects')` + 全部 column | 保留 entity 声明（只读用）；W10+ 评估是否 deprecate | W10+ |

### 6.2 shr_projects 6 hit（白名单外）替换清单

| # | 文件:行 | 现状 | 替换为 | 实施 wave | 风险 |
|---|---|---|---|---|---|
| S-1 | `approval-engine/workflow-biz-registry.service.ts:258` | 注释（同 P-1） | 同 P-1 更新 | W8 | 🟢 |
| S-2 | `data-quality/code-governance.service.ts:40` | `{ domain: 'PRJ', table: 'shr_projects', field: 'project_code', pattern: '^[A-Z][A-Z0-9_-]+$' }` | `{ domain: 'PRJ', table: 'biz_projects', field: 'project_code', pattern: '^PRJ_[A-Z][A-Z0-9_]+$' }`（含命名规范收紧） | W6 | 🟢 数据质量配置 |
| S-3 | `data-quality/master-data-health.service.ts:27` | 注释 `* 监控 11 张主表：customer_master / supplier / shr_projects / shareholders / product_skus /` | 改为 `... customer_master / supplier / biz_projects / shareholders / product_skus / ...` | W6 | 🟢 注释 |
| S-4 | `data-quality/master-data-health.service.ts:52` | `{ tbl: 'shr_projects', codeField: 'project_code', nameField: 'project_name', extra: [] }` | `{ tbl: 'biz_projects', codeField: 'project_code', nameField: 'project_name', extra: ['manager_name','project_manager_user_id'] }` | W6 | 🟡 健康检查表切换；新增 extra 列依赖 W5 扩列 |
| S-5 | `product-master/controllers/lookup.controller.ts:198` | 注释 `* （shr_project_equity → shr_projects.company_code 派生，权威投资关系）。` | 改为 `* （shr_project_equity → biz_projects.company_code 派生，权威投资关系；W6 后 shr_projects 已退化为 shr_project_attrs 视图）。` | W6 | 🟢 注释 |
| S-6 | `product-master/controllers/lookup.controller.ts:209` | `JOIN shr_projects p ON p.project_code = e.project_code` | `JOIN biz_projects p ON p.project_code = e.project_code` | W6 | 🟢 投资关系派生（company_code 在两表同值） |

**白名单内的 shr_projects 写入端点**（W6 RENAME 时必须切，否则视图也跑不通）：

| # | 文件:行 | 现状 | 替换为 | 实施 wave |
|---|---|---|---|---|
| S-W1 | `shareholder/services/capital-aggregation.service.ts:35` | `UPDATE shr_projects SET ... WHERE project_code = $1` | 改读 biz_projects（如更新主项目）或改 `shr_project_attrs`（如更新资本附加）；视字段而定 | W6 |
| S-W2 | `shareholder/services/capital-aggregation.service.ts:46` | `FROM shr_projects p` | `FROM biz_projects p LEFT JOIN shr_project_attrs a USING (project_code)` | W6 |
| S-W3 | `shareholder/entities/shr-project.entity.ts` | `@Entity('shr_projects')` | `@Entity('shr_project_attrs')` + 字段清单调整（只留资本/股权附加字段） | W6 |
| S-W4 | `master-data/operations.service.ts:56` | `{ type: 'project', table: 'shr_projects', codeCol: 'project_code', ... }` | `{ type: 'project', table: 'biz_projects', codeCol: 'project_code', ... }` | **W5**（修 W4 已知问题，本 wave 可加法修） |
| S-W5 | `master-data/operations.service.ts:169` | `SELECT ... FROM shr_projects WHERE project_code ILIKE $1 OR project_name ILIKE $1 LIMIT 5` | `SELECT ... FROM biz_projects WHERE project_code ILIKE $1 OR project_name ILIKE $1 LIMIT 5` | **W5**（同 S-W4） |

> 注：S-W4 / S-W5 在 master-data 模块（Architect 责任域），W5 期间可与扩列
> 同 wave 落，不需要等 W6；这是 M2 唯一允许 W5 修 service 行为的两处。

### 6.3 漂移基线对账目标

| Wave | prc2_projects hit | shr_projects hit |
|---|---|---|
| W4 基线 | 6 | 6 |
| W5 末 | 6（不动）| 4（S-W4 + S-W5 修） |
| W6 末 | 6（不动）| 0（S-1 ~ S-6 + S-W1 ~ S-W3 全切，视图兜底）|
| W7 末 | 6（不动）| 0（视图删，service 走最终态）|
| W8 末 | 0（P-1 ~ P-6 + P-W1 全切）| 0 |
| W10+ | 0 + 评估 DROP TABLE | 0 |

漂移基线脚本（`check-master-data-references.mjs`）输出按此对账。

---

## 7. ERP / Finance / Workflow / Shareholder 模块迁移边界

### 7.1 模块责任矩阵

| 模块 | M2 责任范围 | 主责 Agent | 协 Agent | 实施 wave |
|---|---|---|---|---|
| **Architect / Master Data** | biz_projects 扩列方案；数据回填脚本；master-data-runtime / governance / operations / references service 改造；TS 迁移；W6 shr_projects → shr_project_attrs DDL；漂移脚本对账 | Architect | Audit 评审 | W5 / W6 / W8 |
| **ERP Business** | workflow.assignment-resolver.byProjectManager service 切表（W8）；approval-engine workflow-biz-registry 替换（W8）；procurement-v2 entity 评估（W10+） | ERP | Architect 出 DDL；Audit 协议审批历史 | W8 / W10+ |
| **Finance** | F2 项目过滤策略（NULL OR ANY → 严格 ANY 评估，W6+）；fin_shareholder_* 与 shr_capital_contributions 主权关系（F6 文档，独立 wave）| Finance | Architect | W6 评估；F6 后置 |
| **Workflow** | 工作流业务对象 PROJECT 注册表替换；mdAuditHook 表名替换；审批历史完整性核验 | ERP（workflow 在 ERP 责任域，PLAN §2.3）| Architect | W8 |
| **Shareholder** | capital-aggregation.service 改读 biz_projects + shr_project_attrs；entity RENAME；shr_capital_contributions 主权（独立 F6 评估）| Architect 主 + Finance 协（M1 §11.5 跨域 + 母规划 §6.4 双签）| ERP 不介入 | W6 |
| **Data Quality** | code-governance / master-data-health 配置替换 | Architect（data-quality 在 Architect 主数据治理域）| Audit | W6 |
| **Product Master** | lookup.controller 投资关系派生 JOIN 替换 | Architect（product-master 主数据域）| ERP 评审无销售影响 | W6 |

### 7.2 跨域协同点

| 协同点 | 触发 wave | 协同方式 |
|---|---|---|
| W5 biz_projects 数据回填涉及 shr_projects 独有 project_code | W5 | Architect 出迁移 + 业务方拍板每条 INSERT；Audit 复审 |
| W6 shr_projects RENAME 涉及 shareholder service | W6 | Architect 主 + Finance 复审 fin_shareholder_* 不破坏；双签 |
| W8 workflow.byProjectManager 切表 | W8 | ERP 主 + Architect DDL 评审 + Audit 核审批历史 |
| W8 approval-engine 业务对象注册表替换 | W8 | ERP 主 + Architect 评审 PROJECT 类型在主数据中心的注册一致性 |
| F2 项目过滤策略升级（NULL → 严格）| W6+ | Finance 主 + Architect 跑 biz_projects 回填完成度对账 |

### 7.3 不影响的模块（M2 不触）

- **采购 procurement-v2 业务流**（PR / PO / 收货 / 付款）：仅 entity 声明保留；service query 路径不变（W10+ 评估）
- **销售 sales-v2**：无项目主数据依赖
- **库存 wms / inv_***：无项目主数据依赖
- **门店 store / store-pos**：无项目主数据依赖
- **POS**：无
- **chanjet / 用友**：好业财与 biz_projects 不连接（CLAUDE.md §0.6 隔离）
- **RBAC / permissions / permission-sets**：无项目主数据依赖

---

## 8. W5 可执行 / W6 冻结 / W7 / W8 后置项

### 8.1 W5 可执行项（Architect 出 PR；不动业务流程）

| 项 | 类型 | 责任 |
|---|---|---|
| W5-A1 本 M2 文档评审通过 + 合入 main | docs | Architect → Audit → 用户 |
| W5-A2 biz_projects 扩 5 列 TS 迁移（nullable，全部 ADD COLUMN） | TS migration | Architect；含 down() DROP COLUMN |
| W5-A3 biz_projects 数据回填：shr_projects / prc2_projects 独有 project_code → INSERT biz_projects（带 `@allow-data-dml` 标记） | TS migration（独立文件） | Architect；业务方拍板每条；ON CONFLICT DO NOTHING 幂等 |
| W5-A4 biz_projects.project_manager_user_id 数据回填：从 prc2_projects.project_manager_user_id 同步 | 同上迁移 | Architect |
| W5-A5 biz_projects.capital_status / equity_status / is_shareholder_managed 回填：从 shr_projects 同步 | 同上 | Architect |
| W5-A6 ACTIVE 后 company_code 不可变 service update path 校验 | service 改 | Architect（master-data-runtime/project 类型） |
| W5-A7 ACTIVE 后 company_code 不可变 DB trigger | TS migration | Architect；含 down() DROP TRIGGER |
| W5-A8 master-data/operations.service.ts:56,169 改读 biz_projects（S-W4 / S-W5）| service 改 | Architect |
| W5-A9 跑漂移脚本基线对账（期望 shr_projects 6 → 4）| 验收 | Audit |
| W5-A10 C-5 唯一公司违规扫描（§5.5）| 验收 | Architect + 业务方 |

### 8.2 W6 冻结项 → 解锁条件

| 项 | 当前状态 | 解锁条件 |
|---|---|---|
| shr_projects RENAME TO shr_project_attrs | 🔴 冻结 | W5-A2 ~ A5 全部上线 + Audit 复核漂移脚本 4 hit + Finance 复审 fin_shareholder_* 安全 |
| shr_project_attrs.project_code FK → biz_projects | 🔴 冻结 | 上一步完成 + 数据无脏项（无 project_code 在 attrs 但不在 biz） |
| CREATE VIEW shr_projects (兼容) | 🔴 冻结 | RENAME 落地后才能建视图 |
| shareholder/capital-aggregation.service 改 | 🔴 冻结 | 视图就位后 |
| shareholder/entities/shr-project.entity 改 @Entity name | 🔴 冻结 | service 改完 + tsc 0 error |
| data-quality 配置改 biz_projects | 🔴 冻结 | RENAME 落地 |
| product-master/lookup.controller JOIN 改 | 🔴 冻结 | RENAME 落地（与 data-quality 同 wave）|
| Finance F2 严格策略评估 | 🟡 评估 | 不强制 W6；W6+ 业务方拍板 |

### 8.3 W7 后置项

**M2 在 W7 无项目**。W7 是 sys_user_scopes 合表 wave（C-2 算法实施），与项目
主数据收口完全解耦。但 W7 期间需 Audit 跑漂移脚本确认 M2 进度未倒退（shr_projects 0 hit 持平）。

### 8.4 W8 后置项

| 项 | 责任 | 风险 |
|---|---|---|
| W8-E1 workflow.assignment-resolver.byProjectManager 切 biz_projects | ERP 主 + Architect 评审 | 🟡 影响审批人解析；需双跑期 1 周（旧路径打 warn）|
| W8-E2 approval-engine/workflow-biz-registry.service.ts P-1 ~ P-4 替换 | ERP 主 + Architect 评审 | 🟡 mdAuditHook 表名变更；审批历史完整性核 |
| W8-E3 master-data/master-data-references.service.ts P-5 替换 | Architect | 🟢 引用图谱配置 |
| W8-E4 master-data/master-data-runtime.service.ts P-6 注释更新 | Architect | 🟢 |
| W8-E5 漂移脚本对账 prc2_projects 6 → 0 | Audit | 🟢 |
| W8-E6 prc2_projects DROP TABLE 评估（推迟 W10+） | Architect | 🟢 不强制 |

### 8.5 永久禁项

- 多法人合资 project（M1 §3.2 / §4.1 C-5）
- ACTIVE 后改 company_code（M1 §4.1 C-4）
- 物理删除 sys_organizations(PROJECT) 占位行（M1 §4.2 C-7）
- 新建 sys_organizations(PROJECT) 占位行（W6+ type_rules service 接入后硬阻）
- prc2_projects 新建行（默认空表；写入端只剩 W8 前的 workflow，W8 后无）
- 任何业务表通过 prc2_projects 或 shr_projects 拿 project_code 主权（W8/W6 后皆禁）

---

## 9. 回滚策略与验收命令

### 9.1 回滚策略

**通用三层回滚链**（继承 M1 §13 + 母规划 §6）：

1. **代码层**：`git revert <merge-commit>` → 走标准 deploy.yml；禁 `git push --force`
2. **DB 层**：
   ```bash
   docker compose exec -T api ./node_modules/.bin/typeorm \
     -d dist/database/data-source.js migration:revert
   ```
   反向执行 `down()`
3. **typeorm_migrations 表**：`migration:revert` 自动清行；无需手动

### 9.2 按 wave 回滚剧本

| Wave | 主要改动 | 回滚剧本 | 数据损失风险 |
|---|---|---|---|
| **W5-A2 扩 5 列** | ADD COLUMN nullable | `migration:revert` → DROP COLUMN | 无（nullable 字段，回滚后业务表里没引用） |
| **W5-A3 数据回填** | INSERT biz_projects 行 + UPDATE 现有行 | 业务方拍板的回填行无回滚剧本；只能正向冲销（INSERT 后改 status='REJECTED' 或新增 audit log 说明） | 🟡 一次性数据迁移；建议先 dump snapshot |
| **W5-A4 / A5 字段回填** | UPDATE biz_projects.project_manager_user_id 等 | revert PR；fields 变 NULL；service 继续读 prc2_projects/shr_projects 路径 | 无（W5 不切 service 读路径） |
| **W5-A6 service 不可变校验** | service 改 | revert PR | 无 |
| **W5-A7 DB trigger** | CREATE TRIGGER | `migration:revert` → DROP TRIGGER | 无 |
| **W5-A8 operations.service 改读 biz_projects** | service 改 | revert PR | 无 |
| **W6 RENAME shr_projects** | RENAME TABLE + 视图 + FK | down(): RENAME back + DROP VIEW + DROP CONSTRAINT；service 端开关回旧表读 | 🟡 视图层兼容；service 必须双写或单点切换。建议双写期 1 wave |
| **W6 service 切 biz_projects + shr_project_attrs** | service 改 | revert PR；service 读旧表 | 无（视图未删时旧 service 仍能跑） |
| **W8 workflow.byProjectManager 切表** | service 改 | revert PR；service 回退读 prc2_projects | 🟡 审批人解析双跑期 ≥ 1 周；revert 后 prc2_projects 数据需保持完整（W5 已回填，W8 时 prc2_projects 仍有数据） |
| **W8 approval-engine 业务对象注册替换** | service 改 | revert PR；workflow 注册回退到 prc2_projects | 🟡 mdAuditHook 已写入的审计行 table 字段不一致；需保留 prc2_projects 表 |

### 9.3 不可逆操作（永禁）

- ❌ W6 shr_projects RENAME 后立刻 DROP 旧名表（必须保留视图 ≥ 1 wave）
- ❌ W8 切 biz_projects 后立刻 DROP prc2_projects 表（W10+ 评估）
- ❌ 物理删除 biz_projects 任何 ACTIVE 行（永禁）
- ❌ revert PR 后 force push 已 push 历史

### 9.4 验收命令

#### 9.4.1 W5 验收

```bash
# 通用
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/tsc --noEmit
pnpm lint
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt
node scripts/check-nullable-in-unique.js
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations
# ↑ W5-A3 迁移文件必有 @allow-data-dml 标记;识别为豁免

# M2 专项: 漂移基线对账
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5.json
# 期望: prc2_projects = 6 (持平); shr_projects = 4 (S-W4/S-W5 修)

# C-5 唯一公司违规扫描
psql -c "SELECT project_code, COUNT(DISTINCT company_code)
           FROM biz_projects
          GROUP BY project_code
          HAVING COUNT(DISTINCT company_code) > 1;"
# 期望 0 行

psql -c "SELECT project_code, COUNT(DISTINCT company_code)
           FROM prc2_projects
          GROUP BY project_code
          HAVING COUNT(DISTINCT company_code) > 1;"
# 期望 0 行

# biz_projects 5 列存在 + 类型对
psql -c "\d biz_projects" | grep -E "project_manager_user_id|site_code|capital_status|equity_status|is_shareholder_managed"
# 期望 5 行命中

# C-4 不可变 trigger 存在
psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid='biz_projects'::regclass;"
# 期望含 trg_biz_projects_company_immutable (或类似命名)

# W5 末状态:在 ACTIVE 状态下 UPDATE company_code 应失败
curl -X PUT http://127.0.0.1:3100/api/master-data/runtime/project/PRJ_TEST/edit \
  -H 'Content-Type: application/json' \
  -d '{"company_code":"COMP-DIFFERENT"}'
# 期望 400 (业务错误码 MD_PROJECT_COMPANY_IMMUTABLE)

# RBAC 巡检 (未触, 但建议跑一次)
bash scripts/g5c-rbac-audit.sh
```

#### 9.4.2 W6 验收

```bash
# 通用 (同 W5)

# shr_projects 已 RENAME + 视图存在
psql -c "SELECT relname FROM pg_class WHERE relname IN ('shr_projects','shr_project_attrs');"
# 期望 2 行: shr_projects (view) + shr_project_attrs (table)

# FK 已加
psql -c "SELECT conname FROM pg_constraint
          WHERE conrelid='shr_project_attrs'::regclass AND contype='f';"
# 期望含 shr_project_attrs_project_code_fk (或类似)

# 漂移基线对账
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w6.json
# 期望: prc2_projects = 6 (持平); shr_projects = 0 (S-1 ~ S-6 + S-W1 ~ S-W3 全切)

# entity 切换
grep -E "@Entity\('shr_project" apps/api/src/modules/shareholder/entities/shr-project.entity.ts
# 期望: shr_project_attrs

# data-quality 配置切
grep "biz_projects" apps/api/src/modules/data-quality/services/master-data-health.service.ts
# 期望命中

# 股东模块回归
cd apps/api && pnpm test:regr:shareholder
# 期望 pass

# 主数据治理面回归
curl -sf http://127.0.0.1:3100/api/master-data/operations/centers | jq '.data | length'
# 期望 7 (W4 已加 extended-gov center)
```

#### 9.4.3 W8 验收

```bash
# 通用 (同 W5)

# 漂移基线对账
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w8.json
# 期望: prc2_projects = 0; shr_projects = 0

# workflow 注册表已切
grep "biz_projects" apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts | head -5
# 期望 ≥ 3 行 (P-2 / P-3 / P-4)

# assignment-resolver 已切
grep "biz_projects" apps/api/src/modules/workflow/assignment-resolver.service.ts
# 期望命中 (P-W1)

# byProjectManager 真接审批人能解出
curl -sf "http://127.0.0.1:3100/api/workflow/instances?bizType=MD_PROJECT_CREATE&limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data[0].current_approver'
# 期望非空 (从 biz_projects.project_manager_user_id 解出)

# 全模块回归 (按 PLAN test 矩阵)
cd apps/api
pnpm test:regr:system
pnpm test:regr:procurement
pnpm test:regr:finance
pnpm test:regr:shareholder
pnpm test:regr:workflow
```

#### 9.4.4 通用回归

```bash
# 主数据治理评分
curl -sf http://127.0.0.1:3100/api/master-data/governance/score | jq '.data.details.extended.bizProjects // .data.org_score'

# 项目 active 列表(每个 wave 都应正常返回)
curl -sf "http://127.0.0.1:3100/api/biz/projects/active" | jq '.data | length'

# 跨 wave diff (Audit 跟进每 wave 跑)
diff /tmp/mdr-w<N-1>.json /tmp/mdr-w<N>.json
```

---

## 10. 与上游文档一致性

| 上游 | 对应章节 | 一致性 |
|---|---|---|
| M1 §3.2 C-5 PROJECT 唯一 COMPANY | M2 §3 / §5 | ✅ |
| M1 §4.1 C-4 company_code 不可变 + 业务重组 SOP | M2 §4 | ✅ |
| M1 §4.2 C-7 PROJECT 占位行 UPDATE 白/黑名单 | M2 §2.4 | ✅ 直引 |
| M1 §5.5 site × project 跨多公司允许 | M2 §3.3 | ✅ |
| M1 §11.5 DataScope 5 步算法 | M2 §3 字段语义 | ✅（不冲突）|
| 母规划 §5.3 W5 biz_projects 扩 5 列 | M2 §8.1 | ✅ |
| 母规划 §5.4 W6 shr_projects RENAME | M2 §2.3 + §8.2 | ✅ |
| MULTI_AGENT_PHASE2_PLAN W8 workflow.byProjectManager | M2 §8.4 | ✅ |
| W4 漂移基线 prc2_projects 6 / shr_projects 6 | M2 §6.1 / §6.2 | ✅（逐 hit 列出）|
| M1_DECISIONS_AUDIT §6 允许启动 M2 | 本文件全部 | ✅ |
| WAVE1_REVIEW §10.1 W5 Gantt | M2 §8.1 | ✅ |

---

## 11. 待用户拍板 / 跨域提案点

| # | 待拍板 | 阻塞 wave |
|---|---|---|
| Q-1 | W5-A3 biz_projects 数据回填的"业务方拍板每条 INSERT"流程：是否走主数据中心待办列表（M4 governance.todo），还是 PR review 内 inline 确认？ | W5 启动 |
| Q-2 | W6 shareholder service 改造（capital-aggregation）双签：Architect + Finance 是否需要单独的"shareholder-finance bridge"文档辅助？ | W6 启动 |
| Q-3 | W8 切 biz_projects 后 prc2_projects 是否在 W10+ DROP 还是永久保留？业务方对历史 prc2 审批的查询习惯 | W10+ |
| Q-4 | Finance F2 项目过滤策略升级时点（NULL OR ANY → 严格 ANY）：W6 拐点 vs 后置 wave？ | W6+ |
| Q-5 | data-quality/code-governance.service.ts:40 的命名 pattern 是否同步收紧为 `^PRJ_[A-Z][A-Z0-9_]+$`（与 M1 §4.3 一致）？ | W6 |

---

## 12. 后续 wave 引用承诺

| Wave 实施 | 必须引用本文件章节 |
|---|---|
| W5 biz_projects 扩列 TS 迁移 | §1.2 字段清单 + §8.1 W5 可执行项 |
| W5 数据回填 TS 迁移 | §2.3 shr_projects 回填规则 + §5.5 唯一公司扫描 + §9.4.1 验收 |
| W5 service 不可变校验 | §4 全节 |
| W5 trigger | §4.3 |
| W6 shr_projects RENAME | §2.3 + §6.2 hit 替换 + §9.4.2 验收 |
| W6 shareholder service 切 | §6.2 S-W1 ~ S-W3 + §7.2 跨域协同 |
| W6 data-quality / product-master 配置切 | §6.2 S-2 ~ S-6 |
| W8 workflow / approval-engine 切 | §6.1 P-1 ~ P-W1 + §8.4 |
| W8 漂移归零验收 | §6.3 + §9.4.3 |

---

**M2 子文档生效日期：2026-06-20。**
**待 Audit 评审 + 用户拍板（Q-1 / Q-2 / Q-3 / Q-4 / Q-5）后合入 main，
正式作为 W5 / W6 / W8 实施基线。本文件与 M1 主文档同等约束力。**
