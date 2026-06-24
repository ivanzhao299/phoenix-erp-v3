# Production Readiness P1-007 - Rollback / Restore Validation Report

Date: 2026-06-24

Task ID: `PRD-P1-007`

Conclusion: `HOLD WITH CONDITIONS / SNAPSHOT PARTIAL`

## Purpose

Validate whether the current production environment has enough evidence to support a controlled rollback or restore decision before Phoenix ERP can be treated as production-grade.

This gate was intentionally read-only. It did not execute rollback, restore, reset, cleanup, deploy, migration, DB write, or push operations.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-007-rollback-restore-validation-20260624-171501`

Evidence files:

- `context.txt`
- `remote_rollback_readonly_snapshot.txt`
- `local_release_snapshot.txt`
- `post_push_web_guard_smoke.txt`

No secret values are intentionally recorded.

## Current Evidence Summary

| Area | Result | Evidence |
| --- | --- | --- |
| Remote host identity | `PASS` | SSH reached `ops@47.236.122.224`; host returned `iZt4nj11ry11ofv03yi35vZ`. |
| Runtime containers | `PASS WITH CONDITIONS` | `phoenix-v3-web`, `phoenix-v3-api`, and `phoenix-v3-db` were listed as healthy at snapshot time. |
| Current image IDs | `PASS` | Web and API image IDs were captured for rollback reference. |
| Remote checkout status | `HOLD` | `/opt/phoenix-erp` failed `git` inspection with dubious ownership / unsafe directory. |
| Backup directory evidence | `HOLD` | SSH connection closed during backup directory summary collection. |
| Compose file evidence | `HOLD` | SSH connection closed during compose file probing. |
| Rollback command proof | `HOLD` | No controlled rollback command was executed or proven in this gate. |
| Restore command proof | `HOLD` | No restore command was executed or proven in this gate. |
| Store Payment web guard post-push smoke | `CONDITION` | Public `HEAD /store-payment` still returned `200` with a Next.js cached/prerendered shell, so page-level fail-closed guard was added as defense in depth. |

## Key Finding

The current production runtime has a partial rollback snapshot, but not enough operator-grade evidence to call rollback/restore ready.

The largest blocker is not missing code. It is operational evidence:

1. The remote checkout cannot be inspected by plain `git` because `/opt/phoenix-erp` is considered a dubious ownership repository for the current SSH user.
2. SSH command stability remains intermittent during multi-step evidence collection.
3. Backup directory and compose-file evidence could not be collected reliably in the same read-only pass.
4. No rollback or restore dry-run command has been proven.

## Remote Checkout Blocker

Observed error:

```text
fatal: detected dubious ownership in repository at '/opt/phoenix-erp'
```

This gate did not modify server-side git configuration. A later A6-controlled remediation should either:

1. run git status through the correct repository owner or `sudo -u <owner>` path; or
2. explicitly configure safe.directory for the intended operator account after approval; and
3. document who owns `/opt/phoenix-erp`, who may deploy, and which account should perform rollback inspection.

## Rollback Readiness Assessment

| Requirement | Status | Notes |
| --- | --- | --- |
| Current web/API image IDs captured | `PASS` | Image IDs are available in evidence. |
| Current commit captured | `HOLD` | Remote git status/head unavailable due safe.directory. |
| Previous known-good image captured | `HOLD` | Not proven in this gate. |
| Compose path captured | `HOLD` | SSH closed during compose probing. |
| Backup location captured | `HOLD` | SSH closed during backup probing. |
| Restore owner confirmed | `HOLD` | Not proven. |
| Expected downtime documented | `HOLD` | Not yet proven against actual restore path. |
| Non-destructive rollback dry-run | `HOLD` | Not executed and not approved in this gate. |

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. Evidence is docs-only and read-only.
2. Runtime container snapshot was captured.
3. No DB write, migration, deployment, push, cleanup, reset, or restore command was executed.

Conditions:

1. `git` inspection of `/opt/phoenix-erp` must be fixed or replaced with an owner-correct command.
2. Backup and compose evidence must be recollected after SSH stability is acceptable.
3. W5 closeout should be rerun after this report is committed with the related P1-006 guard fix.

## A6 Runbook Requirements

Before production GO, create a controlled A6 rollback validation gate that proves:

1. remote checkout owner and status path;
2. active compose file path;
3. active web/API image IDs and previous known-good image IDs;
4. DB backup location and latest successful backup timestamp;
5. restore command owner, expected downtime, and stop/start sequence;
6. rollback smoke commands for API health, Web health, auth fail-closed, and Store Payment route behavior;
7. operator approval boundaries for restore and rollback.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | No |
| API code changed | No |
| Web code changed | No, this report only records remote read-only rollback evidence |
| DB write | No |
| Migration executed | No |
| Seed executed | No |
| Restore executed | No |
| Rollback executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed by this report | No |

## Final Result

`PRD-P1-007` is `HOLD WITH CONDITIONS`.

Phoenix ERP should not be considered rollback/restore ready until the remote checkout ownership issue, backup evidence, compose evidence, and a controlled rollback/restore dry-run plan are resolved under an A6 gate.
