# API 启动日志取证双流与错误分类修复

```ini
BASE_MAIN=70af9d5946a4b23ee42bd2c2f87437535b7a065a
REMEDIATION_PR=PENDING
MERGED_MAIN_SHA=PENDING_MERGE_RECEIPT
PRODUCTION_FLOOR=V2_HOLD
PRODUCTION_API_SHA=23c7af86dd122379d01248a3b9542b8165f31498
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
```

## 变更

`production-deployment-evidence.mjs` 现在使用带独立 stdout/stderr 的进程结果采集同一条 `docker logs --timestamps` 命令。命令非零退出、异常、超时或输出超出 2 MiB 都进入独立的 Docker 取证 HOLD；应用 stderr 在命令成功时继续进入日志解析。stdout 与 stderr 的总字节数按 UTF-8 字节计算，原始内容只存在于进程内存。

证据契约升级为 `phoenix.production-deployment-evidence/v2`。摘要绑定容器 ID、StartedAt、run ID、attempt、target SHA 和 floor SHA，并保存 stdout/stderr 行数、错误信号数、schema/write 信号数、敏感行数、双流合并摘要哈希和 `rawOutput=false`。PRE/POST 容器身份比较、API TOCTOU 检查和 complete 前证据校验继续有效。

敏感字段识别与错误识别使用独立计数。普通 `JWT_SECRET loaded` 只计敏感行并可通过；`JWT_SECRET initialization FATAL` 同时计敏感行和错误信号并进入 HOLD。schema/write 信号同时保留错误等级。错误、警告、启动信息和普通信息分开分类，缺时间戳或空日志窗口 fail closed。

## 验证

- stdout-only PASS、stderr FATAL、stderr ERROR、敏感 INFO/FATAL、schema/write、合计超限、命令失败、时间戳缺失、run/attempt/SHA 混用：覆盖。
- 真实隔离 Docker 容器产生 stdout/stderr 双流并通过同一 `docker logs` 进程接口读取：PASS。
- Web/DB PRE/POST 身份比较和 deployment complete 前证据门禁：保留并通过。
- 证据摘要不保存原始日志或敏感内容。

## 生产边界

本轮仅修改仓库代码、测试和文档。没有执行生产部署、floor 晋升、API/Web/DB 重建、数据库迁移、数据库写入、好业财读取或同步。生产继续保持 floor v2、API `23c7af86dd122379d01248a3b9542b8165f31498`、Chanjet HOLD、readonly/inbound `false/false`。

```ini
STDOUT_CAPTURE=IMPLEMENTED
STDERR_CAPTURE=IMPLEMENTED
COMBINED_SIZE_LIMIT=2097152_BYTES
SENSITIVE_ERROR_DETECTION=INDEPENDENT_COUNTS
NONERROR_SENSITIVE_HANDLING=PASS_WITH_REDACTED_COUNT
RAW_LOG_PERSISTENCE=NO
INSTANCE_BINDING=RETAINED
EVIDENCE_FAIL_CLOSED=YES
WEB_DB_IDENTITY_GUARD=RETAINED
REAL_DOCKER_TESTS=PASS
OPS_TESTS=PENDING
REQUIRED_CI=PENDING_PR
SECURITY_REVIEW=PENDING_INDEPENDENT_REVIEW
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
NEXT_ACTION=REQUEST_NEW_SHA_V3_FLOOR_API_ONLY_HOLD_APPROVAL
```
