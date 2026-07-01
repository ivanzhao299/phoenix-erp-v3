# Production 95 Cleanup Batch - Monitoring / Alerts / UAT Pages

Date: 2026-07-01

## Scope

This batch improves the production value and clarity of:

- `/system/health`
- `/system/alerts`
- `/uat` readiness tab

These pages are retained because they support production operations:

- system monitor: live API/DB/process/error/alert status for duty users;
- alert center: append-only operational exception ledger;
- go-live readiness: UAT gate evaluation across issues, training, checklists, and stability.

## Changes

Changed files:

- `apps/api/src/modules/system-monitor/services/system-monitor.service.ts`
- `apps/web/src/app/(admin)/system/health/page.tsx`
- `apps/api/src/modules/uat/services/uat-readiness.service.ts`
- `apps/web/src/app/(admin)/uat/page.tsx`
- `apps/web/src/locales/zh.json`
- `apps/web/src/locales/en.json`
- `apps/web/src/locales/lo.json`

## Fixes

### System Monitor

- Added CPU `totalMs`, `uptimeSec`, and `avgCpuPct` to the health API.
- Changed the card from misleading cumulative CPU milliseconds to average CPU usage.
- Added page-value explanation so duty users understand what the page is for.

### UAT Readiness

- Added readiness metadata:
  - configured checklist count;
  - empty dimensions;
  - blockers;
  - next actions.
- Added an explanation panel describing why the readiness page matters.
- Added warning state when no UAT checklists are configured, so the page no longer looks empty or falsely production-ready.

### i18n

- Added zh/en/lo keys for all new visible text.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- i18n key gate: PASS
- W5 closeout gate: PASS

## Boundaries

- DB write: no.
- Migration: no.
- Business data change: no.
- Production deploy: pending after push via CI/CD.

## Conclusion

GO WITH CONDITIONS.

The pages now explain their operational value and distinguish healthy empty states from missing configuration states. UAT readiness is no longer presented as a meaningful go-live approval basis when module checklists are not configured.
