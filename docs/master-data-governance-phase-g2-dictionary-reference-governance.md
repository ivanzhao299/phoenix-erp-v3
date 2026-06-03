# 主数据治理 G2 — 数据字典治理 & 引用治理

> **日期**：2026-06-03 · **依据**：G0 蓝图 + G1 主数据中心
> **本期交付**：8 枚举迁入 sys_dict + DictSelect 统一组件 + 生效日期治理 + 引用治理规则 + Workflow 接入方案
> **诚实声明**：字典数据层与 DictSelect 组件已建立并示范迁移；**全量替换前端硬编码枚举**（跨数十个表单）属增量改造，本期完成数据基础 + 组件 + 1 处示范，逐表单替换列入 G3/G4。

---

## 0. 结论速览

| 维度 | G2 交付 |
|------|---------|
| 8 枚举迁入 sys_dict | ✅ 41 个字典项（中文 dict_label_zh + 英文 dict_label_en）|
| DictSelect 统一组件 | ✅ 封装 useDictOptions，从 sys_dict 动态读取 |
| 硬编码替换 | 🟡 付款单货币字段已示范替换；其余增量（G3/G4）|
| 生效日期治理 | ✅ 6 表补 effective_date/expire_date |
| 引用治理规则 | ✅ ACTIVE/FROZEN/ARCHIVED 规则设计 |
| Workflow 接入方案 | ✅ 5 类主数据审批设计 |

---

## 1. 数据字典体系

### 1.1 第一批迁入 sys_dict（8 类，41 项）

| dict_type | 中文 | 项数 | 值域 |
|-----------|------|------|------|
| SYS_CURRENCY | 货币 | 5 | CNY 人民币 / LAK 老挝基普 / THB 泰铢 / USD 美元 / VND 越南盾 |
| SAL_CUSTOMER_TYPE | 客户类型 | 5 | 直营门店 / 经销商 / 代理商 / 大客户 / 零售客户 |
| FIN_EXPENSE_TYPE | 费用类型 | 7 | 差旅费 / 餐饮费 / 招待费 / 办公费 / 物料费 / 运输费 / 其他 |
| PRC_PAYMENT_METHOD | 付款方式 | 5 | 银行转账 / 现金 / 转账 / 支付宝 / 微信 |
| FIN_FUND_NATURE | 资金性质 | 4 | 投资款 / 借款 / 垫资 / 普通 |
| PRC_PAYER_TYPE | 付款方类型 | 4 | 公司 / 股东代付 / 借款方 / 内部 |
| PRC_PURCHASE_TYPE | 采购类型 | 5 | 原料 / 设备 / 服务 / 固定资产 / 其他 |
| SYS_COUNTRY | 国家 | 6 | 老挝 / 中国 / 泰国 / 越南 / 美国 / 其他 |

**数据保护合规**：迁移仅幂等 INSERT（WHERE NOT EXISTS），**不 DELETE/UPDATE sys_dict 已有记录**（遵守 sys_dict 保护规则）。本地实跑 41 项迁入，二次执行 INSERT 0（幂等）。

### 1.2 字典字段规范

| 字段 | 用途 |
|------|------|
| dict_type | 字典分类（SYS_CURRENCY 等） |
| dict_code | 值（CNY/BANK，业务存储用此值） |
| dict_label_zh | 中文显示（人民币/银行转账）|
| dict_label_en | 英文（国际化用，本期预填） |
| dict_value | = dict_code |
| sort_no | 排序 |
| status | ACTIVE/FROZEN/ARCHIVED |

---

## 2. DictSelect 规范

**组件**：`apps/web/src/components/shared-selectors/DictSelect.tsx`（封装现有 `useDictOptions` hook）

```tsx
<DictSelect dictType="SYS_CURRENCY" value={currency} onChange={setCurrency} allowEmpty={false} />
<DictSelect dictType="PRC_PAYMENT_METHOD" value={method} onChange={setMethod} placeholder="请选择付款方式" />
```

- value = dict_code（CNY/BANK）；显示 dict_label_zh（人民币/银行转账）
- 仅加载 `status=ACTIVE` 字典项（FROZEN/ARCHIVED 不出现在新单据下拉，符合引用治理）
- 模块级缓存（useDictOptions 内置），避免重复请求 sys_dict

**示范迁移**：付款单「货币」字段已从硬编码 `CURRENCY_OPTS=["CNY","LAK","THB","USD"]` 替换为 `<DictSelect dictType="SYS_CURRENCY">`——并自动获得 VND 越南盾（修复 G0 发现的值域缺失）。

---

## 3. 引用治理规则

| 主数据状态 | 新增引用 | 历史单据 | 下拉可见性 |
|-----------|---------|---------|----------|
| **ACTIVE** | ✅ 允许 | ✅ 正常 | 出现在所有 Selector 下拉 |
| **FROZEN** | ❌ 禁止新增引用 | ✅ 允许查看历史单据 | 不出现在新单据下拉；详情页历史记录仍显示 |
| **ARCHIVED** | ❌ 禁止引用 | ✅ 历史单据保留 | 完全不出现在下拉；仅审计/历史可见 |

**实现机制（统一原则）**：
- 所有 Scoped Selector / DictSelect **只加载 `status='ACTIVE'`** 的主数据（前端层第一道防线）
- 后端创建业务单据时校验引用的主数据 status='ACTIVE'（后端层第二道防线，防绕过）
- **禁止物理删除已被引用的主数据**，用 FROZEN→ARCHIVED 软冻结归档替代

---

## 4. 生命周期与生效日期

### 4.1 生效日期列（本期补齐）

为以下 6 张关键主数据表新增 `effective_date` / `expire_date`（可空，非破坏）：

| 表 | 对象 |
|----|------|
| sal_customers | 客户 |
| prc2_suppliers | 供应商 |
| shr_projects | 项目公司 |
| shr_shareholders | 股东 |
| mst_bank_accounts | 银行账户 |
| fin_cash_accounts | 资金账户 |

**字典型主数据**（付款方式/结算方式/税率）的生效日期存于 `sys_dict.config_json`（如 `{"effectiveDate":"2026-01-01","taxRate":0.13}`），不单独建列。

### 4.2 生效逻辑

- 引用时校验：`effective_date IS NULL OR effective_date <= 今天` 且 `expire_date IS NULL OR expire_date >= 今天`
- 未生效/已过期的主数据不出现在新单据下拉（与 FROZEN 同等处理）

---

## 5. Workflow 2.0 接入方案

### 5.1 需接入审批的主数据（5 类）

| 主数据 | 审批触发 | 审批链 | 业务类型 (bizType) |
|--------|---------|--------|-------------------|
| 供应商新增 | DRAFT 提交 | 采购主管 → 财务总监 | MD_SUPPLIER_CREATE |
| 客户新增 | DRAFT 提交（含信用额度）| 销售主管 → 财务总监 | MD_CUSTOMER_CREATE |
| 银行账户新增 | DRAFT 提交 | 财务总监 → CEO | MD_BANK_ACCOUNT_CREATE |
| 资金账户新增 | DRAFT 提交 | 财务总监 → CEO | MD_CASH_ACCOUNT_CREATE |
| 项目公司新增 | DRAFT 提交 | CEO / 董事会 | MD_PROJECT_CREATE |

### 5.2 接入设计（统一模式）

```
1. 主数据维护页 → 填写 → 保存为 DRAFT（status=DRAFT）
2. 提交审批 → ApprovalEngineService.startApproval({
     bizType: 'MD_SUPPLIER_CREATE',
     bizId: 主数据 id, bizCode: 主数据编码,
     payload: { 主数据快照 }
   })
   → status=PENDING_APPROVAL
3. 审批节点逐级审批（Workflow 2.0 审批引擎驱动）
4. 全部通过 → 回调 Hook：status=ACTIVE + 写 mst_audit_trail(action=CREATE)
   → 此时主数据才可被业务单据引用
5. 任一节点拒绝 → status=REJECTED，可修改后重新提交
```

- 复用现有 `ApprovalEngineService` + `WorkflowBizRegistry`（注册 5 个 MD_* bizType）
- 主数据 status 与审批实例状态联动（PENDING_APPROVAL → ACTIVE/REJECTED）
- G1 已建 mst_audit_trail，审批通过自动记审计

### 5.3 本期产出

- Workflow 接入为**设计方案**（实现属 G3）。原因：需在审批引擎注册 5 个 bizType + 各主数据 CRUD 页接入提交审批按钮，依赖 G1 后续的客户/供应商 CRUD 化先完成。

---

## 6. G3 实施路线

| 阶段 | 目标 | 关键交付 | 先决条件 |
|------|------|---------|---------|
| **G3-1** | 客户/供应商/账户 CRUD 化 | 接入 CodeGenerator(G1) + status 生命周期 + 生效日期 + DictSelect | G1+G2 |
| **G3-2** | 5 类主数据 Workflow 审批接入 | 注册 5 个 MD_* bizType + DRAFT→PENDING→ACTIVE 状态机 | G3-1 + 审批引擎 |
| **G3-3** | 硬编码枚举增量替换 | 各表单货币/客户类型/费用类型/付款方式 → DictSelect | G2 DictSelect（已就绪）|
| **G3-4** | 引用治理后端校验 | 业务单据创建时校验引用主数据 status='ACTIVE' + 生效日期 | G3-1 |

---

## 必须回答

1. **哪些枚举迁入 sys_dict**：8 类（货币/客户类型/费用类型/付款方式/资金性质/付款方类型/采购类型/国家），共 41 项，含中英文标签。

2. **哪些字段仍硬编码**：本期仅示范迁移付款单货币字段；其余表单的货币/客户类型/费用类型/付款方式仍硬编码，G3-3 用 DictSelect 增量替换（组件已就绪）。供应商类型（前后端语义分裂）需先业务澄清再迁移。

3. **ACTIVE/FROZEN/ARCHIVED 规则**：ACTIVE 允许引用；FROZEN 禁止新增引用但保留历史单据查看；ARCHIVED 禁止引用但历史单据保留。前端 Selector 只加载 ACTIVE + 后端创建时二次校验。

4. **哪些主数据需要 effective_date**：客户/供应商/项目/股东/银行账户/资金账户（6 表已补列）；付款方式/结算方式/税率（字典型，存 config_json）。

5. **哪些对象接入 Workflow**：供应商、客户、银行账户、资金账户、项目公司新增（5 类，注册 MD_* bizType）——本期设计，实现属 G3。

6. **是否允许进入 G3**：🟢 **允许**。G2 已建好字典数据层 + DictSelect 组件 + 引用治理规则 + 生效日期列 + Workflow 接入方案。G3 进入客户/供应商 CRUD 化 + Workflow 审批落地 + 硬编码增量替换。

---

## 验证结果

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等（41 字典项 / 6 表生效日期列）|
| DictSelect 示范 | ✅ 付款单货币字段已替换，自动获得 VND |

---

## 附录 · 变更文件

- `apps/api/migrations/20260603_g2_dictionary_governance.sql`（8 字典 seed + 生效日期列）
- `apps/web/src/components/shared-selectors/DictSelect.tsx`（统一字典下拉组件）
- `apps/web/src/app/(admin)/procurement2/payments/page.tsx`（货币字段示范迁移）
- `docs/master-data-governance-phase-g2-dictionary-reference-governance.md`（本报告）
