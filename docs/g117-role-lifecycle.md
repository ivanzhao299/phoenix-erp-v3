# G117 角色生命周期（治理①）2026-06-15

> 落地 G116 审计建议①：给角色加生命周期，废弃/未配人角色可软停用、从编辑页隐藏而非删除。
> 产出：迁移 + 后端端点 + 角色页 UI。

## 改动

**DB**（`migrations/20260614_g117_role_lifecycle.sql`）
- `sys_role` 加 `status(ACTIVE/DEPRECATED)` + `deprecated_at` + CHECK + 索引。
- 退役 `ROLE_QC_INSPECTOR`（已废弃）、`ROLE_PILOT_MANAGER`（UAT 遗留）。
- 清理 `ROLE_QC_INSPECTOR` 名称 `[已废弃] 质检员` → `质检员`（标志位归 status）。

**后端**
- `PATCH /api/permissions/role/:code/status` { status }：停用/恢复。
- 守卫：超管不可停用；停用前若仍有**在岗用户**持有则拒绝（防掉权）。
- `SysRoleEntity` 补 status/deprecated_at 字段。

**前端**（`settings/roles/page.tsx`）
- 角色列表默认隐藏 DEPRECATED；右上「显示已停用 (N)」开关切换。
- 卡片：已停用置灰 + 「已停用」徽章；操作区加 停用(Archive)/恢复(ArchiveRestore) 按钮。

## 验证
- 本地迁移落库：ROLE_QC_INSPECTOR / ROLE_PILOT_MANAGER = DEPRECATED；名称已清理。
- API tsc 0 error；Web tsc 0 error。

## 后续
- G118 权限集（PBAC 两层模型）；G119 治理面板（矩阵可视编辑 + 正反查 + SoD 授权时拦截）。
- 主数据 6 细分角色是否合并停用 → 待用户决策后用本 status 机制一键停用。
