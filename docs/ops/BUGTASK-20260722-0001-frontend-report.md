# BUGTASK-20260722-0001 前端修复报告

## 结论

**PASS WITH CONDITIONS**

BUG-20260722-0001 的前端遗漏已在本地修正：`/sales2/pricing` 的“价格册”表格现在将价格册主键 ID 作为最前一列展示。该结论仅覆盖本地代码与自动化验证；在 CI/CD、生产环境桌面与移动端 smoke、业务方验收完成前，不宣称问题已最终解决。

## 来源与根因

- Source bug：`BUG-20260722-0001`
- Source repair task：`BUGTASK-20260722-0001`
- 验收要求：价格册页面最前边增加“价格册 ID”列并展示 ID。
- 根因：价格册列表数据已经包含 `row.id`，页面也已用它执行编辑、删除、状态动作和 React 行 key，但表头和单元格仅展示业务“编号” `price_book_no`，没有展示主键 `id`。这是前端列配置遗漏，不需要 API、数据库、schema、entity 或 migration 改动。

任务上下文中的三个 400 请求均为“价格册无有效明细”业务校验响应，与 ID 列缺失无因果关系，本任务未改变对应动作或错误展示。

## 改动文件

- `apps/web/src/app/(admin)/sales2/pricing/page.tsx`
  - 在价格册表格最前增加“价格册 ID”表头和 `row.id` 单元格。
  - 加载态、空态 `colSpan` 从 9 调整为 10。
  - 表格容器改为窄屏可横向滚动，避免新增列在移动端被裁切。
- `apps/web/src/__tests__/sales-pricing-book-id.test.ts`
  - 覆盖 ID 列顺序、ID 值渲染、加载/空态列数和窄屏滚动保护。

## 保留行为核查

- RBAC：新建、编辑、审批、删除等按钮仍由既有 `MENU_SALES2_PRICE` 权限控制；本次未改变权限判断。
- DataScope：列表仍使用原 `/api/v2/sales/pricing/books` 请求；未改变请求参数或数据范围。
- 加载态：保留“加载中…”并与 10 列对齐。
- 空态：保留“暂无价格册”并与 10 列对齐。
- 错误态：保留原错误横幅和关闭能力。
- 桌面：任务提供的 2000×1081 页面快照确认原表格结构；新增首列后其余列顺序和操作区保持不变。
- 移动：表格容器使用 `overflowX: auto`，窄屏通过横向滚动访问全部列，不隐藏 ID、状态或操作列。

## 验证结果

在 `apps/web` 执行：

```text
./node_modules/.bin/vitest run \
  src/__tests__/sales-pricing-book-id.test.ts \
  src/__tests__/sales-pricing-lifecycle-actions.test.ts
结果：2 files passed，6 tests passed

./node_modules/.bin/tsc --noEmit
结果：PASS，0 errors
```

本地浏览器启动尝试：

```text
./node_modules/.bin/next dev
结果：HOLD（listen EPERM: operation not permitted 0.0.0.0:3000）
```

该 `EPERM` 是当前沙箱禁止监听端口造成的环境限制。因此本轮没有将代码级响应式检查表述为真实设备 smoke。

## 放行条件

1. CI 完成 Web typecheck 与相关测试。
2. 变更进入测试/生产环境后，以具备 `MENU_SALES2_PRICE:V` 的账号检查桌面和移动视口：首列标题为“价格册 ID”，值与新建价格明细所需 ID 一致，横向滚动可访问全表。
3. 分别检查无数据、加载中、接口失败以及无创建/编辑/审批/删除权限账号，确认原有状态与按钮可见性不回归。
4. 业务方确认 ID 可用于新建价格明细后再关闭 BUG。

未执行 merge、push、deploy、migration 或数据库写入。
