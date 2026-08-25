# 组织层级设计复查与统一（2026-08-25）

## 1. 结论与边界

本轮确认的唯一目标层次为：

```text
COMPANY
├── FARM
│   └── HOUSE
├── WAREHOUSE
│   └── ZONE
│       └── LOCATION
└── 其他部门
```

农场与仓库平行、均直属公司；鸡舍只挂农场；仓库不挂农场。业务归属权威链定为：

| 实体 | 唯一权威链 | SITE 的地位 |
|---|---|---|
| house | `brd_houses.farm_code → ACTIVE brd_farms.company_code` | 由 farm 的组织投影派生 |
| farm | `brd_farms.company_code → COMPANY` | `mapped_site_code` 仅兼容 SITE 投影 |
| warehouse | `wms_warehouses.company_code → COMPANY` | `site_code` 仅兼容，不参与公司归属 |
| zone | `wms_zones.warehouse_code → warehouse` | 不直接挂 SITE/farm |
| location | `(warehouse_code, zone_code) → zone → warehouse` | 不直接挂 SITE/farm |

本轮不改 schema、不清理或写入生产数据。当前执行环境没有生产 SSH/psql 通道，因此以下生产数据矩阵中的实际计数标为“待只读执行”，不使用历史报告计数冒充 2026-08-25 现状。

## 2. 现状矩阵

### 2.1 结构与链接

| 对象 | 当前链接/字段 | 填充与一致性判断 | 目标差距 |
|---|---|---|---|
| `sys_organizations` | `parent_id` 自关联；类型含 COMPANY/SITE/STORE/DEPARTMENT/WAREHOUSE | 生产当前全量、孤儿、父子类型待只读审计 | SITE 与 farm 一场两录；WAREHOUSE 组织节点与 WMS 主档可能双源 |
| `brd_farms` | `company_code`；`mapped_site_code`；遗留 `store_code` | 用户已提供存在 FARM-DP ↔ SITE-DONGPENG-LAYER；完整清单待审计 | 同一现实农场有业务主档和 SITE 组织投影 |
| `brd_houses` | `farm_code`；稀疏 `company_code/site_code/store_code` | 已知 19 舍中 7 个测试舍副本为空；farm 回溯已上线 | 冗余副本容易漂移，不应再作为权威来源 |
| `wms_warehouses` | `company_code`；兼容 `site_code/store_code` | 与公司直连已符合目标；当前填充率待审计 | site 造成第二层级维度 |
| `wms_zones` | canonical `warehouse_code`；legacy `warehouse` | 双列不一致/孤儿待审计 | 命名仍有历史双列 |
| `wms_locations` | `warehouse_code` + `zone_code` | warehouse/zone 孤儿待审计 | DB 未见关系 FK，应用层需持续校验 |

生产只读审计必须输出：各表行数和非空率、完整组织树、重复编码、组织孤儿、house→farm 孤儿、farm↔SITE 一场两录、warehouse↔组织树双源、zone/location 孤儿及 `warehouse`/`warehouse_code` 双向不一致。执行模板见第 8 节。

### 2.2 代码归属解析清单

本轮前的重复实现：

| 消费点 | 原字段/链路 | 问题 | 本轮结果 |
|---|---|---|---|
| `DataScopeService.assertActiveHouseOwnership` | house company/site 优先，farm fallback | 稀疏副本可覆盖权威 farm | 改调 `OrgOwnershipService.resolveHouse` |
| `FarmService.submitBreedingDailyLog` | house company/site 优先，farm fallback | 与入库、lookup 重复 | 改调统一服务并强绑定结果 |
| `ProductionInboundService` | house/farm 分列后择优 | 同一鸡舍可能因副本漂移解析到另一公司 | 改调统一服务 |
| `FarmFeedService.getHouses` | 手写 house→farm JOIN/COALESCE | 兼容字段散落 | 复用统一 SITE 表达式，公司只取 farm |
| `LookupController.houses` | 手写 house→farm JOIN/COALESCE | 下拉结果可能以 house 副本为准 | 复用统一 JOIN/表达式，公司只取 farm |

仍需后续治理但本轮不扩面的路径：generic CRUD breeding scope、flocks lookup、farm sales 的 `ord_orders.store_code`、store-payment/file-access/POS 的门店语义、WMS legacy `store_code`。它们不是同一种实体归属，不能机械替换。

### 2.3 SITE 真实消费面

| 分类 | 消费面 | 定性 |
|---|---|---|
| 权限 | `sys_user_orgs` 的 SITE 节点展开为 `allowedSiteCodes` | 必须保留兼容，存量绑定不可变 |
| 过滤 | breeding/generic CRUD/lookup/farm-feed 使用 `site_code` 或 farm `mapped_site_code` | 应逐步改为 `allowedSiteCodes → farms → house` |
| 历史隔离 | farm sales、部分 WMS、store-payment、file access 使用 `store_code ∪ allowedSiteCodes` | 需按 POS 门店与农场投影分别治理 |
| 写入 | 日报把解析出的 farm/site/company 强绑定到历史单据列 | 在列退役前保留单一写入方 |
| 展示 | profile 的 boundSites/boundFarmCodes、trace 页门店码 | 非权威，可继续展示 |

## 3. SITE 定位决策项

### 方案 A（建议）：SITE = FARM 的组织树投影

SITE 节点只承担用户绑定、组织树展示和范围载体；业务表不直接以 SITE 决定归属，统一从 farm 派生。

优点：符合已裁定层次；消除“一场两录”对业务归属的双权威；house/farm/company 链最短；不要求立即迁移存量用户绑定。缺点：过渡期需维护 `SITE ↔ farm` 映射；旧 `store_code/site_code` 查询要经过兼容层。

### 方案 B：SITE 保留为独立业务层级

需明确 `COMPANY → SITE → FARM/WAREHOUSE` 或其他唯一层次，并强制所有业务表统一 SITE 外键、非空和一致性约束。

优点：站点可作为跨农场/仓库的独立经营维度。缺点：与“农场和仓库直接隶属公司、仓库不挂农场”的裁定冲突；需要 schema 和生产数据迁移；现有 farm/SITE 双录仍要解决。除非业务确认 SITE 是独立经营核算单元，否则不建议。

**待用户授权决策：采用方案 A。** 本轮代码已按 A 的可逆前置原则执行，但未删除任何兼容字段。

## 4. 命名收敛方案

目标语义：`farm_code`、`warehouse_code`、`store_code` 各自只表示农场、仓库、POS 门店；SITE 投影映射统一命名 `org_site_code`（最终可完全派生）。

分步迁移：

1. 读取集中：所有 house/farm/warehouse 归属经 `OrgOwnershipService`；当前 `mapped_site_code` 只在该兼容层解释。
2. 建映射审计：产出唯一 `SITE.org_code ↔ brd_farms.farm_code` 清单，阻断一对多/多对一。
3. 经授权后新增兼容视图或 API 投影，不立即改表；对外统一返回 `farmCode/companyCode/orgSiteCode`。
4. 写入收口：禁止新代码写 `brd_houses.company_code/site_code/store_code`；历史单据列由一个投影写入方维护。
5. 逐模块把 `store_code='ALL'` 从农场/仓储语义剥离，只保留 POS 门店语义。
6. 完成读流量观测与回填核验后，另开迁移退役旧列；本轮不创建迁移。

## 5. 冗余列建议

建议最终删除 `brd_houses.company_code/site_code`，实时走 `house→farm` 回溯。理由：数据量小、JOIN 成本低；现有 19 舍已证明稀疏副本不能可靠作为缓存；缓存失效会直接造成权限错误。

过渡期保留列但降级为派生快照：仅允许统一服务/单一写入方维护；读取不得优先于 farm；增加只读漂移审计。若未来有真实性能证据需要缓存，应使用可重建投影并监控漂移，而不是多写业务字段。

## 6. DataScope 等价兼容

采用方案 A 后，`allowedSiteCodes` 的新语义是“用户绑定的 SITE 组织投影集合”，运行时映射为 farm 集合：

```text
sys_user_orgs(SITE.org_code)
  → brd_farms.mapped_site_code
  → allowedFarmCodes
  → brd_houses.farm_code
```

过渡期继续同时返回 `allowedSiteCodes`，因此无需移动或重建任何用户绑定。等价规则：

| 用户 | 旧结果 | 新模型断言 |
|---|---|---|
| `linhong` 场长 | 仅 FARM-DP/SITE-DONGPENG-LAYER 及其鸡舍；不得因 `storeCode=ALL` 放大 | farm 映射后的实体集合与旧 SITE 过滤集合相等 |
| `admin`/ROLE_ADMIN | 全局 | 仍为 `isGlobal=true`，不受映射限制 |
| 公司范围用户 | 公司下全部 farm 与 warehouse | farm 走 `farm.company_code`，warehouse 走 `warehouse.company_code`，集合不缩不扩 |
| 无有效绑定的非全局用户 | fail-closed | 仍为空集合/`1=0` |

本地自动测试已覆盖 linhong/admin 的 fail-closed/全局矩阵；生产账号结果须在只读审计通道可用后，以两个真实 token 做 GET 集合对比，不在报告中伪称已完成。

## 7. 本轮安全落地

- 新增全局 `OrgOwnershipService`：`resolveHouse/resolveFarm/resolveWarehouse`。
- house 公司只取 ACTIVE farm 的 `company_code`；SITE 仅从 farm `mapped_site_code` 派生。
- DataScope 来源批次校验、养殖日报写入、日产蛋入库统一调用该服务。
- 鸡舍 lookup/feed 列表复用相同 JOIN/兼容表达式。
- 共享 `HouseSelector` 已支持 `farmCode` 过滤；仓库 selector 已支持 `companyCode`。视觉农场分组是可选增强，本轮不扩大 UI。
- 无 schema、迁移、生产数据修改。

## 8. 生产只读审计与部署核验

在生产服务器显式开启只读事务后执行；字段存在性必须先查 `information_schema`，不得假定冻结快照与生产一致：

```sql
BEGIN;
SET TRANSACTION READ ONLY;
SELECT current_database(), current_user, current_setting('transaction_read_only');

SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
 ('sys_organizations','brd_farms','brd_houses','wms_warehouses','wms_zones','wms_locations')
ORDER BY table_name,ordinal_position;

SELECT org_type,status,count(*) FROM sys_organizations GROUP BY 1,2 ORDER BY 1,2;
SELECT 'farms' object,count(*) total,count(company_code) company_filled,
       count(NULLIF(to_jsonb(brd_farms)->>'mapped_site_code','')) site_filled FROM brd_farms
UNION ALL
SELECT 'houses',count(*),count(NULLIF(to_jsonb(brd_houses)->>'company_code','')),
       count(NULLIF(to_jsonb(brd_houses)->>'site_code','')) FROM brd_houses
UNION ALL
SELECT 'warehouses',count(*),count(company_code),
       count(NULLIF(to_jsonb(wms_warehouses)->>'site_code','')) FROM wms_warehouses;

SELECT h.house_code,h.farm_code FROM brd_houses h
LEFT JOIN brd_farms f ON f.farm_code=h.farm_code AND f.status='ACTIVE'
WHERE f.farm_code IS NULL;

SELECT f.farm_code,f.farm_name,f.company_code,
       to_jsonb(f)->>'mapped_site_code' mapped_site_code,
       s.org_code,s.org_name,s.company_code site_company_code
FROM brd_farms f
FULL JOIN sys_organizations s
  ON s.org_type='SITE' AND s.org_code=to_jsonb(f)->>'mapped_site_code'
WHERE f.farm_code IS NULL OR s.org_code IS NULL
   OR f.company_code IS DISTINCT FROM s.company_code;

SELECT z.zone_code,z.warehouse_code,z.warehouse FROM wms_zones z
LEFT JOIN wms_warehouses w ON w.warehouse_code=COALESCE(z.warehouse_code,z.warehouse)
WHERE w.warehouse_code IS NULL OR
      (z.warehouse_code IS NOT NULL AND z.warehouse IS NOT NULL AND z.warehouse_code<>z.warehouse);

SELECT l.location_code,l.warehouse_code,l.zone_code FROM wms_locations l
LEFT JOIN wms_warehouses w ON w.warehouse_code=l.warehouse_code
LEFT JOIN wms_zones z ON z.warehouse_code=l.warehouse_code AND z.zone_code=l.zone_code
WHERE w.warehouse_code IS NULL OR (l.zone_code IS NOT NULL AND z.zone_code IS NULL);
ROLLBACK;
```

部署仅允许 GitHub `workflow_dispatch` 且 `approve_production=true`。部署后只读核实服务器 checkout SHA、Web OCI revision、API 镜像 digest；API Dockerfile 当前未写 OCI revision，不能以空 label 误判。生产关键路径仅做 GET/列表/权限回归；“最小日产蛋入库”会写生产库存，与“不写生产数据”红线冲突，故改在测试环境执行并保留批次号/清理记录。

## 9. 待授权治理路线图

1. **P1 命名收敛**：批准方案 A；固化 SITE↔farm 一一映射；所有读取切统一服务；建立漂移审计。
2. **P2 一场两录归一**：SITE 只保留组织投影属性，农场业务属性只在 `brd_farms`；组织 UI 明示“农场投影”。
3. **P3 冗余列退役**：停止写 house company/site，观测后回填/删除；另行提交 TS 迁移与回滚方案。
4. **P4 历史命名清理**：拆分 POS `store_code` 与 farm/site 兼容；收敛 zones `warehouse`；逐模块移除 `ALL`。
5. **P5 约束化**：数据清理完成并获授权后，才增加 FK/NOT NULL/唯一映射约束；同步冻结基线、迁移末态和写入代码。

## 11. 方案 A 执行记录（第一阶段）

### 11.1 授权与边界

2026-08-25 用户正式裁定方案 A：SITE 是 FARM 的组织树投影。此阶段不改 schema、不迁移存量用户绑定、不写生产数据，也不改变销售/POS `store_code` 语义。生产审计和部署核实均通过 GitHub production environment 执行；SQL 强制 `default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`。

### 11.2 生产只读盘点矩阵

只读 workflow：`Organization SITE Farm Production Readonly Audit`，部署前运行 `32823157227`；当时生产 checkout 为 `5c322b91`。

| 审计项 | 生产结果 | 结论 |
|---|---:|---|
| ACTIVE SITE | 4 | 全量已逐行输出 |
| SITE↔farm 一一映射 | 2 | `SITE-DONGPENG-LAYER↔FARM-DP`、`SITE-MENGSAI-LAYER↔LPH_MENGSAI` |
| 一个 SITE 映射多个 farm | 0 | 无一对多冲突 |
| 重复 SITE `org_code` | 0 | 无多行同码冲突 |
| SITE 未映射 farm | 2 | `SITE-VTE-BROILER`、`SITE-VTE-SLAUGHTER`；本阶段保持 fail-closed |
| ACTIVE farm 未映射 SITE | 1 | 后续归一阶段处理；本阶段不回填生产 |
| farm 映射到不存在 SITE | 0 | 无悬空映射 |
| 鸡舍 | 19 | company/site/store 填充分别 12/13/19 |
| 鸡舍 company/site 副本漂移 | 7/6 | 证明副本不能作权威；读取统一走 farm 派生 |
| 仓库 | 17 | 7 行带兼容 site；不存在 SITE=0，公司归属漂移=0 |

首版审计曾按 SITE 行自身空 `company_code` 误报公司漂移；已改为通过 SITE 父 COMPANY 派生并重跑，上表只记录修正后的结果。

### 11.3 读取与 DataScope 收口

- `OrgOwnershipService.resolveFarmCodesBySiteCodes()` 成为 `mapped_site_code` 的运行时批量解释入口，只返回 ACTIVE farm 并去重。
- `DataScopeService` 保留原 `allowedSiteCodes`，同时把 SITE 投影合并进 `allowedFarmCodes`。未映射 SITE 不产生 farm，非全局无绑定用户仍为空范围；ROLE_ADMIN/GROUP 仍直接全局且不执行投影查询。
- 鸡群 lookup 的 SITE 请求参数、SITE scope 与 house fallback 均改为 `flock/house→ACTIVE farm→mapped_site_code`，不再读取 `fl.site_code`/`house.site_code` 决定范围。
- 手机端建舍不再从同场鸡舍的稀疏副本复制归属，而由唯一 farm 经 `OrgOwnershipService.resolveFarm()` 投影；SITE 映射不是恰好一个 farm 时拒绝写入。
- 仓库 lookup 的 `site_code` 仍是兼容投影筛选；公司权限主链已是 `warehouse.company_code`。前端展示、历史单据追溯字段及 POS 门店语义未改。
- 通用 breeding CRUD 中历史单据自身 `site_code/company_code` fallback 暂留，因其承载历史单据隔离而非 house 权威归属；下一阶段逐表迁移，不能机械删除。

### 11.4 写入门禁

- `/api/crud/brd_houses` create/update 现在显式拒绝 `company_code/site_code/store_code`，并停止按登录用户自动注入鸡舍 `store_code`。
- 新增 `scripts/ci/check-house-ownership-writes.mjs`：扫描 API 业务源码，三列 SQL 直写仅允许手机建舍投影方与经人工审核的 Chanjet 主数据导入分支；同时锁定 generic CRUD create/update 防绕过契约。
- 门禁已接入 `ci-security`、部署 workflow 入口及 W5 closeout。负例临时加入 `UPDATE brd_houses SET site_code=...` 后真实返回 exit 1，移除负例后 PASS。

### 11.5 等价证明与验证

| 象限 | 自动断言/生产基线 | 结果 |
|---|---|---|
| `linhong` 场长 | SITE 投影为 `FARM-DP`；部署前 `/api/farm/feed/houses` 9 舍、egglog flock 2 群且均为 `FARM-DP` | 基线已留痕，部署后须完全相等 |
| 公司范围用户 | 公司仍展开 ACTIVE warehouse；SITE 投影只追加对应 farm，不覆盖公司范围 | 单测与原公司展开路径通过 |
| admin/全局 | `isGlobal=true`，不查询 SITE 投影 | 单测通过；部署前 admin 鸡舍 19 舍 |
| 无绑定非全局 | SITE/farm/company 均空，不调用投影查询 | fail-closed 单测通过 |

本地验证：API TypeScript 0 errors；Web TypeScript 0 errors；API 64 suites / 543 tests；Web 79 files / 440 tests；nullable unique、constraint drift、legacy growth、W5 closeout 与 `git diff --check` 均通过。生产最小入库会写库存，与本阶段“不写生产数据”红线冲突，故未在生产执行；相关入库服务回归包含在 API 全量测试，后续只能在已隔离 staging 环境留痕。

### 11.6 交付与下一阶段

功能分支 `codex/org-site-farm-projection-p1` 提交 `4df00601` 后 fast-forward 合入 main；审计口径与 runner 可移植性修复为 `c45d07a5`、`516d4193`。下一阶段先处理 2 个未映射 SITE 与 1 个未映射 farm 的业务归一裁定，再逐表移除历史单据 ownership fallback；在数据清理、等价复核与单独授权前，不新增约束、不回填或删除旧列。

### 11.7 部署与生产复核

- 显式 full 部署 run `32823653487` 成功，生产 checkout 与目标均为 `44ceca9bdc9a9fc90d3185a7488941fe1df23543`。
- API 镜像 digest：`sha256:a15945f5368ee376e15b444292990d49aa9f9ff17a317a8a183e1f7f921da320`；Web 镜像 digest：`sha256:c0c43d12560cd50adf7bb4a1a1672659d75c14c80f073eb1913448146b689a3b`；两者构建 revision 均为部署 SHA。
- 部署后只读矩阵 run `32824406419`：SITE/farm 分类、鸡舍漂移、仓库漂移与部署前完全一致，确认没有生产数据变更。
- 部署后双账号鸡舍/鸡群 GET run `32824409522`：admin 鸡舍 `19→19`、egglog flock `10→10`；`linhong` 鸡舍 `9→9`、egglog flock `2→2`，且两群仍全部属于 `FARM-DP`。集合计数与逐行响应留痕均等价，无缩权或扩权。
- 仓库权限实现及生产矩阵确认仍按 `warehouse.company_code`，17 个仓库中 7 个带 SITE 兼容投影且 0 公司漂移。本轮现有双账号 workflow 未输出 warehouse GET 身份集合，故不把“linhong/admin 仓库 API 集合逐项相等”伪记为 PASS；该缺口不影响本轮 farm/house SITE 投影发布，但须在下一次 production role-smoke 凭据补齐后补证。
- `role-business-production` run `32824412721` 因 production environment 未配置 `ROLE_SMOKE_CREDENTIALS_JSON`，8 个角色 probe 全部 SKIP；workflow 外层成功不代表角色 smoke PASS，已按缺口记录。
- 遵守零生产写入红线：未执行生产最小入库。测试/CI 的 production-inbound、breeding、WMS 回归均通过，但测试环境目前没有可调度的 staging deploy workflow，因此本轮没有伪造“staging 最小入库”留痕。

## 10. 验证记录

| 检查 | 结果 |
|---|---|
| 先红测试 | 新服务测试因模块不存在失败（TS2307），确认测试先于实现 |
| API 全量 Jest | 64 suites / 539 tests 全绿 |
| Web 全量 Vitest | 79 files / 440 tests 全绿 |
| API TypeScript | `tsc --noEmit` 0 errors |
| Web TypeScript | `tsc --noEmit` 0 errors |
| 约束漂移 | 0 new drift；1 条既有 allowlist |
| nullable unique | 0 违规；1 条既有白名单 |
| diff whitespace | `git diff --check` 通过 |
| W5 受控边界复核 | 默认门禁按设计阻断 API/RBAC/sales frozen path；审阅改动范围后以 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 显式复核，20/20 PASS |

真实 HTTP/PG regression、双账号生产集合断言、生产数据矩阵、部署 revision 和生产只读关键路径依赖远程环境，在代码提交后的 CI/部署阶段记录；任何未执行项不得写成 PASS。

## 12. 收尾三阶段执行记录

### 12.1 阶段①：SITE↔farm 归一取证

- 只读 workflow `Organization SITE Farm Production Readonly Audit` run `32826936690` 成功；生产 checkout 为 `44ceca9b`，事务同时启用 `default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`。
- `SITE-VTE-BROILER`（万象肉鸡养殖场）和 `SITE-VTE-SLAUGHTER`（万象屠宰加工厂）父公司均为 `COMP-LAO-FOOD`；鸡舍 snapshot、鸡群 snapshot、养殖日报和仓库引用四项计数均为 0。按方案 A 保留为非养殖业务的组织树展示节点，不强行创建 farm 投影。
- 唯一未映射 ACTIVE farm 为 `CS-0001 / 测试养殖场 / COMP-LAO-AGRI`。生产证据为 0 个鸡舍、1 个鸡群、最近养殖日报 `2026-08-19`，不能仅凭名称判定可停用，也没有证据支持映射到任一 VTE SITE。
- 判定为 fail-closed：本阶段没有执行 `brd_farms.mapped_site_code` 写入，因此没有 RETURNING 或回滚 SQL；这不是遗漏，而是预检未达到“证据明确支持映射”的写入闸门。

### 12.2 阶段②：历史 ownership fallback 逐表迁移

| 表 | 字段语义 | 处理 |
|---|---|---|
| `brd_farms` | `company_code` 是实体归属；`mapped_site_code` 是组织投影 | 保留主档直接过滤 |
| `brd_houses` | 自身 `company_code/site_code` 是稀疏派生副本，不是历史事实 | generic CRUD 改走 `house.farm_code → ACTIVE farm` |
| `brd_flocks` | 自身 `company_code/site_code` 是建群时派生副本；实体仍有 `farm_code` | generic CRUD 改走 `flock.farm_code → ACTIVE farm` |
| `brd_daily_logs` | 单据落库时的归属快照 | 不改；历史事实继续保留 |
| `brd_medication_records` | 业务记录自身 SITE 隔离字段 | 不改；本阶段不机械扩大范围 |

统一 SQL 谓词集中到 `OrgOwnershipService.farmScopePredicate()`；house/flock 的副本即使漂移，也不能再覆盖 ACTIVE farm 权威归属。固定 fixture 覆盖副本一致、空字符串/NULL fallback 和其他农场，断言迁移前后集合均为 `consistent,sparse`；另有 SQL 断言保证两个表不再读取自身 company/site。

本地验证：API TypeScript 0 errors；Web TypeScript 0 errors；API 64 suites / 545 tests；Web 79 files / 440 tests；`git diff --check` 通过。生产集合等价与部署 revision 在本阶段 PR 合并部署后补记，未执行前不记 PASS。

### 12.3 阶段③：鸡舍冗余 ownership 列退役

前提闸门证据：阶段① production information_schema 实测 `brd_houses.company_code/site_code/store_code` 均为 nullable `VARCHAR(64)`，其中 `store_code` 默认值为 `'ALL'`；阶段②已移除 generic CRUD 的 snapshot 读取。对 API/Web 业务源码执行精确固定字符串审计后，无 `h.company_code/site_code/store_code`、`to_jsonb(h)` ownership 或限定列读取残留。

- 新增 TypeORM 迁移 `1787647200000-DropHouseOwnershipRedundantColumns.ts`：`up()` 以不带 CASCADE 的 `DROP COLUMN IF EXISTS` 退役三列，若生产还有未知依赖会安全失败；`down()` 按 production 实测完整重建三列，长度均为 64，并恢复 `store_code DEFAULT 'ALL'`。
- 手机建舍与 Chanjet 审核建舍停止写三列，仅写 `farm_code` 及其他非 ownership 属性；API 返回的 company/SITE 仍由 `OrgOwnershipService.resolveFarm()` 派生，不改变调用契约。
- generic CRUD 启动补列逻辑删除 house 的 `store_code/site_code`，避免迁移后被应用启动重新创建；写入门禁升级为任何业务 writer 命中三列即失败，不再保留投影写入白名单。
- 生产只读审计改为 `HOUSE_CANONICAL_OWNERSHIP`，只核验 `house→ACTIVE farm` 解析率；删除 snapshot 漂移与未映射 SITE 的 house snapshot 查询。
- `brd_houses` 没有 TypeORM entity，删除 raw-table 三列不会减少 entity drift 计数，故 `.github/entity-drift-baseline.txt` 保持 `300`，不伪造 baseline 下调。
- `wms_warehouses.site_code` 与 `brd_farms.store_code` 均未修改；POS `store_code` 域零触碰，列入后续独立治理。

迁移门禁：全部 TS migration `down()` 检查通过；业务 DML 检查通过且本迁移无需 `@allow-data-dml`；nullable unique 与 constraint drift 均无新增。部署、迁移执行、revision、双账号集合和生产回归结果在阶段③ PR 合并后的显式 production run 补记，未执行前不记 PASS。
