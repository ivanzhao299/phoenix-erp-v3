# BUGTASK-20260727-0003 A3 后端验证报告

## 结论

**PASS WITH CONDITIONS**

当前基线已包含本问题所需的后端修复。附件场景已通过聚焦回归测试，但不能在 CI/CD、生产冒烟和业务验收完成前宣称生产问题已解决。

## 来源问题

- Bug：`BUG-20260727-0003`
- Task：`BUGTASK-20260727-0003`
- 现象：包装作业台“分级”提交批次时显示 `HTTP 400`
- 附件证据：2026-07-27 分级页面显示当日可分级 488 枚；已完成批次 198 枚；当前批次录入 1 号蛋 200、2 号蛋 40、3 号蛋 50，共 290 枚。

任务附带的失败请求均为销售分析、配送和在线人数的 GET 500，与分级提交接口没有路径或时间上的直接对应关系，不能作为本次 400 的根因证据。

## 根因与基线状态

历史根因是分级可用量口径曾混用“总采集数”和“扣除脏蛋/裂纹蛋后的可分级数”，可能重复扣减损耗并错误返回 400。

当前基线的 `PackagingTerminalBffController.submitGrading` 已按以下口径校验：

`净可分级量 = SUM(total_qty - dirty_qty - cracked_qty) - SUM(total_output)`

当前接收入口也会持久化 `total_qty`、`dirty_qty`、`cracked_qty`，并把旧作业台传入的合法净量规范化为总采集数。对附件数据，`488 - 198 = 290`，本次产出恰好等于余量，代码使用 `>` 而非 `>=` 拦截，因此应允许提交。

## 变更文件

- `apps/api/src/modules/bff/bff.controller.spec.ts`
  - 新增附件同值回归：可分级 488、已分级 198、本次 290。
  - 验证接口返回 `code: 200`，并以 `total_output=290` 写入分级记录。
- `docs/ops/BUGTASK-20260727-0003-a3-backend-report.md`
  - 本任务验证报告。

未修改生产业务代码、前端、迁移、schema、entity、表或列；未访问或写入数据库。

## 验证

```bash
cd apps/api
./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand
```

结果：`1 passed`，`15 passed`，`0 failed`。

```bash
cd apps/api
./node_modules/.bin/tsc --noEmit
```

结果：退出码 `0`，无 TypeScript 错误。

## 条件与后续门禁

- 必须由 CI/CD 验证相同测试和构建。
- 发布后需在生产或等价 UAT 环境，以拥有原 RBAC/DataScope 的账号复测同一数量边界并确认真实请求路径及响应体。
- 需业务方确认分级批次成功落账且页面刷新后数量、批次及追溯记录一致。
- 若生产仍返回 400，应携带该 POST 的 URL、响应体、requestId 和同时间服务端 PG 错误日志重新诊断；现有附件没有这些信息，不能安全推断另一个后端根因。
