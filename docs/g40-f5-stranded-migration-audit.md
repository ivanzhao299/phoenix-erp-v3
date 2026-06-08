# G40 · F5 系统性审计：顶级 migrations 漏部署全盘核查

> 触发：G37/G38 发现"顶级 migrations 漏部署"非孤例，用户要求全盘审计。立项 2026-06-08。
> 方法：顶级 46 文件的 CREATE/ALTER/INSERT × `v3_schema_complete.sql` 基线 × `apps/api/migrations` 增量 × 当前代码引用，四方交叉。
> **重要前提：agent 无生产 DB 访问**，"生产是否真缺"需 `scripts/f5-prod-diagnostic.sql` 在生产确认；本报告只断言"本地可证"的部分。

## 一、先纠偏：Explore 初判的 3 个高危，经核验 2 个是误报

| 初判 🔴 | 核验 | 结论 |
|---|---|---|
| songmingguang 用户缺失→无法登录 | 整个治理欠债总账就是**宋明光 UAT 触发**，他天天在生产登录；apps/api 多个迁移 UPDATE 引用他 | ❌ 误报。生产**有**该用户。仅"从零重建库"会缺（可复现性缺口，非当前 bug），且含敏感密码 hash，留诊断由用户定 |
| PKG_EGG_GRADE 字典缺失→等级下拉空 | apps/api 有 `g5_cleanup_pkg_egg_grade_deprecated`，等级已主动改走 product_grades | ❌ 误报。生产有且**已主动废弃**，回填反而是倒退 |
| brd_daily_logs 生产列缺失 | v3 基线无、apps/api 无 ALTER、**farm.service 确在用**（writableCols + 派生查询） | ✅ 真候选，见下 |

教训：跨库状态推断不能当事实，必须用"代码是否真引用 + 是否被后续主动改动"双向验证。

## 二、确认的真 stranded（本地可证：app 在用 + 未镜像 + 未废弃）

| 项 | 证据（谁在用） | 顶级来源 | G40 处理 |
|---|---|---|---|
| `brd_daily_logs`.opening_qty/closing_qty/self_use_qty/lay_rate | `farm.service.ts` writableCols + 自动派生 `SELECT closing_qty…` | glp1a2_production_extension | ALTER ADD IF NOT EXISTS |
| `wms_outbound`.destination_type/destination_house_code/remark | 前端 `warehouse/outbound` CrudForm 字段 | 同上 | DO+ALTER（带表存在守卫） |
| `wms_inbound`.remark | 同上 | 同上 | 同上 |
| `PKG_ANOMALY_REASON`(7) | `packaging.service` + 异常页 + `usePackagingDicts` | g4e_farm_scope_and_dict_seed | INSERT WHERE NOT EXISTS |
| `PKG_EXCEPTION_TYPE`(6) | 同上 | 同上 | 同上 |

→ 全部并入 `apps/api/migrations/20260608_g40_f5_stranded_backfill.sql`，幂等，生产已有则空操作。

### 附带发现：G38 字典审计的盲区
G38 只扫了 JSX 写法 `dictType="X"`，漏了 CrudForm 配置写法 `dictType: "X"`（冒号）。补扫后：
- 6 个 `INV_*`（盘点/入库/出库/损耗/调拨）**已在 apps/api 种**（安全）。
- `PKG_ANOMALY_REASON` / `PKG_EXCEPTION_TYPE` 漏 → 已并入 G40。

## 三、未处理项（需生产诊断或用户决策）

| 项 | 为何不动 |
|---|---|
| songmingguang 用户重建 | 生产已存在；密码 hash 敏感；仅影响从零重建。`f5-prod-diagnostic.sql` E 段确认后再定 |
| 顶级一批 finance_v2 / workflow / phase_* 表与 ALTER（05-25~06-04） | 这些是**冻结(G34=06-08)之前**的文件，生产 schema 里表确实存在（app 在跑）→ 极可能当时已部署；无当前报错证据，不臆改 |
| 顶级其它业务种子（mengsai 主数据等） | 已确认在 apps/api 有镜像（g10 等），或属一次性导入由 M6 真实导入覆盖 |

## 四、部署 & 验证

1. 先在生产跑 `scripts/f5-prod-diagnostic.sql`（只读），贴回输出。
2. 据 A/B/C 段缺项决定是否需立即手动跑 G40（否则下次 Deploy 自动跑，幂等安全）。
3. 若 D 段全 0 → G37/G38 也还没跑，一并执行。
4. 若 E 段 0 行 → 需补建 songmingguang（另起，含密码须用户确认）。

- 迁移为 schema ALTER + sys_dict 幂等 INSERT，无代码改动 → API/Web tsc 不受影响。
- 本地实跑被 agent 权限策略拦截（DB 写入需用户确认），未代跑。
