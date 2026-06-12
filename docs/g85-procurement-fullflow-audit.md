# G85 — 采购模块全流程深度审计报告

> 范围：审批流程引擎 · 股东资金账户关联 · 多公司账户关联 · 项目关联 · 物料SKU · 供应商主数据 · 仓库隔离
> 方法：三路并行只读代码审计（approval-engine / finance-v2 / procurement-v2 / master-data / org）+ 交叉核实
> 日期：2026-06-11　**结论：不就绪 — 开通前必须先清除 2 个 P0 阻断 + 评估 4 个 P1 断链**

---

## 0. 执行摘要（一页看全）

采购模块的**单据 CRUD、状态机、DataScope 公司隔离、收货入库（G84 刚修）** 都是真实可用的；但**跨模块的"流程引擎 / 资金账户 / 项目主数据"三条关键链路存在系统性断点**，**直接给用户开通会在"提交审批"这一步就报错**。

| # | 发现 | 级别 | 一句话影响 |
|---|------|------|-----------|
| **F1** | 审批引擎缺 PO/PR/PAYMENT 规则 seed | 🔴 P0 阻断 | 用户提交审批即报错"未配置审批规则"，单据走不动 |
| **F2** | 双脑：本地 @deprecated approve() 与审批引擎并存 | 🔴 P0 阻断/不一致 | 前端实际调本地端点直接改状态，审批引擎实例沦为孤儿，两套状态分裂 |
| **F3** | 付款→财务流水彻底断链 | 🟠 P1 | 付款后总账无记录、现金账户余额不变，财务无法对账 |
| **F4** | 股东代付/多公司账户无关联校验 | 🟠 P1 | payerAccount 自由文本，不验账户归属/币种，可跨公司乱扣 |
| **F5** | AP 回调缺失（PO.onApproved 未注册） | 🟠 P1 | 若切到标准审批接口，应付台账不再自动生成 |
| **F6** | ~~项目主数据 biz_projects 未在生产执行~~ **【勘误：误报】** | ~~🟠 P1~~ ✅ | 实证 biz_projects 已于 2026-06-05 在生产执行（commit 737580a），/api/biz/projects/active 返回真实 ACTIVE 项目。审计被迁移文件头过时注释误导，注释已修正 |
| **F7** | 物料 SKU 化不完整 + 仓库 DataScope 缺失 | 🟡 P2 | 成本无法按 grade/product 归集；用户可越权看他仓库收货 |
| **F8** | 供应商主数据快照漂移 | 🟡 P2 | 供应商改名后历史单据不回溯（部分属审计留痕，合理） |

**给"开通权限"的直接结论**：**先别开**。最少要先做 F1（配审批规则）+ F2（收口审批入口）这两个 P0，否则用户一用就报错。F3/F4（资金链）是"付款"环节的硬伤，财务管控要求高则也必须先补。

---

## 1. 流程引擎（F1 + F2 + F5）

### 1.1 引擎机制（已查清）
- 入口 `ApprovalEngineService.startApproval({bizType, amount, companyCode, projectCode, ...})`（approval-engine.service.ts:17-30, 141-286）。
- 选链：按 `wf_approval_rules`（biz_type + 金额区间 minAmount≤amount≤maxAmount + 公司过滤 + priority）匹配；多步存 `wf_approval_rule_steps`（approver_type=ROLE/USER/...）。
- 推进：`POST /api/approval/instances/:id/approve` → `approveStep()`（行级悲观锁 + 严格审批人校验），最后一步触发 `onApproved` 回调更新业务单据 + 业务钩子。
- 金额分级**引擎本身支持**（按区间选规则），但需有规则种子才能生效。

### 1.2 🔴 F1 — PO/PR/PAYMENT 无规则种子（提交即阻断）
- `wf_approval_rules` 全库搜索：仅 EXPENSE_REQUEST / MD_*_CREATE / SHAREHOLDER_CAPITAL 有 seed；**PO / PR / PAYMENT 三个 biz_type 无任何规则**。
- `fail_open_enabled` 默认 `false`（migrations/20260531_workflow_hardening_p0.sql:13）→ 无规则时**抛 `BadRequestException("当前业务未配置审批规则")`**（approval-engine.service.ts:156-168）。
- **误判澄清**：`ddl/02_init_data.sql:227-228` 的 `PRC_ORDER` 链是**旧审批矩阵（JSONB，遗留死配置）**，与新引擎 `wf_approval_rules` 无关；代码传的是 `'PO'`（orders.service.ts:494），不是 `'PRC_ORDER'`。两者对不上。
- **后果**：采购订单/申请/付款一旦走"提交审批"，100% 报错卡住。因采购尚未对用户开放（M6 仅导主数据），此 bug 未暴露。
- **修复方向**：写一份 `wf_approval_rules` + `wf_approval_rule_steps` 的幂等 seed 迁移，覆盖 PO（≤5万 BUYER→REGION_MGR；>5万 +CEO）、PR、PAYMENT，approver_type=ROLE。

### 1.3 🔴 F2 — 双脑：本地 @deprecated approve 与引擎并存
- `orders.service.ts:516-592` 有 `@deprecated` 的本地 `approve()/reject()`：直接改 `prc2_purchase_orders.status` 并生成 AP 台账。
- 前端 orders 页实际调的是 `POST /api/v2/procurement/orders/:id/approve`（本地废弃端点），**不是** `/api/approval/instances/:id/approve`。
- 结果：本地端点改单据状态、引擎实例不更新（孤儿）；两套真相源分裂。当前"真相源"实为 `prc2_purchase_orders.status`（本地直改）。
- **修复方向**：二选一收口——①若用引擎：前端改调标准审批接口 + 补 F5 回调；②若暂用本地：明确停用引擎 startApproval（避免提交即报错），把本地审批作为唯一路径。**推荐 ①**（与全集团审批中心统一）。

### 1.4 🟠 F5 — AP 回调缺失
- `workflow-biz-registry.service.ts:42-48` 注册 PO/PR 时**无 `onApproved` 回调**（对比 EXPENSE_REQUEST 有）。
- 当前 AP 台账由本地 `approve()` 生成（F2 路径）；若切到引擎标准接口（F2 方案①），引擎审批通过后**不会生成 AP** → 财务断点。
- **修复方向**：在 biz-registry 给 PO 注册 `onApproved`，迁移"生成 prc2_ap_ledger"逻辑进去；本地 approve 废弃。

### 1.5 🟡 待办 DataScope
- `getMyTodos()`（approval-engine.service.ts:518-565）按角色/用户过滤正确，但**未叠加 company/project DataScope** → 可能看到跨公司待办。`allowAdminOverride` 生产应收紧。

---

## 2. 资金账户关联（F3 + F4）— 付款→资金→总账全断

完整资金路径现状（payments.service.ts:311-416）：
```
付款 pay()
  ✓ 核销 prc2_ap_ledger（paid/balance/status）
  ✗ 不查 fin_cash_accounts、不验账户、不扣余额
  ✗ 不写 fin_cash_transactions（财务总账流水缺失）
  ⟂ 仅股东付款时写 prc2_shareholder_fund（采购内孤立，无 fin 侧记录）
```

### 2.1 🟠 F3 — 付款不写财务流水
- `payments.service` 未导入 `CashTransactionsService/CashAccountsService`，pay() 只动采购内 AP。
- 标准范式见 `ar-receipts.service.ts:341-357`（writeTransaction + 余额更新，同事务）。
- 后果：付款后总账查不到、现金账户 `current_balance` 不变 → 资金对账失真。

### 2.2 🟠 F4 — 账户语义松散（股东/多公司/币种均无校验）
- `payerAccount` 是 `varchar(128)` 自由文本（prc2-payment.entity.ts:55），DTO 无校验；前端 `CashAccountSelector` 默认发 code，但**后端不强制是 `fin_cash_accounts.account_code`**。
- 无校验：账户是否存在、`company_code` 是否=付款公司、`currency_code` 是否=付款币种、状态是否 ACTIVE。→ 可跨公司用别家账户付款、币种错配。
- 股东代付：`prc2_shareholder_fund` 无 `cash_account_id`，不写 `fin_shareholder_contributions`，与股东主数据/财务侧脱钩。

### 2.3 Fix 2 正确实现方案（待批准后做）
在 pay() 事务内：①`SELECT ... FROM fin_cash_accounts WHERE account_code=$1 FOR UPDATE`，强制存在；②校验 company_code/currency_code/status；③扣 `current_balance`；④经 `CashTransactionsService.writeTransaction`(direction=OUT, sourceType='AP_PAYMENT', balanceAfter) 写流水；⑤股东代付补 `fin_shareholder_contributions` + 关联账户。**前置**：payerAccount 必须主数据化为 account_code。

---

## 3. 项目关联（F6）

- **两套项目表并存**：`prc2_projects`（空表）vs `biz_projects`（migrations/20260605_mdm1_01_biz_projects.sql，**注明"未在生产执行"**，含 budget_amount 预算维度）。
- 前端 `ProjectSelector` 打 `/biz/projects/active`（依赖 biz_projects），表未建时 catch 返回空 → 前端"暂无项目"。
- 成本归集链路**逻辑完整**（PO→AP→Payment→dashboard project_cost 按 project_code 分组，dashboard.service.ts:154-193），但**数据源依赖未落地的 biz_projects**，且无"预算 vs 实际"对标卡片。
- **修复方向**：确认并在生产执行 biz_projects 迁移 + seed 真实项目；prc2_projects 标 deprecated；（可选）PO.project_code 外键 → biz_projects；dashboard 补预算对标。

---

## 4. 物料 / 供应商 / 仓库（F7 + F8）

### 4.1 🟡 物料 SKU 化不完整
- `prc2_order_items.item_code/item_name/spec` 为纯文本，无 SKU 外键。前端 SkuSelector 选中后 item_code←sku_code、spec←spec_code，但**未捕获 grade_code/product_code** → 无法按等级/产品归集成本（orders/page.tsx ~1150；entity prc2-order-item.entity.ts）。
- **修复方向**：prc2_order_items 加 grade_code/product_code 列 + 前端 onPick 补带出；（可选）item_code FK→product_skus。

### 4.2 🟡 仓库 DataScope 缺失
- `DataScopeContext` 有 `allowedWarehouseCodes`，但 `DataScopeHelper.applyToQb()` 只处理 company/project，**不过滤 warehouse**；Receipts 列表是手动 `warehouseCode` 参数过滤而非自动 DataScope → 用户可越权查他仓库收货。
- **修复方向**：applyToQb 增 warehouseField 参数；orders/receipts list 接入。

### 4.3 🟡 供应商主数据
- 采购用 `prc2_suppliers`，同时被 master-data Runtime 托管（同表，前端建供应商已下沉主数据中心，采购页只读）。单据存 supplier_code/name 快照，改名不回溯。
- 判断：**结构上已统一到同一张表**（不算双表分裂），主要欠"改名审计/回溯"。属可接受的审计快照，优先级低。

### 4.4 快照分类（合理 vs 漂移风险）
- 合理留痕：company_name / project_name / supplier_name（凭证需保留签约时名称）。
- 漂移风险：item_code/item_name/spec（无 SKU 外键）、supplier_code（无同步）。

---

## 5. 整改优先级与建议序列

| 阶段 | 内容 | 级别 | 前置 |
|------|------|------|------|
| **A（开通前必做）** | F1 配 wf_approval_rules（PO/PR/PAYMENT）+ F2 审批入口收口（前端调标准接口）+ F5 PO.onApproved 生成 AP | 🔴 P0 | 决定走引擎 or 本地 |
| **B（付款开放前必做）** | F3 付款写财务流水 + F4 账户主数据化/三校验 + 股东代付接 fin | 🟠 P1 | payerAccount 主数据化 |
| **C（数据质量）** | F6 biz_projects 落地 + F7 物料 grade/product + 仓库 DataScope | 🟠🟡 P1/P2 | 生产迁移确认 |
| **D（优化）** | 供应商改名审计、预算对标卡片、待办 DataScope、allowAdminOverride 收紧 | 🟡 P2/P3 | — |

**最小可开通集（建议）**：完成 A 阶段后，可先开"申请→订单→收货（自动入库）→应付"给采购员/审批人用；**付款功能待 B 阶段完成再开放**，期间财务侧暂行单独登记。

---

## 6. 待你决策

1. **审批走向（F2）**：统一走集团审批引擎（推荐，需配规则+收口前端+补回调），还是暂用采购本地审批（需停用引擎调用避免报错）？这决定 A 阶段怎么做。
2. **biz_projects（F6）**：是否在生产执行该迁移（运行迁移属红线，需你确认）？业务方此前要求"未执行"，需确认现是否放行。
3. **开通节奏**：按"最小可开通集"先开非付款链，还是等 A+B 全做完再整体开？

> 本阶段只审计、未改任何代码。等你定方向后再按 A→B→C→D 推进。
