# Chanjet Endpoint Handoff

Last updated: 2026-07-30 22:35 CST

This card is the durable bootstrap contract for a new Codex window. It contains
routes and safety rules only. It must never contain a JWT, refresh token,
Chanjet openToken, App Key, App Secret, certificate, database password or SSH
credential.

## Bootstrap Order

1. Read `CODEX_ORCHESTRATOR_MEMORY.md`.
2. Parse `PROJECT_STATE.json`.
3. Read this endpoint handoff.
4. Read `NEXT_ACTIONS.md`.
5. Read `GUARDRAILS.md`.
6. Treat `GET /api/chanjet/integration/current-state` as the only authoritative
   live decision. Historical reports and run artifacts are evidence, not current
   state.

## Production Entry Points

- Admin UI: `https://erp.eggslao.com/finance2/chanjet-integration`
- API origin: `https://erp.eggslao.com`
- Required menu: `MENU_SETTINGS_CHANJET`
- Read endpoints require action bit `V`.
- Manual synchronization or alignment endpoints require action bit `E`.
- Authentication uses the normal Phoenix ERP short-lived authenticated session.
  A new window must obtain a fresh session through the approved authentication
  path; it must not reuse or persist a token from an earlier window.

## Authoritative Read Sequence

1. `GET /api/chanjet/integration/current-state`
   - Purpose: single authoritative decision, next Gate and consolidated runtime
     evidence.
2. `GET /api/chanjet/integration/production-readiness`
   - Purpose: P0-P6 readiness score, grade, blockers and conditions.
3. `GET /api/chanjet/integration/baseline-readiness`
   - Purpose: dynamic per-book/per-scope freshness evidence.
4. `GET /api/chanjet/diagnostics`
   - Purpose: redacted authentication-chain diagnostics; this endpoint must not
     expose token or secret values.
5. `GET /api/chanjet/test-token`
   - Purpose: explicit token acquisition health test. It requires `E` and returns
     only success/hasToken, never the token value.
6. `GET /api/chanjet/test-api`
   - Purpose: explicit readonly provider handshake through the account-book list.

## Approved Readonly Operations

- Resilient mirror refresh:
  `POST /api/chanjet/integration/mirror/sync-resilient`
- Full readonly alignment:
  `POST /api/chanjet/integration/alignment/run`
- Deterministic exact mapping confirmation:
  `POST /api/chanjet/integration/master-mappings/system-confirm-exact`
- ERP master gap review manifest:
  `GET /api/chanjet/integration/erp-master-gap-closure`
- ERP master gap evidence staging:
  `POST /api/chanjet/integration/erp-master-gap-closure/stage`

These operations may write only Phoenix ERP integration, mapping and audit
tables. They must report:

- `writeChanjet: false`
- `writeErpBusinessTables: false` where the endpoint exposes that field

They do not authorize a Chanjet external write, voucher push, ERP inventory
promotion, finance business-fact overwrite, migration or deployment.

The ERP master gap staging endpoint may update only proposal evidence inside
existing Chanjet middle-layer mapping rows. It must never create ERP masters,
approve a mapping, infer a finance balance, replay historical WMS documents or
write a Chanjet object.

## Expected Live State

The first probe in a new window should currently return:

- Decision: `HOLD`
- Next Gate: `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`
- Readiness score / grade: `83 / B`
- Dynamic baseline: `79 / 85` fresh
- Stale targets: `0`
- Provider permission HOLDs: `6`
- Blocked scopes: `OTHER_STOCK_IN`, `RETAIL_STOCK_OUT`
- Provider error: `50111`

The six blocked targets cover the two scopes across three enabled account
books. They are non-retryable until the provider grant changes.

## Fail-Closed Rules

1. If `current-state` is not HTTP 200, returns `success: false`, or cannot be
   authenticated, stop with `HOLD`; do not infer state from an old report.
2. If its next Gate differs from `PROJECT_STATE.json`, use the live endpoint and
   update Runtime Memory after diagnosis.
3. Do not retry provider code `50111` before permissions change.
4. Do not call external-write, voucher-push or writeback execution paths without
   a new explicit approval Gate.
5. Never print, commit, cache in docs, or transfer authentication secrets.
6. Browser login is not an integration mechanism. Normal UI login may establish
   an operator session, but recurring integration must use the server-side API
   authentication chain.

## Current Evidence

- Runtime repair report:
  `docs/ops/CHANJET_READINESS_OOM_AND_PROVIDER_PERMISSION_GATE_REVIEW_20260729.md`
- Production code revision: `64fb5558`
- Successful full CI/CD run: `30464528298`
- Repository memory revision before this card: `7e679790`
