# M12 完成模块中止的冻结恢复方案（仅代码与模板）

## 范围与材料来源

基线 M14 `6504932dfb83011dbbac98f97313c06badb28a5a`。
唯一新冻结事务：`38333221687-1` / attempt 1，target=M12
`2e713d44b9697796ec903927bb5dd5e6fb9e4cb4`，previous floor=M6
`797eeca1db229f5e4d288da88d83888ad92b35c5`。

本轮只复核已取得的失败日志与 post-evidence `38334100127`，没有再次生产 dispatch。
原日志 smoke/startup/verify PASS，全部报告后 SSH status 13；模块循环的独立 Node 20
真实 CLI 复现见 [根因报告](r3c-complete-module-cycle.md)。新分类与 abortPoint 均为
`COMPLETE_MODULE_EVALUATION_ABORT`。旧 `DISK_REPORT_SIGPIPE` 标签仅保留于原有协议，
本路径不接受该标签，不改旧 evidence/receipt/archive 的任何字节。

原 post-evidence 确认 checkout/floor/运行 API 为 M12，active 为 CONFIG_READY_HOLD、旧 API=M6，
deploy SWITCHING / API switched / Web unchanged，双 marker 绑定原 run，migrationPaths=0，
readiness=200，flags HOLD/false/false，DB/Web 快照一致，startup PASS / error=0 / schemaWrite=0，errors=[]。
原采集发生于 marker 到期前；本代码要求执行时重新核验自然过期，不能把旧采集当成新的现场证明。
完整 chunks 的 previousFloorSha 为 GitHub 脱敏后的 M6；CLI 将验证未脱敏可信状态中的完整 SHA。

## 新协议与机器校验

新 receipt schema：`phoenix.complete-module-abort-recovery-receipt/1`。
[脱敏模板](templates/m12-complete-abort-receipt.template.json) 中 digest、行数及 DB 十字段是占位符，
不构成可执行生产 receipt。测试用合成窗口与合成 DB 值填充模板，验证正例；占位模板本身必须被拒绝。
这里没有生成真实生产 receipt，也没有填造真实 digest。

所有检查通过才允许首次 ARCHIVED 写入：

- context、receipt 的 run/attempt/target/previous floor 精确冻结；receipt bytes 的传输 SHA256 核验。
  不接受其它普通 PASS、旧 receipt schema、旧 SIGPIPE 标签或额外未审字段。
- 可信 marker.previousFloorSha 与 marker.previous、candidateApi、previousEnv/nextEnv 互证；
  deploy.previous API=M6、migrationBaseline=M6、candidate/active API=M12、仅 API switched、零迁移。
  floor/config=M12；旧 active 是完整 previous pins / CONFIG_READY_HOLD；checkout=M12 且干净；
  三个镜像均在合法、无重复的 protectedImages 集合内。
- PRE/POST/startup 文件均绑定原 run、attempt 1、target/floor M12。
  PRE API=image/revision M6、POST API=image/revision M12；健康/运行字段检查。
  PRE≤marker start≤API start≤POST≤startup capture≤marker expiry，marker/deploy 均已自然过期。
- receipt digest = 落盘 startup digest = 新鲜 bounded replay digest；stdout/stderr 行数三方相等。
  receipt/startup schemaWrite/error=0；replay schemaWrite/error/sqlShape=0；兼容性标记及 readiness 通过。
  重放通过真实窗口解析、长度限制与时间戳验证；不信任陈述文字或 receipt 自报计数。
- verifyEvidenceFiles 从真实文件重算，文件内容与已加载证据一致；CLI 在归档前另跑
  verifyLiveSnapshot。DB/Web PRE=POST=live，API live=POST/candidate，包含 mounts/health/restart 检查。
- DB 十字段必须完整非负整数，逐项与只读查询一致；live flags HOLD/false/false，readiness 200。

## 归档与中断恢复

沿用 ARCHIVED → ACTIVE_WRITTEN → DEPLOY_WRITTEN → COMPLETE，仅改 active/deploy/archive 状态文件，
最后删除原事务双 marker。原始五份状态 snapshot 名称唯一、数量精确、hash/value 一致。
归档绑定 previous floor、原始 recovery run/time 和 receipt bytes hash；用原始 deploy/marker
重算 **整份 plan**，包括 Web pin、镜像保护集、baseline 和恢复来源，逐字段整对象相等。

新路径允许且仅允许这些现场组合：

| 归档阶段 | active | deploy | markers |
|---|---|---|---|
| ARCHIVED | 原状态或计划（active 写入后 phase 未更新） | 原状态 | 原状态 |
| ACTIVE_WRITTEN | 计划 | 原状态或计划（deploy 写入后 phase 未更新） | 原状态 |
| DEPLOY_WRITTEN | 计划 | 计划 | 原状态或部分删除 |
| COMPLETE | 终态，拒绝再执行 | 终态 | 已清理 |

恢复允许新的 recovery run 作为 resumedBy，但原始 provenance 不改；重新写入相同计划后再推进阶段。
篡改 plan、原始 snapshot、阶段现场组合或 marker 历史均在写入前 HOLD。
旧两类 receipt 及原 Case A 路径不改验证语义，新约束只路由此精确新事务。

## 后续精确输入（尚未执行，也未获本阶段生产授权）

workflow 保持 runner/bundle 来源与旧事务绑定分离。须先另审、合并本 PR 并确认该 merged main
CI 成功，不能使用 M14 或本 PR branch head 当作已包含新路径的合并 runner。

```text
ref=main
operation=recovery
approved_main_sha=<then-current reviewed merged main SHA containing this new branch>
recovery_target_sha=2e713d44b9697796ec903927bb5dd5e6fb9e4cb4
recovery_previous_floor_sha=797eeca1db229f5e4d288da88d83888ad92b35c5
bound_run_id=38333221687-1
confirmation=APPROVE_EXACT_RECOVERY_TRANSACTION
startup_error_receipt=<measured, reviewed new-schema receipt; exact UTF-8 bytes>
```

runner 要求 approved_main_sha=GITHUB_SHA；target/previous floor 不从 runner SHA 推断。
B64+SHA256 由 workflow 对原 receipt bytes 生成并在 CLI 重验。
production environment 规则需在另审时照实披露，不能把文字 confirmation 当成平台人工 reviewer。

另审前材料清单：

1. 当前 merged main/CI/镜像与环境规则；冻结 run 的原始失败日志、根因复现与代码修复链。
2. 新鲜可信只读状态：完整 marker.previousFloorSha、deploy.previous pins、floor/active、自然过期、
   checkout/runtime、三容器身份/健康/mounts/restarts、HOLD flags 与 readiness。
3. 原 PRE/POST/startup 文件及原 attempt；bounded log replay 的 digest、行数、零写/零错/零 SQL、
   compatibility 标记；verify 文件重算与 live TOCTOU。
4. DB 十字段完整只读基线、其来源 run/time；经复核的新-schema receipt 原字节与 SHA256。
   缺任一项不以示例、占位符、旧摘要或假 digest 填补。

本 PR 不执行生产恢复/部署/同步/迁移，也不进行容器、DB、.env 或好业财写入。任何实际失败按约定 HOLD，
无自动 retry/rollback/清 marker。本阶段只交付代码与模板，停止等待复核。

## 本地核验

Node 20 新路径 30 项已通过，包含真实 recovery CLI COMPLETE、archive COMPLETE、active/deploy SUCCESS、
双 marker 删除；中断 resume、terminal 二次拒绝与真实 CLI 负例逐文件 byte 不变。
另有纯函数拒绝矩阵与 template placeholder 拒绝，bundle 闭包/解包及旧 recovery 回归在完整 suite 中执行。
fixture 只替代生产 host admission、Docker/curl 命令及只读 SQL 的结果；真实恢复入口、evidence/replay、
原子状态写入与阶段协议执行，未知 Docker 命令即失败。测试不替代生产 host admission 核验。
Node 20 完整 ops/契约/bundle/preflight：204 tests，202 pass，0 fail，2 skip
（本地 Docker owner/group 与 PG fingerprint fixture 条件未满足）。Node 24 新路径30/30。
YAML parse、node syntax 与 diff check 通过；独立只读复核已关闭发现的缺口。
