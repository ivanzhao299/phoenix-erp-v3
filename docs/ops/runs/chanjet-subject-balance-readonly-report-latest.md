# Chanjet Subject Balance Readonly Report Audit

Generated: 2026-07-06T01:21:34.436Z
Decision: GO_WITH_CONDITIONS

## Checks
- PASS api_service_method: Backend readonly statement report service exists
- PASS api_endpoint: Backend endpoint is exposed behind Chanjet menu guard
- PASS web_tab: Frontend Chanjet integration page includes readonly report tab
- PASS web_endpoint_call: Frontend loads subject balance readonly report endpoint
- PASS readonly_guardrails: Readonly guardrails forbid Chanjet write, voucher push, ERP overwrite, and migration

## Guardrails
- Chanjet write: false
- Voucher push: false
- ERP business overwrite: false
- Migration: false
- Deploy: false

Next action: Run API/Web typecheck and W5 gate, then keep Chanjet data readonly while finance cards are reconciled.
