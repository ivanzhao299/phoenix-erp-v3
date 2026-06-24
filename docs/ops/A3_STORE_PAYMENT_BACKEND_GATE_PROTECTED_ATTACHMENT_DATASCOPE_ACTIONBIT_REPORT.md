# A3 Store Payment Backend Gate: Protected Attachment / DataScope / Action-bit Report

Task ID: `STORE_PAYMENT_A3_BACKEND_GATE_PROTECTED_ATTACHMENT_DATASCOPE_ACTIONBIT`
Date: 2026-06-23
Agent: `Codex-Orchestrator` acting for A3 Backend Gate
Conclusion: `GO WITH CONDITIONS`

## 1. Modified Files

| File | Purpose |
| --- | --- |
| `apps/api/src/modules/store-payment/store-payment.controller.ts` | Align Store Payment action bits to `V/E/X`; add protected attachment status endpoints. |
| `apps/api/src/modules/store-payment/store-payment.service.ts` | Add `STORE-VTE-001` / `ST-VTE-001` alias strategy, canonical creation behavior, scoped attachment access-pending responses, and disabled proof preview/download flags. |

No `apps/web/**`, migration, schema/entity/table/column, deployment, or production files were modified.

## 2. Protected Attachment Handling

Result: `GO WITH CONDITIONS`

Implemented backend boundary:

1. Added `GET /store-payment/accounts/:id/qr-attachment`.
2. Added `GET /store-payment/records/:id/proof-attachment`.
3. Both endpoints require authenticated RBAC and DataScope guards.
4. QR endpoint requires `MENU_STORE_PAYMENT_ACCOUNT:V`.
5. Proof endpoint requires `MENU_STORE_PAYMENT:V`.
6. Both endpoints load the parent Store Payment object and enforce parent object scope.
7. Both endpoints return `previewAllowed=false` and `downloadAllowed=false`.
8. Both endpoints return `previewStatus='access_pending'` and `downloadStatus='access_pending'`.
9. Both endpoints return `rawUrl=null`.

This means A4 can safely render disabled preview/download buttons or attachment presence status without receiving a naked URL.

## 3. Naked URL Result

Naked URL returned: `No`

Existing create/update validation continues to reject:

- `/uploads/...`
- `uploads/...`
- `http://...`
- `https://...`

Proof / QR attachment IDs remain controlled references only.

## 4. Preview / Download Current State

Current state: `disabled / access_pending`

The backend does not stream attachment bytes yet. It only exposes a safe status contract for frontend use.

Response contract:

```json
{
  "attachmentBound": true,
  "previewAllowed": false,
  "previewStatus": "access_pending",
  "downloadAllowed": false,
  "downloadStatus": "access_pending",
  "rawUrl": null
}
```

## 5. Denied Audit State

Denied audit state: `TODO after protected attachment ACL implementation`

The current endpoint status path does not expose protected content. It enforces parent scope and returns only safe status. When A3 implements real preview/download streaming, denied access must write an operation/audit log with:

- actor
- parent Store Payment object
- attachment reference
- store code
- denial reason
- no raw URL / storage key / signed URL / bearer token

## 6. DataScope Alias Handling

Result: `GO WITH CONDITIONS`

Implemented service-layer alias strategy:

1. `STORE-VTE-001` is canonical.
2. `ST-VTE-001` is accepted as legacy alias.
3. Store Payment list filters expand either value to both canonical and alias values.
4. Store Payment scope checks compare canonical and alias values.
5. New Store Payment records and accounts normalize creation to `STORE-VTE-001`.
6. No historical data was modified.
7. No data migration was executed.

## 7. STORE-VTE-001 / ST-VTE-001 Strategy

| Code | Treatment |
| --- | --- |
| `STORE-VTE-001` | Canonical Store Payment store code. |
| `ST-VTE-001` | Legacy alias accepted for scope matching and filters. |

Risk that remains:

- This is a hardcoded pilot compatibility map.
- A formal store alias / mapping table is still recommended before broader rollout.
- No global/company fallback is allowed for unresolved store codes.

## 8. Action-bit Alignment

Result: `GO`

Controller action bits now align with the fast-track pilot RBAC matrix:

| Endpoint | Menu | Bit |
| --- | --- | --- |
| `GET /store-payment/accounts` | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| `POST /store-payment/accounts` | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| `PATCH /store-payment/accounts/:id` | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| `GET /store-payment/records` | `MENU_STORE_PAYMENT` | `V` |
| `POST /store-payment/records` | `MENU_STORE_PAYMENT` | `E` |
| `GET /store-payment/records/:id` | `MENU_STORE_PAYMENT` | `V` |
| `GET /store-payment/records/:id/proof-attachment` | `MENU_STORE_PAYMENT` | `V` |
| `GET /store-payment/accounts/:id/qr-attachment` | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| `POST /store-payment/records/:id/confirm` | `MENU_STORE_PAYMENT_CONFIRM` | `E` |
| `POST /store-payment/records/:id/reject` | `MENU_STORE_PAYMENT_CONFIRM` | `E` |
| `POST /store-payment/records/:id/void` | `MENU_STORE_PAYMENT_VOID` | `E` |

`MENU_STORE_PAYMENT_EXPORT:X` remains reserved. Export is not implemented in this Gate.

## 9. A2 Review Result

Result: `PASS WITH CONDITIONS`

A2-relevant checks:

| Check | Result |
| --- | --- |
| Protected attachment naked URL exposure | PASS |
| Preview/download default disabled | PASS |
| RBAC action-bit alignment | PASS |
| Parent object DataScope before attachment status | PASS |
| Store-code alias risk | PASS WITH CONDITIONS |
| Denied audit for future streaming endpoints | CONDITION |
| Formal alias mapping table | CONDITION |

Remaining security conditions:

1. Implement denied audit when real preview/download streams are added.
2. Replace hardcoded alias map with a formal mapping table before multi-store rollout.
3. Keep A4 preview/download disabled until real protected streaming is A2-reviewed.

## 10. A1 Validation Result

Result: `PASS WITH CONDITIONS`

Passed:

- Changed files are limited to `apps/api/src/modules/store-payment/**` and `docs/ops/**`.
- No migration files changed.
- No `apps/web/**` files changed.
- No DB write was executed.
- No deployment was executed.
- No push was executed.
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS.
- `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-freeze-boundaries.mjs`: WARN/PASS under explicit A3 code-touch approval.
- `ALLOW_SECURITY_TOUCH=true node scripts/ci/check-security-regression.mjs`: PASS.
- TypeScript transpile syntax check for changed files: PASS.

Condition:

- Full API typecheck could not run in this worktree because `tsc` is not installed/resolvable in the worktree dependency layout. A fallback using the main repository TypeScript binary failed due missing module resolution for dependencies such as `@nestjs/*` and `typeorm`.

## 11. Forbidden Actions Check

| Boundary | Result |
| --- | --- |
| Migration executed | No |
| Migration file changed | No |
| DB written | No |
| Deployment executed | No |
| Push executed | No |
| `apps/web/**` modified | No |
| Non Store Payment backend module modified | No |
| Schema/entity/table/column modified | No |

## 12. A4 Frontend Gate Decision

Decision: `ALLOW_WITH_CONDITIONS`

A4 may proceed with:

1. Store Payment account list/page using account rows.
2. Store Payment record list/create/detail/confirm/reject/void UI.
3. Permission-aware route and button visibility based on `V/E/X`.
4. Attachment presence display.
5. Disabled preview/download controls showing `access_pending`.

A4 must not:

1. Show raw attachment URLs.
2. Enable proof/QR preview or download before A3 implements protected streaming and A2 approves it.
3. Bypass menu visibility / RBAC.
4. Assume `ST-VTE-001` is canonical in UI payloads; creation payloads should use `STORE-VTE-001`.

## 13. Current Conclusion

`GO WITH CONDITIONS`

A3 Backend Gate has delivered the approved minimum backend boundary for protected attachment status, store-code alias compatibility, and action-bit alignment. A4 Frontend Gate may start with preview/download disabled and with A2/A1 follow-up conditions preserved.
