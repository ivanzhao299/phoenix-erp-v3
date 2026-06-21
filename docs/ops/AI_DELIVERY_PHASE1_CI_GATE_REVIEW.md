# AI Delivery Factory Phase 1 CI Gate Review

> Review date: 2026-06-21
> Mode: W5-RESUME-LIMITED / CI condition recovery
> Scope: minimal CI/static gate implementation without business code, migration, schema, entity, or deployment-chain changes.
> Frozen items touched: No.

## 1. Current Workflows

| Workflow | Current role | Notes |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | Combined CI/CD build, test, image push, and production deploy workflow | PR runs test-only; push to main can build/push/deploy by detected mode. Includes migration allowlist, TypeScript migration down/no-DML checks, API/web typecheck, nullable unique check, API build, DB migration, partial regression, and production deploy steps. |
| `.github/workflows/regression.yml` | V3 regression suite | Runs on PR to `v3-admin`/`main`, push to `v3-admin`, and manual dispatch. Starts Postgres, builds API, starts API, runs module regressions and G5-C RBAC audit. |
| `.github/workflows/dump-prod-schema.yml` | Manual production schema dump | Manual-only production environment workflow for schema-only dump through SSH. Not a CI gate. |

## 2. Current NPM/PNPM Scripts

| Package | Scripts |
| --- | --- |
| root `package.json` | `dev:web`, `dev:api`, `dev`, `build:web`, `build:api`, `build`, `lint` |
| `apps/api/package.json` | `build`, `format`, `lint`, `lint:fix`, `start`, `start:dev`, `start:debug`, `start:prod`, `test`, `test:watch`, `test:cov`, `test:smoke`, `test:regr:*`, `typeorm`, `migration:*` |
| `apps/web/package.json` | `dev`, `dev:clean`, `build`, `start`, `lint`, `typecheck` |

## 3. Directly Reusable Commands

| Purpose | Command |
| --- | --- |
| Install dependencies | `pnpm install --frozen-lockfile` |
| API typecheck | `pnpm --filter phoenix-erp-v3-nest exec tsc --noEmit` |
| Web typecheck | `pnpm --filter web run typecheck` |
| API build | `pnpm --filter phoenix-erp-v3-nest build` |
| Web build | `pnpm --filter web build` |
| API basic tests | `pnpm --filter phoenix-erp-v3-nest test -- --runInBand` exists, but local audit currently fails on an existing `procurement.service.spec.ts` constructor arity mismatch; not enabled as Phase 1 hard gate. |
| API smoke | `pnpm --filter phoenix-erp-v3-nest test:smoke` or `bash scripts/smoke-test.sh` |
| Migration down check | `bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations` |
| Migration no business DML check | `bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations` |
| Nullable unique check | `node scripts/check-nullable-in-unique.js` |
| RBAC audit | `bash scripts/g5c-rbac-audit.sh "$API_BASE"` |

## 4. Current Missing CI Checks

| Missing check | Phase 1 treatment |
| --- | --- |
| Standalone build/typecheck workflow | Implemented as `ci-build.yml`. |
| Standalone security/freeze workflow | Implemented as `ci-security.yml`. |
| Runtime smoke workflow | Implemented as placeholder `ci-smoke.yml`; real runtime dependencies deferred. |
| Public controller allowlist enforcement | Partially implemented as changed-file scan for `@Public`, `SkipAuth`, `AllowAnonymous`; full allowlist deferred. |
| Sensitive log scan | Implemented as changed-file static scan for sensitive logging patterns. |
| JWT fallback/env drift scan | Implemented as changed-file static scan. |
| Chanjet callback/signature critical path detection | Implemented as changed-file static scan requiring explicit override/review. |
| Dedicated staging deploy | Plan only; not implemented in Phase 1. |

## 5. Recommended Minimal Workflows

| Workflow | Recommendation | Phase 1 action |
| --- | --- | --- |
| `ci-build.yml` | Install deps, API typecheck/build, web typecheck/build, document deferred basic API tests. | Implemented. |
| `ci-security.yml` | Freeze boundary check, security regression scan, nullable unique, W5 closeout static summary. | Implemented. |
| `ci-smoke.yml` | Placeholder/manual smoke entrypoint until controlled DB/auth fixtures are ready. | Implemented as documented-only/manual-safe gate. |
| `deploy-staging.yml` | Manual dispatch, protected `staging` environment, staging secrets only, smoke after deploy. | Plan only; not implemented. |

## 6. Recommended Minimal Scripts

| Script | Purpose | Phase 1 action |
| --- | --- | --- |
| `scripts/ci/check-freeze-boundaries.mjs` | Fail if changed files touch migration, schema/entity/database, core business modules, permission/auth/RBAC, Chanjet, or deployment chain without explicit override. | Implemented. |
| `scripts/ci/check-security-regression.mjs` | Changed-file scan for public auth bypass markers, JWT fallback/env drift, sensitive logging, and Chanjet critical paths. | Implemented. |
| `scripts/ci/check-w5-closeout-gate.mjs` | Aggregate static W5 closeout prerequisites that can be checked without runtime services. | Implemented. |
| `scripts/ci/check-public-controller-allowlist.mjs` | Full public endpoint allowlist and diff report. | Plan only; deferred. |
| `scripts/ci/check-sensitive-log-baseline.mjs` | Full-repo baseline-aware sensitive log scan. | Plan only; deferred. |

## 7. Plan Only, Not Implemented

| Item | Reason |
| --- | --- |
| `deploy-staging.yml` | Requires staging secret/environment policy; no deploy chain changes in W5 limited mode. |
| Full runtime smoke with DB/auth fixtures | Requires controlled database and test users; Phase 1 keeps runtime smoke manual. |
| Full public controller allowlist | Needs policy-approved list of intentionally public endpoints. |
| Full sensitive-log baseline | Existing repo has historical logging patterns; baseline must be reviewed before full-repo red line. |
| Existing `deploy.yml` refactor | Avoid changing current production deploy behavior during W5 limited recovery. |
| API Jest hard gate | Existing `procurement.service.spec.ts` does not compile against current service constructor; fixing it would touch procurement test/business-adjacent scope, so it is deferred. |

## 8. Implemented In This Phase

| Type | Files |
| --- | --- |
| Workflows | `.github/workflows/ci-build.yml`, `.github/workflows/ci-security.yml`, `.github/workflows/ci-smoke.yml` |
| Scripts | `scripts/ci/check-freeze-boundaries.mjs`, `scripts/ci/check-security-regression.mjs`, `scripts/ci/check-w5-closeout-gate.mjs` |
| Review doc | `docs/ops/AI_DELIVERY_PHASE1_CI_GATE_REVIEW.md` |

## 9. Freeze Check

| Frozen item | Touched |
| --- | --- |
| New migration | No |
| Schema/entity/table/column | No |
| Procurement/sales/finance/POS core business | No |
| Permission business logic | No |
| Chanjet sync business logic | No |
| Production deployment chain | No |
| Production deploy | No |
| Direct main merge bypass | No |

Conclusion: frozen items touched = No.
