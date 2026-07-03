# 系统仪表盘可用库存 KPI 口径修复

日期：2026-07-03  
结论：GO

## 问题

系统仪表盘卡片显示：

- 标题：库存总量
- 数值：`806,249.95`
- 单位：托

用户质疑该数据来源和单位口径。

## 根因

后端 `/api/dashboard/kpi` 的数值来源是真实库存唯一台账：

```sql
SELECT COALESCE(SUM(qty_available),0)
FROM inv_batches
WHERE status='AVAILABLE'
```

如果用户存在 `storeCode` 数据域，则追加：

```sql
AND store_code = $1
```

因此数值不是前端瞎写，也不是模拟数据。真正错误是：

1. 后端把 `SUM(qty_available)` 的单位硬编码为 `托`。
2. `inv_batches.qty_available` 是库存基础数量字段，不等同于托盘数。
3. 仪表盘没有展示数据源和可用批次数，导致业务口径不透明。

## 修复

1. 后端把单位从 `托` 改为 `基础单位`。
2. 后端返回 `stockAvailableBatchCount`。
3. 后端返回 `stockMetricSource = inv_batches.status=AVAILABLE SUM(qty_available)`。
4. 前端卡片标题从 `库存总量` 改为 `可用库存`。
5. 前端说明改为：
   - 当前可用库存汇总
   - 来源 `inv_batches.qty_available`
   - 可用批次数

## 修改文件

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx`

## 验证

- API typecheck：PASS
- Web typecheck：PASS

## 后续建议

库存驾驶舱应继续细化：

1. 按 SKU / 品类 / 单位拆分库存。
2. 不同单位不得直接汇总成业务单位。
3. 如果要显示“托”，必须有明确托盘换算规则和字段来源。
4. 集团驾驶舱建议展示“可用库存基础数量”，库存分析页展示详细单位拆分。
