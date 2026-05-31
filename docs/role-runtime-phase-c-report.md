# Phoenix ERP V3 — Role Runtime Repair Phase C 报告

**日期：** 2026-05-31  
**阶段：** Pilot Run 前最后一轮权限治理  
**依据：** 角色与组织运行体系联合审计（Role Runtime Score 51.7 → 目标 ≥85）

---

## 修复总览

Phase C 针对联合审计发现的**三大已验证缺陷**进行根因修复，按依赖顺序执行：

| 子阶段 | 内容 | 状态 |
|--------|------|------|
| C-1 | 安全红线（DataScope 约束 + 越权收敛）| ✅ |
| C-2 | API 可达性（WMS_OP/PKG_OP/QA_STAFF/FACTORY_MGR）| ✅ |
| C-3 | 审批链修正（MENU_APPROVAL → MENU_WORKFLOW）| ✅ |

---

## C-1 安全红线

### C-1.1 修复 sys_user_orgs CHECK 约束（Phase B 落库前置）

**根因：** `data_scope_level` CHECK 仅允许 5 个值，缺 'SITE'/'DEPARTMENT'/'BU'。  
Phase B 写入 'SITE' 触发约束违规 → 整个 DO 块回滚 → 13 个用户绑定全部失败。

**修复：** `20260531_phase_c1_datascope_constraint_fix.sql`
- 扩展 CHECK 约束为 8 个值（含 BU/SITE/DEPARTMENT）
- 同步 role_scope CHECK 约束
- 文件名排序保证在 user_org_bindings 之前执行

**效果：** Phase B 绑定迁移现在能成功落库，精确 DataScope 激活。

### C-1.4 store_code='ALL' 越权收敛

**根因：** `store_code='ALL'` → DataScope isGlobal=true → 集团全局可见。

**修复：** `20260531_phase_c1_storecode_security.sql`

| 用户 | 角色 | 原 store_code | 收敛后 |
|------|------|--------------|--------|
| ajian | 司机 | ALL（🔴安全漏洞）| SITE-VTE-SLAUGHTER |
| fuqiang | 区域督导 | ALL/AREA-VTE | COMP-LAO-FOOD |
| amei | 门店店长 | ALL/STORE-VTE-001 | COMP-LAO-FOOD |
| linhong/liushanjun | 养殖/仓储 | ALL/FARM-MS | COMP-LAO-AGRI |
| wanglejin | 采购 | ALL | COMP-LAO-AGRI |

**保留 ALL**（确需全局，符合职责）：ADMIN/CEO/财务会计/成本会计/出纳（已绑 ORG-HQ）

---

## C-2 API 可达性

### C-2.1 ROLE_WMS_OP（rbac.matrix 零记录 → Sidebar 全空白）

`rbac.matrix.ts`：
- MENU_WMS_VIEW 增加 ROLE_WMS_OP ['V']
- MENU_WMS_INOUT 增加 ROLE_WMS_OP ['V','C','E']

### C-2.2 ROLE_PKG_OP（终端 packaging.controller 校验 MENU_PACKAGING）

`rbac.matrix.ts` MENU_PACKAGING 增加：
- ROLE_PKG_MGR ['V','C','E','D','A']
- ROLE_PKG_OP ['V','C','E']
- ROLE_FACTORY_MGR ['V','C','E','A']

### C-2.3 ROLE_QA_STAFF（质检页走 generic-crud，白名单不含）

`crud.constants.ts` qa_* 表白名单增加 ROLE_QA_STAFF + ROLE_FACTORY_MGR

### C-2.4 ROLE_FACTORY_MGR（首页 /breeding 走 brd_*）

`crud.constants.ts` brd_* 表白名单增加 ROLE_FACTORY_MGR + ROLE_BU_AGRI_GM

---

## C-3 审批链修正（核心缺陷）

**根因（联合审计验证一）：** Phase A 把审批权加到 `MENU_APPROVAL`，  
但全后端**零 controller 使用该码**。真正的审批门是 `workflow-task.controller.ts`  
第 48/54 行 approve/reject 端点的 `MENU_WORKFLOW` 'A' 权限。

**修复：** `rbac.matrix.ts` MENU_WORKFLOW 'A' 权限补充：

升级（原仅 V/V,X → 加 A）：
- ROLE_FIN_ACCT（费用/库存财务步）
- ROLE_FARM_MGR（用药审批链第2步）
- ROLE_STORE_MGR（门店折扣审批链第1步）

新增审批人（原未在 MENU_WORKFLOW 出现）：
- ROLE_VET（用药审批链第1步 vet_review）
- ROLE_QA_MGR（质量异常审批链第1步）
- ROLE_WMS_MGR（库存调整审批链第1步）
- ROLE_LOG_MGR（物流异常审批链第1步）
- ROLE_PKG_MGR（包装异常审批）
- ROLE_SYSOPS（多链审批人）
- ROLE_BU_AGRI_GM / ROLE_BU_FOOD_GM / ROLE_FACTORY_MGR（事业群/场区级审批）

**效果：** 用药/费用/库存/质量/门店折扣/物流 6 条审批链恢复闭环。

---

## 验证结果

- **API TypeScript：** 0 errors ✅
- **scope-audit.sh：** 31/31 PASS ✅

---

## 修复后预期评分

| 维度 | C 前 | C 后（预期）|
|------|------|------------|
| 菜单覆盖率 | 89.3% | 95%+ |
| API 覆盖率 | 78.6% | 95%+ |
| 审批覆盖率 | 42.1% | 90%+ |
| 组织覆盖率 | 46.4% | 70%+（绑定落库）|
| DataScope 覆盖率 | 3.6% | 90%+（约束修复后落库）|
| **Role Runtime Score** | **51.7** | **≥85（预期）** |

---

## C-4 角色治理（已完成）

迁移：`20260531_phase_c4_role_governance.sql`

### C-4.2 事业群总经理改派
审计发现 zhuhuiran/yue 实为事业群负责人却赋 ROLE_REGION_MGR，专属 BU 总经理角色无人使用。
- **zhuhuiran（朱会然，AREA-ZHU）** → 主角色改为 ROLE_BU_AGRI_GM（农业事业群总经理）
- **yue（岳，AREA-YUE）** → 主角色改为 ROLE_BU_FOOD_GM（食品事业群总经理）
- 原 ROLE_REGION_MGR 降为非主角色（保留兼容），role_scope 同步为 'BU'
- 配合 DataScopeService 的 BU 展开逻辑，自动穿透到下属 COMPANY 节点

### C-4.3 近义角色去重（合并，不删除）
保留 rbac.matrix.ts 高频使用的 canonical 角色，废弃角色的用户绑定+权限迁移后标记 [已废弃]：

| 废弃角色 | 合并入（保留）| rbac.matrix 使用频率对比 |
|---------|-------------|------------------------|
| ROLE_GROUP_FINANCE | ROLE_HQ_FINANCE | 0次 → 28次 |
| ROLE_PKG_OPERATOR | ROLE_PKG_OP | 1次 → 4次 |
| ROLE_QC_INSPECTOR | ROLE_QA_STAFF | 1次 → 2次 |
| ROLE_FACTORY_ACCOUNTANT | ROLE_FACTORY_ACCT | 0次 → 14次 |

**保留 ROLE_HR_ADMIN 与 ROLE_HR_MANAGER 两者**（职责不同：前者偏系统权限管理，后者偏组织人事），不合并。

去重逻辑（每对）：
1. 用户绑定迁移：废弃角色的用户改绑 canonical（ON CONFLICT 跳过）
2. 权限迁移：废弃角色的菜单权限并入 canonical（取并集）
3. 标记废弃：role_name 加 [已废弃] 前缀，不 DROP（保兼容历史 Token + 外键）

### C-4.4 规划角色落地
事业群总经理改派后，同步更新 sys_user_orgs.role_scope='BU'，激活 BU 级 DataScope。

---

## 验证（Phase C 全量）

---

## Pilot Run 条件评估

部署本次 Phase C 后（约15分钟），三大阻断项全部解除：
- ✅ 司机超权修复（store_code 收敛 + SITE 绑定落库）
- ✅ WMS_OP/PKG_OP/QA_STAFF 三个 403 角色恢复可达
- ✅ 6 条审批链恢复闭环

**结论：部署生效后具备恢复 Pilot Run 条件。**  
建议首批放行：ADMIN/CEO/PRC_BUYER/DRIVER/CASHIER/QA_MGR/SALES_REP。

---

*生成时间：2026-05-31 | Phoenix ERP V3 Role Runtime Repair Phase C*
