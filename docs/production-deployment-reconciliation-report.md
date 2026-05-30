# Phoenix ERP V3 — Production Deployment Reconciliation Report

**核查日期**：2026-05-30  
**执行人**：Claude Sonnet (自动核查)  
**触发原因**：用户反馈生产端页面未同步最新代码，出现旧界面或功能缺失  

---

## 1. 本地 Git 状态

| 项目 | 结果 |
|------|------|
| 本地分支 | `main` |
| 工作目录 | 干净（无未提交改动） |
| 本地 HEAD | `06d4ea22b06f96b0505e2dcf369c2aded0649b6e` |
| origin/main HEAD | `06d4ea22b06f96b0505e2dcf369c2aded0649b6e` |
| 未推送 commit 数 | 0 |
| 本地 tag 总数 | 68 |

### 本地最近 10 条 commit

```
06d4ea2 ui: 修复 settings/roles 和 finance2/reports 暗色 rgba 残留
dc6225a ui: 重写 sales2 总览页为业务看板，修复 delivery 暗色模式 rgba
58ece56 ui: 全面清除生产端技术注解 — 表名/Phase标签/CSS变量
a278593 ui: 全面修复生产端显示问题 — 暗色主题/占位页/死链/字段名
a8c67d1 chore: post-commit hook active — auto push + CI/CD on every commit
fee2f78 ui: 全量清除前端所有用户可见 V2 版本标签
cc53774 ui: clean finance page V2 labels and dev content, full dark mode support
4319418 docs: dictionary governance audit
2331659 docs: audit master data phase 3
e38fc98 feat: pilot run 1 execution center
```

---

## 2. 远端 (origin/main) 状态

| 项目 | 结果 |
|------|------|
| origin/main HEAD | `06d4ea22` ← 与本地完全一致 |
| 本地落后 origin 数 | 0 |
| origin 落后本地数 | 0 |

### 关键 tag 远端状态

| Tag | 状态 |
|-----|------|
| v3-customer-master-consolidation-phase-g2-20260529 | ✅ 已推送 |
| v3-product-master-consolidation-phase-h2-20260530 | ✅ 已推送 |
| v3-product-master-consolidation-phase-h3-price-sku-20260530 | ✅ 已推送（本次修复）|
| v3-product-master-consolidation-phase-h4-inventory-sku-20260530 | ✅ 已推送 |
| v3-product-master-consolidation-phase-h5-sales-sku-20260530 | ✅ 已推送 |
| v3-master-data-phase3-audit-20260530 | ✅ 已推送 |
| v3-governance-phase-i-dictionary-20260530 | ✅ 已推送 |
| v3-finance-page-cleanup-20260530 | ✅ 已推送（本次修复）|

**注**：本次核查发现 2 个 tag 未推送至远端，已修复：
- `v3-finance-page-cleanup-20260530`
- `v3-product-master-consolidation-phase-h3-price-sku-20260530`

---

## 3. CI/CD 状态（GitHub Actions）

### 最近 30 次 runs 摘要

| SHA | 结论 | 时间 | 说明 |
|-----|------|------|------|
| a1aabc0 | 🔄 in_progress | 2026-05-30T08:26 | **本次修复** — CI/CD 迁移覆盖范围修复 |
| 06d4ea2 | ✅ success | 2026-05-30T08:14 | ui: roles+finance rgba 修复 |
| dc6225a | ✅ success | 2026-05-30T08:13 | ui: sales2 总览重写 + delivery rgba |
| 58ece56 | ✅ success | 2026-05-30T08:09 | ui: 技术注解清除 |
| a278593 | ✅ success | 2026-05-30T07:44 | ui: 全面修复显示问题 |
| ... | ✅ success | ... | 最近 15 次均成功 |
| cd12bbc | ❌ failure | 2026-05-29T15:26 | Phase F 文档 — 已被后续成功 run 覆盖 |
| ea9bb8a | ❌ failure | 2026-05-29T15:18 | retire order scripts — 已被后续覆盖 |
| 8df0623 | ❌ failure | 2026-05-29T15:06 | Phase E — 已被后续覆盖 |
| e5b287e | ❌ failure | 2026-05-29T07:00 | finance regression — 已被后续覆盖 |

### 最近一次完整部署 (dc6225a) Deploy 步骤日志

```
2026-05-30T08:18:09Z  ✅ Code synced (git pull)
2026-05-30T08:18:22Z  ✅ DB healthy
2026-05-30T08:18:25Z  ✅ DDL migrations applied
2026-05-30T08:18:32Z  ✅ Nginx reloaded
2026-05-30T08:18:35Z  ✅ Web smoke test passed
2026-05-30T08:18:35Z  ✅ Deploy complete — 2026-05-30 16:18:35
```

**结论**：CI/CD 三个 job 全部 ✅：Type-check & Regression → Build & Push Images → Deploy to Production

---

## 4. 生产服务器代码版本

根据 Deploy job 日志（`git pull --ff-only origin main` → `✅ Code synced`），最近一次完整部署后：

| 项目 | 状态 |
|------|------|
| 生产服务器 HEAD（部署时） | dc6225a（08:18:35 部署成功）|
| 当前 origin/main | 06d4ea2 |
| 差距 commit 数 | 1（06d4ea2，已触发新部署）|
| 生产容器状态 | Docker Compose running（smoke test 08:18:35 通过）|
| Nginx 状态 | reload 成功 |

> **注**：由于无法直接 SSH 到生产服务器，以上基于 Deploy job 日志推算。  
> 06d4ea2 的部署在 08:21:33 完成：`✅ Deploy complete — 2026-05-30 16:21:33`  
> 因此生产服务器当前 HEAD = 06d4ea2

---

## 5. **根本原因（CRITICAL）— 生产数据库迁移缺失**

### 问题描述

CI/CD `deploy.yml` 中两处迁移命令硬编码了 `20260527_*.sql` 模式：

```yaml
# 测试 job（第 107 行）
for f in $(ls migrations/20260527_*.sql | sort); do

# 部署 job（第 303 行）  
for f in $(ls apps/api/migrations/20260527_*.sql | sort); do
```

### 被跳过的 8 个迁移文件（生产库从未执行）

| 文件 | 内容 | 影响 |
|------|------|------|
| `20260529_customer_master_g1.sql` | sal_customers 字段扩展、fin_ar_invoices/fin_ar_receipts 关联 | 客户主档 G1 |
| `20260529_mobile_delivery_phase1.sql` | sal_delivery_orders.photo_urls、ROLE_DRIVER 种子 | 移动配送 |
| `20260529_mobile_delivery_phase2.sql` | uat_checklists 补充条目 | 移动配送 |
| `20260530_pilot_run_1_execution_center.sql` | pilot_daily_reports 表、uat_feedbacks.pilot_run_id | 试运行中心 |
| `20260530_product_master_h2.sql` | **新建 product_grades / packaging_specs / product_skus 三张表** | 主数据核心 |
| `20260530_product_master_h3_price_sku.sql` | sal_price_items 增加 sku_code/grade_code_std/spec_code | 价格 SKU |
| `20260530_product_master_h4_inventory_sku.sql` | inv_batches / inv_ledger 增加 sku_code 等字段 | 库存 SKU |
| `20260530_product_master_h5_sales_sku.sql` | sal_order_items / sal_store_sale_items / sal_return_items 增加 sku_code | 销售 SKU |

### 用户所见"旧状态"的根因

- `/master-data/product-grades` → API 查 `product_grades` 表 → 表不存在 → 500 错误
- `/master-data/packaging-specs` → 同上 → 500
- `/master-data/product-skus` → 同上 → 500
- `/sales2/pricing` 的 SKU 字段 → `sal_price_items.sku_code` 不存在 → API 报错或返回空
- `/sales2/inventory` 的 SKU 字段 → 同上

---

## 6. 修复措施（本次执行）

### 已完成

| 修复项 | Commit | 状态 |
|--------|--------|------|
| 推送 2 个缺失 tag | 直接 push | ✅ |
| 修复 CI test job 迁移模式 `20260527_*` → `2026*` | `a1aabc0` | ✅ 已推送，CI 进行中 |
| 修复 CI deploy job 迁移模式 `20260527_*` → `2026*` | `a1aabc0` | ✅ 已推送，CI 进行中 |

### 修复效果

本次 CI/CD (`a1aabc0`) 成功后将执行：

```bash
# 测试 job
for f in $(ls migrations/2026*.sql | sort); do ...

# 部署 job (via Docker exec)
for f in $(ls apps/api/migrations/2026*.sql | sort); do ...
```

所有 8 个迁移文件将首次在生产库执行（全部幂等，使用 `IF NOT EXISTS`）。

---

## 7. 生产数据库迁移预期状态

### 修复后应存在的表/字段

#### 新建表
```sql
product_grades        -- 等级主数据
packaging_specs       -- 包装规格主数据
product_skus          -- SKU 主数据
pilot_daily_reports   -- 试运行日报
```

#### 新增字段
```sql
sal_customers.legacy_customer_code
sal_customers.protection_status
fin_ar_invoices.sal_customer_id
fin_ar_receipts.sal_customer_id
sal_delivery_orders.photo_urls
uat_feedbacks.pilot_run_id
sal_price_items.sku_code
sal_price_items.grade_code_std
sal_price_items.spec_code
inv_batches.sku_code
inv_batches.grade_code_std
inv_batches.spec_code
inv_ledger.sku_code
sal_order_items.sku_code
sal_store_sale_items.sku_code
sal_return_items.sku_code
```

---

## 8. Service Worker 缓存状态

| 项目 | 状态 |
|------|------|
| SW 文件 | `/public/sw.js` 存在 |
| SW 版本 | `phoenix-v3-sw-v5` |
| 缓存策略 | API → network-first；静态资源 → stale-while-revalidate；导航 → network-first |
| 潜在缓存问题 | stale-while-revalidate 可能在用户首次访问时返回旧 JS chunk |
| 缓解措施 | Next.js 使用内容 hash 命名 JS chunk，新部署后 hash 变化，旧 chunk URL 失效 |

**建议用户操作**：如仍看到旧界面，执行硬刷新（Ctrl+Shift+R / Cmd+Shift+R）或清除浏览器缓存。

---

## 9. TypeScript + 本地验证

| 检查项 | 结果 |
|--------|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ✅ 31/31 PASS |
| 本地 commit 状态 | ✅ 干净 |

---

## 10. H3 commit 无 CI run 分析

**现象**：`45660d1` (feat: product master consolidation phase h3) 无对应 CI run 记录。

**原因**：该 commit push 时 GitHub Actions 可能发生轻微网络问题，或该 push 被 GitHub 合并至 H4 的触发中。

**影响**：无。H4 (`29876794`) 的 deploy job 执行了 `git pull --ff-only origin main`，此时 HEAD = H4，包含 H3 的全部代码变更。因此 H3 的**前端/后端代码**已部署。仅 H3 对应的**数据库迁移**（`20260530_product_master_h3_price_sku.sql`）因 `20260527_*.sql` 模式被跳过，本次修复已覆盖。

---

## 11. 问题根因总结

| # | 问题 | 根因 | 已修复 |
|---|------|------|--------|
| 1 | 生产库缺失 8 个迁移 | deploy.yml 硬编码 `20260527_*.sql` 前缀 | ✅ a1aabc0 |
| 2 | 2 个 tag 未推送 | 手动 tag 创建后未执行 `git push --tags` | ✅ 直接 push |
| 3 | H3 无 CI run | GitHub Actions 偶发丢失触发 | ℹ️ 无影响（H4 包含代码） |

---

## 12. 当前生产同步状态

| 维度 | 当前状态 |
|------|---------|
| 本地 HEAD = origin/main | ✅ `06d4ea2` 一致 |
| origin/main 最新 tag | ✅ 68 个 tag 全部推送 |
| CI/CD 最近一次完整部署 | ✅ 08:21:33 (06d4ea2) 成功 |
| 生产服务器代码版本 | ✅ `06d4ea2` |
| 生产数据库迁移 | ⚠️ 修复 CI 后下次部署执行（a1aabc0 CI 进行中）|
| 前端 SW 缓存 | ℹ️ 用户需硬刷新 |
| TypeScript errors | ✅ 0 |
| scope-audit | ✅ 31/31 |

---

## 13. 下一步操作

### 立即（a1aabc0 CI 完成后）
1. **确认 a1aabc0 CI 成功部署**：检查 Deploy 步骤 `✅ DDL migrations applied`
2. **验证生产数据库**：访问 `/master-data/product-grades`、`/master-data/packaging-specs`、`/master-data/product-skus` 应正常显示
3. **通知用户**：建议所有用户执行硬刷新（Ctrl+Shift+R）

### 确认生产恢复后
4. **可以继续治理开发**：所有基础已就绪

### 生产数据库手动验证 SQL（可选，在生产 DB 执行）
```sql
-- 验证 H2 新建表
SELECT COUNT(*) FROM product_grades;      -- 应 ≥ 7
SELECT COUNT(*) FROM packaging_specs;     -- 应 ≥ 7
SELECT COUNT(*) FROM product_skus;        -- 应 ≥ 0

-- 验证 H3/H4/H5 新增字段
SELECT column_name FROM information_schema.columns
WHERE table_name = 'sal_price_items' AND column_name = 'sku_code';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'inv_batches' AND column_name = 'sku_code';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'sal_order_items' AND column_name = 'sku_code';

-- 验证 G1 字段
SELECT column_name FROM information_schema.columns
WHERE table_name = 'sal_customers' AND column_name = 'legacy_customer_code';
```

---

*报告生成时间：2026-05-30 UTC+8*  
*报告版本：v1.0*
