# g198 — 历史脏数据多版本残留风险审计 + 整改方案

> **触发事件**:2026-06-19,chanjet_ar_snapshot 出现 32 行 × 2 副本残留(用户截图 64 行)。
> **根因**:PostgreSQL `NULL ≠ NULL` 规则。唯一约束含 nullable 列时,nullable 列写 NULL → ON CONFLICT 永不匹配 → 每次 upsert 都插入新副本。
> **本次审计目的**:在 chanjet 之外,把全系统同类风险扫一遍,系统性堵漏。

---

## 一、扫描范围与方法

| 维度 | 范围 | 找到数 |
|------|------|------|
| Entity `@Unique('...', [...])` 多列约束 | `apps/api/src/**/*.entity.ts` | **13 条** |
| Entity `@Column({ unique: true })` 单列 | 同上 | **30 条** |
| ORM `.upsert(` 调用 | `apps/api/src/**/*.service.ts` | **0 条**(本项目走 raw SQL ON CONFLICT 或 save) |
| 裸 SQL `ON CONFLICT` | 同上 | 34 处(Explore 已抽样) |

方法:对每条唯一约束,逐列核对 entity 的 `nullable:` 字段;对 service 写入路径,核对约束列是否可能写 NULL。

---

## 二、风险等级分类总表

| # | 表 / 约束 | 涉及 nullable 列 | Service 是否真写 NULL | 等级 |
|---|-----------|-----------------|----------------------|------|
| 1 | `chanjet_ar_snapshot` / `uq_chanjet_ar_v2` | `assistantCustomerCode`, `subjectId` | **是**(行 203 `r.subjectId ? ... : null`) | 🔴 已发生 |
| 2 | `prc2_projects` / `uq_prc2_projects_company_project` | `companyCode` | 待 service 核查 | 🔴 高危 |
| 3 | `prc2_ap_ledger.po_id` 单列 unique+nullable | `po_id` | 无 upsert,业务允许多 NULL | 🟡 业务正确 |
| 4 | `chanjet_book_company_map.company_code` 单列 unique | 非 nullable | — | 🟢 |
| 5 | `wms_stock_balance` / 四列约束 | 都 NOT NULL | — | 🟢 |
| 6 | `sys_user_org` / `uq_user_org` | 都 NOT NULL | — | 🟢 |
| 7 | `sys_user_farm_scope` / `uq_user_farm` | 都 NOT NULL | — | 🟢 |
| 8 | `sys_user_project_scope` / `uq_user_project` | 都 NOT NULL | — | 🟢 |
| 9 | `sys_user_warehouse_scope` / `uq_user_warehouse` | 都 NOT NULL | — | 🟢 |
| 10 | `sys_data_scope` / `uq_data_scope_role_module` | 都 NOT NULL | — | 🟢 |
| 11 | `shr_beneficial_equity` / 三列约束 | 都 NOT NULL | — | 🟢 |
| 12 | `shr_project_equity` / 两列约束 | 都 NOT NULL | — | 🟢 |
| 13 | `sys_role_menu_permission` / 两列约束 | 都 NOT NULL | — | 🟢 |
| 14 | `sys_role_conflict` / `menu_a, menu_b` | 都 NOT NULL | — | 🟢 |
| 15 | `fin_ar_ledger` / `uq_fin_ar_ledger` | farmCode/counterpartyName/periodDate **都 NOT NULL** | — | 🟢 |

> 📝 Explore agent 第一轮把 fin_ar_ledger 标"中危",经核验三列都 NOT NULL,**实际安全**。

---

## 三、高危项详情

### 🔴 #1 — chanjet_ar_snapshot(已修一半,还差一半)

**文件**:`apps/api/src/modules/chanjet/chanjet-ar-snapshot.entity.ts:12`
```ts
@Unique('uq_chanjet_ar_v2', ['bookid', 'period', 'deptCode', 'assistantCustomerCode', 'subjectId'])
```

| 约束列 | 当前 | 修复后期望 |
|--------|------|-----------|
| bookid | NOT NULL ✓ | — |
| period | NOT NULL ✓ | — |
| deptCode | **已修 NOT NULL DEFAULT ''** (1781835697682) | — |
| assistantCustomerCode | **nullable: true** | NOT NULL DEFAULT '' |
| subjectId | **nullable: true** | NOT NULL DEFAULT '' |

**Service 写入路径**(`chanjet-ar-sync.service.ts`):
- 行 188 已过滤 `r.assistantCustomerCode` 为 falsy 的整行(✓ assistantCustomerCode 实际进不到 NULL)
- 行 203 `subjectId: r.subjectId ? String(r.subjectId) : null` — **NULL 漏洞**

**结论**:assistantCustomerCode 路径已堵,**subjectId 仍可写 NULL**。chanjet 接口实际每行都带 subjectId(科目 ID),但 entity/约束层是兜底,不能依赖业务数据"应该有"。

---

### 🔴 #2 — prc2_projects

**文件**:`apps/api/src/modules/procurement-v2/entities/prc2-project.entity.ts:8`
```ts
@Unique('uq_prc2_projects_company_project', ['companyCode', 'projectCode'])
// L21
@Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
companyCode: string;
```

**风险**:同一 `projectCode` 在 `companyCode IS NULL` 时可无限重复(因为 NULL ≠ NULL)。

**讽刺**:同文件 `@Index('idx_prc2_proj_company', ['companyCode'], { where: '"company_code" IS NOT NULL' })` 已经知道用 partial,但**唯一约束没用 partial**。

**修复方向二选一**:
- **方案 A**(干净):`company_code` 改 NOT NULL DEFAULT ''(若业务一定有归属公司)
- **方案 B**(保留 NULL 语义):删 `@Unique` 装饰器 → 用 partial unique index `WHERE company_code IS NOT NULL`(允许"无公司项目"自由,但有公司时仍唯一)

需 PM 拍板 prc2_projects 是否允许"无公司项目"。如果项目必须挂公司 → 方案 A;如果允许"全局公共项目" → 方案 B。

---

### 🟡 #3 — prc2_ap_ledger.po_id

```ts
@Column({ name: 'po_id', type: 'bigint', nullable: true, unique: true })
```

**业务**:手工创建的 AP 没有 PO,po_id=NULL 多行合理。PG 允许多 NULL 行 = **业务正确**。

**风险防范**:无 service 在 po_id 上做 upsert(扫描 grep 命中 0)。仅作记录,不需要修。

> 如果将来有人想在 prc2_ap_ledger 上做 `ON CONFLICT (po_id)` upsert,**会立刻踩坑**。在 CLAUDE.md 里加一条铁律说明。

---

## 四、整改方案

### P0 — 立即修(本周完成)

#### P0-1 收紧 chanjet_ar_snapshot 剩余两列

**迁移文件**:`apps/api/src/database/migrations/<ts>-FixChanjetArSnapshotRemainingNullableUq.ts`

```sql
-- 1) 写 NULL → 占位
UPDATE chanjet_ar_snapshot
SET assistant_customer_code = COALESCE(assistant_customer_code, ''),
    subject_id              = COALESCE(subject_id, '')
WHERE assistant_customer_code IS NULL OR subject_id IS NULL;

-- 2) 按 5 字段去重(理论上经 1781835697682 已清,但兜底再跑一次)
DELETE FROM chanjet_ar_snapshot a
USING chanjet_ar_snapshot b
WHERE a.id < b.id
  AND a.bookid = b.bookid
  AND a.period = b.period
  AND a.dept_code = b.dept_code
  AND a.assistant_customer_code = b.assistant_customer_code
  AND a.subject_id = b.subject_id;

-- 3) ALTER 列
ALTER TABLE chanjet_ar_snapshot
  ALTER COLUMN assistant_customer_code SET DEFAULT '',
  ALTER COLUMN assistant_customer_code SET NOT NULL,
  ALTER COLUMN subject_id              SET DEFAULT '',
  ALTER COLUMN subject_id              SET NOT NULL;
```

**配套 entity**:`nullable: true` → `default: ''`,类型 `string | null` → `string`。

**配套 service**(行 201-203):
```ts
assistantCustomerCode: r.assistantCustomerCode ?? '',
assistantCustomerId:   r.assistantCustomer ? String(r.assistantCustomer) : '',
subjectId:             r.subjectId ? String(r.subjectId) : '',
```

#### P0-2 修 prc2_projects

**等用户/PM 拍板方案 A vs B**(本报告下方"待决策"列出)。无论选哪个,均需:

- 写迁移清掉 `(NULL, projectCode)` 已有重复行
- 改 entity / 改 service

---

### P1 — 防御性建设(随 P0 一起)

#### P1-1 CLAUDE.md 加新铁律

```md
### 0.5 唯一约束含 nullable 列必走 partial index(g198 铁律)

**Why**:PG 的 NULL ≠ NULL 规则让 `@Unique([..., nullableCol, ...])` 对 NULL 行完全失效,
每次 upsert 都会插新副本。2026-06-19 chanjet_ar_snapshot 因此残留 32×2 行。

**How**:
- @Unique / @Column unique 的所有约束列必须 NOT NULL(配 default 占位)
- 例外:单列 unique+nullable 用作"业务允许多 NULL"(如 prc2_ap_ledger.po_id 手工 AP 无 PO)— 必须在 entity 注释里写明"允许多 NULL"
- 多列约束含 nullable 列 → 必须改 NOT NULL DEFAULT '__VAL__' 或改 partial unique index `WHERE col IS NOT NULL`
- 禁止任何 service 在 nullable 列上做 `ON CONFLICT (nullable_col)`
```

#### P1-2 CI 门禁脚本 `scripts/check-nullable-in-unique.ts`

伪代码:
```ts
// 扫所有 *.entity.ts
// 找 @Unique('name', [...cols]) 或 @Column({ unique: true, nullable: true })
// 对每个约束列,查同文件 @Column 是否带 nullable: true
// 命中且无 partial index → 红灯;有 .allowlist 例外列表
```

baseline 文件:`.github/null-in-unique-baseline.txt` = 0(本审计修完后无残留)

#### P1-3 entity-drift-baseline 加新维度

把上述 13 条 @Unique 约束的列 NOT NULL 状态加进每日 entity↔DB 对比,防止有人 ALTER COLUMN DROP NOT NULL 偷偷打破。

---

### P2 — 长期(下个 G 阶段)

- 把 `assistant_customer_id` / `assistant_customer_code` 收编进 ERP 的客户主数据中心(对接 chanjet 时按映射表写本地 customer_code,而非裸 chanjet 编码)
- 部门维度(dept_code)真接入 chanjet 部门接口后,把 default '' 占位替换成真实 dept_code

---

## 五、待决策(用户拍板)

| ID | 决策点 | 选项 |
|----|-------|------|
| D1 | prc2_projects 是否允许"无公司项目" | A) 必须挂公司 → NOT NULL DEFAULT '' / B) 允许全局项目 → partial unique index |
| D2 | chanjet 占位值选 `''` 还是 `'__NA__'` | 建议 `''`(与已修的 dept_code 一致) |
| D3 | 整改是开 g198 新 tag 还是合进 g197-J 收尾 | 建议独立 `v3-g198-null-unique-hardening` |

---

## 六、验证清单(整改完成后)

- [ ] tsc 0 errors (api + web)
- [ ] migration up/down 双向跑通
- [ ] 生产 DB `\d chanjet_ar_snapshot` 三列均 NOT NULL DEFAULT ''
- [ ] 生产 DB `SELECT bookid, period, dept_code, assistant_customer_code, subject_id, COUNT(*) FROM chanjet_ar_snapshot GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1` 返回 0 行
- [ ] CI 跑 `scripts/check-nullable-in-unique.ts` 红灯触发测试(故意改一个 entity → 红 / 还原 → 绿)
- [ ] 用户端复测:同一区间反复同步 → 永远 32 行(不再 64)

---

## 七、统计:本次扫描产出

| 维度 | 数字 |
|------|------|
| 扫描 entity 文件 | 77 |
| @Unique 多列约束 | 13 |
| @Column unique 单列 | 30 |
| 已发生事故 | 1 (chanjet) |
| 高危待修 | 2 (chanjet 残 / prc2_projects) |
| 业务正确无需修 | 1 (prc2_ap_ledger.po_id) |
| 正常安全 | 11 |

**审计完成**。等待 D1/D2/D3 拍板后启动 P0 整改。

---

## 八、执行记录(2026-06-19)

**用户拍板**:
- D1:不许无公司项目 → prc2_projects.companyCode 改 NOT NULL DEFAULT ''
- D2:占位用 `''`(与已修的 dept_code 一致)
- D3:独立 tag `v3-g198-null-unique-hardening`

### 落地清单(8 处改动)

**P0 数据修复**:
1. `apps/api/src/database/migrations/1781837624060-FixChanjetArSnapshotRemainingNullableUq.ts`
   — chanjet_ar_snapshot 剩余两列 NULL→'',去重,NOT NULL DEFAULT ''
2. `apps/api/src/database/migrations/1781837624061-FixPrc2ProjectsCompanyCodeNotNull.ts`
   — prc2_projects.company_code 同方案

**P0 entity 收紧**:
3. `apps/api/src/modules/chanjet/chanjet-ar-snapshot.entity.ts`
   — assistantCustomerCode/subjectId:`nullable:true` → `default:''`,类型去 `| null`
4. `apps/api/src/modules/procurement-v2/entities/prc2-project.entity.ts`
   — companyCode 同上

**P0 service 路径堵漏**:
5. `apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts`
   — sync 写入 assistantCustomerCode/subjectId 改 `?? ''` 而非 `?? null`

**P1 防御性建设**:
6. `scripts/check-nullable-in-unique.js`
   — 静态扫所有 *.entity.ts,nullable in @Unique / @Column unique → 红灯
7. `.github/null-in-unique-allowlist.txt`
   — 白名单 1 条:prc2_ap_ledger.po_id(业务允许手工 AP 无 PO)
8. `.github/workflows/deploy.yml`
   — test job 新 step "Check nullable-in-unique constraints (g198)"
9. `CLAUDE.md`
   — 0.5 号铁律 + 操作指引

### 验证

| 项 | 结果 |
|----|-----|
| `node scripts/check-nullable-in-unique.js` | ✅ 0 处违规(1 处白名单) |
| 反向验证:故意改回 nullable | ✅ 抓到 3 处违规 → 红灯 |
| `tsc --noEmit` (api) | ✅ 0 errors |
| `tsc --noEmit` (web) | ✅ 0 errors |
| Migration 数 | 2 条新 TS migration(均含 down) |

### 待 CI 部署完成后(生产 DB 跑 migration):

- [ ] 生产 `\d chanjet_ar_snapshot` 三列 NOT NULL DEFAULT '' 全生效
- [ ] 生产 `\d prc2_projects` company_code NOT NULL DEFAULT ''
- [ ] 生产 `SELECT bookid,period,dept_code,assistant_customer_code,subject_id,COUNT(*) FROM chanjet_ar_snapshot GROUP BY 1,2,3,4,5 HAVING COUNT(*)>1` 返回 0 行
- [ ] 用户复测:同一区间反复同步 chanjet → 永远 32 行
