# Next Actions

Last updated: 2026-06-23

1. `PROVIDE_STAGING_DEPLOY_TARGET`.
2. `PROVIDE_STAGING_DB_CONNECTION`.
3. `PROVIDE_STAGING_FILE_STORAGE_PATH`.
4. `CONFIRM_STAGING_WORKFLOW_OR_MANUAL_RUNBOOK`.

## Recommended Immediate Sequence

1. Provide staging-only host/workflow details that do not use the production `push main` deploy path.
2. Provide staging DB connection details and backup policy.
3. Keep `/uploads` and raw URL exposure forbidden.
4. Keep local UAT fixture data out of production release decisions unless explicitly approved.

## Do Not Auto-Start

- production `push main` deployment path.
- production deployment.
- production preview/download enablement without staging evidence.
- push to main.
- Production DB writes.
