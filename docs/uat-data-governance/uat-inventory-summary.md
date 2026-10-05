# UAT DATA GOVERNANCE — READ-ONLY INVENTORY REPORT

```text
ORIGIN_MAIN_HEAD=9e45cdc69cea21f5280eecc68df4e344711f2cb9
BRANCH=codex/uat-data-governance-inventory
SSH_TARGET_IDENTITY=CONFIRMED
PRODUCTION_DEPLOY_PATH=/data/phoenix-erp
TARGET_DB_NAME=phoenix_erp
TARGET_DB_SYSTEM_IDENTIFIER=7641898445435437089
POSTGRES_VERSION=16.14
DATA_DIRECTORY=/var/lib/postgresql/data (container path)
TOTAL_TABLES=297
TOTAL_BUSINESS_TABLES=297
FK_CONSTRAINTS=98
USER_DEFINED_TRIGGERS=21
CONFIRMED_UAT_TABLES=0
CONFIRMED_UAT_ROWS=0
HIGH_CONFIDENCE_UAT_ROWS=0
AMBIGUOUS_TABLES=1 (wms_outbound)
AMBIGUOUS_ROWS=1
WORKFLOW_RUNTIME_CANDIDATES=INVENTORIED_NO_CONFIRMED_UAT
PROCUREMENT_CANDIDATES=INVENTORIED_NO_CONFIRMED_UAT
SALES_CANDIDATES=INVENTORIED_NO_CONFIRMED_UAT
WMS_CANDIDATES=1_AMBIGUOUS
FINANCE_CANDIDATES=INVENTORIED_NO_CONFIRMED_UAT
ATTACHMENT_CANDIDATES=CLASSIFIED_REVIEW_REQUIRED
TEST_ONLY_MASTER_CANDIDATES=0_CONFIRMED
AUDIT_RETENTION=ARCHIVE_DEFAULT
CHANJET_REMOTE_DATA_GATE=NOT_ASSESSED
TOTAL_CANDIDATE_ROWS=1_AMBIGUOUS_0_CONFIRMED
HIGH_RATIO_TABLES=NONE_IDENTIFIED_FROM_ESTIMATES
MANIFEST_GENERATED_AT=2026-10-05T13:58:47+08:00
MANIFEST_SHA256=77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd
FINANCE_RECONCILIATION_READY=NO
ATTACHMENT_RETENTION_READY=NO
U0_READ_ONLY_INVENTORY=COMPLETE
CLEANUP_SCRIPT_READY=NO
DATABASE_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
NEXT_ACTION=U1_RETENTION_DELETE_MATRIX_REVIEW
```

All inventory segments were executed as independent SSH sessions using read-only transactions and bounded timeouts. Metadata, FK, trigger, domain classification, fixture-signal counts and candidate-ratio segments completed. One explicit `UAT-*` outbound number lacked a second independent signal and remains `AMBIGUOUS`; the deterministic deletion manifest is therefore empty. Raw evidence is retained on the deployment host under `/home/phoenix-codex-deploy/uat-data-governance-20261005T1340+08:00/` with 0700 directory and 0600 files. The requested `/opt/phoenix-erp-backups` path was not writable by the deployment user, so no privileged directory was created.

## U1 review addendum

UAT2 historical identifiers documented in the repository were checked with short read-only probes and are absent from the current database. Current UAT reporting and audit tables are also empty. This establishes absence of those facts, but not the causal mechanism; historical cleanup execution, restore/rebuild, and alternate-environment explanations remain distinguishable only as `PARTIAL / CAUSALITY_UNKNOWN`. The surviving controlled outbound is documented in [uat-ambiguous-candidate-review.md](uat-ambiguous-candidate-review.md) and remains outside the manifest because it depends on formal inventory facts.

## U1.5 business confirmation status

Technical auto-delete candidates remain zero, but business review is still required for eight current objects: one ambiguous WMS outbound and seven seeded persona accounts. Therefore `PRODUCTION_UAT_CLEANUP_REQUIRED=BUSINESS_CONFIRMATION_PENDING`; the empty technical manifest must not be interpreted as a business no-action decision.
