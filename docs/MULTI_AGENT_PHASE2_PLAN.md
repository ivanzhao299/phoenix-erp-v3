# 多 Agent 第二阶段汇总规划

> 编排人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：`PROJECT_COMMAND_CENTER.md`、`CLAUDE.md` + 4 份第一阶段审计：
> - `docs/MASTER_DATA_AGENT_AUDIT.md`
> - `docs/ERP_BUSINESS_AGENT_AUDIT.md`
> - `docs/FINANCE_AGENT_AUDIT.md`
> - `docs/AUDIT_INTEGRATION_AGENT_AUDIT.md`
>
> 本文档不写业务代码、不出迁移、不动 service；只做**优先级排序、Agent 任务
> 边界、并行禁区、迁移冻结清单、闭环顺序、验收命令、合并 / 回滚策略**。
> 任何与本文档冲突的实施都必须先回到本文档评审更新。

---

## 1. 当前系统最大风险排序（合并 4 份审计）

按"被攻陷 / 数据被破坏的概率 × 影响范围"排，红线分四档（**R0 灾难 / R1
重大 / R2 中等 / R3 治理欠债**）：

### R0 — 必须本周修

| # | 风险 | 来源 | 概要 |
|---|---|---|---|
| R0-1 | **RBAC 矩阵可被任意登录用户改写** | Audit §3 R-01/R-02/R-03 | `/api/permissions/role/:code/perms`、`/api/permission-sets/*` 仅挂 `AuthGuard('jwt')`，无 `@RequireMenu`；同时 `api/permission-sets` 被两个模块重复注册，前端调谁取决于 Nest 注册顺序 |
| R0-2 | **通知配置 / 在线用户匿名公开** | Audit §5 N-01/N-02 | `NotificationConfigController` 完全无 guard；`PresenceController` 写了 `@RequireMenu` 但没挂 `MenuGuard`，注解空跑 |
| R0-3 | **`auth.service.login` 内部参数 `bypassPassword` 无调用方鉴权** | Audit §1 L-01/L-02 | 控制器层判 ROLE_ADMIN，但 `login()` 是公共方法；impersonate 不禁止"超管 → 超管" |
| R0-4 | **`/api/chanjet/callback` 公开且无签名校验** | Audit §4 C-01 | 公网任何 POST 都能把 `certificate` 写进 `sys_chanjet_state`，链路被切 |
| R0-5 | **`store_code` 一词三义 + POS 客户无 FK** | ERP §3.4 / Master §2 S1 / Master §2 S3 | `inv_batches.store_code` ≈ company_code，`wms_locations.store_code='ALL'` 兜底，跨公司采购入库直接破隔离；`sal_store_sales.customer_code` 无 `mst_customers` FK，赊销 AR 对账风险 |

### R1 — 4 周内修

| # | 风险 | 来源 | 概要 |
|---|---|---|---|
| R1-1 | **项目主数据双轨**（biz_projects vs shr_projects vs prc2_projects） | Master §2 S1 / ERP §1.4 / Finance §3.5 | 三套 project_code，workflow `byProjectManager` 仍读 prc2_projects；股东资本流与运营报表对账偏差 |
| R1-2 | **养殖场 / 站点 / 门店 / 仓库 四源命名**（MDM-1 落地未收尾） | Master §2 S1 / ERP §3.4 | brd_farms / mst_stores / sys_store / wms_warehouses + sys_organizations.SITE 五处可寻址；biz_site_aliases 建好但 service 未消费 |
| R1-3 | **`prc2_ap_ledger.supplier_code` + `supplier_id` 双外键并存** | ERP §1.4 | 任一保存路径漂移就 22P02（[[project_g139_g147_payment_chain]] 教训） |
| R1-4 | **DataScope 项目维度在 finance-v2 全线未生效** | Finance §5.1 | fin_* 表多有 project_code 列，但 service 只过滤 companyCodes |
| R1-5 | **DataScope CLS 命名错位**（`scopeAll`/`companyCodes` vs `isGlobal`/`allowedCompanyCodes`） | Finance §5.2 | 10 处 controller 重复做手工映射，写错就漏过滤 |
| R1-6 | **APP_GUARD 未全局化** | Audit §2 G-01 | 任何新 controller 漏挂 `@UseGuards` 就裸奔（R0-1/R0-2 直接证据） |
| R1-7 | **POS FIFO 双路径（sku vs product+grade）共存** | ERP §3.4 | 易出"幽灵库存"，与 CLAUDE.md §6 库存唯一台账精神冲突 |
| R1-8 | **inv_batches.status 没接 INV_STOCK_STATUS 字典** | ERP §3.4 #4 | 违反 CLAUDE.md §7 |
| R1-9 | **JWT FALLBACK 密钥在 4 处文件各自硬编码** | Audit §1 L-05/L-06、§5 N-03 | 命名漂移即裸奔；notification SSE 自带一套验签 |
| R1-10 | **报销 pay() / 部分 service 旁路 `CashTransactionsService.writeTransaction`** | Finance §3.3 / §3.4 | 双入口写流水，对账偏差风险 |

### R2 — 季度内治理

| # | 风险 | 来源 |
|---|---|---|
| R2-1 | sys_organizations 是"万能表"无结构约束 | Master §2 S2 |
| R2-2 | 权限范围 5 张 sys_user_*_scopes 表合一 | Master §3 P1 / Audit §2 G-02 |
| R2-3 | mst_materials / mst_products 边界规则缺 | Master §2 S3 |
| R2-4 | AP 手工付款端点缺 | Finance §3.1 |
| R2-5 | AP/AR 发票无 attachment_urls 字段 | Finance §4.3 |
| R2-6 | 角色硬编码（procurement.service / workflow.service / assignment-resolver） | ERP §4.1 / §1.3 / §2.3 |
| R2-7 | 主数据治理图谱漏掉 company/site/business_unit/shareholder 四类 | Master §1.2 |
| R2-8 | shareholders/capital 前端 SOURCE_TYPE / CONTRIB_STATUS 硬编码字典 | Finance §4.2 / §7-8 |
| R2-9 | CI 脚本 `admin/admin123`、`admin/along888` 硬编码默认值 | Audit §6 CI-02/03 |
| R2-10 | `master` 与 `master-data` 模块名共存、易混淆 | Master §2 S4 |

### R3 — 长期治理

- biz_business_units 与 sys_organizations.BU 二选一（Master §3 P2）
- master 模块整体退役并入 master-data-center（Master §3 P2）
- `/lookup/companies` 端点补 DataScope 与 `/crud/wms_zones` 走 lookup（ERP §4.4）
- finance-v2 直读 CLS `dataScope` 替代手工映射（Finance §7-2）
- `regression.yml` 与 `deploy.yml` 双套回归合并（Audit §6 CI-01）

---

## 2. 四个 Agent 第二阶段任务边界

> 总规则：每个 Agent 在自己分支 `feature/agent-*` 工作；触及别人主导目录的
> 任何改动必须先在本规划基础上写"跨域提案"，由对应 Agent 签字后才能合入。

### 2.1 Audit / Integration Agent（本 Agent · `feature/agent-audit-integration`）

**第二阶段目标 = 关 R0 安全裸奔 + 给 R1 框架打基础**

- A1（R0-1/R0-2）：给 `apps/api/src/modules/permissions`、`permission-sets`、
  `notification` 控制器统一加 `@UseGuards(MenuGuard, DataScopeGuard)` +
  `@RequireMenu('MENU_SYS_ROLE','V/E')` / `@RequireMenu('MENU_SYS_NOTIFY','V/E')`；
  合并两份重复的 `api/permission-sets` 控制器。
- A2（R0-3）：拆 `AuthService.login` 与 `impersonate`，把 `bypassPassword`
  改为 `private`；impersonate 加"目标用户不能是 ROLE_ADMIN"的校验。
- A3（R0-4）：给 `/api/chanjet/callback` 加签名校验（按畅捷通文档 sign 字段；
  无 sign 时显式拒绝并 log warn）；`setCertificate` 收到与已存不同值时报警
  而非覆盖。
- A4（R1-9）：抽 `apps/api/src/auth/jwt-config.ts` 单一来源，统一
  auth.service / jwt.strategy / phoenix-jwt.guard / notification-stream 四处
  FALLBACK 引用。
- A5（R1-6 准备）：写 `docs/APP_GUARD_GLOBAL_PROPOSAL.md`，论证 `MenuGuard`
  挂为 `APP_GUARD` + `@Public()` 反向标注的影响面（覆盖 grep 清单），等
  其它 Agent 评审后再下一阶段切。
- A6（验收）：新增 `scripts/check-public-controllers.mjs`：扫所有 `*.controller.ts`，
  断言"既无 `@UseGuards` 也无 `@Public` 的端点 = 0"；扩 `scripts/g5c-rbac-audit.sh`：
  用非超管 token 调以上修复端点，期望 403。
- A7（R2-9）：把 `scripts/g5c-rbac-audit.sh`、`smoke-test.sh`、`seed-uat-users.sh`、
  `gen-api-docs.sh`、`verify-docker-stack.sh`、`uat-runner.sh` 的默认密码
  改为"空值即 fail-fast"。

**不做**：业务功能、主数据迁移、财务运行逻辑、生产 service 数据写入。

### 2.2 Architect / Master Data Agent（`feature/agent-architect-masterdata`）

**第二阶段目标 = 把 R1 主数据双源 / 多源问题"出方案 + 起 TS 迁移草案"，但**
**不动业务 service**

- M1（R1-2 / MDM-1 收尾方案）：出 `docs/mdm-1-finalize-plan.md`：覆盖
  brd_farms / mst_stores / sys_store / wms_warehouses → SITE-* canonical 的
  灰度切换计划（service 改造由 ERP/POS Agent 在 M1 定稿后实施）；同时把
  `biz_site_aliases` 的 seed 写到 `apps/api/src/database/migrations/`
  （TS 迁移，含 down()），但**不激活 service 读路径**。
- M2（R1-1 项目主数据收口方案）：出 `docs/project-master-consolidation-plan.md`：
  shr_projects 退化为 `shr_project_attrs`、外键 biz_projects；workflow
  `byProjectManager` 切表的灰度计划（由 ERP Agent 实施）。
- M3（R0-5 中"主数据侧"分担）：给 `inv_batches.store_code` 重命名为
  `owning_company_code`（或加迁移视图）的方案，由 ERP Agent 实施 service
  改造；本 Agent 只出 DDL 草案与字段映射表。
- M4（R2-7）：扩 `governance.service.ts` / `operations.service.ts` /
  `master-data-references.service.ts` 把 company / site / business_unit /
  shareholder 四类纳入治理图谱（纯加法，不影响现有 type）。
- M5（R3 准备）：写 `docs/master-module-retire-plan.md`：`/api/master/stores`
  与 `/api/master/products` 迁入 master-data-runtime 的清单。

**不做**：service 业务逻辑、RBAC、财务流水、采购 / 销售业务流。

### 2.3 ERP Business Agent（`feature/agent-erp-business`）

**第二阶段目标 = 修 R0-5、收 R1-3 / R1-7 / R1-8 / R2-6，依赖 M1/M2/M3 文档拍板**

- E1（R0-5）：给 `inv_batches.store_code` 改名（service 侧迁移读写），改完
  `wms.service.ts` / `store-pos.service.ts` 默认仓硬编码 `WMS-VTE-MAIN` /
  `INBOUND-DOCK` / `ST-VTE-001` / `ALL` → 全部转 `sys_config` 读取（依赖
  Architect 在 M3 给 DDL 草案）。
- E2（R0-5）：给 `sal_store_sales.customer_code` 加 `mst_customers` 外键
  约束的灰度方案（service 侧先收口写入路径，迁移由 Architect 评审后落 TS）。
- E3（R1-3）：在 `prc2_ap_ledger` 写入路径上**只写 `supplier_id`**，把
  `supplier_code` 改为 JOIN 投影；旧路径打 warn 一个 release 后再删 column。
- E4（R1-7）：合并 POS FIFO 双路径，保留 sku 单路径，product+grade 路径打
  deprecate 告警 → 删除。
- E5（R1-8）：让 `inv_batches.status` 写入端必校验 `INV_STOCK_STATUS` 字典；
  service 硬编码字符串改读字典。
- E6（R2-6）：删 `procurement.service.ts:60`、`workflow.service.ts:84` /
  `:2042-2056`、`assignment-resolver.service.ts:215` 的硬编码角色串，改走
  `sys_role_menu_permission`（Audit 协助验证不漏角色）。
- E7（R1-1 落地）：等 M2 文档拍板后，把 `assignment-resolver.byProjectManager`
  改读 `biz_projects.project_manager_user_id`。

**不做**：主数据 DDL（由 Architect 出迁移）、RBAC schema、财务运行链路、
chanjet/notification、CI。

### 2.4 Finance Agent（`feature/agent-finance`）

**第二阶段目标 = 修 R1-4 / R1-5 / R1-10，准备 R2-4 / R2-5**

- F1（R1-5 命名收口）：finance-v2 全部 controller / service 改读 `ClsService.get('dataScope')`
  原始字段 `isGlobal` / `allowedCompanyCodes`，删 10 处手工映射代码。
- F2（R1-4 项目维度补齐）：在 ap / ar / expense 三类 service 查询补
  `allowedProjectCodes IN (...)` 过滤；前端 `finance2/ap`、`finance2/ar`、
  `finance2/expenses` 表单加 `ProjectSelector`。
- F3（R1-10 旁路收口）：`reimbursements.service.pay()` 改走
  `CashTransactionsService.writeTransaction()` + `CashAccountsService.applyBalance()`
  单入口；同步审计其它 service 是否还有同类旁路。
- F4（R2-4 AP 手工付款端点）：新增 `POST /api/v2/finance/ap/invoices/:id/pay`，
  参考 ar/receipts/confirm 模式，写 OUT 流水 + 更新 `paid_amount_original` /
  `payment_status`。
- F5（R2-5 准备）：写 `docs/fin-attachment-extension-plan.md`：fin_ap_invoices /
  fin_ar_invoices / fin_ar_receipts 加 attachment_urls jsonb 字段的迁移
  草案（实际 DDL 走 Architect 评审）。
- F6（跨域 §7-5 / §7-6 准备）：与 Architect / Shareholder 责任域协同，
  出 `docs/shareholder-finance-bridge-plan.md`：明确 shr_capital_contributions
  与 fin_shareholder_contributions 的单向投影方向（**第二阶段只出文档，不写
  迁移**）。

**不做**：shareholder schema（跨边界）、采购 / 销售业务流、RBAC、chanjet。

---

## 3. 禁止并行修改的目录

> 同一目录被两个 Agent 同时改 = merge 痛苦 + 静默互相覆盖。第二阶段强制
> **单写者锁**（Single-Writer Lock）：

| 目录 | 主写 Agent | 备注 |
|---|---|---|
| `apps/api/src/auth/**` | Audit | 任何人改 JWT / impersonate / permissions-resolver 都必须 Audit 签字 |
| `apps/api/src/common/guards/**` | Audit | MenuGuard / MasterDataTypeGuard / menu-registry 同上 |
| `apps/api/src/guards/**` | Audit | phoenix-jwt.guard |
| `apps/api/src/modules/permissions/**` | Audit | 含两份重复控制器，本阶段由 Audit 合并 |
| `apps/api/src/modules/permission-sets/**` | Audit | 同上 |
| `apps/api/src/modules/notification/**` | Audit | 含 SSE / presence / config / dispatcher |
| `apps/api/src/modules/chanjet/**` | Audit | 含 callback / auth / ar-sync |
| `apps/api/src/modules/finance-v2/**` | Finance | controller 改 CLS 直读、service 改 DataScope；本阶段 Architect 与 ERP 不动 |
| `apps/api/src/modules/shareholder/**` | Architect（主） + Finance（协） | 跨域，本阶段只出文档；任何 service 改动需双签 |
| `apps/api/src/modules/{master, master-data, org, business-unit, farm, product-master}/**` | Architect | 业务 service 不改；只补治理图谱 |
| `apps/api/src/modules/{procurement-v2, sales-v2, wms, store-pos, store, workflow}/**` | ERP | 业务 service 改造主战场 |
| `apps/api/src/database/migrations/**` | Architect（gatekeeper） | 任何 TS 迁移必须 Architect 评审；CI 已锁文件夹 allowlist |
| `apps/api/src/database/data-source.ts` | Architect | typeorm 配置 |
| `app.module.ts` 模块注册 | Architect（main） + Audit（APP_GUARD 段） | Audit 改 APP_GUARD 时 Architect 提前评审；其它 import 顺序变更必须双签 |
| `main.ts` bootstrap | Architect | bodyParser / CORS / hydrate 等启动期 |
| `.github/workflows/**` | Audit | CI / 部署链 |
| `scripts/**`（鉴权 / CI / chanjet 类） | Audit | g5c-rbac-audit.sh / chanjet-probe.mjs / smoke-test.sh 等 |
| `scripts/**`（迁移 / 主数据 / 数据 ETL 类） | Architect | db-migrate.sh / dump-schema.sh / m6-* / mdm-* |
| `apps/web/src/components/shared-selectors/**` | Architect（Selector 增删） + ERP（前端使用） | Architect 改 Selector，ERP 改业务页面调用 |
| `apps/web/src/app/(admin)/finance2/**` | Finance | 财务前端独立 |
| `apps/web/src/app/(admin)/shareholders/**` | Architect 主 + Finance 协 | 同 shareholder 后端 |
| `apps/web/src/app/(admin)/{sales2, procurement2, wms, store-pos}/**` | ERP | 业务前端 |
| `apps/web/src/app/(admin)/system/**` 权限 / 用户管理 | Audit | RBAC 管理面 |

**冲突仲裁**：争议归 PROJECT_COMMAND_CENTER.md §3「未经明确授权不得修改其它
Agent 责任目录」。任何破例必须在 PR 描述写"已与 X Agent 协商 + 链接"。

---

## 4. 必须冻结的数据库迁移

> CLAUDE.md 已锁两个旧目录；本阶段在它们之外再加 4 类锁定：

### 4.1 已硬冻结（继承 CLAUDE.md）

- `migrations/` — 顶级 46 条历史，G34 冻结 + `.allowlist`，CI 红线。
- `apps/api/migrations/` — 169 条 baseline 裸 SQL，g195-P5 冻结 + `.allowlist`，
  CI 红线。新增 schema/数据迁移**必须**放 `apps/api/src/database/migrations/`
  （TS 迁移 + `down()` + 业务 DML 禁令 g197-H）。

### 4.2 本阶段冻结的实体（entity DDL 不动）

| 实体 / 表 | 冻结理由 | 解锁条件 |
|---|---|---|
| `fin_ar_invoices` entity | g197 已知漂移 `sal_customer_id`，装饰式禁加新字段 | 待 g197 漂移基线归零（Architect 主导） |
| `sys_role` / `sys_user_role` / `sys_role_menu_permission` / `sys_role_permission_set` / `sys_permission_set_item` / `sys_user_permission_set` | RBAC 表，Audit 责任域，任何 schema 改动需 Architect + Audit 双签 | 待 Audit 第二阶段 A1/A2 完成 |
| `sys_user` / `sys_user_orgs` / `sys_user_project_scopes` / `sys_user_farm_scopes` / `sys_user_warehouse_scopes` | 登录链路 + DataScope 表，影响所有模块 | 待 M2 文档拍板 |
| `sys_organizations` | 跨模块万能表，R2-1 治理前不动 schema | 待 M4 文档拍板 |
| `biz_projects` / `prc2_projects` / `shr_projects` | 项目主数据双轨，R1-1 治理前不动 | 待 M2 文档拍板 |
| `brd_farms` / `mst_stores` / `sys_store` / `wms_warehouses` | MDM-1 落地前不动表 schema，只允许 `biz_site_aliases` seed | 待 M1 文档拍板 |
| `inv_batches` / `inv_ledger` | CLAUDE.md §6 唯一台账，R1-7/R1-8 治理前不动列 | 待 E4/E5 完成 |
| `shr_capital_contributions` | 跨域（Architect + Finance），R2 才动 | 待 F6 文档拍板 |
| `sys_chanjet_state` / `chanjet_ar_snapshot` / `chanjet_book_company_map` | Audit 责任，R0-4 修完前不改 schema | 待 A3 完成 |

### 4.3 本阶段允许新增的迁移类别

- 数据治理 seed（含 g198 `@allow-data-dml` 标记，文件头 30 行内）。
- 索引补齐、约束补齐（NOT NULL / partial unique），但不能改列类型。
- `biz_site_aliases` 数据 seed（M1）。
- `governance.service` 治理图谱配置表新增（M4）。
- 新增 `fin_*` 附加字段表（attachment_urls 等），**仅当 Architect 评审通过**。

---

## 5. 主数据 → RBAC → 采购销售财务闭环顺序

> 任何一环抢跑都会让下游回归红。本阶段执行顺序固定为下表，不允许跳跃：

```
Step 1  Audit   修 R0 安全裸奔（A1-A4）              ← 阻塞所有后续，2-3 天
Step 2  Audit   抽 JWT 唯一源 + APP_GUARD 方案稿（A5）← 与 Step 3 并行
Step 3  Architect 出 M1/M2/M3 主数据合并方案文档     ← 与 Step 1 并行（不动 service）
Step 4  Finance DataScope CLS 收口（F1）             ← 阻塞所有 finance-v2 业务变更
Step 5  Finance DataScope 项目维度补齐（F2）         ← 依赖 Step 4
Step 6  Architect 把 M1 中"biz_site_aliases seed" 落 TS 迁移（不动 service）
Step 7  ERP 在 M1 拍板后，做 R0-5 store_code 分家（E1/E2）+ 默认仓配置化
Step 8  ERP supplier_code/id 二选一（E3）+ FIFO 收口（E4）+ status 字典化（E5）
Step 9  Architect M4 治理图谱补齐（governance.service 扩 type）
Step 10 ERP/Architect 在 M2 拍板后，workflow `byProjectManager` 切 biz_projects（E7）
Step 11 Audit APP_GUARD 全局化实施（A5 文档评审通过后）
Step 12 Audit/ERP/Finance 第三阶段：R2 治理（AP 付款、附件、字典硬编码、角色硬编码清理）
```

**Step 1（Audit R0）是绝对前置**：在它之前任何 Agent 不应 push 写 RBAC /
notification / chanjet 相关业务流，否则等于把还在裸奔的接口当作"已有的限制"
建逻辑，后续收口会破坏假设。

**Step 4（Finance CLS 收口）必须在所有 finance-v2 业务变更前完成**：否则
F2/F3/F4 都会基于错位的 `scopeAll/companyCodes` 字段写新代码，治理永远收不
干净。

**Step 7（ERP store_code 分家）必须在 M1（Architect 站点 canonical 方案）
拍板后**：否则 ERP 改 service 时不知道目标列叫什么，灰度方案对不上。

---

## 6. 每个 Agent 第二阶段允许 / 禁止修改目录（白名单 + 黑名单）

### 6.1 Audit / Integration Agent

✅ **允许**：
- `apps/api/src/auth/**`
- `apps/api/src/common/guards/**`
- `apps/api/src/guards/**`
- `apps/api/src/modules/permissions/**`
- `apps/api/src/modules/permission-sets/**`
- `apps/api/src/modules/chanjet/**`
- `apps/api/src/modules/notification/**`
- `apps/api/src/health.controller.ts`（仅 JWT 指纹脱敏）
- `.github/workflows/**`
- `scripts/g5c-rbac-audit.sh`、`smoke-test.sh`、`verify-docker-stack.sh`、
  `gen-api-docs.sh`、`seed-uat-users.sh`、`uat-runner.sh`
- `scripts/chanjet-probe.mjs`、`yonyou-probe.mjs`、`g199-*chanjet*.mjs`
- `scripts/check-*.{sh,js,mjs}`（红线脚本）
- `docs/AUDIT_*.md`、`docs/APP_GUARD_*.md`

❌ **禁止**：
- `apps/api/src/modules/finance-v2/**`
- `apps/api/src/modules/{master, master-data, org, business-unit, farm, product-master, shareholder}/**`
- `apps/api/src/modules/{procurement-v2, sales-v2, wms, store-pos, store, workflow}/**`
- `apps/api/src/database/migrations/**`（任何 entity / DDL 改动）
- 业务相关 web 页面

### 6.2 Architect / Master Data Agent

✅ **允许**：
- `apps/api/src/modules/{master, master-data, org, business-unit, farm, product-master}/**`
- `apps/api/src/modules/shareholder/**`（schema 与文档为主）
- `apps/api/src/database/migrations/**`（gatekeeper，所有 TS 迁移）
- `apps/api/src/database/data-source.ts`
- `apps/api/src/app.module.ts`（仅模块 import 顺序，不动 APP_GUARD 段）
- `apps/api/src/main.ts`（hydrate / 启动期）
- `apps/web/src/components/shared-selectors/**`（新增 Selector / lookup 重构）
- `scripts/db-migrate.sh`、`dump-schema.sh`、`fetch-prod-schema.sh`、
  `dedup_sys_dict.sql`、`m6-*`、`mdm-*`
- `docs/mdm-*.md`、`docs/master-*.md`、`docs/organization-*.md`、
  `docs/project-master-*.md`

❌ **禁止**：
- 任何业务 service 内部逻辑（finance / procurement / sales / wms / pos）
- `apps/api/src/auth/**`、`common/guards/**`、`guards/**`
- `apps/api/src/modules/{permissions, permission-sets, chanjet, notification}/**`
- `apps/api/src/modules/finance-v2/**`（除接口契约文档）
- CI / .github

### 6.3 ERP Business Agent

✅ **允许**：
- `apps/api/src/modules/{procurement, procurement-v2, sales-v2, wms, store, store-pos, workflow}/**`
- `apps/web/src/app/(admin)/{procurement2, sales2, wms, store-pos, workflows}/**`
- `apps/web/src/app/(mobile)/**`（驾驶员、PDA、场长移动端）
- `apps/web/src/app/(terminal)/**`（POS 终端）
- `apps/web/src/components/{procurement, sales, wms, pos}/**`（如有）
- `scripts/seed-uat-fixture.sh`（业务数据 fixture）
- `docs/g83*-g87*-procurement-*.md`、`docs/sales*-phase*.md`、
  `docs/wms-*.md`、`docs/pos-*.md`、`docs/store-*.md`

❌ **禁止**：
- `apps/api/src/auth/**`、`common/guards/**`、`guards/**`
- `apps/api/src/modules/{permissions, permission-sets, chanjet, notification, finance-v2, shareholder}/**`
- `apps/api/src/modules/{master, master-data, org, business-unit, product-master}/**`（不可改主数据 service）
- `apps/api/src/database/migrations/**`（仅可提案，由 Architect 落迁移）
- 任何 RBAC / 登录改动

### 6.4 Finance Agent

✅ **允许**：
- `apps/api/src/modules/finance-v2/**`
- `apps/web/src/app/(admin)/finance2/**`
- `apps/web/src/lib/shareholder-api.ts`（仅 Finance 视角，跨域写需双签）
- `docs/finance-*.md`、`docs/g41-*ar*.md`、`docs/g199-*reconciliation*.md`、
  `docs/fin-attachment-*.md`、`docs/shareholder-finance-bridge-*.md`

❌ **禁止**：
- `apps/api/src/auth/**`、`common/guards/**`、`guards/**`
- `apps/api/src/modules/{permissions, permission-sets, chanjet, notification}/**`
- `apps/api/src/modules/{procurement-v2, sales-v2, wms, store-pos, workflow}/**`
- `apps/api/src/modules/shareholder/**`（schema 改动需跨域提案）
- `apps/api/src/modules/{master, master-data, org, business-unit, farm, product-master}/**`
- `apps/api/src/database/migrations/**`（提案给 Architect）

---

## 7. 第二阶段验收命令

> 任意 Agent push 前必须本地全绿；CI 上 deploy.yml 的 test job 会再跑一遍。

### 7.1 通用（所有 Agent 必跑）

```bash
# 类型检查
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/tsc --noEmit

# Lint
pnpm lint

# entity ↔ DB 漂移基线
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# nullable 列不得参与多列 unique
node scripts/check-nullable-in-unique.js

# TS 迁移必须含 down() 且不得带业务 DML
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations
```

### 7.2 Audit Agent 专项

```bash
# A6 - 公开端点扫描（第二阶段交付）
node scripts/check-public-controllers.mjs apps/api/src

# A6 - 扩展版 g5c：用非超管 token 验 permissions/permission-sets/notification 应 403
API_BASE=http://127.0.0.1:3100 NON_ADMIN_PASS=Test@1234 \
  bash scripts/g5c-rbac-audit.sh

# A7 - 密码硬编码红线
! grep -RnE "['\"](admin123|along888)['\"]" scripts/ \
  && echo "✅ 无硬编码默认管理员密码"
```

### 7.3 Architect Agent 专项

```bash
# 迁移目录 allowlist 双锁
ls migrations/ | grep -v '^\.allowlist$' | sort | \
  diff - <(sort migrations/.allowlist) && echo "✅ 顶级 migrations 锁"
ls apps/api/migrations/ | grep -E '^2026.*\.sql$' | LC_ALL=C sort | \
  diff - <(LC_ALL=C sort apps/api/migrations/.allowlist) \
  && echo "✅ baseline 锁"

# TypeORM 迁移可生成性（如果有 entity 改动）
cd apps/api && ./node_modules/.bin/typeorm migration:generate \
  -d dist/database/data-source.js /tmp/_arch_diff || true

# 治理评分（M4 验收）
curl -sf "$API_BASE/api/master-data/governance/score" | jq .
```

### 7.4 ERP Agent 专项

```bash
# 回归（按 deploy.yml test job 同套）
cd apps/api
pnpm test:regr:system
pnpm test:regr:breeding
pnpm test:regr:packaging
pnpm test:regr:wms
pnpm test:regr:finance
pnpm test:regr:pos-store
pnpm test:regr:quality
pnpm test:regr:pda
pnpm test:regr:bi

# store_code 真审计：检查写入端是否还把 inv_batches.store_code 当 company 用
grep -rn "inv_batches.*store_code" apps/api/src/modules/{wms,store-pos,procurement-v2} \
  | grep -v "owning_company_code"  # 期望逐步归零

# FIFO 双路径告警
grep -rn "fifoDeductItems" apps/api/src/modules/store-pos \
  | grep -E "Path B|product_code\+grade"  # 期望归零
```

### 7.5 Finance Agent 专项

```bash
# F1 验收：finance-v2 不应再有 scopeAll/companyCodes 手工映射
! grep -rnE "scopeAll|user\.dataScope\.companyCodes" apps/api/src/modules/finance-v2 \
  && echo "✅ DataScope 命名已收口"

# F2 验收：finance-v2 service 必读 allowedProjectCodes
grep -rn "allowedProjectCodes" apps/api/src/modules/finance-v2 \
  | wc -l  # 期望 ≥ 3（ap / ar / expense）

# F3 验收：reimbursements.pay 必须走 writeTransaction
grep -n "writeTransaction" apps/api/src/modules/finance-v2/services/reimbursements.service.ts \
  && echo "✅ 不再旁路"
```

### 7.6 集成验收（合并前必跑）

```bash
# 启动 API
nohup pnpm dev:api > /tmp/api.log 2>&1 &
sleep 8 && curl -sf http://127.0.0.1:3100/api/health | jq .

# 完整 RBAC 巡检（admin + 非超管两套）
API_BASE=http://127.0.0.1:3100 bash scripts/g5c-rbac-audit.sh

# 公开端点扫描
node scripts/check-public-controllers.mjs apps/api/src

# 主数据治理评分（M4 交付后）
curl -sf "$API_BASE/api/master-data/governance/score" | jq .
```

---

## 8. 合并顺序与回滚策略

### 8.1 合并顺序（强制门禁）

每个 PR 走"feature/agent-* → main"，**必须按下表顺序**：

| Wave | 内容 | 合并门禁 | 估时 |
|---|---|---|---|
| **W1** | Audit A1-A4 + A6（R0 安全 + check-public-controllers） | 7.2 全绿 + Audit 自审 | 2-3 天 |
| **W2** | Architect M1/M2/M3 文档稿 + M4 治理图谱补齐（**不动 service**） | 7.3 全绿 + 至少一份 M1/M2 用户拍板 | 1 周 |
| **W3** | Finance F1 DataScope CLS 收口 | 7.5 F1 + 7.6 全套 + Audit 审批 | 3-5 天 |
| **W4** | Architect M1 中 biz_site_aliases seed TS 迁移 | 7.3 + 7.6 + ERP 评审"不影响业务" | 2-3 天 |
| **W5** | Finance F2 项目维度 + F3 旁路收口 + F4 AP 付款端点 | 7.5 + 7.6 + 真实数据对账 | 1 周 |
| **W6** | ERP E1 + E2（store_code 分家 + customer FK 灰度） | 7.4 + 7.6 + Architect 评审 schema 改动 | 1-2 周 |
| **W7** | ERP E3/E4/E5（supplier 二选一、FIFO 收口、status 字典化） | 7.4 + 7.6 | 1 周 |
| **W8** | ERP E6 角色硬编码清理 + E7 byProjectManager 切表 | 7.4 + 7.6 + Audit 验角色覆盖 | 3-5 天 |
| **W9** | Audit A5 APP_GUARD 全局化（依赖前 8 个 wave，最高风险） | 7.2 + 7.6 + 全 Agent 评审 | 3-5 天 |
| **W10** | Audit A7 CI 默认密码清账 + 第三阶段方案收口 | 7.2 全绿 | 1-2 天 |

**总工期**：6-8 周（按 1 Agent/wave 串行；并行可压缩到 4-5 周）。

**合并强制规则**：
1. 每个 wave 单独打 tag：`v3-phase2-w<N>-<topic>-YYYYMMDD`
2. 每个 PR 描述必须列出"本 wave 通过的 7.x 验收命令清单 + 输出片段"
3. Audit Agent 是所有 wave 的 reviewer-required（PROJECT_COMMAND_CENTER §3 §19）
4. 涉及 `apps/api/src/database/migrations/` 的 PR 必须 Architect Agent 评审
5. 涉及 RBAC schema 的 PR 必须 Audit + Architect 双签
6. 不允许 amend 已 push 的 commit / force push main

### 8.2 回滚策略

**通用回滚链**：
1. **代码回滚**：`git revert <merge-commit>` → 走正常 deploy.yml 流程；
   不允许 `git reset --hard` 已 push 历史。
2. **DB 迁移回滚**：每个 TS 迁移必有 `down()`（g195-P5 红线已强制）；
   回滚执行：`docker compose exec -T api ./node_modules/.bin/typeorm
   -d dist/database/data-source.js migration:revert`。
3. **`schema_migrations` 表**：手动 `DELETE FROM schema_migrations WHERE
   filename=...` 仅在确认 DDL 已物理回滚后；不可"标记已执行但表未变"。

**按 Wave 的特殊回滚剧本**：

| Wave | 回滚剧本 | 数据损失风险 |
|---|---|---|
| W1（Audit RBAC 加 guard） | 直接 revert PR；不涉及 DB；最坏短暂回到裸奔状态，立即修复重发 | 无 |
| W2（文档） | revert PR；文档无副作用 | 无 |
| W3（DataScope CLS 收口） | revert PR；运行时回到手工映射；务必保留 2 个 release 后再删旧字段名 | 无（仅读路径） |
| W4（biz_site_aliases seed） | `migration:revert` + 旧 service 路径未消费，回退安全 | 无 |
| W5（Finance 项目维度 + 旁路收口） | revert PR；F4 AP 付款端点回退不影响已写流水（append-only） | 已写流水不可删；只能反向冲销 |
| W6（store_code 分家） | **最高风险**：必须用"双写一个 release + 反向回滚开关"。回退预案：保留 `inv_batches.store_code` 旧列至少 2 个 wave；service 端开关回到旧读路径；DDL 不删列 | 写错列即对账偏差，必须真实场对账 |
| W7（FIFO 收口 + 角色硬编码） | revert PR；FIFO 路径切换需双跑期 1 周 | 库存扣减偏差需对账 |
| W8（workflow 切 biz_projects） | revert PR；保留 prc2_projects.project_manager_user_id 一个 release，service 读路径开关 | 审批人解析失败可能停摆 |
| W9（APP_GUARD 全局化） | **最高风险**：必须保留"按 controller 白名单逐个打开"模式；可全量回退到"无 APP_GUARD + 每 controller 自挂" | 漏挂 controller 立即裸奔 |
| W10（CI 默认密码清账） | revert PR；不影响生产 | 无 |

**事故响应原则**：
- 任何 wave 上线后 24h 内发现"未在验收命令覆盖范围内的回归"，**立刻
  revert + 写 incident report**（`docs/incidents/<date>-<topic>.md`）。
- 不允许"再发一个修复 PR"压过去；必须先回到稳定态再补丁。
- 涉及 RBAC / 主数据 schema 的事故，**必须四个 Agent 联合复盘**。

---

## 9. 与 PROJECT_COMMAND_CENTER.md / CLAUDE.md 的一致性确认

- §1 总原则：本规划遵守"分支隔离 / 不直接改 main / 高风险变更先文档"。
- §3 合并规则："各 Agent feature/agent-* 分支 → Audit 审 → 合 main"已在 §8 强化。
- CLAUDE.md §0（entity 对齐铁律）：W4-W8 所有迁移必须先 `\d <table>` 验列。
- CLAUDE.md §0.5（nullable-in-unique）：迁移含新唯一约束时必须配占位默认值。
- CLAUDE.md §0.6（好业财铁律）：W3 / W5 涉及 chanjet / AR ledger 的改动必须
  保持"`fin_ar_invoices` 与 `chanjet_ar_snapshot` 永不连接"。
- CLAUDE.md §6 / §7（库存唯一台账 + 状态字典）：W7 直接对应。
- CLAUDE.md "post-commit hook 已停自动推（2026-06-10 起）"：本阶段
  push main 全部走 PR 流程 + Audit 审核 + 用户拍板。

---

**本规划生效日期：2026-06-20。**
**下一节点：Audit Agent 启动 W1 实施。**
