# 主数据治理阶段 3：统一 SKU 关联选择与交易可用性（2026-11-10）

基线：阶段 2 `8f33860a4f51c206413a4d19ff0417d078002df2`；分支 `codex/master-data-governance-20261110`。仅在指定隔离工作树修改并本地验证，没有连接生产数据库、推送或部署；未改协调记录、依赖目录、版本声明、entity、schema 或字典。托/箱数量换算与库存单位模型保留给阶段 5，本阶段保留 SKU/spec 接口与旧身份。

## 1. 表单与权限审计及改造

SKU 管理页原先的三个关联编码均为 Runtime 文本字段，产品名称也可编辑。现在配置独立于 Next page，位于 `apps/web/src/components/master-data/sku-fields.ts`，供后续阶段复用。`MasterDataRuntimePanel.MdField` 增加 product/grade/spec 类型及原子 referenceUpdate 支持。

| 字段 | 最终行为 |
| --- | --- |
| product_code / grade_code / spec_code | 分别使用共享 ProductSelector / GradeSelector / SpecSelector；只能选择启用主数据，无自由编码输入 |
| product_name | 选择产品后权威带出，readonly + muted 背景 + not-allowed 光标；原子更新避免 code/name 回调顺序污染 |
| sku_name | 三维齐备时默认 `产品名 (等级编码 / 规格编码)`，与 SkuWriter 派生规则一致；只有空名称或此前自动名称随选择更新，明确自定义名称保留；用户仍可修改并受后端合法性规则校验 |
| 历史旧值 | 不在启用选项中的当前编码保留为 disabled 的“历史值或当前不可用”选项；已有名称保持，不为展示查询或重新启用停用主档 |
| 空列表 / 查询失败 | 分别显示“暂无启用…”与“…加载失败，请重试”；失败不清除当前编码和名称 |

父档业务读取改用 `/api/lookup/products`、`product-grades`、`packaging-specs`，返回最小启用字段，不再调用等级/规格管理接口。它们沿用 JWT MenuGuard，不声明主数据管理菜单；HTTP 测试证明普通销售角色、无管理权限仍返回 200，未登录返回 401。SKU ACTIVE 查询仍沿用阶段 2 的 SKU 读取授权，业务引用不要求产品或 SKU 编辑菜单。管理非 ACTIVE/detail 读取和主档写入权限未放开。

这三个关联下拉与库存品目下拉不缓存当前可用性；共享 SkuSelector 请求携带 usage。销售订单使用 sale，门店补货使用 sale-stock，库存页使用 stock；CrudForm 的 skuUsage 可配置，库存表单默认 stock。退货继续保留原历史兼容用途，不把已停用原始销售身份过滤掉。

## 2. 唯一交易规则与事务边界

`apps/api/src/modules/product-master/services/sku-policy.ts` 提供 fresh selection 的 usableSql 与写事务的 requireUsable：

- SKU 必须存在且 ACTIVE，数据库 CURRENT_DATE 落在包含两个端点的生效期内；空日期不限制。
- 父产品、等级、规格均必须存在且 ACTIVE。
- any 为通用引用；sale 要求等级 is_saleable=true；stock 要求 is_storable=true；sale-stock 同时要求两者。usage 非法值在 HTTP 层拒绝。
- 显式 NULL、空串、空白、非字符串、首尾空格编码拒绝。仅真正省略 SKU 的既有旧业务路径继续兼容，不把显式无效编码改成 NULL、跳过导入项或退回产品路径。
- requireUsable 按 SKU → 产品 → 等级 → 规格顺序，使用调用者的同一事务 manager 对精确编码行 FOR SHARE；提交前保持锁。查询失败直接失败。读取后的三键才参与价格解析、批次及交易写入。规格基础单位随锁后结果返回，WMS 保留非蛋 SKU 的 kg 等单位，不统一退成“枚”。

新交易校验没有增加业务表或全数据库锁。阶段 1 在“无引用 SKU 身份变更”上的原引用探测及短表锁仍保留，未扩大其范围；其既有运维及元数据权限限制仍适用。

| 新交易入口 | 本阶段接入 |
| --- | --- |
| 销售创建 / 编辑 | 原写事务 requireUsable(sale)，权威带出三键；历史详情名称子查询不增加状态条件 |
| 价格项新增 / 批量导入 / 复制 | 解析与写入同一事务，sale；批量导入无效 SKU 明确失败，复制是新价格项写入，重新核验来源 SKU；已有价格项浏览保留历史 |
| 价格解析 / 校价 | 只读解析用相同 SQL；交易 manager 调用时锁定核验；显式无效 SKU 在旧价格回退前失败，validatePrice 不吞此类异常；无 SKU 的旧定价规则保留 |
| 生产 / 包装批次 | EggInventory.createProductionBatch 在原事务 stock 校验；无 manager 时先进入自身事务；SKU 权威三键覆盖请求值 |
| 销售库存预占 / 正式出库 | FIFO 选 SKU 和选中批次均做 sale-stock 校验；分配/预占/出库无外部 manager 时使用事务；释放、退货、报废等逆向或处置动作保留旧身份 |
| WMS 入库 / 采购收货 / 出库 | resolveInventoryItem 使用原库存写事务 stock；销售出库再用 sale-stock；旧产品输入若精确命中 SKU，也必须校验，不能将停用 SKU 降回旧产品；显式 SKU 编码优先于其他编码且强制 SKU 类型 |
| WMS 调拨 | 创建、发运与签收目标批次写入分别在自身事务重检 stock；使用批次已有身份，不更换历史三键 |
| 包装解析与交接 | 保留 one() 对 ACTIVE 单一候选的缺失/歧义、可售/可库存、规格数量校验，补齐日期；先无锁解析候选，随后 SKU→父档加锁并复核三键，锁后重读规格数量，避免父档→SKU 的反向锁顺序 |
| 临时生产入库 | SKU 候选选择、SKU/父档共享锁、写批次使用同一个事务；候选用 stock 及日期过滤，仍拒绝多义组合 |
| 门店 POS | 商品列表 sale-stock；创建在写事务校验并权威带出身份，付款 FIFO 重新核验，不能拿旧价格快照绕过可用性 |
| 门店补货 | 申请事务对每条 SKU 做 sale-stock 校验，名称从 SKU 带出；后续库存调拨依上述 WMS 规则 |
| 好业财新映射 | WMS 候选用 stock，SKU 手动/自动映射保存及 SKU 单位政策审批在保存事务内重检；业务主档审核候选用 any，assertTarget 在同一 QueryRunner.manager 内核验。旧映射读取不删除、不回填 |

临时生产日报重放先锁定日报维度，再核对已有批次的来源、仓库、库位、档位、规格和数量，匹配后返回原批次，不依赖主档今天是否仍可用。输入未提供规格时沿用原规范化默认 LOOSE；没有新增“省略规格任意推断”的业务规则。仅真正新增入库才解析当前可用主档。

## 3. 历史与兼容调用扫描

扫描整个 `apps/api/src/modules` 的 product_skus、sku_code/skuCode 与 item_code 命中，并逐段区分读取、写入和主档治理。以下路径不应套 fresh selection 过滤，保留现有数据：

| 用途 | 证据路径与符号（相对 apps/api/src/modules） |
| --- | --- |
| 销售 / 退货详情名称 | sales-v2/services/sales-orders.service.ts 的明细名称子查询；return-orders.service.ts 的详情/打印名称子查询 |
| 历史价格项清单 | sales-v2/services/price-items.service.ts:listItems；复制进入新册才重新校验 |
| 批次、库存账、临期查询 | egg-inventory.service.ts:getAvailableBatches/getExpiringBatches、wms.service.ts 的库存列表、store-inventory-query.service.ts；没有通过 ACTIVE INNER JOIN 消除旧库存 |
| 历史调拨 / 补货展示 | store-replenishment.service.ts:transferDetail 的 SKU LEFT JOIN、已存申请名称 |
| 采购收货详情 | procurement-v2/services/receipts.service.ts:findById 的 SKU 名称补齐，无状态过滤；收货确认的库存写入则调用 wms.inboundFromReceipt(mgr) |
| 原销售退货 / 库存释放 / 报废 | store-pos.service.ts:returnSale、egg-inventory.service.ts:processReturnInventory/releaseInventory/markExpiredBatches，保留原身份，不能因冻结阻止必要逆向/处置 |
| 旧 WMS、通用管理展示 | generic-crud.service.ts 的库存及 WMS LEFT JOIN、主数据管理 list/get、references/operations/data-quality 查询 |
| 包装历史与幂等证据 | 包装历史 JSON、已有库存/流水比对继续引用原编码；本阶段未改写这些记录。新的包装产出或交接仍必须使用可用主档 |
| 集成治理 | 好业财旧映射和只读快照继续展示历史；新候选和新批准目标按上述规则核验 |

真正省略 SKU 的旧 product/grade/spec 交易接口仍兼容。采购订单/申请的 item_code 查物料主档，收货草稿只保留品目；确认收货进入 WMS 后才执行库存 SKU 校验。无类型的 SKU/物料编码碰撞仍沿用原优先级，明确 SKU 类型或明确 SKU 字段不会降级成物料。测试夹具和主档健康/引用扫描不属于新的业务可选项。

## 4. 字段、scope 与单测核验

真实窄正则审计范围：SKU 管理 page、独立 sku-fields 配置、共享 RuntimePanel 三文件。`<input[^>]*(product_code|grade_code|spec_code)` 每文件均为 0；`onChange[^\n]*e\.target\.value[^\n]*(product_code|grade_code|spec_code)` 合计 0。另实际读取配置，确认三种 product/grade/spec selector、product_name readonly、page 使用 skuFields(t)。未把窄正则 0 当作全站无裸字段证明。

9 个 SKU 业务字段中，3 个关联选择、1 个只读产品名称、1 个可编辑 SKU 名称、1 个条码、2 个日期、1 个备注；Runtime 原有两个多语言名称字段继续自动追加。没有新增字典类型或硬编码业务字典选项。

真实行为测试覆盖：三父档各自缺失/冻结/归档、SKU 停用/未来/过期与当天双端点、sale/stock 独立适用、SKU→父档精确行锁顺序、价格新增/批量/复制失败、显式无效码不降级、POS 在价格回退前拒绝、补货权威带名、非蛋库存单位、包装日期/歧义/锁序、历史读取保留、日报旧记录重放、父档 lookup 无管理权限，以及真实渲染的选择器自动带名、默认名、自定义名、历史值、失败/空状态。

DataScope 未新增公司维度。父档与 SKU 是全局主数据；业务原公司/仓库/门店隔离保持。销售跨公司拒绝、Runtime/通用 CRUD/lookup、WMS/退货、门店补货范围测试同跑。未运行需要启动 API 与真实测试账号的完整 scope-audit.sh。

## 5. 实际验证结果

使用 Node 20.20.2 和现有依赖 CLI；无版本升级或依赖共享目录修改。

| 检查 | 结果 |
| --- | --- |
| API 相关 Jest | **41 suites，606/606 通过**；另 6 suites / 144 tests 按原有环境开关跳过；退出 0，结果在工作树忽略目录 tmp/phase3-jest-final.json；最后 WMS 显式编码/单位边界收口后另跑 **3 suites，76/76 通过** |
| Web 相关 Vitest | **10 files，56/56 通过**；从 apps/web 工作目录运行，包含 SKU 表单、共享选择器、销售页、库存名称、补货和 selector-pick |
| API / Web tsc | **两端退出 0，0 errors**；分别以现有 TypeScript CLI 执行 --noEmit --incremental false |
| 修改 API 文件 ESLint | **27 TS files，0 errors / 445 warnings，退出 0**；包括既有 any 与测试替身告警 |
| 修改 Web 文件 ESLint | **10 TS/TSX files，113 errors / 15 warnings**，直接 lint 退出 1（既有债务）；两个新增文件 0 errors，changed/ratchet 实际通过 |
| Web changed | **PASS**，修改文件相对基线无债务增长；仍有既有 lint debt，未声称 zero-error |
| Web ratchet | **PASS**，823 errors / 475 warnings / 197 error files；未更新 baseline、放宽规则或增加 suppression |
| 字段审计 / Diff | 上述 3 文件配置和窄正则实际执行；git diff --check 通过 |
| 独立只读核验 | 两轮 reviewer 完成，第二轮未发现新的阻塞问题；额外 scout 完成全 modules 消费/历史用途扫描 |
| 协调者 PostgreSQL 18 补验 | **10/10 通过**，临时空库；包括阶段 1 引用/JSONPath/NOWAIT/并发保护，以及三父档共享锁阻止并发冻结、lookup SQL 与 requireUsable 对日期/父状态/用途一致；productionConnected=false。结果对应当前 sku-policy.ts SHA256 `d62740ca2231eb2b54d2f0973eac1185ff6a6e883b4de8a272c7ecad0a36cd76`，已本地比对一致 |

全仓门禁暴露未改出库页 openNew 原有遗漏 setBatchHeader/setBatchItems 两个回调依赖，仅补齐这一个依赖数组后门禁通过，没有扩展页面功能。可选 PostgreSQL 包装/临时生产/门店调拨夹具已补齐日期与真实 ACTIVE 父档以适配统一规则，但本执行会话没有启用这些完整服务集成用例；它们的跳过数量包含在 API 结果中。

## 6. 八题答复与交接边界

1. **编码是否仍可手填？** SKU 管理表单的三关联改为共享选择器；产品名称只读自动带出，SKU 编码仍由阶段 2 领域写入自动生成。
2. **默认名称是否覆盖用户名称？** 只更新空值或此前默认值，保留明确合法名称；UI 默认格式与 SkuWriter 一致。
3. **普通业务用户能否查询？** 父档 lookup 仅认证并返回最小启用字段；SKU 业务查询不依赖产品管理或 SKU 编辑菜单，HTTP/权限回归已验证。
4. **下拉和写入规则是否一致？** 同一 SkuPolicy 提供 SQL 与锁后校验，均检查日期、三父档与适用旗标；写入仍重检，避免选择后冻结的竞态。
5. **显式无效 SKU 是否降级？** 拒绝，不跳过价格导入、不转旧产品或 NULL；旧客户端要省略未选 SKU 字段，显式 null/空串会返回错误。数据库已有 NULL 的历史关联仍按无 SKU 展示/逆向兼容。
6. **是否在同一事务锁住身份？** 上表新交易路径使用自己的 manager，锁到提交；包装锁后复核候选并读取规格数量，临时生产没有事务外身份决定；没有新增业务全表锁。
7. **历史数据是否消失？** 没有给历史 JOIN/详情/账查询加 ACTIVE 过滤；旧编码、名称和日报已有批次仍可显示或重放。新价格复制/新库存交易必须重新核验。
8. **阶段 4/5 是否提前执行？** 没有页面整合或包装模型迁移；字段模块已可复用，SKU/spec 和数量接口保留。好业财候选三维缺主档继续按阶段 2 HOLD，不自动发明父维度。

剩余限制：协调者补验验证了共享策略的 PostgreSQL 行锁与 SQL 规则，不能替代全服务事务链、规模性能或生产发布核验。未执行全量 API/Web 测试、构建、整套服务 PostgreSQL 集成、线上 scope-audit 或生产检查。存量脏引用未扫描生产、未回填；首次触发新交易时会明确拒绝不合规主档。SKU 身份引用保护仍受阶段 1 已列静态元数据/别名范围限制，未声称可发现任意外部语义引用。

## 7. 提交

仅显式 stage 本阶段 API/Web 实现、行为测试、三个可选数据库夹具和本报告，提交 `fix: unify sku references and availability`。不 stage node_modules 符号链接、tmp 输出、协调记录或其他阶段内容。不 push、不部署、不改写历史。
