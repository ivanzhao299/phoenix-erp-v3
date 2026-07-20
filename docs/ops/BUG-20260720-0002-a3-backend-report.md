# BUG-20260720-0002 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS（代码进入 CI 的技术 GO；发布、生产冒烟与业务关闭 HOLD）**

已在后端保存入口兼容 PC 页面实际发送的 `rows` 字段，同时保留原 `items` 调用协议。聚焦回归测试和 API 类型检查通过。本结论不代表生产 Bug 已解决；仍需 CI/CD、生产冒烟和业务验收。

## 来源

- Bug：`BUG-20260720-0002`
- Repair task：`BUGTASK-20260720-0002`
- 路由：`/breeding/feed`
- 现象：“今日入库”录入数量后点击“保存”无反应，刷新后数量未增加。

## 诊断与根因

静态复现链路：

1. PC 页面调用 `POST /api/farm/feed/ledger`，请求体为 `{ date, rows }`。
2. 修复前 `FarmFeedController.saveLedger()` 只解构 `{ date, items }`。
3. `items` 为 `undefined`，Controller 直接返回 `{ code: 400, msg: '缺少 date 或 items' }`，没有调用 `FarmFeedService.saveLedger()`。
4. 该返回值的 HTTP 状态仍为 200，而 PC 保存调用只检查 HTTP 状态，因此用户看到“无反应”；由于保存服务未执行，刷新后数量不变。

任务合同的自动分类为 `RBAC_403`，但源码证据不支持该根因：前端和后端写权限均为 `MENU_BREEDING:E`，报告用户且包含 `ROLE_ADMIN`；`MenuGuard` 对 `ROLE_ADMIN` 明确直通。

## 修复

Controller 优先使用数组型 `body.items`，否则回退使用 `body.rows`，然后按原有路径调用 Service。这是单点协议兼容修复，未改动 RBAC、DataScope、审计、附件 ACL、实体、schema 或迁移。

## 变更文件

- `apps/api/src/modules/farm/farm-feed.controller.ts`
- `apps/api/src/modules/farm/farm-feed.controller.spec.ts`
- `docs/ops/BUG-20260720-0002-a3-backend-report.md`

## 验证结果

在 `apps/api` 执行：

```bash
./node_modules/.bin/jest src/modules/farm/farm-feed.controller.spec.ts --runInBand
```

结果：`1` 个 suite 通过，`2/2` 个测试通过。测试分别确认 PC `rows` 请求进入保存服务，以及原 `items` 协议继续可用。

```bash
./node_modules/.bin/tsc --noEmit
```

结果：退出码 `0`，无 TypeScript 错误。

本任务未写数据库、未运行迁移、未部署、未推送。

## 后续 Gate

1. CI 全量检查通过；
2. 经独立发布审批后部署；
3. 使用具备 `MENU_BREEDING:E` 且 DataScope 正确的生产账号，在 `/breeding/feed` 保存今日入库数量；
4. 确认 API 成功、刷新后数量保留，并验证无跨范围数据影响；
5. 业务验收后才能关闭 Bug。

上述 Gate 完成前，状态保持 **PASS WITH CONDITIONS / HOLD for production closure**。
