# Bug Intake 队列堵塞根因与永久修复

## 结论

2026-07-28 的队列堵塞不是 API 收件失败，也不是常驻进程退出。根因是发布批次与执行工作区的隔离不足：

1. 同一轮中任意一份报告处于 HOLD，整批已通过证据门禁的报告也被禁止发布。
2. A3/A4 长期复用固定分支和 worktree，历史 Bug 提交累积后，新任务 rebase 会重放无关旧提交并产生冲突。
3. dirty worktree 隔离时可能处于 detached HEAD，原逻辑直接执行当前分支重命名，导致隔离流程再次 HOLD。
4. 常驻 Runner 从状态仓库直接加载脚本；状态仓库因审计运行产物长期 dirty 时，无法可靠更新到最新 Runner 代码。

## 修复

- 发布证据按报告分区：`PASS` 报告独立进入 push/CI/smoke，`HOLD` 报告隔离，不再连坐。
- A3/A4 改为每个 Bug 独立 branch/worktree，并以最新 `origin/main` 创建干净执行槽。
- quarantine 支持 detached HEAD，先在主仓库重命名原分支，再切换隔离分支。
- rebase、quarantine 和 clean-slot recreation 失败纳入有上限的自动技术重派。
- LaunchAgent 分离状态仓库与代码仓库：运行态留在 state worktree，执行脚本始终来自 clean、最新的 `origin/main` code worktree。
- Runner 调用子脚本统一使用当前代码目录绝对路径，避免 cwd 中旧脚本被误执行。
- 每轮摘要分别显示 release-ready 与 isolated HOLD 报告。

## 防复发边界

- 技术故障自动重派有次数上限；业务 HOLD、权限 HOLD、数据风险 HOLD 不自动绕过。
- 每个 Bug 的代码变更在独立 worktree 中完成，不能携带其他 Bug 的历史提交。
- 单个报告失败不得阻塞其他报告发布。
- Runner code worktree 必须 clean；状态与审计产物不得写入 code worktree。
- push、CI、生产 smoke 仍必须通过各报告独立证据门禁。

## 验证

- Node 语法检查覆盖 Runner、Worker、同步、队列和 LaunchAgent 安装器。
- 队列生成测试覆盖任务隔离分支/worktree。
- Runner 测试覆盖混合 PASS/HOLD 发布、rebase 冲突自动重派、detached quarantine 自动重派。
- 上线后通过真实常驻周期验证积压任务重新派发、通过项独立发布以及队列持续消费。
