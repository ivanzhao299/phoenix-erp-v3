# Phoenix ERP V3 — Workflow Rule Designer 能力确认报告

> 2026-05-31 · 审批规则设计能力确认（只读审计，3 路并行 + 13 项核对）
> 目标：确认审批中心是否支持用户在后台**自定义审批流程**，尤其费用报销流程。
> 范围：`apps/api/src/modules/approval-engine/`、`apps/web/.../settings/approval-rules/`、本地库 `phoenix_erp`。

---

## 0. 核心结论

**审批规则设计器已真实存在且功能完整 → 无需新增独立的 Workflow Rule Designer Phase。**

- 前端有专用「审批规则管理」设计页 `/settings/approval-rules`，**完整 CRUD**（非只读列表）。
- 后端引擎能力丰富：`wf_approval_rules` + `wf_approval_rule_steps` 两张关系表，支持业务类型 / 金额分档 / 多级步骤 / 多种审批人解析（角色/用户/组织负责人/项目/财务/直属上级）/ SLA / 升级催办。
- **费用报销审批流当前为「部分可由用户配置」(PARTIAL)**：步骤、金额、审批人均可配，但卡在四个缺口上 —— ① 业务类型下拉选不到费用/报销 ② 组织维度(GROUP/BU/SITE)死字段 ③ 无规则 fail-open 自动放行 ④ 拒绝回滚伪实现。

> ⚠️ 对上一份《费用报销审计》的修正：上次报告说"wf_approval_rules 0 条 → 无审批"，这在**数据层**属实；但本次确认**设计器本身存在**，0 条的根因之一是**前端业务类型下拉根本没暴露 EXPENSE_REQUEST**，用户在 UI 上压根选不到费用类型去建规则。

---

## 1. 13 项能力核对

| # | 检查项 | 结论 | 依据 |
|---|--------|:----:|------|
| 1 | 是否存在审批规则配置页面 | ✅ **YES** | `settings/approval-rules/page.tsx`（标题「审批规则管理」），真规则设计器；旧 `approval-flows` 已重定向到此；后端 `ApprovalRulesController` GET/POST/PUT/PATCH/DELETE |
| 2 | 用户是否可新增审批规则 | ✅ **YES** | 完整 CRUD：新建按钮 + RightDrawer 表单 + createRule(POST)/updateRule(PUT)/toggleStatus(PATCH)/deleteRule(DELETE) |
| 3 | 是否可选业务类型(EXPENSE/REIMB/PR/SALES_ORDER) | ⚠️ **PARTIAL** | 引擎全支持(biz_type 自由串，DTO 无 @IsIn；registry 已注册 10+ 种)；**但前端 BIZ_TYPE_OPTIONS 仅 PR/PO/PAYMENT/FUND** → 仅采购申请(PR)能 UI 选到，**费用/报销/销售订单选不到** |
| 4 | 是否可配金额条件(0-5k/5k-50k/50k+) | ✅ **YES** | min_amount(默认0)/max_amount(NULL=无上限)，resolveRule 区间判定 + priority 优先级；前端有 min/max 输入。缺点：需手工建多条+人工设 priority，无重叠/空档校验 |
| 5 | 是否可配审批步骤(场长/事业群/财务/CEO) | ✅ **YES** | 子表 `wf_approval_rule_steps` step_no 多级；前端可加/删步骤、自动重排；ROLE_OPTIONS 含 ROLE_FARM_MGR(场长)/ROLE_REGION_MGR(事业群)/ROLE_FIN_CFO/ROLE_CEO |
| 6 | 是否支持按角色审批 | ✅ **YES** | approver_role + approver_type ROLE/COMPANY_ROLE/PROJECT_ROLE；AssignmentResolver.byRole 解析。缺点：ROLE_OPTIONS 前端硬编码 |
| 7 | 是否支持按具体用户审批 | ✅ **YES** | approver_user_id + approver_type=USER，byUserId 解析，validateApprover 强制本人。缺点：仅手填数字 userId，无用户搜索下拉 |
| 8 | 是否支持按组织范围审批(GROUP/BU/COMPANY/SITE) | ⚠️ **PARTIAL** | 仅 COMPANY/PROJECT 两级隐式实现(COMPANY_ROLE/ORG_MANAGER/COMPANY_FINANCE)；**无显式 GROUP/BU/SITE 分支**；`org_scope` 字段被写库但运行时 **完全不消费(死字段)**，前端也无 orgType 控件 |
| 9 | 是否支持多级审批 | ✅ **YES** | step_no 顺序 + current_step_no/total_steps 状态机，approveStep 逐级推进到末步才 APPROVED；SEQUENTIAL/PARALLEL/ANY_ONE |
| 10 | 是否支持审批通过后业务回调 | ⚠️ **PARTIAL** | onApproved 机制存在且与审批**同事务原子**；但 10 个 bizType **仅 EXPENSE_REQUEST 实现了 onApproved**(自动生成报销单)；registry 注释称 SALES_ORDER/RETURN 运行时注册回调，实测**无任何运行时 register**(注释误导) |
| 11 | 是否支持审批拒绝后业务状态回滚 | ❌ **NO** | **伪实现**：rejectStep 硬编码 `'REJECTED'`(approval-engine.service.ts:444)，未调用已存在的 getRejectedStatus() → REIMBURSEMENT(应CANCELLED)/PRICE_BOOK(应DRAFT) 终态全错；无任何 onRejected 注册(无释放预算/库存回滚)；多级中途拒绝整单终结，**不支持退回上一步/驳回到指定步骤** |
| 12 | 是否存在「无规则自动通过」fail-open 风险 | ⚠️ **YES(风险)** | startApproval rule==null(:137-144) 或步骤空(:151-157) 直接置已通过+触发 onApproved；未在 UI 暴露的费用/报销因建不了规则，提交即 fail-open 放行 |
| 13 | 能否改成无规则禁止提交/提示未配置 | ❌ **NO(可改造)** | 当前无此开关(硬编码 fail-open)；改造集中可行：仅需在 :137-144 与 :151-157 两处读 sys_configs 开关(如 approval.require_rule)后抛 BadRequestException 或置 PENDING 挂起 |

---

## 2. 当前审批中心**能支持**什么

- ✅ **可视化规则设计器**(`/settings/approval-rules`)：新建/编辑/启停/删除规则的完整 CRUD。
- ✅ **金额分档路由**：min/max + priority，可建 0-5000 / 5000-50000 / 50000+ 多档。
- ✅ **多级顺序审批**：任意级数步骤，SEQUENTIAL/PARALLEL/ANY_ONE 模式 + 每步所需人数。
- ✅ **多种审批人解析**：按角色(ROLE/COMPANY_ROLE/PROJECT_ROLE)、按指定用户(USER)、按组织负责人(ORG_MANAGER)、按项目负责人、按公司财务(三级回退)、按直属上级(DIRECT_MANAGER)。
- ✅ **场长→事业群→财务→CEO** 链路可配(ROLE_FARM_MGR/ROLE_REGION_MGR/ROLE_FIN_CFO/ROLE_CEO)。
- ✅ **SLA / 催办 / 超时升级**：sla_hours、reminder_interval、escalation。
- ✅ **审批通过回调**(onApproved)与审批**同事务原子**(pessimistic 行锁)。
- ✅ **引擎层已注册 10+ 业务类型**：EXPENSE_REQUEST / REIMBURSEMENT / SALES_ORDER / PR / PO / PAYMENT / FUND / SHAREHOLDER_* / PRICE_BOOK_APPROVAL 等。

## 3. 当前审批中心**不能支持**什么

- ❌ **费用/报销/销售订单无法在 UI 建规则**：前端业务类型下拉只暴露 PR/PO/PAYMENT/FUND。
- ❌ **显式组织维度审批(GROUP/BU/SITE)**：仅 COMPANY/PROJECT 两级，org_scope 死字段、前端无控件。
- ❌ **拒绝后真实业务回滚**：硬编码 REJECTED、终态错误、无 onRejected、无释放占用、无退回/驳回到指定步骤。
- ❌ **无规则禁止提交/挂起**：当前硬编码 fail-open 自动放行，无安全兜底开关。
- ❌ **取消审批回写业务**：cancelInstance 不回写业务表、不调 onCancelled(单据悬挂)。
- ❌ **单规则内多档位**：金额分档需手工建多条规则，无重叠/空档校验。
- ❌ **审批人友好选择器**：USER 仅手填数字 ID 无搜索；ROLE_OPTIONS 前端硬编码非动态拉取。

---

## 4. 费用报销审批流是否可由用户配置？

**PARTIAL（部分可配）。**

| 配置维度 | 可配？ |
|----------|:------:|
| 审批步骤（多级、场长/财务/CEO） | ✅ 可配 |
| 金额分档（0-5k/5k-50k/50k+） | ✅ 可配 |
| 审批人（按角色/用户/公司） | ✅ 可配 |
| **选择业务类型 = 费用/报销** | ❌ **UI 选不到** |
| 组织维度（GROUP/BU/SITE） | ❌ 不生效 |
| 无规则保护 | ❌ fail-open 放行 |
| 拒绝回滚 | ❌ 伪实现 |

→ **结论**：用户能在设计器里配步骤/金额/审批人，但**因为下拉里选不到 EXPENSE_REQUEST/REIMBURSEMENT，实际无法为费用报销建出一条可用规则**（只能直接写库或调 API）。这正是费用模块运行时 fail-open 自动放行的根因。

### 缺哪些配置项（让费用报销真正可由用户配置）

| # | 缺口 | 改造量 |
|---|------|:------:|
| 1 | 前端 BIZ_TYPE_OPTIONS 补 EXPENSE_REQUEST / REIMBURSEMENT / SALES_ORDER | 极小（扩 3 行枚举） |
| 2 | fail-open 改 fail-safe：无规则时按 sys_configs 开关禁止提交/挂起 + 告警 | 小（2 处分支 + 1 配置项） |
| 3 | 拒绝回滚修复：rejectStep 改读 getRejectedStatus()，并为费用/报销注册 onRejected | 中 |
| 4 | 组织维度落地：让 org_scope 生效，新增 GROUP/BU/SITE 解析分支 + 前端 orgType 控件 | 中 |
| 5 | 审批人选择器：USER 改用户搜索下拉，ROLE 动态拉取 sys_role | 小-中 |
| 6 | 金额分档重叠/空档校验 | 小 |

---

## 5. 是否需要新增 Workflow Rule Designer Phase？

**不需要新增独立的「Rule Designer 从零搭建」Phase —— 核心架构(设计器页面 + 引擎 + 关系表)已就绪。**

建议改为一个**「审批规则补缺与加固」小 Phase**（非从零设计器），按优先级：

1. 🔴 **P0 风控**：fail-open → fail-safe 开关（缺口 2）+ 前端业务类型补齐（缺口 1）—— 这两项直接解除费用报销「提交即自动放行」的最高风险，且改造量极小。
2. 🟠 **P1 正确性**：拒绝回滚修复 + onRejected 注册（缺口 3）。
3. 🟡 **P2 完整性**：组织维度落地（缺口 4）+ 审批人选择器（缺口 5）+ 金额校验（缺口 6）。

> 命名建议：`Workflow Approval Hardening Phase`（审批加固），而非 `Rule Designer Phase`（会误导为重建设计器）。

---

## 验证（审计只读，未改任何代码）

| 项 | 结果 |
|----|------|
| 审计方式 | 3 路并行代码+DB 扫描 + 13 项综合核对（4 agents，只读） |
| 代码/逻辑/数据改动 | 无（纯审计产出） |

> 本报告为纯能力确认产出，未开发功能、未重构、未改业务逻辑、未改数据库。
