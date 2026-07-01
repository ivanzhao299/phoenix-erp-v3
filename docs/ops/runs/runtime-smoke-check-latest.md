# Runtime Smoke Check

Generated at: 2026-07-01T10:54:20.534Z
Base URL: https://erp.eggslao.com
API URL: https://erp.eggslao.com
Decision: GO

## Summary

- PASS: 27
- WARN: 0
- FAIL: 0

## Checks

| status | check | detail |
|---|---|---|
| PASS | static:/uat | file=apps/web/src/app/(admin)/uat/page.tsx |
| PASS | static:/system/health | file=apps/web/src/app/(admin)/system/health/page.tsx |
| PASS | static:/system/alerts | file=apps/web/src/app/(admin)/system/alerts/page.tsx |
| PASS | static:/dashboard | file=apps/web/src/app/(admin)/dashboard/page.tsx |
| PASS | static:/mobile/device | file=apps/web/src/app/(mobile)/mobile/device/page.tsx |
| PASS | static:/procurement2/payments/new | file=apps/web/src/app/(admin)/procurement2/payments/new/page.tsx,apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx |
| PASS | static:/workflow/monitor | file=apps/web/src/app/(admin)/workflow/monitor/page.tsx |
| PASS | static-attachment:apps/web/src/app/(admin)/store-payment/page.tsx | - |
| PASS | static-attachment:apps/web/src/app/(admin)/procurement2/orders/page.tsx | - |
| PASS | static-attachment:apps/web/src/app/(admin)/procurement2/requests/page.tsx | - |
| PASS | static-attachment:apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx | - |
| PASS | static-attachment:apps/web/src/app/(admin)/finance2/reimbursements/page.tsx | - |
| PASS | http-page:/uat | url=https://erp.eggslao.com/uat; http_status=307 |
| PASS | http-page:/system/health | url=https://erp.eggslao.com/system/health; http_status=307 |
| PASS | http-page:/system/alerts | url=https://erp.eggslao.com/system/alerts; http_status=307 |
| PASS | http-page:/dashboard | url=https://erp.eggslao.com/dashboard; http_status=307 |
| PASS | http-page:/mobile/device | url=https://erp.eggslao.com/mobile/device; http_status=307 |
| PASS | http-page:/procurement2/payments/new | url=https://erp.eggslao.com/procurement2/payments/new; http_status=307 |
| PASS | http-page:/workflow/monitor | url=https://erp.eggslao.com/workflow/monitor; http_status=307 |
| PASS | api:/api/health | url=https://erp.eggslao.com/api/health; http_status=200 |
| PASS | api:/api/v2/sales/health | url=https://erp.eggslao.com/api/v2/sales/health; http_status=200 |
| PASS | api:/api/system/monitor/health | url=https://erp.eggslao.com/api/system/monitor/health; http_status=401 |
| PASS | api:/api/system/alerts | url=https://erp.eggslao.com/api/system/alerts; http_status=401 |
| PASS | api:/api/uat/readiness | url=https://erp.eggslao.com/api/uat/readiness; http_status=401 |
| PASS | api:/api/workflow/my-tasks | url=https://erp.eggslao.com/api/workflow/my-tasks; http_status=401 |
| PASS | api:/api/v3/iot/devices/sync-health | url=https://erp.eggslao.com/api/v3/iot/devices/sync-health; http_status=401 |
| PASS | api:/uploads/contracts/__phoenix_runtime_smoke_probe__ | url=https://erp.eggslao.com/uploads/contracts/__phoenix_runtime_smoke_probe__; http_status=404 |
