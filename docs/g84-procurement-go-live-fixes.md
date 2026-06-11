# G84 — 采购模块上线就绪审计 + 修复报告

> 触发：审计采购模块是否完成数据绑定/主数据对接、能否给生产用户开通使用。
> 日期：2026-06-11　验证：Web tsc 0 · API tsc 0

---

## 1. 采购角色

| 角色 | 定位 | 采购权限 |
|---|---|---|
| **ROLE_PRC_BUYER** | 采购员（主） | 全套 MENU_PRC2_*（订单/收货/发货/付款 V,C,E,X；主数据 V,C,E）+ WORKFLOW V,A |
| ROLE_REGION_MGR | 区域督导 | 各单 V（审批链第 2 级） |
| ROLE_CEO | 总裁 | V,X（审批链第 3 级，>5万） |
| ROLE_PROJECT_MGR / FARM_MGR / LOG_MGR / FIN_ACCT / FIN_CFO / FACTORY_ACCT | 项目/场长/物流/财务 | V ~ V,C,E（按职责） |

审批链已配置（ddl 实证）：`PRC_ORDER` ≤5万 BUYER→REGION_MGR；>5万 再加 CEO。orders/requests/payments 已真正接 `ApprovalEngineService.startApproval`。

---

## 2. 审计结论（修正后）

**误报澄清**：`MENU_PRC2_RECEIPT/SHIPMENT` 看似漏注册，实则已 INSERT 进 sys_menu（`20260527_v2_menu_rbac_seed.sql:25-26`），生产启动 `hydrateMenuRegistry` 从 sys_menu 加载 → 已注册，**无 403 硬阻断**。menu-registry 的 FALLBACK 常量漏列仅影响"sys_menu 查询失败"的兜底态。

**端到端可用链（无 crash）**：申请→审批→转订单→金额分级审批→收货确认→自动生成应付台账→付款→自动核销 AP（+股东代付自动记台账）。DataScope 按公司/项目隔离生效，编号并发锁安全。

**就绪定级**：🟡 有条件就绪 → 本轮修复后核心流程可放心开通。

---

## 3. 本轮修复（G84）

| Fix | 内容 | 状态 |
|---|---|---|
| **Fix 1** | 前端 3 瑕疵：收货页补明细合计行；发货页国家→SYS_COUNTRY 字典 + 海关状态中文化；订单页跨境国家硬编码 select→字典 | ✅ 完成 |
| **Fix 3** | **收货→库存断链修复**：新增 `WmsService.inboundFromReceipt(manager, ctx)` 统一入库口，收货确认事务内调用，写 inv_batches（status=AVAILABLE）+ inv_ledger（INBOUND，ref_no=收货单号可追溯）。守 CLAUDE.md #6 唯一写入口 / #7 状态唯一来源。删除原 `reserveInbound` 占位。procurement-v2.module 单向 import WmsModule（无循环依赖）。 | ✅ 完成 |
| **Fix 4** | menu-registry FALLBACK 补 RECEIPT/SHIPMENT（兜底态防 403，防御性） | ✅ 完成 |
| **Fix 2** | 付款→财务流水断链 | ⏸️ **并入下一阶段全流程审计**（见下） |

---

## 4. 下一阶段：采购全流程账户/库存/项目关联深审（待启动）

用户明确："之后再审计流程引擎，与股东资金账户关联，与多公司账户关联，与不同项目关联等全流程问题"。

**Fix 2（付款→财务流水）归入此阶段**——因其正确实现强依赖账户关联决策：
- 付款扣款账户：`payerAccount` 是否绑定 `fin_cash_accounts`？公司现金账户 vs 股东账户（`isShareholderPayment`）扣款路径不同。
- 多公司：付款公司 → 记到哪本资金账户。
- 写法：经 `CashTransactionsService.writeTransaction` + `cashAccountsService.rebuildBalanceChain` 重算余额链（官方唯一写入口），不可绕过。

**此阶段还应覆盖**：
- 流程引擎：审批链 `@deprecated` 本地 approve/reject vs 标准 `/api/approval/instances/:id` 的收口。
- 供应商：自有表 `prc2_suppliers` 与主数据中心 supplier 的关联/同步。
- 物料：item_code 字符串 → product-master SKU 化。
- 项目关联：采购单据 project_code 与项目主数据/成本归集的闭环。
- DataScope 仓库维度补全。

---

## 5. 给"开通权限"的结论

- **现在可开**：`ROLE_PRC_BUYER`（采购员）、`ROLE_REGION_MGR`（审批）——申请/订单/收货（本轮起自动入库）/应付全链正常，不报错。
- **付款功能**：可登记+核销 AP，但**暂不写财务总账流水**（Fix 2 待下阶段）；若财务对账要求高，付款执行环节建议待 Fix 2 完成后再全量开放，或明示财务侧暂行单独登记。
