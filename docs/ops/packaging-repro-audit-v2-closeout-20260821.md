# Packaging reproduction audit v2 收口报告（2026-08-21）

## 审查结论

`origin/codex/packaging-repro-audit-20260821`（`f5b7fe91`）不直接合并。原实现存在 workflow 输入直接进入 heredoc SQL、生产写库异常以 400 返回并泄露 PG 原始错误、批次输入校验不足、测试未覆盖异常分级和畸形 payload 等问题。

## v2 修正

- 分支：`codex/packaging-repro-audit-20260821-v2`
- API 写库异常统一为 `InternalServerErrorException`，客户端固定文案为“包装记录写入失败，请稍后重试或联系管理员”；原始 message/stack 仅写服务端日志。
- `batches` 必须是非空数组；每项 `grade` 必须为非空字符串，`boxes`、`eggs` 必须为有限正数。非法输入在触库前返回 400。
- 保持 `PKG-<date>-<suffix>` 编码和 `ON CONFLICT (code) DO NOTHING` 不变。
- workflow 在 Actions runner 与生产远端各做一次时间正则和 `date -d` 语义校验。
- psql 使用 `-v window_start/window_end` 与 SQL `:'window_*'` 引用；heredoc 使用单引号 delimiter。
- 同时启用 `PGOPTIONS='-c default_transaction_read_only=on'` 和 `BEGIN TRANSACTION READ ONLY`。
- schema drift 段只读检查 `pkg_packing_records.shift_id` 与 `grading_codes_json`。
- 首次审计发现生产 `sys_settings` 不具备 `setting_key` 列后，将 MODE 查询改为不依赖列形状的 `to_jsonb` 只读检索。

## 本地验证

- `cd apps/api && ./node_modules/.bin/tsc --noEmit`：0 errors。
- `cd apps/api && ./node_modules/.bin/jest src/modules/bff --silent`：2 suites、28 tests 全过。
- `python3 -c "import yaml; yaml.safe_load(...)"`：workflow YAML 可解析。
- `git diff --check`：通过。

单测覆盖：DB 写入失败为 500 类异常且响应不含原始 PG 错误；空数组、负数、非数值、缺 grade 均为 400 且不触库；正常路径核验 INSERT 参数、汇总值、编码前缀和冲突语义。

## 生产只读审计证据

- 成功 run：<https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32460004410>
- UTC 窗口：`2026-08-19 17:00:00` 至 `2026-08-21 07:44:55`（老挝时间自 2026-08-20 00:00 起）。
- 强制只读与参数化均实际执行，事务以 `COMMIT` 正常结束。
- `shift_id_exists = true`，`grading_codes_json_exists = true`。因此“生产缺这两列”的 schema drift 根因假说被证伪，无需、也不得执行恢复 DDL。
- 窗口内 `pkg_packing_records` 7 条，均可见 `shift_id` 与 `grading_codes_json`；`pkg_handover_records` 5 条。
- `inv_batches` 查询为 0 行：窗口内没有新批次，也没有 `packaging_batch_ref` 指向上述包装记录的批次。
- `inv_ledger` 仅 2 条，均为 `FARM_IN`、`ref_no=HOUSE_CS_03`，与窗口内包装 code 无关。
- MODE 查询 0 行。

证据说明包装提交和交接记录已成功落库，但包装对应的库存批次/台账没有生成。后续治本调查应聚焦包装交接到 `PackagingInventoryIntegrationService` / WMS 统一入账链路的触发条件、运行模式与失败日志，而不是执行 packaging schema 恢复迁移。

## 合并与部署

- `main` 已快进合并 v2，并推送 `8cb008d0`；审计兼容修正 `3a396fb3` 随后已推送 main 与 v2 分支。
- CI/CD run：<https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32459995450>
- 截至本报告提交时，run 状态为 `pending`，production environment 待人工批准；未观察到构建或部署失败。批准后需以该 run 的最终 conclusion 作为生产部署结论。

