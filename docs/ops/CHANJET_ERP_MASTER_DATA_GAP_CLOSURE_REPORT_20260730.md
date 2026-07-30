# Chanjet ERP Master Data Gap Closure Report

Date: 2026-07-30

## Decision

`GO_WITH_CONDITIONS`

The structural gaps left by deterministic exact mapping now have a
machine-readable, review-ready closure path. This Gate prepares and stages
evidence only. It does not create ERP master data, approve mappings, change ERP
inventory or finance facts, or call a Chanjet write API.

## Baseline

- Deterministic exact identities: 41.
- Structural gaps: 225.
- Finance cash-account mapping: 37 / 49.
- WMS mapping: 16 / 191.
- Open WMS identities: 25 warehouse, 128 product and 22 UOM.
- Mapping conflicts: 0.
- Provider permission HOLDs: 6.

## Implemented Capability

### Review manifest

`GET /api/chanjet/integration/erp-master-gap-closure`

The endpoint combines finance and WMS gaps, returns proposal-group and source
row counts, policy-table state, risk levels, required fields, validation
commands and acceptance criteria.

### Evidence staging

`POST /api/chanjet/integration/erp-master-gap-closure/stage`

The endpoint is protected by `MENU_SETTINGS_CHANJET:E`. It stores only
`erpMasterGapProposal` evidence in existing Chanjet mapping rows. Repeated
execution is idempotent when the proposal identity and action are unchanged.

### Domain routing

| Source class | Review target | Safety rule |
| --- | --- | --- |
| Department | `sys_organizations` | Company and organization scope review |
| Project | `biz_projects` | Company ownership and active-state review |
| Cash account | `fin_cash_accounts` | Currency and ownership review; never infer a balance |
| Real warehouse | `wms_warehouses` | Same-company active warehouse required |
| Chicken house | `chanjet_wms_house_location_policies` | Never create a fake warehouse from a house name |
| Egg product | `product_skus` | Grade, specification and package semantics required |
| Material | `mst_materials` | Category and base UOM required |
| Livestock | Explicit inventory/accounting policy | Never treat livestock as an egg SKU or material |
| Base UOM | `sys_dict` / `INV_UOM` | Dimensional equivalence required |
| Package/context UOM | `chanjet_wms_uom_conversion_policies` | Product-specific positive conversion required |

## UI

The administrator Chanjet integration page now shows:

- proposal groups and source rows;
- finance and WMS proposal counts;
- high-risk proposal count;
- automatic creation count, fixed at zero;
- house/location and UOM policy state;
- an explicit action to stage review evidence.

The page remains administrator-only. Ordinary users do not see the integration
control plane.

## Guardrails

- Automatic ERP master creation: disabled.
- Automatic mapping approval: disabled.
- Fuzzy or cross-company mapping: forbidden.
- Chanjet external write: forbidden.
- ERP inventory fact write: forbidden.
- ERP finance business-fact write: forbidden.
- Cash or bank balance inference from an account directory: forbidden.
- Historical WMS document replay: forbidden.

## Verification

- API TypeScript: PASS.
- Web TypeScript: PASS.
- API production build: PASS.
- Web production build: PASS, 230 routes generated.
- Chanjet Jest: PASS, 11 suites / 190 tests.
- Web Vitest: PASS, 50 files / 242 tests.
- i18n coverage: PASS, 3300 / 3300 strings, 0 uncovered.
- Entity drift Gate: PASS.
- Nullable unique Gate: PASS.
- W5 closeout Gate with approved freeze/security evidence flags: PASS, 20 / 20.
- `git diff --check`: PASS.
- GitHub CI/CD run `30553067351`: PASS.
- Production revision: `1b1bbcdc65817c8fa747fc2fe78a764976a86112`.
- Production API, Web and database containers: healthy.

The local Web build initially failed because the main repository's direct
dependency symlinks still pointed to the retired Codex worktree. Reinstalling
from the frozen lockfile rebuilt local links; no dependency version or lockfile
changed. `next.config.ts` now reuses one canonical monorepo root value for
Turbopack and standalone tracing.

## Production Runtime Evidence

The deployed manifest returned:

- 225 proposal groups / 225 source rows;
- 50 finance proposal groups;
- 175 WMS proposal groups;
- 92 high-risk groups;
- 0 proposals eligible for automatic creation;
- 225 proposals requiring explicit approval;
- 6 provider permission HOLDs across `OTHER_STOCK_IN` and
  `RETAIL_STOCK_OUT` for three account books.

The first controlled staging run recorded proposal evidence for all 225 source
rows. It changed only `chanjet_master_mapping.raw_data.erpMasterGapProposal`.
It did not change matching status, review status or an ERP business table.

The second staging run proved idempotency:

| Domain | Proposal groups | Source rows | Newly staged | Unchanged |
| --- | ---: | ---: | ---: | ---: |
| Finance | 50 | 50 | 0 | 50 |
| WMS | 175 | 175 | 0 | 175 |

Business-table counts and deterministic row fingerprints were captured before
and after the second staging run:

| Table | Rows | Before fingerprint | After fingerprint | Result |
| --- | ---: | --- | --- | --- |
| `inv_batches` | 257 | `2b181afe184fcf97da6a5a8a363e3630` | `2b181afe184fcf97da6a5a8a363e3630` | PASS |
| `inv_ledger` | 111 | `9c6e96f1031406f8633f2a7498ca30fd` | `9c6e96f1031406f8633f2a7498ca30fd` | PASS |
| `fin_cash_accounts` | 62 | `d84b91113c0416f5f5018590cd6fe44b` | `d84b91113c0416f5f5018590cd6fe44b` | PASS |

The complete sanitized evidence is stored at
`docs/ops/runs/chanjet-erp-master-gap-closure-runtime-20260730.json`.

## Runtime Conditions

The ERP-only WMS policy migration is already applied in production. Both policy
tables exist but currently contain zero reviewed rows:

- `chanjet_wms_house_location_policies`;
- `chanjet_wms_uom_conversion_policies`.

The Gate is deployed and production-verified. The remaining 225 rows are not
presented as completed mappings: they are explicit review proposals for missing
ERP masters or domain policies. The six provider permission HOLDs remain
visible and non-retryable until the Chanjet grant changes.

## Next Gate

`CHANJET_ERP_MASTER_DATA_PROPOSAL_REVIEW_AND_CONTROLLED_CREATION`

Only proposals with complete required fields, one same-company target, explicit
review and validation evidence may proceed. Master creation and mapping approval
remain separate controlled actions. The six provider permission HOLDs remain a
separate provider-side Gate.
