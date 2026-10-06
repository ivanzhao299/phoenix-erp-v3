# U2B USER CLEANUP FINAL EXECUTION DECISION

## Decision

U2A PR #334 已合并到 `origin/main`。U2B 从合并后的 `ed42e2da09aa9c45e4f02caa7f4c0e744e8a3413` 独立 worktree 执行，只读取合并后的业务确认 artifact 和生产只读 drift check。

业务清单中六个 `pilot_*` 账号均为 `business_decision=DELETE`。`wang_ceo` 为 KEEP，未进入目标集。`pilot_wms` 是唯一同时满足硬删除技术前置条件且没有历史归因的账号；其余五个账号继续保留冻结身份。

```text
TARGET_USERS=6
BUSINESS_DELETE_USERS=6
U2B_BASE_MAIN=ed42e2da09aa9c45e4f02caa7f4c0e744e8a3413
U2A_LOCAL_COMMIT=078ae4c43f75e7cc8ffafe9feacfdcdf2f35160c

U2A_IMPACT_MATRIX_SHA256=301be8c3989c2b7aa4230c03c3597c8cf049a0aa44b4b93674e5767d77ebd736
U2A_SEGMENT_EVIDENCE_SHA256=630dc0cbed3ceb70919b43d048ed6e2e5d226ef6e4db11274a55fd909d474ed1
BUSINESS_REVIEW_MANIFEST_SHA256=5a6502a5ffa9628f2c47ed6e4520c83ce37a801996e91d578abac014de369c52
U2B_INPUT_MANIFEST_SHA256=e144e8b65cb9091efa265f3930f39276fffab48e79c1dd90a347182d067f0b67
U2B_DISPOSITION_SHA256=360321e280b57f6ec60f1be96765f7bf1c61880dc12e67019dfc69739f6d4dc8

HARD_DELETE_SAFE_USERS=1
HARD_DELETE_SELECTED_USERS=1
RETAIN_FROZEN_USERS=5
NO_ACTION_ALREADY_FROZEN_USERS=0
BLOCKED_USERS=0

PILOT_WMS_FINAL_DISPOSITION=HARD_DELETE
PILOT_MANAGER_FINAL_DISPOSITION=RETAIN_FROZEN
EXPECTED_CASCADE_ROWS=0
EXECUTION_SCRIPT_CREATED=YES

PRODUCTION_DELETE_AUTHORIZED=NO
PRODUCTION_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
U2B_DECISION_STATUS=COMPLETE
NEXT_ACTION=U2C_CONTROLLED_EXECUTION_AUTHORIZATION
```

## Final disposition matrix

| user_id | username | business decision | current status | U2A recommendation | historical reference | audit reference | formal business reference | hard-delete safe | physical delete necessary | final disposition |
|---:|---|---|---:|---|---|---|---|---|---|---|
| 295 | `pilot_sales` | DELETE | 0 | RETAIN_FROZEN | NO | NO | NO | NO | NO | RETAIN_FROZEN |
| 296 | `pilot_cashier` | DELETE | 0 | RETAIN_FROZEN | NO | NO | NO | NO | NO | RETAIN_FROZEN |
| 297 | `pilot_driver` | DELETE | 0 | RETAIN_FROZEN | NO | NO | NO | NO | NO | RETAIN_FROZEN |
| 298 | `pilot_wms` | DELETE | 0 | HARD_DELETE | NO | NO | NO | YES | YES | HARD_DELETE |
| 299 | `pilot_finance` | DELETE | 0 | RETAIN_FROZEN | NO | NO | NO | NO | NO | RETAIN_FROZEN |
| 300 | `pilot_manager` | DELETE | 0 | RETAIN_FROZEN | YES | NO | YES (`sal_price_books.created_by`) | NO | NO | RETAIN_FROZEN |

“物理删除必要”仅对 `pilot_wms` 判定为 YES：业务 artifact 明确为 DELETE，且最终只读检查证明该账号没有任何登录、权限、范围、FK、审计或逻辑业务引用。其余五个账号已经 `status=0`，且保留身份可以保护授权和历史归因，因此不产生无意义的生产 UPDATE。

## Final drift check

生产目标仍为：`phoenix_erp`、PostgreSQL `16.14`、system identifier `7641898445435437089`。六个账号仍全部存在且 `status=0`，没有登录时间。

针对 `pilot_wms` 的独立短查询全部通过：

- 角色、权限集、组织、项目、仓库、农场和股东范围：0；
- `NO ACTION` / `RESTRICT` / `SET NULL` 用户引用：0；
- 审计日志、操作日志、通知：0；
- `sal_price_books.created_by`、WMS operator 字段：0；
- 允许级联的角色授权行：0，因此 `EXPECTED_CASCADE_ROWS=0`。

U2A 的 124 个 segment evidence hash 未发生漂移；业务清单的规范 hash 使用去除 UTF-8 BOM 后的字节计算，与 U2B 指令提供的 `5a6502…` 一致。

## Execution boundary

已生成但未授权执行：

- [uat-user-cleanup-execution.sql](../../scripts/uat/uat-user-cleanup-execution.sql)：只针对 `user_id=298`、`username='pilot_wms'`、`status=0`，默认 `DRY_RUN=true` 且 `PRODUCTION_DELETE_AUTHORIZED=false`；含 T0 前置断言和级联计数。
- [uat-user-cleanup-postcheck.sql](../../scripts/uat/uat-user-cleanup-postcheck.sql)：只读后置核验。

脚本不包含 `LIKE 'pilot_%'`，不处理其他账号，也未在生产数据库运行。U2C 必须另行获得明确的生产删除授权、维护窗口和备份/回滚方案后才能执行。

## Evidence

- [uat-user-final-disposition.csv](../../uat-user-final-disposition.csv)
- [u2b-input-manifest.tsv](../../scripts/uat/evidence/u2b-input-manifest.tsv)
- [U2A reference graph report](./u2-user-cleanup-reference-graph-report.md)
- [U2A segment evidence](../../scripts/uat/evidence/u2-user-reference-segments.tsv)
