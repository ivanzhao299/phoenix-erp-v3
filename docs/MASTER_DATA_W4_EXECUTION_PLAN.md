# 主数据 W4 最小可放行集 · 执行计划

> Agent：Architect / MasterData Agent（feature/agent-architect-masterdata）
> 日期：2026-06-20
> 上游：
> - docs/MULTI_AGENT_PHASE2_PLAN.md（Wave 顺序）
> - docs/MASTER_DATA_PHASE2_DESIGN.md（母规划）
> - docs/MASTER_DATA_PHASE2_REVIEW.md（Audit 评审 §4 "W4 最小可放行集"）
> - 用户 2026-06-20 拍板的 4 项校正：
>   1. 仓库 ≠ site。`site_code` 表示场区/地点，`warehouse_code` 是具体库存仓。库存、FIFO、批次、库位必须用 `warehouse_code`。
>   2. 门店统一进 site。`mst_stores` 后续作为门店业务档案 / 兼容表，不再作为主数据源。`SITE-*-STORE` 是门店主身份。
>   3. 鸡舍必须挂 site。`brd_houses.site_code` 最终必须加 FK，一个鸡舍只能属于一个养殖场 site。
>   4. shareholder scope 不直接并入 sys_user_scopes。股东范围是 shareholder 维度，不是 user 维度。可以统一 DataScope 输出，但底层表暂时分开。

---

## 0. W4 的范围与红线

### 0.1 本 wave 必做（最小集）

| # | 交付 | 类型 | 路径 |
|---|---|---|---|
| 1 | 执行计划文档（本文件） | docs | `docs/MASTER_DATA_W4_EXECUTION_PLAN.md` |
| 2 | `sys_organization_type_rules` 表 + 9 条 seed | TS migration | `apps/api/src/database/migrations/1782000000000-W4MasterDataFoundation.ts` |
| 3 | 配套 entity 声明（read-only） | TS | `apps/api/src/modules/org/entities/sys-organization-type-rule.entity.ts` |
| 4 | master-data-runtime governance 加 site / business-unit / shareholder 三类（附加，不动现有 TYPES CRUD 配置） | service 加法 | `apps/api/src/modules/master-data/operations.service.ts`（CENTERS + search）、`apps/api/src/modules/master-data/governance.service.ts`（details.extended 增项） |
| 5 | 引用一致性验证脚本 | mjs | `scripts/check-master-data-references.mjs` |

### 0.2 本 wave 严禁做（上锁）

- ❌ 不动 `sys_user_scopes` 合表（user 拍板 #4 已剥离 shareholder scope，需要等 M2/M3 子文档先解 §3.3-a 语义）
- ❌ 不动 `shr_projects → shr_project_attrs` 改造（属 W6，需 M2 拍板）
- ❌ 不动 `inv_batches.store_code → owning_company_code`（属 W6，user 拍板 #1 后还需 M3 重写，确认 warehouse_code 是库存唯一维度）
- ❌ 不新增 `biz_site_projects` 桥表（与 biz_projects.site_code 双源未解，需 M2 先拍板）
- ❌ 不动 `master-data-runtime.service.ts` 的 `TYPES` 字典（避免新建 `/api/master-data/runtime/site/*` 等 CRUD 端点冲击现有 API）
- ❌ 不动业务流程（farm.service / wms.service / store-pos.service / finance-v2 等一切业务侧 service 在本 wave 不改）
- ❌ 不动现有 `biz_site_aliases` 已有 9 行 seed（孟赛 7 + 东鹏 2，已在 `migrations/mdm1_02_biz_site_aliases.sql` 落定）；W4 不新增 alias 行，仅做"表存在性校验"

---

## 1. user 拍板 4 项的入模消化

| 拍板项 | 对 W4 的具体含义 | 对后续 wave 的含义 |
|---|---|---|
| #1 仓库 ≠ site，库存维度用 `warehouse_code` | 本 wave 不重命名 `inv_batches.store_code`；本 wave 不写入 inv_batches / wms_warehouses 治理；governance 计数侧不混淆 site 与 warehouse | W6 E1：`inv_batches.store_code → owning_company_code` 同时**保留** `warehouse_code`；FIFO 维度=`(warehouse_code, sku_code)`。MASTER_DATA_PHASE2_DESIGN.md §5.5 需在 M3 子文档里重写 |
| #2 门店进 site，mst_stores 作为兼容/业务档案 | sys_organization_type_rules.STORE 规则的 code_prefix_regex 用 `^SITE-`；operations.service 的 'biz' center 保留 mst_stores 作为兼容台账（不改），新增 'extended-gov' center 把 SITE-*-STORE（org_type='SITE' AND site_business_type='STORE'）单独点亮 | W6 M5：`/api/master/stores` 与 master-data-runtime/store 路由合并方案——mst_stores 退化为视图，主身份走 SITE |
| #3 brd_houses 必属 site | 本 wave 不动 brd_houses schema；不加 FK；type_rules 配置里 HOUSE 不进 sys_organizations（house 是 brd_houses 独立行） | M1 子文档列出 brd_houses.site_code FK 落地的灰度方案；DDL 由 Architect 在 W5+ 出 |
| #4 shareholder scope 不并入 sys_user_scopes | 本 wave 不动 `shr_shareholder_scope`；不规划 `sys_user_scopes` 表；DataScope 输出层未来仍可暴露 `allowedShareholderCodes`（由 service 从 `shr_shareholder_scope` 计算后透传），底层不变 | W7+ sys_user_scopes 合表方案文档（M-Architect）只覆盖 4 张以 user_id 为主键的 scope 表（org / project / farm / warehouse），不动 shr_shareholder_scope |

---

## 2. sys_organization_type_rules 表设计

### 2.1 表结构

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `org_type` | varchar(32) | **PK** | 与 `sys_organizations.org_type` 同源；唯一标识 |
| `label_zh` | varchar(64) | NOT NULL | 中文标签（如"法人主体"、"业务站点"） |
| `code_prefix_regex` | varchar(128) | NOT NULL | code 命名规范的正则前缀（如 `^COMP-`、`^SITE-`） |
| `required_fields` | text[] | NOT NULL DEFAULT '{}' | sys_organizations 写入该 type 时必填的字段名（如 `['org_name','company_code']`） |
| `allowed_parent_types` | text[] | NOT NULL DEFAULT '{}' | parent_id 所指节点允许的 org_type 集合；空数组 = 必须是根 |
| `allowed_child_types` | text[] | NOT NULL DEFAULT '{}' | 子节点允许的 org_type 集合；空数组 = 不允许有子节点 |
| `notes` | text | NULL | 备注（说明历史背景、与 canonical 表的关系） |
| `status` | varchar(16) | NOT NULL DEFAULT 'ACTIVE' | ACTIVE / ARCHIVED |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() | — |

### 2.2 初始 9 条 seed

| org_type | label_zh | code_prefix_regex | required_fields | allowed_parent_types | allowed_child_types | notes |
|---|---|---|---|---|---|---|
| GROUP | 集团 | `^GROUP-` | `[org_name]` | `[]` | `[COMPANY, BU]` | 集团顶层节点 |
| BU | 业务单元 | `^BU-` | `[org_name, company_code]` | `[GROUP]` | `[]` | 横切式；canonical 表 = biz_business_units（org 树占位） |
| COMPANY | 法人主体 | `^COMP-` | `[org_name, company_code, manager_user_id]` | `[GROUP]` | `[SITE, DEPARTMENT]` | canonical 行；org_code = company_code |
| SITE | 业务站点 | `^SITE-` | `[org_name, company_code, site_business_type]` | `[COMPANY]` | `[DEPARTMENT]` | site_business_type ∈ {FARM, BROILER, HATCHERY, FACTORY, WAREHOUSE, STORE, OFFICE} |
| DEPARTMENT | 部门 | `^DEPT-` | `[org_name, company_code]` | `[COMPANY, SITE]` | `[]` | 用于 HR / 流程发起人 / 审批节点 |
| PROJECT | 项目（org 树占位） | `^PRJ_` | `[org_name, company_code]` | `[COMPANY]` | `[]` | canonical 走 biz_projects；org 树仅作占位（少数历史行） |
| WAREHOUSE | 仓库（树内占位） | `^(WH_\|SITE-)` | `[org_name, company_code]` | `[COMPANY, SITE]` | `[]` | canonical 走 wms_warehouses；树内占位（user 拍板 #1：仓库 ≠ site） |
| STORE | 门店（视为 SITE 子类） | `^SITE-` | `[org_name, company_code]` | `[COMPANY]` | `[]` | user 拍板 #2：门店即 SITE-*-STORE，mst_stores 是兼容台账 |
| FACTORY | 工厂（视为 SITE 子类） | `^SITE-` | `[org_name, company_code]` | `[COMPANY]` | `[]` | 与 STORE 同思路 |

> ⚠ 本 wave **仅建表 + seed**，不接 service 校验。`sys_organizations.create/update` 在 W5+ 才接入此表进行 type → required_fields / parent / prefix 校验。

### 2.3 service 改造时机

- W4：**不接入** service；只让 entity 可被 future query。
- W5（M2 后置）：org.service create/update 加入 type_rules 查询作为软警告（warn 不 throw）。
- W6+：升级为硬校验（throw on violation）。

---

## 3. biz_site_aliases 激活方案

### 3.1 当前状态盘点

- 表：已建于 `migrations/mdm1_02_biz_site_aliases.sql`（含触发器校验 site_code 必须为 sys_organizations.SITE）
- 现有 seed：9 行（孟赛 7 + 东鹏 2），全部 alias_type 取值在 `{FARM_CODE, OLD_SITE_CODE, EXCEL_NAME, LEGACY_NAME}` 范围
- 服务消费现状：**尚无业务 service 读 biz_site_aliases**（设计意图：service 切换路径放 M1 W6+）

### 3.2 W4 的 "激活" 含义

按 Audit 评审 §4 表格，可直接放行的 "无歧义子集" 是 **OLD_SITE_CODE / WAREHOUSE_LEGACY_CODE** 两类。结合 user 拍板 #1（仓库 ≠ site）：

- ❌ **WAREHOUSE_LEGACY_CODE 不再适用**：仓库不属于 site，没必要把 warehouse 旧 code 映射到 site_code。仓库历史 code 的治理在 W5+ 单独走（属 wms 模块）。
- ✅ **OLD_SITE_CODE 已部分入种**：mdm1_02 现存 2 行（FARM-MS、FARM-DP）。本 wave **不新增** alias 行，避免业务方拍板未决的情况下扩散。
- ✅ W4 验证脚本（§5）会输出"alias 表行数 + alias_type 分布"统计，给后续 wave 决策用。

### 3.3 W4 实际动作

- 在 W4 TS migration 里**仅做表存在性校验**（IF NOT EXISTS 即写 warn log），不新增 alias 行。
- 不动 service 消费路径。

未来：M1 子文档（待写）将列出"哪一批 alias 在 W5 W6 灰度激活、消费 SQL 怎么写、回滚剧本"。

---

## 4. master-data-runtime TYPES "扩展" 范围

### 4.1 不破坏现有 API 的方式

**问题**：`TYPES` 字典直接控制 `/api/master-data/runtime/:type/*` CRUD 端点。在 TYPES 加 `site / business-unit / shareholder` 会立即暴露新 CRUD 路由，可能触发审批工作流空跑、操作日志混入未上线类型等连锁。

**取舍**：在 W4 **不动** `master-data-runtime.service.ts` 的 TYPES 字典；改为只在三类**只读聚合服务**上加这 3 类的展示：

| service | 改动 | 影响面 |
|---|---|---|
| `master-data/operations.service.ts` | `CENTERS` 数组新增 1 个 center `'extended-gov'`（成员：SITE 子集 / BU / shareholder） + `search()` queries 新增 3 行 | 6 中心首页多 1 个卡片；全局搜索可命中 3 类 |
| `master-data/governance.service.ts` | `GovernanceScores.details` 增加可选 `extended` 块（不动 overall / org_score / ... 任何现有字段）；`computeScores()` 在最后追加 3 个统计 | 评分驾驶舱前端可选读 details.extended，不读不影响 |
| `master-data/master-data-references.service.ts` | **不动** | 引用图谱目前只关心引用流向，3 个新类作为"被引用方"扩展放 W5+ |

### 4.2 具体新增内容

#### operations.service.ts CENTERS 增项

```ts
{
  key: 'extended-gov', label: '扩展治理（W4 起）',
  members: [
    { type: 'site',          table: 'sys_organizations',  codeCol: 'org_code',           href: '/master-data/sites',           filter: "org_type='SITE'" },
    { type: 'business-unit', table: 'biz_business_units', codeCol: 'bu_code',            href: '/master-data/business-units' },
    { type: 'shareholder',   table: 'shr_shareholders',   codeCol: 'shareholder_code',   href: '/master-data/shareholders' },
  ],
}
```

#### operations.service.ts search() queries 增项

3 条 SELECT 落到 SQL 列表（与现有 9 类同模式，每类 LIMIT 5）。

#### governance.service.ts details.extended 增项

```ts
details.extended = {
  sites:       { total, active, archived },
  businessUnits: { total, active, archived },
  shareholders:  { total, active, archived },
};
```

注意：本 wave **不改 overall 评分公式**，不影响现有评分卡片。

### 4.3 验收

- ✅ 旧 API 响应字段全部保留
- ✅ 旧前端不感知 extended 块
- ✅ 新增字段全部 optional / 容错（SQL 异常 → 返回 0，不抛）
- ✅ tsc 0 error

---

## 5. scripts/check-master-data-references.mjs 验证脚本

### 5.1 目标

提供一个**静态 + 动态可选**的引用一致性体检工具，输出：

1. **canonical 表存在性**（sys_organizations / biz_projects / sal_customers / prc2_suppliers / mst_products / mst_materials / product_skus / mst_stores / wms_warehouses / fin_cash_accounts / fin_bank_accounts / sal_drivers / sys_dict / shr_shareholders / biz_business_units / biz_site_aliases / sys_organization_type_rules）—— 静态检查模块源码引用
2. **W4 新建表存在性**（sys_organization_type_rules）—— 通过 DB 连接验证（如有 DATABASE_URL）
3. **alias 表行数与 type 分布**（biz_site_aliases）—— DB 可选
4. **业务表是否引用了"旧 canonical"**（`brd_farms` / `sys_store` 等已 ARCHIVED 目标）—— grep 源码

### 5.2 退出语义

- W4：**信息性脚本**，无论结果如何 exit code = 0（除非 IO 异常）
- 后续 wave：可选挂为 CI red-line（W6+ 决定）

### 5.3 调用约定

```bash
# 仅静态分析
node scripts/check-master-data-references.mjs

# 含 DB 校验
DATABASE_URL=postgres://mac@localhost:5432/phoenix_erp \
  node scripts/check-master-data-references.mjs --with-db
```

### 5.4 输出格式

人类可读 + JSON 双模（`--json` 切换）。默认输出三段：
- 🟢 canonical 表使用情况（每张表被几个 module 引用）
- 🟡 alias 表健康（行数、type 分布、最早/最晚 created_at）
- 🔴 旧 canonical 仍在用的 grep 命中（行号 + 上下文 5 行）

---

## 6. 落地清单

| # | 操作 | 责任人 | 状态 |
|---|---|---|---|
| 1 | 写 `docs/MASTER_DATA_W4_EXECUTION_PLAN.md`（本文件） | Architect | ✅ |
| 2 | 写 `apps/api/src/database/migrations/1782000000000-W4MasterDataFoundation.ts` | Architect | ✅ |
| 3 | 写 `apps/api/src/modules/org/entities/sys-organization-type-rule.entity.ts` | Architect | ✅ |
| 4 | 扩展 `apps/api/src/modules/master-data/operations.service.ts` CENTERS + search | Architect | ✅ |
| 5 | 扩展 `apps/api/src/modules/master-data/governance.service.ts` details.extended | Architect | ✅ |
| 6 | 写 `scripts/check-master-data-references.mjs` | Architect | ✅ |
| 7 | 本地跑 `cd apps/api && ./node_modules/.bin/tsc --noEmit` 验证 | Architect | 用户拍板后回归 |
| 8 | 本地跑 `node scripts/check-master-data-references.mjs` 验证 | Architect | 用户拍板后回归 |
| 9 | commit + PR → Audit Agent review | Architect → Audit | 用户拍板后 |

## 7. 风险与回滚

### 7.1 风险

| 风险 | 等级 | 缓解 |
|---|---|---|
| TS 迁移 up() 含 INSERT（治理 seed） | 🟢 低 | 头 30 行 `@allow-data-dml: ` 显式标记豁免（符合 CLAUDE.md g198 例外） |
| operations.service / governance.service 新查询 SQL 报错（如 shr_shareholders 列不存在） | 🟢 低 | 全部走 `safe<>(sql)` 包装，异常返回空数组（与既有模式一致） |
| 用户后续不接受 sys_organization_type_rules 的 9 条 seed | 🟢 低 | down() 一句 DROP TABLE，无副作用 |
| 新 entity 与 DB 漂移 | 🟢 低 | entity 在迁移同 PR 内交付，DB ↔ entity 同一 wave 对齐 |
| operations.service CENTERS 新增 → 前端首页多卡片导致布局错位 | 🟡 中 | 前端 6 中心首页 Render 6 cards；多 1 张需要前端配合；本 wave 后端能 tolerate 前端不读 |

### 7.2 回滚步骤

1. **代码层**：`git revert <merge-commit>` → 走标准 deploy.yml 流程；禁 `git push --force`。
2. **DB 层**：
   ```bash
   docker compose exec -T api ./node_modules/.bin/typeorm \
     -d dist/database/data-source.js migration:revert
   ```
   反向执行 `down()`，DROP `sys_organization_type_rules` 表。
3. **typeorm migrations 表**：`migration:revert` 会自动清行；无需手动。
4. **biz_site_aliases**：W4 未触碰，无回滚动作。

### 7.3 验收命令

```bash
# 1) 类型检查
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit

# 2) entity ↔ DB 漂移基线（迁移后跑）
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# 3) TS 迁移 down() / no-DML 体检
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations
# ↑ 预期：迁移文件头 @allow-data-dml 标记会被 no-data-dml 脚本识别豁免；
#   如脚本仍红，需要 Audit Agent 评审"该 seed 是否符合 g198 豁免精神"

# 4) 引用一致性
node scripts/check-master-data-references.mjs

# 5) 在线确认（可选，需 API 启动）
curl -sf http://127.0.0.1:3100/api/master-data/operations/centers | jq '.data | length'
# 预期 ≥ 7（原 6 + 新 extended-gov）

curl -sf http://127.0.0.1:3100/api/master-data/governance/score | jq '.data.details.extended'
# 预期 出现 sites / businessUnits / shareholders 三块
```

---

## 8. 与上游文档的一致性

- ✅ MULTI_AGENT_PHASE2_PLAN.md §2.2 Architect 任务 M4：本 wave 覆盖"治理图谱补 4 类"中的 3 类（site / BU / shareholder），company 已在 TYPES 内
- ✅ MULTI_AGENT_PHASE2_PLAN.md §4 冻结清单：本 wave 未动任何冻结 schema
- ✅ MULTI_AGENT_PHASE2_PLAN.md §5 Step 3 "Architect 出 M1/M2/M3 主数据合并方案文档"：本文件是 M4 早期产出 + W4 落地清单；M1/M2/M3 子文档作为后续独立交付
- ✅ MASTER_DATA_PHASE2_DESIGN.md §5.2 W4 "sys_organization_type_rules 配置表"：本 wave 落
- ✅ MASTER_DATA_PHASE2_DESIGN.md §5.1 W4 "biz_site_aliases seed + biz_site_projects 新增"：本 wave 仅做 alias 表存在性校验，biz_site_projects 暂缓（Audit §3.2 风险 b 未解）
- ✅ MASTER_DATA_PHASE2_REVIEW.md §4 "W4 最小可放行集"：4 项全部覆盖（1/3/4 直接落，2 仅做存在性校验代替 seed 扩展）
- ✅ MASTER_DATA_PHASE2_REVIEW.md §5.2 / §3.3-a：user 拍板 #4 解决 shareholder scope 语义，本 wave 不动 sys_user_scopes 合表，符合 review 红线
- ✅ CLAUDE.md §0 entity ↔ DB 对齐：迁移和 entity 同 PR 交付
- ✅ CLAUDE.md §0.5 nullable-in-unique：sys_organization_type_rules 单列 PK 自然 NOT NULL，无问题
- ✅ CLAUDE.md TS 迁移红线（含 down + 无业务 DML）：含 down；`@allow-data-dml` 标记治理 seed 豁免

---

## 9. 后续 wave 衔接

| Wave | 衔接事项 | 输入 |
|---|---|---|
| W4-late / W5 | M1 子文档（biz_site_aliases 消费方案 / SiteSelector）落 | 本文件 §1 拍板 #2#3 |
| W5 | M2 子文档（biz_projects 收口 / project_manager_user_id 列扩 / shr_projects 退化预案） | 本文件 §0.2 红线 |
| W6 | M3 子文档（inv_batches 字段约束方案，**保留 warehouse_code** 不重命名为 owning_company_code） | user 拍板 #1 |
| W5+ | org.service 接 sys_organization_type_rules 软警告 | 本文件 §2.3 |
| W6+ | operations.service "扩展治理" center 走前端首页（前端协同） | 本文件 §4.2 |

---

**本计划生效日期：2026-06-20。后续 Wave 启动前，需 Audit Agent 复审 + 用户拍板。**
