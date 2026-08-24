# 鸡蛋分级口径核查与 mobile 合并闭环（2026-08-24）

## 1. 结论

- 唯一权威源是 `product_grades` 的 ACTIVE 行。代码/末态迁移定义 9 档：`GRADE_1..GRADE_5`（可售）以及 `DIRTY/CRACKED/BROKEN/DAMAGED`（缺陷）。历史 `sys_dict.PKG_EGG_GRADE` 已废弃，包装 BFF 也已改读 `product_grades`。
- mobile 原先同时写 `bad_eggs`（破损）与 `broken_eggs`（碎蛋），且完全不写 `eggs_by_grade`，是 mobile 与 PC 无法对账的直接原因。
- 本次 mobile 只保留“脏蛋、破损蛋”，破损蛋同时写 `broken_eggs` 和 `eggs_by_grade.BROKEN`，脏蛋同时写 `dirty_eggs` 和 `eggs_by_grade.DIRTY`，停止写 `bad_eggs`。
- mobile 只知道可售总数而不知道 `GRADE_1..5` 的真实拆分，因此 `eggs_produced` 保留显式总数，JSON 只写真实已知的 `DIRTY/BROKEN`，不伪造五档分布。
- 包装交班和 PC 包装日报原有旧 A/B 命名或空分级展示已改为 `product_grades` 动态 9 档。

## 2. 审计矩阵

| 面 | 入口/实现 | 读取/写入 | 权威性与问题 |
|---|---|---|---|
| 权威源 | `apps/api/migrations/20260609_g67_egg_grade_unify_packaging.sql:21-35` | `GRADE_1..5` ACTIVE；缺陷 4 档继续 ACTIVE | 末态 canonical 9 档 |
| 权威 API | `apps/api/src/modules/product-master/services/product-master.service.ts:79-85` | ACTIVE `product_grades`，按 sort 排序 | 正确 |
| 前端统一 hook | `apps/web/src/hooks/useProductGrades.ts:6-20,52-64` | `/api/lookup/product-grades` | 正确；fallback 与 9 档一致 |
| 历史字典 | `apps/api/migrations/20260605_glp1a2_production_extension.sql:46-73`、`apps/api/migrations/20260606_g5_cleanup_pkg_egg_grade_deprecated.sql:22-27` | 旧 `PKG_EGG_GRADE` 7 档后整体 DEPRECATED | 不再是运行时来源 |
| mobile 产蛋录入（修前） | `apps/web/src/app/(mobile)/mobile/egglog/page.tsx` | `bad/dirty/broken` → 三个标量，无 JSON | 断链、破损/碎蛋语义分裂 |
| mobile 产蛋录入（修后） | `apps/web/src/app/(mobile)/mobile/egglog/page.tsx:72-85,210-218,407-431` | 只写 `dirty/broken`，通过 payload helper 补 JSON | 已接入权威 code |
| mobile payload | `apps/web/src/lib/egglog-payload.ts:9-35` | `eggs_produced` + `DIRTY/BROKEN` 双写；无 `bad_eggs` | 不伪造可售档 |
| PC 日生产日报 | `apps/web/src/app/(admin)/breeding/daily/page.tsx:270-340` | 9 档表单写 `eggs_by_grade`，同时写兼容标量 | 正确，等级来自 hook |
| 日报后端 | `apps/api/src/modules/farm/farm.service.ts:187-203` | JSON 为权威；按 ACTIVE 可售档派生总量，按 DIRTY/BROKEN 派生标量 | 派生方向明确 |
| 日产蛋入库 | `apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx:34-44,56-95,116-145` | 只取可售档，写 inventory items | 正确，不应录缺陷档 |
| 包装分级台 | `apps/web/src/app/(terminal)/terminal/packaging/grading/page.tsx:39-46,170-183` | product_grades 映射后写 `outputs_json` | 独立包装台账，code 对齐 |
| 包装交班（修前） | `apps/web/src/app/(terminal)/terminal/packaging/shift-close/page.tsx` | A大/A中/A小/B/破损/脏污硬编码 | 旧口径 |
| 包装交班（修后） | 同文件 `:23,63-77,286-289` | 全部 ACTIVE 主数据名称 + outputs code | 已统一 |
| PC 包装日报（修前） | `apps/web/src/app/(admin)/packaging/daily-report/page.tsx` | 接收量冒充包装量，`by_grade=[]` | 分级永远不可见 |
| PC 包装日报（修后） | 同文件 `:46-97,173-187` | 包装量读 `shiftPackedEggs`，9 档读 `gradingOutputs` | 已统一 |
| QC 首检 | `apps/web/src/app/(terminal)/terminal/packaging/qc-inspection/page.tsx:37-81` | 抽样缺陷字段，不写日报 JSON | QC 指标，保留不动 |
| 日生产日报展示 | `apps/api/src/modules/farm/farm.service.ts:565-627` | 总量/脏/破读兼容标量 | 与后端派生字段一致 |
| 日报分级预填 | 同文件 `:458-535` | 聚合 JSON，主数据补齐 9 档 | 正确；可暴露缺分级历史行 |
| 首页 KPI | `apps/api/src/modules/bff/bff.controller.ts:104-128` | `eggs_produced` | 总量 KPI，合理 |
| 包装日报 API | `apps/api/src/modules/terminal/packaging.service.ts:845-887` | 展开 JSON 等级 code | code 正确，名称交给主数据 |
| Sales2 库存分析 | `apps/api/src/modules/sales-v2/services/sales-analytics.service.ts:739-751` | 仍读 `quality_grade` | 潜在旧库存口径，未在本次无证据改动 |
| Production analytics | `apps/api/src/modules/analytics/services/production-analytics.service.ts:22-80` | `eggs/broken_eggs/dirty_eggs` 旧标量 | 另有表/字段语义风险，未在本次盲改 |

本机 PostgreSQL 与 compose 未运行，无法在本地读取实际生产 9 档；部署后的生产核验必须用只读 SQL 再确认实际 ACTIVE 行及历史 sys_dict 状态。

## 3. 问题清单与处理

1. **字段映射断链**：mobile 不写 JSON。已修复。
2. **重复缺陷语义**：`bad_eggs` 与 `broken_eggs` 同时由 UI 输入，可能双计。新写入停止 `bad_eggs`；列继续兼容历史。
3. **派生方向冲突**：后端明确仅在调用方未显式给标量时由 JSON 派生；mobile 显式给 `eggs_produced` 是因为它没有真实可售五档拆分。
4. **包装旧命名**：交班页还读 `A_LARGE/A_MEDIUM/A_SMALL/B`。已换成主数据 9 档。
5. **包装日报空分级**：页面丢弃后端已有 `gradingOutputs`。已恢复并纠正“包装量=接收量”的错误。
6. **名称细节**：仓库历史 seed 对 BROKEN 使用“破蛋”，PC 日报业务标签使用“破损蛋”。运行时展示仍以生产 `product_grades.grade_name` 为准；本次不绕过主数据强改生产名称。mobile 的操作标签按 PC 语义显示“破损蛋”。
7. **未纳入改动**：QC 抽检、WMS 破损、销售退货中的“破损”是业务状态/损耗，不是鸡蛋 9 档录入，不能机械替换。

## 4. 历史数据修正方案（仅方案，禁止直接生产执行）

历史数据无法从总量可靠反推 `GRADE_1..5`。`bad_eggs` 还可能表示 `dirty+broken` 总缺陷，禁止与细分列相加。建议先只读审计：

```sql
BEGIN TRANSACTION READ ONLY;

SELECT grade_code, grade_name, is_saleable, sort_order, status
FROM product_grades
ORDER BY sort_order, grade_code;

SELECT dict_type, dict_code, name, dict_label_zh, sort_no, status
FROM sys_dict
WHERE dict_type IN ('EGG_GRADE','PKG_EGG_GRADE','PKG_EGG_DEFECT','PRD_PRODUCT_GRADE')
ORDER BY dict_type, sort_no, dict_code;

SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE eggs_by_grade IS NOT NULL) AS already_filled,
  COUNT(*) FILTER (WHERE eggs_by_grade IS NULL AND eggs_produced > 0) AS missing_positive,
  COUNT(*) FILTER (
    WHERE eggs_by_grade IS NULL AND COALESCE(bad_eggs,0) > 0
      AND COALESCE(dirty_eggs,0)=0 AND COALESCE(broken_eggs,0)=0
  ) AS bad_only_rows
FROM brd_daily_logs;

COMMIT;
```

经业务确认和另行授权后，只能自动回填“不含未知可售档、且 dirty/broken 可验证”的行；任何已有 JSON 均不覆盖：

```sql
BEGIN;

UPDATE brd_daily_logs
SET eggs_by_grade = jsonb_strip_nulls(jsonb_build_object(
  'DIRTY',  NULLIF(GREATEST(COALESCE(dirty_eggs,0),0),0),
  'BROKEN', NULLIF(GREATEST(COALESCE(broken_eggs,0),0),0)
))
WHERE eggs_by_grade IS NULL
  AND eggs_produced >= 0
  AND COALESCE(dirty_eggs,0) + COALESCE(broken_eggs,0) = eggs_produced
  AND (COALESCE(dirty_eggs,0) > 0 OR COALESCE(broken_eggs,0) > 0);

-- 核验结果为 0 行才允许提交；否则 ROLLBACK。
SELECT id, log_date, house_code, shift, dirty_eggs, broken_eggs, eggs_by_grade
FROM brd_daily_logs
WHERE eggs_by_grade IS NOT NULL AND (
  COALESCE((eggs_by_grade->>'DIRTY')::int,0) <> COALESCE(dirty_eggs,0)
  OR COALESCE((eggs_by_grade->>'BROKEN')::int,0) <> COALESCE(broken_eggs,0)
);

ROLLBACK; -- 首次演练固定回滚；审阅结果后另开变更单执行
```

存在真实可售量但没有五档明细的历史行必须保持 `NULL`，继续由 `missingBreakdownLogs` 暴露；禁止塞入 `GRADE_1` 或自造 `UNSPECIFIED`。

## 5. 回归与生产验证

- 单元回归：`egglog-payload.test.ts` 锁定 mobile 不再出现 `bad_eggs`、BROKEN/DIRTY 双写以及不伪造可售档；包装静态回归锁定交班页读取主数据。
- 类型检查：Web/API `tsc --noEmit`。
- 全量 Web/API 测试与现有 scope/constraint 门禁均需在提交前执行。
- 生产部署后只做：健康检查、只读 product_grades/sys_dict 查询、只读抽查新版本发布后真实业务自然产生的日报行。红线禁止主动提交测试业务数据，因此不执行“造一笔再清理”。
- mobile→PC 对账判定：同一 `house_code + log_date + shift`，`broken_eggs = eggs_by_grade->BROKEN`、`dirty_eggs = eggs_by_grade->DIRTY`、`bad_eggs` 不因新 mobile 写入增加；PC 日报显示的破损/脏蛋与这两个值一致，包装端按相同 grade code 展示。

本地执行结果：

- Web `tsc --noEmit`：通过。
- API `tsc --noEmit`：通过。
- Web 全量 Vitest：78 files / 436 tests 全部通过。
- API 相关 Jest：4 suites / 26 tests 全部通过。
- Web production build、API build：通过。
- `check-constraint-drift.js`：0 new drift；`check-nullable-in-unique.js`：0 违规；`check-entity-drift-baseline.sh`：0 漂移。
- 字段真审计：mobile egglog 中无 `bad_eggs` 提交、无“碎蛋”输入、无 A大/A中/A小/B 旧等级展示；全 Web 未发现以裸 input 直接写 `bad_eggs/broken_eggs/dirty_eggs` 的模式。
- 仓库全量 lint 未通过：当前基线为 807 errors / 469 warnings，错误广泛存在于未改文件（React 19 hooks 规则、历史 `any` 等）；本次前后端类型检查、构建和测试均通过，未把全仓历史 lint 债务混入本变更。
