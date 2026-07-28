# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T09:43:13.367Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: FINISHED_GOODS_STOCK_IN
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
      "FINISHED_GOODS_STOCK_IN"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 1,
    "results": [
      {
        "key": "FINISHED_GOODS_STOCK_IN",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 60,
        "rows": 390,
        "rawSnapshotId": "19156",
        "entityRows": 390,
        "attempt": 1
      },
      {
        "key": "FINISHED_GOODS_STOCK_IN",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 71,
        "rows": 308,
        "rawSnapshotId": "19157",
        "entityRows": 308,
        "attempt": 1
      },
      {
        "key": "FINISHED_GOODS_STOCK_IN",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "19158",
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
