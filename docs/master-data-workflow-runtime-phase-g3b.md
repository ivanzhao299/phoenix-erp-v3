# 主数据审批运行体系 G3-B

> **日期**：2026-06-03 · **依据**：G3-A Runtime + 现有 ApprovalEngine（Workflow 2.0）
> **本期交付**：5 类主数据新增接入 Workflow 2.0 审批引擎；提交审批 → 审批通过 → 自动生效（ACTIVE）。

---

## 0. 结论速览

| 维度 | G3-B 结果 |
|------|-----------|
| BizType 注册 | ✅ 5 类（MD_CUSTOMER/SUPPLIER/PROJECT/CASH_ACCOUNT/BANK_ACCOUNT_CREATE）|
| 审批规则 seed | ✅ 5 条规则 + 步骤（ROLE_MASTER_DATA_APPROVER）|
| submit 接入 Workflow | ✅ startApproval（带优雅降级）|
| 状态机联动 | ✅ submit→PENDING_APPROVAL，通过→ACTIVE，拒绝→REJECTED |
| 审计联动 | ✅ onApproved/onRejected 写 mst_audit_trail |
| 主数据待审批页 | ✅ /master-data/pending |

---

## 1. Workflow 接入对象（5 类）

| 主数据 | bizType | 表 | 审批通过终态 | 拒绝终态 |
|--------|---------|----|------------|---------|
| 客户 | MD_CUSTOMER_CREATE | sal_customers | ACTIVE | REJECTED |
| 供应商 | MD_SUPPLIER_CREATE | prc2_suppliers | ACTIVE | REJECTED |
| 项目公司 | MD_PROJECT_CREATE | shr_projects | ACTIVE | REJECTED |
| 资金账户 | MD_CASH_ACCOUNT_CREATE | fin_cash_accounts | ACTIVE | REJECTED |
| 银行账户 | MD_BANK_ACCOUNT_CREATE | mst_bank_accounts | ACTIVE | REJECTED |

## 2. BizType 清单（已注册到 WorkflowBizRegistry）

`WorkflowBizRegistryService.onModuleInit()` 新增注册 5 个 bizType，每个含：
- `moduleCode` / `tableName`（防注入白名单）
- `approvedStatus='ACTIVE'` / `rejectedStatus='REJECTED'`
- `onApproved` / `onRejected` → 写 mst_audit_trail（审计联动）

## 3. 状态机联动（完整闭环）

```
主数据 Runtime 面板：新增 → 保存草稿（DRAFT）
        │ 点「提交审批」（transition submit）
        ▼
MasterDataRuntimeService.transition('submit')
        │ → ApprovalEngine.startApproval({ bizType, bizId:row.id, bizNo:code, amount:0, companyCode })
        ▼
ApprovalEngine：查规则 → 建审批实例 → 分派审批人 → updateBizStatus(PENDING_APPROVAL)
        │
        ▼ （审批人在「审批中心」/workflow/tasks/todo 审批）
   ┌────通过────┐                    ┌────拒绝────┐
   ▼            │                    ▼            │
updateBizStatus  onApproved          updateBizStatus  onRejected
(status=ACTIVE)  (写 mst_audit_trail) (status=REJECTED)(写 mst_audit_trail)
   │
   ▼
主数据生效 → 可被业务单据引用（listActive 返回）
```

**优雅降级**：若审批规则未配置（startApproval 抛错），自动降级为直接置 PENDING_APPROVAL + 审计标注「降级·无审批规则」，由主数据审批页人工处理，**不阻断提交**（防止审批未配置时业务卡死）。

## 4. 审批角色

- 审批规则步骤审批人：`ROLE_MASTER_DATA_APPROVER`（G1 已建）
- 迁移授予 admin 该角色作为初始兜底审批人
- **生产配置**：将 ROLE_MASTER_DATA_APPROVER 授予真实审批人（财务总监/CEO 等），并可在「审批规则」页配置多级链（如供应商：采购主管→财务总监；银行账户：财务总监→CEO；项目：CEO）

## 5. 审批页面

- **主数据待审批**：`/master-data/pending` — 汇总客户/供应商/项目/资金账户的 PENDING_APPROVAL 记录，按类型分组，含「前往审批中心」入口
- **实际审批**：复用现有 `/workflow/tasks/todo` 审批中心待办（Workflow 2.0），审批人逐级审批
- **审批记录**：审批历史经 wf_approval_instance_steps + mst_audit_trail 双重记录（审批人/意见/时间）

## 6. 审计日志联动

| 节点 | 审计记录 |
|------|---------|
| 提交审批 | mst_audit_trail action=UPDATE（DRAFT→PENDING_APPROVAL）|
| 审批通过 | onApproved → mst_audit_trail action=APPROVE_ACTIVE（via WORKFLOW）|
| 审批拒绝 | onRejected → mst_audit_trail action=REJECT（via WORKFLOW）|

## 7. 治理强化

- 主数据 Runtime 面板**移除直接「审批通过」按钮**（PENDING_APPROVAL 项不在面板直接审批）→ 审批必须经 Workflow，避免绕过治理
- 面板保留：提交审批 / 冻结 / 归档 / 恢复（非审批的直接管理操作）

---

## 验证结果

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等（5 审批规则 + 步骤 + 角色授予 + 菜单）|
| bizType 注册 | ✅ 5 个 MD_* 已注册 |

---

## 必须回答

1. **哪些主数据接入 Workflow**：客户、供应商、项目公司、资金账户、银行账户（5 类）。

2. **哪些 BizType 已注册**：MD_CUSTOMER_CREATE、MD_SUPPLIER_CREATE、MD_PROJECT_CREATE、MD_CASH_ACCOUNT_CREATE、MD_BANK_ACCOUNT_CREATE（5 个，已注册 WorkflowBizRegistry + 审批规则 seed）。

3. **审批通过后如何激活**：ApprovalEngine 审批全部步骤通过 → updateBizStatus 自动置 status=ACTIVE + onApproved 写审计 → 主数据生效，可被业务引用（listActive 返回）。

4. **审批拒绝后如何处理**：status=REJECTED + onRejected 写审计；可在主数据面板修改后重新「提交审批」（REJECTED→submit→PENDING_APPROVAL）。

5. **审计日志是否联动**：✅ 提交/通过/拒绝均写 mst_audit_trail（onApproved/onRejected via WORKFLOW），审批人/时间另存 wf_approval_instance_steps。

6. **是否允许进入 G3-C**：🟢 **允许**。主数据审批运行体系闭环（注册+规则+startApproval+状态联动+审计+审批页）。G3-C 进入现金账户三层模型 UI（账户主体→银行账户→ERP资金账户级联选择）。

---

## 附录 · 变更文件

- `apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts`（注册 5 个 MD bizType + 审计钩子）
- `apps/api/src/modules/master-data/master-data-runtime.service.ts`（submit 接入 startApproval + 降级）
- `apps/api/src/modules/master-data/master-data-center.module.ts`（导入 ApprovalEngineModule）
- `apps/api/migrations/20260603_g3b_master_data_approval_rules.sql`（5 审批规则 + 角色 + 菜单）
- `apps/web/src/app/(admin)/master-data/pending/page.tsx`（主数据待审批页）
- `apps/web/src/components/master-data/MasterDataRuntimePanel.tsx`（移除直接审批，治理强化）
- `apps/web/src/components/layout/Sidebar.tsx`（待审批入口）
- `docs/master-data-workflow-runtime-phase-g3b.md`（本报告）
