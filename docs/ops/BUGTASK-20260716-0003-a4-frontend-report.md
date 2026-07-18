# BUGTASK-20260716-0003 A4 前端修复报告

## 结论

**PASS WITH CONDITIONS / 发布状态：HOLD**

前端修复及聚焦回归验证通过。未执行部署、生产 smoke 或业务验收，因此不得宣称源缺陷已解决；发布 Gate 在 CI/CD、生产环境草稿创建/列表回查以及业务验收完成前保持 HOLD。

## 来源问题

- Bug：`BUG-20260716-0003`
- Task：`BUGTASK-20260716-0003`
- 现象：销售订单创建草稿成功后，订单列表显示“暂无订单数据”。
- 受影响页面：`/sales2/orders`（提报入口 `/bug-reports` 仅为上下文来源）。

## Dry-run 诊断与根因

前端创建成功分支存在两个可复现的可见性缺陷：

1. 创建后直接调用闭包内的 `loadOrders()`；React 状态更新尚未生效时，刷新仍沿用创建前的页码、状态筛选和关键词，新草稿可能被当前视图排除。
2. 列表只读取 `res.data`，对裸数组、`items/count` 和额外 API envelope 不具备兼容性；合法非单一结构会被渲染成空列表。

本任务未读取或修改后端代码，未写数据库。故无法排除分类器所提示的后端 PG/SQL 问题；需由后端/运行时 Gate 独立验证真实接口与 DataScope。

## 改动文件

- `apps/web/src/app/(admin)/sales2/orders/page.tsx`
  - 创建成功后清空筛选、回到第一页，并显式等待无筛选列表刷新。
  - 使用统一分页响应归一化。
  - 保留原 PBAC/RBAC 按钮条件与错误、加载、空态。
  - 桌面表格保持完整列宽，窄屏允许横向滚动。
- `apps/web/src/app/(admin)/sales2/orders/orders.module.css`
  - 增加桌面表格最小宽度、移动端惯性横向滚动及创建表单单列断点。
- `apps/web/src/lib/sales-orders-response.ts`
  - 增加安全的销售订单分页响应归一化函数。
- `apps/web/src/__tests__/sales-orders-response.test.ts`
  - 覆盖标准分页、API envelope、`items/count`、裸数组和异常 payload。
- `apps/web/src/__tests__/sales-orders-responsive.test.ts`
  - 覆盖桌面表格可读宽度、移动端滚动与单列表单约束。

## 验证结果

- `git diff --check`：PASS。
- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/sales-orders-response.test.ts src/__tests__/sales-orders-responsive.test.ts`：PASS，2 files / 5 tests。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`：PASS，0 errors。
- 权限静态审计：PASS。新建/提交/取消继续受 `canCreate` 控制，状态迁移/签收继续受 `canTransit` 控制；未扩大权限可见性。
- 状态静态审计：PASS。请求错误、动作错误、LoadingSkeleton、EmptyState 均保留。
- 桌面行为：PASS（代码与聚焦断言）。8 列表格保留 `920px` 最小可读宽度。
- 移动行为：PASS（代码与聚焦断言）。表格横向滚动，创建表单在 `<=640px` 变为单列。
- 浏览器运行态：未完成。本地 `next dev -p 3000` 因沙箱禁止端口绑定返回 `listen EPERM 0.0.0.0:3000`；没有伪造截图或运行态 PASS。

## 条件与后续 Gate

1. CI/CD 完整 Web Gate 通过。
2. 可运行环境分别以桌面与移动 viewport smoke `/sales2/orders`。
3. 使用具备 `MENU_SALES2_ORDER` 创建权限且受 DataScope 限制的账号创建草稿，确认回到第一页后立即可见。
4. 使用无创建权限账号确认“新建订单”及草稿操作仍不可见。
5. 后端/运行时 Gate 确认列表接口无 PG/SQL 错误，且新建草稿在同一用户 DataScope 下可被查询。
6. 业务方完成验收后，方可将 BUG 状态置为 resolved。

本任务未 merge、push、deploy、执行 migration 或写数据库。
