# Production Server Remediation Backlog

Date: 2026-06-23

## P0 - Must Handle Before Reliable Trial

| issue_id | issue_title | module | evidence | risk | proposed_fix | requires_backup | requires_db_write | requires_migration | requires_service_restart | responsible_agent | recommended_order | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0-001 | Establish trusted backup baseline | infra/db/files | Current backup state unknown | Cannot safely repair DB/files without recovery point | DB backup, app dir snapshot, env backup, uploads snapshot | true | false | false | false | A6 + A1 | 1 | proposed |
| P0-002 | Restore server read-only observability | infra | SSH read-only inventory timed out | Actual state cannot be verified | Stabilize SSH/access path and rerun read-only inventory | false | false | false | false | Codex-Orchestrator + A6 | 2 | proposed |
| P0-003 | Audit remote migration history | database | Prior migration problems reported; remote `migrations` unknown | DB drift or partial migration could break trial | Read-only migration table audit and migration artifact comparison | true | false | false | false | A1 + A5 | 3 | proposed |
| P0-004 | Audit remote DB/schema readiness | database | Store Payment production-side table state unknown | Store Payment trial may fail or corrupt expectations | Read-only table/column/index/menu/role scan | true | false | false | false | A5 + A1 | 4 | proposed |
| P0-005 | Audit initialization import quality | master-data | User reports data migration/import issues | Dirty master data can invalidate pilot | Count and duplicate scans for company/store/org/user/role/core tables | true | false | false | false | A5 | 5 | proposed |
| P0-006 | Freeze push-main production deploy path | deployment | Workflow deploys on `push main` | Accidental production redeploy | Require explicit GO; use remediation branches and approval gates | false | false | false | false | A6 + A7 | 6 | proposed |
| P0-007 | Audit menu/RBAC/DataScope remote state | security | Remote grants unknown | Privilege bypass or missing trial access | Read-only menu/role/user scope scan | true | false | false | false | A2 + A5 | 7 | proposed |
| P0-008 | Audit uploads/file exposure | attachment | Nginx exposes `/uploads/`; Store Payment forbids raw URL | File disclosure risk | Read-only upload tree and nginx exposure review | true | false | false | false | A2 + A6 | 8 | proposed |

## P1 - Impacts Trial Quality

| issue_id | issue_title | module | evidence | risk | proposed_fix | requires_backup | requires_db_write | requires_migration | requires_service_restart | responsible_agent | recommended_order | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1-001 | Align running commit with approved repository state | deployment | Server commit unknown | Running version may differ from local gates | Read-only git/image digest audit; propose controlled deploy if needed | false | false | false | false | A6 + A1 | 9 | proposed |
| P1-002 | Verify Store Payment remote readiness | store-payment | Local gates passed; remote not proven | Trial route may fail remotely | Read-only Store Payment DB/API/UI smoke after backup | true | false | false | false | A1 + A5 | 10 | proposed |
| P1-003 | Validate STORE-VTE-001 / ST-VTE-001 | master-data | Known namespace risk | DataScope mismatch | Read-only alias and user scope audit | true | false | false | false | A5 + A2 | 11 | proposed |
| P1-004 | Verify file_metadata remote state | attachment | Remote unknown | Protected streaming may fail | Read-only table/file metadata scan | true | false | false | false | A5 + A2 | 12 | proposed |
| P1-005 | Validate health and logs | runtime | Public health OK; logs unknown | Hidden 5xx/bootstrap errors | Read-only docker logs tail and health checks | false | false | false | false | A1 | 13 | proposed |
| P1-006 | Confirm rollback path | deployment | Rollback runbook exists; server artifact state unknown | Remediation may not be reversible | Snapshot current commit/images/env and rollback commands | true | false | false | false | A6 | 14 | proposed |
| P1-007 | Review CORS/auth/cookie production settings | security | Health shows production mode; env unknown | Login/API access defects | Read-only env redacted audit | false | false | false | false | A2 | 15 | proposed |

## P2 - Long-term Normalization

| issue_id | issue_title | module | evidence | risk | proposed_fix | requires_backup | requires_db_write | requires_migration | requires_service_restart | responsible_agent | recommended_order | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2-001 | Separate remediation/staging/prod workflows | deployment | push-main production path exists | Operational confusion | Keep staging workflow; require production GO workflow policy | false | false | false | false | A6 + Codex-Orchestrator | 16 | proposed |
| P2-002 | Standardize production evidence collection | ops | No current server evidence bundle | Repeated manual discovery | Add read-only evidence checklist/script after approval | false | false | false | false | Codex-Orchestrator | 17 | proposed |
| P2-003 | Normalize file storage strategy | attachment | Legacy `/uploads` and protected file metadata coexist | Security drift | Define migration path from raw uploads to protected metadata | true | true | false | false | A2 + A3 + A5 | 18 | proposed |

## P3 - Optimization

| issue_id | issue_title | module | evidence | risk | proposed_fix | requires_backup | requires_db_write | requires_migration | requires_service_restart | responsible_agent | recommended_order | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P3-001 | Improve public health remediation dashboard | ops | API health is available | Better visibility | Add docs/runbook for recurring checks | false | false | false | false | A1 | 19 | proposed |

