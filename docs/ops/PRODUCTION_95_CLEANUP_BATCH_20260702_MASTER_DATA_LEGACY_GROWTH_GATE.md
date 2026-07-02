# Production 95 Cleanup Batch - Master Data Legacy Growth Gate

## Goal

Prevent historical master-data debt from growing while the remaining legacy references are remediated module by module.

## Scope

- Added a machine-readable baseline for known white-list-excluded legacy master-data references.
- Added a CI/W5-compatible growth gate.
- Wired the gate into W5 closeout.
- Removed the remaining `sys_store` backend exposure and switched `/api/master/stores` to `mst_stores`.

## Current Baseline

| Legacy source | Baseline hits | Baseline modules | Priority | Target direction |
|---|---:|---:|---|---|
| brd_farms | 30 | 6 | P1 | sys_organizations SITE/FARM |
| sys_store | 3 baseline / 0 current | 2 baseline / 0 current | P0 | mst_stores / store scope |
| prc2_projects | 10 | 3 | P0 | biz_projects |
| shr_projects | 6 | 3 | P1 | biz_projects + shareholder relation |

## Gate Rule

The gate fails if any legacy source has more total hits or more affected modules than the baseline.

Reductions pass automatically. This lets cleanup continue without constantly editing the baseline.

## Validation Result

- `node --check scripts/ci/check-master-data-legacy-growth.mjs`: PASS
- `node scripts/ci/check-master-data-legacy-growth.mjs --write-report`: PASS
- `node scripts/check-master-data-references.mjs --json`: PASS, `sys_store` white-list-excluded hits reduced to 0.
- `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## Score Impact

| Dimension | Before | After | Why |
|---|---:|---:|---|
| Data layer / migration / consistency | 68 | 74 | Legacy master-data reference growth is now blocked by W5, and `sys_store` legacy exposure is removed. |
| Testing / CI/CD | 84 | 86 | W5 now includes master-data legacy debt regression prevention. |
| Security / RBAC / DataScope | 90 | 90 | No permission-path change in this batch. |

## Next Cleanup

1. Move procurement project lookup fallbacks toward `biz_projects`.
2. Replace read-only health checks that still report `shr_projects` as canonical.
3. Continue shrinking `brd_farms` compatibility references where they are not required for legacy breeding views.
4. Keep current gate enabled so the legacy footprint can only shrink.
