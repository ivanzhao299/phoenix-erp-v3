# Phoenix ERP V3 — Workflow Hardening P0 报告（审批加固 P0）

> 2026-05-31 · 仅做审批加固 P0 风控：前端业务类型补齐 + 引擎 fail-open → fail-safe
> **不新增 Rule Designer Phase、不重构 Workflow、不做组织维度改造、不做拒绝回滚 P1、不做附件。**

---

## 0. 一句话结论

费用报销审批被旁路的**两处 P0 风控缺陷已修复**：① 用户现可在审批规则页**选择费用申请/报销付款/销售订单**等业务类型建规则；② 引擎默认 **fail-safe**——无审批规则时**不再自动批准**，而是抛中文错误禁止提交。**API TS 0、Web TS 0。**

---

## 1. 审批规则设计器现状

设计器本就存在且功能完整(见上份《Rule Designer 能力确认报告》)：
- 页面 `/settings/approval-rules`(「审批规则管理」)，完整 CRUD。
- 后端 `wf_approval_rules` + `wf_approval_rule_steps`，支持金额分档 / 多级步骤 / 按角色·用户·组织负责人·公司财务·直属上级解析 / SLA / 升级。

P0 只补该设计器的**两处运行配置缺陷**，不改架构。

---

## 2. 新增业务类型清单（前端）

文件 `apps/web/src/app/(admin)/settings/approval-rules/page.tsx`，同步更新**下拉枚举 `BIZ_TYPE_OPTIONS`** 与**列表展示映射 `BIZ_TYPE_LABEL`**(二者一致，列表中文名正确显示)：

| 业务类型代号 | 中文名称 | 后端是否已注册 biz |
|--------------|----------|:------------------:|
| PR | 采购申请 | ✅(原有) |
| PO | 采购订单 | ✅(原有) |
| PAYMENT | 付款申请 | ✅(原有) |
| FUND | 股东资金 | ✅(原有) |
| **EXPENSE_REQUEST** | **费用申请** | ✅ registry:84 |
| **REIMBURSEMENT** | **报销付款** | ✅ registry:148 |
| **SALES_ORDER** | **销售订单** | ✅ registry:169 |
| **SALES_RETURN** | **销售退货** | ✅ registry:180 |
| **STORE_POS_VOID** | **门店作废** | ⚠️ 暂未注册 biz(可建规则，待业务接入后生效) |
| **CUSTOMER_CREDIT_UNFREEZE** | **客户信用解冻** | ⚠️ 暂未注册 biz(同上) |

**满足要求**：① 全部显示中文名称、② 下拉/列表均无英文技术词(代号仅作 value)、③ 不破坏已有 4 类、④ 新类型可保存到后端(DTO bizType 为自由字符串、无 @IsIn 限制)、⑤ 列表列经 `BIZ_TYPE_LABEL[rule.bizType] ?? rule.bizType` 正确显示中文。

> 说明：STORE_POS_VOID / CUSTOMER_CREDIT_UNFREEZE 后端尚无对应业务注册，UI 已可建规则但需待对应业务模块接入 ApprovalEngine 后才会真正触发审批——本期按要求补入下拉，不阻断。

---

## 3. fail-open 修复位置

文件 `apps/api/src/modules/approval-engine/approval-engine.service.ts`，方法 `startApproval` 内**两处** fail-open 分支：

| 位置 | 原行为 | 新行为 |
|------|--------|--------|
| 分支①：`if (!rule)` 无匹配规则 | 直接 getApprovedStatus→改业务状态为已通过 + 触发 onApproved | **默认 fail-safe**：`isFailOpenEnabled()` 为 false 时抛 `BadRequestException('当前业务未配置审批规则，请先在审批规则中配置后再提交。')` |
| 分支②：`ruleSteps.length === 0` 规则有但无步骤 | 同上自动通过 | **默认 fail-safe**：抛 `BadRequestException('当前业务的审批规则未配置任何审批步骤，请先在审批规则中补全步骤后再提交。')` |

新增私有方法 `isFailOpenEnabled(mgr)`：读 `sys_configs.workflow.fail_open_enabled`，仅当显式 `'true'` 才允许 fail-open；**配置缺失/查询异常一律返回 false(安全默认)**。

---

## 4. fail-safe 行为说明

| 要求 | 落实 |
|------|------|
| 默认 fail-safe | ✅ 代码默认 false；配置缺失也 false |
| 抛明确中文错误 | ✅ 「当前业务未配置审批规则，请先在审批规则中配置后再提交。」 |
| 不自动生成报销单 | ✅ 抛异常前不调 onApproved(报销单由 onApproved 生成) |
| 不自动执行 onApproved | ✅ 抛异常在 onApproved 之前 |
| 不让费用申请进入 APPROVED | ✅ 抛异常使提交事务回滚，费用单保持 DRAFT |
| 保留配置开关、默认关闭自动通过 | ✅ sys_configs `workflow.fail_open_enabled` 默认 false |

**危险开关**：`sys_configs.workflow.fail_open_enabled`
- 默认 `false` = fail-safe(种子见 `apps/api/migrations/20260531_workflow_hardening_p0.sql`，幂等 ON CONFLICT DO NOTHING)。
- 仅 ADMIN/SYSOPS 可显式置 `true` 临时放行。
- 🔴 **本开关为危险开关，生产环境严禁开启**——开启即恢复「无规则自动批准」的内控风险。description 已在配置中心标注「⚠危险开关…生产环境严禁开启」。

---

## 5. EXPENSE_REQUEST 验证结果

| 场景 | 预期 | 实测/依据 |
|------|------|----------|
| 不配置 EXPENSE_REQUEST 规则 + 提交费用申请 | 提交失败、不自动批准、不生成报销单 | ✅ 本地 `wf_approval_rules` EXPENSE_REQUEST = **0 条**、`workflow.fail_open_enabled = false` → 命中分支①抛 `BadRequestException` 中文提示，事务回滚，费用单留 DRAFT，onApproved 不执行(报销单不生成) |
| 配置 EXPENSE_REQUEST 规则(含步骤)后再提交 | 正常进入审批、生成待办、不自动批准 | ✅ 路径不变：rule 命中且 ruleSteps>0 → 按 step_no 创建实例步骤、生成待办、状态 PENDING_APPROVAL，需人工逐级审批 |

> 修复前：EXPENSE_REQUEST 0 规则 → 提交即自动 APPROVED + 自动生成报销单(财务内控旁路)。
> 修复后：0 规则 → 提交被拒并提示「请先配置审批规则」，彻底堵住自动放行。

---

## 6. REIMBURSEMENT 验证结果

- **可在审批规则页选择**：✅ 下拉新增「报销付款 REIMBURSEMENT」，可为其建独立审批规则。
- **当前业务逻辑(不强行新增付款审批链)**：报销单**由费用申请审批通过后自动生成**(onApproved → INSERT fin_reimbursements PENDING)；**报销付款**由 `ReimbursementsService.pay()` 执行，受**财务付款菜单权限**(MENU_FIN2_REIMBURSE)控制，**不经独立审批链**。
- 本期**不为报销付款新增审批链**(符合要求)。若未来需大额报销二次审批，可为 REIMBURSEMENT 配置规则并在 reimbursement.submit 接入 startApproval——属 P1/P2 范畴，本期不做。

---

## 7. 剩余 P1 / P2 问题（本期不做，仅登记）

| 优先级 | 问题 | 说明 |
|:------:|------|------|
| P1 | 拒绝回滚伪实现 | rejectStep 硬编码 'REJECTED' 未读 getRejectedStatus，无 onRejected，REIMBURSEMENT 应 CANCELLED 却 REJECTED；不支持退回上一步 |
| P1 | onApproved 仅 EXPENSE_REQUEST 实现 | 其余 bizType 仅改状态字段 |
| P2 | 组织维度(GROUP/BU/SITE) | org_scope 死字段，仅 COMPANY/PROJECT 隐式 |
| P2 | 角色/费用报销权限矩阵 | ROLE_FIN_ACCT/ROLE_CASH 缺席费用报销菜单(见费用审计报告)，财务会计/出纳 403 |
| P2 | 附件凭证 | 前端无上传、报销表无附件字段、仅本地磁盘 |
| P2 | 审批人选择器/金额校验 | USER 手填 ID 无搜索；金额分档无重叠校验 |
| P2 | STORE_POS_VOID/CUSTOMER_CREDIT_UNFREEZE | 已入下拉但后端 biz 未注册 |

---

## 8. 是否达到费用报销 Pilot Run 条件

**P0 风控已达标，但 Pilot Run 完整跑通还需 P2 角色补齐。**

| 维度 | 状态 |
|------|------|
| 用户可为费用报销建审批规则 | ✅ 已可(下拉已暴露) |
| 无规则不再自动批准(内控风控) | ✅ 已修(fail-safe) |
| 费用申请不绕过审批生成报销单 | ✅ 已堵 |
| 财务会计/出纳能操作费用报销 | ❌ 仍受限(ROLE_FIN_ACCT/ROLE_CASH 不在菜单矩阵，属 P2) |
| 附件凭证 | ❌ 未做(P2) |

**结论**：审批加固 P0 完成 —— 费用报销审批的**自动放行风险已根治**，用户**可自助配置审批流**。要让费用报销真正进入 Pilot Run，还需补 **P2 角色矩阵**(让王玮华/朱召安能查看/操作)。Pilot Run 初期可由刘杰(ROLE_HQ_FINANCE)先跑通费用→审批→报销→付款全链路验证，角色矩阵补齐后再放开多人。

---

## 验证（§6）

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非 P0 回归） |

**scope-audit 说明**：6 个 DataScope 测试账号(group_admin 等，Test@123)在本地库缺失、本地 API 端点 404，与 M2-M5 同源环境问题。**P0 仅改 approval-rules 下拉、approval-engine fail-safe 分支、新增 1 条 sys_configs 配置，未触及任何 DataScope 用户/逻辑，不构成回归。** 生产端不受影响。

---

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `apps/web/.../settings/approval-rules/page.tsx` | BIZ_TYPE_OPTIONS + BIZ_TYPE_LABEL 各加 6 类中文 |
| `apps/api/.../approval-engine/approval-engine.service.ts` | 导入 BadRequestException；新增 isFailOpenEnabled()；两处 fail-open 分支加 fail-safe 守卫 |
| `apps/api/migrations/20260531_workflow_hardening_p0.sql` | 幂等种子 sys_configs.workflow.fail_open_enabled=false(危险开关) |
