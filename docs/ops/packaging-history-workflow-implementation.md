# 包装历史工作流本地实施与验收

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

发布必须另批。候选评审需看本地提交、兼容影响、schema先行次序、公司/场policy整组版本、回退保留事件策略，并独立处理原runtime scope-audit和entity基线门禁。没有授权时不做push、部署或生产试点开旗。

L4需要现场确认箱事实、旧标签逐箱映射、真实库位/接收人、设备/纸张/DPI/扫码容量及实际交付；C仅记录接收人，不补造本人登录签收。跨时区测试证明DATE字符串保持，不证明未知公司业务时区已配置；ownership.businessTimezone仍明确UNKNOWN。数据库schema保留遗留bootstrap依赖，报告不把TS迁移通过等同完整生产环境一致。

目前不是生产发布批准书。近生产规模的P95≤1秒压测、所有合法移库/拆批组合和物理设备矩阵未执行；这些限制保留在发布评审清单，不用“有代码”冒充完成。

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
