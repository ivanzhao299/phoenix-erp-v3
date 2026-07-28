# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T02:00:24.994Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: STOCK_IN, SALES_STOCK_OUT
- Book ID: enabled books
- Period: endpoint/default current period

## Preconditions

- Remote API only: yes
- DB reachable: PASS
- Mirror tables present: PASS
- API health: PASS
- Auth token present: PASS
- Chanjet env present: PASS
- Finance coverage endpoint: PASS

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
    "requestedScope": [
      "STOCK_IN",
      "SALES_STOCK_OUT"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "results": [
      {
        "key": "STOCK_IN",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18831",
        "entityRows": 0
      },
      {
        "key": "STOCK_IN",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18832",
        "entityRows": 0
      },
      {
        "key": "STOCK_IN",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18833",
        "entityRows": 0
      },
      {
        "key": "SALES_STOCK_OUT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18834",
        "entityRows": 0
      },
      {
        "key": "SALES_STOCK_OUT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18835",
        "entityRows": 0
      },
      {
        "key": "SALES_STOCK_OUT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "18836",
        "entityRows": 0
      }
    ],
    "fieldGapSummary": {
      "scanned": 4116,
      "upserted": 3404,
      "statusCounts": {
        "PENDING": 3185,
        "MATCHED": 219
      }
    }
  }
}
```

## Finance Coverage

```json
{
  "endpointCoverageRate": 1,
  "cardCoverageRate": 1,
  "fieldCoverageRate": 1,
  "missingEndpointKeys": [],
  "failedLatestJobs": [],
  "decision": "GO"
}
```
