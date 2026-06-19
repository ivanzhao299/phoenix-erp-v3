# g199-A — 好业财应收接口字段对照表

> **状态**:🟡 模板就位,等用户喂数据
> **目的**:把好业财所有应收相关接口的**每一个字段**搞清楚,逐字段映射 ERP 落地表。
> **铁律**:此文件锁定后,后续 entity / migration / service 才能动工。

---

## 一、已知接口(从既有代码反推)

### 接口 1:应收总账统计 `/accounting/gl/statistics/receive/{bookid}`
- **方法**:GET
- **路径变量**:`bookid` = 好业财账套 ID
- **Query**:`period=YYYYMM` (单月)
- **已知输出**:数组,每行 = 客户 × 科目

### 接口 2:部门列表 `/accounting/openapi/cc/department/list/{bookid}`
- **方法**:GET
- **已知输出**:部门数组,字段 id/name/code

### 接口 3:账套列表 `/accounting/openapi/cc/book/findByEnterpriseId`
- **方法**:GET
- **用途**:获取 bookid 列表

### 接口 4:客户主数据(未实证)
- 推测路径:`/accounting/openapi/cc/party/custvendor/query/{bookid}`
- **待用户确认**

---

## 二、接口 1(应收总账)字段对照 — **待补完**

### 已实证字段(从 chanjet-ar-sync.service.ts 反推)

| 好业财字段 | 推测类型 | 推测语义 | 当前 ERP 落地 | ⚠️ 待用户确认 |
|----------|---------|---------|--------------|---------------|
| `assistantCustomer` | number | 往来单位 ID | `chanjet_ar_snapshot.assistant_customer_id` | 是 ID 还是行号? |
| `assistantCustomerCode` | string | 往来单位编码 | `chanjet_ar_snapshot.assistant_customer_code` | 是否等同 ERP 客户 code? |
| `subjectId` | number | 科目 ID | `chanjet_ar_snapshot.subject_id` | 完整科目列表? |
| `subjectName` | string | 科目名 | `chanjet_ar_snapshot.subject_name` | "合计"汇总行?(已过滤) |
| `initBalance` | number | 期初余额 | `chanjet_ar_snapshot.init_balance` | 单位/币种? |
| `currentPeriodJfBalance` | number | 本期借方(应收增) | `chanjet_ar_snapshot.current_period_jf` | 单位/币种? |
| `currentPeriodDfBalance` | number | 本期贷方(已收) | `chanjet_ar_snapshot.current_period_df` | 单位/币种? |
| `endbalance` | number | 期末余额 | `chanjet_ar_snapshot.endbalance` | **RMB 本币?用户截图证实是 RMB** |
| `yearJfAccumulate` | number | 年度借方累计 | `chanjet_ar_snapshot.year_jf_accumulate` | 完整一年还是会计年度? |
| `yearDfAccumulate` | number | 年度贷方累计 | `chanjet_ar_snapshot.year_df_accumulate` | 同上 |

### 推测存在但未实证的字段 — **求确认**

| 可能字段名 | 推测语义 | 用户提供后处理方式 |
|-----------|---------|----------|
| `endbalanceOrig`? | 期末余额(原币 LAK) | 若有 → 加 `chanjet_ar_snapshot.endbalance_orig` 列 |
| `currency`? | 原币种 | 若有 → 用此替换硬编码 'RMB' |
| `exchangeRate`? | 期末汇率 | 若有 → 加列,供本币折算复核 |
| `deptId` / `deptCode` / `deptName`? | 部门维度 | 若有 → `chanjet_ar_snapshot.dept_code` 真落地 |
| `periodStart` / `periodEnd`? | 期间起止日 | 若 API 支持精确日 → 前端日选 |
| `bizDate`? | 业务日期 | 与 period 配合时序 |
| `voucherCount`? | 凭证笔数 | 用于判定是否有明细 |
| 其他 | (空) | 待用户喂 |

> 💬 **用户行动项**:打开好业财开放平台文档,把 `/accounting/gl/statistics/receive` 的**完整字段说明表**贴过来(中文/英文都行)。

---

## 三、接口 2(部门)字段对照 — **待补完**

| 好业财字段 | 推测语义 | ERP 落地 |
|----------|---------|---------|
| `id` | 部门 ID | sys_organizations.??? |
| `code` | 部门 code | sys_organizations.org_code |
| `name` | 部门名 | sys_organizations.org_name |
| `parentId`? | 上级部门 | sys_organizations.parent_code |
| `level`? | 层级 | — |
| 其他 | (空) | 待用户喂 |

> 💬 **用户行动项**:贴部门接口完整字段表。

---

## 四、接口 4(客户主数据)— **接口路径待用户确认**

> 💬 **用户行动项**:
> 1. 确认好业财客户主数据接口路径
> 2. 贴该接口完整字段表

预期字段(待替换):

| 好业财字段 | 推测语义 | ERP 落地 |
|----------|---------|---------|
| ??? | 客户 ID | sal_customers.??? |
| ??? | 客户编码 | sal_customers.customer_no |
| ??? | 客户名 | sal_customers.customer_name |
| ??? | 联系电话 | sal_customers.phone |
| ??? | 信用额度 | sal_customers.credit_limit |
| ??? | 税号 | sal_customers.tax_no |
| 其他 | (空) | 待用户喂 |

---

## 五、单据级明细接口 — **关键问题**

ERP 应收账款明细 `fin_ar_invoices` 需要:
- 应收单号 / 发票号 / 开票日 / 到期日 / 单笔金额 / 收款进度 / 状态

**关键提问** — 好业财是否提供以下任一接口?

| 候选接口 | 用途 | 用户回答 |
|---------|------|---------|
| 应收单据列表(逐笔,含发票号、到期日) | 同步到 `fin_ar_invoices` | 🟡 待答 |
| 收款流水(逐笔收款) | 自动核销 `fin_ar_invoices` | 🟡 待答 |
| 销售出库单(发货明细) | 反推应收单据 | 🟡 待答 |

> 💬 **用户行动项**:在好业财开放平台搜索 "应收"、"开票"、"收款"、"销售单",列出所有候选接口路径 + 字段说明。

**铁律延续**:即使好业财有单据级接口,`fin_ar_invoices` **仍然以 ERP 自有业务流为权威**;好业财数据只作为**对账参考**(不覆盖 ERP 数据),否则与 g198 铁律"只读不写"冲突。

---

## 六、币种与汇率 — **关键诊断**

用户先前确认:
- 老挝公司本位币 = RMB
- 业务原币 = LAK
- 好业财 `endbalance` 字段返回的是 **RMB**(本币)
- 期末 LAK 原币需找好业财对应字段

> 💬 **用户行动项**:好业财接口字段中,哪些是 RMB(本币),哪些是 LAK(原币)?是否有汇率字段?

---

## 七、填表规范(用户喂数据时)

把以下任一格式贴给我都可:
1. **截图**:好业财开放平台接口文档页
2. **表格**:接口名 | 字段 | 类型 | 必填 | 说明
3. **链接**:好业财开放平台对应文档 URL
4. **示例 JSON**:接口实际返回的真实样例(脱敏即可)

我会按此模板逐字段填齐,完成后 ping 你确认 → 启动 g199-B 代码层。

---

## 八、提交流水

| 时间 | 内容 |
|------|------|
| 2026-06-19 | 模板创建(基于现有 chanjet-ar-sync 反推) |
| _待补_ | 用户喂数据 → 字段对照锁定 |
| _待补_ | 代码层启动(g199-B 入账接口) |
