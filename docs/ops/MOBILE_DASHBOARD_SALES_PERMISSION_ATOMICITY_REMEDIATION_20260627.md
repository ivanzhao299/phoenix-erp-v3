# Mobile Dashboard Sales Permission Atomicity Remediation 2026-06-27

## 背景

继续执行角色权限、左侧功能树、父目录和子目录的全局收紧。本轮处理移动端每日看板中仍依赖销售父权限 `MENU_SALES2` 的残留逻辑。

## 问题

`apps/web/src/app/(mobile)/mobile/dashboard/page.tsx` 的销售 KPI 加载条件曾包含：

```ts
hasPermission('MENU_SALES2', 'V')
```

这会导致移动端销售相关入口仍可能由粗粒度父权限触发，不符合“无权限不显示、按原子菜单码展示”的目标。

## 修复

1. 新增移动端销售看板原子权限集合：
   - `MENU_SALES2_DASHBOARD`
   - `MENU_SALES2_ORDER`
   - `MENU_SALES2_CUSTOMER`
   - `MENU_SALES2_PRICE`
   - `MENU_SALES2_DELIVERY`
   - `MENU_SALES2_RETURN`
   - `MENU_SALES2_CHANNEL`
   - `MENU_SALES2_REPORT`
   - `MENU_SALES2_INVENTORY`
2. `showSales` 改为任一销售原子权限命中才加载移动端销售 KPI。
3. `scripts/ci/check-menu-permission-atomicity.mjs` 增加门禁，禁止移动端 dashboard 回退到 `MENU_SALES2` 父码。

## 结果

- 移动端销售可见性不再依赖 `MENU_SALES2` 粗粒度父权限。
- 仍保留按用户真实销售子权限展示销售数据的能力。
- 不修改 DB，不新增 migration，不改后端业务逻辑。

## 验证

本轮需通过：

- Web typecheck
- API typecheck
- menu permission atomicity check
- nullable unique check
- W5 closeout gate
- `git diff --check`

## 结论

GO WITH CONDITIONS。

移动端销售入口已对齐原子权限，后续继续处理 lookup / 采购 / 财务 / 审批的剩余粗粒度残留。
