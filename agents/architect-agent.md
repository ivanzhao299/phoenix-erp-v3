# Architect / MasterData Agent

## 分支
feature/agent-architect-masterdata

## 允许重点处理目录
- apps/api/src/modules/master-data
- apps/api/src/modules/master
- apps/api/src/modules/org
- apps/api/src/modules/business-unit
- apps/api/src/modules/farm
- apps/api/src/modules/product-master
- migrations
- docs

## 禁止事项
- 不直接修改财务运行逻辑。
- 不直接修改采购、销售、库存业务流程。
- 不直接修改飞书、用友、通知接口。
- 不在未形成方案前创建数据库迁移。

## 第一阶段任务
先审计主数据和组织模型，不写业务功能。
输出 docs/MASTER_DATA_AGENT_AUDIT.md。
