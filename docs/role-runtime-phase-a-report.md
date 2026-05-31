# Phoenix ERP V3 — Role Runtime Repair Phase A

**日期：** 2026-05-31  
**阶段：** Pilot Run 前角色运行体系修复（Phase A）  
**前置：** Role Runtime Audit 审计完成，11 个 D 级角色无法使用

---

## 1. 修复背景

《金凤凰ERP角色覆盖矩阵审计报告》发现：

- **26 个角色中 11 个为 D 级（完全无法使用）**
- 主要根因：`rbac.matrix.ts`（API层）与 `sys_role_menu_permission`（数据库/Sidebar层）存在大量不一致
- Sidebar 可见性依赖 JWT payload → 来自数据库，但大量新菜单码（MENU_FIN2/SALES2/WORKFLOW等）未在数据库注册

---

## 2. 修复范围（Phase A 限定）

✅ **本阶段修复：**
- 菜单权限（rbac.matrix.ts + sys_role_menu_permission）
- 审批权限矛盾
- 新增 5 个业务必需角色
- 登录首页路由映射

❌ **不在本阶段：**
- DataScope 类型码不匹配（Phase B）
- sys_user_orgs 精确绑定（Phase B）
- ROLE_DRIVER 安全超权（Phase B，需绑定正确组织范围）
- ROLE_CUSTOMER_B2B（外部系统接入，独立实现）

---

## 3. 菜单修复清单

| 角色 | 修复前 | 修复后 | 关键变更 |
|------|--------|--------|---------|
| ROLE_FIN_ACCT  | Sidebar完全空白 | 财务管理+工作台+审批中心可见 | 新增MENU_FIN2/DASHBOARD/WORKFLOW |
| ROLE_FIN_CFO   | 财务管理不可见  | 财务管理全系列可见 | 新增MENU_FIN2全系列 |
| ROLE_FIN_AR    | Sidebar完全空白 | 应收账款+工作台可见 | 新增MENU_FIN2_AR/DASHBOARD |
| ROLE_FIN_COST  | 仅见生产管理   | 工作台+财务报表可见 | 新增MENU_DASHBOARD/FIN2_REPORT |
| ROLE_QA_MGR    | Sidebar完全空白 | 生产管理+质检可见  | 新增MENU_FARM_DATA（解锁父组）|
| ROLE_QA_STAFF  | Sidebar完全空白 | 生产管理+质检录入  | 新增MENU_FARM_DATA |
| ROLE_PKG_MGR   | 仅见库存（只读）| 生产管理+包装管理  | 新增MENU_FARM_DATA+PKG_MGR+PKG_OP |
| ROLE_PKG_OP    | Sidebar完全空白 | 生产管理+包装录入  | 新增MENU_FARM_DATA+PKG_OP |
| ROLE_LOG_MGR   | Sidebar完全空白 | 销售管理+配送管理  | 新增MENU_SALES2（解锁父组）|
| ROLE_DRIVER    | Sidebar完全空白 | 销售管理+配送任务  | 新增MENU_SALES2+DASHBOARD |
| ROLE_CASHIER   | Sidebar完全空白 | 销售管理+POS收银   | 新增MENU_SALES2（解锁父组）|
| ROLE_STORE_MGR | 销售管理不可见  | 销售管理+POS全链路 | 新增MENU_SALES2系列 |
| ROLE_B2B_MGR   | Sidebar完全空白 | 销售管理+B2B订单   | 新增MENU_SALES2+ORDER |
| ROLE_SALES_REP | Sidebar完全空白 | 销售管理+订单管理  | 新增MENU_SALES2+ORDER |
| ROLE_PRC_BUYER | 采购管理不可见  | 采购管理+审批入口  | 新增MENU_PRC2_MASTER+WORKFLOW |
| ROLE_CEO       | 缺4个模块      | 财务/销售/采购/审批 | 新增MENU_FIN2/SALES2/PRC2/WORKFLOW |
| ROLE_REGION_MGR| 缺财务/销售    | 财务概况+销售+审批  | 新增MENU_FIN2/SALES2/WORKFLOW |

**关键设计发现：**  
Sidebar 菜单组可见 = 用户拥有该组的 `perm` 权限。例如「生产管理」组 `perm="MENU_FARM_DATA"`，  
如果用户没有 `MENU_FARM_DATA` 的任何权限，整个生产管理组（含质检、包装子菜单）全部隐藏。  
这导致 ROLE_QA_MGR/PKG_MGR 等虽有子菜单权限但 Sidebar 空白的根本原因。

---

## 4. 审批权限修复

| 角色 | 问题 | 修复 |
|------|------|------|
| ROLE_PRC_BUYER | MENU_APPROVAL仅V，但采购审批链第1步是该角色 | 升级为V,A；补充MENU_WORKFLOW V,A |
| ROLE_VET       | MENU_APPROVAL缺失，但用药审批链第1步是该角色 | 新增MENU_WORKFLOW V,A |
| ROLE_HQ_FINANCE| MENU_APPROVAL仅V，无法执行审批操作 | 升级为V,A |
| ROLE_QA_MGR    | 无审批权限 | 新增MENU_APPROVAL+WORKFLOW V,A |
| ROLE_PKG_MGR   | 无审批权限 | 新增MENU_APPROVAL+WORKFLOW V,A |
| ROLE_WMS_MGR   | 无MENU_WORKFLOW | 新增MENU_WORKFLOW V,A |
| ROLE_LOG_MGR   | 无MENU_WORKFLOW | 新增MENU_WORKFLOW V,A |
| ROLE_STORE_MGR | 无MENU_WORKFLOW | 新增MENU_WORKFLOW V,A |

---

## 5. 新增角色

| 角色代码 | 中文名 | 类型 | 审批等级 | 用途 |
|---------|--------|------|---------|------|
| ROLE_BU_AGRI_GM | 农业事业群总经理 | MANAGEMENT | 4 | BU-AGRI最高管理 |
| ROLE_BU_FOOD_GM | 食品事业群总经理 | MANAGEMENT | 4 | BU-FOOD最高管理 |
| ROLE_FACTORY_MGR| 场区经理 | PRODUCTION | 3 | 单个SITE管理 |
| ROLE_HR_MANAGER | 人力资源经理 | MANAGEMENT | 2 | 用户/组织管理 |
| ROLE_SALES_MGR  | 销售经理 | SALES | 3 | Sales V2全权管理 |

---

## 6. 修复后角色覆盖评级预测

| 评级 | 预期数量 | 角色 |
|------|---------|------|
| A 完全接入 | 3+ | ROLE_ADMIN, ROLE_CEO, ROLE_FARM_MGR |
| B 部分接入 | 15+ | 所有修复的角色（DataScope待Phase B） |
| C 需待后续 | 3 | ROLE_WMS_OP, ROLE_PDA_OP, ROLE_FIN_COST |
| D 无效 | 1 | ROLE_CUSTOMER_B2B（外部接入另议） |

---

## 7. 验证结果

- **API TypeScript：** 0 errors ✅
- **Web TypeScript：** 0 errors ✅  
- **scope-audit.sh：** 31/31 PASS ✅

---

## 8. 剩余问题（Phase B）

1. **DataScope 类型码不匹配**：ROLE_REGION_MGR(AREA-VTE) vs business表COMP-* 类型不同
2. **sys_user_orgs 未绑定**：大多数角色依赖 storeCode 兜底，需绑定精确组织
3. **ROLE_DRIVER 安全超权**：storeCode=ALL → DataScope isGlobal=true，需绑定到具体场区
4. **ROLE_CUSTOMER_B2B**：外部B2B客户角色，需单独设计接入方案

---

## 9. 是否达到 Organization Runtime 阶段条件

✅ Phase B 可启动条件满足：
- 所有角色有基础菜单入口
- 审批链权限矛盾已解除
- 组织架构 Phase 1 表结构已完成（sys_organizations 等）
- 下一步：为每个角色绑定 sys_user_orgs 正确组织范围，激活精确 DataScope

---

*生成时间：2026-05-31 | Phoenix ERP V3 Role Runtime Repair Phase A*
