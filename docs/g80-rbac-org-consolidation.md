# G80 — 用户 / 角色 / 权限 / 数据范围 / 组织 治理整合重构方案

> 状态：**待用户审批**（2026-06-10）
> 目标：终结"用户创建 / 角色分配 / 数据范围 / 所属组织"这套操作散落重复、新旧混杂的历史欠账。
> 原则：**真重构、不缝补**；后端基本不动（已是健康单套 V3），重灾区在前端信息架构。

---

## 一、问题陈述

同一件事散在 8 个前端页，用户不知道去哪做、同一张表被多页改、新旧两套并存。根因：这套权限/组织治理**没有随 V2/V3 做信息架构收口**，只是不断新增页面叠加。

---

## 二、审计结论（三路审计综合）

### 2.1 🟢 后端：健康，单套 V3 实现，无重复（不用大改）

| 模块 | 职责 | 状态 |
|---|---|---|
| `auth` | 登录 + 权限三路合并（角色直绑 / 角色权限集 / 用户权限集，DENY 覆盖 GRANT，按 approval_level 优先级） | V3 单套 ✅ |
| `permissions` | 角色 / 菜单 / 权限矩阵 / 权限集 / 岗位冲突 | V3 单套 ✅ |
| `org` | 组织树 + 用户-组织绑定 + DataScope 解析 | V3 单套 ✅ |
| `master/system-users` | 用户 CRUD | ⚠️ 与 auth 职责交叠 |

**权限即时生效**：`sys_user.perms_version` 触发器机制完整（改权限→相关用户版本++→JWT 失效强制重登）。

**表层干净**：旧 `sys_orgs` 已迁移删除；`sys_user.store_code / role / permissions` 三个旧字段已弃用（被 `sys_user_orgs` / `sys_user_role` / `sys_role_menu_permission` 取代）。无新旧重复表。

**后端唯二小欠账**（Phase 4 收口，非必须）：
- 组织双端点：`/api/org/*`（管理视角）vs `/api/organizations/*`（Runtime 视角）—— 选一套为标准。
- 用户管理分散：`auth.service` + `master/system-users.controller` —— 可收成单一 UserService。

### 2.2 🔴 前端：散落 + 重复 + 新旧混杂（本次重构主战场）

| 重复组 | 涉及页 | 改的同一张表 | 问题 |
|---|---|---|---|
| **用户↔组织绑定** | `/settings/users` + `/master-data/user-orgs` | `sys_user_orgs` | users 能建用户但**设不了数据范围/多组织**；user-orgs 能配范围但**建不了用户**。两套残缺，视角割裂 |
| **角色权限** | `/settings/roles` + `/settings/permissions` | `sys_role_menu_permission` | 一个矩阵 UI、一个行列表，重复入口 |
| **组织管理** | `/master-data/organizations`(V2 95分) + `/master/orgs`(V1 30分🚨) | `sys_organizations` | 新旧两套，旧版裸奔 |
| **数据范围概念** | `users` + `user-orgs` + `/settings/data-scopes` 三处 | 多表 | 三层模型没说清，散着配 |

**样式现状**（V2 化完成度）：data-scopes 95% / organizations 95%（标杆）；users 85% / roles 85% / permissions 75% / user-orgs 85%；**`/master/orgs` 30%（V1 裸奔，应废）**。"裸奔感"主要来自旧页与散落不一致，多数页其实已 V2。

---

## 三、三层数据范围模型（治"数据范围概念混淆"，写清楚）

用户"能看到什么数据"由**三层**共同决定，缺一不可：

```
第1层｜功能权限（能不能进这个菜单/能不能改）
  sys_user_role → sys_role → sys_role_menu_permission(perm_codes V/C/E/D/A/X)
  决定：用户对某菜单有没有 查看/新增/编辑/删除/审批/导出 权限

第2层｜数据范围等级（在有权限的前提下，看多大范围）
  sys_data_scopes(role_code × module_code → scope_type)  ← 角色级默认规则
  ∪ sys_user_orgs.data_scope_level                       ← 用户在某组织的范围
  范围档：SELF < PROJECT < COMPANY < REGION < GROUP

第3层｜组织归属（范围落到哪些具体组织/项目/仓库/场站）
  sys_user_orgs(用户绑哪些组织, is_primary 主组织)
  ∪ sys_user_project_scopes / sys_user_warehouse_scopes / sys_user_farm_scopes(跨组织额外授权)
  由 DataScopeService 按 scope_level 在组织树上展开
```

**计算口径**（后端 DataScopeService 已实现）：
- ROLE_ADMIN / GROUP → isGlobal（全局）
- 否则取 `sys_data_scopes` 的角色×菜单 scope_type 为准，无配置时回落 `sys_user_orgs.data_scope_level`
- 按 scope_level 在 `sys_organizations` 树展开（REGION 穿透同父公司，COMPANY 含其下场站），再并入 project/warehouse/farm 额外授权
- 结果写入 CLS，业务 service 读 CLS 做 `WHERE x IN (...)`

> 整合后此模型在三个相关页的 PageHeader 副标题 / 帮助文案统一引用，避免再混淆。

---

## 四、整合目标（信息架构：全收进系统设置中心）

### 4.1 目标菜单结构

**改造前**（散落）：
```
主数据中心
  ├─ 组织架构 (organizations, V2✅)
  ├─ 用户组织权限 (user-orgs)        ← 要并走
  └─ 各档案…
系统设置中心
  ├─ 用户管理 (users)                ← 要并入"用户管理(新)"
  ├─ 角色与权限 (roles)              ← permissions 并进来
  ├─ 权限配置 (permissions)          ← 删，并入 roles
  ├─ 数据范围 (data-scopes)
  └─ 系统参数 / 安全策略 / 审计日志…
(遗留) /master/orgs                   ← 删，重定向
```

**改造后**（收口）：
```
系统设置中心  ▸ 用户与权限治理（一个中心、清晰分工）
  ├─ 用户管理      ← users + user-orgs 彻底合并：建用户 / 多角色 / 多组织绑定 / 每组织数据范围 / 主组织  一站式
  ├─ 角色与权限    ← roles + permissions 合并：角色 CRUD + 权限矩阵(VCEDAX) + 岗位冲突
  ├─ 数据范围规则  ← data-scopes：角色×菜单 scope_type（保留，标杆样式）
  ├─ 系统参数 / 安全策略 / 审计日志 / …（不动）
主数据中心
  └─ 组织架构 (organizations) 保留   ← 组织树本身是主数据；用户管理页跨链到它
     （移除"用户组织权限"入口）
```

> 说明：**组织树的增删（组织架构）作为主数据留在主数据中心**最自然；而"把用户绑到组织/设范围"属运营操作，收进系统设置中心的"用户管理"。若你要连组织架构也搬进系统设置中心，Phase 3 一并处理（菜单项 route 改指即可，页面不动）。

### 4.2 各页归并去向

| 现页 | 去向 | 动作 |
|---|---|---|
| `/master/orgs` | ❌ 删 | 重定向 `/master-data/organizations` |
| `/settings/permissions` | ❌ 删 | 能力并入 `/settings/roles`（矩阵 UI 已覆盖；补"按菜单快速搜索编辑"替代行列表） |
| `/settings/users` | ♻️ 升级为"用户管理(新)" | 合并 user-orgs 能力 |
| `/master-data/user-orgs` | ❌ 删 | 能力并入"用户管理(新)"；菜单移除 |
| `/settings/roles` | ✅ 保留增强 | 吸收 permissions |
| `/settings/data-scopes` | ✅ 保留 | 样式标杆，仅补三层模型说明 |
| `/master-data/organizations` | ✅ 保留 | 唯一组织入口 |

---

## 五、分阶段重构步骤

### Phase 1 — 低风险去重清理（先做，立竿见影）
1. `/master/orgs`：页面体替换为 `redirect('/master-data/organizations')`；Sidebar 移除该入口。
2. `/settings/permissions`：Sidebar 入口下线；页面保留为重定向到 `/settings/roles`（或加横幅"已并入角色与权限"）。
3. `/settings/roles`：补"按菜单搜索 + 批量授权"，替代 permissions 行列表能力。
4. 验证：web tsc 0 + 自测三页跳转/合并正常。

### Phase 2 — 用户管理彻底合并（核心）
5. 以 `/settings/users` 为基座，重构为统一"用户管理"页：
   - 左：用户列表（搜索 / 角色筛选 / 状态）— 用全局 `Panel`+`SearchInput`+`SelectField`
   - 右：选中用户详情 = **基本信息 + 多角色(主角色) + 多组织绑定(每条:组织/数据范围等级/主组织) + 跨组织额外授权(项目/仓库/场站)**
   - 表格统一 `DataTableV3`；单元格用 `inlineBadge`/`badgeButton`(已建) 等 design-system token
   - 接口复用：`/api/system/users*`（用户 CRUD）+ `/api/org/user-orgs*`（组织绑定）+ `/api/org/user-scopes*`（额外授权）
6. `/master-data/user-orgs`：能力确认全部迁移后删除 + Sidebar 移除。
7. 验证：web tsc 0 + 自测建用户→分角色→绑多组织→设范围 全链路。

### Phase 3 — 数据范围 / 组织 收口 + 样式统一
8. `/settings/data-scopes`：PageHeader 副标题引用"三层数据范围模型"；样式已 95% 保持。
9. 三个相关页统一帮助文案（指向本文档三层模型）。
10. 全部相关页统一套 V2 全局组件，消除"裸奔/不一致"。

### Phase 4 — 后端小整合（可选，收尾）
11. 组织双端点择一为标准，另一标 deprecated。
12. 用户管理逻辑收成单一 `UserManagementService`（auth + system-users 去交叠）。

---

## 六、验证与风险

- **每阶段**：`cd apps/web && tsc --noEmit` 0 错 + 浏览器自测关键链路 + 截图。
- **风险点**：用户管理合并涉及多接口编排（用户/绑定/授权），Phase 2 单独成阶段、逐能力迁移、删旧页前先确认能力齐全。
- **不破坏**：后端接口与表不动（除 Phase 4 可选），纯前端信息架构收口 + 菜单调整，数据零迁移。
- **已建资产复用**：本轮已抽的全局组件 `Panel / SearchInput / SelectField(filter) / DataTableV3 / inlineBadge / badgeButton` 直接用于合并后的页面，不浪费。

---

## 七、产出物
- 本方案：`docs/g80-rbac-org-consolidation.md`
- 每阶段：一次 commit（`feat/refactor: g80-x …`）+ 自测截图
- 完成后更新 `docs/master-data-style-guide.md` 的菜单/页面归属
