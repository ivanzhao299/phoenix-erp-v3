# Chanjet P0-P5 Runtime Current State

Generated: 2026-07-20T02:11:07.327Z

Decision: HOLD

Evidence: RUNTIME_CURRENT_STATE

|Phase|Title|Status|Score|Next action|
|---|---|---|---:|---|
|P0|全量只读镜像基线|HOLD|54|CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR|
|P1|财务 Read Model 与卡片权威|READY_WITH_CONDITIONS|25|CHANJET_REPORT_ENDPOINT_PARAMETER_REPAIR|
|P2|公司/往来/科目/项目/资金账户映射|READY_WITH_CONDITIONS|14|CHANJET_P2_MASTER_DATA_MAPPING_REVIEW|
|P3|普通业务页面无感融合|READY_WITH_CONDITIONS|25|KEEP_ADMIN_MIDDLE_LAYER_HIDDEN_AND_PROMOTE_SAFE_READ_MODELS|
|P4|增量同步、SLO、漂移与失败告警|READY|100|KEEP_SCHEDULED_READONLY_SYNC|
|P5|凭证写回准备（外部写入关闭）|READY_WITH_CONDITIONS|90|KEEP_CHANJET_WRITE_HOLD_UNTIL_SEPARATE_APPROVAL|

## Blockers

- 缺失 12 个只读镜像目标

## Conditions

- 财务卡片权威覆盖 25%，未就绪卡片继续使用 ERP 主值
- 差异中心仍有 10 个非 OK/WARN 项
- P0 财务 read model 仍有 6 个阻断项

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- This audit performs no migration, DB write, push, or deploy.

Stale evidence policy: docs/ops/runs 中带 latest 的历史文件只作为当时审计快照；当前判断必须读取本端点 generatedAt 对应的实时数据库证据。
