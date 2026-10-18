# 候选数据库身份的无损微秒契约

本修复基于 `81323312519c05b960f8dcf4e279a391203a8bdf`，仅处理已确认的组件接线阻断。
生产 registry 仍未安装，生产准入、重锚、部署和任务排空均未由本修复完成。

## 原因与结果

`RootControlLease` 已保留 PostgreSQL 的六位微秒 backend/postmaster 身份；原候选
数据库观察器要求毫秒，API 控制连接也先经过 JavaScript Date，丢失后三位。不能把不同
微秒时间映射到相同 Date 后当作精确身份，更不能为接线直接补零。

API `BackgroundLockBackend.probe()` 现在通过原持锁 QueryRunner，在固定只读查询中
原生获取 UTC 六位微秒字符串，公开为 `controlSession.backendStartedAtUs`。
原 `backendStartedAt` 毫秒字段保留兼容用途，必须与原生值的毫秒部分一致。每次 probe
都会比较原始微秒值；相同 PID、相同毫秒但不同微秒也会永久 poison 并退休原连接。
缺失或降精度的原生值不能建立健康身份，不会另建连接掩盖变化。

候选数据库观察器输出升级为 `phoenix.candidate-database-observation/v2`。
root、candidate backend 和 postmaster 三种身份均要求原生六位微秒，SQL 与绑定精确
比较原始字符串；只保留采样时钟为毫秒。v1 的毫秒绑定明确拒绝，不自动转换。
未来组合 producer 必须把 API 同控制连接报告的 `backendStartedAtUs` 显式放入
candidate binding 的 `backendStartedAt`，并与 root 原生身份对齐；不得传入旧 MS 字段。
真实 ERP fixture 同时比较 API 自报值和独立数据库目录查询，防止用 observer 自报替代 API 身份。

两处 API bootstrap SQL 分类清单仅替换为新的固定只读查询，没有放宽匹配规则。
没有增加连接、数据库权限、迁移、业务查询或写入；probe 仍是一次数据库往返，增加一个
固定 catalog 表达式。生产查询负载和延迟尚未实测，不能由隔离测试推断生产性能。

## 已执行验证（Node 20.20.2）

| 检查 | 结果与范围 |
| --- | --- |
| API typecheck | PASS |
| BackgroundLockBackend Jest | 19 PASS；同毫秒微秒变化、缺失原生值、连接退休及原有超时覆盖 |
| 候选观察器与 ERP identity 纯测试 | 15 PASS |
| 实际隔离 PG16/PG18 | 26 PASS / 0 SKIP；每版 12 场景及父测试，所有自建会话和容器清理确认 |
| maintenance 协议组合 | 230 PASS / 10 SKIP；另行运行的 PG 结果不归入此纯测试跳过项 |
| bootstrap AST / 静态契约 | PASS，0 violations / 27 PASS |
| 独立只读技术审查 | 无 P0/P1；不冒充正式生产批准 |
| 新 HEAD 官方 CI / 真实 ERP 镜像验证 | 提交后另记，不继承旧结果 |
| 生产性能 / continuous lease / drain / UAT | NOT_RUN |

本地最初调用根 typecheck 脚本时，嵌套 pnpm 命中了本机另一版本，因 Node builtin
不兼容失败。随后直接使用固定 Node20 与本 worktree 的 TypeScript/Jest 执行通过；
保留首次失败日志，没有调整 Node 生产基线或依赖锁。

## 冻结与安全扫描准入

默认冻结门禁命中 API backend 和 spec 两个应用路径。backend 属于正式 criticalFiles；
本次修改确为受保护的安全身份校验，必须绑定最终 HEAD 审查。没有删除该 criticalFiles 条目，
最终生产目标必须重新计算 floor 差异并取得精确旧/新 SHA 的独立发布授权。

默认安全扫描扫描整个已改文件，命中 spec 中四处已有 `callback` 文本：

| 当前行号 | 代码及分类 | 风险与处置依据 |
| --- | --- | --- |
| 18 | `_callback`，模拟 pg Client.end 的本地 Node 回调 | 测试 helper；从基线保留，不接触 Chanjet callback/signature |
| 128 | `callbackCount` 初始化 | 本地 TypeORM 池释放计数；无认证、网络或业务写入 |
| 129 | master connection release 回调计数 | 验证已结束的原 pg client 只释放一次；原逻辑保留 |
| 133 | `callbackCount` 精确断言 | 防止重复释放的回归断言；由实际19项 backend 测试覆盖 |

上述四行对应的是静态规则对普通回调名称的匹配，不是好业财鉴权改动；保留原测试，
不改规则或加 suppression。独立只读审查同时覆盖真正安全敏感的微秒身份变化。
源审批和治理标签按用户委托审查权限绑定最终 HEAD 另存回执，不伪造 GitHub APPROVE，
也不把本地技术结论当作生产批准。默认失败保留，正式 CI 只能通过合法 PR 审批状态读取授权。

观察器的 `continuousDrainProof`、`persistentOwnershipComplete`、`registryInstalled`、
`admissionOrApprovalGranted` 等字段继续为 false。完整 candidate lease、continuous ingress、
executor 归属、五域对账、恢复材料和最终精确 SHA 审批仍是独立阻断。
