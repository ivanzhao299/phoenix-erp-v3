# Phoenix ERP V3 — 客户主档整合审计报告
**Phase F: Customer Master Consolidation Audit**  
**日期**: 2026-05-29  
**Commit**: v3-customer-master-consolidation-audit-20260529  
**审计范围**: ord_customers · b2b_customers · sal_customers · crm_members

---

## 一、Executive Summary

系统当前存在 **四套客户数据来源**，相互孤立，无统一主档：

| 表 | 定位 | 记录估计 | 当前状态 |
|----|------|---------|---------|
| `sal_customers` | Sales V2 统一正式主档 | 新建（生产期） | **✅ 唯一正式主档** |
| `ord_customers` | 旧 B2B/散客订单客户 | 历史数据 | ⚠️ 封存但仍被 2 处读取 |
| `b2b_customers` | 旧分销商/经销商主档 | 历史数据 | ⚠️ 封存但仍被 1 处读取 |
| `crm_members` | 门店会员忠诚度体系 | 活跃写入 | 🟡 独立体系，不完全重叠 |

**核心问题**：  
`store-pos/services/sales-engine.service.ts` 仍从 `ord_customers` 读取 `risk_flag` 做 POS 黑名单拦截，而 `sal_customers` 的等效字段是 `risk_level`，两者数据完全独立。**这是当前最高优先级的整合阻塞点。**

**唯一正式客户主档**：`sal_customers`（Sales V2 Phase 0 建立，Phase 5 扩展信用控制）

---

## 二、四套客户表结构对比

### 2.1 sal_customers — 统一客户主档（正式）

**来源**: `migrations/20260527_sales_v2_phase0_baseline.sql` + Phase 5 扩展

| 字段 | 类型 | 备注 |
|------|------|------|
| `id` | BIGSERIAL PK | 自增主键 |
| `customer_no` | VARCHAR(64) UNIQUE | 客户编号（唯一约束） |
| `customer_name` | VARCHAR(128) NOT NULL | 客户名称 |
| `customer_type` | VARCHAR(32) DEFAULT 'RETAIL' | DIRECT_STORE / DISTRIBUTOR / AGENT / KEY_ACCOUNT / RETAIL |
| `channel_code` | VARCHAR(64) | → sal_channels.channel_code |
| `company_code` | VARCHAR(64) NOT NULL | 法人主体（DataScope 隔离）|
| `company_name` | VARCHAR(256) | 公司全称 |
| `region_code` | VARCHAR(64) | 区域编码 |
| `credit_limit` | NUMERIC(18,2) DEFAULT 0 | 授信总额度 |
| `credit_used` | NUMERIC(18,2) DEFAULT 0 | 已占额度（Runtime 维护）|
| `payment_terms` | INTEGER DEFAULT 0 | 账期天数 |
| `risk_level` | VARCHAR(32) DEFAULT 'NORMAL' | NORMAL / WATCH / BLACKLIST |
| `status` | VARCHAR(32) DEFAULT 'ACTIVE' | ACTIVE / FROZEN / BLACKLIST |
| `sales_rep_id` | BIGINT | 归属销售员 |
| `sales_rep_name` | VARCHAR(128) | 归属销售员姓名 |
| `contact_name` | VARCHAR(128) | 联系人 |
| `contact_phone` | VARCHAR(64) | 联系电话 |
| `delivery_address` | TEXT | 默认配送地址 |
| `remark` | TEXT | 备注 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |
| `credit_status` | VARCHAR(32) DEFAULT 'NORMAL' | Phase 5: NORMAL/WARNING/OVER_LIMIT/OVERDUE/FROZEN |
| `last_overdue_at` | TIMESTAMPTZ NULL | Phase 5: 最近逾期时间（Scheduler 写入）|
| `auto_frozen` | BOOLEAN DEFAULT FALSE | Phase 5: 系统自动冻结标志 |

**索引**: `idx_sal_customers_company`, `idx_sal_customers_type`, `idx_sal_customers_status`, `idx_sal_cust_credit_status`, `idx_sal_cust_auto_frozen`, `idx_sal_cust_risk_level`, `idx_sal_cust_last_overdue`

**TypeORM Entity**: `sal-customer.entity.ts` ✅  
**Service**: `customers.service.ts` ✅ (完整 CRUD + 冻结/黑名单/信用)  
**Frontend CRUD**: `/sales2/customers` ✅ (完整页面)  
**是否有历史数据**: 新建（Sales V2 Phase 0 以来写入）  
**是否仍被写入**: ✅ 是（Sales V2 全量写入，Phase 5 Scheduler 每日维护）  
**是否仍被读取**: ✅ 是（8 个服务文件读取）  

---

### 2.2 ord_customers — 旧订单客户主档（历史封存）

**来源**: `generic-crud/generic-crud.service.ts` 动态 DDL 引导

| 字段 | 类型 | 备注 |
|------|------|------|
| `id` | SERIAL PK | |
| `customer_code` | VARCHAR(50) UNIQUE | 客户编号 |
| `customer_name` | VARCHAR(100) | 客户名称 |
| `phone` | VARCHAR(30) | 联系电话 |
| `region` | VARCHAR(100) | 区域（非编码化）|
| `credit_limit` | DECIMAL(12,2) DEFAULT 0 | 信用额度 |
| `credit_used` | DECIMAL(12,2) DEFAULT 0 | 已用额度 |
| `tier` | VARCHAR(20) | 客户等级（A/B/C/D） |
| `status` | VARCHAR(20) DEFAULT 'ACTIVE' | 状态 |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `risk_flag` | VARCHAR(20) DEFAULT 'NORMAL' | **⚠️ 黑名单标志** NORMAL / BLACKLIST |
| `protection_status` | VARCHAR(20) DEFAULT 'INIT' | 客户保护状态 |
| `current_owner_subject_id` | VARCHAR(64) | 归属销售员 ID |

**无 company_code / channel_code / region_code（编码化）/ customer_type**  
**无 risk_level（使用 risk_flag，字段名与 sal_customers 不同）**  
**无 contact_name / delivery_address（多地址支持缺失）**

**是否有历史数据**: ✅ 有（旧 OrderModule 时期创建的 B2B/散客订单客户）  
**是否仍被写入**: ⚠️ 仅 `generic-crud.service.ts` 动态建表/种子数据（非业务写入）  
**是否仍被读取**: ⚠️ **2 处仍在读取**（详见第三节）  

---

### 2.3 b2b_customers — 旧经销商主档（历史封存）

**来源**: `generic-crud/generic-crud.service.ts` 动态 DDL 引导

| 字段 | 类型 | 备注 |
|------|------|------|
| `id` | SERIAL PK | |
| `customer_code` | VARCHAR(50) UNIQUE | 客户编号 |
| `customer_name` | VARCHAR(100) | 经销商名称 |
| `contact` | VARCHAR(100) | 联系人 |
| `phone` | VARCHAR(30) | 联系电话 |
| `address` | TEXT | 地址 |
| `credit_limit` | DECIMAL(12,2) DEFAULT 0 | 信用额度 |
| `status` | VARCHAR(20) DEFAULT 'ACTIVE' | 状态 |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**无 risk_flag / risk_level / company_code / channel_code / customer_type / tier**  
**无 credit_used（额度占用未追踪）**  
**无 region_code**

**是否有历史数据**: ✅ 有（Phase B 前端已删除，数据留存）  
**是否仍被写入**: ❌ 否（前端 `/b2b` 已删 Phase B；无业务代码写入）  
**是否仍被读取**: ⚠️ **1 处仍在读取**（详见第三节）  

---

### 2.4 crm_members — 门店会员体系（独立，活跃）

**来源**: `generic-crud/generic-crud.service.ts` 动态 DDL 引导

| 字段 | 类型 | 备注 |
|------|------|------|
| `id` | SERIAL PK | |
| `member_id` | VARCHAR(50) UNIQUE | 会员号 |
| `name` | VARCHAR(100) | 姓名 |
| `phone` | VARCHAR(30) | 手机号 |
| `level` | VARCHAR(30) DEFAULT '普通会员' | 会员等级 |
| `points` | INT DEFAULT 0 | 积分余额 |
| `store_code` | VARCHAR(50) | 归属门店 |
| `registered_date` | DATE | 注册日期 |
| `status` | VARCHAR(20) DEFAULT 'ACTIVE' | 状态 |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**关联表**: `crm_levels`（等级配置）、`crm_points_log`（积分流水）、`crm_points_ledger`（积分台账）、`crm_coupons`、`crm_activities`

**无 company_code / channel_code / credit_limit / risk_level**  
**定位与客户主档不同：会员营销 vs 企业销售**

**是否有历史数据**: ✅ 有（POS 门店注册会员）  
**是否仍被写入**: ✅ 是（`/members/list` 页面仍可写入）  
**是否仍被读取**: ✅ 是（`/members` 系列页面、BFF KPI 计数）  

---

## 三、代码引用全量审计

### 3.1 ord_customers 读写引用

| 文件 | 行号 | 操作 | 目的 | 是否可替换 | 风险等级 |
|------|------|------|------|-----------|---------|
| `store-pos/services/sales-engine.service.ts` | 79 | **READ** | POS 黑名单拦截：查 `risk_flag`, `protection_status`, `current_owner_subject_id` | ⚠️ 需迁移，sal_customers 字段名不同（`risk_level` vs `risk_flag`） | 🔴 **CRITICAL** |
| `farm/farm-sales.service.ts` | 37 | **READ** | 农场直销选客户：`SELECT customer_code, customer_name FROM ord_customers` | ⚠️ B类（需数据迁移后改读 sal_customers） | 🟡 HIGH |
| `generic-crud/crud.constants.ts` | 29, 197 | 配置 | 白名单 + RBAC 访问控制 | C类（历史访问控制，保留） | 🟢 LOW |
| `generic-crud/generic-crud.service.ts` | 728–906 | DDL/SEED | 建表 + 种子演示数据 | C类（引导脚本，保留至 DROP） | 🟢 LOW |
| `workflow/workflow.service.ts` | 1852 | SEED | 工作流数据目录条目 | D类（可后续清理） | 🟢 LOW |
| `sales-v2/sales-v2.module.ts` | 69 | 注释 | 禁止引用声明 | 无操作 | — |
| `apps/web/sales2/page.tsx` | 317 | UI展示 | 迁移路线图显示 | 无操作 | — |
| `apps/web/workflow-data-catalog.ts` | 148 | 配置 | 工作流表单下拉 | D类（可后续清理） | 🟢 LOW |

**🚨 最关键问题：`sales-engine.service.ts` 读取 `ord_customers.risk_flag`**

当前逻辑：
```typescript
// store-pos/services/sales-engine.service.ts:79
SELECT customer_code, risk_flag, protection_status, current_owner_subject_id
FROM ord_customers WHERE customer_code = $1 LIMIT 1

if (cust.risk_flag === 'BLACKLIST') {
  errors.push('Customer is in blacklist. Order blocked.');
}
```

问题：
- POS 系统用的 `customer_code` 键，而 `sal_customers` 的主键是 `customer_no`
- POS 端黑名单依赖 `ord_customers.risk_flag`，与 `sal_customers.risk_level` 完全独立
- 数据迁移前两套黑名单不同步，存在安全漏洞

---

### 3.2 b2b_customers 读写引用

| 文件 | 行号 | 操作 | 目的 | 是否可替换 | 风险等级 |
|------|------|------|------|-----------|---------|
| `bff/bff.controller.ts` | 879 | **READ** | 管理员仪表盘列表 `SELECT * FROM b2b_customers LIMIT :n` | A类（可立即改读 sal_customers，筛 customer_type=DISTRIBUTOR） | 🟡 MEDIUM |
| `generic-crud/crud.constants.ts` | 19, 176 | 配置 | 白名单 + RBAC | C类 | 🟢 LOW |
| `generic-crud/generic-crud.service.ts` | 271–284 | DDL | 建表 | C类 | 🟢 LOW |
| `workflow/workflow.service.ts` | 1853 | SEED | 工作流数据目录 | D类 | 🟢 LOW |
| `apps/web/lib/workflow-data-catalog.ts` | 162 | 配置 | 工作流表单下拉 | D类 | 🟢 LOW |
| `apps/web/sales2/page.tsx` | 318 | UI展示 | 迁移路线图 | 无操作 | — |

---

### 3.3 crm_members 读写引用

| 文件 | 行号 | 操作 | 目的 | 处理建议 | 风险等级 |
|------|------|------|------|---------|---------|
| `bff/bff.controller.ts` | 696 | **READ** | KPI 仪表盘会员计数 | 保留（会员体系独立） | 🟢 LOW |
| `apps/web/members/page.tsx` | 17 | **READ** | 会员总览数量 | 保留 | 🟢 LOW |
| `apps/web/members/list/page.tsx` | 56–103 | **READ+WRITE** | 会员档案 CRUD | 保留（独立会员体系） | 🟢 LOW |
| `generic-crud/crud.constants.ts` | 18, 169 | 配置 | 白名单 + RBAC（CRM_MGR/STORE_MGR） | 保留 | 🟢 LOW |
| `generic-crud/generic-crud.service.ts` | 179–195 | DDL | 建表 | 保留 | 🟢 LOW |

---

### 3.4 sal_customers 读写引用（正式主档）

| 服务/页面 | 操作 | 目的 |
|---------|------|------|
| `sales-v2/services/customers.service.ts` | READ+WRITE | 客户 CRUD（新增/查询/冻结/黑名单）|
| `sales-v2/services/customer-credit.service.ts` | READ+WRITE | 信用控制（限额/状态/释放）|
| `sales-v2/services/customer-credit-scheduler.service.ts` | READ+WRITE | 每日自动评估/冻结 |
| `sales-v2/services/sales-orders.service.ts` | READ | 下单时校验客户信用 |
| `sales-v2/services/receipts.service.ts` | READ | 收款时读账期 |
| `sales-v2/services/sales-analytics.service.ts` | READ | 销售分析聚合 |
| `sales-v2/controllers/customer-credit.controller.ts` | READ | 信用详情接口 |
| `apps/web/sales2/customers/page.tsx` | READ+WRITE | 完整客户管理 CRUD 前端 |
| `apps/web/master-data/customers/page.tsx` | READ | 主数据中心只读视图 |

---

## 四、字段差异矩阵

| 维度 | sal_customers | ord_customers | b2b_customers | crm_members |
|------|:-------------:|:-------------:|:-------------:|:-----------:|
| 唯一标识 | `customer_no` | `customer_code` | `customer_code` | `member_id` |
| 名称字段 | `customer_name` | `customer_name` | `customer_name` | `name` |
| 联系电话 | `contact_phone` | `phone` | `phone` | `phone` |
| 联系人姓名 | `contact_name` | ❌ | `contact` | ❌ |
| 配送地址 | `delivery_address` | ❌ | `address` | ❌ |
| 渠道分类 | `customer_type` + `channel_code` | ❌ | ❌（隐含 B2B） | ❌ |
| company_code | ✅ | ❌ | ❌ | ❌ |
| 区域 | `region_code`（编码化）| `region`（自由文本）| ❌ | ❌ |
| 黑名单/风险 | `risk_level`（NORMAL/WATCH/BLACKLIST）| `risk_flag`（NORMAL/BLACKLIST）| ❌ | ❌ |
| 归属保护 | ❌（需扩展）| `protection_status` + `current_owner_subject_id` | ❌ | ❌ |
| 信用额度 | `credit_limit` ✅ | `credit_limit` | `credit_limit` | ❌ |
| 信用占用 | `credit_used` ✅ | `credit_used` | ❌ | ❌ |
| 账期 | `payment_terms` | ❌ | ❌ | ❌ |
| 信用状态 | `credit_status`（Phase 5）| ❌ | ❌ | ❌ |
| 自动冻结 | `auto_frozen` | ❌ | ❌ | ❌ |
| 积分体系 | ❌ | ❌ | ❌ | `points` + `level` ✅ |
| 归属门店 | ❌（company_code 替代）| ❌ | ❌ | `store_code` |
| 状态字段 | `status`（ACTIVE/FROZEN/BLACKLIST）| `status` | `status` | `status` |
| 等级/分层 | `customer_type`（5 类）| `tier`（A/B/C/D）| ❌（隐含）| `level`（会员等级）|
| 归属销售员 | `sales_rep_id` + `sales_rep_name` | `current_owner_subject_id` | ❌ | ❌ |

---

## 五、五大专项分析

### 5.1 Store POS 黑名单专项（🔴 CRITICAL）

**现状**：
```typescript
// store-pos/services/sales-engine.service.ts:76-95
SELECT customer_code, risk_flag, protection_status, current_owner_subject_id
FROM ord_customers WHERE customer_code = $1 LIMIT 1

if (cust.risk_flag === 'BLACKLIST') { // 读 ord_customers.risk_flag
  errors.push('Customer is in blacklist. Order blocked.');
}
```

**问题清单**：
1. `ord_customers` 已封存，新客户不会写入此表
2. POS 收银时 SalesEngine 只校验 `ord_customers` 的黑名单，不校验 `sal_customers`
3. 两套黑名单并存：一个 B2B 批发黑名单 (ord_customers)，一个 Sales V2 黑名单 (sal_customers)
4. `ord_customers.risk_flag` vs `sal_customers.risk_level`：字段名不同
5. `ord_customers.protection_status` 在 `sal_customers` 中无等效字段

**改造方案**：
```typescript
// 改造后（两步查询，兼容迁移期）
SELECT customer_no, risk_level, status
FROM sal_customers WHERE customer_no = $1 LIMIT 1
// risk_level = 'BLACKLIST' → 阻断

// 也可以加兼容层（迁移过渡期）：
SELECT COALESCE(sc.risk_level, oc.risk_flag) AS effective_risk_flag
FROM sal_customers sc
FULL OUTER JOIN ord_customers oc ON sc.customer_no = oc.customer_code
WHERE sc.customer_no = $1 OR oc.customer_code = $1
```

**前提条件**：所有 `ord_customers` 黑名单数据必须先迁移到 `sal_customers`，否则"改读 sal_customers"会放行历史黑名单客户。

**归类**：B 类（需数据迁移后改读）

---

### 5.2 B2B 客户专项

**现状**：
- 前端 `/b2b` 目录：Phase B 已删除 ✅
- Sidebar B2B 导航：已注释 ✅
- 数据写入：无新写入（无业务代码写入）✅
- 唯一残留：`bff/bff.controller.ts:879` 读取 `b2b_customers` 用于管理仪表盘列表

**归类与建议**：
| 条目 | 建议 | 优先级 |
|------|------|--------|
| `bff.controller.ts` 读 b2b_customers | 改查 `sal_customers WHERE customer_type='DISTRIBUTOR'` | A类，可立即改 |
| `workflow.service.ts` 种子数据 | 清理 `B2B_CUSTOMERS` 数据目录条目 | D类，后续清理 |
| `workflow-data-catalog.ts` | 改为 `sal_customers` 数据源 | D类，后续清理 |
| b2b_customers 历史数据 | 完整迁移到 sal_customers (DISTRIBUTOR 类型)，再封存 | B类 |

---

### 5.3 会员客户 crm_members 专项

**定性**：`crm_members` 是**独立的会员忠诚度体系**，与 `sal_customers` 功能不重叠：

| 对比维度 | sal_customers | crm_members |
|---------|---------------|-------------|
| 核心用途 | B2B 企业销售客户主档 | 门店零售会员营销 |
| 关键字段 | credit_limit, payment_terms | points, level, coupons |
| 业务流程 | 订单→配送→AR 发票→收款 | 消费→积分→升级→兑换 |
| 主要操作者 | 销售员、财务 | 收银员、门店运营 |
| 是否重叠 | 部分（B2C 零售客户）| 部分（有购买行为的会员）|

**建议**：
- **现阶段**：保留 `crm_members` 独立运行，不合并到 `sal_customers`
- **未来方向**：增加 `sal_customer_id` 外键到 `crm_members`，建立"会员 ↔ 客户"软关联
- **不建议**：强制合并 crm_members 到 sal_customers（积分/等级/优惠券体系复杂度不同）

---

### 5.4 Farm Sales 客户专项

**现状**：
```typescript
// farm/farm-sales.service.ts:37-39
SELECT customer_code, customer_name FROM ord_customers
  WHERE status='active'
ORDER BY customer_code
```

`farm-sales.service.ts` 从 `ord_customers` 读取客户列表作为农场直销的客户来源，同时写 `ord_orders`（FARM_SALE 类型）。

**问题**：
1. 农场直销的客户依赖 `ord_customers`（封存表）
2. 新在 `sal_customers` 创建的客户无法在农场直销界面中选择
3. 双写 `ord_orders` 而非 `sal_sales_orders`，两套销售数据不互通

**建议**：
- **现阶段**（Phase F）：标记为 B 类，待 Farm V2 时整体迁移
- **Farm V2 改造目标**：
  - 客户列表改读 `sal_customers WHERE company_code=:company`
  - 订单写入 `sal_sales_orders`（order_type='FARM_SALE' 或新渠道）
  - 废弃对 `ord_orders` 的写入

---

### 5.5 Finance V2 客户关联

Finance V2 (`fin_ar_invoices`, `fin_ar_receipts`) 使用 `customer_code` + `customer_name` 作为文本字段存储，**未建立外键关联到任何客户主档**。

这意味着：
- AR 发票不自动联动客户信用变化
- 客户改名后历史 AR 记录不同步
- 无法通过 AR 汇总快速获取客户完整档案

**建议**：Finance V2 应在 `fin_ar_invoices` 中增加 `sal_customer_id BIGINT` 外键关联到 `sal_customers.id`。这是 Phase G 的前置任务。

---

## 六、数据迁移方案设计（本阶段不执行）

### 6.1 ord_customers → sal_customers 字段映射

| ord_customers 字段 | sal_customers 字段 | 转换规则 |
|-------------------|-------------------|---------|
| `customer_code` | `customer_no` | 直接映射，加前缀 `ORD-` 避免冲突（如 `ORD-CUST001`）|
| `customer_name` | `customer_name` | 直接映射 |
| `phone` | `contact_phone` | 直接映射 |
| `region` | `region_code` | 自由文本→编码化（需预建区域字典）|
| `credit_limit` | `credit_limit` | 直接映射 |
| `credit_used` | `credit_used` | 直接映射（需与 ord_credit_usage 核对一致性）|
| `tier` | `customer_type` | A→KEY_ACCOUNT, B/C→DISTRIBUTOR, D→RETAIL, NULL→RETAIL |
| `status` | `status` | 'active'→'ACTIVE', 'inactive'→'FROZEN' |
| `risk_flag` | `risk_level` | 'BLACKLIST'→'BLACKLIST', 'NORMAL'→'NORMAL', NULL→'NORMAL' |
| `protection_status` | *(扩展字段)* | 需在 sal_customers 增加 `protection_status VARCHAR(20)` |
| `current_owner_subject_id` | `sales_rep_id` | 概念映射（sales_rep_id 为 BIGINT，需查 sys_users） |
| *(无)* | `company_code` | 全部默认为 'DEFAULT' 或从上下文推断 |
| *(无)* | `channel_code` | NULL（无渠道信息）|
| *(无)* | `contact_name` | NULL |
| *(无)* | `delivery_address` | NULL |

### 6.2 b2b_customers → sal_customers 字段映射

| b2b_customers 字段 | sal_customers 字段 | 转换规则 |
|-------------------|-------------------|---------|
| `customer_code` | `customer_no` | 直接映射，加前缀 `B2B-` 避免冲突 |
| `customer_name` | `customer_name` | 直接映射 |
| `contact` | `contact_name` | 直接映射 |
| `phone` | `contact_phone` | 直接映射 |
| `address` | `delivery_address` | 直接映射 |
| `credit_limit` | `credit_limit` | 直接映射 |
| `status` | `status` | 'ACTIVE'→'ACTIVE', 其他→'FROZEN' |
| *(无)* | `customer_type` | 固定为 'DISTRIBUTOR' |
| *(无)* | `company_code` | 默认 'DEFAULT' |
| *(无)* | `risk_level` | 默认 'NORMAL'（b2b_customers 无黑名单字段）|
| *(无)* | `credit_used` | 默认 0（b2b_customers 无占用追踪）|

### 6.3 crm_members → sal_customers 可选映射（未来）

crm_members 可通过增加 `sal_customer_id` 外键实现软关联，不建议合并：

```sql
-- 未来可执行（Phase H 或会员 V2）
ALTER TABLE crm_members ADD COLUMN IF NOT EXISTS sal_customer_id BIGINT REFERENCES sal_customers(id);
```

### 6.4 去重规则

```
去重键：LOWER(TRIM(customer_name)) + contact_phone（若有）
冲突处理：
  1. 若两表同名同电话 → 合并为一条，取 sal_customers 优先
  2. 若仅同名 → 人工确认（导出 Excel 交销售确认）
  3. 若无交集 → 直接插入
```

### 6.5 编号规则

```
ord_customers 迁移后编号格式：ORD-{original_customer_code}
  示例：CUST001 → ORD-CUST001
b2b_customers 迁移后编号格式：B2B-{original_customer_code}
  示例：B2B-001 → B2B-B2B-001（如有冲突加时间戳后缀）
新建 Sales V2 客户编号格式：SAL-{YYYYMMDD}-{SEQ}
  示例：SAL-20260529-0001（由 customers.service.ts 自动生成）
```

### 6.6 黑名单迁移规则

```sql
-- 迁移 ord_customers BLACKLIST 到 sal_customers
INSERT INTO sal_customers (customer_no, customer_name, risk_level, status, company_code, ...)
SELECT 'ORD-' || customer_code, customer_name, 'BLACKLIST', 'BLACKLIST', 'DEFAULT', ...
FROM ord_customers WHERE risk_flag = 'BLACKLIST'
ON CONFLICT (customer_no) DO UPDATE SET
  risk_level = 'BLACKLIST',
  status = 'BLACKLIST';
```

### 6.7 信用额度迁移规则

```sql
-- 迁移前验证信用守恒
SELECT 
  oc.customer_code,
  oc.credit_used AS ord_credit_used,
  COALESCE(SUM(CASE WHEN cu.action='RESERVED' THEN cu.amount 
                    WHEN cu.action='RELEASED' THEN -cu.amount 
                    ELSE 0 END), 0) AS calculated_used,
  oc.credit_used - COALESCE(SUM(...), 0) AS delta
FROM ord_customers oc
LEFT JOIN ord_credit_usage cu ON cu.customer_code = oc.customer_code
GROUP BY oc.customer_code
HAVING ABS(oc.credit_used - COALESCE(SUM(...), 0)) > 0.01;
-- delta=0 才允许迁移 credit_used
```

### 6.8 company_code 处理规则

```
ord_customers / b2b_customers 均无 company_code。迁移策略：

1. 若系统只有一个法人主体 → 全部填写默认 company_code（如 'PHX-MAIN'）
2. 若系统有多法人 → 需通过 region 或 tier 推断，或人工标记
3. 推荐：迁移前在系统配置中设置 LEGACY_COMPANY_CODE 用于批量标记历史客户
```

---

## 七、引用分类汇总

### A 类：可立即改读 sal_customers（无需数据迁移）

| 文件 | 当前读取 | 改造目标 |
|------|---------|---------|
| `bff/bff.controller.ts:879` | `SELECT * FROM b2b_customers` | `SELECT * FROM sal_customers WHERE customer_type='DISTRIBUTOR'` |

**改造成本**：低（1 行 SQL 修改）  
**风险**：低（仅 BFF 仪表盘，非核心业务）

### B 类：需数据迁移后改读

| 文件 | 当前读取 | 迁移前置条件 |
|------|---------|------------|
| `store-pos/services/sales-engine.service.ts` | `ord_customers.risk_flag` | 黑名单数据迁移完成 + 字段名统一 |
| `farm/farm-sales.service.ts` | `ord_customers`（客户列表）| 农场客户数据迁移完成 |

**改造成本**：中（需配套数据迁移 + 字段映射处理）  
**风险**：🔴 HIGH（POS 黑名单是安全关键路径）

### C 类：历史只读，保留至 DROP

| 文件 | 内容 |
|------|------|
| `generic-crud/crud.constants.ts` | ALLOWED_TABLES 白名单 + RBAC 限制 |
| `generic-crud/generic-crud.service.ts` | DDL 引导脚本 |
| `health.controller.ts` | ord_orders 状态统计（非客户表）|

**改造成本**：无  
**保留理由**：历史访问控制 + 表引导，DROP 表后同步清理

### D 类：应在 Phase G/H 清理

| 文件 | 内容 |
|------|------|
| `workflow/workflow.service.ts` | ORD_CUSTOMERS / B2B_CUSTOMERS 数据目录条目 |
| `apps/web/lib/workflow-data-catalog.ts` | b2b_customers 工作流表单配置 |

**改造成本**：低  
**时机**：Phase G 工作流重构时一并清理

### E 类：无（当前无可直接删除的客户相关代码）

---

## 八、sal_customers 需要补充的字段

为完整承接 ord_customers 功能，`sal_customers` 需增加以下字段：

```sql
-- Phase G 执行前添加
ALTER TABLE sal_customers
  ADD COLUMN IF NOT EXISTS protection_status     VARCHAR(20) DEFAULT 'INIT',
  ADD COLUMN IF NOT EXISTS current_owner_username VARCHAR(128);

-- customer_no 需支持旧格式兼容查询（legacy_customer_code）
ALTER TABLE sal_customers
  ADD COLUMN IF NOT EXISTS legacy_customer_code  VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sal_cust_legacy_code 
  ON sal_customers (legacy_customer_code) WHERE legacy_customer_code IS NOT NULL;

COMMENT ON COLUMN sal_customers.protection_status IS '客户保护状态（从 ord_customers 迁入）: INIT/OWNED/PROTECTED';
COMMENT ON COLUMN sal_customers.legacy_customer_code IS '历史 ord_customers.customer_code / b2b_customers.customer_code，迁移对照用';
```

---

## 九、Store POS 黑名单改造详细计划

### 当前代码

```typescript
// store-pos/services/sales-engine.service.ts:76-95
private async validateOwnership(order: ValidationOrder) {
  const rows = await this.em.query(
    `SELECT customer_code, risk_flag, protection_status, current_owner_subject_id
     FROM ord_customers WHERE customer_code = $1 LIMIT 1`,
    [order.customer_code],
  );
  if (rows.length === 0) return { passed: false, errors: [`Customer not found`] };
  
  if (cust.risk_flag === 'BLACKLIST') { ... }
  if (cust.protection_status !== 'INIT' && ...) { ... }
}
```

### 改造后代码（Phase G）

```typescript
// 迁移完成后：改读 sal_customers
private async validateOwnership(order: ValidationOrder) {
  const rows = await this.em.query(
    `SELECT customer_no, risk_level, status, protection_status, current_owner_username
     FROM sal_customers 
     WHERE (customer_no = $1 OR legacy_customer_code = $1) 
     LIMIT 1`,
    [order.customer_code],
  );
  if (rows.length === 0) return { passed: false, errors: [`Customer not found`] };
  
  const cust = rows[0];
  if (cust.risk_level === 'BLACKLIST' || cust.status === 'BLACKLIST') {
    errors.push('Customer is in blacklist. Order blocked.');
    return { passed: false, errors };
  }
  if (cust.protection_status !== 'INIT' && cust.current_owner_username &&
      order.seller_username && cust.current_owner_username !== order.seller_username) {
    errors.push(`Customer is owned by ${cust.current_owner_username}.`);
    return { passed: false, errors };
  }
}
```

---

## 十、分阶段执行计划

### Phase G1（立即，本月内）— 低风险改造

| 任务 | 文件 | 估时 |
|------|------|------|
| BFF b2b_customers → sal_customers | `bff/bff.controller.ts:879` | 0.5h |
| workflow 数据目录清理 | `workflow.service.ts` | 0.5h |
| workflow-data-catalog 改 sal_customers | `workflow-data-catalog.ts` | 0.5h |

### Phase G2（数据迁移准备，1-2 周内）

| 任务 | 说明 |
|------|------|
| 编写数据迁移脚本（ord_customers → sal_customers）| 含黑名单、信用额度、编号映射 |
| 编写数据迁移脚本（b2b_customers → sal_customers）| 含去重、字段转换 |
| 生产数据核查（信用守恒验证）| 确保 credit_used 数据准确后再迁 |
| 扩展 sal_customers 字段 | protection_status, legacy_customer_code |
| 开发迁移接口 | 可逐批、可回滚 |

### Phase G3（迁移执行 + POS 切换，测试通过后）

| 任务 | 说明 |
|------|------|
| 执行 ord_customers 数据迁移 | 历史数据迁入 sal_customers |
| 执行 b2b_customers 数据迁移 | |
| 更新 sales-engine.service.ts 改读 sal_customers | 🔴 关键路径，需完整测试 |
| 更新 farm-sales.service.ts 改读 sal_customers | |
| 执行 scope-audit + POS 黑名单专项回归 | |

### Phase G4（封存 + DROP 评估，3-6 个月后）

| 任务 | 说明 |
|------|------|
| ord_customers、b2b_customers 追加写保护触发器 | BEFORE INSERT/UPDATE → RAISE EXCEPTION |
| 清理 generic-crud ALLOWED_TABLES 的 ord_* 条目 | |
| 评估 DROP 条件（Phase E 封存文档中已列出）| |

---

## 十一、风险清单

| 风险 | 描述 | 严重程度 | 缓解措施 |
|------|------|---------|---------|
| POS 黑名单失效 | 迁移期间 ord_customers 黑名单与 sal_customers 不同步 | 🔴 CRITICAL | 迁移完成前不切换 SalesEngine |
| 信用额度不守恒 | ord_customers.credit_used 与 ord_credit_usage 流水不一致 | 🔴 HIGH | 迁移前必须通过守恒验证 |
| 客户编号冲突 | ord_customers 和 sal_customers 可能有同 customer_code 但不同客户 | 🟡 HIGH | 加前缀区分（ORD-/B2B-/SAL-）|
| Farm Sales 断链 | 改读 sal_customers 后若历史农场客户未迁移，选客户列表为空 | 🟡 MEDIUM | 迁移完成并验证后再切换 |
| company_code 缺失 | 旧客户无 company_code，迁移后 DataScope 过滤可能失效 | 🟡 MEDIUM | 统一填充默认值，后续人工标记 |
| 会员孤岛扩大 | crm_members 继续独立运行，与 sal_customers 无关联 | 🟢 LOW | 后续通过 sal_customer_id 外键软关联 |

---

## 十二、可后续清理的 MENU 权限条目

以下 MENU 条目可能仍绑定旧客户页面，Phase G 时评估是否清理：

- `MENU_B2B_CUSTOMER`（若存在）— `/b2b/customers` 已删
- `MENU_ORDER_CUSTOMERS`（Phase E 遗留）— `/order/customers` 已删

正式客户入口权限：`MENU_SALES2_CUSTOMER`（已配置，绑定 `/sales2/customers`）

---

## 十三、结论

### sal_customers 作为唯一正式客户主档的原则

✅ **已确认**：`sal_customers` 是 Sales V2 统一客户主档，拥有：
- 完整 TypeORM Entity + Service + Controller
- 完整前端 CRUD 页面（`/sales2/customers`）
- 渠道分类（5 种 customer_type）
- 公司隔离（company_code DataScope）
- 信用控制（Phase 5 完整实现）
- 风险分级（risk_level + auto_frozen）

### 下一步核心行动

1. **🔴 立即**：评估是否需要在 POS 黑名单中增加 sal_customers 双读兼容（ord + sal 都查）
2. **🟡 1周内**：执行 Phase G1 低风险改造（BFF + workflow 清理）
3. **🟡 2周内**：启动数据迁移脚本开发 + sal_customers 字段扩展
4. **📅 1个月内**：完成 ord_customers 黑名单迁移 + SalesEngine 切换
5. **📅 6个月内**：评估 DROP ord_customers / b2b_customers 条件

---

*本文档基于 2026-05-29 代码快照。审计结果：纯文档，无代码改动。*  
*Commit tag: `v3-customer-master-consolidation-audit-20260529`*
