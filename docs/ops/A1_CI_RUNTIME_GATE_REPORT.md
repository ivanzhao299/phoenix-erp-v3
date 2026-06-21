# A1 CI Runtime Gate Report

## 1. Execution Environment

- pwd: `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`
- branch: `w5-a1-ci-runtime-gate`
- HEAD: `4529e03 docs(ops): register AI delivery agent worktrees`
- node version: `v24.14.1`
- pnpm version: `9.12.0`
- npm version: `11.11.0`
- local DB probe: `psql -U mac -d phoenix_erp -tA -c 'select 1'` returned `1`

## 2. Command List

- `pwd`
- `git branch --show-current`
- `git status --short`
- `git log --oneline --decorate -5`
- `git ls-files AGENTS.md`
- `node -v`
- `pnpm -v || true`
- `npm -v || true`
- `ls -la`
- `test -f package.json && cat package.json`
- `test -f pnpm-lock.yaml && echo "pnpm-lock.yaml exists" || true`
- `test -f pnpm-workspace.yaml && echo "pnpm-workspace.yaml exists" || true`
- `test -d apps/api && echo "apps/api exists" || true`
- `test -d apps/web && echo "apps/web exists" || true`
- `node --check scripts/ci/check-freeze-boundaries.mjs`
- `node --check scripts/ci/check-security-regression.mjs`
- `node --check scripts/ci/check-w5-closeout-gate.mjs`
- `node scripts/ci/check-freeze-boundaries.mjs`
- `node scripts/ci/check-security-regression.mjs`
- `node scripts/ci/check-w5-closeout-gate.mjs`
- `cat package.json`
- `cat apps/api/package.json`
- `cat apps/web/package.json 2>/dev/null || true`
- `node -e "const p=require('./package.json'); console.log(p.scripts||{})"`
- `node -e "const p=require('./apps/api/package.json'); console.log(p.scripts||{})"`
- `node -e "try{const p=require('./apps/web/package.json'); console.log(p.scripts||{})}catch(e){console.log('apps/web package.json unavailable')}"`
- `pnpm install --frozen-lockfile`
- `pnpm exec tsc --noEmit || true`
- `cd apps/api && pnpm exec tsc --noEmit || true`
- `cd apps/api && pnpm test || true`
- `cd apps/web && pnpm exec tsc --noEmit || true`
- `pnpm --filter web typecheck || true`
- `pnpm --filter web build || true`
- `pnpm --filter phoenix-erp-v3-nest build || true`
- `pnpm --filter phoenix-erp-v3-nest lint || true`
- `pnpm --filter web lint || true`
- `rg` inspections for JWT, SSE, impersonate, Chanjet, smoke scripts
- `env -u JWT_SECRET NODE_ENV=production PORT=3991 pnpm start:prod`
- `env NODE_ENV=production ENABLE_DEV_LOGIN=true JWT_SECRET=ci_test_secret_minlen_32_characters_xx PORT=3992 pnpm start:prod`
- `env NODE_ENV=test ENABLE_DEV_LOGIN=true JWT_SECRET=ci_test_secret_minlen_32_characters_xx PORT=3993 pnpm start:prod`
- `curl -i --max-time 5 'http://127.0.0.1:3993/api/notifications/stream?token=invalid-token'`
- Chanjet callback `curl` cases for missing signature, missing timestamp, expired timestamp, replay nonce, bad signature, placeholder legal signature, and soft-risk body
- Impersonate `curl` cases with generated JWTs
- `git diff --name-only`
- `git status --short`

## 3. CI Static Gate Results

| Command | Result | Output summary |
|---|---:|---|
| `node --check scripts/ci/check-freeze-boundaries.mjs` | PASS | syntax OK |
| `node --check scripts/ci/check-security-regression.mjs` | PASS | syntax OK |
| `node --check scripts/ci/check-w5-closeout-gate.mjs` | PASS | syntax OK |
| `node scripts/ci/check-freeze-boundaries.mjs` | PASS | `0 changed file(s) inspected`; no frozen boundary touched |
| `node scripts/ci/check-security-regression.mjs` | PASS | `0 changed source file(s) inspected`; no security regression signal |
| `node scripts/ci/check-w5-closeout-gate.mjs` | PASS | Phase 0 docs, PR template, migration gates, nullable unique gate, RBAC audit, smoke script, freeze gate, security gate all PASS |

## 4. Typecheck / Test / Build Results

| Area | Command | Result | Output summary |
|---|---|---:|---|
| install | `pnpm install --frozen-lockfile` | PASS | lockfile up to date; 997 packages linked |
| root tsc | `pnpm exec tsc --noEmit || true` | FAIL | root has no `tsc` available: `Command "tsc" not found` |
| API tsc | `cd apps/api && pnpm exec tsc --noEmit || true` | PASS | no TypeScript errors |
| API test | `cd apps/api && pnpm test || true` | FAIL | 4 suites passed, 1 suite failed; `procurement.service.spec.ts:26` passes 3 constructor args but `ProcurementService` expects 2 |
| Web direct tsc | `cd apps/web && pnpm exec tsc --noEmit || true` | FAIL | pnpm subdir exec error: `packages field missing or empty` |
| Web typecheck | `pnpm --filter web typecheck || true` | PASS | `tsc --noEmit` completed |
| API build | `pnpm --filter phoenix-erp-v3-nest build || true` | PASS | `nest build` completed |
| Web build | `pnpm --filter web build || true` | PASS | Next.js compiled, typechecked, generated 219 static pages |
| API lint | `pnpm --filter phoenix-erp-v3-nest lint || true` | FAIL | 1427 problems: 2 errors, 1425 warnings |
| Web lint | `pnpm --filter web lint || true` | FAIL | 1250 problems: 811 errors, 439 warnings |

## 5. W5 Closeout 13-Item Matrix

| # | Item | Status | Command | Output summary | Needs fix | Blocks release |
|---:|---|---:|---|---|---:|---:|
| 1 | `cd apps/api && pnpm exec tsc --noEmit` | PASS | `cd apps/api && pnpm exec tsc --noEmit` | no TypeScript errors | No | No |
| 2 | `pnpm test` or minimal auth / permission / notification / chanjet tests | FAIL | `cd apps/api && pnpm test` | Jest failed in `src/modules/procurement/procurement.service.spec.ts:26`; expected 2 args, got 3 | Yes | Yes |
| 3 | production missing `JWT_SECRET` fail-fast | PASS | `env -u JWT_SECRET NODE_ENV=production PORT=3991 pnpm start:prod` | process exited 1 with `[SEC-CRITICAL] JWT_SECRET 未配置...生产环境禁止启动` | No | No |
| 4 | production `ENABLE_DEV_LOGIN=true` fail-fast | FAIL | `env NODE_ENV=production ENABLE_DEV_LOGIN=true JWT_SECRET=... PORT=3992 pnpm start:prod` | service started successfully on port 3992; no fail-fast | Yes | Yes |
| 5 | SSE invalid token returns 401 | FAIL | `curl -i ... /api/notifications/stream?token=invalid-token` | returned HTTP 200 `text/event-stream` with `data: {"type":"unauthorized"}` | Yes | Yes |
| 6 | impersonate super admin -> super admin returns 403 | FAIL | `POST /api/auth/impersonate` as admin targeting `zhaoyongwei` | returned HTTP 200 and impersonated another `ROLE_ADMIN`; self-target returned 400, not 403 | Yes | Yes |
| 7 | Chanjet Strict no signature returns 403 | FAIL | `POST /api/chanjet/callback` with no signature | returned HTTP 200 `{"result":"success"}` | Yes | Yes |
| 8 | Chanjet Strict timestamp missing returns 403 | FAIL | `POST /api/chanjet/callback` with signature + nonce, no timestamp | returned HTTP 200 `{"result":"success"}` | Yes | Yes |
| 9 | Chanjet Strict timestamp expired returns 403 | FAIL | `POST /api/chanjet/callback` with timestamp `1` | returned HTTP 200 `{"result":"success"}` | Yes | Yes |
| 10 | Chanjet Strict nonce replay returns 403 | FAIL | repeated/bad nonce callback probes | returned HTTP 200 `{"result":"success"}`; no nonce replay rejection observed | Yes | Yes |
| 11 | Chanjet Strict bad signature returns 403 | FAIL | `POST /api/chanjet/callback` with `x-chanjet-signature: bad` | returned HTTP 200 `{"result":"success"}` | Yes | Yes |
| 12 | Chanjet Soft risk request masked warn and does not consume sensitive fields | FAIL | `POST /api/chanjet/callback` with `certificate` and `authCode` | logs included `sensitive-cert-value` and `sensitive-auth-code`; service consumed certificate/authCode and attempted external certificate fetch | Yes | Yes |
| 13 | Chanjet legal signature returns 200 success | PASS WITH CONDITIONS | `POST /api/chanjet/callback` with placeholder signature headers | returned HTTP 200 `{"result":"success"}`; however this is not evidence of valid signature verification because strict validation is absent | Yes | Yes |

## 6. FAIL / BLOCKED / NOT RUN Reasons

- Item 2 FAIL: API Jest suite is red due to stale `ProcurementService` test constructor arguments. This is test drift, but it blocks closeout until fixed or scoped.
- Item 4 FAIL: production startup does not reject `ENABLE_DEV_LOGIN=true`; service successfully starts.
- Item 5 FAIL: SSE invalid token contract does not return HTTP 401; current behavior returns HTTP 200 with an SSE unauthorized event.
- Item 6 FAIL: admin can impersonate another admin. Matrix expected super-admin-to-super-admin to return 403.
- Items 7-11 FAIL: `/api/chanjet/callback` is public and does not enforce strict signature/timestamp/nonce checks; all strict-negative probes returned HTTP 200.
- Item 12 FAIL: soft-risk callback logs and consumes sensitive `certificate` / `authCode` values. During this local smoke it also attempted a Chanjet `authCode -> certificate` external call.
- Item 13 PASS WITH CONDITIONS: endpoint returned 200 success, but not because a legal signature was validated.
- No items were marked BLOCKED. Runtime used local Postgres `phoenix_erp`; Redis was not required for tested paths.
- No items were marked NOT RUN.

## 7. Minimal Fixes

No minimal fixes were made. Findings touch security/runtime behavior and Chanjet callback handling, which are outside this A1 report-only execution unless explicitly assigned for remediation.

## 8. Modified Files

- `docs/ops/A1_CI_RUNTIME_GATE_REPORT.md`

## 9. Frozen Items

否。No schema, entity, table, column, migration, procurement/sales/finance/POS core business logic, master data model, DataScope service, FIFO, `store_code`, customer FK, deployment chain, or other Agent worktree was modified.

Runtime note: starting the existing API invoked its current startup routines against local `phoenix_erp`, including idempotent onboarding/seed logs and one Chanjet auth-code external request caused by the existing callback behavior. No migration file or schema/entity source was changed by A1.

## 10. Recommendation for A2-A6

NO.

Do not start A2-A6 as a release progression until A1 blockers are remediated or formally accepted. A2 can be started as the security-remediation owner, but not as downstream validation toward release.

## 11. Next Steps

1. Add production startup fail-fast for `ENABLE_DEV_LOGIN=true`.
2. Decide SSE invalid-token contract: change endpoint to true HTTP 401 before opening event stream, or update closeout criteria if SSE-level unauthorized is intentionally accepted.
3. Block admin-to-admin impersonation with 403 and add regression coverage.
4. Implement Chanjet strict signature/timestamp/nonce validation before callback body consumption.
5. Mask Chanjet callback logs and prevent soft-risk payloads from consuming `certificate` / `authCode`.
6. Fix or scope the red procurement Jest spec.
7. Establish a dedicated closeout smoke script so all 13 items can be run repeatably without manual curl probes.
