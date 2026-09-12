# EGG Grade5 apply 实施与演练报告 — 2026-09-12

## 1. 范围与状态

本报告记录 EGG + `GRADE_5` + `PKG_PACK_SPEC_3` 单 canonical SKU apply 闭环的实施审阅与容器演练结果。设计评审文档 `egg-grade5-sku-apply-design-review-20260911.md` 保留其历史评审时点声明，不作回写。

当前状态：**代码与 workflow 已实现，演练 PASS；尚未执行生产 apply、生产 rollback 或任何生产数据库写入。**

## 2. 实施内容

- workflow 支持 `preflight`、`apply`、`dry-run`、`verify`、`rollback-soft`、`rollback-hard`。
- manifest 路径固定为 `scripts/ops/manifests/egg-grade5-candidate.json`。
- 当前 canonical target：`EGG + GRADE_5 + PKG_PACK_SPEC_3`。
- manifest SHA-256：`7e64b7bc8f203c8f8b3ceeb9bce548f85275f228544366bc40b309ad1ac106e9`。
- apply/dry-run/rollback 均经 confirmation token、expected-counts、manifest hash、revision 与受控 remote runner 门禁。
- apply/dry-run 还要求绑定成功的同 workflow preflight run 及其 payload SHA-256。
- SQL bundle 包含 apply、dry-run、verify、soft rollback、hard rollback；remote runner 通过 native SSH 执行并保存结构化 payload、transport log 与审计日志。

## 3. 容器演练证据

演练目录：`docs/ops/runs/packaging-sku-apply-rehearsal-20260912/`。

已完成并通过：

1. before-image fixture 装载；
2. apply 单事务提交；
3. verify 断言 canonical SKU、legacy SKU、总行数及唯一性；
4. soft rollback 后 verify 回到基线；
5. hard rollback 后 verify 回到基线；
6. dry-run 事务末尾 `ROLLBACK`，确认零提交；
7. before/after 差异与影响行数产物归档。

预期基线为 canonical=0、legacy Grade5=7、SKU 总数=26；apply 后 canonical=1、SKU 总数=27；rollback 后精确回到基线。演练全程无生产连接、无生产写入。

## 4. 静态审阅与检查

- manifest hash 重算：PASS。
- `bash -n` 仅用于 shell runner/rehearsal：PASS。
- SQL 文件按 SQL/容器 fixture 口径审阅，不将 SQL 当作 shell 执行。
- `git diff --check`：PASS。
- `node scripts/check-constraint-drift.js`：PASS，0 新漂移；1 条既有 allowlist。
- `node scripts/check-nullable-in-unique.js`：PASS，0 违规；1 条既有白名单。

## 5. 生产门禁与后续步骤

生产 apply 必须先以合并后的新 revision 重新执行且取得唯一一次新的 preflight PASS，并核对该 run 的 payload SHA-256、expected counts、manifest hash 与 revision。preflight 未 PASS 时不得 apply；即使用户已授权闭环执行，也不得绕过 workflow/environment 门禁。

本报告不构成生产 apply 授权，也不记录任何生产写入结果。合并后流程在新 preflight 之前停止。
