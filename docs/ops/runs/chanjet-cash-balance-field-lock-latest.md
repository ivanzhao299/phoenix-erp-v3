# Chanjet Cash Balance Field Lock Audit

Generated at: 2026-07-20T06:49:34.230Z
Decision: GO_WITH_CONDITIONS
Checks: 5/5

## Checks

- PASS cash-balance-lock-service: Service exposes financeCashBalanceFieldLockOverview.
- PASS cash-balance-lock-endpoint: Controller exposes protected readonly cash balance field lock endpoint.
- PASS exact-gl-balance-contract: Cash balance uses the latest GL_BALANCE 1001/1002 leaf contract.
- PASS read-model-authority-source: Finance read model uses the exact GL cash/bank balance source.
- PASS cash-balance-card-covered: Finance report page still covers the cash balance card in the Chanjet alignment panel.

## Guardrails

- Chanjet write: false
- DB write: false
- Migration: false
- Deploy: false
- Push: false
