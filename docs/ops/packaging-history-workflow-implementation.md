# 包装历史工作流本地实施与验收

> 本轮最新结论见文末“恢复后的同源码交付”。此前各轮报告与失败保留为历史记录，不作为当前源码的验收结论。

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
