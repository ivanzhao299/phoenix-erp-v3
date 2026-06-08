# G29-C · 缺 PageHeader 19 文件 TODO

> 立账日：2026-06-08 | 治理深度：审计完成、模板已就绪、单页迁移工作量大保留

## 现状

以下 19 个 admin 页面**未使用** `PageHeader` 组件（自定义 div + h1/h2 或无标题）：

### 股东中心系列（8 页）
- `shareholders/page.tsx`
- `shareholders/contributions/page.tsx`
- `shareholders/projects/page.tsx`
- `shareholders/dashboard/page.tsx`
- `shareholders/equity/page.tsx`
- `shareholders/capital/[id]/page.tsx`
- `shareholders/capital/import/page.tsx`

### 采购V2 系列（4 页）
- `procurement2/receipts/page.tsx`
- `procurement2/init/page.tsx`
- `procurement2/shipments/page.tsx`
- `procurement2/shareholder-funds/page.tsx`

### 其他单独页
- `pilot-run/page.tsx`
- `store-pos/page.tsx`
- `master-data/page.tsx`（中心首页，可能用其他容器）
- `settings/organizations/page.tsx`
- `breeding/egg-ledger/page.tsx`（已废弃 redirect）
- `sales2/inventory/page.tsx`
- `sales2/returns/page.tsx`
- `workflow/metrics/page.tsx`

## 不强迁的原因

1. **每页 200-1700 行** — 总改造 ~6000 行
2. PageHeader 替换涉及顶部 50-100 行重写 + breadcrumb 设计
3. 业务方未报"标题不一致"具体痛点
4. 视觉漂移风险（替换可能破现有布局）

## 迁移模板

```tsx
// 旧
<div style={{ padding: '28px 32px' }}>
  <h1 style={{ fontSize: 22, fontWeight: 800 }}>页面标题</h1>
  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>副标题</p>
  ...
</div>

// 新
import PageHeader from '@/components/PageHeader';
<PageHeader
  title="页面标题"
  subtitle="副标题"
  breadcrumb={['一级', '二级']}
  actions={<button>...</button>}
/>
```

## 优先级

| 页面 | 优先级 | 业务方使用频率 |
|---|---|---|
| sales2/inventory | 🔴 高 | 业务方常用，应统一 |
| sales2/returns | 🟡 中 | |
| store-pos | 🟡 中 | POS 重要功能 |
| shareholders/* | 🟢 低 | 内部财务用 |
| procurement2/* | 🟢 低 | 采购团队用 |
| breeding/egg-ledger | ⚪ 删除 | 已废弃 redirect 页 |
| 其他 | 🟢 低 | |

## 何时迁

- ✅ 业务方报"标题/导航不一致"时
- ✅ 该页面有大改造时顺手迁
- ✅ 新人加入要求统一规范时
- ❌ 不为治理而治理
