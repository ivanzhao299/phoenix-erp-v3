# SKU 多公司品种适配 · 阶段 0+2+3 实施报告（G202-S1）

> 依据：修正版方案一（用户审批 2026-11-11，决策 9/10/11）
> 基线：`origin/main` @ `28142f9f2`（隔离 worktree `.agents/worktrees/sku-review-main`）
> 范围：最小闭环 —— 消除"按等级全局猜 SKU 导致跨公司/跨品种入错库"的生产风险

---

## 一、审批决策落地对照

| 决策 | 内容 | 落地 |
|---|---|---|
| 9 | GRADE_0 特大档恢复为集团标准等级 | 来源启用 manifest 明确三模式矩阵：孟赛 STANDARD NULL、星驰 EGG_RED/EGG_PINK；21 个 GRADE_0 SKU（每模式 7 规格），`weight_range=NULL`，不设推测重量边界 |
| 10 | 只建「红壳蛋/粉壳蛋」两个变体，品种多对一映射 | 种子脚本 2)3)：`md_product_varieties` EGG_RED/EGG_PINK + `md_variety_breeds` 褐壳系→红、白/粉壳系→粉、本地土鸡→红 |
| 11 | 先做阶段 0+2+3，销售/POS/采购放二期 | 本次交付不含销售/POS/采购改造；`md_sku_aliases` 表结构先建（阶段 4 POS 条码用） |

## 二、交付物清单

### 阶段 2 — 结构（TS 迁移，up() 零业务 DML）

`apps/api/src/database/migrations/1794400000000-SkuVarietyOrgScope.ts`

| 对象 | 用途 |
|---|---|
| `md_product_varieties` | 蛋品商业变体主表（红壳/粉壳），含 shell_color、生效期 |
| `md_variety_breeds` | 变体↔品种多对多映射（UNIQUE(variety_code, breed_code)） |
| `md_sku_org_scope` | SKU 组织适用范围：scope_type ∈ COMPANY/FARM/SITE/ALL + sale/stock 开关 + 生效期 + default_flag。UNIQUE(sku_code, scope_type, scope_code)，约束列全 NOT NULL（g198 铁律，scope_code 默认 ''） |
| `md_sku_aliases` | 本地编码/条码/客户专码别名（阶段 4 POS 使用，本期只建结构） |
| `product_skus.variety_code` | SKU 关联变体（历史 SKU NULL = 无变体产品线，语义明确） |
| `mst_products.variety_code` | 产品关联变体（品种约束的权威落点） |
| `brd_flocks.breed_code` | 鸡群标准品种码（BRD_BREED 字典码；strain 保留中文名兼容展示） |
| `inv_batches.variety_code` | 批次品种快照（历史批 NULL；TEMP_PRODUCTION 新批必写） |

### 阶段 0 — 数据种子（幂等运维脚本，可重复执行）

`scripts/seed-sku-variety-org-scope.mjs`（支持 `--dry-run`）

1. GRADE_0 等级（可售可存，`weight_range=NULL`，重量待核实）
2. 变体 EGG_RED 红壳蛋 / EGG_PINK 粉壳蛋
3. 品种映射：HY_LINE_BROWN/LOHMANN_BROWN/ISA_BROWN/LOCAL→EGG_RED；HY_LINE_WHITE/LOHMANN_WHITE/DEKALB_WHITE→EGG_PINK
4. 变体产品 12 个：PRD-EGG-RED-0..5 / PRD-EGG-PINK-0..5
5. 变体 SKU 84 个：SKU-R-{0..5}-{7规格} / SKU-P-{0..5}-{7规格}；来源启用另生成 GRADE_0 三模式矩阵 21 个（普通/红/粉各 7 规格），显示标签为`0号特大蛋·普通`/`0号特大蛋·红`/`0号特大蛋·粉`，不把 NULL 重量折算成数值
6. scope 兜底：全部新 SKU 插 `scope_type='ALL'` 行（集团共享初始态，后续由公司管理员收窄）
7. `brd_flocks.breed_code` 回填：strain 中文名→BRD_BREED 码（不动已回填行）

明确不做：不归档 G68 既有 35 SKU（无变体产品线与红/粉壳并存，是否淘汰留待阶段 4 销售切换决策）；不回填既有 SKU 的 variety_code（NULL 即"无变体"语义）。

### 阶段 3 — 统一解析服务

`apps/api/src/modules/product-master/services/sku-availability.service.ts`

```
SkuAvailabilityService.resolve(input, mgr?)
  输入：companyCode / gradeCode / specCode / varietyCode? / farmCode? / siteCode? / houseCode? / usage
  解析链（fail-closed，每步失败抛 400）：
    1. 品种上下文：显式 varietyCode > 鸡舍在产鸡群(breed_code→md_variety_breeds)
       无品种上下文 → 只允许解析到无变体产品线（G68 存量通道）
    2. 候选 SKU：product_skus ⋈ mst_products.variety_code（品种约束在产品层）+ SkuPolicy.usableSql
    3. 组织适用：md_sku_org_scope 命中 COMPANY/FARM/SITE/ALL 任一行；
       最具体优先（SITE > FARM > COMPANY > ALL）；无任何行 → 拒绝
    4. 用途开关：usage=sale/stock 校验 scope 行 sale_enabled/stock_enabled
    5. 多候选 → 拒绝（列出候选清单）；零候选 → 拒绝（含品种上下文提示）
  assertUsable(skuCode, input)：显式 SKU 校验（阶段 4 销售/POS 接入用）
```

### 阶段 3 — 调用方收口

| 调用方 | 改造 |
|---|---|
| `production-inbound.service.ts` | SKU 解析从"全局 grade 匹配"改为 `skuAvailability.resolve(company/site/house+grade+spec, 'stock')`；两段式（先解析全部档位再写库存，保持"任一失败不产生批次"契约）；批次写入 variety_code；返回 batches 带 varietyCode |
| `egg-inventory.service.ts` | `createProductionBatch` 新增 varietyCode 参数 → `inv_batches.variety_code`；EggBatch 接口补 variety_code |
| `packaging-readiness.ts` | `PackagingIdentity` 新增可选 varietyCode：提供时 SKU 候选按 `s.variety_code=$4 AND mst_products.variety_code=$4` 双保险收窄；不提供时行为与旧版一致（包装终端尚未传品种，阶段 4 补终端采集） |
| `sales-v2.module.ts` / `product-master.module.ts` | SkuAvailabilityService 注册与导出 |

### 阶段 0 — 前端

`apps/web/src/app/(admin)/breeding/flock/page.tsx`

- 品种下拉从 `BRD_BREED_TYPE`（存中文名）切到 `BRD_BREED`（标准字典码）
- 提交写入 `breed_code`（标准码）+ `breud_type`/`strain`（中文名冗余兼容）
- 编辑回显：优先 breed_code → strain/breed_type 中文名反查码 → 默认首项
- 列表品种列显示中文标签（码→label 映射）

## 三、验收标准对照（原 12 条 + 新增 2 条中本期覆盖项）

| # | 场景 | 本期 | 验证 |
|---|---|---|---|
| 2 | 公司 A/B 不同鸡种解析到不同变体 SKU | ✅ | 单测：品种上下文收窄候选（EGG_RED vs EGG_PINK 产品线隔离） |
| 3 | 同等级规格多品种拒绝全局猜测 | ✅ | 单测：多候选抛"匹配多个可用 SKU"并列出候选 |
| 4(部分) | SKU 组织适用范围校验 | ✅ | 单测：无 scope 行拒绝 / stock_enabled=false 拒绝 / SITE>FARM>COMPANY>ALL 优先级 |
| 13 | 公司 A 红壳日报绝不落入粉壳 SKU | ✅ | resolve 候选强制 `p.variety_code = ANY(varieties)` |
| 14 | 品种缺失的鸡群被明确拒绝 | ✅ 部分 | 无品种上下文→只走无变体产品线；混养鸡舍（同舍多品种）→ 多变体候选 → 多义拒绝并提示。全量拒绝（而非兼容通道）留待存量 strain 回填完成后在阶段 4 收紧 |
| 1/5/6/7/8/9/10/11/12 | 共享 SKU/仓库隔离/条码别名/历史兼容/强制 SKU/调拨/停用/并发/报表 | ⏳ 二期 | 阶段 4/5 交付 |

## 四、验证记录（真实执行）

| 检查 | 结果 |
|---|---|
| `apps/api tsc --noEmit` | 0 errors |
| `apps/web tsc --noEmit` | 0 errors |
| `jest sku-availability + production-inbound` | 25/25 passed |
| `jest sales-v2 + product-master + bff` | 440 passed / 146 skipped(pg 集成需 DB) / 0 新增失败 |
| 全量 `jest`（API） | 1478 passed；5 个失败套件均为 chanjet NODE_ENV 环境问题 + farm-egg.pg 无 DB，与本次改动无关（未触碰相关文件） |
| `check-ts-migration-no-data-dml.sh` | ✅ 94 条通过（新迁移零 DML） |
| `check-ts-migration-down.sh` | ✅ 94 条 down() 落实 |
| `check-nullable-in-unique.js` | ✅ 0 违规 |
| `check-constraint-drift.js` | ✅ 0 new drift |
| `lint:web:changed` | PASS（未增长债务；flock 页 1 error/3 warning 为存量模式，回滚验证同样存在） |
| `vitest run`（web） | 662 passed；16 失败文件经基线回滚验证为主分支存量（daily-grade-export 等，与 flock 页无关）；flock-display.test 5/5 通过 |

## 五、已知边界与二期清单

1. **包装终端尚未采集品种**：`resolvePackagingIdentity` 已支持 varietyCode 收窄，但终端提交链路还没传（阶段 4：包装作业台按鸡舍/线别带出品种 + JSONB 快照）。
2. **WMS 自由 itemCode 通道未收口**：`wms.service.resolveInventoryItem` 仍按全局码猜类型（阶段 4 接 assertUsable）。
3. **无品种上下文仍可走无变体产品线**：这是 G68 存量 SKU 的兼容通道；待全量鸡群 strain 回填 + 存量日报迁移完成后，在阶段 4 将该通道收紧为"必须品种上下文"。
4. **主数据中心无 scope 维护界面**：本期 scope 行由种子脚本建 ALL 兜底；维护 UI（公司管理员收窄）在阶段 4 交付（MENU_MD_SKU_SCOPE）。
5. **种子脚本未在生产执行**：`node scripts/seed-sku-variety-org-scope.mjs --dry-run` 先行核验，正式执行需按生产变更流程。

## 六、改动清单

```
新增 apps/api/src/database/migrations/1794400000000-SkuVarietyOrgScope.ts
新增 scripts/seed-sku-variety-org-scope.mjs
新增 apps/api/src/modules/product-master/services/sku-availability.service.ts
新增 apps/api/src/modules/product-master/services/sku-availability.service.spec.ts
改  apps/api/src/modules/product-master/product-master.module.ts
改  apps/api/src/modules/sales-v2/sales-v2.module.ts
改  apps/api/src/modules/sales-v2/services/production-inbound.service.ts
改  apps/api/src/modules/sales-v2/services/production-inbound.service.spec.ts
改  apps/api/src/modules/sales-v2/services/production-inbound.pg.spec.ts
改  apps/api/src/modules/sales-v2/services/egg-inventory.service.ts
改  apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.spec.ts
改  apps/api/src/modules/bff/packaging-readiness.ts
改  apps/web/src/app/(admin)/breeding/flock/page.tsx
新增 docs/g202-s1-sku-variety-org-scope.md（本报告）
```
