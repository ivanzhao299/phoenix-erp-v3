# Store Payment Store Code Normalization Plan

Task ID: `STORE_PAYMENT_PILOT_GATE_S1`

Status: `READY_FOR_APPROVAL`

This plan resolves the `STORE-VTE-001` versus `ST-VTE-001` namespace risk before A3/A4 implementation gates can open.

## Known Codes

| Code / name | Evidence | Current interpretation |
| --- | --- | --- |
| `STORE-VTE-001` | Exists in `mst_stores`; exists in `sys_organizations`; `ACTIVE`; maps to `COMP-LAO-AGRI` | Recommended canonical Store Payment pilot store |
| `ST-VTE-001` | Appears on test users and UAT/POS scripts | Legacy/test/POS shorthand that is not proven equivalent |
| `万象直营店` | DB-proven store name for `STORE-VTE-001` | Pilot store display name |
| `COMP-LAO-AGRI` | DB-proven company mapping | Pilot company code |

## Recommended Canonical Store Code

Canonical Store Payment store code: `STORE-VTE-001`

Reason:

1. Present in both `mst_stores` and `sys_organizations`.
2. Active in target DB.
3. Maps consistently to `COMP-LAO-AGRI`.
4. Matches current Store Payment evidence package.

## Compatibility Strategy for `ST-VTE-001`

Do not silently treat `ST-VTE-001` as the same store in Store Payment writes.

Allowed compatibility options, pending user approval:

1. Create an explicit alias mapping table or config outside Store Payment tables.
2. Normalize selected pilot users from `ST-VTE-001` to `STORE-VTE-001`.
3. Keep `ST-VTE-001` only for old POS/UAT flows and require Store Payment pilot users to use `STORE-VTE-001`.

Recommended option for MVP pilot: normalize pilot users/scopes to `STORE-VTE-001` after user approval and backup.

## Alias Mapping Decision

Alias mapping is optional but recommended if legacy POS/UAT references must coexist. If introduced, it must be read-only-resolved by service logic or a central master-data mapping layer, not by ad hoc string replacement in UI.

## Data Migration Need

Potential data update is needed only if the user approves changing pilot test users or scope rows from `ST-VTE-001` to `STORE-VTE-001`.

This package does not perform data migration or DB write.

## Frontend Display Mapping

Frontend should display `万象直营店` from canonical master data and avoid exposing ambiguous code choices. If an alias appears, UI should show it as legacy/alias only after backend supplies an approved mapping.

## DataScope Impact

DataScope must use the same canonical code as Store Payment records and accounts:

- Store Payment account rows: `store_code = STORE-VTE-001`
- Store Payment record rows: `store_code = STORE-VTE-001`
- Pilot users/org scope: must resolve to `STORE-VTE-001`

If DataScope resolves `ST-VTE-001`, A2 must treat it as not ready until alias behavior is proven.

## A5 Readiness Impact

A5 can move from HOLD only after read-only DB evidence proves:

1. Pilot users are active.
2. Pilot users have Store Payment roles.
3. Pilot users resolve to `STORE-VTE-001` directly or through approved alias.
4. Store Payment account rows use `STORE-VTE-001`.

## A2 Security Impact

A2 must review:

1. No cross-store leakage through alias matching.
2. No fallback to broad company/global scope for ambiguous store codes.
3. Denied access auditing for mismatched store code attempts.
4. Export filters cannot mix canonical and alias codes without explicit mapping.

