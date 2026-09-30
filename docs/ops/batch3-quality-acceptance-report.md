# Batch 3 Track Q — E2E & Business Acceptance Report

**Baseline:** `8b127efad80c799c79e7ee6285768b3b1d0a1377` (`origin/main` at audit time)
**Track:** Q (`codex/batch3-quality-acceptance`)
**Scope:** CI browser execution, existing Playwright coverage, disposable acceptance identities, UAT readiness.

## Confirmed facts

### CI browser skip cause

The repository has two separate browser paths:

* `.github/workflows/ci-smoke.yml` runs `scripts/ops/browser-visual-smoke.mjs` for the `browser-visual-production` dispatch target and already conditionally installs workspace dependencies plus Chromium (lines 34–56). This is a production smoke path, not the full application E2E suite.
* `scripts/ops/browser-visual-smoke.mjs` invokes `npx playwright screenshot`. Any process error is recorded as `SKIP` with reason `playwright screenshot failed`; when every page follows that path the summary is `SKIP_PLAYWRIGHT_UNAVAILABLE` and `--strict` exits non-zero (lines 183–217, 140–151). The repository does not retain the stderr from the historical run that produced this decision, so the exact underlying browser error is unverified. The evidence supports classifying it as an execution failure, not a product assertion result.

At the audit baseline, `ci-smoke.yml` did not run `apps/web/e2e` on pull requests. Track Q adds `.github/workflows/batch3-quality-e2e.yml` to provide that missing path.

### Existing Playwright coverage

`apps/web/playwright.config.ts` defines a Chromium project and uses `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3000`). There are eight specs covering mocked UI flows, terminal navigation, sales/inventory geometry, flock refresh, i18n, and replenishment. The parameterized specs expand to the previously validated 30 test cases. Tests use isolated mock sessions (`apps/web/e2e/support/auth.ts`) or the disposable replenishment fixture; no production account is required by the mock tests.

### Disposable identity and database guardrails

`scripts/seed-e2e-replenishment-users.sh` refuses to run unless `E2E_DB=1` and `NODE_ENV=test`. It creates/updates only explicitly prefixed E2E identities and roles (`E2E_REPLENISH_MANAGER`/`ROLE_STORE_MGR`, `E2E_REPLENISH_WMS`/`ROLE_WMS_OP`, `E2E_ADMIN`/`ROLE_ADMIN`) in the selected database, and assigns the test company and warehouse scopes. `scripts/seed-e2e-replenishment-fixture.sh` has the same test-only guard and uses `E2E-*` fixture keys. These scripts are suitable for disposable PostgreSQL 16; they must never receive production `DATABASE_URL` values.

## CI execution delivered by Track Q

1. `.github/workflows/batch3-quality-e2e.yml` defines a pull-request and manual job with a disposable `postgres:16.14-alpine` service, Node 20, pnpm 9, frozen workspace install, and Chromium installation.
2. It runs the existing guarded database bootstrap and E2E identity/fixture scripts with `NODE_ENV=test` and `E2E_DB=1`, starts the built API and Web, waits on `/api/health` and `/`, and runs `pnpm --filter web exec playwright test --project=chromium --reporter=line,json`.
3. It mints a short-lived token for the disposable `E2E_ADMIN` identity and exposes it only to the test process, so mocked UI sessions exercise current middleware session validation instead of a fabricated expired token.
4. It uploads Playwright results and API/Web logs on every outcome. Browser dependency failure therefore fails the job as infrastructure; conditional test skips remain visible in the Playwright report.
4. The production browser-visual smoke remains a separate manually dispatched path and does not grant CI E2E evidence.

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

* No GitHub CI run was executed from this worktree; remote CI E2E remains **UNVERIFIED** until the new workflow completes on a pull request.
* On the final integration worktree, the same isolated PostgreSQL 16/API/Web flow ran Chromium with the validated repository browser libraries: **30 passed, 0 failed, 0 skipped**, `INFRA_FAILURES=0`, `FIXTURE_FAILURES=0`, `PRODUCT_FAILURES=0`. This is local evidence; it does not replace required remote CI.
* The workflow's startup and seed commands were checked against `scripts/test-db-bootstrap.sh`, `scripts/seed-e2e-replenishment-users.sh`, `scripts/seed-e2e-replenishment-fixture.sh`, and the existing Playwright configuration. Remote runner behavior remains unverified.
* Production browser visual evidence is not equivalent to authenticated business acceptance; production credentials and production writes remain out of scope.
* The 30-test count is based on the validated Batch 2 execution record and current parameterized specs; a CI job must publish the actual Playwright list/count as an artifact.

## Result

`CI_E2E=LOCAL_PASS_REMOTE_UNVERIFIED` (30/30 Chromium pass locally on the final integration head; no remote run evidence yet).
`BUSINESS_UAT=NOT_CONFIRMED` (approved business credentials and isolated role journeys are still required).
`PRODUCTION_ACCOUNTS_CREATED=NO`.
`PRODUCTION_DB_WRITES=NO`.
`READY_FOR_BATCH3_INTEGRATION=NO` until CI browser execution and role-backed UAT evidence are available.
