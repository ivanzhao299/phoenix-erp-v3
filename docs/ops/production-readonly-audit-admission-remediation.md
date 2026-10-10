# 生产只读审计准入修复

```ini
BASE_MAIN=17700cd1b21e73503a8093fae44c946e4eb10802
TRACK=PRODUCTION_READONLY_AUDIT
FAILED_AUDIT_RUN_1=38002814924
FAILED_AUDIT_RUN_2=38002907772
PRODUCTION_MUTATION=NO
DEPLOY_EXECUTED=NO
```

## 根因

两次审计都在远端脚本的 `git rev-parse HEAD == TARGET_SHA` 处结束。`TARGET_SHA` 同时承载候选 main SHA 和已部署版本身份；生产 checkout/运行 API 仍是旧版本时，候选 SHA 被错误地当成已部署 SHA，审计程序和只读 SQL 尚未执行。

## 修复

审计入口分离：

- `CANDIDATE_MAIN_SHA`：当前审查候选 main，只作为报告元数据，并要求 Actions checkout 与候选 SHA 一致。
- `EXPECTED_PRODUCTION_SHA`：预期已部署 API OCI revision，用于实际运行 API 身份校验。
- 审计模式不更新服务器 checkout，也不要求服务器 Git HEAD 等于候选 SHA。
- 非 audit 的 VERIFY/first-sync/ACTIVE/HOLD 配置事务继续要求 exact `TARGET_SHA` 和远端 main 一致。

远端脚本增加脱敏阶段标记：SSH_CONNECTED、CONTROL_BOOTSTRAP、LOCK_ACQUIRED、TRUSTED_PATHS、CHECKOUT_IDENTITY、FLOOR_GUARD、DB_READONLY、COMPLETE。失败只输出阶段、分类和退出码，不输出凭据、原始错误、数据库内容或业务 payload。审计程序保持 strict SSH、root trusted paths、ACL/mount、FD9 锁、clean main、floor/OCI guard 和 SQL READ ONLY。

```ini
AUDIT_SHA_SEMANTICS=SEPARATED
PRODUCTION_SHA_BINDING=EXPECTED_PRODUCTION_SHA
CANDIDATE_SHA_BINDING=CANDIDATE_MAIN_SHA
SSH_STAGE_DIAGNOSTICS=IMPLEMENTED_REDACTED
READONLY_AUDIT_SECURITY=RETAINED
```

本修复没有执行正式生产审计、部署、floor 晋升或 Chanjet 同步。
