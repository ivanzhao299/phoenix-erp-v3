# R0 M12 只读采集诊断补齐

基线为 M15 `48df08db776d3e7885776aac79b9ba9420c0be94`。
本次仅修改 collector、既有 evidence 测试和本报告；不访问生产、不 dispatch，
不生成 receipt、不执行恢复。本报告不改变当前 HOLD。

## 两项材料缺口

只读采集 run `38348802786` 的 GitHub 日志遮罩使 M6 previous SHA 无法从显示值还原。
不能替换 `***`、推断原值或把遮罩后的 chunks 当作原始 JSON。
原 collector 仅在 schema/write 分类命中的行上计算 SQL shape；GRANT/REVOKE
可能同时满足旧 schemaWrite/error=0，因此旧摘要不足以证明全窗口 SQL shape=0。

## 新摘要

`R0_SUMMARY.m12FrozenIdentity` 在主机端、显示遮罩前，对 pinned 原始状态比较：

- 冻结 run `38333221687-1` / attempt 1、target M12
  `2e713d44b9697796ec903927bb5dd5e6fb9e4cb4`、previous floor M6
  `797eeca1db229f5e4d288da88d83888ad92b35c5`。
- marker.previousFloor/previous API、deploy.previous API/migrationBaseline、
  active 旧 API/migrationBaseline 和 PRE API 均精确对齐 M6。
- marker/deploy previous 与 candidate pins 相互一致，旧 active 对齐 previous pins；
  floor/config/transaction/deploy/marker、POST/live API、checkout 对齐 M12。
- PRE/POST/startup schema、phase、run、attempt、target/floor 一致。

缺文件、非 pinned、缺字段或错误 pins 不得通过；不会用 undefined==undefined 作为证明。
`diagnosticOnly=true`、`scope=FROZEN_TRANSACTION_IDENTITY_ONLY` 和
`allIdentityChecksPass` 明确表示这只是身份范围的诊断。它不证明完整恢复资格：
过期/时间顺序、HOLD 策略、protectedImages、DB/Web 不变性及其他恢复门禁仍需单独核验。
恢复 CLI 必须重新读取可信未遮罩原始状态并通过全部校验，不能接受该布尔摘要作为许可。

`R0_SUMMARY.startupReplayVerdict` 新增独立全窗口诊断：

- stdout 和 stderr 每个非空行独立剥 ANSI 后匹配 SQL shape，包含 GRANT/REVOKE。
  正则逐字对齐恢复代码；计数不依赖旧 schema/write 或 error 分类。
- `sqlShapeCount` / `sqlShapeCheckedLineCount` / `sqlShapeZero`，以及双流行数。
  只有绑定与有界窗口验证通过且计数为 0，`sqlShapeZero` 才为 true。
- `bindingVerified` / `windowVerified` / `replaySummaryVerified`；复用真实日志窗口解析、
  时间戳及长度限制。无效窗口不能输出可用的零写证明。
- 原始双流重新组合 digest、与落盘 digest/行数比较结果。

新增诊断不输出原始日志、业务 payload 或秘密。collector 既有脱敏 chunks 协议保持不变。
冻结常量保留在 stdin collector 内，避免依赖生产 M12 尚不存在的新 recovery 模块；
静态契约测试将常量与 PR395 恢复常量、SQL 正则逐字绑定。

## 范围与验证

collector 不在 `production-config-contract.json.criticalFiles`；workflow、恢复代码、
floor 契约、迁移及部署路径未修改。测试加入现有 evidence suite，无需改 CI 列表。

新增 8 项测试覆盖冻结常量/正则契约、完整与缺失/非 pinned/错误状态矩阵、
双流 GRANT/REVOKE（含 stderr ANSI 分段）、无效窗口/绑定/digest/行数，
以及真实 stdin collector 的摘要 wiring 和零写证明。
子进程 fixture 限定命令为只读检查；SQL 必须 BEGIN READ ONLY / ROLLBACK，
未知命令即失败，并比较采集前后状态文件字节。fixture 仅模拟本地读入与命令结果。

Node 20 完整 ops/契约/bundle/preflight suite：213 tests，211 pass，0 fail，2 skip
（本地 Docker owner/group 与隔离 PG fingerprint fixture 条件未满足）。
Node 24 evidence suite：32/32 pass；node syntax 与 git diff --check 通过。
独立只读复核确认常量、正则与摘要 wiring；其指出的身份摘要范围歧义已通过命名与 scope 修正。
本阶段交付 PR 后停止等待复核；不 merge、不进行任何生产操作。
