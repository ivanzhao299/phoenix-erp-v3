# Chanjet 只读同步 advisory lock 交接竞态修复

## 授权与版本边界

```ini
BASE_MAIN=a2f4edba43bc6cd16247382e0306885a4ae6486d
BRANCH=codex/fix-chanjet-advisory-lock-handoff
FAILED_ACTIONS_RUN=37855594138
REMEDIATION_PR=PENDING
MERGED_MAIN_SHA=PENDING_MERGE_RECEIPT
PRODUCTION_CONFIG_FLOOR_VERSION=2
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_API_ONLY_HOLD_APPROVAL
```

生产版本是本次授权给出的最后已验证基线，本轮未再次访问生产。生产仍为 HOLD、readonly/inbound false/false。本轮只有仓库修复、隔离测试、独立审查、PR、CI 和合并；没有重新使用旧生产 SHA 授权，没有重跑失败发布，没有 floor 晋升、容器部署、生产 SQL 或真实好业财业务请求。

## 原始证据与根因

[失败 Actions 37855594138](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/37855594138) 的冻结 head 是上述 BASE_MAIN。其 test job 的首个只读同步 PostgreSQL 用例超时，执行日志明确出现 `another API instance owns the lock`；其余五项集成用例通过，构建发布阶段没有开始。这不是可归因于性能波动的证据。

已读取此前 `chanjet-v3-floor-api-hold-release.md` 的本地执行记录并核对失败日志。PR #367 把原先“没有 RUNNING”轮询改为等待 SUCCESS，暴露了真实 FAIL，但没有消除竞态。

旧执行链：

1. A 的准备 QueryRunner 开事务，取得 `pg_try_advisory_xact_lock(hashtext(JOB_NAME))`，检查 durable 准入并插入 `RUNNING/QUEUED`。
2. A 提交后事务锁立即释放，准备 QueryRunner 随后释放回池。
3. B 的独立 backend 取得同名事务锁，发现 A 的 durable RUNNING 后准备退出，但事务尚未回滚、锁尚未释放。
4. A 的异步 `setImmediate` 执行创建另一 QueryRunner，尝试 `pg_try_advisory_lock`，被 B 临时持锁阻挡。
5. 已接纳的 A 被错误记录为 FAIL/SKIPPED/HOLD，实际业务读取次数为零。

事务锁在 COMMIT/ROLLBACK 释放；会话锁绑定取得它的 PostgreSQL backend，不可通过另一个连接隐式交接。旧实现两个 QueryRunner 不能证明相同会话，更不能证明锁所有权连续。

## 确定性修复前后证明

`chanjet-readonly-lock-lifecycle.integration.spec.ts` 执行同一组明确屏障：A 已真实提交 reservation、暂停提交响应；B 的独立连接完成竞争尝试；随后才允许 A dispatch。旧协议额外保持 B 的 durable SELECT 返回屏障，直到 A 执行完成。没有依靠随机 sleep。

修复前执行的是 `test/fixtures/chanjet-readonly-sync.scheduler.a2f4edba.txt` 中冻结的实际旧 scheduler；其 `.json` 同时锁定 BASE_MAIN、源码路径和 SHA256，测试先验证摘要再编译。旧代码只存在于隔离测试 fixture，不进入 API 构建、启动或生产调用链。

| 同样的两连接顺序 | 实际连接证据 | 远端模拟业务 GET | durable 结果 |
|---|---|---:|---|
| 旧源码 | 两个不同 `pg_backend_pid()`；B 持有真实事务锁 | 0 | FAIL，复现缺陷 |
| 修复源码 | 两个不同 PID；A 准入到执行使用同一 QueryRunner/PID | 1 | SUCCESS |

GET 是隔离 Node HTTP provider 的真实 loopback 网络请求；没有访问好业财生产。具体 PID 在运行日志中输出，不把 PID 当作跨运行稳定值。测试同时要求 public enqueue response 没有 lease、可 JSON 序列化，避免数据库连接、socket 或凭据进入 HTTP 响应。

## 新锁协议、状态和清理

`ChanjetReadonlyLockLease` 在一个专用 checked-out QueryRunner 上先取得独占 session lock，再开始 durable 准入事务。检查批准策略、范围及现有 RUNNING/FAIL/VERIFY 完成记录/调度 slot 后插入 reservation、提交；COMMIT 不释放会话锁。异步 dispatch 捕获内部 lease，不重新创建连接或再次取锁。

执行、RUNNING 更新、终态更新和 unlock 都使用该 QueryRunner。关键边界核对 `pg_backend_pid()` 与 `pg_locks` 实际所有权；durable request_scope 保留 `lockBackendPid` 供脱敏关联。状态更新使用 TypeORM structured result，必须恰好影响一条仍为 RUNNING 的任务。

| 路径 | durable/内存行为 | 锁和连接 |
|---|---|---|
| 其他实例持锁 | 拒绝准入，不插入 FAIL | 无所持锁，释放 runner |
| 现有 durable 阻断 | 不写历史记录、不重放 | 回滚检查事务，解锁再释放 |
| 准备 SELECT/INSERT SQL 异常 | 回滚；不 dispatch | 回滚、解锁、释放 |
| COMMIT 已成功但确认丢失 | 保留 RUNNING，人工 HOLD；不 dispatch | 仍清理本会话 |
| 正常执行 | RUNNING → SUCCESS 后才报告 COMPLETED | 终态确认后 unlock、release |
| 业务执行失败 | 在同一会话持久化 FAIL/HOLD、脱敏告警 | 之后清理 |
| SUCCESS/FAIL 更新被拒绝或零行 | 保留 RUNNING，内存 HOLD，人工审查 | 清理；不把失败的 SUCCESS 更新替换为 FAIL |
| SUCCESS 已提交但确认丢失 | 数据库可能 SUCCESS，内存 HOLD，结果需人工核对 | 不写第二个终态 |
| 数据库断连 / SIGKILL | 已提交 RUNNING 保留；重启只读发现 HOLD | PostgreSQL 关闭 session，自动释放锁 |
| unlock false/SQL 异常 | 不把可能持锁连接交回池 | `Client.end()` + 物理 socket destroy，等待 close，释放/丢弃连接 |

`close()` 的共享 Promise 保证重复调用只清理一次。TypeORM 0.3.29 的 client error 可提前标记 runner released；清理避免第二次 release。pg-pool 3.13.0 对 ended/ending 或不可查询 client 会移除；真实 PostgreSQL 测试核对原 backend PID 已消失，新的池连接不会继承锁。

AsyncLocalStorage 在同步业务网络调用前、token 获取后、响应后，以及各镜像/字段样本/账套/候选/对账/子任务写入口检查已观察到的连接丢失。测试在真实 GET 返回后终止 owner backend、等待 client end，再调用实际快照 helper，证明不会开始下一次 upsert。

边界：已经发出的远端只读请求无法撤销；独立 pooled ORM 写入在 gate 检查后、SQL 完成前仍可能遇到断连并完成既有写入。最终所有权检查转 HOLD，durable RUNNING 阻止新的正常全量任务，禁止自动重放。不能声称断连后绝无本地写入。独立获批的 token/appTicket 认证维护仍保留，不属于远端业务写回，也不能被描述为“绝无任何远端网络请求”。

## 入口与业务契约核验

- 受保护手动全量队列及 controller 别名仍进入 `enqueueManualSync`；cron 进入同一 `prepareRun/executeSync`，继续全局锁契约，同一或不同审批范围均不能并行执行。
- `recoverInterruptedRun` 只读取、设置内存 HOLD；没有 terminal rewrite、删除历史行、重放或历史日期补跑。false 时 bootstrap 不执行恢复查询。
- READONLY_VERIFY 只允许有限手动 scope，不能启动 cron；READONLY_ACTIVE 仍为 `0 15 */6 * * *` / Asia/Shanghai，即每日 00:15、06:15、12:15、18:15，不改变频率。
- APPROVED 账套、公司、期间、scope、审批 ID、远端只读 allowlist 和跨公司拒绝保留。子任务幂等/调度 slot 的 durable 查询没有放松。
- AR 快照原子刷新及失败保留旧正式镜像测试保留；没有新增映射自动批准、差异自动解决、财务总账入账、发票/库存/订单事实覆写或远端业务写接口。
- 独立 AR、认证、probe、入站会计和 writeback 能力没有被统一为同一个开关，也未获得新的生产授权。
- API bootstrap/schema 责任仍由已有只读兼容检查处理。没有 migration/entity/schema 改动，迁移路径 diff 为零。

## 验证记录与 20 项覆盖

| 用户要求 | 证据 |
|---|---|
| 两实例仅一个接纳、一次业务读取、一条正确 durable | 确定性 BEFORE/AFTER + 4 轮 × 8 个竞争实例、真实 GET/SQL |
| 竞争失败不产生错误 FAIL、成功终态 SUCCESS、执行中拒绝新请求 | 新协议同序证明 + paused execution + 全局不同 approval 竞争 |
| 已完成 schedule slot 不重复 | 两 scheduler 顺序执行，第二次 durable 拒绝 |
| 独立连接持锁拒绝、不泄漏连接 | 独立 QR 持锁、12 次拒绝、connectedQueryRunners 检查 |
| prepare 异常、insert 异常清理 | 实际缺表 SQL 错误、事务回滚、无 job/GET |
| execute 异常 HOLD/FAIL | 脱敏业务失败、同会话 FAIL 及告警 |
| terminal 持久化失败保留证据 | 实际 CHECK 拒绝 SUCCESS/FAIL、零行 UPDATE、提交后 ACK 丢失 |
| 连接中断不重放、进程退出不留锁 | `pg_terminate_backend` + child `SIGKILL` + 新实例只读 recovery |
| 不同 backend PID 互斥、相同/不同审批全局锁 | 显式 PID 与全局 held-owner 测试 |
| VERIFY 不启动 cron、ACTIVE 四次、HOLD false/false 无工作 | 实际 scheduler 行为、Cron metadata、既有 flag 默认停用单元测试 |

本地 Node20 隔离 PG16.14 与 PG18 均执行两份真实集成测试和三个相关单元测试，共 5 suites / 70 tests PASS，其中真实 PostgreSQL 25 项。没有扩大 Jest timeout、sleep 修复、盲重试、忽略 lock failure、删 RUNNING、禁用并发测试或移除 advisory lock。

API/Web typecheck PASS。API 全量单元测试 114 suites / 1010 tests PASS，190 项 opt-in 测试跳过，数据库要求由显式集成运行覆盖；非 opt-in 数据库套件的 skip 与显式运行的 PostgreSQL 套件分开记账。相关 config floor、trusted paths、FD9、environment、rollback、workflow、bootstrap 静态契约 106 PASS，root atomic env 写入 fixture 另单独 PASS，实际数据库指纹检测也单独运行。迁移 down/no-business-DML、nullable unique、constraint drift、actionlint PASS。修改文件 ESLint 零 error，八项既有 any warning。

额外扩大至全部 `scripts/ops/*.test.mjs` 与 `scripts/ci/*.test.mjs`：363 PASS、2 FAIL、3 SKIP。两项失败是旧 `deploy-secret-transport.test.mjs` 仍要求已经移出 workflow 的内联 env writer 文本，以及 `r4-3-uat-manifest.test.mjs` 的历史设计态 artifact 假设；在未修改的 BASE_MAIN 工作树同样失败，未以删测试或改基线掩盖。这两项不属于本轮正式发布的 required test 清单。

正式 CI 新增 PG18/PG16.14 双数据库锁生命周期集成 gate；deploy.yml 的 PG18 test 阶段执行同样两份集成测试。原生产 job 的 dispatch/批准、root trusted path、FD9、clean checkout、运行 API revision 迁移基线、OCI identity、floor、storage 和 rollback 门禁没有改动。production-config-contract criticalFiles 新增锁类，不修改已激活的生产 floor；未来必须批准新的精确合并 SHA。

## 独立安全审查

只读 reviewer 独立审查实际 diff、TypeORM/pg-pool 生命周期及测试。首次指出远端响应后的镜像写入口缺少 loss gate；已修复并补真实断连用例，增量复核未见新的 P0/P1。审查明确保留上述 ORM TOCTOU、终态确认丢失与认证维护边界。测试和最终 CI 由主代理实际执行；审查者未访问生产或执行写操作。

## 合并验收收据

```ini
ROOT_CAUSE=TRANSACTION_TO_DIFFERENT_SESSION_LOCK_HANDOFF_WINDOW
ADVISORY_LOCK_PROTOCOL=ONE_DEDICATED_SESSION_ADMISSION_THROUGH_TERMINAL_PERSISTENCE
PREPARE_EXECUTE_HANDOFF_RACE=ELIMINATED
SESSION_OWNERSHIP_VERIFIED=PASS
DURABLE_JOB_ATOMICITY=PASS_WITH_AMBIGUOUS_ACK_OPERATOR_HOLD
LOCK_RELEASE_SAFETY=PASS
CRASH_RECOVERY_HOLD=PASS
DETERMINISTIC_RACE_REPRO_BEFORE=PASS_EXPECTED_FAIL_ZERO_READS
DETERMINISTIC_RACE_REPRO_AFTER=PASS_SUCCESS_ONE_READ
PG16_INTEGRATION=PASS
PG18_INTEGRATION=PASS
CONCURRENCY_TESTS=PASS
API_TESTS=PASS_114_SUITES_1010_TESTS
BOOTSTRAP_NO_WRITE_REGRESSION=PENDING_FINAL_SQL_PROOF
CONFIG_FLOOR_TESTS=PASS
REQUIRED_CI=PENDING_PR
SECURITY_REVIEW=PASS_NO_OPEN_P0_P1
PRODUCTION_CONFIG_FLOOR_VERSION=2
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_API_ONLY_HOLD_APPROVAL
```

只在 required CI 全部通过后合并。合并本轮不构成新 SHA 的 floor 晋升或部署批准，完成后停止。
