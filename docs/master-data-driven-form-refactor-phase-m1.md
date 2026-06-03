# 主数据驱动表单重构 Phase M1

> **日期**：2026-06-03 · **性质**：架构审计与规范设计（不改代码，M2 实施）
> **审计方法**：Workflow 4 路并行扫描（Finance/Sales/Procurement/Shareholder/主数据表）

---

## 0. 核心结论

> **全系统 A 类裸字段约 48 个。主要问题不是字段缺失，而是"该选择的字段变成了自由文本框"。最严重的集中在付款单（9 个裸字段）和采购模块（10 个）。**

---

## 1. 当前问题

### 1.1 全系统裸字段统计

| 模块 | 表单 | A 类裸字段 | 数量 |
|------|------|-----------|------|
| **Finance — 付款单** | procurement2/payments | 公司代码、公司名称、付款人、付款账户、收款方(供应商)、股东ID、股东姓名、分摊行-PO号、分摊行-项目 | **9** |
| Finance — AR 新建发票 | finance2/ar | 公司代码、客户名称 | 2 |
| Finance — AR 录入收款 | finance2/ar | 公司代码、客户名称 | 2 |
| Finance — AP 新建发票 | finance2/ap | 公司代码、供应商名称 | 2 |
| Finance — 费用申请 | finance2/expenses | 公司代码、公司名称 | 2 |
| **Procurement — 采购订单** | procurement2/orders | 公司代码、公司名称、项目编码、项目名称、供应商代码、供应商名称、合同URL(D)、明细-物品、明细-单位、仓库代码 | **10** |
| Procurement — 采购申请 | procurement2/requests | 公司代码、公司名称、项目编码、项目名称、转单-供应商代码/名称 | 6 |
| Sales — 销售订单 | sales2/orders | 公司代码、商品代码(非SKU路径)、渠道代码 | 3 |
| Sales — 客户主档 | sales2/customers | 公司代码、渠道编码、区域编码、销售员姓名 | 4 |
| Sales — 渠道管理 | sales2/customers | 公司代码、渠道编码 | 2 |
| Sales — 配送单 | sales2/delivery | 司机姓名、车牌号、公司代码、路线名称、销售订单ID | 5 |
| Sales — 司机/车辆 | sales2/delivery | 公司代码（×2） | 2 |
| POS — 门店设置 | store-pos | 门店编码、公司编码 | 2 |
| POS — 赊销结账 | store-pos | 客户姓名 | 1 |

**D 类凭证 URL 字段（文本框而非文件上传）：3 个**
- procurement2/payments → voucherUrl（凭证URL）
- procurement2/orders → contractUrl（合同URL）
- finance2（同付款单）

### 1.2 已正确实现的字段（亮点）

- 销售订单：**客户 ✅**（select from `/api/v2/sales/customers`）、**SKU ✅**（select from 主数据）、**价格自动带出 ✅**
- 付款单：**项目 ✅**（select from shr_projects，M1 前已修）
- 报销付款弹窗：**付款账户 ✅**（select from `/api/v2/finance/cash/accounts`）
- POS 收银：**商品 ✅**（主数据 API 卡片选择，非手填）

---

## 2. 付款单字段完整分析

**文件**：`apps/web/src/app/(admin)/procurement2/payments/page.tsx`

| 字段 | 当前实现 | 分类 | 改造方案 | M2 优先级 |
|------|---------|------|---------|----------|
| 付款日期 | `<input type="date">` | B | 保持 | — |
| 货币 | `<select>` 静态 CNY/LAK/THB/USD | B | 保持；可选联动汇率 | P2 |
| **公司代码** | 裸 `<input>` | **A** | → `CompanySelector`（从 org_units 加载） | **P0** |
| **公司名称** | 裸 `<input>` | **A** | → readOnly，由公司选择自动带出 | **P0** |
| 项目编号 | `<select>` from shr_projects | A ✅ | 已正确 | — |
| 项目名称 | readOnly 自动带出 | C ✅ | 已正确 | — |
| 付款方类型 | `<select>` 静态枚举 | B | 保持；触发 Shareholder 区域显隐 | — |
| **付款人** | 裸 `<input>` | **A** | → 按 payerType 切换：员工→UserSelector，股东→由股东选择联动 | **P1** |
| **付款账户** | 裸 `<input>` | **A** | → `<select>` from `/api/v2/finance/cash/accounts`（报销已实现，复用） | **P0** |
| **收款方(供应商)** | 裸 `<input>` | **A** | → `SupplierSelector`（search from `/api/v2/procurement/suppliers`） | **P0** |
| 付款方式 | `<select>` 静态 | B | 保持 | — |
| 资金性质 | `<select>` 静态 | B | 保持 | — |
| **股东 ID** | 裸 `<input>` | **A** | → `ShareholderSelector`（从 shr_shareholders 选择，仅 payerType=SHAREHOLDER 显示） | **P0** |
| **股东姓名** | 裸 `<input>` | **A** | → readOnly，由股东选择自动带出 | **P0** |
| 汇率 | `<input type="number">` | B | 保持；可选货币联动 | P2 |
| **凭证 URL** | 裸 `<input>` 文本框 | **D** | → `AttachmentUploader`（design-system 已存在） | **P0** |
| 备注 | `<textarea>` | E | 保持 | — |
| 分摊-应付单号 | readOnly 弹窗选入 | C ✅ | 已正确 | — |
| **分摊-采购订单号** | 裸 `<input>` | **A** | → PO 搜索选择（from `/api/v2/procurement/orders?status=APPROVED`） | P1 |
| **分摊-项目** | 裸 `<input>` | **A** | → 复用主表单 `ProjectSelector` | P1 |

**付款单 P0 改造项：6 个**（公司代码/名称、付款账户、收款方、股东ID/姓名、凭证URL）

---

## 3. 主数据映射规则

| 字段类型 | 数据来源 | 前端接口 | 过滤条件 | Value | Label | 带出字段 |
|---------|---------|---------|---------|-------|-------|---------|
| 公司 | org_units | `GET /api/org/organizations?orgType=COMPANY` | 用户 DataScope | orgCode | orgName | companyName 自动带出 |
| 项目 | shr_projects | `GET /api/crud/shr_projects` 或 `shareholderApi.listProjects()` | company_code（可选） | project_code | project_name | project_name 带出 |
| 供应商 | prc2_suppliers | `GET /api/v2/procurement/suppliers` | owner_company_code | supplier_code | supplier_name | supplier_name |
| 客户 | sal_customers | `GET /api/v2/sales/customers` | company_code | customer_no | customer_name | — |
| 股东 | shr_shareholders | `shareholderApi.listShareholders()` | — | shareholder_code | shareholder_name | shareholder_name |
| 付款账户 | fin_cash_accounts | `GET /api/v2/finance/cash/accounts` | company_code | account_code | account_name | account_name |
| 员工/用户 | sys_user | `GET /api/crud/sys_user?limit=200` | — | username | real_name | real_name |
| 渠道 | sal_channels | `GET /api/v2/sales/channels` | company_code | channel_code | channel_name | — |
| SKU/商品 | product_skus | `GET /api/product-master/skus` | — | sku_code | sku_name | productCode + gradeCode |
| 司机 | sal_delivery_drivers | `GET /api/v2/sales/delivery/drivers` | company_code | driver_id | driver_name | phone |
| 车辆 | sal_delivery_vehicles | `GET /api/v2/sales/delivery/vehicles` | company_code | vehicle_no | plate_no | — |
| 货币 | 静态枚举 | 无需 API | — | CNY/LAK/USD/THB | 人民币/老挝基普/美元/泰铢 | 触发汇率联动（P2） |

> **注意**：sal_*/fin_*/prc2_* 表均在 generic-crud 黑名单，**必须走各自 Runtime API**，不得用 `/api/crud/` 前缀。

---

## 4. DataScope 规则

### 4.1 各模块过滤要求

| 模块 | DataScope 级别 | 前端实现要求 | 后端现状 |
|------|--------------|------------|---------|
| 付款单列表 | COMPANY：只看本公司 | 需补充 companyCode 筛选器 | generic-crud 支持 WHERE company_code |
| 供应商列表 | COMPANY：按 owner_company_code；GROUP：全看 | 当前无公司过滤，需补充 | 后端支持 |
| AR/AP 发票 | COMPANY：按 company_code | 当前无公司筛选器，需补充 | Runtime API 视接口 |
| 费用申请 | COMPANY：员工只申请所在公司 | 创建时 companyCode 预填且锁定 | 需后端创建时校验 |
| 配送单 | COMPANY：按公司过滤 | 无公司过滤，需补充 | 支持 |
| 股东数据 | ShareholderScope 已有 | 已实现（M1 前完成） | ✅ |

### 4.2 前端实现规范（M2 统一原则）

1. 页面加载时调用 `/api/org/organizations` 获取用户有权限的公司列表（后端鉴权返回 DataScope 范围）
2. **单公司用户**：表单中 companyCode **自动预填且锁定**，不展示下拉
3. **集团用户**（GROUP DataScope）：展示 `CompanySelector` 下拉，允许切换公司视角
4. **列表页**：统一在顶部筛选区增加公司过滤下拉，默认选用户首选公司

---

## 5. 股东代付标准流程

```
1. 付款单表单 → payerType 选"股东代付"（SHAREHOLDER）
2. 条件渲染：显示 ShareholderSelector（shr_shareholders 主数据）
3. 选择股东 → shareholderId 填入（readOnly），shareholderName 自动带出
4. 提交付款单 → POST /api/v2/procurement/payments
   payload: { payerType: 'SHAREHOLDER', shareholderId, shareholderName, ... }
5. 审批通过 → 状态流转 PAID
6. 后端自动写 Capital Flow：
   - capital_flow.shareholder_id = payment.shareholder_id
   - capital_flow.flow_type = 'ADVANCE'（垫资）
   - capital_flow.amount = payment.amount
   - capital_flow.ref_type = 'PAYMENT', ref_id = payment.id
7. 股东资金池面板显示垫资记录，待后续核销
```

**关键约束**：
- 股东 ID/姓名必须来自 `shr_shareholders` 主数据，禁止手填
- Capital Flow 写入与付款完成在同一事务或幂等补偿任务
- 股东代付记录在「股东资金→出资记录」页面可追溯

---

## 6. 附件体系（凭证 URL 改造）

**当前问题**：付款单、采购订单的凭证/合同字段是裸文本框，让用户手填 URL。

**改造方案**：替换为 `AttachmentUploader`（已存在于 `components/design-system/forms/AttachmentUploader.tsx`）。

```tsx
// 改造前
<input value={voucherUrl} onChange={...} placeholder="付款凭证图片链接" />

// 改造后
<AttachmentUploader
  value={voucherUrl}
  onChange={(url) => setVoucherUrl(url)}
  accept="image/*,.pdf"
  label="付款凭证（图片或PDF）"
/>
```

**后端**：需确认文件上传接口 `POST /api/upload/attachment` 存在且支持图片/PDF。

---

## 7. 统一表单组件规范（M2 建立）

**需要建立**（放入 `apps/web/src/components/shared-selectors/`）：

| 组件名 | 数据来源 | 功能 |
|-------|---------|------|
| `CompanySelector` | org_units / `/api/org/organizations` | 带 DataScope 过滤的公司下拉 |
| `SupplierSelector` | prc2_suppliers | 供应商搜索选择 + 带出名称 |
| `CustomerSelector` | sal_customers | 客户搜索选择 |
| `ShareholderSelector` | shr_shareholders | 股东下拉 + 带出姓名 |
| `CashAccountSelector` | fin_cash_accounts | 资金账户下拉（已有逻辑可复用） |
| `UserSelector` | sys_user | 已在 design-system 存在，直接复用 |
| `ProjectSelector` | shr_projects | 已在付款单实现，抽成通用组件 |
| `DriverSelector` | sal_delivery_drivers | 司机选择 |
| `VehicleSelector` | sal_delivery_vehicles | 车辆选择 |
| `SkuSelector` | product_skus | SKU 选择（已有逻辑可复用） |

**复用原则**：先看 `components/design-system/forms/` 下已有的 `SelectField`/`UserSelector` 等，封装成 Scoped 版本，不重复造轮子。

---

## 8. M2 实施计划

### P0 — 必须先改（影响数据正确性）

| 改造项 | 文件 | 工作量 |
|--------|------|--------|
| 付款单：公司代码→ `CompanySelector` + 名称自动带出 | procurement2/payments | S |
| 付款单：付款账户→ `<select>` from fin_cash_accounts | procurement2/payments | XS（复用报销逻辑）|
| 付款单：收款方→ `SupplierSelector` | procurement2/payments | S |
| 付款单：股东ID/姓名→ `ShareholderSelector`（条件渲染）| procurement2/payments | S |
| 付款单：凭证URL→ `AttachmentUploader` | procurement2/payments | XS |
| AR/AP：公司代码→ `CompanySelector` | finance2/ar, finance2/ap | S |
| 费用申请：公司代码→ `CompanySelector` + 预填锁定 | finance2/expenses | XS |

### P1 — 建议改（常用功能体验提升）

| 改造项 | 文件 | 工作量 |
|--------|------|--------|
| 付款单：分摊行项目→ `ProjectSelector` | procurement2/payments | XS |
| 付款单：分摊行PO→ PO 搜索选择 | procurement2/payments | M |
| 采购订单：供应商→ `SupplierSelector` | procurement2/orders | S |
| 采购订单：公司/项目→ Selector | procurement2/orders | S |
| 配送单：司机/车辆→ `DriverSelector`/`VehicleSelector` | sales2/delivery | S |
| POS 门店设置：门店编码→ `<select>` | store-pos | S |
| AR 新建：客户→ `CustomerSelector` | finance2/ar | S |

### P2 — 后续优化

| 改造项 |
|--------|
| 汇率联动货币自动带出 |
| 全站列表页统一 CompanySelector 筛选器 |
| DataScope 自动预填 + 锁定单公司用户 |
| 股东代付 Capital Flow 自动写入后端 Hook |

---

## 必须回答

1. **当前裸字段数量**：A 类主数据裸字段约 **48 个**；D 类凭证 URL 文本框 **3 个**。

2. **哪些字段必须禁止手填**：
   - 公司名称（由公司代码联动带出）
   - 项目名称（已实现）
   - 股东姓名（由股东选择联动带出）
   - 付款账户名称（由账户选择联动带出）

3. **哪些字段应自动带出**：公司名称、项目名称、股东姓名、账户名称、币种（从账户）、供应商名称（选择后带出）

4. **哪些字段应 DataScope 控制**：公司选择（最核心）、供应商列表、客户列表、付款账户列表、AR/AP 列表、费用申请公司预填

5. **付款单最终标准流程**：
   - 选公司 → 自动过滤项目/供应商/账户
   - 选项目 → 带出名称
   - 选付款类型 → 切换数据源（供应商/员工/股东）
   - 选收款方 → 供应商主数据搜索
   - 选付款账户 → 带出账户名/币种
   - 上传凭证 → AttachmentUploader
   - 股东代付→选股东→带出姓名→付款后自动写Capital Flow

6. **是否允许进入 M2**：🟢 **允许**。M1 已明确所有裸字段位置、主数据映射规则、DataScope 规范、统一组件体系。M2 从 P0 项开始实施（付款单 6 个 P0 改造）。
