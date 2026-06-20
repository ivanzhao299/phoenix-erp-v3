# M1 组织模型决策（C-1 ~ C-7）审计

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：
> - `docs/M1_ORGANIZATION_MODEL.md`（架构冻结版）
> - `docs/M1_ORGANIZATION_MODEL_REVIEW.md`（提出 C-1 ~ C-7）
> - `docs/M1_ORGANIZATION_MODEL_DECISIONS.md`（本审计对象）
> - `docs/MASTER_DATA_PHASE2_DESIGN.md`
> - `docs/MASTER_DATA_W4_REVIEW.md`
> - `docs/WAVE1_ACCEPTANCE_REVIEW.md`
> - 已落代码：W4 Foundation（migration `1782000000000` + entity + governance/operations）、ERP E3/E5/E6（commit `01014a1`）、Finance F1-F5（commit `bec0185`）
>
> 本审计不改业务代码、不新增 migration；只判 7 项决策是否可合入 M1 主文档 +
> 是否解锁 W5 / M2 / M3。

---

## 0. 结论速读

| 审查维度 | 结论 |
|---|---|
| 1. C-1~C-7 与用户已拍板四条规则冲突 | ✅ **无冲突** |
| 2. 与 W4 Foundation 冲突 | 🟡 **1 处文档级不一致**（C-1 §1.3 称 DEPARTMENT 行 `allowed_parent_types` "已含 [COMPANY, SITE] + 自嵌套"，但 W4 seed 实际无 `DEPARTMENT` 自身——W6 type_rules 接入时需 UPDATE seed） |
| 3. 与 ERP E3/E5/E6 + Finance F1-F5 冲突 | ✅ **完全不冲突** |
| 4. 可进入 W5 的决策 | C-1 / C-3 / C-4 / C-6 进 service 实施；C-2 / C-5 / C-7 进 W5 文档化（M1 修订 + M3 子文档定稿） |
| 5. 必须冻结到 W6/W7 的决策 | C-1 type_rules 硬校验深度 → W6；C-6 status 同步 service 落地 → W6；C-7 INSERT 占位行硬阻 → W6；C-2 算法实施 / C-3 严格语义 service 检查 → W7 |
| 6. 启动 M2 主数据（项目主权 consolidation） | ✅ **允许**（C-4 + C-5 决策已就位） |
| 7. 启动 M3 权限模型（SITE 子类化迁移 + status 同步 + 占位行）| ✅ **允许**（C-6 + C-7 决策已就位；术语澄清详 §7） |
| **总决议** | **🟢 PASS WITH CONDITIONS**（条件见 §9） |

---

## 1. C-1~C-7 与用户已拍板四条规则的冲突分析

### 1.1 用户 4 条拍板（2026-06-20 拍板）

| # | 拍板内容 |
|---|---|
| 拍板 #1 | 仓库 ≠ site；库存 / FIFO / 批次 / 库位用 `warehouse_code` |
| 拍板 #2 | 门店 = `SITE-*-STORE`；`mst_stores` 是兼容档案（不是主数据源） |
| 拍板 #3 | 鸡舍必属 site；`brd_houses.site_code` 加 FK 强约束 |
| 拍板 #4 | shareholder scope 不并入 `sys_user_scopes`；DataScope 输出层可统一 `allowedShareholderCodes`，底层表分开 |

### 1.2 7 项决策逐条核验

| 决策 | 主题 | 触及拍板 | 冲突 / 一致 |
|---|---|---|---|
| C-1 | DEPT 嵌套深度 ≤ 5 + ancestor 检测 + 自环 trigger | 无 | ✅ 不涉及 |
| C-2 | DataScope 5 步合并算法 | **#4** | ✅ Step 5 `allowedShareholderCodes` 独立计算，底层不与 sys_user_scopes 合表，**完全一致** |
| C-3 | scope 严格只看显式绑定（B 方案） | 无（间接涉及 #4） | ✅ 不沿 parent_id 隐式继承，与 shareholder scope 独立计算思路一致 |
| C-4 | biz_projects.company_code 不可变（ACTIVE 后） | 无 | ✅ 不涉及 |
| C-5 | PROJECT 必属唯一 COMPANY；跨法人走多 project + BU | 无 | ✅ 不涉及 |
| C-6 | mst_stores ↔ SITE status 同步 = service 单点写 | **#2** | ✅ 强化 SITE 为主写入点，mst_stores 退化为档案（与拍板 #2 完全一致） |
| C-7 | sys_organizations(PROJECT/WAREHOUSE) 占位行保留 + 只读化 | **#1** | ✅ canonical 永远在 `wms_warehouses`，占位行只读不影响库存路径（与拍板 #1 不冲突） |

### 1.3 ⚠ 缺口：拍板 #3（brd_houses FK）未在 7 项决策内

**事实**：本批 C-1 ~ C-7 不涉及 brd_houses。

**判定**：
- 不是冲突；本批 7 项审计的是 Audit §6.2 提出的 7 项条件，brd_houses FK 由 M1 主文档 §5.2 + 后续 M3 子文档处理。
- 但需在本审计或 M3 子文档明文 "拍板 #3 brd_houses FK 不在 C-1~C-7 范围内，由 M3 + W6+ DDL 落地"，避免治理盲区。

### 1.4 §1 结论

✅ **C-1 ~ C-7 与用户 4 拍板 0 冲突**；C-2 / C-6 / C-7 还强化了拍板 #4 / #2 / #1。

---

## 2. 与 W4 Foundation 冲突

### 2.1 W4 已落清单

- migration `1782000000000-W4MasterDataFoundation.ts`：建 `sys_organization_type_rules` 表 + 9 条 seed（含 STORE / FACTORY / WAREHOUSE 三个独立 org_type 行）
- entity `sys-organization-type-rule.entity.ts`
- `master-data/operations.service.ts` 扩 `extended-gov` center（site / business-unit / shareholder）
- `master-data/governance.service.ts` 加 `details.extended`（sites / businessUnits / shareholders 行数统计）
- `scripts/check-master-data-references.mjs`

### 2.2 决策与 W4 seed 内容对账

| 决策 | W4 seed 中相关行 | 一致性 |
|---|---|---|
| C-1 DEPT 嵌套深度 + 自环 | `DEPARTMENT` 行：`allowed_parent_types = ['COMPANY', 'SITE']` | 🟡 **决策 §1.3 表声称"已含 [COMPANY, SITE] + 自嵌套"，但 W4 seed 实际未含 `DEPARTMENT`** —— 详 §2.3 |
| C-2 合并算法 | 无相关 seed 行 | ✅ |
| C-3 严格绑定 | 无相关 seed 行 | ✅ |
| C-4 company_code 不可变 | 无相关 seed 行 | ✅ |
| C-5 PROJECT 唯一 COMPANY | `PROJECT` 行：`required_fields = ['org_name', 'company_code']` | ✅ company_code 必填一致 |
| C-6 status 同步 | `STORE` 行：notes 写明 "门店即 SITE-*-STORE, mst_stores 是兼容台账" | ✅ |
| C-7 占位行保留 | `PROJECT` 行 + `WAREHOUSE` 行：notes 已分别写明 "canonical 走 biz_projects / wms_warehouses，org 树占位" | ✅ |

### 2.3 ⚠ 唯一文档级不一致：DEPARTMENT 自嵌套

**事实**：
- 决策书 §1.3 声明："`sys_organization_type_rules` seed 中 DEPARTMENT 行的 `allowed_parent_types` 已含 `['COMPANY', 'SITE']` + 自嵌套"
- W4 migration `1782000000000-W4MasterDataFoundation.ts:81-86` 实际 seed：
  ```ts
  ['DEPARTMENT', '部门', '^DEPT-',
    ['org_name', 'company_code'],
    ['COMPANY', 'SITE'],         ← allowed_parent_types 仅这两个，无 'DEPARTMENT'
    [], ...]
  ```

**影响**：
- W4 仅建表 + seed，service 不消费 type_rules，**当前无运行时影响**
- W6+ type_rules service 接入后，按现 seed，service 将拒绝"DEPT 挂在 DEPT 下"的嵌套写入 → 与 C-1 "深度 ≤ 5 嵌套部门"决策矛盾

**处置**（不阻塞 W4 / W5，但必须在 W6 接入前修复）：
- **方案 A**（推荐）：决策书 §1.3 改为 "W6 接入 service 时同步 UPDATE seed 增加 `'DEPARTMENT'` 到 DEPARTMENT 行的 allowed_parent_types"
- **方案 B**：W5 起独立 TS 迁移更新 seed（属 W6 范围）
- Audit 倾向方案 A —— 文档先收口，迁移待 W6 实施时一并落

### 2.4 §2 结论

🟡 **1 处文档级不一致（C-1 §1.3 vs W4 seed），W6 接入前修复即可，不阻塞 W5**；其余决策与 W4 完全兼容。

---

## 3. 与 ERP E3/E5/E6 + Finance F1-F5 冲突

### 3.1 ERP E3/E5/E6（commit `01014a1`）

| ERP 改动 | 与 C-1~C-7 关系 | 冲突 |
|---|---|---|
| E3 `prc2_ap_ledger` 供应商写入收口（resolveSupplier） | 与 C-1~C-7 主题正交 | ✅ 无 |
| E5 `inv_batches.status` 字典化（INV_STOCK_STATUS） | 与 C-1~C-7 主题正交 | ✅ 无 |
| E6 `procurement.getApprovers` 改 PBAC | 与 C-2 PBAC 思路一致；C-2 Step 1 `*` 短路与 E6 isAdmin 第一步一致 | ✅ 一致 |
| E6 `workflow.service.isAdmin` 改 PBAC 正则（已知 WAVE1 §5.1 缺陷需修） | C-2 Step 1 短路适用；修复后逻辑与 C-2 一致 | ✅ |
| E6 `assignment-resolver.byCompanyFinance` 改 PBAC | 与 C-2 算法不冲突 | ✅ |

**关键观察**：ERP E6 改造主要是把硬编码角色串改为读 `sys_role_menu_permission`（权限 → 角色反查）；这与 C-2 DataScope 合并算法（user → 数据范围）是**两个独立维度**，不互相依赖也不冲突。

### 3.2 Finance F1-F5（commit `bec0185`）

| Finance 改动 | 与 C-1~C-7 关系 | 冲突 |
|---|---|---|
| F1 service 直读 CLS dataScope（`isGlobal` / `allowedCompanyCodes` / `allowedProjectCodes`） | C-2 §2.1 算法输出字段完全覆盖 F1 当前读取的 3 个字段；C-2 Step 1 `*` 短路与 F1 `if (!isGlobal)` 一致；C-2 Step 4 union 与 F1 当前 `WHERE company_code IN (...)` 兼容 | ✅ 完全兼容 |
| F2 项目维度过滤（`(project_code IS NULL OR project_code = ANY)`） | C-4 `biz_projects.company_code` 不可变保证 F2 过滤策略未来可安全升级为严格 ANY；C-5 PROJECT 唯一 COMPANY 保证不会出现"用户看到项目但看不到所属公司"反例 | ✅ 一致；并为未来策略升级铺路 |
| F2 前端 ProjectSelector（按 companyCode 联动） | C-5 PROJECT 唯一 COMPANY 保证 Selector 联动语义清晰 | ✅ 一致 |
| F3 `reimbursements.pay()` 收口 CashTransactionsService | 与 C-1~C-7 主题正交 | ✅ 无 |
| F4 AP 手工付款端点 + DataScope 双维校验 | C-2 算法 + C-4 company_code 不可变 + C-5 PROJECT 唯一 COMPANY 共同保证 F4 校验语义清晰 | ✅ 一致 |
| F5 `fin_*` attachment_urls 方案文档 | 与 C-1~C-7 主题正交 | ✅ 无 |

**关键观察**：Finance F1-F5 是**当前 W3/W5 范围内的实际 service 改造**，其读取的 CLS 字段（`isGlobal` / `allowedCompanyCodes` / `allowedProjectCodes`）正好是 C-2 §2.1 算法的输出 5 字段的 3 个；当 W7 真正实施 C-2 算法时，Finance service 只需扩展读取额外的 `allowedSiteCodes` / `allowedShareholderCodes`，**无需重写现有 F1/F2 代码**。

### 3.3 §3 结论

✅ **C-1~C-7 与 ERP E3/E5/E6 + Finance F1-F5 完全无冲突**；C-2 / C-4 / C-5 还为 Finance F1/F2/F4 的未来升级铺路。

---

## 4. 可进入 W5 的决策

W5 主战场（按 PLAN §5 Step 6/7 + DECISIONS §8.3 Gantt）：

| 决策 | W5 立即执行项 | 责任 Agent | 阻塞前置 |
|---|---|---|---|
| C-1 | M1 §8.2 加约束 + W5 落 service ancestor 检测 + DB 自环 trigger | Architect | 决策合入 M1 主文档 |
| C-2 | M1 §11.5 加完整算法（**仅文档，不动 service**） | Architect | 决策合入 M1 主文档 |
| C-3 | M1 §9 加"scope 继承策略" + W5 跑现存 sys_user_orgs 扫描出报告 | Architect + Audit | 决策合入 M1 主文档 |
| C-4 | M1 §4 加"company_code 不可变" + W5 service update path 校验 + DB trigger | Architect | 决策合入 M1 主文档 |
| C-5 | M1 §3.2 / §4.2 / §5.5 明文化（**仅文档**） | Architect | 决策合入 M1 主文档 |
| C-6 | M1 §7.5 末段细化责任 + W5 Architect 出 service 改造方案（落地 W6） | Architect | 决策合入 M1 主文档 + M3 子文档 |
| C-7 | M1 §4.2 / §6.2 加"保留 + 只读化" + W5 M3 子文档定稿 | Architect | 决策合入 M1 主文档 |

**判定**：
- ✅ **全部 7 项决策都进 W5**——形式是"M1 主文档修订（文档级）+ 部分 service 改造（C-1/C-3/C-4/C-6）"
- ❌ **决策合入 M1 主文档是所有 W5 service 改造的前置**——必须由 Architect 出独立 PR + Audit 复审 + 用户拍板后才动 service

**重要观察**：DECISIONS §9.1 明确承诺"Architect 单独 PR 将 7 项决策合入 M1 主文档"——这是 W5 启动的必要前置（Audit C-1 阻塞条件）。

---

## 5. 必须冻结到 W6 / W7 的决策

按 DECISIONS §8.3 Gantt 与 Audit 风险评估：

| 决策 | 冻结部分 | 解锁波次 | 解锁前置 |
|---|---|---|---|
| C-1 | type_rules service **硬校验深度** ≤ 5 | W6 | type_rules service 接入完成；W4 seed UPDATE（DEPARTMENT 自嵌套）|
| C-1 | `path` 物化列、多列 CHECK CONSTRAINT 强约束 | W6+ 评估（永久候选） | 真实出现递归性能问题再启 |
| C-2 | **算法实施**（DataScopeService 改造输出 6 维）| **W7** | sys_user_scopes 合表方案定稿 + 兼容期保留旧字段 |
| C-3 | service 严格语义检查（消除任何祖先继承代码路径） | W7 | C-2 W7 实施同步进行 |
| C-4 | DB trigger 保险（ACTIVE 后改 company_code 抛错） | W5 末 | service update path 校验先上线 |
| C-5 | 多法人合资 project schema 扩展位 | **永禁** | 走扩展评审 |
| C-6 | mst_stores ↔ SITE status 同步 service 落地 | W6 | M3 子文档定稿；Architect 主、ERP 协 |
| C-6 | DB trigger 同步方案 | **永久放弃** | — |
| C-7 | 占位行 INSERT 路径硬阻 | W6 | type_rules service 接入 |
| C-7 | 占位行物理删除 / 新建 | **永禁** | 走扩展评审 |

**关键链路**：
- **W7 关键路径**：C-2 + C-3 必须**同 wave** 实施（合表 + 算法 + 严格语义三件套一锅煮）；任一项偷跑都会让其它 service 进入未定义行为
- **W6 关键路径**：C-6 + C-7 都依赖 type_rules service 接入；M3 子文档必须先于 W6 定稿

---

## 6. 启动 M2 主数据 consolidation

### 6.1 M2 范围（按 DECISIONS §9.2 + PLAN §5）

M2 = project consolidation：
- biz_projects 收口（含 `project_manager_user_id` / `site_code` / `capital_status` / `equity_status` / `is_shareholder_managed` 5 列扩展）
- shr_projects 退化为 `shr_project_attrs`（FK biz_projects）
- workflow.byProjectManager 切表（最终落地在 W8）

### 6.2 启动前置

| 前置 | 来源 | 状态 |
|---|---|---|
| C-4 biz_projects.company_code 不可变（决策合入 M1） | DECISIONS §9.2 / 本审计 §1 | ✅ 已拍板 |
| C-5 PROJECT 必属唯一 COMPANY（决策合入 M1） | 同上 | ✅ 已拍板 |
| Finance F1/F2 不阻塞 | 本审计 §3.2 | ✅ |
| ERP workflow.byProjectManager 灰度开关（W5 内做） | PLAN W5 Step 6 | ⏳ W5 内 |

### 6.3 §6 结论

✅ **允许启动 M2**——前置条件已就位；C-4 + C-5 决策同步合入 M1 主文档即可。

**M2 子文档需引用本审计 §1.2 + DECISIONS §4 / §5**，并明确：
- biz_projects.company_code 在 ACTIVE 后不可改（C-4）
- PROJECT 必属唯一 COMPANY（C-5）
- workflow-biz-registry 中 prc2_projects → biz_projects 替换清单（WAVE1 §5.1 漂移告警）
- shr_projects → shr_project_attrs 灰度方案（含 data-quality / product-master / approval-engine 3 处迁移）

---

## 7. 启动 M3 权限模型

### 7.1 术语澄清

用户问"M3 权限模型"，但 PLAN §5 / DECISIONS §9.2 中 **M3 = "SITE 子类化迁移 + status 同步 + 占位行"**（不是"权限模型"）。

两种合理解释：

| 解释 | 对应 wave | 启动前置 | 状态 |
|---|---|---|---|
| **解释 A**：用户笔误，实指 PLAN 中 M3（SITE 子类化迁移） | M3 子文档（W5 内定稿） | C-6 + C-7 决策合入 M1 | ✅ 已拍板 |
| **解释 B**：用户实指"权限模型"，对应 W7 `sys_user_scopes` 合表 | W7 实施 | C-2 + C-3 决策合入 M1 | ✅ 已拍板 |

### 7.2 解释 A：M3 SITE 子类化迁移

| 前置 | 状态 |
|---|---|
| C-6 mst_stores ↔ SITE status 同步（决策合入 M1） | ✅ 已拍板 |
| C-7 占位行保留 + 只读化（决策合入 M1） | ✅ 已拍板 |
| W4 seed 中 STORE / FACTORY / WAREHOUSE 三个独立 org_type 行如何合并到 SITE | ⏳ M3 子文档负责给迁移路径 |
| ERP 不阻塞（M3 落地 W6） | ✅ |

**结论**：✅ **允许启动 M3 子文档撰写（W5 内定稿）**。

### 7.3 解释 B：W7 权限模型（sys_user_scopes 合表）

| 前置 | 状态 |
|---|---|
| C-2 DataScope 5 步合并算法（决策合入 M1） | ✅ 已拍板 |
| C-3 严格只看显式绑定（决策合入 M1） | ✅ 已拍板 |
| C-1 DEPT 嵌套约束（间接：合表算法不递归祖先） | ✅ 已拍板 |
| ERP / Finance W3 / W5 改造完成（无回归） | ✅ WAVE1 PASS |
| W4 seed 中 DEPARTMENT 自嵌套问题（§2.3）修复 | 🟡 W6 接入前修，**不阻塞 W7 实施本身** |
| sys_user_scopes 合表方案文档（独立 wave 方案稿） | ⏳ W7 启动前 Architect 出独立方案 |

**结论**：✅ **允许启动 W7 权限模型方案撰写**，**但实施必须等 C-2/C-3 同步落地 + 兼容期保留旧字段 ≥ 1 wave**。

### 7.4 §7 结论

✅ **两种解释都允许启动**——但请用户澄清是 A 还是 B；A 是 W5 内事，B 是 W7 事。Audit 在 §9 条件里把两条都列出。

---

## 8. 跨决策一致性核验（对照 DECISIONS §8）

DECISIONS §8.1 / §8.2 自带的一致性核验表已覆盖：
- 与 M1 主文档章节对应 → ✅
- 与用户拍板 4 条 → ✅（本审计 §1 复核确认）
- 对 W5/W6/W7/W8 影响 Gantt → ✅

Audit 补充观察：

| 跨决策点 | Audit 观察 |
|---|---|
| C-2 Step 4 union sys_user_*_scopes 4 张表 | 与 C-3 严格语义并不矛盾——Step 3 按 sys_user_orgs 严格展开，Step 4 union 显式追加表；不引入隐式继承 |
| C-4 + C-5 联动 | C-4 保证 company_code 不变，C-5 保证 1:1；二者一起把 Finance F2 项目过滤的 "(project_code IS NULL OR project_code = ANY)" 策略未来可升级为严格 ANY |
| C-6 + C-7 都依赖 type_rules service | C-6 status 同步在 service 层独立实现，与 type_rules 接入并行；C-7 INSERT 阻则强依赖 type_rules → 二者落地节奏要协调（W6 同 wave） |
| C-1 + C-2 联动 | C-1 限制 DEPT 嵌套 ≤ 5，C-2 Step 3 展开 sys_user_orgs 行不递归到祖先 —— 即使有深嵌套，scope 算法也不会因深度爆栈 |

---

## 9. 决议

### 9.1 总评：🟢 PASS WITH CONDITIONS

**通过理由**：
1. C-1~C-7 与用户 4 条拍板**0 冲突**；C-2 / C-6 / C-7 还强化拍板 #4 / #2 / #1。
2. 与 W4 Foundation **仅 1 处文档级不一致**（DEPARTMENT 自嵌套，W6 修），不阻塞 W4/W5。
3. 与 ERP E3/E5/E6 + Finance F1-F5 **完全无冲突**，且为 Finance F2 未来策略升级铺路。
4. M2（project consolidation）+ M3（SITE 子类化）+ W7（权限模型）**前置全部就位**。
5. 决策与 PROJECT_COMMAND_CENTER §5 高风险变更先文档 + CLAUDE.md 各红线 + MULTI_AGENT_PHASE2_PLAN §4 冻结清单完全一致。

### 9.2 合入条件（必须在 W5 启动前满足）

| # | 条件 | 责任 | 截止 |
|---|---|---|---|
| C-cond-1 | Architect 出独立 PR 把 7 项决策合入 `docs/M1_ORGANIZATION_MODEL.md` 主文档（按 DECISIONS §8.4 / §9.1 指明的章节） | Architect | W5 service 改造启动前 |
| C-cond-2 | 决策书 §1.3 表关于"DEPARTMENT 行 `allowed_parent_types` 已含 [COMPANY, SITE] + 自嵌套"的声明改为"W6 type_rules service 接入时同步 UPDATE seed 增加 'DEPARTMENT'" | Architect | 决策合入 M1 PR 评审中 |
| C-cond-3 | C-3 现存 `sys_user_orgs` 扫描报告（"只绑 DEPT 漏绑 COMPANY" 的用户清单）必须在 W5 内跑出 | Architect + Audit | W5 第 3 天 |
| C-cond-4 | M3 子文档基于 C-6 + C-7 在 W5 内单独定稿 | Architect | W5 末 |
| C-cond-5 | 用户澄清"M3 权限模型"是指 M3 SITE 子类化迁移（解释 A）还是 W7 权限合表（解释 B）；二者前置都已就位 | 用户 | 启动前 |

### 9.3 跟进项（不阻塞合入，但下次决策迭代必须处理）

| # | 跟进项 | 价值 |
|---|---|---|
| F-1 | 拍板 #3 brd_houses FK 不在 C-1~C-7 内，应在 M3 子文档或本审计后的下一批决策中收口 | 闭合用户 4 拍板的全部承诺 |
| F-2 | C-5 "多法人合资 project 永禁"建议加 BI 视角注释（实际报表合并仍由 BU + 财务汇总科目兜底） | 业务理解清晰 |
| F-3 | C-7 "占位行 UPDATE 仅允许改 status 与 org_name"列表需在 M3 子文档明文（包括 manager_user_id 是否允许） | 避免运维操作模糊 |

### 9.4 W5 启动顺序建议

```
1. Architect 出 PR: 7 项决策合入 M1 主文档（含 §1.3 自嵌套修正）
2. Audit 复审该 PR
3. 用户拍板（含解释 A/B 澄清）
4. 合入 main + 打 tag v3-m1-decisions-merged-YYYYMMDD
5. 平行启动:
   a. C-1 / C-3 / C-4 / C-6 的 W5 service 改造（Architect 主）
   b. M2 子文档（project consolidation）撰写（Architect 主）
   c. M3 子文档（SITE 子类化）撰写（Architect 主）
   d. F2 sys_user_project_scopes 覆盖度审计（Audit + Finance）
   e. Audit 新增 scripts/check-public-controllers.mjs（W1 必交付红线脚本）
6. W5 末:
   a. M3 子文档定稿 + Audit 复审
   b. C-cond-3 sys_user_orgs 扫描报告出
   c. W5 wave 验收
```

### 9.5 监测项（Audit 后续每 wave 跑）

```bash
# 决策合入 M1 后,跑漂移基线
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5-pre.json

# W5 实施后
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5-post.json
diff /tmp/mdr-w5-pre.json /tmp/mdr-w5-post.json

# entity ↔ DB 漂移基线(每 wave 不得增长)
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# nullable-in-unique(若 W5 新增唯一约束)
node scripts/check-nullable-in-unique.js

# TS 迁移红线
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations

# 自引用环检测(C-1 落地后)
psql -c "WITH RECURSIVE cycle AS (
  SELECT id, parent_id, ARRAY[id]::int[] AS path, false AS is_cycle
    FROM sys_organizations WHERE parent_id IS NOT NULL
  UNION ALL
  SELECT o.id, o.parent_id,
         c.path || o.id,
         o.id = ANY(c.path)
    FROM sys_organizations o
    JOIN cycle c ON o.id = c.parent_id
   WHERE NOT c.is_cycle
) SELECT COUNT(*) FROM cycle WHERE is_cycle;"
# 期望 0

# C-3 验收: 现存 sys_user_orgs 只绑 DEPT 漏绑 COMPANY 用户清单
psql -c "SELECT u.user_id, u.username,
                ARRAY_AGG(o.org_type ORDER BY o.org_type) AS bound_types
           FROM sys_user u
           JOIN sys_user_orgs uo ON uo.user_id = u.user_id
           JOIN sys_organizations o ON o.id = uo.org_id
          WHERE u.status = 1
          GROUP BY u.user_id, u.username
         HAVING 'DEPARTMENT' = ANY(ARRAY_AGG(o.org_type))
            AND 'COMPANY' != ALL(ARRAY_AGG(o.org_type));"
# 输出非空 → 业务方补绑或显式放行
```

---

**审计完毕。M1 7 项决策可作为 W5+ 强制基线，前提是 C-cond-1 ~ C-cond-5
合入 M1 主文档 + 用户澄清 M3 指代。M2 / M3 / W7 全部可启动；ERP / Finance
不阻塞。**
