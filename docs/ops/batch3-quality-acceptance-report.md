# Batch 3 Track Q — E2E & Business Acceptance Report

**Baseline:** `8b127efad80c799c79e7ee6285768b3b1d0a1377` (`origin/main` at audit time)
**Track:** Q (`codex/batch3-quality-acceptance`)
**Scope:** CI browser execution, existing Playwright coverage, disposable acceptance identities, UAT readiness.

## Confirmed facts

### CI browser skip cause

The repository has two separate browser paths:

* `.github/workflows/ci-smoke.yml` runs `scripts/ops/browser-visual-smoke.mjs` for the `browser-visual-production` dispatch target. That job validates Node scripts but does **not** install workspace dependencies or Playwright before running this target. The only Playwright installation step is conditional on the different `inventory-geometry-production` target (lines 103–114).
* `scripts/ops/browser-visual-smoke.mjs` invokes `npx playwright screenshot`. If the Playwright process cannot run, each page is recorded as `SKIP` with reason `playwright screenshot failed`; when all pages are skipped the summary is `SKIP_PLAYWRIGHT_UNAVAILABLE` and `--strict` exits non-zero (lines 183–217, 140–151).

Therefore the known browser-visual run is an execution-environment skip, not a product assertion pass or failure. The current CI smoke workflow does not run the repository's full `apps/web/e2e` suite on pull requests.

### Existing Playwright coverage

`apps/web/playwright.config.ts` defines a Chromium project and uses `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3000`). There are eight specs covering mocked UI flows, terminal navigation, sales/inventory geometry, flock refresh, i18n, and replenishment. The parameterized specs expand to the previously validated 30 test cases. Tests use isolated mock sessions (`apps/web/e2e/support/auth.ts`) or the disposable replenishment fixture; no production account is required by the mock tests.

### Disposable identity and database guardrails

`scripts/seed-e2e-replenishment-users.sh` refuses to run unless `E2E_DB=1` and `NODE_ENV=test`. It creates/updates only explicitly prefixed E2E identities and roles (`E2E_REPLENISH_MANAGER`/`ROLE_STORE_MGR`, `E2E_REPLENISH_WMS`/`ROLE_WMS_OP`, `E2E_ADMIN`/`ROLE_ADMIN`) in the selected database, and assigns the test company and warehouse scopes. `scripts/seed-e2e-replenishment-fixture.sh` has the same test-only guard and uses `E2E-*` fixture keys. These scripts are suitable for disposable PostgreSQL 16; they must never receive production `DATABASE_URL` values.

## Recommended CI execution design

1. Add a dedicated pull-request job with PostgreSQL 16 service, Node 20, pnpm 9, `pnpm install --frozen-lockfile`, and `pnpm --filter web exec playwright install --with-deps chromium`.
2. Start the API and Web against the disposable database, run the two guarded seed scripts with `E2E_DB=1 NODE_ENV=test`, wait for health/readiness, then run `pnpm --filter web exec playwright test --project=chromium` from `apps/web`.
3. Upload `apps/web/test-results` and Playwright report artifacts on failure. Keep this job separate from production smoke dispatches. A browser dependency failure must be reported as infrastructure failure; test skips must retain their explicit reason.
4. Keep `browser-visual-production` as an explicitly dispatched production smoke. Its current strict behavior is useful, but it should install the workspace dependency and browser in that job before invoking the script, or report an explicit infrastructure failure rather than silently treating all pages as product skips.

No workflow was changed in this audit because adding a full service orchestration job requires a confirmed CI database/API startup contract and ownership coordination with Track S. This report records the minimal safe design.

## UAT role and scenario matrix

| Role / identity | Current evidence | Acceptance scenarios still needed |
|---|---|---|
| `E2E_REPLENISH_MANAGER` / `ROLE_STORE_MGR` | disposable seed; company and store membership | manager creates/submits/approves replenishment within company; cannot read/write another company |
| `E2E_REPLENISH_WMS` / `ROLE_WMS_OP` | disposable seed; source/target warehouse scopes | WMS receive/dispatch within scoped warehouses; cross-warehouse and cross-company denial |
| `E2E_ADMIN` / `ROLE_ADMIN` | disposable seed; used by mocked UI sessions | admin positive paths plus explicit audit that admin-only paths are not inherited by normal roles |
| Cashier / finance / procurement roles | production readonly evidence exists, but no disposable seed in this Track | create approved test identities and execute payment, AR/AP, store collection and attachment scenarios in isolated DB |
| Inactive account | not currently seeded by Q | login denial and token/session invalidation after status change |

The missing business acceptance areas are real role-backed API journeys: procurement order and payment allocation, sales order, WMS inbound/outbound/batch scope, AR/AP, store collection and attachment authorization, organization/company master data, and Generic CRUD. The existing UI mocks do not prove backend authorization for these journeys.

## Unverified items and risks

* No CI run was executed in this worktree; CI E2E remains **UNVERIFIED** until a workflow with disposable services runs the suite.
* The exact API/Web startup command and migration/seed order for a clean PostgreSQL 16 service must be confirmed before adding the workflow.
* Production browser visual evidence is not equivalent to authenticated business acceptance; production credentials and production writes remain out of scope.
* The 30-test count is based on the validated Batch 2 execution record and current parameterized specs; a CI job must publish the actual Playwright list/count as an artifact.

## Result

`CI_E2E=UNVERIFIED` (workflow currently skips the full suite; browser-visual skip is infrastructure-related).
`BUSINESS_UAT=NOT_CONFIRMED` (approved business credentials and isolated role journeys are still required).
`PRODUCTION_ACCOUNTS_CREATED=NO`.
`PRODUCTION_DB_WRITES=NO`.
`READY_FOR_BATCH3_INTEGRATION=NO` until CI browser execution and role-backed UAT evidence are available.
