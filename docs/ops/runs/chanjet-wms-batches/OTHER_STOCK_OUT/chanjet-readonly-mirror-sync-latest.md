# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T09:43:51.222Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: OTHER_STOCK_OUT
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
      "OTHER_STOCK_OUT"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 1,
    "results": [
      {
        "key": "OTHER_STOCK_OUT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 68,
        "rows": 436,
        "rawSnapshotId": "19162",
        "entityRows": 436,
        "attempt": 1
      },
      {
        "key": "OTHER_STOCK_OUT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 71,
        "rows": 621,
        "rawSnapshotId": "19163",
        "entityRows": 621,
        "attempt": 1
      },
      {
        "key": "OTHER_STOCK_OUT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "19164",
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
