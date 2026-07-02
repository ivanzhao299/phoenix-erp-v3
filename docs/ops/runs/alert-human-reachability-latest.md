# Alert Human Reachability Smoke

Generated at: 2026-07-02T13:00:48.228Z
Base URL: https://erp.eggslao.com
Decision: GO_WITH_WARNINGS

## Summary

- PASS: 8
- WARN: 1
- FAIL: 0

## Checks

| status | check | detail |
|---|---|---|
| PASS | static:notify watchers hook | signal=notifySystemMonitorWatchers |
| PASS | static:station notification type | signal=SYSTEM_ALERT |
| PASS | static:notification table write | signal=sys_notifications |
| PASS | static:monitor menu recipient query | signal=MENU_SYS_MONITOR |
| PASS | static:view permission recipient filter | signal='V' = ANY |
| PASS | static:delivery health service | signal=getDeliveryHealth |
| PASS | static:delivery health endpoint | - |
| PASS | static:delivery health RBAC | - |
| WARN | runtime:delivery-health | reason=missing PHOENIX_SMOKE_TOKEN/SMOKE_TOKEN; static reachability checked only |

## Safety

- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.
