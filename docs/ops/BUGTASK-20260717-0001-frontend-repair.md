# BUGTASK-20260717-0001 前端修复报告

## 结论

**PASS WITH CONDITIONS**

本地前端修复与回归验证通过。该结论不代表线上问题已关闭；仍须经过 CI/CD、生产环境冒烟及业务验收。

## 来源问题

- Bug：`BUG-20260717-0001`
- 任务：`BUGTASK-20260717-0001`
- 路由：`/procurement2/orders`
- 现象：采购订单列表已有记录，但页头显示“共 0 条”。

## 根因与修复

列表页分别使用响应的 `items` 渲染表格、使用 `total` 渲染页头，未校验两者一致性。当兼容接口或响应网关返回非空 `items`、但 `total` 缺失或为 `0` 时，表格正常显示而页头固定显示 0。

新增采购订单分页响应归一化函数。有效服务端总数仍原样保留；仅当总数缺失、非法或小于当前已加载记录数时，回退为当前记录数。兼容直接响应、`data` 包装和 `count` 字段。页面的请求、筛选、RBAC、DataScope、按钮权限和附件行为均未改变。

## 改动文件

- `apps/web/src/app/(admin)/procurement2/orders/page.tsx`
- `apps/web/src/lib/procurement-orders-response.ts`
- `apps/web/src/__tests__/procurement-orders-response.test.ts`
- `docs/ops/BUGTASK-20260717-0001-frontend-repair.md`

## 验证

- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/procurement-orders-response.test.ts src/__tests__/procurement-orders-id-field.test.ts`
  - PASS：2 个测试文件、6 项测试。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS：0 errors。
- 桌面与移动端检查：修复只改变数据归一化，不引入视口分支或布局样式；相同响应在桌面和移动宽度下使用同一 `data.total`。原页面的可换行筛选栏和表格滚动容器保持不变。
- 状态保持：加载态“加载中…”，空态“暂无数据”，失败 toast“加载失败”及失败时既有数据保留逻辑未改。
- 权限保持：`MENU_PRC2_SHIPMENT` 的创建运单可见性判断及所有既有请求头、筛选参数未改。

## 条件与后续门禁

1. CI 必须通过。
2. 发布后使用有采购订单查看权限且具备实际 DataScope 的账号，在桌面和移动视口分别冒烟 `/procurement2/orders`。
3. 验证非空列表页头不再显示 0，并验证空筛选结果仍显示 0。
4. 由业务方确认显示数字符合其对“总记录数”的定义后，方可关闭 Bug。

