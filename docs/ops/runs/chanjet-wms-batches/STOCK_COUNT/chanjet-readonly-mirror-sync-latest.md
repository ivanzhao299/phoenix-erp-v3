# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T09:44:24.531Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: STOCK_COUNT
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
      "STOCK_COUNT"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 1,
    "results": [
      {
        "key": "STOCK_COUNT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 62,
        "rows": 2,
        "rawSnapshotId": "19168",
        "entityRows": 2,
        "attempt": 1
      },
      {
        "key": "STOCK_COUNT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 62,
        "rows": 2,
        "rawSnapshotId": "19169",
        "entityRows": 2,
        "attempt": 1
      },
      {
        "key": "STOCK_COUNT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 62,
        "rows": 2,
        "rawSnapshotId": "19170",
        "entityRows": 2,
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
