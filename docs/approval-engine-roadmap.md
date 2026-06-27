# 审批引擎演进路线图：手工配置 → 智能自动调配

> 北极星：**一句话说出一个业务，引擎按「系统环境 / 用户权限 / 业务域」自动调配审批流程**，省去人工配置。
> 当前阶段做的"手工配置要素"，是为"自动配置"打基础——每个要素都要做成引擎可编程调用的**原子能力**，而非写死在 UI。

---

## 一、核心洞察：自动化 = 把"配置要素"变成"可编程解析"

人工配置审批流，本质是在回答几个问题：**谁能审？走几步？每步谁审？审完怎么流转？** 把每个问题做成一个确定性的服务方法，智能引擎就能在运行时自动回答它们。

| 手工配置要素 | 对应原子能力（服务方法） | 未来智能引擎如何自动化 |
|---|---|---|
| 选审批人 | `resolveEligibleApprovers(权限 ∩ 数据域)` | 按业务域自动筛出合格人，按规则/负载/职级自动定 |
| 配流程步骤 | 动态步骤构建（PICK / ROLE / 金额分级…） | 按业务类型 + 金额 + 公司自动生成步骤数与类型 |
| 指定通知 | `notify.onTaskCreated`（已有） | 无需配置，建步即通知 |
| 结束流转 | `onApproved` 回调（已有） | 无需配置，末步过即回调业务 |
| 数据域约束 | `DataScope.resolve(userId)`（已有） | 自动作为候选人硬过滤，越权不可选 |

**关键原则**：候选人解析、步骤构建、通知、结束回调，全部是**后端服务方法**，UI 和未来的"自然语言→流程"引擎都调同一套方法。手工配置只是这些方法的一种"人工驱动"入口；智能引擎是另一种"AI 驱动"入口。底座同一套。

---

## 二、现状盘点（已具备的基础，可直接复用）

- **审批规则引擎**：`wf_approval_rule` + `wf_approval_rule_step`，`approverType` 支持 `ROLE / USER / COMPANY_ROLE / PROJECT_ROLE / ORG_MANAGER / PROJECT_MANAGER / COMPANY_FINANCE / DIRECT_MANAGER`。
- **审批人解析**：`AssignmentResolverService.resolveApprovers()`（按角色/用户/公司角色…解析出具体人，含中文名）。
- **流程执行**：`startApproval()` 建实例+步骤并通知首步；`approveStep()` 驱动逐步流转。
- **结束流转（已有）**：`approveStep` 末步通过 → `bizRegistry.getApprovedStatus` + `onApproved(bizId)` 回调更新单据状态（同事务）。业务只需在 `WorkflowBizRegistry` 注册 `onApproved`。
- **通知（已有）**：`notify.onTaskCreated` 在建步骤后通知审批人；多步流转时自动通知下一步。
- **数据域（已有）**：`DataScopeService.resolve(userId, roles, menuCode)` → `{ isGlobal, allowedCompanyCodes, … }`。
- **审批人提示（g183 已有）**：提交后前端弹"已提交给【角色】审批（人名）"。

---

## 三、当前阶段实现设计（手工配置要素）

### 原子能力 1：候选审批人查询（基础，三大功能共用）

```
resolveEligibleApprovers({
  menuCode,            // 业务菜单，如 MENU_FIN2_SHAREHOLDER
  requiredPerm = 'A',  // 需要的权限位（A=审批 / E=确认入账）
  companyCode?,        // 单据公司（数据域过滤）
  projectCode?,        // 单据项目（数据域过滤）
  excludeUserId?,      // 排除发起人（自审拦截）
}): Promise<{ userId, displayName, roleNameZh }[]>
```

**两段式**：
1. **权限筛**（SQL）：有该菜单 `requiredPerm` 权限的角色 → 持有这些角色的 ACTIVE 用户。
   权限位精确匹配用 `$perm = ANY(string_to_array(rmp.permissions, ','))`，避免 `LIKE '%A%'` 误命中。
2. **数据域筛**（逐人 `DataScope.resolve`）：`isGlobal || allowedCompanyCodes.includes(companyCode)` 才入选。

**这是越权防线的技术落地点**——前端下拉只是展示，后端 PICK/转交时必须再用同一方法校验所选人合法，前端过滤不可信。
**这也是智能引擎的核心 API**——未来"自动按业务域选人"调的就是它。

端点：`GET /api/approval/eligible-approvers?menuCode=&requiredPerm=&companyCode=&projectCode=`

### 功能 2：开放式选审批人（逻辑二）+ 每步选人

- 审批规则步骤新增 `approverType='PICK'`：表示"该步由发起人在提交时指定"。
- `startApproval(params, mgr, pickedApprovers?)`：`pickedApprovers: { stepNo, userId }[]`。
  - 对 `PICK` 步骤，用 `pickedApprovers` 里对应 stepNo 的 userId 建 USER 型步骤。
  - **后端强制校验**每个选定人：`resolveEligibleApprovers` 命中（权限 ∩ 数据域）且 ≠ 发起人，否则 `BadRequest`。
- **多步**：每个 PICK 步骤各取一个选定人；ROLE 步骤照旧解析。固化步骤与开放步骤可在同一流程混用。
- **未固化流程兜底**：无审批规则但发起人指定了审批人时，用单步 USER 实例承载（动态流程的雏形）。

### 功能 3：流程发起 → 审批人同步通知（已有，接入即可）

PICK/USER 步骤建好后走现成 `notify.onTaskCreated`（站内消息中心铃铛 + SSE 实时 + g183 提交提示）。无需新增机制。

### 功能 4：审批结束端点（已有，确认接入）

`approveStep` 末步通过 → `onApproved` 回调。**待办**：确认每个走 PICK 的业务都在 `WorkflowBizRegistry` 注册了 `onApproved`（如股东资金 `SHAREHOLDER_CONTRIBUTION` → 置 CONFIRMED）。

### 功能 5：转交审批（reassign，后续）

PENDING 实例的当前审批人或发起人，把当前步改派给另一**合格**候选人：`POST /api/approval/instances/:id/reassign { toUserId }`，同样过 `resolveEligibleApprovers` 校验 + 写审计 + 通知新审批人。

---

## 四、演进路线（分阶段，每阶段独立可用）

| 阶段 | 内容 | 状态 |
|---|---|---|
| **P0** | 候选审批人查询（原子能力） | 🔨 本次先做 |
| **P1** | 开放式选人 + 每步选人（approverType=PICK + startApproval 接 pickedApprovers + 前端下拉） | 待 P0 验证 |
| **P2** | 转交审批（reassign） | 规划 |
| **P3** | 流程设计器 UI（可视化配步骤：ROLE 固化 / PICK 开放 / 金额分级） | 规划 |
| **P4** | **智能引擎**：自然语言描述业务 → 匹配/生成流程模板 → 自动用 `resolveEligibleApprovers` 按权限+数据域填充审批人 → 一键发起 | 北极星 |

P4 不是另起炉灶——它复用 P0~P3 的全部原子能力，只是把"人工点选"换成"AI 解析业务语义后自动调用同一批方法"。**所以现在每个方法的入参都要面向'可被程序调用'设计，而不是只服务于一个表单。**

---

## 五、安全红线（贯穿所有阶段）

1. **候选人后端强制校验**：PICK / reassign 的所选人，后端必须用 `resolveEligibleApprovers` 复核权限 ∩ 数据域，前端过滤仅为体验，不可信。
2. **自审拦截**：候选默认 `excludeUserId = 发起人`；制单/审核分离的业务（如股东资金）确认环节同样排除创建者。
3. **数据域硬约束**：审批人数据域必须覆盖单据公司/项目，越权用户不得出现在候选里。
4. **审批人变更留痕**：PICK 指定、reassign 改派写审计（谁、何时、改派给谁、原因）。
5. **未配规则不静默放行**：保留现有 fail-safe（无规则禁止自动通过，除非显式危险开关）。
