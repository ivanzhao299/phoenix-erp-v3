# Production Server Remediation R0 Backup And Observability Report

Date: 2026-06-23

## 1. Decision

Conclusion: GO WITH CONDITIONS.

R0 backup baseline was established. SSH observability was recovered enough to authenticate and run approved backup commands, but sessions remain slow/unstable for long output and one follow-up read-only diagnostic session was closed by the remote host. No migration, deploy, service restart, push, cleanup, reset, or business data write was executed.

## 2. SSH Observability

| Check | Result |
| --- | --- |
| TCP port 22 | PASS, port reachable |
| Initial short SSH attempt | FAIL, banner timeout |
| Root cause judgement | server banner delay / SSH session latency, not local key absence |
| Corrected connection | PASS with `Host erp`, public key auth, longer timeout, ControlMaster disabled |
| Authenticated user | root |
| Hostname | `iZt4nj11ry11ofv03yi35vZ` |
| Long output stability | CONDITION: one long follow-up command closed by remote host |

The earlier banner timeout was caused by the SSH banner arriving slowly. A raw socket test connected immediately but did not receive a banner within 30 seconds. A longer SSH connection eventually received `OpenSSH_9.6p1 Ubuntu-3ubuntu13.16` and authenticated successfully.

## 3. Backup Directory

Backup root:

`/opt/phoenix-erp-backups`

R0 backup directory:

`/opt/phoenix-erp-backups/remediation-r0-20260623-211849`

Manifest:

`/opt/phoenix-erp-backups/remediation-r0-20260623-211849/manifest.json`

## 4. Server Snapshot

Snapshot files created:

| File | Status |
| --- | --- |
| `server_snapshot.txt` | completed |
| `process_snapshot.txt` | completed |
| `docker_snapshot.txt` | completed |
| `disk_snapshot.txt` | completed |
| `git_snapshot.txt` | completed |

Because long output sessions can be unstable, detailed contents were left on the server in the backup directory rather than copied into this repository.

## 5. DB Backup

| Item | Result |
| --- | --- |
| DB backup executed | yes |
| DB backup method | `pg_dump` through the existing Docker Compose `db` container |
| Backup file | `phoenix_erp-20260623-211849.dump` |
| Backup size | 8,333,500 bytes |
| Checksum file | `phoenix_erp-20260623-211849.dump.sha256` |
| DB mutation | no |
| Migration executed | no |

The dump was written to the R0 `db_backup/` directory on the server. Database password and full connection string were not printed.

## 6. Config Backups

| Area | Status |
| --- | --- |
| `.env*` backup | completed into protected backup directory |
| `docker-compose*.yml` backup | completed |
| deploy/scripts backup | partial: compose copied; deploy/scripts copied when present |
| nginx config backup | completed |
| sensitive values printed | no |

Config file contents are intentionally not reproduced in this report.

## 7. Uploads / File Storage Inventory

Inventory file:

`uploads_inventory/uploads_inventory.txt`

Status: completed.

The inventory records upload roots, file counts, sizes, permissions, and sample paths. It does not copy large upload files. Static repository evidence still shows `/uploads/` is proxied by nginx and must be reconciled with Store Payment protected attachment rules.

## 8. Git / Deploy State

Remote snapshot file:

`git_snapshot.txt`

Status: completed.

Items captured on the server include branch, commit, status, compose files, and compose config signals. Full content remains on the server backup path.

## 9. Migration State Initial Diagnosis

Read-only DB diagnostics file:

`diagnostics/db_readonly_diagnostics.txt`

Status: partial.

Evidence captured:

- The first read-only diagnostic connected to PostgreSQL.
- The query failed when counting `file_metadata` because relation `file_metadata` does not exist.

Initial finding:

- `file_metadata` is missing on the production-side remediation target.
- Store Payment protected attachment readiness on this target is not proven.

The follow-up safe diagnostic session was closed by the remote host before a complete result file could be written. Migration history therefore remains partially unknown and must stay in the next remediation Gate.

## 10. Initialization Import Diagnosis

Status: not fully located.

Reason:

- DB read-only diagnostics did not complete.
- Initialization import tables / traces still require a stable read-only DB scan.

## 11. Master Data Diagnosis

Status: not fully located.

Known required checks:

- `STORE-VTE-001`
- `ST-VTE-001`
- `COMP-LAO-AGRI`
- duplicate store/org/company/project records
- user/store scope mappings

These remain pending because the complete DB diagnostic was interrupted.

## 12. Menu / Role / DataScope Diagnosis

Status: not fully located.

Known required checks:

- `MENU_STORE_PAYMENT*`
- Store Payment role grants
- user roles
- DataScope / organization / store mappings

These remain pending because the complete DB diagnostic was interrupted.

## 13. Attachment / Uploads Diagnosis

Initial diagnosis:

- Upload inventory exists.
- Nginx repository config exposes `/uploads/`.
- Remote `file_metadata` appears missing from first diagnostic evidence.

Risk:

- Store Payment protected QR/proof flow cannot be considered production-side ready until `file_metadata` and protected streaming are verified on this server.

## 14. Remaining Blockers

1. SSH sessions are usable but unstable for long command output.
2. Complete DB read-only diagnostics did not finish.
3. `file_metadata` is missing on the production-side remediation target.
4. Migration history is still not fully verified.
5. Initialization import issues are still not located.
6. Master data, menu, role, and DataScope readiness remain unproven.

## 15. First Fix Items After R0

1. Stabilize read-only diagnostic collection, preferably writing all evidence to server-side files and pulling only manifests.
2. Run a dedicated migration-state audit.
3. Run master data duplicate/import diagnostics.
4. Run menu/RBAC/DataScope diagnostics.
5. Run upload/file metadata security diagnostics.
6. Plan file_metadata remediation only after migration-state audit and backup confirmation.

## 16. Safety Confirmation

| Action | Executed |
| --- | --- |
| DB write | no, except backup read stream to dump file outside DB |
| migration | no |
| deploy | no |
| service restart | no |
| service stop | no |
| nginx modification | no |
| env modification | no |
| push | no |
| cleanup/reset | no |
| business code change | no |

## 17. Reviews

| Review | Conclusion |
| --- | --- |
| A1 | PASS WITH CONDITIONS: R0 report and manifest exist; W5 gate required after commit; no migration/deploy/restart/push. |
| A2 | PASS WITH CONDITIONS: sensitive values not printed; DB/env/SSH secrets remain redacted; upload and file metadata risks remain. |
| A5 | GO WITH CONDITIONS: DB backup exists; `file_metadata` missing is a real readiness finding; full data readiness requires next read-only diagnostics. |

## 18. Current Conclusion

GO WITH CONDITIONS.

