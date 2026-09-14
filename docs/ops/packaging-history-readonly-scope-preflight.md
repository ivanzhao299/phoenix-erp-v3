# 包装历史：生产只读预检与旧 scope 审计有效性（2026-09-14）

**发布阻断，非发布批准。** 本轮实际运行受控远端 audit，但远端执行失败、未取得生产身份；隔离真实 HTTP 另复现股东资金 summary 的 SELF/跨公司泄露。应用、迁移、workflow 均未改。唯一 CLI，无代理；实际 danger-full-access / approval never。起点19101533 tracked clean。没有 push/deploy、生产 DDL/业务写、修改 secret/config/flag 或读取旧认证 artifact。

## 受控远端审计

完整读取本地 workflow、runner 和既有 bundle 候选，并通过 GitHub API 验证远端 main=69d89dd44b8e1461d7eaf5193e60c994255aed2c、远端 workflow 内容及 runner SHA256。runner `b875d24850b741ee5aa420fafba703f110a3f14bf294d49b6a4c10531a69193d` 与本地一致。这是 GitHub 源码身份，**不是生产部署身份**。

workflow 使用已有 environment=production、DEPLOY_* secrets 引用及既有 SCP/SSH actions，没有读取 secret 值、猜测主机或另建认证通道。输入仅允许远端 checkout 内的 SQL/HTTP 文件。SQL 路径具备禁止词检查、PGOPTIONS default_transaction_read_only=on 和 BEGIN TRANSACTION READ ONLY，但 HTTP 路径会另起完整 AppModule、调用 bypassPassword 登录，初始化可能尝试写；不能把 GET/HEAD manifest 等同无副作用。因此 HTTP 不启用。packaging-isolation-schema SQL 输出整行业务 JSON，超出最小非敏感列要求，也不运行。现有 runner 没有 image IDs、PG major、迁移文件对账、dirty、磁盘/备份容量、白名单新写flags检查，SQL输入不能替代宿主机检查。不为此 push 新脚本。

实际脱敏命令（exit0）：

```bash
gh workflow run production-readonly-audit.yml --ref main   -f approve_production=APPROVE-PRODUCTION-READONLY-AUDIT   -f assertion_sql_path= -f http_assertions_path=
```

runID **34818687355**，2026-09-14T07:37:02Z创建，立即写进展文件。[GitHub run](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34818687355) 已 completed/**failure**：validate成功、SCP成功、protected execution exit1，随后证据上传成功。`gh run view ... --json` 与 `gh run download ...` 均exit0。下载的 sanitized stdout 只有1字节换行；失败日志仅提供退出1，没有足够信息定位原因。没有重试、换通道或把 runner 的声明当成运行证明。

| 请求项 | 实际结果 |
|---|---|
| 远端GitHub main/ref、workflow/runner身份 | 已只读核实，69d89dd4与上述hash |
| 实际部署SHA、API/Web image IDs | 未取得，不能以workflow headSha替代 |
| PG major、pending迁移文件vs记录 | 未执行SQL，未取得；无migration run |
| 部署工作树干净、磁盘/备份容量 | 未取得；现接口不提供 |
| 新写flags白名单状态 | 未取得；未dump环境/未修改配置 |
| 生产强只读DB事务 | 本次SQL为空，没有执行；不能声称已验证 |

证据 `artifacts/production-readonly-audit-34818687355/run.json` 与同目录日志、`artifacts/packaging-history-scope-preflight-delivery.json`。剩余检查需要父级审定可在既有远端版本运行的最小bundle/入口；若需要push，属于后续阶段，当前已停该路径。SCP留下本run临时bundle；不远程清理。workflow已终态，没有遗留本次长运行远端测试服务的证据。

## 原审计有效性逐项闭合范围

保留原 `apps/api/test/scope-audit.sh` 原文、原hash及 `verified-runtime-scope-audit-r7.log`：2 printedPASS/28FAIL/1SKIP，F06的401空对象假PASS不算有效，只有T11有效拒绝。本轮不删除/改写旧证据，不宣称原脚本已全绿；原脚本本轮未重跑。新可重复harness `node scripts/packaging-history-test/scope-validity.cjs` 直接运行完整AppModule和真实HTTP，同一路由，非mock或替换无关端点。

先用真实PG连接验证 localhost55432 / packaging_history_test / PG18.6 (180006)，再启动AppModule；ignoreEnvFile、随机进程JWT、禁cron/interval/timeout，仅允许localhost55432/3100连接。为每轮新建TEST命名空间，两个公司、两个项目、6普通账号、明确role/menu/scope授权；每种PO/payment/AP/fund/shipment/PR各3行正/负样本。没有改已有正式角色或业务数据，没有业务schema变化；fixture是测试SQL构造，不称官方业务创建链。全程不输出密码/token。

6账号是旧场景的**可控普通角色等价fixture**：GROUP两人、COMPANY buyer/factory、PROJECT、SELF。不是对原ROLE_PRC_BUYER等部署角色现存权限配置的认证，admin/ceo只是fixture名称，未冒充CFO认证。原6缺fixture与admin旧密码失败已从范围检查前提中消除，但原角色配置矩阵仍须单独审定。

| 原场景 | 本轮精确检查与结果 |
|---|---|
| 6登录 | 真实随机密码HTTP登录均成功、状态和token存在均检查 |
| T01/T02/T03 | 正向两条公司PO/total=2、异公司详情403、原公司详情身份一致，通过 |
| T04/T05 | 无fund权限403；显式GROUP普通角色查看指定公司2条真实fund，通过，不称CFO业务权限认证 |
| T06/T07 | buyer dashboard.poCount=2；GROUP总数与真实DB计数对账，通过，不仅200 |
| T08 | payments精确非空ID集合、排除外公司，通过 |
| T09/F05 | SELF列表items=[]、total=0，但summary泄露他人金额，**FAIL**；追加跨公司summary同样FAIL |
| T10/T16 | GROUP有INIT V为200，buyer无权限为403，通过；不是“只有ROLE_ADMIN”这种无源码依据声明 |
| T11 | 无token真实401，通过 |
| T12 | PROJECT精确1条ID/projectCode/total=1，排除同公司另一项目，通过；修复旧无条件PASS判法 |
| T13/T14 | PR公司非空集合、GROUP两公司3条PO精确集合，通过 |
| T15 | fixture直接生成跨公司shipment ID，实际403；不依赖macOS psql/旧DB、不缺样本SKIP |
| F06 | HTTP200、body.code及真实数组、精确2条非空AP ID集合，通过；错误/空data不能充作PASS |
| F01–04/F07–08 | 原summary/ar-aging/accounts路径，在各原身份条件下均明确404，通过的是退役契约，**未验收旧finance功能或新finance其他入口** |

最终30检查：**28PASS /2FAIL /0SKIP，进程exit1**。其中6登录、6退役契约、18活跃HTTP检查（含2失败）；T10/T16与T09/F05合并检查已在名称中注明，不虚增为独立用例。所有错误响应均先检查真实HTTP；数组严格结构与ID集合，不接纳缺公司/空结果冒充范围证明。对生产角色/所有业务路由没有扩大结论。

## 实际活跃授权缺陷：最小待审修复范围

调用：`GET /api/v2/procurement/shareholder-funds?companyCode=<TEST-A或TEST-B>` → `PaymentsController.listFunds`（controllers/payments.controller.ts:83附近）→ `PaymentsService.listShareholderFunds`（services/payments.service.ts:671）。同一路径还注册ShareholderFundsController；本次HTTP返回含summary，证实实际命中Payments路径，不把另一个controller的修复当该路径已安全。

`fundQb`在SELF使用shareholderId过滤，但summary在约705行重新创建QueryBuilder，仅applyFilters（用户查询条件），没有SELF或company/project范围。真实TEST账户没有任何自身fund，own公司两行他人fund100+200，foreign公司一行300：两次GET都200、items=[]、total=0、summary.totalOriginal=300，预期0。非敏感复现数据及当时源码指纹已保存。

父级可审的最小修复：仅将该方法的可见性谓词统一应用于列表/count/summary，SELF绑定当前userId，其余使用同一DataScopeHelper，查询参数不能扩大范围；保持既有mask/分页/响应字段。补SELF本人及他人、同/异公司、PROJECT、GROUP、无范围、组合查询的实际HTTP汇总对账。另单独确认重复路由的权威归属，未经评审不任意删除controller或改变API契约。无需采购六列/日结/其他schema变更。**当前未修业务代码，发布保持阻断，交父级审范围，不自行豁免。**

## 测试版本、失败与收尾

最终harness结果 `artifacts/scope-validity-1789371808502/results.json`：实际HEAD19101533+记录的新增harness；before/after目标文件hash、dirty diff、源码指纹一致：`c3901c5780c830825f38f8cfee295602bb43deebb6452b79fa9a2880d4142897`。机器交付摘要记录harness独立hash、精确command/start/finish/exit和full证据hash。应用/workflow/迁移相对19101533无diff。

新增harness首两轮原生fetch被进程隔离网络守卫拒绝（fetch failed / ISOLATED_TEST_OUTBOUND_BLOCKED），全FAIL保留；改用固定localhost的node:http真实网络请求后成功，未关闭网络隔离、未改CLI配置。首有效29检查28PASS/1FAIL；随后增加跨公司反例并补时间字段，最终30检查28/2。未覆写或删除旧fixture、旧日志。

实际 `node --check .../scope-validity.cjs` exit0、`node .../verify.cjs api-tsc web-tsc` exit0，两组分别`verified-api-tsc-r32.log` / `verified-web-tsc-r21.log`；`git diff --check` exit0。原25组应用suite仍对应cdb49bb1及原指纹，此次应用未改，**没有重新跑/追认unit/DOM/PG业务全suite/browser/P95/候选镜像**。本轮新增PG fixture+真实scope HTTP检验证据与此前业务suite分开。

本轮只启动既有专用PG容器packaging-history-test-pg18-review29-final；harness每次finally关闭完整API与连接。完成后docker stop该容器exit0，保留全部fixture与证据。没有触碰其他项目进程/容器。提交仅本次harness/报告/脱敏摘要，不git add-A、不amend/reset、不绕hook、不push。最终本地commit见交付答复及receipt，不预填未来SHA。
