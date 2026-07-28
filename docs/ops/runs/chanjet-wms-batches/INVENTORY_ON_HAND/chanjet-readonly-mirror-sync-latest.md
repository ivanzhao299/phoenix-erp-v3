# Chanjet Readonly Mirror Sync Gate

Generated at: 2026-07-28T09:42:42.423Z
Decision: GO_WITH_CONDITIONS

## Scope

- API base: https://erp.eggslao.com
- Dry run: no
- Requested scope: INVENTORY_ON_HAND
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
      "INVENTORY_ON_HAND"
    ],
    "books": [
      "3533914511118750",
      "3537748712226818",
      "3539743721526654"
    ],
    "attempts": 1,
    "results": [
      {
        "key": "INVENTORY_ON_HAND",
        "bookId": "3533914511118750",
        "status": "SUCCESS",
        "fields": 47,
        "rows": 278,
        "rawSnapshotId": "19150",
        "entityRows": 278,
        "attempt": 1
      },
      {
        "key": "INVENTORY_ON_HAND",
        "bookId": "3537748712226818",
        "status": "SUCCESS",
        "fields": 48,
        "rows": 125,
        "rawSnapshotId": "19151",
        "entityRows": 125,
        "attempt": 1
      },
      {
        "key": "INVENTORY_ON_HAND",
        "bookId": "3539743721526654",
        "status": "SUCCESS",
        "fields": 17,
        "rows": 0,
        "rawSnapshotId": "19152",
        "entityRows": 0,
        "attempt": 1
      }
    ],
    "unresolvedFailures": [],
    "fieldGapSummary": {
      "scanned": 5000,
      "upserted": 4096,
      "statusCounts": {
        "PENDING": 3816,
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
