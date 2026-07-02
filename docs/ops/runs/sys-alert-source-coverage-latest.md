# Sys Alert Source Coverage Gate

- Generated At: 2026-07-02T08:40:12.608Z
- Decision: PASS

| Check | Result | File | Description |
|---|---:|---|---|
| API_5XX_SOURCE | PASS | apps/api/src/common/filters/all-exceptions.filter.ts | Unhandled API 5xx errors create sys_alerts. |
| PG_ERROR_SOURCE | PASS | apps/api/src/common/filters/all-exceptions.filter.ts | PostgreSQL errors create sys_alerts. |
| CRON_FAILURE_SOURCE | PASS | apps/api/src/modules/system-monitor/services/cron-monitor.service.ts | Cron failures create sys_alerts. |
| IOT_DEVICE_ALERT_SOURCE | PASS | apps/api/src/modules/iot/iot-sync.service.ts | IoT threshold device alerts create sys_alerts. |
| IOT_SYNC_FAILURE_SOURCE | PASS | apps/api/src/modules/iot/iot-sync.service.ts | IoT per-house sync failures create sys_alerts. |
| IOT_SYNC_DOWN_SOURCE | PASS | apps/api/src/modules/iot/iot-sync.service.ts | IoT cloud-wide sync outage creates sys_alerts even when using direct SQL fallback. |
| ALERT_DELIVERY_HEALTH | PASS | apps/api/src/modules/system-monitor/services/sys-alerts.service.ts | System alerts expose delivery health and station notification evidence. |
| ALERT_APPEND_ONLY | PASS | apps/api/src/modules/system-monitor/controllers/sys-alerts.controller.ts | Alert center remains append-only: no DELETE endpoint; resolve is one-way. |
| ALERT_MENU_GUARD | PASS | apps/api/src/modules/system-monitor/controllers/sys-alerts.controller.ts | Alert center is guarded by MENU_SYS_MONITOR view/action permissions. |

All required alert sources and delivery constraints are present.
