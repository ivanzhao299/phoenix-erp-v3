# M2 项目主权 Consolidation 审查

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：
> - `docs/M2_PROJECT_CONSOLIDATION.md`（本审查对象）
> - `docs/M1_ORGANIZATION_MODEL.md` v2.0（架构冻结）
> - `docs/M1_ORGANIZATION_MODEL_CHANGELOG.md` v2.0（C-1 ~ C-7 合入记录）
> - `docs/M1_DECISIONS_AUDIT.md`（§6 允许启动 M2）
> - `docs/WAVE1_ACCEPTANCE_REVIEW.md`（漂移基线 + W5 启动顺序）
>
> 本审计不修改业务代码、不新增 migration、不生成 SQL；只判 M2 子文档是否可
> 作为 W5/W6/W8 实施基线 + 是否解锁 W5 启动。

---

## 0. 结论速读

| 审查维度 | 结论 |
|---|---|
| 1. biz_projects 唯一 canonical 自洽 | 🟡 **基本自洽**；1 处主权模糊（capital_status / equity_status 同时在 biz_projects 与 shr_project_attrs 上，写入主权未明） |
| 2. 三源（prc2_projects / shr_projects / sys_organizations.PROJECT）处置安全 | ✅ **方向正确**；W6 五步串行风险需明文拆分 |
| 3. W5 允许项是否过大 | ✅ **规模合适**（10 项里仅 A3 / A8 是增量风险点） |
| 4. W6 / W8 冻结边界清晰 | 🟡 **W8 / 永禁项清晰**；**W6 内部 5 步串行未拆 W6a/W6b/W6c** |
| 5. 12 hit 替换清单完整性 | ✅ **6+6 hit 全部 1:1 列出**；S-W4 / S-W5 提前到 W5 是明文例外 |
| 6. 与 ERP E3/E5/E6 + Finance F1-F5 冲突 | ✅ **完全无冲突**；C-4 + C-5 还为 Finance F2 未来严格策略升级铺路 |
| 7. 允许进入 W5 | ✅ **允许**，但 §11 Q-1（业务方拍板回填流程）必须先拍才能启动 A3 |
| 8. **总决议** | **🟢 PASS WITH CONDITIONS**（条件见 §9） |

---

## 1. biz_projects 作为唯一 canonical 是否自洽

### 1.1 主权宣言核验

M2 §1.1 主权宣言 4 条全部清晰：
- ✅ 所有 project_code 建档 / 命名 / 状态机 / 删除归档经 biz_projects
- ✅ 业务表 project_code 必须在 biz_projects 找到对应行
- ✅ prc2_projects 与 shr_projects 在 W8 / W6 后退化
- ✅ sys_organizations(PROJECT) 占位行只读，canonical 永远在 biz_projects

### 1.2 字段清单与状态机

- ✅ §1.2 扩 5 列与母规划 §5.3 完全一致（project_manager_user_id / site_code / capital_status / equity_status / is_shareholder_managed）
- ✅ §1.3 状态机继承 M1 §4.5 / C-4 决议
- ✅ §1.4 与主数据中心集成（TYPES.project / G3-B 审批 / Selector / governance）链路清晰

### 1.3 🟡 唯一自洽缺口：capital_status / equity_status 写入主权模糊

**事实**：
- §1.2 表：biz_projects 扩列含 `capital_status` / `equity_status`，"来源" = "从 shr_projects 迁移"
- §2.3 W6 处置：shr_projects RENAME TO shr_project_attrs，"保留全部现存列；不删任何字段"
- §6.2 S-W3：shareholder/entities/shr-project.entity.ts 改 @Entity('shr_project_attrs')+ "字段清单调整（**只留资本/股权附加字段**）"

**含义模糊**：
- W6 后 biz_projects.capital_status 与 shr_project_attrs.capital_status **同时存在**
- 写入路径未明：股东 capital flow 更新时改 biz_projects.capital_status？shr_project_attrs.capital_status？还是双写？
- 读取路径未明：F2 / shareholder service / dashboard 应读哪个？
- §6.2 S-W3 说 "只留资本/股权附加字段"——但 capital_status 既是 biz_projects 上的字段，也算是"资本附加字段"
- 这是 W4_REVIEW §1.1 (STORE 双源风险) 的项目维度翻版

**判定**：
- 不是冲突（biz_projects 主权宣言并未被破坏）
- 但 W6 后会出现"两表同名字段，业务侧不知改哪个"的运行时风险
- M2 §11 Q-2 提到 "shareholder-finance bridge" 文档辅助 — 这是 F6 范围；**M2 应该自己解决**两个 status 字段的主权

**建议**：M2 §2.3 末段或新增 §2.3.x 明文：
- 选项 A：biz_projects.capital_status 是**唯一权威**，shr_project_attrs.capital_status 在 W6 末 DROP COLUMN（W6 实施）
- 选项 B：shr_project_attrs.capital_status 是**唯一权威**，biz_projects.capital_status 仅作"派生展示快照"（service 定期同步）
- 选项 C：biz_projects.capital_status 留作"近期状态快照"（service 写时双写），shr_project_attrs.capital_status 留作"完整流水"

Audit 倾向**选项 A**（与"biz_projects 是唯一 canonical"主权宣言最一致），但需 Finance + Architect 双签。

### 1.4 §1 结论

🟡 **基本自洽 + 1 处主权模糊**——biz_projects 主权宣言清晰，但 capital_status / equity_status 在 biz_projects 与 shr_project_attrs 双写 / 双读问题需 M2 自己解。

---

## 2. prc2_projects / shr_projects / sys_organizations.PROJECT 三源处置安全性

### 2.1 prc2_projects 处置评估

| 维度 | 评估 |
|---|---|
| W5 不动 schema / 不切 service | ✅ 完全安全 |
| W8 service 切表（assignment-resolver + workflow-biz-registry + master-data-references）| 🟡 6 处一次切；§6.1 全部列明，但需双跑期 1 周（§9.2 W8 回滚剧本明文） |
| entity / 数据保留至 W10+ 评估 | ✅ 永远保留 entity；只删表是 W10+ 后置评估 |
| 数据完整性 | 🟢 prc2_projects 数据保留即可作 W8 双跑期 fallback |

### 2.2 shr_projects 处置评估

| 维度 | 评估 |
|---|---|
| W5 不动 | ✅ |
| W6 RENAME TO shr_project_attrs + VIEW + FK + service 切换 + entity 改名 | 🟡 **5 步串行**，单点失败 → 整 wave 回滚 |
| 视图兼容期 ≥ 1 wave（W7 才 DROP） | ✅ 安全 |
| 数据完整性 | ✅ RENAME 不丢数据；FK 加约束前先 W5 回填差集 |
| service 双写期 | ❌ §9.2 W6 回滚剧本写"建议双写期 1 wave" — 但 M2 §2.3 未明确双写期；视图直接切换 |

### 2.3 sys_organizations(PROJECT) 占位行处置评估

| 维度 | 评估 |
|---|---|
| 现存保留 + 只读化 | ✅ M1 §4.2 C-7 决议 + M2 §2.4 完全继承 |
| W6 INSERT 硬阻（type_rules service 接入） | ✅ 与 M1 决议一致 |
| 物理 DELETE 永禁 | ✅ M1 §12 与 M2 §2.4 一致 |
| UPDATE 白名单（含 manager_user_id）| ✅ M1 v2.0 §4.2 明文 |

### 2.4 🟡 风险：W6 五步串行 + shr_projects 双写期缺失

M2 §9.2 W6 回滚剧本写得详细，但实际实施时：
- Step 1: shr_projects RENAME TO shr_project_attrs（必须先于其它）
- Step 2: CREATE VIEW shr_projects 兼容
- Step 3: ADD CONSTRAINT FK shr_project_attrs.project_code → biz_projects
- Step 4: shareholder service 改读（capital-aggregation + entity）
- Step 5: data-quality + product-master + workflow-biz-registry / master-data-references 配置切

**风险**：
- 任一 Step 失败 → 整 W6 回滚（5 步全部反向）
- 若 Step 3 FK 加失败（数据有脏项：shr_projects 中有 project_code 不在 biz_projects 中），整 wave 卡死
- 缺乏 service 双写期（Step 4 直接切到新视图 + JOIN）

**建议**：
- **拆分 W6**：W6a (RENAME + VIEW + FK) → W6b (shareholder service 切) → W6c (data-quality + product-master 配置切)；每个子 wave 独立可回滚
- 或在 W5-A3 数据回填后增加 W5-A11 "FK 预演"：先在 staging 试 ADD CONSTRAINT 看是否 OK；W6 实施前确认 FK 不会触阻

### 2.5 §2 结论

✅ **三源处置方向正确**；🟡 **W6 内部应拆 W6a/W6b/W6c 三个子 wave**，或 W5-A11 增 FK 预演步骤。

---

## 3. W5 允许项是否过大

### 3.1 W5 项目数清单（§8.1 共 10 项）

| 项 | 量级 | 风险 |
|---|---|---|
| W5-A1 M2 文档合入 | 轻 | 🟢 |
| W5-A2 扩 5 列 TS 迁移（nullable ADD COLUMN） | 轻 | 🟢 |
| W5-A3 数据回填（shr_projects + prc2_projects 独有 project_code → biz_projects） | **重** | 🟡 业务方拍板每条；流程依赖 Q-1 |
| W5-A4 project_manager_user_id 回填 | 中 | 🟢 |
| W5-A5 capital_status / equity_status / is_shareholder_managed 回填 | 中 | 🟢 |
| W5-A6 ACTIVE 后 company_code 不可变 service update path | 轻 | 🟢 |
| W5-A7 DB trigger（C-4） | 轻 | 🟢 |
| W5-A8 master-data/operations.service:56,169 改读 biz_projects（S-W4 / S-W5） | 中 | 🟡 W5 内允许动 service 的 Architect 自承例外 |
| W5-A9 漂移脚本对账 | 轻 | 🟢 |
| W5-A10 C-5 唯一公司违规扫描 | 轻 | 🟢 |

### 3.2 与 WAVE1_REVIEW §10.1 W5 Gantt 对比

WAVE1 W5 主战场：
- M2 / M3 子文档评审 + 用户拍板
- biz_projects 扩列 TS 迁移
- ERP workflow.byProjectManager 灰度开关准备（**不切表**）
- Audit `scripts/check-public-controllers.mjs`
- F2 sys_user_project_scopes 覆盖度审计
- F5 attachment_urls 方案评审

**判定**：M2 A1-A10 与 WAVE1 W5 列表完全吻合；A8 是 M2 自承的"W5 修 service 行为唯一例外"（master-data 模块内部），合理。

### 3.3 风险评估

- **A3 风险**：业务方拍板每条 INSERT → §11 Q-1 流程未拍板就启动会卡住
- **A8 风险**：W5 内动 operations.service 行为，可能影响 master-data 治理首页（W4 已加 7 卡片，A8 改读 biz_projects 后 project center 数据源切换）。建议 W5 A8 实施后跑一次回归。

### 3.4 §3 结论

✅ **W5 项目规模合适**——10 项中 7 项轻量 + 2 项中 + 1 项重；增量风险点在 A3（依赖 Q-1）+ A8（master-data 内部例外）。

---

## 4. W6 / W8 冻结边界是否清晰

### 4.1 W6 冻结清单核验

§8.2 列了 8 项 W6 冻结 + 解锁条件：
- 7 项强 trail（shr_projects RENAME → FK → 视图 → service 切 → entity 切 → data-quality 切 → product-master 切）
- 1 项弱评估（Finance F2 严格策略升级）

**评估**：
- ✅ 解锁条件明确："W5-A2 ~ A5 全部上线 + Audit 复核漂移脚本 4 hit + Finance 复审 fin_shareholder_* 安全"
- 🟡 **但 W6 内部 7 项是否子 wave 串行未明**（§2.4 提到的拆分建议）
- ✅ 8.5 永久禁项 5 条全部清晰

### 4.2 W8 冻结清单核验

§8.4 列了 6 项 W8 后置：
- W8-E1 workflow.assignment-resolver 切（双跑期 1 周）
- W8-E2 approval-engine workflow-biz-registry 替换（mdAuditHook 表名变）
- W8-E3 master-data-references 切
- W8-E4 master-data-runtime 注释
- W8-E5 漂移对账（prc2_projects 6 → 0）
- W8-E6 prc2_projects DROP TABLE 评估（推迟 W10+）

**评估**：
- ✅ 边界清晰：W8 只动 prc2_projects 引用，不动 shr_projects（W6 已完成）
- ✅ DROP TABLE 推迟 W10+ 是审慎做法
- ✅ 双跑期 1 周明文

### 4.3 永久禁项

§8.5 列了 5 项：多法人合资 / ACTIVE 改 company_code / 物理删占位行 / 新建占位行 / 业务表通过 prc2_projects 或 shr_projects 拿 project_code 主权。

✅ 与 M1 v2.0 C-4 / C-5 / C-7 完全一致。

### 4.4 §4 结论

✅ **W8 + 永禁项边界清晰**；🟡 **W6 内部建议拆 W6a/W6b/W6c**（同 §2.4 建议）。

---

## 5. 12 hit 替换清单完整性

### 5.1 prc2_projects 6 hit 核验（§6.1）

对照 WAVE1_REVIEW §5.1 漂移告警逐一核对：

| WAVE1 命中 | M2 替换清单 | 完整性 |
|---|---|---|
| approval-engine/workflow-biz-registry.service.ts:258 (注释) | **P-1** | ✅ |
| :259 (tableName) | **P-2** | ✅ |
| :261 (onApproved mdAuditHook) | **P-3** | ✅ |
| :262 (onRejected mdAuditHook) | **P-4** | ✅ |
| master-data/master-data-references.service.ts:108 | **P-5** | ✅ |
| (白名单内) workflow/assignment-resolver.service.ts:203 | **P-W1** | ✅ |
| (白名单内) procurement-v2 entity | **P-W2** | ✅ |
| ❓ master-data/master-data-runtime.service.ts:73 注释 | **P-6** | ✅ Architect 额外发现（漂移脚本未必命中注释行，但 P-6 用作完整清理）|

**判定**：✅ **完整**（6 hit + 2 白名单 + 1 注释 = 9 处全部列出）

### 5.2 shr_projects 6 hit 核验（§6.2）

| WAVE1 命中 | M2 替换清单 | 完整性 |
|---|---|---|
| data-quality/code-governance.service.ts:40 | **S-2** | ✅ |
| data-quality/master-data-health.service.ts:27 (注释) | **S-3** | ✅ |
| data-quality/master-data-health.service.ts:52 | **S-4** | ✅ |
| product-master/lookup.controller.ts:198 (注释) | **S-5** | ✅ |
| product-master/lookup.controller.ts:209 | **S-6** | ✅ |
| approval-engine/workflow-biz-registry.service.ts:258 (注释) | **S-1** | ✅（同 P-1 行，分别计 prc2 + shr 两个 hit） |
| (白名单内) shareholder/services/capital-aggregation.service.ts:35 | **S-W1** | ✅ |
| (白名单内) :46 | **S-W2** | ✅ |
| (白名单内) shareholder/entities/shr-project.entity.ts | **S-W3** | ✅ |
| (白名单内) master-data/operations.service.ts:56 | **S-W4** | ✅ |
| (白名单内) :169 | **S-W5** | ✅ |

**判定**：✅ **完整**（6 hit + 5 白名单 = 11 处全部列出）

### 5.3 §6.3 漂移基线对账目标

| Wave | M2 目标 | Audit 评估 |
|---|---|---|
| W4 基线 | prc2 6 / shr 6 | ✅ 与 W4_REVIEW §5 一致 |
| W5 末 | prc2 6（不动）/ shr 4（S-W4 + S-W5 修） | ✅ 与 §6.2 一致 |
| W6 末 | prc2 6 / shr 0（视图兜底）| ✅ |
| W7 末 | prc2 6 / shr 0（视图删，service 最终态）| ✅ |
| W8 末 | prc2 0 / shr 0 | ✅ |

**判定**：✅ **12 hit 替换清单完整**；漂移对账目标可逐 wave 验证。

### 5.4 §5 结论

✅ **完整**；M2 §6 是本批 M2 文档"工程化心脏"，落地度最高。

---

## 6. 是否与 ERP E3/E5/E6 + Finance F1-F5 冲突

### 6.1 ERP E3/E5/E6（commit `01014a1`）

| ERP 改动 | M2 触及 | 冲突 |
|---|---|---|
| E3 prc2_ap_ledger supplier 收口（resolveSupplier） | M2 不触 prc2_ap_ledger / suppliers | ✅ 无 |
| E5 inv_batches.status 字典化 | M2 不触库存 | ✅ 无 |
| E6 procurement.getApprovers / workflow.isAdmin / assignment-resolver.byCompanyFinance 改 PBAC | M2 W8 改 assignment-resolver.byProjectManager；与 E6 byCompanyFinance 是同文件不同 method | ✅ 不冲突（M2 与 E6 改的是不同 method） |

**WAVE1 §5.1 ERP isAdmin 正则缺陷**（仍待修）：
- 该缺陷与 M2 无关；M2 不动 isAdmin

### 6.2 Finance F1-F5（commit `bec0185`）

| Finance 改动 | M2 触及 | 冲突 |
|---|---|---|
| F1 service 直读 CLS dataScope | M2 §3 字段语义与 F1 一致；M2 不动 DataScope service | ✅ 无 |
| F2 项目维度过滤 `(project_code IS NULL OR project_code = ANY)` | M2 §3.2 注释"F2 当前过渡兼容；W6+ 历史回填后可升级严格 ANY"；M2 §11 Q-4 留给 Finance 拍板时点 | ✅ 一致 + 为未来升级铺路 |
| F2 前端 ProjectSelector | M2 §3.5 ProjectSelector 调 /api/biz/projects/active；与 F2 一致 | ✅ |
| F3 reimbursements.pay 收口 | M2 不触 | ✅ 无 |
| F4 AP 手工付款 + DataScope 双维校验 | M2 §3.2 表 "财务 AP 项目可选" + C-4 + C-5 保证无歧义 | ✅ 一致 |
| F5 fin_* attachment_urls 方案文档 | M2 不触 | ✅ 无 |

### 6.3 跨模块协同确认

| 协同点 | M2 §7 责任分配 | 与 ERP / Finance 一致 |
|---|---|---|
| W8 workflow.byProjectManager 切表 | ERP 主 + Architect 评审 + Audit 核审批历史 | ✅（与 PLAN §2.3 E7 一致） |
| W6 shareholder 域改造（capital-aggregation） | Architect 主 + Finance 协 + 双签 | ✅（与 PLAN §2.4 F6 协同） |
| Finance F2 严格策略升级 | Finance 主 + Architect 跑回填完成度对账 | ✅（M2 Q-4 留拍板） |

### 6.4 §6 结论

✅ **完全无冲突**；C-4 + C-5 还为 Finance F2 项目过滤未来策略升级铺路。

---

## 7. 是否允许进入 W5

### 7.1 W5 启动前置（按 WAVE1_REVIEW §10.1）

| 前置条件 | 状态 |
|---|---|
| M1 v2.0 决策合入主文档 | ✅（changelog v2.0 已生效） |
| M1 §1.3 DEPARTMENT 自嵌套勘误（C-cond-2） | ✅（M1 v2.0 §8.2 C-1 第 5 点已含承诺） |
| M2 子文档评审通过 + 用户拍板 | ⏳ **本审计后启动**；§11 Q-1 ~ Q-5 待拍板 |
| M3 子文档定稿 | ⏳ 并行进行（不阻塞 M2） |
| ERP W1 修复合入（WAVE1 §5.1 isAdmin 正则） | ⏳ 待 ERP 独立 PR |
| Finance F1-F5 合入 | ⏳ 待 Finance 独立 PR |
| 用户澄清 M3 解释 A vs B（DECISIONS_AUDIT §7） | ⏳ 待用户 |

### 7.2 §11 Q-1 ~ Q-5 拍板项的阻塞性

| Q | 阻塞 | 评估 |
|---|---|---|
| Q-1 业务方拍板每条 INSERT 流程 | **W5 启动** | 🔴 P0：A3 数据回填依赖此流程；不拍板 = A3 卡住 |
| Q-2 shareholder-finance bridge 文档辅助 | W6 启动 | 🟡 P1：W6 启动前拍 |
| Q-3 prc2_projects 是否在 W10+ DROP | W10+ | 🟢 P2：长期评估 |
| Q-4 Finance F2 严格策略升级时点 | W6+ | 🟡 P1：与 Q-2 同节奏 |
| Q-5 data-quality 命名 pattern 收紧 | W6 内 | 🟢 P2：W6 实施时拍即可 |

**判定**：Q-1 必须先拍板才能启动 W5；其它 Q 不阻塞 W5。

### 7.3 §1.3 capital_status 主权模糊（本审计补提）

属本审计 §1.3 新发现。需 Architect 在 W5 启动前补 §2.3.x 明文（选项 A/B/C）。

### 7.4 §7 结论

✅ **允许进入 W5**，但前置：
- M2 文档评审 + 用户拍板 Q-1（必）+ §1.3 主权选项拍板（必）
- ERP isAdmin 修复合入（继承 WAVE1 §5.1）

---

## 8. 跨决策一致性核验

### 8.1 与 M1 v2.0 一致性

| M1 章节 | M2 引用 | 一致性 |
|---|---|---|
| §3.2 C-5 PROJECT 唯一 COMPANY | M2 §3 / §5 | ✅ |
| §4.1 C-4 company_code 不可变 + 业务重组 SOP | M2 §4 | ✅ |
| §4.2 C-7 占位行 UPDATE 白/黑名单 | M2 §2.4 直引 | ✅ |
| §5.5 site × project 跨多公司允许 | M2 §3.3 | ✅ |
| §11.5 DataScope 5 步算法 | M2 §3 字段语义 | ✅ 不冲突 |
| 母规划 §5.3 / §5.4 W5/W6 计划 | M2 §8.1 / §8.2 | ✅ |
| WAVE1 §5.1 漂移基线 | M2 §6.1 / §6.2 | ✅ 1:1 |
| M1_DECISIONS_AUDIT §6 允许启动 M2 | 整文 | ✅ |

### 8.2 与 user 拍板 4 条一致性

| 拍板 | M2 触及 | 一致 |
|---|---|---|
| #1 仓库 ≠ site | 不触 | ✅ |
| #2 门店 = SITE-*-STORE | 不触 | ✅ |
| #3 brd_houses FK | 不触；F-1 跟进项已在 M1 v2.0 §5.2 收口 | ✅ |
| #4 shareholder scope 不并入 sys_user_scopes | M2 §2.3 / §11 Q-2 与 F6 协同 | ✅ |

### 8.3 与 PROJECT_COMMAND_CENTER §5 / CLAUDE.md 一致性

| 准则 | M2 实施 |
|---|---|
| 高风险变更先文档（§5） | ✅ M2 是子文档，service 改造在 W5+ |
| CLAUDE.md §0 entity ↔ DB 对齐 | ✅ W5 扩列 entity + 迁移同 PR |
| §0.5 nullable-in-unique | ✅ W5 扩 5 列全 nullable，不动唯一约束 |
| §0.6 好业财铁律（fin_ar_invoices 与 chanjet 永禁连接） | ✅ M2 不触 chanjet |
| TS 迁移红线（含 down + 无业务 DML） | ✅ A3 业务回填有 `@allow-data-dml` 标记 |

---

## 9. 决议

### 9.1 总评：🟢 PASS WITH CONDITIONS

**通过理由**：
1. biz_projects 主权宣言清晰；扩 5 列方案与母规划完全对齐
2. 三源处置方向正确；W5 不动业务 service / W6 RENAME + 视图 + service 切 / W8 切 workflow + approval
3. 12 hit 替换清单（prc2 + shr）100% 完整，含白名单内 + 注释行
4. 与 ERP E3/E5/E6 + Finance F1-F5 完全无冲突；为 F2 未来升级铺路
5. 与 M1 v2.0 + 母规划 + WAVE1 + user 4 拍板 + CLAUDE.md 全部一致
6. 回滚剧本详尽，每个 wave 都有验收命令

### 9.2 合入条件（W5 启动前必满足）

| # | 条件 | 责任 | 截止 |
|---|---|---|---|
| M2-cond-1 | §11 **Q-1 业务方拍板每条 INSERT 流程**用户拍板（推荐走主数据中心待办列表 M4 governance.todo） | 用户 + Architect | W5 启动前 |
| M2-cond-2 | §1.3 **capital_status / equity_status 主权三选一明文**（推荐选项 A：biz_projects 唯一权威，shr_project_attrs W6 末 DROP COLUMN） | Architect + Finance（双签） | W5 启动前 |
| M2-cond-3 | §11 Q-5 data-quality 命名 pattern 是否收紧为 `^PRJ_[A-Z][A-Z0-9_]+$`（与 M1 §4.3 一致） | Architect | W6 启动前 |
| M2-cond-4 | §2.4 / §4.1 **W6 内部建议拆 W6a (RENAME + VIEW + FK) / W6b (shareholder service 切) / W6c (data-quality + product-master 切)** | Architect | W6 启动前；或保留 W6 单 wave 但加 W5-A11 "FK 预演" |
| M2-cond-5 | ERP WAVE1 §5.1 isAdmin 正则缺陷修复合入（继承 WAVE1） | ERP | W5 启动前 |

### 9.3 跟进项（不阻塞合入，下批迭代处理）

| # | 跟进 |
|---|---|
| M2-follow-1 | §11 Q-2 shareholder-finance bridge 文档辅助 — 与 F6 协同启动 |
| M2-follow-2 | §11 Q-4 Finance F2 严格策略升级时点 — W6+ 决议 |
| M2-follow-3 | §11 Q-3 prc2_projects W10+ DROP TABLE 评估 — 长期 |
| M2-follow-4 | shr_projects 视图（W6 后）的查询性能影响 — W7 视图 DROP 前观察一次 |

### 9.4 W5 启动顺序建议

```
1. Architect 出 PR:
   - M2 文档修订（§1.3 主权三选一明文 + §11 Q-1 流程确定 + §2.4 W6 拆分 / W5-A11 FK 预演）
   - 同步出 M3 子文档（与 M2 并行）
2. Audit 复审 M2 修订
3. 用户拍板（Q-1 流程 + §1.3 主权选项 + Q-5 pattern）
4. ERP isAdmin 正则修复合入
5. 合入 M2 + tag v3-m2-project-consolidation-YYYYMMDD
6. 平行启动 W5:
   a. W5-A2 biz_projects 扩 5 列 TS 迁移（Architect）
   b. W5-A3 数据回填（Architect + 业务方按 Q-1 流程拍）
   c. W5-A4 / A5 字段回填
   d. W5-A6 / A7 不可变 service + trigger
   e. W5-A8 master-data/operations 改读 biz_projects
   f. W5-A9 / A10 漂移对账 + 唯一公司扫描
   g. (新增) W5-A11 FK 预演 in staging（M2-cond-4 选项）
7. W5 末验收（§9.4.1 全套）
```

### 9.5 监测项（Audit W5/W6/W8 每 wave 跑）

```bash
# 漂移基线对账(每 wave 后跑,与上波 diff)
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w$N.json
diff /tmp/mdr-w$((N-1)).json /tmp/mdr-w$N.json
# 期望 hit 数按 §6.3 表收敛

# entity ↔ DB 漂移基线
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# C-5 唯一公司违规扫描(W5 起每 wave 跑)
psql -c "SELECT project_code, COUNT(DISTINCT company_code)
           FROM biz_projects GROUP BY project_code
           HAVING COUNT(DISTINCT company_code) > 1;"

# C-4 trigger 存在性
psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid='biz_projects'::regclass;"

# M2 §1.3 主权选项验证(W6 后)
psql -c "SELECT column_name FROM information_schema.columns
          WHERE table_name='shr_project_attrs' AND column_name IN ('capital_status','equity_status');"
# 选项 A 期望 0; 选项 B/C 期望 2

# F2 兼容期策略仍生效(W6+ 拐点验证)
grep -rn "project_code IS NULL OR project_code = ANY" apps/api/src/modules/finance-v2/services/
# W6 拐点后期望 0
```

---

**审计完毕。M2 项目主权 consolidation 可作为 W5/W6/W8 实施基线，前提是
M2-cond-1 ~ M2-cond-5 在 W5 启动前合入；M2 与 ERP/Finance 完全无冲突；
12 hit 替换清单工程化完整。**
