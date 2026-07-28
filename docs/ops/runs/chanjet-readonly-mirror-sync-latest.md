# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T05:56:33.091Z
Decision: HOLD

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: STOCK_IN, SALES_STOCK_OUT, INVENTORY_ON_HAND, INVENTORY_ON_HAND_LOT, FINISHED_GOODS_STOCK_IN, MATERIAL_STOCK_OUT, OTHER_STOCK_IN, OTHER_STOCK_OUT, STOCK_TRANSFER, STOCK_COUNT, RETAIL_STOCK_OUT
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

- Mirror sync executed: no
- Write Chanjet: no
- Delete Chanjet data: no
- Modify Chanjet data: no
- Voucher push: no
- ERP middle-layer write: no

## Blocking Reasons

- mirror sync API failed: status=504 error=unknown

## Result Summary

```json
{
  "httpStatus": 504,
  "response": {
    "rawText": "<html>\r\n<head><title>504 Gateway Time-out</title></head>\r\n<body>\r\n<center><h1>504 Gateway Time-out</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n"
  }
}
```

## Finance Coverage

```json
{}
```
