# Production 95 Cleanup Batch - System Monitor Memory Status

Date: 2026-07-01

## Objective

Fix a production observability debt item where the System Monitor page could show overall status as degraded even when the process had no real memory pressure.

## Finding

The backend health summary previously calculated memory pressure as:

`heapUsed / heapTotal`

For Node.js, `heapTotal` is the currently allocated V8 heap and expands dynamically. It is not the memory ceiling. A small process using 67 MB out of 73 MB allocated heap can look like 92% usage even though the real V8 heap limit is much higher. This created a false "DEGRADED" status on the System Monitor page.

## Remediation

Backend:

- Uses `v8.getHeapStatistics().heap_size_limit` as the V8 heap ceiling.
- Keeps `heapAllocatedPct` as a diagnostic-only value.
- Marks memory pressure only when:
  - RSS >= 1024 MB, or
  - heap used >= 512 MB, or
  - heap used reaches 80% of the V8 heap limit.

Frontend:

- Displays `V8 上限占用` instead of presenting allocated heap as total memory.
- Keeps RSS visible for operational review.
- Uses backend `memory.pressure` when available.

## Files Changed

- `apps/api/src/modules/system-monitor/services/system-monitor.service.ts`
- `apps/web/src/app/(admin)/system/health/page.tsx`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_SYSTEM_MONITOR_MEMORY_STATUS.md`

## Validation

| Check | Result |
| --- | --- |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `node scripts/ci/check-security-regression.mjs` | EXPECTED FAIL: static sensitive-path review required for `system-monitor`; hit was timestamp line, not RBAC/security bypass |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Safety

- Business code changed: yes, monitoring-only backend calculation and frontend display.
- Business workflow changed: no.
- Migration created: no.
- Migration executed: no.
- DB write executed: no.
- Deploy status: pending CI/CD after push.

## Current Conclusion

GO WITH CONDITIONS.

The System Monitor value is now useful for operations: allocated heap fullness no longer downgrades the whole system by itself. Further improvement should add alert delivery targets and recovery-drill evidence, which remain separate observability backlog items.
