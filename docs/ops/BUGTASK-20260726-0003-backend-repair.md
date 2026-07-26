# BUGTASK-20260726-0003 后端修复报告

## 结论

**PASS WITH CONDITIONS**

本地后端修复与聚焦回归验证已通过。该结论不代表 BUG 已在生产解决；仍须通过
CI/CD、受控生产冒烟和业务方验收后才能关闭 BUG-20260726-0003。

## 来源问题

- Bug：`BUG-20260726-0003`
- Task：`BUGTASK-20260726-0003`
- 现象：包装作业台点击“确认入库”时提示
  `当前库存来源模式为 TEMP_PRODUCTION_INBOUND，未生成包装入库库存`
- 接口：`POST /api/packaging/terminal/warehouse/confirm`

## 根因

`PackagingInventoryIntegrationService` 的既定互斥规则是：

- `PACKAGING_INBOUND` 模式由包装完成生成可售库存；
- `TEMP_PRODUCTION_INBOUND` 模式已由日产蛋入库链路生成库存，包装完成必须跳过包装库存，
  以防双写。

`PackagingTerminalBffController.confirmHandover` 却在后续把所有
`totalInbound = 0` 都判为失败，包括服务明确返回的
`skippedByMode=true, mode=TEMP_PRODUCTION_INBOUND` 合法结果。因此交接记录不写入，
接口返回 `inventoryOk=false`，前端显示入库确认失败。

## 修复

仅将服务明确返回的
`skippedByMode=true && mode=TEMP_PRODUCTION_INBOUND` 识别为合法交接完成：

- 写入包装交接记录；
- 本次响应返回 `COMMITTED` / `inventoryOk=true`；
- 不生成第二份包装库存；
- 异常、未知模式、以及其他零库存结果仍维持失败。

RBAC 装饰器、DataScope、审计与附件 ACL 均未改动。未修改 schema、entity、migration
或 Web 文件，未执行数据库写入、部署或推送。

## 改动文件

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/api/src/modules/bff/bff.controller.spec.ts`
- `docs/ops/BUGTASK-20260726-0003-backend-repair.md`

## 验证

1. 聚焦回归：
   `cd apps/api && pnpm test -- --runInBand src/modules/bff/bff.controller.spec.ts`
   — PASS，1 suite / 13 tests。
2. API 类型检查：
   `cd apps/api && ./node_modules/.bin/tsc --noEmit`
   — PASS，0 errors。
3. 静态范围审计：
   `git diff -- apps/api/src/modules/bff/bff.controller.ts apps/api/src/modules/bff/bff.controller.spec.ts`
   — 仅涉及确认交接模式判断及对应回归测试。

## 剩余条件

- CI 必须通过；
- 必须在受控环境分别冒烟验证 `TEMP_PRODUCTION_INBOUND` 与
  `PACKAGING_INBOUND` 两种模式；
- 必须确认 TEMP 模式没有新增 `source_type=PACKAGING` 库存，同时交接记录只产生一条；
- 必须由业务方验证“确认入库”可成功且重复点击保持幂等。
