# Batch 4 Store Payment Export Technical Discovery

日期：2026-10-02  
基线：`origin/main` at `40be04068f026dcda8f145a16cd63ec1cbf9ccde`

## 结论

```text
STORE_EXPORT_STATUS=AWAITING_BUSINESS_DECISION
BACKEND_EXPORT_API_EXISTS=NO
EXPORT_INFRA_EXISTS=NO
EXPECTED_IMPLEMENTATION_SIZE=MEDIUM
MIGRATION_REQUIRED=NO (discovery only)
```

当前页面保留“导出”权限提示和禁用按钮。按钮文案明确写明该 Gate 暂不实现真实导出；因此本次只完成技术发现，不把 disabled UI 自动解释为已批准的产品需求。

## 现有链路

- Web：`apps/web/src/app/(admin)/store-payment/page.tsx` 仅渲染受 `MENU_STORE_PAYMENT:X` 保护的 disabled button，没有下载请求或导出状态处理。
- API：`apps/api/src/modules/store-payment/store-payment.controller.ts` 提供账户、收款记录、受控附件状态/预览/下载接口，没有记录导出 endpoint。
- 查询：`QueryStorePaymentRecordDto` 已支持 `storeCode`、`companyCode`、`status`、`submittedBy`、`dateFrom`、`dateTo` 与分页；`StorePaymentService.listRecords` 已将这些查询与 DataScope 应用到列表查询，可作为未来导出过滤语义的起点。
- 公共导出：API 侧未发现可直接复用的 CSV/XLSX 导出工具或 Store Payment 导出服务。Web workspace 虽有 `xlsx` 依赖，但当前没有与 Store Payment 查询、权限和下载响应集成的导出实现。

## 预期实现范围（待业务确认）

如果业务确认纳入 MVP，预计需要：

1. 明确导出格式（CSV 或 XLSX）、列集合、时间范围和最大行数。
2. 增加 API export endpoint/service，复用列表过滤语义并强制 `MENU_STORE_PAYMENT:X`、公司/门店 DataScope 和行数上限。
3. 增加导出审计事件（操作者、筛选条件、行数、时间）。
4. 接通 Web button、loading/error/download 状态。
5. 增加授权、跨公司/跨门店、过滤一致性和大结果集回归测试。

预计改动规模为中等，涉及 controller、DTO/service、序列化/下载响应、Web 页面和测试；当前没有证据表明需要数据库 schema 变更。

## 安全范围

```text
SECURITY_SCOPE=MENU_STORE_PAYMENT:X + DataScope(company/store) + filter parity + row limit + export audit
```

导出不得绕过现有列表权限或附件 ACL。导出响应不应暴露受控附件原始 URL；若未来导出附件元数据，也必须沿用附件 ownership 和公司/门店范围检查。

## 决策门

```text
BUSINESS_MVP_REQUIRED=UNCONFIRMED
STORE_EXPORT_IMPLEMENTATION=BLOCKED_ON_BUSINESS_DECISION
```

在业务确认前不实现、不新增 migration、不改变当前 disabled 行为。
