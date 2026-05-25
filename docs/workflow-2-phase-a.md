# Workflow 2.0 Phase A — 统一运行时核心

**版本**：v1.0  
**日期**：2026-05-25  
**状态**：已实施完成  
**前置**：RBAC-1 / RBAC-2 / RBAC-2.5 / RBAC-3.1 / RBAC-4（ApprovalEngine）全部完成

---

## 一、背景与目标

Phoenix ERP V3 存在两套并行的审批/工作流体系：

| 系统 | 路由前缀 | 数据库 | 状态 |
|------|----------|--------|------|
| **V1 规则审批** | `/api/v3/approval` | `sys_approval_flows` | 已弃用（不删除，仅加 header） |
| **ApprovalEngine（V2）** | `/api/approval` | `wf_approval_*` 4 张表 | **生产活跃**（2 条 pending 实例） |
| **WorkflowEngine（V3）** | `/api/workflow` | `wf_*` 10 张表 | 已部署，0 运行实例 |

Phase A 目标：**统一运行时核心**——消除重复代码、锁定 DDL、升级条件引擎、清理 Sidebar 僵尸条目，不涉及新业务功能。

---

## 二、已实施变更清单

### 2.1 DDL 治理（Step 3）

**文件**：`migrations/20260525_workflow_schema.sql`

- 将 `WorkflowService.ensureSchema()` 中 2062 行 DDL 提取为独立迁移文件
- `onModuleInit()` 改为仅打 log，不再执行 `CREATE TABLE`
- 保留 `ensureSchema()` 方法体加 `@deprecated` 注释

### 2.2 ConditionEngine 升级（Step 7）

**文件**：`apps/api/src/modules/workflow/condition-engine.service.ts`

新服务替换 `WorkflowService` 内的私有 `evalCondition()` 方法。

| 特性 | 说明 |
|------|------|
| 旧格式兼容 | `{ field, operator, value }` — LeafCondition，无需改动已有 graph_json |
| 新嵌套格式 | `{ logic: 'AND'\|'OR', rules: [...] }` — RuleGroup，支持任意深度嵌套 |
| 运算符 | `==`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in/notIn`, `contains` |
| 安全 | 无 `eval()`，全 switch/case 实现 |

### 2.3 ApprovalEngine BizType 注册表（Step 6）

**文件**：`apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts`

移除 3 个硬编码 Map（`BIZ_TABLE_MAP`、`BIZ_MODULE_MAP`、`APPROVED_STATUS_MAP`），替换为可扩展的注册表服务。

初始注册 4 种 bizType：

| bizType | tableName | approvedStatus | cancelledStatus |
|---------|-----------|----------------|-----------------|
| PR | prc2_purchase_requests | APPROVED | CANCELLED |
| PO | prc2_purchase_orders | APPROVED | CANCELLED |
| PAYMENT | prc2_payments | APPROVED | CANCELLED |
| FUND | prc2_shareholder_funds | CONFIRMED | VOID |

**扩展方式**（无需修改引擎核心）：
```typescript
bizRegistry.register('LEAVE', {
  moduleCode: 'MENU_HR_LEAVE',
  tableName:  'hr_leave_requests',
  approvedStatus:  'APPROVED',
  rejectedStatus:  'REJECTED',
  cancelledStatus: 'CANCELLED',
});
```

### 2.4 统一 Task API（Step 5）

**端点**：`GET /api/workflow/my-tasks`  
**权限**：`MENU_WORKFLOW 'V'`  
**位置**：`WorkflowRuntimeController`

返回格式（统一结构）：
```typescript
interface UnifiedTask {
  taskSource:   'APPROVAL_ENGINE' | 'WORKFLOW_ENGINE';
  taskId:       string;
  instanceId:   string;
  bizType:      string;
  bizId:        string;
  bizNo:        string | null;
  subject:      string | null;
  amount:       number | null;
  currencyCode: string | null;
  companyCode:  string | null;
  companyName:  string | null;
  projectCode:  string | null;
  projectName:  string | null;
  requiredRole: string;
  status:       string;
  createdAt:    string;
}
```

Phase A：仅聚合 ApprovalEngine 数据（`wf_task` = 0 记录）。  
Phase B：追加 WorkflowEngine `wf_task` 查询。

### 2.5 WorkflowEngine 接口安全加固（Step 8）

所有 5 个 WorkflowEngine 控制器从 `AuthGuard('jwt')` 升级为 `MenuGuard` + `@RequireMenu`：

| 控制器 | 路由前缀 | 只读权限 | 写入权限 |
|--------|----------|----------|----------|
| WorkflowRuntimeController | `/api/workflow` | `V` | `C`（start）/ `E`（cancel/urge） |
| WorkflowTaskController | `/api/workflow/tasks` | `V` | `A`（approve/reject）/ `E`（transfer/comment） |
| WorkflowDefinitionController | `/api/workflow/definitions` | `V` | `C`（create/clone）/ `E`（update/publish/disable） |
| WorkflowFormController | `/api/workflow/forms` | `V` | `C`（create）/ `E`（update/publish） |
| WorkflowDatasourceController | `/api/workflow/data-sources` | `V` | `C`（create/sync）/ `E`（update） |

### 2.6 通知 Hook Stub（Step 9）

**文件**：`apps/api/src/modules/workflow/workflow-notification.service.ts`

4 个方法（仅打 log，Phase B 接入站内信/钉钉/邮件）：
- `onTaskCreated(payload)`
- `onTaskCompleted(payload)`
- `onInstanceCompleted(payload)`
- `onInstanceRejected(payload)`

### 2.7 V1 审批弃用（Step 1）

**文件**：`apps/api/src/modules/approval/approval.controller.ts`

两个 V1 端点加响应头：
- `X-Deprecated: true`
- `X-Replaced-By: /api/approval/*`

代码不删除，保留向下兼容。

### 2.8 sys_approval_flows 前端弃用通知（Step 2）

**文件**：`apps/web/src/app/(admin)/settings/approval-flows/page.tsx`

顶部新增橙色公告横幅，包含：
- 停用说明文字
- "前往审批规则"跳转按钮（→ `/settings/approval-rules`）

### 2.9 Sidebar 清洁（Step 10）

**文件**：`apps/web/src/components/layout/Sidebar.tsx`

移除 7 条 WorkflowEngine 僵尸菜单（无实际数据）：
`wf-start`, `wf-todo`, `wf-done`, `wf-inst`, `wf-def`, `wf-form`, `wf-source`

保留 2 条（+settings 1 条）：
- `wf-approval-todos` → `/workflow/todos`
- `wf-approval-history` → `/workflow/history`
- `stg-approval-rules` → `/settings/approval-rules`（在 settings 分组，不变）

### 2.10 模块注册更新

| 模块 | 新增 Provider | 新增 Export |
|------|--------------|-------------|
| `WorkflowModule` | `ConditionEngineService`, `WorkflowNotificationService` | 同左 |
| `ApprovalEngineModule` | `WorkflowBizRegistryService` | `WorkflowBizRegistryService` |

---

## 三、架构图（文字版）

```
前端 /workflow/todos
       │ 调用
       ▼
GET /api/approval/todos          ← ApprovalEngine（生产数据）
GET /api/workflow/my-tasks       ← 统一聚合（Phase A = 同 ApprovalEngine）

ApprovalEngineService
  └── WorkflowBizRegistryService  ← 替换 3 个硬编码 Map
        ├── register('PR', ...)
        ├── register('PO', ...)
        ├── register('PAYMENT', ...)
        └── register('FUND', ...)

WorkflowService
  └── ConditionEngineService      ← 替换私有 evalCondition()
        ├── LeafCondition 兼容
        └── RuleGroup AND/OR 嵌套

WorkflowNotificationService      ← Phase A Stub（仅 log）
```

---

## 四、文件变更汇总

| 类型 | 文件 |
|------|------|
| 新增 | `migrations/20260525_workflow_schema.sql` |
| 新增 | `apps/api/src/modules/workflow/condition-engine.service.ts` |
| 新增 | `apps/api/src/modules/workflow/workflow-notification.service.ts` |
| 新增 | `apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts` |
| 修改 | `apps/api/src/modules/workflow/workflow.service.ts`（移除 ensureSchema DDL + evalCondition） |
| 修改 | `apps/api/src/modules/workflow/workflow.module.ts`（注册新 Provider） |
| 修改 | `apps/api/src/modules/workflow/workflow-runtime.controller.ts`（MenuGuard + my-tasks） |
| 修改 | `apps/api/src/modules/workflow/workflow-task.controller.ts`（MenuGuard） |
| 修改 | `apps/api/src/modules/workflow/workflow-definition.controller.ts`（MenuGuard） |
| 修改 | `apps/api/src/modules/workflow/workflow-form.controller.ts`（MenuGuard） |
| 修改 | `apps/api/src/modules/workflow/workflow-datasource.controller.ts`（MenuGuard） |
| 修改 | `apps/api/src/modules/approval-engine/approval-engine.service.ts`（使用 BizRegistry） |
| 修改 | `apps/api/src/modules/approval-engine/approval-engine.module.ts`（注册 BizRegistry） |
| 修改 | `apps/api/src/modules/approval/approval.controller.ts`（弃用 header） |
| 修改 | `apps/web/src/components/layout/Sidebar.tsx`（移除 7 条僵尸菜单） |
| 修改 | `apps/web/src/app/(admin)/settings/approval-flows/page.tsx`（弃用公告） |
| 新增 | `docs/workflow-2-phase-a.md`（本文档） |

---

## 五、TypeScript 编译验证

```
apps/api  npx tsc --noEmit → 0 errors ✅
apps/web  npx tsc --noEmit → 0 errors ✅
```

---

## 六、Phase B 展望

| 功能 | 描述 |
|------|------|
| 前端 `/workflow/todos` 切换 | 改为调用 `GET /api/workflow/my-tasks` 统一端点 |
| WorkflowEngine task 接入 | `my-tasks` 追加查询 `wf_task` 表（status=TODO） |
| 通知服务实现 | `WorkflowNotificationService` 对接站内信/钉钉 |
| 移动端审批中心 | 基于 `my-tasks` 统一格式构建移动端审批页 |
| 多 bizType 扩展 | HR 请假、合同审批调用 `bizRegistry.register()` 接入 |
