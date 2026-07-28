# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T06:04:33.605Z
Decision: HOLD

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: RETAIL_STOCK_OUT
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

- mirror sync API failed: status=201 error=unknown

## Result Summary

```json
{
  "httpStatus": 201,
  "response": {
    "success": false,
    "writeChanjet": false,
    "writeErpBusinessTables": false,
    "decision": "HOLD",
    "requestedScope": [
      "RETAIL_STOCK_OUT"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 3,
    "results": [
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3533914511118750",
        "status": "FAIL",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3533914511118750 http=403 code=50111 requestId=2dba0192-61040684 msg=openToken无调用该接口的权限",
        "attempt": 3
      },
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3537748712226818",
        "status": "FAIL",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3537748712226818 http=403 code=50111 requestId=953554e7-61041473 msg=openToken无调用该接口的权限",
        "attempt": 3
      },
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3539743721526654",
        "status": "FAIL",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3539743721526654 http=403 code=50111 requestId=bb41e836-23812423 msg=openToken无调用该接口的权限",
        "attempt": 3
      }
    ],
    "unresolvedFailures": [
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3533914511118750",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3533914511118750 http=403 code=50111 requestId=2dba0192-61040684 msg=openToken无调用该接口的权限"
      },
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3537748712226818",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3537748712226818 http=403 code=50111 requestId=953554e7-61041473 msg=openToken无调用该接口的权限"
      },
      {
        "key": "RETAIL_STOCK_OUT",
        "bookId": "3539743721526654",
        "error": "好业财 API 失败 path=/accounting/openapi/cc/retailstock/list/3539743721526654 http=403 code=50111 requestId=bb41e836-23812423 msg=openToken无调用该接口的权限"
      }
    ],
    "fieldGapSummary": {
      "scanned": 5000,
      "upserted": 4094,
      "statusCounts": {
        "PENDING": 3821,
        "MATCHED": 273
      }
    }
  }
}
```

## Finance Coverage

```json
{}
```
