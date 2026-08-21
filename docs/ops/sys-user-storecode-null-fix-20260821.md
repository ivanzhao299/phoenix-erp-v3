# sys_user.store_code 可空修复与同类漂移审计（2026-08-21）

## 1. 事故与根因

生产用户管理通过 `POST /api/users` 创建非 POS 用户时不提交 `store_code`。G76 后端按现行语义显式写入 `NULL`，但生产 `sys_user.store_code` 仍保留历史 `NOT NULL`，因此 PostgreSQL 报 `23502`，用户创建失败。

历史 DDL 结论：

- `apps/api/ddl/01_create_rbac_tables.sql` 首次建表即定义 `store_code VARCHAR(64) NOT NULL DEFAULT 'ALL'`，同时建立普通索引 `idx_user_store`。
- `docs/schema-snapshot.sql` 仍记录 `DEFAULT 'ALL' NOT NULL`。
- 三个迁移目录中没有后续修改该列 nullability/default 的 DDL。
- `store_code` 不参与唯一约束；`idx_user_store` 不是唯一索引，因此本次 `DROP NOT NULL` 不触发 g198 nullable-in-unique 问题。
- 列 DEFAULT `'ALL'` 不能挽救显式 `NULL`；DEFAULT 只在省略列或写 `DEFAULT` 时生效。

## 2. 语义判定与修复

`docs/g76-rbac-org-scope-architecture.md` 明确规定：

- 公司数据范围只由 `sys_user_orgs` 组织绑定决定；
- `sys_user.store_code` 降级为 POS 门店行级隔离专用；
- 新建默认 `null`，非 POS 用户留空；无组织绑定是空范围，不以 `'ALL'` 回退全局。

因此正确修复是对齐 DB 到 G76，而不是恢复 `'ALL'` 占位：

1. 新增 TypeORM migration `1787299200000-AllowNullSysUserStoreCode.ts`：
   - `up()`：`ALTER TABLE sys_user ALTER COLUMN store_code DROP NOT NULL`
   - `down()`：`ALTER TABLE sys_user ALTER COLUMN store_code SET NOT NULL`
2. `/api/users` 保持 `store_code || null`。
3. legacy `/api/system/users` 创建端点由 `store_code || 'ALL'` 统一为 `store_code || null`。前端仅使用该端点的改密子路由，没有创建调用者；统一创建语义不会影响现有前端。
4. 新增 controller 单测，验证不带 `store_code` 创建成功，SQL 参数明确写 `null`。

部署链在 API 容器启动后自动执行 TypeORM `migration:run`。本次只修改列约束，不更新任何生产业务行，旧行保持原值。

### 回滚

生产回滚 migration 前必须先只读确认 `sys_user.store_code IS NULL` 的行数为 0；只要新语义下已经创建过非 POS 用户，直接 `SET NOT NULL` 会按设计失败。满足前置条件后执行 TypeORM `migration:revert`，其 `down()` 恢复 `NOT NULL`。不要用业务数据回填掩盖回滚前置条件。

## 3. 全库同类漂移排查

排查规则为“DB 最终定义中 NOT NULL 且无 DEFAULT”与所有 TS `INSERT INTO` 写路径逐表比对，并额外检查显式 `|| null` / `?? null`。覆盖 `sys_user*`、`sys_role`、`sys_dict`、`sal_*`、`prc*`、`fin_*`、`inv_*`、`wms_*`、`pkg_*`、`brd_*`、`mst_*`。由于本机无运行中的 PostgreSQL，本轮约束依据为仓库 SQL、entity 与 `docs/schema-snapshot.sql`；生产实际约束不明的项目不升级为 confirmed。

### 已确认并修复

| 表/路径 | 判定 | 处理 |
|---|---|---|
| `sys_user`, BFF `/api/users` | confirmed：显式 NULL 命中历史 NOT NULL；生产已复现 | DROP NOT NULL |
| `sys_user`, legacy `/api/system/users` | 不是当前故障，但与 G76 语义不一致 | 统一写 NULL |

### 已核验安全

- `sys_user` 其余 INSERT 均覆盖 `username/password_hash/real_name`；`sys_role` INSERT 覆盖 `role_code/role_name_zh/role_type`；`sys_dict` 无 NOT NULL 无 DEFAULT 业务列。
- `sal_*` 已检查渠道、客户、价格册/明细、销售订单/明细、配送/明细、司机、车辆、签收、退货：各 INSERT 均覆盖相应必填无默认列。
- `fin_*` 已检查 AR 发票/收款、AP 发票、现金流水、费用、报销、股东出资/结算：各 INSERT 均覆盖相应必填无默认列；`fin_cash_transactions.txn_date` 省略时有 DB DEFAULT。
- `inv_batches.batch_no`、`inv_ledger.change_type` 的 raw INSERT 均提供值；WMS 调拨、包装入库路径对已知必填列提供值。
- `pkg_*` 的班次、来源批次、分级、包装、交接写路径均覆盖 code/date 等必填无默认列；`brd_*`、`mst_*` 当前定义未发现同类缺列。
- Generic CRUD 按请求 body 动态生成 INSERT，本身不补齐必填列；但已检查的现有业务 payload 未确认出新的必现违规。

### 待审，不作为本次已确认 bug

- `wms_outbound` 历史 archive schema 使用 `task_no NOT NULL`，较新骨架/代码使用 `outbound_no`；需以生产 schema 核验，才能判断 standalone outbound 是否存在缺列风险。
- `wms_inbound_items` 等 generic CRUD 表依赖请求 payload 提供必填列；需结合生产最终约束和实际前端 payload 做运行时复核。
- `prc2_*` 多个 TypeORM create/save 路径依赖 DTO 校验保证 `subject/item_name/payer_type/payer_name/currency_code` 等必填值；本轮未发现显式 NULL 的确定证据，保留为 DTO/运行时校验专项。
- 历史 finance baseline 对部分列约束互相冲突；以旧 baseline 单独推断生产约束会产生假阳性。
- 另发现 `store-pos` 写 `fin_ar_invoices.source_type` 的值与某历史 CHECK 枚举不一致，这是 CHECK/schema 漂移风险，不属于本次 NOT NULL 模式，另案核实。

## 4. 验证与部署结果

### 本地验证

- TS migration down/no-data-DML 门禁：通过。
- 定向 Jest `bff.controller.spec.ts`：24/24 通过。
- API TypeScript：`./node_modules/.bin/tsc --noEmit`，0 errors。
- API Jest：`pnpm exec jest --runInBand`，56 suites / 503 tests 全部通过。
- Web TypeScript：`./node_modules/.bin/tsc --noEmit`，0 errors（本次未改前端，仍执行回归）。
- nullable-in-unique：0 处违规（仓库既有 1 处白名单）；本列不在唯一约束中。
- DataScope 静态审计：采购 9 个 service 0 findings；WMS write gate PASS。

### CI/CD 与生产验证

- 分支、commit、PR/main merge、部署 run：待执行。
- 新增 `sys-user-storecode-schema-audit.yml`。它只查询 `information_schema.columns`，并保留 runner/SSH 双重时间格式与顺序校验、psql `-v` 参数化、`PGOPTIONS=default_transaction_read_only=on`、`BEGIN TRANSACTION READ ONLY`、`ON_ERROR_STOP=1`。
- 部署后期望：`sys_user.store_code` 的 `is_nullable = 'YES'`；实际 run 与输出待回填。
