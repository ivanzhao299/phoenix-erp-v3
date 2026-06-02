# Phoenix ERP V3 — Page Template 使用指南（UI-2.3）

> 全站页面模板体系。所有页面迁移/新建必须从模板起步,**禁止自建页面骨架**。
> 模板位于 `@/components/design-system`(templates/),组合 design-system 基础组件,暗色自动适配。

---

## 1. 页面分类 → 模板

| 页面类型 | 模板 | 适用页面 |
|---------|------|---------|
| 驾驶舱 | `DashboardTemplate` | /dashboard /executive /finance2 /sales2 /shareholders/dashboard /analytics |
| 主数据 | `MasterDataTemplate` | 客户/供应商/门店/司机/产品/SKU/股东档案/组织架构 |
| 业务单据 | `DocumentTemplate` | 销售订单/采购订单/费用单/报销单/资本流/付款单/收款单 |
| 台账 | `LedgerTemplate` | 资金流水/库存流水/资本流台账/应收/应付/出入库 |
| 审批 | `ApprovalTemplate` | 工作流待办/审批实例/审批规则 |
| 配置 | `ConfigTemplate` | 系统设置/角色权限/用户管理/字典/审批规则/菜单权限 |
| 详情页 | `DetailTemplate` | 订单/客户/供应商/资本流/审批 详情 |
| 移动端 | `MobileTemplate` | mobile/*（MobileKit） |
| 作业台 | `WorkbenchTemplate` | store-pos/terminal/packaging/breeding device-ops（WorkbenchKit） |

## 2. 每类模板结构

- **DashboardTemplate**:PageHeaderV2 + KPI 区 + 图表区 + 预警区 + 快捷入口 + 明细摘要(children 槽)
- **MasterDataTemplate**:PageHeaderV2 + FilterBar + ActionBar + DataTableV3 + DetailDrawer(DrawerV2 + FormField)
- **DocumentTemplate**:状态条 + 基础信息(DetailPanel) + 明细表 + 附件 + 审批流(WorkflowTimeline) + 操作区 + 审计时间线(AuditTimeline)
- **LedgerTemplate**:KPI 汇总 + FilterBar + DataTableV3(导出) + 详情抽屉
- **ApprovalTemplate**:待办列表(DataTableV3) + 审批详情(DrawerV2) + 审批意见 + 通过/驳回(footer) + 审批时间线
- **ConfigTemplate**:配置分组(PageSection) + 表单区(FormField) + 保存按钮 + 变更提示 + 审计记录
- **DetailTemplate**:顶部状态 + 核心字段 + 分区卡片 + 附件 + 审批记录 + 操作记录
- **MobileTemplate**:MobilePageShell + MobileStatCard 网格 + children(MobileKit,大按钮/大字号/卡片/状态/空状态)
- **WorkbenchTemplate**:WorkbenchShell + WorkbenchStatusCard 行 + children + WorkbenchActionButton 行(保留作业台独立体验)

## 3. 示例代码

### 主数据页(MasterDataTemplate)
```tsx
import { MasterDataTemplate, StatusBadge } from '@/components/design-system';

<MasterDataTemplate
  title="客户管理" subtitle="直营/经销商客户主档"
  breadcrumb={[{ label: '主数据' }, { label: '客户' }]}
  filters={<input placeholder="搜索客户…" />}
  actions={<button onClick={openCreate}>+ 新增客户</button>}
  rows={customers}
  columns={[
    { key: 'code', title: '编码' },
    { key: 'name', title: '名称' },
    { key: 'level', title: '等级' },
    { key: 'status', title: '状态', type: 'status' },
    { key: 'op', title: '操作', render: (r) => <a onClick={() => edit(r)}>编辑</a> },
  ]}
  drawer={{ open, title: '编辑客户', onClose, content: <CustomerForm/>, footer: <SaveBtn/> }}
/>
```

### 台账页(LedgerTemplate)
```tsx
import { LedgerTemplate, KpiCardV2 } from '@/components/design-system';

<LedgerTemplate
  title="资本流台账"
  kpi={<><KpiCardV2 title="累计实缴" value="¥1,234万" accentColor="blue"/>{/* ... */}</>}
  filters={<DateRangePicker value={range} onChange={setRange}/>}
  rows={flows}
  columns={[
    { key: 'no', title: '编号' },
    { key: 'amount', title: '金额', type: 'money', sortable: true },
    { key: 'date', title: '日期', type: 'date', sortable: true },
    { key: 'status', title: '状态', type: 'status' },
  ]}
  exportName="capital-ledger"
/>
```

### 详情页(DetailTemplate)
```tsx
import { DetailTemplate } from '@/components/design-system';

<DetailTemplate
  title="资本流详情" status={flow.status}
  coreFields={[
    { label: '编号', value: flow.no },
    { label: '金额', value: `¥${money(flow.amount)}`, emphasis: true },
    { label: '项目', value: projName },
    { label: '股东', value: shName },
  ]}
  attachments={{ urls: flow.attachmentUrls, count: flow.attachmentCount }}
  approval={[{ step: '财务审核', approver: '刘杰', result: 'APPROVED' }]}
  timeline={[{ title: '草稿创建', time: flow.createdAt, color: 'var(--text-disabled)' }]}
/>
```

### 作业台(WorkbenchTemplate)
```tsx
import { WorkbenchTemplate, WorkbenchStatusCard, WorkbenchActionButton } from '@/components/design-system';

<WorkbenchTemplate
  title="POS 收银台"
  statusCards={<><WorkbenchStatusCard label="当班销售" value="¥3,280" /></>}
  actions={<><WorkbenchActionButton label="结账" variant="success" /></>}
>
  {/* 商品/购物车区 */}
</WorkbenchTemplate>
```

## 4. 禁止自建页面骨架

- ❌ 不得再写 `<div style={{padding:24}}><h1 style={{color:'#1F4E79'}}>...` 手写页头
- ❌ 不得再写 `<table><thead>...` 手写表格 / 手工分页
- ❌ 不得再写 `position:fixed;inset:0` 手写 overlay
- ✅ 一律从模板起步,槽位填业务内容;颜色/状态/空态/加载态由模板内组件统一提供

## 5. 迁移优先级

见 `docs/ui-ux-template-pilot-plan.md`(试点)与 `docs/ui-ux-global-migration-map.md`(全站 P0~P3)。
迁移每页过 `dark-mode-checklist.md` + `ui-audit-check.sh`(目标该页 hex=0)。
