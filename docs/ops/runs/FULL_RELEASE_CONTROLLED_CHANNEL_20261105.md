# Full 发布受控通道立项与操作手册（2026-11-05）

状态：代码与契约测试完成；下一生产窗口须先做真实 PostgreSQL 18 + 等价 Compose 演练。

## 问题与裁决

历史日产蛋修复记录（历史提交 `103542c52` 的 `DAILY_EGG_INBOUND_REPAIR_20261103.md`）记录 full run `#41603777102` 在 `docker compose up api` 因缺少本 run fence/drain 证明而 HOLD，回滚同因失败；当时只能 API-only 重锚定 + Web-only 部署。根因是 Compose guard 与 full body 是否进入 background session 不一致。

候选 A（复用 BackgroundFenceCoordinator）复用已有 PostgreSQL advisory locks、FD9、manifest、CAS、drain receipt、OPEN 和恢复协议，只需模式化成功证据。候选 B（新建 full 专用通道）会复制锁、恢复和审计逻辑，增加并发与回滚分叉风险。裁决采用 A：full 复用同一受控会话；API 是唯一 background participant，Web 由正式双服务 evidence 覆盖。

## 状态机与顺序

```text
READY(active API/Web=Rprev, floor=F)
 -> full binding(previousRuntime=Rprev, configFloor=F, target=T)
 -> FENCE + advisory locks + API drain
 -> PRE evidence -> begin transaction -> migration receipt gate
 -> pull/pin -> (receipt 已存在时幂等 schema-first) -> switch API -> switch Web
 -> Compose up API/Web -> POST/startup/live evidence + main/CAS
 -> OPEN(target=T, active API/Web=T) -> READY(floor 仍为 F)
```

full record 的 `previousFloorSha` 表示上一运行时 revision，`configFloorSha` 表示配置 floor。这样连续 full 发布不会把已 OPEN 的 target 错当成 floor。criticalFiles 变化仍必须走既有 API-only floor re-anchor；full 不隐式重锚定，也不接受 same-floor 重启伪装。

## 迁移、并发、失败和恢复

`production-deployment-state begin` 在 fenced body 内执行；`RUN_MIG` 不再被 shell 无条件改为 false。迁移路径必须已有 controlled-pending-migration CAS receipt 与生产 ledger digest；缺 receipt 在 fence 前报 `FULL_MIGRATION_RECEIPT_REQUIRED:<file>`，有 receipt 的迁移可幂等重放。workflow concurrency、FD9、advisory locks、owner/generation/CAS 共同防并发；第二次 full 以 active API/Web revision 为 participant 基线。

API/Web 任一切换失败、重启/容器身份变化、数据库 session 丢失、main 漂移、证据缺失或回执失配都会保持 FENCED/HOLD，禁止自动 OPEN 或重试。失败不自动恢复 Git、env、数据库、卷或 nginx。若 runtime 仍等于 transaction.previous，使用 `rollback-dead-transaction`；若两服务都已成功且正式 evidence 完整，可使用 `complete-background-open`；否则保留 fence，按 operator controlled rollback 处理。reconcile 对 full 以 `active.active.api/web` 为运行时基线、`configFloorSha` 为 floor 基线。

Compose 错误包含 `stage=compose-up-api`、run-scoped proof 文件名、owner/target/generation mismatch；受保护读取错误保留具体 basename。

## 证据字段与兼容

保留 run/attempt、target/config floor/previous runtime SHA、deployMode、owner、generation、participant boot/container/revision、manifest digest、drain outcome、migration path/source blob/receipt/ledger digest、PRE/POST/startup 文件、API/Web image/container IDs、startedAt/restartCount/health/mount、readiness/Web HTTP、reconcile stage 与最终 outcome。API-only 旧记录（无 `deployMode`）按历史兼容读取；Web-only 不进入 background session；schema-changing rollback 继续 HOLD。

## 验证与启用前置条件

已通过 background session、coordinator、Compose proof、reconcile、mode evidence、deploy workflow targeted contract/fixture 测试（89 项）。覆盖成功、失败、超时、session loss、main drift、连续 full、缺 proof 诊断、双服务 evidence、迁移 receipt gate 和死事务恢复边界。当前未执行真实生产连接或真实 full 生产 Compose；下一窗口必须在隔离 PostgreSQL 18 和等价 bootstrap 中证明 no-criticalFiles full 成功、缺 receipt HOLD、body failure/reconcile、连续 full，并保存 DRAINED/MIGRATION/SUCCESS/OPEN 证据。

## Follow-up release window (2026-11-05)

The merged target `20b964de8` first passed the repository's explicit API floor path during the initial dispatch (`CI/CD — Build & Deploy` run `41920198732`), with `RUN_MIG=false`, API/Web smoke and readiness successful, and `BACKGROUND_DEPLOYMENT=SUCCESS`. A subsequent full dispatch must target a strict descendant SHA so the full binding has a new runtime revision; same-floor reuse remains a deliberate HOLD. The descendant commit below is documentation-only and exists to carry this release-window evidence into the full controlled channel.

The API floor re-anchor for `b06984833` completed in run `41923832069`; the matching Web-only alignment completed in run `41925324799`. The final full release target is the strict descendant created after this pair is aligned.
