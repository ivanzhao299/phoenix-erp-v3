# Environment Matrix

> Purpose: define what each environment may run, what it must never expose, and which gates apply.

## Matrix

| Environment | Startup method | Database | Node / pnpm | Required env vars | Forbidden env vars | Secret management | Dev login | Chanjet Soft | Mock | Migration | Log level | Deployment method |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| local | `pnpm dev`, `pnpm dev:api`, `pnpm dev:web`, or Docker compose for local stack | Local Postgres or disposable dev DB | Node 20, pnpm 9 per CI baseline | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET` | Production DB/Chanjet/secret values | Local `.env`, never committed | Allowed only for dev fixtures | Disabled unless using sandbox/test tenant | Allowed | Allowed only against local disposable DB and approved task | debug/info | Manual local run |
| Codex cloud | Tool-driven workspace commands; no production network assumption | Local/test DB only if provisioned | Match repo scripts; prefer Node 20/pnpm 9 | Test-safe env only | Production secrets, production DB, production Chanjet credentials | Session/tool secrets only when explicitly provided | Allowed only for controlled test fixtures | Disabled | Allowed | No production migration; local test migration only when task allows | info | No deployment |
| CI | GitHub Actions workflows | Service Postgres from workflow | Node 20, pnpm 9 in current workflows | CI DB vars, `JWT_SECRET`, `NODE_ENV=test` | Production secrets except deploy jobs scoped to environments | GitHub Secrets and environment protection | Allowed only when explicitly set in test job | Disabled unless dedicated sandbox secrets are configured | Allowed for tests | Allowed only in CI test DB according to workflow gates | info | Actions jobs; PR must not deploy |
| staging | Staging deploy/runbook | Staging Postgres restored or seeded from safe baseline | Same as production image/runtime | Runtime DB, JWT, app URL, allowed third-party sandbox vars | Production-only credentials unless staging is explicitly isolated | Environment secrets with limited access | Disabled by default | Sandbox/test tenant only | Limited; no hidden business behavior mock for final smoke | Allowed only with approved release candidate and backup | info/warn | Staging deploy workflow or approved runbook |
| production | Existing production deployment chain | Production Postgres | Production image/runtime | Production DB, JWT, app URL, approved third-party vars | Dev login, mocks, test tenants, debug secrets | GitHub protected environment and server secret store | Forbidden | Production tenant only through approved integration | Forbidden | Only after GO decision, backup, and rollback plan | warn/error with audit logs | Protected production deploy workflow/runbook only |

## Environment Principles

1. Production secrets must never be copied into local, Codex cloud, or generic CI jobs.
2. Dev login must fail closed outside explicitly approved local/CI test modes.
3. Migrations are environment-specific gates, not an automatic right granted by a script.
4. Chanjet/Yonyou calls require tenant/account classification before enabling in staging or production.
5. Any environment drift discovered during release must be recorded in the release candidate packet.

## Current Observed Baseline

| Item | Current repository signal |
| --- | --- |
| Root scripts | `pnpm dev`, `pnpm build`, `pnpm lint`, web/api filtered scripts. |
| API scripts | Build, lint, Jest, smoke, module regressions, TypeORM migration commands. |
| Web scripts | Next dev/build/start, lint, typecheck. |
| Docker | `apps/api/Dockerfile`, `apps/web/Dockerfile`, root `docker-compose.yml`. |
| CI Node/pnpm | Workflows use Node 20 and pnpm 9. |
