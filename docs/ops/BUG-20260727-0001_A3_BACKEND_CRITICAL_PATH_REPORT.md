# BUG-20260727-0001 A3 后端修复报告

## 任务

- Source bug：`BUG-20260727-0001`
- Source repair task：`BUGTASK-20260727-0001`
- 路由：`/finance2/reimbursements`
- 现象：资金账户余额充足时，报销付款仍提示余额不足。

## 根因

`ReimbursementsService.pay()` 将 `fin_cash_accounts.current_balance`（账户币种余额）
与 `fin_reimbursements.reimb_amount_base`（本位币金额）直接比较。外币报销时两者计量
单位不同，会产生错误的余额判断；随后扣账和资金流水也错误地使用了本位币金额。

任务上下文中的通知未读数和在线人数 500 请求与报销付款接口无调用关系，不是本次
错误提示的根因，也不在本任务的单一报销修复范围内。

## 修改

- `apps/api/src/modules/finance-v2/services/reimbursements.service.ts`
  - 校验付款账户与报销的公司、币种一致；
  - 使用 `reimb_amount_original` 与账户原币余额比较、扣账并写资金流水；
  - 余额不足信息明确显示实际币种，不再硬编码人民币符号。
- `apps/api/src/modules/finance-v2/services/reimbursements.service.spec.ts`
  - 覆盖“外币账户余额充足，不误报余额不足并按原币扣账”；
  - 覆盖币种不一致时返回准确提示且不发生写操作。

未修改 RBAC、DataScope、审计字段或附件 ACL；未修改 schema/entity/migration；未写数据库。

## 验证

- `cd apps/api && ./node_modules/.bin/jest src/modules/finance-v2/services/reimbursements.service.spec.ts --runInBand`
  - PASS：1 suite / 2 tests。
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS：0 errors。
- `git diff --check`
  - PASS。
- 变更范围检查
  - PASS：仅修改 `apps/api/**` 与本任务 `docs/ops/**`；未触碰 forbidden scope。

## 结论

`PASS WITH CONDITIONS`

后端本地修复和聚焦回归已通过。条件：仍需 CI/CD、生产 smoke 与业务验收；在这些
环节完成前，不宣称线上问题已解决。
