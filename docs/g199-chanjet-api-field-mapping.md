# g199-A — 好业财应收接口字段对照表

> **状态**:🔒 已锁定 v1(基于既有 chanjet_ar_snapshot 同步实证),后续新字段以探针 `scripts/g199-chanjet-probe.mjs` 真实样本为准增量补充。
> **关联代码**:[apps/api/src/modules/chanjet/](../apps/api/src/modules/chanjet/)
> **关联文档**:[g199-ar-dual-ledger-reconciliation.md](g199-ar-dual-ledger-reconciliation.md)
> **铁律**:好业财只读(g198)、`fin_ar_invoices` 永禁接(g199 总纲)、入账记录 `source=CHANJET_VERIFIED_<YYYYMMDD>`(g199-B)

---

## 一、本次锁定的接口清单

| # | 接口 | 方法 | 路径 | 已实证 | 用途 |
|---|------|------|------|--------|------|
| 1 | 应收总账统计 | GET | `/accounting/gl/statistics/receive/{bookid}?period=YYYYMM` | ✅ 生产已拉真实数据 | g199-A/B 字段对照、g199-B 入账源 |
| 2 | 部门列表 | GET | `/accounting/openapi/cc/department/list/{bookid}` | ✅ 部门对账已用 | g199-C 部门维度 |
| 3 | 账套列表 | GET | `/accounting/openapi/cc/book/findByEnterpriseId?queryType=BINDING_TO_THIRD_PLATFORM` | ✅ bookid 来源 | 一次性映射 |
| 4 | 往来单位 | POST | `/accounting/openapi/cc/party/custvendor/query/{bookid}` | ⏳ 探针就位 | 客户主数据对账 |
| 5 | 科目列表 | GET | `/accounting/openapi/cc/subject/list/{bookid}` | ⏳ 探针就位 | 应收/预收/坏账细分 |

> 接口 4、5 等下次跑探针 `scripts/g199-chanjet-probe.mjs cust|subj` 拿到真实样本后回填。**入账逻辑(g199-B)不依赖接口 4/5**,因为快照表的 `assistant_customer_code` + `subject_name` 已足够聚合到客户级总账。

---

## 二、接口 1 — 应收总账字段对照 🔒 v1

### 来自 `ChanjetArRow`(`chanjet-ar-sync.service.ts:9`)的字段(✅ 全部实证)

| 好业财字段 | 类型 | 语义 | ERP 落地 | 入账(g199-B) | 备注 |
|----------|------|------|----------|--------------|------|
| `assistantCustomer` | number | 往来单位 ID | `chanjet_ar_snapshot.assistant_customer_id` | — | 数值 ID,转 string 存 |
| `assistantCustomerCode` | string | 往来单位编码 | `chanjet_ar_snapshot.assistant_customer_code` | `fin_ar_ledger.counterparty_code` | g198 NOT NULL `''` 占位 |
| `subjectId` | number | 科目 ID | `chanjet_ar_snapshot.subject_id` | — | g198 NOT NULL `''` 占位 |
| `subjectName` | string | **客户名**(实际接口含义,非"科目名"——见 §四) | `chanjet_ar_snapshot.subject_name` | `fin_ar_ledger.counterparty_name` | UI 列名"结算往来单位"印证 |
| `initBalance` | number | 期初余额(RMB 本币) | `chanjet_ar_snapshot.init_balance` | `fin_ar_ledger.opening_amount`(同客户聚合) | |
| `currentPeriodJfBalance` | number | 本期借方(应收增) | `chanjet_ar_snapshot.current_period_jf` | `fin_ar_ledger.period_charge`(聚合) | |
| `currentPeriodDfBalance` | number | 本期贷方(已收) | `chanjet_ar_snapshot.current_period_df` | `fin_ar_ledger.period_received`(聚合) | |
| `endbalance` | number | 期末余额(RMB 本币) | `chanjet_ar_snapshot.endbalance` | `fin_ar_ledger.closing_amount` + `closing_amount_base` | base 直接 = closing(已本币) |
| `yearJfAccumulate` | number | 年度借方累计 | `chanjet_ar_snapshot.year_jf_accumulate` | — | 不入总账,留快照表 |
| `yearDfAccumulate` | number | 年度贷方累计 | `chanjet_ar_snapshot.year_df_accumulate` | — | 同上 |

### 探针待补字段(在 raw_data 里探测)

> 跑 `node scripts/g199-chanjet-probe.mjs ar 202605` → 看 `scripts/.g199-samples/02-ar-statistics-202605.json` → 比对下表占位字段是否真实存在,有则补充。

| 候选字段 | 推测语义 | 若存在则补 | 优先级 |
|--------|---------|-----------|--------|
| `endbalanceOrig` / `originalEndBalance` | 期末余额原币(LAK) | `chanjet_ar_snapshot.endbalance_orig` 新列 | P2(多币种对账才用) |
| `currency` / `originalCurrency` | 原币种 code | `chanjet_ar_snapshot.currency_orig` 新列 | P2 |
| `exchangeRate` / `rate` | 期末汇率 | `chanjet_ar_snapshot.exchange_rate` 新列 | P2 |
| `deptId` / `deptCode` / `deptName` | 部门维度 | `chanjet_ar_snapshot.dept_code` 改为真值(目前占位 `''`) | P1 |
| `bizDate` / `voucherDate` | 业务日期 | jsonb keep | P3 |
| `voucherCount` | 凭证笔数 | jsonb keep | P3 |

> **不阻塞入账**:g199-B 入账已经能以现有 10 个字段跑通。原币/汇率仅影响多币种对账细化。

---

## 三、接口 2 — 部门列表字段对照 🔒 v1

### 来自 `diffDepartments` 反推(`chanjet-ar-sync.service.ts:79`)

| 好业财字段 | 类型 | ERP 落地 | 备注 |
|----------|------|----------|------|
| `id` | number | (不存) | 仅作"两端比对"用,数值 ID 转 string |
| `code` / `deptCode` | string \| null | (可选)与 `sys_organizations.org_code` 对比 | 当前服务按"名称严格匹配" |
| `name` / `deptName` | string | 与 `sys_organizations.org_name` 对比 | 唯一对账键 |

> 探针文件:`scripts/.g199-samples/03-departments.json`(确认 `parentId`/`level` 等字段后再决定是否补)。

---

## 四、关键发现 — `subjectName` 实际是"客户名"而非"科目名"

观察 `apps/web/src/app/(admin)/finance2/chanjet-sync/page.tsx` 表头(line 285):

```
<th>结算往来单位</th>  → 渲染 r.subjectName
```

说明 `/accounting/gl/statistics/receive` 接口返回的 `subjectName` 字段实际是**客户名**(`往来单位的中文显示名`),而非会计科目名。`subjectId` 也是"行 ID"而非"科目 ID"。

**对入账逻辑的影响**:
- `fin_ar_ledger.counterparty_name` ← chanjet 的 `subjectName`(客户名)
- `fin_ar_ledger.counterparty_code` ← chanjet 的 `assistantCustomerCode`(客户编码)
- **不需要好业财的"科目主数据接口"做应收/预收/坏账拆分**(g199-B 简化:同客户多行直接聚合)

如果未来要拆"应收/预收/坏账"维度,需要补:`/accounting/openapi/cc/subject/list/{bookid}` + 在 chanjet_ar_snapshot 真补 subject 主数据。当前 g199-B 走"客户净应收"足够。

---

## 五、币种与汇率 — 现状定性

- 老挝公司本位币 = **RMB**(用户已确认)
- 业务原币 = LAK(老挝基普)
- `endbalance` 字段实测返回 **RMB 本币**(用户截图证实)
- `chanjet_ar_snapshot.currency` 列默认 `'RMB'`

**LAK 原币字段**:目前 chanjet 接口返回里**未实证**单独的原币字段。如果好业财后台报表显示双币种,接口应该会有 `endbalanceOrig`/`currency` 等 → 跑探针验证。

**入账(g199-B)处理**:
- `fin_ar_ledger.currency_code` = `'RMB'`
- `fin_ar_ledger.base_currency` = `'RMB'`
- `fin_ar_ledger.closing_amount_base` = `closing_amount`(同 RMB 不折算)

---

## 六、探针使用说明

```bash
# 1) 本地直连(需 .env 含 CHANJET_APP_TICKET,生产容器才有,本地一般无)
node scripts/g199-chanjet-probe.mjs all

# 2) 线上代理(推荐,无需密钥)
PHOENIX_ADMIN_TOKEN=<管理员JWT> node scripts/g199-chanjet-probe.mjs all

# 单接口探测
node scripts/g199-chanjet-probe.mjs ar 202605    # 应收总账
node scripts/g199-chanjet-probe.mjs dept         # 部门
node scripts/g199-chanjet-probe.mjs cust         # 往来单位
node scripts/g199-chanjet-probe.mjs subj         # 科目

# 输出落 scripts/.g199-samples/*.json(已 gitignore)
```

> **PHOENIX_ADMIN_TOKEN 拿取**:登录 https://erp.eggslao.com → 浏览器 DevTools → Application/Cookies → `phoenix_token`(或 LocalStorage `token`)。**仅本机使用,不入仓库**。

---

## 七、g199-B 入账逻辑(已实现)

`chanjet_ar_snapshot` (按 客户×科目 1 行/条) → 同客户聚合 → upsert `fin_ar_ledger`:

```
SQL upsert key: (farm_code, counterparty_name, period_date)
farm_code      = chanjet_book_company_map.company_code (即 COMP-LAO-AGRI/XINGCHI/FOOD)
period_date    = period[0..4] || '-' || period[4..6] || '-01'  (YYYYMM → YYYY-MM-01)
counterparty_* = 客户编码 + 客户名(来自 subjectName)
amounts        = 同客户多科目 SUM(init/charge/received/closing)
currency       = 'RMB'  ·  base = closing (本币不折)
source         = 'CHANJET_VERIFIED_<YYYYMMDD>'  (追溯)
remark         = "好业财同步 bookid=X period=Y importedAt=Z"
```

代码:
- 后端:`chanjet-ar-sync.service.ts:previewImportToArLedger / importToArLedger`
- 端点:`GET /api/chanjet/ar-ledger-import-preview` + `POST /api/chanjet/ar-ledger-import`
- 前端:`/finance2/chanjet-sync` → "预览入账总账"按钮 → 新增/变动差异面板 → "试运行 / 正式入账"按钮
- 权限:预览 `MENU_FIN2_AR_LEDGER:V`,入账 `MENU_FIN2_AR_LEDGER:E`(财务总监独占)

---

## 八、提交流水

| 时间 | 内容 |
|------|------|
| 2026-06-19 a.m. | 模板创建(基于现有 chanjet-ar-sync 反推) |
| 2026-06-19 p.m. | 🔒 **v1 锁定**:实证 10 字段映射 + subjectName 实为客户名结论 + 探针就位 + g199-B 入账接口/UI 落地 |
| _待续_ | 探针拉到 P2 字段(原币/汇率/部门) → v1.1 |
