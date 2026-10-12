# R3.c 恢复缺口修复 — 分类器变体容忍 + 单事务良性 startup-error 恢复（2026-10-12）

## 1. 分类器修复（production-deployment-evidence.mjs）

Run `38208343072-1` 根因：`routesResolverPattern` 缺两个真实 Nest 格式变体的容忍——
`<Controller>, {/prefix}:`（控制器名后逗号）与 `}: +Nms`（着色 elapsed 后缀；RouterExplorer
模式已有该容忍）。修复后两种变体均豁免；带 SQL/异常尾巴的伪路由（含后缀/逗号形态）
仍 fail-closed（8+4 例回归）。新增导出 `isRouteRegistrationLine` 作为豁免判定唯一真相源。

## 2. Case A 良性 startup-error 恢复扩展（production-deployment-recovery.mjs）

**范围**：`HOLD_STARTUP_ERROR` 不进入全局 Case A。仅一个冻结事务可经此路径关闭：

```text
BENIGN_STARTUP_ERROR_TRANSACTION = { runId: '38208343072-1', targetSha: 'c9383d5043191213165e237bbdb7b984f7603345' }
```

**Receipt（脱敏凭证，base64+sha256 传递，不含原始日志/业务 payload）**：

```json
{
  "schema": "phoenix.case-a-benign-startup-error-receipt/1",
  "runId": "38208343072-1",
  "targetSha": "c9383d5043191213165e237bbdb7b984f7603345",
  "startup": {
    "result": "HOLD_STARTUP_ERROR",
    "combinedDigest": "<64-hex：生成时填入，见下>",
    "schemaWriteSignalCount": 0,
    "errorSignalCount": 1,
    "schemaCompatibilityPass": true
  },
  "errorLine": {
    "ts": "2026-10-12T05:39:03.720270742Z",
    "stream": "stdout",
    "attribution": "ROUTES_RESOLVER_REGISTRATION",
    "wordSet": ["Nest","LOG","RoutesResolver","mSysErrorLogsController","api","system","error","logs"]
  },
  "readinessHttp": 200,
  "dbBaseline": { "mirrorRows":17717,"entityRows":41577,"arSnapshotRows":150,"runningJobs":0,"queuedJobs":0,
                  "writebackPending":0,"wmsWritebackPending":0,"remoteWriteAttempts":0,"wmsRemoteWriteAttempts":0,"inboundRuns":0 }
}
```

**校验链（全部生产现场重算，receipt 只做身份绑定）**：
- 落盘 startup 证据：result=HOLD_STARTUP_ERROR、schemaWrite=0、error=1、compat=1、digest 与 receipt 一致
- 现场重放（修复后分类器）：digest 与落盘一致（窗口未变）、全窗口 SQL 形态=0、schemaWrite=0、
  receipt.ts 定位的行 = 完整格式 RoutesResolver 注册（sensitive=false、无 SQL 形态、词集=冻结集）
- readiness=200；DB 只读计数与 dbBaseline 逐字段一致
- 任一不符 → 独立 HOLD 码（RECEIPT_* / REPLAY_*，共 14 个），绝不静默放行
- 原事务（38031441639-1，HOLD_SCHEMA_OR_WRITE_SIGNAL）路径不变

**digest 生成**（日志脱敏会破坏长 hex 显示）：evidence collector 的 R0_SUMMARY 现输出
`digestA`/`digestB`（前后各 32 hex，分半后任何 secret 子串都无法跨行命中）——阶段 A 执行前
先跑一次只读 evidence（bound 38208343072-1），取 `digestA+digestB` 填入 receipt。

## 3. Workflow（chanjet-readonly-restoration.yml）

recovery 操作新增 `startup_error_receipt` 输入：runner 侧校验 JSON schema 后以
`RECOVERY_STARTUP_RECEIPT_B64` + `RECOVERY_STARTUP_RECEIPT_SHA256`（对解码字节的 sha256）
传递；CLI 侧传输哈希不符立即 `HOLD_RECEIPT_TRANSPORT_HASH`。recovery bundle tar 补入
`chanjet-readonly-production-audit.mjs`（readDatabaseEvidence 依赖；闭包契约测试自动覆盖）。

## 4. 执行顺序（合并本 PR 后，每步单独批准）

**A. 关闭事务 38208343072-1**（绑定旧 floor `c9383d50` 的批准 SHA）：
1. 只读 evidence（bound 38208343072-1）→ 取 digestA/B 填 receipt（含既有 dbBaseline 复核）
2. dispatch recovery：
   `operation=recovery`、`approved_main_sha=c9383d5043191213165e237bbdb7b984f7603345`、
   `bound_run_id=38208343072-1`、`confirmation=APPROVE_EXACT_RECOVERY_TRANSACTION`、
   `startup_error_receipt=<receipt JSON>`
3. 预期 `DEPLOYMENT_RECOVERY=COMPLETE`；archive 记录 classification=
   `CASE_A_BENIGN_STARTUP_ERROR_SINGLE_ROUTES_RESOLVER_LINE` + receiptSha256

**B. 以新 main（含本 PR，记 M3）重锚定发布**：
`mode=api`、`approve_production=true`、`approved_config_floor_sha=M3`、
`approved_previous_floor_sha=c9383d5043191213165e237bbdb7b984f7603345`、
`skip_deploy=false`、`one_time_config_floor_transition=false`、`rotate_chanjet_credentials=false`
（预期：重锚定 → 切换 → 修复后分类器 startup PASS → complete）

全程 Chanjet 保持 HOLD/false/false；无 migration、无 Web/DB 重建、无好业财调用。
