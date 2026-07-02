# Production 95 Cleanup Batch - Alert Source Coverage Gate

## Goal

Prevent production observability regressions by making the `sys_alerts` source chain visible to W5 closeout.

## Why

The system already writes real API, PG, Cron, and IoT failures into `sys_alerts`, but this was not protected by a dedicated regression gate. A future refactor could remove one source and the product would silently lose operational visibility.

## Added Gate

New script:

- `scripts/ci/check-sys-alert-source-coverage.mjs`

W5 now checks that:

1. API 5xx errors create `API_5XX` alerts.
2. PG errors create `PG_ERROR` alerts.
3. Cron failures create `CRON_FAILURE` alerts.
4. IoT threshold alarms create `IOT_DEVICE_ALERT` alerts.
5. IoT per-house sync failures create `IOT_SYNC_FAILURE` alerts.
6. IoT cloud-wide sync outage creates `IOT_SYNC_DOWN` alerts.
7. Alert delivery health is exposed and station notification evidence exists.
8. Alert center remains append-only: resolve is one-way, no DELETE endpoint.
9. Alert center remains guarded by `MENU_SYS_MONITOR` V/A permissions.

## Validation

- `node --check scripts/ci/check-sys-alert-source-coverage.mjs`: PASS
- `node scripts/ci/check-sys-alert-source-coverage.mjs --write-report`: PASS
- `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## Score Impact

| Dimension | Before | After | Why |
|---|---:|---:|---|
| Observability / operations | 82 | 85 | Required alert source coverage is now W5-gated. |
| Testing / CI/CD | 86 | 87 | W5 now prevents silent loss of alert generation sources. |
| Security / RBAC / DataScope | 90 | 91 | Alert center V/A menu guard and append-only behavior are now checked by a dedicated gate. |

## Remaining Gap

This gate proves the code paths remain present. The next operations lift still requires real external alert-to-human delivery proof through an approved duty channel.
