# Store Payment GitHub Staging Secrets Setup From Server Card

Date: 2026-06-23

## Purpose

This document maps the received server card to GitHub `staging` environment secrets. It does not print secrets and does not approve deployment.

## Candidate Secret Matrix

| Secret | available_from_server_card | required_from_user | Sanitized Guidance |
| --- | --- | --- | --- |
| STAGING_HOST | yes | yes, confirm use of production host as staging host | Use the same physical host only if same-host staging isolation is approved. Store real value only in GitHub `staging` environment secret. |
| STAGING_USER | yes | yes, confirm deploy user | Use a staging-scoped deploy user if possible. If reusing production SSH user, require user approval. |
| STAGING_SSH_KEY | key reference only | yes | Must be a GitHub `staging` secret. Do not reuse production key unless explicitly approved. Value: `[REDACTED]`. |
| STAGING_DEPLOY_PATH | candidate only | yes | Recommended `/opt/phoenix-erp-staging`, not `/opt/phoenix-erp`. |
| STAGING_DATABASE_URL | no | yes | Must point to independent staging DB `phoenix_erp_staging`; production DB URL is forbidden. Value: `[REDACTED]`. |
| STAGING_FILE_STORAGE_PATH | candidate only | yes | Recommended `/data/phoenix-erp-staging/files`, not production upload volume. |
| STAGING_API_ENV | no | yes | Must include staging API env only; production secrets forbidden. Value: `[REDACTED]`. |
| STAGING_WEB_ENV | no | yes | Must include staging web env only; production endpoint assumptions must be reviewed. Value: `[REDACTED]`. |

## Required GitHub Environment

- Environment name: `staging`
- Required reviewers: recommended before any workflow execution.
- Workflow: `.github/workflows/staging-deploy.yml`
- Production workflow: not used.

## Still Missing

1. User approval to use the production host as a staging host candidate.
2. Independent staging DB URL.
3. Independent staging file storage path.
4. GitHub `staging` environment secrets.
5. Staging domain or protected temporary URL.
6. Confirmation that candidate ports are free.
7. Approval to run the staging workflow.

