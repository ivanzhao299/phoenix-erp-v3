# 好业财正式生产数据自动同步恢复

记录日期：2026-10-08（Asia/Singapore / 北京时间同为 UTC+8）。业务依据为本次财务部门确认及用户对全部原暂停范围的恢复授权；历史 UAT 分类和清理授权不适用于本次正式好业财数据。本次不清理、删除、重置或重新归类远端数据。

## 交付与生产状态

```text
BASE_MAIN=540c3717bffaf2ce02f353ff7e8b5b9bf48dc974
BRANCH=codex/restore-chanjet-readonly-auto-sync
RESTORE_PR=https://github.com/ivanzhao299/phoenix-erp-v3/pull/366
MERGED_MAIN_SHA=PENDING
FINANCE_CONFIRMATION=PRODUCTION_DATA
FINANCE_SOURCE_SCOPE_CONFIRMED=YES (用户确认所有原暂停范围)
APPROVED_ACCOUNT_BOOKS=现存3个已启用的一对一绑定；启用前须再次与审批清单逐项比较
APPROVED_COMPANIES=COMP-LAO-AGRI,COMP-LAO-XINGCHI,COMP-LAO-FOOD
CONFIG_FLOOR_BEFORE=2
CONFIG_FLOOR_AFTER=3_CANDIDATE_NOT_ACTIVATED
CONFIG_FLOOR_PROMOTION=HOLD_EXACT_MERGED_SHA_APPROVAL_REQUIRED
CHANJET_READONLY_SYNC_ENABLED=false (当前生产)
CHANJET_ERP_INBOUND_SYNC_ENABLED=false (当前生产；恢复后也必须false)
REMOTE_READ=NOT_RUN_IN_RESTORATION_TASK
REMOTE_READ_AUTH=NOT_CHECKED
REMOTE_WRITE=NO
LOCAL_MIRROR_SYNC=PREPARED_NOT_ENABLED
SCHEDULER_RESTORED=NO
FIRST_CONTROLLED_SYNC=NOT_RUN
NEXT_SCHEDULED_SYNC=NONE_WHILE_HOLD
FINANCE_MAPPING=BOOK_BINDINGS_VALID;CONFLICTS_0;PENDING_CANDIDATES_23_RETAINED
FINANCE_RECONCILIATION=CURRENT_RESULTS_0;SCOPED_REFRESH_PREPARED
ERP_FINANCE_LEDGER_AUTO_POST=NO
ERP_BUSINESS_DATA_OVERWRITE=NO
DATABASE_MIGRATION=NO
PRODUCTION_API_HEALTH=PASS
PRODUCTION_STORAGE_GUARD=PASS
PRODUCTION_WORKTREE_CLEAN=PASS
REQUIRED_CI=PENDING
RESTORE_STATUS=HOLD
NEXT_ACTION=CONFIG_FLOOR_APPROVAL_REQUIRED
```

候选配置契约 v3 与生产已激活 v2 是两种状态，不能把仓库完成解释成已经恢复生产。普通应用发布始终 HOLD；正式开关启用、首次有限验证、进入正常调度分别验收。

## 暂停记录及业务分类

已读取用户引用的“制定UAT业务数据清理方案”和“整理 Chanjet 基线准入证据矩阵”。R1.6 明确把暂停定义为 `RESET_MAINTENANCE_HOLD`，目的是阻止本地 reset 后回流；不是永久产品停用决定。R3 的 durable job=0、两类待写回=0、3轮稳定检查及 R4.4 guard PASS 属于当时归档事实。历史 reset 前100个 RUNNING job 和当时默认开启行为不能沿用为当前状态。

本次财务确认覆盖全部正式来源；恢复清单仍只接受当前已启用、有效的一对一账套绑定。未来新增账套、禁用账套、待审核候选、跨公司错绑和业务差异都不会因此自动获批。旧 reset epoch 的“新增镜像全零”不适合恢复后的持续验收；此后按批准范围检查正常镜像增量及禁止事实变化。

参考：`docs/uat-data-governance/full-reset-chanjet-maintenance-window.md`、`full-reset-r1-6-gate-resolution.md`、`full-reset-r3-production-closeout.md`、`docs/product-acceptance/c3-production-transition-closeout.md`。

## 当前能力矩阵

| 能力 | 现有实现 / 当前生产 | 数据方向 | 本任务恢复范围 |
|---|---|---|---|
| 自动只读镜像 | scheduler已存在；生产flag=false | 好业财→本地镜像及作业 | YES；首次验证后再开定时循环 |
| 应收快照 | 财务权限保护的手动sync-ar；生产flag=false | 好业财→chanjet_ar_snapshot | 按既有手动流程；不新增自动历史补跑 |
| 财务对账 | 本地映射/镜像对账和独立月度AR对账 | 本地读取、计算、差异记录/告警 | YES；差异留人工审核 |
| ERP入站会计镜像 | 独立inbound gate；当前false | 好业财→ERP会计数据 | NO |
| ERP正式应收入账 | 预览、dry-run、财务总监权限；非dry-run还受现有inbound gate约束 | chanjet_ar_snapshot→fin_ar_ledger | 不开启；保留流程，正式执行需独立授权 |
| 凭证/业务远端写回 | 独立审批/outbox/canary Gate | ERP→好业财 | NO；恢复策略下传输层也拒绝写路径 |
| 授权票据/token维护 | 独立认证维护；不等于业务同步flag | 好业财授权协议 | 不调整现有频率；新代码限制超时及敏感日志 |

两个既有flag不是万能同步开关。readonly恢复不会调用ERP入站服务、正式入账、库存动作、订单写入或远端传输。

## 新鲜生产只读证据

[本次正式 Actions 只读取证 37752650365](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37752650365)，采集时间2026-10-08 16:51:58 +08:00。临时入口提交 `147ec9223e606be47414b057a556e81e4cd75cdb` 独立审查通过，只提供audit选项；没有把分支应用代码部署到生产。入口使用已安装v2 guard、原root trusted path和FD9锁，SQL为`PGOPTIONS read_only=on`加显式只读事务。只创建受限取证程序/SQL文件，不写业务数据库。

| 检查 | 本次实际结果 |
|---|---|
| 已激活floor | v2 / HOLD；现有关键文件逐字节门禁通过 |
| checkout / API / Web身份 | 与原批准23c7af86基线一致；guard实际校验image pins，Actions文本出现掩码重合，完整SHA取已批准基线，不从掩码日志重建 |
| API image ID | sha256:69050540350d1f9f501960e6fe85d56ffb3b8b059b5111cf436371872638503b |
| Web image ID | sha256:92cb26fadc8185aa5f391f36eb303e02cb61a82693c4b72652960bb24ab755e3 |
| runtime flags | readonly=false / inbound=false |
| DB/API/Web | 全部healthy；API readiness=200 |
| /data及工作树 | installed guard PASS；clean main |
| 当前账套/绑定 | 3个enabled且syncEnabled=true；公司ACTIVE；缓存公司与绑定公司一致 |
| RUNNING / QUEUED / bootstrap候选 / legacy RUNNING | 0 / 0 / 0 / 0 |
| writeback / WMS待处理 | 0 / 0（当次保守计数；候选代码已改用真实ACKNOWLEDGED/CANCELLED/REVERSED终态） |
| 映射冲突 / 待审核候选 | 0 / 23；待审核不是自动审批授权 |
| 原始镜像 / 实体镜像 / AR快照 | 17717 / 41577 / 150；不删除现存正式来源镜像 |
| 镜像最近刷新 | 原始2026-10-06 00:17:21 +08:00；实体00:17:29 +08:00 |
| 对账结果 / inbound runs / AR总账 / AR发票 | 当前均0；这是现场读数，不是再次清理要求 |
| token状态 | 持久记录存在；最近状态更新时间2026-10-08 16:46:08 +08:00；不等于远端读取权限已实测 |
| 本地预算 | 当月计数1737；当日读/总调用各1；provider实际剩余额度尚无实时证据 |

账套参考清单来自既有受控绑定与本次现场三公司对应关系：

| 正式账套 | ERP公司 |
|---|---|
| 3533914511118750 | COMP-LAO-AGRI |
| 3537748712226818 | COMP-LAO-XINGCHI |
| 3539743721526654 | COMP-LAO-FOOD |

第二个账套ID在Actions日志中存在掩码重合。启用事务必须在服务器内比较上述完整审批清单与实际数据库值；不把日志文本前缀视作完整ID证明。首次候选采用农业账套、`202610`、`RECEIVABLE_STATISTICS`、一次尝试；批准清单与启用时刻仍需绑定精确merged SHA。

较早的通用生产Git只读审计 [37749800086](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37749800086) 因root账号与checkout属主不同触发Git dubious ownership，未取得现场数据。没有关闭所有者门禁；新入口仅对批准物理checkout使用per-command safe.directory并关闭hooks/fsmonitor。

## 配置契约与过渡

v3引入三个明确策略，应用和Compose默认均HOLD；readonly flag缺失/false仍停用，只有显式true并具备合法审批策略才能执行：

| 策略 | readonly / inbound / remote业务写 | 可执行范围 |
|---|---|---|
| HOLD | false / false / 不新增任何写授权 | 状态查询，已有独立授权的只读诊断 |
| READONLY_VERIFY | true / false / false | 30分钟内指定账套、期间、scope的一次durable手动同步；cron禁用 |
| READONLY_ACTIVE | true / false / false | 审批账套范围，保留每日四次调度；必须有首次job与VERIFIED证据文件 |

READONLY_VERIFY的必要性：直接true重建API会同时开放cron并可能重放旧任务，无法满足“先有限验证，后正常调度”。此状态不增加会计写权限，到期后API执行入口停用。

生产scope/policy来源为受限root floor记录。wrapper把审过的策略注入Compose；`.env`仍只拥有获批readonly flag和原五键tuple，不能由继承shell环境覆盖。审批绑定v3、floor SHA、生产数据分类、账套/公司、数据类型、期间策略及首次范围。ACTIVE仅接受双证明：本地受限首次验证文件及同一审批ID的SUCCESS durable job。

晋升流程：

1. PR全部required CI通过并合并，冻结新的精确main SHA。
2. 单独取得该SHA的floor晋升批准；`deploy.yml mode=api`、`approved_config_floor_sha=<精确SHA>`，Web不构建/重建、凭据不轮换，旧C3一次性选项不启用。
3. 旧已安装v2 guard先验证原floor、root路径、干净main、runtime pins、false/false和/data。新helpers逐字节等于批准的merged对象；实际运行API revision→target migration diff必须0。
4. 锁内保存原floor/active/环境摘要，先写带runId、old/new pins、30分钟deadline的CODE_HOLD marker，再建立v3 floor/active；不改已发布v2源文件、不删除旧floor证据，不在配置中间态调用Compose。
5. FF至批准main，正式Actions按现有image事务只重建API，保持HOLD。新candidate的OCI revision和API关键文件必须匹配新floor。旧API不满足新floor时不能自动回滚启动，失败保全marker并HOLD。
6. API健康且运行身份一致才关闭CODE_HOLD marker。任何未完成/到期/非本runId过渡阻断后续调用，不能无限延期。
7. 独立readonly配置事务进行首次验证和ACTIVE；同样使用root trusted paths、FD9锁、最新精确main、已部署API SHA及/data门禁。

没有取消clean-worktree、root路径/ACL/mountinfo、SHA、migration baseline、镜像pin或失败保护。生产不执行schema migration。中断后不自动恢复旧`.env`、旧Git、数据库或旧不安全API；需独立、可审的操作恢复。

## 本地写入边界

源码实际只读路径涉及：`chanjet_sync_jobs`、`chanjet_account_books`、`chanjet_read_snapshots`、`chanjet_entity_snapshots`、`chanjet_ar_snapshot`、`chanjet_master_mapping`、`chanjet_api_field_catalog`、`chanjet_erp_field_mapping`、`chanjet_reconciliation_results`、`sys_chanjet_api_budget`，以及既有`sys_alerts`、`sys_cron_heartbeat`、`sys_chanjet_state`和`sys_operation_logs`。字段表/主映射表在源码中为单数命名，不能照示例猜表名。

恢复周期停止自动确定性映射批准、全局角色重分类、全局字段弃用和历史差异auto-resolve；已有APPROVED决策保留，新字段建议PENDING。既有科目SOURCE_ONLY只读引用与账套已有绑定是来源元数据，不能用于ERP正式入账审批。应收服务不再启动/懒读取seed三家映射。

不写`fin_ar_ledger`、`fin_ar_invoices`、`fin_ap_invoices`、资金事实、库存事实/流水、订单或已确认ERP凭证。首次验证保存上述事实的全行摘要和计数，比较前后一致；同时比较inbound和两类远端attempt计数。合法并发业务若改变这些摘要也会停止验收，须人工区分，不自行回滚业务事实。

AR镜像刷新使用公司/账套/期间advisory transaction lock及单事务替换，重复源行或保存失败整体回滚；空响应保留原快照。不会制造测试财务凭证。

## 作业及调度

保持北京时间00:15、06:15、12:15、18:15（`Asia/Shanghai`）。只读queue使用准备阶段advisory transaction lock、执行阶段独立连接session advisory lock、UUID orchestration ID及审批ID/调度slot durable幂等；同一slot已执行也不因第二进程晚到而重复。

所有镜像/完整同步HTTP入口进入同一durable queue，service直接调用不能绕过锁；手动dispatch前验证CLS公司范围。bootstrap只读取并展示interrupted HOLD，不重放历史任务。任意不明来源RUNNING、当前审批失败或待处理写回阻断恢复。暂停期间不会补历史日历，正常cron采用当前上海会计期间；手动期间范围由本次全部正式数据授权限定，仍须显式YYYYMM。

既有月/日/读预算、请求间隔、读缓存/并发合并和最多3次重试保留；权限、预算及unsupported错误不重试。业务/认证HTTP调用均有30秒超时。持久FAIL/HOLD在重启后继续阻断该审批的后续job；需要受保护的人工运行态核对和新的明确审批，不自动改历史job来消除门禁。

## 首次验证与正式启用

`chanjet-readonly-restoration.yml`通过正式production environment运行。配置操作必须main且输入批准SHA等于该run SHA及服务器最新main。首次操作账号须拥有现有`MENU_SETTINGS_CHANJET:E`及正确公司scope；`CHANJET_SYNC_OPERATOR_TOKEN`是短时受保护接口凭据，不能出现在审批JSON、日志、Git或生产测试凭证中。优先复用既有安全凭据渠道，不在此报告中提供值。

进入VERIFY前：新API仍HOLD；复测当前全部账套绑定、job/outbox、映射冲突和实际远端受保护只读接口。保存受限`.env`备份与前后摘要；替换只改变readonlyflag，保留原owner/group/0600和其他字节，CAS/fsync/atomic rename；同步floor tuple后，仅以原已核验image重建API。

首次同步只调用已有受保护enqueue/status，记录真实run ID及前后本地证据。SUCCESS、公司/账套/期间一致、无业务事实变化、无inbound/远端attempt、无重复后，另一次配置事务才进入ACTIVE。首次验证失败保留证据、停止后续步骤；不会自动启用cron或补跑。

当前待满足：`REMOTE_READ_AUTH`、新SHA/floor单独批准、HOLD应用部署验收、VERIFY验收、首次真实同步、ACTIVE运行态验收及至少一个完整6小时调度周期。

## 验证矩阵

| 必须覆盖的检查 | 验证来源 / 状态 |
|---|---|
| 默认停用、显式true及inbound=false | API策略/调度unit；有效策略也是必要条件 |
| 远端写入口不开放 | 共用只读路径白名单；kind=READ伪标写路径也拒绝 |
| 已审/未审账套、跨公司拒绝 | 策略与现场binding比较、mapping Gate、CLS权限unit及PG fixture |
| durable幂等、scheduler advisory lock | 两进程竞争及同slot串行去重真实PG fixture |
| bootstrap不重复补跑 | unit；历史行不重写/重放 |
| 限流、超时及失败重试 | Auth/Integration既有unit、新HTTP deadline及分类覆盖 |
| 正式数据不当作UAT清理 | 仅PRODUCTION_DATA策略，no-reset路径；当前生产只读证据 |
| 总账不自动入账、已有镜像更新 | scheduler不调用inbound；AR真实PG更新/重复失败回滚；首次业务hash门禁 |
| floor晋升、restart配置一致、回滚保护 | config/promotion/state/wrapper/workflow tests；root env fixture |
| /data、clean checkout | 原门禁tests；本次installed生产guard PASS |
| 审计不泄漏凭据/原始错误 | 脱敏分类unit；auth启动不输出appKey；受限证据仅counts/bindings/hash |
| API / Web typecheck | 执行结果见下方验证收尾 |
| required CI / 独立安全审查 | 合并前必须完成；不以本地测试代替CI或精确SHA审批 |

本地验证：Node20 API全套114 suites / 1006 tests通过，161项既有opt-in测试跳过；本次真实隔离PostgreSQL并发、幂等、快照原子性用例全部执行。API/Web typecheck通过；API修改文件lint零错误（28项已有any警告）；运维契约95项通过及一项root专用用例在独立root容器验证通过；7张禁止事实表各1000行的真实PostgreSQL摘要测试识别同计数覆写。actionlint、shell语法、nullable unique及constraint drift检查通过。独立安全审查未发现新的阻断级代码问题，生产认证、精确SHA批准及真实首次同步仍待验收。实际生产启用和远端读取未执行，不能记录RESTORED或全面PASS。

## 启用后的完整周期观察

ACTIVE验收后覆盖至少下一次00:15/06:15/12:15/18:15正式调度及完整6小时周期。使用正式Actions的audit操作复测，不把历史R3或本次启用前现场计数复用为上线后证据。取证SQL输出24小时scheduled/completed/failed/rate-limit计数、逐账套/endpoint覆盖及最近刷新、pending/conflict、未解决对账分组、inbound runs及两类remote attempt累计数；每次与启用基线比较。财务差异留审核，正式入账有独立审批证据，不能用同步SUCCESS代替。

发生权限/映射/限流失败时durable FAIL阻断同审批的后续运行；发现跨公司混入、禁止事实变化或远端写attempt增长，立即通过正式HOLD配置事务停用并保全job、floor过渡及受限证据，不删除镜像、不重写账务、不强制恢复旧API。当前尚未ACTIVE，完整周期观察为NOT_RUN。

独立逐文件边界与安全审查完成后，PR登记仓库既有`reviewed-frozen-boundary`和`reviewed-security-touch`标签并重新运行静态门禁；不修改scanner或降低规则。本地同等审核开关的W5静态收尾门禁20/20通过。首轮未登记标签的security失败保留。标签表示本次已审代码边界，不代替精确merged SHA的生产floor批准。
