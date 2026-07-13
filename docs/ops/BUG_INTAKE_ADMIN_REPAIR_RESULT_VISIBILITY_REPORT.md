# Bug Intake 管理员修复结果可见性报告

## 目标

管理员不再需要阅读 Agent 原始日志判断问题是否修复。问题详情首屏直接展示修复结论、验证状态、提交版本、改动范围和下一步动作；内部执行过程默认隐藏。

## 完成内容

1. Bug Intake 详情接口新增只读 `repairResult` 摘要，不新增表、不修改 migration。
2. 修复结果严格区分 `WAITING`、`RUNNING`、`HOLD`、`RELEASE_VALIDATION`、`READY_FOR_UAT`、`VERIFIED`。
3. 管理员结果卡展示代码修复、CI、推送、发布验证、生产复测五项证据。
4. 展示最终 commit、已验证改动文件、完成时间和下一步动作。
5. 问题列表增加“修复结果”列，管理员无需逐条打开即可识别当前阶段。
6. 详情打开后每 10 秒自动刷新，也可手动刷新；轮询不会覆盖管理员正在编辑的受理表单。
7. 闭环时间线、Agent 任务包、原始 JSON、Console Error、失败请求和客户端上下文默认折叠为“技术过程与证据”。

## 防止假完成

- `HOLD` 永远显示为未完成，不会因存在 commit 或单个 Agent PASS 被展示为成功。
- 只有实现证据与 A1 验证齐全后，才进入发布验证阶段。
- 只有 runner 回写 `releaseEvidence`、`push`、`ci`、`productionSmoke` 全部 PASS，才显示“修复已发布，等待管理员业务复验”。
- 只有管理员完成业务复验并标记解决，才显示“修复已完成并通过业务验收”。

## 权限与边界

- 复用现有 `MENU_BUG_REPORT:V` 详情权限，不扩大可见人员范围。
- 未执行 DB 写入、migration、部署或 push。
- 未暴露内部 prompt；原技术证据仍仅在管理员主动展开后可见。

## 验证

- Bug Intake service lifecycle Jest：PASS（9/9）。
- 管理员修复结果前端静态测试：PASS（3/3）。
- API TypeScript：PASS。
- Web TypeScript：PASS。

## 结论

GO。管理员后台具备实时、可理解、可追溯的修复结果视图；内部过程不再占据默认视图。
