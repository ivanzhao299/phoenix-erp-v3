# EGG + GRADE_5 SKU 注册 apply 方案设计评审 — 2026-09-11

> **性质声明**：本文档仅为 apply 方案设计评审，**未执行任何生产写操作**。apply workflow 仍保持 fail-closed（`egg-grade5-sku-manifest-production-rollout.yml` L173 直接 `exit 1`），本轮不修改该 fail-closed 行为。未执行路径甲 UPDATE，未跑旧 GRADE_1/2 workflow。

---

## 1. 证据基线

### 1.1 最新只读 preflight（PASS）

- **Run [34665332082](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/34665332082)**：phase=preflight，`PRODUCTION_BUSINESS_WRITES=0`，双层只读（`BEGIN TRANSACTION READ ONLY` + runner 侧 environment `production-readonly`），结论 **PASS**。
- Artifact **sha256 前缀 `c67cd2d2`**（grade5-preflight-34665332082 严格校验 payload）。该 payload 通过 workflow "Validate strict audit artifact and rc" 步骤全部断言：`business_writes=0`、`rc=ssh_rc=audit_result.exit_code=0`、transport rc 链全 0。
- 快照 SQL 为仓库内 `scripts/ops/readonly-audits/egg-grade5-production-snapshot.sql`（五张主数据表精确行 + `product_skus` 约束/索引）。
- main 基线：`94861322904fe20199bc88515e91428234ea33c1`（远程审计按 `git pull --ff-only` 同步到该 revision 后执行）。
- 历史对照（非当前状态）：run 34463062878（SHA `63f68ff4`，2026-09-10）结论一致；run 34594225057 曾因 transport 校验失败（旧版 rc 链），已被 34665332082 的修订版取代。

### 1.2 快照事实（run 34665332082）

| 对象 | 现态 |
|---|---|
| `mst_products` | 正式鸡蛋根为 **EGG**（id=10，ACTIVE，has_grade=true）；`PRD-EGG-5`、`PRD-EGG-GRADE_5` 均 **0 行** |
| `product_master` | 0 行 |
| `product_grades` | **GRADE_5 ACTIVE**（id=2277） |
| `packaging_specs` | **PKG_PACK_SPEC_3 ACTIVE**（id=2612，30 枚/箱） |
| `product_skus` | 共 26 条；其中 **7 条 GRADE_5 legacy SKU**（`product_code='PRD-EGG-5'`）：SKU-5-LOOSE / TRAY30 / TRAY36 / BOX360 / BOX720 / GIFT12 / GIFT24（id 3953/3958/3963/3968/3973/3978/3983，均 ACTIVE）；另有 CJ legacy 注册关系 |
| **canonical 组合** | `EGG + GRADE_5 + PKG_PACK_SPEC_3` = **0 行（未注册）** |

### 1.3 `product_skus` 约束与索引（快照 information_schema + pg_indexes）

- pkey：`sku_code`
- `sku_code` UNIQUE、product/grade/spec 相关 NOT NULL 与 CHECK 约束
- **7 个索引，含 `(product_code, grade_code, spec_code)` 唯一组合索引**（即 canonical 三元组唯一性由 DB 层强制）

### 1.4 代码写路径（`apps/api/src/modules/product-master/services/product-master.service.ts`）

- `createSku()`（L253–289）：先查三元组唯一 → 自动生成 sku_code → `INSERT INTO product_skus (sku_code, product_code, product_name, grade_code, spec_code, sku_name, barcode, status, remark, created_at, updated_at)`。**无 ON CONFLICT**，重复三元组靠先查后抛 `ConflictException`。
- 读取口径：`listSkus()` 对 ACTIVE 引用额外过滤生效期（`effective_date/expire_date`）。
- `mst_products` 无写接口（H2 阶段只读）。
- 无独立 `product_skus` entity 文件；表由 raw SQL 管理（g197 混合模式，装饰式 entity 禁令不受影响）。
- 包装端就绪性检查 `apps/api/src/modules/bff/packaging-readiness.ts`：按 `grade_code + spec_code` 查 ACTIVE SKU 且要求 `product_code` 在 `mst_products` 已注册——这正是当前包装 33 失败的直接原因（legacy SKU 的 `PRD-EGG-5` 不在 `mst_products`）。

### 1.5 注册写路径与业务动机（代码事实）

1. **官方注册写路径** = `product-master.service.ts:219-304`：L253 `createSku()` 先查三元组组合存在性（L256 `SELECT 1 FROM product_skus WHERE product_code/grade_code/spec_code`）→ L279 `INSERT` → L291/L304 `updateSku()` 按 `sku_code` UPDATE。apply 方案必须显式决定：**直接 SQL**（本评审 §3 的单事务门禁方案）vs **走该 service / 主数据工作流**（§6a）。
2. **业务动机**：`apps/api/src/modules/bff/packaging-readiness.ts:26` 包装就绪性按 `grade_code + spec_code` 解析 ACTIVE SKU（并要求 product_code 已注册于 `mst_products`）——注册 `EGG+GRADE_5+PKG_PACK_SPEC_3` 正是打通 canonical 包装流的关键，这是 apply 的直接业务动机（解除包装单 33 阻塞）。
3. **审批流钩子**：`workflow-biz-registry.service.ts:293-296` SKU 主数据挂审批工作流（`moduleCode: 'MENU_MD_SKU', tableName: 'product_skus'`，`onApproved: mdAuditHook('SKU','product_skus','sku_code','APPROVE_ACTIVE')`）——**正常注册走主数据审批流**。apply 若直接 SQL 将绕过该审批与 `APPROVE_ACTIVE` 审计钩子，必须做取舍与审计补偿（§6b）。

---

## 2. 注册范围三选项对比

### 方案 A：新建 canonical EGG+GRADE_5 SKU，legacy 原样保留 + 显式别名/映射（**推荐**）

按 manifest 范围 INSERT 新行 `product_code='EGG'`，7 条 legacy SKU 不动，另以显式映射记录 `PRD-EGG-5 → EGG`。

**范围锚定**：manifest（`scripts/ops/manifests/egg-grade5-candidate.json`）当前范围**仅 1 条 canonical SKU：`SKU-G5-CANDIDATE`（EGG + GRADE_5 + PKG_PACK_SPEC_3）**，`production_registered=false`，confirmation=`APPLY-EGG-GRADE5-MANIFEST-20260911`——**不是 7 条全量**。7 spec 扩展只是本评审讨论的候选批次 2（§9-Q1），不在本 manifest 内。

**别名先例**：`store_aliases` 表（`1787875200000-CreateStoreWorkstationIdentity.ts` 建表，alias_type CHECK 含 `'LEGACY_STORE_CODE'`，`1787961600000-TightenStoreSiteAndWarehouseOwnership.ts` 收紧为 `('STORE_SITE','LEGACY_STORE_CODE')`；entity `store-pos/entities/store-alias.entity.ts:8`）是本仓库**显式 legacy 别名注册的现成先例**：不动历史编码，用受 CHECK 约束的别名行承载映射，读取端 resolver 解析。方案 A 的 `PRD-EGG-5 → EGG` 映射可直接参照该模式（是否新建通用 product 别名表见 §9-Q4）。

**运行时桥接现状**：`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:111` 的 `eggFamilyCondition` 已把 `EGG` 与 `PRD-EGG-%` 桥接为同族（`(product_code='EGG' OR product_code LIKE 'PRD-EGG-%')`，注释明确 "EGG 是页面使用的族别名"）——历史库存**读取**已兼容双口径，方案 A 新增 EGG 行不会破坏该查询，反而使新写入收敛到 canonical。

| 维度 | 评估 |
|---|---|
| 影响行数 | 最小 1 行 INSERT（manifest 现有单一 target `SKU-G5-CANDIDATE`）；全量 7 行 |
| 幂等性 | ✅ 好：纯新增，`(EGG,GRADE_5,PKG_PACK_SPEC_3)` 唯一索引天然防重；`source_no` + ON CONFLICT DO NOTHING 可精确重入 |
| 可回滚性 | ✅ 好：down = 按 manifest 列出的 sku_code 精确 DELETE（或 status→DISABLED 软回滚），不动任何 legacy 行 |
| 历史单据字符串引用风险 | ✅ **零**：历史交易/库存表中的 `PRD-EGG-5`、旧 `sku_code` 字符串全部原样有效；新写入走 canonical |
| 唯一组合索引相容性 | ✅ 完全相容：新三元组当前 0 行，INSERT 不触碰既有 7 行的索引项 |
| 与 g198/g201 语义 | ✅ 无约束变更；新行唯一列全 NOT NULL 占位 |
| 推荐度 | **★★★★★（首选）**。符合 packaging-readiness 门禁期望（product_code 须在 mst_products 注册），立刻解除包装 33 阻塞 |

### 方案 B：路径甲 re-parent —— UPDATE legacy 7 条 `product_code: PRD-EGG-5 → EGG`

> 历史裁定过程：用户曾明令禁止 UPDATE，后裁定"以证据为准"。本评审基于证据重新评估，**结论仍是不推荐**。

| 维度 | 评估 |
|---|---|
| 影响行数 | 7 行 UPDATE（若含 CJ legacy 注册关系则更多，需另行快照核实） |
| 幂等性 | ⚠️ 中：UPDATE `WHERE product_code='PRD-EGG-5'` 天然幂等，但与并发新写存在窗口 |
| 可回滚性 | ⚠️ 中：可反向 UPDATE 回 `PRD-EGG-5`，但需先完整备份 7 行 before-image；若期间有新交易引用则反向回滚会制造新的失配 |
| 历史单据字符串引用风险 | ⚠️ **中（修订）**：历史**库存读取**已由 `egg-inventory.service.ts:111 eggFamilyCondition` 桥接（EGG 与 `PRD-EGG-%` 同族 LIKE 匹配），re-parent 后读取口径短期不裂；但历史**交易表的反规范化字符串不变**（旧单据仍写 `PRD-EGG-5`），聚合/对账报表、外部导出、按精确 `product_code` 等值 JOIN 的路径（egg-inventory 之外的多数 LEFT JOIN 用 `sku_code`/等值 product_code）仍会双口径并存；且 LIKE 桥接本身是宽匹配，`PRD-EGG-GRADE_5` 等拼接脏码也会被吞进同族，re-parent 后新旧码语义更难分辨 |
| 唯一组合索引相容性 | ⚠️ 需逐行验证：UPDATE 后 7 行变为 `(EGG,GRADE_5,<spec>)`；若 EGG 下已存在同 grade+spec 行会撞唯一索引（当前快照 EGG GRADE_5 为 0 行，暂不撞，但未来方案 A 与 B 互斥） |
| g198/g201 语义 | ⚠️ 不改 schema，但制造"同一实体双编码"语义漂移，与 g201 三对齐精神相悖 |
| 推荐度 | **★☆☆☆☆（不推荐）**。破坏性、影响面不可完整枚举（历史字符串引用闭包未全部核实）；且曾属用户明令禁止项，仅"以证据为准"不构成翻案依据——证据恰恰指向风险 |

### 方案 C：仅注册 PKG_PACK_SPEC_3 包装规格维度，不动 SKU

`packaging_specs` 已有 PKG_PACK_SPEC_3 ACTIVE（id=2612），此选项实际是"什么都不做 + 确认 spec 已在"。

| 维度 | 评估 |
|---|---|
| 影响行数 | 0（spec 已存在，无需 INSERT） |
| 幂等/回滚 | 平凡 ✅ |
| 历史引用风险 | ✅ 零 |
| 唯一索引相容 | ✅ 无操作 |
| **有效性** | ❌ **不解决根因**：packaging-readiness 门禁要求的是 `product_skus` 中存在 product_code 已注册于 `mst_products` 的三元组行；canonical SKU 仍为 0 行，包装 33 依旧被阻断 |
| 推荐度 | **★☆☆☆☆（不推荐单独采用）**；其"不重复创建 spec"的原则已并入方案 A（manifest 明确 spec 复用 id=2612） |

### 结论

**推荐方案 A，范围以 manifest 单 target（EGG/GRADE_5/PKG_PACK_SPEC_3 → SKU-G5-CANDIDATE）为最小可批单元**；是否扩展到 7 spec 全量，列为开放问题 §9-Q1。

---

## 3. 推荐方案的事务设计

apply 脚本（未来实现于 `scripts/ops/`，非本轮）必须单事务、门禁化：

```sql
BEGIN;  -- 单事务，psql 单连接，ON_ERROR_STOP=1

-- ① 前置只读断言（同一事务内，保证一致性快照）
SELECT count(*) FROM mst_products   WHERE product_code='EGG' AND status='ACTIVE';                 -- 断言 = 1
SELECT count(*) FROM product_grades WHERE grade_code='GRADE_5' AND status='ACTIVE';               -- 断言 = 1
SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE';       -- 断言 = 1
SELECT count(*) FROM product_skus
 WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3';               -- 断言 = 0（未注册才允许 apply）
SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5';        -- 断言 = 7（legacy 基线不变）
SELECT count(*) FROM product_skus;                                                                -- 断言 = 26（全表基线）

-- ② INSERT：ON CONFLICT 语义（优于先查后插）
INSERT INTO product_skus
  (sku_code, product_code, product_name, grade_code, spec_code, sku_name, barcode, status, remark, created_at, updated_at)
VALUES
  ('SKU-G5-CANDIDATE','EGG','鸡蛋','GRADE_5','PKG_PACK_SPEC_3','鸡蛋 (GRADE_5 / PKG_PACK_SPEC_3)',NULL,'ACTIVE',
   'apply run=<run_id> manifest=<sha256> source_no=EGG-G5-CANDIDATE',NOW(),NOW())
ON CONFLICT (sku_code) DO NOTHING;          -- sku_code 冲突 = 已注册，幂等跳过
-- 三元组唯一索引冲突：ON CONFLICT 不指定该索引则自然报错 → 事务失败自动回滚（fail-closed）
-- 返回计数门禁：本条 INSERT 影响 0 行（已存在）或 1 行（新注册）都必须与 expected_counts 输入核对

-- ③ 后置计数断言（仍在事务内）
SELECT count(*) FROM product_skus
 WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3';               -- 断言 = 1

-- ④ 决策点：以上任一断言失败 → psql -v ON_ERROR_STOP 或脚本主动 ROLLBACK；全部通过才 COMMIT
COMMIT;   -- 或 ROLLBACK（dry-run 模式永远 ROLLBACK）
```

要点：
- **ON CONFLICT (sku_code) DO NOTHING 优于先查后插**（消除 check-then-insert 竞态）；三元组唯一索引不列入 ON CONFLICT 目标，让其报错回滚，防止"同元组不同码"的静默分叉。
- 任一 SQL 失败（psql `ON_ERROR_STOP=1`）→ 连接终止 → 事务自动回滚，无部分提交。
- dry-run/rehearsal 模式：同脚本末尾强制 `ROLLBACK`，用于回滚演练（§8）。

### 3a. 直接 SQL vs 走官方注册通道（product-master.service / 主数据审批流）

| 通道 | 取舍 |
|---|---|
| **直接 SQL（推荐，配审计补偿）** | 单事务 + 计数门禁 + ON CONFLICT + expected_counts 全部可控（§3/§6/§7）；溯源走 remark `source_no` + run_id + workflow artifact。代价：绕过 `MENU_MD_SKU` 审批流与 `APPROVE_ACTIVE` 钩子（workflow-biz-registry.service.ts:293-296）——**审计补偿**：apply artifact + audit log 记录等效的"谁/何时/依据哪个 manifest/谁批准"，并事后在主数据审批台账补登记一条 reference 条目（开放问题 §9-Q8） |
| 走 service API | 复用 L253-289 createSku 与审批钩子，但失去单事务多断言门禁、expected_counts、fail-closed 语义；HTTP 通道也违背"apply 必须单一受限入口"的既有裁定（20260911 authority audit §后续门禁）。**不推荐用于生产 apply**；适用于批 2 常规 spec 扩展（走正常主数据 UI/审批流即可，无需 workflow） |

---

## 4. 幂等与重入

- **重复 apply（完全重放）**：前置断言 ① 中"canonical=0"会失败 → apply 以明确错误退出（不写任何行）。若采用"已注册即成功"语义，则 INSERT `ON CONFLICT DO NOTHING` 影响行数 0 + 后置断言 =1 通过 → 判定 `ALREADY_APPLIED`，输出与首次成功不同的显式状态码。两种语义择一（开放问题 §9-Q3），默认前者（更保守）。
- **部分失败恢复**：单事务保证无部分状态。恢复 = 直接重跑 apply（前置断言重新校验基线）。不存中间态，无需手工修补。
- **幂等键**：`source_no`（manifest 内 `EGG-G5-CANDIDATE`）写入 remark，作为审计追溯键；三元组唯一索引是 DB 层幂等兜底。
- **基线漂移保护**：前置断言 =7（legacy）与 =26（全表）保证 apply 期间无第三方并发写 SKU 表；漂移即中止。

## 5. 可回滚性

**down 方案（若走迁移通道）**：项目铁律——新 schema/数据迁移只能落在 `apps/api/src/database/migrations/`（TS，含 `down()`；up() 业务 DML 需文件头 30 行内 `@allow-data-dml: <reason>` 标记豁免，g197-H/g198）。

**通道取舍（推荐运维脚本通道，不走迁移）**：

| 通道 | 评估 |
|---|---|
| TS 迁移链 | ❌ 不推荐：迁移随部署链自动执行（CI `db-migrate.sh` + deploy.yml），无法保留"人工逐次批准 manifest hash"的门禁语义；生产 apply 的授权节奏（preflight→人工批→apply→verify）与迁移自动执行冲突；且 `@allow-data-dml` 豁免是治理清 NULL 用的，业务 seed 明文禁止走迁移链（AGENTS.md："业务数据 seed 仍走 scripts/ 运维脚本"） |
| **scripts/ops 运维脚本 + workflow（推荐）** | ✅ 现有 `egg-grade5-sku-manifest-production-rollout.yml` 已具备 manifest/hash/revision/confirmation 四重输入门禁；apply 实现补在该通道，回滚即另一个受控 phase |

**反向操作清单（rollback runbook）**：
1. 软回滚（首选）：`UPDATE product_skus SET status='DISABLED', updated_at=NOW() WHERE sku_code IN (<manifest 全部 sku_code>) AND remark LIKE '%source_no=EGG-G5-CANDIDATE%'` —— 断言影响行数 = manifest 行数。
2. 硬回滚：`DELETE FROM product_skus WHERE sku_code IN (...) AND remark LIKE '%source_no=EGG-G5-CANDIDATE%'` —— 仅当注册后尚无任何交易引用该 sku_code 时允许（前置只读确认 inv_batches/sal_order_items 等引用 =0）。
3. 回滚同样走 workflow 单事务 + 前后计数断言（26→回到基线）+ verify phase。
4. 方案 A 不触碰 legacy 7 行，回滚后世界精确回到 before-image —— 可完整演练验证。

## 6. apply workflow 实现方案（设计，不实现）

复用 preflight 已验证的模式，apply job 逐步门禁：

1. **输入**：`phase=apply`、`manifest_path`（锁定 `scripts/ops/manifests/egg-grade5-candidate.json`）、`manifest_sha256`、`confirmation='APPLY-EGG-GRADE5-MANIFEST-20260911'`、**新增 `expected_counts`**（JSON：各前置断言的期望值，如 `{"canonical_before":0,"legacy_g5":7,"total_skus":26,"canonical_after":1}`）、`revision`。
2. **门禁顺序**（全部沿用 preflight 模式）：
   - `node scripts/ops/egg-grade5-manifest.mjs` 重算 sha256 与输入比对；
   - confirmation / manifest_path 白名单比对（现状 L171–172 保留）；
   - 远程 `git fetch && git pull --ff-only`，`git rev-parse HEAD == inputs.revision` 才继续；
   - **当前状态断言**：apply 前先跑同一只读快照 SQL，比对 expected_counts —— 任一不符即 fail-closed 退出；
   - **引用最近一次 PASS 的 preflight run id + artifact sha256** 作为前置条件（可选加强：输入 `preflight_run_id`，workflow 校验该 run conclusion=success 且 artifact hash 一致）。
3. **apply 执行**：SSH 到生产，单事务 psql（`ON_ERROR_STOP=1`）执行 §3 SQL bundle；事务外零写。
4. **apply 后自动 verify**：同一 job 内（或 chained verify job，`production-readonly` environment）立刻执行 `egg-grade5-production-snapshot.sql` 只读断言（§7 清单）；verify 失败 → job 失败并触发告警（数据已提交，进入 §8 恢复预案）。
5. **audit log**：上传 artifact（apply payload：影响行数、各断言实际值、事务 SQL bundle sha256、manifest sha256、revision、run_id），retention ≥ 90 天；remark 内嵌 `source_no` + run_id 形成库内审计链。
6. **environment 保护**：`production-business-write` environment 保持需人工 approval 的 protected environment（现有配置）。
7. **本轮不修改该 workflow**——以上为实现蓝图；fail-closed 行为保持不变。

## 7. verify 阶段断言清单（注册后预期状态）

| # | 断言 | 期望 |
|---|---|---|
| V1 | `mst_products` EGG ACTIVE | =1 行，id=10 不变 |
| V2 | `mst_products` PRD-EGG-5 / PRD-EGG-GRADE_5 | 各 =0（未因 apply 产生新产品） |
| V3 | `product_grades` GRADE_5 ACTIVE | =1，id=2277 不变 |
| V4 | `packaging_specs` PKG_PACK_SPEC_3 ACTIVE | =1，id=2612、30 枚/箱不变（未被重建） |
| V5 | **canonical** `product_skus EGG+GRADE_5+PKG_PACK_SPEC_3` | =1 行，sku_code 与 manifest 一致，status=ACTIVE，remark 含 source_no+run_id |
| V6 | legacy 7 条 GRADE_5 SKU | 逐行 sku_code/product_code('PRD-EGG-5')/status(ACTIVE) 与 before-image **完全一致** |
| V7 | `product_skus` 全表 | = 基线 + manifest 新增行数（最小范围：26→27） |
| V8 | `product_skus` 三元组唯一索引无违例 | `GROUP BY product_code,grade_code,spec_code HAVING count(*)>1` = 0 行 |
| V9 | sku_code 无重复 | `GROUP BY sku_code HAVING count(*)>1` = 0 行 |
| V10 | 新 SKU 关键列 | sku_name/barcode/status 与 manifest 一致；唯一约束列无 NULL（g198） |
| V11 | 引用面（可选加强） | inv_batches / 包装单据对新 sku_code 的引用计数 =0（刚注册，无交易） |

## 8. 失败恢复预案与回滚演练要求

**失败分类与预案**：
1. **apply 前置断言失败**（基线漂移）：零写入；人工核查漂移来源，重跑 preflight 建立新基线后重新评审。
2. **事务中 SQL 失败**：自动回滚，库回到 before-image；用 verify phase 确认 canonical 仍 =0、legacy 仍 =7。
3. **COMMIT 后 verify 失败**（逻辑不符预期）：立即执行 §5 软回滚（DISABLED），随后按需硬回滚（先确认零交易引用）；事后根因分析 + 新 preflight。
4. **apply 成功但业务侧异常**（如包装 33 仍失败）：SKU 注册状态保留，问题定位转入应用层；不自动回滚。

**回滚演练要求（apply 上线前置条件）**：
- 在 staging/独立 PG18 容器（复用 packaging-sku-shift 20260910 的测试容器模式）以 before-image fixture 完整走一遍：apply → verify → 软回滚 → verify（回到基线）→ 硬回滚 → verify，全程断言逐行一致；
- 演练产物（before/after diff、影响行数）归档 `docs/ops/runs/`；
- dry-run（事务末 ROLLBACK）在生产只读口径至少跑通一次 SQL bundle 语法与断言逻辑（仍零提交）。

## 9. 开放问题（需用户/评审裁定）

- **Q1（范围）**：manifest 当前仅单 target（PKG_PACK_SPEC_3）。是否扩展为 7 spec 全量 canonical 注册（LOOSE/TRAY30/TRAY36/BOX360/BOX720/GIFT12/GIFT24 各建一条 EGG 版）？建议分两批：先单条解除包装 33 阻塞，验证后批 2。
- **Q2（sku_code 命名）**：`SKU-G5-CANDIDATE` 是占位名。正式码用 `generateSkuCode()` 规则（`EGG-GRADE_5-PKG_PACK_SPEC_3`）还是另定业务码？码一旦上线即成历史字符串，需一次定准。
- **Q3（重放语义）**：重复 apply 报错退出（保守，推荐）还是 `ALREADY_APPLIED` 成功（运维友好）？
- **Q4（别名映射载体）**：`PRD-EGG-5 → EGG` 映射放 remark 文本、独立别名表（需新迁移）还是 resolver 代码常量？影响读路径改造范围。
- **Q5（legacy 7 条的长期归宿）**：方案 A 落地后 legacy SKU 是否择期 DISABLED（需先确认历史可售/在库引用清零）？本轮不动。
- **Q6（CJ legacy 注册关系）**：快照提到 CJ 侧 legacy 注册关系，apply/verify 是否需纳入断言范围？当前清单未覆盖，需补快照字段。
- **Q7（preflight run 绑定）**：apply 是否强制校验"最近一次 PASS preflight 的 run id + artifact sha256"作为前置输入（§6.2 加强项）？建议纳入。
- **Q8（审批流补偿）**：直接 SQL apply 绕过 `MENU_MD_SKU` 审批流与 `APPROVE_ACTIVE` 钩子（workflow-biz-registry.service.ts:293-296），审计补偿（§3a）是否需在主数据审批台账补登记 reference 条目？由谁（数据 owner）签署？

---

## 本轮交付边界

- 仅新增本文档；未修改 manifest、workflow、任何 SQL/TS 代码；未触发任何 workflow；未执行任何生产读写。
- apply 保持 fail-closed；路径甲 UPDATE 未执行且不推荐；旧 GRADE_1/2 workflow 未触碰。
