# BUGTASK-20260723-0003 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS — GO（仅进入 CI/CD、生产冒烟与业务验收，不代表生产 Bug 已解决）**

本地后端修复、聚焦回归测试和 API 类型检查通过。未部署、未写数据库、未执行迁移；CI/CD、生产环境冒烟和业务验收完成前，不应关闭源 Bug。

## 来源问题

- Bug：`BUG-20260723-0003`
- Task：`BUGTASK-20260723-0003`
- 现象：库存入库、库存查询与出库未形成可操作闭环
- 关键业务差异：入库使用“产品编码”自由输入，出库使用 SKU 下拉选择

## 复现证据与根因

源码静态复现调用链：

1. 通用入库单完成时，`GenericCrudController` 将页面的产品编码传给 `WmsService.confirmInbound`。
2. `confirmInbound` 原样将该值写入 `inv_batches.product_code`，未写 `sku_code`。
3. SKU 出库由 `advanceOutboundOrder` 按 `inv_batches.sku_code` 查询可用批次。
4. 因此，当入库“产品编码”输入框录入的是一个有效 SKU 编码时，库存批次存在且库存查询可见，但 `sku_code` 为 `NULL`，同一 SKU 的出库查询无法命中该批次。

根因是入库与出库使用不同库存身份键，且入库侧缺少对有效 SKU 编码的主数据归一化。

任务上下文还包含三个同期请求信号，但不属于该闭环根因：

- `POST /api/crud/wms_locations` 的 400 是重复值受控校验；
- `POST /api/v2/finance/expenses/2/submit` 的 400 是审批人配置缺失；
- `POST /api/farm/medicine/inbound` 的 500 属于药品库存独立链路；当前源码已有独立 `inv_batches`/`inv_ledger` 实现，本任务没有足够证据对其追加修改。

## 最小修复

- `apps/api/src/modules/wms/wms.service.ts`
  - 通用入库仅提供 `product_code` 时，在同一事务内按 `product_skus.sku_code` 精确查找 ACTIVE SKU。
  - 精确命中后，将主数据中的规范 `product_code` 与 `sku_code` 一并写入 `inv_batches` 和 `inv_ledger`。
  - 未命中 SKU 时保留原产品编码行为，不猜测多 SKU 产品关系。
  - 继续使用既有事务、DataScope 仓库写权限检查和库存流水审计。
- `apps/api/src/modules/wms/wms.service.spec.ts`
  - 新增回归用例，证明在旧“产品编码”字段录入 SKU 后，批次和流水均保存规范产品/SKU 双键，可被既有 SKU 出库查询命中。

无 schema、entity、表、列或迁移变更。

## 验证结果

```text
cd apps/api
./node_modules/.bin/jest src/modules/wms/wms.service.spec.ts --runInBand

PASS
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

```text
cd apps/api
./node_modules/.bin/tsc --noEmit

PASS (exit 0, no output)
```

```text
git diff --check

PASS (exit 0, no output)
```

诊断首选工具 `rg` 在当前环境不可用（`command not found`），随后使用 `find` 配合窄条件 `grep` 检索，并以测试断言完成验证。

## 条件与后续 Gate

1. CI 必须通过。
2. 部署后使用真实 ACTIVE SKU 完成一次入库，确认库存查询同时显示规范产品编码和 SKU。
3. 使用同一 SKU 创建并完成出库，确认对应批次可被选中、数量正确扣减且 `inv_ledger` 有成对流水。
4. 业务方确认入库、库存查询、出库三个页面流程满足验收标准后再关闭源 Bug。
5. 本任务未合并、未推送、未部署、未写数据库、未执行迁移。

