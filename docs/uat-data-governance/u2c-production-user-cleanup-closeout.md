# U2C CONTROLLED PRODUCTION USER CLEANUP REPORT

## Result

U2C 按已批准的 U2B bundle 通过 direct SSH 执行完成。唯一删除对象是 `user_id=298`、`username=pilot_wms`、`status=0`；没有删除其他用户、业务事实、审计记录、附件或 Chanjet 数据。

```text
U2C_MAIN_SHA=b3587270f1308f3bd0d40c3d7d2a68548af8957f
RUN_ID=20261006T010538Z
TARGET_USER_ID=298
TARGET_USERNAME=pilot_wms

BACKUP_PATH=/tmp/phoenix-uat-u2c-evidence-20261006T010538Z/phoenix-uat-u2c-pilot-wms-predelete-20261006T010538Z.dump
BACKUP_SIZE=200921993
BACKUP_TOC=2931
BACKUP_SHA256=eb94ba8d005b1f17032e231a7b3d470ec7e9d5e05ce86b3d853272e3843ca090

EXECUTION_SQL_SHA256=6ed0cb257e34df56d789413a0815171ea93a211492baefb80abd05a7e0e1e4da
POSTCHECK_SQL_SHA256=12b72b781c6dbc8c2ca11853d955cb36b4b9ad94201a0cecaab9148d4670c659

T0_IDENTITY_GATE=PASS
T0_DRY_RUN=PASS
T0_FINAL_DRIFT_CHECK=PASS
EXPECTED_DELETE_ROWS=1
ACTUAL_DELETE_ROWS=1
EXPECTED_CASCADE_ROWS=0
ACTUAL_CASCADE_ROWS=0
PILOT_WMS_REMAINING_ROWS=0

PILOT_SALES=RETAIN_FROZEN
PILOT_CASHIER=RETAIN_FROZEN
PILOT_DRIVER=RETAIN_FROZEN
PILOT_FINANCE=RETAIN_FROZEN
PILOT_MANAGER=RETAIN_FROZEN
PILOT_MANAGER_HISTORY_PRESERVED=YES
WANG_CEO=OUT_OF_SCOPE

DB_HEALTH=PASS
API_HEALTH=200
API_READINESS=200
WEB_HEALTH=PASS
POST_EXECUTION_SERVICE_HEALTH=PASS_WITH_PREEXISTING_UNRELATED_DB_ERROR

PRODUCTION_DELETE_EXECUTED=YES
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
U2C_EXECUTION_STATUS=COMPLETE
```

## Gates and evidence

- Production identity matched `phoenix-prod`, host `iZt4nj11ry11ofv03yi35vZ`, database `phoenix_erp`, PostgreSQL `16.14`, system identifier `7641898445435437089`.
- The custom-format backup was non-empty and `pg_restore --list` returned 2,931 TOC entries. No restore was performed.
- Dry-run returned `WOULD_DELETE_USERS=1` and `WOULD_DELETE_CASCADE_ROLE_ROWS=0`, then rolled back.
- Immediate final drift check confirmed target status 0, no login, no bindings, no FK references, no audit/logical references, and no cascade rows.
- The committed transaction deleted exactly one row and returned `COMMIT`.
- Postcheck returned zero target, role, permission-set, and scope rows; all five retained pilot users remained present with `status=0`; `wang_ceo` remained present.
- `sal_price_books.created_by='pilot_manager'` remained present, preserving historical attribution.
- API health and readiness returned 200; DB, API, and Web containers remained healthy. A `mon_device_alert_event.resolve_note` schema error was already present before deletion and no post-delete FK, `pilot_wms`, user-not-found, constraint, or exception error was found.

## Evidence storage limitation

The deployment user could not write `/opt/phoenix-erp-backups` because that directory is root-only (`0700`). No root escalation or permission change was used. The backup and sanitized execution evidence were therefore retained in the restricted fallback directory:

```text
/tmp/phoenix-uat-u2c-evidence-20261006T010538Z/
```

The directory is `0700`; evidence files and the backup dump are `0600`. The bundle files were verified on the production host against the local SHA-256 values above.

## Scope closure

```text
pilot_wms cleanup=COMPLETE
remaining pilot users=RETAIN_FROZEN
ambiguous WMS outbound=KEEP / outside this account cleanup
UAT_DATA_GOVERNANCE_TRACK=OPEN_FOR_REVIEW
NEXT_ACTION=ASSESS_TRACK_CLOSURE
```

This closeout is documentation and evidence only. It does not deploy application code or request another production mutation.
