# 性能优化审计 Phase P0

> **日期**：2026-06-03 · **性质**：只审计，不改代码。
> **目标**：找到"页面等待感强"的真正根因，形成 P1/P2/P3 可执行优化路线。

---

## 0. 核心结论（一句话）

> **慢的主要原因不是单一项，而是"加载策略缺失 × Skeleton 覆盖率低 × 关键接口 N+1 查询"三重叠加**，导致用户感受到白屏等待。SQL 索引覆盖较好，权限体系已 JWT 内嵌（不额外请求），这两项是亮点。

---

## 1. 页面性能问题清单

### 1.1 请求数量（每页）

| 页面 | 请求数 | 评级 | 说明 |
|------|--------|------|------|
| `/finance2` | **8** | 🔴 高 | 多个独立 fetch，串行调用，白屏直到最后一个返回 |
| `/procurement2/orders` | **8** | 🔴 高 | 含列表+详情+审批状态多请求 |
| `/sales2` | 2 | 🟡 中 | 可接受 |
| `/dashboard` | 1 | ✅ | 已聚合 |
| `/store-pos` | 1 | ✅ | 单次大请求 |
| `/shareholders/capital` | 0（context） | ✅ | 通过 API client 懒加载 |

### 1.2 Skeleton / Loading 覆盖率（核心页面）

| 页面 | 有 Skeleton | 有内联 Loading | 评级 | 问题 |
|------|------------|---------------|------|------|
| `sales2/orders` | ❌ 0 | 🟡 2 | 🔴 | **整页白屏等待数据** |
| `sales2/returns` | ✅ 4 | 5 | 🟡 | 部分覆盖 |
| `sales2/delivery` | ✅ 2 | 5 | 🟡 | 部分覆盖 |
| `shareholders/capital` | ❌ 0 | 1 | 🔴 | **白屏** |
| `finance2/ar` | ❌ 0 | 7 | 🔴 | **纯文字 loading，体验差** |
| `traceability` | ❌ 0 | 2 | 🔴 | **无引导空状态时白屏** |
| `procurement2/orders` | ❌ 0 | 4 | 🔴 | **整页白屏** |

**Skeleton 覆盖率：核心 7 页中仅 2 页有 Skeleton（29%），远低于企业级产品标准（>80%）。**

### 1.3 整页阻塞渲染（最严重问题）

以下页面所有数据串行加载完成后才渲染表格，导致用户看到空白页：
- `finance2/page.tsx`：8 个 fetch **全部阻塞**，最慢接口完成才显示
- `procurement2/orders`：多个 fetch 无骨架屏保护
- `sales2/orders`：无 Skeleton，loading 期间表格区域空白

---

## 2. API 性能审计

### 2.1 Dashboard 请求分散问题

各 Dashboard 接口**独立存在**，前端逐个调用：

| 页面 | 后端接口数量 | 现状 |
|------|------------|------|
| 财务首页 | 8 独立接口 | ❌ 串行，阻塞白屏 |
| 采购首页 | 6 独立接口 | ❌ 无聚合 |
| 股东首页 | 4 独立接口（capital-summary/stats/dashboard/project） | ❌ 无聚合 |
| 销售首页 | 2 接口 | 🟡 可接受 |
| 系统首页 | 1 聚合接口 | ✅ |

**判断：财务/采购/股东三个 Dashboard 需要建聚合 BFF 接口，减少瀑布等待。**

### 2.2 估算最慢接口（代码分析，无生产 APM 数据）

| 接口 | 预估慢原因 | 优先级 |
|------|-----------|--------|
| `GET /api/v2/sales/analytics/*` | sales-analytics.service.ts 857行，多表聚合 | P0 |
| `GET /api/traceability/sales-order/:no` | for 循环内串行 traceByBatch（N+1） | P0 |
| `GET /api/traceability/packaging/:code` | for 循环内串行 traceByBatch（N+1） | P0 |
| `GET /api/v2/finance/*` (dashboard) | finance-v2 ap-invoices.service 640行，复杂聚合 | P1 |
| `GET /api/v2/sales/inventory/stats` | egg-inventory.service 915行，多批次遍历 | P1 |
| `GET /api/v2/procurement/orders` | orders.service 647行，关联查询多 | P1 |
| `GET /shareholders/dashboard` | shareholder.service for 循环 | P1 |

---

## 3. SQL 性能审计

### 3.1 pg_stat_statements

**本地环境未启用 `pg_stat_statements`**（需生产环境开启）。生产诊断 SQL：
```sql
-- 生产执行，需先 CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT round(mean_exec_time::numeric,1) AS avg_ms, calls,
       left(regexp_replace(query,'\s+',' ','g'),80)
FROM pg_stat_statements
WHERE mean_exec_time > 50
ORDER BY mean_exec_time DESC LIMIT 20;
```

### 3.2 已知 N+1 查询（代码分析）

🔴 **P0 — TraceabilityService（最严重）**：
```typescript
// traceability.service.ts line 55
for (const b of batches) traces.push(await this.traceByBatch(b.batch_no, ...));
// 每个 batch 独立一次 assembleTree，assembleTree 内部 10+ 条 SQL
// 一个包装批次 → 5 个 batch → 50+ SQL 串行执行
```

🔴 **P1 — EggInventoryService**：
```typescript
// egg-inventory.service.ts 多处 for 循环内 DB 查询（batch.qty_available 更新、流水写入）
for (const batch of batches) { UPDATE inv_batches... }  // FIFO 扣减
```

🟡 **P2 — ShareholderService**：`resolveAccessibleProjects` 中 for 循环过滤项目。

### 3.3 索引覆盖（亮点）

核心业务表索引覆盖**很好**：
- `inv_batches`：26 个索引，覆盖全量查询场景 ✅
- `sal_sales_orders`：8 个复合索引 ✅
- `fin_ar_invoices`：6 个索引 ✅
- `wf_approval_instances/steps`：10+ 索引 ✅

**缺失索引**：
- `shr_capital_contributions`：缺 `shareholder_code` 独立索引（只有 project 索引）
- `wf_approval_rule_steps`：缺 `status` 复合索引（高频 where 条件）

---

## 4. Dashboard 请求聚合判断

| Dashboard | 当前请求数 | 是否需要聚合接口 | 建议 |
|-----------|-----------|----------------|------|
| `/finance2`（财务） | 8 | 🔴 **强烈建议** | `GET /api/bff/dashboard/finance` |
| `/procurement2`（采购） | 6 | 🟡 建议 | `GET /api/bff/dashboard/procurement` |
| `/shareholders`（股东） | 4 | 🟡 建议 | `GET /api/bff/dashboard/shareholder` |
| `/sales2`（销售） | 2 | ✅ 暂不需要 | 已基本合理 |
| `/dashboard`（首页） | 1 | ✅ 已聚合 | |

---

## 5. 表格加载策略

### 5.1 分页覆盖（好消息）

后端有 122 处 `LIMIT/pageSize/take` 分页实现，主要列表接口已有服务端分页 ✅

### 5.2 存在问题

| 问题 | 影响页面 |
|------|---------|
| `generic-crud` 接口默认 limit 不确定，某些调用无显式 limit | 多处 crud API 调用 |
| 部分页面 `pageSize=50` 或 `pageSize=100` 默认过大 | procurement2/orders 等 |
| 搜索无防抖 | finance2/ar, sales2/orders |
| 无虚拟滚动，大数据量表格 DOM 压力大 | 500+ 行数据时 |

---

## 6. 权限与用户上下文

**亮点（无需优化）**：
- 权限直接从 JWT payload 解析（`permissions: ["MENU_CODE:V,C,E", ...]`）
- `usePermission` hook 纯客户端计算，**零额外 API 请求** ✅
- MenuGuard 76 个端点，全部服务端校验，无单点权限 API 请求 ✅

**无需建 bootstrap 接口**，权限体系已是最优架构。

---

## 7. 前端 Bundle 分析

### 7.1 关键发现

**零动态导入**：全站 `dynamic()` 和 `React.lazy()` 使用次数 = **0**。

这意味着：
- 所有模块（包括低频的 shareholders/traceability/settings/workflow）在首次访问任何页面时就被打包
- 用户访问 `/dashboard` 时，浏览器要下载包括 traceability、报表、工作流等全部代码

### 7.2 重量级依赖

| 依赖 | 风险 |
|------|------|
| `xlsx` | 仅 `shareholders/capital/import` 使用，**全量打包** → 应动态导入 |
| `recharts` | 多个报表页使用 | 
| `lucide-react` | 全局图标库，体积大但无法 tree-shake（按 icon 导入已做到） |

### 7.3 低频模块（应 lazy load）

| 模块 | 访问频率 | 代码量 | 建议 |
|------|---------|-------|------|
| `/shareholders` | 低（仅股东/管理员） | 大 | `dynamic()` |
| `/traceability` | 低 | 中 | `dynamic()` |
| `/settings` | 极低 | 大 | `dynamic()` |
| `/uat` | 极低 | 大 | `dynamic()` |
| `xlsx` 导入 | 极低（仅导入功能）| 大 | `dynamic()` |
| `workflow/metrics` | 低 | 中 | `dynamic()` |

**预估：引入动态导入后首包可减少 30-50%，首屏 TTI 可改善 1-3 秒。**

---

## 8. Skeleton 覆盖率

### 8.1 总体覆盖率：29%（核心 7 页）

| 优先修复 | 原因 |
|---------|------|
| `sales2/orders` | **无 Skeleton，高频页，每天使用** |
| `finance2/ar` & 财务模块 | **8 个并发请求无骨架，白屏时间长** |
| `procurement2/orders` | 无 Skeleton，采购常用页 |
| `shareholders/capital` | 无 Skeleton，股东重要看板 |

### 8.2 已有较好 Skeleton 的页面

`sales2/returns`（4处）、`sales2/delivery`（2处）— 继续保持。

---

## 9. P0/P1/P2 优化路线

### 🔴 P0 — 必须优化（影响所有用户）

| 编号 | 优化项 | 预估收益 | 工作量 |
|------|--------|---------|--------|
| P0-1 | **TraceabilityService N+1 修复**：`for await` → `Promise.all` 并行 | 5-10倍 traceability 提速 | S |
| P0-2 | **sales2/orders 加 LoadingSkeleton** | 消除白屏感 | XS |
| P0-3 | **finance2 Dashboard 请求并行化**：8 串行 → `Promise.all` 并行 | 提速 60-70% | S |
| P0-4 | **xlsx 动态导入**：`import('xlsx')` 替换顶部静态 import | 首包减少 ~200KB | XS |

### 🟡 P1 — 建议优化（常用页面体验提升）

| 编号 | 优化项 | 预估收益 | 工作量 |
|------|--------|---------|--------|
| P1-1 | **finance2/ar、shareholders/capital、procurement2/orders 加 Skeleton** | 消除白屏 | S |
| P1-2 | **Dynamic import 低频模块**：shareholders/traceability/settings/uat | 首包减少 30-50% | M |
| P1-3 | **财务 Dashboard BFF 聚合接口**：8 接口 → 1 `/api/bff/finance-dashboard` | 财务首页提速 | M |
| P1-4 | **搜索防抖**：finance2/ar, sales2/orders 输入 debounce 300ms | 减少无效请求 | XS |
| P1-5 | **shr_capital_contributions 加 shareholder_code 索引** | 股东出资查询提速 | XS |
| P1-6 | **EggInventoryService FIFO 批量操作优化**：减少 for 循环内单条 UPDATE | 批量出库场景 | M |

### 🟢 P2 — 后续优化（体验增强）

| 编号 | 优化项 |
|------|--------|
| P2-1 | 采购/股东 Dashboard 聚合接口 |
| P2-2 | 超大表格（>200行）虚拟滚动 |
| P2-3 | 生产环境启用 pg_stat_statements 持续监控 |
| P2-4 | API 响应缓存（只读配置类接口：packaging_specs/product_grades）|
| P2-5 | Next.js Suspense 边界细化 |
| P2-6 | workflow/metrics 动态导入 |

---

## 必须回答

1. **页面慢的主要原因**：**加载策略缺失**（无 Skeleton + 串行 API 调用）是用户感知最大来源；其次是 TraceabilityService 的 N+1 N+1 数据库查询。

2. **是前端慢、API慢、SQL慢，还是加载策略慢**：
   - **主因 = 加载策略缺失**（Skeleton 覆盖率仅 29%，串行请求无保护）
   - **次因 = API 层 N+1**（TraceabilityService for await 循环）
   - 亮点：SQL 索引覆盖好；权限零额外 API 请求

3. **最慢页面**：`/finance2`（8 串行请求）、`/traceability`（N+1 多 SQL）、`/procurement2/orders`（无 Skeleton + 多请求）

4. **最慢接口（估算）**：`/api/traceability/*`、`/api/v2/sales/analytics/*`、财务聚合类接口

5. **最慢 SQL**：生产 `pg_stat_statements` 未启用，需开启后确认；代码分析最大风险 = TraceabilityService 串行查询

6. **缺 Skeleton 页面**：`sales2/orders`、`finance2/ar`、`shareholders/capital`、`traceability`、`procurement2/orders`

7. **Dashboard 是否需要聚合接口**：财务（🔴强烈建议）、采购（🟡建议）、股东（🟡建议）

8. **权限是否需要缓存**：**不需要**，已 JWT 内嵌，零额外请求，架构最优

9. **是否允许进入 P1**：🟢 **允许**，P0-1~P0-4 四项 P0 优化明确可执行，从 TraceabilityService N+1 和 sales2/orders Skeleton 开始

---

## 附：生产环境必做（上线前）

```sql
-- 启用慢查询监控（生产 postgresql.conf 需设 shared_preload_libraries='pg_stat_statements'）
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 建议补充的索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shr_contrib_shareholder 
  ON shr_capital_contributions (shareholder_code);
```
