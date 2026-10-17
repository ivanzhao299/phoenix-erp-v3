# Issue #401 — Batch 2 scope and compatibility preparation

Base main: `4930b6178efe94325945610191f1234f898afb20`; the complete updated #384 branch is included for ordered integration testing. Do not merge #411 before #384. This branch does not authorize a main merge or production release.

## Necessary security correction

Independent review of the original #411 found that a DEPARTMENT binding could inherit company/site snapshots or ancestor projections and thereby gain daily report access. A real PostgreSQL negative test reproduced the escalation before the correction. The organization decision in `docs/M1_ORGANIZATION_MODEL_DECISIONS.md` requires explicit organization bindings.

Daily reports now consume separate breeding company/site/farm grants. Explicit COMPANY (including the existing REGION/BU company expansion), explicit SITE and verified ACTIVE extra farm grants remain valid. Department snapshots and ancestor company projections do not grant daily reads. Missing daily-specific fields fail closed. Legacy arrays consumed by other modules remain unchanged; existing GROUP and administrator behavior is retained. Tests cover empty/company/site department snapshots, mixed explicit grants, saved row visibility, foreign-company denial, filters, permissions and generic CRUD regression.

## Date compatibility

The +08 real-PG test also reproduced a saved `2026-10-17` SQL DATE being returned as `2026-10-16`. The private daily-date normalizer now uses local calendar components, matching the minimal date fix in #408 (`4c707fac`). This is a necessary #401 date/read compatibility backport; no #403 export/nine-grade display or #402 input feature is included.

## Fixture and evidence

The HTTP/PG suite uses real JWT guards, DataScope, CRUD, FarmService and inbound/inventory services, with synthetic identities, explicit fixture schema and a TEMP-mode adapter. It exercises save → scoped read → inbound → original-batch retry → foreign denial. It requires a loopback `issue401_fixture` database and matching `ISSUE401_FIXTURE_OWNER` marker before fixture writes. No application migrations or production database are used. Initial fixture-column omissions were repaired in the fixture, not application code.

Targeted API typecheck PASS; changed API ESLint 0 errors (existing warnings). Latest HTTP/PG suite 10 PASS. Full combined tests/current-head CI and independent review receipts are recorded separately; no old-head results establish current-head approval.

## Production floor and approvals

`scripts/ops/production-config-contract.json` lists `apps/api/src/modules/generic-crud/generic-crud.service.ts` as critical. Controller and DataScopeService are not listed. A future production deployment containing this service change requires separate config-floor transition/re-anchor assessment and exact-SHA authorization; this preparation neither changes nor promotes the production floor.

Formal frozen-boundary/security-sensitive approval for the updated exact HEAD is still required. The technical review does not create GitHub APPROVE or approval labels. Keep Draft/HOLD while these gates are missing. No production deployment, database mutation, floor transition or Chanjet recovery action is authorized or executed.
