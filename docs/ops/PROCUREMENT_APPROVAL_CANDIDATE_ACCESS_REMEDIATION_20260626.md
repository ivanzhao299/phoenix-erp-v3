# Procurement Approval Candidate Access Remediation - 2026-06-26

## 背景

采购高频流程要求：提交审批时，用户应能明确看到下一步提交给谁，而不是“直接转下一步，不知道提交给谁”。

## 发现

1. PC 端采购申请、采购订单、采购付款已经具备“选择下一审批人”弹窗。
2. 移动端采购申请候选人查询错误使用 `MENU_PRC2_ORDER`，会导致采购申请候选人不准确。
3. 后端候选人接口原本只允许 `MENU_WORKFLOW_TODO` 或 `MENU_WORKFLOW` 权限访问；普通采购发起人可能没有审批中心待办菜单，因此即使拥有采购业务权限，也无法加载提交候选人。

## 修复内容

修改：

- `apps/api/src/modules/approval-engine/approval-engine.controller.ts`
- `apps/api/src/modules/approval-engine/approval-engine.service.ts`
- `apps/web/src/app/(mobile)/mobile/prc-request/page.tsx`

修复：

1. 移动端采购申请提交候选人从 `MENU_PRC2_ORDER` 改为 `MENU_PRC2_REQUEST`。
2. `GET /api/approval/eligible-approvers` 入口允许采购/财务等业务发起菜单访问。
3. 服务层新增二次校验：调用者必须拥有所请求 `menuCode` 的任一权限位，否则拒绝查询候选人。
4. 候选人本身仍由 `AssignmentResolverService` 按 `menuCode + requiredPerm + DataScope` 过滤，并排除发起人，保持自审分离。

## 安全边界

- 未绕过 RBAC。
- 未绕过 DataScope。
- 未放开任意候选人枚举。
- 未修改数据库。
- 未执行 migration。
- 未部署生产命令。

## 验收点

- 采购申请提交候选人按 `MENU_PRC2_REQUEST:E` 解析。
- 采购订单提交候选人按 `MENU_PRC2_ORDER:E` 解析。
- 采购付款提交候选人按 `MENU_PRC2_PAYMENT:E` 解析。
- 普通业务发起人不需要拥有审批中心菜单也能查询自己业务的合格审批候选人。
- 若用户无目标业务菜单权限，后端拒绝候选人查询。

## 结论

GO WITH CONDITIONS。

该修复补强采购提交审批的可见性和确定性。后续仍建议结合真实用户角色做一次候选人名单生产 smoke，验证刘汉涛、王乐金等试点用户的数据域和审批角色匹配。
