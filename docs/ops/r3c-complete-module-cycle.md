# R3.c complete CLI 顶层 await 循环核验（2026-10-13）

## 结论与历史归因更正

M12 `2e713d44b9697796ec903927bb5dd5e6fb9e4cb4` 与 M13
`172c9d68a38be275ce51a94c6d6690fb8943b01d` 的 state/evidence 文件完全相同。
`production-deployment-state.mjs` 的 CLI `complete` 在顶层
`await import('./production-deployment-evidence.mjs')`，evidence 又静态 import
`atomicState` from state；evidence 等待 state 结束，state 等待 evidence，形成未解决的顶层 await。

Node 20.20.2（生产 CI Node 20 基线）的最小双文件复现与真实 CLI fixture 均退出 **13**，
`signal=null`，stdout 无 SUCCESS，stderr 为空。Node 24.19.0 同样退出 13，并打印
`unsettled top-level await` 警告。退出码 13 本身不能认定 SIGPIPE。

运行 `38333221687-1` 日志先显示 smoke、POST、startup PASS、verify PASS；
随后 Docker images、df、docker system df 的全部报告正常打印。
最后调用 `node scripts/ops/production-deployment-state.mjs complete` 时未返回 SUCCESS，
远端进程 status 13（外层 SSH Action exit 1）。本地 CLI fixture 不执行任何报告命令，
仍复现同一退出行为；修复模块环后完成成功。
这是代码缺陷的决定性复现，与生产失败边界一致；生产当时未启用逐命令 trace，
因此不声称从原日志取得了 `BASH_COMMAND` 或故障点 stack。

此前 `sed -n '1,20p'`、`df | tail -1` 的 SIGPIPE 归因是候选，现被上述证据纠正。
未使用 `q` 的标准 sed 与 tail 会消费输入至 EOF；真实 Bash/pipefail 回归用 200000 行
生产者验证两者 PIPESTATUS 均为 `0 0`。M7/M13 的报告改动属于防御性改动，
不构成已确认的根因修复。旧证据文件、receipt 的 `DISK_REPORT_SIGPIPE` 字段及既有 recovery
记录保持原字节，该字段只是历史协议标签。

## 修复

- 将 `atomicState` 原实现移至无 CLI 入口的 `production-atomic-state.mjs`。
  state import/re-export 保兼容；evidence 与 promotion 直接 import 共享模块。
  原子写入、权限、链接、目录身份与 fsync 检查不变。
- 新模块纳入 criticalFiles；floor promotion staging 及逐文件目标树身份检查同步纳入新模块
  和已执行的 evidence 模块。
- ordinary evidence 原来只 staging 单文件，无法解析相对依赖；现 staging 完整目标树闭包。
- recovery tar 加入共享模块；两种 staging 与 recovery bundle 均检查闭包和隔离导入。
- CI ops 门禁加入真实子进程 complete 回归及 staging smoke。

## 核验方式与边界

`production-deployment-complete-cli.test.mjs` 执行复制到本地临时目录的真实 state CLI、
evidence 验证和 atomicState 实现。仅替换无关的生产 root/mount/git/lock admission 与
Docker 为 fixture shim；没有生产路径、Docker socket、数据库或凭据访问。
测试不替代生产 host admission 核验，既有 trusted-path/guard 契约仍分别运行。

happy path 断言 exit 0、signal=null、CLI `DEPLOYMENT_STATE=SUCCESS`、active/deploy SUCCESS、
双 marker 删除。坏 evidence、API revision drift、DB metadata TOCTOU drift 分别断言
exit 1、无 SUCCESS、全部 active/deploy/marker 文件字节不变。
最小顶层 await 循环回归独立断言 exit 13、signal=null、未返回 COMPLETE_RETURN。

诊断旧版本的可重复命令（预期 happy path 测试失败，实际 CLI exit 13）：

```bash
COMPLETE_BASELINE_REF=172c9d68a38be275ce51a94c6d6690fb8943b01d \
  node --test --test-name-pattern='real complete CLI exits zero' \
  scripts/ops/production-deployment-complete-cli.test.mjs
```

应使用 Node 20 运行，以匹配 CI 基线。诊断选项只替换 fixture 中 state/evidence 两个旧文件，
不改工作树或生产。

## 验证结果与生产界限

Node 20 完整部署 ops/契约/bundle/preflight 套件：174 tests，172 pass，0 fail，2 skip
（真实 atomic env UID/GID Docker fixture、隔离 PostgreSQL fingerprint fixture 本地条件未满足）。
Node 24 CLI/staging 回归：10/10。YAML parse 与 git diff --check 通过。
新增 criticalFile 升级以真实本地 Git 两个提交验证：旧 contract 验旧 floor、新 contract 拒旧缺文件、
critical delta 触发 re-anchor、零 migration delta、目标树逐 criticalFile 验证通过。
独立只读复核未发现阻断问题。
额外 API bootstrap static suite 因本 worktree 缺 `apps/api/node_modules/typescript` 未能加载；
未改 API/数据库代码，本轮不安装依赖或连接数据库补跑该项。

本轮未执行生产 deploy/recovery、回滚或 marker 清理。事务 `38333221687-1` 的目标仍为
M12，previous floor=M6；其恢复路径需根因 PR 闭环后另审。本修复不扩大任何冻结恢复白名单，
不启动 R4、READONLY_VERIFY 或同步。
