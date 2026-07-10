# Bug Intake 严格证据门禁与队列恢复报告

## 结论

本轮修复解决了 Bug Intake 自动工作流把“Agent 进程正常退出”误判为“问题已经解决”的根因。新的状态机要求实现证据、A1 验证、push、CI/CD、生产路由 smoke 和业务验收逐级成立，任何一级缺失都保持 `HOLD` 或等待验证，不再自动关闭问题。

当前结论：`GO WITH CONDITIONS`。严格证据门禁已部署，历史状态纠偏已完成；常驻 runner 将在最终防绕过补丁部署后恢复。

## 问题现象

- Agent/Codex CLI 退出码为 `0`，但没有输出、没有代码修改、没有提交、没有任务报告时，worker 仍标记完成。
- 只读 A1/A2/A5 检查被当成业务实现证据。
- 任一任务成功即可触发 push；push/deploy 完成后，runner 将问题写成 `AGENT_COMPLETED`。
- 管理员可在缺少实现证据和业务验收时直接 `RESOLVED/CLOSED`。
- 结果回写顺序晚于生命周期回写，导致服务端收到的状态缺少完整 Agent 证据。

## 根因

1. `agent-worker.mjs` 只检查子进程退出码，没有核验实现提交、owned-path diff、任务报告和结论。
2. `bug-intake-local-runner.mjs` 使用“存在成功 worker”作为 push 条件，没有按一个 bug 的完整 Agent 计划聚合证据。
3. `bug-intake.service.ts` 只核对 Agent 名称和结论，没有区分 implementation 与 validation，也没有把 CI/CD、生产 smoke、业务验收设为独立 Gate。
4. 历史 `AGENT_COMPLETED` 同时承担“技术完成”和“业务解决”两种含义，状态语义不清。

## 已实施修复

### Worker 证据门禁

- 新增 `scripts/ops/bug-intake-evidence-gate.mjs`。
- A3/A4 必须提供新 commit、对应业务目录变更、任务专属报告和明确结论。
- 空输出、退出码非零、缺提交、缺业务 diff、缺报告均进入 `HOLD`。
- A1/A2/A5 只能产生 `VALIDATION_COMPLETED`，不能冒充业务实现。
- 明确证明任务不属于当前 Agent 边界时，使用 `SKIPPED_NOT_APPLICABLE`，不执行合并。

### Runner 发布证据门禁

- 按 bug 聚合全部 selected agents，不再按单个成功 task 决定 push。
- 至少一个 implementation Agent 通过严格证据门禁，并且 A1（若被选中）通过，才允许 push。
- push 后等待 GitHub Actions；CI 成功后执行生产路由 smoke。
- 结果先回写，再写入 runner lifecycle，修正时序。
- detached worker 无论 baseline 是否成功，缺少 Agent 证据时均保持 `HOLD`。

### 服务端状态机

- `AGENT_EXECUTION_FINISHED`：Agent 证据齐全，等待发布验证。
- `FIX_READY_FOR_UAT`：release evidence、push、CI/CD、production smoke 全部通过，等待业务验收。
- `BUSINESS_VERIFIED`：管理员/业务方实际验收通过。
- 修复任务不能从技术完成状态直接关闭；必须先从 `FIX_READY_FOR_UAT` 标记 `RESOLVED`，再关闭。
- 新增历史假完成 dry-run/apply 纠偏接口，保留审计记录并把可疑记录转为 `IN_PROGRESS + HOLD`。
- Runner lifecycle 只有在当前问题已处于 `AGENT_EXECUTION_FINISHED` 时才接受；单独伪造 push/CI/smoke PASS 不能绕过实现证据门禁。
- 独立 CI Security 使用 `--fail-on-uncovered`；本轮新增状态标签已全部进入三语 locale，严格 i18n 门禁为 PASS。

### 管理页面

- 历史 `AGENT_COMPLETED` 明确显示为“历史完成（证据不足）”。
- 显示“等待发布验证”“已部署，等待业务验收”“业务验收通过”等真实状态。
- 提醒管理员：Agent 运行结束不代表问题解决，证据不足时必须重派。

## 验证

- Evidence Gate self-test：PASS。
- Bug Intake service Jest：4/4 PASS。
- API TypeScript：PASS。
- Web TypeScript：PASS。
- i18n key gate：PASS。
- i18n hardcoded-literal audit：PASS。
- W5 closeout gate：PASS（本轮为明确授权的 Bug Intake/API/Web/ops 代码修复，使用 freeze/security touch 授权标志记录边界）。
- `git diff --check`：PASS。

## 安全边界

- 未执行 migration。
- 未修改 schema/entity/table/column。
- 未写业务数据。
- 历史纠偏只更新 Bug Intake 工作流状态和审计记录。
- 常驻 runner 在代码部署与历史纠偏完成前保持暂停，避免旧逻辑继续消费队列。

## 生产恢复清单

1. 部署严格证据门禁代码。
2. 对历史 `AGENT_COMPLETED` 先 dry-run，再 apply 纠偏。
3. 核验最新反馈：真实已修复项进入业务验收；无实现证据项转 HOLD 并重新派发。
4. 重新安装并加载 LaunchAgent，确认启用 CI 等待和生产 smoke。
5. 观察首个新周期，确认无空结果假完成、无证据 push 和队列卡死。

## 生产纠偏结果

- 首次部署 commit：`8ed0e482`。
- GitHub Actions `CI/CD — Build & Deploy`：PASS；API/Web build、DDL gate、entity drift gate、system/breeding/packaging/WMS/finance regression 与 full deploy 全部 PASS。
- 历史纠偏 dry-run：发现 25 条证据不足的 `AGENT_COMPLETED`。
- 历史纠偏 apply：25 条全部写入 `IN_PROGRESS + HOLD`，包含 8 条曾被提前关闭的记录；原状态写入 `evidenceReconciliation` 并记录 audit log。
- 纠偏后复查：`NO_FALSE_COMPLETIONS`，剩余候选 0。
- `BUG-20260710-0002`（账户收款后余额不变）已从假完成恢复为 `IN_PROGRESS + HOLD`，不再向管理员显示已解决。
- 保留的两条 `AGENT_COMPLETED` 分别为已有真实闭环记录和专用 smoke 记录，不属于本次历史纠偏候选。

## 新版 Runner 受控回归

- 首个新版周期处理 `BUG-20260710-0001`：A2/A5 仅记为 validation；A3 无实现 commit/diff/report，进入 HOLD；A4 只有 docs 报告、无 `apps/web/**` 变更，进入 HOLD。
- Release evidence 结论：`RELEASE_EVIDENCE_HOLD`；push、CI wait、production smoke 均被正确拒绝，证明“退出码 0 假完成”已被阻断。
- A1 回归发现根目录调用 `tsc` 未指定 project 的运行器缺陷，已改为显式加载 API/Web `tsconfig.json`。
- 修复后验证：API typecheck PASS、Web typecheck PASS、evidence gate self-test PASS、W5 closeout PASS、严格 i18n 门禁 PASS。
- LaunchAgent 改为仅在异常退出时重启，并设置 60 秒启动节流；正常 watch 进程持续运行，避免异常时形成登录风暴或触发 API 429。

## Sandbox Commit Recovery

- 子 Agent 的 workspace sandbox 可修改业务 worktree，但不能写主仓库 `.git/worktrees/*/index.lock`；此前会导致已有代码与测试仍被 HOLD。
- 父 runner 现会核对任务 `allowed_paths`、硬禁止 migration/entity/deploy 路径、业务文件和任务报告后，精确暂存并代为提交。
- 仅当 Agent 输出明确证明是 sandbox git-index 权限阻断时，父提交才可把该 HOLD 恢复为 `PASS_WITH_CONDITIONS`；其他业务 HOLD 不会被覆盖。
- `BUG-20260710-0002` 已找到并修复真实根因：确认收款查询遗漏 `received_account_code`，导致核销成功但资金账户交易分支被跳过；同时前端补齐收款账户必选与创建后确认调用。
- A3/A4 父提交恢复与 Baseline safe merge 均 PASS，未执行 migration、DB 写入或直接部署。
