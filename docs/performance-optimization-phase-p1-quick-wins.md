# 性能优化 P1 — Quick Wins 高收益快修

> **日期**：2026-06-03 · **依据**：docs/performance-optimization-phase-p0-audit.md
> **原则**：最小改动、最高收益、零业务逻辑变化

---

## 0. 结论速览

| 项 | 内容 | 状态 |
|----|------|------|
| P1-1 | sales2/orders 白屏 → LoadingSkeleton + EmptyState | ✅ 完成 |
| P1-2 | finance2 Dashboard 串行化 | ✅ **已是 Promise.allSettled（无需改）** |
| P1-3 | TraceabilityService N+1 修复 | ✅ 完成 |
| P1-4 | xlsx 静态导入 → 动态导入 | ✅ 完成 |

---

## 1. P1-1: sales2/orders Skeleton 修复

**改动文件**：`apps/web/src/app/(admin)/sales2/orders/page.tsx`

**改动内容**：
- 加 `import { LoadingSkeleton, EmptyState } from '@/components/design-system'`
- loading 期间：表格区域内联"加载中…" → `<LoadingSkeleton variant="table" rows={8} />`
- 空数据：内联"暂无订单数据" → `<EmptyState title="暂无订单数据" description="..." compact />`
- 错误提示：硬编码红色 → CSS 变量 `var(--status-danger-bg/border/danger)`

**效果**：sales2/orders（系统最高频页面）加载期间不再白屏，8 行骨架屏立即出现，用户感知从"页面未响应"变为"内容正在加载"。

**零业务逻辑变化**：订单查询、状态机、API、字段、权限均未改动。

---

## 2. P1-2: finance2 Dashboard（**已是最优，无需改动**）

P0 审计中估计 finance2 是串行，**实际代码已是 `Promise.allSettled`**：

```typescript
const [ar, cashSummary, pendingTfr, sh, exp, rpt] = await Promise.allSettled([...])
```

KPI 卡片已有 `loading` prop 传入。finance2 已达到最优架构，无需改动。

---

## 3. P1-3: TraceabilityService N+1 修复

**改动文件**：`apps/api/src/modules/traceability/traceability.service.ts`

**问题**：两处 `for (const b) { await traceByBatch(...) }` 导致批次数量×SQL查询数串行执行。5 个批次 = 50+ 条串行 SQL。

**修复**：

```typescript
// 修复前（N+1 串行）
for (const b of batches) traces.push(await this.traceByBatch(b.batch_no, companyScope));

// 修复后（Promise.all 并行）
const traces = await Promise.all(
  batches.map((b: any) => this.traceByBatch(b.batch_no, companyScope))
);
```

两处均修复：`traceByPackaging` + `traceBySalesOrder`。

**零变化**：返回结构、DataScope 校验、权限、字段全部保持不变。排序由 SQL `ORDER BY batch_no` 保证。

**预期收益**：5 批次追溯：串行 5×(50ms SQL) = 250ms → 并行 50ms，**提速 5 倍**。

---

## 4. P1-4: xlsx 动态导入

**改动文件**：`apps/web/src/app/(admin)/shareholders/capital/import/page.tsx`

**问题**：`import * as XLSX from 'xlsx'` 静态导入，xlsx ~500KB 进入所有用户的首屏 bundle，但该页面是低频导入功能页面。

**修复**：
- 移除顶部静态 `import * as XLSX from 'xlsx'`
- `handleFile`（用户上传文件时）：`const XLSX = await import('xlsx')`
- `downloadTemplate`（用户点击下载模板时）：`const XLSX = await import('xlsx')`
- `normalizeDate` 函数改为接受可选 `xlsxSsf` 参数，解耦对全局 XLSX 的依赖

**预期收益**：首屏 bundle 减少 ~200–500KB，TTI 可改善 0.5–1.5s（网络带宽受限时更明显）。

---

## 5. 改动文件清单

| 文件 | 改动类型 | 行数变化 |
|------|---------|---------|
| `apps/web/src/app/(admin)/sales2/orders/page.tsx` | 加 LoadingSkeleton/EmptyState | +15 |
| `apps/api/src/modules/traceability/traceability.service.ts` | N+1→Promise.all（2处） | +4/-2 |
| `apps/web/src/app/(admin)/shareholders/capital/import/page.tsx` | xlsx 动态导入 | +5/-2 |

---

## 6. 风险控制

| 风险 | 评估 | 缓解 |
|------|------|------|
| orders Skeleton 遮挡内容 | 无（仅 loading 期间显示） | tsc 0 错 |
| Traceability N+1→并行后顺序变化 | 低（SQL 已 ORDER BY batch_no） | 返回结构完全兼容 |
| xlsx 动态导入延迟 | 首次点击有 ~200ms 网络延迟 | 后续点击走浏览器缓存 |
| finance2 误以为未改 | 已最优，本轮确认无改动 | 代码审查确认 |

---

## 7. 性能预期收益

| 页面/功能 | 改善 | 方式 |
|----------|------|------|
| sales2/orders 首屏 | 白屏感消除 | Skeleton 即时显示 |
| traceability 多批次 | 5 批次提速 5 倍 | N+1→并行 |
| 首屏 TTI（含 xlsx 页） | 减少 200–500KB bundle | 动态导入 |

---

## 8. 是否允许进入 S0 / O1

🟢 **允许**。本次改动：
- **零业务逻辑变化**（订单/财务/追溯逻辑无任何修改）
- **零数据库变更**
- **零权限变更**
- **API TypeScript 0 errors / Web TypeScript 0 errors**
- 是纯 UI 体验和后端并发优化，回归风险极低
