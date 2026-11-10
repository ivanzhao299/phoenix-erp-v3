# 主数据治理阶段 1：保护 SKU 身份（2026-11-10）

基线：`origin/main` / `356ba4106e42f2c9386024b00a59e2e40c7594e0`。分支：`codex/master-data-governance-20261110`。仅在指定隔离工作树实施；无迁移、无数据库连接、无部署或推送。

## 问题与引用审计

主数据 Runtime 原来可直接修改 SKU 三键；专用接口忽略三键；通用 CRUD 可修改和删除。引用中心的 SKU 统计仅列销售明细、库存批次、入库单，且查询异常返回空，不能承担身份保护。销售创建/更新会将不存在、停用或查询失败的显式 SKU 静默变成 NULL；更新还先删除旧明细。

审计范围：`apps/api/src/modules/` 的 `sku_code` / `skuCode` / `item_code` 写入、主数据三入口，以及冻结 SQL 和 TS 迁移定义。以下是代码证据，未声称已查询实际数据库：

| 引用路径 | 事实依据（路径相对 `apps/api/src/modules/`） | 保护口径 |
| --- | --- | --- |
| 销售订单 | `sales-v2/services/sales-orders.service.ts:146`，`sal_order_items.sku_code` | 精确 SKU 编码 |
| 价格明细（新增/导入/复制） | `sales-v2/services/price-items.service.ts:144,250,283`，`sal_price_items.sku_code` | 包括历史、非生效价格项 |
| 批次及库存流水 | `sales-v2/services/egg-inventory.service.ts:213,343`，`inv_batches/inv_ledger.sku_code` | 包括无余额批次及历史流水 |
| 门店销售/退货 | `store-pos/services/store-pos.service.ts:321,954,1129`；`sales-v2/services/return-orders.service.ts:414` | `sal_store_sale_items/sal_return_items.sku_code`，回库批次与流水 |
| 门店补货 | `store-pos/services/store-replenishment.service.ts:80` | `store_replenishment_request_lines.sku_code` |
| WMS / 旧订单品目 | `wms/wms.service.ts:948,1223`；冻结 SQL `20260612_g85c_order_item_sku_cols.sql` | 业务表 `sku_code/item_code`，以及 `wms_*` 的 `item` |
| 包装产出及凭据 | `sales-v2/services/packaging-inventory-integration.service.ts:293-306`；TS 迁移 `1789353300496-PackagingHistoryD1cEvidence.ts` | `pkg_*` JSON/JSONB 中递归出现的精确 `skuCode/sku_code`，另有批次/流水引用 |

## 改法与兼容边界

新增可复用的 `product-master/services/sku-policy.ts`：

- 三个写入口均在事务内锁定 SKU 行，真正修改 `product_code/grade_code/spec_code` 时才进行引用检查。已有引用返回 409；名称、备注等仍按原有字段规则编辑；原值重传不视为身份变更。
- 通过当前 schema 的基表元数据发现上述引用列，使用参数化 EXISTS 式探测（`SELECT 1 … LIMIT 1`）；不依赖 UI 统计，不过滤单据状态。四个核心引用列缺失也拒绝变更。元数据、查询或锁失败均不放行。
- 不允许改 `sku_code`；通用 CRUD 禁止物理删除 SKU，避免删后重建绕过保护。无引用 SKU 可修改三键，仍受数据库已有唯一约束约束。
- 锁顺序为 SKU 行 → 无锁初探 → 业务表 `SHARE MODE NOWAIT` → 二次探测 → UPDATE → 提交。常见已有引用场景初探就拒绝，不获取业务表锁。无引用身份编辑才短暂锁表；已有业务写入时立刻拒绝重试。单条 guard SQL 使用事务内 2 秒 `statement_timeout`，二次遍历另有 2 秒应用 deadline；这不是整个事务严格 2 秒的承诺。Runtime 的通用字段校验在表锁前，审计在提交后，避免外部连接延长表锁。
- 专用/Runtime SKU 行 NOWAIT 冲突、引用表 NOWAIT 冲突均返回 409 重试提示。其他执行异常透传并回滚，不降级成功。

销售 `createDraft/updateDraft` 在写事务内使用 `requireUsable`，按数据库 `CURRENT_DATE` 检查 ACTIVE 与包含端点的生效期，`FOR SHARE` 保持到写入提交。SKU 的产品/等级/规格覆盖请求值；DTO 允许只传 SKU，服务权威带出。更新先锁定并重查 DRAFT，全部明细验证后再删旧插新，金额及头部更新也在同一事务。

只有完全省略 `skuCode` 的明细继续走历史 `productCode/gradeCode/packagingSpec` 路径，DTO 仍要求产品编码。显式 NULL、空串、空白、未知、停用、未来生效、过期 SKU 均拒绝。显式 SKU 遇明细表缺列时也直接失败，禁止通过重试丢掉引用；历史未传 SKU 的插入直接使用旧列集合，无需吞查询异常。

## 实际验证

环境：Node **20.20.2**；直接执行现有 Jest/TypeScript CLI，未修改版本声明或共享依赖。Web 依赖最初断链，由协调者在工作树内建立独立依赖后补验成功。

| 检查 | 实际结果 |
| --- | --- |
| 相关 API 单测：9 suites | **162/162 通过**；覆盖三键各自有/无引用、10 类引用、三入口、查询/锁失败、忙锁、二次检查发现新引用、deadline、可用性日期边界、创建/更新拒绝无效 SKU、权威带出、历史兼容、写失败传播及 DTO |
| API tsc | **退出 0，0 errors**：`node apps/api/node_modules/typescript/bin/tsc --project apps/api/tsconfig.json --noEmit --incremental false` |
| Web tsc | **退出 0，0 errors**：`node apps/web/node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false` |
| 9 个修改 TS 文件 ESLint | **退出 0，0 errors，165 warnings**（含既有 any 和测试 mock 等；未降低规则或添加 suppression） |
| 本阶段 scope 行为审计 | 销售 create/update 跨公司均 403，打开写事务前阻断；现有 Runtime/通用 CRUD/退货范围相关单测同跑通过。SKU 仍是全局主数据，无新增 company 权限路径 |
| 字段审计 | Web 修改文件 **0**；真实读取 SKU 管理页与销售订单页，以 `<input[^>]*(product_code\|grade_code\|spec_code\|skuCode)` 窄正则各计数 **0**。仅描述这两个入口及该式，不代表全站输入审计 |
| Diff | 已逐项审查，`git diff --check` 通过；无 entity/schema/dict 变更，无依赖或协调报告入提交 |

单测执行文件（`--runInBand --runTestsByPath`）：`sku-policy.spec.ts`、`sales-orders.service.spec.ts`、`sales-order.dto.spec.ts`、`master-data-runtime.service.spec.ts`、`master-data-references.service.spec.ts`、`generic-crud.service.spec.ts`、`generic-crud.controller.spec.ts`、`lookup.controller.spec.ts`、`return-orders.scope.spec.ts`。

未执行：真实 PostgreSQL 并发/锁/JSONPath 集成测试、需要运行 API/测试账号的完整 `apps/api/test/scope-audit.sh`、全量 API/Web 测试、构建、生产检查。单测使用数据库接口替身，验证实际服务分支与写事务归属，不能替代数据库回滚/锁语义的集成证明。

## 风险与后续交接

1. **第三阶段必须处理非销售消费者的读取锁与可用性。** WMS `wms.service.ts:501-511,1223-1233` 仍无锁读取 SKU；价格、包装、门店等也尚未统一消费 `requireUsable`。旧消费者可能先读取旧身份，在本次短表锁释放后才插入旧组合。本阶段保证已存在引用不能改三键、以及新销售保存与身份编辑相互串行；不宣称全域消费者的首次引用已完全原子化。
2. 无引用 SKU 编辑的锁范围包含当前 schema 中发现的业务引用表，会短暂阻塞随后到达的写入；繁忙系统可能经常返回 409。初探拒绝、NOWAIT、deadline 和语句超时控制影响，但上线前仍需隔离 PostgreSQL 集成验证及扫描/锁时长评估。新增消费者宜采用同事务 SKU 行共享锁，再评估替换广表锁。
3. 检查限于当前 schema、直接编码列和 `pkg_*` JSON/JSONB。其他 schema、TEXT 序列化 JSON、任意别名字段或仅存产品/等级/规格、没有 SKU 编码的旧单据不能据此可靠归属某 SKU。`item_code` 同名编码碰撞会保守拒绝编辑。运行角色需看得到完整元数据和相关表；未通过真实数据库核验。
4. 不回填或改写旧单据。UI 引用统计/归档仍沿用既有引用中心，本阶段身份保护已独立于它；后续可统一展示口径。原来的价格解析异常回退策略不在本阶段扩展。
5. 独立 reviewer 已完成两轮只读审查，覆盖三入口、删除绕过、SQL 静态语法、锁顺序和消费者并发边界；物理删除绕过及忙 SKU 行原始报错已修复。剩余数据库执行证据和全消费者并发限制如上列明。
6. 包装托/箱的数量换算模型留在第五阶段，不在本阶段更改 SKU 模型。

## 提交文件

9 个 API TS 文件：共享策略及其行为测试、ProductMasterService、MasterDataRuntimeService、GenericCrudService、SalesOrdersService 及测试、销售 DTO 及测试；另加本报告。仅显式 stage 这些文件，提交 `fix: protect referenced sku identity`。不提交依赖符号链接、协调报告及其他工作。
