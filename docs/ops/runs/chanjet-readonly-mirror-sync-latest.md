# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-13T05:21:05.351Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: default mirror scope
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
      "ACCOUNT_BOOKS",
      "DEPARTMENT",
      "CUSTOMER_SUPPLIER",
      "SUBJECT",
      "PROJECT",
      "FIN_ACCOUNT",
      "PAYABLE_STATISTICS",
      "RECEIVABLE_STATISTICS",
      "PAYMENT_AP",
      "PAYMENT_AR",
      "PURCHASE_ORDER",
      "VOUCHER_SEARCH",
      "GL_BALANCE",
      "BALANCE_SHEET",
      "INCOME_STATEMENT",
      "CASH_FLOW"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "results": [
      {
        "key": "ACCOUNT_BOOKS",
        "bookId": "",
        "status": "SUCCESS",
        "fields": 106,
        "rows": 3,
        "rawSnapshotId": "1",
        "entityRows": 3
      },
      {
        "key": "DEPARTMENT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "462",
        "entityRows": 1
      },
      {
        "key": "DEPARTMENT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "463",
        "entityRows": 1
      },
      {
        "key": "DEPARTMENT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "464",
        "entityRows": 1
      },
      {
        "key": "CUSTOMER_SUPPLIER",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 154,
        "rows": 229,
        "rawSnapshotId": "465",
        "entityRows": 229
      },
      {
        "key": "CUSTOMER_SUPPLIER",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 119,
        "rows": 82,
        "rawSnapshotId": "466",
        "entityRows": 82
      },
      {
        "key": "CUSTOMER_SUPPLIER",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 38,
        "rows": 1,
        "rawSnapshotId": "7",
        "entityRows": 1
      },
      {
        "key": "SUBJECT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "468",
        "entityRows": 1
      },
      {
        "key": "SUBJECT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "469",
        "entityRows": 1
      },
      {
        "key": "SUBJECT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "470",
        "entityRows": 1
      },
      {
        "key": "PROJECT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 77,
        "rows": 4,
        "rawSnapshotId": "471",
        "entityRows": 4
      },
      {
        "key": "PROJECT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 57,
        "rows": 2,
        "rawSnapshotId": "472",
        "entityRows": 2
      },
      {
        "key": "PROJECT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "473",
        "entityRows": 0
      },
      {
        "key": "FIN_ACCOUNT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 27,
        "rows": 31,
        "rawSnapshotId": "428",
        "entityRows": 31
      },
      {
        "key": "FIN_ACCOUNT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 27,
        "rows": 12,
        "rawSnapshotId": "15",
        "entityRows": 12
      },
      {
        "key": "FIN_ACCOUNT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 18,
        "rows": 4,
        "rawSnapshotId": "16",
        "entityRows": 4
      },
      {
        "key": "PAYABLE_STATISTICS",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 28,
        "rawSnapshotId": "477",
        "entityRows": 28
      },
      {
        "key": "PAYABLE_STATISTICS",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 15,
        "rawSnapshotId": "478",
        "entityRows": 15
      },
      {
        "key": "PAYABLE_STATISTICS",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 1,
        "rows": 0,
        "rawSnapshotId": "19",
        "entityRows": 0
      },
      {
        "key": "RECEIVABLE_STATISTICS",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 49,
        "rawSnapshotId": "480",
        "entityRows": 49
      },
      {
        "key": "RECEIVABLE_STATISTICS",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 22,
        "rawSnapshotId": "481",
        "entityRows": 22
      },
      {
        "key": "RECEIVABLE_STATISTICS",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 1,
        "rows": 0,
        "rawSnapshotId": "22",
        "entityRows": 0
      },
      {
        "key": "PAYMENT_AP",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 71,
        "rows": 50,
        "rawSnapshotId": "483",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AP",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 76,
        "rows": 50,
        "rawSnapshotId": "484",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AP",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "485",
        "entityRows": 0
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 83,
        "rows": 50,
        "rawSnapshotId": "486",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 83,
        "rows": 50,
        "rawSnapshotId": "487",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "488",
        "entityRows": 0
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 97,
        "rows": 42,
        "rawSnapshotId": "489",
        "entityRows": 42
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 39,
        "rows": 1,
        "rawSnapshotId": "490",
        "entityRows": 1
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "491",
        "entityRows": 0
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 210,
        "rows": 658,
        "rawSnapshotId": "492",
        "entityRows": 658
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 229,
        "rows": 398,
        "rawSnapshotId": "493",
        "entityRows": 398
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 195,
        "rows": 219,
        "rawSnapshotId": "494",
        "entityRows": 219
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "495",
        "entityRows": 1
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "496",
        "entityRows": 1
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "497",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "498",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "499",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "500",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "501",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "502",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "503",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "504",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "505",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "506",
        "entityRows": 1
      }
    ],
    "fieldGapSummary": {
      "scanned": 2204,
      "upserted": 1714,
      "statusCounts": {
        "PENDING": 1531,
        "MATCHED": 183
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
