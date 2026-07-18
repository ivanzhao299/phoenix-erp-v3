# BUG-20260716-0002 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS（技术 GO，发布与业务关闭仍 HOLD）**

当前分支已经包含药品“今日入库”保存链路的后端兼容修复及聚焦回归测试。本次任务没有重复修改业务代码；只读诊断和本地验证均通过。该结论仅表示代码具备进入 CI/CD 与生产验证 Gate 的条件，不表示生产问题已经解决。

## 来源

- Bug：`BUG-20260716-0002`
- Repair task：`BUGTASK-20260716-0002`
- 现象：生产管理 → 养殖场总览 → 药品库存，“今日入库”点击保存返回 HTTP 500
- 分类证据：任务合同将失败归类为 `PG_SQL`，置信度 `0.92`

## 复现与根因

后端保存入口为 `POST /api/farm/medicine/inbound`，调用 `FarmMedicineService.inbound()`。入库操作在同一事务内先 upsert `inv_batches`，再写入 `inv_ledger`。

历史实现固定向 `inv_ledger` 写入 `log_date`、`warehouse_code`、`company_code` 等列；部署环境若缺少其中任一可选列，PostgreSQL 会抛出 `column does not exist`，导致整个事务回滚并由 API 返回 HTTP 500。这与任务提供的 `PG_SQL` 分类相符。

当前分支中的既有修复会先只读查询 `information_schema.columns`，然后仅写入目标环境实际存在的可选列；`batch_no`、`change_type`、`qty_change` 仍作为台账必要字段写入。该处理不更改 schema，不执行数据库写入，不绕过 RBAC 或 DataScope。

## 变更文件

本任务新增：

- `docs/ops/BUG-20260716-0002-a3-backend-report.md`

本任务未新增后端代码 diff。已有、直接覆盖本问题的后端文件为：

- `apps/api/src/modules/farm/farm-medicine.service.ts`
- `apps/api/src/modules/farm/farm-medicine.service.spec.ts`

其中回归用例 `inbound skips absent optional inv_ledger columns so stock upsert is not rolled back by schema drift` 可复现缺失可选列的部署形态，并确认保存链路不会再因这些列缺失而回滚。

## 验证结果

在 `apps/api` 执行：

```bash
./node_modules/.bin/jest src/modules/farm/farm-medicine.service.spec.ts --runInBand
```

结果：`1` 个 suite 通过，`10/10` 个测试通过。

```bash
./node_modules/.bin/tsc --noEmit
```

结果：退出码 `0`，无 TypeScript 错误。

静态守卫确认：

- Controller 仍使用 `MenuGuard`、`DataScopeGuard`；写接口仍要求 `MENU_FARM_VET:E`。
- Service 仍调用 `assertWritableWarehouse('LPH_MS_MEDICINE', '药品库存')`。
- 未修改附件 ACL、实体、表、列、迁移或 schema。
- 未写数据库、未运行迁移、未部署、未 push。

## 条件与后续 Gate

发布前仍必须完成：

1. CI 全量检查；
2. 经独立发布审批部署；
3. 在生产以具备 `MENU_FARM_VET:E` 且 DataScope 覆盖药品仓的账号执行“今日入库”冒烟；
4. 确认接口非 5xx、库存数量正确增加、台账正确生成；
5. 由业务方完成验收后再关闭 Bug。

在上述步骤全部完成前，不应宣称 `BUG-20260716-0002` 已解决。
