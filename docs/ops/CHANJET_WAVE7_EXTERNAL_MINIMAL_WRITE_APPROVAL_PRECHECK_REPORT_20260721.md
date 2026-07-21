# Chanjet Wave 7 External Minimal-Write Approval Precheck

Date: 2026-07-21

Decision: `READY_FOR_EXPLICIT_APPROVAL_WITH_EXTERNAL_WRITE_DISABLED`

## Scope completed

1. Added `POST /api/chanjet/integration/external-write-approval/precheck` under `MENU_SETTINGS_CHANJET:E`.
2. Added a machine-readable approval contract covering environment, account book, ERP company, immutable business source, document type, payload hash, balanced amount, currency, period, maker/reviewer/operator, idempotency key, readback, compensation, execution window, expiry and stop rules.
3. Bound the precheck to one existing `PUSH_READY` voucher draft and one `READY` Outbox item.
4. Added fail-closed checks for expired approval, production acknowledgement, maker/reviewer conflict, changed payload, changed idempotency key, mismatched book/company/source/period/amount, non-GET readback, unsafe endpoint, missing provider contract and incomplete stop rules.
5. Added the current Wave 7 Gate to the administrator integration page. The page states that approval is not persisted and external transport remains disabled.

## Safety result

- Approval persisted: no.
- External Chanjet API called: no.
- External write enabled: no.
- ERP business table written: no.
- Migration added or executed: no.
- Chanjet data changed or deleted: no.
- Real provider transport implemented: no.

A complete package can only reach `READY_FOR_A2_A1_A7_REVIEW`. It cannot enable or execute an external write. An incomplete, expired, conflicting or inherited package returns `HOLD`.

## Validation

| Check | Result |
| --- | --- |
| Focused Chanjet Jest | PASS, 66/66 |
| API TypeScript | PASS |
| Web TypeScript | PASS |
| W5 closeout (`ALLOW_FREEZE_TOUCH=true`, `ALLOW_SECURITY_TOUCH=true`) | PASS, 20/20 |
| Incomplete package | HOLD |
| Expired package | HOLD |
| Exact package | READY_FOR_A2_A1_A7_REVIEW |
| External network call | 0 |

## Remaining approval boundary

Wave 7 execution is still blocked. A new approval must identify one exact Outbox item and provide every field in `docs/ops/CHANJET_EXTERNAL_MINIMAL_WRITE_APPROVAL_PACKAGE.md`. The approval cannot be inferred from earlier readonly, deployment, migration or ERP-middle-layer permissions.

After a complete package passes this precheck, A2, A1 and A7 must review it before any provider transport implementation or canary execution is considered.
