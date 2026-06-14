# G116 角色卡片审计报告（2026-06-14）

> 对生产端「用户角色编辑页」54 张角色卡片做冗余 / 孤儿 / 废弃审计。
> 数据源：生产 sys_user_role 实时使用 + 菜单权限行数 + 代码引用扫描（apps/api+web）。

## 1. 总览

| 判定 | 数量 | 含义 | 处理 |
|------|------|------|------|
| ✅ 在岗使用 | 32 | 有在岗用户持有 | 保留 |
| 🟠 仅停用号持有 | 2 | 仅被 FROZEN 账号引用 | 见下 |
| 🟡 已建未配人 | 19 | 0 用户，但有菜单权限/代码引用（设计内、暂未配人） | 保留为主 |
| ⚫ 已废弃 | 1 | 名称标 [已废弃] | 退役 |
| **合计** | **54** | | |

**关键结论：无真正孤儿卡片**——所有 0 用户角色都仍被菜单权限或代码引用，属"已建未配人"，删之会破坏菜单种子/代码守卫。冗余的本质问题是**展示**而非数据脏。

## 2. 根因：sys_role 无 status 列

`sys_role` 字段＝role_id/role_code/role_name_zh/role_name_lo/role_type/approval_level/description——**无 status/可见性列**。
角色列表页 `settings/roles/page.tsx` 直接 `GET /api/crud/sys_role` **全量无过滤**渲染。
→ 废弃 / 未配人角色无法软隐藏，只能"删"或"永久挂着"，导致编辑页卡片堆积。

## 3. 该处理项

### 3.1 ⚫ ROLE_QC_INSPECTOR「[已废弃] 质检员」
- 0 用户；已被 `ROLE_FARM_QC_INSPECTOR`(养殖场质检员) / `ROLE_QA_STAFF`(质检专员) 取代。
- **但代码仍引用**（治理债）：`packaging-terminal.ts`（任务映射 qc-inspection/exceptions）、`mobile/login` 跳转、`mobile-roles.ts` 别名、`generic-crud.service.ts`（demo 种子）。
- 处理：标记 DEPRECATED + 从编辑页过滤隐藏；代码引用迁移到 `ROLE_QA_STAFF`/`ROLE_LINE_SUPERVISOR` 后再物理删除。

### 3.2 🟠 ROLE_PILOT_MANAGER「试运行负责人」
- 仅被已停用的 `pilot_manager` 持有，UAT 上线遗留 → 建议标 DEPRECATED 隐藏。

### 3.3 🟠 ROLE_BU_FOOD_GM「食品事业群总经理」
- 仅被已停用的 `yue` 持有，但**食品公司筹建中** → 保留（未来配人），不隐藏。

## 4. 🟡 已建未配人（19，保留，部分待决策）

主数据 / 包装 / 质检 / 物流 / 大客 / 应收 / 仓管 / 股东资金 / PDA / HR 等设计内角色，菜单权限与代码均在，属未配人。其中**值得你拍板是否合并**的：

- **主数据 6 个细分角色**（客户/场站/产品/供应商/仓储/资金账户 主数据管理）均 0 用户，而总揽角色 `ROLE_MASTER_DATA_ADMIN`(主数据管理员, 9 菜单权限) + `ROLE_MASTER_DATA_APPROVER`(已配 admin) 已覆盖主数据管理。→ 6 个细分角色是否冗余、可合并进"主数据管理员"？

其余（应收专员/包装工人/车间主任/品控总监/物流调度/大客总监/仓管员/股东资金管理员/PDA/HR/自助订货用户）为真实业务角色，仅当前无人，建议保留。

## 5. 建议处理方案

1. **结构**：`sys_role` 加 `status VARCHAR(16) DEFAULT 'ACTIVE'`（ACTIVE/DEPRECATED）。
2. **数据**：`ROLE_QC_INSPECTOR`、`ROLE_PILOT_MANAGER` 置 DEPRECATED；顺手清理 `ROLE_QC_INSPECTOR` 名称里的 `[已废弃]` 前缀（标志位归 status 管，名称回归"质检员"或直接退役）。
3. **前端**：角色编辑页默认过滤 `status='DEPRECATED'`（加"显示已停用"开关可查）。
4. **代码债**：packaging-terminal 等对 `ROLE_QC_INSPECTOR` 的引用迁移到 `ROLE_QA_STAFF`/`ROLE_LINE_SUPERVISOR`，之后物理删除该角色。
5. **待决策**：主数据 6 细分角色是否合并。
