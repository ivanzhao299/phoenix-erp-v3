# WMS 出入库与生产领用 UAT 准备报告

## 范围

本轮覆盖采购/生产/调拨接收/退货/盘盈入库，以及销售、生产、饲料、兽药、后勤、配件、办公、维修、退供和报废出库。

## 修改文件

- `apps/api/src/modules/wms/wms.service.ts`
- `apps/api/src/modules/wms/wms-inbound-policy.ts`
- `apps/api/src/modules/wms/wms-outbound-policy.ts`
- `apps/api/src/modules/wms/outbound.controller.ts`
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`
- `apps/api/src/modules/procurement-v2/services/receipts.service.ts`
- `apps/api/src/database/migrations/1785200000000-AddWmsIssueOutboundGovernance.ts`
- `apps/web/src/app/(admin)/warehouse/**`
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx`
- `apps/web/src/components/ui/CrudForm.tsx`
- `apps/web/src/lib/warehouse-*.ts`

## 验收矩阵

| 场景 | 期望 | 自动验证 |
| --- | --- | --- |
| 采购收货物料入库 | 标准物料身份、单位、正数库存与流水 | PASS |
| 采购收货 SKU 入库 | 标准 SKU 身份、正数库存与流水 | PASS |
| 生产完工选择物料 | 后端拒绝 | PASS |
| 生产完工选择 SKU | 允许确认 | PASS |
| 饲料发放选择非饲料 | 后端拒绝 | PASS |
| 兽药发放选择 SKU | 后端拒绝 | PASS |
| 销售出库选择物料 | 后端拒绝 | PASS |
| 库间调拨走独立出库单 | 后端拒绝并引导原子调拨 | PASS |
| 指定批次出库 | 校验仓库和品目后扣减 | PASS |
| 未指定批次出库 | AVAILABLE 批次 FIFO 扣减 | PASS |
| 出库库存不足 | 整单回滚 | PASS |
| 不同单位库存汇总 | 分组显示，不跨单位相加 | PASS |
| 领用删除权限 | 使用 `MENU_WMS_ISSUE:D` | PASS |
| 部门选择数据域 | 使用 `MENU_WMS_ISSUE` scope | PASS |

## 自动检查结果

- API TypeScript：PASS。
- Web TypeScript：PASS。
- API production build：PASS。
- Web production build（Webpack）：PASS，230 个路由完成构建，包含 `/warehouse/issues`。
- Web production build（Turbopack）首次受 worktree `node_modules` 外部符号链接限制而失败；切换同版本支持的 Webpack 构建后通过，判定为本地 worktree 工具限制，不是页面编译错误。
- API 定向测试：4 suites / 34 tests PASS。
- Web 定向测试：3 files / 17 tests PASS。
- migration `down()` 静态要求：已实现。
- migration 数据 DML：仅字典/菜单/角色权限治理，带显式治理豁免说明。
- W5 closeout gate：首次因 WMS 代码和迁移触碰冻结边界而要求显式授权；使用 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 复跑 PASS。安全扫描中的 Chanjet 命中来自 `CURRENT_TIMESTAMP` 文本误判，未修改 Chanjet 模块。
- 本机 DB 只读验证：BLOCKED，Postgres.app 未授权当前终端的 trust permission；未绕过、未写库。

## 真实 UAT 路径

1. 在 UAT 数据库执行本轮 TypeORM migration。
2. 录入采购物料入库，确认批次、单位和 `PURCHASE_INBOUND` 流水。
3. 录入生产 SKU 入库；尝试生产物料入库并确认被拒绝。
4. 分别执行饲料、兽药、包材/生产、后勤、配件、办公和维修领用。
5. 核验指定批次与 FIFO 两种出库方式。
6. 进入库存查询，确认不同单位分别汇总。
7. 执行库间调拨，确认源仓减少、目标仓增加和两条流水在同一事务完成。
8. 使用仓储操作员、仓储经理、场长三个角色复核按钮与后端权限。

## 安全边界

- 未执行 migration。
- 未写数据库。
- 未部署。
- 未 push。
- 未修改生产配置。

## 结论

**GO WITH CONDITIONS**

功能代码已满足 UAT 准入；迁移应用、历史品目映射和真实角色/仓库数据域验证完成后，才能写生产 GO。
