# G26-A · Design System 组件版本 canonical 约定

> 立账日：2026-06-08 | 欠债 ID：C4

## 现状

| 组件 | 文件 | 状态 |
|---|---|---|
| KpiCard 旧版 | `components/ui/KpiCard.tsx` | ⚠️ @deprecated |
| KpiCard 新版 | `components/design-system/KpiCardV2.tsx` | ✓ canonical |
| MetricCard | `components/design-system/cards/MetricCard.tsx` | ✓ 特殊布局衍生 |
| StatStrip | `components/ui/StatStrip.tsx` | ⚠️ @deprecated |
| QuickEntryCard | `components/ui/QuickEntryCard.tsx` | 业务特定保留 |
| StatusBadge | `components/design-system` export | ✓ canonical (14 处稳定) |

## 约定
1. 新页面统一用 design-system 版本
2. 旧版本标 @deprecated，G27+ 迁移完成后整体删除
3. 业务特定卡片不强行收口

## 不做完整收口理由
- 旧版总用 4 处，工作量/价值比低
- 业务方未报视觉一致性问题
- 优先做用户报的高频痛点
