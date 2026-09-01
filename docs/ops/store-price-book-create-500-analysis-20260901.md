# 门店价格册创建 500：根因分析与修复设计（2026-09-01）

> 范围：只读分析与方案设计；未修改业务代码、未执行数据库写入、未在生产重放请求。

## 1. 结论与证据等级

本轮**尚不能诚实地宣布确切根因**。当前仓库和 GitHub Actions 原始日志可以把故障收窄到创建 SQL 的数据库执行阶段附近，但用户实测时刻、请求标识及该时段生产 `sys_error_logs` / API 容器堆栈均未随任务提供，本机也没有生产 SSH 凭据。不能用候选原因冒充真实 500 堆栈。

已确定的关键结论：

1. 创建链路会无条件在 `INSERT` 中引用 V1-4 新列 `store_code`；`publish_version` 不显式写入，依赖数据库 `NOT NULL DEFAULT 0`。[price-books.service.ts](../../apps/api/src/modules/sales-v2/services/price-books.service.ts#L108-L130)
2. 两列只由 TypeORM 迁移 `ImplementStorePosV14TenderSettlement1788220800000` 增加，历史冻结 SQL 与仓库 schema snapshot 均没有它们。[迁移](../../apps/api/src/database/migrations/1788220800000-ImplementStorePosV14TenderSettlement.ts#L10-L30) [冻结基线](../../apps/api/migrations/20260527_sales_v2_phase0_baseline.sql#L106-L131) [snapshot](../schema-snapshot.sql#L6287-L6303)
3. GitHub Actions full deploy run `33465428513` 的原始日志显示：生产当时已有 70 条迁移、V1-4 是唯一新迁移，随后输出 `Migration ImplementStorePosV14TenderSettlement... has been executed successfully` 和 `TS 迁移完成`。这是真实部署证据，不只是旧报告转述。
4. 该部署日志证明“部署时迁移执行成功”，却未查询 `information_schema.columns`，也未验证故障发生时的 schema 末态；closeout run 同样未核对 `sal_price_books.store_code/publish_version`。因此 H1 仍须生产只读查询确认，但不能直接定案。
5. 单纯缺 `store_code` 会产生 PostgreSQL `42703`。当前全局异常过滤器明确把 `42703` 记录为 `PG_ERROR` 并返回 HTTP 400“字段不存在”，不是用户看到的 500。[all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts#L18-L26) [all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts#L71-L108) 因而在当前生产 revision 与过滤器正常生效的前提下，“缺列”与实测 500 **响应码不吻合**。
6. 真正的该文案只由未知/未映射异常分支返回；该分支应异步写 `UNHANDLED / 500` 到 `sys_error_logs`，并在容器 stdout 打完整 stack。生产环境落库记录有意不保存 stack，完整堆栈只能以容器日志为准。[all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts#L90-L108) [all-exceptions.filter.ts](../../apps/api/src/common/filters/all-exceptions.filter.ts#L111-L153)

因此，下一轮实施前的第一动作不是改代码，而是取得故障时段的 `UNHANDLED` 记录与容器堆栈。若日志已轮转，则在隔离临时库用生产 schema 末态和同 payload 复现；在此之前任何“确切根因”都属于猜测。

## 2. 完整创建链路

| 层 | 位置 | 已核实行为 |
|---|---|---|
| 页面 | `apps/web/src/app/(admin)/sales2/pricing/page.tsx:284-305,385-437` | `POST /api/v2/sales/pricing/books`；payload 为 camelCase，门店字段 `storeCode` |
| 门店选择器 | `MasterDataSelectors.tsx:339-355` | 从 `/api/lookup/stores?companyCode=...` 取 ACTIVE 门店 |
| Controller | `sales-price-books.controller.ts:16-18,38-42` | `MenuGuard + DataScopeGuard`；要求 `MENU_SALES2_PRICE:C` |
| DTO | `price-book.dto.ts:8-38` | 接受可选 `storeCode`；字段名与前端一致 |
| Service | `price-books.service.ts:108-130` | DataScope 校验后生成编号，raw SQL 插入 `store_code`；不写 `publish_version` |
| DB 默认 | `1788220800000-...ts:12-14` | `publish_version integer NOT NULL DEFAULT 0` |

前端编辑时把后端 `store_code` 映射回 `storeCode`（`page.tsx:663-675`）。不存在前端发送 snake_case 而被 DTO 丢弃的问题。

## 3. 生产取证现状与缺口

### 3.1 已取得

- full deployment run `33465428513`：V1-4 TS 迁移在生产容器内成功执行；run 对应业务 revision `45e5728d54107b787b0196e152dbb166f9133f14`。
- 仓库当前异常采集规则：403、映射 PG 异常、未知 500 会落 `sys_error_logs`；普通 4xx 不落；未知异常在容器日志输出 stack。
- `sys_error_logs` 查询 API 只在详情响应中返回 stack，但生产模式写入时本身不保存 stack，故不能把错误表当完整堆栈来源。[sys-error-logs.controller.ts](../../apps/api/src/modules/system-monitor/controllers/sys-error-logs.controller.ts#L16-L52)

### 3.2 未取得且不得虚构

- 用户点击失败的准确时间、账号、公司/门店、request id、实际 payload；
- 对应该时段的 `sys_error_logs` 行；
- `phoenix-v3-api` 容器日志完整 stack；
- 故障当下 `sal_price_books` 两列及迁移登记的只读查询结果。

业务主动抛出的普通 4xx 默认不进 `sys_error_logs`；未知 500 按设计会写，但写入是 fire-and-forget，数据库故障、错误日志 service 未注入、写日志自身失败、进程级崩溃或日志轮转仍可能留下空档。HTTP 生命周期外的 `uncaughtException/unhandledRejection` 也没有进程级落库处理。因此“错误表没有记录”不等于“没有真实异常”。

### 3.3 下一轮只读取证命令

必须先以用户实测时间收窄窗口，生产事务强制只读：

```sql
BEGIN TRANSACTION READ ONLY;

SELECT id, created_at, error_type, http_status, request_method, request_path,
       error_message, pg_error_code, username
FROM sys_error_logs
WHERE created_at BETWEEN :start_time AND :end_time
  AND request_method = 'POST'
  AND request_path LIKE '%/api/v2/sales/pricing/books%'
ORDER BY created_at DESC;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sal_price_books'
  AND column_name IN ('store_code','publish_version')
ORDER BY column_name;

SELECT id, "timestamp", name
FROM migrations
WHERE "timestamp"=1788220800000
   OR name='ImplementStorePosV14TenderSettlement1788220800000';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='sal_price_books'
  AND indexname='idx_sal_price_books_store';

ROLLBACK;
```

容器日志须保留未裁剪 stack：

```bash
docker logs --timestamps --since '<start-ISO>' --until '<end-ISO>' phoenix-v3-api 2>&1 \
  | rg -C 30 'POST /api/v2/sales/pricing/books|\[Unhandled\]|\[DB\]|QueryFailedError'
```

## 4. H1–H5 逐项判断

| 假设 | 证据 | 当前判定 |
|---|---|---|
| H1 schema 漂移 | INSERT 无条件写新列；冻结基线/snapshot 无列；生产部署日志显示迁移成功，但未验证故障时 schema；`42703` 当前应返回 400 | **高风险但未定案；与 500 码冲突，必须查生产末态和 stack** |
| H2 NOT NULL/唯一约束 | `store_code` nullable；`publish_version NOT NULL DEFAULT 0` 可回填旧行；迁移未增加价格册 scope 唯一约束 | **新列本身未见可解释该 500 的约束冲突**。已有 `price_book_no UNIQUE` 存在并发风险，但 `23505` 会返回 400 |
| H3 写入漏/错字段、版本逻辑 | 创建正确写 `store_code`，版本依赖默认；发布执行 `publish_version=publish_version+1`；首次发布 0→1，无空表聚合 | **创建字段设计成立；未见首次发布算术错误**。但编号 `COUNT(*)+1` 并发不安全；恢复 ACTIVE 不递增版本 |
| H4 DTO/校验 | 前端与 DTO 都是 `storeCode`；全局 `whitelist:true, forbidNonWhitelisted:false` | **排除为 500 根因**。未知字段只会被剥离，已声明字段可达 service |
| H5 权限/allowlist | 专用 Controller，非 generic CRUD；正确 `MENU_SALES2_PRICE:C` gate | **排除为该 500 根因**。权限失败是 403，并有 `FORBIDDEN` 日志，不会返回该 500 文案 |

## 5. 根因闭环判定规则

下一轮只能按真实证据选择修复分支：

- 若 stack 为 `42703` 且客户端仍收到 500：除补 schema 外，还要核对故障实例实际 revision/过滤器是否加载；这意味着“schema 漂移 + 应用 revision/异常映射漂移”是组合故障。
- 若列缺失但错误表记录 `PG_ERROR/400`：用户侧可能把 400 统一展示成 500，需同时核查 `apiFetch` 响应解析与网关原始状态；不能只修 UI 文案。
- 若 stack 为 `42P01`、连接/事务错误或其他未映射 PG code：按真实 code 补 schema/连接根因；不要盲目扩大 PG 错误映射掩盖故障。
- 若 stack 指向编号唯一冲突：先核对为何 `23505` 没走映射，再将编号生成改为数据库序列/带锁计数器，而不是简单重试。
- 若生产日志已轮转：用生产备份的隔离副本（禁止生产写）复现相同 POST；先固定旧 revision 与 schema，再分别验证迁移前/后。

## 6. 最小修复方案设计

本节是待根因闭环后的设计，不授权本轮实施。

### 6.1 若 H1 命中

1. 不改已有 `1788220800000` 历史迁移；新增一个幂等 TypeORM 修复迁移，补 `store_code varchar(64)`、`publish_version integer NOT NULL DEFAULT 0` 和门店索引，并实现 `down()`。
2. 修复迁移前先以只读 SQL 判断缺失对象，禁止直接在生产手工 DDL；走标准部署链执行。
3. 增加部署后硬验证：两列的 type/null/default、索引、migration row 四项缺一即部署失败。
4. 业务 service 保持创建 SQL 最小不动；显式写 `publish_version=0` 只会掩盖默认漂移，不能替代 schema 修复。

### 6.2 若非 H1

只按 stack 指向点做最小补丁。任何方案都应保留原异常作为测试输入，并断言真实 HTTP status 和安全响应体，避免把未知 500 粗暴改成 400。

### 6.3 建议顺手加固（独立变更，不与 500 修复混交）

- 创建/编辑校验 `storeCode` 对应 ACTIVE 门店且属于 `companyCode`；
- 将价格册编号从 `COUNT(*)+1` 改为事务安全生成；
- 修复前端审批字段 `comment` 与 DTO `remark` 不一致；
- 明确审批中/已审批价格册是否允许编辑，当前状态判断为空分支；
- 恢复 ACTIVE 复用发布冲突检查和 advisory lock，并递增 `publish_version`；
- 禁止 ACTIVE 价格册明细旁路停用；
- runtime 的 company/store 参数补 DataScope 校验，`getCurrentPrices` 纳入 scope 维度。

## 7. 同类影响面矩阵

| 路径 | 新列依赖 | 同款风险 | 修复/测试优先级 |
|---|---|---|---|
| 创建价格册 | 写 `store_code`，读默认 version | schema 缺列；编号并发；门店归属未校验 | P0 |
| 编辑价格册 | 更新 `store_code` | 缺列；审批中/已审批仍可修改 | P0 |
| 发布 | 更新 `publish_version`，冲突条件含 store | 缺列；状态检查在锁外，UPDATE 无状态条件 | P0 |
| 恢复 ACTIVE | 读取明细，直接改状态 | 未复用冲突检查/锁，不递增 version | P0 |
| 失效/取消 | 状态更新 | 与发布并发竞态 | P1 |
| 价格项新增/编辑 | 间接依赖 price book | ACTIVE 编辑有保护，但范围/价格约束不完整 | P1 |
| 价格项停用 | 间接影响线上价格 | 未阻止 ACTIVE 价格册明细停用 | P0 |
| runtime resolve | 读 store/version | schema 缺列直接失败；请求 scope 校验不足 | P0 |
| current prices | 未正确纳入 store scope | 多门店时可能返回错误 scope 价格 | P0 |
| POS 快照/漂移 | 保存并比较 publish version | 恢复不递增导致漏报漂移 | P0 |

## 8. 回归测试计划（先红后绿）

### 8.1 故障复现测试

在临时 PostgreSQL/schema 运行，不写生产：

1. 以冻结 Sales V2 基线构造 `sal_price_books`，固定与生产实测一致的认证、DataScope 和 payload。
2. 对 `POST /api/v2/sales/pricing/books` 记录 raw HTTP status/body、`sys_error_logs` 和 API stack，测试名保留真实 PG code/异常类型。
3. 若生产证据为缺列：迁移前断言失败（红）；执行修复迁移后同请求断言 201/200、`store_code` 正确、`publish_version=0`（绿）。
4. 若生产证据不是缺列：按真实前置条件建立 fixture，禁止用人工 throw 模拟数据库异常冒充复现。

### 8.2 服务与合同测试

- 在 `price-books.service.spec.ts` 增加 createBook：有门店、无门店、默认版本、越权公司、无效/跨公司门店；
- 并发创建两本价格册不得因相同 `price_book_no` 冲突；
- contract test 验证迁移列定义、索引与部署后 schema probe；
- 编辑/发布/恢复/失效并发状态测试；
- ACTIVE 明细停用应失败；恢复后 version 应递增且 POS 漂移可见；
- runtime 依次覆盖 STORE/CUSTOMER/CHANNEL/GLOBAL 顺序及跨公司/跨门店拒绝。

### 8.3 验收门槛

- 原始失败用例先红后绿；
- API/Web TypeScript 0 errors；相关 Jest/Vitest 全绿；
- migration down/DML、entity drift、nullable unique、constraint drift 门禁全绿；
- 临时库 migration up/down/up；
- 部署后生产只读 schema probe + 一次授权的最小 UAT；
- 观察窗口内该 endpoint 无新增 `UNHANDLED/500`，并保留容器原始日志证据。

## 9. 下一轮执行顺序

1. 补用户实测时间与请求身份；
2. 生产只读抓 `sys_error_logs`、容器 stack、schema/migration/index 四项；
3. 将本报告“尚未定案”更新为带完整证据的确切根因；
4. 写先红测试并复现；
5. 仅实现命中分支的最小修复；
6. 跑同类矩阵与全门禁；
7. 独立提交业务修复，禁止与本轮纯文档 commit 混合。
