# AI Delivery Factory Setup Review

> Review date: 2026-06-21
> Current mode: W5-RESUME-LIMITED / CI condition recovery
> Scope: read-only audit plus docs/PR-template operating model setup.
> Frozen items touched: No.

## 1. Current Capabilities

| Area | Current capability |
| --- | --- |
| `docs/ops` directory | Missing before this setup; created for Delivery Factory operating docs. |
| Existing docs | Many governance, RBAC, security, migration, go-live, smoke, production recovery, master-data, UI/UX, and finance reports exist under `docs/`. |
| `.github` directory | Exists. Contains workflow files and drift/allowlist baselines. |
| GitHub Actions | Existing workflows: `.github/workflows/deploy.yml`, `.github/workflows/regression.yml`, `.github/workflows/dump-prod-schema.yml`. |
| PR template | Missing before this setup. |
| CODEOWNERS | Not found. |
| Root package scripts | `dev`, `dev:web`, `dev:api`, `build`, `build:web`, `build:api`, `lint`. |
| API package scripts | Build/lint/Jest/smoke/module regressions/TypeORM migration commands exist. |
| Web package scripts | Next dev/build/start, lint, typecheck exist. |
| Docker | `apps/api/Dockerfile`, `apps/web/Dockerfile`, root `docker-compose.yml` exist. |
| Deploy/scripts | `deploy/server-setup.sh` exists. Scripts include backup, smoke, migration checks, drift checks, Chanjet probes, RBAC audits, UI audit, Docker stack verification. |
| Smoke tests | `scripts/smoke-test.sh`; API exposes `test:smoke`. |
| e2e tests | No obvious dedicated e2e framework/workflow found in the audited surface; `scripts/uat-runner.sh` and smoke scripts can be reused as substitutes. |
| Security scans | RBAC/security-adjacent scripts exist: `scripts/g5a-rbac-audit.mjs`, `scripts/g5c-rbac-audit.sh`, migration checks, nullable unique check, entity drift baseline. |
| `check-public-controller` | No script with that exact name found. `scripts/gen-api-docs.sh` scans controllers, but it is documentation-oriented, not a public-controller security gate. |

## 2. Missing Capabilities

| Missing capability | Impact |
| --- | --- |
| Formal Delivery Factory state machine | Natural-language requests were not tied to a uniform gate model. |
| Request intake template | Requirements could skip risk questions for permission, finance, master data, third-party, migration, gray release, rollback. |
| Formal requirement spec template | Agent tasks could start without stable acceptance and rollback definitions. |
| Agent routing rules and task contracts | Multi-Agent work could be assigned inconsistently. |
| Acceptance criteria library | Repeated gates were scattered across reports and scripts. |
| Environment matrix | Local/Codex/CI/staging/production constraints were not summarized in one place. |
| Release/go-no-go/rollback standards | Existing release knowledge existed, but not as a single reusable operating model. |
| PR template | PRs lacked mandatory frozen-item, migration, schema, permission, finance, master-data, third-party, rollback, and CI evidence prompts. |
| CODEOWNERS | No owner-based review enforcement found. |
| Dedicated CI split | Existing `deploy.yml` mixes build/test/deploy concerns; a minimal split plan is recommended but not applied in this phase. |

## 3. Reusable Files

| File | Reuse |
| --- | --- |
| `.github/workflows/deploy.yml` | Existing build/test/deploy workflow with change detection, migration gates, regression, image build, production deploy. |
| `.github/workflows/regression.yml` | Existing V3 regression suite and G5-C RBAC audit. |
| `.github/workflows/dump-prod-schema.yml` | Manual schema-only production dump workflow for drift investigation. |
| `.github/entity-drift-baseline.txt` | Existing entity drift baseline. |
| `.github/null-in-unique-allowlist.txt` | Existing nullable unique allowlist. |
| `scripts/smoke-test.sh` | Reusable smoke gate. |
| `scripts/g5c-rbac-audit.sh` | Reusable RBAC audit gate. |
| `scripts/g5a-rbac-audit.mjs` | Reusable RBAC matrix/security audit helper. |
| `scripts/check-ts-migration-down.sh` | Reusable migration reversibility gate. |
| `scripts/check-ts-migration-no-data-dml.sh` | Reusable business-data DML migration gate. |
| `scripts/check-nullable-in-unique.js` | Reusable DB constraint risk scan. |
| `scripts/check-entity-drift-baseline.sh` | Reusable schema/entity drift guard. |
| `scripts/chanjet-probe.mjs`, `scripts/yonyou-probe.mjs`, `scripts/g199-chanjet-probe.mjs` | Reusable third-party probing tools when sandbox/approved credentials exist. |
| `scripts/backup-db.sh`, `scripts/backup-postgres.sh` | Reusable backup utilities, subject to environment approval. |
| `scripts/uat-runner.sh` | Reusable UAT/smoke-style runner. |
| `docs/W5_P0_SECURITY_GOVERNANCE.md` | Reusable security governance context. |
| `docs/rbac-matrix.md` | Reusable RBAC reference. |
| `docs/go-live-checklist-r6.md`, `docs/glp1-go-live-preparation.md`, `docs/deployment-tiers.md` | Reusable release/go-live context. |

## 4. Files Not To Duplicate

| Existing file | Reason |
| --- | --- |
| `.github/workflows/deploy.yml` | Already owns current CI/CD deploy behavior; do not replace in Phase 0. |
| `.github/workflows/regression.yml` | Already provides regression workflow; enhance minimally later if needed. |
| `.github/workflows/dump-prod-schema.yml` | Already covers manual production schema dump. |
| `scripts/smoke-test.sh` | Existing smoke gate should be referenced, not recreated. |
| `scripts/g5c-rbac-audit.sh` | Existing RBAC audit should be reused. |
| `scripts/check-ts-migration-down.sh` | Existing migration gate should be reused. |
| `scripts/check-ts-migration-no-data-dml.sh` | Existing migration data-DML gate should be reused. |
| `scripts/check-nullable-in-unique.js` | Existing nullable unique scan should be reused. |
| `docker-compose.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile` | Existing container definitions should not be duplicated. |

## 5. Recommended New Files

Created in this setup:

| File | Purpose |
| --- | --- |
| `docs/ops/AI_DELIVERY_STATE_MACHINE.md` | Delivery state machine and gates. |
| `docs/ops/REQUEST_INTAKE_TEMPLATE.md` | Natural-language request intake. |
| `docs/ops/REQUIREMENT_SPEC_TEMPLATE.md` | Formal requirement spec template. |
| `docs/ops/AGENT_ROUTING_RULES.md` | Agent routing and risk rules. |
| `docs/ops/AGENT_TASK_CONTRACT.md` | Standard Agent task contract. |
| `docs/ops/ACCEPTANCE_CRITERIA_LIBRARY.md` | Reusable acceptance criteria. |
| `docs/ops/ENVIRONMENT_MATRIX.md` | Local/Codex/CI/staging/production environment rules. |
| `docs/ops/RELEASE_RUNBOOK.md` | Release procedure. |
| `docs/ops/ROLLBACK_RUNBOOK.md` | Rollback procedure. |
| `docs/ops/PRODUCTION_GO_NO_GO.md` | GO/GO WITH CONDITIONS/HOLD/ROLLBACK decision standard. |
| `docs/ops/AGENT_TASK_BOARD.md` | Lightweight Agent task board. |
| `.github/pull_request_template.md` | PR risk, scope, verification, rollback, and frozen-item checklist. |

Recommended later, not created in this phase:

| File | Reason |
| --- | --- |
| `.github/CODEOWNERS` | Requires owner/team decisions. |
| `.github/workflows/ci-build.yml` | Minimal CI split candidate; should be introduced after deploy workflow review. |
| `.github/workflows/ci-security.yml` | Minimal security gate candidate; should reference existing RBAC/migration/security scripts. |
| `.github/workflows/ci-smoke.yml` | Minimal smoke gate candidate; should reuse `scripts/smoke-test.sh`. |
| `.github/workflows/deploy-staging.yml` | Staging deploy candidate; requires staging secret/environment policy. |
| `scripts/check-public-controller.*` | Security scan candidate; needs API policy for public endpoints. |

## 6. Recommended Modified Files

| File | Recommendation |
| --- | --- |
| `.github/workflows/deploy.yml` | Later split PR test/build from production deploy or add stricter environment approval conditions; do not change in W5 Phase 0. |
| `.github/workflows/regression.yml` | Later add public-controller/security scan once policy/script exists. |
| `package.json` | Later add root aliases for CI gates if desired, e.g. `ci:build`, `ci:security`, `ci:smoke`; not required now. |
| `apps/api/package.json` | Later add explicit security scan script if implemented. |
| `.github/CODEOWNERS` | Add after owner mapping is agreed. |

## 7. Current CI/CD Gaps

| Gap | Notes |
| --- | --- |
| Mixed deploy workflow | `deploy.yml` combines PR test, build, image push, and production deploy logic. This works but increases blast radius for CI edits. |
| No dedicated `ci-build.yml` | Build/typecheck exists inside `deploy.yml`; a split build workflow would make PR requirements clearer. |
| No dedicated `ci-security.yml` | Security-adjacent scripts exist, but no separately named security workflow. |
| No dedicated `ci-smoke.yml` | Smoke script exists, but no standalone smoke workflow. |
| No dedicated staging deploy workflow found | Production deploy exists; staging process is not represented as a separate protected workflow in the audited files. |
| No exact `check-public-controller` gate | Controller scan script exists for API docs, but public endpoint governance is not automated as a security red line. |
| Entity drift is warn-only in current workflow section | `deploy.yml` labels entity/DB sync as warn-only in the audited block. |

## 8. Current Release Automation Gaps

| Gap | Notes |
| --- | --- |
| Staging automation unclear | No separate staging workflow was found. |
| Go/no-go decision not machine-enforced | Existing workflows cannot know business approval and rollback owner unless encoded through environments/templates. |
| Rollback workflow not found | Rollback is documented here as runbook, not automated. |
| Production deploy is push-to-main capable | Current workflow has production deployment behavior on main push; branch protection/environment approvals must carry the safety burden. |
| Release packet not standardized before this setup | PR template and docs now provide structure, but CI does not enforce all fields. |

## 9. Current Agent Orchestration Gaps

| Gap | Notes |
| --- | --- |
| No central Agent state machine | Added by this setup. |
| No standard Agent task contract | Added by this setup. |
| No routing matrix | Added by this setup. |
| No shared task board | Added by this setup. |
| No automated Agent dispatcher | This setup defines process only; automation can be evaluated later. |

## 10. Frozen Item Check

| Frozen item | Touched |
| --- | --- |
| New migration | No |
| Schema/entity/table/column | No |
| M3 schema landing | No |
| Master data migration | No |
| Procurement/sales/finance/POS core business | No |
| Permission business logic | No |
| Chanjet sync business | No |
| Production deployment chain | No |
| Direct production deploy | No |
| W6 project | No |
| CI bypass | No |
| Direct merge to main | No |

Conclusion: frozen items touched = No.

## 11. Minimal CI/CD Enhancement Plan

Because GitHub Actions already exist, do not replace them in Phase 0. The recommended minimum later split is:

| Workflow | Purpose | Reuse |
| --- | --- | --- |
| `ci-build.yml` | Install deps, API typecheck/build, web typecheck/build. | Existing `deploy.yml` build/typecheck steps. |
| `ci-security.yml` | Migration allowlist, migration `down()`, no business DML, nullable unique, RBAC audit, future public-controller scan. | Existing scripts and `.github` baselines. |
| `ci-smoke.yml` | Start API against CI Postgres, run health/login/current-user/smoke. | `scripts/smoke-test.sh`, API smoke script. |
| `deploy-staging.yml` | Protected staging deploy and smoke. | Existing deploy patterns, but with staging secrets/environment only. |

No workflow files were added or modified in this phase to avoid changing CI/CD behavior during W5 limited recovery.
