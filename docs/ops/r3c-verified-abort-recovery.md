# R3.c 收尾修复 — SIGPIPE 管道 + verified-abort 恢复路径（2026-10-12，M5 分支）

## 背景

Run `38217361863-1`（R3.c 第二次）：重锚定 `c9383d50→M4` 成功、API 切换至 M4、startup
`PASS_REDACTED_SUMMARY`、文件 verify 通过（web/db UNCHANGED、apiRevision=M4）——随后部署脚本在
磁盘报告段被误杀：`docker images | sed -n '1,20p'`，宿主机 31 个镜像 > sed 的 20 行上限 → sed
提前退出 → docker死于 SIGPIPE(13) → `set -o pipefail` 判败 → ERR trap 在 `complete` 之前中止。
该行为 2026-09-29 引入（`d88619d4`），pipefail 框架下首次有部署抵达此处。

## 修复 1：deploy.yml 磁盘报告管道（criticalFile）

`docker images` 先经命令替换捕获（docker 独立运行，真实失败仍然致命），再对内存报告
`printf | sed -n '1,20p'`（报告远小于管道缓冲，printf 不会阻塞/SIGPIPE）。契约测试：
旧模式必须消失 + 新模式存在 + 真实 shell 回归（31 行生产者 SURVIVED / 真实 docker 失败仍 abort）。

**floor 重锚定需求**：deploy.yml 是 criticalFile，M4→M5 的下一次部署必须 v3→v3' 重锚定
（`approved_config_floor_sha=<M5>`、`approved_previous_floor_sha=f46f651d…`，机制已就绪）。

## 修复 2：verified-abort 恢复路径（仅冻结事务）

`PASS_REDACTED_SUMMARY` **不全局放行**。唯一可关闭事务冻结为
`{ runId: '38217361863-1', targetSha: 'f46f651dcebeb11210c8e577f3c0caed87f356c2' }`。

专用 receipt（`phoenix.verified-abort-recovery-receipt/1`，B64+SHA256 传输）：

```json
{
  "schema": "phoenix.verified-abort-recovery-receipt/1",
  "runId": "38217361863-1",
  "targetSha": "f46f651dcebeb11210c8e577f3c0caed87f356c2",
  "startup": { "result": "PASS_REDACTED_SUMMARY", "combinedDigest": "<64-hex>" },
  "abortPoint": "DISK_REPORT_SIGPIPE",
  "readinessHttp": 200,
  "dbBaseline": { "<十字段整数，同前>" }
}
```

**校验链（receipt 只绑身份，机器可验的全部现场重算）**：
- 通用前置（assessRecovery 既有）：floor=M4/HOLD、transaction 绑定该 run 且过期、
  active=CONFIG_READY_HOLD、marker CODE_HOLD、runtime=M4、三容器 live 对 POST 逐项一致、
  flags HOLD/false/false、readiness 200、checkout=M4 干净
- **verify 重算**：`verifyEvidenceFiles(pre/post/log 文件, binding)` 从落盘证据确定性重算
  （任何篡改 → `VERIFY_RECOMPUTE_FAILED`）；CLI 侧另做 `verifyLiveSnapshot` 现场 TOCTOU
  （失败 → `HOLD_VERIFY_LIVE_SNAPSHOT`）
- 重放：digest 与落盘一致、schemaWrite=0、sqlShape=0、**errorLineCount=0**（修复后分类器下窗口必须全净）
- DB 十字段严格校验（复用 validateDbBaseline）
- 专用 HOLD 码：RECEIPT_MISSING/SCHEMA/TRANSACTION_NOT_ELIGIBLE/STARTUP_RESULT/DIGEST_MISMATCH/
  ABORT_POINT_MISMATCH/READINESS_MISMATCH + VERIFY_FILES_UNAVAILABLE/VERIFY_RECOMPUTE_FAILED +
  REPLAY_*（错误 run/SHA 在 EVIDENCE_BINDING 先行拦截）
- 事务自然过期后才可执行（不为赶时间绕过门禁）；只写 active/deploy/recovery 记录并清理该事务
  双 marker；无 compose/migration/容器/数据库/.env/好业财操作
- 归档 classification=`EVIDENCE_VERIFIED_SCRIPT_ABORTED_AFTER_VERIFY`，startupResult=PASS，
  记录 receiptSha256；阶段化协议与既有 recovery 一致（ARCHIVED→…→COMPLETE）

## 测试

recovery 套件 27/27（verified-abort happy path 用真实临时文件跑 verify 重算；篡改
`log.phase` 单独触发 VERIFY_RECOMPUTE_FAILED；16 项拒绝矩阵；冻结事务外不可恢复）；
deploy 契约 6/6（SIGPIPE 回归）。

## 合并后执行顺序（各需单独批准）

A. 合并 M5 → 记录 M5 SHA
B. recovery（绑定 M4）：只读 evidence（M5 入口，bound 38217361863-1，approved_main_sha=M4）取
   digest 奇偶流 → 生成 verified-abort receipt → 复核 → dispatch：
   `operation=recovery`、`approved_main_sha=f46f651d…`、`bound_run_id=38217361863-1`、
   `confirmation=APPROVE_EXACT_RECOVERY_TRANSACTION`、`startup_error_receipt=<receipt>`
C. 以 M5 重锚定发布：`mode=api`、`approved_config_floor_sha=<M5>`、
   `approved_previous_floor_sha=f46f651d…`、`approve_production=true`、`skip_deploy=false`、
   `preserve_artifacts=true`、`one_time_config_floor_transition=false`、`rotate_chanjet_credentials=false`
   ——此时磁盘报告已修复，预期 startup PASS → verify → 磁盘报告 → **complete → SUCCESS**
