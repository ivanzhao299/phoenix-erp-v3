# G5-A · RBAC 双轨审计报告

生成时间：2026-07-01T04:56:15.318Z

## 结果

LEGACY_MATRIX_UNAVAILABLE。当前工程已不再包含 `apps/api/src/common/guards/rbac.matrix.ts`，说明旧的“静态矩阵 vs DB”双轨 RBAC 审计已过期。

## 当前判断

- `MenuGuard` / `RequireMenu` 已成为主要后端门禁路径。
- 角色权限真相应以 `sys_menu`、`sys_role_menu_permission`、JWT permissions / perms_version、前端菜单解析门禁为主。
- 本脚本不再将缺失的 legacy matrix 视为生产失败；后续应使用 `scripts/ops/audit-role-permission-matrix.mjs` 和 `scripts/ci/check-frontend-menu-gates.mjs`。

## 后续建议

1. 将本脚本保留为 legacy 兼容入口，避免 CI / 人工审计因旧文件缺失误失败。
2. 新增或继续完善 DB-first RBAC 审计，覆盖粗父菜单、角色矩阵、前端功能树、按钮 action-bit。
3. 所有新权限治理以原子菜单码和 DB 授权为准，不再恢复静态矩阵。
