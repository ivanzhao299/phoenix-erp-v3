# Ambiguous Candidate Review — U1

## Candidate

```text
TABLE=wms_outbound
BUSINESS_NUMBER=UAT-WO-20260726-081316
STATUS=DONE
CREATED_AT=2026-07-26 00:13:19.875777
COMPANY_CODE=COMP-LAO-AGRI
WAREHOUSE_CODE=LPH_MS_EGG_FARM
STORE_CODE=ALL
BATCH_NO=IBN-20260724-HY1Y6S
SOURCE_SYSTEM=ERP
REMARK=UAT BUG-20260724-0004 controlled inventory linkage
```

## Independent evidence

| Signal | Result |
|---|---|
| Explicit UAT business number | Yes |
| Explicit UAT remark | Yes, but same controlled test input family; not counted as an independent provenance source |
| `source_system=UAT` | No; value is `ERP` |
| UAT user/company/store/warehouse identity | No independent UAT identity; company and warehouse are formal production scopes |
| `inv_ledger` lineage | 1 related row |
| `inv_batches` lineage | 1 related row |
| `wms_outbound_items` lineage | 0 rows |
| Sales order lineage | 0 rows |
| Workflow runtime lineage | 0 rows |
| Operation/audit log match | 0 rows in `sys_operation_logs`; 0 rows in `mst_audit_trail` |

## Decision

```text
CLASSIFICATION=AMBIGUOUS
SECOND_INDEPENDENT_SIGNAL=NO
FORMAL_FACT_DEPENDENCY=YES
AUTO_DELETE_ALLOWED=NO
RETENTION_DECISION=MANUAL_DECISION / KEEP_PENDING BUSINESS OWNER REVIEW
```

The UAT remark establishes test intent, but the row has already changed authoritative inventory facts in a formal company and warehouse. It cannot be promoted to `CONFIRMED_UAT` for automatic deletion. Local cleanup must not reverse the ledger or batch state without a separate inventory and finance decision.
