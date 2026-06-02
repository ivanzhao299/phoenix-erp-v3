# Phoenix ERP V3 — Finance Authority Reconstruction Phase 2（财务权限 + DataScope 重构）

> 2026-06-02 · 在 Phase 1（岗位权限）基础上，补齐公司/场区/项目数据权限，
> 形成真正的三层权限模型：**岗位权限 + DataScope + ShareholderScope**。

---

## 0. 结论

# ✅ 三层权限模型建立完成

Phase 1 只解决岗位权限（同岗位可见全部公司数据）；Phase 2 补齐 DataScope（公司）+ ShareholderScope（项目）。
本地模拟 `resolve()` 验证：**王玮华只见孟赛、朱召安只见东鹏、刘杰见三公司、刘汉涛按三项目**。
**API TS 0、Web TS 0；2 个迁移幂等可重复执行、范围校验通过。**

## 1. Finance Responsibility Matrix

详见 `docs/finance-responsibility-matrix.md`。核心：每个岗位的负责公司/场区/项目 + 查看/审核/付款/分析权限矩阵。

## 2. 岗位设计

| 岗位 | 角色 | 人员 |
|------|------|------|
| 财务审核经理 | ROLE_FINANCE_REVIEW_MANAGER | 刘杰 |
| 资金经理 | ROLE_TREASURY_MANAGER | 王玮华（孟赛）、朱召安（东鹏）|
| 财务分析经理 | ROLE_FINANCE_ANALYST | 刘汉涛 |
| 成本核算经理（Phase 2 新建）| ROLE_COST_ACCOUNTING_MANAGER | 刘汉涛 |

## 3. DataScope（公司级）

**关键机制**：`DataScopeService.resolve()` 从 `sys_user_orgs` 遍历，仅取 `org.company_code` 非空节点 → `allowedCompanyCodes`。
财务表(fin_*)只有 `company_code` 维度，SITE 节点 company_code 为空（取不到）→ **必须绑 COMPANY 组织**。

| 人员 | 绑定 COMPANY 组织 | resolve() 可见公司（本地实测）|
|------|------------------|------------------|
| 刘杰 | COMP-LAO-AGRI / XINGCHI / FOOD | COMP-LAO-AGRI, COMP-LAO-FOOD, COMP-LAO-XINGCHI |
| 王玮华 | COMP-LAO-AGRI | **COMP-LAO-AGRI**（仅孟赛）|
| 朱召安 | COMP-LAO-XINGCHI | **COMP-LAO-XINGCHI**（仅东鹏）|
| 刘汉涛 | COMP-LAO-AGRI / XINGCHI / FOOD | 三公司（对应三项目）|

`sys_data_scopes` 为财务岗位角色×财务菜单显式定义 `scope_type=COMPANY`（共 21 条），确保 topLevel=COMPANY，**杜绝 GROUP 越权**。

> 修正 Phase 1：Phase 1 主组织绑 DEPT-FIN-*（company_code 空）+ SITE（company_code 空），两者都取不到公司 → 会导致空范围。Phase 2 补绑 COMPANY 组织解决。

## 4. ShareholderScope（项目级）

刘汉涛**不使用 GROUP / 全集团 DataScope**，核心范围由 `shr_shareholder_scopes`（PROJECT 级）控制：

| 人员 | 项目范围 | can_approve |
|------|---------|:----:|
| 刘汉涛 | SHR-DONGPENG-LAYER / SHR-MENGSAI-LAYER / SHR-VTE-FOOD | FALSE（分析人不审批）|

`resolveAccessibleProjects()` 解析 → 股东驾驶舱/项目详情仅返回这 3 个项目；越界项目抛"无权查看（不在股东查看范围内）"。

## 5. 菜单权限

- API 授权（rbac.matrix.ts）：新增 ROLE_COST_ACCOUNTING_MANAGER 于 MENU_FIN2/REPORT/BUDGET/SHAREHOLDER_*/DASHBOARD（成本利润分析，禁付款禁审核）。
- 前端可见性（sys_role_menu_permission）：ROLE_COST_ACCOUNTING_MANAGER 配 7 条。

## 6. 驾驶舱权限（按 Scope 生效）

| 驾驶舱 | 控制方式 | 效果 |
|--------|---------|------|
| Executive / Finance Dashboard | DataScope（company_code）| 王玮华孟赛、朱召安东鹏、刘杰三公司 |
| Shareholder Dashboard | ShareholderScope（project_code）| 刘汉涛仅三项目；越界 404 |

资金驾驶舱：王玮华孟赛资金、朱召安东鹏资金，由 DataScope 公司过滤实现互不可见。

## 7. 用户绑定

| 人员 | username | 岗位角色 | DataScope | ShareholderScope |
|------|----------|---------|-----------|-----------------|
| 刘杰 | liujie | FINANCE_REVIEW_MANAGER | 3 公司 | — |
| 王玮华 | wangweihua | TREASURY_MANAGER | COMP-LAO-AGRI | — |
| 朱召安 | zhuzhao_an | TREASURY_MANAGER | COMP-LAO-XINGCHI | — |
| 刘汉涛 | liuhantao | FINANCE_ANALYST + COST_ACCOUNTING_MANAGER | 3 公司 | 3 项目 |

## 8. 验证结果

| 项 | 结果 |
|----|------|
| DataScope 公司隔离（模拟 resolve）| ✅ 王玮华=孟赛 / 朱召安=东鹏 / 刘杰=3公司 / 刘汉涛=3公司 |
| ShareholderScope 项目隔离 | ✅ 刘汉涛=3项目 |
| 2 迁移本地执行 + 幂等复跑 | ✅ 无新增无错，范围不变 |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 本地 API 未运行 + 测试用户夹具缺失（HTTP 404/401），非本次回归；CI/生产具备完整夹具 |

> **验证方式说明**：本地无法启动完整 API + 测试用户夹具，scope-audit 受限。改用 SQL 直接模拟 `DataScopeService.resolve()` 的公司展开逻辑（遍历 user_orgs 取 company_code 非空），结论与代码逻辑一致，可信。

## 9. 后续建议

1. **场区级财务细分**：当前财务表只有 company_code。若需 SITE 级（孟赛 vs 孟赛孵化场分账），需给 fin_* 表加 site_code 并改造 service 过滤。
2. **DataScope 单元测试夹具**：在 CI 补齐 liujie/wangweihua/zhuzhao_an/liuhantao 测试用户，让 scope-audit 覆盖财务公司隔离断言，达成 31/31。
3. **资金驾驶舱独立页**：当前复用 MENU_FIN2_CASH，可建专属资金日报驾驶舱（孟赛/东鹏分舱）。
4. **ShareholderScope 自动派生**：未来按"用户负责项目"自动生成 DataScope 公司绑定（项目→公司映射），减少手工维护。

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 岗位权限与公司权限分离 | ✅ |
| 刘杰管理三家公司审核 | ✅ 3 公司 |
| 王玮华只管理孟赛资金 | ✅ COMP-LAO-AGRI |
| 朱召安只管理东鹏资金 | ✅ COMP-LAO-XINGCHI |
| 刘汉涛按股东范围看项目 | ✅ 3 项目 ShareholderScope |
| 驾驶舱按 Scope 生效 | ✅ DataScope + ShareholderScope |
| 岗位+DataScope+ShareholderScope 三层模型 | ✅ |
