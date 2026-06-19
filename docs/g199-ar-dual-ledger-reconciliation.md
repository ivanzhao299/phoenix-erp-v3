# g199 — 应收双账打通(好业财 ↔ ERP 应收总账 ↔ 应收账款明细)

> **启动**:2026-06-19 用户拍板
> **依赖**:用户即将提供好业财应收相关接口字段明细 → 见 [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md)
> **铁律继承**:只读好业财(g198 起);TS 迁移禁业务数据 seed(g197-H)

---

## 一、问题陈述

**会计语义**:
- **应收账款(明细账,subsidiary ledger)** — 每笔单据(发票/到期日/收款进度),用于催收/逐笔核销
- **应收总账(科目总账,1122)** — 按客户×期间汇总(期初/本期借/本期贷/期末),用于月报/资产负债表

**勾稽铁律**:`∑(应收账款明细账各客户期末) = 应收总账期末`

**现状缺位**:
1. 好业财 `chanjet_ar_snapshot` 只读了,**没有审核入账到 `fin_ar_ledger`** → 总账数据靠 OCR 补,准确性差
2. **没有三方对账视图**:无法一屏看见"业务侧明细汇总 vs ERP 总账 vs 好业财"
3. `fin_ar_invoices` 和 `fin_ar_ledger` 没勾稽校验 → 明细总账可能串账无人察觉

---

## 二、三方架构(目标态)

```
┌──────────────────┐           ┌──────────────────┐         ┌──────────────────────────┐
│  好业财(权威源)  │  只读 GET │ chanjet_ar_      │ 审核入账│ fin_ar_ledger            │
│ gl/statistics/   ├──────────►│ snapshot         ├────────►│ (ERP 应收总账)           │
│ receive          │           │ (只读快照)       │  财务   │ source=CHANJET_VERIFIED  │
└──────────────────┘           └──────────────────┘  总监   └────────────┬─────────────┘
                                                                         │
                                                                         │ 勾稽校验
                                                                         │ (g199-C)
                                                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 三方对账视图 /finance2/ar-reconciliation                                       │
│ 列: 客户 │ 期间 │ ① 业务汇总 │ ② ERP 总账 │ ③ 好业财 │ 差异 │ 状态 │ 操作       │
└──────────────────────────────────────────────────────────────────────────────┘
                                                                         ▲
                                                                         │ 汇总
                                                                         │
┌──────────────────────────────────────────────────────────────────────────┐
│  fin_ar_invoices(应收账款明细 — ERP 自有业务流,不接好业财)              │
│  销售开单 ─► 单据 ─► 收款核销 ─► 状态/账龄                              │
└──────────────────────────────────────────────────────────────────────────┘
```

**铁律**:
- 好业财 → ERP 只读单向
- 好业财 ↔ `fin_ar_invoices` **永不连接**(好业财本身没单据级明细,塞汇总=丢信息)
- `chanjet_ar_snapshot` → `fin_ar_ledger` 必须经财务总监审核(非自动入账)

---

## 三、现状审计

### 表 1:`chanjet_ar_snapshot`(g198 治理已完成)
| 字段 | 类型 | 说明 |
|------|------|------|
| bookid | varchar(64) NN | 好业财账套 ID |
| company_code | varchar(64) NN | ERP 公司(凤凰农业/星驰/凤凰食品) |
| period | varchar(6) NN | YYYYMM |
| dept_code | varchar(64) NN ✅g198 | 部门(占位 '',待好业财部门接口) |
| assistant_customer_code | varchar(64) NN ✅g198 | 好业财往来单位编码 |
| assistant_customer_id | varchar(64) | 好业财客户 ID |
| subject_id | varchar(64) NN ✅g198 | 科目 ID |
| subject_name | varchar(256) | 科目名(应收/预收等) |
| init_balance | numeric(18,2) | 期初余额 |
| current_period_jf | numeric(18,2) | 本期借方(应收增) |
| current_period_df | numeric(18,2) | 本期贷方(已收) |
| endbalance | numeric(18,2) | 期末余额 |
| year_jf_accumulate | numeric(18,2) | 年度借方累计 |
| year_df_accumulate | numeric(18,2) | 年度贷方累计 |
| currency | varchar(8) default 'RMB' | 币种(好业财 endbalance 返 RMB 本币) |
| raw_data | jsonb | 原始返回保留 |

**已知缺口**:
- 原币(LAK)字段未拉(好业财应该有,需用户提供完整接口字段)
- 部门维度未拉(`dept_code` 占位 '',需好业财部门接口或汇总参数)
- 单据级数据未拉(好业财是否提供逐笔明细接口?待用户确认)

### 表 2:`fin_ar_ledger`(ERP 应收总账,目标接入点)
| 字段 | 类型 | 现状 |
|------|------|------|
| farm_code / farm_name | varchar | 鸡场维度(老业务习惯) |
| company_code | varchar nullable | ⚠️ 与 chanjet 对账的关键键 |
| counterparty_code / name | varchar | 客户 |
| period_date | date | **日级粒度**(chanjet 是 YYYYMM 月级) |
| opening_amount | numeric | 期初(对应 chanjet.init_balance) |
| period_charge | numeric | 本期应收(对应 chanjet.current_period_jf) |
| period_received | numeric | 本期已收(对应 chanjet.current_period_df) |
| closing_amount | numeric | 期末(对应 chanjet.endbalance) |
| closing_amount_base | numeric nullable | 本币折算 |
| base_currency | varchar default 'CNY' | 应改 'RMB' 与 chanjet 一致 |
| source | varchar default 'OCR_PENDING_VERIFY' | 来源标记 |

**差异点**:
1. `period_date` 是 date,`chanjet.period` 是 'YYYYMM' → g199-A 需统一(建议各保留,加映射函数)
2. `farm_code` vs `company_code` — chanjet 走 company 维度,需选定 ERP 这边总账主键
3. `base_currency` default 'CNY' 应改 'RMB'(老挝公司本位币是 RMB,见用户先前说明)
4. `counterparty_code` nullable → g198 同类风险,需排查 service 写入路径(不是 uq 列,暂不强制)

### 表 3:`fin_ar_invoices`(ERP 应收账款明细)
- 完整字段含 ar_no/invoice_no/due_date/aging_bucket/collection_status
- ✅ 走 ERP 自有业务流,**不接好业财**
- g199-C 需加"按 (customer, period) 汇总"的 API,供对账视图调用

---

## 四、子任务清单

### P0(等用户喂接口字段后启动)
**g199-A:字段对照文件锁定**
- 用户提供好业财所有应收相关接口的字段说明
- 输出 [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md) 三大对照表:
  1. 接口清单(总账接口 / 明细接口 / 部门接口 / 客户主数据)
  2. 每个接口逐字段说明(名/类型/单位/币种/枚举值)
  3. 对应到 ERP 字段的映射规则(直接映射/计算/丢弃)

### P1:总账入账
**g199-B:`chanjet_ar_snapshot` → `fin_ar_ledger` 审核入账**
- 新接口 `POST /api/v2/finance/ar-ledger/import-from-chanjet`
- 财务总监审核界面 `/finance2/ar-ledger/import`:列差异(已存在记录 vs 新拉)→ 勾选导入
- 入账后 `fin_ar_ledger.source = 'CHANJET_VERIFIED_<YYYYMMDD>'`(可追溯)
- 铁律:仅集团财务总监角色可入账(MENU_FIN2_AR_LEDGER:E)

### P2:三方对账视图
**g199-C:`/finance2/ar-reconciliation` 三方对账页**
- 一屏并排:业务侧 `fin_ar_invoices` 汇总 / ERP `fin_ar_ledger` / 好业财 `chanjet_ar_snapshot`
- 维度:公司 + 客户 + 期间
- 差异行飘红 + 按"差异原因猜测"(币种/汇率/未入账/串账)分类
- 新接口 `GET /api/v2/finance/ar-reconciliation?companyCode=&period=`

### P3:明细↔总账勾稽校验
**g199-D:`fin_ar_invoices` ↔ `fin_ar_ledger` 自动勾稽**
- 定时任务(每月 1 号),按 (company, customer, period) 汇总 `fin_ar_invoices.balance`
- 与 `fin_ar_ledger.closing_amount` 比对,差异 > 0.01 报警
- 出报表 `docs/g199-monthly-reconciliation-<YYYYMM>.md`

### P4:文档与规范
**g199-E:写运维 SOP**
- 月末关账标准流程(财务总监操作手册)
- CLAUDE.md 加规范:`fin_ar_invoices` 永禁接好业财数据

---

## 五、待用户提供清单

| # | 项 | 用途 |
|---|---|------|
| 1 | 好业财应收总账接口完整字段表(`/accounting/gl/statistics/receive` 所有字段) | g199-A 字段对照 |
| 2 | 好业财是否有应收**单据级明细**接口(开票/收款流水)?有的话给接口 | 决定是否要扩 fin_ar_invoices 同步路径 |
| 3 | 好业财部门接口字段说明(`/accounting/openapi/cc/department/list`) | dept_code 真实落地 |
| 4 | 好业财客户主数据接口字段(确认 `assistant_customer_code` ↔ ERP `counterparty_code` 是否对得上) | g199-C 对账主键 |
| 5 | 好业财科目主数据接口字段(`subject_id` 都有哪些科目) | 区分应收/预收/坏账等 |
| 6 | 好业财原币(LAK)字段名 | 多币种对账 |
| 7 | 月末数据冻结时点(每月几号 chanjet 数据可信稳定) | g199-B 入账时机 |

---

## 六、验证清单(g199 完成后)

- [ ] tsc(api+web) 0 errors
- [ ] g197-H / g198 / 0号铁律门禁全过
- [ ] 生产 DB 跑通新迁移
- [ ] 三家公司 2026 年 5 月数据三方对账完整跑通
- [ ] 差异行能落到一份审计文件(`docs/g199-monthly-reconciliation-202605.md`)
- [ ] 单元/集成测试:勾稽校验在差异 0.01 时报警
- [ ] 财务总监 UAT 通过

---

## 七、进展(2026-06-19 p.m.)

### ✅ g199-A 字段对照已锁定 v1
- 实证 10 字段映射,关键发现 `subjectName` 实为客户名(非科目)
- 探针就位 [scripts/g199-chanjet-probe.mjs](../scripts/g199-chanjet-probe.mjs)(双模式:本地直连 / 线上代理)
- 待补字段(原币 LAK/汇率/部门)落 [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md) §二 占位表,跑探针自动回填,**不阻塞入账**

### ✅ g199-B 入账接口已实现
- 后端 `previewImportToArLedger` + `importToArLedger`:同客户多科目聚合 → upsert `fin_ar_ledger`
- 端点 `GET /api/chanjet/ar-ledger-import-preview` + `POST /api/chanjet/ar-ledger-import`
- 前端 `/finance2/chanjet-sync` 加"审核入账总账"折叠面板:预览差异 / 试运行 / 正式入账
- 权限:`MENU_FIN2_AR_LEDGER:V` 预览,`MENU_FIN2_AR_LEDGER:E` 入账(财务总监独占)
- `source='CHANJET_VERIFIED_<YYYYMMDD>'` 追溯标记

### ⏳ 下一阶段
- **g199-C 三方对账视图**(`fin_ar_invoices` 汇总 ↔ `fin_ar_ledger` ↔ `chanjet_ar_snapshot`)
- **g199-D 明细↔总账定时勾稽**(月初差异 > 0.01 报警)
- **g199-E 月末关账 SOP**(财务总监操作手册)
