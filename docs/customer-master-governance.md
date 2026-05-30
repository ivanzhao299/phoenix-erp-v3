# Phoenix ERP V3 — 客户主档治理规则
**Customer Master Governance**  
**生效日期**: 2026-05-29  
**版本**: Phase G1

---

## 一、唯一正式客户主档

**`sal_customers`** 是 Phoenix ERP V3 唯一的正式客户主档。

```
✅ sal_customers   — 唯一正式主档（Sales V2 Phase 0 建立）
❌ ord_customers   — 历史封存，只读
❌ b2b_customers   — 历史封存，只读
🟡 crm_members     — 独立会员体系，不与主档合并
```

---

## 二、写入规则

### 允许写入 sal_customers 的路径

| 路径 | 服务 | 操作 |
|------|------|------|
| `POST /api/v2/sales/customers` | `CustomersService.create()` | 新建客户 |
| `PUT /api/v2/sales/customers/:id` | `CustomersService.update()` | 更新客户信息 |
| `POST /api/v2/sales/customers/:id/freeze` | `CustomersService.freeze()` | 冻结客户 |
| `POST /api/v2/sales/customers/:id/blacklist` | `CustomersService.blacklist()` | 拉黑客户 |
| `CustomerCreditScheduler` | 每日 Scheduler | 自动更新 credit_status / auto_frozen |

### 禁止直接写入的表

| 表 | 原因 | 替代方案 |
|----|------|---------|
| `ord_customers` | 历史封存（Phase E）| 通过 Sales V2 API 操作 sal_customers |
| `b2b_customers` | 历史封存（Phase B）| 通过 Sales V2 API 操作 sal_customers（customer_type=DISTRIBUTOR）|

> **违规检测**：Phase G4 将为 ord_customers 和 b2b_customers 添加 BEFORE INSERT/UPDATE 触发器，阻断非授权写入并告警。

---

## 三、读取规则

### 业务查询优先级

```
1st  sal_customers           — 主路径（所有新业务必须读此表）
2nd  ord_customers (fallback) — 仅 Phase G1-G2 过渡期兼容，G2 迁移完成后删除
```

### 黑名单统一语义

```
sal_customers.risk_level = 'BLACKLIST'  → 阻断（黑名单）
sal_customers.status     = 'BLACKLIST'  → 阻断（黑名单）
sal_customers.status     = 'FROZEN'     → 阻断（信用冻结）
```

> 历史字段 `ord_customers.risk_flag` 已在 Phase G1 从主路径移除。  
> Phase G1 SalesEngine 仍保留 LEGACY FALLBACK 分支，待 Phase G2 数据迁移后删除。

---

## 四、crm_members 治理原则

`crm_members` 是**独立会员忠诚度体系**，不合并到 sal_customers：

| 场景 | 规则 |
|------|------|
| 门店积分消费 | 继续使用 crm_members（member_id 识别）|
| 会员客户关联销售订单 | 通过 sal_customer_id FK 关联到 sal_customers |
| 新建会员时同步创建客户档案 | 检查 sal_customers 是否已存在同手机号客户；存在则填充 sal_customer_id |
| 强制合并 crm_members 到 sal_customers | ❌ 禁止（会员体系独立，避免积分/等级数据污染主档）|

**未来扩展**：
```sql
-- Phase H（会员 V2）执行
ALTER TABLE crm_members
  ADD COLUMN IF NOT EXISTS sal_customer_id BIGINT;
-- 软关联，不硬 FK，允许仅有会员身份无企业客户身份的场景
```

---

## 五、客户编号规范

| 来源 | 编号前缀 | 格式示例 |
|------|---------|---------|
| Sales V2 新建 | `SAL-` | `SAL-20260529-0001` |
| 从 ord_customers 迁入 | `ORD-` | `ORD-CUST001` |
| 从 b2b_customers 迁入 | `B2B-` | `B2B-B2B001` |
| 历史兼容 | `legacy_customer_code` | 原 customer_code 值，存于此字段 |

---

## 六、customer_type 渠道分类规范

| customer_type | 含义 | 对应旧来源 |
|--------------|------|-----------|
| `DIRECT_STORE` | 直营门店 | ord_customers（tier=A 类） |
| `DISTRIBUTOR` | 经销商 | b2b_customers |
| `AGENT` | 代理商 | b2b_customers 部分 |
| `KEY_ACCOUNT` | 大客户 | ord_customers（tier=A 高额授信）|
| `RETAIL` | 散客零售 | ord_customers（无 tier 或 tier=D）|

---

## 七、Finance V2 客户关联规范

Finance V2 AR 单据已支持 `sal_customer_id` 字段（Phase G1 新增）：

```
fin_ar_invoices.sal_customer_id  → sal_customers.id
fin_ar_receipts.sal_customer_id  → sal_customers.id
```

**写入规则**：
- 新建 AR 发票时，Sales V2 Invoice Service 必须填充 `sal_customer_id`
- 历史 AR 发票的 `sal_customer_id` 允许为 NULL（Phase G2 回填）
- `customer_code` / `customer_name` 文本字段保留，双字段兼容

---

## 八、违规场景识别

### 场景 A：代码直接查询 ord_customers（非 LEGACY FALLBACK 注释）

```typescript
// ❌ 违规
const rows = await em.query('SELECT * FROM ord_customers WHERE ...');

// ✅ 正确
const rows = await em.query('SELECT * FROM sal_customers WHERE ...');
```

### 场景 B：新接口向 b2b_customers 写入数据

```typescript
// ❌ 违规
await em.query('INSERT INTO b2b_customers ...');

// ✅ 正确
await em.query('INSERT INTO sal_customers (customer_type, ...) VALUES (\'DISTRIBUTOR\', ...)');
```

### 场景 C：读取 ord_customers.risk_flag 做业务判断（Phase G1 后）

```typescript
// ❌ 违规（Phase G1 已修复）
if (cust.risk_flag === 'BLACKLIST') { ... }

// ✅ 正确
if (cust.risk_level === 'BLACKLIST' || cust.status === 'BLACKLIST') { ... }
```

---

## 九、受控历史引用清单（Phase G1 后）

以下引用为已知受控残留，非违规：

| 文件 | 引用表 | 分类 | 计划 |
|------|--------|------|------|
| `store-pos/sales-engine.service.ts` | ord_customers | B — LEGACY FALLBACK | Phase G2 数据迁移后删除 fallback 分支 |
| `farm/farm-sales.service.ts` | ord_customers | B — 农场直销 | Farm V2 时迁移 |
| `generic-crud/crud.constants.ts` | ord_customers, b2b_customers | C — 历史访问控制 | DROP 前删除 |
| `generic-crud/generic-crud.service.ts` | ord_customers, b2b_customers | C — DDL 引导 | DROP 前删除 |
| `health.controller.ts` | ord_orders | C — 只读健康检查 | 可后续删除 |
| `bff/bff.controller.ts` (finance bridge) | ord_orders | C — 历史 KPI | 后续迁移 sal_orders |

---

## 十、Phase 路线图

| Phase | 目标 | 状态 |
|-------|------|------|
| Phase F | 客户主档孤岛审计 | ✅ 完成 |
| Phase G1 | 统一读取（SalesEngine + BFF + Finance 字段扩展）| ✅ 完成 |
| Phase G2 | 数据迁移（ord_customers → sal_customers，B2B → sal_customers）| ⏳ 待执行 |
| Phase G3 | 切换完成（删除 LEGACY FALLBACK 分支）| ⏳ 待 G2 完成后 |
| Phase G4 | 写保护触发器 + Generic CRUD 清理 | ⏳ 待 G3 完成后 |
| Phase H | DROP ord_customers / b2b_customers（满足封存文档 10 项条件）| ⏳ 生产 6 个月后 |

---

*本文档随代码演进同步更新。如发现违规引用，请在 PR 中标注并创建技术债 Issue。*  
*Last updated: 2026-05-29 Phase G1*
