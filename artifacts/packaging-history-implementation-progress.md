# 包装历史实施进度（协调者只读）

- 授权：D1-C，P0–P4（排除 P3-E/P5），仅本地开发/隔离测试/local commit；发布另批。
- 唯一执行者：本次 Codex CLI 主线程；无子代理。
- 起点：69d89dd44b8e1461d7eaf5193e60c994255aed2c，main。
- 实现分支：impl/packaging-history-d1c-local；main 不移动，不 push。
- 开始工作区：仅已有未跟踪 artifacts、设计及前端审计；全部保留，未读取认证 artifacts。
- 已完整分段阅读设计与前端 audit；项目 AGENTS 及迁移 README 已读；业务目录无局部 AGENTS。

## TODO

- [x] cwd/status/授权边界/专用分支
- [ ] P0 诚实反馈与 partial 门禁
- [ ] P1 历史/详情/URL/精确来源/DataScope
- [ ] P2 五表身份事件/并发幂等/原量原日
- [ ] P3-M 打印请求/扫描证据/D1-C confirm
- [ ] P4 日报/移动统一/旧入口
- [ ] unit/DOM/API+Web tsc/约束检查
- [ ] 隔离 PG18 全迁移/事务/并发/真实 HTTP 权限矩阵
- [ ] 原 runtime scope-audit 分类留痕/浏览器 E2E
- [ ] 实施报告/验收矩阵/local commits/未 push 证据

## 进度日志

2026-09-14：创建本地实现分支；方案增加本次授权覆盖条款，并限定 11.2 本人会话仅适用 A/B。尚无业务测试 PASS。未接触生产。

P0：移除后台 setStep 伪入账完成页及死打印链接；交接状态失败/partial/空箱禁提交，取消全选当扫描及自动成功跳转；后端 HANDOVER_ONLY 缺任一库存侧证据禁止调用生成。API tsc exit 0，Web tsc exit 0，既有交接回归 4 passed/0 skipped/0 failed exit 0。完整 P0 范围与逐组核验仍待后续统一证据服务，不宣称闭环。
隔离环境：新建 PG18.6 空库 packaging_history_test，旧内部 network 端口未发布造成 ECONNREFUSED，已停该本次新建容器并保留；另建 packaging-history-test-pg18-loopback，仅 127.0.0.1:55432。没有接入既有 DB/API 或读取凭据。

P1/P2/P3-M 在途：新历史服务/事件核验器、读写控制器、五表 TS 迁移（1789353300496）、服务端 namespace 与命令事务、独立 URL hook 和共用详情页已编写，尚未验收。类型检查发现的新代码错误正在逐项修复，不计 PASS。既有 81 条 TS 迁移真实执行 exit 0；新迁移执行 exit 0。重建同时发现 brd_farms/brd_houses 仍依赖运行时 bootstrap，迁移链通过不代表完整应用 schema 已就绪；隔离 harness 正补实际 bootstrap 验证。尚无生产/实物完成声明。

真实校验更新：PG 专项第三次 11/11 PASS（前两次编译/fixture 长度失败保留）；HTTP 第三次 9/9 PASS，实际 Auth 登录/JWT/MenuGuard/DataScope，普通 OP/MGR/无范围/撤权。原 runtime scope-audit 在隔离完整 AppModule API3100 已跑：2 PASS/28 FAIL/1 SKIP，exit1；没有使用生产身份。下一轮修复依据 parent-review：加严格命令白名单、完整来源集合、组/ledger 唯一性、可信 sys_dict 公司场策略（不 seed/启用配置）、旧查询范围及标签失效复核。新增代码仍在验收中。
浏览器环境失败台账：Docker 浏览器网络无法到宿主工具 namespace API；复制镜像现有 headless runtime 到本任务 artifacts 后发现缺4个共享库，局部复制测试 runtime 库并以进程 LD_LIBRARY_PATH 启动，不安装系统包/不改CLI。DOM 首次 inherited NODE_ENV=production 导致 act 不可用，test 模式46/48；两例旧 mock 增补 useSearchParams 后待复跑。最初 4/4 是静态 readFileSync 回归，非 DOM 验收。

收口轮：rebuild1 PG18 从空库执行冻结 SQL、真实 bootstrap、全部82条 TS（exit0）；不是修改迁移后零条执行。新增SQL签名keyset/count、原来源集合与班次日期验证、typed JSON CHECK/不可变事件、退役码永久阻断、扫描后confirm重新解析、操作精确重放及白名单、按真实角色核接收范围。PG/HTTP第8轮31/31 exit0；DOM第4轮48/48 exit0；旧API单测36 pass/8 skip/0 fail（3 suites），跳过项保留。nullable与constraint、迁移down/DML脚本exit0。DML扫描中DDL触发器UPDATE关键字误报采用显式头注释豁免，未加入业务DML。entity真实只读diff393>300 exit1，正在对照独立基线空库（55434），不改baseline。
浏览器第5轮前7步通过，日报旧MENU_PKG_MGR单一权限导致OP跳转，已改OP/MGR可读并重跑；不能沿用第4轮9/9结论作为最新版结果。旧输入兼容仅接受已有箱namespace、本人真实逐箱会话证据、精确唯一接收人；无证据仍409，不生成假扫描。

最终验证 2026-09-14T03:44:55.564Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc.log。
最终验证 2026-09-14T03:44:58.415Z：web-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-tsc.log。
最终验证 2026-09-14T03:45:04.000Z：api-unit exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-unit.log。
最终验证 2026-09-14T03:45:13.482Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http.log。
最终验证 2026-09-14T03:45:15.655Z：web-dom exit=1, signal=none；日志 artifacts/packaging-history-local/verified-web-dom.log。
最终验证 2026-09-14T03:45:15.699Z：nullable exit=0, signal=none；日志 artifacts/packaging-history-local/verified-nullable.log。
最终验证 2026-09-14T03:45:15.837Z：constraint exit=0, signal=none；日志 artifacts/packaging-history-local/verified-constraint.log。
最终验证 2026-09-14T03:45:16.088Z：migration-down exit=0, signal=none；日志 artifacts/packaging-history-local/verified-migration-down.log。
最终验证 2026-09-14T03:45:16.518Z：migration-dml exit=0, signal=none；日志 artifacts/packaging-history-local/verified-migration-dml.log。
最终验证 2026-09-14T03:45:17.688Z：entity-diff exit=0, signal=none；日志 artifacts/packaging-history-local/verified-entity-diff.log。
最终验证 2026-09-14T03:45:17.694Z：entity-gate exit=1, signal=none；日志 artifacts/packaging-history-local/verified-entity-gate.log。
最终验证 2026-09-14T03:45:18.482Z：runtime-scope-audit exit=1, signal=none；日志 artifacts/packaging-history-local/verified-runtime-scope-audit.log。
最终验证 2026-09-14T03:45:25.497Z：browser exit=0, signal=none；日志 artifacts/packaging-history-local/verified-browser.log。
最终验证 2026-09-14T03:46:51.854Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r2.log。
最终验证 2026-09-14T03:46:54.073Z：web-dom exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-dom-r2.log。
最终验证 2026-09-14T03:47:29.710Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r3.log。
最终验证 2026-09-14T03:47:39.347Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r2.log。
最终验证 2026-09-14T03:48:15.905Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r4.log。
最终验证 2026-09-14T03:48:25.806Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r3.log。
P1/P2/P3-M 后端收口：最新 api-tsc exit0；PG18+HTTP 39 pass/0 skip/0 fail（25 PG +14 HTTP）。新增精确只读 trace、不生成假证据的旧字段适配器及关旗重放回归。前端DOM断言随“旧交接记录≠核实入账”文案修改，真实重跑54/54。准备本地后端阶段提交，未push。

最终验证 2026-09-14T03:50:38.873Z：browser exit=0, signal=none；日志 artifacts/packaging-history-local/verified-browser-r2.log。
最终验证 2026-09-14T03:52:41.887Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r5.log。
最终验证 2026-09-14T03:52:44.327Z：web-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-tsc-r2.log。
最终验证 2026-09-14T03:52:55.048Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r4.log。
最终验证 2026-09-14T03:53:06.889Z：browser exit=1, signal=none；日志 artifacts/packaging-history-local/verified-browser-r3.log。
第二次最终空库重建：发现孤立commitReceipt被全空旧证据误判PENDING的边界，已将JS与SQL状态同时改为UNKNOWN/INVENTORY_ONLY并加反例。修改过迁移后停止并保留rebuild1容器，rebuild2全新PG18再跑冻结SQL+bootstrap+82 TS，全部exit0，bootstrap diagnostics0；未用0 migrations掩盖修改。第二组流水故障测试已精确改为SKU20时失败，确保首组曾写入但最终一起回滚。软件验收仍在收尾，生产始终未访问。

最终验证 2026-09-14T03:56:02.849Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r6.log。
最终验证 2026-09-14T03:56:05.401Z：web-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-tsc-r3.log。
最终验证 2026-09-14T03:56:10.680Z：api-unit exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-unit-r2.log。
最终验证 2026-09-14T03:56:20.809Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r5.log。
最终验证 2026-09-14T03:56:22.878Z：web-dom exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-dom-r3.log。
最终验证 2026-09-14T03:56:22.921Z：nullable exit=0, signal=none；日志 artifacts/packaging-history-local/verified-nullable-r2.log。
最终验证 2026-09-14T03:56:23.057Z：constraint exit=0, signal=none；日志 artifacts/packaging-history-local/verified-constraint-r2.log。
最终验证 2026-09-14T03:56:23.291Z：migration-down exit=0, signal=none；日志 artifacts/packaging-history-local/verified-migration-down-r2.log。
最终验证 2026-09-14T03:56:23.689Z：migration-dml exit=0, signal=none；日志 artifacts/packaging-history-local/verified-migration-dml-r2.log。
最终验证 2026-09-14T03:56:24.813Z：entity-diff exit=0, signal=none；日志 artifacts/packaging-history-local/verified-entity-diff-r2.log。
最终验证 2026-09-14T03:56:24.819Z：entity-gate exit=1, signal=none；日志 artifacts/packaging-history-local/verified-entity-gate-r2.log。
最终验证 2026-09-14T03:56:25.569Z：runtime-scope-audit exit=1, signal=none；日志 artifacts/packaging-history-local/verified-runtime-scope-audit-r2.log。
最终验证 2026-09-14T03:56:30.835Z：browser exit=1, signal=none；日志 artifacts/packaging-history-local/verified-browser-r4.log。
最终验证 2026-09-14T03:57:53.640Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r7.log。
最终验证 2026-09-14T03:57:56.252Z：web-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-tsc-r4.log。
最终验证 2026-09-14T03:58:06.544Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r6.log。
最终验证 2026-09-14T03:58:08.644Z：web-dom exit=1, signal=none；日志 artifacts/packaging-history-local/verified-web-dom-r4.log。
最终验证 2026-09-14T03:58:48.380Z：api-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-api-tsc-r8.log。
最终验证 2026-09-14T03:58:50.745Z：web-tsc exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-tsc-r5.log。
最终验证 2026-09-14T03:59:01.219Z：pg-http exit=0, signal=none；日志 artifacts/packaging-history-local/verified-pg-http-r7.log。
最终验证 2026-09-14T03:59:03.338Z：web-dom exit=0, signal=none；日志 artifacts/packaging-history-local/verified-web-dom-r5.log。
最终验证 2026-09-14T04:01:37.371Z：browser exit=0, signal=none；日志 artifacts/packaging-history-local/verified-browser-r5.log。
最终扩展：PG/HTTP47/47（31 PG、16真实HTTP），DOM54/54，浏览器16/16（断响应后原key恢复、无班次历史、旧URL、四时区）。API/Web tsc exit0。修复报告对齐的旧mock契约后重跑，不绕测试。原runtime 2/28/1 exit1；entity393>300 exit1（同环境旧81迁移也393），这两项仍是发布待审红灯。L4未执行且生产Q未启用。
