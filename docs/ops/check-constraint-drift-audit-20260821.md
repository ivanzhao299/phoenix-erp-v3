# P0-4 CHECK 枚举漂移审计与修复闭环（2026-08-21）

## 1. 结论

生产属于**情形 B**：`fin_ar_invoices`、`fin_ap_invoices`、`fin_cash_transactions`、`fin_shareholder_contributions` 均不存在 CHECK 约束。POS 赊销当前不会因历史 CHECK 直接 500，但数据库已失去 `source_type` 防脏值护栏。

生产存量值全部满足“历史允许值 ∪ 当前代码实际写值”，因此补回四个修正版 CHECK。迁移只执行 DDL：先 `ADD CONSTRAINT ... NOT VALID`，再 `VALIDATE CONSTRAINT`；不更新、删除或回填任何业务行。

同类排查另确认一处查询口径漂移：财务报表用不存在的 AR 状态 `COLLECTED` 排除已收款单，导致真实 `RECEIVED` 行仍计入未收余额；已统一改为 `RECEIVED`。

## 2. DDL 历史与快照

- `migrations/20260526_finance_v2_phase2_ar_runtime.sql` 曾建立 `chk_fin_ar_inv_source_type`，仅允许 `SALES_ORDER / MANUAL / CONTRACT / OPENING`。
- `migrations/20260526_finance_v2_phase1_ap_runtime.sql` 曾建立 AP source_type CHECK。
- `migrations/20260526_finance_v2_phase3_cash_runtime.sql` 曾建立 cash transaction source_type CHECK。
- `migrations/20260526_finance_v2_phase4_shareholder_runtime.sql` 曾建立 shareholder contribution source_type CHECK。
- 随后的 `migrations/20260526_finance_v2_clean_baseline.sql` DROP 并重建相关表，但未恢复上述 source_type CHECK。
- `apps/api/migrations/` 与 `apps/api/src/database/migrations/` 未发现后续 DROP/ALTER/REPLACE 这些 CHECK 的迁移。
- `docs/schema-snapshot.sql` 中四张表均无 CHECK，与生产审计一致。

## 3. 代码写值 × 历史 CHECK 差异矩阵

| 表 | 历史 CHECK 枚举 | 当前代码写值全集 | 差异 | 处理 |
|---|---|---|---|---|
| `fin_ar_invoices` | SALES_ORDER, MANUAL, CONTRACT, OPENING | MANUAL, SALES_ORDER, SALES_RETURN, STORE_SALE, STORE_SALE_RETURN | 缺 SALES_RETURN、STORE_SALE、STORE_SALE_RETURN | 补回并取两集合并集 |
| `fin_ap_invoices` | PO, MANUAL, EXPENSE, REIMBURSEMENT, OPENING | MANUAL, PO | 无越界写值 | 补回历史集合 |
| `fin_cash_transactions` | NULL 或 AP_PAYMENT, AR_RECEIPT, TRANSFER, SHAREHOLDER, MANUAL, OPENING | NULL, OPENING, MANUAL, AP_PAYMENT, AR_RECEIPT, TRANSFER, SHAREHOLDER, REIMBURSEMENT, STORE_SALE, STORE_SALE_RETURN | 缺 REIMBURSEMENT、STORE_SALE、STORE_SALE_RETURN | 补回并取两集合并集，保留 NULL |
| `fin_shareholder_contributions` | MANUAL, PAYMENT, OPENING, IMPORT | MANUAL, PAYMENT, IMPORT | 无越界写值 | 补回历史集合 |

关键写路径：

- AR：`ar-invoices.service.ts`（MANUAL）、`finance-ar.adapter.ts`（SALES_ORDER）、`finance-credit-note.adapter.ts`（SALES_RETURN）、`store-pos.service.ts`（STORE_SALE / STORE_SALE_RETURN）。
- AP：`ap-invoices.service.ts`（MANUAL / PO）。
- Cash：财务付款、收款、转账、股东结算、报销服务以及 POS 销售/退货路径。
- Shareholder：`shareholder-contributions.service.ts`（MANUAL / PAYMENT / IMPORT）。

## 4. 生产只读证据

审计 run：[32467665376](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32467665376)，结论 `success`。

安全属性：Actions runner 与 SSH 远端双重校验 UTC 时间格式、语义和先后顺序；`psql -X -v ON_ERROR_STOP=1 -v ...` 参数化；单引号 heredoc；`PGOPTIONS='-c default_transaction_read_only=on'`；`BEGIN TRANSACTION READ ONLY`。

### 4.1 生产 CHECK

四张表联合查询 `pg_constraint` 且 `contype='c'` 返回 `(0 rows)`，确认生产没有任何 CHECK，而非仅约束名变化。

### 4.2 生产存量 source_type

| 表 | 生产值与行数 |
|---|---|
| `fin_ar_invoices` | MANUAL 7；SALES_ORDER 6 |
| `fin_ap_invoices` | MANUAL 4；PO 8 |
| `fin_cash_transactions` | AP_PAYMENT 3；AR_RECEIPT 3；MANUAL 3\*；OPENING 1；REIMBURSEMENT 1；TRANSFER 6；NULL 93 |
| `fin_shareholder_contributions` | IMPORT 2；MANUAL 49；PAYMENT 4 |

注：GitHub 日志脱敏把 cash MANUAL 的行数显示为 `3***`；这不影响枚举合法性判断。

### 4.3 P0-3 遗留项

生产 `wms_outbound` 第 2 列为 `outbound_no varchar`；完整 73 列清单中不存在 `task_no`。后续查询和修复应以 `outbound_no` 为准。

## 5. 修复内容

### 5.1 约束迁移

`1787304000000-RestoreFinanceSourceTypeChecks.ts`：

- 为四张表删除同名残留约束（幂等），新增修正版 CHECK `NOT VALID`，随后 `VALIDATE`。
- cash CHECK 明确保留 `source_type IS NULL` 语义。
- `down()` 只 DROP 本次恢复的四个约束，回到审计前“无 CHECK”的生产状态。
- 无 INSERT / UPDATE / DELETE / TRUNCATE / MERGE，不需要 `@allow-data-dml`。

### 5.2 报表状态口径

`financial-reports.service.ts` 三处 AR 未收余额筛选由 `status NOT IN ('COLLECTED','CANCELLED')` 改为 `status NOT IN ('RECEIVED','CANCELLED')`。

## 6. 同类 CHECK 枚举排查

### 已确认并修复

- AR `source_type`：历史 CHECK 缺三个当前写值。
- Cash transaction `source_type`：历史 CHECK 缺三个当前写值。
- AR 报表查询状态：`COLLECTED` 不属于 AR 状态枚举，应为 `RECEIVED`。

### 已核对、未见漂移

- AP invoice：status / payment_status / source_type。
- Cash account：account_type / status。
- Cash transaction：direction。
- Fund transfer：status。
- Expense request：expense_type / status。
- Reimbursement：status。
- Shareholder contribution：contribution_type / source_type / status。
- Inventory source mode：scope_level / mode。

### 待审/非本次约束写入问题

- `AssignUserOrgDto` 的 TypeScript 联合类型仍只有 SELF/PROJECT/COMPANY/REGION/GROUP，而数据库最终 DataScope 集合另含 BU/SITE/DEPARTMENT/STORE/WAREHOUSE；现有 SQL 写 SITE 合法，属于 DTO 类型声明覆盖不足，不是 DB CHECK 拦截。
- 历史迁移曾查询 shareholder `source_type='CAPITAL_SUMMARY_IMPORT'`，当前服务未写该值、生产存量也没有；未把历史运维标记加入在线约束。
- clean baseline 与早期 finance baseline 的 status 集合存在历史差异；本次以当前生产 schema、当前服务写路径与运行时 phase 定义交叉判定，未改非 source_type 约束。

## 7. 验证与部署

- API `tsc --noEmit`：0 errors。
- API 全量 Jest：57 suites / 506 tests 全绿。
- 新迁移单测：覆盖四表允许值、NOT VALID → VALIDATE、nullable cash 语义、down() 无数据 DML。
- 迁移 down 门禁：61/61 通过。
- 迁移 no-data-DML 门禁：61/61 通过；本迁移无豁免。
- Web 未修改，不运行 Web tsc。
- main 合并提交：`1d4c2ebb810630f48251a0f04cd853ba1727a190`。
- push CI/CD：[32468035565](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32468035565)，success；API/Web type-check、DDL migration、entity drift 与 system/breeding/packaging/wms/finance 回归全绿。
- 同提交的 AI Build、AI Security、Web Unit Tests 三个独立 workflow 均 success。
- 显式生产 API 部署（`mode=api`, `approve_production=true`）：[32468474078](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32468474078)，success；`Deploy · api` success。
- 部署后专用只读复查：[32469017284](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/32469017284)，success；生产返回四个新约束及完整修正版定义，cash 保留 NULL，AR 包含 SALES_RETURN / STORE_SALE / STORE_SALE_RETURN，且所有存量分组查询成功。

## 8. 回滚方法

若仅回滚本迁移，执行 TypeORM `migration:revert` 会 DROP 四个新 CHECK，不触碰业务数据。应用代码回退使用正常 `git revert`；禁止 force push、rebase 或 amend 已发布历史。
