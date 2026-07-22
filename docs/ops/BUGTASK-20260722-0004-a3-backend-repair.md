# BUGTASK-20260722-0004 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS**

后端交班汇总的确定性归零错误已修复，并补齐同班次的分级、标签、包装和实际入库汇总。此结论仅覆盖本地后端实现与验证；在 CI/CD、前端接入新增字段、生产路由冒烟及业务验收完成前，不声明源问题已解决。

## 来源问题

- Bug：`BUG-20260722-0004`
- Task：`BUGTASK-20260722-0004`
- 现象：集蛋、分级、包装、标签、入库已完成，但交班汇总全部显示 0。
- 接口：`GET /api/packaging/terminal/reports/shift-summary`

## 根因与本地复现证据

`getShiftSummary()` 对聚合 SQL 结果先执行了数组解构：

```ts
const [recvRow] = await ...
```

此时 `recvRow` 已是单行对象，但返回值组装又读取 `recvRow[0]?.qty`。同样错误存在于异常数和包装数，导致有效 SQL 聚合值被读取为 `undefined`，随后统一通过 `|| 0` 显示为 0。

此外，旧接口存在三个数据完整性缺口：

1. 集蛋按日期汇总，未按请求班次过滤；
2. 未从 `pkg_grading_records`、`pkg_label_print_logs` 汇总分级与标签；
3. 入库数由前端等同包装数，接口未读取 `pkg_handover_records` 的实际交接数量。

## 修复

- 修正聚合行对象的读取方式，不再二次 `[0]` 索引。
- 有合法 `shiftId` 时，班次、集蛋、分级、包装、标签、交接入库均限定到该班次。
- 汇总分级 JSON，返回 `gradingOutputs` 与 `gradedQty`。
- 返回 `shiftLabelCount`、`shiftWarehousedBoxes`、`shiftWarehousedPallets`。
- 保留原 RBAC、DataScope、审计和附件 ACL；未改 schema、entity 或 migration，未写数据库。

## 变更文件

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/api/src/modules/bff/bff.controller.spec.ts`
- `docs/ops/BUGTASK-20260722-0004-a3-backend-repair.md`

## 验证

```bash
cd apps/api
./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand
# PASS：1 suite，8 tests

./node_modules/.bin/tsc --noEmit
# PASS：exit 0，0 errors

git diff --check
# PASS：exit 0
```

新增回归用例用非零的集蛋、分级、包装、标签和入库数据模拟 SQL 返回，断言接口不再归零，并断言各业务表查询携带同一 `shiftId`。

## 条件与后续 Gate

- 前端当前仍从临时 `ctx.gradingOutputs` 读取分级，并把包装数当作入库数；A4 需要接入本接口的 `gradingOutputs`、`shiftWarehousedBoxes` 和 `shiftWarehousedPallets`，标签若需展示则接入 `shiftLabelCount`。
- 尚未执行 CI/CD、部署、生产接口冒烟或业务验收。
- 因此源 Bug 保持 HOLD，待上述 Gate 全部通过后才能转为已解决。
