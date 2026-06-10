# G76/G77 — RBAC + 组织架构 + 数据范围 权威链路（2026-06-10）

> 本文是"组织架构 → 用户 → 数据范围 → 角色权限"这条线的**唯一权威说明**。
> 解决长期困惑：门店代码是什么、用户范围怎么定、后台在哪维护。

---

## 0. 一句话
**用户能看哪些公司的数据，只由「组织绑定 sys_user_orgs」决定**（用户挂在组织树的哪个节点）。
门店代码(store_code) 已**降级为 POS 门店行级专用**，不再决定公司数据范围。

---

## 1. 完整链路（4 环，全后台可维护）

```
① 组织架构 sys_organizations          【组织架构页 可增删改】
   GROUP → BU → COMPANY(company_code) → SITE → DEPARTMENT
        │  org_type 决定层级；只有 COMPANY 级带 company_code，子组织靠 parent_id 挂上去
        ▼
② 用户↔组织绑定 sys_user_orgs          【新建用户表单"组织绑定" 或 组织成员Tab】
   user_id × org_id × data_scope_level(SELF/PROJECT/COMPANY/REGION/GROUP)
        │  G76 起：新建用户表单直接选"公司/场站"即原子写入(不用再去成员Tab补)
        ▼
③ 数据范围 DataScope                   【代码解析，规则在 sys_data_scopes 可配】
   resolve(): ROLE_ADMIN→全局 | sys_data_scopes GROUP规则→全局
            | 否则展开 sys_user_orgs → allowedCompanyCodes[]
            | 无绑定 → 空(拒绝全部)   ← G76：不再回退 store_code='ALL'→全局
        │  业务 service 用 company_code = ANY(allowedCompanyCodes) 过滤(G71 主数据/G73 组织树已接)
        ▼
④ 角色×菜单权限 sys_role_menu_permission 【角色管理页 矩阵编辑】
   role × menu × perm_codes(V/C/E/D/A/X)
   用户↔角色 sys_user_role(多角色，权限取并集)  【用户管理页 多角色选择器】
```

**菜单可见性 = 角色权限(④)；数据可见范围 = 组织绑定(②→③)。两者正交、各管一维。**

---

## 2. 门店代码(store_code) 到底是什么

| | 真相 |
|---|---|
| 本质 | sys_user 上的**单字段**，POS 收银系统遗留 |
| 现职责(G76后) | **仅 POS 门店行级隔离**(哪个门店的收银数据)。**不再决定公司数据范围** |
| 历史坑 | 曾默认 `'ALL'`，被 DataScope 当"全局"回退 → 新建用户**默认能看所有公司**(安全洞) |
| G76 处理 | DataScope 不再读它；新建默认 `null`；表单标注"POS 专用·可选" |
| **不是** | ❌ 不是公司绑定（公司绑定是 sys_user_orgs） |

---

## 3. 后台维护手册（每环在哪做）

| 要做的事 | 在哪 | 权限 |
|---|---|---|
| 增删改**组织节点**(公司/部门/场站)、设 company_code | 组织架构页 `/master-data/organizations` | MENU_SYS_ORG |
| **新建用户 + 绑公司/场站 + 配角色**（一步到位） | 用户管理页 `/settings/users` 新建 | MENU_SETTINGS_USER |
| 改用户的**组织绑定**（换公司/场站/范围级别） | 用户编辑（选公司即替换）或 组织成员Tab | MENU_SETTINGS_USER / MENU_SYS_ORG |
| 改用户**角色** | 用户管理页 多角色选择器 | MENU_SETTINGS_USER |
| 建/改**角色** + 配菜单权限矩阵 | 角色管理页 `/settings/roles` | MENU_SETTINGS_ROLE |
| 配**数据范围规则**(角色+菜单→范围级别) | `/api/org/data-scopes` | MENU_SYS_ORG |

→ 全链**后台可维护**，不需改代码/迁移。

---

## 4. 新建用户的正确姿势（G76 后）

1. 填 登录名 / 姓名 / 密码。
2. **组织绑定**：选「所属公司」（必选，否则该用户看不到任何公司数据）；可选「所属场站」做更细颗粒。
3. 门店代码：**留空**（除非是 POS 收银员）。
4. 选角色（决定能用哪些菜单功能）。
5. 保存 → 用户被原子挂到组织树，数据范围立即生效。

**例**：孟赛出纳 = 公司选「老挝凤凰农业」+ 场站选「孟赛蛋鸡养殖场」+ 角色「养殖场出纳」→ 只见孟赛/AGRI 的现金数据，看不到万象食品。

---

## 5. G76/G77 改了什么

- **G76 后端**：DataScope 撤 store_code 全局回退（无 org 绑定→空范围而非全局）；POST/PUT /api/users 接 `org_bindings` 原子写 sys_user_orgs；store_code 默认 null。
- **G77 前端**：新建/编辑用户表单加「组织绑定」区（公司+场站下拉）；门店代码标注 POS 专用。

## 6. 遗留 / 后续
- store_code 存量 'ALL' 值（17 用户）现已**对范围无效**（DataScope 不读），保留无害；可后续清洗为 null。
- sys_user.store_code 字段长期可改名 legacy_store_code 或仅 POS 模块读。
- 维度统一：COMPANY=法人实体、SITE=物理场所，已按 org_type 分清。
