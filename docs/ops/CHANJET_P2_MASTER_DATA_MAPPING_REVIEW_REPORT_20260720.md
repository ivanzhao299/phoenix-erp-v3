# Chanjet P2 Master Data Mapping Review Report

Date: 2026-07-20

Decision: **GO WITH CONDITIONS**

Next Gate: `CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE`

## 1. Deployment Failure And Root Cause

The first production deployment of the mapping review (`65680ba8`) succeeded, but its authenticated production audit stopped at `HOLD` with 6/8 checks. This was a runtime evidence defect, not an SSH, Docker, database migration, or deployment-host failure.

Two root causes were found:

1. Historical Chanjet error envelopes had been persisted as master-data snapshots. Their payload was `code=50000`, `status=404`, `requestId=<id>`, and `message=null`. The previous guard required an error message and therefore treated these six rows as valid department/subject data.
2. Project and cash-account payloads use domain fields such as `projectCode/projectName` and `accountCode/accountName`. The generic normalizer did not recognize them, causing cash-account names to fall back to numeric identifiers and suppressing valid exact matches.

## 2. Repair

Application commits:

- `65680ba8 fix: harden Chanjet master data mapping review`
- `bc940815 fix: reject invalid Chanjet mapping residue`
- `96cb7f97 fix: reject message-less Chanjet failure envelopes`

The read model now:

- recognizes project and cash-account domain fields;
- prefers preserved domain-specific raw names over stale numeric fallbacks;
- rejects empty/non-object source evidence;
- rejects provider failure envelopes with abnormal code plus 4xx/5xx status and request ID, even when the provider omits the message;
- keeps historical rows intact and filters them only at the read boundary.

No historical row was deleted or modified.

## 3. Verification

Local verification:

- focused Chanjet tests: 49/49 PASS;
- API typecheck: PASS;
- W5 closeout gate: 20/20 PASS;
- `git diff --check`: PASS.

CI/CD for final application commit `96cb7f972d96de8ed601375d4b3ed8568445caf3`:

- CI Web Unit Tests `29725495749`: PASS;
- AI Delivery CI Security `29725495789`: PASS;
- AI Delivery CI Build `29725495804`: PASS;
- CI/CD Build & Deploy `29725495780`: PASS.

Production verification:

- repository HEAD and API image revision both equal `96cb7f972d96de8ed601375d4b3ed8568445caf3`;
- API container is healthy;
- PostgreSQL connection is healthy;
- authenticated mapping review audit: **8/8 PASS**.

## 4. Production Mapping Evidence

Artifacts:

- `docs/ops/runs/chanjet-master-data-mapping-review-production-latest.json`
- `docs/ops/runs/chanjet-master-data-mapping-review-production-latest.md`

| Domain | Valid source rows | Exact matches | Need mapping | Conflicts | Status |
|---|---:|---:|---:|---:|---|
| Department | 0 | 0 | 0 | 0 | waiting for valid provider source |
| Project | 6 | 0 | 6 | 0 | approval/mapping required |
| Cash account | 49 | 37 | 12 | 0 | exact candidates available |
| Subject | 0 | 0 | 0 | 0 | waiting for valid provider source |
| Currency | 4 | 4 | 0 | 0 | exact |

Totals:

- exact matches: 41;
- need mapping: 18;
- conflicts: 0;
- invalid historical provider envelopes excluded: 6;
- fake `50000` candidates remaining: 0.

Counterparty alignment remains `READY`: 72 rejected historical role-debt mappings are excluded from the actionable denominator and no pending counterparty mapping remains.

## 5. Guardrails

- Exact matching only.
- Company scope is mandatory.
- Cash-account currency must match.
- Fuzzy matching is disabled.
- Cross-company matching is disabled.
- Chanjet write/delete/modify is disabled.
- Voucher push is disabled.
- ERP business-table overwrite is disabled.
- This audit performs no ERP middle-layer write.
- No migration was executed.

## 6. Gate Decision

`CHANJET_P2_MASTER_DATA_MAPPING_REVIEW` is closed with **GO WITH CONDITIONS**.

The next Gate is `CHANJET_P2_EXACT_MAPPING_APPROVAL_GATE`. It may review the 37 cash-account and 4 currency exact candidates, but production confirmation must remain a separate explicit approval because it writes ERP middle-layer mapping records. The 18 non-exact candidates stay visible and cannot be auto-approved. Department and subject mappings remain waiting for valid provider source evidence.
