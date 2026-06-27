# M1 组织模型审查

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入：`docs/M1_ORGANIZATION_MODEL.md`（Architect 架构冻结版）
> 评审基线：
> - `docs/MASTER_DATA_PHASE2_DESIGN.md` 母规划
> - `docs/MASTER_DATA_W4_REVIEW.md` §2.2 SITE 子类化冲突
> - `docs/WAVE1_ACCEPTANCE_REVIEW.md` §8.2 C-3 (M3 / 组织模型 前置)
>
> 本评审不修改代码、不动 migration、不动业务流程；只判 M1 是否可作为"所有
> 后续 wave 的强制参考基线"——按用户给出的 5 个维度。

---

## 0. 结论速读

| 维度 | 评级 | 说明 |
|---|---|---|
| 1. 双重身份对象 | 🟡 | 3 处"主表 + sidecar / 占位"模式（STORE / PROJECT / WAREHOUSE）已明确主权方向，但同步 / 退役机制需 M3/M5 子文档具体化 |
| 2. 循环引用 | 🟡 | 树拓扑设计无环；**但 `sys_organizations.parent_id` 自引用（尤其 DEPARTMENT 嵌套）未约束最大深度 / 环检测** |
| 3. 权限边界冲突 | 🟠 | BU 不在 scope 维度内 + scope 多源（5 层）合并算法仍未定义 + DEPT→SITE→COMPANY scope 继承语义不清 |
| 4. 财务主体冲突 | 🟡 | COMPANY 作为唯一财务主体清晰；**但 `biz_projects.company_code` 是否可变 + shr_company_equity 未来形态未提** |
| 5. 未来扩展 | ✅ | 5 年时间轴完整；多租户 / 子公司多级化 / GDPR 等关键扩展都已"预留 + 扩展评审"机制；3 处小缺口（见 §5） |
| **总决议** | **🟢 PASS WITH CONDITIONS** | 条件见 §6 |

---

## 1. 是否存在双重身份对象

### 1.1 已发现的"主表 + sidecar / 占位"模式

| 实体 | 主 canonical | 副表 | 文档定位 | 风险 |
|---|---|---|---|---|
| **STORE** | `sys_organizations(SITE, site_business_type=STORE)` （§7.2） | `mst_stores` "运营档案 sidecar"，1:1 挂在 SITE 上 | 主身份在 SITE；mst_stores 仅存运营字段（店长 / 联系 / 经营类型） | 🟡 **status 同步未上线**：§7.5 写 "强制同步（W5+ service 或 trigger 保证）"——但 W4 / W5 之间存在窗口；若 mst_stores.status 与 SITE.status 不一致，POS / 日结路径会拿到错位状态 |
| **PROJECT** | `biz_projects` | `sys_organizations(org_type='PROJECT')` "少数历史行，可保留也可在 M3 拆出" | §4.2 "主权以 biz_projects 为准" | 🟡 **org-tree PROJECT 行去留未决**：文档未承诺一定退役，"可保留"意味着永久双轨；未来新建 PROJECT 时是否要顺带建 sys_organizations(PROJECT) 占位行？ |
| **WAREHOUSE** | `wms_warehouses` | `sys_organizations(org_type='WAREHOUSE')` "仅作为历史兼容；M3 子文档评估是否退役" | §6.2 canonical = wms_warehouses | 🟡 同上，退役与否未明 |
| **SHAREHOLDER × USER** | `shr_shareholders` + `sys_user` | `shr_shareholders.linked_user_id` 可选 FK | §11.4 自然人股东可绑登录账号；可空 | ✅ 单向 FK，不构成双重身份 |
| **PROJECT/SITE 关系** | `biz_site_projects` 桥表 | `biz_projects.site_code` 单 site 快捷字段 | §5.5 "桥表 is_primary=true 那一行权威，biz_projects.site_code 是冗余冷字段" | ✅ 主权清晰；service 只读冷字段不写 |

### 1.2 W4 seed 与本文件 §5.1 决议的冲突

W4 已落 `sys_organization_type_rules` 9 行 seed（含 STORE / FACTORY / WAREHOUSE 三个独立 org_type）；本文件 §0.2 决议把 org_type 收敛为 6 类，STORE/FACTORY/WAREHOUSE 改为 `site_business_type` 子类。

**含义**：
- W4 seed 三行是"过渡态"
- M3 子文档负责给"合并到 SITE 单行 + 加 sub-rules 表"的迁移路径
- 在 M3 落地前，sys_organization_type_rules 上 STORE/FACTORY/WAREHOUSE 与 SITE 并存——但 service 层尚未消费 type_rules（W4 仅建表），所以**无运行时影响**

**判定**：本身不是双重身份缺陷，但需 M3 子文档在 W5 期间收尾，否则 type_rules service 启用（W6+）时会触发歧义。

### 1.3 §1 结论

🟡 **3 处可接受的"主表 + sidecar / 占位"模式，2 处需 M3/M5 具体化**。

---

## 2. 是否存在循环引用

### 2.1 实体关系图分析（基于 §1.1 ER + §1.2 flowchart）

| 关系 | 方向 | 是否成环 |
|---|---|---|
| GROUP → COMPANY → SITE → DEPARTMENT | 树（单向 parent_id） | ✅ 无环 |
| GROUP → BU ↔ COMPANY / SITE（N:N via biz_bu_membership） | 横切，不在主树 | ✅ 无环 |
| COMPANY → PROJECT | 树 + canonical biz_projects | ✅ 无环 |
| PROJECT ↔ SITE（N:N via biz_site_projects） | 多对多，无 parent_id | ✅ 无环 |
| SITE → WAREHOUSE（via wms_warehouses.mapped_site_code） | 单向 | ✅ 无环 |
| WAREHOUSE → ZONE → LOCATION | 树 | ✅ 无环 |
| USER ↔ ORG（sys_user_orgs N:N） | 多对多 | ✅ 不构成循环 |
| USER ↔ ROLE（sys_user_role N:N） | 多对多 | ✅ |
| SHAREHOLDER → USER（linked_user_id） | 单向可空 FK | ✅ |
| SHAREHOLDER → PROJECT / COMPANY（via shr_*） | 单向 | ✅ |

### 2.2 ⚠ DEPARTMENT 自引用 — 未约束的环检测点

**问题**：§8.2 明确："`parent_id` → `COMPANY` 或 `SITE`；子节点允许：嵌套 `DEPARTMENT`（多层部门：财务部 → 应收应付组 → 应收主管）"

`sys_organizations.parent_id` 是 self-ref FK。一个嵌套 DEPARTMENT 的 parent_id 又指向 DEPARTMENT。若误操作：

```
DEPT-A.parent_id = DEPT-B
DEPT-B.parent_id = DEPT-A
```

**这就形成环**。当前文档**未列**以下任一保护：
- 最大嵌套深度（如 ≤ 5 层）
- 应用层环检测（不允许 ancestors 含 self）
- DB 层 CHECK CONSTRAINT
- 触发器拒绝插入会成环的 parent_id

**影响**：
- service 递归遍历 org 树（如 dataScope.resolve / org-tree.controller / BI 报表）可能死循环或栈溢出
- 性能：深度无限的部门树查询不可预测
- 数据修复成本高：环一旦形成，几乎只能在 DB 层手工修

**M1 文档级缓解**（不影响冻结）：建议在 §8.2 加一句"DEPARTMENT 嵌套深度 ≤ 5；service 必须做 ancestor 环检测"——具体实施在 W5+。

### 2.3 sys_organizations.parent_id 跨 org_type 的隐式可能

§3.2 / §5.3 / §8.2 / §10.x 等各节给出每种 org_type 允许的 parent / child 类型。如果完全按规则执行，跨类型的循环不会出现。但文档**未规定**这些规则在哪一层强制：

- W4 已建 `sys_organization_type_rules` 但 service 未消费（仅 seed）
- §2.3 / §15.4 提到 W5+ 软警告 → W6+ 硬校验

**判定**：当前 W4-W5 窗口下，sys_organizations.parent_id 仅靠"service 自觉"约束，没有 DB CHECK。**建议**：在 type_rules service 接入前，至少在 sys_organizations 建表 SQL 上加 trigger 防 "parent_id = id" 自环。

### 2.4 §2 结论

🟡 **拓扑无环；但 DEPARTMENT 自引用嵌套未约束最大深度 / 环检测，需在 §8.2 加一行约束 + W5+ service 落环检测**。

---

## 3. 是否存在权限边界冲突

### 3.1 已定义的 scope 维度（§3.3 母规划 + 本文件 §1.3 / §9.2 / §11.5）

| Scope 维度 | 表 | 输出字段 |
|---|---|---|
| company | sys_user_orgs (org=COMPANY) | `allowedCompanyCodes` |
| project | sys_user_project_scopes | `allowedProjectCodes` |
| site | sys_user_orgs (org=SITE) + sys_user_farm_scopes (W7+ 合并) | `allowedSiteCodes` |
| warehouse | sys_user_warehouse_scopes | `allowedWarehouseCodes` |
| shareholder | shr_shareholder_scope（独立，user 拍板 #4） | `allowedShareholderCodes` |

### 3.2 🔴 BU 不在 scope 维度内

§14.4 提到 "BU 经理（manager_user_id）权限：可看本 BU 下所有 company 的部分财务报表" 是未来能力。

**当前模型**：BU 横切 N 个 COMPANY，但 DataScope 没有 `allowedBuCodes`。BU 经理只能通过"显式枚举该 BU 下所有 company_code 写到 sys_user_orgs"绕开——脏数据：BU 新增成员公司时需要手动同步 BU 经理的 sys_user_orgs。

**风险**：
- BU 治理报表/驾驶舱按 BU 维度展示时，权限过滤无法对齐 BU 边界
- 未来 §14.4 落地时必然要回头改 DataScope 接口

**建议**：本文件可在 §9.2 scope 表清单加一行"`sys_user_bu_scopes`（远期，W7+ 评估）"；或在 §14.4 明确"BU 经理 scope 推导 = 该 BU 所有成员 company 的并集"。

### 3.3 🟠 多源 scope 的合并算法仍未定义

文档现状：
- `sys_user_orgs.data_scope_level`（隐式按 org 层级展开）
- `sys_user_*_scopes` 4 张（显式追加）
- `sys_data_scopes`（角色 × 模块 × scope_type，默认规则）
- `shr_shareholder_scope`（股东视角，单独，user 拍板 #4）

W4_REVIEW §3.3-b 已指出多源 scope 合并算法（先 union？显式优先？默认规则覆盖？）**未在任何文档落定**。本 M1 §15.4 W7 把"sys_user_scopes 合表"列为后续 wave，但**没有给算法**。

**风险**：W7 启动前所有触 scope 解析的业务 service 实际上各自实现自己的"我以为的"算法。已经出现过 finance-v2 的 `scopeAll/companyCodes` 自定义命名错位（FINANCE_AUDIT §5.2）。

**建议**：M1 §11.5 末尾应加一节"DataScope 合并算法承诺（W7 实施）"，明确：
```
1. sys_data_scopes 提供角色默认 scope_type (SELF/PROJECT/COMPANY/REGION/GROUP)
2. data_scope_level 在 user×org 行上覆盖默认值（取宽）
3. sys_user_*_scopes 是"显式追加"（取并集）
4. shr_shareholder_scope 独立计算 allowedShareholderCodes
5. ROLE_ADMIN '*' 跳过全部，全权
```

### 3.4 🟠 DEPT → SITE → COMPANY scope 继承语义未定

§9.4 列了 user ↔ company / site / department 三类绑定，但**没有**说明：
- 用户只绑 DEPT-LAO-MS-OPS（挂在 SITE-MENGSAI-LAYER 下）→ 是否自动获得 SITE-MENGSAI-LAYER 的 site scope？
- 用户只绑 SITE-MENGSAI-LAYER → 是否自动获得 COMP-LAO-AGRI 的 company scope？

**两种可能语义**：
- (A) 隐式继承：绑底层即获得所有祖先 scope（业务直觉，但难审计）
- (B) 严格只看显式绑定：未绑 COMPANY 即无 company scope（合规友好，但运营麻烦）

**风险**：service 各自选一种实现 → 同一用户在不同模块看到不同范围。

**建议**：本文件 §9 加一节"scope 继承策略"，二选一并冻结。Audit 倾向 (B) 严格语义 + 配套 UI 引导（绑 dept 时自动复选 site/company）。

### 3.5 §3 结论

🟠 **3 处权限边界缺口**：BU 无 scope 维度 / 多源合并算法未定 / DEPT 继承语义未定。**M1 必须补这 3 处，否则 W7 合并 sys_user_scopes 时无可参照**。

---

## 4. 是否存在财务主体冲突

### 4.1 已明确的财务主体

| 实体 | 财务角色 | 强约束 |
|---|---|---|
| COMPANY | 法人主体 = 唯一财务隔离维度 | AP/AR/Cash/Bank NOT NULL company_code（§3.4） |
| PROJECT | 成本归集 / 利润归集 | 可空（§3.4 ⚠️ "项目维度允许跨/不挂"） |
| SHAREHOLDER | 资本流 / 股权（属经营层） | 独立维度 |
| SITE / DEPARTMENT | 非财务维度 | 仅作分析切片 |

**判定**：COMPANY 作为唯一财务主体清晰；与 Finance F2 项目维度过滤（PHASE2_DESIGN §3.1）一致。

### 4.2 🟡 biz_projects.company_code 的可变性未声明

§4.5 项目状态机 `DRAFT → PENDING_APPROVAL → ACTIVE → FROZEN/ARCHIVED`，但**未声明** company_code 是否可变。

**潜在问题**：
- 历史 ACTIVE 项目改 company_code → 所有该项目的 AP/AR/Cash 流水隐式跨越法人；财务报表完整性破坏
- 业务真实场景：业务重组（如"孟赛蛋鸡场"从 COMP-LAO-AGRI 转 COMP-LAO-XINGCHI）

**建议**：本文件 §4 加一节"company_code 不可变"，并说明业务重组的标准做法（旧项目 ARCHIVED + 新建项目 + 历史流水保持原 company_code）。

### 4.3 🟡 shr_capital_contributions 跨期 / 跨主体的 financial entity 取向

§11.2 列了 `shr_capital_contributions(shareholder_code, project_code, ...)` —— 通过 biz_projects.company_code 隐式确定法人。

**风险**：
- 若同一 project 跨多个 COMPANY（理论上 §4.2 biz_projects.company_code NOT NULL 排除了这种情况，但 §5.5 "一个 PROJECT 可覆盖多个 SITE" 跨多公司的 SITE 时是否冲突？）
- 母规划 §5.3 提到 biz_projects 扩 `is_shareholder_managed` 等字段，未涉及多法人

**建议**：明确 PROJECT 必属唯一 COMPANY（biz_projects.company_code 单一）；跨公司经营走"多个 project + BU 横切汇总"。本文件 §4.2 隐含但未明文。

### 4.4 🟡 fin_shareholder_* vs shr_capital_* 双财务主体表

不在 M1 直接讨论，但 FINANCE_AUDIT §3.5 已指出：
- 财务侧 `fin_shareholder_contributions / settlements`（含现金账户 + 流水联动）
- 股东侧 `shr_capital_contributions`（资本流，仅状态机不动现金）
- 两表通过 finance_bridge_status 软关联，无强制单向

M1 §11.2 列出 shr_capital_contributions 但未明确与 fin_shareholder_* 的主权关系。

**建议**：在 §11 加一句"shr_capital_contributions 与 fin_shareholder_contributions 主权关系由 F6 bridge plan 决定；M1 范围内两者并存"。

### 4.5 跨境多公司财务隔离（§14.2 / §14.3）

§14.2 跨境扩张 + §14.3 子公司多级化：
- 跨境新建 `COMP-{NEW_COUNTRY}-{BUSINESS}`，仍在 GROUP 下挂 —— 单层
- 多级子公司是未来扩展，引入 `org_type='SUBSIDIARY'` —— **当前模型禁止**

**判定**：现在禁止 COMPANY 嵌套 COMPANY 是清晰的财务主体边界；未来扩展走扩展评审。✅

### 4.6 §4 结论

🟡 **COMPANY 财务主体清晰**；**但 3 处需在本文件明文**：biz_projects.company_code 不可变 / PROJECT 必属唯一 COMPANY / shr ↔ fin 主权后置。

---

## 5. 未来扩展问题

### 5.1 §14 覆盖度评估

| 扩展主题 | 文档章节 | 评估 |
|---|---|---|
| 2027 跨境扩张 | §14.2 | ✅ COMP-{COUNTRY}-{BUSINESS} 命名规则前瞻 |
| 2027-2028 子公司多级化 | §14.3 | ✅ 预留 SUBSIDIARY org_type；parent_company_code 思路 |
| 2027 BU 横切矩阵 | §14.4 | 🟡 提到 manager_user_id 权限但未对接 scope 维度（见 §3.2） |
| 2028 多租户 SaaS | §14.5 | ✅ 完整 tenant_id 方案 + 标为重大架构演进 |
| 2027+ 数据湖 / BI 现代化 | §14.6 + §13.4 | 🟡 冷数据迁移机制只到"未来规划"，触发条件模糊 |
| 2029 IoT 全量接入 | §14.7 | ✅ 加 iot_devices 表，不动主模型 |
| 2030 GDPR / 被遗忘权 | §14.8 | ✅ 明确这是"永禁物理删除"的唯一例外 + 必走扩展评审 |
| 扩展评审流程 | §15.2 | ✅ 提案文档 → 双签 → 用户拍板 → tag |

### 5.2 ⚠ 缺口 1：site_business_type 的"半正式"子类

§5.2 7 类子类（FARM/BROILER/HATCHERY/FACTORY/WAREHOUSE/STORE/OFFICE）冻结。

**潜在缺口**：
- 实验室（lab）— 跨境扩张可能涉及兽医实验室
- 诊所（clinic）— 鸡群健康中心
- 综合店仓（warehouse-store-combo）— 一个地点同时 STORE + WAREHOUSE

文档 §5.2 给"新增子类走扩展评审"——制度齐备，**但未给"如何处理一个 site 多个业务类型"**：site_business_type 是单字段、单值。综合店仓只能选一个或拆两个 SITE。

**建议**：§5.2 末尾加一行"如一个物理地点同时承担 N 个业务类型（如店仓合一），必须拆为 N 个 site_code 各自单业务类型"。

### 5.3 ⚠ 缺口 2：shr_company_equity 未提

§11.2 仅列 `shr_project_equity`（股东 ↔ 项目级股权）。

**真实业务**：股东可能直接持有公司股份（"刘杰持有 COMP-LAO-AGRI 5%"），而不通过项目穿透。

**当前规避**：每个项目按公司穿透计算？文档未说。

**建议**：§11 加一行"如未来需公司级股权（非项目级），扩展 shr_company_equity，走扩展评审"。

### 5.4 ⚠ 缺口 3：冷数据迁移触发条件

§13.4 写 "ARCHIVED > 5 年 → 物理迁移到 `*_archive` 表 + 主表只留 stub" —— 但**未定义**：
- 谁触发？scheduler 还是手工？
- *_archive 表与主表的关系（视图 union？还是只读副本？）
- archive 后查询路径

**建议**：§13.4 改为 "未来 wave 出独立 `M-冷数据治理` 子文档"——明确把这个 punt 到具体子文档。

### 5.5 ✅ 扩展评审流程齐备

§15.2 + §15.7 + §16 形成完整闭环：用户拍板 → 评审 → 合入本文件 → tag。已经能覆盖 §14 所有扩展主题。

### 5.6 §5 结论

✅ **5 年扩展时间轴完整**；3 个小缺口（综合业务 site / 公司级股权 / 冷数据触发）建议在本文件补一行说明或 punt 到独立子文档。

---

## 6. 决议

### 6.1 总评：🟢 PASS WITH CONDITIONS

**通过理由**：
1. 10 类实体语义清晰，主权方向 / 编码规则 / 删除归档策略一锅煮完。
2. 解决 W4_REVIEW §2.2 的 SITE 子类化冲突，决议方向（org_type 收敛 6 类 + site_business_type 子类）与母规划 §1.1 一致。
3. user 拍板 4 条全部入模，无歧义。
4. 未来 5 年扩展时间轴 + 扩展评审制度齐备。
5. 与 PROJECT_COMMAND_CENTER §5（高风险变更先文档）+ CLAUDE.md（迁移红线）+ MULTI_AGENT_PHASE2_PLAN §4 冻结清单完全一致。

### 6.2 必须满足的条件（合入前 OR W5 启动前）

| # | 条件 | 责任方 | 截止 |
|---|---|---|---|
| C-1 | §8.2 DEPARTMENT 嵌套加"最大深度 ≤ 5 + service 必须做 ancestor 环检测"约束 | Architect | 本文件下次修订（W5 内） |
| C-2 | §11.5 末尾增"DataScope 合并算法承诺"（sys_data_scopes / data_scope_level / sys_user_*_scopes / shr_shareholder_scope 4 源 union 策略） | Architect | W7 sys_user_scopes 合表方案出之前 |
| C-3 | §9 新增"scope 继承策略"（user 绑 DEPT 是否隐式继承 SITE / COMPANY scope）— Audit 建议严格只看显式绑定 | Architect | 同 C-2 |
| C-4 | §4 加"biz_projects.company_code 不可变（ARCHIVE 旧项目 + 新建是业务重组标准做法）" | Architect | W5 biz_projects 扩列前 |
| C-5 | §3.2 / §4.2 明文 "PROJECT 必属唯一 COMPANY；跨公司经营走多 project + BU 横切汇总" | Architect | 同 C-4 |
| C-6 | §7 加"mst_stores.status 与 SITE.status 同步机制（trigger 或 service 单点写）"的实现责任 | Architect → ERP | W5 内 |
| C-7 | §4.2 / §6.2 明确 sys_organizations(org_type='PROJECT'/'WAREHOUSE') 占位行去留 — 推荐 M3 子文档给"清理或永久保留"二选一 | Architect | M3 子文档定稿前 |

### 6.3 建议（不阻塞，但应纳入本文件下次修订）

| # | 建议 | 价值 |
|---|---|---|
| S-1 | §3.2 BU 维度补"`sys_user_bu_scopes`（远期）"或在 §14.4 明确 BU 经理 scope 推导算法 | 杜绝未来 BU 报表权限失配 |
| S-2 | §5.2 加"一个物理地点同时承担 N 业务类型时必须拆为 N 个 site_code" | 解决店仓合一类边界 |
| S-3 | §11 加"未来如需公司级股权，扩展 shr_company_equity，走扩展评审" | 预留股权穿透扩展点 |
| S-4 | §13.4 改为 "未来出独立 `M-冷数据治理` 子文档"，避免在本文件留模糊状态 | 减少未来扩展评审摩擦 |
| S-5 | §11.4 提到 linked_user_id 可空 — 建议补一句 "linked_user_id 一旦绑定不可变；股东更换登录账号必须 ARCHIVE 旧 + 新建" | 避免审计链断 |

### 6.4 与上游文档对账

| 文档 | 一致性 |
|---|---|
| MASTER_DATA_PHASE2_DESIGN.md | ✅ M1 是 §1（统一模型）的冻结升级，覆盖更细 |
| MASTER_DATA_PHASE2_REVIEW.md §1.2 / §3.3-a | ✅ §11.5 解决了 shareholder scope 语义 |
| MASTER_DATA_W4_REVIEW.md §2.2 | ✅ 本文件 §5.1 决议 SITE 子类化口径 |
| WAVE1_ACCEPTANCE_REVIEW.md §8.2 C-3 | ✅ M1 给 M3 子文档充分语义基础；但 C-3 还要求 M3 单独定稿，本文件不替代 M3 |
| MULTI_AGENT_PHASE2_PLAN.md §4 冻结清单 | ✅ M1 未触任何 W1-W3 冻结实体 schema |

### 6.5 对 W5 / 后续 wave 的引用承诺核验

| Wave | 引用章节 | 评估 |
|---|---|---|
| M2 project consolidation | §4 + §5.5 + §11 | ✅ 充分 |
| M3 SITE 子类化迁移 | §5 + §6 + §7 | ✅ 充分（但需 C-7 闭环） |
| M5 master 模块退役 | §7 + §15.3 | ✅ |
| W5 biz_projects 扩列 | §4.2 + §5.5 + §11.2 | ✅（需 C-4 / C-5 闭环） |
| W6 inv_batches 改造 | §6.4 | ✅ 维度对照保留 warehouse_code 不变 |
| W7 sys_user_scopes 合表 | §9.2 + §11.5 | 🟡 需 C-2 / C-3 闭环才能动 |
| W8 workflow.byProjectManager 切表 | §4.1 | ✅ |

### 6.6 监测项（Audit 后续每 wave 跑）

```bash
# 主数据漂移监测（每 wave 后 diff，确认未在 M1 冻结范围外引入新 canonical）
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w$N.json
diff /tmp/mdr-w$(($N-1)).json /tmp/mdr-w$N.json

# entity ↔ DB 漂移基线
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt

# nullable-in-unique
node scripts/check-nullable-in-unique.js

# 自引用环检测（C-1 落地后）
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
```

---

**评审完毕。M1 组织模型可作为 W5+ 强制参考基线，前提是 C-1 ~ C-7 在
W5 启动前合入本文件。建议 S-1 ~ S-5 一并纳入下次修订，减少未来扩展摩擦。**
