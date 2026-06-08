# G38 · 顶级 stranded 字典全量比对补种（F5 系统性收口）

> 承接 G37。触发：G37 修复股东资金抽屉时发现「顶级 migrations 未部署」非孤例，
> 用户要求一次性全量比对补齐。立项日 2026-06-08。映射欠债 F5 + D。

## 一、审计方法（三集合差比）

1. **A = 前端引用**：扫描 `DictSelect dictType=` + `useDictOptions/fetchDictMap` → 19 个 dict_type。
2. **B = 生产已种**：`apps/api/migrations/*.sql` 内 seed 的 dict_type（含 G37 补的 2 个）。
3. **C = 顶级 seed**：`migrations/*.sql`（生产 Deploy 不跑）。
4. **缺口 = A − B**：前端在用但生产没有。

## 二、缺口清单（A−B = 8 类）

| dict_type | 用途 / 页面 | 顶级有值? | 处理 |
|-----------|------------|-----------|------|
| FIN_PAYER_TYPE | 付款单·付款方类型 | ✅ g4a | 原样搬运（注意与生产已存的 PRC_PAYER_TYPE 命名并存，前端用 FIN_*） |
| PRC_URGENCY | 采购·紧急程度 | ✅ g4b | 原样搬运 |
| PRC_QUALITY_STATUS | 采购·收货质检状态 | ✅ g4b | 原样搬运 |
| SAL_RETURN_REASON | 销售·退货原因 | ✅ g4c | 原样搬运 |
| SAL_PAY_METHOD | POS·收款方式 | ✅ g4c | 原样搬运 |
| SAL_DELIVERY_EXCEPTION | 配送·异常类型 | ✅ g4c | 原样搬运 |
| **BRD_VACCINE_TYPE** | 免疫页·疫苗种类 | ❌ 无 | 蛋鸡行业标准默认 9 项打底 ⚠️ |
| **BRD_VACCINATE_METHOD** | 免疫页·接种方式 | ❌ 无 | 蛋鸡行业标准默认 7 项打底 ⚠️ |

已在生产、无需处理的 11 类：BRD_CULLING_REASON / BRD_MORTALITY_REASON / BRD_HOUSE_TYPE /
BRD_SHIFT / FIN_CONTRIBUTION_TYPE(G37) / FIN_EXPENSE_TYPE / FIN_FUND_NATURE /
FIN_RECEIPT_METHOD(G37) / PRC_PAYMENT_METHOD / PRC_PURCHASE_TYPE / SYS_CURRENCY。

→ 19 = 11(已有) + 8(本次补) ，全部前端引用的字典已覆盖。

## 三、改动

- `apps/api/migrations/20260608_g38_stranded_dict_reseed.sql` — 幂等补种 8 类（沿用 G2 列范式 + NOT EXISTS）。

## 四、⚠️ 需业务/兽医确认

`BRD_VACCINE_TYPE` / `BRD_VACCINATE_METHOD` 顶级与生产都无既有值，本迁移用蛋鸡行业**通用默认**打底（新城疫/禽流感/IB/IBD/鸡痘/马立克/减蛋综合征/喉气管炎；饮水/滴鼻点眼/皮下/肌注/喷雾/刺翼）。
这些是业务枚举，**请兽医/生产确认并在「字典管理」页增改**——字典可编辑，默认值不锁死。

## 五、部署

生产 Deploy 自动跑 `apps/api/migrations/2026*.sql`，G37+G38 下次部署即生效。
若需立即生效，在生产库执行（幂等，符合 sys_dict 保护规则·仅 INSERT 不存在项）：

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/migrations/20260608_g37_finance_dict_reseed.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/migrations/20260608_g38_stranded_dict_reseed.sql
```

## 六、验证

- 迁移本身为纯 sys_dict 幂等 INSERT，不改代码 → 无 tsc 影响（API/Web tsc 仍 0，承自 G37）。
- 本地实跑被 agent 权限策略拦截（DB 写入需用户确认），未代跑。
- 运行后冒烟：付款单「付款方类型」、采购质检、销售退货/POS 收款/配送异常、免疫页疫苗/接种方式下拉应均有选项。
