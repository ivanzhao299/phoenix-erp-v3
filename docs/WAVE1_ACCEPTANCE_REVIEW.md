# Wave 1 验收审查

> 评审人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 输入文档：
> - `docs/ERP_E3_E5_E6_REPORT.md`（来自提交 `01014a1`，分支 feature/agent-erp-business）
> - `docs/FINANCE_F1_F5_REPORT.md`（来自提交 `bec0185`，分支 feature/agent-finance）
> - `docs/MASTER_DATA_W4_REVIEW.md`
> - `docs/MASTER_DATA_PHASE2_DESIGN.md`
> 实际复核对象：上述两个 commit 的 diff（git show）+ 本地静态分析
> 本评审不修改代码、不动 migration、不动业务流程；只判 W1 是否过关 + 给 W5 建议。

---

## 0. 结论速读

| 维度 | 结论 |
|---|---|
| 1. ERP E3/E5/E6 是否违反主数据统一原则 | ✅ **不违反**（E3 反而强化 supplier_id 权威；E5 接 INV_STOCK_STATUS 字典；E6 改 PBAC） |
| 2. Finance F1-F5 是否违反 company/project 统一原则 | ✅ **不违反**（F1 service 直读 CLS dataScope 原始字段 + F2 严格按 allowedProjectCodes 过滤） |
| 3. 是否引入新的主数据漂移 | ✅ **未引入**（4 个漂移源 brd_farms/sys_store/prc2_projects/shr_projects 持平；prc2_suppliers 13→14 = E3 主数据强化） |
| 4. 事务一致性风险 | ✅ **无**（E3 内 ds.transaction；E5 字典查询不进事务但只读静态；F3 / F4 改 qr 模式正确收口 CashTransactionsService / CashAccountsService 单入口） |
| 5. 权限绕过风险 | 🔴 **ERP 1 处缺陷**：`workflow.isAdmin` 新正则 `/^MENU_WORKFLOW(:[*AEC])?$/` 只匹配**单字符**后缀，会漏判生产中常见的 `MENU_WORKFLOW:V,A` / `MENU_WORKFLOW:V,A,E` 二级管理员；Finance 5 项无新风险 |
| 6. 合并 ERP 分支 | 🟡 **有条件**：先修 §5 正则 bug + 加正则单测 |
| 7. 合并 Finance 分支 | ✅ **可直接合并** |
| 8. 是否允许进入 W5 | ✅ **允许**（W5 由 Architect 主导 M2/M3 子文档 + biz_projects 扩列；ERP/Finance 修复同步进行不阻塞） |
| **总决议** | **🟢 PASS WITH CONDITIONS**（条件见 §8） |

---

## 1. ERP E3 / E5 / E6 vs 主数据统一原则

### 1.1 E3 — `prc2_ap_ledger` 供应商写入收口

**对照 PHASE2_DESIGN §3.1（采购必填 `company_code、supplier_code`）+ §7.1（写路径以 master 为权威）**：

| 检查项 | 实现位置 | 结论 |
|---|---|---|
| 新建 `resolveSupplier(mgr, hints)` 用 `Prc2SupplierEntity` 当 master | `orders.service.ts:84-110` | ✅ supplier_id 优先，code fallback；空入参硬抛 400 |
| `create()` PO 直建 | `orders.service.ts:355-372` | ✅ DTO → resolveSupplier → 落库 |
| `convertFromRequest()` PR→PO | `orders.service.ts:428-451` | ✅ 同上 |
| `update()` PO 编辑（DRAFT） | 已收口 | ✅ |
| `approve()` PO 审批生成 AP 台账 | 复用上游 PO 字段；缺 supplier_id 打 warn | ✅ |
| DTO 与 master 发散告警 | `logger.warn('E3 供应商发散...')` | ✅ 灰度观察机制 |
| 未删 `supplier_code` 列（W6 才删） | DDL 不动 | ✅ 符合 W4 review §6 残债清单 |
| 主数据漂移影响 | `prc2_suppliers` 13→14 hit（+1 = 引入 SupplierEntity import） | ✅ healthy growth |

**结论**：E3 强化"主数据 = 权威源"原则，**不违反**。

### 1.2 E5 — `inv_batches.status` 字典化

**对照 CLAUDE.md §7（INV_STOCK_STATUS 唯一来源）+ PHASE2_DESIGN §3.1（库存表 status 受字典约束）**：

| 检查项 | 实现位置 | 结论 |
|---|---|---|
| 新建 `assertInvStockStatus(em, status)` | `wms.service.ts:24-50` | ✅ 进程级缓存 + 字典缺失退回后备集 + warn |
| 守 `confirmInbound()` AVAILABLE 路径 | ✅ | |
| 守 `confirmInbound()` QUARANTINE 路径 | ✅ | |
| 守 `inboundFromReceipt()` AVAILABLE 路径 | ✅ | |
| 字典缺失退回 fallback Set | `AVAILABLE/RESERVED/QUARANTINE/DAMAGED/FROZEN/EXPIRED/LOCKED` 7 态 | 🟡 fallback 比 CLAUDE.md §7 五态多 EXPIRED/LOCKED 兼容历史 |
| 调拨 / 盘点 / FIFO 未收口 | 报告 §2.3 自承未触 status，确实不在新增写入路径上 | ✅ 合理范围限定 |

**观察项 O-W1-A**：fallback Set 含 7 态（多 EXPIRED/LOCKED），与 CLAUDE.md §7 五态不严格一致。属"避免业务停摆"的过渡兼容。建议在 W5 内由数据质量 Agent 把历史 EXPIRED 行批量改 DAMAGED 或 FROZEN，并把 fallback 收紧到 5 态。

**结论**：E5 把库存状态唯一来源固化到字典，**不违反**主数据统一原则。

### 1.3 E6 — 角色硬编码清理

**对照 PHASE2_DESIGN §3.3（DataScope 6 维输出）+ MULTI_AGENT_PHASE2_PLAN §2.3 E6**：

| 改动 | 评估 |
|---|---|
| `procurement.service.getApprovers` LIKE 匹配 `'%A%'` / `'%E%'` / `'%*%'` | ✅ 由于 perm code 集合 {V,C,E,D,A,X,*}，LIKE 无误判风险 |
| `workflow.service` 删除 `ADMIN_ROLES = {ROLE_ADMIN, ROLE_SYSOPS}` | ✅ 走 PBAC |
| `workflow.service.isAdmin` 改为 `permissions.includes('*')` OR `regex match` OR `username==='admin'` | 🔴 **正则缺陷**，见 §5.1 |
| `workflow.service` seed 模板抽命名常量（`SEED_DEFAULT_*`） | ✅ 字符串值未变；仅命名层 |
| `assignment-resolver.byCompanyFinance` 改读 PBAC | ✅ ORDER BY role_code 字典序遍历 |

**结论**：E6 方向正确，但 `isAdmin` 正则有实际权限漏判风险（§5.1）。

---

## 2. Finance F1-F5 vs company_code / project_code 统一原则

### 2.1 F1 — DataScope CLS 命名收口

**对照 PHASE2_DESIGN §3.3（CLS 输出 6 维原始字段）+ §7.2（service 直读 CLS，禁手工映射）**：

| 检查项 | 证据 |
|---|---|
| 13 个 service 全部新增 `scope()` 私有读 CLS dataScope | ap-invoices / ap-adapter / ar-invoices / ar-receipts / cash-accounts / fund-transfers / expense-requests / reimbursements / shareholder-contributions / shareholder-settlements / financial-reports / ar-ledger / ar-reconciliation |
| 7 个 controller 删 `scopedUser` 包装，改为返回原始 user | fin-cash / fin-expense / fin-shareholder / fin-ar-ledger / finance-v2 / financial-reports（fin-ap / fin-ar 原本就无包装） |
| 直读 `isGlobal` / `allowedCompanyCodes` / `allowedProjectCodes` 原始字段 | ✅ |
| 未再使用 `scopeAll` / `companyCodes` 包装命名 | ✅（grep 仅剩 ap-invoices.service.ts:27 一处注释字符串） |

**结论**：F1 完全符合 PHASE2_DESIGN §3.3 + §7.2，**不违反**统一原则。

### 2.2 F2 — DataScope 项目维度补齐

| 检查项 | 证据 |
|---|---|
| 后端项目维度过滤覆盖 ap / ar / expense + receipts 子流 | 实测 grep `allowedProjectCodes` ≥ 10 处命中（与 F4_REPORT §2.3 一致） |
| 策略：`(project_code IS NULL OR project_code = ANY($n))` | 兼容历史未挂项目的单据 |
| `assertOwnership` 仅当单据 project_code 非空时校验 | ✅ |
| 前端 `finance2/ap/page.tsx` / `ar/page.tsx` / `expenses/page.tsx` 都加 `ProjectSelector` | ✅ 联动 companyCode |

**观察项 O-W1-B**：F2 的"NULL 也放行"策略是过渡设计。**风险**：恶意/迁移把 `project_code` 设为 NULL 即可绕过项目维度过滤。**对策**：在 service 里加注释、列入残债清单。等 W6+ 历史 AP/AR 全部回填 project_code 后，策略升级为"NULL 仅老批次放行；新建必填 project_code（在 NOT NULL 已生效的表上完全严格）"。

**结论**：F2 严格按 PHASE2_DESIGN §3.1 项目维度补齐，**不违反**统一原则；策略需文档化为过渡态。

### 2.3 F3 — `reimbursements.pay()` 旁路收口

**对照 PHASE2_DESIGN §7.2 + FINANCE_AUDIT §3.3**：

| 检查项 | 证据 |
|---|---|
| 删除内部 `INSERT INTO fin_cash_transactions` | ✅ |
| 删除内部 `UPDATE fin_cash_accounts` | ✅ |
| 注入 `CashAccountsService.applyBalance(qr, accountId, -amount, username)` | ✅ |
| 注入 `CashTransactionsService.writeTransaction({qr, ...})` | ✅ |
| 事务模式从 `ds.transaction('SERIALIZABLE')` → `qr.createQueryRunner() + connect + startTransaction('SERIALIZABLE') + try/commit/catch/rollback/finally release` | ✅ 等价 |
| 其它 service 旁路扫描 | grep 仅 `cash-transactions.service`（单入口本身）+ `cash-accounts.service.applyBalance`（单入口）剩余命中合理 |

**结论**：F3 完整收口，**不违反**事务/统一原则。

### 2.4 F4 — AP 手工付款端点

| 检查项 | 证据 |
|---|---|
| 新 DTO `PayApInvoiceDto` (cashAccountId / amount / remark) + class-validator 校验 | ✅ |
| `ApInvoicesService.pay(invoiceId, dto)` SERIALIZABLE 事务 | ✅ |
| 先锁 invoice → 再锁现金账户 | ✅ 锁顺序固定 |
| DataScope 双维（company + project）校验 | ✅ |
| 状态校验 OPEN/PARTIALLY_PAID | ✅（用 ConflictException）|
| 金额校验 + 容差 0.005 | ✅ |
| 币种校验 `acct.currency_code === inv.currency_code` | ✅ |
| 账户余额 ≥ 付款金额 | ✅ |
| 调用 `CashAccountsService.applyBalance` + `CashTransactionsService.writeTransaction(source_type=AP_PAYMENT)` 单入口 | ✅ |
| 累加 paid_amount + 重算 status/payment_status | ✅ |
| Controller `@Post('invoices/:id/pay')` + `@RequireMenu('MENU_FIN2_AP', 'E')` | ✅ |

**结论**：F4 端到端事务一致 + 权限合规 + 单入口收口，**完美**。

### 2.5 F5 — 仅文档（attachment_urls 方案）

`docs/fin-attachment-extension-plan.md`：DDL 草案 + entity 调整 + DTO/service/前端改造路径 + 风险等级（🟢 低）+ 回滚剧本。

**结论**：F5 不动代码，无违规风险。

---

## 3. 是否引入新的主数据漂移

### 3.1 静态扫描验证

```
git show 01014a1 -- apps/api/src/ | grep -E "brd_farms|sys_store|prc2_projects|shr_projects"   → 空
git show bec0185 -- apps/api/src/ "apps/web/src/" | grep -E "brd_farms|sys_store|prc2_projects|shr_projects"  → 空
```

两个 commit 都**没有**新增对 4 个漂移源的引用。

### 3.2 W4 baseline 对账

| 漂移源 | W4 baseline | ERP 自承 | Finance 自承 | Audit 实测 |
|---|---|---|---|---|
| `brd_farms` | 27 hit | 27（持平） | 27（持平） | ✅ |
| `sys_store` | 3 hit | 3（持平） | 3（持平） | ✅ |
| `prc2_projects` | 6 hit | 6（持平） | 6（持平） | ✅ |
| `shr_projects` | 6 hit | 6（持平） | 6（持平） | ✅ |
| `prc2_suppliers`（canonical） | 13 | **14**（+1） | 13 | E3 引入 SupplierEntity import，**healthy growth** |

**结论**：**未引入新漂移**；唯一变化是 prc2_suppliers canonical 引用 +1，方向正确。

---

## 4. 事务一致性风险

| 改动 | 模式 | 一致性 |
|---|---|---|
| E3 `resolveSupplier(mgr, hints)` | 调用方在 `ds.transaction(async mgr => ...)` 内传 mgr | ✅ |
| E5 `assertInvStockStatus(em, status)` | 用 `this.em.query` 查 sys_dict（**事务外**，但只读静态字典 + 进程缓存） | ✅ 不影响业务事务一致性 |
| E6 `procurement.getApprovers` | 只读 SQL，非事务路径 | ✅ |
| E6 `workflow.isAdmin` | 内存 regex 判定 | ✅ 不涉事务 |
| E6 `byCompanyFinance` | 只读 `ds.query` | ✅ |
| F1 service 改读 CLS | 不改事务边界 | ✅ |
| F2 项目过滤新增 WHERE 条件 | 同上 | ✅ |
| F3 `reimbursements.pay` 改 qr 模式 | `qr.createQueryRunner + connect + startTransaction('SERIALIZABLE') + try { ... commit } catch { rollback } finally { release }`，把同一个 qr 传给 `applyBalance` 与 `writeTransaction` | ✅ 同事务内 |
| F4 `ap-invoices.pay` 同 qr 模式 | 与 F3 完全一致；锁顺序：先 invoice → 后现金账户 | ✅ |

**潜在观察 O-W1-C**：F4 锁顺序 = invoice → cash_account；若其它 AP 相关路径有相反顺序锁，Postgres SERIALIZABLE 会用 serialization conflict 而非 deadlock 解决（自动 rollback + 重试），但仍建议在 §8 W5 集成回归阶段做"双向锁压测"。

**结论**：事务一致性 **✅ 无重大风险**；F3/F4 单入口收口质量高。

---

## 5. 权限绕过风险

### 5.1 🔴 ERP E6 `workflow.isAdmin` 正则缺陷（必须修）

**代码**：`apps/api/src/modules/workflow/workflow.service.ts:1903-1909`

```ts
private isAdmin(user: WorkflowUser) {
  const perms = user.permissions || [];
  if (perms.includes('*')) return true;
  if (perms.some(p => /^MENU_WORKFLOW(:[*AEC])?$/.test(p))) return true;
  return user.username === 'admin';
}
```

**问题**：

1. JWT permissions 字段格式由 `auth/permissions-resolver.ts:50` 确定：
   ```
   `${menuCode}:${formatCodes(grants)}`
   ```
   `formatCodes` 是 `ALL_PERM_CODES.filter(...).join(',')` — 多字符以逗号分隔。
2. 实际典型值：`MENU_WORKFLOW:V`、`MENU_WORKFLOW:V,E`、`MENU_WORKFLOW:V,A`、`MENU_WORKFLOW:V,A,E,C`、`MENU_WORKFLOW:*`。
3. 新正则 `/^MENU_WORKFLOW(:[*AEC])?$/`：
   - `[*AEC]` 是字符类，匹配**单一字符**（`*` 或 `A` 或 `E` 或 `C`）
   - `(...)?` 可选整段
   - 只能匹配：`MENU_WORKFLOW`、`MENU_WORKFLOW:*`、`MENU_WORKFLOW:A`、`MENU_WORKFLOW:E`、`MENU_WORKFLOW:C`
   - **匹配不上**：`MENU_WORKFLOW:V,A`、`MENU_WORKFLOW:V,E`、`MENU_WORKFLOW:V,A,E`、`MENU_WORKFLOW:V,A,E,C` 等真实多权位组合

**影响**：

- ROLE_ADMIN 用户在 auth.service.login 时 `permissions = ['*']`（auth.service.ts:194-195），第一句 `perms.includes('*')` 命中 → 集团超管 isAdmin = true，不受影响。
- 用户名等于 'admin' 兜底 → 不受影响。
- **受影响**：非超管的"工作流二级管理员"，permission 集形如 `MENU_WORKFLOW:V,A,E,C` — 旧逻辑 `ROLE_ADMIN/ROLE_SYSOPS` 会通过，新逻辑 **不会**通过 → isAdmin = false → 在 workflow.service 内所有 `if (this.isAdmin(user))` 分支被绕过 → 业务功能（如手动指派审批人、删除定义、跨流程查询）回到非 admin 路径，**可能触发 403 或回退到只读视图**。

**修复建议**（任一即可，推荐第 3 个）：

1. `/^MENU_WORKFLOW(:[\w*,]+)?$/` — 简化但宽
2. `/^MENU_WORKFLOW(:.*[*AE].*)?$/` — 仅检测后缀含 `*`/`A`/`E`
3. **推荐**：直接复用 `hasPerm` util（`apps/api/src/auth/permissions.util.ts:hasPerm`），更可靠：
   ```ts
   import { hasPerm } from '../../auth/permissions.util';
   ...
   if (hasPerm(perms, 'MENU_WORKFLOW', 'A')) return true;
   if (hasPerm(perms, 'MENU_WORKFLOW', 'E')) return true;
   ```
   `hasPerm` 已正确处理 `'*'` 通配 + `V,C,E,D,A,X` 切分。

**修复后建议加单测**：构造 4 种 permissions 形态验 isAdmin true/false。

### 5.2 ERP E6 其它 PBAC 替换（无风险）

| 替换 | 评估 |
|---|---|
| `procurement.getApprovers` LIKE | 无误判（perm code 集合受限） |
| `byCompanyFinance` PBAC 查询 + ORDER BY role_code | ✅ |

### 5.3 Finance F1-F5

| 改动 | 权限影响 |
|---|---|
| F1 service 直读 CLS dataScope | ✅ 反而消除"controller 漏映射 allowedProjectCodes"的隐患（FINANCE_AUDIT §5.1 明确缺口已补） |
| F2 项目维度新增过滤 | ✅ 新增防线，不会绕过 |
| F3 reimbursements.pay | 未触 RBAC |
| F4 `@RequireMenu('MENU_FIN2_AP', 'E')` + 事务内双维 DataScope 校验 | ✅ 标准合规 |

**结论**：权限绕过风险 = **1 处 (E6 isAdmin 正则)**，必须修后合并 ERP 分支；Finance 全部 ✅。

---

## 6. 是否允许合并 ERP 分支

### 6.1 合并条件

| 项 | 状态 |
|---|---|
| 主数据原则 | ✅ |
| 主数据漂移 | ✅（+1 healthy growth） |
| 事务一致性 | ✅ |
| 权限绕过 | 🔴 §5.1 必须修 |
| ERP 白名单合规（PLAN §6.3） | ✅ |
| tsc 0 error（自承） | ✅ |
| W4 review §6 Audit 协助点（E6 后跑 g5c-rbac-audit） | ⏳ Audit 在合并门禁跑 |

### 6.2 决议

🟡 **有条件合并**

**前置条件（必须满足后才合）**：
1. 修复 `workflow.service.ts:isAdmin` 正则缺陷（推荐改用 `hasPerm`）。
2. 加 isAdmin 单测覆盖 5 种 permissions 形态：`['*']`、`['MENU_WORKFLOW']`、`['MENU_WORKFLOW:A']`、`['MENU_WORKFLOW:V,A,E,C']`、`['MENU_WORKFLOW:V']`。前 4 应 true；最后一个应 false。
3. 跑 `bash scripts/g5c-rbac-audit.sh`：admin + songmingguang(若 SONG_PASS) 全绿。
4. Audit Agent 在合并 PR 之前贴出 1 / 2 / 3 输出片段。

**预计修复工作量**：1 处文件改动 + 1 个单测文件，估 10 分钟。

---

## 7. 是否允许合并 Finance 分支

### 7.1 合并条件

| 项 | 状态 |
|---|---|
| 主数据原则 | ✅ |
| 主数据漂移 | ✅ 完全无变化 |
| 事务一致性 | ✅ qr 模式标准；单入口收口完整 |
| 权限绕过 | ✅ F1 还修复了 DataScope 命名错位（FINANCE_AUDIT §5.1） |
| Finance 白名单合规（PLAN §6.4） | ✅ |
| tsc 0 error（自承） | ✅ |
| F2 "NULL OR ANY" 过渡策略文档化 | 🟡 建议在 service 文件加注释，但**不阻塞合并** |

### 7.2 决议

✅ **直接合并**

**合并建议（合入后立即跟进，不阻塞）**：
1. 给 F2 项目过滤策略加注释："`NULL OR ANY` 是 W3 过渡兼容；W6+ 历史回填后切严格策略"。
2. 跑 `bash scripts/g5c-rbac-audit.sh`，确认非超管对 `/api/v2/finance/ap/invoices/:id/pay` 端点的 403 行为符合预期（无 MENU_FIN2_AP:E 应 403）。

---

## 8. 是否允许进入 W5

### 8.1 W5 解锁判定

W5 主战场（按 MULTI_AGENT_PHASE2_PLAN §5 与 W4_REVIEW §8.3）：
- Architect M2 / M3 子文档定稿
- Architect biz_projects 扩列 TS 迁移（5.3）— `project_manager_user_id` / `site_code` / `capital_status` / `equity_status` / `is_shareholder_managed` 五列 nullable
- Finance F2 项目维度上线后联调（依赖 ERP/Audit `sys_user_project_scopes` 覆盖度）
- ERP E1 / E2 / E4 / E7 进入"准备工作"
- Audit 新增 `scripts/check-public-controllers.mjs` 等红线

### 8.2 W5 前置条件（最小集）

| 条件 | 状态 |
|---|---|
| ERP §5.1 isAdmin 正则修复合入 | ⏳ 必须 |
| Finance F1-F5 合入 | ⏳ 必须 |
| Architect 输出 M2 子文档（含 prc2_projects + shr_projects 替换清单 = W4_REVIEW O-3 / O-4） | ⏳ 必须 |
| Architect 输出 M3 子文档（明文 STORE/FACTORY/WAREHOUSE 与 SITE 子类化口径 = W4_REVIEW O-1） | ⏳ 必须 |
| 前端 6→7 卡片渲染验证（O-2） | 🟡 W5 起首日跑 |
| F2 "NULL OR ANY" 策略文档化注释 | 🟡 W5 起首日补 |
| E5 fallback EXPIRED/LOCKED 历史数据梳理（O-W1-A） | 🟡 W5 内由数据质量 Agent 评估 |

### 8.3 W5 启动方式（建议）

ERP 修复合入 + Finance 合入 + Architect 发 M2/M3 子文档评审稿 → Audit 给 W5 wave 启动评审 → 进入实施。

**结论**：✅ **允许进入 W5**，但 W5 实施前必须先把 §6.2 / §7.2 / §8.2 条件清零。

---

## 9. 总决议

> **🟢 PASS WITH CONDITIONS**

### 9.1 条件

| # | 条件 | 责任方 | 截止 |
|---|---|---|---|
| C-1 | ERP `workflow.service.ts:isAdmin` 正则缺陷修复（推荐改 `hasPerm`） + 单测 + g5c-rbac-audit 通过 | ERP Agent | 合并 ERP 分支前 |
| C-2 | Finance 合入后 F2 加"NULL OR ANY 过渡"注释 + 跑 g5c 验 `/api/v2/finance/ap/invoices/:id/pay` 权限 | Finance Agent | 合入后 24h 内 |
| C-3 | Architect 出 M2（项目主数据收口含 prc2_projects/shr_projects 替换清单）+ M3（STORE/FACTORY/WAREHOUSE 与 SITE 子类化口径）子文档 | Architect Agent | W5 启动前 |
| C-4 | E5 fallback 含 EXPIRED/LOCKED 与 CLAUDE.md §7 五态不一致的过渡说明，进数据质量治理清单 | ERP / 数据质量 | W5 内启动评估 |
| C-5 | 前端 finance2/operations 首页 6→7 卡片渲染验证 | ERP / 前端 | W5 集成回归 |

满足 C-1 / C-3 = 进入 W5 必备；C-2 / C-4 / C-5 = 跟进不阻塞。

---

## 10. W5 建议

### 10.1 W5 内容范围（按 PLAN + 本 review 收紧）

| Wave 内容 | 主 Agent | 协 Agent | 时点 |
|---|---|---|---|
| M2 子文档评审 + 用户拍板 | Architect | Audit + Finance + ERP | W5 第 1-2 天 |
| M3 子文档评审 + 用户拍板（含 SITE 子类化口径，含 inv_batches 保留 warehouse_code） | Architect | Audit + ERP | W5 第 1-2 天 |
| biz_projects 扩列 TS 迁移（5 列 nullable，含 `project_manager_user_id`） | Architect | — | W5 第 3 天 |
| ERP workflow.byProjectManager **准备工作**（不切表，仅写灰度开关） | ERP | Architect | W5 第 4-5 天 |
| Audit 新增 `scripts/check-public-controllers.mjs`（W1 必交付的红线脚本） | Audit | — | W5 第 1-3 天 |
| 跑漂移基线对账（W4 + W1 实施后）`check-master-data-references.mjs --json > baseline.json` | Audit | — | W5 第 1 天 |
| F2 联调：`sys_user_project_scopes` 覆盖度审计（每个用户能看到哪些项目） | Audit + Architect + Finance | — | W5 第 4-5 天 |
| F5 attachment_urls 方案 Architect 评审 → 落 TS 迁移（W6 入） | Architect 主，Finance 协 | — | W5 末尾 |

### 10.2 W5 不做的事

- ❌ **不动 `inv_batches.store_code`**（仍是 W6 范围，M3 拍板后才动）
- ❌ **不切 `workflow.byProjectManager` 到 biz_projects**（M2 + biz_projects.project_manager_user_id 列上线后，**W6** 才正式切）
- ❌ **不动 `sys_user_scopes` 合表**（W7 启动，且 user 拍板 #4 排除 shareholder scope）
- ❌ **不动 `shr_projects` schema**（W6 才动，且需 Finance 评估节奏）
- ❌ **不引入新 W5 API 端点**（先把 F4 / W4 落地的端点稳住）

### 10.3 W5 验收门禁（Audit 推荐）

```bash
# 通用
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/tsc --noEmit
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt
node scripts/check-nullable-in-unique.js
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations

# W5 专项
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5-pre.json
# ... W5 实施后 ...
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5-post.json
diff /tmp/mdr-w5-pre.json /tmp/mdr-w5-post.json
# 期望:漂移 hit 数仅 biz_projects 上涨(W5 扩列引入新引用),其它持平

# RBAC 巡检（必跑）
bash scripts/g5c-rbac-audit.sh

# 公开端点扫描（首次）— W5 Audit 交付
node scripts/check-public-controllers.mjs apps/api/src

# F4 端点权限
NON_ADMIN_TOKEN=... curl -sf -X POST \
  -H "Authorization: Bearer $NON_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"cashAccountId":"...","amount":100}' \
  http://localhost:3100/api/v2/finance/ap/invoices/999/pay
# 期望 403
```

### 10.4 W5 合并顺序

```
1. ERP isAdmin 修复 PR        → Audit 审 → main           (C-1)
2. Finance F1-F5 PR           → Audit 审 → main           (C-2 跟进)
3. Architect M2 / M3 文档稿   → Audit/ERP/Finance 评审    (C-3)
4. 用户拍板 M2 / M3
5. Architect biz_projects 扩列 TS 迁移 → Audit 审 → main
6. ERP byProjectManager 灰度开关（service 改）→ Audit 审 → main
7. Audit check-public-controllers.mjs → main
8. F5 attachment_urls 迁移 → main (跨入 W6)
```

每个 PR 单独 tag：`v3-w5-<topic>-YYYYMMDD`。

---

**评审完毕。本评审结论：W1 **PASS WITH CONDITIONS**；Finance 可直接合，ERP
修 isAdmin 后合，Architect 出 M2/M3 子文档后进入 W5。**
