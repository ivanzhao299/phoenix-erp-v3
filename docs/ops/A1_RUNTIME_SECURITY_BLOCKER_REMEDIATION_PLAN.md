# A1 Runtime Security Blocker Remediation Plan

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_IMPLEMENTATION_GATE_APPROVAL.

This plan translates the A1 runtime/security FAIL report into bounded implementation tasks. It does not modify application code in this planning Gate.

## Source Evidence

- `docs/ops/A1_CI_RUNTIME_GATE_REPORT.md`
- `docs/ops/PHOENIX_ERP_PRODUCTION_READINESS_TASK_LIST.md`
- Static source references found in:
  - `apps/api/src/auth/auth.service.ts`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/modules/notification/notification-stream.controller.ts`
  - `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
  - `apps/api/src/modules/procurement/procurement.service.spec.ts`

## Blockers

| ID | Severity | Blocker | Proposed Owner | Implementation Gate |
| --- | --- | --- | --- | --- |
| A1-BLOCK-001 | P0 | Production does not fail-fast when `ENABLE_DEV_LOGIN=true` | A3 + A2 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` |
| A1-BLOCK-002 | P0 | SSE invalid token returns HTTP 200 event stream instead of release-contract 401 | A3 + A2 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` |
| A1-BLOCK-003 | P0 | Admin can impersonate another admin | A3 + A2 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` |
| A1-BLOCK-004 | P0 | Chanjet callback lacks strict signature/timestamp/nonce validation | A3 + A2 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` |
| A1-BLOCK-005 | P0 | Chanjet soft-risk payload logs / consumes sensitive certificate and authCode | A3 + A2 | `APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION` |
| A1-BLOCK-006 | P1 | Procurement Jest spec constructor drift blocks API tests | A3 + A1 | `APPROVE_A1_TEST_DRIFT_FIX_IMPLEMENTATION` |
| A1-BLOCK-007 | P1 | API/Web lint debt too large for release gate | A1 + A3 + A4 | Separate lint hardening Gate |

## Recommended Implementation Order

1. Fix `ENABLE_DEV_LOGIN=true` production fail-fast.
2. Fix admin-to-admin impersonation privilege escalation.
3. Implement Chanjet strict callback validation before consuming request body fields.
4. Mask Chanjet sensitive logs and reject soft-risk payloads before certificate/auth-code handling.
5. Decide and implement SSE unauthorized contract.
6. Fix procurement Jest constructor drift.
7. Re-run A1 closeout 13-item matrix.

## A2 Security Requirements

1. Security fixes must fail closed.
2. Chanjet signature validation must include timestamp freshness and nonce replay protection.
3. Sensitive fields must be masked before any logging.
4. Admin impersonation must not permit equal-privilege or higher-privilege target impersonation.
5. Test-only/dev-only paths must be impossible in production.

## A1 Acceptance Criteria

1. A1 closeout item 2 passes or the procurement spec is formally scoped with evidence.
2. A1 closeout item 4 passes: production startup rejects `ENABLE_DEV_LOGIN=true`.
3. A1 closeout item 5 passes or the SSE contract is formally updated and tested.
4. A1 closeout item 6 passes: admin-to-admin impersonation returns 403.
5. A1 closeout items 7 through 11 pass: Chanjet strict negative probes return 403.
6. A1 closeout item 12 passes: sensitive callback payload is not logged or consumed.
7. A1 closeout item 13 has meaningful positive signature evidence, not merely HTTP 200.

## Forbidden In This Planning Gate

- No app code changes.
- No migration.
- No DB write.
- No deploy.
- No restart.
- No push.

## Next Gate

`APPROVE_A1_RUNTIME_SECURITY_FIX_IMPLEMENTATION`

This Gate should allow narrowly scoped changes under `apps/api/src/auth/**`, `apps/api/src/modules/notification/**`, `apps/api/src/modules/chanjet/**`, and the failing procurement spec only.
