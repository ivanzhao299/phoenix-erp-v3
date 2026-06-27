# A1 Runtime / Security Blocker Remediation Execution Report

Date: 2026-06-24

## Scope

This Gate implements the bounded `PRD-P0-002` remediation items from `docs/ops/A1_RUNTIME_SECURITY_BLOCKER_REMEDIATION_PLAN.md`.

Approved implementation scope:

- Production `ENABLE_DEV_LOGIN=true` fail-fast.
- SSE invalid token handling.
- Admin impersonation hardening.
- Chanjet callback signature / timestamp / nonce validation and sensitive-log masking.
- Procurement service test drift repair.

Out of scope:

- Migration.
- DB write.
- Production deploy.
- Push.
- Broad procurement business logic change.
- Chanjet business synchronization behavior changes beyond callback ingress hardening.

## Modified Files

- `apps/api/src/main.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/modules/notification/notification-stream.controller.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/api/src/modules/procurement/procurement.service.spec.ts`
- `docs/ops/runs/a1-runtime-security-remediation-20260624/**`
- `docs/ops/A1_RUNTIME_SECURITY_BLOCKER_REMEDIATION_EXECUTION_REPORT.md`
- `docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`
- `docs/ops/AGENT_TASK_BOARD.md`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`

## Remediation Results

### Production Dev Login Fail-Fast

`apps/api/src/main.ts` now exits before Nest application creation when:

- `NODE_ENV=production`
- `ENABLE_DEV_LOGIN=true`

Runtime smoke after API build:

- Command class: local API runtime smoke.
- Result: PASS.
- Evidence: `docs/ops/runs/a1-runtime-security-remediation-20260624/dev-login-failfast.txt`
- Exit code: `1`, expected for fail-fast.

### SSE Invalid Token

`apps/api/src/modules/notification/notification-stream.controller.ts` now throws `UnauthorizedException` when the EventSource token is missing, invalid, or expired.

Result:

- Invalid token path no longer returns a normal SSE `unauthorized` event body.
- This closes the previous auth-smoke ambiguity.

### Admin Impersonation

`apps/api/src/auth/auth.service.ts` now blocks impersonation into users with `ROLE_ADMIN`.

Result:

- Admin preview remains limited to non-super-admin target users.
- Super-admin audit bypass remains forbidden.

### Chanjet Callback Security

`apps/api/src/modules/chanjet/chanjet-callback.controller.ts` now requires signed POST callbacks with:

- `x-chanjet-signature`
- `x-chanjet-timestamp`
- `x-chanjet-nonce`

Validation:

- HMAC-SHA256 over `timestamp.nonce.body`.
- Hex and Base64 signatures are accepted.
- Timestamp skew limit: 5 minutes.
- Nonce replay blocked in-memory for the acceptance window.
- Missing or invalid callback secret/signature/timestamp/nonce fails closed with `403`.

Sensitive logging:

- `certificate`
- `authCode`
- `appTicket`
- `openToken`
- `accessToken`
- `secret`
- `signature`

are masked as `[REDACTED]` in callback logs.

Condition:

- A production/staging valid-signature integration smoke should be run after Chanjet callback secret ownership is confirmed.
- GET callback verification is now masked but still follows the existing provider handshake behavior; a future Chanjet provider-spec Gate may further constrain GET callback semantics if the upstream contract permits.

### Procurement Test Drift

`apps/api/src/modules/procurement/procurement.service.spec.ts` now matches the current `ProcurementService` constructor and `rejectRequest` query sequence.

Result:

- Procurement targeted unit test passes.

## Validation Results

| Check | Result | Evidence |
| --- | --- | --- |
| API build | PASS | `pnpm --filter phoenix-erp-v3-nest build` |
| API typecheck | PASS | `docs/ops/runs/a1-runtime-security-remediation-20260624/api-tsc.txt` |
| Procurement targeted Jest | PASS, 16/16 | `docs/ops/runs/a1-runtime-security-remediation-20260624/procurement-jest-result.json` |
| API Jest | PASS, 52/52 | `docs/ops/runs/a1-runtime-security-remediation-20260624/api-jest-result.json` |
| Production dev-login fail-fast smoke | PASS | `docs/ops/runs/a1-runtime-security-remediation-20260624/dev-login-failfast.txt` |
| Freeze boundary default gate | EXPECTED FAIL | apps/api and security code paths touched |
| Freeze boundary with approved override | PASS | `ALLOW_FREEZE_TOUCH=true` |
| Security regression default gate | EXPECTED FAIL | security-sensitive files changed |
| Security regression with approved override | PASS | `ALLOW_SECURITY_TOUCH=true` |
| W5 closeout with approved overrides | PASS | `docs/ops/runs/a1-runtime-security-remediation-20260624/w5-closeout-allow.txt` |

## Risk Notes

- This remediation intentionally touches frozen application/security paths. The default freeze and security gates correctly block it without explicit override.
- No migration, schema/entity/table/column change, DB write, deploy, restart, or push occurred.
- Chanjet valid-signature positive smoke remains a post-secret ownership condition.
- Production runtime rollout remains blocked until deploy-chain hardening and legacy upload runtime verification are closed or accepted.

## A2 Security Conclusion

PASS WITH CONDITIONS.

Conditions:

1. Confirm the Chanjet callback signing secret and upstream signature contract before production rollout.
2. Run staging or production-side valid-signature callback smoke under an approved runtime verification Gate.
3. Keep security regression gate overrides limited to this approved remediation commit.

## A1 Validation Conclusion

PASS WITH CONDITIONS.

Conditions:

1. Default gates must continue to fail on unapproved apps/api security changes.
2. Production deploy, push, DB write, restart, and migration remain unexecuted.
3. Re-run A1 closeout after deploy-chain hardening and legacy upload runtime verification.

## Current Conclusion

GO WITH CONDITIONS.

`PRD-P0-002` implementation is complete for the approved local code remediation scope.

Next recommended P0 Gate:

1. `PRD-P0-003 DEPLOY_CHAIN_HARDENING_DRY_RUN`
2. `PRD-P0-004 LEGACY_UPLOAD_RUNTIME_VERIFICATION_GATE`
3. Refresh `PRD-P0-001` remote read-only evidence after SSH stability improves.
