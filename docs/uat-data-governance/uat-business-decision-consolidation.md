# UAT DATA GOVERNANCE — U1.6 BUSINESS DECISION CONSOLIDATION

```text
CONSOLIDATED_AT=2026-10-05T16:43:25+08:00
BUSINESS_REVIEW_SOURCE_SHA256=e973f1b0cce7d17e707775f54300bbeea30d08a0c795652eb81412d5e1b66dc9
U0_DELETE_MANIFEST_ROWS=0
U0_DELETE_MANIFEST_SHA256=77627d4eee350e0cb659d8f12872b8fbc831cb2245f9ccbcf5af7bd67594b3cd
TOTAL_REVIEW_ITEMS=8
KEEP_ITEMS=2
DELETE_ITEMS=6
ARCHIVE_ITEMS=0
NOT_UAT_ITEMS=0
NEED_MORE_EVIDENCE_ITEMS=0
BUSINESS_DECISIONS_COMPLETE=YES
REVIEW_AUDIT_FIELDS_VALID=NO
FORMAL_DEPENDENCY_DELETE_ITEMS=0
USER_ACCOUNT_DELETE_REQUESTS=6
WMS_OUTBOUND_DECISION=KEEP
CEO_PERSONA_DECISION=KEEP
PRODUCTION_UAT_CLEANUP_REQUIRED=PARTIAL
U2_CLEANUP_DESIGN_ALLOWED=YES_FOR_USER_ACCOUNT_REVIEW_ONLY
DATABASE_DELETE_EXECUTED=NO
DATABASE_UPDATE_EXECUTED=NO
DATABASE_SCHEMA_CHANGED=NO
SERVICE_OPERATION_EXECUTED=NO
FILE_DELETE_EXECUTED=NO
CHANJET_WRITE_EXECUTED=NO
U1_6_CONFIRMED_DECISIONS_SHA256=0df9e1c9fc16051dff1c033ddc78194abefe95d705aa17754dca66b58686e62f
NEXT_ACTION=U2_CLEANUP_DESIGN_FOR_SIX_PILOT_ACCOUNTS_AFTER_AUDIT_METADATA_CORRECTION
```

## 已采纳的业务决定

| review_id | 对象 | 业务决定 | 技术约束 |
|---|---|---|---|
| P1-WMS-001 | `UAT-WO-20260726-081316` | **KEEP** | 正式库存依赖，保留 |
| P2-USER-001 | `pilot_cashier` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-002 | `pilot_driver` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-003 | `pilot_finance` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-004 | `pilot_manager` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-005 | `pilot_sales` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-006 | `pilot_wms` | **DELETE** | 仅允许进入后续用户账户专项设计，不在本阶段执行 |
| P2-USER-007 | `wang_ceo` | **KEEP** | 正式 CEO 身份候选，保留 |

## 处理边界

本次只采信附件中的 `business_decision` 列，并用 U1.5 已审核的技术字段重新生成了 [uat-business-confirmed-decisions.csv](../../uat-business-confirmed-decisions.csv)。U0 空删除清单保持不变，没有把业务决定回写到 U0 manifest，也没有生成可执行清理 SQL。

附件的 `business_comment`、`business_reviewer`、`reviewed_at` 列被填成了 `KEEP` 或 `DELETE` 等决定值，不能作为有效的说明、确认人和时间戳；因此 `REVIEW_AUDIT_FIELDS_VALID=NO`。这不改变已读取的八个业务决定，但后续正式变更前应补录确认人、确认时间和逐项理由。

六个账户虽获业务 `DELETE`，U0 技术建议仍为 `REVIEW_REQUIRED`。删除用户可能影响历史审计、权限关联和数据归属；因此只允许进入 U2 的用户账户专项清理设计和影响分析，当前没有数据库删除、禁用或服务操作。WMS 出库保持 `KEEP`，不会触发库存台账或批次处理。

### U2 入口条件

U2 只能设计六个试运行账户的精确影响分析、备份/回滚和审批步骤；在确认审计字段、用户影响范围和最终清理合同前，不得执行 `DELETE`、`UPDATE`、禁用账户或任何生产变更。
