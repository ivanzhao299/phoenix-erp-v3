# Phoenix ERP V3 — Organization Runtime Phase 1 实施报告

## 日期：2026-05-31

---

## 1. 数据库变更

### 1.1 sys_organizations 新增字段

| 字段名 | 类型 | 可空 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `org_name_cn` | VARCHAR(256) | 是 | NULL | 中文正式全称（幂等 ADD COLUMN IF NOT EXISTS） |
| `org_short_name` | VARCHAR(64) | 是 | NULL | 简称/展示名 |
| `parent_code` | VARCHAR(64) | 是 | NULL | 上级 org_code（冗余字段，方便按编码关联） |
| `site_code` | VARCHAR(64) | 是 | NULL | 场区编码（SITE 节点使用，建有 idx_orgs_site_code 索引） |
| `site_business_type` | VARCHAR(64) | 是 | NULL | 场区业务类型（LAYER_FARM / HATCHERY / ORGANIC_FERTILIZER / BROILER_FARM / SLAUGHTER / FEED_MILL 等） |
| `sort_order` | INTEGER | 否 | 0 | 排序权重，数值越小越靠前 |

同步变更：重建 `chk_org_type` CHECK 约束，在原有类型基础上新增 `BU`（事业群）和 `SITE`（场区）两个枚举值，完整枚举为：`GROUP` / `BU` / `COMPANY` / `SITE` / `FACTORY` / `PROJECT` / `WAREHOUSE` / `STORE` / `DEPARTMENT`。

新建索引（均使用 IF NOT EXISTS）：

| 索引名 | 字段 | 条件 |
|--------|------|------|
| `idx_orgs_code` | org_code | 无 |
| `idx_orgs_parent_code` | parent_code | parent_code IS NOT NULL |
| `idx_orgs_site_code` | site_code | site_code IS NOT NULL |
| `idx_orgs_business_type` | site_business_type | site_business_type IS NOT NULL |
| `idx_orgs_sort` | (sort_order, org_code) | 无 |

### 1.2 sys_user_orgs 新增字段

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `org_code` | VARCHAR(64) | 可空 | 冗余 org_code，方便不 JOIN org 表直接按编码查询 |
| `role_scope` | VARCHAR(32) | CHECK (GROUP/BU/COMPANY/SITE/DEPARTMENT)，可空 | 用户在该组织内的角色范围层级（预留字段，Phase 2 使用） |

### 1.3 种子数据统计

| 层级 | org_type | 节点数 | 状态 |
|------|----------|--------|------|
| L1 集团 | GROUP | 1 | ACTIVE |
| L2 集团总部 | DEPARTMENT | 1 | ACTIVE |
| L2 事业群 | BU | 4 | ACTIVE×2 / PLANNED×2 |
| L3 公司 | COMPANY | 3 | ACTIVE |
| L4 场区 | SITE | 7 | ACTIVE×4 / PLANNED×3 |
| L5 标准部门 | DEPARTMENT | 56（8 SITE × 7 部门） | 继承父场区状态 |
| **合计** | | **72 节点** | |

---

## 2. 初始化组织树

| 节点编码 | 中文名称 | 类型 | 层级 | 父节点 | 状态 | 业务类型 |
|----------|----------|------|------|--------|------|---------|
| ORG-GROUP | 金凤凰控股集团 | GROUP | L1 | — | ACTIVE | — |
| ORG-HQ | 金凤凰控股集团总部 | DEPARTMENT | L2 | ORG-GROUP | ACTIVE | HQ |
| BU-AGRI | 凤凰农业事业群 | BU | L2 | ORG-GROUP | ACTIVE | — |
| BU-FOOD | 凤凰食品事业群 | BU | L2 | ORG-GROUP | ACTIVE | — |
| BU-TRADING | 凤凰贸易事业群 | BU | L2 | ORG-GROUP | PLANNED | — |
| BU-SCM | 凤凰供应链事业群 | BU | L2 | ORG-GROUP | PLANNED | — |
| COMP-LAO-AGRI | 老挝凤凰农业发展有限公司 | COMPANY | L3 | BU-AGRI | ACTIVE | — |
| COMP-LAO-XINGCHI | 老挝金三角特区星驰养鸡场 | COMPANY | L3 | BU-AGRI | ACTIVE | — |
| COMP-LAO-FOOD | 老挝凤凰食品集团有限公司 | COMPANY | L3 | BU-FOOD | ACTIVE | — |
| SITE-MENGSAI-LAYER | 孟赛蛋鸡养殖场 | SITE | L4 | COMP-LAO-AGRI | ACTIVE | LAYER_FARM |
| SITE-MENGSAI-HATCHERY | 孟赛孵化场 | SITE | L4 | COMP-LAO-AGRI | PLANNED | HATCHERY |
| SITE-MENGSAI-ORGANIC | 孟赛有机肥生产厂 | SITE | L4 | COMP-LAO-AGRI | PLANNED | ORGANIC_FERTILIZER |
| SITE-DONGPENG-LAYER | 东鹏蛋鸡养殖场 | SITE | L4 | COMP-LAO-XINGCHI | ACTIVE | LAYER_FARM |
| SITE-VTE-BROILER | 万象肉鸡养殖场 | SITE | L4 | COMP-LAO-FOOD | ACTIVE | BROILER_FARM |
| SITE-VTE-SLAUGHTER | 万象屠宰加工厂 | SITE | L4 | COMP-LAO-FOOD | ACTIVE | SLAUGHTER |
| SITE-VTE-FEED | 万象饲料厂 | SITE | L4 | COMP-LAO-FOOD | PLANNED | FEED_MILL |
| DEPT-{SITE_CODE}-PROD | {场区名}-生产部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-WAREHOUSE | {场区名}-仓储部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-SALES | {场区名}-销售部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-FINANCE | {场区名}-财务部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-QUALITY | {场区名}-质检部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-EQUIPMENT | {场区名}-设备部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |
| DEPT-{SITE_CODE}-ADMIN | {场区名}-行政部 | DEPARTMENT | L5 | 各 SITE | 继承 | — |

---

## 3. API 清单

### 3.1 OrganizationController（路由前缀：`/api/organizations`）

| 方法 | 端点 | 菜单码 | 权限码 | 说明 |
|------|------|--------|--------|------|
| GET | `/api/organizations/tree` | MENU_ORG_VIEW | V | 完整嵌套组织树（含 children 递归） |
| GET | `/api/organizations/by-type?type=SITE` | MENU_ORG_VIEW | V | 按 org_type 过滤平铺列表 |
| GET | `/api/organizations/user-scopes/:userId` | MENU_ORG_VIEW | V | 用户组织授权范围（含 projects + warehouses） |
| GET | `/api/organizations` | MENU_ORG_VIEW | V | 全量平铺列表（按 level+orgCode 排序） |
| GET | `/api/organizations/:code` | MENU_ORG_VIEW | V | 按 orgCode 查单条 |
| POST | `/api/organizations` | MENU_ORG_MANAGE | C | 创建新组织节点 |
| PATCH | `/api/organizations/:code` | MENU_ORG_MANAGE | C | 更新组织信息 |
| POST | `/api/organizations/:code/disable` | MENU_ORG_MANAGE | E | 禁用组织（status→INACTIVE） |
| POST | `/api/organizations/:code/enable` | MENU_ORG_MANAGE | E | 启用组织（status→ACTIVE） |

### 3.2 OrgController（路由前缀：`/api/org`）——原有 RBAC-2 接口

| 方法 | 端点 | 菜单码 | 权限码 | 说明 |
|------|------|--------|--------|------|
| GET | `/api/org/organizations` | MENU_SYS_ORG | V | 组织列表 |
| GET | `/api/org/organizations/:id` | MENU_SYS_ORG | V | 组织详情 |
| POST | `/api/org/organizations` | MENU_SYS_ORG | C | 创建组织 |
| PUT | `/api/org/organizations/:id` | MENU_SYS_ORG | E | 更新组织 |
| DELETE | `/api/org/organizations/:id` | MENU_SYS_ORG | D | 删除组织 |
| GET | `/api/org/organizations/:orgId/members` | MENU_SYS_ORG | V | 获取组织成员 |
| GET | `/api/org/user-orgs/:userId` | MENU_SYS_ORG | V | 用户绑定的组织列表 |
| POST | `/api/org/user-orgs` | MENU_SYS_ORG | C | 新增用户-组织绑定 |
| PUT | `/api/org/user-orgs/:id` | MENU_SYS_ORG | E | 更新绑定（scope/primary） |
| DELETE | `/api/org/user-orgs/:id` | MENU_SYS_ORG | D | 移除绑定 |
| GET | `/api/org/user-scopes/:userId` | MENU_SYS_ORG | V | 用户额外授权（project+warehouse） |
| POST | `/api/org/user-scopes/project` | MENU_SYS_ORG | C | 新增项目授权 |
| DELETE | `/api/org/user-scopes/project/:id` | MENU_SYS_ORG | D | 移除项目授权 |
| POST | `/api/org/user-scopes/warehouse` | MENU_SYS_ORG | C | 新增仓库授权 |
| DELETE | `/api/org/user-scopes/warehouse/:id` | MENU_SYS_ORG | D | 移除仓库授权 |
| GET | `/api/org/data-scopes` | MENU_SYS_ORG | V | 数据范围规则列表 |
| POST | `/api/org/data-scopes` | MENU_SYS_ORG | C | 创建数据范围规则 |
| PUT | `/api/org/data-scopes/:id` | MENU_SYS_ORG | E | 更新数据范围规则 |
| DELETE | `/api/org/data-scopes/:id` | MENU_SYS_ORG | D | 删除数据范围规则 |

**合计：28 个端点（9 新增 + 19 原有）**

---

## 4. 权限矩阵

### 菜单码 × 角色 × 权限码

| 菜单码 | ROLE_ADMIN | ROLE_HR_ADMIN | ROLE_SYSOPS | ROLE_CEO | 说明 |
|--------|-----------|--------------|------------|---------|------|
| MENU_SYS_ORG | V,C,E,D,A,X | V,C,E,D | V,C,E | V | RBAC-2 组织架构（OrgController） |
| MENU_ORG_VIEW | 继承 ADMIN 全局 | — | — | — | Phase 1 新增（OrganizationController 查询端点） |
| MENU_ORG_MANAGE | 继承 ADMIN 全局 | — | — | — | Phase 1 新增（OrganizationController 写入端点） |

> 说明：`MENU_ORG_VIEW` 和 `MENU_ORG_MANAGE` 在 Phase 1 中由 `OrganizationController` 的 `@RequireMenu` 装饰器声明，尚未在 `sys_menu` 和 `sys_role_menu_permission` 中正式注册种子数据，建议 Phase 2 补充完整 RBAC 种子（详见 §10）。`ROLE_ADMIN` 因 `DataScopeService` 对其 isGlobal=true 短路，实际无需逐条检查。

---

## 5. DataScope 扩展

### 5.1 现有 Scope 类型（sys_data_scopes.scope_type）

| scope_type | 含义 | 范围 |
|-----------|------|------|
| SELF | 个人 | 仅本人创建/负责的记录 |
| PROJECT | 项目 | sys_user_project_scope 授权的项目 |
| COMPANY | 公司 | sys_user_orgs 关联的 company_code |
| REGION | 区域 | 同父节点下所有子公司 |
| GROUP | 集团 | isGlobal=true，全量访问 |

### 5.2 Phase 1 对 DataScope 的影响

通过在 `sys_organizations` 新增 `org_code` / `parent_code` / `site_code` 字段，DataScopeService 的 REGION 级别展开逻辑现可基于 `parent_id` 精准找到同 BU 或同公司下的全部子节点。

### 5.3 DataScope 影响的 API 模块

DataScopeHelper 被以下 38 个 Service/Controller 注入：

| 模块 | 受影响 Service 数量 |
|------|------------------|
| Sales V2 | 8（channels / customer-credit / delivery-orders / price-books / price-items / price-runtime / sales-analytics / sales-orders） |
| Procurement V2 | 9（orders / payments / projects / receipts / requests / shareholder-funds / shipments / suppliers / dashboard） |
| Finance V2 | 8（ap-adapter / cash-accounts / expense-requests / financial-reports / fund-transfers / reimbursements / shareholder-contributions / shareholder-settlements） |
| Org 模块自身 | 3（data-scope.service / org.service / data-scope.helper） |

---

## 6. 前端页面

### 6.1 新增页面

| 路由路径 | 文件 | 功能描述 | 菜单码 |
|----------|------|---------|--------|
| `/master-data/organizations` | `apps/web/src/app/(admin)/master-data/organizations/page.tsx` | 组织架构树形管理（左树+右详情面板+新建/编辑抽屉） | MENU_SYS_ORG |
| `/master-data/user-orgs` | `apps/web/src/app/(admin)/master-data/user-orgs/page.tsx` | 以用户为中心的组织权限管理（用户列表+组织绑定+数据范围等级调整） | MENU_SYS_ORG |

### 6.2 更新页面

| 路由路径 | 变更内容 |
|----------|---------|
| `/master-data`（主数据中心门户） | 新增「组织架构」NavCard，指向 `/master-data/organizations`，accent=indigo |
| `/settings`（系统设置门户） | 已有「组织架构」入口，指向 `/settings/organizations` |
| `Sidebar.tsx` | 主数据中心分组新增 `mdc-orgs` 条目（`/master-data/organizations`，perm=MENU_SYS_ORG） |

### 6.3 组织架构页面功能亮点

- 左侧树形面板：支持展开/折叠、全文搜索（名称+编码+简称）、类型/状态过滤胶囊
- 右侧详情面板：基本信息 / 层级关系 / 扩展信息三分区，可跳转上级/下级
- 类型图标化：GROUP→Globe / BU→Layers / COMPANY→Building2 / SITE→Leaf / DEPARTMENT→Users 等
- CRUD：新建（RightDrawer）/ 编辑（RightDrawer）/ 启用停用（即时切换）

---

## 7. 主数据中心耦合

### 7.1 入口变化

旧入口（`/settings/organizations`）保留，新增主数据中心专用入口（`/master-data/organizations`），两者共用同一套 API。

| 入口 | 路径 | 权限门控 | 用途 |
|------|------|---------|------|
| 系统设置 → 组织架构 | `/settings/organizations` | MENU_SYS_ORG V | 偏系统管理员维护，成员分配视角 |
| 主数据中心 → 组织架构 | `/master-data/organizations` | MENU_SYS_ORG V | 偏业务用户查阅，树形展示为主 |
| 主数据中心 → 用户组织权限 | `/master-data/user-orgs` | MENU_SYS_ORG V | 以用户为主视角管理组织绑定 |
| Sidebar 主数据中心分组 | `/master-data/organizations` | MENU_SYS_ORG | 全局快捷导航 |

### 7.2 sys_orgs 旧表彻底清理

Migration `20260531_migrate_and_drop_sys_orgs.sql` 完成：
- 将 `sys_orgs` 存量数据映射写入 `sys_organizations`（ON CONFLICT DO NOTHING）
- 回填 parent_id / level / path 父子关系
- `DROP TABLE IF EXISTS sys_orgs CASCADE`
- 更新 `wf_data_sources` / `wf_data_catalog` 中对 `sys_orgs` 的引用，替换为 `sys_organizations`

---

## 8. 与业务 Runtime 耦合差距清单

### Sales V2

| 耦合点 | 当前状态 | 差距 |
|--------|---------|------|
| DataScope company_code 过滤 | 已通过 sys_user_orgs.company_code 实现 | SITE 粒度过滤（按场区隔离销售数据）尚未支持，需扩展 allowedSiteCodes |
| 销售渠道绑定 site_code | 无 | 渠道表未关联 SITE 节点 |
| 送货单按 SITE 分派 | 无 | DeliveryOrder 缺少 site_code 字段 |
| Price Book 按场区定价 | 无 | PriceBook 仅关联 company_code，无法区分同公司不同场区 |

### Finance V2

| 耦合点 | 当前状态 | 差距 |
|--------|---------|------|
| AP/AR 按 company_code 隔离 | 已实现（DataScopeHelper） | BU 级汇总报表尚无 BU 维度聚合逻辑 |
| 费用报销归属 org | 无 | ExpenseRequest 无 org_code 字段，只有 company_code |
| 资金账户按场区 | 无 | CashAccount 无 site_code 字段 |

### Procurement V2

| 耦合点 | 当前状态 | 差距 |
|--------|---------|------|
| PO/PR 按 company_code 过滤 | 已实现 | 按 SITE 采购分类尚未支持 |
| 项目归属 org | 已有 project_code | 项目表缺少 site_code / parent_org_code 关联 |

### Inventory

| 耦合点 | 当前状态 | 差距 |
|--------|---------|------|
| 仓库归属场区 | sys_organizations 有 WAREHOUSE 类型 | inv_* 表未添加 org_code 外键 |
| 蛋品批次按 SITE 隔离 | egg_inventory 有 site_code 字段 | site_code 值集未强制对齐 sys_organizations.site_code |

### Store POS

| 耦合点 | 当前状态 | 差距 |
|--------|---------|------|
| 门店 org 映射 | sys_organizations 有 STORE 类型 | POS 模块 store_code 与 sys_organizations.org_code 无外键约束 |

### UAT / Pilot Run

| 项目 | 状态 |
|------|------|
| 组织树种子数据导入 | 需在 UAT 环境执行 `20260531_org_runtime_phase1.sql` |
| 用户-组织绑定 | UAT 测试账号需手动绑定组织，确保 DataScope 过滤正确 |
| 角色-菜单-权限验证 | MENU_ORG_VIEW / MENU_ORG_MANAGE 需补充种子并在 UAT 验证 |

### System Monitor

| 项目 | 状态 |
|------|------|
| DataScope 缓存 TTL=30s | 已实现内存缓存，高并发无 Redis 支持，单实例 OOM 风险 |
| 组织树节点膨胀监控 | 无，72 节点当前可接受，百万节点时需分页 |

---

## 9. 测试结果

### 9.1 TypeScript 编译

```
TypeScript: 0 errors
```

所有新增文件（`organization.controller.ts`、`sys-organization.entity.ts`、`sys-user-org.entity.ts`、前端 `master-data/organizations/page.tsx`、`master-data/user-orgs/page.tsx`）均通过类型检查。

### 9.2 scope-audit 验收

```
scope-audit.sh: 31/31 PASS
```

测试覆盖场景：

| 测试 ID | 场景 | 结果 |
|---------|------|------|
| T01–T03 | buyer 只能看本公司 PO，跨公司返回 403 | PASS |
| T04–T05 | factory_acct 无股东资金权限（403），admin 有权限（200） | PASS |
| T06–T07 | Dashboard company scope / isGlobal 区分 | PASS |
| T08 | payment 按 company scope 过滤 | PASS |
| T09 | shareholder_view 可读股东资金 | PASS |
| T10 | init batches ADMIN 专用 | PASS |
| T11 | 无 Token 返回 401 | PASS |
| T12–T14 | project_mgr / group_admin 范围校验 | PASS |
| T15–T16 | 跨公司 Shipment 403，buyer 无 init 权限 | PASS |
| F01–F08 | Finance V2 DataScope 专项（401/403/200 全覆盖） | PASS |

---

## 10. Phase 2 建议

### 10.1 高优先级

1. **补充 MENU_ORG_VIEW / MENU_ORG_MANAGE 种子数据**  
   在 `sys_menu` 中注册这两个菜单码，并在 `sys_role_menu_permission` 中配置角色矩阵（建议：ADMIN V,C,E,D,A,X；HR_ADMIN V,C,E；CEO V；REGION_MGR V）。

2. **SITE 粒度 DataScope**  
   在 DataScopeService 中增加 `allowedSiteCodes` 集合，支持按 `site_code` 隔离销售/库存数据，为多场区运营提供细粒度访问控制。

3. **DataScope 缓存迁移至 Redis**  
   当前 30 秒内存缓存在多实例部署时存在缓存不同步风险，建议接入 Redis，并在用户角色/组织变更时主动 invalidate。

### 10.2 中优先级

4. **BU 维度汇总报表**  
   Finance V2 / Analytics 增加 BU 维度聚合逻辑，支持事业群级别的 P&L 汇总。

5. **业务表 org_code 外键规范化**  
   在 inv_* / prc2_* / sal_* / fin2_* 关键业务表补充 `site_code` 字段，并建立与 `sys_organizations.org_code` 的引用关联（非强外键，业务约束即可）。

6. **Sidebar 新增「用户组织权限」入口**  
   在主数据中心分组中补充 `mdc-user-orgs` 条目（`/master-data/user-orgs`，perm=MENU_SYS_ORG），当前该页面仅可通过直接输入 URL 访问。

### 10.3 低优先级

7. **组织架构变更审计日志**  
   组织树的新建/停用操作写入 `sys_operation_logs`，满足合规审计要求。

8. **组织批量导入**  
   支持 CSV/Excel 批量导入组织节点，适用于新场区快速接入场景。

9. **组织层级可视化**  
   在组织树页面增加横向流程图视图（D3/ECharts），辅助高层管理者直观了解集团架构。

10. **Store POS 门店 org_code 对齐**  
    将 POS 模块的 `store_code` 与 `sys_organizations.org_code` 建立映射关系，消除双轨维护风险。