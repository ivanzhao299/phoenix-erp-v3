# Chanjet Full Readonly Alignment Delivery Report

## Conclusion

`GO WITH CONDITIONS` for continuous read-only synchronization and administrator reconciliation. Chanjet writeback remains `HOLD`.

## Delivered Scope

### P0 - Full readonly mirror

- The existing 16 scopes remain the single default full-read scope.
- `POST /api/chanjet/integration/mirror/sync-resilient` retries only failed scope/book targets, at most three attempts.
- Any unresolved target keeps the run in `HOLD`; failures remain visible in sync jobs and system alerts.
- `ChanjetReadonlySyncScheduler` runs every four hours with a PostgreSQL advisory lock and Cron Monitor heartbeat.
- Lock and unlock run on one dedicated `QueryRunner` connection, preventing connection-pool session lock leakage.

### P1 - Master-data mapping

- Existing account-book/company one-to-one Gate remains mandatory.
- Customer/supplier system confirmation now requires all of the following:
  - enabled book-to-company mapping;
  - exact normalized code;
  - exact normalized name;
  - same ERP company;
  - ERP master status `ACTIVE`;
  - no approved one-to-one conflict.
- Code-only, name-only, fuzzy, duplicate, inactive, cross-company and conflicting candidates remain manual.

### P2 - Standard read model

- Existing entity snapshots, field catalog, field mappings, semantic extractors and finance read model remain the canonical middle-layer read path.
- The readiness service reports both endpoint freshness and business semantic coverage so raw response envelopes do not masquerade as business-field completeness.

### P3 - Finance card authority

- Finance cards accept Chanjet primary values only through the existing `AUTHORITY_READY` Gate.
- ERP detail remains visible as auxiliary evidence and differences are never silently overwritten.
- Unready metrics continue to use ERP primary values with explicit blocker reasons.

### P4 - Reconciliation

- Existing reconciliation statuses remain explicit: OK, WARN, MISMATCH, HOLD, NEED_MAPPING and NEED_MANUAL_REVIEW.
- The production-readiness view summarizes open mapping and reconciliation conditions without auto-resolving them.

### P5 - Production resilience

- Token health, recent job success rate, mirror freshness and retries are surfaced together.
- The scheduler is disabled only with `CHANJET_READONLY_SYNC_ENABLED=false`.
- Failures trigger cron heartbeat failure and `CRON_FAILURE` alert creation.

### P6 - Business fusion boundary

- `/finance2/chanjet-integration` remains protected by `MENU_SETTINGS_CHANJET`.
- Ordinary users consume business pages and authority-gated values only; they do not see snapshots, mappings, token state or sync controls.

## Administrator UI

The default tab is now `P0-P6 准备度` and displays:

- readiness decision, score and grade;
- seven phase cards with evidence and next actions;
- hard blockers and conditions;
- mirror freshness, mapping, semantic, authority and job-success percentages;
- token configuration state;
- exact system-confirm candidates and manual candidates;
- resilient readonly sync and exact-mapping confirmation controls.

The UI now treats an API body with `success: false` as a failed action instead of displaying a false success message.

## Guardrails

- Chanjet write: **No**
- Chanjet delete: **No**
- Chanjet modify: **No**
- Voucher push: **No**
- Silent ERP business overwrite: **No**
- New migration: **No**
- Production DB schema change: **No**

## Verification

- API typecheck: PASS
- Web typecheck: PASS
- Chanjet unit tests: 16/16 PASS, including scheduler lock-release and HOLD monitoring coverage
- Full repository gates and production deployment smoke are recorded in the release result for this change.

## Remaining Conditions

1. Non-deterministic master-data candidates require individual review.
2. Each finance card remains blocked until its field semantics and authority Gate are complete.
3. Chanjet writeback requires a separate explicit approval and is not part of this delivery.
