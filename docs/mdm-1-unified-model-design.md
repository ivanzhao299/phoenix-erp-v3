# MDM-1 统一公司/项目/站点模型设计

> **前置**：`docs/mdm-0-master-data-audit.md`
> **原则**：最小侵入，不推倒重来；以 sys_organizations 为公司+站点唯一源
> **状态**：设计稿，**未生成 migration**，等业务方拍板待确认项后再生成
> **日期**：2026-06-05

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────┐
│ sys_organizations  （统一组织/公司/站点唯一源）│
│  ├ GROUP        集团                            │
│  ├ BU           事业群                          │
│  ├ COMPANY      公司主体                        │
│  ├ SITE         业务站点（FARM/STORE/...）     │
│  └ DEPARTMENT   部门                            │
└────────────┬────────────────────────────────────┘
             │ company_code 引用
             ↓
        ┌─────────────────────┐
        │ biz_projects 新建    │
        │  项目主档（独立表）  │
        └────────────┬────────┘
                     │ project_code 引用
                     ↓
        ┌─────────────────────┐
        │ biz_site_projects 新建 │
        │  站点 × 项目 多对多   │
        └─────────────────────┘

  ┌─────────────────────────┐
  │ biz_site_aliases 新建    │
  │  历史 alias → site 映射   │
  │  (LPH_MENGSAI→SITE-…)    │
  └─────────────────────────┘

业务表（brd_daily_logs / wms_inbound / pkg_tasks ...）
  ├ + company_code（来自 sys_organizations COMPANY）
  ├ + project_code（来自 biz_projects）
  └ + site_code   （来自 sys_organizations SITE）

兼容字段保留：
  - brd_daily_logs.farm_code / store_code 留存（标记 @deprecated）
  - sys_user.store_code 留存（字段名误导但保数据不变）
```

## 2. 现有表的去留决策

| 表 | 决策 | 备注 |
|---|---|---|
| **sys_organizations** | ✅ **保留并升级**为公司+站点唯一源 | 加 site_type 子分类列 |
| sys_store | ⏳ **冻结**（status='ARCHIVED'），数据迁入 sys_organizations | 老 V2 表，不再写入 |
| brd_farms | ⏳ **保留为兼容表** + 加 `mapped_site_code` 反向引用 | 后续业务只查 site_code，5 行重复需清理（业务确认）|
| mst_stores | ⏳ **保留为兼容表** + 加 `mapped_site_code` 反向引用 + 加 `company_code` | 8 行销售门店保留 |
| **prc2_projects** | ⛔ **替换**为 biz_projects（数据迁移） | 当前 0 行无数据损失 |
| shr_projects | ⏳ **保留为兼容表** + 加 `mapped_project_code` 反向引用 biz_projects | 3 行股东项目继续工作 |
| wms_warehouses | ⏳ 保留 + 加 `mapped_site_code`（仓库挂在 WAREHOUSE site 下）| 当前空 |

## 3. 新建表 DDL 草稿

### 3.1 `biz_projects` — 统一项目主表

```sql
CREATE TABLE IF NOT EXISTS biz_projects (
  id                  BIGSERIAL PRIMARY KEY,
  project_code        VARCHAR(64) NOT NULL UNIQUE,
  project_name        VARCHAR(200) NOT NULL,
  project_name_lo     VARCHAR(200),
  project_type        VARCHAR(32) NOT NULL,
    -- 枚举：INVESTMENT(投资) / OPERATION(经营) / COST_CENTER(成本中心) / PROFIT_CENTER(利润中心)
  company_code        VARCHAR(64) NOT NULL REFERENCES sys_organizations(org_code),
  accounting_subject  VARCHAR(64),   -- 关联会计科目
  budget_amount       NUMERIC(18,2) DEFAULT 0,
  budget_currency     VARCHAR(8) DEFAULT 'LAK',
  start_date          DATE,
  end_date            DATE,
  status              VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE / DRAFT / FROZEN / CLOSED / ARCHIVED
  manager_user_id     BIGINT,
  manager_name        VARCHAR(128),
  sort_order          INT DEFAULT 0,
  remark              TEXT,
  created_by          VARCHAR(80),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_biz_projects_company ON biz_projects (company_code);
CREATE INDEX idx_biz_projects_status  ON biz_projects (status);
```

### 3.2 `biz_site_projects` — 站点 × 项目 多对多

```sql
-- 一个站点原则上属于一个项目；如共享站点，通过本表多挂
CREATE TABLE IF NOT EXISTS biz_site_projects (
  id              BIGSERIAL PRIMARY KEY,
  site_code       VARCHAR(64) NOT NULL,  -- = sys_organizations.org_code (SITE)
  project_code    VARCHAR(64) NOT NULL REFERENCES biz_projects(project_code),
  is_primary      BOOLEAN NOT NULL DEFAULT false,
    -- 站点的主要归属项目（用于默认带出）
  effective_date  DATE,
  expire_date     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_site_project UNIQUE (site_code, project_code)
);
CREATE INDEX idx_site_projects_site ON biz_site_projects (site_code);
CREATE INDEX idx_site_projects_proj ON biz_site_projects (project_code);
```

### 3.3 `biz_site_aliases` — 历史别名映射表

```sql
CREATE TABLE IF NOT EXISTS biz_site_aliases (
  id              BIGSERIAL PRIMARY KEY,
  site_code       VARCHAR(64) NOT NULL,  -- canonical (sys_organizations.org_code SITE)
  alias_type      VARCHAR(32) NOT NULL,
    -- FARM_CODE / STORE_CODE / OLD_SITE_CODE / EXCEL_NAME / LEGACY_NAME
  alias_code      VARCHAR(128) NOT NULL,
  alias_name      VARCHAR(200),
  status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  remark          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_site_alias UNIQUE (alias_type, alias_code)
);
CREATE INDEX idx_site_alias_site ON biz_site_aliases (site_code);
CREATE INDEX idx_site_alias_code ON biz_site_aliases (alias_code);
```

### 3.4 sys_organizations 增加 site_type 子分类

```sql
ALTER TABLE sys_organizations
  ADD COLUMN IF NOT EXISTS site_business_type VARCHAR(32);
  -- 当 org_type='SITE' 时填值：
  --   FARM    养殖场（蛋鸡/肉鸡/孵化等）
  --   STORE   销售门店
  --   FACTORY 工厂（屠宰/包装/有机肥等）
  --   WAREHOUSE 独立仓库
  --   OFFICE  办公室

-- 现有 site_business_type 字段如果已存在则只补 COMMENT
COMMENT ON COLUMN sys_organizations.site_business_type IS
  'SITE 类型站点的业务子分类：FARM/STORE/FACTORY/WAREHOUSE/OFFICE';
```

**注**：实际审计发现 sys_organizations 已有 `site_business_type` 字段，无需新增（直接复用）。

### 3.5 业务表补 3 字段 - 标准模板

```sql
-- 模板：所有业务单据表都加这 3 个字段
ALTER TABLE brd_daily_logs
  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64),  -- → sys_organizations.org_code (COMPANY)
  ADD COLUMN IF NOT EXISTS project_code VARCHAR(64),  -- → biz_projects.project_code
  ADD COLUMN IF NOT EXISTS site_code    VARCHAR(64);  -- → sys_organizations.org_code (SITE)

CREATE INDEX IF NOT EXISTS idx_brd_daily_company ON brd_daily_logs (company_code);
CREATE INDEX IF NOT EXISTS idx_brd_daily_project ON brd_daily_logs (project_code);
CREATE INDEX IF NOT EXISTS idx_brd_daily_site    ON brd_daily_logs (site_code);
```

**目标业务表清单**（需补 3 字段）：

| 表 | 已有 company | 已有 project | 需补 site_code |
|---|---|---|---|
| brd_daily_logs | ❌ | ❌ | ✅ |
| brd_flocks | ❌ | ❌ | ✅ |
| brd_houses | ❌ | ❌ | ✅ |
| brd_immune_plans | ❌ | ❌ | ✅ |
| brd_vaccinations | ❌ | ❌ | ✅ |
| pkg_tasks | ⏳查 | ⏳查 | ✅ |
| wms_inbound / wms_outbound | ❌ | ❌ | ✅ |
| inv_batches | ✅ | ❌ | ✅ |
| mst_products / product_skus | ❌ | ❌ | n/a |
| mst_stores | ❌ | ❌ | ✅（mapped_site_code）|

## 4. brd_farms / mst_stores 兼容映射方案

### 4.1 brd_farms 加映射列

```sql
ALTER TABLE brd_farms
  ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64);
  -- → sys_organizations.org_code (SITE)
  -- 业务层查询全部基于 mapped_site_code；farm_code 仅保留为遗留键
```

**初始映射 seed**：

| brd_farms.farm_code | mapped_site_code | 说明 |
|---|---|---|
| `LPH_MENGSAI` | `SITE-MENGSAI-LAYER` | 孟赛蛋鸡场 |
| `FARM001` | `SITE-MENGSAI-LAYER` | 重复行，需业务方确认是否归并/标 ARCHIVED |
| `FARM-MS` | `SITE-MENGSAI-LAYER` | 重复行（sys_store 老编码）|
| `FARM-DP` | `SITE-DONGPENG-LAYER` | 东鹏 |
| `FARM-01` | (无对应 SITE) | 凤羽一号基地，需业务确认 |

同时 `biz_site_aliases` 写入对应映射行（alias_type='FARM_CODE'）。

### 4.2 mst_stores 加映射列 + company_code

```sql
ALTER TABLE mst_stores
  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mapped_site_code VARCHAR(64);
```

8 行需业务方梳理是哪些销售门店 → 对应到 sys_organizations.SITE_TYPE=STORE。

## 5. 用户 / 角色 / 数据范围模型

### 5.1 用户绑定（保持现有 V3 设计）

```
sys_user
  └ sys_user_role            （角色绑定）
sys_user_orgs                 （主组织绑定，含 data_scope_level）
sys_user_farm_scopes          （额外场站授权）
sys_user_warehouse_scopes     （额外仓库授权）
sys_user_project_scopes       （额外项目授权）

新增：
sys_user_site_scopes  （可选）
  user_id / site_code / created_at
  -- 与 farm/warehouse 同层：当用户岗位需要单点站点（非 farm/warehouse 类）授权时
```

### 5.2 角色数据范围（保持现有）

```
sys_data_scopes
  role_code / module_code / scope_type (SELF / PROJECT / COMPANY / REGION / GROUP)
```

**改造点**：DataScopeContext 增加 `allowedSiteCodes`：

```ts
interface DataScopeContext {
  isGlobal: boolean;
  scopeLevel: ScopeLevel;
  allowedCompanyCodes: string[];
  allowedProjectCodes: string[];
  allowedWarehouseCodes: string[];
  allowedFarmCodes: string[];      // 历史兼容
  allowedSiteCodes: string[];      // 新增 — 统一站点过滤
  userId: string;
}
```

`allowedSiteCodes` 来源：
- `sys_user_orgs.org_id` JOIN `sys_organizations` 取 SITE 类型节点
- + `sys_user_farm_scopes.farm_code` 通过 `biz_site_aliases` 映射回 site_code
- + `sys_user_warehouse_scopes.warehouse_code` 通过 wms_warehouses.mapped_site_code 映射

## 6. 编码规范

详见独立文档 `docs/mdm-coding-standard.md`。

## 7. 实施阶段

| 阶段 | 内容 | 风险 |
|---|---|---|
| **MDM-1**（本期）| 设计 + 文档 + 待确认清单 | 0（不动 schema） |
| **MDM-2** | DDL：建 biz_projects + biz_site_aliases + biz_site_projects + 业务表加 3 字段 | 低（IF NOT EXISTS 幂等）|
| **MDM-3** | Seed：sys_store/brd_farms/mst_stores 数据迁入 sys_organizations + alias 写入 | 中（数据迁移需业务复核）|
| **MDM-4** | API 改造：DataScope 加 allowedSiteCodes / 业务 service WHERE 改用 site_code | 中（要切流量）|
| **MDM-5** | 前端：CompanySelector / ProjectSelector / SiteSelector 统一组件 + 联动级联 | 低 |
| **MDM-6** | 老表标记 deprecated：sys_store 冻结 / brd_farms 退化为 view / mst_stores 同上 | 高（破坏既有数据访问，需充分回归）|

## 8. 验收映射（用户提的 15 项 → 实施阶段对应）

| 验收项 | 阶段 |
|---|---|
| 1-7. 采购选公司/项目/站点 + 级联 + 保存 + AP继承 | MDM-2 + MDM-4 + MDM-5 |
| 8. 生产日报按 company/project/site/farm/house 过滤 | MDM-2 + MDM-3 + MDM-4 |
| 9. 销售订单按 company/project/site/store 过滤 | MDM-4 |
| 10. 个人中心不把养殖场显示为门店 | ✅ **已完成**（GLP-1A-RBAC-Realign，按 userKind 切文案）|
| 11. 角色权限基于 company/project/site 数据范围 | MDM-4 |
| 12. 越权 403 | ✅ 部分已有（RequireMenu）+ MDM-4 加 DataScope 强制 |
| 13. 6/1 起孟赛生产数据可见 | MDM-3（alias 回填 site_code 后过滤生效）|
| 14. 跨场数据隔离 | MDM-4 |
| 15. 审计报告 + 编码规范 + migration + 测试报告 | ✅ MDM-0/1 已交付审计+规范 |

## 9. 残留问题 / 待业务确认

| # | 问题 | 默认值 | 业务方确认 |
|---|---|---|---|
| 1 | 老挝凤凰农业 canonical company_code | `COMP-LAO-AGRI` | 待确认 |
| 2 | 孟赛蛋鸡养殖场 canonical site_code | `SITE-MENGSAI-LAYER` | 待确认 |
| 3 | brd_farms 5 行重复处理 | 归并到 SITE-MENGSAI-LAYER，重复行 ARCHIVED | 待确认 |
| 4 | sys_store 16 行是否完全可丢 | 冻结，不删除 | 待确认 |
| 5 | mst_stores 8 行的 company_code 是什么 | 需逐一映射 | 待业务方提供 |
| 6 | FARM-01「凤羽一号基地」对应哪个 SITE | 无对应 | 待业务方确认是否建新 SITE |
| 7 | 1 号鸡舍是否空栏 | brd_houses 行存在，current_birds=0 | 待业务方确认 |
| 8 | prc2_projects 0 行 → 是否补建至少 5 个项目骨架 | 是 | 等业务方给清单 |
| 9 | 是否新建 sys_user_site_scopes 表 | 是（与 farm/warehouse 同层）| 待确认 |
| 10 | 历史数据是否需要回填 company/project/site | 是（MDM-3 阶段做）| 待确认 |
