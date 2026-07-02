# Product Page Smoke

Generated at: 2026-07-02T13:43:33.255Z
Base URL: https://erp.eggslao.com
Decision: GO

## Summary

- PASS: 26
- WARN: 0
- FAIL: 0

## Checks

| status | check | detail |
|---|---|---|
| PASS | static:dashboard | route=/dashboard; files=apps/web/src/app/(admin)/dashboard/page.tsx |
| PASS | static:system-health | route=/system/health; files=apps/web/src/app/(admin)/system/health/page.tsx |
| PASS | static:system-alerts | route=/system/alerts; files=apps/web/src/app/(admin)/system/alerts/page.tsx |
| PASS | static:uat-readiness | route=/uat; files=apps/web/src/app/(admin)/uat/page.tsx |
| PASS | static:inventory-turnover | route=/analytics/inventory; files=apps/web/src/app/(admin)/analytics/inventory/page.tsx |
| PASS | static:sales-inventory-management | route=/sales2/inventory; files=apps/web/src/app/(admin)/sales2/inventory/page.tsx |
| PASS | static:device-monitor | route=/breeding/device; files=apps/web/src/app/(admin)/breeding/device/page.tsx |
| PASS | static:device-ops | route=/breeding/device-ops; files=apps/web/src/app/(admin)/breeding/device-ops/page.tsx |
| PASS | static:procurement-payment-new | route=/procurement2/payments/new; files=apps/web/src/app/(admin)/procurement2/payments/new/page.tsx,apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx |
| PASS | static:procurement-orders | route=/procurement2/orders/new; files=apps/web/src/app/(admin)/procurement2/orders/new/page.tsx,apps/web/src/app/(admin)/procurement2/orders/OrderForm.tsx |
| PASS | static:approval-todo | route=/workflow/tasks/todo; files=apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx |
| PASS | static:shareholder-capital | route=/shareholders/capital; files=apps/web/src/app/(admin)/shareholders/capital/page.tsx |
| PASS | static:mobile-reimbursement | route=/mobile/expenses; files=apps/web/src/app/(mobile)/mobile/expenses/page.tsx |
| PASS | http:dashboard | route=/dashboard; http_status=307 |
| PASS | http:system-health | route=/system/health; http_status=307 |
| PASS | http:system-alerts | route=/system/alerts; http_status=307 |
| PASS | http:uat-readiness | route=/uat; http_status=307 |
| PASS | http:inventory-turnover | route=/analytics/inventory; http_status=307 |
| PASS | http:sales-inventory-management | route=/sales2/inventory; http_status=307 |
| PASS | http:device-monitor | route=/breeding/device; http_status=307 |
| PASS | http:device-ops | route=/breeding/device-ops; http_status=307 |
| PASS | http:procurement-payment-new | route=/procurement2/payments/new; http_status=307 |
| PASS | http:procurement-orders | route=/procurement2/orders/new; http_status=307 |
| PASS | http:approval-todo | route=/workflow/tasks/todo; http_status=307 |
| PASS | http:shareholder-capital | route=/shareholders/capital; http_status=200 |
| PASS | http:mobile-reimbursement | route=/mobile/expenses; http_status=307 |

## Safety

- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.
