# 主数据治理阶段 2：统一产品 / SKU 写入（2026-11-10）

基线：阶段 1 提交 `6268402572b94ff57032d1f39db0410084dabcce`；分支 `codex/master-data-governance-20261110`。仅在指定隔离工作树执行；无 schema/entity/dict 变更、无迁移、无数据库连接、无部署或推送。未修改协调记录、前端页面和共享依赖。

## 1. 审计与写入收口

审计范围：`apps/api/src/` 的 SQL 表名命中、模块配置动态写入、实体与 ORM 写入调用，另核对冻结 SQL 和 TS 迁移。使用 `rg -n -i '(insert into|update|delete from)...(product_skus|mst_products)'`，并完整检查所有表名命中上下文、Runtime 的 TYPES 与 CRUD controller/service。以下为源码事实，不是数据库实查结论。

| 入口 | 本阶段结果及证据（相对 `apps/api/src/`） |
| --- | --- |
| Runtime create/createQuick/update/transition | 全部委托 `SkuWriter`，`modules/master-data/master-data-runtime.service.ts:622,654,721,803`；删除原 SKU 通用校验配置与独立 SQL，避免维护第二套规则 |
| `/api/product-master/skus` 创建/编辑 | `ProductMasterService.createSku/updateSku` 仅兼容转接 Runtime，保留原响应形状，`modules/product-master/services/product-master.service.ts:259`；不再复制写 SQL |
| 通用 CRUD | `mst_products/product_skus` 的 POST、两种 PUT、两种 DELETE 均拒绝；controller 在管理员旁路之前阻断，service 首行再次拒绝，`modules/generic-crud/generic-crud.controller.ts:79`，`generic-crud.service.ts:520,562,609` |
| 好业财已审核候选创建 | 改用内部 `SkuWriter.createApproved`，仍在既有 QueryRunner 审核事务内；保留已确认来源编码/名称、映射核验和幂等契约，`modules/chanjet/chanjet-erp-master-business-review.service.ts:1542` |
| 包装固定原料补建 | `ProductPolicy.ensureRawEggProduct` 只允许固定 `PRD-EGG-RAW`，随 `completeShift` 原事务提交，`modules/terminal/packaging.service.ts:182`；不再事务外 INSERT 并吞错 |
| 产品普通建档/编辑 | 继续由既有产品 Runtime 的白名单、自动编码、校验和审计管理。本阶段不重构其他产品生命周期，也未开放专用产品任意写接口 |

最终逐行字面 SQL 扫描：`product_skus` 仅 **3** 处写入，全部在 `sku-writer.ts`（insert、update、transition）；`mst_products` 仅 **1** 处字面写入，在受控 `product-policy.ts`。此外产品 Runtime 的配置驱动 SQL仍存在，属于预期权威入口；通用 CRUD 的动态写入已在 controller/service 双层封堵。`bff/packaging-history.fixture.ts` 的两处建档 SQL 是测试夹具，未找到非 `.spec.ts` 调用方；未计入运行时入口。扫描未发现这两表对应的 ORM entity 写入。

## 2. 统一领域规则与兼容边界

实现：`modules/product-master/services/sku-writer.ts`。它是普通领域类，使用调用者的事务管理器；没有新增 Nest module 相互导入。原 `ProductMasterModule → MasterDataCenterModule` 方向保持不变，Runtime 不依赖 ProductMasterService。

| 项目 | 统一规则 |
| --- | --- |
| 必填与身份 | 三键均为非空字符串，显式首尾空格拒绝，不能静默变成另一编码。已有 `sku_code` 保持原值 |
| 自动编码 | 公共新增一律使用 `CodeGeneratorService.next('SKU', manager)`；序列、SKU、审计在同一事务。任何显式 `sku_code`（含空串/null）均 400，并提示省略；不再忽略输入，也不再生成含产品/等级/规格语义的编码 |
| 编辑编码 | 允许重传当前编码；不同编码、null、空串均 400。不会重编码存量 SKU |
| 三键唯一 | 产品/等级/规格组合全状态查重，包括 ARCHIVED；数据库唯一约束并发冲突转 409。无新增 schema |
| 条码 | 可空，空白归一为 NULL；非空须 1–64 位可打印 ASCII 且不含内部空格；64 与冻结 `product_skus.barcode VARCHAR(64)` 对齐。全状态查重，并用事务 advisory lock 串行同条码认领；未加数据库唯一索引 |
| 引用 | 新建、改变三键、恢复/提交为 ACTIVE 时，对父产品/等级/规格要求存在且 ACTIVE，在同一事务 `FOR SHARE`；异常直接失败，不吞掉查询错误 |
| 历史描述维护 | 不改身份的名称/备注等编辑，不因父档案后来被冻结或移除而拒绝；不强迫改写历史身份。真正改变三键仍复用阶段 1 的 `SkuPolicy.assertIdentityChange` |
| 名称 | 新建/变更身份时 `product_name` 从父产品权威带出；允许空的兼容回传，显式非空错误名称拒绝。显式合法 `sku_name` 保留；未提供时派生 `产品名 (等级 / 规格)`。显式空名拒绝。现有页面要求填写名称的完整 payload 已通过测试，无需用户手算隐藏公式 |
| 名称唯一性 | **名称可重复**；身份唯一由三键决定，非空条码另行唯一。原 Runtime 曾额外按 sku_name 查重，本阶段移除此额外规则，与旧接口统一。可改描述名称与多语言名称；限制按既有列长，未降 lint 规则或加 suppression |
| 日期 | YYYY-MM-DD 严格日历合法性，拒绝 2 月 30 日、无效月份、反向区间；空值转 NULL。同一天的数据库 Date 与字符串重传不误判为修改。ACTIVE 与是否处于生效期仍分开，消费者继续使用原日期窗口 |
| 状态 | 公共新增只能省略状态或显式 ACTIVE；编辑只能省略或回传当前状态，其他输入明确 400，请使用 Runtime transition。生命周期仍按原 submit/approve/reject/freeze/archive/restore 前态集合流转，在事务内锁行；激活检查引用、日期等，归档用严格引用保护，审计和状态同事务 |
| 审计 | 新增、真实编辑、生命周期、审核导入与固定原料首次初始化均写 `mst_audit_trail`；新域写入要求审计同事务成功，否则整体回滚。`MasterDataAuditService.log` 的其他历史调用仍保留原非阻断语义 |

`SkuPolicy.assertUnreferenced` 由原身份保护提取，也供 SKU 归档使用。原身份行锁、两次引用探测、NOWAIT 表锁、超时和失败拒绝策略保持；不是通过 UI 引用计数判断安全。

## 3. 权限与 DataScope 覆盖

`common/guards/sku-access.guard.ts` 定义唯一、显式的权限兼容规则，旧入口与 Runtime 共同使用：

| 操作 | 新菜单 | 旧菜单兼容 |
| --- | --- | --- |
| 创建 | `MENU_MD_SKU:C` | `MENU_MASTER_SKU:E`（旧接口原来用 E 创建，明确保留这一映射） |
| 编辑 / 生命周期 | `MENU_MD_SKU:E` | `MENU_MASTER_SKU:E` |
| 管理读取 | `MENU_MD_SKU:V` | `MENU_MASTER_SKU:V` |

不把 C/E/V 互相推导；其他主数据或销售菜单不能获得 SKU 写权。注册菜单检查与 ROLE_ADMIN / 通配权限沿用现有规则。

业务 `GET /api/product-master/skus` 默认或显式 `status=ACTIVE` 按现有 lookup 约定允许已登录用户读取，仍经过 ACTIVE + 生效期过滤，因此普通销售选择器不需要主数据编辑权。非 ACTIVE 列表与 detail 需要显式 SKU 查看权。通用 CRUD 读保留产品原权限，SKU 增补上述新/旧查看码映射，不放开销售用户的通用管理查询。

SKU/等级/规格/产品是全局共享主数据；本阶段未增加公司维度，未改变业务交易的公司/仓库隔离。相关销售跨公司拒绝、Runtime 公司范围、CRUD/WMS/退货范围单测实际同跑通过。**管理员仍无法通用 CRUD 写产品或 SKU**，测试覆盖 `permissions=['*']`、`username=admin/ROLE_ADMIN`、显式 C/E/D 权限，以及直接 service 调用。

## 4. 其他运行时入口的具体处理

### 好业财审核

`createApproved` 仅由审核服务内部调用，不暴露公共 HTTP 任意编码入口。来源 `CJ-EGG-<hash>` 编码及审核确认的名称保持原样；它复用 prepare、insert、事务审计，不再在审核 service 内写 SKU INSERT。按已确认编码取得事务 advisory lock：已有同编码时核对三键、名称和 ACTIVE，完全一致才视为幂等，否则 409；新建复用 ACTIVE 三引用、三键/条码等规则。与原映射更新、assertTarget、操作日志仍同一 QueryRunner 提交。

候选历史上使用 `EGG / CJ_G1 / CJ_RED_STD` 等推断码，但仓库内未找到这些 CJ 等级/规格的实际建档路径。本阶段**不推断并自动生成这些父主档**。`plan()` 在授权前检查 ACTIVE 引用，缺失则将候选标 HOLD，并列精确阻断，例如：

- `SKU_ACTIVE_REFERENCE_REQUIRED:product_code=EGG`
- `SKU_ACTIVE_REFERENCE_REQUIRED:grade_code=CJ_G1`
- `SKU_ACTIVE_REFERENCE_REQUIRED:spec_code=CJ_RED_STD`

引用查询不可用则 `SKU_REFERENCE_CHECK_UNAVAILABLE`，不会误报 READY。后续业务需先确认这些维度是否应映射现有等级/规格，或通过主数据中心正式建档并启用，再重新生成审核计划/hash；不需要也没有在此阶段连接生产库。apply 仍在事务内重新核验，防止 plan 后父档停用。

### 包装固定原料

受控方法只确保固定编码，不接受任意产品字段。若不存在，使用原鲜蛋名称、枚单位、7 天保质及零价格建档，并补齐 Runtime 使用的 product_name；若已存在，要求单条 ACTIVE，已声明的基础单位必须为枚。允许经过治理的名称变化，不覆盖既有名称、不重新启用停用主档。以固定编码 advisory lock 避免并发重复补建。

原先补建在班次事务之外，任何错误静默忽略；现在补建、审计失败会让整个班次失败，沿用 completeShift 原有 `{code:500,msg}` 错误封装，班次/库存尚未开始写入。包装库存模型、数量换算和新实物 SKU 不在本阶段范围，未更改。

## 5. 实际验证

环境 Node **20.20.2**（PATH 显式置前）；直接执行现有 CLI，无依赖安装/版本变更，无 `.env` 或凭据读取。

| 检查 | 实际结果 |
| --- | --- |
| 相关 API Jest | **16 suites，306/306 通过**，退出 0；最终结果写入工作树忽略目录 `tmp/phase2-jest.json`，不提交 |
| API tsc | **退出 0，0 errors**：`node apps/api/node_modules/typescript/bin/tsc --project apps/api/tsconfig.json --noEmit --incremental false` |
| Web tsc | **退出 0，0 errors**：同样执行 Web project CLI（本阶段 Web 文件改动 0） |
| 修改文件 ESLint | **22 个 TS 文件，0 errors / 167 warnings，退出 0**；包括既有 any 与测试替身；无 suppression 或降级规则，JSON 在忽略目录 tmp，不提交 |
| 字段审计 | 两个现有页面（SKU 管理与 sales2/orders）按 `<input[^>]*(product_code\|grade_code\|spec_code\|skuCode)` 实际扫描各 **0**；另人工核对 SKU 页面 fields 配置，仍有 product_code/grade_code/spec_code 三个文本配置，明确交阶段 3，未把窄正则 0 当作选择器改造完成 |
| 引用/写入口审计 | 最终字面运行时写入 3 处 SKU / 1 处产品，分别集中在 SkuWriter/ProductPolicy；另人工追踪 Runtime 配置驱动写入与通用 CRUD 双层封堵，读取扫描范围内所有其他写表命中 |
| Nest 依赖 | 独立测试编译真实 ProductMasterModule → MasterDataCenterModule，实际解析 ProductMasterService/Runtime/CodeGen/Audit/controllers/guards；仅以替身替换 DB、CLS、DataScope 与审批外部依赖，零数据库连接。两轮只读独立 reviewer 核对模块方向及写入/权限边界，第二轮无阻塞问题 |
| Diff | `git diff --check` 通过；逐项 review，未更改 schema/entity/dict/锁文件/依赖目录/协调报告 |

测试具体覆盖：三创建入口同规则、两编辑入口同规则、三引用各自缺失/冻结/归档、归档组合与条码冲突、数据库 23505、合法/非法日期、存量编码不变、显式编码/状态不静默忽略、当前页面完整 payload、自定义名和默认派生名、停用父档下历史描述、日期值比较、原身份保护失败路径、生命周期激活/归档、审计失败整体回滚、审核来源身份幂等与错配、真实审核 service 委托、缺维度计划 HOLD、固定产品单位/状态/审计，以及包装在班次写入前调用受控方法。

16 个套件：`sku-access.guard`、`master-data-type.guard`、`product-master.module`、`sku-writer`、`sku-policy`、`master-data-runtime.service`、`master-data-references.service`、`generic-crud.service`、`generic-crud.controller`、`lookup.controller`、`sales-orders.service`、`sales-order.dto`、`return-orders.scope`、`chanjet-erp-master-business-review.service`、`packaging.controller`、`packaging.product-policy`（各 `.spec.ts`）。

未执行：真实 PostgreSQL 并发/锁/advisory lock/回滚集成检查、需要运行 API 和测试账号的完整 `apps/api/test/scope-audit.sh`、全量 API/Web 测试、构建或生产检查。本地行为测试中的回滚由接口替身模拟，只证明调用在同一事务及异常传播，不能替代实际 PostgreSQL 隔离语义验证。

## 6. 八题交付答复与剩余项

1. **两入口规则是否统一？** 是；旧专用写接口仅委托 Runtime，Runtime 所有 SKU 写方法进入 SkuWriter，只有一个 SKU INSERT 和 UPDATE 实现。createQuick 同样复用。
2. **旧编码和状态输入怎样兼容？** 现存编码不改；公共新增显式编码拒绝，编辑只允许回传自身编码；新增 ACTIVE、编辑同状态可回传，真正变更必须 lifecycle。已分别测试。
3. **必填/唯一/条码/父引用/日期是否严格？** 是；三键必填、全状态组合及非空条码查重、64 位条码列宽对齐、创建/换身份/激活要求 ACTIVE 三引用、合法日历及区间；SQL 错误不再吞掉。
4. **原身份保护与审计保留了吗？** 原 SkuPolicy 行锁和引用防护复用并回归通过；新域写入审计增强为同事务、失败回滚，归档也使用严格引用探测。
5. **管理员能否走通用 CRUD 绕过？销售能否读取？** 管理员两层拒绝，全部通用写路由测试证明；销售 JWT 可查 ACTIVE 生效期列表，管理读和写仍分别校验 V/C/E。
6. **其他运行时写入口是否只列未改？** 好业财和包装均实际改为受控方法。好业财保留已确认来源身份并新增前置 HOLD；包装原料补建纳入班次事务；无此两处遗留直接写旁路。
7. **验证是否真实，是否存在循环？** 16/306、双端 tsc、22 文件 lint、字段/引用审计均实际执行。真实 Nest 装配及两轮独立核验未发现新循环。数据库集成和全量 scope-audit 未执行，明确如上。
8. **阶段边界和后续工作？** 阶段 3 处理 SKU/产品页面选择器与名称默认展示，以及非销售消费者的可用性/共享锁；阶段 5 处理同一商品托/箱数量换算，本阶段没有继续生成包装实物 SKU。好业财 CJ 维度需业务确认后建档或映射，不能因本阶段自动发明。阶段 1 对全域首次业务引用并发原子性、元数据权限和广表短锁的限制仍存在，发布前需隔离 PostgreSQL 集成核验；本阶段不宣称解决全消费者竞争。

额外边界：条码唯一依赖所有运行时创建/编辑统一进入本领域并遵守 advisory lock，尚无 DB unique index；运维脚本/人工 DB 写入不在该保证内。已存在的条码重复/脏引用未扫描生产、未回填；触碰相关字段或激活会拒绝冲突，历史名称/备注不因父档停用而被锁死。固定原料若状态/单位错误会导致班次显式失败，需在主数据中心治理后重试。

## 7. 提交清单

22 个 API TS 文件（领域写入/固定产品策略、两入口与权限适配、CRUD 双层封堵、审核/包装接入、编码/审计事务接口及行为测试），加本报告。仅显式 stage 这 23 个文件；提交 `fix: unify sku master data writes`。不提交 node_modules 符号链接、tmp 检查输出、协调记录或其他阶段工作。
