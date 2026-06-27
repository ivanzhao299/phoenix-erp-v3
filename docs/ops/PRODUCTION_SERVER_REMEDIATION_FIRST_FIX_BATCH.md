# Production Server Remediation First Fix Batch

Date: 2026-06-23

This is an approval request package only. No backup, DB write, migration, deploy, restart, cleanup, reset, or production config modification was executed in this intake.

## Recommended First Batch

| Order | Fix Item | Scope | Why First | Required Approval |
| --- | --- | --- | --- | --- |
| 1 | Server current-state backup | DB/app/env/uploads/nginx | Creates recovery point before any remediation | APPROVE_BACKUP_AND_SNAPSHOT |
| 2 | Database backup | production-side DB | Required before migration/data repair planning | APPROVE_DB_BACKUP |
| 3 | Env/deploy file backup | `/opt/phoenix-erp/.env`, compose, nginx | Prevents config loss during remediation | APPROVE_BACKUP_AND_SNAPSHOT |
| 4 | Migration state read-only audit | DB `migrations` + migration files | Prior migration issues reported | APPROVE_MIGRATION_STATE_REPAIR_PLAN |
| 5 | Initialization import problem diagnosis | master data and imported tables | User reported import/data migration issues | APPROVE_MASTER_DATA_REMEDIATION_PLAN |
| 6 | Master data duplicate/dirty scan | company/org/store/user/role | Trial depends on clean master data | APPROVE_MASTER_DATA_REMEDIATION_PLAN |
| 7 | Menu/role/DataScope difference diagnosis | RBAC and scope tables | Trial access depends on permissions | APPROVE_PERMISSION_AND_MENU_REMEDIATION_PLAN |
| 8 | Uploads/file storage security diagnosis | uploads, file metadata, nginx | Store Payment attachment security depends on this | APPROVE_BACKUP_AND_SNAPSHOT |

## R0 Execution Evidence

| Item | Result |
| --- | --- |
| backup directory | `/opt/phoenix-erp-backups/remediation-r0-20260623-211849` |
| DB backup | completed |
| DB backup file | `phoenix_erp-20260623-211849.dump` |
| DB backup size | 8,333,500 bytes |
| env backup | completed into protected backup directory |
| deploy / compose backup | completed where present |
| nginx backup | completed |
| uploads inventory | completed |
| SSH observability | restored with conditions; long sessions remain unstable |
| read-only DB diagnostics | partial; `file_metadata` missing caused first diagnostic failure |

## Updated Next Batch Recommendation

1. Keep R0 backup as the freeze point.
2. Use R1 audit bundle `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510` as the current migration-state evidence bundle.
3. Treat `file_metadata` missing cause as `CODE_NOT_DEPLOYED`: remote code lacks `1782042418112-CreateFileMetadata.ts`.
4. Treat Store Payment remote schema as not ready: `store_payment_accounts` and `store_payment_records` were not found in the audited DB.
5. Request approval for remote code alignment and schema repair precheck before any migration execution.
6. Continue with master data and RBAC/DataScope diagnostics before any business UAT.

## R1 Migration-State Audit Evidence

| Item | Result |
| --- | --- |
| audit directory | `/opt/phoenix-erp-backups/remediation-r1-migration-audit-20260623-220510` |
| remote branch | `main` |
| remote commit | `87b5781` |
| Store Payment migration file | present, hash matches local approved migration |
| File Metadata migration file | missing |
| Store Payment tables | missing in audited DB |
| File Metadata table | missing in audited DB |
| File Metadata missing cause | `CODE_NOT_DEPLOYED` |
| DB write / migration / deploy / restart / push | not executed |

## Execution Boundaries For First Batch

Allowed after approval:

- Read-only inventory.
- Backup commands.
- Snapshot commands.
- Redacted evidence collection.

Still forbidden until separate approval:

- DB mutation.
- Migration run.
- Data cleanup.
- Nginx modification or reload.
- Service restart.
- Deploy.
- Push main.

## Recommended Agent Ownership

| Agent | Role |
| --- | --- |
| A6 | Backup/runbook/snapshot procedure |
| A1 | Gate validation and evidence completeness |
| A2 | Security/redaction/RBAC/file exposure review |
| A5 | Data readiness and master-data diagnostics |
| Codex-Orchestrator | Approval routing, task board, baseline lifecycle |
