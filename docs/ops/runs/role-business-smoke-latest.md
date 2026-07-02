# Role Business Smoke

Generated at: 2026-07-02T12:36:25.395Z
Matrix: ROLE_BUSINESS_SMOKE_MATRIX_V1
Base URL: https://erp.eggslao.com
API URL: https://erp.eggslao.com
Decision: SKIP_CREDENTIALS

## Summary

- PASS: 0
- WARN: 0
- FAIL: 0
- SKIP: 8

## Checks

| status | check | detail |
|---|---|---|
| SKIP | credentials | reason=ROLE_SMOKE_CREDENTIALS_JSON or --credentials is not provided |
| SKIP | procurement:profile | reason=missing credentials |
| SKIP | finance:profile | reason=missing credentials |
| SKIP | shareholder:profile | reason=missing credentials |
| SKIP | production-device:profile | reason=missing credentials |
| SKIP | warehouse:profile | reason=missing credentials |
| SKIP | system-monitor:profile | reason=missing credentials |
| SKIP | store-payment-pilot:profile | reason=missing credentials |

## Safety

- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.
