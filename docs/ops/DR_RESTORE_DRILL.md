# 灾备恢复演练 SOP（DR Restore Drill）

> P2 评分补强：关掉 `P1-007` 的 "恢复从未演练/HOLD"。配 `scripts/ops/restore-runner.sh`。
> 目标：**证明备份可恢复** + 量化 RTO/RPO，而非只有备份文件。

## 0. 前置
- 备份由 `scripts/ops/backup-runner.sh` 产出（`--format=custom` 的 `*.dump`，含完整性自检）。
- 恢复脚本默认**不碰生产库**：未设 `CONFIRM=RESTORE` 时只做"演练校验"（恢复到一次性临时库后清理）。

## 1. 演练校验（推荐每月一次，零风险，不动任何业务库）
```bash
RESTORE_FILE=/var/backups/phoenix-erp/phoenix_BK-最新.dump \
DB_HOST=<host> DB_PORT=5432 DB_USER=<user> DB_PASSWORD=<pwd> \
scripts/ops/restore-runner.sh
```
- 脚本会：`pg_restore --list` 校验完整性 → 建临时库 `phoenix_drill_<ts>` 试恢复 → 报恢复出的表数 → 删临时库。
- **通过标准**：输出 `✅ 演练成功：临时库恢复出 N 张表`。记录脚本耗时 = 近似 **RTO**。
- **RPO** = 当前时间 − 最近一次 SUCCESS 备份的 `finished_at`（查 `sys_backup_records`）。

## 2. 真实恢复到副本库（验证业务可用）
```bash
RESTORE_FILE=... DB_NAME=phoenix_erp_verify CONFIRM=RESTORE \
DB_HOST=... DB_USER=... DB_PASSWORD=... \
scripts/ops/restore-runner.sh
# 然后把应用指向 phoenix_erp_verify，跑 scripts/smoke-test.sh 冒烟（health/login/401 契约）
```

## 3. 生产恢复（仅重大事故，需双人复核）
- 须显式 `ALLOW_PROD=yes CONFIRM=RESTORE DB_NAME=phoenix_erp`。
- 脚本会**先**对生产库做 `pre-restore_*.dump` safety 备份，再 `pg_restore --clean --if-exists` 覆盖。
- 恢复后立即冒烟；失败则用 safety 备份回退。

## 4. 演练记录（每次填，作为 P1-007 关闭证据）
| 日期 | 备份文件 | 模式 | 恢复表数 | 耗时(RTO) | RPO | 结论 | 执行人 |
|---|---|---|---|---|---|---|---|
| 2026-07-01 | `/tmp/phoenix_erp_dr_20260701-182206.dump`（本地演练临时文件，演练后删除） | 本地隔离 scratch 恢复演练 | 247 | 2s | n/a（本地库未启用 `sys_backup_records`） | PASS | Codex-Orchestrator |

## 5. 待办（本脚本未覆盖）
- 把"演练校验"接入月度 cron + 失败走 P1 告警 webhook（与 sys_alerts 打通）。
- 演练校验跑通后，把 `P1-007` 就绪门禁从 HOLD 改 PASS（附首次演练记录链接）。
