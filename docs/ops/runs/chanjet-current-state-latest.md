# Chanjet P0-P5 Runtime Current State

Generated: 2026-07-21T02:43:19.844Z

Decision: GO_WITH_CONDITIONS

Evidence: RUNTIME_CURRENT_STATE

|Phase|Title|Status|Score|Next action|
|---|---|---|---:|---|
|P0|全量只读镜像基线|READY|100|KEEP_SCHEDULED_READONLY_SYNC|
|P1|财务 Read Model 与卡片权威|READY|100|CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW|
|P2|公司/往来/科目/项目/资金账户映射|READY|100|CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE|
|P3|普通业务页面无感融合|READY|100|KEEP_ADMIN_MIDDLE_LAYER_HIDDEN_AND_PROMOTE_SAFE_READ_MODELS|
|P4|增量同步、SLO、漂移与失败告警|READY|100|KEEP_SCHEDULED_READONLY_SYNC|
|P5|凭证写回准备（外部写入关闭）|READY_WITH_CONDITIONS|90|KEEP_CHANJET_WRITE_HOLD_UNTIL_SEPARATE_APPROVAL|

## Blockers

- None

## Conditions

- 财务卡片权威覆盖 63%，未就绪卡片继续使用 ERP 主值
- 差异中心仍有 4 个非 OK/WARN 项

## Guardrails

- Chanjet write/delete/modify: disabled.
- Voucher push: disabled.
- ERP business overwrite: disabled.
- This audit performs no migration, DB write, push, or deploy.

Stale evidence policy: docs/ops/runs 中带 latest 的历史文件只作为当时审计快照；当前判断必须读取本端点 generatedAt 对应的实时数据库证据。
