# Ops Script Secret Default Remediation - 2026-06-26

## Scope

Continues the P1/P2 ops-security cleanup by reducing legacy credential defaults in local helper scripts.

## Changes

Files changed:

- `scripts/compare_v2_v3.py`
- `scripts/migrate_v2_to_v3.py`

## Remediation

Both historical V2-to-V3 helper scripts now initialize PostgreSQL connection defaults from environment variables first:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

CLI flags still override the environment. Local defaults remain only as development fallbacks for a local `phoenix_erp` database.

## CI Secret Notes

The fixed `phoenix_v3_pass` values found in GitHub workflow service containers are ephemeral CI database passwords, not production credentials. They remain scoped to disposable GitHub Actions Postgres services.

## Safety

- Business code changed: No.
- DB migration executed: No.
- DB write executed: No.
- Production deploy executed by this patch: No.
- Push: Pending validation.

## Validation Plan

- Python syntax check for both scripts.
- W5 closeout gate.
- Existing CI/CD on main after push.
