# Chanjet Readonly Field Adapter Audit

- generated_at: 2026-07-08T10:31:06.656Z
- source_endpoint: https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters
- decision: GO_WITH_CONDITIONS
- next_gate: CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC
- chanjet_write: false
- voucher_push: false
- auth_source: token

## Summary

- total_adapters: 3
- ready: 2
- partial: 1
- waiting_sample: 0
- hold: 0
- voucher_header_rows: 60
- voucher_line_rows: 160
- counterparty_rows: 120
- field_coverage: 96.6%

## Adapter Status

|adapter|status|sampleRows|missingCriticalFields|nextAction|
|---|---|---|---|---|
|CHANJET_VOUCHER_HEADER|READY|60|none|凭证头字段已可只读展示；仍禁止生成或推送好业财凭证。|
|CHANJET_VOUCHER_LINE|READY|160|none|凭证明细可进入只读对账视图；借贷金额必须继续以字符串/decimal 保留精度。|
|CHANJET_COUNTERPARTY|PARTIAL|120|approved_customer_supplier_mapping|往来单位已可只读展示，但 CUSTOMER/SUPPLIER 映射未达到批准状态；业务页面不得自动采用。|

## Blockers

_none_

## Guardrails

只读适配器只消费 ERP 中间层快照，输出管理员可审查的凭证头、凭证明细、往来单位合同；禁止写好业财、禁止推凭证、禁止静默覆盖 ERP 业务事实。
