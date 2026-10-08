# Production API bootstrap mutation remediation

## Scope and release status

This is a repository-only remediation of the API-only HOLD admission blocker found after PR #366. Production deployment, floor promotion, migrations, data changes, configuration changes, Chanjet reads/sync and remote writes remain unauthorized in this round.

```ini
BASE_MAIN=85acfe6df5ba51642eb338f2cb4651ebf9df9d25
REMEDIATION_PR=https://github.com/ivanzhao299/phoenix-erp-v3/pull/367
MERGED_MAIN_SHA=PENDING
PRODUCTION_CONFIG_FLOOR_VERSION=2
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_PROMOTION_AUTHORIZATION
```

The production identifiers above are the supplied, previously audited baseline. This remediation does not make a new production connection or assert a new live production observation. The old 85acfe6 authorization does not authorize promotion/deployment of the remediation SHA.

## Baseline write inventory

The companion `production-api-bootstrap-mutation-baseline.json` records source locations at BASE_MAIN, statement classification and table names, without SQL values. These are **SQL literal sites**, not counts of executed statements. Conditional branches, loops, dynamic identifiers and multi-statement literals prevent that interpretation.

| Entry at BASE_MAIN | Reachability | Removed behavior |
| --- | --- | --- |
| GenericCrudService.onModuleInit, generic-crud.service.ts:85 | Nest lifecycle | 428 literal sites: 394 DDL, 16 business/metadata DML, 18 sequence operations; 102 identifiable table names |
| GenericCrudService.ensureColumn | create/update error recovery | One dynamic ALTER literal, reached by both mutation endpoints |
| SystemController.onModuleInit, master.controller.ts:60 | Nest lifecycle | CREATE sys_settings |
| SystemController.ensureTable, master.controller.ts:75 | GET and PUT brand | CREATE sys_settings on ordinary requests |
| CronMonitorService.onModuleInit, cron-monitor.service.ts:26 | Nest lifecycle | CREATE sys_cron_heartbeat |
| IotSyncService.onModuleInit, iot-sync.service.ts:51 | Nest lifecycle | One literal with three DROP CONSTRAINT statements; eager vendor authentication |
| TypeORM PostgresDriver connection initialization | TypeOrmModule -> DataSource.initialize -> PostgresDriver.afterConnect | CREATE EXTENSION IF NOT EXISTS uuid-ossp, observed in real PostgreSQL during an intermediate remediation run |

The GenericCrud bootstrap included schema repair, table rename, indexes, sequences/setval/nextval, historical invoice/transaction updates and dictionary/organization/role/business seed writes. The whole lifecycle implementation is removed rather than relocated. Five startup mutation groups (GenericCrud, SystemController, CronMonitor, IoT, TypeORM) and two GenericCrud online entry points were addressed.

## Complete startup chain and classification

The AST audit scans all API source outside tests/migrations: 537 source files, 285 explicit constructors plus property initializers, 11 lifecycle entries, zero provider useFactory entries and 341 visited methods. It begins at the application entry, constructors, lifecycle methods and startup callbacks; it follows same-class methods, injected services and resolvable helper functions. It reports approval callbacks and recurring intervals separately. A read-only scout independently checked the lifecycle and transitive paths.

| Root / transitive path | SQL or external effect | Admission |
| --- | --- | --- |
| main.bootstrap -> NestFactory/AppModule -> TypeOrmModule/DataSource | Connect to existing schema, session setup, metadata reads | synchronize=false, migrationsRun=false, installExtensions=false explicitly |
| ApiBootstrapSchemaCheck.onModuleInit | pg_extension SELECT | Missing required extension throws SCHEMA_MISMATCH; never creates it |
| main -> hydrateMenuRegistry | sys_menu SELECT; in-memory registry; later five-minute read refresh | Retained |
| SystemController.onModuleInit -> assertExistingSchema | information_schema.columns SELECT | Existing sys_settings required; no startup/GET/PUT DDL |
| CronMonitorService.onModuleInit -> assertExistingSchema | information_schema.columns SELECT | Existing sys_cron_heartbeat required |
| IotSyncService.onModuleInit -> assertExistingSchema/assertConstraintsAbsent | information_schema and pg_constraint SELECT | Three existing IoT tables required; retired property_code FKs cause HOLD, never DROP |
| WorkflowService.onModuleInit | Logger only | Dormant ensureSchema/seedDefaults are not called from initialization |
| WorkflowBizRegistryService.onModuleInit -> register | In-memory approval callbacks | Callback registration does not execute business handlers |
| SalesOrdersService.onApplicationBootstrap -> registry.get/register | Bind approved/rejected/cancelled handlers | No SQL execution during registration |
| PushNotificationService.onModuleInit | Configure VAPID/web-push in memory | No remote push at startup |
| ChanjetArSyncService.onModuleInit | Empty initialization | No ledger import |
| ChanjetAuthService.onModuleInit -> state restore | sys_chanjet_state SELECT; in-memory restoration | Retained; no state mutation on this startup path |
| Auth setImmediate -> bootstrapAppTicket -> triggerAppTicket | POST /auth/appTicket/resend only when no restored ticket | Existing authentication boundary retained; synthetic transport exercised this branch |
| ChanjetReadonlySyncScheduler.onApplicationBootstrap -> readonlySyncEnabled | false in HOLD, immediate return before durable recovery | Existing interrupted RUNNING fixture remains untouched |

Static analysis is not a formal proof of arbitrary TypeScript aliases, inheritance, dynamic calls, SQL builders or framework internals. Manual transitive review and actual full AppModule execution complement it. The TypeORM extension attempt demonstrates why runtime SQL evidence is required. The static gate rejects new unreviewed lifecycle entries, reachable SQL mutations, unresolved query strings, startup ORM mutation calls and unexpected remote startup fetches; detector tests introduce a transitive helper mutation to prove this is not merely a hook-body search.

## Runtime request compatibility

GenericCrud create/update keep their existing allowlists, retired-field handling, parameterized writes, successful response contracts and controller RBAC/DataScope. Missing table/column SQLSTATE 42P01/42703 now gives HTTP 503 with `code=SCHEMA_MISMATCH`, validated table/column identifiers and a controlled-governance message. There is one ordinary DML attempt, no ALTER, no schema repair and no retry. The audit records only table/column, without raw PostgreSQL details or request values. Read/delete mismatch handling is consistent.

Brand GET still returns existing configuration or the previous default response when the existing table has no brand row. Brand PUT retains its protected business configuration upsert. Neither request creates tables. Heartbeat and IoT runtime operations continue using existing schema.

## Schema/data governance backlog

No migration file was added or modified. Migration paths have zero diff from BASE_MAIN.

1. sys_settings and sys_cron_heartbeat were historically created by runtime code and are missing from the canonical migration chain. This PR provides **isolated CI schema fixtures only**, explicitly constrained to test/CI databases. The same backlog includes six breeding tables and three packaging audit/label/QC tables required by existing CI regressions; their empty final schema is now prepared explicitly by that test-only fixture, with no seed/backfill/sequence reset. A separate approved schema track must establish canonical migration coverage and validate existing production structure. The new application and promotion preflight HOLD on missing requirements.
2. IoT property_code FK retirement has an existing controlled migration path. Any environment retaining those three old constraints requires separately approved migration/drift remediation, not automatic startup DROP.
3. Every removed GenericCrud repair/seed site remains in the baseline inventory for independent schema/data governance. Its presence there is not authorization to execute it. Any absent migration replacement, organization/role/dictionary initialization or historical business backfill requires its own reviewed operation. No replacement startup provider was created.
4. Workflow's dormant schema/seed helpers are outside startup reachability; any future explicit administrative use requires the existing administrative/controlled governance boundary. They were not activated or broadly refactored here.

## Background work and Chanjet boundary

These operations are **not included in a claim that the running application never writes**:

| Trigger | Effects / boundary |
| --- | --- |
| Existing business HTTP requests and approved workflow events | Authorized business DML; formal ledger callbacks execute only on their existing approved business event |
| CronMonitor ok/fail called by runtime jobs | Heartbeat upsert and existing operational alert records |
| IoT manual/scheduled runtime sync | Lazy vendor authentication followed by existing monitoring snapshot/history/alert writes; no eager bootstrap authentication |
| Auth ticket/certificate callbacks and explicit token renewal | Existing state persistence; token/auth protocol operations retained, not business writes |
| Chanjet authentication renewal and daily health cron | Existing auth maintenance; health may read account-book API independently of the readonly sync flag; local state/budget updates remain runtime effects |
| Monthly AR reconciliation and other registered operational cron jobs | Existing reconciliation/notification/operational records; not startup initialization |

HOLD remains policy=HOLD, readonly=false, inbound=false. No historical sync recovery, remote business API call, inbound accounting application, voucher push or ledger posting occurred in the startup test. The synthetic auth-maintenance profile performs one appTicket protocol request, with all other network egress rejected. Formal AR import, protected remote-write canaries/outboxes and approved business event handlers keep their independent authorization; this task grants none.

## Actual isolated PostgreSQL proof

The full frozen SQL baseline and 88 TypeORM migrations initialize an owned PostgreSQL 18 fixture **before** the audited window. CI-only metadata fixtures supply the eleven historical runtime-created tables. The proof launches compiled main.js and the entire AppModule under Node 20 with NODE_ENV/APP_ENV=production and HOLD false/false; it does not mock the database, Nest or services.

Synthetic retained rows include a historical invoice direction=NULL, transaction txn_no=NULL, an existing customer and an interrupted RUNNING Chanjet job. This detects the previously automatic backfill and job recovery. All public tables and sequences are fingerprinted before/after. The companion `production-api-bootstrap-isolated-evidence.json` contains only counts, SQL hashes and schema/data/sequence hashes.

| Profile | Actual SQL | Structure/data/sequence change | Remote effect |
| --- | --- | --- | --- |
| writer-restored-auth | 11 reads | 0 / 0 / 0 across 246 tables and 213 sequences | None |
| readonly-restored-auth | 11 reads | 0 / 0 / 0 | None; SELECT-only role, default_transaction_read_only=on |
| writer-auth-maintenance | 11 reads | 0 / 0 / 0 | One synthetic appTicket resend, no business API |
| missing-schema-hold | 5 reads | 0 / 0 / 0; 245 existing tables | Expected startup refusal, no CREATE |
| retired-iot-fk-hold | 7 reads | 0 / 0 / 0 | Expected startup refusal, no DROP |

Capture enables PostgreSQL log_statement=all. Unique **server-side SQL BEGIN/END markers** delimit startup across every database/session. The application process is stopped and database client sessions drained before END; Docker logs must contain both markers. Unmarked/foreign database sessions, unknown executable SQL or any mutation fail the gate. Captured LOG statement/execute and ERROR STATEMENT entries include denied attempts. Readiness is only a bootstrap completion signal, never the SQL proof. Three intentional DDL/DML/setval attempts using the readonly role were denied and detected, with zero actual mutation; six log records reflect statement plus error entries, not six attempts.

The test transport permits only synthetic authentication resend and actual fixture database traffic. A fixed non-cron clock separates initialization from legitimate recurring work. Therefore this proves the defined startup window/configuration and negative schema paths, not all future scheduled work or the actual production schema. Private runtime/raw SQL logs stay local with restricted permissions; Actions uploads only the sanitized summary, including FAIL evidence on setup/detector failure. Earlier fixture invocation mistakes and intermediate TypeORM mutation failures are not counted as passing evidence; the final five-profile server-marker run is the recorded proof.

Separate real PostgreSQL integration tests execute ordinary create/update against a fixture table and verify missing create/update fields fail without DDL/retry or altering the retained row. Schema-gap and transitive-detector cases complement this.

## Floor/deployment protections

This repository candidate expands the v3 critical-file set to cover startup safety and its test/fixture tooling. It does not edit installed production floor2. Future exact-SHA promotion executes the approved target's shared JSON schema requirements through a metadata-only read-only transaction **before any floor/policy/active state mutation**. A gap writes only restricted HOLD evidence and leaves the old floor/runtime intact. The shared requirements cover five tables, required columns, uuid-ossp and three absent retired FKs.

Root trusted paths, permissions/ACL/mount checks, FD9 lock, clean checkout, exact merged target/staged bytes, runtime OCI identity, migration diff from actual running API revision, transition expiry, /data guard and rollback HOLD remain intact. No unsafe old-image rollback exception was added. No production workflow was dispatched. A future new-SHA floor promotion must again pass the live schema preflight; this isolated fixture is not a substitute.

## Verification and independent review

| Check | Actual result |
| --- | --- |
| API and Web typecheck | PASS |
| Node 20 API build / complete unit suite | PASS: 114 suites, 1009 tests; 171 opt-in tests skipped and separately identified |
| Real PostgreSQL CRUD integration | PASS: 4 tests (included among opt-in suite skips above, executed separately) |
| Full AppModule PostgreSQL startup and readonly detector canaries | PASS: five profiles, three denied canaries |
| Lifecycle/static + all ops/config/deployment/rollback tests | PASS: 239 passed, 2 environment/optional cases skipped |
| Root atomic environment transaction test | PASS separately under root Node 20; no production files touched |
| Real isolated schema-promotion metadata adapter | PASS: five tables, 40 metadata columns, uuid-ossp, zero retired constraints |
| Focused scope/RBAC/retirement regression | Existing GenericCrudController/DataScope suites passed in full API suite; warehouse/company isolation and view-only write rejection retained |
| API changed-file ESLint | PASS: zero errors, 47 warnings from existing any/unused-variable debt |
| Migration down/no-data-DML and nullable/constraint drift | PASS; 88 migrations unchanged, zero new drift |
| Actionlint / fixture shell syntax / git diff check | PASS |
| Required GitHub CI | PENDING; obsolete ensureColumn guard assertion replaced by an explicit prohibition on online schema repair; retirement field/key guards retained |
| Independent security review | PASS conditional on final actual five-profile proof and required CI; final proof now PASS |

Independent reviewer first identified incomplete session coverage, failed-run evidence loss, a floor-before-schema hazard and client-clock log cutoff risk. All were repaired and reviewed again. Final review found no remaining P0/P1 code blocker. The reviewer performed read-only source review, not the runtime tests. The primary agent executed the test evidence above.

## Acceptance record

```ini
BOOTSTRAP_WRITE_PATHS_FOUND=5_STARTUP_GROUPS_AND_2_GENERIC_CRUD_ONLINE_ENTRIES
BOOTSTRAP_DDL_REMOVED=YES
BOOTSTRAP_DML_REMOVED=YES
BOOTSTRAP_SEQUENCE_MUTATION_REMOVED=YES
IMPLICIT_BUSINESS_SEED_REMOVED=YES
GENERIC_CRUD_AUTO_DDL_DISABLED=YES
MASTER_CONTROLLER_STARTUP_DDL_DISABLED=YES
CRON_MONITOR_STARTUP_DDL_DISABLED=YES
IOT_STARTUP_DDL_DISABLED=YES
CHANJET_HOLD_PRESERVED=YES
ISOLATED_POSTGRES_BOOTSTRAP=PASS
STARTUP_SCHEMA_MUTATION=0
STARTUP_BUSINESS_DATA_MUTATION=0
UNAPPROVED_STARTUP_WRITE_PATHS=0_IN_TESTED_STARTUP_WINDOW
API_BOOTSTRAP_UNAUTHORIZED_WRITES=0
API_TYPECHECK=PASS
API_TESTS=PASS
INTEGRATION_TESTS=PASS
REQUIRED_CI=PENDING
SECURITY_REVIEW=PASS
PRODUCTION_FLOOR_VERSION=2
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_PROMOTION_AUTHORIZATION
```
