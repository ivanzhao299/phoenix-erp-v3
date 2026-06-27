# W1 DB Gate 只读核查包 — 2026-06-27

承接 `docs/ops/STAGED_UNFREEZE_AND_DEPLOY_RUNBOOK_20260627.md` 的 **S0/S1 precheck/verify**。
**全部只读，本会话未运行（无 prod 通道）。**

## 关键事实（360 环境读后修正）

- **apply 不需要手动脚本**：`deploy.yml` 在 mode=api/full（`run_mig=true`）时，部署 job 内**自动**跑
  `MIG_MODE=prod bash scripts/db-migrate.sh`（裸 SQL→`schema_migrations`）+ api 起来后
  `typeorm migration:run`（TS→`migrations` 表，跑所有 pending）。故原 `01_backup_and_apply.sh` 已删（与部署链重复）。
- **W1 真实范围**：TS 尾部 `1782045→1782052` 共 8 条会随下次 api/full 部署自动落盘，含
  `1782052-RepairRolePermissionMatrixAtomicity`（补原子菜单 + 转授权 + 删 56 粗授予 + 含 D3 资金子菜单）。
- **真实风险**：生产 `migrations` 表状态——若为空 → migration:run 从头跑全 20 条 → 撞已存在 schema（R1）。

## 用法（生产稳定通道 + 受控批准下）
1. `00_preflight_readonly.sql` — 部署**前**只读：确认 `migrations`/`schema_migrations` 状态、原子菜单缺口、粗授予基线。
2. （部署链自动 apply 8 条 TS 尾迁移 — 见上，无手动脚本）
3. `02_verify.sql` — 部署**后**只读：粗授予=0、原子菜单齐、D3 资金子菜单可见、ADMIN 未误删。
4. `03_rollback.md` — 回滚（`migration:revert` down() 首选 / 备份恢复兜底）。

## 协作归属
本包为只读核查工具，供 **A6（部署/回滚）+ A5（数据就绪）+ orchestrator** 在受控 Gate 下取证用；
执行（push main / api 部署）属 A6 + 用户触发，需 `agent-inbox/APPROVALS.md` 有 active approval。
