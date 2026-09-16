# 包装历史工作流本地实施与验收

> 最新追加见文末Review30：资金summary泄露已按授权修复；f8624273上49真实HTTP通过、原25组重新执行，原raw scope仍FAIL保留；正式Node20/候选/browser/P95重验完成。生产audit34818687355仍原因未知，新metadata通道待审，未发布。此前应用交付见文末“A/B及父级追加27–29”与“最终测试映射”：应用cdb49bb1、候选runner补丁d1537fe4，entity267/300与constraint通过；原scope-audit仍28FAIL/1skip，未发布。此前各轮记录仅作历史证据。

## 授权与交付边界

2026-09-14，唯一执行者为当前 Codex CLI，无子代理。用户明确授权 D1-C、P0–P4（排除 P3-E/P5），仅本地源码、TypeORM TS 迁移、隔离 fixture、实际测试及 local commit。方案顶部已标注本轮授权覆盖旧 design-only 文字；11.2 本人登录条件只适用 A/B，C 不需要独立接收员会话。

没有 push、生产 SSH/SQL/HTTP 登录或 POST、部署、workflow dispatch、生产打印、读取生产认证 artifact、改 secret 或全局/CLI 配置。没有 force/reset/amend，未清理既有文件。起点 main 为 `69d89dd44b8e1461d7eaf5193e60c994255aed2c`，专用分支 `impl/packaging-history-d1c-local`。既有未跟踪 audit、协调者 review、其他 artifacts 均保留并不纳入提交。

本报告只验收独立本地软件工作。L2 生产发布未执行；L4 设备出纸、实物贴标、实际交付未执行。A/B 的 intent、独立签收、TEMP 分配没有实现，也没有新增审批。生产 policy 没有 seed、没有启用，Q 未物理合格不能发行正式 PBX 编码。

## 阶段改动

| 阶段 | 实际落地 |
|---|---|
| P0 | 后台分级向导改只读，移除 `setStep` 假入账成功；旧交接状态读取失败/partial 不当 PENDING，不自动补余或全选冒充扫码；旧死链接转历史选单。 |
| P1 | 后台/终端独立 history 与原 code 详情 URL。数据库内日期/公司/场/班次/状态/模式筛选、25/50/100 分页、原日与 id keyset、签名游标及过滤/权限绑定、精确可见计数。原单 CLOSED 可恢复，当前班次不参与历史 GET。来源只按原 grading 集合和 source link，分摊显示 RELATED_ONLY；完整链条必须落在同一菜单授权范围。原包装 trace 采用已核实范围的原链，销售/财务下游需独立范围查询。 |
| P2 | 五表：boxes、code_registry、code_claims、operations、events；兼容版本字段与业务 revision。统一 namespace、稳定 boxId、逐产出 ordinal、原数量；规范码/旧别名共用占位，歧义保留 claims、退役不可抢占。事件只追加，session/actor/box 引用校验、typed JSON CHECK、单 commitReceipt、幂等唯一约束。无自动批量补旧码。 |
| P2 事务 | 复用原库存服务，固定锁顺序：共享包装链锁→原单锁→排序 namespace 锁；同事务写所有库存批次、原流水、旧交接兼容行、commitReceipt、operation。原日/CLOSED、逐组 SKU/规格/数量/流水核验；partial 一律禁补余。不可变原入账和当前库存分开，available=0 不抹掉曾经提交。当前演进解释不足时标 UNKNOWN。孤立 snapshot 不得重新视为可写 PENDING。 |
| P3-M / D1-C | 先持久化 PRINT_REQUEST，再调用浏览器；仅回报 DISPATCHED/FAILED/UNKNOWN，不称已出纸。Code128 复用已有生成器，隔离标签明确 TEST/NON-BUSINESS。同码补打不新增箱，旧码逐箱实测声明。LABEL_CHECK/HANDOVER 独立会话、逐箱扫描、到期/revision/操作者检查，confirm 再解析 namespace；重复扫描返回409。一次 confirm 留 receiverUserId/姓名快照/操作者/时间，receiptState=RECORDED，无本人签收声明。 |
| 请求恢复与兼容 | 不做401刷新POST或自动重放。原身份/code 键隔离异步响应，卸载后不打印。未知 confirm 将原 key 与原 body 按用户/原单保存在 sessionStorage；先查 operation，NOT_FOUND 后可明确手动原键重试。旧字段适配只接受可解析真实箱、已有本人扫描、唯一接收人；关旗后已提交操作可查回，不能利用旧接口绕过安全条件。 |
| P4 | 共用生产 summary：DAY 所有授权班次 ACTIVE 原包装量、SHIFT 精确 ID 与日期、VOID 另列、分级量另列、七日补零、原单下钻。后台/移动已切同接口，终端概览与交班页同口径；旧交接记录数单列。无法安全归属的异常单明确 NOT_ATTRIBUTABLE，不假定为0。旧任务接口未静默换义。 |

policy 从 `sys_dict` 的 `PKG_HISTORY_POLICY` 按精确 company/site 读取整组配置，默认全关；Q 必须有独立物理合格记录与设备 profile。仓库内没有本轮生产配置行或硬编码包装33。隔离 harness 仅为 TEST 公司/场注入 TEST 策略；该覆写不在应用生产启动路径。

## 隔离环境与迁移证据

- PG18.6，`server_version_num=180006`，专用 DB `packaging_history_test`，只绑定 `127.0.0.1:55432`。实际运行容器 `packaging-history-test-pg18-rebuild2`；前几轮容器停止并保留，没有删除证据。
- 每次修改已经执行过的迁移后都新建空库。最终 `rebuild2-sql.log`：195/195；`rebuild2-bootstrap.log`：diagnostics=0；`rebuild2-ts.log`：82 个真实 APPLIED。新增迁移 `1789353300496-PackagingHistoryD1cEvidence.ts`；两处冻结 SQL 目录未改。
- baseline 另用独立 `127.0.0.1:55434` 空库，仅执行旧81条 TS，其他条件一致。baseline 与新库真实 TypeORM只读diff均393，增量0；实体文件未变。原门禁阈值300仍失败，未修改门禁或allowlist消红。
- 完整 AppModule API 只监听本地3100，启动前清除继承应用变量、生成临时随机 JWT key，不加载生产凭据；网络连接仅允许本地测试端口。真实 HTTP 普通账号使用新生成随机密码登录，不保存 token/password/cookie 日志。
- 浏览器采用本地已有 Playwright 镜像 runtime 副本及任务目录共享库，独立会话，只允许localhost请求；未安装系统包或改CLI。Next dev 绑定127.0.0.1:3000，最后运行明确 `NODE_ENV=development`。`window.print` 仅测试替身，因此不是实物打印证据。
- up/down/up 在独立事务 schema 实际执行；任一证据模型非空则 down 拒绝。新增迁移 `@allow-data-dml` 注释仅说明 CREATE TRIGGER 的 UPDATE 事件语法被旧正则误报，人工检查 up 无业务数据 DML，不把业务 seed 放进迁移。

## 实际命令与结果

精确命令、cwd、开始/结束时间、exit、signal 和逐轮日志见 `artifacts/packaging-history-local/verification-results.json`；执行脚本为 `scripts/packaging-history-test/verify.cjs`。同名重跑使用 `-rN` 日志，失败日志不覆盖。最终汇总如下。runner只按本次执行项决定exit；旧失败轮次仍保留在总账。

| 命令组（完整argv见JSON） | 最新exit | 实际结果 | 日志 |
|---|---:|---|---|
| api-tsc | 0 | 实际执行完成；无用例数声明 | [verified-api-tsc-r8.log](../../artifacts/packaging-history-local/verified-api-tsc-r8.log) |
| web-tsc | 0 | 实际执行完成；无用例数声明 | [verified-web-tsc-r6.log](../../artifacts/packaging-history-local/verified-web-tsc-r6.log) |
| api-unit | 0 | 47 pass / 8 skip / 0 fail | [verified-api-unit-r2.log](../../artifacts/packaging-history-local/verified-api-unit-r2.log) |
| pg-http | 0 | 47 pass（31 PG + 16 HTTP）/ 0 skip / 0 fail | [verified-pg-http-r7.log](../../artifacts/packaging-history-local/verified-pg-http-r7.log) |
| web-dom | 0 | 54 pass（含4条静态旧回归）/ 0 skip / 0 fail | [verified-web-dom-r5.log](../../artifacts/packaging-history-local/verified-web-dom-r5.log) |
| nullable | 0 | 实际执行完成；无用例数声明 | [verified-nullable-r3.log](../../artifacts/packaging-history-local/verified-nullable-r3.log) |
| constraint | 0 | 实际执行完成；无用例数声明 | [verified-constraint-r2.log](../../artifacts/packaging-history-local/verified-constraint-r2.log) |
| migration-down | 0 | 实际执行完成；无用例数声明 | [verified-migration-down-r2.log](../../artifacts/packaging-history-local/verified-migration-down-r2.log) |
| migration-dml | 0 | 实际执行完成；无用例数声明 | [verified-migration-dml-r2.log](../../artifacts/packaging-history-local/verified-migration-dml-r2.log) |
| entity-diff | 0 | 393 条只读 schema 差异 | [verified-entity-diff-r2.log](../../artifacts/packaging-history-local/verified-entity-diff-r2.log) |
| entity-gate | 1 | 393 > 300；旧81迁移链同为393 | [verified-entity-gate-r2.log](../../artifacts/packaging-history-local/verified-entity-gate-r2.log) |
| runtime-scope-audit | 1 | 原脚本打印 2 pass / 28 fail / 1 skip，含F06假阳性风险 | [verified-runtime-scope-audit-r2.log](../../artifacts/packaging-history-local/verified-runtime-scope-audit-r2.log) |
| browser | 0 | 16 pass / 0 skip / 0 fail | [verified-browser-r5.log](../../artifacts/packaging-history-local/verified-browser-r5.log) |

旧失败独立保留：

1. 原 `bash apps/api/test/scope-audit.sh` 未改，SHA256 `463a0263dc94a65c7d9010eab8fcbf1e5cc481666b9333709bc3156c0e754a96`。实际打印2 PASS /28 FAIL /1 SKIP，exit1。六个固定旧账号在全新 fixture 不存在，相关请求401；旧 finance summary/ar-aging/accounts 路由404；Shipment 样例缺失SKIP，脚本保留macOS psql路径的平台限制。F06以错误响应空数据计PASS，不能把该输出当作跨公司证明；只有实际身份矩阵另证，不宣称全仓scope PASS。
2. entity drift：实际生成393条schema差异，393>300，exit1；同环境旧迁移链同为393，非本轮增量。两个diff均只生成、不执行，没有用缺失文件导致的0差异假PASS。
3. 旧 API 单测的8项 PostgreSQL条件组未设置其专属 `PACKAGING_TEST_DATABASE_URL`，保持skip；不把新专项当成这8项执行。新专项使用固定隔离连接，真实 PG/HTTP 用例没有skip。
4. 早期错误均保留：未发布端口 ECONNREFUSED；Docker浏览器网络不通、局部runtime缺库；NODE_ENV=production下DOM act不可用；旧navigation mock不全；fixture字段/长度、JWT模块初始化顺序、测试SQL UUID/text类型、Jest配置/cwd、测试类型声明；日报权限重定向已修复；unknown模拟刷新早于服务端响应及POST实际201被误判已修复。少数手工命令的错误cwd在重定向阶段失败、未执行测试，不计PASS。

## 需求—测试—验收矩阵

L0=代码/方案，L1=本地测试，L3=隔离真实浏览器。下表“软件”不包含未授权L2生产或L4物理验收。

| 验收 | 本地证据与边界 |
|---|---|
| A01/T01 | 精确code、非法日期/空code/枚举400、签名篡改及过滤绑定；131条同日记录全部游标遍历；浏览器精确查询。 |
| A02/T04/T10 | 显式来源集合、ACTIVE/real/原班次/原日，跨公司来源与仓库证据整单隐藏；原产出、RELATED_ONLY和原量展示。 |
| A03/T11–13 | DOM乱序A/B/A、换账号、重挂、GET失败，真实终端无当前班次、CLOSED/新标签页/硬刷新恢复原code。 |
| A04/T03/T19 | 同键登记重放、101盒唯一身份、跨单别名歧义、退役码不可抢、扫描后新歧义阻断；无猜测旧映射。 |
| A05/T14 | 真实HTTP打印请求/浏览器调用/回报与扫描分开；卸载后的迟到请求不打印。L4纸标/耗材/设备取消及容错仍待实物验收。 |
| A06/T04/T09 | 30+20两组入账，available=0保留COMMITTED；等总量错SKU判partial；当前qty演进UNKNOWN，原snapshot保留。 |
| A07/T02/T09 | CLOSED原日入账、来源VOID/测试/错班阻断，handover-only不补余、孤立snapshot不变PENDING，读取错误不生成控件。 |
| A08/T05–07 | 同键同payload并发相同结果、不同键仅一次、改receiver409；第二组ledger/交接insert注入失败全回滚；断响应后持久原key查询，无自动重发。 |
| A09/T10/T12/T22 | 真实登录OP V/E、MGR V/E-only、无范围、普通角色显式GROUP、跨公司/来源/仓库、子详情/candidate/operation/alias统一错误、撤权401；V手工POST403。 |
| A10/T15 | 同日两班DAY=100/4、SHIFT=50/2、VOID另计、grading单列；七日补零；后台与移动浏览器同接口。终端概览/交班同原单summary。 |
| A11 | 旧假成功删除、旧URL无code选单、带code恢复；后台旧参数不发新码。 |
| A12-C | 真实PG事务与浏览器一次confirm、RECORDED及接收人记录；没有第二会话要求。L4实际交付未执行。 |
| A12-A/B、A15、T20 | 不适用，本轮明确排除P3-E，无intent/双人队列/独立receipt。 |
| A13 | 新TS五表、82迁移重建、空up/down/up/非空拒绝、typed CHECK反例/不可变事件；nullable/constraint/down/DML真跑。entity旧基线红灯保留，L2发布未做。 |
| A14/T17 | TEMP仅验证安全关闭与零增量；无精确分配，不宣称TEMP闭环。P5排除。 |
| A16/T21 | 默认全关、R/B/P/V/H/Q逐缺项、无合格证据Q不成立、跨site配置拒绝；旧适配有证据才继续、关旗提交回查。生产策略配置/切换未执行。 |
| A17/T16 | 仅TEST Code128软件样张，四个浏览器时区读原DATE；PBX正式码/设备DPI与长码容量Q未物理验收，因此正式发行保持禁止。 |
| A18 | 原runtime脚本真实执行且红灯单列；普通账号专项不能覆盖旧fixture/finance404/平台失败。 |
| A19/T23 | 原snapshot与current inventory分轴，不以available作为原入账数量。当前qty变动测试不冒称已覆盖生产所有移库/拆批合法演进路径；解释不足就UNKNOWN，禁止重复入账。 |

## 发布待审与实物待验收

用户已追加授权后续 push 与 schema/API/Web 发布，但父级要求本 turn 先复核最终本地证据，因此本轮绝不发布；父级确认发布前证据后再推进，不重复索取用户授权。候选评审需看本地提交、兼容影响、schema先行次序、公司/场policy整组版本、回退保留事件策略，并独立处理原runtime scope-audit和entity基线门禁。没有授权时不做push、部署或生产试点开旗。

L4需要现场确认箱事实、旧标签逐箱映射、真实库位/接收人、设备/纸张/DPI/扫码容量及实际交付；C仅记录接收人，不补造本人登录签收。跨时区测试证明DATE字符串保持，不证明未知公司业务时区已配置；ownership.businessTimezone仍明确UNKNOWN。数据库schema保留遗留bootstrap依赖，报告不把TS迁移通过等同完整生产环境一致。

旧轮当时结论（不代表恢复后的执行情况）：不是生产发布批准书。近生产规模的P95≤1秒压测、所有合法移库/拆批组合和物理设备矩阵未执行；这些限制保留在发布评审清单，不用“有代码”冒充完成。

## 本地提交与未push证据

- `8d6515af`：P0诚实状态与partial门禁、方案授权标注。
- `4825b0db`：P1/P2/P3-M后端、五表迁移及实际测试。
- `736af4cc`：孤立snapshot保护、重复扫描409、跨仓/GROUP矩阵、全迁移再次重建与扩展反例。
- `7b099b9d`：前端历史恢复、打印/扫描/未知原键恢复、统一日报/终端/移动及DOM。
- 本报告/测试harness/脱敏证据为单独本地提交；其hash见交付后的 `artifacts/packaging-history-local/final-local-receipt.json`。

交付检查：main与本地origin/main均保持 `69d89dd44b8e1461d7eaf5193e60c994255aed2c`；上述代码提交仅存在实现分支。未连接远端查询，因此这项是本地ref/操作证据，不冒称验证了远端服务器实时状态。

持续进度：`artifacts/packaging-history-implementation-progress.md`。测试日志保留在任务目录，浏览器二进制和继承的认证artifacts不入commit。

任务收尾停止了本次API/Web进程及两个本次活动测试容器，保留所有fixture卷与日志；没有触碰其他进程。Next自动更改的tsconfig经内容对照后仅还原本轮自动格式/include变化，真实Web tsc再次exit0。

仓库忽略 `.log`，原始脱敏日志按规则留在本地，不使用force-add。随提交保存JSON执行账本与日志SHA256（`acceptance-summary.json`）、重建脚本和复跑说明；浏览器runtime不提交。

## 同 session 父级复核 1–17（2026-09-14 追加，优先于前述验收措辞）

本次完整读取父级 review 1–17，对照 HEAD `6bbda479b33b7f4178d64d426878f57881e764b3` 及本次工作区修订。结论为 **PARTIAL，软件验收未全部关闭**。历史测试不是当前工作区回归证明；本节不追认旧测试运行时 revision。下面“已有”均指源码与历史窄用例，未充分覆盖的项目保留 partial/fail。

| review | 状态 | 已有证据／本次复核与未完成 |
|---|---|---|
| 1 | partial | hook/UI 已按身份及 code 隔离；历史 DOM 包括乱序与卸载。旧兼容流程、POST 与后续 GET 全部交错组合未逐一证明；4 条静态检查不计 DOM。 |
| 2 | partial | history service 有 SQL 筛选/keyset、签名游标和范围绑定；历史 131 条遍历通过。SQL 状态函数与 JS 不完全同义（见4/11），P95未测。 |
| 3 | partial | completePackingSources 核对精确 grading 集合、真实来源、ACTIVE、原班次/日期和场公司；未有覆盖所有来源节点生命周期的真实 HTTP 反例。 |
| 4 | fail | receipt 校验唯一 batch/ledger/group 和总量、原 hash；原产出各组与 receipt 组的逐组等价尚不完整。SQL receipt qty 缺 JS 的正安全整数条件，legacy 空字符串条件亦不一致。直接改 qty 不等于合法移库拆批销售链。 |
| 5 | partial | 五表、typed JSON、IS TRUE、namespace deferred trigger、非空 down 拒绝已有实现。claim DELETE/旧 normalized_code 更新后的占位有效性未完整约束；trigger 存在检查仅 tgname，跨 schema 重建证明不足；result event 引用与嵌套 JSON 完整性仍需反例。真实 PG 复核本轮阻断。 |
| 6 | partial | 历史真实 195 SQL +82 TS、31 PG +16 HTTP 与 finally/exit 证据保留；旧 runtime 红灯及 finance404/fixture/平台分类不变。本轮专用容器启动 exit1，无法再跑真实 API/PG。 |
| 7 | partial | policy 精确 company/site 配置，默认全关，Q要求 profile/物理证据，TEST限制在隔离启动；本轮纯策略测试通过。实际 HTTP 每命令组合及生产配置切换未执行，生产仍未启用。 |
| 8 | fail | prior 操作检查 COMMITTED/eventId/payload/hash；PRINT字段白名单已存在。UNKNOWN/未回报后的重打仍未阻断，operation 查询结果完整性也未全面约束。 |
| 9 | partial | 接收人解析实际有效角色与 DataScope/GROUP；历史权限专项不等于所有命令普通账号矩阵。候选列表全量用户逐个解析，缺搜索分页，性能未测。 |
| 10 | partial | namespace退役、VOID不复活与confirm重新解析已有代码及历史反例；底层claim完整性缺口见5，不能宣称整个DB状态空间安全。 |
| 11 | fail | list/detail/report共用原证据思想但SQL/JS数量与空字符串校验有差异；新snapshot保留COMMITTED、当前库存UNKNOWN已有窄测试；全链演进与逐组反例未完成。 |
| 12 | partial | history显式投影，包装trace用已核实原链且下游NOT_INCLUDED；历史子资源/count/alias范围专项存在。不扩大结论为其他legacy trace入口已全部核实。 |
| 13 | partial | 本次修复缺失/空/超长code在查库前拒绝，controller空body不直接解引用；命令白名单提前检查，非法自然日及超长pallet拒绝，打印回报时间必须字符串。新增11个纯校验反例/正例通过；真实HTTP 400及全部命令权限仍待PG恢复后验证。 |
| 14 | partial | client body.code、非JSON/超时UNKNOWN、无自动重放，原key持久化与人工查询已有代码/历史浏览器覆盖。管理员登录回跳完整query及所有401身份切换组合未覆盖。 |
| 15 | fail | TEST标签、逐箱旧码声明、原key恢复、扫码去重已有实现。UNKNOWN重打门禁缺失；仓库/库位/接收人是radio列表，未达到可搜索选择器要求。 |
| 16 | partial | 列表身份/query guard、无身份不取数、URL过滤分页、终端原code恢复已有实现和历史浏览器用例；完整无OPEN/失败上下文重载矩阵未逐格证明。 |
| 17 | partial / blocked | 本次开始保留实际HEAD、源文件SHA256、dirty diff及指纹。旧日志没有当时指纹，不倒推到最终commit。P95与合法移库/拆批/销售耗尽为授权软件工作，未完成原因是本轮Docker socket拒绝，不归为L4。git index只读导致本轮不能local commit。 |

### 测试 revision、分类及真实阻断

历史统计严格分开：PG/HTTP 47 = **31 PG +16 HTTP**；Web54 = **45 DOM +5 client +4 static**（不是54 DOM）；浏览器16；API unit47 pass/8 skip。旧8 skip没有被新专项替代；旧runtime 2 pass/28 fail/1 skip（含F06假阳性风险）和entity393>300仍保留。

历史最后提交 `6bbda479` 是报告/harness/evidence提交，并不证明此前每次测试运行在该HEAD。旧账本缺 contemporaneous revision，标为 **历史测试版本无法严格追溯**。本次新增 `revision.cjs` 和runner前后快照：精确HEAD、目标路径、逐文件hash、sourceFingerprint、完整代码dirty diff及hash，记录sourceUnchanged；不读取认证artifact或.env。每次测试独立的 `.revision.json` 与账本关联。报告本身不纳入源码指纹，以免进度追加制造源码变化。

本轮初次runner因 Node `spawnSync git EPERM` 在执行测试前失败（exit1），不是测试FAIL或PASS；随后将git标准输出写到本次唯一临时目录文件，避免大输出pipe，并重跑。直接调用根目录tsc路径不存在exit127亦保留；之后在实际API/Web工作目录分别执行tsc。手工测试前快照为 `review17-before.json` / `review17-before.diff`，只适用于该批手工命令，不补记旧轮次。

阻断命令：`docker start packaging-history-test-pg18-rebuild2` exit1，Docker socket permission denied；`git add scripts/packaging-history-test/revision.cjs` exit128，`.git/index.lock: Read-only file system`。当前工具approval=never，没有提权通道，未绕过。源码修改保留工作区，**本轮无新commit**。未启动任何本次临时API/Web/PG服务，因此没有本轮新增服务需要停止，保留原fixture。

### 未完成的软件验收（不是实物L4）

- P95：列表、详情、日报 **0个新压测样本**，无冷暖读测量，无EXPLAIN实测，不能声称≤1秒。原131条分页fixture不足近真实规模。需在独立PG恢复后建立明确TEST数据规模、冷/暖样本与环境索引计划再测，慢则优化后重测。
- 合法演进：已定位官方 `WmsService.confirmTransfer` / dispatchTransfer / receiveTransfer / completeTransfer，以及正式出库扣减接口；本轮未调用，**0条新增真实移库/拆批/销售耗尽链**。需分别证明新receipt原COMMITTED保留、当前状态降级与旧证据保守UNKNOWN，不能用UPDATE qty代替。
- SQL/JS等价、claim完整性、UNKNOWN重打、搜索候选、每写命令权限矩阵及上述partial项目仍为软件缺口，不得以生产发布另批或设备L4未做关闭。

本轮只读再次确认main与本地origin/main仍为 `69d89dd44b8e1461d7eaf5193e60c994255aed2c`，实现分支仍为上述五个local commits；没有push或远端操作。这仅是本地ref证据。发布仍另批，当前软件状态不满足全部验收。

本轮新验证结果（全部关联实际运行前后源码指纹）：API tsc exit0；Web tsc exit0；API unit **58 pass /8 skip /0 fail**（新增11项）；Web **45 DOM +5 client +4 static =54 pass /0 skip /0 fail**；nullable、constraint、migration-down、migration-dml各exit0。8组sourceUnchanged均为true。命令/时间/HEAD/文件hash/diff映射见 `review17-results.json`、`verification-results.json` 与对应 `.revision.json`。本轮新PG/HTTP/browser/P95/官方演进链执行数均0，不能沿用历史通过数充当重验。`git diff --check` exit0。新增文件与相关修订留在工作区，未能提交。

## workspace-write 允许修复续轮（同 session，禁止重试已拒权限）

父级明确 Docker/git index 拒绝为最终。本轮没有再次调用 Docker、git add/commit、换 socket、提权或修改配置；只编辑源码、运行纯测试/类型与静态约束检查。继承的dirty、失败日志和fixture均保留。以下状态更新优先于上一节对应缺陷描述；整体仍 **PARTIAL**。

实际源码修订：

- PRINT：服务端在原单事务锁内检查该箱每个PRINT_REQUEST的最后一条服务端顺序PRINT_RESULT；无回报、UNKNOWN或非法结果阻止NORMAL和有原因REPRINT。只有明确DISPATCHED/FAILED才能进入原有同码/原因检查；它们仍不代表实物出纸。详情逐箱返回禁用原因。页面请求发出即保守禁用该箱，断响应不允许原页面再发新请求，提示刷新查询；服务端已有UNKNOWN跨刷新仍禁用。回报接口仍只允许原请求操作者追加，未新增审批或第二人会话。
- 受限候选：包装仓库/库位/接收人复用设计系统SelectField，由PackingCandidateSelect加名称/编码搜索；只筛选原单候选接口返回的授权集合，搜索文字不能写成业务code。上游仓库切换清空下游值和搜索。候选接口的全量/N+1性能尚未优化或实测，不能称大规模候选验收完成。
- 证据核验：JS与迁移中的SQL函数补齐数量正安全整数、receipt必需身份字段非空字符串；原产出SKU/规格/产品全部保存时，按不可混淆的tuple分组逐组核对数量，拒绝同总量调换组量。JS不再用斜线拼接身份键。缺原SKU但有不可变receipt的兼容行为保留，不用当前主数据回填历史；该情形的完整逐原产出身份映射仍未证明。
- 真实测试代码准备：新增9个PG JSON反例的SQL/JS对照、1个PG UNKNOWN重打用例、6个HTTP只读角色写命令矩阵（每个遍历OP_V/MGR_V/MGR_E/NO_SCOPE/GLOBAL_OP/无登录）。原HTTP登记默认关旗用例改传合法DTO，以免新前置校验把预期409变成400。**以上全部本轮未执行**；confirm所在完整BFF路由与E写成功/跨范围矩阵还未补全。

### 迁移与验证边界

已修改 `1789353300496-PackagingHistoryD1cEvidence.ts` 中SQL函数，**没有执行迁移、没有重新创建PG库、没有证明SQL可执行或与JS全面等价**。恢复允许的独立测试环境后必须新隔离空库全迁移重建，再跑PG对照与事务/并发；不能复用旧82 APPLIED声称本修订已生效，也不能把静态query收集测试当PG测试。

本轮纯测试包含：打印无回报/UNKNOWN/非法类型/其他请求回报不能解锁/最后结果恢复、数量空/零/负/小数/字符串/越界、null组、空身份字段、同总量调组、无现存库存保留原COMMITTED、旧原单无SKU兼容，以及静态SQL守卫检查。页面DOM新增服务器UNKNOWN禁用、请求断响应禁重复、授权候选搜索三个用例。静态SQL断言只证明迁移源码包含相应守卫，不能证明PG语法或行为。

### review 1–17 最新状态

| 项 | 最新状态与关闭边界 |
|---|---|
| 1 | partial；既有身份/乱序DOM通过，本轮补打印断响应就地禁用；旧兼容全交错矩阵仍未完成。 |
| 2 | partial；筛选/游标实现保留，P95未执行。 |
| 3 | partial；来源生命周期完整反例矩阵仍缺。 |
| 4 | partial；已修已知数量/空字段/完整原身份逐组反例，纯JS验证；SQL真实执行与官方演进链仍缺。 |
| 5 | partial；本轮未关闭claim DELETE/旧码状态、嵌套JSON及trigger跨schema等DB缺口。 |
| 6 | partial；旧真实PG/HTTP/原runtime证据保留，本轮未重跑。 |
| 7 | partial；默认全关策略纯测试保留，实际每命令策略矩阵未执行。 |
| 8 | partial；UNKNOWN/无回报重打门禁源码及纯/DOM子项已关闭；操作结果完整性和真实事务/HTTP门禁待验证。 |
| 9 | partial；候选可搜索子项完成，实际接收人矩阵与N+1性能未完成。 |
| 10 | partial；退役/confirm解析已有实现，DB claim完整性仍缺。 |
| 11 | partial；已知SQL/JS差异修订并补真实PG对照测试代码，未实测等价；旧原单无SKU兼容保留，完整演进未证明。 |
| 12 | partial；原安全投影保持，其他legacy入口不扩大验收。 |
| 13 | partial；DTO纯测试及类型检查，新增HTTP矩阵代码未运行，完整confirm权限矩阵仍缺。 |
| 14 | partial；原key恢复保留，打印断响应补禁用；全部401回跳组合仍缺。 |
| 15 | partial；UNKNOWN重打与可搜索受限组件纯软件子项完成；真实API/浏览器与设备Q仍未验收。 |
| 16 | partial；本轮共用组件未触碰列表/终端语义；原未完成场景矩阵仍保留。 |
| 17 | partial；本轮每组before/after源码指纹持续记录；P95/PG/HTTP/官方WMS链仍0次，本轮禁止commit。 |

已知失败保留：本轮第一轮新增Jest参数表写法导致TS2345/TS2488，API unit exit1（58 pass/8 skip，新suite未运行），已修后再测；不得删旧失败。其他旧runtime/finance404/fixture/平台/实体基线红灯不变。PG/HTTP/P95/合法演进未执行属于软件验收缺口，不划入物理L4。

### 本轮结束证据与dirty交付

最终可运行结果：API/Web tsc exit0；API **87 pass（86 unit含模拟事务，1 static SQL）/8 skip/0 fail**；Web **57 pass（48 DOM+5 client+4 static）/0 skip/0 fail**；nullable/constraint/migration-down/migration-dml各exit0；git diff --check exit0。PRINT命令模拟事务NORMAL/REPRINT两例确认在解析标签和插入事件前拒绝UNKNOWN；这不是PG回滚或HTTP证明。第二次新增测试mock参数类型TS2493失败亦保留在api-unit-r6，修后r7通过。

当前HEAD仍 `6bbda479`。结果与命令、exit、逐组实际HEAD/源码文件hash/dirty diff关联见 `artifacts/packaging-history-local/workspace-review-results.json` 和对应 `.revision.json`。每组before/after一致；最后仅新增两个模拟事务测试后重跑api-unit，因此其指纹晚于其他7组，不能说其他测试都在同一个最终tree执行。应用代码和迁移在该次仅测试文件修改期间未变化。

本轮及继承相关dirty：迁移 `1789353300496-PackagingHistoryD1cEvidence.ts`；bff下DTO、evidence/handover/controller、policy.spec、history.pg/http.spec；Web详情组件及UI DOM测试；verify.cjs、报告、进度、JSON账本。新源码文件：`packaging-print-state.ts`、`packaging-review.fixture.ts`、`packaging-review.spec.ts`、`PackingCandidateSelect.tsx`，以及继承的新 `revision.cjs`；新增各轮指纹JSON和最终workspace-review-results.json。完整既有无关untracked保持原状，未清理或纳入任何提交。

本轮严格未重试Docker/git写，未commit，未push，无生产动作，无新增服务需停止。迁移修订未生效；必须新隔离重建。实际PG/HTTP/browser/P95/官方库存演进全部未执行；旧runtime失败继续保留。review的partial不能因本轮纯测试通过改称全部验收。


## 恢复后的同源码交付（2026-09-14；覆盖前述 workspace-only 状态）

实际启动策略为 `danger-full-access / approval never`。专用 Docker 与 `.git` 写已合法恢复；旧拒绝和唯一探针保留，没有换 socket、提权或改 CLI。仅本地完成实施、测试、分批正常提交，未创建代理。D1-C P0–P4、排除 P3-E/P5 不变。用户后续发布授权已收到，但本 turn 按父级要求不 push、不 deploy、不访问生产、不启用生产策略。

### 本轮修订与真实软件验收

- namespace：禁止删除 registry/claim、改旧 normalized_code、改变 claim 身份/证据和 VOID 复活；区分本事务新占位与早先 RETIRED。延迟约束只查受影响码，验证 BOUND 有效 owner/claim、跨原单事件借用；trigger 存在检查含 relation/schema。operation COMMITTED 必须指向本操作、同原单/actor/事件类型，查询不把空或错误类型 result 当成功。
- 原证据：逐原产出登记时捕获身份，并在 confirm 校验注册 boxId 唯一且集合完全等于原箱，保存 ordinal/qty/boxes/sku/spec/product 的不可变 `outputBindings`。原 JSON 无 SKU 不用当前 master 假回填历史；映射来源明确 `REGISTRATION_RESOLUTION`。后续 master 禁用不抹掉原 COMMITTED；无充分旧证据仍 UNKNOWN。JS/SQL 数量、安全整数、空字段和逐组校验补齐并实际 PG 反例对照。
- PRINT：事务内无结果/UNKNOWN 禁止 NORMAL 与有原因 REPRINT；原请求操作者可追加明确结果，不称出纸。真实 PG、HTTP 和浏览器跨刷新验证。前端断响应立即禁重复请求；旧实物标签登记按钮明确“登记逐箱旧标签实测事实”。
- 接收人：候选复用 SelectField、后端关键词/keyset分页，每页上限100，五次批量范围读取代替逐用户 role/resolve。无总数伪称；权限过滤后的空页可用 nextCursor 继续，不遗漏后页。普通/GROUP、SITE显式授权/无授权、部门祖先、REGION同级、隔层公司与权威 resolve 真 PG 对照。confirm 查当前 `perms_version`，真实 HTTP 同 roles 撤组织范围并 bump 版本后拒绝接收人，不能复用旧 scope 缓存。
- P95：保持精确范围，原查询先公司/场粗筛后完整链核验，索引支持来源/交接关联；keyset仅排序小型id集合再取页内详情。日报不重复执行未使用 SQL 状态函数及两次完整 JS view；共享 packingEvidence 保持输出口径。正式阈值没有放宽。
- 官方库存链发现并修复两处历史缺陷：WMS transfer source ledger 漏 company、sales reserve/outbound ledger 漏 warehouse/location，会使合法演进后历史链因缺范围字段不可见。现在官方 create→dispatch→receive（部分10枚拆出目标批次）与 FIFO reserve→delivery confirmOutbound（50枚耗尽）均真实执行，未用 UPDATE qty 冒充官方链。另修既有 WMS 表创建/补列不一致漏掉的 `reason` 列。
- 页面：GET null/空结构/错 code 不再无限等待；partial/空箱禁提交，confirm A→B/换账号迟到回包不能污染新原单，仓库/库位/接收人/扫描草稿清空；登录回跳保留 query。历史原产出响应也显式白名单，隐藏未知成本和内部备注字段。

### 新空库迁移与环境

`packaging-history-test-pg18-rebuild5` 真正从空库执行 **195 SQL + bootstrap diagnostics=0 +83 TS**。其中81为既有链，2为本功能：`1789353300496-PackagingHistoryD1cEvidence` 与 `1789362000000-PackagingHistoryReadIndexes`。从82增加到83是本轮实际索引与 WMS reason 补列修复，不是重复算迁移。两处冻结 SQL 未改。

`verified-rebuild-sql-r3`、`verified-rebuild-bootstrap-r3`、`verified-rebuild-ts-r3` 均 exit0；其当时 before/after 指纹已经记录。两条迁移的当前文件 SHA 与该次重建捕获值逐一相等，因此不以 runMigrations=0 假称改后生效。另在真实 PG 独立 schema 做空 up/down/up、非空拒绝 down，实际检查本 schema triggers。索引迁移 down 只删自身索引，保留既有环境可能早有数据的 legacy `reason` 列；不以 down 删业务列/事件回滚。

PG18.6 (`180006`)，仅 localhost55432、固定库 `packaging_history_test`；baseline 旧81链仅 localhost55434。本次 API 清除继承应用变量、随机进程内 JWT、localhost3100，Web localhost3000，浏览器独立 TEST 会话；不读生产凭证/旧 auth artifacts，不输出 token/password。其他 UAT 容器未动。

### 最终源码—提交—测试对应

本轮 local commits：`801fc8c6` 后端/迁移/范围/官方库存修复，`a9caa6cf` 前端与 DOM，`8e1ea6a0` 隔离 harness/性能/指纹。没有 amend/reset/force；逐文件 stage，没有 add -A。实际检查没有启用 pre/post-commit/push hook，未绕 hook。

18组最终检查均在 **HEAD `8e1ea6a07759670fb304ab4d09e39e3a27663d57`**，tree `dceb1a09cf0369359dab605ed2a534008be5e313`，source/config fingerprint **`efacb37aea8f649b32a6e0e22118629fb59ca08b4c3fa5f9c1e64ea42e3893d1`** 执行；每组 before/after 完全一致、源码 dirty diff 为空。API在该指纹重新启动，启动指纹另存。文档/证据随后单独提交，不改变源码；最终报告提交→该测试 revision 以这项内容指纹及最终交付元数据关联，不声称测试发生在未来报告 commit。源码指纹是明确目标范围，不等于整个工作区 tree：涵盖 API/Web 源码、TS/冻结迁移、测试 harness、package/lock/tsconfig、列明的 Jest/Vitest/Docker/compose/workflow/门禁配置；实际存在文件列表和 SHA 全在 revision JSON。另记录 HEAD tree、staged diff hash，排除 `.env` 和认证 artifacts。

证据总表：`artifacts/packaging-history-local/restored-final-acceptance.json`；精确 argv/cwd/时间/exit/log SHA256/对应 revision 都在其中及 verification-results.json。历史47 PG/HTTP为31 PG+16 HTTP；历史54 Web为45 DOM+5 client+4 static；历史16为浏览器 harness场景，不能当当前通过数。早期未捕获 revision 的测试不追认到某个提交。

| 最终命令组 | exit | 实际用例/边界 | 日志 |
|---|---:|---|---|
| perf-plan | 0 | 真实list/report EXPLAIN ANALYZE/BUFFERS | `verified-perf-plan-r7.log` |
| performance | 0 | 5操作，各首读+20暖+5冷会话，实测阈值通过 | `verified-performance-r13.log` |
| api-tsc | 0 | 实际执行完成；无用例数声明 | `verified-api-tsc-r20.log` |
| web-tsc | 0 | 实际执行完成；无用例数声明 | `verified-web-tsc-r15.log` |
| api-regression | 0 | 85 unit pass /0 skip /0 fail（含WMS、sales、DataScope） | `verified-api-regression-r4.log` |
| web-auth | 0 | 16 client/auth unit pass /0 skip /0 fail | `verified-web-auth-r3.log` |
| api-unit | 0 | 91 pass =90 unit +1 static SQL；8 skip；0 fail | `verified-api-unit-r15.log` |
| pg-http | 0 | 80 pass =51 PG suite +29 HTTP suite；按执行类型57 direct PG +23 real HTTP；0 skip/fail | `verified-pg-http-r24.log` |
| web-dom | 0 | 65 pass =56 DOM +5 client +4 static；0 skip/fail | `verified-web-dom-r15.log` |
| nullable | 0 | 实际执行完成；无用例数声明 | `verified-nullable-r10.log` |
| constraint | 0 | 实际执行完成；无用例数声明 | `verified-constraint-r9.log` |
| migration-down | 0 | 实际执行完成；无用例数声明 | `verified-migration-down-r9.log` |
| migration-dml | 0 | 实际执行完成；无用例数声明 | `verified-migration-dml-r9.log` |
| entity-diff | 0 | 真实393差异 | `verified-entity-diff-r4.log` |
| entity-baseline | 0 | 旧81链真实393差异 | `verified-entity-baseline-r2.log` |
| entity-gate | 1 | 393>300，增量0；原门禁FAIL | `verified-entity-gate-r4.log` |
| runtime-scope-audit | 1 | 原打印2 pass /28 fail /1 skip；不接受F06假阳性 | `verified-runtime-scope-audit-r4.log` |
| browser | 0 | 27场景 =18浏览器/混合 +9 HTTP-only（7路由矩阵+关旗+撤权）；0 skip/fail | `verified-browser-r9.log` |

全部适用组完成后 runner 总 exit1，原因就是原 entity/runtime 两项红灯。API条件8 skip仍未执行，不拿本专项代替它们。原 runtime 仍打印2PASS/28FAIL/1SKIP；六个旧fixture账号缺失401、finance summary/ar-aging/accounts旧路由404、Shipment样例缺失、macOS psql平台问题分别保留。F06以401空响应判PASS是旧脚本假阳性，不能当范围证据。entity只读diff新83链与旧81链均393，阈值300，增量0；未降门槛、未改allowlist。

历史新增失败保留：真实 WMS 缺 reason/source company、销售 ledger 缺 warehouse 已修；PG scope fixture 错用 DEPT（实际枚举 DEPARTMENT）修正；浏览器先暴露选择器 label 可访问名称，修正时一次 JSX 闭合错误导致500也保留，修后DOM/Web tsc/browser通过；WMS目标仓无权时不返回目标信息但仍保留有权原凭据，原“整单必须404”断言改为检查不泄露目标仓/批次及 current UNKNOWN。探索性并行 runner 曾复用日志名/覆盖账本片段，不能据此倒推历史证据；现改 exclusive `wx` 日志创建和每次追加重读账本，最终全组串行，旧现场文件未清理。

### 实测性能（不是物理冷盘）

每轮先核对 manifest与DB：5001原单、5000条独立grading/source链（加原fixture1条）、10000库存、10000流水、2000 legacy交接、5000候选用户；授权单一密集日含1 registered PENDING、1000 legacy COMMITTED、1000 partial HANDOVER_ONLY、3000 INVENTORY_ONLY，其他TEST公司作为不可见背景。实际结果总数/状态数/详情code和箱事件断言通过，不会重建后空读假PASS。日汇总包含该范围所有班次；独立PG还覆盖同日多班和SHIFT精确ID。

使用真实 DataScopeService、workflow.detail（registered详情2箱/登记事件及legacy COMMITTED详情）、list、summary、candidate controller。单并发；每操作首读1+暖读20+新DataSource/service冷会话5，共130次计时。冷会话清scope缓存，连接建立不计时；PG shared/OS缓存未清，绝不称物理冷盘。设备与索引全量定义、原始样本和 EXPLAIN ANALYZE/BUFFERS 的 list/report 计划保存于 performance JSON。没有削减规模或放宽≤1000ms阈值；旧1.71s/1.03s/1.005s等失败，以及混合状态日报1.29s失败均保留，优化后再验。

| 操作 | 首读ms | 暖P95ms | 冷会话P95ms |
|---|---:|---:|---:|
| list | 522.55 | 535.91 | 513.55 |
| detail | 9.01 | 8.28 | 36.74 |
| committedDetail | 8.69 | 10.11 | 39.09 |
| report | 540.06 | 578.03 | 622.60 |
| recipients | 20.25 | 24.64 | 40.84 |

这是该明确fixture/单并发环境的只读性能证明；未覆盖生产峰值并发、超大量箱事件或所有库存演进排列，不扩大为通用容量承诺。synthetic压测seed不是官方WMS业务链，官方链由独立PG测试证明。

### review逐项最终状态（1–17与最新追加18–23）

“关闭”指本条明确缺陷及列明软件场景，非穷举数据库任意恶意状态或现场认证。整体交付仍 **PARTIAL（原全仓门禁及发布兼容演练未闭）**，不宣称全部验收。

| review | 状态 | 关闭证据／保留边界 |
|---|---|---|
| 1 | 软件关闭 | 56 DOM中含GET拒绝/null/错单、partial/空箱、A/B/A、账号切换、迟到PRINT与CONFIRM、草稿清空；旧四项readFileSync单独标static。未穷举每种旧页面交错排列。 |
| 2 | 软件关闭 | SQL范围+keyset/count；131单含NULL日，插入新单后asOf稳定、空页total0、签名/过滤/边界400；近规模P95实测。 |
| 3 | 软件关闭（代表反例） | 真PG缺失/VOID/test/错班来源拒绝；普通HTTP跨来源公司/仓库整链范围及总数不泄露。不宣称所有来源节点生命周期排列均穷举。 |
| 4 | 软件关闭（代表链） | JS/SQL真实反例、唯一原组/ledger/量；官方移库部分拆批与销售耗尽后原receipt完全相等，原COMMITTED/current UNKNOWN。不是仅改qty。 |
| 5 | 主要缺陷关闭，partial | 新空83迁移、null purpose、claim DELETE/RENAME/OWNER/VOID_REVIVE、跨原单证据、operation错误引用、跨schema trigger/非空down真PG通过。嵌套JSON的任意直接SQL恶意状态不宣称穷尽；API严格DTO+confirm映射保护，未知证据只读降级。 |
| 6 | partial / 原门禁FAIL | 新真实PG/HTTP与finally/exit已验；原scope/entity真实执行仍红灯，旧fixture/finance404/平台与8skip保留，不能用专项覆盖。 |
| 7 | 软件关闭，生产未开 | 可信精确company/site配置、全false默认、Q/profile策略unit；完整API七命令关旗矩阵，PRINT_RESULT可留原请求结果。生产配置/物理Q未做。 |
| 8 | 软件关闭 | prior同key同payload结果全等、partial拒绝；PRINT白名单与UNKNOWN真实事务/HTTP/browser；operationDB引用与非法结果纯controller反例。 |
| 9 | 软件关闭 | 有效roles/GROUP实际解析；scope批量与权威resolve六类真PG、5000用户搜索分页性能；确认当前权限版本、撤权真实HTTP拒绝。 |
| 10 | 软件关闭 | 旧code不可变/退役不可复活，跨单并发alias保留歧义，scan后再歧义→confirm拒绝；VOID仍稳定boxId。 |
| 11 | 软件关闭（代表旧单） | 原无SKU→注册不可变ordinal映射→C→master变化→list/detail/report一致；未解释库存演进UNKNOWN且不重入。 |
| 12 | 软件关闭（本入口） | 库存/ledger/handover/原产出白名单；隐藏成本/内部备注；旧包装trace精确原链；普通HTTP子资源/count/alias/operations侧信道检查。其他业务trace无本轮扩大认证。 |
| 13 | 软件关闭 | 严格DTO/缺code提前400、同key重放与UNKNOWN查询、候选完整接线；七写命令普通角色/无scope/异公司/未登录真实HTTP，E成功由浏览器与PG覆盖。 |
| 14 | 软件关闭（列明场景） | client body.code/非JSON/timeout、无自动POST重放；登录return保留query，身份隔离；真实断confirm响应后刷新查询原key，16 auth回归。 |
| 15 | 软件关闭，L4未执行 | 可配正式profile默认关闭、TEST Code128；逐箱旧码真实声明UI；受限搜索选择器；UNKNOWN重打真实验证，原key持久化与去重，不代表已出纸/本人签收。 |
| 16 | 软件关闭（列明矩阵） | URL过滤/分页、未登录无请求、identity即时隔离；terminal DOM无OPEN/失败/切班/换身份/重挂，browser CLOSED原code恢复。 |
| 17 | 软件证据关闭，整体partial | 最终18组同HEAD+before/after指纹；真实用例分类；P95与官方演进已做，local提交及源码树对应。原全仓门禁未绿，不能称全部验收。 |
| 18 | 未执行 / 发布前阻断 | 尚未做新API+旧schema真实HTTP和旧API+新schema回退演练。默认关旗不解决读取新表/列的窗口；现deploy.yml先起API后迁移不作为本功能安全发布证据。需迁移先行或可靠维护门禁，DDL锁超时可退且事件保留；本轮未擅改部署链。 |
| 19 | 发布待审 | 回退是镜像回退，不是数据库自动恢复；不得down删events。后续需保留artifacts的发布模式，不执行默认hard reset/清理；备份可读/恢复演练及dirty门禁需审，当前未生产执行。 |
| 20 | 软件关闭（代表链） | 注册boxId唯一且集合等于原箱；当前perms_version撤权实测；WMS两批qty守恒、两仓±10成对ledger、同ref/company、原receipt不变、旧key再confirm零增量。目标仓无权时不返回目标仓/批次，仅有权原链/current UNKNOWN。 |
| 21 | 软件关闭（明确规模） | 实际workflow详情含箱/事件、真实DataScope；5000候选用户server分页；混合状态、多公司背景、每轮DB/result校验、真实EXPLAIN，P95≤1秒。新C超大事件历史/高并发不在本次容量证明中。 |
| 22 | 软件关闭 | 同roles撤组织范围+bump版本→接收人409；保留旧性能失败，未放宽阈值；asOf/NULL日/空页/state filter与日报回归实际通过。 |
| 23 | 证据关闭（限定范围） | source/config targets、逐文件hash、当时HEAD tree、staged/dirty diff均记录；最终代码tree与后续报告-only commit明确区分；不读.env/auth。 |

### 发布与实物剩余项

原runtime/entity红灯需要父级审定明确差异，不能伪PASS；review18兼容演练/迁移先行、review19保留事件回退/备份可恢复证据尚缺，这些是软件/发布前事项，不推给L4。物理Q/L4仅指设备出纸、标签实贴扫码、实际交付/接收事实；未执行且不阻塞本轮独立源码开发，正式生产编码仍不得发行。没有新增双人审批/receipt队列/TEMP分配。

收尾服务状态、最终本地refs与未push证据见 `artifacts/packaging-history-local/restored-delivery-state.json`；只停止本次API/Web及rebuild5/baseline，保留fixture与所有旧证据。报告/证据最后提交的hash以本轮最终答复与本地git log为准，不在文件中自引用伪造未来commit。

## 2026-09-14 review18–25 本地兼容与恢复追加（覆盖上节18/19“未执行”状态）

本轮从tracked clean `c6d3b9d2c26479cb9df7fd8c6c95033057e4ae2e`开始；同分支、唯一CLI、无代理。仅新增隔离验收harness、脱敏证据与计划/报告；**没有修改应用源码、迁移、部署workflow、allowlist、阈值或hook**，没有push/deploy/生产访问/开旗。此前18组应用测试仍对应8e1ea6a0及其当时指纹，不声称本轮重跑，也不把其结果追认给新harness。

### 实际隔离兼容与备份

最终可复查证据：`artifacts/packaging-history-compatibility-1789365718577/results.json`、`backup-table-digests.json`、`gate-analysis.json`。命令 `node scripts/packaging-history-compatibility/run.cjs`；每次独立新目录保留前轮失败。本轮最后一次记录运行前/后HEAD、source/config逐文件hash与diff指纹，以及run/runtime harness前后hash；实际加载的新/旧API均为git archive专属源码副本，archive SHA与revision在结果中。主树没有checkout/reset。

PG实际18.6（180006），仅127.0.0.1:55432/55434的本任务原83/81库与55435/55436专属恢复库，数据库白名单 `packaging_history_test`。原81库保持81；仅它的独立恢复副本执行两条正式TS迁移到83。原83库仅备份/读取，未down，保留fixture。此前195 SQL/bootstrap0/83 TS全空重建证据仍独立保留，不把本轮“恢复81+执行2条”叫全迁移重建。

| 实际GET | 新c6 API + 旧81 | 旧69d89dd4 API + 新83 | 新c6 API + 迁移先行83 |
|---|---:|---:|---:|
| health | 200 | 200 | 200 |
| readiness | 200 | 200 | 200 |
| shifts/:id/context | 200 | 200 | 200 |
| shifts/today（精确日期） | 200 | 200 | 200 |
| dicts | 200 | 200 | 200 |
| reports/shift-summary（精确shiftId） | 200 | 200 | 200 |
| warehouse/status | 500 | 200 | 200 |
| inventory/by-packing | 200 | 200 | 200 |
| traceability/packaging | 500 | 200 | 200 |
| history列表 | 500 | 404（旧版本无该路由） | 200 |
| history详情 | 500 | 404（旧版本无该路由） | 200 |

33次真实HTTP GET；这是状态/基础响应与无写入兼容矩阵，不是33个新业务事务验收。旧版本9个旧GET通过；新API旧schema的4个500是**实际不兼容**，不是可忽略的PASS；runner断言的是精确重现该危险窗口。新API先迁移后11个GET均200，才构成所列读路径的兼容证据。

真实Nest AppModule与菜单/DataScope/JWT guard，普通TEST角色及当次随机JWT密钥；没有读取旧auth artifacts，没有调用生产或旧源码业务写接口。隔离harness忽略dotenv、禁调度器、拦截所有非GET、限制网络仅对应localhost DB；数据库角色仅SELECT、default_transaction_read_only=on。旧/新AppModule初始化中存在DDL/DML尝试，全部被PG拒绝并保存SQLSTATE，不宣称“旧源码完全不会尝试写”。这些测试未覆盖HTTP登录、生产镜像二进制、所有旧路由及任何旧业务写兼容。每轮HTTP前后所有public表和序列均不变。

实际 `pg_dump -Fc` exit0、`pg_restore --list` exit0并包含包装表数据TOC；在独立空容器 `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges` exit0。备份2,867,941字节，最终SHA256 `28386144a2f7472626c0dd602d02a0adb39d6e0574db02bca8410ad216f9ffcb`。对比范围精确为**285个public表 +264个public序列=549项**，不是549个表；逐表count+按行JSON散列排序的MD5聚合相等，序列last_value/is_called相等；1536条包装事件保留。dump/TOC/临时源码/TEST认证fixture仅本地保留，不纳入提交；提交脱敏hash/count结果。此校验不覆盖角色ACL、集群全局对象、public以外schema、附件文件与生产PITR。

锁演练在恢复83库：持读锁事务阻塞ALTER，lock_timeout250ms，实得55P03；超时前CREATE sentinel也随事务回滚，列不存在；解锁后ALTER成功再回滚，所有表/序列/事件不变。没有在事件库执行down。完整耗时见最终results（前次实测252ms保留，不硬编码作为每次结果）。

失败历史：`1789364930677`当次TEST权限版本过期导致401，不能作为有效权限兼容；修fixture读取真实perms_version后再跑。`1789365013151`因前容器停止未结束而端口占用，docker exit125；随后先等停止完成再启动新专属容器。`1789365036521`有效33GET/备份/锁演练已通过，但只记开头harness hash、未在当时记完整结束指纹；因此不事后补造，最后`1789365718577`再跑并实时捕获before/after。

### entity/scope原红灯深入审计（仍FAIL，不豁免）

`gate-analysis.json`逐条列出原393 SQL、分类、原文件行号、目录查询结果和31个scope输出分类。旧81/新83差异SQL多重集合完全相等，列表顺序不同；不仅比较393数值。分布：DROP CONSTRAINT79、DROP INDEX37、COMMENT50、CREATE TABLE1、DROP COLUMN74、ADD COLUMN45、ADD CONSTRAINT27、ALTER COLUMN58、RENAME COLUMN1、生成列copy1、typeorm_metadata delete1、CREATE INDEX18、CREATE UNIQUE INDEX1。**没有执行这393条DDL**。

| 具体差异/缺陷 | 已核实事实 | 范围处理 |
|---|---|---|
| sys_user列漂移 | entity声明id/real_name_zh等，实际DB为user_id/real_name等；隔离SELECT real_name_zh LIMIT0为42703 | AuthService主要用raw SQL，不能把潜在ORM失败当全部登录必坏；旧实体/调用治理另案，不盲加列或删除现存列 |
| prc_purchase_orders.contract_no等 | 实际81/83均缺contract_no，SELECT LIMIT0为42703；ProcurementService仍有em.save及引用real_name_zh的SQL | 真实既存ORM/SQL风险，非包装新增；应逐调用契约对齐实体和正式迁移，不靠COALESCE包不存在列，不在本轮扩大采购治理 |
| biz_store_daily_close | 实际缺表，SELECT为42P01；对应旧entity仍注册，旧controller写入口明确GoneException（410） | 退役元数据残留，不能据CREATE提案直接造新业务表；需独立核对是否仍有其他消费者后移除死实体 |
| shr_project_equity.unpaid_capital | DB为生成列；entity仅insert/update false，缺生成表达式映射，TypeORM提出rename/copy/drop和metadata删除 | 生成列映射治理，严禁照提案复制/删除真实财务数据 |
| 79约束删除/37索引删除等 | 包含数据库已有CHECK/FK与partial unique，entity未完整表达 | 不是“DB缺保护”；不能执行删除来让diff绿。需约束语义逐个对齐，避免破坏冻结基线 |
| scope六个命名fixture账号 | 实际sys_user均不存在；脚本期望7个用户名中仅admin存在且status1 | 六个无法登录与后续401分别分类；admin存在但登录仍401，未读取密码或猜测原因，不归为“admin也缺失” |
| finance summary/ar-aging/accounts | 原真实HTTP404，旧脚本期待401/403/200 | 旧路由契约/脚本漂移，不能以新专项替代其失败 |
| scope F06 | 不校验HTTP/code，把401对象当空items，报PHX_count0 PASS | 原2PASS中此项不接受；仅无token拒绝是有效PASS |
| scope T12/F05/T15 | T12未检项目且打印后无条件pass；F05未检查描述要求total0；T15硬编码macOS psql和旧DB、把平台错误归缺fixture | 真实测试缺陷清单；保留28fail/1skip，未改脚本、allowlist或阈值 |

实际CI关系：deploy.yml358–388调用entity硬门禁，test job为build-push依赖；393>300会阻断正常需测试的发布。另发现workflow382在调用门禁前删其默认输入diff文件，而shell脚本无文件时按0通过：这是**既存门禁假绿风险**，不是可用放行方式；本地原门禁使用保留diff得到真实exit1。最小独立修复应保留明确diff路径传入门禁，并对generate失败/缺文件fail closed，同时逐领域修真实漂移；要让393降至300以下至少解决93条对应真实差异，不能在包装任务中删除约束凑数。本轮没有为赶发布改这条全仓链。

原 `apps/api/test/scope-audit.sh` 未被当前workflow直接引用；regression.yml使用的是不同的 `scripts/g5c-rbac-audit.sh`。因此原scope是本任务要求的真实验收红灯，不能错误称它就是deploy那一条脚本；也不能因非直接CI引用而宣布通过。正常CI另有五模块真实回归门禁，本轮未执行远程CI。

独立只读catalog窗口命令 `node scripts/packaging-history-compatibility/catalog-window.cjs` exit0，证据 `artifacts/packaging-history-compatibility-audit-1789365568154/results.json`：81库WMS reason及workflow_contract_version均42703，83均OK；三个新索引81为0/83为3。未运行旧源码移库写。首次probe误把JSON receipt当commit_receipt列，81/83均42703；旧`1789365548464`结果保留，此探针不作为产品缺陷证据，改为真实workflow_contract_version列后重新测。

### 构建与测试映射新增

正式API/Web构建只在git archive副本运行，不加载.env；sw stamp只改副本。现有依赖最终复制入副本以满足Turbopack文件系统边界，无安装/CLI配置更改。

- `artifacts/packaging-history-build-1789365431030`：`pnpm build` API/Web均exit1，pnpm自动安装尝试因NO_TTY中止，未进入编译；未允许清理依赖。
- `1789365481752`：直接已安装Nest `build` exit0，stamp exit0；Next build exit1，副本node_modules软链越界，属于harness布局错误。
- `1789365514307`：复制既有依赖后，Nest build exit0、stamp exit0，Next16.2.6默认Turbopack正式 `next build` exit1：Google Inter字体连接失败。没有mock字体、跳过类型或替换webpack来冒称原构建通过。公共字体地址无认证curl实际exit28/15秒超时，属当前外部构建依赖阻断；Web完整生产构建仍FAIL/未完成，不能拿tsc/dev/E2E代替。本地Node24.19.0；Dockerfile使用Node20，未称镜像环境同一。

上述构建记录当时HEAD c6d3b9d2、archive SHA、harness before/after、真实命令/exit；没有完整before/after应用逐文件指纹的早期构建不倒补。归档直接取固定commit源码，无dirty源码混入。

原85unit的准确套件为 `data-scope.service.spec.ts`、`data-scope-row-equivalence.spec.ts`、`egg-inventory.service.spec.ts`、`wms.service.spec.ts`、`packaging-inventory-integration.service.spec.ts`，5 suites/85 tests，不是85个真实销售HTTP/事务测试；官方销售演进仍由原PG测试单独证明。原80 PG/HTTP、91 API/8skip、65 Web分类及27浏览器harness数量保持上节，不重算为本轮PASS。

### 最新review状态与待父级复核

| review | 本轮结论 |
|---|---|
| 1–17、20–23 | 应用源码未变，保留上轮逐项限定证据与partial/原FAIL；23新增本轮固定archive与实时before/after映射，不追认历史。 |
| 18 | 所要求隔离兼容、81→83迁移先行、DDL锁/事务与事件保全实测完成；已证实默认发布顺序不安全。迁移先行正式操作仍待审、未执行。 |
| 19 | 本地备份可读/独立恢复与285表264序列对账完成；镜像回退保留DB、禁止事件库down、备份非自动rollback、保留artifacts/dirty门禁均写入独立发布计划。 |
| 24（最新追加） | API正式build通过；Web实际build因字体网络FAIL。85unit套件已核实；WMS reason/索引窗口已实测。原entity硬门禁及其删输入假绿风险、scope实际归属已审，不称可绕过或已修全仓。构建状态以下方网络配置修正后的实测追加为准。 |
| 25（最新追加） | 已写候选镜像一次性migration先行可执行模板；本轮按直接用户“只写计划”未改deploy.yml、不发布。旧API9GET读兼容边界及549项精确构成已纠正。 |

完整操作计划见 [packaging-history-release-preflight.md](packaging-history-release-preflight.md)。整体仍**PARTIAL / 发布前待审**：Web正式build外部字体阻断、原entity门禁真实FAIL与scope旧审计FAIL尚在；不能凭兼容演练完成宣布发布获准。没有把兼容/备份软件演练留给L4；L4只指物理出纸/实贴/实扫/交付，本轮未做。

### 本轮local commit与停止证据

`defce4274c1589362d17f34ce11673a36c3bcfa6` 提交本轮harness与脱敏结果。其应用源码、迁移、workflow与c6d3b9d2完全一致（`git diff c6d3b9d2 -- apps .github/workflows migrations`为空）。最终兼容runner exit0；audit命令exit0；catalog命令exit0；构建各exit如上。兼容runner前后source/config指纹均为 `efacb37aea8f649b32a6e0e22118629fb59ca08b4c3fa5f9c1e64ea42e3893d1`，run/runtime SHA前后也相等。新的harness提交对应当时c6固定源码与其archive，**不是在defce427上重新跑应用全套**。后续报告-only提交不改变这份映射，最终hash见本地git log/交付答复，避免自引用未来SHA。

`artifacts/packaging-history-compatibility-1789365718577/delivery-state.json` 在defce427时实际采集：本轮服务全部停止、7个对应端口无监听、临时源码目录进程0、保留所有容器/fixture；main与本地origin/main仍69d89dd4（只读本地ref，没有联网验证远端），本轮没有push。报告最后提交后再看tracked status；大量未跟踪临时副本/dump/log按要求保留，绝不git add-A或清理。

### 构建网络配置修正后追加（替代上节Web FAIL作为当前状态；旧失败保留）

进一步用当前正常网络环境访问同一公开字体URL，curl实际HTTP200/exit0；之前env隔离移除了现有代理配置，不能将其归为无法恢复的外部阻断。build harness现只额外继承现有标准代理/CA环境用于公开构建资源，不打印其值，不加载.env、不读取生产认证artifact、不改任何CLI/生产配置。随后重新从固定 `ff9d6422a838abc2a5d5dd0f88819177f1823b48` archive创建独立副本并复制现有依赖。

`node scripts/packaging-history-compatibility/build.cjs` 实际exit0；`artifacts/packaging-history-build-1789366018190/results.json` 记录：Nest build exit0、stamp-sw exit0、Next16.2.6默认Turbopack `next build` exit0。正常编译、TypeScript、页面数据/生成完成，无字体mock、无跳过检查、无webpack替代、无依赖安装。API dist/main及两条编译后迁移、Web BUILD_ID/routes/prerender manifest及standalone目录真实存在；post-build hash检查独立标记为事后产物检查，见同目录 `output-inspection.json`，没有追认成构建前指纹。

此轮archive的应用源码与c6完全一致；harness before/after相同、HEAD before/after均ff9d6422，具体archive SHA见results。原18组测试仍原映射；这次新增的是**API/Web正式构建完成证据**，不意味着重跑了全部unit/PG/browser或验证了Node20候选Docker镜像。review24的本地正式构建项现关闭；当前整体partial只保留原entity/scope红灯、实际CI/发布前复核与物理L4边界，**Web构建不再是缺口**。

本轮local commits：defce427（兼容/恢复harness与证据）、ff9d6422（发布计划/报告）、随后构建网络harness修正与本节证据提交（具体SHA见最终交付），均未push。没有应用/迁移/workflow变更，因此不触发新的空库迁移重建；既有全链/事务证据仍绑定原源码。

## review24–26：已授权最小部署/CI修复实交付

本轮后发授权明确覆盖此前“只写计划”。起点b7d1a6d0，tracked clean；唯一CLI、无代理；仅workflow/门禁/迁移辅助脚本、隔离测试及证据文档。没有修改应用源码、TS迁移、entity、300阈值、allowlist、secret、全局配置或hook；无push/deploy/生产访问。

### 实际改动

- deploy.yml的API镜像使用本次 `sha-${TARGET_SHA}` 标签拉取，解析成固定镜像ID后先由专属one-off容器执行TypeORM迁移及show核验，再用同ID up API，随后Web。旧API在此之前不切换、不重启。
- API模式强制export PRESERVE_ARTIFACTS=true；现有dirty拒绝门禁保留，不清旧证据/备份。迁移失败或show异常/空清单/仍有pending均失败；旧API未切换时rollback不重新up旧API。命令替换内去除继承的ERR trap，仅外层处理一次失败，未吞退出码。
- `scripts/deploy-schema-first.sh` 只执行候选迁移与核验；不启动Nest、cron、生产写接口或依赖；不down、不清理退出容器，事件库不回滚到旧schema。Compose `config --images api`实测会包括db依赖，已避免以这种多镜像输出选候选，改为调用方明确传入候选引用。
- `scripts/check-entity-schema.sh` 按实际安装TypeORM0.3.29普通generate语义判定：正常生成exit0，精确本次文件及成功行匹配后计数；no-changes是exit1，仅明确全文、无文件、stderr空可合法0。真正异常、缺文件、空文件、部分artifact伴随exit1、误导no-changes文本都拒绝。独立stdout/stderr日志保留，不使用 `|| true`，不使用旧/tmp glob。
- `scripts/check-entity-drift-baseline.sh`要求明确现存非软链artifact、合法up/down结构、非空query数及有效baseline；直接缺文件不能返回0。workflow已去掉gate前删除diff漏洞，并保留/上传当前run的CI证据（本地未运行上传）。

### 实测和数量口径

`node scripts/packaging-history-compatibility/deploy-test.cjs` 实际exit0，**20项shell行为测试**：12项gate行为（393拒绝、299/300接受、明确合法0、missing、异常、误导日志、partial artifact错误、stale无污染、直接missing、空artifact、原真实393文件）+5项实际workflow切换片段的Docker命令模拟（成功/迁移失败/show失败/pending/空show）+2项实际rollback API条件片段+1项preserve拒绝。失败路径外层ERR trap恰好一次；这20项不是20个真实Docker/HTTP业务测试。

另实际执行本地Docker候选集成：恢复81基线到专属PG18.6库，one-off候选迁移两条至83并show通过；独立恢复83库1536事件，重跑迁移/show后事件count及聚合摘要完全不变。固定候选镜像ID `sha256:7fd44301b76236acfa60e1274415f2ffbb565e1ef6f056ddaa5ecd37b1af9605`；仅localhost55437/55438、packaging_history_test。真实TypeORM generator exit0产生当前393条artifact，新门禁实际exit1，300保持不变。整体集成runner把这个**预期拒绝**作为断言，不将真实CI门禁称PASS。

Bash语法检查、workflow YAML解析、git diff --check均exit0。最新shell与candidate结果各记录当时HEAD、workflow/全部本次门禁脚本逐文件SHA256及dirty diff、before/after；两组共同脚本指纹一致。原应用80 PG/HTTP、65 Web/27浏览器harness及其余18组仍绑定原测试revision；本轮应用未变，未重跑/追认。前轮API/Web正式build0保持，现候选仅Node22 bookworm测试镜像，并非正式Node20 Alpine镜像构建；未假称已验证生产镜像。

失败/修正保留：首候选镜像dist归属root且子目录700，phoenix用户读不到data-source，迁移exit1；专属镜像COPY归属修正后重跑（未改正式Dockerfile）。随后真实pg驱动弃用warning与成功stdout混流使严格门禁拒绝，改为分存stdout/stderr后重测，异常退出仍失败。早期16/17项行为测试及中间有效候选结果全部保留，以最新20项及同workflow指纹的candidate结果作为交付，不追认旧测试在新SHA发生。

review24：前轮正式本地build0与85unit精确套件继续有效；Node20正式候选镜像未验证。review25：schema-first现已实际本地实现并经shell/候选容器验证，事件保全及提前失败不切API。review26：CI漏洞实际修复、missing fail closed、生成器分流、stale隔离及393真实拒绝均验。**原entity393>300与旧scope红灯仍未解除，整体发布前待审，不是发布获准。**

本轮提交映射：`64c92f38`为schema-first/CI真门禁及候选测试；`fffbc0bd6fe2c968f1d4620a1aa4bb42549cf6df`补单次外层失败回滚及重验。最新20项shell证据 `artifacts/packaging-deploy-gates-1789366990119/results.json`，最新真实候选证据 `artifacts/packaging-candidate-1789366990880/results.json`，均exit0；当时HEAD64c92f38加记录的dirty文件是实际被测源码，不称测试发生在fffbc0bd。随后逐文件比对fffbc0bd的Git对象与两份测试before SHA完全相等，记录于同目录 `delivery-mapping.json`；workflow/脚本共同部分也完全同指纹。

`syntax-checks.json`另记录fffbc0bd上Bash语法/YAML解析/diff检查3命令exit0与实时前后指纹，不计入20项行为测试。应用/迁移相对b7d1a6d0无diff，baseline文件无diff；main及本地origin/main仍69d89dd4，无联网查远端/无push。所有本轮PG、候选one-off、generator、路径探针容器均已退出，55437/55438无监听、专属artifact目录活动进程0；容器/镜像/fixture/失败日志均保留。最终文档提交仅更新报告/映射，不重写代码提交历史。

## 393闭环调查轮（仅方案，不实施）

按最新授权，在HEAD3a43829e仅调查/修正文档，未修改entity/schema/业务代码/CI，不执行generated diff、不启动数据库、不读取secret/auth artifacts、不生产访问。具体逐表方案见 [entity-drift-393-closure-plan.md](entity-drift-393-closure-plan.md)。建议先审审批四表44条实体表达，再成对修身份表36+关联表15条；95是静态候选行数而非实测改善，不能据此宣布≤300。旧采购archive六列遗漏、活跃ORM/save与错误real_name_zh查询另列真实缺陷闭环；DB额外保护、生成列、nullable语义和旧日结分别保留，不靠删除或移除entity过门槛。

release-preflight首段已改成当前本地schema-first实际代码状态、Node22候选已实测/正式Node20未验；未称已发布。本地Docker catalog无Node20镜像，原Dockerfile正式构建的专属无敏感构建上下文路径已列计划。现有远端受控readonly workflow依赖dispatch/SCP/secrets，不符合本轮执行边界；未调用，实际生产DB major/部署ref保持未知。本轮文档方案交父级先审，HEAD保持3a43829e，不先做广域修改再汇报。

## A/B实际授权轮：A独立记录

A仅改审批四表entity：按正式DDL补varchar255及真实唯一名，保留原nullable/default；SALES_ORDER CHECK补同名元数据，正式迁移管理的GIN用该单一索引`synchronize:false`准确声明保留（不是修改门禁allowlist或删除索引）。真实read-only diff393→335，消除58、无新增；44列/唯一约束、12被牵连的索引重建、2 CHECK/GIN，逐条removed清单在`artifacts/entity-alignment-A-after-1789368000660.json`。同库285表/264序列及catalog摘要与A-before完全相同，未执行generated diff。API tsc exit0。335高于300，保持红灯，后续仅已授权B；静态95预测已由实际阶段数字替代。

### B独立差异与消费者结论

B-before335；首次after278（removed58/added1，唯一新增为删除is_visible物理列注释），忠实补正式迁移注释后**277（removed58/added0）**，证据`artifacts/entity-alignment-B-after-1789368385791.json`。A+B总消除116，剩余277非零，未扩大到C，未执行任何生成diff。285表/264序列及catalog摘要不变。实际元数据减少会同时取消依赖列类型的索引/FK操作，因此95候选行数不是实测差额。

完整读取AuthService/AuthController/JwtStrategy/PermissionsService及SysUser/SysUserRole引用；当前业务消费者使用raw query，HTTP字段由明确projection生成。实体保留id属性但物理映射user_id bigint，real_name_zh访问器映射real_name；旧非物理属性保留非持久化类型声明，note只映射实际text不解释、不回填。user/granter关系仍引用id属性，真实外键列为user_id；onDelete、唯一名、CHECK、nullable/default/可见性注释忠实对齐。is_visible旧注释称“仅显示”、现AuthService实际撤权语义的历史冲突保留可审，未以本轮元数据对齐擅改业务。

JwtStrategy原Number(sub)会将超安全整数舍入；现接受正十进制PG bigint范围，安全范围内保持旧数字DTO，大值保持字符串，拒绝不安全numeric JWT。新增真实HTTP登录/me/refresh及受保护身份接口、冻结/归档、撤权version，ORM user/granter/role，审批四表/唯一/CHECK/GIN等14项（连参数化共14项），连原auth/approval6套件合计61项实测通过。首跑59pass/2fail保留：测试fixture显式generated-id被TypeORM忽略、角色绑定触发器把version增为2；修fixture后真实高ID验证通过。最终新空库全套重验尚待完成，不能据此提前称整体验收。

## A/B及父级追加27–29：交付复核（本地，无发布）

范围记录：用户初始授权A审批四表+B身份两表；父级review27随后明确授权通用constraint解析修复；28授权三张WMS表十列nullable，29在真实丢更新/NULL反例后授权该旧InventoryService最小事务修复。未自行纳入采购六列、旧日结、sys_user_orgs、generated equity或其他表。未执行生成diff，未改DB/default/CHECK/VersionColumn定义/300/allowlist，无push/dispatch/生产访问。

阶段实际数量：A **393→335（-58/+0）**；B **335→277（-58/+0）**；追加WMS **277→267（-10/+0）**。总消除126，剩余267非零，95只是旧静态预测。A、B初始独立证据见前文。WMS第一次before/after仅sys_cron_heartbeat数据摘要改变，catalog及其他行摘要相同，**该次不变检查未通过**；停止调度后，以HEAD4b9b7728的三个旧实体blob覆盖本次读取做新的只读旧元数据比较，再读当前元数据，`entity-alignment-WMS-before-1789370153045.json`与`entity-alignment-WMS-after-1789370200084.json`明确记录override commit/hash，277→267、10条SET NOT NULL消失、无新增，全部表/序列/catalog不变。这是新做的受控对比，不是倒推首次before已通过。

### 通用constraint修复与真实旧库存缺陷

旧扫描器递归扫描archive、漏正式ddl且ADD IF NOT EXISTS重置既有约束，导致正确password_hash NOT NULL被误报；还漏无分号TS literal，匿名CHECK合成名与PG实际名不符。现按`db-migrate.sh`的195正式SQL顺序→83 TS up，archive/retired/down不覆盖；缺列ADD保留nullable，已存在ADD跳过整个动作，显式DROP/SET仍生效，动态SQL明确未知。13静态反例及8真实PG/文件链检查均验证，真实R1–R4仍拒绝；不硬编码sys_user、不更改allowlist。

完整读取三实体与唯一实体业务消费者`modules/wms/inventory/inventory.service.ts`。旧provider只注册/导出，当前仓储controllers调用WmsService；全src检索未发现其atomicIncrement/Decrement现行业务调用，包装使用PackagingInventoryIntegrationService/EggInventoryService及inv_batches。`wms-contract-probe-1789369615152.json`在原服务真实复现NULL+5变5、两个事务10扣1/2成功但余额8、ledger3；probe exit0表示反例复现，绝非库存验收PASS，保留原源码指纹且不作为更新后默认测试。

经review29授权，旧provider先校验warehouse scope与store身份，缺/空范围失败关闭；既有NULL/不同store不扩大为ALL。事务全局advisory锁仅用于此legacy provider，配SELECT FOR UPDATE后读最新余额，NULL/非整数/负值/锁量异常拒绝，不补0。该锁同时串行新balance唯一竞争及跨批反序调用；代价是旧provider各批次串行，当前inv_batches流水不使用该锁。caller manager在事务内时沿用，不独立提交；balance/ledger同事务。VersionColumn仍自动递增，但不再声称save附加CAS条件。三个实体仅十列增加nullable:true与联合null类型，默认/约束保持。真实13PG+5unit覆盖NULL/正常ORM读写、并发守恒、超额、新记录竞争、storeNULL/跨机构、空scope、ledger故障、caller回滚、跨批反序。未给无现行调用的旧provider虚构生产HTTP入口或宣称其全域吞吐已测。

### 本轮失败保留与测试边界

- auth追加初跑59pass/2fail是fixture预期错误（generated ID插入忽略显式ID；绑定角色触发version+1），修后实际高ID及权限预览测试合计62通过；不是仅mock或tsc。
- Node20最初两次构建传入loopback代理导致npm/apk ECONNREFUSED；官方容器直连registry/Alpine均200后，正常直连正式Dockerfile构建成功，未改Docker/CLI配置、未改变正式Dockerfile。根workspace从未作Docker context；仅tracked源码git archive副本，排除dotenv/artifacts/uploads/node_modules等，不复制生产认证artifact。
- 浏览器最初Docker host网络与CLI namespace不同，3000连接拒绝；通过127.0.0.1显式端口映射运行真实正式Web，测试网络适配器将/api请求转发真实localhost3100 API（不造响应），断响应拦截同样走该适配。通知SSE不在此专项，主动abort，未计为通知验收。正式构建全屏按钮真实点击，无禁用门禁。重建fixture后API字典缓存导致一次确认400，重启专属API后重测，不删除历史fixture。所有这些失败日志保留。
- 一次Playwright未捕获SSE错误打印了本轮随机TEST JWT；日志仅凭据值已脱敏，保留原始/脱敏摘要和失败内容。对应隔离API已重启更换随机密钥，不涉及生产凭据。以后route失败仅记录path和错误类型。
- 原scope-audit保持真实执行与旧fixture登录失败、旧finance404、F06未查HTTP状态的假阳性分类；不能把2个脚本PASS都当有效授权验证。无额外allowlist或新专项替代该红灯。Q/L4实物打印/扫描设备未执行，正式发行策略仍默认全关；软件TEST fixture不授予实物资格。

### review1–29状态更新

| 项 | 本地状态与证据范围 |
|---|---|
| 1 | 软件关闭：原确认身份/乱序/清草稿DOM回归；最终web-dom，非旧静态4条替代 |
| 2 | 软件关闭：SQL过滤/keyset/count、cursor/空code参数；PG/HTTP与性能计划 |
| 3 | 软件关闭：原grading精确集合及source scope反例，PG/HTTP |
| 4 | 软件关闭：集合/逐组量与原COMMITTED；真实隔离官方WMS拆批、销售服务演进测试，不称qty模拟全链 |
| 5 | 软件关闭：PG18空库正式链、JSON/null/claim/trigger反例及安全down；本轮未改迁移 |
| 6 | 部分：测试清理/exit/隔离与实数已验；原scope-audit仍FAIL单列 |
| 7 | 软件关闭/实物待验：可配默认关闭策略已测；Q资格与生产发行未执行 |
| 8 | 软件关闭：幂等原结果、partial拒绝、PRINT字段白名单；PG/HTTP |
| 9 | 软件关闭：receiver真实普通角色/仓范围，PG/HTTP/browser |
| 10 | 软件关闭：RETIRED/VOID/claim归属及scan后再核验反例，PG并发 |
| 11 | 软件关闭：无SKU不可变产出映射、旧/新COMMITTED列表详情日报及演进 |
| 12 | 软件关闭：历史字段白名单/隐藏链/精确count/子资源权限，真实HTTP |
| 13 | 软件关闭：写DTO/unknown operation/UI接线，DOM/HTTP/browser |
| 14 | 软件关闭：client body.code/nonJSON/unknown/401/身份安全，client/DOM |
| 15 | 软件关闭/实物待验：UNKNOWN重打门禁、同key刷新查询、旧码UI/选择器；未物理打印 |
| 16 | 软件关闭：身份与query隔离、URL filters、终端CLOSED恢复与正式全屏UI |
| 17 | 软件证据关闭：源码指纹/原失败/真实类型计数/P95/官方演进；物理L4单列 |
| 18 | 已有兼容演练范围内关闭：旧81窗口/旧API83只读，当前Node20候选迁移先行再HTTP；不推导旧写兼容 |
| 19 | 计划与隔离验证关闭：backup/恢复原证据保留，镜像回退不自动DB rollback，PRESERVE_ARTIFACTS=true |
| 20 | 软件关闭：精确box集合、receiver撤权、真实官方库存演进；未解释链保守UNKNOWN |
| 21 | 软件关闭：workflow.detail/真实DataScope、5001原单5000收件人、EXPLAIN与冷暖实测 |
| 22 | 软件关闭：perms_version撤仓回归、NOT MATERIALIZED优化，旧P95失败保留 |
| 23 | 软件证据关闭：source/config清单与hash、dirty diff、Dockerfile与专属构建归档 |
| 24 | 本地build/候选关闭；原scope红灯仍保留；当前entity267/300不再393红灯 |
| 25 | schema-first本地代码及真实候选81→83/83事件保全通过；未发布 |
| 26 | 20 shell真实行为测试通过，旧393 fixture仍拒绝；当前真实generator267通过300门禁 |
| 27 | 通用parser反例、真实PG对照与全仓scanner通过；动态限制明示 |
| 28 | 经29语义修复后十列metadata完成；独立267 diff无未知新增/数据catalog不变 |
| 29 | legacy provider13真实PG+5unit通过；无现行调用/全局锁吞吐限制明确，不扩ERP算法 |

### 最终测试映射与实际命令结果

应用/测试提交 `cdb49bb1401c5e93b7fe67a71c16ef9b3c0ae34a`；25组统一source/config指纹 `8d871b15eb8f187b65f35d84d442755334f60f46c3f6504ca6fc004b4b872780`，各组before/after完全一致。机器索引 `artifacts/entity-ab-final-delivery.json` 引用每组command/exit/日志/revision文件，不倒推旧绿。最后 `d1537fe4` 仅改candidate测试的TCP就绪检查；实际candidate在cdb49bb1+该dirty文件运行，提交后逐文件hash一致，API/Web/workflow/迁移与cdb49bb1无diff，因此原应用suite仍绑定cdb49bb1，不称发生在d1537fe4。

| 组 | exit | 实际日志 |
|---|---:|---|
| rebuild-sql | 0 | `artifacts/packaging-history-local/verified-rebuild-sql-r7.log` |
| rebuild-bootstrap | 0 | `artifacts/packaging-history-local/verified-rebuild-bootstrap-r7.log` |
| rebuild-ts | 0 | `artifacts/packaging-history-local/verified-rebuild-ts-r7.log` |
| legacy-wms | 0 | `artifacts/packaging-history-local/verified-legacy-wms-r3.log` |
| auth-approval | 0 | `artifacts/packaging-history-local/verified-auth-approval-r7.log` |
| api-tsc | 0 | `artifacts/packaging-history-local/verified-api-tsc-r31.log` |
| web-tsc | 0 | `artifacts/packaging-history-local/verified-web-tsc-r20.log` |
| api-regression | 0 | `artifacts/packaging-history-local/verified-api-regression-r8.log` |
| web-auth | 0 | `artifacts/packaging-history-local/verified-web-auth-r7.log` |
| api-unit | 0 | `artifacts/packaging-history-local/verified-api-unit-r19.log` |
| pg-http | 0 | `artifacts/packaging-history-local/verified-pg-http-r28.log` |
| web-dom | 0 | `artifacts/packaging-history-local/verified-web-dom-r19.log` |
| nullable | 0 | `artifacts/packaging-history-local/verified-nullable-r14.log` |
| constraint-parser | 0 | `artifacts/packaging-history-local/verified-constraint-parser-r3.log` |
| constraint-self-test | 0 | `artifacts/packaging-history-local/verified-constraint-self-test-r3.log` |
| constraint | 0 | `artifacts/packaging-history-local/verified-constraint-r16.log` |
| migration-down | 0 | `artifacts/packaging-history-local/verified-migration-down-r13.log` |
| migration-dml | 0 | `artifacts/packaging-history-local/verified-migration-dml-r13.log` |
| entity-diff | 0 | `artifacts/packaging-history-local/verified-entity-diff-r9.log` |
| entity-baseline | 0 | `artifacts/packaging-history-local/verified-entity-baseline-r6.log` |
| entity-gate | 0 | `artifacts/packaging-history-local/verified-entity-gate-r9.log` |
| perf-plan | 0 | `artifacts/packaging-history-local/verified-perf-plan-r10.log` |
| runtime-scope-audit | 1 | `artifacts/packaging-history-local/verified-runtime-scope-audit-r7.log` |
| browser | 0 | `artifacts/packaging-history-local/verified-browser-r17.log` |
| performance | 0 | `artifacts/packaging-history-local/verified-performance-r16.log` |

命令由 `node scripts/packaging-history-test/verify.cjs <组名>` 执行，精确cwd/command在索引。PG追加使用RUN_PG_INTEGRATION=1、PACKAGING_HISTORY_PG=1、127.0.0.1:55432/postgres/packaging_history_test；无生产凭据。performance用PACKAGING_PERF_FIXTURE_TAG=review29-final；browser用PACKAGING_BROWSER_API_PROXY=1，实际Node20正式Web+真实localhost完整API，隔离策略仅TEST。新空库195/195、bootstrap exit0、83/83 TS；不以runMigrations0替代新迁移验收。

数量分类：原PG/HTTP80 =57直接PG+23真实HTTP（按suite为51+29，29内含6直接PG）；API91=90unit+1静态SQL，8skip保留；85unit来自原5套件；Web65=56DOM+5client+4static；web-auth16客户端单元。新增auth/approval62=41unit+9PG+12HTTP；旧库存18=13PG+5unit。浏览器27=18browser/mixed+9仅HTTP检查，不称27全部浏览器；parser13静态反例、8项混合（5PG/3文件链与静态）检查。不同类别不合并冒充端到端总数。constraint扫描195+83，2动态SQL解析跳过明确保留；全仓新漂移0。scope-audit仍2scriptPASS/28FAIL/1skip，F06不计有效PASS。

只读P95：`performance-1789370552626.json`与同轮EXPLAIN计划；5001原单/5001分级，10000库存/10000ledger、5000接收人，混合1PENDING/1000COMMITTED/1000HANDOVER_ONLY/3000INVENTORY_ONLY，真实DataScope，多公司背景。每项首读1、暖读20、冷会话5，单并发；冷会话不清PG/OS缓存，不称冷盘。列表warmP95 618.37ms/cold635.76ms，workflow.detail9.38/38.30ms、COMMITTED详情8.89/41.73ms，日报635.16/651.44ms，接收人24.01/42.83ms；所有首读/冷会话/P95≤1000ms。

正式Node20：API `sha256:1691085da35f63ecb3022d867de8fdec40c8e43b9f39a701d804fa560ebc92d4`；Web `sha256:0fc460afb4165954a88f93314bc78c11bf70cbd1b356c840bee8f4f83c2a10ba`；实际node均v20.20.2。`node scripts/entity-alignment/candidate-test.cjs artifacts/entity-node20-1789370342086/results.json 267`最终exit0；真实81→83、独立83库1536事件摘要保持、真实generator267/300 gate0、实际5HTTP验证。初次候选pg_restore遇初始化临时服务退出exit1保留在packaging-candidate-1789370509083，TCP就绪修复后的有效证据为packaging-candidate-1789370612103。`node scripts/packaging-history-compatibility/deploy-test.cjs`20/20 shell通过，原393仍拒绝。

本地提交：
- `d1537fe4` test: wait for final PostgreSQL TCP readiness before restore
- `cdb49bb1` test: verify official Web kiosk flow and final inventory suite locally
- `ce7041f1` fix: guard legacy inventory nulls and serialize balance writes
- `4b9b7728` fix: replay formal constraint chain without overwriting existing columns
- `ffdfdba4` fix: preserve bigint permission preview and verify Node20 candidate
- `c1ef0271` fix: align user bigint identity and verify auth compatibility
- `386199bd` fix: align approval entity metadata with existing schema

未push证据范围：main及本地origin/main仍69d89dd44b8e1461d7eaf5193e60c994255aed2c，当前HEAD无remote-tracking分支包含，未执行push/dispatch/生产动作；这是本地缓存与操作记录，不伪称已联网验证远端当前状态。最终文档提交只归档报告/证据，测试仍按以上revision映射。

最终停止记录：`artifacts/entity-ab-stop-receipt.json`验证本次容器运行数0，localhost3000/3100/55432/55434/55437/55438均无监听；最后API进程已SIGTERM，本项目浏览器runtime无活动进程。保留所有PG fixture/容器/卷、构建副本、失败日志，无down/清理；其他项目服务未动。`artifacts/entity-ab-remaining-267.json`保留剩余只读diff，不执行。

## 19101533之后：受控只读预检与旧scope有效性

完整报告：[packaging-history-readonly-scope-preflight.md](packaging-history-readonly-scope-preflight.md)，机器摘要 `artifacts/packaging-history-scope-preflight-delivery.json`。授权仅必要受控audit dispatch/SCP和本地测试，不发布。run34818687355 validate/SCP成功、protected执行exit1，终态failure，sanitized stdout仅换行；生产部署SHA/镜像/PG/迁移/dirty/容量/flags均未取得，不能把GitHub main69d89dd4当生产身份。未重试、未push。

同源码隔离真实scope30检查28PASS/2FAIL/0skip；6普通TEST账号实际登录，T01–16及F01–08逐项映射。旧2printedPASS/28FAIL/1SKIP原证据和F06假PASS保留，原脚本未改/本轮未重跑，不称原全绿。退役finance明确404只算退役契约。新增真实缺陷：SELF账户GET股东资金列表items=[]/total0，但同/异公司summary各泄露TEST300。调用PaymentsController→PaymentsService.listShareholderFunds中summary漏复用范围谓词。当前未修应用，最小修复及真实HTTP验证范围交父级审，发布保持阻断。review6/24的scope仍partial/FAIL，不能据旧专项绿关闭。

新增harness实测HEAD19101533+dirty，前后指纹c3901c5780c830825f38f8cfee295602bb43deebb6452b79fa9a2880d4142897相同；API/Web tsc各exit0，syntax/diff检查0。应用/迁移/workflow无修改，原cdb49bb1的25组映射保留，不追认在本次提交重跑。最终停止本次PG/API，保留fixture；无push/deploy/生产DDL/业务写/secret变更。

## Review30：资金 summary 最小修复及全部适用复验（2026-09-14）

后发review30已授权实际修复，覆盖上节“等待批准”状态。起点a5759bde tracked clean，实际danger-full-access/approval never；唯一CLI，无代理。**本轮没有push/dispatch/生产访问、业务写或secret更改**。旧34818687355的失败不重试、不猜原因；metadata-only新通道仅形成待审计划。

### 已修代码及可见性契约

独立应用提交 `ebdeb594`，仅 `PaymentsService.listShareholderFunds`：业务query条件与原SELF/company/project权限先构成统一visibleFunds，克隆给分页items/count及不分页summary。保留fundNature/currencyCode分组、原币/本位币SUM、既有mask、排序、分页和日期/股东/公司/项目/性质/币种查询语义；companyCode外参只能相交、不能扩权。当前DTO没有status过滤，本轮忠实保持原行为（包括CANCELLED行），不擅自新增财务语义。没有修改controller归属、采购C六列、日结、其他schema/entity/默认/阈值/allowlist。

真实HTTP原30场景全通过；新增3普通账户登录+16资金场景，总**49检查全部PASS/0skip**。原SELF同公司他人/foreign summary=300两处现在均为0；有本人授权数据时精确返回非空，CNY/LAK与本位币总量分别核对。COMPANY、PROJECT（排除同公司另一项目）、GROUP、无菜单、无session、空公司scope、不能指定他人股东、分页1/2/空页total与全可见summary、组合日期/币种/性质/股东条件均真实验证。全程完整AppModule、真实JWT/MenuGuard/DataScope、随机密码登录及TEST库，不mock HTTP。数据为隔离fixture，不声称官方付款业务创建链。

原旧 `scope-audit.sh` 未改，本轮仍真实执行**2 printedPASS/28FAIL/1SKIP exit1**；缺旧账号/旧finance404/macOS psql与F06假PASS保留。49项是逐原场景纠错映射与追加测试，不宣称部署中旧ROLE_*权限配置已认证；使用明确授权的普通TEST角色。退役finance只断言404契约，不替换无关端点、不称旧功能通过。原脚本红灯未通过allowlist/skip/阈值豁免。

### 审计runner本地正确性与待审新通道

`c79e0528`/`e57aaa2b`/`f8624273`仅审计诊断、路径与test harness：日志目录建立前即有阶段输出/EXIT失败码，后续按revision/SQL/log/artifact阶段报告；workflow合并stdout/stderr，cd/缺runner给固定诊断，不打印BASH_COMMAND/env/secret。只展开路径开头~/为既有HOME，不eval。相对HTTP manifest通过path.resolve正确加载；通用Docker日志读取失败保留原exit，不再被当健康0，原日志仅内存计数不输出业务payload。

**15个本地shell fixture真实执行**：原静默git失败可以生成空capture，新版报告stage；目录/缺runID/缺SQL/HTTP非法方法；相对合法manifest；Docker日志失败/命中错误只报数量；workflow目录/runner缺失及stderr捕获；旧quoted-tilde失败与新路径成功。它们是本地行为反例，**不能证明34818687355的远端根因**。没有重复dispatch。其他legacy HTTP启动AppModule的风险不因本修复消失，仍不用于本次只读预检。

精确metadata字段/只读SQL/拟议inputs/迁移manifest比较与路径白名单计划见 [packaging-history-readonly-metadata-plan.md](packaging-history-readonly-metadata-plan.md)。新helper/audit_mode尚未实现、未远端执行；需要父级审源码/输入及可用remote ref后才推进，不能提前push main启用。真实生产deploySHA/image IDs/PG major/pending/dirty/容量/flags仍未取得；34818687355仅protected exit1/空日志保持UNKNOWN。

### 最终同源码验证

最终代码HEAD **`f8624273e45a9d1219f2ffee9e4ac0c3f224f192`**，tree `517d4a71482887647044b51a647fa12b6c6ab2f3`；所有28命令组before/after指纹均为 **`94a0af5b6d0d718a7eda377020eecfe78fba86e6f151831d81b02e154c7a1e76`**、sourceUnchanged=true。原25适用组24 exit0、原runtime-scope-audit exit1；新增scope-validity/readonly-observability/payments三组exit0。这是在最终应用/审计源码上真实再跑，未借旧绿。后续文档提交不改变源码指纹，不能称测试发生于未来报告SHA。

机器索引 `artifacts/packaging-history-review30-final-delivery.json`：每组实际command/cwd/开始结束/exit/日志SHA256/revision；scope原始结果 `artifacts/scope-validity-1789372730480/results.json`；审计15项 `artifacts/readonly-observability-1789372729806/results.json`。代码改动相对a575只涉及一个应用方法，其他测试/审计变更单列。

| 命令组（实际argv在JSON） | exit | 脱敏日志 |
|---|---:|---|
| rebuild-sql | 0 | `artifacts/packaging-history-local/verified-rebuild-sql-r10.log` |
| rebuild-bootstrap | 0 | `artifacts/packaging-history-local/verified-rebuild-bootstrap-r10.log` |
| rebuild-ts | 0 | `artifacts/packaging-history-local/verified-rebuild-ts-r10.log` |
| readonly-observability | 0 | `artifacts/packaging-history-local/verified-readonly-observability-r2.log` |
| scope-validity | 0 | `artifacts/packaging-history-local/verified-scope-validity-r3.log` |
| payments | 0 | `artifacts/packaging-history-local/verified-payments-r3.log` |
| legacy-wms | 0 | `artifacts/packaging-history-local/verified-legacy-wms-r5.log` |
| auth-approval | 0 | `artifacts/packaging-history-local/verified-auth-approval-r9.log` |
| api-tsc | 0 | `artifacts/packaging-history-local/verified-api-tsc-r35.log` |
| web-tsc | 0 | `artifacts/packaging-history-local/verified-web-tsc-r23.log` |
| api-regression | 0 | `artifacts/packaging-history-local/verified-api-regression-r10.log` |
| web-auth | 0 | `artifacts/packaging-history-local/verified-web-auth-r9.log` |
| api-unit | 0 | `artifacts/packaging-history-local/verified-api-unit-r21.log` |
| pg-http | 0 | `artifacts/packaging-history-local/verified-pg-http-r30.log` |
| web-dom | 0 | `artifacts/packaging-history-local/verified-web-dom-r21.log` |
| nullable | 0 | `artifacts/packaging-history-local/verified-nullable-r16.log` |
| constraint-parser | 0 | `artifacts/packaging-history-local/verified-constraint-parser-r5.log` |
| constraint-self-test | 0 | `artifacts/packaging-history-local/verified-constraint-self-test-r5.log` |
| constraint | 0 | `artifacts/packaging-history-local/verified-constraint-r18.log` |
| migration-down | 0 | `artifacts/packaging-history-local/verified-migration-down-r15.log` |
| migration-dml | 0 | `artifacts/packaging-history-local/verified-migration-dml-r15.log` |
| entity-diff | 0 | `artifacts/packaging-history-local/verified-entity-diff-r11.log` |
| entity-baseline | 0 | `artifacts/packaging-history-local/verified-entity-baseline-r8.log` |
| entity-gate | 0 | `artifacts/packaging-history-local/verified-entity-gate-r11.log` |
| runtime-scope-audit | 1 | `artifacts/packaging-history-local/verified-runtime-scope-audit-r8.log` |
| browser | 0 | `artifacts/packaging-history-local/verified-browser-r18.log` |
| perf-plan | 0 | `artifacts/packaging-history-local/verified-perf-plan-r11.log` |
| performance | 0 | `artifacts/packaging-history-local/verified-performance-r17.log` |

数量分类：PG/HTTP80=57直接PG+23真实HTTP（suite51+29，后29内含6直接PG）；API91=90unit+1staticSQL且8skip保留；Web65=56DOM+5client+4static；web-auth16客户端unit；api-regression85unit/5suites；auth-approval62=41unit+9PG+12HTTP；legacyWMS18=13PG+5unit；payments2原unit；browser27=18浏览器/混合+9HTTP-only。scope49是新增独立真实HTTP检查，含9登录、6退役契约及34活跃检查，不与其他suite合并夸大。readonly15与deploy20为shell行为测试，不当PG/浏览器用例。constraint13静态反例、8混合检查（5PG+3文件/static）；全仓扫描2条动态SQL解析skip仍明示。

新空PG18.6 `packaging-history-test-pg18-review30-delivery` 仅localhost55432/packaging_history_test，正式195SQL/bootstrap0/83TS完成；没有新增或修改迁移，也没有事件库down。首次刚启动后的3组setup exit1且完成0保留r9；随后实际核对TCPready/PG180006/指定库/public表0，再完整重跑成功r10，未清库。原baseline81库仅localhost55434用于真实diff；新/旧链当前267非零、300门禁通过。未执行generated diff。

性能fixture5001原单/5001grading、10000库存/ledger、5000接收人，混合状态/多公司背景，真实DataScope/Workflow.detail与SQL计划；每操作首读1+暖20+新会话5、单并发，PG/OS缓存未清，不称物理冷盘。结果 `artifacts/packaging-history-local/performance-1789372871354.json`：

| 操作 | 首读ms | 暖P95ms | 冷会话P95ms |
|---|---:|---:|---:|
| list | 499.47 | 505.32 | 520.93 |
| detail | 9.65 | 9.83 | 38.38 |
| committedDetail | 8.47 | 11.22 | 42.93 |
| report | 594.04 | 640.09 | 656.14 |
| recipients | 18.33 | 24.36 | 40.64 |

均≤1000ms；未扩大到生产峰值/所有大事件容量。原慢读与失败历史不删。

### 新正式Node20镜像与候选

tracked-only archive、排除env/artifacts/uploads/node_modules；未拿根workspace作context。未修改正式Dockerfiles，build源为f8624273，before/after同上述指纹，实际API/Web node均v20.20.2：

- API `sha256:bb03034a91e8d2df2a7c581953e8f6ec60dab4b70809f502ad48933a3fe8c5c2`
- Web `sha256:d26d15f5b71ea4275629ab326fe3463f8a0337c3b9d77448b6a2e0916cd9b4b4`

`node scripts/entity-alignment/node20-build.cjs` exit0，证据 `artifacts/entity-node20-1789372668495/results.json`。`node scripts/entity-alignment/candidate-test.cjs artifacts/entity-node20-1789372668495/results.json 267` exit0，证据 `artifacts/packaging-candidate-1789372786741/results.json`：真实81→83、83→83，1536事件count/digest不变，固定新API镜像TypeORM实际267diff/300 gate0、真实5HTTP（登录/健康/me/history/归档拒绝）。这些5HTTP不冒称新增资金49全部在容器内执行。浏览器实际使用本次新正式Web镜像+同源码完整本地API，27检查通过；window.print为测试替身，物理L4仍未执行。

`node scripts/packaging-history-compatibility/deploy-test.cjs`实际exit0，20/20，证据 `artifacts/packaging-deploy-gates-1789372936877/results.json`；旧393仍拒绝。Bash/Node语法、Python YAML和git diff检查4命令均exit0，实时指纹见 `artifacts/packaging-history-review30-syntax.json`。第一次尝试不存在的apps/api/node_modules/yaml导致MODULE_NOT_FOUND，随后用已安装Python yaml真解析成功；不是跳过校验。

阶段失败保留：审计路径测试首轮缺继承HOME，fixture因nounset exit1，修为只继承现有HOME后15项通过；早期diff检查发现新增行尾空格，后续正常提交修正，未amend；阶段c79/e57构建与测试均保留但最终验收仅上述f862。没有用中间未同指纹结果代替最终回归。

### Review30状态、提交与收尾

Review30资金泄露最小软件修复与指定HTTP/完整适用回归关闭；旧raw scope脚本仍真实FAIL、旧角色配置认证不扩大；生产预检仍partial/UNKNOWN，新metadata通道待审，物理Q/L4未验、生产新写未开。这不是发布批准，未进入push/dispatch/deploy/生产写。

本地代码提交：ebdeb594（独立Payments修复）、c79e0528（范围测试与审计诊断）、e57aaa2b（统一验证入口）、f8624273（无eval的home-relative路径）。main与本地origin/main仍69d89dd4，当前HEAD无remote-tracking ref包含；这是本地缓存/操作证据，本轮未联网查生产或重复audit。

最终停止API PID3143948（核对脚本身份后SIGTERM）、review30 Web、review30-delivery与baseline PG；candidate脚本已停止专属55437/55438库。localhost3000/3100/55432/55434/55437/55438全部无监听；所有fixture/容器/构建副本/失败日志保留，不触其他项目。最终文档/脱敏证据提交后输出最终SHA，不篡改代码提交历史。

## Review31 metadata-only audit implementation (local, no dispatch)

父级已批准从计划进入本地实现。本阶段提交 `4d66bb96a1d7e00fb05244623639beee8fec4324`，只改 metadata helper/SQL/static manifest、production-readonly-audit workflow 的 metadata 分支、测试 harness、revision target 和本计划文档；应用业务源码、迁移链及生产配置未改。workflow metadata 分支在 legacy `exec 2>&1` 之前隔离，固定 helper/SQL/manifest 三文件，拒绝 assertion SQL/HTTP 输入；本阶段没有 push、dispatch、SSH、生产 DB/API/Web 访问。

### Review31 验收逐项

| 项目 | 状态 | 证据 |
|---|---|---|
| baseline SHA 精确比较 | PASS（隔离） | wrong SHA fixture 输出实际40hex并以 SHA_MISMATCH 停止；期望值固定 `69d89dd44b8e1461d7eaf5193e60c994255aed2c` |
| workflow `on` 触发审计 | PASS（本地静态） | `artifacts/review31-workflow-triggers.json`，60 workflows；专用 audit 分支不命中已列 push 分支，未 push |
| stderr 安全分支 | PASS（隔离） | metadata wrapper secret-sentinel stderr 不进入 stdout/stderr，固定 stage/class/exit；旧 wrapper 15 cases 仍 exit0 |
| sys_dict/schema 状态 | PASS（真实隔离 PG18） | schema_not_ready、RLS、缺 config 列；TEXT 不 JSON.parse；no_config/valid_all_off/malformed/any_true 分支 |
| 正式 parser 一致 | PASS（源码+13 cases） | 实际 `PackagingWorkflowPolicy` 通过现有 TS transpile hook 对照 nested Q、Date.parse、H gate；无 AppModule/auth |
| role/事务只读 | PASS（真实隔离 PG18） | `transaction_read_only=on`、`default_transaction_read_only=on`、PG18；42501 INSERT/CREATE、25006 readonly transaction；超级/写权限/SET ROLE 成员拒绝 |
| data/catalog 不变 | PASS（真实隔离 PG18） | TEST public rows、columns、constraints、indexes、ACL digest 前后相同 |
| manifest | PASS（83 TS） | 静态 class/name/timestamp/hash；不 require/eval；missing/extra bridge name 分别可审 |
| backup/path safety | PASS（fixture） | 固定 `deploy-backups` 映射；父/子 symlink、特殊路径拒绝；只 stat count/bytes/maxmtime，不读内容/不 mkdir |
| image/PG metadata | PASS（fixture+Node20） | 缺 revision label→UNKNOWN、Docker/DB错误 fail closed；正式 Node20 image `sha256:bb03034a91e8d2df2a7c581953e8f6ec60dab4b70809f502ad48933a3fe8c5c2` 实跑 helper v20.20.2，exit0 |
| migration/flags 输出 | PASS（隔离） | 仅布尔状态、pending names、imageID/revision/PG major；不输出 JSON、env、secret、业务行 |

真实测试命令及 exit：

- `node scripts/packaging-history-test/readonly-metadata.cjs` → exit 0（本阶段 47 个 unit/filesystem/shell/PG/helper assertions；network=none PG fixture，容器已 stop，fixture数据保留）。
- `node scripts/packaging-history-test/readonly-observability.cjs` → exit 0（15 legacy/new shell cases；原失败分类保留）。
- Node20 Docker helper smoke（tracked helper bind-only、network none）→ exit 0，v20.20.2。
- `node --check scripts/ops/readonly-audits/packaging-metadata.cjs`、YAML parse、`git diff --check` → exit 0。

本阶段测试指纹以提交 `4d66bb96` 后重新采集；不得追认更早 SHA 的结果。production actual SHA/image ID/label、PG major、只读角色、容量/备份、pending migrations/flags 仍未获得，因未 dispatch；Node20 smoke 不代表正式候选 API/Web 全镜像重建。旧 review30 应用测试仍精确映射其 `f8624273`/source fingerprint，应用未改，不称为本阶段新 SHA 重跑。

## Review31受控 dispatch 记录（baseline-only）

本地三文件契约测试后，专用分支 `audit/packaging-history-metadata` 推送了 `cba29befd93e372b3651d7f2c05ffc04f3c4822f`，并以固定 metadata inputs dispatch。workflow validate 成功，证明 approve token、baseline 字符串、bundle hashes 和 metadata 空 assertion 分支均通过。

run `34823735277`（head `cba29befd93e372b3651d7f2c05ffc04f3c4822f`）进入 production environment 的 SSH 步骤。helper 第一阶段输出实际远端 SHA 前缀 `a53d91f33ff733bf28e19ca11d7491f1bfd469…`，与要求的生产对象 `69d89dd44b8e1461d7eaf5193e60c994255aed2c` 不同，返回 `SHA_MISMATCH` 并停止；GitHub 日志脱敏了实际 SHA 尾部，不能猜测或恢复。由于 baseline gate 在 checkout 后即失败，未执行 docker inspect、PG、flags、backup stat、migration 查询或任何生产业务操作。远端 SCP 仅写入 `/tmp/phoenix-production-readonly-audit-34823735277/bundle`，本流程没有删除步骤。

该 run 最终 `failure` 是预期的安全阻断，不是生产审计通过。SSH action 同时报告 output delimiter 错误（`Invalid value. Matching delimiter not found 'EOF'`），属于失败后的输出采集问题；不改变 SHA gate 已先停止的事实，也不重试该 run。后续若要取得 baseline 审计，维护者必须先确认并提供合法的远端部署 ref/SHA，不得以候选 `cba29bef`、`2e9def8e` 或被脱敏的 `a53d…` 代替。

## 确认 baseline 后的受控 readonly dispatch

父级确认生产 SHA 后，metadata helper 的 baseline 更新为 `a53d91f33ff733bf28e19ca11d7491f1bfd46922`，并在本地 47 assertions/legacy15/YAML 检查通过后提交 `fa02924da3e8501d44d5eb84a62e9e916ea5bd66`，推送专用 `audit/packaging-history-metadata` 分支。push 条件重新从当前 60 个 workflow 枚举确认仅 `main`、`w5/**`、`v3-admin`，没有命中 deploy 或其他 push workflow。

run `34825204038`（head `fa02924da3e8501d44d5eb84a62e9e916ea5bd66`）使用固定 approve token、metadata mode、expected SHA、`deploy-backups` 和空 assertion 路径。validate exit0，SCP 成功，SSH helper 的 checkout SHA 与 expected 完全匹配，说明本次不是 SHA mismatch。随后固定备份目录 stat 在遇到不支持的条目时返回 `BACKUP / UNSUPPORTED_ENTRY / exit=2` 并停止；没有最终 metadata 汇总，因此不记录或猜测 image IDs、PG major、pending migration、dirty、flags。该失败未重试，也未绕过条目检查。SSH action 仍在失败后报告 `Invalid value. Matching delimiter not found 'EOF'`，属于输出采集故障。

本次 metadata helper 只读阶段未执行业务 SQL、DDL、migration、flag/secret 修改；SCP 仅写入受控临时 bundle 目录，无删除清理步骤。生产审计仍未完成，须维护者先处理备份目录的真实条目契约后再另行批准执行。

## Review31 backup layout correction and dispatch 34826067560

run `34826067560` validate/SCP 成功，SHA 与确认值 `a53d91f33ff733bf28e19ca11d7491f1bfd46922` 匹配。helper 输出了真实 failure：`type=directory, relativePath=bug-intake-runner, depth=1, class=UNKNOWN_DIRECTORY`。仓库 `provision-bug-intake-runner.yml` 证明该目录是独立 runner 预配备份（`pre-provision-<UTC timestamp>.dump[.sha256]`），不是 deploy migration backup；`production-disk-maintenance.yml` 同样只把 `deploy-pre-migration-*` 当迁移备份。没有读生产文件内容。

因此 helper 已修为只递归审计固定 `deploy-pre-migration-<数字>` 目录；其他顶层目录仅 lstat 后以脱敏相对路径/type/depth 作为 `unrelatedTopLevel` 报告，不递归或忽略其存在。deploy 目录内部仍严格拒绝未知命名、partial、symlink、特殊文件和嵌套目录。原 run 失败证据保留，不把 `bug-intake-runner` 放入 deploy 白名单。

本地 fixture 新增合法配对布局、独立顶层含 symlink 不递归、root 文件、unknown tmp/lock/partial/hidden、nested、partial pair、FIFO、symlink；metadata 测试 exit0，legacy 15 cases exit0。更新后的 bundle hash 和专用分支 push 后，需再按确认 SHA dispatch；若真实 deploy 目录仍有待审条目，继续 fail-closed。

## Backup scope correction and dispatch 34826843478

本地确认 run `34826067560` 的 `bug-intake-runner` 是仓库定义的独立预配备份旁目录；未读生产文件内容。helper 现在只递归 `deploy-pre-migration-<数字>`，对其他顶层目录返回 `unrelatedTopLevel` 的 lstat type/脱敏相对路径/depth，不递归；deploy 目录内部仍严格 pair、命名、深度、symlink、special、partial fail-closed。

新提交 `36745d57521e0a7a562660fe7bfe2565da7a223a` 已推送 audit branch，bundle helper hash 更新。隔离 metadata runner exit0、legacy observability exit0；当前 runner 实际为47个命名 cases，不能称184 cases。

run `34826843478`：validate exit0、SCP exit0、SSH进入 helper；checkout SHA 匹配 `a53d91f33ff733bf28e19ca11d7491f1bfd46922`，backup阶段通过后 DB 阶段返回 `COMMAND_FAILED/exit=2`。由于 stderr 被固定隔离，未猜测连接/角色原因；未执行后续 image/PG/flags/migrations 输出，也未写生产。SSH output delimiter 错误仍出现在失败采集之后。run 保留为失败证据，不重试。


## Local DB observability contract repair (no dispatch)

本轮仅本地修复，未访问生产、未 dispatch。`packaging-metadata.cjs` 现在把 DB command 的内部 stderr 映射为固定安全 class：`MISSING_CONTAINER`、`MISSING_PSQL`、`MISSING_ROLE`、`MISSING_DATABASE`、`PERMISSION_DENIED`、`READONLY_SQL_FAILURE`；保留 stage/exit，绝不输出 stderr。隔离 shell fixtures 覆盖六类、secret sentinel 不泄漏。

SSH metadata wrapper 改为捕获 helper 输出后固定打印 `AUDIT_METADATA_RESULT=PASS|FAIL stage=... exit=...`，wrapper 自身返回0；后续 `Enforce metadata helper result` step 根据固定 marker fail-closed。这样 `capture_stdout` 不再在远端受控失败时用非零退出触发 EOF delimiter 错误；transport/missing marker 仍失败。legacy 分支不变。

本地 `readonly-metadata.cjs` exit0（新增 DB 六类与 wrapper contract fixtures；实际命名 cases 仍如 runner 输出记录），`readonly-observability.cjs` exit0、Node/YAML/diff 检查 exit0。生产 DB 阻断证据 `34826843478` 保留；未重试生产。

## DB observability contract and final single dispatch 34830667068

本轮仅修复 DB observability 与 SSH output contract，无生产写入/DDL/migration/flags/secret。`run(stage=DB)` 现在只输出固定 class：`MISSING_CONTAINER`、`MISSING_PSQL`、`MISSING_ROLE`、`MISSING_DATABASE`、`PERMISSION_DENIED`、`READONLY_SQL_FAILURE`；内部 stderr 永不进入输出。隔离 fixture 覆盖六类、secret sentinel、wrapper marker。

SSH metadata 分支现在捕获 helper 输出并打印固定 `AUDIT_METADATA_RESULT=PASS|FAIL stage=... exit=...`，wrapper 自身返回0；独立 Enforce step 再依据 marker fail-closed。这样 controlled helper failure 不再触发 appleboy capture_stdout 的 EOF delimiter 错误，也不吞掉 helper JSON/class。

本地 metadata/observability/syntax/YAML/diff 均 exit0。唯一 dispatch 使用 audit branch `ae1b73198a5612f0555e049a5a97441799c29be5` bundle 和 expected SHA `a53d91f33ff733bf28e19ca11d7491f1bfd46922`：run `34830667068` 的 validate、SCP、SSH wrapper 均成功；helper 真实终态为 `DB/MISSING_ROLE/exit=2`，Enforce step 以 `METADATA_RESULT/HELPER_FAILED/exit=2` 停止。日志显示 helper checkout SHA 匹配 expected，SSH 输出不再有 EOF delimiter 错误。

由于只读角色缺失，未执行 image IDs、PG major、migration pending、dirty、容量、flags 汇总；未修改生产目录或数据库。DB 阻断证据保留，不能把本次 run 称为 metadata audit PASS。

## 当前 GO/NO-GO（角色契约阻断）

结论为 **NO-GO**。生产 `phoenix_metadata_readonly` 不可用：受控只读 run `34830667068` 在 DB 阶段真实返回 `MISSING_ROLE/exit=2`，因此没有取得后续 image、PG、迁移、容量或 flags 元数据。

仓库 helper、workflow 和正式运维文档仅固定并引用 `phoenix_metadata_readonly`、`phoenix-v3-db`、`phoenix_erp`；没有找到生产角色创建、授权或无交互连接的合法非敏感配置证据。当前不能把结果解释为角色变量拼写错误，也不能猜测缺失原因。

只有在正式运维提供非敏感的只读角色存在性、最小授权范围和连接契约证据后，才可重新进行 metadata-only 审计。在此之前不得创建角色、修改权限/认证、执行生产 DDL 或业务写入，也不得读取 secret、env 或 auth artifact。

## 历史会话/仓库生产读取路径梳理（只读证据）

本节仅整理既有仓库与 run 记录，不重新接触生产。

| 类别 | 证据 | 结论 |
|---|---|---|
| workflow | `.github/workflows/production-readonly-audit.yml:43-71,129-178` | 定义 validate、bundle SCP、SSH helper、metadata marker 和 fail-closed Enforce；SSH 凭据只被 secret 引用，未读取值 |
| helper | `scripts/ops/readonly-audits/packaging-metadata.cjs:95-152` | 固定 baseline、`phoenix-v3-db`、`phoenix_erp`、`phoenix_metadata_readonly`；只读事务和安全字段设计存在 |
| 已执行生产读取 | run `34830667068`；本报告 Review31 终段 | validate/SCP/SSH wrapper exit 0，checkout SHA 通过，DB 返回 `MISSING_ROLE/exit=2` |
| 未执行 | 同 run 的 helper 后续阶段 | image IDs、PG major、pending migration、dirty、容量、flags 未取得；未执行生产写入、DDL、迁移或权限变更 |
| 仅计划/fixture | `scripts/packaging-history-test/readonly-metadata.cjs` | 六类 DB 错误、只读权限反例、路径和 wrapper 均是隔离测试；不证明生产角色存在 |
| 历史失败 | runs `34823735277`、`34825204038`、`34826843478` | SHA mismatch、备份条目阻断、DB command failure，均保留且未追认成功 |

当前合法只读范围仅能由仓库契约证明，不能证明生产可连接。由于没有非敏感的生产角色存在、授权范围及连接契约证据，GO/NO-GO 仍为 **NO-GO**。不得猜测 `MISSING_ROLE` 的成因；需正式运维提供上述非敏感证据后才能重新审计。

## production-readonly 历史时间线（既有仓库证据）

- **授权与范围**：progress `:445-448` 首次记录本阶段授权输入：`APPROVE-PRODUCTION-READONLY-AUDIT`、`ref=main`、SQL/HTTP 为空；范围是受控只读审计。更早授权时间在仓库中没有可核实记录，不作推断。
- **初始路径**：scope-preflight `:11-16` 说明使用既有 production environment、SCP/SSH actions；workflow `production-readonly-audit.yml:43-68,70-117` 分离 validate 与 bundle/SSH。HTTP 和整行 SQL 因副作用/敏感输出被排除。
- **首次实际 production 读取**：run `34818687355`（scope-preflight `:16-30`，progress `:448-450`）：validate 成功、SCP 成功、protected execution exit1、证据上传成功；sanitized stdout 只有换行。远端部署身份及后续 metadata 未取得。
- **baseline 变化**：run `34823735277` 以 `69d89dd4...` 为 expected，checkout gate 返回实际远端 `a53d91f...` 前缀并 `SHA_MISMATCH`，未执行 Docker/DB 等（progress `:541-543`）。父级确认后 baseline 改为完整 `a53d91f33ff733bf28e19ca11d7491f1bfd46922`（progress `:547`，报告 `:708`）。
- **后续阶段事实**：`34825204038` 在 backup `UNSUPPORTED_ENTRY` 停止；`34826067560` 在 backup `UNKNOWN_DIRECTORY` 停止；`34826843478` 在 DB `COMMAND_FAILED/exit2` 停止（progress `:547-560`，报告 `:710-728`）。
- **最后实际读取**：`34830667068` validate/SCP/SSH wrapper exit0、SHA通过，DB 返回 `MISSING_ROLE/exit2`，Enforce fail-closed；没有 image/PG/migration/dirty/capacity/flags 结果（progress `:568-571`，报告 `:739-747`）。
- **fixture 与未执行项**：本地 helper/PG18/路径/错误分类测试均为 fixture（progress `:564-565`），不能替代生产证据。生产角色、授权与连接契约仍未证明。

结论保持 **NO-GO**。上述记录仅复述已有事实；本轮没有生产操作、dispatch、secret/auth/env 读取或原因推断。

## Handoff continuation verification (2026-09-15)

交接文档复核后继续执行本地验证。当前分支和既有生产审计证据未改变：生产仍为 **NO-GO**，依据 run `34830667068` 的 `DB/MISSING_ROLE/exit=2`。

- `node scripts/packaging-history-test/readonly-observability.cjs`：exit 0。
- `node --check scripts/packaging-history-test/readonly-metadata.cjs`：exit 0。
- `git diff --check`：exit 0。
- `node scripts/packaging-history-test/readonly-metadata.cjs`：48 个 unit/filesystem/shell assertion 均到达并通过；在隔离 PG fixture bootstrap 的 `docker create` 停止，实际本地状态为 Docker CLI 不可用、exit null。已修复 harness 对缺失 stderr 的处理，避免原先误报 `TypeError`；该失败不是生产证据。

未接触生产、未 dispatch、未读取 secret/auth/env；fixture 和历史失败证据保留。

## Metadata-only preflight PASS (2026-09-15, run 34958966261)

角色配置（系统所有者授权，runs 34958192211/34958343305：`phoenix_metadata_readonly` 创建并验证 `role_safe=true`，生产实测 `server_version_num=160014`）后，helper PG 主版本预期修正为 16（audit 分支提交 83799922，与 impl 分支 14971edf 内容一致），首次 metadata-only 预检全量通过：

- validate ✓；SCP/SSH wrapper ✓；CHECKOUT SHA 匹配 `a53d91f33ff733bf28e19ca11d7491f1bfd46922` ✓
- DB：role_safe=true、双只读设置 on、pgMajor=16 ✓
- FLAGS：`no_config, effective_default_all_off=true` ✓（生产旗标默认全关）
- BACKUP：METADATA_ONLY，8 对 dump 布局正确，旁目录仅安全摘要 ✓
- IMAGES：api `sha256:cedd8673…`、web `sha256:a198585f…`，两者 revision label 均为 `d49383cd…` ✓（注意：镜像 revision 与 checkout SHA 不一致，属既有生产状态，发布门禁需审查）
- CAPACITY：checkout/backup 各 ~41.9GB 总量 / ~13.1GB 可用 ✓
- MIGRATIONS：pending = [PackagingHistoryD1cEvidence1789353300496, PackagingHistoryReadIndexes1789362000000]；checkoutPending = []；appliedOutsideCandidate = [DropHouseOwnershipRedundantColumns1787647200000]
- 生产工作树 dirty=true（7 项）
- Enforce：`AUDIT_METADATA_RESULT=PASS`，run 终态 success

MISSING_ROLE 阻断时代正式关闭。后续发布门禁需处理：镜像 revision 与源码 SHA 不一致审查、dirty 项识别、2 个 pending 迁移的 schema-first 应用计划。

## 发布门禁审查：镜像/源码偏差定性（2026-09-15）

基于 run 34958966261 的 metadata 与本地 git 考古：

- 生产运行镜像 revision `d49383cd`（PR #230 merge，fix/packaging-fullscreen-release）；
- 部署目录 checkout `a53d91f3`（"fix: correct grade5 production baseline expectations"，2026-09-12）；
- d49383cd 是 a53d91f3 的祖先，落后 73 个提交；
- **关键定性**：`git diff d49383cd..a53d91f3 -- apps/api/src/database/migrations apps/api/ddl apps/api/migrations` 为空——该偏差区间不含任何迁移/schema 变更，属代码/文档/CI 修复漂移，无 schema 漂移；
- a53d91f3 距 origin/main（69d89dd4）仅 5 个纯文档提交（packaging33 审计证据，均 [skip ci]）；
- appliedOutsideCandidate 的 `DropHouseOwnershipRedundantColumns1787647200000` 为历史 R1 修复中已移除的不安全迁移（a162cda6 "fix: remove unsafe house ownership drop migration"），生产已应用、代码已移除，属已知状态；
- 生产 dirty 7 项待部署前清单化。

发布计划含义：本次发布必须从发布候选构建全新镜像（不沿用 d49383cd 运行镜像），schema-first 顺序部署，一次消除镜像/源码/迁移三层偏差。deploy.yml 的 schema-first 修复（64c92f38 迁移先于 API 切换 + fffbc0bd 外层回滚单次处理）已在位。实际部署等待用户明确批准；Q/L4 现场验收仍未完成。

## 生产 dirty 项清单化与定性（2026-09-15, run 34959648206）

helper 扩展 dirtyEntries（safeRelative 脱敏路径、50 封顶、仅路径不含内容；audit 分支 cc2937b6，impl 1cbdab06）后二次 metadata 运行再次全量 PASS。生产 dirty 7 项全部为未跟踪（`??`）历史只读审计遗留包：

readonly-audit-artifact-{34665332082,34668908316,34669810845,34681152901,34682099776,34683667139,34684274695}.tgz

定性：**良性**。无 tracked 文件修改（无 M/A/D 状态），无源码漂移，与本地 artifacts/ 中 grade5-preflight 运行 ID 吻合，属审计工具遗留。发布门禁无需处理；可在部署时顺手清理（非必需）。

至此全部只读发布门禁事项关闭。剩余：实际部署（待用户批准）、部署后健康/只读验收、Q/L4 现场验收。
## 生产发布完成与部署后验收（2026-09-15）

### 发布执行

- main：69d89dd4 → `0dc37daecf32293fd65b3eb2d00286821362b459`（54 提交 fast-forward，D1-C P0–P4）；
- 首次 dispatch（34960664263）被干净工作树硬门禁正确拦截（7 个良性审计遗留包）；
- 遗留包经 ops 通道移至 `~/deploy-audit-artifacts-archive`（移动非删除，run 34961225005：dirty 7→0）；
- 正式部署 run `34961323713`（approve_production=true，preserve_artifacts=true，mode=auto→full）：
  `✅ Code synced → DB healthy → 迁移前备份可读(2871 objects TOC) → 裸 SQL 迁移完成(schema-first, evidence /opt/phoenix/backups/migration-evidence/schema-first.kpEzOPQw) → Phase C 生产验证无 FAIL → Nginx reloaded → Web smoke passed`。

### 部署后验收（run 34962183528，审计基线已更新为发布 SHA）

| 断言 | 结果 |
|---|---|
| actualSHA = 0dc37dae | ✓ |
| dirty = false | ✓ |
| api/web 镜像 revision = 0dc37dae | ✓（73 提交镜像/源码偏差消除） |
| pgMajor = 16 | ✓ |
| flags no_config 全关 | ✓ |
| pending = []（2 个 D1-C 迁移已应用） | ✓ |
| checkoutPending = [] | ✓ |
| backup = 5 对（原 4 对 + 迁移前新备份 1 对） | ✓ |

### 边界遵守

- 未发行任何正式标签（Q/L4 未执行）；
- PKG_HISTORY_POLICY 旗标保持默认全关；
- 无生产业务写入（迁移仅 DDL 建表/索引）；
- 回滚预案：镜像回退（rollback tag 已在 deploy.yml 逻辑内）；迁移 down() 仅人工评审后使用。

**D1-C P0–P4 生产发布完成。** Q/L4 现场验收与旗标启用为后续独立工作。

## D1-C 发布后收尾（2026-09-15）

交接背景记录：main `5c608afd`、生产运行 `0dc37dae`、部署 run `34961323713`、部署后验收 run `34962183528`；旗标默认全关，两个 D1-C 迁移已应用，未发行正式标签。上述内容来自既有发布证据，本轮不重做生产发布。

### 发布后只读接口验证

目标接口为 `GET /api/bff/packaging/history` 及 `GET /api/bff/packaging/history/:packingCode`，需验证列表分页/过滤、详情结构及 401/403/404。当前仓库存在 mint token 脚本和生产只读 workflow，但没有专门绑定这两个包装历史 GET、固定脱敏字段和状态码矩阵的既有 workflow。为避免绕过认证通道，本轮未调用生产 API；该项登记为 **待建立只读审计通道**，不能以本地 fixture 或 metadata-only DB 审计代替。

### Q/L4 与旗标

新增 [Q/L4 验收准备](packaging-history-q-l4-acceptance-plan.md) 和 [旗标启用 runbook](packaging-history-flag-enablement-runbook.md)。两份文件均明确是准备材料；无现场照片、扫码、接收人、仓库/库位或交付签收事实，Q/L4 未通过，正式标签不发行。`PKG_HISTORY_POLICY` 继续保持默认全关。

### 残余 review 收口

- PRINT UNKNOWN/补打、扫码证据和物理纸张：软件门禁已有隔离测试，生产打印与现场扫码待 Q/L4/专门只读通道，不能称现场通过。
- JS/SQL 核验一致性、claim/JSON/append-only/并发幂等：已有本地 PG/事务证据；生产只读复核可查 metadata，不能执行业务写入。
- HTTP 权限矩阵、DataScope、历史列表/详情：隔离真实 HTTP 已验证；发布后生产最终 GET 验证待建立专门认证只读 workflow。
- 原 scope-audit 红灯、entity 残余差异和旧入口兼容：历史失败与 partial 保留，不能因发布后健康通过而豁免；由父级 review 逐项裁定。

GO/NO-GO：软件发布已由既有 run 验收，但发布后包装历史 API 只读通道和 Q/L4 现场证据尚未完成，因此**不申请正式标签或旗标启用**。

## 包装历史认证只读审计通道（2026-09-16）

已核对 `apps/api/src/modules/bff/packaging-history.controller.ts:10-17`：实际只读路由是 `GET /api/packaging/terminal/history` 与 `GET /api/packaging/terminal/history/:packingCode`，受 JWT、MenuGuard 和 `MENU_PKG_OP/MENU_PKG_MGR` 只读权限保护；此前预期的 `/api/bff/...` 路径不采用。

新增专用 workflow `.github/workflows/packaging-history-readonly-audit.yml` 和脱敏断言脚本 `scripts/ops/packaging-history-readonly-http-audit.mjs`。本地自检：两份 Node syntax exit0、workflow YAML parse exit0、`git diff --check` exit0、带 `TEST_TOKEN_SENTINEL` 的响应 fixture 未泄漏业务值。断言仅输出状态码、结构字段存在性和计数；请求矩阵为未认证 401、认证列表 200、固定 `__AUDIT_NOT_FOUND__` 详情 404；仅使用 GET，token 在 workflow 临时目录/变量中并由 trap 销毁。

专用分支提交 `71a2a6bb` 已推送到 `audit/packaging-history-metadata`。按交接固定批准短语尝试一次 dispatch 时，GitHub API 返回 HTTP 404（workflow 尚未在默认分支注册），因此 stage 终态为：validate 未启动、SCP 未执行、SSH wrapper 未执行、token 未铸造、HTTP GET 未执行、证据上传未执行。未重试，不将 404 冒称生产失败或通过；生产发布、写操作、旗标和标签均未触碰。该通道需维护者先将 workflow 合法注册到默认分支后才能再次审计。
