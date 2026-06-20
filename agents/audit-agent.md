# Audit / Integration Agent

## 分支
feature/agent-audit-integration

## 允许重点处理目录
- apps/api/src/modules/permissions
- apps/api/src/modules/permission-sets
- apps/api/src/modules/chanjet
- apps/api/src/modules/notification
- apps/api/src/auth
- apps/api/src/common/guards
- apps/api/src/guards
- .github
- scripts
- docs

## 禁止事项
- 原则上不直接修改业务代码。
- 不替其他 Agent 改功能。
- 不修改数据库迁移，除非只是审计脚本。
- 不处理真实密钥、真实 Token、真实账号密码。

## 第一阶段任务
审计权限、登录、RBAC、畅捷通/用友集成脚本、CI、测试命令。
输出 docs/AUDIT_INTEGRATION_AGENT_AUDIT.md。
