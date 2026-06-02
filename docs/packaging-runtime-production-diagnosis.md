# 包装库存链路 — 生产库诊断 Runbook（P1E 第一步）

> **用途**：确认生产库是否存在 schema drift（pkg_packing_records 缺 shift_id / grading_codes_json）。
> **执行方**：按约定生产命令由用户在生产服务器执行后回贴（不开放 agent 生产 SSH）。
> **结论无论如何**：P1E 已提供幂等迁移 `20260602_packaging_runtime_schema_recovery.sql`，
> 下次部署会自动补齐缺失字段——本诊断用于**确认修复是否已生效 / 是否曾存在 drift**。

---

## 诊断 SQL（生产库执行）

```sql
-- ① 关键：字段是否存在（P0 判定）
SELECT column_name FROM information_schema.columns
 WHERE table_name='pkg_packing_records' AND column_name IN ('shift_id','grading_codes_json');

-- ② 近 7 天包装记录 + 是否带 shift_id
SELECT COUNT(*) AS recs, COUNT(shift_id) AS with_shift, MAX(created_at)::date AS latest
  FROM pkg_packing_records WHERE created_at >= NOW() - INTERVAL '7 days';

-- ③ 是否已有包装来源可售库存（收口是否已生效）
SELECT COUNT(*) AS pkg_batches, COALESCE(SUM(qty_available),0) AS avail
  FROM inv_batches WHERE source_type='PACKAGING' AND legacy_source IS NULL;

-- ④ pkg_work_shifts.site_id（SITE 灰度解析依赖）
SELECT site_id, COUNT(*) FROM pkg_work_shifts
 WHERE production_date >= CURRENT_DATE - 7 GROUP BY site_id;

-- ⑤ 当前库存来源模式
SELECT scope_level, scope_code, mode FROM inv_source_mode ORDER BY 1,2;
```

---

## 判定标准

| 诊断 | 期望 / 含义 |
|------|------------|
| ① | 返回 **2 行**（shift_id + grading_codes_json）= 无 drift / 已修复；返回空或缺 shift_id = **存在 drift**，需部署本期迁移 |
| ② | recs>0 且 with_shift≈recs = 包装流正常带班次；with_shift=0 而 recs>0 = 历史记录无班次（迁移后新记录会带） |
| ③ | >0 = 收口已在生产产出库存；=0 = 尚未产出（未切 PACKAGING_INBOUND 或链路未生效） |
| ④ | 目标灰度场站（孟赛）应出现对应 site_id；空 = SITE 模式解析会回落 COMPANY/GROUP |
| ⑤ | 期望 `GROUP/ALL=TEMP_PRODUCTION_INBOUND`（过渡）；灰度后出现 `SITE/<场站>=PACKAGING_INBOUND` |

---

## 本地参照结果（开发库，2026-06-02）

> 本地库滞后，用于交叉印证 drift 成因，**不代表生产**。

- ① **修复前：返回 0 行**（shift_id / grading_codes_json 均缺失）→ 复现了 P1D 判定的 drift 成因。
- 跑 `20260602_packaging_runtime_schema_recovery.sql` 后：**返回 2 行**（两列补齐），二次执行幂等（NOTICE skip）。
- `completeTerminalPacking` 主 SELECT（含 shift_id）修复后可正常执行。
- ⑤ 本地：`GROUP/ALL=TEMP_PRODUCTION_INBOUND`（P1A 默认）。

---

## 结论

- **CI deploy.yml 迁移 glob 仅 `migrations/2026*.sql`，不含 v6/v7** → 这是 drift 根因（已在 P1E 报告详述）。
- 本期迁移以 `2026` 前缀落地，**保证生产 CI 自动执行**，无需手工改库。
- 请执行上方 ① 诊断回贴：
  - 若返回 2 行 → 生产已无 drift（或本次部署已修复），可进入孟赛灰度前置检查。
  - 若缺列 → 确认 drift；本次部署后将自动补齐，部署后再次执行 ① 确认。
