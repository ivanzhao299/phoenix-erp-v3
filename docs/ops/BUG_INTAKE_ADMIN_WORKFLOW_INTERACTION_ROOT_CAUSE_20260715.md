# Bug Intake 管理后台闭环交互根因与修复报告

## 结论

问题不是后端任务队列或本地 Runner 被删除，而是管理端在 2026-07-13 增加“修复结果可见性”时，把原有修复操作区与技术证据一起放进了默认关闭的 `showTechnicalDetails` 条件块。管理员打开问题后只能看到“保存受理信息”，无法自然进入任务生成、Agent 路由和队列批准。

本轮已把后台操作重构为状态驱动的一键闭环：管理员只处理受理、验收和重派，任务包、Agent 计划和队列批准由后端原子接口完成，技术数据继续保留在可折叠区域。

## 根因审计

1. `fbb9a0da feat(ops): expose administrator repair results` 引入 `showTechnicalDetails=false`，并将修复任务操作区整体包入该条件块。
2. 原流程要求管理员依次执行“生成修复任务包 → 生成 Agent 计划 → 批准投入 Agent 队列”，交互暴露了实现细节，任一步遗漏都会留下 READY 或 ROUTED 半成品状态。
3. 前端操作函数只判断 `response.ok`，非 2xx 时没有错误提示，管理员会误以为按钮无响应。
4. 旧批准接口未拒绝 HOLD/空 Agent 计划，状态也可能停留在 TRIAGED，存在错误批准和后台状态不一致风险。

## 新交互

| 当前状态 | 管理员主操作 | 系统行为 |
| --- | --- | --- |
| OPEN/TRIAGED/READY/ROUTED | 受理并启动自动修复 | 保存受理信息、生成任务包、分类路由、批准入队一次完成 |
| AGENT_APPROVED/AGENT_RUNNING/AGENT_EXECUTION_FINISHED | 查看运行状态 | 10 秒自动刷新，可手动刷新，不重复派发 |
| HOLD/AGENT_COMPLETED | 重新分析并派发 | 清理本轮失效证据，重算计划并返回常驻 Runner 队列 |
| FIX_READY_FOR_UAT | 确认问题已解决 / 仍有问题，重新派发 | 业务复验是关闭前硬门禁 |
| BUSINESS_VERIFIED | 关闭并归档 | 完成闭环，不允许跳过业务复验直接关闭 |

“保存受理信息”改名为“保存受理草稿”，避免与启动修复混淆。Agent 执行边界保留为高级折叠项，技术任务包、原始结果和日志仅在“查看技术过程与证据”中展示。

## 后端修复

- 新增 `POST /api/bug-intake/reports/:bugNo/start-repair`。
- 单次事务式业务操作完成受理、任务号、分类、Agent 计划、批准与审计回写。
- HOLD 或无 Agent 的计划不得批准入队。
- 批准成功后问题统一进入 `IN_PROGRESS / AGENT_APPROVED`。
- 写入 `START_REPAIR_WORKFLOW` 审计动作，记录路由决策和选中 Agent。

## 前端修复

- 主操作区始终可见，不再依赖技术详情开关。
- 后端拒绝、权限失败和参数错误均显示在当前问题抽屉内。
- 成功入队、HOLD、重派、业务验收和归档均提供明确反馈。
- 按状态只显示当前合法操作，避免重复派发或跳过证据门禁。

## 验证范围

- Bug Intake service 状态机单测：10/10 PASS，覆盖一键启动、HOLD 拒批、证据门禁、重派隔离、业务验收和关闭门禁。
- 管理端静态交互回归：5/5 PASS，确认主操作位于技术折叠区之外，非 2xx 错误可见。
- API/Web TypeScript：0 errors。
- API 生产构建：PASS。
- Web 生产构建：PASS（Webpack，228/228 页面生成完成，包含 `/bug-reports`）。默认 Turbopack 在 worktree 中因 `node_modules` 软链接超出 tracing root 退出，属于本地 worktree 构建器限制，不是页面编译错误。
- W5 closeout gate：PASS（本分支累积包含 API/Web 授权改动，使用 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 记录边界审查）。
- 部署后继续执行 API 健康检查、管理页路由与新接口 smoke，并以 CI/CD 结果作为发布证据。

## 边界

- 本修复不绕过 Runner、CI/CD、发布与生产 smoke 证据门禁。
- 不允许 HOLD 计划或空 Agent 计划进入执行队列。
- 管理员确认“已解决”只表示业务复验通过；仍需再执行“关闭并归档”完成最终闭环。
