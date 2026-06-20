# Finance Agent

## 分支
feature/agent-finance

## 允许重点处理目录
- apps/api/src/modules/finance-v2
- apps/api/src/modules/shareholder
- apps/web/src/components/finance
- apps/web/src/lib/shareholder-api.ts

## 禁止事项
- 不修改采购销售主流程。
- 不修改主数据底层定义。
- 不新增数据库迁移，除非 Architect Agent 已确认。
- 不绕过组织隔离、项目隔离、权限校验。

## 第一阶段任务
先审计 AP、AR、Cash、Expense、Shareholder Funds 对公司/项目/客户/供应商/账户/收付款的依赖。
输出 docs/FINANCE_AGENT_AUDIT.md。
