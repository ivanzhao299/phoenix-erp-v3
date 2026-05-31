# 金凤凰控股集团组织架构 — Phoenix ERP V3 主数据规范

> 文档版本：2026-05-31  
> 数据源：`sys_organizations`（唯一权威组织表，`sys_orgs` 已废弃删除）  
> 关联迁移：`20260531_org_runtime_phase1.sql`、`20260531_migrate_and_drop_sys_orgs.sql`

---

## 1. 正式组织树（可视化）

```
金凤凰控股集团 (ORG-GROUP)                          [GROUP, L1, ACTIVE]
├── 集团总部 (ORG-HQ)                               [DEPARTMENT, L2, ACTIVE]
├── 凤凰农业事业群 (BU-AGRI)                         [BU, L2, ACTIVE]
│   ├── 老挝凤凰农业发展有限公司 (COMP-LAO-AGRI)      [COMPANY, L3, ACTIVE]
│   │   ├── 孟赛蛋鸡养殖场 (SITE-MENGSAI-LAYER)      [SITE, L4, ACTIVE]
│   │   │   ├── 孟赛蛋鸡养殖场-生产部   (DEPT-SITE-MENGSAI-LAYER-PROD)
│   │   │   ├── 孟赛蛋鸡养殖场-仓储部   (DEPT-SITE-MENGSAI-LAYER-WAREHOUSE)
│   │   │   ├── 孟赛蛋鸡养殖场-销售部   (DEPT-SITE-MENGSAI-LAYER-SALES)
│   │   │   ├── 孟赛蛋鸡养殖场-财务部   (DEPT-SITE-MENGSAI-LAYER-FINANCE)
│   │   │   ├── 孟赛蛋鸡养殖场-质检部   (DEPT-SITE-MENGSAI-LAYER-QUALITY)
│   │   │   ├── 孟赛蛋鸡养殖场-设备部   (DEPT-SITE-MENGSAI-LAYER-EQUIPMENT)
│   │   │   └── 孟赛蛋鸡养殖场-行政部   (DEPT-SITE-MENGSAI-LAYER-ADMIN)
│   │   ├── 孟赛孵化场 (SITE-MENGSAI-HATCHERY)       [SITE, L4, PLANNED]
│   │   │   └── [7个标准部门，status=PLANNED]
│   │   └── 孟赛有机肥生产厂 (SITE-MENGSAI-ORGANIC)  [SITE, L4, PLANNED]
│   │       └── [7个标准部门，status=PLANNED]
│   └── 老挝金三角特区星驰养鸡场 (COMP-LAO-XINGCHI)  [COMPANY, L3, ACTIVE]
│       └── 东鹏蛋鸡养殖场 (SITE-DONGPENG-LAYER)     [SITE, L4, ACTIVE]
│           ├── 东鹏蛋鸡养殖场-生产部   (DEPT-SITE-DONGPENG-LAYER-PROD)
│           ├── 东鹏蛋鸡养殖场-仓储部   (DEPT-SITE-DONGPENG-LAYER-WAREHOUSE)
│           ├── 东鹏蛋鸡养殖场-销售部   (DEPT-SITE-DONGPENG-LAYER-SALES)
│           ├── 东鹏蛋鸡养殖场-财务部   (DEPT-SITE-DONGPENG-LAYER-FINANCE)
│           ├── 东鹏蛋鸡养殖场-质检部   (DEPT-SITE-DONGPENG-LAYER-QUALITY)
│           ├── 东鹏蛋鸡养殖场-设备部   (DEPT-SITE-DONGPENG-LAYER-EQUIPMENT)
│           └── 东鹏蛋鸡养殖场-行政部   (DEPT-SITE-DONGPENG-LAYER-ADMIN)
├── 凤凰食品事业群 (BU-FOOD)                         [BU, L2, ACTIVE]
│   └── 老挝凤凰食品集团有限公司 (COMP-LAO-FOOD)     [COMPANY, L3, ACTIVE]
│       ├── 万象肉鸡养殖场 (SITE-VTE-BROILER)         [SITE, L4, ACTIVE]
│       │   └── [7个标准部门，status=ACTIVE]
│       ├── 万象屠宰加工厂 (SITE-VTE-SLAUGHTER)       [SITE, L4, ACTIVE]
│       │   └── [7个标准部门，status=ACTIVE]
│       └── 万象饲料厂 (SITE-VTE-FEED)                [SITE, L4, PLANNED]
│           └── [7个标准部门，status=PLANNED]
├── 凤凰商贸事业群 (BU-TRADING)                      [BU, L2, PLANNED]
└── 凤凰供应链事业群 (BU-SCM)                        [BU, L2, PLANNED]
```

**节点统计（当前已初始化）：**

| 层级 | 数量 | 说明 |
|------|------|------|
| GROUP | 1 | 集团根节点 |
| BU | 4 | 事业群（2 ACTIVE + 2 PLANNED） |
| HQ | 1 | 集团总部（type=DEPARTMENT，挂在 GROUP 下） |
| COMPANY | 3 | 法人实体 |
| SITE | 7 | 实体场区（2 ACTIVE + 2 PLANNED + 3 ACTIVE） |
| DEPARTMENT | 49 | 7个标准部门 × 7个SITE（含PLANNED场区） |
| **合计** | **65** | |

---

## 2. 组织编码规则表

| 前缀 | 对应层级 | 格式规则 | 示例 |
|------|----------|----------|------|
| `ORG-` | GROUP / 集团总部 | `ORG-{功能标识}` | `ORG-GROUP`、`ORG-HQ` |
| `BU-` | 事业群（BU） | `BU-{业务领域大写英文}` | `BU-AGRI`、`BU-FOOD`、`BU-TRADING`、`BU-SCM` |
| `COMP-` | 法人公司（COMPANY） | `COMP-{国家}-{业务简称}` | `COMP-LAO-AGRI`、`COMP-LAO-XINGCHI`、`COMP-LAO-FOOD` |
| `SITE-` | 生产场区（SITE） | `SITE-{地名}-{业务类型}` | `SITE-MENGSAI-LAYER`、`SITE-VTE-SLAUGHTER` |
| `DEPT-` | 职能部门（DEPARTMENT） | `DEPT-{所属SITE码}-{部门类型}` | `DEPT-SITE-MENGSAI-LAYER-PROD` |

**编码规则约束：**

- 所有编码全部大写，段落之间用 `-` 分隔，禁止使用下划线 `_` 或空格
- `org_code` 字段为 `sys_organizations` 表的唯一键（`UNIQUE` 约束）
- SITE 编码中地名使用拼音简写（如 `MENGSAI`=孟赛、`VTE`=万象）
- DEPT 编码中部门类型枚举：`PROD`（生产）、`WAREHOUSE`（仓储）、`SALES`（销售）、`FINANCE`（财务）、`QUALITY`（质检）、`EQUIPMENT`（设备）、`ADMIN`（行政）
- 新增节点须先在此文档注册，再执行幂等 SQL 插入

---

## 3. 公司全称与简称规则（严格禁止用简称作正式名称）

| org_code | 法定全称（org_name / org_name_cn） | 允许使用的简称（org_short_name） | 禁止使用 |
|----------|-----------------------------------|----------------------------------|----------|
| `COMP-LAO-AGRI` | 老挝凤凰农业发展有限公司 | 凤凰农业 | ~~老挝农业公司~~、~~凤凰农业公司~~ |
| `COMP-LAO-XINGCHI` | 老挝金三角特区星驰养鸡场 | 星驰养鸡场 | ~~星驰公司~~、~~金三角养鸡场~~ |
| `COMP-LAO-FOOD` | 老挝凤凰食品集团有限公司 | 凤凰食品 | ~~凤凰食品公司~~、~~老挝食品集团~~ |

**使用规则：**

1. **合同、发票、对外文件**：必须使用法定全称（`org_name`），不得缩写
2. **系统界面 UI 标签**：可使用 `org_short_name`，但须在首屏 tooltip 显示全称
3. **代码中的字符串常量**：统一使用 `org_code`（如 `'COMP-LAO-AGRI'`），禁止硬编码中文名称
4. **DataScope 过滤字段**：统一使用 `company_code`，其值必须对应某个 `COMPANY` 类型节点的 `org_code`
5. **报表标题**：使用全称；统计表头可使用 `org_short_name`

---

## 4. site_business_type 定义表

`site_business_type` 字段存储在 `sys_organizations.site_business_type`，仅对 `org_type = 'SITE'` 的节点有效。

| site_business_type 值 | 中文描述 | 适用场区 | 主营业务模块 |
|-----------------------|----------|----------|--------------|
| `LAYER_FARM` | 蛋鸡养殖场 | SITE-MENGSAI-LAYER、SITE-DONGPENG-LAYER | Farm（产蛋记录）、Sales V2（鸡蛋销售）、Egg Inventory（FIFO批次） |
| `HATCHERY` | 孵化场 | SITE-MENGSAI-HATCHERY [PLANNED] | Farm（孵化批次）、WMS（雏鸡入库） |
| `ORGANIC_FERTILIZER` | 有机肥生产厂 | SITE-MENGSAI-ORGANIC [PLANNED] | 生产管理、WMS（成品入库） |
| `BROILER_FARM` | 肉鸡养殖场 | SITE-VTE-BROILER | Farm（肉鸡批次）、Sales V2（活鸡/毛鸡销售） |
| `SLAUGHTER` | 屠宰加工厂 | SITE-VTE-SLAUGHTER | WMS（原料入库/成品出库）、Quality（检疫）、Sales V2（深加工品销售） |
| `FEED_MILL` | 饲料厂 | SITE-VTE-FEED [PLANNED] | 生产管理、采购（原料）、WMS |
| `HQ` | 集团总部（特殊） | ORG-HQ | Finance V2（集团合并报表）、权限管理 |

**扩展规则：**
- 新增 `site_business_type` 值须同步更新本表及 `sys_dict`（dict_type=`SITE_BUSINESS_TYPE`）
- `site_business_type` 值在 `sys_organizations` 表无 CHECK 约束（允许业务扩展），但须与 sys_dict 保持一致

---

## 5. DataScope 组织范围规则

DataScope 是 Phoenix ERP 的多租户数据隔离机制，基于 `sys_data_scopes` + `sys_user_orgs` 联合解析，由 `DataScopeGuard` 注入 CLS（AsyncLocalStorage）。

### 5.1 范围等级定义

| scope_level | 枚举值 | 数据可见范围 | 对应组织层级 | 典型角色 |
|-------------|--------|--------------|--------------|----------|
| 全集团 | `GROUP` | 所有公司、所有场区的全部数据 | GROUP 根节点 | `ROLE_ADMIN`、集团 CFO |
| 事业群 | `REGION` | 同一 BU 下所有兄弟公司的数据 | BU | 事业群总经理 |
| 本公司 | `COMPANY` | 仅本 `company_code` 对应的数据 | COMPANY | 公司总经理、财务经理 |
| 本项目 | `PROJECT` | 本公司 + 本项目编码匹配的数据 | PROJECT（采购用） | 采购员、项目经理 |
| 仅本人 | `SELF` | 仅 `created_by = 当前用户` 的数据 | DEPARTMENT | 普通操作员 |

### 5.2 范围解析逻辑

```
请求进入
  └─ DataScopeGuard.canActivate()
       ├─ 读取 CLS user: { userId, roles, menuCode }
       ├─ roles 包含 ROLE_ADMIN → isGlobal=true，跳过DB查询
       ├─ 查 sys_data_scopes（role_code + module_code）→ 取最高 scope_type
       │   GROUP → isGlobal=true
       │   REGION → 展开同 BU 下所有 company_code（兄弟公司）
       │   COMPANY → 直取 sys_user_orgs.company_code
       │   PROJECT → COMPANY + sys_user_project_scopes.project_code
       │   SELF → 无 company_code 限制，业务层自行过滤 created_by
       └─ 写入 CLS dataScope，供 Service 层 DataScopeHelper 消费
```

### 5.3 DataScope 字段映射

| 业务模块 | DataScope 隔离字段 | 备注 |
|----------|--------------------|------|
| Sales V2（sal_* 表） | `company_code` | 所有 sal_* 表统一 |
| Finance V2（fin_* 表） | `company_code` | AP、AR、Cash、Expense 统一 |
| Procurement V2（prc2_* 表） | `company_code` | 兼有 `project_code` 二级过滤 |
| WMS（wms_* 表） | `company_code` | Guard 已挂，Helper 按需注入 |
| Farm（farm_* 表） | `company_code` | Guard 已挂，实体无显式 company_code 字段（Gap） |
| Workflow（wf_* 表） | `company_code` | 仅 Guard 挂载，datasource 查询未全面过滤 |
| Notification | `company_code` | 推送时按 company_code 路由 |

---

## 6. 用户组织权限规则

### 6.1 sys_user_orgs 字段说明

| 字段 | 类型 | 含义 |
|------|------|------|
| `user_id` | BIGINT | 系统用户 ID |
| `org_id` | BIGINT | 关联 `sys_organizations.id` |
| `is_primary` | BOOLEAN | 是否主岗（一个用户仅一条主岗） |
| `data_scope_level` | VARCHAR | 本行授权的数据范围等级（SELF/PROJECT/COMPANY/REGION/GROUP） |
| `position_title` | VARCHAR | 岗位头衔（如"场区财务主管"） |
| `is_manager` | BOOLEAN | 是否为该组织节点的负责人（影响审批路由） |

### 6.2 分配规则

1. 每个用户至少有一条 `sys_user_orgs` 记录（`is_primary=true`）
2. `data_scope_level` 原则上不超过其挂靠节点的层级（挂 SITE 的用户不应获得 GROUP 范围）
3. 特殊跨公司用户（如集团财务）须将主岗挂在 `ORG-HQ`，`data_scope_level=GROUP`
4. 无 `sys_user_orgs` 记录时兜底逻辑：读取 `user.storeCode`；若为 `'ALL'` 则等同 GROUP 范围（C1 修复，见 `data-scope.service.ts`）
5. `is_manager=true` 的用户会被 `AssignmentResolverService.byOrgManager()` 选作审批人

### 6.3 权限变更流程

```
HR/管理员调整岗位
  → PATCH /api/organizations/:code
  → POST  /api/users/:id/org-assignments
  → DataScopeService.invalidate(userId)   ← 清除 30s 内存缓存
  → 下次请求重新解析 DataScope
```

---

## 7. 与业务 Runtime 耦合方案（差距清单）

以下表格列出各模块与新组织树（`sys_organizations`）的耦合现状及待补差距。

### 7.1 耦合现状总览

| 模块 | DataScopeGuard 挂载 | DataScopeHelper 查询注入 | site_code/org_code 字段 | 与 BU/SITE 层耦合 | 评估 |
|------|---------------------|--------------------------|-------------------------|-------------------|------|
| Sales V2 | 全部 Controller ✅ | services 中 raw SQL 手动注入 ✅ | `company_code`（无 site_code） | 无 BU/SITE 过滤 | 部分耦合 |
| Finance V2 | 全部 Controller ✅ | AP/AR/Cash/Expense 均注入 ✅ | `company_code` | 无 SITE 层 | 良好 |
| Procurement V2 | 全部 Controller ✅ | `DataScopeHelper.buildRawCondition` ✅ | `company_code` + `project_code` | 无 SITE 层 | 良好 |
| WMS | Controller 已挂 ✅ | 实体有 `company_code`，Helper 未系统注入 | `company_code`（部分） | 无 SITE 层 | 有差距 |
| Farm | Controller 已挂 ✅ | 无 DataScopeHelper 注入 | 实体无 `company_code` 字段 | 无 SITE 层 | 有差距 |
| Quality | Controller 已挂 ✅ | 未见 Helper 注入 | 实体情况未确认 | 无 SITE 层 | 待核实 |
| Master Data | Controller 已挂 ✅ | 未见系统注入 | 依赖旧 company_code | 无 SITE 层 | 有差距 |
| Approval Engine | Controller 已挂 ✅ | 按 `company_code` 路由审批人 ✅ | `company_code` | 无 SITE 层 | 良好 |
| Workflow | DataSource Controller 已挂 ✅ | 仅部分查询有过滤 | `company_code` | 使用 `sys_organizations`（org_code） | 部分耦合 |
| Notification | Controller 已挂 ✅ | 按 `company_code` 推送 ✅ | `company_code` | 无 BU/SITE 层 | 良好 |
| Store / POS | Controller 已挂 ✅ | 按 `store_code/company_code` | `company_code` | 无 SITE 层 | 部分耦合 |

### 7.2 重点差距说明

#### Gap-1：Farm 模块无 company_code 字段
- **现状**：Farm 模块的 Controller（`farm.controller.ts`、`farm-egg.controller.ts` 等）已挂载 `DataScopeGuard`，但 farm 实体（`farm_batches`、`farm_daily_records` 等）缺乏 `company_code` 字段，导致 Guard 挂载形同虚设——查询未实际按 DataScope 过滤。
- **影响**：SITE-MENGSAI-LAYER 与 SITE-DONGPENG-LAYER 的养殖数据可能跨场区可见。
- **建议修复**：为 farm_* 表补充 `company_code` 列，并在查询中注入 `DataScopeHelper.applyToQb()`。

#### Gap-2：Sales V2 蛋鸡库存（Egg Inventory）缺少 site_code 过滤
- **现状**：`egg-inventory.controller.ts` 使用 `DataScopeGuard`，但 `sal_egg_inventory` 表按 `company_code` 隔离，未区分同一公司下不同 SITE（如 MENGSAI-LAYER vs DONGPENG-LAYER）。
- **影响**：`COMP-LAO-AGRI` 下的孟赛和东鹏库存数据对同公司用户全量可见。
- **建议修复**：在 Egg Inventory 查询中增加 `site_code` 参数过滤，结合 `sys_user_orgs.org_id` 解析用户可见 SITE。

#### Gap-3：DataScope 范围等级中 BU（事业群）层未完整实现
- **现状**：`DataScopeService` 中 `REGION` 级别通过"查父节点下兄弟公司"实现跨公司聚合，但该逻辑基于旧 `parent_id` 关联，未感知 BU 层（`org_type='BU'`），导致事业群总经理角色无法通过单一 `REGION` scope 覆盖下属多公司数据。
- **建议修复**：`DataScopeService.resolve()` 中 REGION 逻辑改为：查 `sys_user_orgs.org_id` 对应节点的最近 BU 祖先，再展开 BU 下所有 COMPANY 子节点的 `org_code` 作为 `allowedCompanyCodes`。

#### Gap-4：Workflow 数据源（SYS_ORGS）已迁移，配置待验证
- **现状**：`wf_data_sources` / `wf_data_catalog` 中的 `SYS_ORGS` 条目已通过迁移脚本更新为 `sys_organizations`（`valueField=org_code`），但 Workflow 表单中引用该数据源的动态下拉框是否已测试通过尚未确认。
- **建议**：在集成测试中覆盖"选择组织"类型表单字段的渲染和提交逻辑。

#### Gap-5：WMS DataScopeHelper 未系统注入
- **现状**：WMS 三个 Controller（inbound/outbound/inventory）已挂 Guard，但 Service 层无 `DataScopeHelper` 注入证据，查询可能未按 `company_code` 过滤。
- **建议修复**：在 WMS Service 中引入 `DataScopeHelper`，对主列表查询调用 `applyToQb()` 或 `buildRawCondition()`。

### 7.3 修复优先级

| 优先级 | Gap | 影响等级 | 工作量估计 |
|--------|-----|----------|------------|
| P1 | Gap-1：Farm 无 company_code | 高（跨公司数据泄漏） | 1-2天 |
| P1 | Gap-5：WMS Helper 未注入 | 高（跨公司数据泄漏） | 0.5天 |
| P2 | Gap-3：BU 层 DataScope 未实现 | 中（事业群角色权限不准确） | 1天 |
| P2 | Gap-2：Egg Inventory 缺 site_code 过滤 | 中（同公司跨场区可见） | 0.5天 |
| P3 | Gap-4：Workflow 数据源验证 | 低（功能完整性） | 0.5天 |

---

## 附录 A：sys_organizations 核心字段速查

| 字段 | 用途 |
|------|------|
| `org_code` | 全局唯一编码，DataScope 引用键，格式见第2节 |
| `org_name` | 法定全称（用于合同/报表） |
| `org_name_cn` | 中文全称（冗余，与 `org_name` 保持一致） |
| `org_short_name` | 界面简称（用于 UI 标签） |
| `org_type` | `GROUP`/`BU`/`COMPANY`/`SITE`/`DEPARTMENT`/`FACTORY`/`PROJECT`/`WAREHOUSE`/`STORE` |
| `parent_id` | 父节点 ID（自关联），顶层为 NULL |
| `parent_code` | 父节点 org_code（冗余，便于无 JOIN 场景） |
| `company_code` | 所属法人公司的 org_code（COMPANY/SITE/DEPT 节点填写） |
| `site_code` | 所属场区的 org_code（SITE/DEPT 节点填写） |
| `site_business_type` | 场区业务类型（仅 SITE 节点，见第4节） |
| `level` | 层级深度（1=GROUP, 2=BU/HQ, 3=COMPANY, 4=SITE, 5=DEPT） |
| `path` | 祖先路径字符串，如 `/ORG-GROUP/BU-AGRI/COMP-LAO-AGRI/` |
| `status` | `ACTIVE`/`INACTIVE`/`PLANNED` |
| `sort_order` | 同层排序权重 |

## 附录 B：相关文件路径

- 组织树初始化迁移：`apps/api/migrations/20260531_org_runtime_phase1.sql`
- 旧表合并迁移：`apps/api/migrations/20260531_migrate_and_drop_sys_orgs.sql`
- 实体定义：`apps/api/src/modules/org/entities/sys-organization.entity.ts`
- DataScope 服务：`apps/api/src/modules/org/services/data-scope.service.ts`
- DataScope 工具：`apps/api/src/modules/org/helpers/data-scope.helper.ts`
- 组织 API 控制器：`apps/api/src/modules/org/organization.controller.ts`
- RBAC 矩阵：`docs/rbac-matrix.md`