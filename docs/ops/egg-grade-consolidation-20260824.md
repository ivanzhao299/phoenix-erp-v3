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

## 6. 生产执行记录（2026-08-24）

### 6.1 授权与安全边界

- 用户明确授权两项写入：`product_grades.BROKEN` 中文名统一为“破损蛋”，以及严格按第 4 节条件回填可验证的 `brd_daily_logs.eggs_by_grade`。
- 执行通过 `production` environment、`approve_production=true`、精确确认词 `CONSOLIDATE_BROKEN_GRADE_AND_BACKFILL_VERIFIED_ROWS` 和不可取消 concurrency group 完成。
- 两个 UPDATE 各自事务；回填同时受 `eggs_by_grade IS NULL`、候选 N、行锁、RETURNING 数量和 DIRTY/BROKEN 对账约束。没有写入 `GRADE_1..5`，没有修改已有 JSON，也没有修改历史 sys_dict。

### 6.2 只读预检

- 成功 run：`32714523640`（双层只读：`PGOPTIONS default_transaction_read_only=on` + `BEGIN TRANSACTION READ ONLY`）。
- `product_grades` 全量 18 行：9 个 ACTIVE 现行档 + 9 个 DEPRECATED 历史档。ACTIVE 为 `GRADE_1..5/DIRTY/CRACKED/BROKEN/DAMAGED`；BROKEN 唯一、ACTIVE、更新前名称“破蛋”、`is_saleable=false`、`sort_order=80`。
- `sys_dict` 中未找到 `PKG_EGG_GRADE/PKG_EGG_DEFECT` 的 BROKEN 镜像行，因此无废弃字典行可列、也未做任何字典写入。
- `brd_daily_logs`：`total=63`、`already_filled=22`、`missing_positive=38`、`bad_only_rows=0`、精确 UPDATE 条件 `candidate_n=0`。候选清单和 bad-only 人工清单均为空。
- 初次 run `32713435136` 因把“9 个 ACTIVE 档”误断言成“物理全表 9 行”而停止；日志确认实际是 9 ACTIVE + 9 DEPRECATED 后修正口径，全程只读、未触发写入。

### 6.3 两个 UPDATE 的 RETURNING 审计

- 首次有效执行 run `32714587854`：主数据事务锁定 `id=7/BROKEN/破蛋/ACTIVE`，UPDATE RETURNING 为 `id=7, grade_code=BROKEN, grade_name=破损蛋`，行数 1，随后提交。
- 历史回填同一 run 的独立事务：预检 N=0，锁定候选 0 行，UPDATE RETURNING=0，受影响集合内对账不一致=0，提交后 `already_filled` 仍为 22。生产没有可验证行，故没有制造任何 JSON。
- 完整成功复核 run `32715385073`：命名 UPDATE 因已完成而 RETURNING=0（幂等正常）；回填继续 RETURNING=0。立即只读复核和间隔 1 分钟复核均通过，BROKEN 为“破损蛋”/ACTIVE，remaining candidate=0。
- 中间 run `32714587854`、`32715099732`、`32715252141` 的写后只读步骤曾分别暴露 SSH 环境变量透传和只读事务 TEMP CTAS 问题；所有写事务在这些重跑中均受相同断言保护，除第一次名称更新 1 行外，其余均为 0 行幂等执行。最终 workflow 改用 transaction-local setting，保持复核事务无 DDL 且强制只读。

### 6.4 复核抽样、人工清单与回滚

- 回填 N=0，所以不存在“前后抽样 5 行”；workflow 如实输出 0 行，而不是用无关记录凑样本。
- bad-only 清单为 0 行；没有可交付业务人工判定的记录。
- 第 4 节全局对账 SELECT 在只读 run `32715697099` 返回 12 条既有不一致并按设计使 workflow 失败。它们均为已有 `eggs_by_grade` 行，不属于本次授权的 `eggs_by_grade IS NULL` 回填集合，因此未修改：
  - ids `45,46,48,53,54,55,56,62,63`：标量 `dirty_eggs=1, broken_eggs=1`，JSON 只有可售档；
  - id `59`：标量 `dirty_eggs=60, broken_eggs=0`，JSON 只有可售档；
  - id `64`：标量均为 0，JSON 为 `DIRTY=1/BROKEN=1/CRACKED=1/DAMAGED=1/GRADE_1=100`；
  - id `66`：标量 `dirty_eggs=1, broken_eggs=1`，JSON 为 `DIRTY=3/GRADE_1=100`。
- 上述 12 行需要另行确认“JSON 权威还是兼容标量权威”后才能修复；本轮红线禁止覆盖已有 JSON，故全局“0 不一致”目标如实记为未达成，而本次 N=0 回填集合自身为 0 不一致。
- 回填受影响 ID 清单为空，故无需回滚。留档的零影响回滚形式为：

```sql
UPDATE brd_daily_logs
SET eggs_by_grade = NULL
WHERE id IN (NULL) AND eggs_by_grade IS NOT NULL; -- 影响 0 行；N=0 时仅作模板留档
```

- 若仅需撤销本次主数据命名（不建议在无新授权时执行），精确回滚 SQL 为：

```sql
UPDATE product_grades
SET grade_name = '破蛋', updated_at = NOW()
WHERE id = 7 AND grade_code = 'BROKEN' AND grade_name = '破损蛋';
```

### 6.5 代码、CI 与部署

- `usePackagingDicts` 与 `useProductGrades` 的 BROKEN fallback 已统一为“破损蛋”；仓库不存在含“破蛋”期望值的相关测试或快照，现有 `BROKEN` code 协议测试无需修改。
- PR `#60/#62/#63/#64/#65/#66/#67` 记录了 workflow 安全门、生产实况断言、只读复核修正与执行报告。PR `#67` CI 全绿：Type-check & Regression、Typecheck/Build/Basic Tests、Vitest、regression、Runtime Smoke、Static Security And Freeze Gates 均通过。
- 显式生产 Web 部署 run `32716049443` 成功：`mode=web`、`approve_production=true`；Type-check & Regression 通过，Web 镜像构建并推送，Deploy · web 成功且容器 Healthy。
- 只读 revision 证据：部署 checkout、镜像 `org.opencontainers.image.revision`、镜像 tag 与 `TARGET_SHA` 均为 `59c462f6423eebf0bf175e4967abd48330ab981b`；生产仓库从 `8defe9e3` 快进到 `59c462f6`，Web 容器健康。

### 6.6 JSONB 覆盖标量执行记录（2026-08-25）

#### 授权与执行边界

- 用户明确授权仅处理 6.4 节的 12 行（ids `45,46,48,53,54,55,56,59,62,63,64,66`），以 `eggs_by_grade` 为权威重算 `dirty_eggs/broken_eggs`；`eggs_produced` 与 `eggs_by_grade` 均不修改。
- 生产 run `32793202240`（commit `67d3107d`）通过 `production` environment、`approve_production=true`、精确确认词 `RECONCILE_12_EGG_GRADE_SCALARS_FROM_JSONB` 和不可取消 concurrency group 执行，结论为 success。
- 预检使用 `PGOPTIONS default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY` 双重只读。写事务先按 ID `FOR UPDATE`，再断言锁定集合恰为 12 行、ID 完全一致、JSONB 全部非 NULL、12 行仍全部不一致；随后仅更新两列兼容标量并按既定 SQL 刷新 `updated_at`。任何断言失败均由 `ON_ERROR_STOP` 终止并回滚事务。

#### 预检 12 行及目标值

| id | log_date | house_code | shift | dirty 原值→目标 | broken 原值→目标 | eggs_produced | eggs_by_grade |
|---:|---|---|---|---:|---:|---:|---|
| 45 | 2026-07-27 | HOUSE_CS_02 | 早班 | 1→0 | 1→0 | 10 | `{"GRADE_1":10}` |
| 46 | 2026-07-27 | HOUSE_CS_02 | 晚班 | 1→0 | 1→0 | 10 | `{"GRADE_1":9,"GRADE_2":1}` |
| 48 | 2026-07-27 | H-DEBUG-A01 | 早班 | 1→0 | 1→0 | 20 | `{"GRADE_1":10,"GRADE_2":10}` |
| 53 | 2026-07-27 | HOUSE_MS_06 | 晚班 | 1→0 | 1→0 | 10 | `{"GRADE_1":10}` |
| 54 | 2026-07-27 | HOUSE_MS_06 | 早班 | 1→0 | 1→0 | 10 | `{"GRADE_1":10}` |
| 55 | 2026-07-27 | HOUSE_MS_03 | 晚班 | 1→0 | 1→0 | 10 | `{"GRADE_1":10}` |
| 56 | 2026-07-27 | HOUSE_MS_03 | 早班 | 1→0 | 1→0 | 10 | `{"GRADE_1":10}` |
| 59 | 2026-08-19 | HOUSE_MS_01 | 早班 | 60→0 | 0→0 | 0 | `{"GRADE_2":180,"GRADE_3":1080,"GRADE_4":8280}` |
| 62 | 2026-08-20 | HOUSE_CS_03 | 早班 | 1→0 | 1→0 | 100 | `{"GRADE_1":100}` |
| 63 | 2026-08-20 | HOUSE_CS_03 | 晚班 | 1→0 | 1→0 | 100 | `{"GRADE_1":100}` |
| 64 | 2026-08-24 | HOUSE_CS_03 | 晚班 | 0→1 | 0→1 | 104 | `{"DIRTY":1,"BROKEN":1,"CRACKED":1,"DAMAGED":1,"GRADE_1":100}` |
| 66 | 2026-08-24 | H-DEBUG-A01 | 早班 | 1→3 | 1→0 | 100 | `{"DIRTY":3,"GRADE_1":100}` |

预检返回恰好 12 行，ID 数组与授权清单完全一致，且每行 `eggs_by_grade` 非 NULL。特别地，id 64 仅将 dirty/broken 改为 1/1，`eggs_produced=104` 保持不动。

#### UPDATE RETURNING 与前后抽样

- `UPDATE RETURNING` 恰好 12 行：ids 45/46/48/53/54/55/56/59/62/63 均为 `dirty=0, broken=0`；id 64 为 `1,1`；id 66 为 `3,0`。逐行结果均与事务内原值快照计算出的目标相同，事务提交。
- 三行前后抽样：id 45 为 `dirty 1→0, broken 1→0`；id 64 为 `0→1, 0→1`；id 66 为 `1→3, 1→0`。三行的 `eggs_produced` 和 `eggs_by_grade` 均保持原值。

#### 全表只读复核

- 提交后立即重跑 6.4 节全局对账：`global_mismatch_n=0`。
- 同一只读事务确认：`bad_only_n=0`、`remaining_candidate_n=0`。
- 间隔 60 秒再次只读复核：`global_mismatch_n=0`，未发生并发写回。至此分级历史数据三项检查全面干净。

#### 回滚 SQL 留档

下列语句由写事务锁定后的 12 行原值快照生成，仅在另行授权回滚时使用：

```sql
UPDATE brd_daily_logs
SET dirty_eggs = CASE id
      WHEN 45 THEN 1 WHEN 46 THEN 1 WHEN 48 THEN 1 WHEN 53 THEN 1
      WHEN 54 THEN 1 WHEN 55 THEN 1 WHEN 56 THEN 1 WHEN 59 THEN 60
      WHEN 62 THEN 1 WHEN 63 THEN 1 WHEN 64 THEN 0 WHEN 66 THEN 1
    END,
    broken_eggs = CASE id
      WHEN 45 THEN 1 WHEN 46 THEN 1 WHEN 48 THEN 1 WHEN 53 THEN 1
      WHEN 54 THEN 1 WHEN 55 THEN 1 WHEN 56 THEN 1 WHEN 59 THEN 0
      WHEN 62 THEN 1 WHEN 63 THEN 1 WHEN 64 THEN 0 WHEN 66 THEN 1
    END,
    updated_at = NOW()
WHERE id IN (45,46,48,53,54,55,56,59,62,63,64,66);
```

本次为纯生产数据修正与执行留档，无应用代码改动，因此未触发应用部署。
