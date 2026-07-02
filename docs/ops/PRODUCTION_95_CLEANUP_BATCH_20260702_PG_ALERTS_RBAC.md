# Production 95 Cleanup Batch - PG Parameters / Alert Sources / RBAC Matrix

Date: 2026-07-02
Owner: Codex-Orchestrator
Scope: Approval center, UAT checklist/runtime, system alerts, high-risk RBAC gates

## Objective

Continue production debt cleanup in three areas:

1. Sweep PG parameter type inference risks in Approval Center and UAT checklist/runtime SQL.
2. Strengthen System Alert Center source coverage so real API/PG/Cron/IoT failures enter `sys_alerts`.
3. Run the final atomic role permission matrix check for system settings, approval, finance, and procurement high-risk entrances.

## Changes

### PG Parameter Cast Consistency

Changed files:

- `apps/api/src/modules/workflow/workflow.service.ts`
- `apps/api/src/modules/workflow/workflow-form-runtime.service.ts`
- `apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts`
- `scripts/ci/check-pg-parameter-cast-consistency.mjs`
- `scripts/ci/check-w5-closeout-gate.mjs`

Result:

- Approval/UAT SQL now avoids reusing the same bind parameter once as `::$type` and later as a bare `$n`.
- New CI gate scans workflow and UAT TypeScript SQL templates for this regression class.
- W5 closeout now includes the PG parameter consistency gate.

### Alert Source Coverage

Changed files:

- `apps/api/src/common/filters/all-exceptions.filter.ts`
- `apps/api/src/modules/system-monitor/cron-monitor.module.ts`
- `apps/api/src/modules/system-monitor/services/cron-monitor.service.ts`
- `apps/api/src/modules/iot/iot.module.ts`
- `apps/api/src/modules/iot/iot-sync.service.ts`

Result:

- API 500 remains `API_5XX -> sys_alerts`.
- PG errors now also write `PG_ERROR -> sys_alerts`.
- Cron failures now use `SysAlertsService.createAlert()`, so they reach the append-only ledger and station notification delivery path.
- IoT device threshold events now write `IOT_DEVICE_ALERT -> sys_alerts`.
- IoT per-house sync failures now write `IOT_SYNC_FAILURE -> sys_alerts`.

### RBAC Matrix Reconciliation

Commands:

- `node scripts/ops/audit-role-permission-matrix.mjs --dry-run`
- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `node scripts/ci/check-sensitive-menu-guards.mjs`

Result:

- Role permission matrix audit: PASS, findings 0.
- Menu permission atomicity gate: PASS, findings 0.
- Sensitive controller guard gate: PASS, findings 0.

## Validation

| Command | Result |
|---|---|
| `node scripts/ci/check-pg-parameter-cast-consistency.mjs` | PASS |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `node scripts/check-i18n-keys.js` | PASS |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Boundaries

- DB migration executed: No.
- DB write executed by this batch: No.
- Business data changed: No.
- Production deployment logic changed: No.
- Push/deploy required: Yes, normal CI/CD after merge to `main`.

## Conclusion

GO WITH CONDITIONS.

This batch closes the known PG parameter inference class for Approval/UAT surfaces, makes the Alert Center more operationally useful, and reconfirms the current atomic RBAC matrix is clean in local audit.
