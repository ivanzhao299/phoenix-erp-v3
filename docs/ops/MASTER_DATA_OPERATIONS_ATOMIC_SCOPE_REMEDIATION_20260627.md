# Master Data Operations Atomic Scope Remediation 2026-06-27

## 背景

本轮继续清理“非模块拆原子权限 + 角色权限矩阵全局对齐”遗留项，重点处理主数据运营聚合接口可能按粗粒度入口权限返回跨类型摘要的问题。

## 问题

`/api/master-data/operations/centers`、`/api/master-data/operations/search`、`/api/master-data/operations/todo` 原先只要求 `MENU_MD_CENTER` 或 `MENU_MASTER_DATA` 才能访问，但返回内容没有继续按用户拥有的 `MENU_MD_*` 原子权限过滤。

风险表现：

- 用户拥有主数据中心入口权限时，可能看到客户、供应商、SKU 等无关类型摘要。
- 运营待办、缺联系人、重复编码、搜索结果可能透出用户未授权类型。
- 前端虽可隐藏菜单，但后端聚合接口仍应 fail-closed，不能依赖前端隐藏。

## 修复

1. `MasterDataCenterController` 新增 `allowedOperationTypes(req)`。
2. 按用户权限映射允许类型：
   - `MENU_MD_CUSTOMER` -> `customer`
   - `MENU_MD_SUPPLIER` -> `supplier`
   - `MENU_MD_PROJECT` -> `project`
   - `MENU_MD_PRODUCT` / `MENU_MD_SKU` / `MENU_MD_WAREHOUSE` 等对应各自类型
   - `MENU_SETTINGS_DATA` -> `dict`
   - `MENU_SHAREHOLDER_VIEW` -> `shareholder`
3. `ROLE_ADMIN` 或 `MENU_MASTER_DATA:V` 保留超级兜底，可查看全部类型。
4. `MasterDataOperationsService` 对 centers/search/todo 统一按 `allowedTypes` 过滤。
5. `scripts/ci/check-menu-permission-atomicity.mjs` 增加门禁，防止 operations 聚合接口再次不传 `allowedOperationTypes(req)`。

## 影响范围

- 后端：
  - `apps/api/src/modules/master-data/master-data-center.controller.ts`
  - `apps/api/src/modules/master-data/operations.service.ts`
- CI：
  - `scripts/ci/check-menu-permission-atomicity.mjs`

## 安全结果

- 没有修改业务表结构。
- 没有新增 migration。
- 没有写 DB。
- 没有改变生产部署配置。
- 主数据运营聚合数据改为后端原子权限裁剪。

## 验证

本轮需通过：

- API typecheck
- Web typecheck
- menu permission atomicity check
- nullable unique check
- W5 closeout gate
- `git diff --check`

## 结论

GO WITH CONDITIONS。

主数据运营聚合接口已按原子权限收紧；后续继续推进审批、采购、财务、系统设置剩余跨域入口和按钮级权限对齐。
