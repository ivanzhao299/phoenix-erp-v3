# Chanjet Callback Secret Handling Remediation

Date: 2026-06-27
Owner: Codex-Orchestrator
Scope: Chanjet/Yonyou security hardening, RBAC atomicity guard, sensitive log/response minimization

## Problem

The production readiness backlog still carried a Chanjet external-interface condition:

1. Callback strict signature/timestamp/nonce enforcement must remain intact.
2. Manual Chanjet proxy/test actions must require edit-level finance ledger permission and be audited.
3. Sensitive callback/config values must not be consumed from weak paths or echoed in logs/responses.

The POST callback and proxy path were already hardened, but the GET callback still accepted `certificate` / `authCode` query values and updated Chanjet auth state. Several manual endpoints also returned token/certificate/ticket previews, and auth service logs could include unmasked provider response fields.

## Changes

### Backend

- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
  - GET `/api/chanjet/callback` is now verification-only.
  - GET callback ignores sensitive credential query fields and logs only field names.
  - Signed POST callback remains the only public path that can consume `certificate`, `authCode`, or `appTicket`.
  - Manual `test-token`, `set-cert`, and `set-ticket` responses no longer return token/certificate/ticket previews.

- `apps/api/src/modules/chanjet/chanjet-auth.service.ts`
  - Added recursive sensitive-field masking for provider responses.
  - Removed ticket/certificate previews from logs.
  - Removed certificate preview from diagnostics; diagnostics now returns boolean state only.

### CI Guard

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Fails if GET callback consumes Chanjet credentials again.
  - Fails if Chanjet manual endpoints expose token/certificate/ticket previews.
  - Fails if Chanjet auth logs raw provider responses for certificate/token/ticket operations.

## Security Result

| Area | Result |
| --- | --- |
| POST callback signature/timestamp/nonce | Preserved |
| GET callback credential consumption | Removed |
| Manual proxy permission | Preserved as `MENU_FIN2_AR_LEDGER:E` |
| Manual proxy audit | Preserved as `CHANJET_CALL_PROXY` under `MENU_FIN2_AR_LEDGER` |
| Sensitive values in logs/responses | Minimized to booleans / `[REDACTED]` |
| Business code outside Chanjet | Not changed |
| Migration / DB write | Not executed |
| Deploy / push | Pending CI/CD after commit |

## Validation

Planned validation for this remediation:

1. API typecheck.
2. Web typecheck.
3. Menu permission atomicity guard.
4. TS migration no-data-DML gate.
5. TS migration down() gate.
6. nullable-in-unique gate.
7. W5 closeout gate with authorized high-risk flags.
8. `git diff --check`.

## Remaining Conditions

1. Real provider valid-signature callback smoke still depends on a Chanjet signed payload from the provider or sandbox.
2. GET callback continues to return `{ result: "success" }` for provider URL verification but no longer mutates auth state.
3. Any future new Chanjet API path must remain allowlisted and audited.
