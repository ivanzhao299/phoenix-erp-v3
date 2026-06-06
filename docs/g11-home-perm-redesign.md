# G11 · 宋明光 home 页按权限重设 + G10 修补

完成时间：2026-06-06

## 1. 业务方反馈（用户实测发现）

宋明光（孟赛生产数据主管）登录后 `/home` 看到的内容**严重越权**：

| 显示内容 | 宋明光是否该看 |
|---|---|
| 数据质量驾驶舱（QualityScoreCard） | ✗ 不应看 |
| 24 项高危告警（RiskAlertBanner） | ✗ 不应看 |
| 主数据健康度（HealthCard） | ✗ 不应看 |
| 8 大业务中心阵列（含数据质量、客户/供应商中心） | ✗ 部分越权 |
| HeroBanner "高危告警" 数字气泡 | ✗ 不应看 |
| 今日要点提及"24 项高危告警 / N 单主数据待审批" | ✗ 不应看 |

**根因**：home/page.tsx 是一个固定页面，**未按 hasPermission 动态过滤**任何组件，对所有角色显示同套内容。

## 2. G11 重设设计原则

**单一原则**：home 页所有组件都通过 `hasPermission(menu)` 守卫渲染。

### 2.1 权限映射

| 组件 | 守卫 |
|---|---|
| QualityScoreCard | `MENU_DATA_QUALITY` 或 `MENU_MD_QUALITY` |
| RiskAlertBanner | 同上 |
| HealthCard | `MENU_MD_CENTER` 或 `MENU_MASTER` |
| 高危告警气泡 | 同 QualityScoreCard |
| 今日要点中告警 / 主数据待审 | 同对应组件 |
| ShortcutsGrid 客户中心 / 供应商中心 | `MENU_MASTER` |
| ShortcutsGrid 采购中心 | `MENU_PRC2` |
| ShortcutsGrid 销售中心 | `MENU_SALES2` |
| ShortcutsGrid 财务中心 | `MENU_FIN2` |
| ShortcutsGrid 库存中心 | `MENU_WMS_VIEW` |
| ShortcutsGrid 审批工作台 | `MENU_WORKFLOW` |
| ShortcutsGrid 数据质量 | `MENU_DATA_QUALITY` |

### 2.2 布局自适应

- **治理类角色**（admin / 数据质量管理员）：双栏（左 = 事务流 + 经营概览；右 = 治理类组件）
- **业务录入角色**（宋明光等）：单栏（仅事务流 + 经营概览 + 自己有权的业务中心）

### 2.3 性能联动

按权限懒加载 API：
- 无 quality 权 → 不请求 `/data-quality/scores`
- 无 master 权 → 不请求 `/master-data/operations/centers`

## 3. 宋明光实际看到的 home（重设后）

```
┌── HeroBanner ──────────────────────────────┐
│  下午好，宋明光                              │
│  今天有 N 个待办待处理，请优先处理。         │
│  [进入每日工作台 →]                          │
│  气泡：待办 N  超时 0                         │
│  （无"高危告警"气泡）                        │
└────────────────────────────────────────────┘

┌── 事务流 ──────────────────────────────────┐
│  我的待办任务（N 项）                        │
└────────────────────────────────────────────┘

┌── 经营概览（养殖 / 库存 / 财务模块）─────────┐
│  按宋明光持有的 MENU_FARM_* / MENU_INV_* 渲染 │
└────────────────────────────────────────────┘

┌── 业务中心（仅持权的）─────────────────────┐
│  [财务中心(MENU_FIN2_CASH)]                 │
│  [库存中心(MENU_WMS_VIEW)]                  │
│  [审批工作台(MENU_WORKFLOW)]                │
│  （客户中心 / 供应商中心 / 数据质量 不显示） │
└────────────────────────────────────────────┘
```

## 4. G10 ETL 升级（业务方反馈联动）

业务方明确了 3 件事：

| 反馈 | 处理 |
|---|---|
| **6/3 没有出库**（不是漏录） | ETL note 字段明示"6.3=0(无出库)" |
| **小数公斤精度需升级** | 新 mig `20260606_g11_inv_qty_numeric.sql`：inv_batches.qty/qty_available + inv_ledger.qty_change 全部升级 INTEGER → NUMERIC(14,3) |
| **苍蝇药 AB 拆 2 SKU** | ETL 识别 "苍蝇药AB / 苍蝇药A B" → 拆 MED-041A 苍蝇药A + MED-041B 苍蝇药B，各 100 袋 |

### 4.1 schema 升级（NUMERIC）

- PG NUMERIC 与 INTEGER +/-/比较自动转换 → service 层零改动
- TypeORM 全部走 raw SQL inv_batches，不影响 entity 映射
- 鸡蛋等历史 INTEGER 数据 17 → 17.000 平滑过渡

### 4.2 G10 mig 同步修补 CI

CI 失败因 `inv_ledger.log_date` 列在 CI 测试库不存在（CI DDL 是简化版 vs 生产端 mig 加的）。
mig § 4 加列存在性守卫：`information_schema.columns WHERE column_name='log_date'` 不存在 → RETURN 跳过。

## 5. 文件清单

| 文件 | 改动 |
|---|---|
| `apps/web/src/app/(admin)/home/page.tsx` | 加 hasQualityPerm / hasCentersPerm 守卫；按权限懒加载；HeroBanner + 业务中心 + 今日要点全部按 perm 渲染 |
| `apps/api/migrations/20260606_g10_mengsai_medicine_initial.sql` | log_date 列存在性守卫；用 NUMERIC qty；苍蝇药拆 2 SKU |
| `migrations/20260606_g10_mengsai_medicine_initial.sql` | 同步根目录 |
| `apps/api/migrations/20260606_g11_inv_qty_numeric.sql`（新）| schema 升级 NUMERIC(14,3) |
| `scripts/g10_etl_mengsai_medicine.py` | 拆苍蝇药 + NUMERIC 字符串 + 6/3 注释 |

## 6. 跑 G10 mig（需用户授权 SSH）

```bash
# 先跑 G11 schema 升级
ssh erp "docker exec -i phoenix-v3-db psql -U phoenix_v3 -d phoenix_erp" \
  < apps/api/migrations/20260606_g11_inv_qty_numeric.sql

# 再跑 G10 数据 ETL
ssh erp "docker exec -i phoenix-v3-db psql -U phoenix_v3 -d phoenix_erp" \
  < apps/api/migrations/20260606_g10_mengsai_medicine_initial.sql
```

CI 部署完后两个 mig 都会跑（CI 测试库 inv_batches 存在但 inv_ledger.log_date 缺，§ 4 守卫直接跳过）。

---

**Tag**：`v3-g11-home-perm`
**改动**：5 文件
**核心收益**：宋明光等业务录入用户的 home 页不再越权显示治理类内容；schema 升级支持小数精度
