# 好业财字段差异 P0 修复报告

日期: 2026-07-03
阶段: CHANJET_FIELD_GAP_P0_REPAIR
结论: GO WITH CONDITIONS

## 1. 本轮目标

在生产端好业财只读镜像已完成、字段差异第一轮复核完成后，修复 ERP 中间层字段分析与实体归一化的 P0 缺陷。

本轮只改 ERP 代码和审计文档，不写好业财，不删除好业财数据，不修改好业财数据，不推送凭证。

## 2. 修改文件

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-integration.service.spec.ts`
- `docs/ops/CHANJET_FIELD_GAP_P0_REPAIR_REPORT_20260703.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`

## 3. 修复内容

### P0-1 API envelope 字段剥离

修复前:

- 好业财响应根字段 `$.code`、`$.msg`、`$.success`、`$.requestId`、`$.validateResult` 等被误当作 ERP 业务字段候选。
- 这些字段大量进入 HIGH 风险缺口，污染字段改造清单。

修复后:

- 根级 API envelope 字段被标记为:
  - `erp_domain = api_metadata`
  - `erp_table = chanjet_read_snapshots`
  - `erp_field = raw_payload`
  - `match_status = MATCHED`
  - `risk_level = LOW`
- 这些字段只作为 raw snapshot 审计元数据，不进入 ERP 业务 schema 改造。

### P0-2 应收/应付统计实体保真 key

修复前:

- 对缺少稳定 `id/code` 的统计类行，fallback externalId 过粗，可能导致同账套同 entityType 下的行被折叠。
- 生产复核发现:
  - `PAYABLE_STATISTICS`: raw 43，entity 2。
  - `RECEIVABLE_STATISTICS`: raw 71，entity 2。

修复后:

- fallback externalId 改为稳定 hash:
  - `entityType:endpointKey:payloadHash:index`
- 对无稳定 id 的统计、凭证、报表类行，至少以原始行内容 hash 区分。
- 后续重新同步后应减少 raw/entity 行数不保真的问题。

### P0-3 客户/供应商映射目标拆分

修复前:

- 客户/供应商候选统一映射到伪表名 `mst_customers/mst_suppliers`。
- 这不是实际 ERP 表，导致字段存在性检查全部缺失。

修复后:

- 明确 customer 字段进入 `mst_customers`。
- 明确 supplier/vendor 字段进入 `mst_suppliers`。
- `custvendor` / `party` 这种混合往来单位先进入 `chanjet_master_mapping`，等待人工确认客户/供应商属性后再拆分。
- 修复了 `custvendor`、`party`、`ar`、`ap` 这类短词误判问题。

## 4. 验证结果

- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS
- `cd apps/api && pnpm exec jest src/modules/chanjet/chanjet-integration.service.spec.ts --runInBand`: PASS
  - 3 tests passed
- `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-freeze-boundaries.mjs`: WARN with explicit override，原因是本轮受控触碰 `apps/api/src/modules/chanjet/**`。
- `ALLOW_SECURITY_TOUCH=true node scripts/ci/check-security-regression.mjs`: WARN with explicit override，原因是本轮受控触碰好业财集成路径。
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## 5. 仍需后续执行

本轮修复已进入代码，但生产端尚未重新部署、尚未重跑只读同步。

下一步建议:

1. 进入 `CHANJET_FIELD_GAP_P0_REPAIR_DEPLOY_GATE`，部署本轮修复。
2. 在生产端重新执行好业财只读镜像同步。
3. 重新生成字段差异统计，验证:
   - envelope 字段不再污染 HIGH 风险候选。
   - 应收/应付统计 entity rows 与 raw rows 更接近真实保真。
   - 客户/供应商目标不再出现 `mst_customers/mst_suppliers` 伪表名。
4. 再进入 ERP schema adaptation plan。

## 6. 边界确认

- 写好业财: 否
- 删除好业财数据: 否
- 修改好业财数据: 否
- 推送凭证: 否
- 生产部署: 否
- production DB write: 否
- migration: 否
- 本轮改业务代码: 否，仅改好业财 ERP 中间层逻辑

## 7. 当前结论

GO WITH CONDITIONS。

P0 修复已完成并通过本地验证；要让生产端字段差异候选生效，需要下一步部署并重跑只读同步。
