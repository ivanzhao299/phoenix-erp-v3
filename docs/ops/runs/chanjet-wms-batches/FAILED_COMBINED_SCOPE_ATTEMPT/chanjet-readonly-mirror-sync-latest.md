# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T06:00:02.857Z
Decision: HOLD

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: STOCK_IN SALES_STOCK_OUT INVENTORY_ON_HAND INVENTORY_ON_HAND_LOT FINISHED_GOODS_STOCK_IN MATERIAL_STOCK_OUT OTHER_STOCK_IN OTHER_STOCK_OUT STOCK_TRANSFER STOCK_COUNT RETAIL_STOCK_OUT
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

- mirror sync API failed: status=201 error=未找到可执行 mirror scope: STOCK_IN SALES_STOCK_OUT INVENTORY_ON_HAND INVENTORY_ON_HAND_LOT FINISHED_GOODS_STOCK_IN MATERIAL_STOCK_OUT OTHER_STOCK_IN OTHER_STOCK_OUT STOCK_TRANSFER STOCK_COUNT RETAIL_STOCK_OUT

## Result Summary

```json
{
  "httpStatus": 201,
  "response": {
    "success": false,
    "writeChanjet": false,
    "writeErpBusinessTables": false,
    "error": "未找到可执行 mirror scope: STOCK_IN SALES_STOCK_OUT INVENTORY_ON_HAND INVENTORY_ON_HAND_LOT FINISHED_GOODS_STOCK_IN MATERIAL_STOCK_OUT OTHER_STOCK_IN OTHER_STOCK_OUT STOCK_TRANSFER STOCK_COUNT RETAIL_STOCK_OUT"
  }
}
```

## Finance Coverage

```json
{}
```
