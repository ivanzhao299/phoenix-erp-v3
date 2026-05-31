# Phoenix ERP V3 — 角色与组织运行体系联合审计报告

> **审计基准日：** 2026-05-31  
> **审计范围：** 28 个核心角色 × 6 维度（菜单 / API / 审批 / 组织层级 / DataScope / 综合可运行性）  
> **审计性质：** Phase A（权限修复）/ Phase B（DataScope 绑定）执行后的复审  
> **审计方式：** 6 个 AI agent 并行代码扫描 + 人工代码级验证

---

## 0. 三大关键发现（已人工代码级验证）

本次审计最重要的产出是发现了之前 Phase A/B 修复中的**三个隐藏缺陷**。以下结论均经过直接代码核实，非推测：

### ✅ 验证一：审批权限「修错了位置」（已确认）

**Phase A 把审批权限加到了 `MENU_APPROVAL`，但全后端零 controller 使用该菜单码。**

代码核实：
```
$ grep -rn "RequireMenu.*'MENU_APPROVAL'" apps/api/src/
（返回空 — MENU_APPROVAL 没有任何 controller 引用）

$ grep "RequireMenu.*'MENU_WORKFLOW', 'A'" workflow-task.controller.ts
L48: @RequireMenu('MENU_WORKFLOW', 'A')   // approve 端点
L54: @RequireMenu('MENU_WORKFLOW', 'A')   // reject 端点
```

**真正的审批门是 `MENU_WORKFLOW` 的 `'A'` 权限。** 当前 MENU_WORKFLOW 只有 9 个角色有 'A'：
ADMIN / WORKFLOW_ADMIN / CEO / FIN_CFO / PRC_BUYER / REGION_MGR / PROJECT_MGR / SALES_MGR / HQ_FINANCE。

**结论：** Phase A 补的 VET / FIN_ACCT / QA_MGR / WMS_MGR / STORE_MGR / LOG_MGR / FARM_MGR 等审批人，审批链仍然断裂（approve/reject 会被拒）。

### ✅ 验证二：Phase B 因 CHECK 约束冲突未落库（已确认，致命）

**`sys_user_orgs.data_scope_level` 的 CHECK 约束只允许 5 个值，但 Phase B 写入了 'SITE'。**

代码核实：
```
20260530_create_missing_sys_tables.sql L93:
  CHECK (data_scope_level IN ('SELF','PROJECT','COMPANY','REGION','GROUP'))

20260531_user_org_bindings.sql 写入的值包含：
  'COMPANY' 'GROUP' 'REGION' 'SITE'  ← 'SITE' 不在 CHECK 允许范围内
```

**结论：** 司机 ajian、linhong、liushanjun 的绑定使用 `data_scope_level='SITE'`，
INSERT 时触发 CHECK 约束违规。由于整个绑定逻辑包在单个 `DO $$ ... END $$` 块中，
**约束违规导致整块回滚，13 个用户绑定全部失败。**

**直接后果：**
- 司机 ajian 的 store_code 仍为 'ALL' → DataScope isGlobal=true → **全局数据超权未修复（安全红线）**
- 所有用户仍走 storeCode 兜底，精确 DataScope 未激活

### ⚠️ 验证三：审计的一处误判（已修正）

审计 agent 称 "zhaoyongwei 用户不存在"，**此结论错误**。
实际 zhaoyongwei 存在于 `apps/api/ddl/14_create_admin_user.sql`（赵永伟，ROLE_ADMIN）。
此误判不影响其余结论。

---


## 2. 六层矩阵（核心交付物）

| 角色 | 中文名 | ①菜单 | ②API | ③审批 | ④组织层级 | ⑤DataScope | ⑥可运行性 | 综合评级 |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| ROLE_ADMIN | 超级管理员 | Y | Y | Y | Y | Y | Y | **Y** |
| ROLE_CEO | 集团总裁 | Y | Y | Y | Y(定义)/P(实测) | P | Y | **P** |
| ROLE_FIN_CFO | 首席财务官 | Y | Y | Y | P(缺人) | P | — | **P** |
| ROLE_FIN_ACCT | 财务会计 | Y | Y | **N** | Y/N(实测全局) | N | P | **N** |
| ROLE_FIN_AR | 应收会计 | P | P | N(预期) | P(缺人) | N | — | **P** |
| ROLE_FIN_COST | 成本会计 | P | P | N(预期) | Y/N(实测全局) | N | — | **P** |
| ROLE_HQ_FINANCE | 总部财务 | — | Y | Y | P(缺人/冗余) | N(空角色) | — | **P** |
| ROLE_QA_MGR | 品控总监 | P | Y | **N** | P(缺人) | N | Y | **P** |
| ROLE_QA_STAFF | 质检专员 | P | P | N(预期) | P(缺人) | N | **N** | **N** |
| ROLE_PKG_MGR | 包装主管 | P | Y | N(预期) | P(缺人) | N | — | **P** |
| ROLE_PKG_OP | 包装工人 | P | P | N(预期) | P(缺人) | N | **N** | **N** |
| ROLE_WMS_MGR | 仓储经理 | P(旧码) | Y | **N** | Y/P(实测) | P | — | **P** |
| ROLE_WMS_OP | 仓管货员 | P(旧码) | — | N(预期) | N | N | **N** | **N** |
| ROLE_LOG_MGR | 物流调度 | P | Y | **N** | N(实测全局) | N | — | **P** |
| ROLE_DRIVER | 司机 | P | P | N(预期) | Y(定义)/**N**(实测超权) | N | Y | **P** |
| ROLE_PDA_OP | PDA作业 | **N** | — | N | N | N | — | **N** |
| ROLE_CASHIER | 收银员 | P | P | N(预期) | P(实测兜底) | P | Y | **P** |
| ROLE_STORE_MGR | 店长 | P | Y | **N** | Y/P(实测) | P | — | **P** |
| ROLE_B2B_MGR | B2B总监 | P | P | N(悬空) | — | N(实测全局) | — | **P** |
| ROLE_SALES_REP | 业务员 | Y | Y | N(预期) | P(缺正式人) | N(实测全局) | Y | **P** |
| ROLE_SALES_MGR | 销售经理 | Y | Y | Y | P(缺人) | N(实测全局) | — | **P** |
| ROLE_PRC_BUYER | 采购专员 | P | Y | Y | Y | P | — | **Y** |
| ROLE_FARM_MGR | 养殖场长 | Y/P(实测) | Y | **N** | Y | N(实测) | — | **P** |
| ROLE_VET | 兽医 | P | Y | **N** | P(缺人) | P | — | **P** |
| ROLE_FARMER | 饲养员 | P | Y | N(预期) | Y | N(实测) | — | **P** |
| ROLE_BU_AGRI_GM | 农业事业群总经理 | Y | P | P(无效) | P(缺人) | N | — | **P** |
| ROLE_BU_FOOD_GM | 食品事业群总经理 | Y | P | P(无效) | P(缺人) | N | — | **P** |
| ROLE_FACTORY_MGR | 场区经理 | Y | Y | P(无效) | P(缺人) | N | P | **P** |
| ROLE_HR_MANAGER | 人力资源经理 | P | — | N(预期) | P(缺人) | N | — | **P** |

> 图例：Y=通过/可运行 ｜ P=部分受限 ｜ N=断裂/不可运行 ｜ —=该维度未单独审计或不适用。
> 综合评级取「短板优先」原则：任一核心维度为 N（且非"预期内 N"）则综合判 N；存在受限则判 P；全维度 Y 才判 Y。
> 「N(预期)」指该角色按设计本就不应拥有该能力（如司机不需审批），不构成缺陷，不拉低综合评级。

---

## 3. 角色运行分类

### A — 完全可运行（全链路走通，无阻断缺陷）
- **ROLE_ADMIN**：唯一全维度 Y。硬绕过 + 全权矩阵 + L74 硬编码全局 DataScope。
- **ROLE_PRC_BUYER**：菜单/API/审批/组织全通（审批链第2步本就含 'A'，Phase A 修复审批权限矛盾，DataScope 为 COMPANY 绑定意图正确）。

> 严格 Pilot Run 实测中另有 4 个角色全链路走通（DRIVER/CASHIER/QA_MGR/SALES_REP），但因 DataScope 越权或审批断裂，综合评级仍为 P。

### B — 菜单缺失
- **ROLE_PDA_OP（N）**：仅持 MENU_WMS_INOUT/QA_OP/LOGISTICS（均非顶级锁或废弃旧码），无任何一级菜单，Sidebar 空白。Phase A 未覆盖。需补 DASHBOARD + WMS_VIEW + FARM_DATA。
- **ROLE_WMS_MGR / ROLE_WMS_OP（P/旧码）**：持旧码 MENU_APPROVAL/WMS_OP，缺 MENU_DASHBOARD（无工作台/经营分析）与 MENU_WORKFLOW（无审批中心）。Phase A 未覆盖这两个角色。

### C — API 缺失（运行时实际校验码与 Phase A 修复码不对齐）
- **ROLE_WMS_OP（N）**：`rbac.matrix.ts` 出现 0 次、迁移无记录、login ROLE_HOME 缺失。Sidebar 全空白、无首页。
- **ROLE_PKG_OP（N）**：终端控制器校验 MENU_PACKAGING/MENU_PKG_MGR，Phase A 只补了 MENU_PKG_OP，作业台读写全 403。
- **ROLE_QA_STAFF（N）**：质检页走 generic-crud，`crud.constants.ts` 的 qa_* 表白名单不含该角色，进页即 403。
- **ROLE_B2B_MGR（P）**：可见销售一级菜单，但 sales-v2 各子 controller 矩阵未列该角色，子模块 API 403。

### D — 审批缺失（Phase A「修错位置」，真正校验码 MENU_WORKFLOW 仍无 'A'）
- **ROLE_FIN_ACCT（N）**：费用/库存/物流链财务步审批人，MENU_WORKFLOW 仅 ['V','X']。
- **ROLE_VET（N）**：用药链第1步 vet_review，MENU_WORKFLOW 未注册该角色。
- **ROLE_FARM_MGR（N）**：用药链第2步 farm_review，MENU_WORKFLOW 仅 ['V']。
- **ROLE_WMS_MGR（N）**：库存调整链第1步，MENU_WORKFLOW 未注册。
- **ROLE_QA_MGR（N）**：质量异常链第1步，MENU_WORKFLOW 未注册。
- **ROLE_STORE_MGR（N）**：门店折扣链第1步，MENU_WORKFLOW 仅 ['V']。
- **ROLE_LOG_MGR（N）**：物流异常链第1步，MENU_WORKFLOW 未注册。
- **ROLE_SYSOPS（P）**：多链审批人，MENU_WORKFLOW 未注册，仅靠 ADMIN_ROLES 旁路部分动作可走，approve/reject 任务有断裂风险。
- **ROLE_BU_AGRI_GM / ROLE_BU_FOOD_GM / ROLE_FACTORY_MGR（P）**：MENU_APPROVAL 给 'A'（无效码），MENU_WORKFLOW 未注册，工作流审批断裂（场区级可靠业务内审 MENU_PKG_MGR/QA_OP 的 'A'）。

### E — 组织缺失（角色定义清晰但无真实用户绑定，或绑定层级错配）
- **缺人（P）**：BU_AGRI_GM、BU_FOOD_GM、FACTORY_MGR、FIN_CFO、FIN_AR、HR_MANAGER、HQ_FINANCE、QA_MGR、QA_STAFF、PKG_MGR、PKG_OP、VET、WH_CLERK、SALES_MGR、LOG_MGR 等。
- **错配**：zhuhuiran/yue 实为事业群负责人却赋 ROLE_REGION_MGR，专属 ROLE_BU_AGRI_GM/ROLE_BU_FOOD_GM 反而无人使用。
- **无落地节点**：ROLE_PROJECT_MGR 对应 org_type=PROJECT，组织树未实例化任何 PROJECT 节点。

### F — DataScope 缺失（Phase B 未落库，全部走 storeCode 兜底）
- **司机超权未修复（N，最严重）**：ajian.store_code 仍为 'ALL' → isGlobal=true 全局可见所有公司数据。
- **store_code='ALL' 越权（N）**：FIN_ACCT/FIN_COST/LOG_MGR/SALES_MGR/SALES_REP/SHAREHOLDER_VIEW/AUDITOR/B2B 及大量 test_* 角色全部返回集团全局，绕过 COMPANY/PROJECT/SELF 规则。其中 **ROLE_SHAREHOLDER_VIEW（应 SELF 却获 GROUP）、ROLE_CUSTOMER_B2B（外部客户全局可见）** 风险最高。
- **兜底码不匹配（P）**：amei/linhong/liushanjun/factory_acct/mengsai_buyer 的 store_code 为门店/场区码，与真实 company_code（PHX_AGRI_LA）类型不匹配，反而查不到数据。

### G — 无效/冗余角色（需去重或清理）
- **近义重复**：HQ_FINANCE↔GROUP_FINANCE、PKG_OP↔PKG_OPERATOR、QA_STAFF↔QC_INSPECTOR、FACTORY_ACCT↔FACTORY_ACCOUNTANT、HR_MANAGER↔HR_ADMIN。
- **试点遗留**：PILOT_MANAGER、PDA_OP、LINE_SUPERVISOR、QC_INSPECTOR、PKG_OPERATOR 未在 phase_a 主体系归位。
- **孤立菜单**：MENU_FIN2_BUDGET 在矩阵注册但无任何 controller 使用（无访问影响）。

---

## 4. 组织层级矩阵

| 角色 | 应归属层级 | 实际绑定 / 状态 | 判定 |
|---|---|---|:--:|
| ROLE_CEO | GROUP | 声明 zhuzhaocun→ORG-GROUP/GROUP；**实测仅绑 PHX_AGRI_LA(COMPANY)，错误降权** | P |
| ROLE_ADMIN | GROUP | L74 硬编码全局，不依赖绑定 | Y |
| ROLE_BU_AGRI_GM | BU-AGRI(approval_lv=4) | 角色已定义，**无人绑定**；实际由 zhuhuiran 误用 REGION_MGR 承担 | P |
| ROLE_BU_FOOD_GM | BU-FOOD(approval_lv=4) | 角色已定义，**无人绑定**；实际由 yue 误用 REGION_MGR 承担 | P |
| ROLE_FACTORY_MGR | SITE(approval_lv=3) | 角色已定义，无人绑定 | P |
| ROLE_REGION_MGR | BU / COMPANY | fuqiang→COMPANY、zhuhuiran→BU-AGRI、yue→BU-FOOD（**三人层级不统一+事业群错配**） | P |
| ROLE_FARM_MGR | SITE | 声明 linhong→SITE-MENGSAI-LAYER（**'SITE' 不在原 CHECK 约束内**）；实测无绑定 | Y/N |
| ROLE_DRIVER | SITE | 声明 ajian→SITE-VTE-SLAUGHTER（安全收敛）；**实测仍 store_code='ALL'，未落库** | Y/N |
| ROLE_WMS_MGR | SITE / COMPANY | 声明 liushanjun 双绑 SITE+COMPANY；实测未落库 | Y/P |
| ROLE_FARMER | SITE | 声明 liushanjun 兼任落 SITE；实测未落库 | Y/N |
| ROLE_STORE_MGR | STORE / COMPANY | 声明 amei→COMP-LAO-FOOD(COMPANY)，STORE 以 COMPANY 兜底 | Y/P |
| ROLE_CASHIER | STORE / COMPANY | 声明 amei 兼任绑 COMPANY | Y/P |
| ROLE_PRC_BUYER | COMPANY | 声明 wanglejin→COMP-LAO-AGRI(COMPANY)，层级正确 | Y |
| ROLE_FIN_ACCT | COMPANY / GROUP | 声明 wangweihua/zhuzhao_an→ORG-HQ(GROUP)；实测全局 | Y/N |
| ROLE_FIN_COST | COMPANY / GROUP | 声明 liuhantao→ORG-HQ(GROUP) | Y |
| ROLE_FIN_CFO | GROUP | 角色已定义，无人绑定 | P |
| ROLE_FIN_AR | COMPANY / GROUP | 角色已定义，无人绑定 | P |
| ROLE_HQ_FINANCE | GROUP | 无人绑定，与 GROUP_FINANCE 命名冗余 | P |
| ROLE_HR_MANAGER | GROUP / COMPANY | 角色已定义，无人绑定 | P |
| ROLE_SALES_MGR | COMPANY / BU | 角色已定义，无人绑定 | P |
| ROLE_SALES_REP | SITE / COMPANY | 仅测试用户 pilot_sales 持有，无正式人员 | P |
| ROLE_QA_MGR / QA_STAFF | SITE / DEPARTMENT | 组织树有 DEPT-*-QUALITY 可承载，无人绑定 | P |
| ROLE_PKG_MGR / PKG_OP | SITE / DEPARTMENT | DEPT-*-PROD 可承载，无人绑定 | P |
| ROLE_VET | SITE / DEPARTMENT | 角色已定义，无人绑定 | P |
| ROLE_LOG_MGR | SITE / COMPANY | 角色已定义，无人绑定 | P |
| ROLE_WH_CLERK | SITE / DEPARTMENT | DEPT-*-WAREHOUSE 可承载，无人绑定 | P |
| ROLE_AUDITOR | GROUP | 无人绑定 | P |
| ROLE_SHAREHOLDER_VIEW | GROUP | 无人绑定 | P |
| ROLE_SYSOPS | GROUP | 无人绑定 | P |
| ROLE_PROJECT_MGR | PROJECT | **组织树未实例化任何 PROJECT 节点**，归属无落地 | N |
| ROLE_GROUP_FINANCE / HR_ADMIN / FACTORY_ACCOUNTANT | 不明 | 仅 role_code，与近义角色重叠，建议去重 | N |

**4 类组织问题**：
1. **CHECK 约束冲突（严重）**：原 `data_scope_level` 约束仅允许 SELF/PROJECT/COMPANY/REGION/GROUP，但绑定写入了 'SITE'，且新 `role_scope` 列枚举（GROUP/BU/COMPANY/SITE/DEPARTMENT）与之不一致。
2. **事业群总经理错配**：zhuhuiran/yue 应改派 ROLE_BU_AGRI_GM / ROLE_BU_FOOD_GM。
3. **角色冗余**：5 对近义角色并存。
4. **层级无落地节点**：PROJECT_MGR / PILOT / PDA 等归属不明。

---

## 5. 五个覆盖率

> 统计口径：28 个核心角色为分母。「预期内 N」（角色本就不需该能力）计为「无需/达标」，不计入缺口。

| 维度 | 达标(Y/合理P) | 缺陷(实质N/P) | 覆盖率 | 说明 |
|---|:--:|:--:|:--:|---|
| **①菜单覆盖率** | 25 | 3（PDA_OP=N、WMS_MGR/WMS_OP 旧码缺 DASHBOARD/WORKFLOW） | **89.3%** | Phase A 后空白菜单基本消除，仅余旧码角色与未覆盖角色 |
| **②API 覆盖率** | 22 | 6（WMS_OP/PKG_OP/QA_STAFF=N，B2B_MGR/BU_*_GM 子模块受限） | **78.6%** | 主因 generic-crud / 终端控制器码不对齐 |
| **③审批覆盖率** | 8 / 19 需审批角色 | 11 审批人断裂（含 SYSOPS/BU_*） | **42.1%** | 「修错位置」缺陷，最薄弱维度 |
| **④组织覆盖率** | 13 已绑定（声明）/ 但 12 角色缺人 | 16+ 缺人或错配 | **46.4%** | 大量规划角色未落地到人 |
| **⑤DataScope 覆盖率** | 1（仅 ROLE_ADMIN 实测可靠） | 27 走兜底/越权 | **3.6%** | Phase B 完全未落库，最严重 |

> 审批覆盖率分母取「内置审批链指定的审批人角色 + 应具审批能力角色」约 19 个；达标 8 个（ADMIN/CEO/FIN_CFO/HQ_FINANCE/PRC_BUYER/SALES_MGR/REGION_MGR + ADMIN 旁路类），断裂 11 个。

---

## 6. Role Runtime Score（0–100）

### 加权方案
按各维度对「可运行性」的阻断权重赋权：

| 维度 | 覆盖率 | 权重 | 加权得分 |
|---|:--:|:--:|:--:|
| ①菜单 | 89.3% | 20% | 17.86 |
| ②API | 78.6% | 25% | 19.65 |
| ③审批 | 42.1% | 15% | 6.32 |
| ④组织 | 46.4% | 15% | 6.96 |
| ⑤DataScope | 3.6% | 25% | 0.90 |
| **合计** | — | 100% | **51.7** |

### **Role Runtime Score = 51.7 / 100（不及格，Pilot 阻断级）**

**计算依据**：菜单与 API 是「能否进入并操作」的入口门槛，赋较高权重（20%/25%）；DataScope 是「数据隔离与安全」的红线，赋最高权重之一（25%）——其 3.6% 的实测覆盖率（Phase B 未落库、司机超权未修复）将总分严重拖低。审批与组织各 15%。

**短板分析**：若仅看菜单+API（前端可见性与接口可达），加权约 37.5/45≈83%，体感「基本能用」；但叠加 DataScope（0.90/25）后断崖式下跌——**当前系统在「能点开页面」层面尚可，在「数据安全隔离」层面几乎完全失守。**

---

## 7. Pilot Run 风险评估

### 7.1 可完整运行（Y，4 个，前端链路实测走通）
- **ROLE_DRIVER**：登录→/sales2/delivery→签收全状态流转通。**但 DataScope 实测全局超权（数据安全红线）。**
- **ROLE_CASHIER**：登录→/store-pos→开班/建单/收款通，作废受限（合理）。
- **ROLE_QA_MGR**：登录→/quality→走 CRUD 读写质检/审批通（注：若走 quality.controller 则 MENU_QA 未含该角色；审批维度 MENU_WORKFLOW 断裂）。
- **ROLE_SALES_REP**：登录→/sales2/orders→建单/提交审批通。**DataScope 实测全局。**

### 7.2 可登录但部分受限（P，2 个）
- **ROLE_FIN_ACCT**：能记账/录 AR/AP，但收款确认需 'A'（MENU_FIN2_AR 无 A）→ 核销链需上级。叠加审批链断裂。
- **ROLE_FACTORY_MGR**：菜单丰富，但首页 /breeding 走 generic-crud 拉 brd_* 表，白名单不含该角色 → **养殖总览空白**；qa_* 同样受限。

### 7.3 无法运行（N，3 个，Pilot 必出问题）
- **ROLE_WMS_OP**：rbac.matrix + 迁移 + login ROLE_HOME 三处皆缺 → Sidebar 全空白、无首页、无导航。**彻底不可用。**
- **ROLE_PKG_OP**：终端控制器校验 MENU_PACKAGING/PKG_MGR，Phase A 只补 MENU_PKG_OP → 作业台连看板读都 403。
- **ROLE_QA_STAFF**：质检页走 generic-crud，qa_* 白名单不含该角色 → 进页即 403「无权访问 qa_inspections 表」。

### 7.4 根因模式
1. **权限源错配**：API 实际由 generic-crud（`crud.constants.ts` 表级白名单）或终端控制器（不同 MENU 码）把守，Phase A 改的菜单码非运行时实际校验码。
2. **完全遗漏**：ROLE_WMS_OP 三处皆缺。
3. **审批修错位置**：改 MENU_APPROVAL，实际校验 MENU_WORKFLOW。
4. **DataScope 未落库**：Phase B 迁移未执行，安全隔离失效。

---

## 8. 最终修复路线（后续 Phase C）

> Phase A / B 已执行（A 有效、B 未落库）。以下为**后续**修复，按收益与依赖排序。

### Phase C-1 — 安全红线（最高优先，阻断 Pilot）
1. **C-1.1 修复 sys_user_orgs 表结构**：补 `org_code` / `role_scope` 列；统一 `data_scope_level` 与 `role_scope` 枚举，将 CHECK 约束扩展为允许 'SITE'/'DEPARTMENT'/'BU'。（这是 B 一切落库的前置依赖）
2. **C-1.2 重建组织树**：实例化 ORG-GROUP / BU-AGRI / BU-FOOD / COMP-LAO-* / SITE-* / DEPARTMENT 节点（Phase B 声称的结构）。
3. **C-1.3 落库 Phase B 用户绑定**：按真实存在的 12 个用户名修正（zhaoyongwei 实际存在，见验证三），重新执行司机 ajian store_code → SITE-VTE-SLAUGHTER 收敛。
4. **C-1.4 收敛 store_code='ALL'**：消除 SHAREHOLDER_VIEW（应 SELF）、FIN_CFO（应 COMPANY）、PRC_BUYER（应 PROJECT）、外部 B2B 客户等的集团全局越权。

### Phase C-2 — API 可达性（阻断 Pilot 的 3 个 N 角色）
5. **C-2.1 ROLE_WMS_OP 全补**：rbac.matrix（MENU_WMS_VIEW/INOUT）+ DB 迁移 + login ROLE_HOME='/warehouse'。
6. **C-2.2 ROLE_PKG_OP**：在 MENU_PACKAGING 与 MENU_PKG_MGR 矩阵补该角色（至少读+录入档）。
7. **C-2.3 ROLE_QA_STAFF**：在 `crud.constants.ts` 的 qa_inspections / qa_product_inspections / qa_non_conformance 白名单补该角色。
8. **C-2.4 ROLE_FACTORY_MGR**：在 brd_* / qa_* CRUD 白名单补该角色，或将首页改到包装作业台。

### Phase C-3 — 审批链修正（「修错位置」缺陷）
9. **C-3.1 迁移审批补丁**：将 Phase A 加在 `ROLE_MENU_MATRIX['MENU_APPROVAL']` 的 13 个角色 'A' 权限，迁移到 `ROLE_MENU_MATRIX['MENU_WORKFLOW']` 并补 'A'：VET、FIN_ACCT、FARM_MGR、WMS_MGR、QA_MGR、STORE_MGR、LOG_MGR、SYSOPS、BU_AGRI_GM、BU_FOOD_GM、FACTORY_MGR。
10. **C-3.2 验证 10 条内置审批链**：逐链回归 approve/reject 不再抛 MENU_PERMISSION_DENIED。

### Phase C-4 — 菜单补齐与角色治理
11. **C-4.1 旧码角色升级**：WMS_MGR/WMS_OP 补 MENU_DASHBOARD/MENU_WORKFLOW 新码；PDA_OP 补 DASHBOARD+WMS_VIEW+FARM_DATA。
12. **C-4.2 事业群改派**：zhuhuiran→ROLE_BU_AGRI_GM、yue→ROLE_BU_FOOD_GM。
13. **C-4.3 角色去重**：合并 HQ_FINANCE↔GROUP_FINANCE、PKG_OP↔PKG_OPERATOR、QA_STAFF↔QC_INSPECTOR、FACTORY_ACCT↔FACTORY_ACCOUNTANT、HR_MANAGER↔HR_ADMIN；清理 PILOT/PDA 遗留角色。
14. **C-4.4 规划角色落地到人**：BU_*_GM、FACTORY_MGR、FIN_CFO、HR_MANAGER 等 12 个缺人角色按需绑定真实用户。

### 避免返工的依赖顺序
```
C-1.1（表结构） → C-1.2（组织树） → C-1.3（绑定） → C-1.4（收敛 ALL）
                                          ↓
        C-4.2（事业群改派，依赖组织树+绑定）
C-2.x（API，独立，可并行） ‖ C-3.x（审批矩阵，独立，可并行）
C-4.1（菜单旧码，独立） → C-4.3（去重，建议在绑定稳定后）→ C-4.4（落地到人）
```
关键：**C-1.1 是一切 DataScope 与组织修复的前置**——表结构不修，C-1.2/1.3 的 INSERT 必因列不存在报错（这正是 Phase B 失败的根因）。C-2/C-3 与 C-1 无依赖，可并行抢工期。

---

## 9. 是否达到 Pilot Run 条件

### 结论：**当前【不具备】恢复 Pilot Run 条件。**

### 判定依据
| 检查项 | 状态 | 是否阻断 |
|---|:--:|:--:|
| 全部 Pilot 角色能登录并看到菜单 | 否（WMS_OP 全空白） | **阻断** |
| 重点角色核心业务页可访问 | 否（PKG_OP/QA_STAFF 进页 403） | **阻断** |
| 审批链可正常审批 | 否（7+ 审批人 approve 被拒） | **阻断** |
| 数据范围隔离生效 | **否（Phase B 未落库）** | **严重阻断** |
| 司机不再全局超权 | **否（store_code 仍 'ALL'）** | **严重阻断（安全红线）** |
| Role Runtime Score ≥ 80 | 否（51.7） | **阻断** |

### 还差什么（恢复 Pilot 的最小必要集）
**必须完成 Phase C-1 全部 + C-2 全部 + C-3 全部**，方可达到「可运行 + 安全隔离」基线：
1. **安全红线（不可妥协）**：完成 C-1.1～C-1.4，特别是司机超权收敛与 store_code='ALL' 越权清理——**外部 B2B 客户与股东角色当前可全局读取所有公司数据，存在数据泄露级风险，Pilot 前必须封堵。**
2. **可达性**：完成 C-2.1～C-2.4，让 WMS_OP / PKG_OP / QA_STAFF / FACTORY_MGR 4 个角色能真正干活。
3. **审批闭环**：完成 C-3.1～C-3.2，恢复用药/费用/库存/质量/门店折扣/物流 6 条审批链。

完成上述后预期 Role Runtime Score 可从 51.7 提升至 ≥ 85，菜单/API/审批覆盖率达 95%+、DataScope 覆盖率达 90%+，即可分批恢复 Pilot Run（建议优先放行已 Y 的 ADMIN/PRC_BUYER/DRIVER（修复后）/CASHIER/QA_MGR/SALES_REP 6 个角色作为首批）。

> **一句话结论**：Phase A 让「门能打开」，但 Phase B 未落库导致「数据没有围墙」。在司机超权修复与 store_code='ALL' 越权收敛落库之前，Pilot Run 必须暂缓——这不是体验问题，是数据安全红线问题。
