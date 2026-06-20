# 主数据 W4 落地审查

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：
> - `docs/MASTER_DATA_W4_EXECUTION_PLAN.md`
> - `docs/MASTER_DATA_PHASE2_DESIGN.md`
> - `docs/MASTER_DATA_PHASE2_REVIEW.md`（上一轮 Audit 决议）
> - 已落代码（commit `f4f33bc`）：
>   - `apps/api/src/database/migrations/1782000000000-W4MasterDataFoundation.ts`
>   - `apps/api/src/modules/org/entities/sys-organization-type-rule.entity.ts`
>   - `apps/api/src/modules/master-data/operations.service.ts`（+15 行）
>   - `apps/api/src/modules/master-data/governance.service.ts`（+39 行）
>   - `scripts/check-master-data-references.mjs`（+266 行）
> - 本评审本地实跑 `node scripts/check-master-data-references.mjs`（静态模式）的真实输出
>
> 本评审不修改业务代码、不新增 migration、不调脚本；仅判 W4 是否过关、
> 是否解锁 ERP E3/E5/E6 与 Finance F1-F5。

---

## 0. 结论速读

| 维度 | 结论 |
|---|---|
| W4 migration 幂等 / 可回滚 / 无破坏性 | ✅ **三项全过**（详 §1） |
| sys_organization_type_rules 4 条用户拍板对齐 | 🟡 **整体对齐，但 STORE/FACTORY/WAREHOUSE 在"独立 org_type 还是 SITE.site_business_type"上与母规划 §1.1 自相矛盾**（详 §2） |
| operations / governance 加法是否破坏现有 API | ✅ **后端兼容**；🟡 **前端 6→7 卡片需配合**（详 §3） |
| `scripts/check-master-data-references.mjs` 是否可作为后续验收 | ✅ **W4 信息性 OK**；🟡 **若 W6+ 挂 CI red-line，需先调白名单 + 加 baseline 机制**（详 §4） |
| 4 个漂移告警是否必入 W5/W6 | 🔴 **prc2_projects + shr_projects 必入 M2 → W5/W6**；🟡 **brd_farms 白名单外 6 模块 + sys_store 3 行必入 M1/M5 W5/W6** |
| 是否允许 ERP Agent 启动 E3 / E5 / E6 | ✅ **完全独立，可立即启动** |
| 是否允许 Finance Agent 启动 F1 - F5 | ✅ **5 项全部可立即启动** |
| **总决议** | **🟢 通过**（W4 已具备 Audit 评审 §4 推荐的最小可放行集；§2/§3/§4 的 🟡 项作为 W5 起的输入，不阻塞 W4 合入） |

---

## 1. Migration 幂等 / 可回滚 / 无破坏性

### 1.1 静态审 `1782000000000-W4MasterDataFoundation.ts`

| 检查项 | 实现 | 结论 |
|---|---|---|
| 文件头 `@allow-data-dml` 豁免标记（CLAUDE.md g197-H 例外） | `@allow-data-dml: 新建 sys_organization_type_rules 配置表 + 初始 9 条治理规则 seed` | ✅ 标记在头 30 行内，符合 g198 例外精神（治理 seed 是允许场景） |
| up() 是否含 down() | 单句 `DROP TABLE IF EXISTS sys_organization_type_rules` | ✅ 反向干净 |
| 幂等性 | `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT (org_type) DO NOTHING` | ✅ 重复跑安全；`COMMENT ON TABLE` 是覆盖式 idempotent |
| 破坏性 | 仅新建 1 张表 + 9 行 seed；不动任何现有表 | ✅ 无破坏 |
| `biz_site_aliases` 兜底 | 仅 `information_schema` 查表 + `console.warn`（不 throw） | ✅ 新环境缺表时 API 仍能起 |
| 与 g198 nullable-in-unique 红线 | 单列 PK (`org_type`)，自然 NOT NULL | ✅ 不触发 |
| up() 是否含业务 DML（INSERT/UPDATE/DELETE）跨业务表 | seed 仅写新表自己 | ✅ 不污染他表 |
| up() 是否依赖运行时常量（如 NOW()/current_setting） | `created_at/updated_at` DEFAULT `now()` 全部交给 PG | ✅ 无外部依赖 |
| 表注释 | `COMMENT ON TABLE` 显式中文化目标 | ✅ 治理可读性达标 |
| 与 g197 entity-drift baseline | 同 PR 内交付 entity 文件 + migration | ✅ entity ↔ DB 同 wave 对齐 |

### 1.2 entity 与 DB 对齐

`sys-organization-type-rule.entity.ts` 字段一一对应：

| Column | Entity | 一致性 |
|---|---|---|
| `org_type VARCHAR(32) PRIMARY KEY` | `@PrimaryColumn({...length: 32})` | ✅ |
| `label_zh VARCHAR(64) NOT NULL` | `@Column({...length: 64})` | ✅ |
| `code_prefix_regex VARCHAR(128) NOT NULL` | `@Column({...length: 128})` | ✅ |
| `required_fields TEXT[] NOT NULL DEFAULT '{}'` | `@Column({array: true, default: ARRAY[]::TEXT[]})` | ✅ |
| `allowed_parent_types TEXT[]` 同上 | 同上 | ✅ |
| `allowed_child_types TEXT[]` 同上 | 同上 | ✅ |
| `notes TEXT NULL` | `@Column({nullable: true})` | ✅ |
| `status VARCHAR(16) DEFAULT 'ACTIVE'` | `@Column({length: 16, default: 'ACTIVE'})` | ✅ |
| `created_at TIMESTAMPTZ DEFAULT now()` | `@Column({default: () => 'now()'})` | ✅ |
| `updated_at TIMESTAMPTZ DEFAULT now()` | `@Column({default: () => 'now()'})` | ✅ |

entity 走 `data-source.ts` glob 自动加载（`${rootDir}/**/*.entity.${ext}`），
无需在 OrgModule.forFeature() 显式注册——W4 不开放 repository 注入，OK。

### 1.3 与上游约束

- ✅ MULTI_AGENT_PHASE2_PLAN §4 冻结清单：本 wave 不触任何冻结表 schema。
- ✅ MASTER_DATA_PHASE2_REVIEW §4 W4 最小集：本 wave 完整覆盖（1/2 落地 + 3 仅做存在性校验）。
- ✅ CLAUDE.md g195-P5 红线：down() 完整；up() 仅治理 seed + `@allow-data-dml`。
- ✅ CLAUDE.md §0 铁律：entity ↔ DB 同 PR 对齐。

**§1 结论**：✅ **三项全过**。

---

## 2. sys_organization_type_rules 与用户拍板 4 条对齐度

### 2.1 拍板项逐条核验

| 拍板项 | 落地证据 | 结论 |
|---|---|---|
| #1 仓库 ≠ site，库存用 `warehouse_code` | seed 中 `WAREHOUSE` 行：`code_prefix_regex='^(WH_\|SITE-)'`，`notes='canonical 走 wms_warehouses;树内占位(user 拍板 #1:仓库 ≠ site)'` | ✅ 拍板入模；但⚠见 §2.2 |
| #2 门店 = `SITE-*-STORE`，mst_stores 是兼容台账 | `STORE` 行：`code_prefix_regex='^SITE-'`，`notes='user 拍板 #2:门店即 SITE-*-STORE,mst_stores 是兼容台账'` | ✅ 拍板入模；但⚠见 §2.2 |
| #3 brd_houses 必属 site，最终加 FK | W4 不动 brd_houses schema，未把 HOUSE 列入 type_rules（house 在 brd_houses 独立行，不在 sys_organizations） | ✅ 符合"W4 不动 brd_houses" |
| #4 shareholder scope 不并入 sys_user_scopes | W4 不动 `shr_shareholder_scope`，不规划 `sys_user_scopes` 表 | ✅ 符合 |

### 2.2 ⚠️ 唯一定义冲突：STORE / FACTORY / WAREHOUSE 是独立 org_type 还是 SITE 子类？

| 来源 | 表述 |
|---|---|
| 母规划 `MASTER_DATA_PHASE2_DESIGN.md §1.1` | "L3 业务站点 ... `site_business_type ∈ {FARM, BROILER, HATCHERY, FACTORY, **WAREHOUSE**, **STORE**, OFFICE}`" — 即 STORE/FACTORY/WAREHOUSE 是 **SITE 的 site_business_type 子类** |
| W4 seed | 把 `STORE / FACTORY / WAREHOUSE` 三个都作为 **独立 org_type** 单列 1 行 type_rules |

**矛盾点**：
- 若 STORE/FACTORY/WAREHOUSE 是 SITE 的子类，未来 `sys_organizations.org_type` 只
  有 9 个真值（GROUP / BU / COMPANY / SITE / DEPARTMENT / PROJECT + 历史遗留），
  STORE/FACTORY/WAREHOUSE 不该出现在 org_type 字段；W5+ service 校验时按
  `org_type='SITE' AND site_business_type='STORE'` 判定。
- 若 STORE/FACTORY/WAREHOUSE 是独立 org_type（如当前 seed 所写），则 SITE 实际只覆
  盖 FARM/BROILER/HATCHERY/OFFICE 等"非门店非仓库非工厂"的场所；与母规划 §1.1
  `site_business_type` 含 STORE/WAREHOUSE/FACTORY 直接冲突。

**对 W5+ 的实际影响**：
- 母规划 §3.2 SiteSelector 端点 `GET /api/org/sites/active?type=FARM|STORE|WAREHOUSE|FACTORY|OFFICE&companyCode=` 的 `type` 究竟是 `site_business_type` 还是 `org_type`，会有歧义。
- governance.service §4.2 已用 `org_type='SITE'` 过滤 site 子集（含全部 site_business_type）——隐含的是"SITE 是聚合容器"模型。

**判定**：
- 本 wave 不需要回滚（seed 仍可保留）。
- **必须在 M1 / M3 子文档明文统一**：要么"STORE/FACTORY/WAREHOUSE 是 SITE 子类，
  org_type 仅 6 类"，要么"STORE/FACTORY/WAREHOUSE 是独立 org_type，SITE 仅承载
  FARM/BROILER/HATCHERY/OFFICE"。Audit 倾向**前者**（与母规划 §1.1 一致 + 与
  user 拍板 #2 "门店即 SITE-*-STORE"语义吻合）。
- 若选前者，W5 起 seed 需 UPDATE 删除 STORE/FACTORY/WAREHOUSE 三行（或合并到
  SITE 单行 + 增加 site_business_type 维度的 sub-table）。

**§2 结论**：🟡 **基本符合 4 条拍板，但 STORE/FACTORY/WAREHOUSE 与 SITE 子类化
模型有 1 处文档级冲突**——不阻塞 W4，但需在 M1 / M3 子文档明文统一，避免在 W5
组装 SiteSelector 时遇到口径分歧。

---

## 3. operations / governance 加法是否破坏现有 API

### 3.1 operations.service.ts

| 改动 | 影响面 |
|---|---|
| `CENTERS` 数组从 6 个增到 7 个（新增 `extended-gov`） | `/api/master-data/operations/centers` 返回多 1 条；`/api/master-data/operations/stats` 多统计 1 个 center；search 多 3 类候选 |
| 新查 3 张表（`sys_organizations` `org_type='SITE'` / `biz_business_units` / `shr_shareholders`） | 三表均已存在；查询通过 `safe<>(sql)` 包裹，异常返回空数组 |
| 不动 `master-data-runtime.service.ts` TYPES 字典 | ✅ 不新增 CRUD 端点；不触发审批工作流空跑 |

**后端兼容性**：
- ✅ 旧 client 调 `/operations/centers` 收到 7 条，使用 `.map()` 渲染的前端无影响；
  使用 `.find(c => c.key === 'org')` 等 key 索引的旧前端也无影响。
- 🟡 **风险**：若前端 6 中心首页有写死 6 卡片的 JSX（如 `centers.slice(0, 6).map`
  或 grid 写死 3×2），新增 1 张会引起布局错位。**需 ERP / 前端 Agent 配合验**。
- ✅ search 端点新增 3 类 query：与现有 9 类同模式 + 同样 `safe<>` 兜底，无回归风险。

### 3.2 governance.service.ts

| 改动 | 影响面 |
|---|---|
| `GovernanceScores.details` 增可选字段 `extended?: { sites, businessUnits, shareholders }` | TypeScript 类型可选 → 旧 client 不读 `details.extended` 完全无影响 |
| `computeScores()` 末尾追加 3 个 `safe<>` SQL | overall / *_score 公式未变 |
| 3 个新 SQL 命中表是否存在 | 全部已存在：`sys_organizations` ✅ / `biz_business_units` ✅（COALESCE(status,'ACTIVE') 兜底） / `shr_shareholders` ✅ |
| 异常路径 | `safe<>` `try/catch` 返回 `[]` → `aggregate([])` 返回 `{total:0, active:0, archived:0}`，永不抛 |

**后端兼容性**：
- ✅ `/api/master-data/governance/score` 返回结构向后兼容（仅追加可选字段）。
- 🟢 性能：governance 评分端点已是 N 张表 safe 顺序查询，新增 3 次 query 影响
  毫秒级，不需要单独 cache。

### 3.3 验收建议

- 前端联调：在 W5 任一时点跑一次 `curl /api/master-data/operations/centers | jq '.data | length'`
  确认返回 7；并请前端 Agent 检查首页是否能渲染 7 卡片。
- 前端如果**临时不读**新增 center 也 OK，本 wave 保持向后兼容。

**§3 结论**：✅ **后端 API 全部向后兼容**；🟡 **前端首页布局需 ERP / 前端 Agent
独立确认 6→7 卡片不破坏 UI**。

---

## 4. `scripts/check-master-data-references.mjs` 作为后续 wave 验收脚本

### 4.1 W4 阶段适配性

| 检查项 | 实现 | 结论 |
|---|---|---|
| 静态 grep 覆盖度 | 扫 `apps/api/src/modules/**/*.ts` 419 文件，canonical 19 张表，legacy 4 张漂移源 | ✅ 覆盖面够 |
| 词边界正则 `\\b<table>\\b` | 避免 `brd_farms` 命中 `brd_farms_legacy` 等 | ✅ 误报低 |
| 退出语义 | `exit 0` 信息性（W4 约定） | ✅ |
| DB 模式 `--with-db + DATABASE_URL` 缺包兜底 | `pg` 不在 workspace → 输出 `error: ... not installed` 且不崩 | ✅ 优雅降级 |
| 输出可读性 | 三段分色（🟢 canonical / 🔴 漂移 / 🟡 DB），module 聚合 | ✅ |
| `--json` 模式 | 输出结构化 report | ✅ 适合 CI 接入 |

### 4.2 本地实跑结果（关键摘录）

```
🟢 Canonical 表使用情况
  sys_organizations                  58 hit (9 module)
  sys_organization_type_rules        1 hit (1 module)    ← W4 新建,仅 org/entities 引用
  biz_business_units                 8 hit (2 module)
  biz_projects                      12 hit (3 module)
  biz_site_aliases                  ⚠ 0 hit              ← 未被任何 service 消费(符合 W4 设计)
  sal_customers                     59 hit (7 module)
  prc2_suppliers                    13 hit (4 module)
  mst_stores                        18 hit (6 module)
  wms_warehouses                    20 hit (6 module)

🔴 旧 canonical / 高危 alias 漂移
  brd_farms                         27 hit (6 module 之外: farm)
  sys_store                          3 hit (2 module)
  prc2_projects                      6 hit (2 module 之外: procurement-v2, workflow)
  shr_projects                       6 hit (3 module 之外: shareholder, master-data)
```

### 4.3 用作 W6+ CI red-line 的前置改造

若 W6+ 要把脚本挂为 CI 红线（exit 非 0 当失败），必须先做以下 4 项：

1. **白名单收口**：当前 `prc2_projects` 的 `ignoreModules` 包含 `workflow`，
   但 ERP 第一阶段审计已明确 `workflow.assignment-resolver.byProjectManager`
   仍读 prc2_projects（必须 W8 切到 biz_projects）。**白名单等于把 W8 必修项
   永久免责** —— 需改成"W8 之前白名单，W8 之后移出"，或加 wave 时间戳。
2. **baseline 机制**：参考 `.github/entity-drift-baseline.txt` 模式，落
   `.github/master-data-drift-baseline.json`，新 PR 让漂移 hit 数增长才红灯，
   保护治理进度不倒退。
3. **退出码语义**：W4 一律 exit 0；后续 wave 需要"漂移增长 → exit 1 / 持平
   → exit 0"双轨。
4. **rootDir 鲁棒性**：当前 `ROOT = resolve(import.meta.url, '../../')` 假设
   脚本在 `scripts/` 下；从其他 cwd 调用也能跑（已实测 OK），但若被复制到子目录
   会偏。建议加 `git rev-parse --show-toplevel` 兜底（小事）。

### 4.4 当前真实漂移图谱（W4 输入 W5 的关键面）

`generic-crud` 模块对 `brd_farms` 18 hit / `mst_stores` 7 hit / `wms_warehouses`
8 hit ——这是个"通用 CRUD 兜底层"，按规范应该被 master-data-runtime 与
Selector 替代；但**短期内**改不动。建议在 baseline 里冻结这部分作为已知背景值。

**§4 结论**：✅ **W4 信息性输出合格，可作为 W5+ 起的"漂移监测仪表盘"**；
🟡 **若 W6+ 升级为 CI red-line，先做 4.3 节 4 项改造**。

---

## 5. 4 个漂移告警的下波次归属

按本地实跑 + 上游审计交叉判定：

### 5.1 🔴 `prc2_projects` 6 hit（必入 M2 / W5 / W8）

| 命中位置 | 风险 | 下波次归属 |
|---|---|---|
| `approval-engine/workflow-biz-registry.service.ts:258-262`（4 hit） | 工作流业务对象注册表把 PROJECT module 的真表写成 `prc2_projects`；M2 切 biz_projects 后此处不同步则 workflow 状态永远错配 | **M2 子文档必须列入；W8 E7 执行时同步改 registry** |
| `master-data/master-data-references.service.ts:108`（2 hit） | 主数据引用图谱把 PROJECT 引用方写为 prc2_projects | **W8 同步替换** |

### 5.2 🔴 `shr_projects` 6 hit（必入 M2 / W5 / W6）

| 命中位置 | 风险 | 下波次归属 |
|---|---|---|
| `data-quality/code-governance.service.ts:40` `master-data-health.service.ts:27,52`（3 hit） | 数据质量健康检查硬编码 shr_projects 作为 11 主表之一 | **M2 退化 shr_projects → shr_project_attrs 后必须改** |
| `product-master/lookup.controller.ts:198` 注释（2 hit） | lookup 端点用 `shr_project_equity → shr_projects.company_code` 派生 | **W6 改 shr_project_attrs 时联动** |
| `approval-engine/workflow-biz-registry.service.ts:258`（1 hit） | 注释里说"shr_projects 不存在"——已是事实错误，列出来即可 | **同步修复** |

### 5.3 🟡 `brd_farms` 27 hit（白名单外 6 模块，分两段处理）

| module | hit | 风险 | 下波次归属 |
|---|---|---|---|
| `generic-crud` 18 | 兜底 CRUD 直写 brd_farms 编码、内部 fixture | **W6+ M1 落 SiteSelector 后**重点改写（先 baseline 冻结） |
| `data-quality` 4 | 主数据健康检查表硬编码 brd_farms | **M1 配合：health 表迁到 sys_organizations(SITE,FARM)** |
| `product-master` 2 | lookup 端点引 brd_farms 派生 | **W6 改** |
| `bff` 1（`bff.controller.ts:1764`） | 前端聚合接口直查 brd_farms | **W6 改** |
| `org` 1 | 应当指向 sys_organizations，疑似遗留 | **快速核查后 W5/W6 修** |

### 5.4 🟡 `sys_store` 3 hit（W5/W6 必清）

| 命中位置 | 风险 | 下波次归属 |
|---|---|---|
| `generic-crud/crud.constants.ts:8` + `generic-crud.controller.ts:349` | sys_store 在白名单内 | **W6 退 sys_store 时同步删** |
| `master/master.controller.ts:30` `SELECT * FROM sys_store WHERE status=1` | `/api/master/stores` fallback（已规划 M5 退役） | **M5 W6 退役** |

### 5.5 §5 总结

| 漂移源 | W5/W6 归属 |
|---|---|
| `prc2_projects` | 🔴 **强制 W8 E7 同步 approval-engine + master-data-references** |
| `shr_projects` | 🔴 **强制 W6 M2 同步 data-quality + product-master/lookup + approval-engine 注释** |
| `brd_farms` | 🟡 W5+ M1 落 SiteSelector → W6 起按模块切（generic-crud / bff / data-quality / product-master / org） |
| `sys_store` | 🟡 W6 M5 退役 `/api/master/stores` 时同步 generic-crud 白名单清除 |

---

## 6. 是否允许 ERP Agent 启动 E3 / E5 / E6

| 任务 | 与 W4 依赖关系 | 启动判定 |
|---|---|---|
| **E3** `prc2_ap_ledger.supplier_code` + `supplier_id` 二选一 | 无主数据依赖；纯 ERP service 收口 | ✅ **可立即启动** |
| **E5** `inv_batches.status` → `INV_STOCK_STATUS` 字典 | 无主数据依赖；字典已在 sys_dict（W4 未触） | ✅ **可立即启动** |
| **E6** 角色硬编码清理（procurement.service:60 / workflow.service:84,2042-2056 / assignment-resolver:215） | 无主数据依赖；纯 RBAC 读 sys_role_menu_permission | ✅ **可立即启动** |

**§6 结论**：✅ **三项均可立即启动**。Audit 协助点：
- E6 改完后跑 `bash scripts/g5c-rbac-audit.sh` 验非超管角色不掉权。
- E3 改完后跑一次 `check-master-data-references.mjs`，确认 prc2_suppliers
  hit 数不下降（避免误删读路径）。

---

## 7. 是否允许 Finance Agent 启动 F1 - F5

| 任务 | 与 W4 / 主数据契约依赖 | 启动判定 |
|---|---|---|
| **F1** DataScope CLS 收口（删 finance-v2 自定义 scopeAll/companyCodes） | CLS 当前字段已是 `isGlobal / allowedCompanyCodes`（Finance §5.2 证实，W4 未改 data-scope.service） | ✅ **可立即启动** |
| **F2** 项目维度补齐 `allowedProjectCodes` + 前端 ProjectSelector | CLS 已含 `allowedProjectCodes`；ProjectSelector 已存在（无需 W4 新增） | ✅ **可立即启动** |
| **F3** 报销 pay() 旁路收口到 CashTransactionsService | 与主数据无关 | ✅ **可立即启动** |
| **F4** `POST /api/v2/finance/ap/invoices/:id/pay` 新端点 | 与主数据无关 | ✅ **可立即启动** |
| **F5** AP/AR/Receipt attachment_urls 方案文档 | 纯文档；Architect 后续评 DDL | ✅ **可立即启动** |

**§7 结论**：✅ **F1 - F5 全部可立即启动**。F6（shareholder bridge）仍须等
M2 落地——与本次 W4 评审无关。

Audit 协助点：
- F1 完成后跑 `! grep -rnE "scopeAll|user\.dataScope\.companyCodes" apps/api/src/modules/finance-v2`
  验真正废除自定义命名。
- F2 完成后跑 `grep -rn "allowedProjectCodes" apps/api/src/modules/finance-v2 | wc -l`
  验 ≥ 3（ap/ar/expense）。

---

## 8. 决议

### 8.1 总评：🟢 通过

**通过理由**：
1. Migration 三项硬指标（幂等 / 可回滚 / 无破坏）全过；entity 与 DB 同 wave 对齐。
2. 用户 4 条拍板全部入模（仅 §2.2 文档级口径冲突，不阻塞 W4 合入）。
3. operations / governance 加法 100% 向后兼容；新增 `extended-gov` center
   不暴露 CRUD 端点，符合 Audit 评审 §4 "不动 TYPES" 红线。
4. 引用检查脚本就位，本地实跑给出真实漂移图谱，可作为 W5+ 的监测仪表盘。
5. ERP E3/E5/E6 与 Finance F1-F5 全部解锁，与 W4 无交叉依赖，可立即启动。

### 8.2 必须带入 W5 / W6 的"非阻塞观察项"

| # | 观察项 | 责任 Agent | 截止 wave |
|---|---|---|---|
| O-1 | M1 / M3 子文档明文统一 STORE/FACTORY/WAREHOUSE 是 SITE 子类还是独立 org_type；若选 SITE 子类，调整 sys_organization_type_rules seed | Architect | W5 子文档发布前 |
| O-2 | 前端首页验证 7 卡片渲染不破坏布局（6→7） | ERP / 前端 | W5 集成回归 |
| O-3 | `prc2_projects` 6 hit 必入 M2 文档，W8 E7 与 approval-engine + master-data-references 同步替换 | Architect + ERP | M2 拍板 → W8 落地 |
| O-4 | `shr_projects` 6 hit 必入 M2 文档，W6 退化 shr_project_attrs 时同步 data-quality / product-master / approval-engine | Architect + Finance | M2 拍板 → W6 落地 |
| O-5 | `brd_farms` / `sys_store` 漂移按模块拆 5 段切换计划，写入 M1 / M5 | Architect + ERP | M1 / M5 子文档定稿 |
| O-6 | `check-master-data-references.mjs` 若 W6+ 升 CI red-line，先做 §4.3 四项改造（白名单收口 + baseline + 双轨退出码 + cwd 鲁棒性） | Audit + Architect | W6 红线启用前 |
| O-7 | W4 完整本地回归（tsc / regression / drift / nullable / migration down）由 Architect Agent 在 PR 描述附输出 | Architect | 本 PR 合入前补 |

### 8.3 与 MULTI_AGENT_PHASE2_PLAN 的对接

- ✅ W4 完整对应 PLAN §5 Step 6（Architect 落 biz_site_aliases seed + 配置表）。
- ✅ ERP E3/E5/E6 启动 = PLAN §2.3 提前解锁 W7 内容；不抢 W5 / W6 顺序。
- ✅ Finance F1-F5 启动 = PLAN §2.4 与 W3 / W5 时点完全对齐。
- ✅ 未触任何 PLAN §4 冻结表。
- 🟡 §2.2 的 STORE/FACTORY/WAREHOUSE 口径不一致需要在 PLAN §6 "白/黑名单"
  追一句"M3 子文档负责统一"。

### 8.4 跨 Agent 协同清单（本次 W4 触发）

| 协同点 | 主 Agent | 协 Agent | Audit 角色 |
|---|---|---|---|
| 前端 6→7 卡片布局验证 | ERP / 前端 | Architect | 跑 `curl /operations/centers` |
| M1 / M3 STORE/FACTORY/WAREHOUSE 子类化统一 | Architect | Audit 评审 | 在 M3 评审中重点核此项 |
| `prc2_projects` / `shr_projects` 漂移清单进 M2 | Architect | Finance / ERP | 在 M2 评审中核对 hit 是否覆盖完 |
| `check-master-data-references.mjs` CI red-line 升级方案 | Audit 主 | Architect 协 | 主导 |
| F1 / F2 / E3 / E5 / E6 启动后跑漂移脚本 | 各 Agent 自跑 | Audit 抽审 | 周期性 |

### 8.5 风险监测点（Audit 每 wave 跑）

```bash
# 漂移监测（W4 完成,W5+ 每 wave 跑一次,与上次输出 diff）
node scripts/check-master-data-references.mjs --json > /tmp/mdr-$(date +%Y%m%d).json
diff /tmp/mdr-previous.json /tmp/mdr-$(date +%Y%m%d).json | head -50

# entity 漂移基线(g197)
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# nullable-in-unique(g198)
node scripts/check-nullable-in-unique.js

# TS 迁移红线(g195-P5 + g197-H)
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations
# ↑ 后者预期识别本 wave 迁移文件头 @allow-data-dml 标记;若仍报红,Audit 验是否符合 g198 豁免精神

# RBAC 巡检(任何 wave 后跑,不限主数据)
bash scripts/g5c-rbac-audit.sh
```

---

**评审完毕。建议：**
1. **本 W4 直接合入 main**（Architect 在 PR 描述补 §8.2 O-7 的本地回归输出）。
2. **ERP Agent 立即启动 E3 / E5 / E6**；**Finance Agent 立即启动 F1 - F5**。
3. **Architect 启动 M1 / M3 子文档撰写**，重点解 §2.2 与 §5 的 7 项观察项。
4. **Audit 在 W5 起每 wave 跑 §8.5 监测脚本**，建立漂移基线。
