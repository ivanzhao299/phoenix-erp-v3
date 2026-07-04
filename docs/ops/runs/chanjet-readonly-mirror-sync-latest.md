# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-04T10:07:42.126Z
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
        "rawSnapshotId": "370",
        "entityRows": 1
      },
      {
        "key": "DEPARTMENT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "371",
        "entityRows": 1
      },
      {
        "key": "DEPARTMENT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "372",
        "entityRows": 1
      },
      {
        "key": "CUSTOMER_SUPPLIER",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 138,
        "rows": 209,
        "rawSnapshotId": "373",
        "entityRows": 209
      },
      {
        "key": "CUSTOMER_SUPPLIER",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 136,
        "rows": 82,
        "rawSnapshotId": "328",
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
        "rawSnapshotId": "376",
        "entityRows": 1
      },
      {
        "key": "SUBJECT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "377",
        "entityRows": 1
      },
      {
        "key": "SUBJECT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 6,
        "rows": 1,
        "rawSnapshotId": "378",
        "entityRows": 1
      },
      {
        "key": "PROJECT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 77,
        "rows": 4,
        "rawSnapshotId": "379",
        "entityRows": 4
      },
      {
        "key": "PROJECT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 57,
        "rows": 2,
        "rawSnapshotId": "380",
        "entityRows": 2
      },
      {
        "key": "PROJECT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "381",
        "entityRows": 0
      },
      {
        "key": "FIN_ACCOUNT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 27,
        "rows": 31,
        "rawSnapshotId": "14",
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
        "rawSnapshotId": "201",
        "entityRows": 28
      },
      {
        "key": "PAYABLE_STATISTICS",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 15,
        "rawSnapshotId": "202",
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
        "rawSnapshotId": "204",
        "entityRows": 49
      },
      {
        "key": "RECEIVABLE_STATISTICS",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 55,
        "rows": 22,
        "rawSnapshotId": "205",
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
        "fields": 73,
        "rows": 50,
        "rawSnapshotId": "391",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AP",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 74,
        "rows": 50,
        "rawSnapshotId": "392",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AP",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "393",
        "entityRows": 0
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 83,
        "rows": 50,
        "rawSnapshotId": "394",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 84,
        "rows": 50,
        "rawSnapshotId": "395",
        "entityRows": 50
      },
      {
        "key": "PAYMENT_AR",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "396",
        "entityRows": 0
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 94,
        "rows": 41,
        "rawSnapshotId": "397",
        "entityRows": 41
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 39,
        "rows": 1,
        "rawSnapshotId": "398",
        "entityRows": 1
      },
      {
        "key": "PURCHASE_ORDER",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 11,
        "rows": 0,
        "rawSnapshotId": "399",
        "entityRows": 0
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 210,
        "rows": 639,
        "rawSnapshotId": "32",
        "entityRows": 639
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 229,
        "rows": 396,
        "rawSnapshotId": "33",
        "entityRows": 396
      },
      {
        "key": "VOUCHER_SEARCH",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 195,
        "rows": 207,
        "rawSnapshotId": "34",
        "entityRows": 207
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "403",
        "entityRows": 1
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "404",
        "entityRows": 1
      },
      {
        "key": "GL_BALANCE",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "405",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "406",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "407",
        "entityRows": 1
      },
      {
        "key": "BALANCE_SHEET",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "408",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "409",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "410",
        "entityRows": 1
      },
      {
        "key": "INCOME_STATEMENT",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "411",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "412",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "413",
        "entityRows": 1
      },
      {
        "key": "CASH_FLOW",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 12,
        "rows": 1,
        "rawSnapshotId": "414",
        "entityRows": 1
      }
    ],
    "fieldGapSummary": {
      "scanned": 2163,
      "upserted": 1684,
      "statusCounts": {
        "PENDING": 1501,
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
