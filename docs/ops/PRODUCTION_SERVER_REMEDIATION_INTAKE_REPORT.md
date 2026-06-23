# Production Server Remediation Intake Report

Date: 2026-06-23

## 1. Current Server Nature

Conclusion: READY_FOR_REMEDIATION_PLAN.

The provided server is no longer treated as a mature, stable, hands-off production system for this remediation phase. It is classified as a production-side pre-production / remediation target environment. It exposes the public Phoenix ERP endpoint and runs with `NODE_ENV=production`, but the user has clarified that the environment is not yet a reliable business production baseline.

This intake did not execute any database write, migration, service restart, deploy, push, cleanup, reset, or server-side file modification.

## 2. Server Read-only Inventory Summary

| Area | Evidence | Result |
| --- | --- | --- |
| Server card | `/Users/mac/phoenix-erp/docs/server-connection-card.md` | Received and sanitized in prior intake. |
| Public endpoint | `https://erp.eggslao.com/api/health` | HTTP 200. |
| Runtime env | health response | `env=production`, `db.connected=true`, JWT loaded. |
| SSH read-only command inventory | `ssh -o BatchMode=yes -o ConnectTimeout=8 ...` | Not completed; timed out during banner exchange. |
| OS / CPU / memory / disk | SSH evidence unavailable | Must be collected after connectivity/access stabilization. |
| Docker / compose / process inventory | SSH evidence unavailable | Must be collected before any fix batch. |
| Ports / services | server card + static config only | 22/80/443 public; 3000/3100/5432 localhost-bound by design. |
| Nginx | repository config `nginx/erp.eggslao.com.conf` | Production config includes `/uploads/` direct proxy. |
| Deployment directory | server card | `/opt/phoenix-erp` production path. |

## 3. Current Deployment State

Static evidence from repository and server card:

- Public domain: `https://erp.eggslao.com`.
- Production deploy path: `/opt/phoenix-erp`.
- Production workflow: `.github/workflows/deploy.yml`.
- Production workflow deploy trigger: `push main` plus manual dispatch.
- Docker stack: `phoenix-v3-db`, `phoenix-v3-api`, `phoenix-v3-web`.
- API health endpoint is live and reports DB connected.

Unknown until SSH inventory succeeds:

- Exact server git commit.
- Server worktree dirty state.
- Docker image digests actually running.
- Current `.env` values and drift.
- Container health details beyond public API.
- Whether multiple deployment directories exist.

## 4. Current Database State

Remote DB command inventory was not available because SSH read-only access timed out.

Known from public health:

- API can connect to its configured DB.

Known from local Store Payment governance history:

- Local Store Payment remediation has executed approved local migrations and UAT data setup.
- Remote production-side DB readiness is not yet proven.

Required next evidence:

1. Read-only connection to DB through the server container.
2. `migrations` table history.
3. Store Payment table existence.
4. `file_metadata` existence.
5. `MENU_STORE_PAYMENT*` existence.
6. Store Payment role grant count.
7. `STORE-VTE-001`, `ST-VTE-001`, and `COMP-LAO-AGRI` state.
8. Initialization import count and duplicate/dirty-data scan.

## 5. Migration State

Static deployment workflow indicates API/full deployments may run DB migrations. Current remote migration table state is unknown.

Risk:

- User stated prior data migration already had problems.
- Remote migration state must be audited before any DB write or migration repair.

## 6. Initialization Data State

Remote evidence unavailable in this intake. Existing local reports show the Store Payment path has had multiple gates around missing tables, menu codes, role grants, store-code aliases, and file metadata. The production-side environment must be checked for the same categories before any remediation batch.

## 7. File Storage State

Static evidence:

- Production compose uses `phoenix_uploads -> /app/uploads`.
- Nginx exposes `/uploads/` directly to API static assets.
- Store Payment governance requires no raw URL exposure and protected streaming for proof / QR files.

Unknown until server inventory:

- Actual file permissions.
- Actual upload directory structure.
- Whether Store Payment files are mixed with legacy uploads.
- Whether `storage_path` references are consistent with file metadata.

## 8. Permission / Menu State

Remote DB evidence unavailable. Store Payment local readiness expects:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`
- `MENU_STORE_PAYMENT_EXPORT`
- Store Payment role grants for clerk, manager, finance, admin, super admin.

Remote verification is mandatory before trial use.

## 9. Current Store Payment State

Local/project state:

- Backend and frontend Store Payment gates are GO WITH CONDITIONS.
- Protected attachment endpoint and UI have local UAT evidence.
- Store Payment page entry: `/store-payment`.
- Runtime memory is updated.

Production-side target state:

- Not proven.
- Must be audited before production-side controlled pilot.

## 10. Historical Audit Legacy Issues

Recovered from docs:

1. RBAC/security reports exist under `docs/ops/A2_*`, `docs/g5-*`, `docs/W5_P0_SECURITY_GOVERNANCE.md`.
2. DataScope architecture and role scope reports exist under `docs/g76-*`, `docs/g80-*`, Store Payment A2/A5 reports.
3. Migration governance reports exist under `docs/g36-*`, `docs/g40-*`, `docs/g198-*`, and Store Payment migration gate docs.
4. Master data initialization and governance reports exist under `docs/master-data-*`, `docs/MASTER_DATA_*`, and Store Payment readiness docs.
5. Deployment tiering and rollback docs exist under `docs/deployment-tiers.md`, `docs/ops/ROLLBACK_RUNBOOK.md`.
6. Store Payment has complete local gate history under `docs/ops/STORE_PAYMENT_*`.

## 11. Main Risks

1. SSH inventory timed out; actual server state is not yet observable by the agent.
2. Production workflow deploys on `push main`; accidental push-main remains dangerous.
3. Remote migration state is unknown despite prior migration problems.
4. Remote DB content and initialization import quality are unknown.
5. `/uploads/` direct exposure remains part of production nginx design and must be reconciled with Store Payment protected attachment rules.
6. Store Payment local readiness does not prove production-side readiness.
7. Backup status is unknown.

## 12. Immediately Fixable Items

Docs-only / planning only:

1. Establish remediation backlog.
2. Establish remediation roadmap.
3. Establish first fix batch approval package.
4. Freeze production write actions until backup evidence exists.

Execution items requiring approval:

1. Server access/connectivity stabilization.
2. DB backup.
3. App directory snapshot.
4. Upload/file storage snapshot.
5. Env backup.

## 13. Items Requiring Backup Before Fix

1. Migration history repair.
2. Any DB schema repair.
3. Any initialization data correction.
4. Any menu/role/DataScope write.
5. Any upload/file metadata reconciliation.
6. Any deployment chain rewrite.

## 14. User Confirmation Required

1. Approve backup and snapshot Gate.
2. Approve DB backup Gate.
3. Approve read-only SSH inventory retry / access stabilization.
4. Approve migration state repair plan.
5. Approve master data remediation plan.
6. Approve permission/menu/DataScope remediation plan.

## 15. Recommended Remediation Roadmap

Use `docs/ops/PRODUCTION_SERVER_REMEDIATION_ROADMAP.md`.

## 16. Safety Confirmation

| Action | Executed |
| --- | --- |
| DB write | no |
| migration | no |
| service restart | no |
| deploy | no |
| push | no |
| production config modification | no |
| server file modification | no |

## 17. Reviews

| Review | Conclusion |
| --- | --- |
| A1 | PASS WITH CONDITIONS: report complete; W5 gate required post-commit; no write/deploy/restart/migration. |
| A2 | PASS WITH CONDITIONS: sensitive info is not printed; recommends backup before any remediation; SSH timeout prevents full server risk verification. |
| A5 | HOLD FOR DATA EVIDENCE: production-side DB/data readiness remains unknown until read-only DB inventory succeeds. |

## 18. Current Conclusion

READY_FOR_REMEDIATION_PLAN.

