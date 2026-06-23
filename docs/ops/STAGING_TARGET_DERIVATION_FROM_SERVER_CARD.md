# Staging Target Derivation From Server Card

Date: 2026-06-23

## Decision

Conclusion: STAGING TARGET CANDIDATE READY, pending user approval.

The server card clearly points to the production Phoenix ERP host. It can only become a staging host candidate if the user explicitly approves strict same-host isolation. The production DB, production file storage, production deploy path, and production GitHub secrets must not be reused for staging.

## Production Classification

| Check | Result |
| --- | --- |
| Public production domain present | yes |
| Production deploy path present | yes, `/opt/phoenix-erp` |
| Production workflow trigger present | yes, push-main production deploy |
| Production DB reference present | yes |
| Production file volume reference present | yes |
| Classification | production |

## Same-Host Staging Feasibility

Same-host staging is possible only as an isolated candidate, not as an approval to deploy.

| Isolation Requirement | Candidate | Status |
| --- | --- | --- |
| independent deploy directory | `/opt/phoenix-erp-staging` | requires user approval |
| independent compose project | `phoenix_erp_staging` | requires user approval |
| independent API port | `18080` or another verified free port | requires user approval and port check |
| independent web port | `13000` or another verified free port | requires user approval and port check |
| independent URL | staging domain or temporary protected URL | missing |
| independent staging DB | `phoenix_erp_staging` | required, not yet provisioned |
| independent file storage | `/data/phoenix-erp-staging/files` | required, not yet provisioned |
| independent env file | `/opt/phoenix-erp-staging/.env.staging` | required |
| independent logs | `/opt/phoenix-erp-staging/logs` or docker logs under staging project | required |
| no production service impact | must be validated before deploy | pending |

## Candidate Staging Parameters

These are proposals for approval, not active configuration.

| Parameter | Candidate |
| --- | --- |
| STAGING_HOST | derived from server card, partially masked in docs |
| STAGING_USER | derived from server card, partially masked in docs |
| STAGING_DEPLOY_PATH | `/opt/phoenix-erp-staging` |
| STAGING_FILE_STORAGE_PATH | `/data/phoenix-erp-staging/files` |
| STAGING_COMPOSE_PROJECT | `phoenix_erp_staging` |
| STAGING_ENV_FILE | `/opt/phoenix-erp-staging/.env.staging` |
| STAGING_API_PORT | `18080` candidate, must verify free |
| STAGING_WEB_PORT | `13000` candidate, must verify free |
| STAGING_DB_NAME | `phoenix_erp_staging` |

## Hard Restrictions

1. Production DB must not be reused as staging DB.
2. Production file storage must not be reused as staging file storage.
3. Production deploy path `/opt/phoenix-erp` must not be used for staging.
4. Production workflow `.github/workflows/deploy.yml` must not be used for staging.
5. Production secrets must not be copied into staging secrets.
6. No deploy, migration, remote DB write, service restart, or push was executed in this Gate.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

- The server card is production-oriented.
- Same-host staging requires explicit user approval and strong isolation.
- Production DB and production file storage are marked forbidden for staging reuse.
- Production deploy workflow must remain untouched.

## A5 Review

Conclusion: GO WITH CONDITIONS.

- A staging target candidate can be derived.
- Staging data readiness remains incomplete until independent staging DB, store/company data, menu/role sync, file metadata, and UAT users are provisioned and validated.

