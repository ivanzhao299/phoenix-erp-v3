# Production 95 Cleanup Batch: Alert Human Reachability

Generated at: 2026-07-02

## Objective

Close the observability gap where `sys_alerts` can collect API/PG/Cron/IoT failures but the platform still needs repeatable proof that alerts can reach a responsible human or operator surface.

## New Capability

- Script: `scripts/ops/alert-human-reachability-smoke.mjs`
- Output JSON: `docs/ops/runs/alert-human-reachability-latest.json`
- Output Markdown: `docs/ops/runs/alert-human-reachability-latest.md`
- CI manual target: `alert-human-production`

The script verifies:

1. `SysAlertsService.createAlert()` calls `notifySystemMonitorWatchers()`.
2. Non-info alerts create `SYSTEM_ALERT` station notifications.
3. Recipients are derived from active users with `MENU_SYS_MONITOR:V`.
4. The delivery health endpoint exists and is guarded by `MENU_SYS_MONITOR:V`.
5. With `PHOENIX_SMOKE_TOKEN`, `/api/system/alerts/delivery-health` can prove active monitor recipients and recent delivery evidence.

## Current Result

Local execution completed without an approved smoke token.

- Static source checks: PASS.
- Runtime delivery-health check: WARN because `PHOENIX_SMOKE_TOKEN` is not present.
- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Push executed: No.

## Remaining Gap

Production-grade observability still needs one approved smoke token or CI secret that can read `MENU_SYS_MONITOR:V` and call `/api/system/alerts/delivery-health`. Until then, the system can prove the source code path but not the live recipient count from CI.

## Next Step

Add `PHOENIX_SMOKE_TOKEN` as a CI secret for an operator/test account with `MENU_SYS_MONITOR:V`, then run:

```bash
node scripts/ops/alert-human-reachability-smoke.mjs --base-url=https://erp.eggslao.com --strict
```

## Conclusion

`GO_WITH_CONDITIONS`: the reachability smoke is available and static checks pass. Live human-recipient proof remains blocked on approved credentials.
