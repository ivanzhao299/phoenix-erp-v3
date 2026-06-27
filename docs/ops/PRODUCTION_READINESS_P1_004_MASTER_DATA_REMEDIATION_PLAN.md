# Production Readiness P1-004 - Master Data Remediation Plan

Date: 2026-06-24

Task ID: `PRD-P1-004`

Conclusion: `GO WITH CONDITIONS`

## Purpose

This plan closes the production-readiness master-data remediation item without performing broad or speculative production data rewrites.

The reviewed evidence shows that the Store Payment pilot master-data baseline is healthy enough to proceed under conditions:

1. `STORE-VTE-001 / 万象直营店` exists.
2. `STORE-VTE-001` is active.
3. `STORE-VTE-001` maps to `COMP-LAO-AGRI`.
4. `STORE-VTE-001` exists as both store and organization evidence in prior read-only audits.
5. No duplicate core keys were found in the audited master-data columns.
6. No null or blank core keys were found in the audited master-data columns.

No database write, migration, deployment, restart, cleanup, reset, or push-to-production action is authorized by this plan.

## Source Evidence

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MASTER_DATA_DIAGNOSIS_REPORT.md`
- `docs/ops/STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`
- `docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/master_data_diagnosis.txt`
- Store Payment service alias handling in `apps/api/src/modules/store-payment/store-payment.service.ts`
- Store Payment frontend display constants in `apps/web/src/app/(admin)/store-payment/page.tsx`

## Current Readiness

| Area | Result | Evidence |
| --- | --- | --- |
| Pilot store | `GO` | `STORE-VTE-001 / 万象直营店` is active. |
| Pilot company | `GO` | `STORE-VTE-001` maps to `COMP-LAO-AGRI`. |
| Store organization | `GO` | `STORE-VTE-001` appears as organization under `COMP-LAO-AGRI` in prior evidence. |
| Duplicate core keys | `GO` | Duplicate counts were `0` for audited store, organization, role, user, and menu keys. |
| Null / blank core keys | `GO` | Null/blank counts were `0` for audited key columns. |
| `ST-VTE-001` master row | `GO WITH CONDITIONS` | It is not a master-data row and must remain legacy alias only. |
| Store Payment writes | `GO WITH CONDITIONS` | New Store Payment records must use canonical `STORE-VTE-001`. |
| DataScope alias behavior | `GO WITH CONDITIONS` | Service-level alias compatibility exists; a formal mapping table remains a future Schema Gate if needed. |

## Remediation Decision

No broad master-data remediation write is recommended now.

The correct remediation posture is:

1. Keep `STORE-VTE-001` as the canonical Store Payment pilot store code.
2. Keep `COMP-LAO-AGRI` as the pilot company code.
3. Do not create `ST-VTE-001` as a new store or organization row.
4. Do not rewrite historical data to `ST-VTE-001`.
5. Do not silently treat every `ST-*` value as equivalent to `STORE-*`.
6. Keep `ST-VTE-001` as a documented legacy alias for Store Payment only until a formal alias/mapping gate is approved.

## Store Code Policy

Canonical code:

`STORE-VTE-001`

Legacy alias:

`ST-VTE-001`

Allowed behavior:

1. Store Payment service may resolve `ST-VTE-001` to `STORE-VTE-001` for scoped access checks inside the approved Store Payment path.
2. Store Payment frontend may display `ST-VTE-001` only as a legacy alias.
3. New Store Payment records must write `STORE-VTE-001`.

Forbidden behavior:

1. Do not write `ST-VTE-001` into new Store Payment records.
2. Do not add `ST-VTE-001` to `mst_stores` or `sys_organizations` without a separate master-data alias gate.
3. Do not use company/global fallback when store alias resolution is ambiguous.
4. Do not auto-rewrite users, roles, stores, orders, POS records, or historical rows from this plan.

## Risk Assessment

Risk level: `P1 / MEDIUM`

Reason:

- The primary master data is healthy, but wrong alias handling can still create Store Payment DataScope leakage or user lockout.
- A broad repair would be riskier than the current evidence supports.
- The safe action is policy freeze plus targeted future validation, not mass mutation.

## A5 Readiness

A5 conclusion: `GO WITH CONDITIONS`

A5 can treat `STORE-VTE-001 / COMP-LAO-AGRI` as ready for controlled Store Payment pilot flows, provided that:

1. Any user/store scope tested in production is proven against canonical `STORE-VTE-001` or explicitly approved alias logic.
2. Store Payment account and record rows keep canonical `STORE-VTE-001`.
3. Future UAT data setup does not introduce unapproved store aliases.

## A2 Security Review Points

A2 must keep the following conditions active:

1. Alias matching must be scoped to Store Payment and must not broaden to all store code comparisons.
2. Denied access must remain fail-closed for mismatched store/company scope.
3. Export/query filters must not combine canonical and alias values without explicit service-layer review.
4. No admin/superuser bypass may become the normal alias path.

## A1 Validation Points

A1 should validate:

1. No master-data migration was added by this plan.
2. No `apps/api/src/database/migrations/**` file changed.
3. No production DB write was executed.
4. W5 closeout gate remains PASS after documentation update.

## Future Gate, If Needed

If the business later requires a formal alias model, open a separate gate:

`APPROVE_STORE_CODE_ALIAS_MAPPING_SCHEMA_GATE`

That gate must decide:

1. Whether alias mapping belongs in master data, organization metadata, Store Payment config, or a new mapping table.
2. Whether alias mappings are global, module-specific, or company-specific.
3. Whether aliases affect POS, sales receipts, DataScope, exports, or only Store Payment.
4. Migration and rollback strategy.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| Business code changed | No |
| Production DB write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push to production server | No |

## Next Recommendation

Close `PRD-P1-004` as `GO WITH CONDITIONS`.

Continue with:

1. `PRD-P1-005 Store Payment remote readiness smoke` after deploy-chain/runtime verification is allowed.
2. `PRD-P1-006 Production auth/CORS/cookie settings review` as read-only environment evidence.
3. `PRD-P1-007 Rollback path and backup restore validation` as runbook/evidence verification.
