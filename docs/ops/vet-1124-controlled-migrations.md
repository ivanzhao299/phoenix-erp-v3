# 2026-11-24 兽医候选的受控迁移

本次授权对应运行 45352175233、45351436581 中已核实的 11 月 17 日孟赛一舍两行测试库存。GRADE_4 批次 413 和 GRADE_5 批次 415 各 30 枚。审计继续记录原始 HOLD；只有封存候选可获得 `GO_VET_1124_EXACT_CANDIDATE`。历史数据和日报无需修改。旧 modern-schema 授权属于另外一次发布。

## 整合与封存

1. 在整合分支合入全部业务改动和本门禁，在 `scripts/ops/vet-1124-migration.mjs` 的 `units` 中核对完整迁移清单。审定功能对应的清单为 `1795478400000-EggWithdrawalReview`、`1795500000000-VetMaterialAllocation`、`1795500100000-VetMaterialIdentity`。如果最终名称或清单有变化，先审定改动，更新清单和对应测试，再继续。
2. 确认整合工作树干净，审阅相对基线 `44b3e692c18952d7be755114368f15fbcd1d8fba` 的完整 diff，核对三个迁移的源码 blob，完成候选验收。此时 `scripts/ops/vet-1124-reviewed-head` 的内容须为 `PENDING`。
3. 在该整合分支记录审定的完整 HEAD。封存提交仅含这一个文件。

```bash
test -z "$(git status --porcelain)"
git rev-parse HEAD > scripts/ops/vet-1124-reviewed-head
git commit --only -m "chore: seal reviewed veterinary release candidate" -- scripts/ops/vet-1124-reviewed-head
```

4. 用 merge commit 合入 main。门禁要求第一父为上述基线、第二父为封存提交、合并树与封存树一致。若 main 或候选已经变化，应重新审查适用范围。将合并后的完整 SHA 记为 `MERGED_SHA`。
5. 等待该 SHA 的 main push 运行完成。工作流验证 CI Build、CI Security、Web Unit Tests、Production management candidate acceptance 和 CI/CD 的成功结果，核对 API/Web 的构建及 OCI 校验步骤和 digest，并在 runner 上逐项比较 API 编译迁移清单与审定源码。

## Inspect 与 apply

在有生产调度权限的主会话运行。两次均选择 main 和同一个合并 SHA。

```bash
gh workflow run controlled-pending-migration-apply.yml --ref main \
  -f phase=inspect -f approve_production=INSPECT \
  -f expected_main_sha="$MERGED_SHA" -f audit_scope=vet-1124
```

核对 `INSPECT=COMPLETE`、`AUDIT_CONCLUSION=HOLD`、`VET_SCOPED_CONCLUSION=GO_VET_1124_EXACT_CANDIDATE`，以及输出 JSON 中的基线、审定提交、迁移路径和 blob。将本次输出的 `LEDGER_SHA256`、`VET_INSPECTION_SHA256` 原样用于 apply。

```bash
gh workflow run controlled-pending-migration-apply.yml --ref main \
  -f phase=apply -f approve_production=APPLY-PENDING-MIGRATIONS-20261103 \
  -f expected_main_sha="$MERGED_SHA" -f audit_scope=vet-1124 \
  -f expected_before_ledger_sha256="$LEDGER_SHA256" \
  -f expected_vet_inspection_sha256="$VET_INSPECTION_SHA256"
```

Apply 在已有生产互斥锁下核对运行中 API/Web、checkout、三项待迁移和 ledger，按 digest 拉取正式镜像。备份完整解析后，用新的只读快照再次比对审计和 inspect 摘要。迁移后要求 ledger 增量恰好为这三项，随后走既有迁移回执登记。保存本次运行号、备份位置与摘要、三项迁移各自的 `MIGRATION_RECEIPT` 和 `MIGRATION_APPLY=COMMITTED`。应用发布仍走正式发布工作流和对应回执。

任一绑定漂移都会停止本次 apply。如果 DDL 已执行而回执未完成，应保留运行号、备份、schema-first 证据及前后 ledger 交给主会话核查。专项 apply 只接受三项均待执行的状态。

## 本地核验

`node --test scripts/ops/vet-1124-migration.test.mjs` 覆盖封存树、后代、额外迁移、原始与限定结论、CI 和镜像身份及 ledger 增量。已有专用 PostgreSQL 18 副本时，可设置 `VET_1124_SCOPE_PG=1`，在标有 `phoenix.fixture=temp-reversal` 的本地测试容器上运行同一只读审计。

## 11 月 24 日生产备份位置

本次已授权的三项迁移将归档写入 `/data/backups/opt/phoenix-erp-backups/pending-migration-<run>-<attempt>/`。旧入口指向同一目录。工作流核验物理目录、生产数据卷 UUID、挂载和设备号、目录持有人、权限及 ACL。完成归档全量解析后，再次计算 SHA-256 并写入恢复清单。生产 DDL 执行前再次核对归档文件身份与现场预检。

恢复时按正式 apply 运行号查找归档目录的 `backup-receipt.json`，或读取控制目录中的 `vet-1124-migration-backup-<run>-<attempt>.json`。清单载明绝对归档路径、备份 SHA-256、文件大小、TOC 数和迁移前台账摘要。[生产目录和卷核验](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45375273835)
