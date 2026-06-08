# G41 · 刘杰应收总账：识别 → 建模 → 导入 → 页面 → 权限

> 任务：识别 `data/刘杰/` 全部图片与 Excel，整理数据表，按刘杰（集团财务总监）角色权限导入，
> 前端等效处理，审计字段对应，确保其登录后有对应页面功能。

## 一、数据识别（5 图 + 3 Excel）
- 5 张图片 = **应收总账**：凤凰鸡场 3 快照（06-04/06-06/06-07，原币 LAK + 本币 CNY）+ 东鹏鸡场 2 快照（06-05~06 / 06-06~07，本币 CNY）。
- Excel：资金账号（东鹏 11 + 凤凰 28）、名单（司机/客户零售点/供应商）。
- 完整识别结果见 `docs/liujie-ar-ledger-dataset.md`。
- ⚠️ 应收金额来自图片 OCR，入正式账须刘杰核对。

## 二、字段对应审计（数据库能否容纳）
| 数据 | 现有表 | 结论 |
|---|---|---|
| 应收总账（期初/本期应收/本期已收/期末，按往来单位/日） | fin_ar_invoices（发票级） | ❌ 不能容纳 → **新建 fin_ar_ledger** |
| 多币种（LAK 原币 + CNY 本币折算） | — | ✅ 新表含 currency/原币/本币 |
| 资金账户 39 个 | fin_cash_accounts | ✅ 可容纳（本次未导入，登账后续） |
| 客户/往来单位 | sal_customers | ⚠️ 直营店/散客/编码可后续映射 |

## 三、实现（全套）
**数据模型**：新建 `fin_ar_ledger`（farm_code/company + counterparty + period_date + 期初/本期应收/本期已收/期末 + 原币/本币/currency + source 状态）。`20260608_g41_fin_ar_ledger.sql`。
**导入**：`20260608_g41_fin_ar_ledger_seed.sql` —— 5 快照 49 行，`source=OCR_PENDING_VERIFY`，幂等。
**菜单/权限**：新增 `MENU_FIN2_AR_LEDGER`（应收总账），授 ROLE_FINANCE_REVIEW_MANAGER（**刘杰**）+ADMIN/CEO/HQ_FINANCE/GROUP_FINANCE/FIN_CFO/FIN_AR/FINANCE_ANALYST/AUDITOR，镜像 MENU_FIN2_REPORT。
**后端**：`fin-ar-ledger.entity` + `ar-ledger.service`（DataScope 按 company 过滤，GROUP 看全部）+ `fin-ar-ledger.controller`（`/api/v2/finance/ar-ledger` 只读，MENU_FIN2_AR_LEDGER:V）。
**前端**：`/finance2/ar-ledger` 应收总账页——场/期间筛选 + 5 张合计 KPI + 明细表带合计行（明细配汇总）+ 多币种 + OCR 待核对横幅；只读。sidebar「财务管理 → 应收总账」。

## 四、刘杰登录后的处理能力
刘杰 = ROLE_FINANCE_REVIEW_MANAGER（GROUP scope，看全集团）。迁移跑后重新登录即在「财务管理」下见「应收总账」，可按场/期间查看 11/9 个往来单位的期初→期末全貌与集团合计，本币口径汇总。符合其「查看全部+审核、不碰付款/银行账户操作」定位（页面只读）。

## 五、验证 & 部署
- API tsc 0 / Web tsc 0 ✅。
- 三个迁移（建表+菜单、seed、）幂等；**DB 写入须刘杰核对 OCR 金额后在生产执行**（agent 不代跑）：
  ```
  apps/api/migrations/20260608_g41_fin_ar_ledger.sql
  apps/api/migrations/20260608_g41_fin_ar_ledger_seed.sql
  ```
- 跑后刘杰需重新登录刷新菜单权限。

## 六、登账（后续可做）
- 资金账户 39 个 → 导入 fin_cash_accounts（需补使用部门/持卡人映射）。
- 名单客户零售点 → sal_customers 主数据；供应商 → prc2_suppliers 补联系人。
- OCR 核对后将 source 改 VERIFIED；后续可做"日快照→趋势"图。
