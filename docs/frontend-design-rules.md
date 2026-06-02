# Phoenix ERP — Frontend Design Rules（前端设计规范)

> 生效:Phase UI-2.0 · 目的:**止血** —— 防止继续产生新的 UI 债务。
> 依据:`docs/ui-ux-governance-phase-ui1-audit.md`。检查工具:`scripts/ui-audit-check.sh`。
> 本规范约束**新代码与新页面**;存量页面迁移在 UI-2.9 分批进行。

---

## 单一来源(Single Source of Truth)

| 视觉要素 | 唯一来源 | 用法 |
|---------|---------|------|
| 品牌色 | `var(--color-primary)` / `BRAND.primaryVar` | 禁止字面量 `#1F4E79`/`#1F3864` |
| 文字/背景/边框/阴影/圆角 | `var(--text-*)` `var(--bg-*)` `var(--border)` `var(--shadow-*)` `var(--radius-*)` | `globals.css` 定义,明暗自动切换 |
| 状态色 | `STATUS_CLASS` / `STATUS_LABEL`(design-tokens.ts) | `<StatusBadge status=.../>` 优先 |
| 图表色 | `CHART_PALETTE` / `getSeriesColor(i)` | 禁止图表内写 hex |
| 分级色 | `GRADE_PALETTE` | 替换 `GRADE_COLORS` |
| 风险/告警色 | `SEVERITY_PALETTE` | 替换 `SEVERITY_COLOR` |
| 实体标识色 | `ENTITY_PALETTE` | 客户/供应商/产品等 |
| KPI 网格 | `KPI_GRID`(design-tokens.ts) | 禁止自写 grid 模板 |

---

## 五条禁止事项

### 规则 1 — 禁止硬编码颜色
❌ `#1F4E79` `#27ae60` `#ef4444` `#fff` `#666` `rgba(0,0,0,.4)`
✅ `var(--color-primary)` `var(--status-success)` `TOKENS.css.bgCard` `STATUS_CLASS.SUCCESS` `CHART_PALETTE.sales`

```tsx
// ❌ 错误
<div style={{ background: '#1F4E79', color: '#fff' }}>
// ✅ 正确
<div style={{ background: 'var(--color-primary)', color: 'var(--text-on-dark)' }}>
// ✅ 更佳(Tailwind token 类)
<div className="bg-brand text-text-on-dark">
```

### 规则 2 — 禁止内联视觉样式
**布局级**必要内联样式**允许**(grid 模板、flex、gap、宽高、定位);**视觉级**样式**禁止**写在 `style={{}}` 里。

| 内联属性 | 允许? |
|---------|:----:|
| `display/flex/grid/gridTemplateColumns/gap/width/height/position/inset/zIndex` | ✅ 布局 |
| `background/color/border/boxShadow/borderRadius/fontSize/fontWeight` | ❌ 视觉 → 用 token 类 |

```tsx
// ❌ 视觉样式内联
<div style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)', background: '#fff' }}>
// ✅ 视觉走类,布局可内联
<div className="rounded-card shadow-card bg-bg-card" style={{ display: 'grid', gap: 12 }}>
```

### 规则 3 — 禁止重复定义统一组件
禁止在页面内重新实现:`KpiCard` `StatusBadge` `SummaryBar` `Modal` `Drawer` `DataTable`。
✅ 一律 import:`@/components/ui/KpiCard` `@/components/ui/StatusBadge` `@/components/ui/StatStrip`(替代 SummaryBar) `@/components/ui/RightDrawer` `@/components/ui/ConfirmDialog` `@/components/data-table/DataTable`。

### 规则 4 — 禁止原生弹窗
❌ `window.confirm()` `window.prompt()` `window.alert()` / 裸 `confirm(` `alert(`
✅ 确认 → `<ConfirmDialog>`;输入 → `<RightDrawer>`/Modal 表单;提示 → `toast`(sonner)。

```tsx
// ❌ 错误
if (window.confirm('确认冲销?')) doReverse();
const reason = prompt('冲销原因:');
// ✅ 正确
<ConfirmDialog open={open} message="确认冲销?" onConfirm={doReverse} />
```

### 规则 5 — 禁止页面级状态/分级/风险色映射
❌ 页面内 `const STATUS_COLOR = {...}` `GRADE_COLORS` `SEVERITY_COLOR`
✅ 统一引用 design-tokens.ts:`STATUS_CLASS`(状态)、`GRADE_PALETTE`(分级)、`SEVERITY_PALETTE`(风险)、`CHART_PALETTE`(图表)。

```tsx
// ❌ 错误
const STATUS_COLOR = { CONFIRMED: '#27ae60', DRAFT: '#999' };
<span style={{ color: STATUS_COLOR[s] }}>{s}</span>
// ✅ 正确
<StatusBadge status={s} />               // 优先
<span className={STATUS_CLASS[s]}>{label}</span>  // 次选
```

---

## 例外与独立设计语言

- **独立设计语言**(`store-pos` 全屏触摸收银 / `terminal/*` 工业作业台 / `mobile/*` 移动端):允许各自的专用配色体系,但**必须令牌化**(集中到 `terminal-theme.ts` / `MobileThemeContext` 等单一来源),不得在页面内散写 hex。它们不并入后台 admin 体系,但同样禁止"页面内字面量"。
- **设计系统源文件**(`design-tokens.ts` / `globals.css` / `*.module.css`):允许定义具体色值——它们就是色值的来源。

---

## 检查与执行

```bash
bash scripts/ui-audit-check.sh            # 报告模式
bash scripts/ui-audit-check.sh --strict   # CI:超过基线(新增债务)则失败
bash scripts/ui-audit-check.sh --top 20
```

- **新页面/新组件**:提交前自查 `ui-audit-check.sh`,硬编码 hex 应为 0、无原生弹窗、无页面级状态色映射。
- **CI 接入**(UI-2.x):`--strict` 设阈值,债务总量只许下降不许上升(棘轮机制)。
- **存量迁移**:不在本阶段强制;UI-2.9 按"最高风险文件优先"分批迁移到本规范。
