# Production Readiness P1-007 - Rollback / Restore Evidence Repair Report

Date: 2026-06-25

Task ID: `PRD-P1-007`

Conclusion: `GO_WITH_CONDITIONS / ROLLBACK_EVIDENCE_READY_FOR_RUNBOOK`

## Purpose

Repair the prior rollback/restore validation blockers by collecting owner-correct remote checkout evidence, active compose evidence, runtime image evidence, and a current production DB backup.

This Gate did not execute rollback, restore, reset, cleanup, deployment, migration, seed, or production business-data mutation.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-007-rollback-restore-evidence-repair-20260625-093003`

Key files:

- `remote_evidence_repair.txt`
- `remote_evidence_repair_retry_no_mux.txt`
- `remote_backup_deep_summary.txt`
- `remote_db_backup_creation_success.txt`
- `remote_db_backup_verify_sudo.txt`
- `remote_db_backup_integrity.txt`

## Fixed / Improved Evidence

| Area | Result | Notes |
| --- | --- | --- |
| Remote checkout safe.directory | PASS | `git config --global --add safe.directory /opt/phoenix-erp` succeeded for `ops`. |
| Remote git status | PASS | `/opt/phoenix-erp` is readable; remote HEAD is `540de0ef85cf11f7e1250ce2980774ec688f3433`. |
| Remote checkout dirtiness | PASS WITH CONDITIONS | Only untracked backup artifacts remain: one compose backup and two Nginx backup files. |
| Compose path | PASS | `/opt/phoenix-erp/docker-compose.yml` is active and `docker compose config --services` returns `db/api/web`. |
| Runtime images | PASS | Web/API/DB image IDs captured. Web image revision is `540de0ef`; API image still reports previous image revision in labels while running healthy. |
| Backup location | PASS | `/opt/phoenix-erp-backups/db/` now contains current Phoenix DB dump. |
| Backup integrity | PASS | `gzip -t` passed; DB information_schema read returned 249 public tables. |
| Rollback primitives | PASS WITH CONDITIONS | Compose config and container ps evidence captured; no destructive rollback executed. |
| Restore proof | HOLD FOR SEPARATE DR DRILL | A real restore dry-run requires isolated target or approved restore drill and was not executed here. |

## Current DB Backup

| Field | Value |
| --- | --- |
| Backup path | `/opt/phoenix-erp-backups/db/phoenix_erp_20260625-094749.sql.gz` |
| SHA256 | `b5bd271a44448713ac1424f8dfbcd29c39358c2021859956e437bc551d378c61` |
| Integrity | `GZIP_TEST_OK` |
| DB | `phoenix_erp` |
| Backup type | Logical `pg_dump --no-owner --no-privileges`, compressed |

## Remote Git Evidence

```text
/opt/phoenix-erp
540de0ef85cf11f7e1250ce2980774ec688f3433
## main...origin/main
?? docker-compose.yml.bak-20260522-180813
?? nginx/erp.eggslao.com.conf.bak-uploads-hardening-20260624-011137
?? nginx/erp.eggslao.com.conf.bak-uploads-hardening-20260624-011703
```

The untracked files are backup artifacts. They should be moved to an approved backup location or documented as rollback artifacts in a later deploy-chain hygiene Gate. They do not indicate application source drift.

## A6 Assessment

Conclusion: `GO_WITH_CONDITIONS`.

The rollback evidence is now sufficient for an operator runbook: active compose path, active image IDs, remote HEAD, and DB backup exist. A true restore drill remains a separate disaster-recovery Gate.

## A1 Validation

Conclusion: `PASS_WITH_CONDITIONS`.

- Production health after evidence repair: OK.
- No production deploy was executed by this Gate.
- No migration or seed was executed.
- A compressed logical DB backup was created and checksum verified.
- W5 closeout must pass before commit.

## A2 / A7 Review

Conclusion: `PASS_WITH_CONDITIONS`.

Conditions:

1. Do not execute restore against production without an explicit rollback/restore Gate.
2. Do not delete backup artifacts automatically.
3. Keep production deploy rollback decisions tied to current backup path and image IDs.
4. Treat SSH banner instability as an operational risk, mitigated by no-ControlMaster/timeboxed probes but not fully eliminated.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Production DB write | No |
| DB backup file written | Yes, approved operational backup |
| Migration executed | No |
| Seed executed | No |
| Restore executed | No |
| Rollback executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed by this Gate | No |
| Business code modified | No |

## Remaining Conditions

1. Run a separate isolated restore drill before declaring full disaster-recovery maturity.
2. Move or formally document the three untracked backup artifacts in a deploy-chain hygiene Gate.
3. Continue using timeboxed/no-ControlMaster SSH probes until server-side SSH multiplex instability is fully understood.

## Final Result

`PRD-P1-007` is upgraded from `HOLD WITH CONDITIONS / SNAPSHOT PARTIAL` to `GO_WITH_CONDITIONS / ROLLBACK_EVIDENCE_READY_FOR_RUNBOOK`.
