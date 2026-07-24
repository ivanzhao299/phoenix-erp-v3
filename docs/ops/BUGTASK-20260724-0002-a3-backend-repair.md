# BUGTASK-20260724-0002 A3 后端修复报告

## 结论

**PASS WITH CONDITIONS**

本地后端修复与聚焦回归验证通过。发布决策仍为 **HOLD**：在 CI/CD、生产只读 smoke 和业务验收完成前，不声明源缺陷已解决。

## 来源

- Bug：`BUG-20260724-0002`
- Repair task：`BUGTASK-20260724-0002`
- 页面：`/breeding/daily`
- 验收要求：日报按日期降序展示，最新录入的数据在最上方

## 诊断与根因

页面通过 `GET /api/crud/brd_daily_logs` 读取日报，然后在渲染前对响应数组调用
`.reverse()`。后端 `GenericCrudService.buildFindAllSql()` 原先只生成 `SELECT / WHERE /
LIMIT / OFFSET`，没有 `ORDER BY`。PostgreSQL 对无 `ORDER BY` 的结果不保证行顺序，因此前端
反转的只是一个不稳定结果集，无法保证最新业务日期或同日最新录入位于顶部。

任务附件快照中 `2026-07-24` 位于较旧日期之后，与该调用链一致。

合同记录的 `500/502` 请求均为 `POST /api/bug-intake/reports`（反馈提交接口），不是
`GET /api/crud/brd_daily_logs`，故不将其误归因为本次日报排序缺陷。

## 修复

仅对 `brd_daily_logs` 通用 CRUD 列表增加稳定的分页与源顺序：

```sql
SELECT *
FROM (
  SELECT *
  FROM brd_daily_logs
  ORDER BY log_date DESC, created_at DESC NULLS LAST, id DESC
  LIMIT $limit OFFSET $offset
) daily_logs_page
ORDER BY log_date ASC, created_at ASC NULLS FIRST, id ASC
```

内层先截取真正最新的一页，避免总行数超过默认 `LIMIT 100` 时误取最旧记录。现有页面反转后即得到：

- `log_date` 降序；
- 同一日期按 `created_at` 降序；
- 时间相同或为空时按 `id` 降序稳定兜底。

未修改 RBAC、DataScope、审计、附件 ACL、写入路径、数据库结构或迁移。

## Changed files

- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.spec.ts`
- `docs/ops/BUGTASK-20260724-0002-a3-backend-repair.md`

## Validation

### Focused regression

```bash
cd apps/api
./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts --runInBand
```

结果：`1` suite passed，`12` tests passed。新增用例验证内层按最新记录分页、外层按现有客户端契约稳定返回。

### API typecheck

```bash
cd apps/api
./node_modules/.bin/tsc --noEmit
```

结果：退出码 `0`，无 TypeScript 错误。

### Scope/static verification

- diff 仅包含 `apps/api/**` 与本任务 `docs/ops/**`；
- 无 migration、schema、entity、table 或 column 变更；
- 未执行数据库写入、migration、部署、push 或生产命令；
- `rg` 在当前环境不存在，诊断检索改用 `find` + `grep`。

## Conditions / remaining gates

1. CI 运行完整后端测试与构建；
2. 部署后以具备 `MENU_FARM_DAILY` 权限且受 DataScope 限制的账号执行生产只读 smoke；
3. 提交不同日期及同日多条日报，业务验收确认最新录入显示在顶部；
4. 另行分流调查 `POST /api/bug-intake/reports` 的 `500/502`，该异常不属于本排序修复范围。
