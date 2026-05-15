# Phoenix ERP V3 — API 端点清单

> 自动生成于 2026-05-14 — 通过扫描 `apps/api/src/**/*.controller.ts` 的 NestJS 装饰器。
> **不要手动编辑此文件**；改后跑 `bash scripts/gen-api-docs.sh > API.md`。

## 认证

除非端点显式标注"公开"，所有请求必须带：

```
Authorization: Bearer <JWT_TOKEN>
```

获取 token：

```bash
curl -X POST http://localhost:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

## 端点列表（按模块）


### `root`

**Controller**: `auth.ts` — 前缀 `/api/auth`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/auth/login` | `@HttpCode` |
| `Post` | `/api/auth/refresh` | `@HttpCode` |
| `Get` | `/api/auth/me` | `getMe` |

**Controller**: `debug.ts` — 前缀 `/api/v3/debug`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/v3/debug/migrated-data` | `getMigratedData` |

**Controller**: `health.ts` — 前缀 `/api`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/health` | `getHealth` |
| `Get` | `/api/metrics` | `@Header` |
| `Get` | `/api/readiness` | `getReadiness` |

### `approval`

**Controller**: `approval.ts` — 前缀 `/api/v3/approval`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/v3/approval/submit` | `@RequireMenu` |
| `Post` | `/api/v3/approval/:docType/:docId/approve` | `@RequireMenu` |

### `bff`

**Controller**: `bff.ts` — 前缀 `/api/dashboard`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/dashboard/kpi` | `getKpi` |
| `Get` | `/api/dashboard/store-analysis` | `getStoreAnalysis` |
| `Get` | `/api/dashboard/integrity` | `getIntegrity` |
| `Get` | `/api/dashboard` | `getUsers` |
| `Put` | `/api/dashboard/:id` | `updateUser` |
| `Get` | `/api/dashboard/overview` | `getOverview` |
| `Get` | `/api/dashboard/production` | `getProduction` |
| `Get` | `/api/dashboard/inventory` | `getInventory` |
| `Get` | `/api/dashboard/orders` | `getOrders` |
| `Get` | `/api/dashboard/alerts` | `getAlerts` |
| `Get` | `/api/dashboard/promotion-roi` | `getPromotionRoi` |
| `Get` | `/api/dashboard/price-review` | `getPriceReview` |
| `Get` | `/api/dashboard/competitor-intel` | `getCompetitorIntel` |
| `Get` | `/api/dashboard/channel-scorecard` | `getChannelScorecard` |
| `Get` | `/api/dashboard/workbench` | `getWorkbench` |
| `Post` | `/api/dashboard/workbench/sample` | `sampleAudit` |
| `Get` | `/api/dashboard/violations` | `getViolations` |
| `Get` | `/api/dashboard/anti-fraud` | `getAntiFraud` |
| `Post` | `/api/dashboard/anti-fraud/:id/freeze` | `freezeAccount` |
| `Get` | `/api/dashboard/books` | `getPriceBooks` |
| `Get` | `/api/dashboard/floating` | `getFloating` |
| `Put` | `/api/dashboard/floating/:id` | `updateFloating` |
| `Get` | `/api/dashboard/approvals` | `getApprovals` |
| `Get` | `/api/dashboard/distributors` | `getDistributors` |
| `Put` | `/api/dashboard/distributors/:id` | `updateDistributor` |
| `Get` | `/api/dashboard/grade-config` | `getGradeConfig` |
| `Get` | `/api/dashboard/pack-spec-config` | `getPackSpecConfig` |
| `Get` | `/api/dashboard/operators` | `getOperators` |
| `Get` | `/api/dashboard/shifts` | `getShifts` |
| `Post` | `/api/dashboard/shifts/:id/complete` | `completeShift` |
| `Get` | `/api/dashboard/grading-tasks` | `getGradingTasks` |
| `Post` | `/api/dashboard/tasks/:task_no/grade` | `submitGrading` |
| `Post` | `/api/dashboard/tasks/:task_no/pack-complete` | `packComplete` |
| `Post` | `/api/dashboard/tasks/merge-remainder` | `mergeRemainder` |
| `Get` | `/api/dashboard/daily-report` | `getDailyReport` |
| `Post` | `/api/dashboard/tasks/:task_no/anomaly-reason` | `patchAnomalyReason` |
| `Get` | `/api/dashboard/tasks/:task_no/label-info` | `getLabelInfo` |

### `farm`

**Controller**: `farm.ts` — 前缀 `/api/v3/farm`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/v3/farm/daily-logs` | `submitBreedingDailyLog` |
| `Put` | `/api/v3/farm/daily-logs/:id` | `updateBreedingDailyLog` |

### `finance`

**Controller**: `finance.ts` — 前缀 `/api/finance`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/finance/ar-aging` | `getArAging` |
| `Get` | `/api/finance/ar-aging/customer/:customer_code` | `getArAgingByCustomer` |
| `Get` | `/api/finance/ap-aging` | `getApAging` |
| `Post` | `/api/finance/ap-invoice` | `createApInvoice` |
| `Post` | `/api/finance/ap-payment` | `payApInvoice` |
| `Post` | `/api/finance/income` | `registerIncome` |
| `Post` | `/api/finance/expense/:txn_id/approve-chain` | `approveExpenseChain` |
| `Get` | `/api/finance/cashflow` | `getCashflow` |
| `Get` | `/api/finance/summary` | `getSummary` |
| `Post` | `/api/finance/expense` | `submitExpense` |
| `Post` | `/api/finance/expense/:txn_id/approve` | `approveExpense` |
| `Get` | `/api/finance/aging-overview` | `getAgingOverview` |
| `Get` | `/api/finance/invoices` | `getInvoices` |
| `Get` | `/api/finance/accounts` | `getAccounts` |
| `Get` | `/api/finance/transactions` | `getTransactions` |
| `Get` | `/api/finance/income` | `getIncome` |

### `generic-crud`

**Controller**: `generic-crud.ts` — 前缀 `/api/crud`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/crud/:table` | `findAll` |
| `Post` | `/api/crud/:table` | `create` |
| `Put` | `/api/crud/:table/:idColumn/:id` | `updateWithColumn` |
| `Put` | `/api/crud/:table/:id` | `update` |
| `Delete` | `/api/crud/:table/:idColumn/:id` | `removeWithColumn` |
| `Delete` | `/api/crud/:table/:id` | `remove` |

### `iot`

**Controller**: `farm-cabin.ts` — 前缀 `/api/farm-device/cabins`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/farm-device/cabins/all-summary` | `getAllSummary` |
| `Get` | `/api/farm-device/cabins/:houseCode/overview` | `getHouseOverview` |
| `Get` | `/api/farm-device/cabins/:houseCode/systems/summary` | `getHouseSystemsSummary` |
| `Get` | `/api/farm-device/cabins/:houseCode/systems/:systemCode/detail` | `getHouseSystemDetail` |
| `Get` | `/api/farm-device/cabins/:houseCode/trends` | `getHouseTrends` |
| `Get` | `/api/farm-device/cabins/:houseCode/alarms` | `getHouseAlarms` |
| `Get` | `/api/farm-device/cabins/:houseCode/stream` | `getHouseStream` |
| `Get` | `/api/farm-device/cabins/:cabinId/status` | `getCabinStatus` |

**Controller**: `farm-device.ts` — 前缀 `/api/farm-device`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/farm-device/sync/realtime` | `syncRealtimeData` |
| `Get` | `/api/farm-device/snapshot-all` | `@UseGuards` |
| `Get` | `/api/farm-device/houses/:houseCode/snapshot` | `@UseGuards` |
| `Get` | `/api/farm-device/alerts/stats` | `@UseGuards` |
| `Get` | `/api/farm-device/alerts` | `@UseGuards` |
| `Get` | `/api/farm-device/alerts/stream` | `getAlertStream` |
| `Post` | `/api/farm-device/alerts/:id/confirm` | `@UseGuards` |
| `Post` | `/api/farm-device/alerts/:id/close` | `@UseGuards` |
| `Get` | `/api/farm-device/auth/status` | `getAuthStatus` |
| `Get` | `/api/farm-device/mappings` | `getMappings` |
| `Get` | `/api/farm-device/vendor-houses` | `@UseGuards` |
| `Get` | `/api/farm-device/property-dict` | `getPropertyDict` |
| `Get` | `/api/farm-device/ops-log` | `getOpsLog` |
| `Get` | `/api/farm-device/sync/jobs` | `getSyncJobs` |
| `Get` | `/api/farm-device/devices/offline` | `getOfflineDevices` |
| `Post` | `/api/farm-device/mapping` | `createMapping` |
| `Post` | `/api/farm-device/sync/houses` | `syncHouses` |
| `Put` | `/api/farm-device/property-dict/:id` | `updatePropertyDict` |
| `Get` | `/api/farm-device/mapping/:id/alert-config` | `getMappingAlertConfig` |
| `Put` | `/api/farm-device/mapping/:id` | `updateMapping` |
| `Delete` | `/api/farm-device/mapping/:id` | `deleteMapping` |
| `Get` | `/api/farm-device/houses/:houseCode/history` | `@UseGuards` |
| `Get` | `/api/farm-device/houses/:houseCode/daily-agg` | `@UseGuards` |
| `Post` | `/api/farm-device/sync/history` | `@UseGuards` |

**Controller**: `iot-v3.ts` — 前缀 `/api/v3/iot/devices`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/v3/iot/devices/all-summary` | `@UseGuards` |
| `Post` | `/api/v3/iot/devices/sync/realtime` | `@UseGuards` |

**Controller**: `mon-device.ts` — 前缀 `/api/v3/iot/devices`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/v3/iot/devices/all-summary` | `getAllSummary` |
| `Get` | `/api/v3/iot/devices/:houseCode/overview` | `getOverview` |
| `Get` | `/api/v3/iot/devices/:houseCode/trends` | `getTrends` |
| `Post` | `/api/v3/iot/devices/sync/realtime` | `manualSync` |
| `Post` | `/api/v3/iot/devices/daily-report/generate` | `generateDailyReport` |

### `master`

**Controller**: `master.ts` — 前缀 `/api/master`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/master/stores` | `getStores` |
| `Get` | `/api/master/products` | `getProducts` |
| `Get` | `/api/master/brand` | `getBrand` |
| `Put` | `/api/master/brand` | `updateBrand` |

**Controller**: `system-users.ts` — 前缀 `/api/system/users`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/system/users` | `list` |
| `Post` | `/api/system/users` | `create` |
| `Put` | `/api/system/users/:id/status` | `setStatus` |
| `Put` | `/api/system/users/:id/role` | `setRole` |
| `Put` | `/api/system/users/:id/password` | `resetPassword` |
| `Put` | `/api/system/users/:id` | `updateInfo` |

### `order`

**Controller**: `order.ts` — 前缀 `/api/orders`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/orders/submit` | `@RequireMenu` |
| `Post` | `/api/orders/[:order_no/transition, :order_no/status]` | `@RequireMenu` |
| `Get` | `/api/orders/:order_no` | `@RequireMenu` |

### `permissions`

**Controller**: `permission-sets.ts` — 前缀 `/api/permission-sets`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/permission-sets` | `list` |
| `Get` | `/api/permission-sets/:code` | `get` |
| `Post` | `/api/permission-sets` | `create` |
| `Put` | `/api/permission-sets/:code` | `update` |
| `Delete` | `/api/permission-sets/:code` | `remove` |
| `Put` | `/api/permission-sets/:code/items` | `setItems` |
| `Post` | `/api/permission-sets/:code/bind-role/:roleCode` | `bindRole` |
| `Delete` | `/api/permission-sets/:code/bind-role/:roleCode` | `unbindRole` |
| `Post` | `/api/permission-sets/:code/bind-user/:userId` | `bindUser` |
| `Delete` | `/api/permission-sets/:code/bind-user/:userId` | `unbindUser` |

**Controller**: `permissions.ts` — 前缀 `/api/permissions`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/permissions/menus` | `getMenus` |
| `Get` | `/api/permissions/conflicts` | `getConflicts` |
| `Post` | `/api/permissions/check-conflicts` | `checkConflicts` |
| `Get` | `/api/permissions/matrix` | `getMatrix` |
| `Get` | `/api/permissions/stats` | `getStats` |
| `Get` | `/api/permissions/effective-perms/:userId` | `getEffective` |
| `Get` | `/api/permissions/role/:code/users` | `getRoleUsers` |
| `Get` | `/api/permissions/role/:code/perms` | `getRolePerms` |
| `Put` | `/api/permissions/role/:code/perms` | `setRolePerms` |

### `procurement`

**Controller**: `procurement.ts` — 前缀 `/api/procurement`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/procurement/dashboard` | `getDashboard` |
| `Get` | `/api/procurement/requests` | `getRequests` |
| `Get` | `/api/procurement/orders` | `getOrders` |
| `Post` | `/api/procurement/create` | `createPO` |
| `Post` | `/api/procurement/:poNo/submit` | `submitPO` |
| `Post` | `/api/procurement/:poNo/confirm-receipt` | `confirmReceipt` |
| `Post` | `/api/procurement/receipts/:receipt_no/confirm` | `confirmReceiptLegacy` |
| `Get` | `/api/procurement/suppliers` | `getSuppliers` |
| `Get` | `/api/procurement/supplier-kpi` | `getSupplierKpi` |
| `Get` | `/api/procurement/three-way-match/:po_no` | `getThreeWayMatch` |
| `Get` | `/api/procurement/feed-reconciliation` | `getFeedReconciliation` |

### `quality`

**Controller**: `quality.ts` — 前缀 `/api/quality`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/quality/trace/forward` | `traceForward` |
| `Get` | `/api/quality/trace/backward` | `traceBackward` |
| `Get` | `/api/quality/inspections` | `listInspections` |
| `Post` | `/api/quality/inspections` | `createInspection` |
| `Get` | `/api/quality/inspections/:inspect_no` | `getInspection` |
| `Get` | `/api/quality/non-conformances` | `listNCs` |
| `Post` | `/api/quality/non-conformances` | `createNC` |
| `Get` | `/api/quality/standards` | `listStandards` |

### `store`

**Controller**: `pos.ts` — 前缀 `/api/v3/pos`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/v3/pos/sales` | `@RequireMenu` |
| `Post` | `/api/v3/pos/sales/:sale_no/refund` | `@RequireMenu` |
| `Post` | `/api/v3/pos/sales/:sale_no/void` | `@RequireMenu` |
| `Post` | `/api/v3/pos/losses/:loss_no/approve` | `@RequireMenu` |
| `Post` | `/api/v3/pos/receiving/:order_no/confirm` | `@RequireMenu` |
| `Post` | `/api/v3/pos/replenish/:req_no/approve` | `@RequireMenu` |
| `Post` | `/api/v3/pos/sessions` | `@RequireMenu` |
| `Get` | `/api/v3/pos/sessions` | `@RequireMenu` |
| `Post` | `/api/v3/pos/sessions/close` | `@RequireMenu` |
| `Get` | `/api/v3/pos/today` | `@RequireMenu` |

**Controller**: `store.ts` — 前缀 `/api/v3/store`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/v3/store/daily-close` | `@RequireMenu` |
| `Put` | `/api/v3/store/daily-close/:id` | `@RequireMenu` |
| `Post` | `/api/v3/store/daily-close/:id/close` | `@RequireMenu` |
| `Get` | `/api/v3/store/daily-close-v2/preview` | `@RequireMenu` |
| `Post` | `/api/v3/store/daily-close-v2/submit` | `@RequireMenu` |
| `Get` | `/api/v3/store/daily-close-v2` | `@RequireMenu` |

### `terminal`

**Controller**: `labels.ts` — 前缀 `/api/labels`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Post` | `/api/labels/zpl/generate` | `generateZpl` |
| `Post` | `/api/labels/log` | `logPrint` |
| `Post` | `/api/labels/record` | `recordPrint` |
| `Get` | `/api/labels/records/batch/:batchNo` | `listByBatch` |

**Controller**: `packaging.ts` — 前缀 `/api/packaging`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/packaging/grade-config` | `getGradeConfig` |
| `Get` | `/api/packaging/pack-spec-config` | `getPackSpecConfig` |
| `Get` | `/api/packaging/operators` | `getOperators` |
| `Get` | `/api/packaging/daily-report` | `getDailyReport` |
| `Get` | `/api/packaging/daily-report-range` | `getDailyReportRange` |
| `Get` | `/api/packaging/grading-tasks` | `getGradingTasks` |
| `Get` | `/api/packaging/tasks` | `getPackagingTasks` |
| `Get` | `/api/packaging/shifts` | `getShifts` |
| `Post` | `/api/packaging/shifts` | `createShift` |
| `Post` | `/api/packaging/shifts/:id/complete` | `completeShift` |
| `Post` | `/api/packaging/shifts/:id/reopen` | `reopenShift` |
| `Post` | `/api/packaging/tasks/:id/grade` | `submitGrade` |
| `Post` | `/api/packaging/tasks/:id/pack-complete` | `packComplete` |
| `Post` | `/api/packaging/tasks/merge-remainder` | `mergeRemainder` |
| `Post` | `/api/packaging/tasks/:id/reprint-log` | `reprintLog` |
| `Post` | `/api/packaging/submit` | `submitPackagingTask` |
| `Get` | `/api/packaging/grade-config` | `getGradeConfig` |
| `Get` | `/api/packaging/tasks` | `getTasks` |
| `Post` | `/api/packaging/tasks/:id/grade` | `submitGrade` |

**Controller**: `pda.ts` — 前缀 `/api/pda`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/pda/inventory/:warehouse_code` | `syncInventory` |
| `Post` | `/api/pda/scan` | `scanBarcode` |
| `Get` | `/api/pda/terminals` | `listTerminals` |
| `Post` | `/api/pda/terminals` | `createTerminal` |
| `Put` | `/api/pda/terminals/:id` | `updateTerminal` |
| `Delete` | `/api/pda/terminals/:id` | `deleteTerminal` |
| `Put` | `/api/pda/system-config` | `updateSystemConfig` |
| `Post` | `/api/pda/register` | `register` |
| `Post` | `/api/pda/heartbeat` | `heartbeat` |
| `Get` | `/api/pda/system-config` | `getSystemConfig` |
| `Get` | `/api/pda/scanner-config/:serial` | `getScannerConfig` |
| `Get` | `/api/pda/info` | `info` |
| `Get` | `/api/pda/latest` | `getLatestVersion` |

**Controller**: `stocktake.ts` — 前缀 `/api/stocktake`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/stocktake/tasks` | `getStocktakeTasks` |
| `Post` | `/api/stocktake/submit` | `submitDailyClose` |

### `wms`

**Controller**: `inbound.ts` — 前缀 `/api/inbound`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/inbound/dashboard` | `@RequireMenu` |
| `Get` | `/api/inbound/pending` | `@RequireMenu` |
| `Get` | `/api/inbound/task/:task_no` | `@RequireMenu` |
| `Post` | `/api/inbound/confirm` | `@RequireMenu` |

**Controller**: `inventory.ts` — 前缀 `/api/stocktake`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/stocktake/daily-close` | `@RequireMenu` |
| `Post` | `/api/stocktake/daily-close` | `@RequireMenu` |
| `Get` | `/api/stocktake/batches` | `@RequireMenu` |
| `Get` | `/api/stocktake/receiving/orders` | `@RequireMenu` |
| `Get` | `/api/stocktake/receiving/orders/:order_no/items` | `@RequireMenu` |
| `Post` | `/api/stocktake/receiving/orders/:order_no/confirm` | `@RequireMenu` |
| `Post` | `/api/stocktake/sync-pda` | `@RequireMenu` |
| `Post` | `/api/stocktake/transfer/confirm` | `@RequireMenu` |
| `Post` | `/api/stocktake/stocktake/approve` | `@RequireMenu` |
| `Post` | `/api/stocktake/loss/approve` | `@RequireMenu` |

**Controller**: `outbound.ts` — 前缀 `/api/outbound`

| 方法 | 路径 | Handler |
|------|------|---------|
| `Get` | `/api/outbound/dashboard` | `@RequireMenu` |
| `Get` | `/api/outbound/orders` | `@RequireMenu` |
| `Get` | `/api/outbound/orders/:order_no` | `@RequireMenu` |
| `Post` | `/api/outbound/orders/:order_no/advance` | `@RequireMenu` |
| `Post` | `/api/outbound/orders/:order_no/receive-sign` | `@RequireMenu` |

---

**总端点数**：约 233

## 关键业务流端点速查

| 用途 | 方法 + 路径 |
|------|-----------|
| 登录获取 token | `POST /api/auth/login` |
| 健康检查 | `GET /api/health` |
| Prometheus 指标 | `GET /api/metrics` |
| 提交订单 | `POST /api/orders/submit` |
| 订单状态推进 | `POST /api/orders/:order_no/transition` |
| 出库单推进 | `POST /api/outbound/orders/:order_no/advance` |
| POS 销售 | `POST /api/v3/pos/sales` |
| AP 凭证 | `POST /api/finance/ap-invoice` |
| 收入登记 (AR 核销) | `POST /api/finance/income` |
| 门店日结 (V2 fidelity) | `POST /api/v3/store/daily-close-v2/submit` |
| 正向追溯 | `GET /api/quality/trace/forward?batch_no=...` |
| 创建 NCR | `POST /api/quality/non-conformances` |
| 主仪表盘 | `GET /api/dashboard/kpi` |
| 单店分析 | `GET /api/dashboard/store-analysis?store_code=...` |
| 数据完整性 | `GET /api/dashboard/integrity` |
| PDA 终端注册 | `POST /api/pda/register` (公开) |

## CRUD 通用端点

V3 通过 `generic-crud` 模块为白名单内的表自动暴露 RESTful CRUD：

- `GET /api/crud/:table` — 列表（支持 ?limit=, ?offset=, ?where=...）
- `GET /api/crud/:table/:idCol/:idVal` — 单条
- `POST /api/crud/:table` — 新建
- `PUT /api/crud/:table/:idCol/:idVal` — 更新
- `DELETE /api/crud/:table/:idCol/:idVal` — 删除

白名单与角色权限：`apps/api/src/modules/generic-crud/crud.constants.ts`

## 错误码

| HTTP | 业务码 | 含义 | subcode |
|------|------|------|---------|
| 200/201 | 0 / 200 | 成功 | — |
| 400 | 400 | 请求参数错误 | — |
| 401 | 401 | 未登录 / 过期 | NO_TOKEN / TOKEN_EXPIRED / INVALID_TOKEN / PERMS_CHANGED |
| 403 | 403 | 权限不足 | — |
| 404 | 404 | 资源不存在 | — |
| 409 | 409 | 冲突 (库存不足 / 重复键 / 状态机非法) | — |
| 500 | 500 | 服务器异常 | — |
