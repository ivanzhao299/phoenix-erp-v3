# Production Readiness P1-006 - Auth / CORS / Cookie Review Report

Date: 2026-06-24

Task ID: `PRD-P1-006`

Conclusion: `GO WITH CONDITIONS`

## Purpose

Review production auth, CORS, security headers, cookie/session behavior, and unauthenticated access boundaries using local code inspection and remote read-only evidence.

This task also fixed one local frontend routing guard gap discovered during the audit: `/store-payment` was not included in the Next.js middleware guarded prefixes.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-006-auth-cors-cookie-review-20260624-171117`

Evidence files:

- `context.txt`
- `public_auth_headers.txt`
- `public_cookie_cors_retry.txt`
- `remote_env_keys_redacted.txt`
- `remote_env_keys_redacted_retry.txt`
- `local_auth_security_static_refs.txt`

No secret values are intentionally recorded. Remote environment evidence stores only variable names with values replaced by `[REDACTED]`.

## Modified Files

- `apps/web/src/middleware.ts`
- `docs/ops/PRODUCTION_READINESS_P1_006_AUTH_CORS_COOKIE_REVIEW_REPORT.md`
- `docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`

## Remote Auth / Security Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| API health | `PASS` | `/api/health` returned `200`. |
| Production mode | `PASS` | Health body reported `env=production`, `is_production=true`. |
| JWT configured | `PASS` | Health body reported `jwt.loaded=true`. |
| JWT fallback disabled | `PASS` | Health body reported `jwt_fallback_in_use=false`. |
| JWT rotation | `INFO` | Health body reported `rotation_active=false`. |
| DB health | `PASS` | Health body reported `db.connected=true`. |
| Unauthenticated API current-user | `PASS` | `/api/auth/me` returned `401` with `未提供 Token`. |
| Security headers on API | `PASS` | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, and HSTS present. |
| Security headers on Web | `PASS` | Root/login responses include HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`. |
| Remote env keys | `PASS WITH CONDITIONS` | Retry proved `NODE_ENV`, `CORS_ORIGINS`, `JWT_SECRET`, `JWT_SECRET_PREV`, and related keys exist in the API container; values were redacted. |
| Cookie flags | `CONDITION` | Login page GET does not set auth cookies. Full cookie flag verification requires a credentialed login smoke and must not be faked from headers alone. |

## Local Code Review

### Production Fail-fast

`apps/api/src/main.ts` fails closed if `ENABLE_DEV_LOGIN=true` in production.

`apps/api/src/auth/jwt.strategy.ts` fails closed in production when `JWT_SECRET` is unset or equals the development fallback.

The production health endpoint confirms the running environment is not using the fallback JWT secret.

### CORS

`apps/api/src/main.ts` uses `CORS_ORIGINS` in production and enables credentials. The remote container has a `CORS_ORIGINS` key present, but its value is intentionally redacted in this report.

### Route Guard Gap Fixed

Before this task, `apps/web/src/middleware.ts` did not include `/store-payment` in `GUARDED_PREFIXES`.

Impact:

- Unauthenticated users could receive the Store Payment page shell from Next.js.
- Store Payment APIs still returned `401`, so protected data was not exposed.
- The page shell itself is business UI and should not be publicly reachable.

Fix:

- Added `/store-payment` to `GUARDED_PREFIXES`.

Expected result after web deployment:

- Unauthenticated `/store-payment` access redirects to `/login` with a return path, consistent with other admin modules.

## A1 Validation

Conclusion: `PASS`

Commands:

1. `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
2. `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. JWT fallback is not active in production.
2. Unauthenticated API access is fail-closed.
3. Security headers are present.
4. Store Payment page shell route is now guarded locally.
5. No secret values were printed in the report.

Conditions:

1. Cookie flags require a credentialed login smoke after this frontend change is deployed.
2. CORS origin values are redacted; final review should be performed by an operator with secret-safe access to the environment definition.
3. Web deployment is required before the `/store-payment` middleware fix is active remotely.

## Remaining Conditions

| Condition | Owner | Required Gate |
| --- | --- | --- |
| Deploy middleware guard fix | A6 / CI-CD | Existing web deploy path after push/merge |
| Credentialed login cookie flag smoke | A2 / A1 | `APPROVE_AUTH_COOKIE_CREDENTIAL_SMOKE` |
| Verify final `CORS_ORIGINS` values without exposing secrets | A2 / A6 | Operator read-only env review |

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | Yes, frontend middleware guard only |
| API code changed | No |
| DB write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed by this report | No, push happens after local validation/commit |

## Final Result

`PRD-P1-006` is `GO WITH CONDITIONS`.

The discovered Store Payment page-shell exposure has been fixed locally. Production activation requires normal push/deploy. Cookie flag and final CORS-value verification remain credentialed/operator checks.
