# Packaging test database bootstrap repair (2026-09-11)

## Root cause

The regression workflow invoked `scripts/db-migrate.sh` directly. The chain did run legacy SQL and TypeORM migrations, but had no single test-only entrypoint with an end-state assertion. `prc2_projects` is defined by the procurement DDL and repaired by TypeORM migration `1781837624061-FixPrc2ProjectsCompanyCodeNotNull`; `pkg_work_shifts` is created by `1789099201000-ProtectPackagingVoidAndTestIsolation` because the historical runtime GenericCrud bootstrap runs only after API startup. A failure or partial invocation therefore surfaced as a missing relation and obscured ordering problems.

## Change

Added `scripts/test-db-bootstrap.sh`, which requires `NODE_ENV=test`, delegates to the existing `db-migrate.sh` (no skipped or fabricated migration records), then asserts `prc2_projects`, `pkg_work_shifts`, `prc2_projects.company_code NOT NULL`, and `pkg_work_shifts.is_test` through `information_schema`/`pg_catalog`. CI now calls this one entrypoint before starting the API. Local and CI use the same migration implementation.

## Verification

- Shell syntax: `bash -n scripts/test-db-bootstrap.sh` passed.
- Local isolated container: `phoenix-v3-packaging-test-db` (`127.0.0.1:15433`) used with database `packaging_test`; migration run was started with `NODE_ENV=test` and output is retained at `/tmp/packaging-bootstrap.log` (not committed). It reached the dated legacy migration chain; completion/API/test results remain pending because the container client wrapper is slow.
- Production database was not contacted or modified.

## Remaining

Run the bootstrap to completion, start the API on its test configuration, curl `/api/health`, then run the packaging PG tests and scope audit. A CI run is required after pushing the branch; no push or deploy was performed in this worktree.
