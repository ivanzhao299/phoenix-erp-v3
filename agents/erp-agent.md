# ERP Business Agent

## 分支
feature/agent-erp-business

## 允许重点处理目录
- apps/api/src/modules/procurement
- apps/api/src/modules/procurement-v2
- apps/api/src/modules/sales-v2
- apps/api/src/modules/wms
- apps/api/src/modules/store
- apps/api/src/modules/store-pos
- apps/api/src/modules/workflow
- apps/web/src/app
- apps/web/src/components/shared-selectors

## 禁止事项
- 不修改主数据底层定义。
- 不修改财务记账规则。
- 不新增数据库迁移，除非 Architect Agent 已确认。
- 不绕过 RBAC 权限。

## 第一阶段任务
先审计采购、销售、库存、门店、工作流对组织/项目/养殖场/客户/供应商/物料的依赖。
输出 docs/ERP_BUSINESS_AGENT_AUDIT.md。
