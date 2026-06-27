# A3 Backend S2 Report: Store Payment 001

## 1. 修改文件清单

1. `apps/api/src/modules/store-payment/dto/store-payment.dto.ts`
2. `apps/api/src/modules/store-payment/store-payment.module.ts`
3. `apps/api/src/modules/store-payment/store-payment.controller.ts`
4. `apps/api/src/modules/store-payment/store-payment.service.ts`
5. `docs/ops/A3_BACKEND_S2_STORE_PAYMENT_001_REPORT.md`

未修改 `apps/web/**`，未修改采购/销售/财务/POS/Chanjet 核心业务，未新增 migration。

## 2. 实现接口清单

Controller base path: `/store-payment`

1. `GET /store-payment/accounts`
2. `POST /store-payment/accounts`
3. `PATCH /store-payment/accounts/:id`
4. `GET /store-payment/records`
5. `POST /store-payment/records`
6. `GET /store-payment/records/:id`
7. `POST /store-payment/records/:id/confirm`
8. `POST /store-payment/records/:id/reject`
9. `POST /store-payment/records/:id/void`

导出接口未实现，`MENU_STORE_PAYMENT_EXPORT` 仅保留为后续权限设计项。

重要条件项：本轮用户允许 diff 范围限制在 `apps/api/src/modules/store-payment/**` 与本报告，未允许修改 `apps/api/src/app.module.ts`。因此 `StorePaymentModule` 已实现但尚未注册到 `AppModule`，运行时暴露接口需要后续单独批准最小 module wiring。

## 3. RBAC 覆盖说明

所有 Controller 路由均使用 `@UseGuards(MenuGuard, DataScopeGuard)`。

1. Account list: `MENU_STORE_PAYMENT_ACCOUNT:V`
2. Account create/update: `MENU_STORE_PAYMENT_ACCOUNT:E`
3. Record list/detail: `MENU_STORE_PAYMENT:V`
4. Record create: `MENU_STORE_PAYMENT:C`
5. Confirm/reject: `MENU_STORE_PAYMENT_CONFIRM:A`
6. Void: `MENU_STORE_PAYMENT_VOID:A`

未做菜单 seed / 权限 seed。菜单注册和角色授权仍需单独任务处理。

## 4. DataScope 实现说明

未改全局 `DataScopeService`。S2 在 `StorePaymentService` 内做最小本地约束：

1. Admin: `ROLE_ADMIN` 或 `permissions='*'` 可全局访问。
2. Finance: `ROLE_FIN_ACCT` / `ROLE_FIN_CFO` / `ROLE_GROUP_FINANCE` / `ROLE_HQ_FINANCE` 视为全部门店访问。
3. Store manager: `ROLE_STORE_MGR` 仅允许 `store_code` 落在本地解析的门店清单内。
4. Clerk: `ROLE_CASHIER` 允许本人记录或本店记录。
5. 本地门店清单来自 JWT `storeCode` 以及 CLS `dataScope.allowedSiteCodes` 的最小合并。
6. Clerk create 会校验 body `storeCode` 必须属于本地门店清单；不直接信任请求体。

条件项：现有 DataScope 没有 first-class `allowedStoreCodes`，当前实现是 S2 最小服务内兜底。A2 后端复核应重点确认 `allowedSiteCodes` 是否可作为试点门店 scope 过渡。

## 5. 审计日志说明

S2 通过 `sys_operation_logs` 写服务级审计：

1. Account create: `STORE_PAYMENT_ACCOUNT / CREATE`
2. Account update: `STORE_PAYMENT_ACCOUNT / MODIFY`
3. Account disable: `STORE_PAYMENT_ACCOUNT / DISABLE`
4. Record create: `STORE_PAYMENT_RECORD / CREATE`
5. Confirm: `STORE_PAYMENT_RECORD / CONFIRM`
6. Reject: `STORE_PAYMENT_RECORD / REJECT`
7. Void: `STORE_PAYMENT_RECORD / VOID`

审计 payload 不写裸 QR/proof 引用，只写 `qrAttachmentBound` / `proofAttachmentBound`。`remark` 和 `reason` 在审计中只记录存在性，不写完整文本。

## 6. 附件 ACL 条件项

S2 强制：

1. 创建收款记录必须传 `proofAttachmentId`。
2. `proofAttachmentId` 和 `qrAttachmentId` 禁止是 `/uploads/...`、`uploads/...`、`http://...`、`https://...` 形式的裸 URL。
3. 列表/详情响应不返回 `proofAttachmentId` / `qrAttachmentId` 原值，只返回绑定布尔值。

未实现 protected preview/download controller。原因：现有附件系统仍缺少 record-level ACL 与通用 protected file controller，本轮不得回退裸 URL。后续需要单独实现受保护附件读取端点，并复用 record detail 的 RBAC/DataScope。

## 7. 状态机说明

已实现：

1. Create 固定写入 `PENDING`，忽略请求体状态。
2. `PENDING -> CONFIRMED`
3. `PENDING -> REJECTED`，必须有 reason。
4. `PENDING / REJECTED / CONFIRMED -> VOIDED`，必须有 reason。
5. `VOIDED` 终态。
6. 不提供 confirmed record 静默编辑接口。
7. 不提供反确认。

## 8. 未实现事项

1. 未实现 export。
2. 未实现 protected proof preview/download。
3. 未实现 frontend。
4. 未实现 POS / 库存 / 财务自动核销。
5. 未实现 Chanjet/Yonyou/好业财同步。
6. 未实现第三方支付回调。
7. 未做菜单 seed / 权限 seed。
8. 未修改 `AppModule` 注册 `StorePaymentModule`，需后续批准最小 wiring。

## 9. 验证命令结果

1. `pnpm --filter phoenix-erp-v3-nest exec tsc --noEmit`: PASS
2. `node scripts/ci/check-security-regression.mjs`: PASS
3. `node scripts/ci/check-freeze-boundaries.mjs`: FAIL
   - 原因：本轮确实修改 `apps/api/src/modules/store-payment/**` 应用代码，freeze gate 默认要求显式授权。
4. `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-freeze-boundaries.mjs`: PASS with WARN
   - 命中 4 个授权范围内 store-payment backend 文件。
5. `node scripts/ci/check-w5-closeout-gate.mjs`: FAIL
   - 原因：内部调用 freeze boundary 未带授权变量。
6. `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## 10. 安全声明

| 项目 | 结果 |
| --- | --- |
| 是否新增 migration | 否 |
| 是否执行 migration | 否 |
| 是否写库 | 否 |
| 是否部署 | 否 |
| 是否修改旧表 | 否 |
| 是否修改 schema/entity/table/column | 否 |
| 是否修改 apps/web | 否 |

## 11. 是否建议进入 A2 后端安全复核

是。

建议 A2 Backend S2 Review 重点复核：

1. `StorePaymentModule` 未注册到 `AppModule` 的后续 wiring 边界。
2. Store-level DataScope 的 `storeCode + allowedSiteCodes` 过渡策略。
3. Finance roles 全部门店访问口径是否符合权限矩阵。
4. `sys_operation_logs` 审计 payload 脱敏是否足够。
5. 附件 protected access 未完成前，前端和导出是否能继续避免裸 URL 暴露。
