# Chanjet Readonly Field Adapter Audit

- generated_at: 2026-07-07T00:34:17.635Z
- source_endpoint: https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters
- decision: HOLD
- next_gate: —
- chanjet_write: false
- voucher_push: false
- auth_source: none

## Summary

- total_adapters: 0
- ready: 0
- partial: 0
- waiting_sample: 0
- hold: 1
- voucher_header_rows: 0
- voucher_line_rows: 0
- counterparty_rows: 0
- field_coverage: 0%

## Adapter Status

_none_

## Blockers

|code|message|
|---|---|
|CHANJET_READONLY_ADAPTER_AUDIT_UNAVAILABLE|HTTP 401 from https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters|

## Guardrails

Readonly audit failed closed. No Chanjet write, no voucher push, no ERP business overwrite.
