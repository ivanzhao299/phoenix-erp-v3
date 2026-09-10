# 包装确认入库失败：只读根因核查与报批方案（2026-09-10）

状态：**根因已证、主 agent 已复核；实施未授权，未实施。** 本报告取代本轮对旧历史清理/生产冒烟的推进，不改变其审批范围。

## 1. 核心结论

生产在 **2026-09-10 09:10:01 UTC** 对包装 **33 / `PKG-20260910-163616`** 确认入库，真实异常是：

```text
[warehouse/confirm][ERR] 包装库存生成失败 packingCode=PKG-20260910-163616:
SKU 主数据未唯一生效：PRD-EGG-GRADE_5/GRADE_5/PKG_PACK_SPEC_3
NotFoundException: SKU 主数据未唯一生效：PRD-EGG-GRADE_5/GRADE_5/PKG_PACK_SPEC_3
at PackagingInventoryIntegrationService.resolveSku (...service.js:334:19)
at async PackagingInventoryIntegrationService.generateSaleableFromOutputs (...service.js:166:29)
at async PackagingInventoryIntegrationService.completeTerminalPacking (...service.js:253:19)
at async EntityManager.transaction (...typeorm/entity-manager/EntityManager.js:75:28)
at async PackagingTerminalBffController.confirmHandover (...bff.controller.js:***42:13)
```

`***` 为 GitHub 原始掩码，未猜回行号或时间的小数位。完整保留栈见 [首次取证](runs/packaging-confirm-failure-20260910/evidence-34459720319.txt)。

**不是重复 ACTIVE：该精确组合所有状态合计 0 行，ACTIVE 也是 0 行；跨产品查询 GRADE_5 + 此礼盒规格同样 0 行。** 规格 `PKG_PACK_SPEC_3` 已在 9 月 9 日获批建立，ACTIVE、30 枚/盒；GRADE_5 也是 ACTIVE、可售、可库存。此前补录只覆盖 GRADE_1/2，未覆盖 GRADE_5。

机制分三层：

1. 库存服务按 `PRD-EGG-${grade}` 拼产品码，再要求唯一 ACTIVE 的 product/grade/spec SKU；缺 SKU 时有意阻断，避免写无 SKU 库存。
2. 包装页面独立提供等级和规格选项，服务端 `packing/submit` 校验来源、数量和幂等，但没有库存 SKU 就绪校验，故可以先形成无可入库 SKU 的包装单。
3. `confirmHandover` catch 吞回业务响应，将具体错误藏在 `inventory.error`，给前端通用 message；前端只显示 message。该异常不经过全局异常过滤器，导致 `sys_error_logs` 该端点 **0 行**，不能用零错误行判断业务成功。

最近变更判定：唯一 ACTIVE 三元组阻断由 **`2f083c4249582d3ded1847aea1ba3019dfe33b7f`，2026-09-09 14:38:08 +08:00，PR218** 引入。它收紧了旧的 NULL SKU 降级行为；此次属于该收紧后暴露的组合覆盖缺口和交互/预检遗漏。**PR228 未改 `resolveSku` 或其三元组规则；没有证据把本异常归因于 PR228 的锁、VOID、测试隔离或事务回归。**

## 2. 范围、运行记录与 revision

本轮读取了 AGENTS.md 及指定的三个近期报告，按报告末节辨别历史与当前状态。无生产 POST、业务 DML、DDL、部署、补账、配置切换、清理或测试数据创建；只新增/扩充审计资产和本报告。审计独立分支：`audit/packaging-confirm-failure-20260910`，未推 main。

| run | 审计包 revision | 内容 | 结果 |
|---|---|---|---|
| [34459720319](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34459720319) | `68385ac4` | 端点留存错误、最新包装、保护迁移、API 原始栈 | success |
| [34460024591](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34460024591) | `4772c634` | 精确包装33/34、来源links、主数据、模式、库位、批次/流水/交接 | success |
| [34460327453](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34460327453) | `ad792787` | 操作审计、鸡舍归属、WMS、已有交接、约束 | success |
| [34460567262](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34460567262) | `8f4e5b94` | 产品身份与全可售等级礼盒 SKU 覆盖补证 | success |

四次均使用现有 `Production Readonly Audit`，HTTP manifest 为空，不启动认证上下文。数据库连接 `PGOPTIONS=-c default_transaction_read_only=on`，SQL 外层 `BEGIN TRANSACTION READ ONLY`、`statement_timeout=30s`、`lock_timeout=5s`，结束 `ROLLBACK`；运行时读回 connection/transaction 均 `on`，输出 `PRODUCTION_BUSINESS_WRITES=0`。该标记指本审计零写入，不表示期间其他用户没有写入。

本地开始 HEAD `7df2a629`；四次生产 checkout/API/Web 比较均一致，为 **`492ba3c3a67b477e2240b7b5a8762164a80bfd7e`**。现场日志局部 SHA 被掩码，但执行器逐字比较三端通过；完整 SHA 由本轮 GitHub PR228 merge metadata 及取回的 git 对象核对。主 agent 实跑 `git diff 492ba3c3 HEAD -- apps/api/src apps/web/src` 为空，审阅源码与生产合并版本一致。

迁移末态：最新记录 **id370 `ProtectPackagingVoidAndTestIsolation1789099201000`**；前序 id337 `AddGradingVoidAudit1789099200000`、id304 `GovernPackagingGradingSubmissions1789012800000`、id303 `AddInventoryInboundDate1788943471000`。实际四表 `is_test NOT NULL DEFAULT false`、包装六个保护字段、`ck_packing_record_status CHECK ACTIVE/VOID` 和 `uq_packing_idempotency` 部分唯一索引均读到。不是报告中“迁移未部署”的旧状态。

时间口径：DB `TimeZone=UTC`；Docker 带 UTC 时间戳。失败 09:10:01 UTC = **17:10:01 新加坡时间（本会话 +08）** = **16:10:01 老挝时间（+07，按孟赛所在地换算）**，均为 9 月 10 日。后者是业务地点换算，不声称应用已配置该时区。班次/包装业务日期均是 `2026-09-10`。首轮取全部留存端点错误、容器现有日志的有限匹配片段，未臆定日志窗口；后续审计窗口 09:09:55–09:10:10 UTC 明确围绕已找到的故障时点。

API 容器 created `08:41:10.344549692Z`、started `08:41:10.543838479Z`、log driver `json-file`。本容器早于创建时的堆栈不在此次留存范围。实际故障原文已保留，故无需生产 POST 复现。

## 3. 真实调用链及异常去向

| 环节 | 当前出处 | 行为 |
|---|---|---|
| 页面确认 | `apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx:102` | `packingCode/shiftId/boxes/location/receiver/productionDate` 提交 |
| Web API | `apps/web/src/lib/packaging-api.ts:203`；失败断言`:55` | POST `/api/packaging/terminal/warehouse/confirm`；`inventoryOk!==true` 抛 message |
| BFF | `apps/api/src/modules/bff/bff.controller.ts:2535` | JWT/MenuGuard、`MENU_PKG_OP:E`、拒绝test请求；库位反查仓库；进入事务 |
| 锁/保护 | BFF `:2570`；`modules/bff/packaging-protection.ts:21` | `packaging-chain:false` → `terminal-packing:<code>`，检查包装ACTIVE、非test |
| Terminal库存整合 | `modules/sales-v2/services/packaging-inventory-integration.service.ts:297` | 读取包装和班次site；稳定specId传递；生产日规范化；场站公司解析 |
| 批次生成协调 | 同文件`:104`、`:216` | 幂等证据、精确模式、可售等级；规格及SKU解析；本次在`:453`抛错 |
| 唯一库存写入 | `modules/sales-v2/services/egg-inventory.service.ts:256`、`:318`、`:175` | `createProductionBatch → inv_batches → writeLedger → inv_ledger`，共用manager |
| 交接写入 | BFF `:2598` | 库存生成完成后，同manager插入 `pkg_handover_records` |
| 异常包装 | BFF `:2609`、`:2623` | catch日志、`inventory.error`；再读状态；返回业务 `code:200`，前端报通用错误 |

此链**不经通用 WMS 待确认入库流程**，不调用旧 Admin `terminal/packaging.service.ts#packComplete`，不要求仓库再点一次确认。实际统一库存写入为 EggInventoryService；不是漏走 WMS 二次确认。

错误表空的证据与解释分开：该端点留存 `sys_error_logs count=0` 已实查；`sys_operation_logs` 同端点 count=0 已实查；`sys_audit_log` 故障附近无行。`OperationLogInterceptor` 规则未覆盖该包装确认入口；`AuditLogInterceptor:90` 的 DB save 被注释，仅 console；本次匹配栈没有POST用户/库位字段。生产全局错误日志还会省略 stack（`all-exceptions.filter.ts:150`）。**原始 SQLSTATE 不适用：实际为应用主动抛的 NotFoundException，不能编造 23505/40P01/22P02。**

用户身份边界：失败班次56 `operator_name=songlei`，operator_id为空；同一时间附近新班次57及接收/包装审计为用户157、`songlei`，成功流水也是 `songlei`。据此推断失败操作者很可能同人，但失败POST的认证 userId **没有直接日志，未知**。失败请求 `location` 也未留存；不能把成功单的 `CS-KW-MS01` 直接写成失败请求值。

## 4. 实际失败单逐行对账

### 4.1 包装33与来源

包装33：`PKG-20260910-163616`，创建 `07:42:43.617312 UTC`，ACTIVE，`is_test=false`，shift56；**30枚 / 1盒**，单项 `{grade: GRADE_5, specId: PKG_PACK_SPEC_3, spec: 精品礼盒(30枚/盒), eggs:30, boxes:1}`。字段总数与 JSON 一致。

班次56：`SH-20260910-1597`，LINE-01/MORNING，`LPH_MENGSAI`，业务日期9月10日，is_test=false；故障后 `09:10:21.608504` 关闭，当前 CLOSED。不可将故障后关闭状态推成故障原因。

| 引用分级 | 分级输出 | source link | 来源事实 |
|---|---|---|---|
| 78 / `GRD-20260910-159E8CAF` | GRADE_1=98 | source46，input_qty98 | `HOUSE_CS_MS`，100−脏1−破1=98 |
| 79 / `GRD-20260910-0A3531C5` | GRADE_1=98 | source47，input_qty98 | `HOUSE_CS_02`，100−1−1=98 |
| 80 / `GRD-20260910-D1C991FA` | GRADE_5=98 | source49，input_qty98 | `HOUSE_MS_01`，100−1−1=98 |

三条分级均 ACTIVE、is_test=false、shift56、9月10日；三条来源均 RECEIVED、is_test=false、shift56、9月10日，鸡舍均 ACTIVE，权威farm=`LPH_MENGSAI`、company=`COMP-LAO-AGRI`。引用里虽然首条 `grading_code` 指向79（GRADE_1），完整 `grading_codes_json` 包含80；不能仅看首字段误判30枚GRADE_5无来源。GRADE_5产出98≥包装30。没有逐分级包装分配行，本报告不虚构每条引用的精确消耗。

同班 source48 虽仍存在，但已 VOID、且未被包装33的三条分级links引用。它属于先前获批处置，未改变。不存在“旧无links导致本次SKU异常”的证据；当前失败单有三条真实有效links。

### 4.2 主数据、模式与归属

| 检查 | 实际证据 | 判定 |
|---|---|---|
| 等级 | GRADE_5 ACTIVE/is_saleable=true/is_storable=true | 不是不可售跳过 |
| 规格 | id2612，PKG_PACK_SPEC_3，ACTIVE，qty_per_unit30 | 规格存在；9月9日旧缺口已修复 |
| 精确SKU | PRD-EGG-GRADE_5/GRADE_5/PKG_PACK_SPEC_3：全部0、ACTIVE0 | **直接阻断原因** |
| 跨产品SKU | GRADE_5+PKG_PACK_SPEC_3：0 | 不是已有礼盒SKU被产品过滤误排 |
| 其他GRADE_5 SKU | 7条ACTIVE，product=PRD-EGG-5，spec=LOOSE/TRAY30/TRAY36/BOX360/BOX720/GIFT12/GIFT24 | 不等于此30枚精品礼盒，禁止替代使用 |
| 产品身份 | mst_products与product_master对PRD-EGG-GRADE_5、PRD-EGG-5、PRD-EGG-GRADE_1的精确查询成功执行，均未返回记录（未逐表输出空结果计数） | SKU已有产品字符串不等于产品主数据存在；须定权威身份 |
| 模式 | id828 SITE/LPH_MENGSAI=PACKAGING_INBOUND；GROUP/ALL=TEMP | SITE精确优先，不发生旧FARM-MS错配回落 |
| 公司 | ACTIVE brd_farms LPH_MENGSAI→COMP-LAO-AGRI | 权威归属存在 |
| 已知同场库位 | CS-KW-MS01 NORMAL→LPH_MS_EGG_FARM ACTIVE→COMP-LAO-AGRI | 真实候选有效；失败请求是否使用它未知 |

全可售等级该礼盒覆盖：GRADE_1→SKU-0001、GRADE_2→SKU-0002，各唯一ACTIVE；GRADE_3/4/5均无礼盒SKU。当前 **GRADE_5+礼盒** 包装清单只命中33一张30枚；GRADE_3/4属于潜在可选组合缺口，不擅自纳入补录或补账审批。

### 4.3 入账、回滚与重试

| 对象 | 包装33实际末态（09:20–09:26 UTC取证） |
|---|---|
| handover | 0行 |
| inv_batches | packaging_batch_ref/source_no/batch_no直接引用0行 |
| inv_ledger | ref_no/batch_no及关联批次直接引用0行 |
| 同shift其他库存 | 0行 |
| WMS入库 | task_no/inbound_no/source_order_no直接引用0行；故障至邻近成功窗口新增0行 |

主 agent 复核：本单只有一个产出组，在第一次 `resolveSku` 就抛错，尚未调用 `createProductionBatch`，交接INSERT位于其后。外层 TypeORM transaction 异常退出回滚；批次与ledger代码均用同manager。**代码写入顺序 + 实际0行末态** 支持“本单此次未部分入账”，不是从外层“交接未完成”猜零写入。没有取得 PostgreSQL事务ROLLBACK日志，不将本地fixture称为PG回滚实证。

全库现为库存298、ledger253，比旧报告297/252多1，来自下一节已观测到的用户业务写入；本审计未写这些行。禁止宣称全库哈希与旧报告相同。

修复后重试仍须按33的精确code重读现态，不能认为今天观察的0永久有效；不重跑集蛋/分级/包装、不重新开班、不重复创建30枚来源。若发现新batch/ledger/handover或数量变化，停止并重新对账。

## 5. 邻近成功、隔离边界及既有幂等风险

生产日志实际显示 **09:11:32 UTC** 包装34 `PKG-20260910-7A55DFFA` 成功。只读结果：

- shift57 `SH-20260910-80CA12BD`；source50 `SRC-20260910-H-DEBUG--51JK` → grading81 `GRD-20260910-3EA10B8B`（GRADE_1=98）→ packing34（90枚3盒）。四段is_test=false；source50 RECEIVED、grading81/packing34 ACTIVE。
- handover27 `WH-91fc8a1e-a78d-4dab-a6ca-1c1e7e6fc77d`，90枚对应3箱；batch id2951 / `EGG-20260910-00001` qty90/available90；ledger297 PACKAGING_INBOUND +90；SKU-0001、PKG_PACK_SPEC_3、COMP-LAO-AGRI/LPH_MS_EGG_FARM/CS-KW-MS01，日期9月10日。
- source50鸡舍为 **H-DEBUG-A01**，当前该鸡舍是ACTIVE、属孟赛。本保护按服务端 `is_test` 和显式模式隔离，名称前缀不代表测试身份。因此这是“真实模式接纳了一条H-DEBUG鸡舍来源”的实际证据，不能说测试模式越权通过，也不能把它当合规隔离冒烟。
- 上述新链、库存和交接不在旧12行审批内。本轮**只记录、不作废、不改标记、不逆向、不清理**；实际实物真实性与该鸡舍准入政策需另案裁定。不能把另一单成功说成失败单33恢复。

已有交接：包装30只读仍1交接/1批次、batch300=ledger300；包装34同样1交接/1批次、90=90。现有生成器的幂等分支在SKU解析之前，所以完整已入账单不会仅因缺新SKU而重建库存；本轮未POST重放，不能声称验证了生产幂等重试成功。

另有静态风险，非本次原始异常：

1. `generateSaleableFromOutputs:148` 只比既有batch合计与ledger合计、地点，没有将既有完整输出分组/预期数量一起比对；旧部分批次恰好与ledger对平可被标幂等，外层随后状态才发现总量不对。
2. BFF catch后又用状态覆盖 `inventoryOk`（`:2625`）。旧库存已经完整时，某次无效请求/地点冲突可能被随后“历史已提交”状态掩盖；应分开本次操作结果与既有提交事实。
3. 交接只对code唯一（实查），没有packing_code唯一；confirm取最早id，status取最新时间，两者对历史多交接存在分歧风险。当前33/30/34没有此重复事实。
4. `EggInventoryService:156` 的批次号COUNT+1不能为所有库存入口提供跨链路并发保证。包装全局锁只涵盖遵循该锁的调用；此次并未到编号生成，不能拿此风险当根因。

## 6. 只读本地核验与主 agent 复核

[隔离审计脚本](../../scripts/ops/packaging-confirm-failure-local-audit-20260910.cjs) 导入当前真实TS源码，以现场已证的缺失组合构造内存只读查询fixture。无数据库连接、无应用bootstrap、无HTTP、无持久化假数据；只允许SELECT，库存函数被禁止调用。已得到完全一致的NotFoundException，精确SKU参数一致，**库存调用0、SELECT14**。候选库位只用于隔离前提，不假称恢复了失败请求字段。结果：[local-reproduction.json](runs/packaging-confirm-failure-20260910/local-reproduction.json)。

本轮实际验证：

- API、Web各 `NODE_ENV=test ./node_modules/.bin/tsc --noEmit --incremental false`，exit0、0 errors。
- `PackagingInventoryIntegrationService` 与 BFF现有两套Jest：**30/30 PASS**；覆盖missing SKU/spec、稳定编码、manager传递、TEMP勾稽等。没有将mock事务测试说成真实PG测试。
- 终端包装窄正则真实scope-audit：`<input[^>]*field` 0命中；`onChange.*e\.target\.value` 9命中（扫码/质检数值/班次选择等现有输入），本轮runtime diff为0，无新增裸字段。见 [scope-audit.json](runs/packaging-confirm-failure-20260910/scope-audit.json)。不是“全仓DataScope已无漏洞”的证明。
- bash语法与审计输入validate通过；生产4次均双层只读。未跑新full deploy或生产成功入库验收。

两位只读探子分别核验调用链与SKU历史/选项。主 agent 亲自点验catch、SKU查询、manager传递、PR228差异和现场所有关键行；纠正探子过时线索：本轮已取回PR228精确对象；9月9日规格30/40争议已在历史末节解决，不能再次说规格缺失；`eggDate`为空在generate有今日默认，不能把某个孤立replace推断当本次异常。最终结论以上述现场及复核证据为准。第三位独立探子审查报告后提示产品表空结果缺显式计数；主 agent 已补充证据留存边界，未将查询无输出伪装成两条计数行。

## 7. 完整待批方案

### 7.1 最小范围与必要性

**生产恢复必要项：补齐获批产品/SKU身份。** 只改catch提示不会使33入账；只撤SKU校验会恢复NULL库存债，禁止采用。

产品码不能擅定：当前服务拼出的PRD-EGG-GRADE_5、已有GRADE_5其他SKU使用的PRD-EGG-5，在本轮成功执行的两张产品表查询中均未返回记录；空结果没有单独聚合成0行输出，需连同SQL与run成功结果抽查，正式补录preflight应输出逐表精确计数。建议主数据负责人选定/建立唯一有效的5号蛋产品身份，沿主数据中心流程创建所批准的 **该产品 + GRADE_5 + PKG_PACK_SPEC_3** SKU，平台生成sku_code，精确回读唯一ACTIVE；不复制其他规格SKU、不硬编码新SKU code、不重做已存在礼盒规格。

存在两种明确审批路径，不能暗中混用：

- **推荐完整路径**：批准权威产品身份（复用或创建），修复终端携带/解析该产品和SKU的契约；解除对产品命名模板的依赖。随后补唯一礼盒SKU并受控重试33。
- **更窄的数据恢复路径**：只有业务明确认可当前 `PRD-EGG-GRADE_5` 为权威产品并批准建立其主数据和SKU，现有代码才可不改即尝试恢复33。但仍有选项预检/错误提示缺陷，不作为完整结案；不能因开发方便未经确认采用此身份。

**代码变更（完整闭环需要，尚未写）**：

1. 复用一个服务端解析/就绪校验器，按权威产品、grade、spec解析唯一ACTIVE SKU，验证三者存在/有效；Terminal新输出在现有JSON中携带productCode/skuCode/specId。前端加载被允许的实际SKU组合，名称只展示，缺组合说明阻断原因并指向主数据中心；不在作业台创建主数据。
2. `packing/submit` 同一事务校验组合就绪，确认入库再校验，防止包装后主数据失效。不能只有前端过滤。无效规格、0条/多条SKU分别返回稳定错误码和业务可读信息（等级、规格、单号），不向普通用户暴露SQL或内部栈。
3. 旧33缺productCode/skuCode但有grade/spec：获批后，只在该grade/spec可唯一解析到已确认权威产品的SKU时作兼容解析，再按完整三元组复核；多产品/多SKU候选必须拒绝并另报映射，不凭命名猜测、不修改33原batches/数量/来源。方案审批须明确认可这一legacy策略。
4. BFF保留结构化原始异常日志并落现有错误记录通道：packing/shift/requestId/userId、阶段、业务错误码、SQLSTATE（有则记录）。库存事务外独立记失败审计，避免随回滚丢失；正文不记录token、手机号或全请求payload。API返回明确失败状态，Web保留可重试页面；既有committed与本次失败分开，不能catch后覆盖成本次成功。
5. 交接日期由锁定包装/班次权威业务日期规范化，拒绝不一致输入；保留已部署DATE修复。库存地点在事务内复核ACTIVE仓库、有效库位、公司/场站关系及调用人DataScope；公司来自权威归属，不能让body.companyCode覆盖成另一公司。保留现有MenuGuard、来源鸡舍归属检查。

**Schema：直接根因不需要迁移。** 新输出字段可用现有JSON承载，日志用既有表。产品/SKU补录属于业务主数据写入，不能伪装成schema迁移。若另批准增加handover唯一约束或批次编号序列，先全量只读审计重复/历史合法性，独立TS migration及down、约束末态核对；本轮没有足够证据批准该DDL，更不能顺手清重。完整P0可先保留现有锁，不以此潜在DDL为恢复前提。

**配置：本次不需要修改inv_source_mode、场站、仓库或库位配置**；不重做9月9日切换。GRADE_3/4礼盒缺口先通过就绪选项阻断，不自动批量建SKU。

### 7.2 原子性、幂等与保护不退让

- 保持同manager事务贯穿：固定锁顺序全局real→packing→必要行锁；所有库存batch、ledger、handover同事务。先解析并冻结全部产出组，然后写；任一组失败，全部回滚。不可移动库存写入到事务外。
- 在锁内对既有handover、预期逐SKU/规格产出、batch总量/分组、ledger入账总量、公司/仓库/库位作完整比较。完整一致返回原结果；部分/冲突失败关闭，列差额，禁止自动补余或再插一份。已有多handover拒绝自动挑一行，需独立处置。
- 不以当前available替代入库原量做幂等，已发生合法销售的qty_available可以小于qty；比较原qty与入库流水，另核验后续动作。
- VOID、测试链、模式不一致、失效来源全部保持拒绝；真实与test双向不可消费。test记录即使SKU齐全也永不交接入库。旧无links的未入库包装不得借修SKU进入旁路；完整已入账历史单的“只读原结果”与新写入分支区分，维持VOID/test拒绝。
- 33来自已关闭班次，不能为补账重开或新建班次；只允许获批原包装入库、保留原日期。若新增一致性门禁发现其他来源/数量问题，停止另报，不删引用凑余量。
- **同舍每班可多次采集继续保留**：稳定幂等键只去重同一请求，不增加house+shift唯一约束，不合并不同采集批次。

### 7.3 测试矩阵（实施后的验收要求，非本轮已通过声明）

| 场景 | 必须断言 |
|---|---|
| 真实GRADE_5礼盒就绪 | 同一源单30枚→1批次/30入库流水/1交接，SKU/spec/公司/仓位/日期正确 |
| 当前缺SKU；重复ACTIVE；规格缺失/失效；产品失效 | 明确错误码；包装预检阻断或确认失败；0新增库存/流水/交接 |
| 多产出组，第二组失败/ledger INSERT失败/handover失败 | 独立PG18真实事务全回滚；没有第一组残留 |
| real/test双向、伪造body is_test、非管理员test | 权限拒绝；test完整链也不能入库；真实列表不出现test OPEN班次 |
| VOID packing/source/grading与正常旧无links | 均按保护策略阻断新消费；不存在偷偷fallback写入 |
| 已有完整批次/交接；已消耗库存；重复同请求 | 原ID不变、无新增；原qty/入库流水对平，不以available判断重建 |
| 已有部分批次、缺ledger、地点/公司冲突、多交接 | 失败关闭，不自动补余，不被status覆盖成成功 |
| 同包装并发确认；确认与VOID竞争；异包装及其他入库入口并发 | 最多一组账；没有死锁/编号冲突造成半账；所有连接真实PG测试 |
| DATE字符串/驱动Date、跨UTC/业务日、旧日/已关闭班次、非法日 | 业务日期不被浏览器今日覆盖；非法日明确拒绝 |
| 受限用户/异公司仓位/伪造companyCode | 保持DataScope，越权失败0写入；正常范围成功 |
| 同舍同班两次独立采集+同key重试 | 独立采集分别保留；同key仅返回原记录 |
| 旧GRADE_1/2礼盒、TEMP模式已有/缺失上游证据 | 既有行为不退化；TEMP不双写，缺上游不假成功 |

PG集成只在独立本地/CI隔离库构造fixture，禁止复制真实库作为可写测试库。当前本地30项Jest和GET都不能替代上述矩阵。

### 7.4 CI、发布、受控生产验收与回滚

1. 获批后单独实施分支，完成代码、三语错误文案及测试。API/Web tsc、定向与全量测试、真实PG18事务/并发、scope-audit、nullable/constraint drift、migration down/DML门禁全部跑；若无migration明确标N/A。现有失败必须解释，不修改门禁放过。
2. 独立复核最终diff；按冻结/安全规则完成review标签。所有适用PR CI绿后合并；**另行显式full deploy**，不把main build当部署。记录CI、full deploy run与迁移末态；检查checkout/API/Web三端同一批准SHA、健康和GET基本可见性。
3. 发布后先只读preflight：锁定待批产品/SKU实际code、状态与唯一性，重读33完整载荷/数量/来源links/日期/真实标记/归属；实际库存仍0、ledger0、handover0；用户确认实物30枚、扫描1箱、实际接收人与授权库位。任一漂移即停。
4. **只有另行获批生产写入后**，对33执行一次受控 `warehouse/confirm`，保存脱敏请求、状态码、响应、操作人、时间、源ID与实际生成ID。立即只读核对batch/ledger/handover及业务读取数量、SKU、日期、仓位；若失败，停，不盲重试/删数据。
5. 如批准幂等重放验收，再提交同一个已成功请求一次，断言ID和数量不变；此POST也要在批准范围内。不得通过另建测试来源验证；不得用34的H-DEBUG链充当该验收。不启动旧历史清理或旧生产冒烟计划。
6. 应用回滚用新部署回到已知SHA **492ba3c3**，保留PR228 VOID/test schema；禁止退到保护前版本、不做schema down来绕门禁、不改历史。新SKU创建后若还未使用，按获批主数据停用流程退回；已入账不得删除SKU或库存，先禁后续动作并对账，经另批逆向业务处理。已成功入账33不能通过部署回滚“撤销”，必须保留其台账与审计。

## 8. 精确待授权清单与未知项

| 待授权对象 | 当前数值/状态 | 拟写范围（现在不执行） |
|---|---|---|
| 5号蛋权威产品身份 | 两种现有字符串在已查产品表均未返回记录；补录前逐表计数复核 | 业务选定/建立产品主数据；实际code未定，不擅自命名 |
| 5号蛋30枚精品礼盒SKU | GRADE_5+PKG_PACK_SPEC_3全产品0行 | 仅获批权威产品的一条SKU及必要产品记录；平台生成code；不改七个其他规格SKU |
| 包装33 / PKG-20260910-163616 / shift56 | 原包装30枚1盒，handover0/batch0/ledger0 | 获批后走业务入口新增30枚原始入库；预计1batch+1ledger+1handover，实际ID运行时留档；不UPDATE源包装/分级/来源 |
| 代码方案§7 | 运行时代码本轮0改动 | 组合就绪/权威SKU契约、错误可见性、事务内完整幂等与归属校验 |
| 发布及生产验收 | 本轮0 deploy、0 POST | 分别批准full deploy、一次33确认、可选一次同请求幂等重放 |

**不在本轮实施清单内**：旧12行清理、包装21/25/26/27/28及交接17/20/21/22/23、新H-DEBUG source50→grading81→packing34→handover27→batch2951/ledger297处置、GRADE_3/4主数据补录、全库产品身份治理、handover唯一约束和编号序列治理。任何这些动作需单独方案与明确授权。

未知必须保留：失败POST认证操作者、失败请求精确库位/接收人/箱码、实际实物与5号蛋产品身份业务认定；没有PG回滚原始日志；未执行生产成功重试；没有证明所有历史包装都可幂等或无污染。日志已定位的异常与缺SKU事实均为已证，不因这些未知而改称猜测。

授权停止点来自用户本轮明确要求“只核查，主agent复核，用户授权后才实施”，不是技能或自动审批阻断。**主 agent 已完成证据复核，以上方案等待用户批准；没有将紧急问题解释为修复授权。**
