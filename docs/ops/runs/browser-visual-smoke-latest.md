# Browser Visual Smoke

Generated at: 2026-07-02T12:55:28.328Z
Base URL: https://erp.eggslao.com
Decision: GO_WITH_WARNINGS
Screenshots: docs/ops/runs/browser-visual-screenshots

## Summary

- PASS: 0
- WARN: 12
- FAIL: 0
- SKIP: 0

## Pages

| status | page | route | screenshot | detail |
|---|---|---|---|---|
| WARN | dashboard | /dashboard | dashboard.png | http=307; auth required; screenshot captured but product page content not visible; text=26 |
| WARN | system-health | /system/health | system-health.png | http=307; auth required; screenshot captured but product page content not visible; text=32 |
| WARN | system-alerts | /system/alerts | system-alerts.png | http=307; auth required; screenshot captured but product page content not visible; text=32 |
| WARN | uat-readiness | /uat | uat-readiness.png | http=307; auth required; screenshot captured but product page content not visible; text=20 |
| WARN | inventory-turnover | /analytics/inventory | inventory-turnover.png | http=307; auth required; screenshot captured but product page content not visible; text=38 |
| WARN | device-monitor | /breeding/device | device-monitor.png | http=307; auth required; screenshot captured but product page content not visible; text=34 |
| WARN | procurement-payment-new | /procurement2/payments/new | procurement-payment-new.png | http=307; auth required; screenshot captured but product page content not visible; text=46 |
| WARN | procurement-orders-new | /procurement2/orders/new | procurement-orders-new.png | http=307; auth required; screenshot captured but product page content not visible; text=44 |
| WARN | approval-todo | /workflow/tasks/todo | approval-todo.png | http=307; auth required; screenshot captured but product page content not visible; text=40 |
| WARN | shareholder-capital | /shareholders/capital | shareholder-capital.png | http=200; expected page signal missing in server response; text=15323 |
| WARN | mobile-device | /mobile/device | mobile-device.png | http=307; auth required; screenshot captured but product page content not visible; text=39 |
| WARN | mobile-expenses | /mobile/expenses | mobile-expenses.png | http=307; auth required; screenshot captured but product page content not visible; text=41 |

## Safety

- Codex CLI executed: No.
- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.
