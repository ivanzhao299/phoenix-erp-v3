# BUGTASK-20260723-0004 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS — GO（仅进入 CI/CD、生产冒烟与业务验收，不代表生产 Bug 已解决）**

本地后端修复、聚焦回归测试和 API 类型检查通过。未部署、未写数据库、未执行迁移；CI/CD、生产环境冒烟和业务验收完成前，不应关闭源 Bug。

## 来源问题

- Bug：`BUG-20260723-0004`
- Task：`BUGTASK-20260723-0004`
- 现象：作业台集蛋作业点击“确认录入”返回 HTTP 400
- 后端请求：`POST /api/packaging/terminal/source-batches/receive`

任务上下文同时采集到 `wms_locations` 重复值 400、药品入库 500 和费用审批人缺失 400；它们来自其他业务操作，不属于本次集蛋确认录入调用链。

## 静态复现与根因

`PackagingTerminalBffController.receiveBatch` 在 2026-07-21 的数量口径修复后，要求请求中的 `receivedQty` 必须等于 `totalQty`。旧作业台契约中，`receivedQty` 表示扣除脏蛋、裂纹蛋后的净可分级数，即：

```text
receivedQty = totalQty - dirtyQty - crackedQty
```

因此，诸如总采集 100、脏蛋 10、裂纹蛋 5、旧版 `receivedQty=85` 的合法录入，会在任何数据库写入前被后端判为“采集数量与总采集数不一致”并返回 HTTP 400。

根因是同一字段从“净可分级数”切换为“总采集数”后缺少向后兼容。任务的 `PG_SQL` 自动分类与源码复现不符；修复不需要 SQL 结构、schema、entity 或迁移变更。

## 最小修复

- `apps/api/src/modules/bff/bff.controller.ts`
  - 同时接受 `receivedQty=totalQty` 的当前契约和 `receivedQty=totalQty-dirtyQty-crackedQty` 的旧作业台契约。
  - 旧契约合法命中后，在持久化前统一规范化为 `receivedQty=totalQty`，避免后续分级逻辑再次扣减脏蛋和裂纹蛋。
  - 其他不一致数量仍返回 400；鸡舍、数值格式、正数和损耗上限校验保持不变。
  - 未绕过 JWT、RBAC、DataScope、审计或附件 ACL。
- `apps/api/src/modules/bff/bff.controller.spec.ts`
  - 增加旧契约回归用例，验证净可分级数不再触发 400，且落库参数规范化为总采集数。
  - 保留非法数量的拒绝用例，并将其输入改为不符合新旧任一契约的数值。

无前端、migration、schema、entity、表或列变更。

## 验证结果

```text
cd apps/api
./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand

PASS
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

```text
cd apps/api
./node_modules/.bin/tsc --noEmit

PASS (exit 0, no output)
```

只读检索首选工具 `rg` 在当前环境不可用（`command not found`），诊断改用 `find` 与窄条件 `grep`。未读取或修改允许范围外的附件路径。

## 条件与后续 Gate

1. CI 必须通过。
2. 部署后使用真实集蛋岗位账号分别验证含损耗与不含损耗的“确认录入”。
3. 生产冒烟应确认 HTTP 200、来源批次 `received_qty` 保存总采集数，且分级可用量仅扣减一次脏蛋与裂纹蛋。
4. 业务方确认集蛋录入和后续分级数量均正确后再关闭源 Bug。
5. 本任务未合并、未推送、未部署、未写数据库、未执行迁移。
