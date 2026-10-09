# API-only HOLD 发布证据闭环修复

```ini
BASE_MAIN=f1faaa13589c950fae65fe44c962641ebbf32b87
FAILED_ADMISSION_SHA=f1faaa13589c950fae65fe44c962641ebbf32b87
READONLY_AUDIT_RUN=37879153024
BRANCH=codex/fix-api-only-production-evidence
REMEDIATION_PR=https://github.com/ivanzhao299/phoenix-erp-v3/pull/369
MERGED_MAIN_SHA=PENDING
PRODUCTION_FLOOR_VERSION=2
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
CHANJET_SYNC_ENABLED=NO
```

## 问题与设计

此前的 `capture-production-runtime.mjs` 只记录 API/Web image ID 和 OCI revision。`deploy.yml` 的 runtime-before 在 floor promotion 之后，且没有 Web/DB container ID、Created/StartedAt、RestartCount、Health、受限挂载摘要或与新 API 容器绑定的启动日志，因此无法证明 API-only 发布没有重建或重启 Web/DB。

新增 `production-deployment-evidence.mjs`，保持旧 `captureRuntime()` 的 image/revision JSON 契约不变，并在同一 FD9/root trusted state 下使用 `atomicState` 保存 0600 原子证据：

- `PRE_SNAPSHOT` 在目标 helper 完整性校验后、任何 floor/policy/active 写入或容器操作前采集；
- `POST_SNAPSHOT` 在 API 切换、API/Web readiness 检查后立即采集；
- `production-deployment-state complete` 在 active 成功写入、transaction 删除前重新读取 POST 并对三个容器做最终 metadata re-inspect，消除 POST 到 SUCCESS 间的 TOCTOU；
- PRE/POST 必须属于相同 run ID、run attempt、target SHA 和 config floor SHA；缺少或不一致直接 HOLD；
- Web/DB 必须保持 Id、StartedAt、Image、健康状态和挂载摘要；API 必须运行、healthy、OCI revision 精确等于 target SHA；不调用 Compose 修复失败。

Docker inspect 只请求 Id、Created、Image、State、RestartCount、Mounts 和 Image OCI label，不请求 Config.Env。挂载证据只保留 type/source/destination/readOnly。没有读取或输出数据库密码、JWT、Chanjet 凭据或完整环境变量。

## 启动日志证据

POST 后只读取实际 API container ID，使用其 StartedAt 到当前时间的有界 `docker logs --timestamps` 窗口，最大 2 MB。失败、超限、空窗口或实例身份不符进入 HOLD。日志只在内存中分类，保存事件计数、SHA256、时间边界和 `rawOutput=false`；不写原始行到 Actions 日志或 artifact。

新增固定无敏感 marker：`API_BOOTSTRAP_SCHEMA_COMPATIBILITY=PASS`。摘要要求 Nest/bootstrap marker、schema compatibility marker、部署 readiness HTTP 200 和无 schema/write/error 信号；否则为 `UNVERIFIED_STARTUP_EVIDENCE` 或 HOLD。该日志证据只证明启动观测，不能替代 SQL 写入证明。

证据强度继续分开记录：

```text
BOOTSTRAP_CODE_AND_CI_PROOF       PR #367 隔离 PostgreSQL 与静态/动态启动证明
PRODUCTION_STARTUP_LOG_EVIDENCE   本修复在正式 API-only 部署事务中产生
PRODUCTION_SQL_WRITE_PROOF        本修复不宣称已获得；生产 SQL 全量日志仍禁止开启
```

## 测试

`production-deployment-evidence.test.mjs` 覆盖：Web/DB 未变、ID/StartedAt/Image/mount 变化、API revision 变化、缺失/跨 run/非法绑定、缺 metadata、日志截断/缺 marker、密钥模拟行不泄漏原文。既有 production rollback/config/trusted-path/FD9/schema preflight 契约测试继续通过。

保留 API/Web typecheck、完整 API unit、PG16/PG18 Chanjet advisory-lock 生命周期、bootstrap 无写入、schema drift 和 required CI。证据 helper 不调用 Compose up/down/restart；失败只通过现有 ERR trap 保留 transaction/floor marker，不能自动重建 Web/DB。

## 生产边界

本轮没有运行 `deploy.yml`，没有 floor 晋升、API/Web/DB 操作、迁移、生产数据库写入、好业财读取或同步启用。生产继续保持 floor2、API `23c7af86dd122379d01248a3b9542b8165f31498`、Chanjet HOLD、readonly/inbound false/false。

```ini
PRE_SNAPSHOT_CONTRACT=IMPLEMENTED_FAIL_CLOSED
POST_SNAPSHOT_CONTRACT=IMPLEMENTED_FAIL_CLOSED
WEB_ID_COMPARE=REQUIRED
WEB_STARTED_AT_COMPARE=REQUIRED
WEB_IMAGE_COMPARE=REQUIRED
DB_ID_COMPARE=REQUIRED
DB_STARTED_AT_COMPARE=REQUIRED
DB_IMAGE_COMPARE=REQUIRED
API_STARTUP_LOG_CAPTURE=IMPLEMENTED_BOUND_TO_API_ID_AND_STARTED_AT
API_LOG_REDACTION=COUNTS_HASH_ONLY_RAW_OUTPUT_FALSE
LOG_INSTANCE_BINDING=REQUIRED
DEPLOYMENT_EVIDENCE_FAIL_CLOSED=YES
SAME_RUN_EVIDENCE_BINDING=REQUIRED
ROOT_TRUSTED_PATH=RETAINED
FD9_LOCK=RETAINED
FLOOR_GUARD=RETAINED
CHANJET_HOLD=RETAINED
TESTS=LOCAL_PASS_API_1010_WEB_TSC_OPS_240_EVIDENCE_8_BOOTSTRAP_STATIC
REQUIRED_CI=PASS_PR_369
SECURITY_REVIEW=PASS_INDEPENDENT_NO_P0_P1
PRODUCTION_FLOOR_VERSION=2
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_API_ONLY_HOLD_APPROVAL
```

本地收尾：API 全量 Jest 114 suites / 1010 tests PASS（191 个 opt-in 测试跳过）；Web typecheck PASS；证据、rollback、trusted-path、env、schema-preflight、deploy contract 共 77 项 PASS；API bootstrap static side-effect scanner `violations=[]`；migration down/data-DML、nullable-unique、constraint drift、actionlint PASS。PR #368 的 PG16/PG18 锁生命周期与 bootstrap SQL 证明继续作为基线证据，未在本轮生产执行。
