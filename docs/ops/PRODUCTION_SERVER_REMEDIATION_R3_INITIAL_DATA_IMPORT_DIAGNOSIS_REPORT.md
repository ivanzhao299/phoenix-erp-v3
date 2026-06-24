# Production Server Remediation R3 - Initial Data Import Diagnosis Report

Date: 2026-06-24

## Conclusion

Current conclusion: GO WITH CONDITIONS.

The initial-data diagnosis ran as a read-only remote DB audit. It found that core system, role, menu, store, and organization catalogs exist, Store Payment tables exist but are empty, and `file_metadata` contains historical protected file rows. No initial import repair was executed.

## Evidence

Remote evidence directory:

`/opt/phoenix-erp-backups/remediation-r3-high-throughput-batch1-20260624-124012`

Local evidence file:

`docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/initial_data_import_diagnosis.txt`

## DB Identity

| Field | Value |
| --- | --- |
| database | `phoenix_erp` |
| db_user | `phoenix_v3` |
| schema | `public` |
| checked_at | `2026-06-24 04:40:12 UTC` |

## Import-Related Tables

The audit found import/staging/file-related tables:

- `file_metadata`
- `prc2_init_batch_rows`
- `prc2_init_batches`
- `wf_definition`
- `wf_definition_version`
- `wf_form_definition`

## Migration History

Recent TypeORM history includes:

- `1782042418112 CreateFileMetadata`
- `1782041418112 CreateStorePaymentTables`
- `1782000000000 W4MasterDataFoundation`

This confirms Store Payment and File Metadata migrations are recorded in the audited DB history.

## Data Counts

| Area | Count |
| --- | ---: |
| `file_metadata` rows | 15 |
| active `file_metadata` rows | 15 |
| pending `file_metadata` rows | 0 |
| legacy upload rows | 0 by module marker |
| Store Payment rows in `file_metadata` | 0 |
| `store_payment_accounts` rows | 0 |
| `store_payment_records` rows | 0 |
| `sys_user` rows | 42 |
| active/enabled `sys_user` rows | 32 |
| `sys_role` rows | 55 |
| active/enabled `sys_role` rows | 53 |
| `sys_menu` rows | 153 |
| `mst_stores` rows | 10 |
| `sys_organizations` rows | 50 |

## Findings

| Severity | Finding |
| --- | --- |
| P1 | Store Payment business tables exist but have no account or record seed data on this target. |
| P1 | Store Payment-specific `file_metadata` rows are absent; existing rows are purchase/payment historical rows. |
| P2 | Initial import tables exist, but no repair was attempted in this Gate. |

## A1 Review

Conclusion: PASS WITH CONDITIONS.

The evidence file exists and records read-only DB state. No write, migration, deploy, restart, or push was performed.

## A5 Review

Conclusion: GO WITH CONDITIONS.

Base catalogs are present and Store Payment schema exists. Initial import repair should be separated from menu/role/DataScope repair and historical upload ownership remediation.

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |

## Next Recommended Gate

`APPROVE_INITIAL_DATA_IMPORT_REPAIR_PLAN`

The next Gate should be a plan/dry-run first. It must not bundle live writes with menu/role repair or historical upload ownership claims.
