# 包装历史原单工作流：需求、产品、交互、开发与验收设计

- 日期：2026-09-14（Asia/Singapore）；状态：**D1-C / P0–P4 本地开发、隔离测试与 local commit 已获用户明确批准；排除 P3-E、P5；发布另批**。
- 只读源码基线：`69d89dd44b8e1461d7eaf5193e60c994255aed2c`。本文“现有”仅指该工作区代码；“拟新增/拟修改”均未实施。
- 本次唯一写入：本文件。未改业务代码、创建迁移、创建代理、commit/push/deploy、生产登录/POST/SQL/打印；未读取认证文件或凭据。无本次生产状态或浏览器通过结论。
- 授权门：父级审查本文并完成必要修订后，才向用户询问实施范围批准。此前项目常规授权不覆盖本任务实施；无新批准不得实施。本文件中的 API、迁移和测试是待执行设计，不是执行指令。

## 0. 本次实施授权（覆盖下文历史 design-only 状态）

用户本轮明确批准 D1-C 一次 confirm，P0/P1/P2/P3-M/P4 的本地源码、TypeORM TS 迁移、隔离 TEST fixture、真实测试和 local commit。本文后续“未批准/待决策/仅方案”描述保留为设计历史，不再阻止该范围实施。P3-E 双人 intent/receipt 队列及 P5 TEMP 分配不实施，不新增审批。仅唯一主线程执行，不创建其他代理。

不得 push 任何分支、生产 SSH/SQL/HTTP 登录或 POST、部署/workflow dispatch、生产打印、读取生产认证 artifact、改 secret/生产或 CLI 配置；不 force/reset/amend/清理既有文件、不改全局 git 配置、不绕 hook。生产 flags 不启用；Q 未经设备验收不得发行正式编码，隔离仅明确 TEST fixture。L4 实物缺口不阻塞独立软件实施与本地验收。阶段状态以 implementation 报告及 artifacts/packaging-history-implementation-progress.md 为准，代码存在不等于验收完成。

## 1. 证据、事实、假设和待裁定

### 1.1 证据索引与读取边界

以下路径相对仓库根目录。行号对应上述基线；区间仅帮助定位，不表示整份文件已审计。指定审计报告和 AGENTS.md 已由主线程阅读，关键源码亲自只读复核。没有用旧报告替代本次生产验证。首次批量输出有截断，关键片段已分段补读；使用 rg，未将空输出判为通过。

| 编号 | 精确出处 | 核实事实及设计影响 |
|---|---|---|
| E01 | `docs/ops/packaging33-frontend-workflow-audit.md:7–30,170–172` | 前次审计没有浏览器验收；包装33与版本/运行态分层；trace不是完整详情；401可能静默刷新 |
| E02 | `AGENTS.md:144–180,203–244,263–284,335–342`；`apps/api/src/database/migrations/README.md:38–60` | entity/DB及约束三对齐、主数据与范围、TS迁移、业务seed边界和生产授权。当前任务的design-only约束优先 |
| E03 | `apps/web/src/hooks/useTerminalContext.ts:62–105,108–142,168–179` | 只缓存身份化班次，包装结果内存保存；切班清空。已有generation隔离可借鉴，但不能拿currentShift恢复原单 |
| E04 | `apps/web/src/app/(terminal)/layout.tsx:92,157–177,234–236` | 全屏及hydration控制挂载；按身份/班次key重挂；非OPEN显示未开班，需与历史处理分离 |
| E05 | `apps/web/src/app/(terminal)/terminal/packaging/label-print/page.tsx:126–155,164–204,211–248` | 本地PH码、打印后置日志、本地验码；日期有当天fallback，缺历史持久恢复 |
| E06 | `apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx:30–37,55–118` | BOX当天码、全选等同扫描、状态失败未全面禁用、currentShift及UTC当天提交 |
| E07 | `apps/api/src/modules/bff/bff.controller.ts:1315–1367,1425–1435,1900–1968` | 终端类OP:V，打印E；历史班次context已有；today仅今天；日报无shiftId取最新班次；日志默认PRINTED |
| E08 | 同文件 `2432–2486` | 标签trace SELECT原JSON但不返回；来源按整日聚合，不能充当本单精确来源 |
| E09 | 同文件 `2489–2578` | 状态用交接与库存总量派生，partial提示“可重试”不安全；尚非逐产出全证据判定 |
| E10 | 同文件 `2583–2649` | 原单锁、原日期/班次、箱数、场公司仓范围、来源及事务存在；只核箱数而非服务端箱身份；无交接有库存禁止补余。已有交接仍调用库存生成，HANDOVER_ONLY也须显式统一禁止自动修复 |
| E11 | `apps/api/src/modules/bff/packaging-protection.ts:20–45` | 共用原单锁；ACTIVE/real门禁；库存/交接下游存在时禁止直接VOID，无OPEN限制 |
| E12 | `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts:118–193,262–320,341–388` | 入库已逐SKU/规格检查原qty和ledger；原JSON、原日期；TEMP按场日聚合证据，不足以给多单分配精确归属 |
| E13 | `apps/api/src/modules/bff/packaging-readiness.ts:21–33` | 唯一ACTIVE等级/规格/SKU/产品权威解析；历史缺SKU字段不等于必须回填原单 |
| E14 | `apps/api/src/modules/traceability/traceability.service.ts:25–28,33–62` | SQL失败吞为空；包装基本查询未套公司过滤；库存分支不能保护原单分支 |
| E15 | `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:229–268,273–291,295–332` | UserSelector实际走lookup/users，不应照注释假定/users；store范围不等于仓库接收权限；库位前端ACTIVE/NORMAL与confirm NORMAL/EMPTY/OCCUPIED不一致 |
| E16 | `apps/web/src/app/(admin)/packaging/batch/page.tsx:95–136,268–296`；`apps/web/next.config.ts:24–47` | setStep就称入账；跳不存在的包装标签路由。路由文件枚举也无该页面；分级任务参数不能伪装packingCode |
| E17 | `apps/web/src/components/layout/Sidebar.tsx:102–106,520–525`；`apps/web/src/components/terminal/TerminalNavRail.tsx:34–42` | OP/MGR菜单差异；终端缺历史/待交接入口 |
| E18 | `apps/web/src/lib/packaging-api.ts:55–59,93–130`；`apps/web/src/components/packaging/printLabel.ts:24–56` | inventoryOk简单断言、401重放原请求及登录return丢query；window.print完成/afterprint均非物理出纸证明 |
| E19 | `apps/web/src/app/(admin)/packaging/daily-report/page.tsx:50–81`；`apps/api/src/modules/terminal/packaging.service.ts:849–884`；`packaging.controller.ts:45–55`（同目录） | 后台单班次结果；移动pkg_tasks按completed_at日期，不能与终端原生产日相加 |
| E20 | `apps/api/src/modules/generic-crud/generic-crud.service.ts:1936–1962,1976–1999`；`apps/api/src/database/migrations/1789099201000-ProtectPackagingVoidAndTestIsolation.ts:18–45` | 旧bootstrap交接boxes_json/receiver文本、日志old/new_label_code；原单ACTIVE/VOID CHECK及幂等索引。bootstrap声明不是当前生产schema证明，也不是新增schema落点 |
| E21 | `apps/api/src/common/guards/menu.guard.ts:34–45,75–103`；`apps/api/src/modules/org/services/data-scope.service.ts:25–26,109,325–326` | 支持altMenus OR，方法级元数据覆盖类级；公司/场/仓及权限版本均需纳入新读写策略 |
| E22 | `apps/api/src/modules/bff/packaging-readiness.pg.spec.ts:7–21,67–110` | 有真实PG用例但无环境变量会skip；含CLOSED、并发、第二组流水及交接失败回滚。存在测试不等于本次执行通过 |
| E23 | `apps/api/test/scope-audit.sh:8–24,82–131,163–170,314–331,350–428,434–443`；`docs/ops/packaging-sku-shift-implementation-20260910.md:51,71` | 本地3100运行时HTTP审计、登录/固定fixture、macOS psql路径及旧finance路由；部分断言只验200不足以证明scope；历史失败须独立保留。本轮仅输出脱敏脚本逻辑，未运行、未输出认证值 |

### 1.2 分层登记

**F：已核实代码事实。** 历史恢复入口缺失、两套箱码冲突、跨日参数冲突、伪入仓成功、服务端已有原日期/CLOSED事务能力、历史详情范围不足，见E03–E18。必须保留已存在的防重、防重建与权威SKU能力，避免重做另一条库存链。复核修订仅额外只读检查运行时scope-audit及必要历史报告，未重新作生产查询。

**H：历史现场证据，非当前事实。** 指定审计E01第30行记载：id=33，code=`PKG-20260910-163616`，2026-09-10，30枚/1盒，ACTIVE/real，shift=56（`SH-20260910-1597`，CLOSED），场LPH_MENGSAI，公司COMP-LAO-AGRI；当时交接/库存/流水为0、PENDING。班次120枚/4盒不属于本单总量。SKU7670就绪是当时现场证据。本文不重新确认这些状态，不生成本单箱码候选。

**A：设计假设，须在开发前用受控本地schema和业务样例验证。** 原单code全局唯一；原JSON数组顺序可作为不改原单的产出定位；boxes、eggs为正整数；同一原单首次交接全部箱到同仓同库位；拆仓/部分交付不在本版。现有日期是DATE，旧timestamp时区未必有可靠约定。已停用主数据仍应可展示历史名称/原码，不能作为新选择项。无法确定归属的历史单不得自动归到当前公司。

**D：待用户裁定的产品选择。** 仅D1签收模式、D2首次上线范围，见第12节。旧箱实物身份、真实receiver及库位、生产运行版本属于必须补齐的事实，不是可用“同意方案”替代的数据。时区映射、迁移链末态、旧证据完整性由开发/审查先核实；不得要求用户猜技术事实。

PR229是否合并不是判断修复存在与否的依据；按实际源码、包含关系/树diff、部署镜像revision分别判断。本次未查远端PR。SKU补齐只解决一个主数据前置条件，不能证明导航、箱码、打印、交接、签收闭环。

## 2. 目标、角色、边界与需求编号

目标：有权限的人凭原包装code跨日找到原单，在不重包、不改原量、不重开班次的前提下，恢复同一箱身份，查看真实证据并完成被批准的后续动作；异常必须可解释、可停止、可审计。

| 角色 | 业务目的 | 边界 |
|---|---|---|
| 包装操作员 | 查本范围原单、正常打印/补打、核验箱标、发起完整交付 | V仅查看；E才写；不能代仓库人员签名或补造旧证据 |
| 仓库接收员 | 逐箱核实、选择有权库位、确认收到实物 | 主数据真实身份；独立签收模式必须用本人会话，与交付人不同 |
| 包装主管/管理查看者 | 跨班次查询、日报、异常跟踪 | MGR:V不是OP:E；不默认增加审批流或授予库存写权 |
| 数据/运维负责人 | 核对历史歧义、主数据和partial证据 | 单独授权的治理任务；普通重试不承担数据修复 |
| 审查及验收人员 | 对照需求/版本/数据/浏览器/实物证据 | 不能把本地测试替代生产交付或本人签收 |

范围内：正式终端pkg_packing_records历史列表/详情、标签/交接恢复、权限/范围收口、箱身份与证据、日报口径和旧入口误导修正。范围外：重新包装历史单、改写历史JSON/原量/日期、给历史原单补SKU、重开CLOSED、强制入库、自动补余、另建wms_inbound替代、默认引入审批、多仓部分交接、自动推送、生产实际操作。

| 需求 | 缺口→可检查目标 | 优先级 |
|---|---|---|
| R01 | 今日/内存替代历史→精确code、分页、公司场/原日期/班次含CLOSED历史队列 | P0 |
| R02 | 基本trace不完整→完整原产出、精确来源、全证据详情且不泄漏 | P0 |
| R03 | 刷新切班丢单→URL原code恢复，与当前作业班次隔离 | P0 |
| R04 | PH/BOX冲突→服务端生成持久身份、旧码核实、补打扫码一致 | P0 |
| R05 | PRINTED混同出纸→请求/回调/物理核验/交接/签收分证据 | P0 |
| R06 | 状态/日期混用→独立状态维度、原日期、partial fail-closed | P0 |
| R07 | 候选/权限不一致→场公司仓库位范围、接收人主数据、V/E OP/MGR | P0 |
| R08 | setStep假成功和死路由→诚实查询展示与合法历史入口 | P0 |
| R09 | 最新班次冒充全天、移动旧任务→精确班次/全天/旧口径分阶段 | P1 |
| R10 | 并发/超时可能重放→全产出校验、原量对账、统一锁/事务/幂等 | P0 |
| R11 | receiver文本冒充签收→最小方案记录真实接收人；独立双人实物签收为可选增强 | P1（D1影响闭环定义） |
| R12 | 局部通过冒充上线→文件级阶段、回滚、测试与分层验收矩阵 | P0 |

## 3. 信息架构与界面交互

### 3.1 导航及路由（下列新路由均为拟新增）

后台生产管理新增“包装历史” `/packaging/history`；列表预设“待交接”通过`handoverState=PENDING&recordStatus=ACTIVE`表达；“证据异常”单独预设，不能混成待办。详情 `/packaging/history/[packingCode]`。终端新增“历史” `/terminal/packaging/history`及详情同名动态子路由，共用详情组件；后台查看不要求进入全屏。新包装提交成功后显式导航携带服务端返回code。

现有标签/交接页拟支持：`/terminal/packaging/label-print?packingCode=<encodeURIComponent(code)>`、`/terminal/packaging/warehouse-handover?packingCode=...`。详情按钮、打印日志、日报下钻都使用同一入口；无code时显示选单，不回退到任意currentShift或猜最近单。保留来源列表的同站`returnTo`，只接受允许路径，防开放重定向。侧栏权限和目标API一致。终端直接点“标签/入库”也先选单，不能绕过服务端门禁。

旧`/packaging/batch`改名“分级记录查询”，删除“确认入账”动作及无证据成功卡片；有账证仅显示该分级链已核实信息。没有确切关联packingCode时只能去历史列表，禁止把task_no/batch_no硬转原单。旧错误标签URL可拟新增只读兼容页，提示链接已更新并去选单；不自动发起打印，不根据旧qty参数建箱。

### 3.2 历史列表

首屏默认最近7个**业务日期**，明确显示范围；提供“全部历史”（仍服务端分页）。筛选：完整code精确等值、日期起止、公司、场、班次ID、班次状态ALL/OPEN/CLOSED、原单状态ALL/ACTIVE/VOID、交接状态、库存模式。精确code独立模式取消默认日期限制；若用户显式保留其他过滤，UI显示“同时满足筛选”，不默默忽略。前后空格可trim，不大小写模糊、不LIKE、不以33代替code。

列：原code、原生产日、公司/场、原班次code及状态、原枚数/盒数、原单状态、交接派生状态、签收证据状态、异常原因、查看。不把原枚数换成可用库存。排序固定生产日DESC、id DESC；每页25，可选50/100，游标上一页/下一页；显示本次查询范围/时间，不能假装提供任意跳页。更改过滤回第一页。状态过滤在数据库过滤后分页，不能先取100再客户端筛。无数据、无权限、读取失败分别呈现；未知状态禁止显示“0条待办”。

班次筛选是只读历史班次列表，含CLOSED及其原业务日，不调用shifts/today冒充历史。公司变化清场/班次，场变化清班次；不会改变作业台当前班次。VOID可查不可处理。

### 3.3 详情与操作页

详情顶栏固定原code、原生产日、公司/场、原班次和ACTIVE/VOID；“当前作业班次”在另一块展示，不参与原单操作。CLOSED文案：“原班次已关闭；此原单可在证据满足时继续标签与交接”。缺归属则提示无法核验，不显示已具备操作条件。

详情从上到下：①原单摘要及作废原因；②按原JSON顺序的所有产出（等级/规格/原箱数/原枚数、原保存SKU与当前解析SKU分别标识）；③精确关联分级→集蛋来源（路径、来源数量、归属和精度）；④箱清单和身份登记来源、有效标签、补打事件；⑤逐产出库存原量/可用量/ledger证据；⑥交付/接收记录和人员；⑦操作区。明细多时各段分页，提供数量与完整性标记，不能用“详情”名义静默截断。来源关联不等于某盒分摊量，未知分摊显示未记录。

标签页选单后只读原单日期/班次/产出和服务器箱码；未登记显示“箱身份待核实”，不得预览猜测实物标签。正常打印、补打、验码各有进度；补打原因trim后必填。打印调用成功只显示“打印请求已发送，待实物核验”；打印失败保留原箱ID，可重试日志查询，不自动再次出纸。验码成功显示“当前人员已核验该标签”，不是“仓库已接收”。

交接页显示原单全部预期箱，逐箱扫码回车、音/文提示、计数n/N及枚数；取消“全部确认=已实扫”。提供手工录入作为扫描设备替代时记录method=MANUAL，仍逐箱服务端核验且不得标为扫描枪证据。选择仓库→库区（可选导航）→库位；清空上级同步清下级。receiver必须通过受限主数据选取，显示ID/姓名（名称只读）；托盘可选，但若填则须真实事实，不造默认码。弹窗复核原code/日/箱码清单/总数/库位/接收人/动作含义。

确认按钮只在详情和状态已成功且同一revision、ACTIVE/real、全箱身份及验码成立、完整PENDING且无活跃交付意向、权限及候选有效时启用；partial/UNKNOWN/SQL错误/数据不全均禁用。COMMITTED只展示证据和经授权补打，不再显示入库确认；签收可独立待完成。失败留在本单，不跳交班页；成功后停留证据页供核对，用户自行回列表。

可访问性：禁用按钮旁有可读原因，不仅颜色；加载`role=status`，失败`role=alert`；扫描字段自动聚焦但弹窗/报错不抢焦点；表格横向滚动保留单号，移动卡片保留数量和状态；沿用现有多语言字典及样式系统，不把实现细节放进普通用户主流程。

## 4. 上下文、日期与状态模型

### 4.1 URL与会话隔离

新增只读`usePackingRecord(packingCode)`，返回loading/error/data/revision/actions，键为用户ID+权限版本+real+精确code。URL是选择来源，服务端详情是内容权威，缓存不是证据。GET无副作用，不自动建箱、打印或交接。切code、换账号、注销、权限更新立刻清敏感详情/本地扫描/receiver并Abort旧请求，generation检查后才可落state；A→B→A乱序不可回填旧A。提交捕获code+revision+身份快照，响应回到已切换页面只作原单结果通知，不更新新单。

刷新、新标签页、全屏退出重入均从URL重新GET；已持久化证据可恢复，未提交扫描草稿清空并提示重新核验，不冒充已保存。当前班次切换不替换原code/日期；历史查询不调用setShift。若旧layout必须重挂，重挂也靠URL恢复，历史详情不因当前班次校验失败而永远阻塞；身份校验仍先行。无OPEN班次可以查历史/CLOSED交接，不能新包装。

401处理：受控只读验收设置禁止非GET/禁止静默刷新，显示会话失效“待验收”，不自动登录。正常产品允许既有会话机制时，GET可刷新一次；**写动作不得通用401自动重放**，重新核验身份/权限/状态及原幂等键后由用户确认；跨账号不继承待提交操作。登录return保留安全pathname+search（含code），不带token。刷新、后台轮询、恢复session均不等于同意打印或POST。

### 4.2 时间语义

`productionDate`从原单DATE序列化为`YYYY-MM-DD`，不经JS Date/UTC转换；必须与原shift.production_date一致，冲突fail-closed。打印生产日和交接业务日用原日。`occurredAt/receivedAt/requestedAt`为新增事件真实UTC timestamptz，展示附业务时区及用户时区选项；不得回填为原生产日。

业务“今天”和日报边界由服务端权威场/公司IANA时区决定，推荐场优先、公司兜底；缺配置时要求显式日期，不静默用浏览器UTC。历史DATE无需因时区改变。旧timestamp无时区的记录返回raw+timezoneConfidence=UNKNOWN，不擅加Z；确定旧写入约定后才转换。跨公司不同时区时按各公司原生产日统计，标题写“各场业务日期”，不能暗示同一UTC时段。

### 4.3 独立状态（不得压进一个status列）

| 维度 | 权威/值 | 行为 |
|---|---|---|
| 原单 | pkg_packing_records.status：ACTIVE/VOID | VOID只读；原量和原日期保持 |
| 班次 | pkg_work_shifts.status：OPEN/CLOSED | OPEN允许新包装；CLOSED不禁止原单后续交接 |
| 库存状态 | inv_batches.status：INV_STOCK_STATUS五态 | AVAILABLE等只解释存货可用性，不解释是否交接 |
| 库存入口模式 | PACKAGING_INBOUND / TEMP_PRODUCTION_INBOUND | 互斥；TEMP不得再生成包装库存 |
| 交接证据派生 | PENDING/COMMITTED/HANDOVER_ONLY/INVENTORY_ONLY | 由证据计算，不供前端直接写值 |
| 核验质量 | VERIFIED/UNKNOWN/PARTIAL/CONFLICT | 非VERIFIED禁止业务写入，避免总量碰巧相等就COMMITTED |
| 箱身份/标签 | REGISTERED或待核实；标签ACTIVE/VOID | 标签作废不等于原单作废，补打不增加箱数 |
| 打印证据 | 请求、调用结果、设备回执、人工验码各自事件 | 任何前置事件不能推导下一事件 |
| 接收证据 | NOT_RECORDED / LEGACY_RECORDED / RECORDED / PENDING_RECEIPT / RECEIVED | 不覆盖交接/库存状态；receiver文本不是本人签收 |

派生规则以下首先用于无可信提交凭据的旧记录/首次提交预检；已有可信COMMITTED凭据时以7.4原入账与当前库存双轴规则为准，合法演进不降级。没有任何本链交接/相关批次/相关入库流水才为PENDING（仅孤立ledger也算库存侧证据）；恰好一个有效交接且逐产出批次/ledger/归属/原量全匹配才COMMITTED。交接存在而库存侧不完整为HANDOVER_ONLY并标PARTIAL/CONFLICT；无交接但有任意库存侧证据为INVENTORY_ONLY。两侧都有但错SKU/重复流水/错归属同样禁止，不靠状态名掩盖冲突。多个交接、无法解析JSON、范围不完整等quality=CONFLICT/UNKNOWN；读取失败HTTP错误，不能回落PENDING。

partial统一文案“证据不完整，已停止操作，请联系负责人核实”；普通API不得自动补余，包括有交接无库存这一方向；幂等重放只允许已完整且相同payload的结果读取。没有修复按钮、force参数或管理角色旁路。逆向业务或修复另开审计任务。

## 5. 服务端箱身份、旧证据和打印设计

### 5.1 新单箱身份

拟由服务端在新packing/submit同事务完成身份登记：每个原JSON产出定位为outputOrdinal（0起），每盒boxOrdinal（1起），独立UUID boxId；标签码候选为`PBX-<UUID无连字符大写>`（36字符），通过5.4发行门后才可正式采用，存库全局唯一，不取code尾号、不以日期加局部序号拼唯一性。码格式是本方案拟定的新版本，不是现有事实；实机Code128尺寸须验收。UUID/规范码候选冲突由唯一约束或registry占用拒绝，仅在未提交发行事务内重新生成，已提交身份永不改变。

箱数量必须等于原total_boxes，逐产出箱量之和等于原eggs、全单之和等于total_eggs；等规格整箱按权威规格验证，不能用除法四舍五入。保存box→outputOrdinal→packingId映射和原量快照hash。登记失败则新包装提交整体回滚；新客户端不能自行补一个码。重试submit返回原boxIds；同原单同ordinal唯一，作废标签后仍不能新建第二个逻辑箱。

### 5.2 历史单和PH/BOX兼容

历史GET不做懒写。未登记的旧单显示identityStatus=UNREGISTERED，不据PH/BOX算法创建“历史实物箱”。收集现有`pkg_label_print_logs.box_code/packaging_batch_id`、`pkg_handover_records.boxes_json`及现场实物事实作为候选证据，保留各自原文及出处ID；日志证明某次记录、boxes_json证明当时交接声明，都不能单独证明箱→具体产出对应关系或实际出纸。

拟设专门的显式历史登记动作，锁原单，上传/引用真实核验材料与逐箱outputOrdinal分配，先只读预检再由有E权限者提交。旧PH/BOX码作为别名原样保留，禁止算法推导PH=BOX。旧单一盒也必须核实现场码；没有旧标且证实从未贴标时，可明确选择“历史未贴标首次登记”，生成新身份、新标签，记录登记时刻及事实依据，绝不伪造历史打印/交接日期。多盒无分配证据时保持待核实，不按日志时间猜排序。

全局扫描别名冲突规则：统一按5.5的namespace registry及claim解析，数据库约束和锁保护所有规范码/别名写入。同字符串关联多个箱/单即AMBIGUOUS；对涉及无权证据的请求返回统一不可解析错误，不泄漏其他公司单号或是否存在；有权治理场景才显示歧义。不能取第一个、不能以当前单过滤后假装全局唯一。已核实的旧别名也不得覆盖既有交接boxes_json。跨单碰撞需独立核实并给相关实物换贴唯一标签，原别名标为禁止扫描且保留冲突历史；新标签仍映射同boxId。未知码NOT_FOUND、错单BOX_NOT_IN_RECORD、已VOID标签LABEL_VOID、重复同箱ALREADY_SCANNED；同箱不同别名只能计一次。

旧交接已COMMITTED但缺箱产出映射时，原交接/库存事实仍只读展示；identityQuality=UNKNOWN，不能宣布已实现逐箱追溯。补打/后续签收在完成有事实依据的登记前禁用；不为了兼容写一个“完美”映射。旧receiver文本只显示legacyReceiverText，禁止按姓名模糊匹配成用户ID，更禁止凭空写received_by/received_at。

### 5.3 打印、补打、作废和证据强度

先持久化打印requestId、boxId、labelCode、模板版本/hash、份数、操作者、原因，再调用浏览器打印；调用结果另追加DISPATCHED/FAILED/UNKNOWN事件。数据库写日志失败时不调用打印。调用后回报丢失显示UNKNOWN，先查requestId，不能自动再次打印。window.print/afterprint只记录浏览器调用结束，设备回执若不可得就保持无设备证据。实物验码事件由本人扫描记录；只证明所见标签可读，不证明箱内数量或已交付。

补打复用boxId和有效labelCode，强制原因，生成新printRequestId并关联前次请求；不增加逻辑箱、不增加入库量。换码属于标签作废/换贴动作，需原因和旧标签处置事实：锁boxId，旧标签VOID，新标签ACTIVE，同箱只能一个当前有效规范标签；历史别名是否仍可扫码由核实结果决定。原单VOID禁止打印/交接；原单已有下游不得直接VOID。不得以“补打”掩盖创建第二箱。

详情分开呈现：请求日志→浏览器调用→设备回执（可缺）→人员验码→交付记录→接收人签收。旧PRINTED标“旧打印日志记录，未验证出纸”，绝不批量迁成出纸确认。打印预览清楚标预览且不用示例日期冒充原单标签。

### 5.4 标签编码发行门（开发批准后的发行前置）

PBX候选36字符不等于现有40×30mm标签一定可读（E18所引printLabel尺寸只是历史布局）。在隔离开发阶段先用明确TEST/NON-BUSINESS且不落正式箱身份的样张验证：Code128含起止符、校验、静区的总模块宽度、打印机203/300dpi最小点宽、模板最小尺寸、长码不裁切、扫码枪输入长度上限/回车终止、低对比及多次重复扫描；记录设备型号、dpi、实际标签宽高、测试码长度、成功率和照片。需要实际打印设备的动作须具有相应测试硬件授权，不能借开发批准打印生产包装33。

发行门`labelEncodingQualified(version,deviceProfile)`未通过时不允许该profile任何正式新码发行，包括新submit连带发码和历史首次登记；可继续隔离开发、只读历史与未发码模拟验收。推荐发行前评估较短的带版本/校验位不透明随机base32码（熵和碰撞约束经评审），或增大模板/调整条码制式及设备；boxId仍UUID不变。最终选一种有验证记录的encodingVersion，不能先发PBX再因扫不出无追溯改码。

已发行标签一律保持原labelCode、encodingVersion和boxId可追溯；必须换贴时走同箱的显式旧标签作废/新标签发行事件，有新旧码和实物处置依据，活跃intent时先终结。替代编码不能重生成boxId或改历史交接box引用。A17发行验收与具体现场包装33是否已提供箱码无依赖关系。

### 5.5 规范码与旧别名统一namespace（并发强约束）

采用统一`pkg_packing_code_registry`，以`normalized_code`主键占有整个规范码/别名命名空间，所有发行、导入旧别名、换贴、扫码解析共用；废弃“两张表各自SELECT再INSERT”的做法。normalize规则固定为去扫码终止符及首尾空白，保留大小写，拒绝内嵌控制字符，不对旧PH/BOX擅自大小写合并；原字符串另存。registry状态BOUND/AMBIGUOUS/RETIRED，BOUND必须有owner_box_id，其他状态无可扫描owner。

`pkg_packing_code_claims`保存规范/别名对箱的各项主张、kind、原文与证据，FK至registry；UNIQUE(normalized_code,box_id,kind)且键非空。同一旧码确有多箱主张时保留所有行，registry=AMBIGUOUS，禁止扫码；不删除冲突来满足唯一约束。规范码发行遇任何已占用（包括RETIRED/AMBIGUOUS）不能抢占。只有有证据的治理可处理歧义，不能把当前单当默认owner。

写事务锁序统一：现有packaging-chain锁→涉及原单code按字典序的原单锁→所有normalized_code按字典序执行`INSERT ... ON CONFLICT DO NOTHING`占namespace槽位，再`SELECT ... FOR UPDATE`锁registry行→box/claim/intent/operation行。这里INSERT受数据库PK竞争约束，不是未加锁的存在性预查；同码跨单竞争必须等待同一registry行。未来去掉全局锁仍须保留此序。alias claim与规范发行提交前以延迟约束触发器检查BOUND owner和所有可接受claim的box一致，AMBIGUOUS不得有可扫码owner；当前规范标签对box的ACTIVE partial unique、registry FK/PK一并约束。禁用通用CRUD对此namespace直接写入，不能存在绕registry的标签路径。

事务并发测试必须模拟不同packingCode同时发行相同候选、规范码与旧alias同时注册、两个旧单同时登记同alias、相反顺序多码登记、同码作废/换贴竞争：规范发行至多一方成功且另一方409或在未提交发行中换候选；真实旧冲突保存为歧义；无重复owner/死锁、无丢失claim。跨范围别名解析统一返回LABEL_UNRESOLVABLE，不给可见性之外的“另一单冲突”提示/数量/码；仅全部相关证据有权的治理视图可显示AMBIGUOUS详情。

## 6. DataScope、人员、权限与签收选择

### 6.1 数据边界

所有列表、详情、箱码解析、打印日志、候选、状态、统计与写接口都先校验real及菜单，再由原单→原班次→权威场→公司定位，不信body.companyCode/siteCode。公司和场必须同时在范围；库存/交接明细再校验目标仓范围，库区/库位必须属于所选仓。非global空范围=无权，不是无限制。精确code读不到/越权统一404“不存在或无权查看”，统计计数和候选也不泄漏。

详情默认采用全链完整范围策略：只要关联库存仓或来源有一部分越界，整张详情拒绝，避免部分明细被误判PENDING；列表亦按同一可见性规则筛选后计数。不允许返回被遮挡的聚合数或箱码。没有库存的待交接单按原单公司/场决定查看权限，仓范围为空可查看原单但不可获取/选取目标仓；是否可操作由actions解释。历史停用场/公司仍可用稳定归属展示，但权威归属已丢失或改变而无历史证据则拒绝，并交独立治理；不能用ACTIVE JOIN丢失就自动补归属。

候选仓：ACTIVE且同原公司、满足当前仓范围与现场适用范围；库位统一按**后端与schema核实后的合法可接收态**，本版拟保留NORMAL/EMPTY/OCCUPIED，ACTIVE不得无依据当NORMAL。要核对冻结基线、所有TS末态及DTO/entity/写值；若实际CHECK不容该集合先做明确迁移，不只改前端数组。复用Selector呈现，提供包装专用受限loader或可注入loader，避免全局更改影响其他业务。主数据选项只取有效态，历史快照仍显示；不新增自由手填公司/场/仓/库位编码。

接收候选需拟新增packingCode+warehouseCode限定接口，从sys_user有效身份及真实公司/仓职责/数据范围筛选，返回稳定userId和显示名，不暴露账号敏感字段。不直接复用UserSelector的store过滤当仓库授权；不得硬编码“仓管”角色名作为权威范围。外部/无账号接收人若存在须另行裁定，本版不伪造系统用户。

### 6.2 权限映射（拟定，方法级与前端同步）

| 功能 | 所需权限 | 特殊条件 |
|---|---|---|
| 历史/详情/日报/班次列表/受限日志GET | OP:V **或** MGR:V | 沿用MENU_PKG_OP、MENU_PKG_MGR；方法级altMenus OR，不把所有终端接口放宽 |
| 新包装、箱登记、打印请求/补打/验码、交付确认 | OP:E，且具备读取本单能力 | V只读；MGR:E本身不代替OP:E |
| 打印驱动/模板管理 | MGR:E | 不隐含箱处理/入库权限 |
| 独立仓库签收 | OP:E及本单指定receiver本人、有仓范围 | 推荐先复用既有权限和receiver身份约束；如组织不允许仓管OP:E，另审专用权限，不能偷偷扩大整个终端 |
| 追溯页 | 保留TRACEABILITY_VIEW:V | 原包装分支仍须补DataScope，不以新入口绕开 |

OP/MGR只是菜单缩写，实际API用完整MENU_*。只读MGR角色范围应按授权来源解析，不能仍固定拿OP菜单范围导致可见不可读；若同时授权，按现有DataScope菜单语义计算可读范围并在测试固定，不无意并成集团权限。角色授权配置属于运维/权限配置，不在schema迁移seed业务角色。页面隐藏无关写入口，当前相关但不可做的动作禁用并说明；后端再检查，防手工调用。服务端返回actions不是授权令牌，提交时重算。

### 6.3 最小闭环与可选增强（D1，不假定用户需要双人）

**D1-C为最小需求基线：一次交接入库。** 原历史单→统一箱身份→标签请求/实物验码→操作者选择真实接收人主数据及库位→一次confirm完整原子入账。保存receiverUserId、姓名快照、recordedBy和真实时刻，显示RECORDED；这满足现有一次交接入库需求，但没有接收员本人独立会话签收，不能称“独立签收闭环”。不得默认要求接收员具有系统操作账号会话，所选主数据身份仍须有效且符合接收范围；无可用主数据身份须核实，不造用户。

**D1-A为可选双人增强：交付意向→接收员本人收货并原子入账。** 只有用户明确选择双人职责分离时推荐A。交付人创建完整handover-intent，库存不变；指定接收员本人另会话核实全箱、库位、数量后receive，服务器要求本人且不同于sender，原子写库存、原交接、提交证据、receipt及意向完成。它是实物接收，不是审批，不创建approval实例。部分实收不支持，不自动入账。

**D1-B为另一个可选增强：先入账后独立签收。** confirm先入库并显示PENDING_RECEIPT；本人后续receive只追加签收，不再调用库存。需用户接受账先于独立收货确认的时间窗口；不是A的默认降级。

| 范围 | 相对复杂度与可宣称结果 | schema/API/测试增量（相对C） |
|---|---|---|
| M：D1-C最小闭环 | 基线，仍需解决身份/权限/幂等等必要问题；可称“原单交接入库闭环”，不能称独立签收 | 第8节M的5张新表及原表兼容字段；confirm及打印/验码命令；T01–T07、T09–T16、T18的非双人部分及T19–T23适用部分；A12-C |
| E-A：M+D1-A | 高：增加两人异步协调、冻结意向、失效释放和并发状态；可称“双人接收与入账闭环” | 增intent表，receipt事件复用共享事件表；新增intent create/read/list/receive/reject/withdraw/invalidate；增加T08、T20意向全部分支、T21模式门禁；A12-A/A15 |
| E-B：M+D1-B | 中：没有入账前intent，但有待签收窗口、本人权限和重复签收问题 | 不增intent表，receipt事件复用；增加handovers/:code/receive及待签收只读队列；T08签收、T21模式分支；A12-B |

日报/移动P4是渠道口径范围，与选择C/A/B独立：完整渠道一次交接闭环可为C+P4，不强制双人。TEMP精确来源P5另行决定，不属于任一模式自然附赠。旧receiver文本仍为LEGACY_RECORDED，不能模糊匹配用户；后续本人追认需真实事实、当前时刻及另授权，不倒填历史。

### 6.4 D1-A意向动作矩阵及退出机制

意向是独立维度。活跃`intentState=PENDING_RECEIPT`时库存仍可为`PENDING`，UI必须同时展示“未入账 / 已交付待接收”，不能仅看库存PENDING就再次交付。意向字段（箱集合、sender/receiver、库位、原单targetRevision）创建后不可改；任何业务修改必须终结旧意向，创建新intentId/new version并重新逐箱核验，不能继承旧verificationIds。

| 库存/意向 | 允许 | 禁止 |
|---|---|---|
| PENDING / 无活跃意向 | 有权人只读；按条件登记、打印、验码、创建意向 | D1-A直接confirm永禁；条件不全不得创建 |
| PENDING / PENDING_RECEIPT且有效 | 范围内读详情/原日志；receiver本人RECEIPT扫描/receive；sender撤回、receiver拒收；同有效码有原因补打允许且只追加事件 | 再创建意向、直接confirm、换标签码/作废标签、重登记箱、改库位/receiver、原单VOID；正常首次打印不允许（建意向前应已完成标签核验） |
| PENDING / PENDING_RECEIPT但失效 | 有权人读；显示失效原因；显式invalidate或定时失效释放；仍有权限sender可withdraw | 打印/补打、receive、直接confirm、重登记/换标；先终结意向才可重走 |
| PENDING / WITHDRAWN、REJECTED、EXPIRED、INVALIDATED | 历史意向只读；恢复该原单可操作检查，有条件时新建意向/重新扫描 | 自动重建意向、恢复旧扫描、自动入账 |
| COMMITTED / RECEIVED | 只读原提交/签收及授权同码补打 | 撤回/拒收已提交意向、再次入账；逆向另走业务流程 |
| partial/UNKNOWN / 任意 | 只读核实；允许无库存副作用的意向终结并留原因 | receive/confirm及任何自动补余 |

建意向前要求M的标签与HANDOVER核验完成。活跃意向同码补打不改变targetRevision，但必须明确补打不代表receiver收货；receiver仍须RECEIPT重新扫描。服务器不持有跨请求数据库锁，活跃意向靠状态+唯一约束冻结目标，防止长期事务死锁。

终结路径：sender本人且仍有本单写权可`withdraw`，receiver本人且仍有本单写权可`reject`，理由必填；成功只终结意向、释放活跃唯一约束，库存/ledger/交接增量0。期限推荐创建后24小时（expiresAt服务端固化）；受控后台失效作业在期限届满或发现sender/receiver停用、接收/交付权限撤销、仓库/库位停用、归属失效时将其标为EXPIRED/INVALIDATED并追加事件，绝不调用库存。原事务不存在“永久占锁”。

GET只派生effectiveValidity并展示原因，不悄悄写失效状态。receive锁内检查双方身份/权限、库位和expiresAt；发现已失效则回409 INTENT_INVALID，不写库存，随后由后台作业或显式`invalidate`终结。后台不可用时，有本单范围和MGR:E的人员可调用invalidate，但只能在服务器确认上述失效条件时释放，不能强行把正常意向作废，也不能接收代签；此为异常解除，不是审批。双方均停用时无需他们登录即可由此路径/后台释放。无此权限则等待获权负责人，不恢复被撤销用户的业务权限。

receive/reject/withdraw/invalidate/失效作业按相同锁序串行；先成功终结者胜，其他409。锁等待设置有界超时并返回可查询错误，不无限等待；重试沿用幂等键。新创建命令遇已过期但尚未持久终结的意向返回409并提示终结入口，不自动终结再创建。意向结束不改变原单原量/日期，也不重开班次。

## 7. API契约和事务设计

### 7.1 现有接口与拟调整边界

前缀P=`/api/packaging/terminal`。本表之外的新增名字不代表已存在。

| 状态 | 接口 | 当前能力 / 拟变化 |
|---|---|---|
| 现有 | GET P/shifts/:id/context?date= | 精确班次验证；保留，不作历史列表 |
| 现有 | GET P/reports/shift-summary?date=&shiftId= | 精确班次可用；拟要求新调用显式shiftId，无参旧语义暂不改成全天 |
| 现有 | GET P/labels/trace?packingCode= | 部分标签trace；拟收口DataScope并禁止拿整日sources当精确来源 |
| 现有 | GET P/warehouse/status?packingCode= | 四态；拟复用完整证据核验器、范围校验及准确partial错误 |
| 现有 | POST P/warehouse/confirm | boxes字符串/receiver/location；拟v2契约严格箱身份、人员、幂等；旧客户端不再接受任意箱码 |
| 现有 | POST P/labels/print-log、GET P/labels/print-logs | 旧日志；保留历史读取，新请求改走明确证据API，旧写入口同步安全校验，按9.1授权试点切换，试点外保留安全兼容 |
| 现有 | GET /api/traceability/packaging/:packingCode | 基本原单/树；补原单DataScope和读错传播，不宣称完整处理详情 |
| 现有 | GET /api/packaging/daily-report、daily-report-range | 旧pkg_tasks口径；分阶段保留标识，不能返回新字段却沿用旧口径名称 |

### 7.2 拟新增读取契约

公共：响应`{code:200,data,requestId}`；错误`{code:<稳定业务码>,message,requestId,retryable,details?}`，details不含越权实体/SQL。GET `Cache-Control: private,no-store`；无写副作用。现有整数ID统一十进制字符串（避免bigint精度），新boxId/requestId/intentId等UUID使用标准UUID字符串，数量为安全整数枚/盒；非法数字400。业务日期严格ISO date，时间戳按第4节。mode本版固定real，test请求拒绝。

| 拟新增接口 | 请求及返回 |
|---|---|
| GET P/history | `packingCode?`精确，`dateFrom/dateTo?`闭区间，`companyCode/siteCode/shiftId/shiftStatus/recordStatus/handoverState/inventoryMode?`，`pageSize=25`最大100，`cursor?`。返回items、nextCursor、hasMore、snapshotAt、asOfId、filters、totalMatching；单项含id/code/productionDate/company/site/shift/totalEggs/totalBoxes/recordStatus/state/quality/receiptState/actions |
| GET P/shifts/history | 日期/公司/场/状态过滤，同游标分页；返回id/code/productionDate/status/site/company；不改变当前班次 |
| GET P/history/:packingCode | 返回下述完整详情；全链范围先检查，读事务一致快照。`revision`为原量/身份/交接证据版本摘要，操作前仍重验 |
| GET P/history/:packingCode/outputs、sources、boxes、evidence | 大明细子资源，cursor/limit（25、最大100）；返回total/complete/nextCursor及相同snapshot revision；版本变化409让详情重取。详情至少含全部数量摘要、首屏明细和是否截断，不得假装首屏就是完整 |
| GET P/history/:packingCode/candidates?kind=WAREHOUSE\|LOCATION\|RECEIVER&warehouseCode=&zoneCode=&search=&cursor= | 按原单/当前权限、合法状态服务端过滤；返回code或userId/label、分页。LOCATION/RECEIVER必须指定有效仓 |
| GET P/boxes/resolve?packingCode=&labelCode= | 只读归属验证，返回boxId/outputOrdinal/qty/labelStatus/evidenceQuality，不记扫描；全局碰撞先检查，越权不给另一单code |
| GET P/reports/production-summary | 必填`dateFrom/dateTo,aggregation=SHIFT\|DAY`；SHIFT必填shiftId；公司/场范围。返回口径TERMINAL_RECORDS、原日、时区、包含shiftIds、ACTIVE原量、VOID独立数、待交接/已交接/待签收、按产出等级汇总及下钻过滤；区间最大31天，趋势每业务日一行 |
| GET P/operations/:idempotencyKey?action=&packingCode= | 以当前actorId+action+key精确定位，仅请求者查询自己的操作；另一个有权人通过详情的operationId读取已授权结果，返回NOT_FOUND/PENDING/COMMITTED/REJECTED、payloadHash、result/原单引用。NOT_FOUND不是确认没发生实物打印的证据 |

分页：过滤先DataScope再状态，固定`production_date DESC NULLS LAST,id DESC`；NULL原日单只在全部历史/精确code可见并标异常。游标绑定规范化过滤hash、权限版本、asOfId和最后date/id，防客户端改游标扩大范围；新提交id>asOfId不插入同一轮分页。totalMatching仅代表snapshotAt时可见结果，状态可能随后变化；不承诺跨HTTP事务冻结状态，返回详情必须重验。上一页保留游标栈，主动刷新开新查询。单响应计数/列表在同一只读一致快照，禁止N+1逐单状态GET。若产品以后需要严格可重复的跨页状态快照，另设计服务端快照；本期不假称已具备。

详情`data`字段具体定义：

- `record:{id,code,productionDate,recordStatus,voidReason,isTest:false,totalEggs,totalBoxes,createdAt,createdAtRaw?,timezoneConfidence}`来自原包装，不使用日报汇总。
- `shift:{id,code,productionDate,status,siteCode}`、`ownership:{companyCode,siteCode,businessTimezone,provenance}`来自班次/权威组织链，非请求体；归属不可靠阻断。
- `outputs:[{outputOrdinal,original:{grade,specId,spec,productCode?,skuCode?,boxes,eggs},resolvedIdentity:{productCode,skuCode,specCode,gradeCode,qtyPerUnit}|null,resolutionStatus}]`；保留原JSON字段，当前解析结果只显示不回写历史。历史已有账证优先展示入账身份；新动作需按权限/当前主数据重验。
- `sources:[{gradingId,gradingCode,sourceBatchId,sourceBatchCode,houseCode,siteCode,companyCode,linkId,sourceOriginalQty,allocationQty:null|number,precision}]`从原grading_codes_json（空时仅明确的grading_code）→grading_source_links→source_batches；去重后仍保留每条路径。不用整日sources。没有原单到来源消耗量记录时precision=RELATED_ONLY、allocationQty=null，原批次总量不能当本单消耗量；无关系MISSING阻断。
- `boxes:[{boxId,outputOrdinal,boxOrdinal,originalQty,canonicalLabelCode,aliases[],identityQuality,registrationEvidence[],labelStatus,printEvidence,scanEvidence}]`；未登记返回空+expectedBoxCount，不生成候选码。
- `inventory:{mode,quality,groups:[{skuCode,specCode,expectedOriginalQty,batches:[{batchNo,originalQty,qtyAvailable,status,companyCode,warehouseCode,locationCode,productionDate}],ledgers:[{id,changeType,refNo,batchNo,qtyChange}],checks}],totalOriginalInbound,totalAvailable,ledgerInbound,sourcePrecision}`。qtyAvailable只供当前存量展示。
- `handover:{state,quality,records:[{code,originalDate,occurredAt,boxIds?,legacyBoxes,location,receiverUserId?,receiverNameSnapshot?,legacyReceiverText?,actorId?}],issues[]}`、`receipt:{state,evidence[]}`、`actions:{print:{allowed,reasons[]},registerBoxes,...}`、`revision,snapshotAt,sectionsComplete`。

不得依赖未来一次查询强行凑齐未知历史字段；null/UNKNOWN为有效诚实输出。来源/人员快照仅返回业务必要字段，不返回完整用户行。拟读服务抽取与现有resolver一致的纯读取校验逻辑，不能在READ ONLY事务调用含FOR SHARE的写前resolver（E13）；写事务仍使用加锁版本，单元测试要求两者对同一数据解析一致。

补齐签收及打印恢复所需拟GET：`P/handover-intents?state=&receiver=me&cursor=`返回本人的受限待签收队列；`P/handover-intents/:id`返回完整原单引用、交付快照、指定人员、当前状态及actions；`P/labels/print-requests/:id`读取本单授权范围内的请求及全部事件；均采用相同范围/错误/分页规则。拟`POST P/history/:code/verification-sessions`显式开始LABEL_CHECK/HANDOVER/RECEIPT核验，记录purpose、actor、targetRevision及服务端expiresAt（推荐30分钟）；返回sessionId，不自动标任何箱已扫描。会话过期、身份变化、库位/箱版本改变须重新核验；已记录扫描事件保留审计但不再满足提交门禁。仅恢复页面不自动启动此POST。

`expectedRevision`专指原单业务、箱身份/有效标签、库位意向等影响操作的版本；追加打印/扫描事件不递增该版本，避免每扫一箱使其余请求全部过期。详情另有`evidenceRevision`用于证据分页一致性，事件子资源按eventId稳定排序；新增证据时重载证据段。所有意向终结命令统一携带intentVersion和targetRevision，具体见7.5；这里不用另一个expectedRevision别名，reject/receive/withdraw/invalidate串行互斥。

### 7.3 拟新增写接口（批准实施后才可开发/调用）

所有业务命令均要求`Idempotency-Key`（UUID）和明确目标引用；非意向命令用`expectedRevision`，已有意向命令统一用7.5的`intentVersion+targetRevision`（create尚无intentVersion，仅传targetRevision），不接受两套版本字段混传；打印结果事件使用eventId去重并继承已保存request的目标版本，即使随后原单作废也可记录先前请求的真实失败/结果，但不能因此重新激活标签；服务端actor来自会话。请求中的数量/日期/公司仅为一致性断言，永不覆盖权威值。幂等键scope=(actorId,action,key)，payload规范化hash包含原code、箱ID集合、日期/shift、库位、receiver、原因和模式；数组排序后比对，trim规则统一；同键不同payload=409 IDEMPOTENCY_CONFLICT。

| 拟新增或修改 | 请求核心字段 | 成功及证据 |
|---|---|---|
| POST P/history/:code/box-registration（新增） | `registrationKind=LEGACY_VERIFIED\|FIRST_LABEL_CONFIRMED,expectedRevision,items:[{outputOrdinal,boxOrdinal,observedLabelCode?,evidenceRefs[]}],reason` | 返回唯一box集合；有既有映射仅同payload返回，不能覆盖；未核实不登记 |
| POST P/labels/print-requests（新增） | `packingCode,boxId,labelCode,printType=NORMAL\|REPRINT,reason?,copies=1,templateVersion,expectedRevision` | 201/重放200，`requestId,boxId,labelCode,renderPayload,renderHash`；仅记录请求，不称出纸 |
| POST P/labels/print-requests/:id/events（新增） | `eventId,type=DISPATCHED\|FAILED\|UNKNOWN,clientOccurredAt?` | 记录服务端receivedAt、客户端时间单独保存；可信设备回执须独立认证通道，不接受前端声称DEVICE_PRINTED |
| POST P/history/:code/box-verifications（新增） | `boxId,labelCode,purpose=LABEL_CHECK\|HANDOVER\|RECEIPT,method=SCANNER\|MANUAL,sessionId,expectedRevision` | `verificationId,actorId,verifiedAt`，唯一事件/同箱去重；按purpose不跨阶段冒用 |
| POST P/history/:code/labels/:labelCode/void（新增） | `reason,dispositionEvidenceRefs,expectedRevision` | VOID事件；换贴返回同boxId的新标签；不改原量、库存或原单状态 |
| POST P/warehouse/confirm（现有，拟v2） | `contractVersion:2,packingCode,boxIds[],verificationIds[],productionDate,shiftId,warehouseCode,locationCode,receiverUserId,palletCode?,expectedRevision` | `handoverCode,operationId,committed:true,status:<完整证据>,receiptState,inventoryGroups,idempotent`；不只返回inventoryOk |
| POST P/handover-intents（新增，D1-A） | `packingCode,targetRevision,boxIds,verificationIds,warehouseCode,locationCode,receiverUserId,palletCode?,deliveryEvidenceRefs?` | 创建完整交付意向和快照hash，库存0变化；返回intentId、PENDING_RECEIPT |
| POST P/handover-intents/:id/receive（新增，D1-A） | `intentVersion,targetRevision,verificationIds[],confirmedLocationCode` | receiver本人，完整事务提交；返回与v2 confirm一致及receiptId |
| POST P/handover-intents/:id/reject（新增，D1-A） | `intentVersion,targetRevision,reason` | 未commit时关闭意向，库存0变化；再次交付须新意向并重新核实，不能部分入库 |
| POST P/handover-intents/:id/withdraw、invalidate（新增，仅D1-A） | `intentVersion,targetRevision,reason` | 依6.4身份或失效事实门禁终结意向，库存增量0 |
| POST P/handovers/:code/receive（新增，仅D1-B或历史追认另授权） | 本人核实的`boxIds,verificationIds,locationCode,evidenceRefs,reason?` | 只写签收，不再次写库存，标明追认与实际发生时间 |

v2与旧客户端切换按9.1公司/场试点策略。API先兼容读取，新的箱生成/打印/验码/confirm组合须整体就绪才可开写，不在P2单独开放confirm。已进入v2的原单不可回退v1；旧confirm在试点要求升级，试点外只保留通过相同安全核验的兼容路径。D1-A直接confirm禁止绕过intent；D1-C不创建intent/receipt。旧print-log不能提升新标签证据状态。

### 7.4 统一锁、事务、幂等与精确证据

先鉴权和参数校验；事务内按现有顺序拿`packaging-chain:false`→`terminal-packing:<code>`锁，再按5.5锁所有涉及的namespace registry行，最后锁原单关联box/claim、intent/operation；未来优化全局锁必须单独证明不破坏所有写路径，本版不擅改顺序。所有箱登记、VOID、标签换贴、交接使用同一原单锁顺序。读快照不持写锁；提交锁后重读状态和归属，不相信提交前GET。

在任何库存写之前解析**全部**原产出，校验JSON合计=原总量、箱整数及箱映射、原日期/shift、主数据、场/公司/仓/库位、来源精度、人员有效性和所有验码事件归属/时效。按(skuCode,specCode)聚合生成库存（保留原outputOrdinal到聚合组的映射），多产出同SKU不得被误算成多批；逐箱量和逐组量均校验。明细全部验证通过才调用现有completeTerminalPacking统一入口，并复用同一manager写交接/签收/operation；任一步失败全部回滚。打印设备副作用不放数据库事务里等待。

**首次提交与历史重放使用不同核验对象，不能比较当前批次位置来定义曾经是否COMMITTED。** 首次PENDING且无任何下游证据时，锁内按原JSON解析全部组；生成批次的原qty、原公司/仓/库位/日期、SKU/规格/产品及每条PACKAGING_INBOUND ledger的ref_no/batch_no/qty_change必须完全匹配，在同事务保存不可变`commitReceipt`（技术提交凭据，不是D1独立人员签收receipt）及逐组snapshot、ledger引用。原quantity、全箱集合hash、提交模式、原入账归属和日期都纳入snapshot hash。未来提交结果读取不得重新调用生成库存方法来“验证”。

历史读取/幂等重放采用两条证据轴：`postingState`说明原入账事实，`currentInventoryQuality`说明后续库存演进是否可解释。新单优先可信的不可变commitReceipt + 原入库ledger + snapshot确认COMMITTED；当前inv_batches只是存量视图。合法移库改变当前location、拆批产生后继batch、销售耗尽qty_available=0，不回退PENDING/INVENTORY_ONLY，不再次入账。以明确的移库/拆批/销售ledger链展示current warehouse/location/remaining及successorBatchRefs；不能把后继批次当成本次多余入库批次。当前证据异常单独标currentInventoryQuality=CONFLICT/UNKNOWN并阻断后续库存写；可信原提交事实仍保留。当前范围校验按6.1完整链策略执行，无权看新位置时拒绝相应详情，不退回暴露旧归属。

旧单无新snapshot时，只允许用当时交接及不可变原入库ledger、可验证原批次/精确演进链推导`LEGACY_VERIFIED`。当前批次完全未演进可辅助核对原qty，但不能在缺证时拿当前qty/库位代替历史快照；同总量不够，须逐SKU/规格/原引用一致。确实能证明旧入账的返回COMMITTED、evidenceOrigin=LEGACY_VERIFIED，不为GET写新snapshot。旧单经历拆批/移位但缺完整链时返回原四态的保守候选并加postingQuality=UNKNOWN（例如HANDOVER_ONLY/UNKNOWN），文案“原入账证据待核实”，不是“确定未入账”；写动作全部关闭且绝不补余。已可信COMMITTED后发现当前演进缺口，不抹掉原提交凭据。

同幂等键重放仍先核当前用户读取权限，再按原payload hash返回commitReceipt；不因SKU停用、当前仓库/库位停用或销售耗尽要求重新resolve当前主数据，也不重新调用completeTerminalPacking。新请求首次入账仍严格核当前合法主数据和范围。**任何原入账核验都使用原qty/原ledger qty_change，绝不使用qty_available冒充原量**。伪造snapshot/hash不自带权威，snapshot必须来自受控同事务写路径并与引用ledger一致；旧数据未知不批量补造。

TEMP模式目前场日汇总可能把其他包装单库存算进本单。首期只读展示mode及现有聚合证据，precision=SITE_DAY，不宣布本单精确已入库/可交接。要开放TEMP写，必须通过明确source link或专门来源分配表建立原单/产出→原批次/原入库ledger及分配原量，锁来源防多单重复认领，并确保总分配≤原入库量；无可证明映射则关闭TEMP写。不能按当前可用量分配，也不能为了通过包装33硬切库存模式。此项单独阶段上线，D2不包含时明确标待支持。

超时未知commit：UI显示“提交结果待核实”，锁定本单重复按钮，用同operation key只读查询；COMMITTED恢复证据；REJECTED展示原因；PENDING继续查询；NOT_FOUND后重取本单状态，若允许人工重试仅发送原key+原payload，服务端串行锁和幂等结果消除重复。不得新key自动提交，不因超时改箱数/receiver。网络未知打印结果绝不自动再打印。

错误码：400 INVALID_FILTER/INVALID_BOX_SET；401 SESSION_EXPIRED；403 ACTION_DENIED；404 RECORD_NOT_ACCESSIBLE；409 REVISION_CHANGED、EVIDENCE_PARTIAL、EVIDENCE_CONFLICT、BOX_IDENTITY_UNRESOLVED、LABEL_AMBIGUOUS、SKU_MISSING/AMBIGUOUS、LOCATION_INACTIVE、RECEIVER_INELIGIBLE、IDEMPOTENCY_CONFLICT；503 READ_UNAVAILABLE。仅网络GET可有限重试，409依据原因修正/核实，partial不得提示“再确认即可”。错误日志仅白名单requestId、operationId、脱敏actorId、packingCode、phase、errorCode；不打印headers、请求完整body、SQL参数、密钥/token/密码或可能含敏感内容的原始异常stack。

### 7.5 意向DTO、版本冲突与重试一致性（仅D1-A）

创建DTO：`{packingCode,targetRevision,boxIds,verificationIds,warehouseCode,locationCode,receiverUserId,palletCode?}`，sender由会话读取；返回`{intentId,intentVersion:1,targetRevision,expiresAt,state}`。intentVersion随状态迁移增加；targetRevision是创建时冻结的原单/标签版本，不因打印/扫描事件变更。

receive DTO：`{intentVersion,targetRevision,verificationIds,confirmedLocationCode}`；reject/withdraw/invalidate DTO统一`{intentVersion,targetRevision,reason}`。不接受expectedRevision别名、不允许在receive修改receiver/库位/箱集合。GET intent返回存储的两个版本、当前原单revision、effectiveValidity及允许动作；接收核验会话也绑定两个版本。

锁后先查相同幂等键的已完成结果：同payload原结果返回（仍鉴权），不因版本已经推进错误409；新键或不同请求再比对intentVersion与存储值、targetRevision与冻结值。receive还必须等于当前原单revision且意向未失效。版本不符409 INTENT_VERSION_CONFLICT/TARGET_REVISION_CONFLICT，已终结409 INTENT_TERMINAL，失效409 INTENT_INVALID；无库存/交接新增。用户读回当前版本后决定操作，禁止客户端自动替换version重新receive。

终结性reject/withdraw/invalidate要求客户端targetRevision等于**意向冻结值**，但不要求等于已经变化的当前原单revision，否则失效意向永远无法释放；这一例外只终结、不允许入账/改箱。若intentVersion已变，仍先409读回后人工处理。业务字段需变更时先终结旧intent再新建并重扫，不能PUT/PATCH旧意向。作业失效路径在同锁内读取当前intentVersion，调用同一终结服务；与receive竞争最多一方成功。

## 8. Schema影响与迁移约束

本次未连接DB。下面是拟schema，不宣称生产已有字段；开发必须在获准的隔离PG18以冻结基线+TS迁移链重建并核对实体、约束、bootstrap差异。E20仅证明源码声明，不替代实存列验证。

**不必改schema的部分**：历史列表/精确详情、来源关系读取、原日序列化、URL恢复、范围校验、权限映射、禁用逻辑、伪成功/死路由修复、精确班次及全天查询、移动口径标识。历史业务数据不回填；数据量证明需索引时才新增性能迁移。

### 8.1 按最小范围收敛结构

以下M结构是D1-C也需要的身份/原量/幂等保证，不按每个事件新建表。保留原业务表，新增结构仅TypeORM TS；拟表名是实施契约，不是已存在。

| 范围 | 拟表/扩展及约束 | 保留的权威数据 |
|---|---|---|
| M必需 | `pkg_packing_boxes`：UUID PK、packing_id FK、output_ordinal≥0、box_ordinal>0、original_qty>0；UNIQUE(packing_id,output_ordinal,box_ordinal)键全非空 | 原箱→原产出映射；登记版本/hash放事件，不另建box_sets表 |
| M必需 | `pkg_packing_code_registry`：normalized_code PK NOT NULL、state、owner_box_id FK可空；CHECK限定BOUND有owner，其余无owner | 全局namespace，见5.5；owner不是可空唯一列 |
| M必需 | `pkg_packing_code_claims`：id PK、normalized_code FK、box_id FK、kind、raw_code、status、evidence_event_id；UNIQUE(code,box,kind)全非空；每box仅一个ACTIVE规范码partial unique | 合并初稿labels/aliases两表，历史歧义多claim并存；DB延迟约束校验registry与可扫描claim一致 |
| M必需 | `pkg_packing_events`：id UUID、packing_id、event_type、actor_id、server_at、event_key UNIQUE NOT NULL、operation_id、box_id/session_id可空、schema_version、payload、payload_hash；按类型CHECK必填字段/引用 | 合并registration、print-request、print-result、verification-session start/scan/close、label-void、commitReceipt/group snapshot/人员快照；追加不可改，分类投影视图供查询，不另建一组print/parties/commit-evidence表 |
| M必需 | `pkg_packing_operations`：actor_id/action/idempotency_key三列唯一且非空、packing_id、payload_hash、state、result_event_id、created_at/committed_at | 持久幂等结果；不与事件语义混淆；成功与业务同事务 |
| M必需扩展 | `pkg_packing_records`新增workflow_contract_version及label_encoding_version（可空代表尚未发行）、business_revision；仅新v2写入填写 | 原数据不批量升级、不改JSON/原量；箱集合hash/identity version由事件获取。合计为5张新表+原表兼容字段，不是6张新表 |
| E-A专有 | `pkg_handover_intents`：UUID PK、packing_id、intent_version、target_revision、immutable payload/hash、sender/receiver、expires_at、state；partial unique(packing_id) WHERE state='PENDING_RECEIPT' | 真正活跃意向及并发冻结；WITHDRAWN/REJECTED/EXPIRED/INVALIDATED/RECEIVED终态；状态事件写共享events |
| E-A/E-B事件增量 | 在共享events新增RECEIPT_CONFIRMED/RECEIPT_RECORDED类型及handover引用、本人actor、真实received_at、证据 | 不另建receipt表；每handover最多一个有效本人签收用表达式partial unique（非空handover引用必填），撤销/追认另事件，不覆盖旧签收 |
| 仅P5 | `pkg_packing_source_allocations`：packing/output/source-ledger原量分配唯一键和额度锁 | 不计M；来源不明不迁移批量配平 |

统一事件不是任意JSON日志：每种event_type有版本化DTO与DB CHECK，必须校验actor、引用、数量、时间；打印请求用独立eventId引用，扫描唯一(sessionId,boxId,purpose)，commitReceipt对packingId唯一，group snapshot包含原量与引用；表达式唯一索引所用JSON字段不得缺失/null。事件仅追加，持久state仅在registry/intent/operation及原表revision投影中更新，并与事件同事务。每次扫描按session事件绑定的身份/purpose/版本/到期校验，不能因合表丢约束。

M的commitReceipt包含receiverUserId/姓名快照/recordedBy/at，只声明接收人记录，不产生RECEIPT_CONFIRMED。D1-C不建intent/receipt表、不建待签收队列；D1-A加一张意向表和事件类型；D1-B仅增加本人签收事件/队列。旧交接receiver文本原样保留，不给旧行补身份或签收字段。若实施发现事件表达式约束/查询性能必须拆表，须在设计修订中证明收益后审查，不能默认恢复初稿十余表。

证据附件使用现有AttachmentUploader及受权上传接口，payload只保存服务端附件ID/可核验日志行ID，不接受自由URL作为证据。附件引用在登记/签收时重新检查归属、存在性、可读权限和内容hash；没有附件时必须使用可追溯的现场声明事件及真实actor/时刻，不能构造一个不存在的evidenceRef。扫描输入只是用户声明的采集方式，普通浏览器不能证明真来自硬件，界面和审计不夸大其可信度。

人员引用必须匹配实存sys_user键类型，FK禁止级联删除业务证据，姓名留显示快照；nullable只用于“旧事实未知”等非唯一字段，并解释语义。跨表数量合计/活跃标签/收货人不等式用事务校验及可行DB约束共同防护。派生交接状态不新写入原status列；库位状态变化三对齐，新展示枚举需要字典时增加sys_dict幂等种子，不硬编码业务select。

新增结构只落`apps/api/src/database/migrations/<timestamp>-*.ts`，包含可执行up/down、索引/检查/外键意图；不改两处冻结裸SQL目录，不在generic-crud启动时新建表，不通过业务seed创建箱、SKU、用户或旧签收。历史登记是有证据的业务动作，不是迁移批量“补齐”。若旧重复行导致唯一约束不能建，停止并输出治理清单，不删旧证据、不用allowlist掩盖。

迁移down在隔离空数据库验证真实逆向；生产有新增证据后优先兼容读和关闭写功能，不DROP证据表。禁止force/强制回滚；必要的数据保全与生产DDL需另授权。公司/场时区若已有权威配置则复用；不存在才提出独立配置字段TS迁移和明确维护入口，不能默写全公司UTC或SGT。

## 9. 文件级实施阶段、依赖与上线边界

以下均为拟实施，阶段开始以父级审查+用户新批准为前提。API路径可留在现有BFF薄controller，业务抽服务；不能继续在巨大controller复制另一套证据判断。

| 阶段 | 文件级范围（新增以“新”标记） | 依赖、交付与可宣称范围 |
|---|---|---|
| P0 诚实反馈与门禁 | `apps/web/src/app/(admin)/packaging/batch/page.tsx`；`apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx`；`apps/api/src/modules/bff/bff.controller.ts` | 先收口partial、读取失败、假入账及死链接；旧箱身份无法核实的具体原单保持写阻断，不全生产关闭旧写。仅称误导/门禁修复，不称闭环 |
| P1 只读历史与恢复 | 新`apps/api/src/modules/bff/packaging-history.service.ts`、`packaging-evidence.service.ts`、`dto/packaging-history.dto.ts`；调整`bff.controller.ts`及`bff.module.ts`注册；新后台/终端`packaging/history/page.tsx`与`history/[packingCode]/page.tsx`；新`apps/web/src/components/packaging/PackingRecordDetail.tsx`、`hooks/usePackingRecord.ts`；改`lib/packaging-api.ts`、`types/packaging-terminal.ts`、`Sidebar.tsx`、`TerminalNavRail.tsx`、终端layout/标签/交接页；`traceability.service.ts`/controller | P0后。精确列表详情、URL、权限范围、原日、只读状态；无箱登记则操作不可用。P1不需要业务数据迁移 |
| P2 箱身份及PACKAGING事务 | 新`apps/api/src/modules/bff/packaging-box.service.ts`、`packaging-handover.service.ts`、相关DTO；改`packaging-protection.ts`、`bff.controller.ts`、`sales-v2/services/packaging-inventory-integration.service.ts`；新TypeORM TS schema；新`apps/web/src/components/packaging/BoxRegistrationPanel.tsx`；标签/交接页、Selector可注入受限loader | P1后，迁移先于依赖字段的API。服务端身份先完成；P2只做隔离验证，发行须5.4合格，生产confirm必须等P3-M打印/扫描共同就绪；旧单保持显式登记。现有SKU resolver继续复用，无补SKU业务seed |
| P3-M最小打印/扫码；P3-E可选签收 | 新print request/evidence及receipt服务/DTO；改`components/packaging/printLabel.ts`、标签页/交接页/print-logs页；新`terminal/packaging/receipts/page.tsx`及详情组件；D1对应TS结构 | P3-M与P2一同满足M写入门；P3-E只有选择A/B才开发独立签收UI/意向API。真实打印验码或独立接收需要相应现场验收，浏览器mock不能结项实物证据 |
| P4 日报及移动 | 改`apps/web/src/app/(admin)/packaging/daily-report/page.tsx`、终端dashboard/shift-close展示；新summary服务或history服务聚合；改`apps/web/src/app/(mobile)/mobile/packaging/page.tsx`、`lib/mobile-api.ts`；旧terminal packaging service/controller仅保留兼容标识 | P1的统一读模型。后台SHIFT/DAY先交付；移动先标LEGACY_TASKS并加终端口径入口，再切TERMINAL_RECORDS及七日趋势，两个口径不合计，旧接口不静默换义 |
| P5 TEMP精确来源（可后续） | integration/evidence服务；新source allocation服务/TS迁移与对应详情/测试 | 只有证明精确来源分配且防重复后开放TEMP；否则一直只读，不能声称TEMP历史闭环 |

计划新增的目录/文件需在实施时按模块实际导出和依赖核实，不预先创建。所有阶段更新本方案验收状态和变更清单；本次不创建这些文件。

日报规则：精确班次传ID并核原日期；全天聚合该日**所有可见班次**的原包装ACTIVE量，VOID另列，按原包装id去重，不因多来源JOIN倍增；分级量与包装量两列不混用；未归班异常单单列，不能无声丢弃。以productionDate归生产日报，实际receivedAt/printedAt只能用于另外明确的接收/打印统计。移动旧pkg_tasks按completed_at的图标题保留“旧任务统计（不含终端原单）”，切新口径后用同summary API、公司场筛选及相同下钻；旧任务不得与原包装简单UNION求和。P4移动未切换时写明未完成全部渠道一致性。

### 9.1 公司/场试点开关与命令门禁

按**用户批准的(companyCode,siteCode)**试点，服务器从原单权威归属解析开关，不能从body/header猜范围或硬编码包装33。全局默认不推广新工作流，但不是全生产停用旧业务。试点外保留既有业务入口和安全兼容契约，不新显示双人队列、不强制启新模式、不批量升级旧单；试点外回归必须验证旧客户端仍能处理合法、证据完整且原身份可证明的单据。确有身份/范围/partial安全缺口的单据仍必须拒绝，单据阻断不是全局关闭。

安全底座S不受flag关闭影响：DataScope/权限、原日/原量、VOID/real、partial禁止补余、幂等、namespace唯一、服务端箱归属核验。**不能用试点外/旧版本开关绕过已修复漏洞**。旧v1适配器只把已核实的旧码映射为已登记boxId，receiver仅精确可证身份转换；无法证明则409 BOX_IDENTITY_UNRESOLVED/CLIENT_UPGRADE_REQUIRED并保留只读，不生成猜测映射。若兼容预检发现试点外大量单无法安全继续，必须先报影响范围、安排经批准的兼容登记/维护窗口；不得静默全停，也不得容错接受任意码。

开关R=historyRead，B=boxIdentityWrite，P=printEvidenceWrite，V=verificationWrite，H=handoverV2，D=receiptMode(C/A/B)，Q=该编码/设备发行已合格，X=tempExactHandover。按公司/场原子配置一组policyVersion，并记录支持的API/Web版本；不能逐个UI布尔随意放行。R仅控制新入口曝光，原有安全只读查询保留。所有读、命令、轮询都读同一策略版本，发生变化客户端重新GET actions。

| 写命令/能力 | 服务器强制依赖（均含S与本单权限） | 未就绪/模式错误的验收预期 |
|---|---|---|
| 新v2 submit连带箱码、历史登记、标签换贴 | R+B+Q；依赖schema及namespace服务已上线 | Q未合格不发行任何正式码；仅隔离TEST样张；业务增量0 |
| 打印请求/同码补打 | R+B+P+Q；有效箱码，6.4意向条件 | P关闭不调用浏览器打印；已发出的请求仍可记录真实结果事件 |
| verification session/scan | R+B+V；purpose与D/intent匹配 | 缺V不得用本地勾选冒充验码；无有效会话不得提交 |
| M的confirm（D=C）或先入账confirm（D=B） | R+B+P+V+H+Q；P2和P3-M验收；全箱HANDOVER核验 | P2完成但P3-M未通过时H配置拒绝；手工POST也409 WORKFLOW_NOT_READY |
| A意向create | 上行整组就绪+D=A及P3-E；无活跃intent | D=C/B时404/409不可用；同单已有intent时409 ACTIVE_INTENT |
| A receive | 上行整组+D=A；意向有效/双版本/本人全箱RECEIPT核验 | 任何依赖关闭不入账；不得fallback直接confirm |
| A reject/withdraw/invalidate | S+本人或6.4解除权限；不依赖P/V/H可写开关 | 关写后仍能安全释放意向，不被新写flag困住；只有终结事件增量 |
| B本人receive | R+B+V、D=B及P3-E；原COMMITTED证据可验证 | 不依赖H再次入库；只写独立签收事件 |
| TEMP入账/接收 | 对应上述模式整组+X及P5精确来源 | X关闭时只读，不改入口模式，不重复包装入库 |

策略配置验证器不允许H=true而P/V/B/Q缺项；版本不支持P3-M时也拒绝H。新只读R可先开放；schema/API兼容上线不等于开启B。发行Q通过后可在授权试点先进行B/P/V受控验证，但H仍关闭直到对应L1/L3门通过且取得上线/现场授权。A/B签收是额外门，不是M的默认必需项。

试点已有v2单保存contractVersion/encodingVersion；退出试点或回滚后保持只读及安全终结，不降级v1重开写。改变D时先列活跃intent和未签收单，完成或终结后才能切策略；已有commitReceipt保留当时D，不能由C切A后凭空补“待本人签收”。通过兼容矩阵记录试点内新旧客户端、试点外新旧客户端、全部开关缺项、策略切换中的请求及重试结果。安全漏洞修复必须覆盖这些组合。

### 9.2 发布、回滚与观测

顺序：隔离PG及HTTP/DOM验证→Q编码/设备样张合格→批准的schema/API兼容部署→试点R→试点B/P/V软件与设备核验→P2+P3-M整组达到写门并获授权才开H→可选P3-E→P4→单独P5。每步记录API/Web运行revision、迁移末态、试点名单、policyVersion和回退版本；不得以旧main推送授权触发本任务发布。

回滚默认只收紧受影响试点B/P/V/H，保留原有安全读取、已发打印结果记录、A意向安全终结；试点外合法旧业务不因新功能故障全面停摆。证实跨范围安全问题则按真实影响范围另行关闭对应入口并留痕，不能因避免影响放过漏洞。禁止回到绕过S的旧漏洞实现；新证据表保留，向前修复优先，不force、不清表。需要生产执行的回滚另取相应授权。

观测：history读取/范围拒绝、UNRESOLVED、partial阻断、幂等冲突、未知commit、打印UNKNOWN、活跃意向过期/失效释放耗时、每种D的待接收时长、原入账与当前库存两轴异常；按policyVersion/试点范围分组，code不作metrics高基数label。只记白名单脱敏日志。性能目标隔离近真实规模列表/详情P95≤1秒；不以截断明细换速度。任何重复入账/跨范围泄漏停止受影响写路径并核实。

### 9.3 授权边界（互不替代）

| 授权层 | 允许范围 | 不自动包含 |
|---|---|---|
| 方案复核通过 | 方案定稿 | 不含代码修改、测试执行或任何部署 |
| 新批准开发/隔离测试 | 指定阶段代码/TS迁移编写、隔离PG18/测试fixture、HTTP登录与DOM/E2E；是否本地commit按新批准范围 | 不含push、生产DDL、现场打印或生产登录；隔离测试可用明确虚构fixture，不需包装33实物事实 |
| 新批准push/PR | 明确分支/提交的push；事前说明是否会触发CI/CD | 不沿用旧main授权；若会部署，必须已取得对应发布授权或使用不会部署的分支 |
| 新批准生产schema/API/Web发布 | 指定revision、迁移、公司场试点、开关、窗口及回滚范围 | 不包含包装33或其他业务单的实际打印/交接POST/签收 |
| 新批准现场实操 | 明确环境/单号/人员/库位/箱事实/设备及登录、只读、打印、confirm/receive等动作范围 | 不扩大为批量数据修复或任意SQL写入；生产SQL是否允许单列 |

包装33箱码、receiver、库位及真实交付事实仅阻塞该单的生产实操/L4验收，不阻塞已获批准的隔离开发、fixture事务测试和本地浏览器验收。测试合格也不替代现场事实。当前仍只有方案修订授权，以上任何实施授权均未取得。

## 10. 开发测试计划（全部待执行）

本次仅方案，不运行tsc、应用、数据库、测试或浏览器；下面“预期”不是PASS。后续测试只用隔离fixture和授权环境，不读取生产认证artifact。现有PG测试可能skip（E22），报告必须记录server_version_num及实际用例数，skip不算通过。

| 测试号 | 层级及执行对象 | 数据/动作 | 明确预期 |
|---|---|---|---|
| T01 | unit：DTO/日期/游标 | 精确code、33、非法日期、分页上限、跨年/UTC±区、篡改cursor | 精确等值、不截尾；DATE原值不变；错误400/无越权；游标过滤hash一致 |
| T02 | unit：状态核验器 | PENDING、完整、handover-only、batch-only、ledger-only、两侧错SKU/重复ledger | 四态+quality正确；未知非PENDING；partial一律不可写 |
| T03 | unit：箱/别名 | 多单同尾号、PH/BOX、>100盒、多产出、不同alias同box、VOID标签 | 新码不碰撞；旧歧义拒绝；按boxId去重；不虚构映射 |
| T04 | unit：原量与来源 | 同SKU多产出聚合、不同规格、原eggs≠boxes×规格、同日他单来源、可用量下降 | 每组原qty/ledger校验；无分配显示RELATED_ONLY；available不参与原入库判定 |
| T05 | PG18事务 | 全迁移链隔离重建；两产出，各1盒30枚/1盒20枚；第二组ledger失败、交接insert失败 | 所有批次/ledger/交接/operation结果回滚，无首组残留 |
| T06 | PG18并发 | 同code双提交同key；不同key同payload；同key换receiver/库位；submit对VOID/换标并发 | 最多一次逻辑提交，结果相同或409；锁顺序无死锁；原量不变 |
| T07 | PG18未知commit | DB已commit后断响应、commit前断连接、查询operation重试 | 前者返回同一结果无增量；后者原key可重试；不自动新key |
| T08 | PG18身份与签收 | 同ordinal并发登记、别名碰撞、同一receiver重复签收、sender自签、拒收后重收 | 唯一约束生效；双人策略阻断自签；拒收不入账；重复签收不二次库存 |
| T09 | PG18精确证据 | 错SKU等总量、孤立ledger、重复交接、已售available=0、后续移位、主数据停用 | 异常阻断；完整历史提交按原快照仍可读；不补余、不改原量 |
| T10 | HTTP权限集成 | 无会话、OP:V、OP:V/E、MGR:V、MGR:E-only、无仓/跨公司场仓、global、权限版本变化 | 401/403/404正确；方法级OR只放指定GET；每个子详情/日志/候选/箱解析无泄漏；绕UI提交也拒绝 |
| T11 | DOM | URL A/B乱序、切班、换账号、全屏卸载重挂、状态失败/partial、空箱 | 旧数据不闪现；原单不跟班次变；提交禁用原因明确；不自动POST |
| T12 | DOM请求客户端 | 401、过期会话、写请求超时、GET错误、return query | strict readonly无refresh POST；写不通用重放；原code在安全return保留；不报假成功 |
| T13 | 浏览器E2E：本地真实API/PG18 | 创建隔离历史CLOSED fixture；列表精确code→详情→新标签页/硬刷新/全屏/切班 | API请求均带原code，原日期/原shift不变；无需重开班；V无写、E可按条件走 |
| T14 | 浏览器E2E：打印/扫码 | 请求日志失败、浏览器取消、print异常、回报超时、补打、PH/BOX错单、同箱多别名 | 无自动重复出纸；UNKNOWN正确；扫码只认已持久身份；补打箱数不增 |
| T15 | 浏览器E2E：报表导航 | 同日两班不同量、跨日打印接收、后台全天/精确班次、移动旧/新、旧死路由 | 全天求和/班次精确；旧新不相加；无setStep成功；链接可达选单 |
| T16 | 浏览器跨时区 | Asia/Vientiane、Asia/Singapore、UTC、America/Los_Angeles及夏令时日期 | 原DATE/标签生产日一致；实际时间明确时区；日报业务边界一致 |
| T17 | PG18 TEMP后续 | 同场日多单、多源部分分配、并发超额认领、原qty与available不同 | 场日相等不算精确；来源额度锁正确；无PACKAGING重复入库 |
| T18 | 真实现场（另授权） | 真实箱码及数量、打印机出纸、贴标可读、实际库位、receiver本人收货 | 实物与系统同箱同量；有真实签收事实，不能以浏览器mock/日志替代 |

测试文件规划：复用并扩展`apps/api/src/modules/bff/packaging-readiness.pg.spec.ts`、`packaging-protection.spec.ts`、integration.service.spec.ts；新增history/evidence/box/receipt的unit和PG spec；Web复用`packaging-terminal-context.dom.test.tsx`、`bug-20260722-0003-warehouse-handover.test.ts`、`bug-20260723-0005-packaging-workbench-navigation.test.ts`，新增URL历史恢复与打印证据DOM/E2E。HTTP Guard测试必须走真实Nest路由/权限解析，不能只用controller mock证明权限。

实施验证门：API tsc、Web tsc、相关unit/DOM、真实PG18和HTTP权限、浏览器E2E；运行`check-nullable-in-unique.js`、`check-constraint-drift.js`及entity drift门禁并人工核对动态SQL。scope-audit必须分别完成10.1既有运行时脚本和新增真实HTTP普通账号矩阵；rg只负责静态裸输入定位，不能代替运行时审计。PG事务测试不得用SQLite替代。浏览器不可用=待验收，PG跳过=未执行，设备mock=仅软件通过。

### 10.1 既有runtime scope-audit实际执行方案与历史失败台账

已只读复核E23。批准开发测试后，在隔离可丢弃本地PG18及本地API3100环境执行仓库原命令`bash apps/api/test/scope-audit.sh`，记录脚本revision/hash、开始结束时间、exit code、逐条PASS/FAIL/SKIP和脱敏输出；不用`bash -x`、不打印凭据/headers，不引用生产认证artifact。脚本会POST本地登录；这不是只读扫描。本次不运行。

运行前确认3100确为隔离API、DB不指生产、fixture账号/角色/公司/采购单及shipment已按测试计划准备（业务fixture走测试seed，不进迁移）；脚本的固定PO id=6/2、macOS绝对psql路径及finance旧路由须记录兼容性。先保留原脚本实际结果；Linux路径缺失/固定fixture缺失不得静默跳过。如果适配脚本/fixture需要代码变更，应在批准开发范围内单独记录最小差异和理由，原脚本与适配后结果分栏，不能删除旧断言或造旧finance假成功路由来“变绿”。

| 历史/可能失败分类 | 已知依据 / 复跑判定 | 处理及结项 |
|---|---|---|
| ENV_UNAVAILABLE | 3100不可达、HTTP000；其他历史报告亦记载此类 | 修隔离环境后原套件重跑；未跑到断言=未验收，不是权限PASS |
| FIXTURE_MISSING | E23引用报告51/71行：固定测试用户不存在；脚本固定PO样本 | 隔离fixture明确准备并记录；禁止使用生产账号补齐；保留此前FAIL |
| RUNNER_PLATFORM / NO_SAMPLE | 脚本318–331行macOS psql绝对路径/无shipment样本 | 平台适配单独评审；SKIP须补真实fixture测试，不能算PASS |
| LEGACY_ROUTE_DRIFT | 历史finance summary/ar-aging 404，脚本350–428仍覆盖旧路径 | 单独确认路由现状/迁移意图；旧失败列为未满足门，修复或明确有权评审的例外，不能因新包装绿就抹掉 |
| ASSERTION_GAP | 163–170只GET200就称scope生效；部分total仅打印、空company被容忍 | 记录测试不足；新增真实数据断言补强但不修改原脚本的既有结果；不靠admin200验scope |
| RBAC/DATASCOPE_REGRESSION | 有效普通账号返回越权数据、总数或可区别响应 | 真缺陷，必须修复并复跑；不可用历史失败/环境问题归类掩盖 |

包装新HTTP矩阵T10/T22：真实Nest Guard+真实PG18，普通OP:V、OP:E、MGR:V、公司内不同场/仓、无仓范围、权限撤销账号。每账号有至少一条应可见和一条不可见样本，并有两单同alias跨范围歧义样本；直接URL调用列表、totalMatching/hasMore/cursor、精确code详情、所有子资源、日志、candidates、alias resolve、operation、intent及receipt队列，不能仅从菜单点击。断言响应字段值、计数、原归属、404/403和错误体，而非只200。

侧信道对照：不存在码、仅越权码、跨范围冲突码的普通查询同一通用不可解析/不可访问类别，响应无另一方ID/计数/枚数/存在提示；计数与分页不含隐藏单。用相同数据规模重复测响应体长度类别/查询路径及时间分布，检查是否有明显可利用分叉，不承诺网络绝对恒时；避免返回partial列表暴露隐藏存在。新专项结果、原运行时脚本结果、静态rg结果三栏分别报告。原套件仍FAIL/SKIP/未执行时全仓scope-audit不能PASS；未经审查解决或明确例外的旧发布门仍阻止生产发布，隔离开发测试可继续，不被旧缺陷阻塞所有进度。

### 10.2 父级review新增测试（均待执行）

| 测试号 | 数据/并发或配置 | 预期 |
|---|---|---|
| T19 | PG18不同原单同时规范发行/alias登记同码；逆序多码；RETIRED抢占 | registry只有一个槽位；规范至多一owner，旧多claim歧义保留，触发器/唯一约束生效，无SELECT-INSERT竞态/死锁 |
| T20 | A活跃intent下再交付/直接confirm/换标；同码补打；sender撤回/receiver拒收；双人均停用、权限撤销、库位停用、作业延迟/并发receive | 动作矩阵全部符合6.4；双版本409一致；所有终结库存增量0；没有活跃意向永久阻塞或自动入账；新意向必须重扫 |
| T21 | 每个flag缺项、P2先完成/P3-M未完成、Q未合格；试点内外×新旧客户端×D=C/A/B；关H后撤回；策略切换 | 9.1各行命令真实HTTP断言；缺项不能开H；试点外合法旧业务可继续且安全漏洞不能绕过flag；v2不降级 |
| T22 | 原runtime脚本+普通账号全部直接URL与alias侧信道矩阵 | 按10.1分别留存旧失败与新结果；分页total无泄漏，通用错误不泄漏隐藏冲突 |
| T23 | 新commitReceipt后合法移库/拆批/销售耗尽；旧无snapshot且演进链缺失；PBX长度/替代编码样张测试 | 原COMMITTED不因合法演进消失；旧未知禁重入账；Q不合格不发行，替代编码发行前确定，已发行身份保留 |

## 11. 编号验收与需求追踪

### 11.1 统一证据层级

L0方案/代码审查；L1本地实际测试；L2已部署API/Web revision+迁移末态+开关范围；L3真实浏览器操作及已脱敏请求/响应；L4现场真实出纸/箱数/交付/本人签收。每条验收分别登记L0–L4的PASS/FAIL/待验收/不适用、时间、环境、执行人、artifact引用；不得由上一层推导下一层。L2不能只写远端checkout，需核实API/Web运行镜像；PR状态不能代替树差异。日志、截图不得含token/password/cookie。

| 验收号 | 条件与可审计预期数据 | 必需证据/通过界限 |
|---|---|---|
| A01 | 精确原code跨日查出一单；同尾号其他单不匹配；CLOSED/VOID均可筛；>100记录翻页无无声截断 | L1查询用例+L3列表筛选/响应；当前日期默认不屏蔽精确code |
| A02 | 详情原JSON每个产出、总盒枚、原日期/班次、精确来源路径及UNKNOWN分摊均正确；越权公司/场/仓返回不可访问 | L1/T04/T10+L3详情；源码trace基本查询不足以通过 |
| A03 | 原code在刷新、新标签页、全屏重入、换账号/切班、A/B乱序后不串单；当前班次不被历史覆盖 | L1 DOM+L3录屏/请求；换账号清屏、无旧用户敏感闪现 |
| A04 | 新单每盒一个服务端boxId、重试不变；多单多盒/同尾号不碰撞；旧PH/BOX必须有实证映射；歧义阻断 | L1 PG唯一约束/数据快照+L3扫码；旧映射缺失只能待核实 |
| A05 | 正常打印/补打只增请求事件不增箱；浏览器取消/回报未知不标已出纸；实际标签与原日、码一致 | L1/T14+L3请求/日志+L4真实纸标；无设备/现场只能软件部分通过 |
| A06 | 30枚原量的批次qty=30及PACKAGING_INBOUND ledger qty_change=30；available变为0仍保留曾经提交证据；错SKU等总量被拒绝 | L1 PG原量/逐组证据；L2后受权只读核对；不能用available证明原入库 |
| A07 | ACTIVE+CLOSED+原日可完整交接；VOID不行；HANDOVER_ONLY/INVENTORY_ONLY/孤立ledger/查询失败禁止写且无新增记录 | L1并发/事务+L3按钮/错误；没有force或自动补余 |
| A08 | 同key同payload超时重试一次提交；改receiver/库位409；第二组/交接失败全回滚；重复签收不重复入库 | L1 PG前后行数/原量/operation结果+L3未知commit流程 |
| A09 | OP/MGR读权限一致；V无写、MGR:E不隐式OP:E；401只读模式不refresh；候选均在公司场仓范围 | L1 HTTP+L3受限账号；不能用admin一账号替代权限验收 |
| A10 | 日报shift56精确，全天=所有授权班次ACTIVE原单合计，分级量独列；跨日打印不改生产日报；移动明确旧或已切新 | L1多班次fixture+L3桌面/移动；移动未切不得称全部口径统一 |
| A11 | 旧向导只读，没有setStep已入仓文案；所有处理链接以原code可达，无关联时回历史选单 | L1路由/DOM+L3导航；不可静默用旧task_no生成原单 |
| A12-C | 最小C：一次confirm原子入账，真实receiverUserId/姓名/操作者/时刻留证，receiptState=RECORDED，无intent或本人签收事件 | L1/T05–T07+L3流程+L4实际交付；可验收一次交接入库，不声称独立签收 |
| A12-A | 选A时两名真实人员，receiver本人实扫全箱，intent/原交接/库存/本人receipt原子一致 | L1/T08/T20+L3不同会话+L4本人收货；未选A为不适用，不能阻塞C通过 |
| A12-B | 选B时先COMMITTED/PENDING_RECEIPT，再本人签收，第二步库存增量0 | L1/T08+L3+L4；明确账先于独立签收的窗口，未选B为不适用 |
| A13 | 迁移仅TS、up/down/唯一/nullable/CHECK与写值一致；旧业务事实不自动回填；回滚关写保留证据 | L0 diff+L1迁移/门禁+L2授权部署/回滚记录；不存在迁移执行证据就待验收 |
| A14 | TEMP多单精确分配不重用场日库存，原qty/ledger对齐；无分配时UI说明未支持且禁止写 | P5开启需L1/T17+L3；P5未纳入时仅“安全关闭”验收，非TEMP闭环PASS |
| A15 | A活跃意向PENDING_RECEIPT+库存PENDING仍禁止再次交付/confirm/换码；双版本receive/reject一致；撤回/拒收/停用/撤权/过期释放不入账，重新意向重扫 | L1/T20并发及HTTP+L3动作；每条终结增量0、无长期事务锁；仅A适用 |
| A16 | 试点内外新旧客户端/各D/所有flag缺项逐组合符合9.1；P2就绪而Q未合格不能正式发码；P3-M未就绪不能开启confirm入账；关写仍可安全终结 | L1/T21+L2策略revision+L3兼容验证；试点外合法流程保持，无flag安全旁路 |
| A17 | 编码发行前完成36字符PBX或评审替代方案的Code128/模板/dpi/扫码容量测试；未合格无正式新码 | L1软件容量测试+获权测试设备样张证据；L2记录encodingVersion，已发行身份不可追溯性破坏=FAIL |
| A18 | 原runtime scope-audit真实执行及旧失败分类保留；新普通账号直接URL/total/alias侧信道另证，不以新绿掩旧红 | L1/T10/T22，逐条原脚本结果+新增HTTP结果+静态结果；仍未执行/失败不能称全仓scope PASS |
| A19 | 原入账snapshot/ledger权威明确；合法移库拆批销售后COMMITTED不丢；旧证据未知阻断重入账；D1-C不新增A专有结构 | L1/T09/T23+迁移diff审查；当前可用量/归属不冒充原量/原位置 |


### 11.2 包装33精确样本验收卡（非代码条件）

仅在用户新授权的真实环境操作时使用E01历史样本：`id33 / PKG-20260910-163616 / 2026-09-10 / shift56 / 30枚1盒`及对应场公司。先只读复核当前原单、模式、原量、交接/批次/ledger、SKU可用性与权限；若与历史记录不同停止并更新证据，不强行满足旧预期。不得把同班次120枚4盒录到本单。

若仍PENDING且PACKAGING模式，预期批准操作前本链交接/批次/入库ledger均0；完成一次后交接恰好1，本单1个原产出若确为单SKU/规格则对应1批次qty=30和1条PACKAGING_INBOUND qty_change=30，boxId仅1且匹配**现场提供的真实箱码**。若实际多产出/模式不同，按真实原JSON和第7节重新判定，不能把预期行数硬编码。原单仍ACTIVE、原日不变、班次仍CLOSED；重复相同请求增量0。receipt是否出现由D1及实际本人收货决定。

实际执行前必须补齐并由现场确认：真实箱码与箱内30枚/1盒事实、现有标签是否实际打印/贴标、receiver稳定ID（仅 D1-A/B 另要求接收员本人可用会话；D1-C 不要求独立接收会话）、真实warehouse/location、实际交付人与时间、可用打印机及授权操作范围。缺任一必要事实只能只读展示“待核实”；不得猜码、造receiver、随意找库位、重提包装、重开班或补SKU修改原单。生产登录/POST/SQL/打印各按授权范围执行；只读浏览若会401刷新须阻断并记待验收，不偷用新登录补结果。

### 11.3 需求→设计→实施→测试→验收矩阵

| 需求 | 设计章节 | 实施阶段 | 测试 | 验收 |
|---|---|---|---|---|
| R01 | 3.1–3.2、7.2 | P1 | T01/T10/T13 | A01 |
| R02 | 3.3、6.1、7.2/7.4 | P1/P2 | T04/T09/T10 | A02/A06 |
| R03 | 4.1–4.2 | P1 | T11/T12/T13/T16 | A03 |
| R04 | 5.1–5.5、8 | P2/P3-M | T03/T06/T14/T19/T23 | A04/A17 |
| R05 | 5.3、7.3 | P3-M | T12/T14/T18 | A05 |
| R06 | 4.2–4.3、7.4 | P0/P1/P2 | T02/T09/T16 | A06/A07 |
| R07 | 6.1–6.2、7.2、10.1 | P1/P2 | T10/T12/T22 | A09/A18 |
| R08 | 3.1、9 | P0/P1 | T11/T15 | A11 |
| R09 | 7.2、9日报规则 | P4 | T15/T16 | A10 |
| R10 | 7.4–7.5、8 | P2/P5 | T05/T06/T07/T09/T17/T19/T23 | A06/A08/A14/A19 |
| R11 | 6.3–6.4、7.3/7.5、8 | P3-M；选A/B才P3-E | T08/T18/T20 | A12-C；可选A12-A/B、A15 |
| R12 | 9–11 | 各阶段 | 所有适用测试+类型/约束/runtime scope门禁/T21 | A01–A19分层记录，A12按模式 |

## 12. 最小待决策与父级复核状态

**状态：父级复核修订稿待复核。** 父级已读433行初稿并认可方向，本轮按10项review修订；方向通过不等于用户实施批准。本轮只改本文件，父级将再复核，不直接询问用户、不实施。

1. **D1：建议以C的一次交接入库作为最小范围。** 若用户另外确认需要独立双人职责分离，推荐增强A；B是用户接受先入账后签收窗口时的备选。没有双人选择不阻塞C的需求成立，C不能被包装成独立签收。
2. **D2：建议先P0/P1只读，再P2+P3-M共同完成M最小闭环并选授权公司/场试点；P4全渠道口径单独结项，P5 TEMP保留明确边界。** 选择A/B才增加P3-E。全渠道C+P4可称一次交接入库完整渠道闭环，无须强制选择A。

父级复核后才能询问用户新批准，授权依9.3分层：开发/隔离测试、push/PR、生产schema/API/Web发布、现场真实业务操作各不相互推导；不挪用旧main授权。包装33现场箱码/receiver/库位缺失不妨碍获准隔离fixture开发与验收，仅限制该单生产实操。

本次没有运行应用、API/SQL、测试、浏览器或打印；L1/L2/L3/L4仍未执行/待验收，不声明PASS。既有scope-audit历史失败未消除，需按10.1真实重跑及分类。PR229/部署状态仍按原证据分层，不以合并与否推断代码缺失。

## 13. 父级review问题→修订节→验收对应表

| review | 父级问题 | 本轮修订节与结果 | 验收对应 |
|---|---|---|---|
| RV01 | 双人不应成为最小必选 | 6.3、12：C为M基线，A/B可选；两套范围、相对复杂度、表/API/测试增量；全渠道不强制双人 | A12-C/A12-A/A12-B；未选增强为不适用 |
| RV02 | 活跃intent与库存PENDING冲突，退出不全 | 6.4：读/同码补打允许条件，禁止再次交付/confirm/换标重登记；撤回/拒收/过期/停用/撤权/库位失效释放；只终结不入账、不长锁 | T20、A15 |
| RV03 | DTO双版本及P2早开写 | 7.3/7.5统一intentVersion+targetRevision/409；9.1写命令×flag完整矩阵，P2等待P3-M/Q | T20/T21、A15/A16 |
| RV04 | 跨表并发箱码碰撞 | 5.5、8.1统一namespace PK、claim FK/唯一/延迟约束、固定锁序；真实旧歧义保留，禁无锁预查插入 | T19、A04 |
| RV05 | 当前归属与原COMMITTED冲突 | 4.3/7.4：原入账commitReceipt/ledger/snapshot与当前演进分轴；新旧证据策略明确，合法移库拆批耗尽不重入账 | T09/T23、A06/A19 |
| RV06 | scope审计不能只有rg | E23、10.1：原runtime脚本执行计划、历史失败分类；新增普通账号HTTP全端点/total/alias侧信道，不遮旧失败 | T10/T22、A09/A18 |
| RV07 | 全生产关闭旧写与flag旁路 | 9.1/9.2：授权公司场试点、读/发码/打印/扫描/confirm/receipt协调、试点外合法兼容；安全底座S无flag豁免 | T21、A16 |
| RV08 | 长PBX码未验先发行 | 5.4：Q发行前置、Code128/标签/dpi/扫码容量；发行前替代码评估，已发行同box身份可追溯 | T23、A17 |
| RV09 | 最小schema膨胀 | 8.1：M为5张新表+兼容字段，合并append-only事件；A只增intent，A/B签收事件复用，P5不计M | A13/A19，迁移与DTO约束审查 |
| RV10 | 授权层级及包装33事实阻塞 | 9.3、11.2、12：新批准开发/测试、push、生产schema发布、现场实操分别界定；现场事实不阻塞隔离开发 | A13/A16的授权记录、L1与L4独立登记 |

本轮边界自检仅检查文档结构、review映射和工作区变动，不计入业务测试或runtime scope-audit。初稿引用行号保持对应原源码基线；新增E23为本轮只读复核出处。
