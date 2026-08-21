# G201B — R4 清零与硬门禁

日期：2026-08-21

## 生产证据与通知决策

- 只读审计：GitHub Actions run `32472985151`，使用 `PGOPTIONS=default_transaction_read_only=on`、`BEGIN TRANSACTION READ ONLY` 与 `ON_ERROR_STOP`。
- `sys_notifications.user_id` 在生产为 `NOT NULL`。代码中所有个人通知入口均以 `user_id = 当前用户` 查询；列表、未读数、已读、归档与 SSE 都不存在 `user_id IS NULL` 或公司级 OR 读取路径。
- 因此选择路径 B：保持生产 schema，不创建迁移；公司级预警按「公司 DataScope 可见性 ∩ 菜单 V 权限」展开为实名收件人。
- 信用权限：`MENU_SALES2_CREDIT:V`。库存权限：`MENU_SALES2_INVENTORY`、`MENU_WMS_VIEW`、`MENU_INV_BATCH` 任一 V。
- 权限候选覆盖角色直绑、角色权限集、用户权限集，并应用 DENY；候选用户逐一复用 `DataScopeService.resolve()`，ROLE_ADMIN/GROUP 全局，普通用户按展开后的 `allowedCompanyCodes`。
- 零收件人记 WARN 并跳过；解析或写入失败不再吞掉。g199 月度 AR 对账原本即逐用户传入非空 `userId`，无需修改。

## 代码修复

- 新增 `ScopedNotificationRecipientService`，统一权限与 DataScope 求交集。
- 客户信用与临期库存调度器改为逐用户写 `sys_notifications.user_id`。
- 删除 `autoFreezeCustomer()` 中无收件人的重复通知写入；冻结通知由唯一调用者信用调度器实名投递。
- `getExpiringBatches()` 读取 CLS DataScope：普通用户按允许公司参数化过滤，无范围 fail-closed；无请求 CLS 的系统定时扫描保持全局。
- `SysNotificationEntity.userId` 改为非空，匹配生产。

## R4 24 项处置

生产 `is_nullable=YES`，entity 增加 `nullable:true`（18 项）：

- `fin_ar_ledger.base_currency`
- `prc_purchase_orders.total_amount/currency_code/status/plan_qty/received_qty`
- `sal_order_items.allocated_qty`
- `sal_return_items.returned_qty/accepted_qty/damaged_qty/unit_price/amount/inspection_result/restock_status`
- `sal_return_orders.currency_code/subtotal/status/need_approval`

生产 `is_nullable=NO`，entity 保持或改为非空（6 项）：

- `wf_approval_instance_steps.approver_type`
- `chanjet_ar_snapshot.assistant_customer_code/subject_id`
- `sal_drivers.status`
- `sal_vehicles.status`
- `sys_notifications.user_id`

上述 6 项受静态解析跳过的动态历史迁移影响，脚本在迁移模型构建末端登记生产只读审计终态；未使用 allowlist。

## 门禁升级与验证

- R4 已从 warning 移入 violation；allowlist 语法支持 R4，但真实漂移禁止豁免。
- `--self-test` 增加 R4 红/绿 fixture。
- `node scripts/check-constraint-drift.js`：0 new drift、0 warning。
- API TypeScript：0 errors。
- API Jest：60 suites、512 tests 全绿（新增 3 文件、6 用例）。

## 部署验证

- main 合并：`d5b8224f`；tag：`v3-g201b-r4-hard-gate`。
- push CI：Build `32474052338`、Web Tests `32474052285`、Security `32474052533`、CI/CD build `32474052272` 全绿。
- 显式生产部署：run `32474508700`，`mode=api`、`approve_production=true`，API 构建、回归、SSH 部署全部成功；本阶段无 schema 迁移或生产数据写入。
