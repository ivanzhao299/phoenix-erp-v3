# Production Storage Migration Path Inventory

扫描范围：`.github/workflows/**`、`scripts/**`、`docs/ops/**`、`docker-compose.yml`。

## Counts

```text
DEPLOY_PATH workflow files: 64
legacy deploy-path literal workflow files: 64
legacy deploy-path literal workflow matches: 102
backup-path workflow files: 6
phoenix named-volume references in workflows/scripts/compose: 10
```

## Classification

### MUST_CHANGE

- `docker-compose.yml` volume sources: changed to `PHOENIX_PG_DATA_DIR` and `PHOENIX_UPLOADS_DIR` with named-volume defaults.
- `.github/workflows/deploy.yml`: calls the mount guard after Git SHA synchronization and before any Compose operation.
- `.github/workflows/production-disk-maintenance.yml`: normalizes `DEPLOY_PATH`, calls the guard, and reports `$DEPLOY_PATH` plus `/data/phoenix-erp-data`.
- GitHub Environment secret `DEPLOY_PATH`: update to `/data/phoenix-erp` only after M3 checkout validation.

### COMPATIBLE_VIA_DEPLOY_PATH

The production workflows that transport `DEPLOY_PATH` and execute `cd "$DEPLOY_PATH"` will follow the new checkout after the GitHub Environment secret is updated. This includes the production audits, approved executions, rollout checks, schema checks, and smoke checks found in `.github/workflows/**`.

Direct `cd` expressions in `deploy.yml`, `phase1-controlled-production-execution.yml`, `verify-md-center.yml`, and `dump-prod-schema.yml` also resolve from the same secret when it is explicitly set to an absolute path.

### COMPATIBLE_VIA_SYMLINK

Operator-only scripts and historical instructions that mention `/opt/phoenix-erp` can use a temporary compatibility symlink after the new checkout is validated. The symlink is optional and is not the source of deployment truth.

### DOC_ONLY

Historical reports, incident evidence, and old runbooks retain their original paths as evidence. They are not runtime configuration and are not rewritten by this Track.

### NO_CHANGE

- `/opt/phoenix-erp-backups` remains the backup location for this Track.
- `/opt/phoenix/static-overrides` remains the static override location.
- Other projects under `/srv`, `/data/kingturf-erp*`, and their Docker mounts are outside scope.

## Runtime evidence

The production Compose project label reports `working_dir=/opt/phoenix-erp` today. The production checkout is on `main`, clean, and points to `git@github.com:ivanzhao299/phoenix-erp-v3.git`. PostgreSQL is running from `phoenix_pg_data` and uploads from `phoenix_uploads`.
