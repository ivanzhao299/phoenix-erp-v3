# BUGTASK-20260723-0007 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS — GO（进入 CI/CD 与受控验证）**

本地后端修复和聚焦回归验证已通过。此结论不代表生产问题已解决；仍须通过
CI/CD、生产环境 smoke test 和业务验收后才能关闭 BUG-20260723-0007。

## 来源问题

- Bug：`BUG-20260723-0007`
- Repair task：`BUGTASK-20260723-0007`
- 失败接口：`POST /api/v2/sales/pricing/books/365/submit`
- 现场响应：HTTP 400，`当前业务未配置审批规则，请先在审批规则中配置后再提交。`
- 验收要求：价格册提交审批沿用采购申请的开放式选人机制，由发起人选择下一审批人。

## 根因

审批引擎已经支持 `pickedApproverId`：传入后会创建不依赖预配置规则的单步动态审批，
并在后端校验所选审批人的业务权限、DataScope 以及制单/审核分离。

采购申请提交 DTO 接收 `approverUserId`，并将它映射为 `pickedApproverId`。价格册提交链路
缺少相同映射：

1. `SubmitPriceBookDto` 不接收 `approverUserId`；
2. `PriceBooksService.submitBook` 不向审批引擎传递所选审批人；
3. 请求因此退回审批规则匹配，在没有 `PRICE_BOOK_APPROVAL` 固化规则时返回 400。

## 修复

- 为价格册提交 DTO 增加可选字符串字段 `approverUserId`。
- 提交价格册时显式传入 `moduleCode: MENU_SALES2_PRICE`。
- 将 `approverUserId` 映射到审批引擎的 `pickedApproverId`。
- 未修改审批引擎的资格校验、RBAC、DataScope、审计逻辑或附件 ACL。
- 未修改数据库、迁移、schema、entity、表或字段。

## 改动文件

- `apps/api/src/modules/sales-v2/dto/price-book.dto.ts`
- `apps/api/src/modules/sales-v2/services/price-books.service.ts`
- `apps/api/src/modules/sales-v2/services/price-books.service.spec.ts`
- `docs/ops/BUGTASK-20260723-0007-a3-backend-report.md`

## 回归覆盖

新增服务测试验证：

- 价格册提交接受指定的下一审批人；
- 调用审批引擎时业务类型、菜单代码、业务 ID 和 `pickedApproverId` 正确；
- 审批实例创建后价格册进入 `PENDING_APPROVAL` 并记录实例 ID。

## 验证结果

在 `apps/api` 执行：

```bash
./node_modules/.bin/jest src/modules/sales-v2/services/price-books.service.spec.ts --runInBand
```

结果：`1 passed`，`9 passed`，0 failed。

```bash
./node_modules/.bin/tsc --noEmit
```

结果：退出码 0，0 errors。

## 条件与后续门禁

- 必须由调用端提交 `approverUserId`；本任务按合同禁止修改 `apps/web/**`。
- CI/CD 尚未执行。
- 未对生产接口执行 smoke test，未写数据库，也未部署。
- 业务方仍需验证候选审批人选择、提交提示、审批待办及通过/拒绝闭环。

