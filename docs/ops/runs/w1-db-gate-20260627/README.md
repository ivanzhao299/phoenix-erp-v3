# W1 DB Gate 执行包 — 2026-06-27

承接 `docs/ops/STAGED_UNFREEZE_AND_DEPLOY_RUNBOOK_20260627.md` 的 **S0/S1**。
**全部为 operator 在生产稳定通道上执行；本会话未运行任何一条（无 prod 通道）。**

## 顺序
1. `00_preflight_readonly.sql` — 只读预检（迁移状态/原子菜单缺口/粗授予基线）。
2. `01_backup_and_apply.sh` — 备份 + apply（默认 DRY-RUN，写段注释；需用户批准解开）。
3. `02_verify.sql` — apply 后绿灯验证（粗授予=0、原子菜单齐、D3 资金子菜单可见）。
4. `03_rollback.md` — 回滚（down() 首选 / 备份恢复兜底）。

## 它做掉哪些遗留
- 一次性覆盖 W1 的②③步：迁移 `1782052418112-RepairRolePermissionMatrixAtomicity` 自带补原子 `sys_menu` 行 + 转授权 + 删 56 条非 ADMIN 粗授予，并含 `MENU_FIN2_CASH_VIEW/TRANSFER`（即 RBAC 审计 D3）。
- 因此 `docs/ops/runs/rbac-parent-clearance-20260627/0{1,2}_*.sql`（本会话早期手写草案）**作废**，统一走本包 + 该迁移。

## 执行前置（不在本会话掌控）
稳定生产 SSH/运维通道 · 生产 DB 写批准 · 备份就位 · apply 后通知受影响用户重登。
