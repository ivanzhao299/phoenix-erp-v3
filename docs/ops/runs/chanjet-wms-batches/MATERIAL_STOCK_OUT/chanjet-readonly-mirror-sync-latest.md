# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T09:43:31.284Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: MATERIAL_STOCK_OUT
- Book ID: enabled books
- Period: endpoint/default current period

## Preconditions

- Remote API only: yes
- DB reachable: PASS
- Mirror tables present: PASS
- API health: PASS
- Auth token present: PASS
- Chanjet env present: PASS
- Finance coverage endpoint: SKIP

## Execution

- Mirror sync executed: yes
- Write Chanjet: no
- Delete Chanjet data: no
- Modify Chanjet data: no
- Voucher push: no
- ERP middle-layer write: yes

## Blocking Reasons

- none

## Result Summary

```json
{
  "httpStatus": 201,
  "response": {
    "success": true,
    "writeChanjet": false,
    "writeErpBusinessTables": false,
    "decision": "GO",
    "requestedScope": [
      "MATERIAL_STOCK_OUT"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 1,
    "results": [
      {
        "key": "MATERIAL_STOCK_OUT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 68,
        "rows": 418,
        "rawSnapshotId": "19159",
        "entityRows": 418,
        "attempt": 1
      },
      {
        "key": "MATERIAL_STOCK_OUT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 66,
        "rows": 424,
        "rawSnapshotId": "19160",
        "entityRows": 424,
        "attempt": 1
      },
      {
        "key": "MATERIAL_STOCK_OUT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "19161",
        "entityRows": 0,
        "attempt": 1
      }
    ],
    "unresolvedFailures": [],
    "fieldGapSummary": {
      "scanned": 5000,
      "upserted": 4095,
      "statusCounts": {
        "PENDING": 3815,
        "MATCHED": 280
      }
    }
  }
}
```

## Finance Coverage

```json
{}
```
