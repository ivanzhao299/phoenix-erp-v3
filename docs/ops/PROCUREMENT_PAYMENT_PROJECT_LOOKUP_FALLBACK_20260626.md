# Procurement Payment Project Lookup Fallback - 2026-06-26

## 背景

用户反馈：刘汉涛在 `/procurement2/payments/new` 新建采购付款单时，项目下拉没有可选项目。

## 根因判断

采购付款单前端已经使用统一 `ProjectSelector`，请求 `/api/lookup/projects`，该端点不要求用户拥有项目维护菜单权限，方向正确。

本次发现的生产风险点是：`/api/lookup/projects` 只查询统一项目主表 `biz_projects`。如果历史采购项目仍保存在 `prc2_projects`，或 `biz_projects` 尚未完全迁入，则业务单据会出现“项目无可选项”。

## 修复内容

修改：

- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`

修复逻辑：

1. 优先查询 `biz_projects` 中的 `ACTIVE` 项目。
2. 继续按当前用户公司 DataScope 和传入 `companyCode/company_code` 过滤。
3. 当统一项目主表没有返回项目时，回退查询历史 `prc2_projects`。
4. 回退同样只返回 `ACTIVE` 项目，并继续应用相同公司 DataScope。
5. 返回数据增加 `sourceTable` 便于后续诊断，不影响前端选择器使用。

## 安全边界

- 未修改数据库。
- 未新增 migration。
- 未写入业务数据。
- 未修改前端业务逻辑。
- 未放宽用户公司 DataScope。
- 未要求用户具备项目维护菜单权限。

## 验证

- API typecheck：PASS。
- W5 closeout gate：待本批提交前执行。

## 结论

GO WITH CONDITIONS。

该修复先恢复采购付款高频录入中“项目可选”的生产可用性。后续仍建议执行主数据治理任务：将历史 `prc2_projects` 中仍有效项目迁入 `biz_projects`，使统一项目主表成为唯一读取源。
