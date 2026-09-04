# 资金账户余额—流水一致性逐账户核查与待批修复方案（2026-09-04）

## 1. 边界与结论

本轮仅做代码、迁移历史和当前工作区数据库的只读核查；没有执行 DDL/DML，没有重算余额，也没有创建临时表。当前工作区数据库为 Docker 容器 `phoenix-v3-db` 中的 `phoenix_erp`，本报告不把它冒充为一次新的生产查询；上轮生产只读审计发现的差异账户数同为 21。

核查结论：公式本身正确。54 个账户中，33 个零期初、零流水、零快照账户直接满足公式；11 个有流水的现役账户全部因 G45 改挂时只迁移流水和末笔快照、未迁移 `opening_balance` 而失败；另有 10 个停用的 WWH 旧账户因流水迁出后仍保留历史期初及末笔快照而失败。两组是一笔 G34→G45 主档合并留下的成对镜像，不是 21 个互不相关的余额漂移。

其中 `FH-10207` 另有 3 笔导入历史的 `balance_after` 链异常，但以首笔反推期初后，签名金额总和仍能精确得到当前快照；这是需单独保全和修复的流水链质量问题，不是该账户期末差异的主因。

## 2. 权威公式定案

### 2.1 范围与符号

代码中的权威重建逻辑位于 `CashAccountsService.rebuildChain`：按 `(txn_date, id)` 升序遍历账户的全部 `fin_cash_transactions`；`IN` 为正、`OUT` 为负；`source_type='OPENING'` 是期初的凭证化表达，`balance_after` 固定为期初，但不再重复计入增量。交易表没有草稿、作废、软删除或状态字段，因此不存在“过滤草稿/作废”的公式分支；物理删除后的流水已不在历史全集中。

公式为：

```text
signed_sum = Σ(CASE WHEN direction='IN' THEN amount ELSE -amount END)
             WHERE source_type IS DISTINCT FROM 'OPENING'

reconstructed_balance = opening_balance + signed_sum
diff = current_balance - reconstructed_balance
```

币种不跨账户汇总、不换算：每个账户只在自身 `currency_code` 原币内计算。现有 93 笔流水的账户编码、公司和币种与所属账户均一致，无孤儿流水；因此 H3 不成立。

### 2.2 公式先验验证

先用三类“应一致”样本验证公式，而非先拿 21 个差异反推规则：

| 样本 | 期初 | 签名流水和 | 重建余额 | 当前快照 | 结果 |
|---|---:|---:|---:|---:|---|
| FH-09（LAK，无流水） | 0.00 | 0.00 | 0.00 | 0.00 | 一致 |
| FH-10201（CNY，无流水） | 0.00 | 0.00 | 0.00 | 0.00 | 一致 |
| DP-08b（LAK，无流水） | 0.00 | 0.00 | 0.00 | 0.00 | 一致 |

再以导入流水的首笔 `balance_after` 反推缺失期初，验证非零流水链：

```text
inferred_opening = first_balance_after - first_signed_amount
```

| 样本 | 反推期初 | 签名流水和 | 反推期初+流水 | 当前快照 | 结果 |
|---|---:|---:|---:|---:|---|
| FH-101 CNY | 10,370.00 | 0.00 | 10,370.00 | 10,370.00 | 一致 |
| FH-102 LAK | 189,515,000.00 | 125,110,000.00 | 314,625,000.00 | 314,625,000.00 | 一致 |
| DP-01 CNY | 244,874.90 | -31,755.50 | 213,119.40 | 213,119.40 | 一致 |

反推值又分别与已停用的来源账户 `WWH-FH-CASH-CNY`、`WWH-FH-CASH-LAK`、`WWH-XC-CASH-CNY` 的 G34 期初精确相等，证明公式与历史数据含义均成立。

## 3. 全账户对账矩阵

`差异 = 当前快照 - (期初 + 非 OPENING 签名流水)`；金额均为账户原币。`—` 表示无流水。

|ID|账户|币种|状态|期初|流水和|当前快照|差异|首笔时间 UTC|末笔时间 UTC|
|---:|---|---|---|---:|---:|---:|---:|---|---|
|1|WWH-FH-LDB-CNY|CNY|INACTIVE|3,958.79|0.00|57,898.79|53,940.00|—|—|
|2|WWH-FH-BCEL-THB|THB|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|3|WWH-FH-LDB-THB|THB|INACTIVE|1,802.00|0.00|2,626.00|824.00|—|—|
|4|WWH-FH-CASH-CNY|CNY|INACTIVE|10,370.00|0.00|10,370.00|0.00|—|—|
|5|WWH-FH-SL-BCEL-CNY|CNY|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|6|WWH-FH-PAB-CNY|CNY|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|7|WWH-XC-BCEL-LAK|LAK|INACTIVE|1,924,934.57|0.00|2,623,934.57|699,000.00|—|—|
|8|WWH-FH-SL-LDB-LAK|LAK|INACTIVE|477,477,359.59|0.00|157,387,359.59|-320,090,000.00|—|—|
|9|WWH-FH-LDB-USD|USD|INACTIVE|94.60|0.00|91.00|-3.60|—|—|
|10|WWH-FH-BCEL-USD|USD|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|11|WWH-FH-LDB-LAK|LAK|INACTIVE|880,000.00|0.00|856,000.00|-24,000.00|—|—|
|12|WWH-FH-BCEL-LAK|LAK|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|13|WWH-XC-CASH-CNY|CNY|INACTIVE|244,874.90|0.00|213,119.40|-31,755.50|—|—|
|14|WWH-FH-BCEL-CNY|CNY|INACTIVE|0.00|0.00|0.00|0.00|—|—|
|15|WWH-FH-SL-BCEL-LAK|LAK|INACTIVE|581,213,132.53|0.00|279,843,132.53|-301,370,000.00|—|—|
|16|WWH-XC-LDB-LAK|LAK|INACTIVE|10,494,389.06|0.00|205,889.06|-10,288,500.00|—|—|
|17|WWH-FH-CASH-LAK|LAK|INACTIVE|189,515,000.00|0.00|314,625,000.00|125,110,000.00|—|—|
|18|FH-09|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|19|FH-101|CNY|ACTIVE|0.00|0.00|10,370.00|10,370.00|2026-05-31 17:00|2026-06-03 17:00|
|20|FH-102|LAK|ACTIVE|0.00|125,110,000.00|314,625,000.00|189,515,000.00|2026-06-02 17:00|2026-06-03 17:00|
|21|FH-10201|CNY|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|22|FH-10202|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|23|FH-10203|CNY|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|24|FH-10204|THB|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|25|FH-10205|USD|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|26|FH-10206|LAK|ACTIVE|0.00|-320,090,000.00|157,387,359.59|477,477,359.59|2026-05-31 17:00|2026-06-03 17:00|
|27|FH-10207|LAK|ACTIVE|0.00|-301,370,000.00|279,843,132.53|581,213,132.53|2026-05-31 17:00|2026-06-03 17:00|
|28|FH-10208|CNY|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|29|FH-10209|LAK|ACTIVE|0.00|-24,000.00|856,000.00|880,000.00|2026-06-01 17:00|2026-06-01 17:00|
|30|FH-10210|USD|ACTIVE|0.00|-3.60|91.00|94.60|2026-06-01 17:00|2026-06-01 17:00|
|31|FH-10211|THB|ACTIVE|0.00|824.00|2,626.00|1,802.00|2026-06-01 17:00|2026-06-01 17:00|
|32|FH-10212|CNY|ACTIVE|0.00|53,940.00|57,898.79|3,958.79|2026-06-01 17:00|2026-06-01 17:00|
|33|FH-103|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|34|FH-104|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|35|FH-105|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|36|FH-106|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|37|FH-203|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|38|FH-204|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|39|FH-205|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|40|FH-206|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|41|FH-207|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|42|FH-208|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|43|FH-209|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|44|FH-210|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|45|DP-01|CNY|ACTIVE|0.00|-31,755.50|213,119.40|244,874.90|2026-05-31 17:00|2026-06-03 17:00|
|46|DP-04|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|47|DP-05|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|48|DP-06|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|49|DP-07|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|50|DP-08c|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|51|DP-09|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|
|52|DP-10|LAK|ACTIVE|0.00|-10,288,500.00|205,889.06|10,494,389.06|2026-05-31 17:00|2026-06-02 17:00|
|53|DP-11|LAK|ACTIVE|0.00|699,000.00|2,623,934.57|1,924,934.57|2026-06-01 17:00|2026-06-02 17:00|
|54|DP-08b|LAK|ACTIVE|0.00|0.00|0.00|0.00|—|—|

## 4. 逐账户定因

### 4.1 11 个现役账户：G45 改挂遗漏期初（H1 + H2，证据闭环）

G34 导入先按首笔 `balance_after ± amount` 反推 WWH 账户 `opening_balance`，再按末笔 `balance_after` 回填 `current_balance`。G45 随后把 93 笔流水的账户归属 UPDATE 到 FH-/DP- 主档，并只按末笔流水回填目标 `current_balance`；迁移 SQL 没有把来源 `opening_balance` 搬到目标。故目标账户出现“流水和与末笔快照合理，但期初仍为 G42 seed 的 0”。

|现役账户|对应停用来源|成因证据：缺失期初=差异|流水样本/时间窗|建议口径|
|---|---|---:|---|---|
|FH-101|WWH-FH-CASH-CNY|10,370.00 CNY|11 笔；首笔 IN 252,280 后余额 262,650；05-31~06-03|迁入来源期初，补 OPENING 凭证|
|FH-102|WWH-FH-CASH-LAK|189,515,000.00 LAK|11 笔；流水净入 125,110,000；06-02~06-03|同上|
|FH-10206|WWH-FH-SL-LDB-LAK|477,477,359.59 LAK|5 笔；净流出 320,090,000；05-31~06-03|同上|
|FH-10207|WWH-FH-SL-BCEL-LAK|581,213,132.53 LAK|20 笔；净流出 301,370,000；另见 4.3|迁入期初；链异常另案保全|
|FH-10209|WWH-FH-LDB-LAK|880,000.00 LAK|2 笔 OUT 合计 24,000；06-01|迁入期初，补 OPENING 凭证|
|FH-10210|WWH-FH-LDB-USD|94.60 USD|单笔手续费 OUT 3.60；06-01|同上|
|FH-10211|WWH-FH-LDB-THB|1,802.00 THB|OUT 176、IN 1,000；净入 824；06-01|同上|
|FH-10212|WWH-FH-LDB-CNY|3,958.79 CNY|5 笔；净入 53,940；06-01|同上|
|DP-01|WWH-XC-CASH-CNY|244,874.90 CNY|14 笔；净流出 31,755.50；05-31~06-03|同上|
|DP-10|WWH-XC-LDB-LAK|10,494,389.06 LAK|14 笔；含 IN 16,000,000“调整 [Excel导入]”；05-31~06-02|同上|
|DP-11|WWH-XC-BCEL-LAK|1,924,934.57 LAK|8 笔；含 OUT 16,000,000“调整 [Excel导入]”；06-01~06-02|同上|

### 4.2 10 个停用旧账户：迁出流水后快照未收口（H2，证据闭环）

以下账户在 G45 前是 G34 流水账户；G45 把流水全部改挂后仅将 WWH 账户设为 `INACTIVE`，没有重建或清理来源账户余额。它们现为无流水的停用重复主档，差异额恰好等于对应现役账户的签名流水和；不是独立业务交易、汇率或作废问题。

|停用账户|对应现役账户|差异（原币）|建议口径|
|---|---|---:|---|
|WWH-FH-LDB-CNY|FH-10212|53,940.00|保留为迁移证据并从运营对账排除；是否中和快照待业务批准|
|WWH-FH-LDB-THB|FH-10211|824.00|同上|
|WWH-XC-BCEL-LAK|DP-11|699,000.00|同上|
|WWH-FH-SL-LDB-LAK|FH-10206|-320,090,000.00|同上|
|WWH-FH-LDB-USD|FH-10210|-3.60|同上|
|WWH-FH-LDB-LAK|FH-10209|-24,000.00|同上|
|WWH-XC-CASH-CNY|DP-01|-31,755.50|同上|
|WWH-FH-SL-BCEL-LAK|FH-10207|-301,370,000.00|同上|
|WWH-XC-LDB-LAK|DP-10|-10,288,500.00|同上|
|WWH-FH-CASH-LAK|FH-102|125,110,000.00|同上|

`WWH-FH-CASH-CNY` 无流水但 `opening=current=10,370.00`，所以本身公式一致；它仍是 FH-101 的期初来源证据，但不在 21 个差异内。

### 4.3 FH-10207 的独立链异常

按 `(txn_date,id)` 相邻核对发现：

|流水 ID|方向/金额|前余额|记录的 balance_after|按公式应为|异常|
|---:|---:|---:|---:|---:|---|
|9|OUT 1,000.00|346,678,132.53|346,677,132.63|346,677,132.53|+0.10|
|32|IN 33,677,000.00|346,677,132.63|0.00|380,354,132.63|跳零|
|48|IN 17,125,000.00|0.00|397,479,132.53|17,125,000.00|跳回历史链|

三笔均属于 Excel 导入历史。最终 `current_balance=279,843,132.53` 与“反推期初 + 全部签名金额”一致，所以不能据此推断发生过手工改快照；建议批准修复时只重建 `balance_after` 派生链，并在执行前导出这三行原值作为审计附件。

## 5. 候选假设逐一裁决

|假设|裁决|证据|
|---|---|---|
|H1 期初导入未写对应流水|成立（11 个现役账户）|G34 反推期初；G45 只迁流水与末笔快照，目标期初保持 0；93 笔流水 `source_type` 全为空，无 OPENING 凭证|
|H2 改挂/删除/编辑未同步快照|成立（G45 批量改挂）|10 个来源账户迁出流水后仍留旧快照；11 个目标只回填末笔快照但未迁期初|
|H3 多币种/汇率混算|排除|逐账户原币核算；93 笔流水币种均与账户一致，不跨币种 SUM|
|H4 手工 UPDATE 快照|未发现证据|可定位的直接 UPDATE 均为 G34/G45 初始化迁移或事务内业务写；差异由迁移模式已完整解释，不据缺口虚构人工操作|
|H5 草稿/作废计入或漏计|不适用/排除|`fin_cash_transactions` 无 status、deleted_at、draft/void 字段；93 笔全部是物理存在流水|
|H6 Chanjet/跨系统导入双侧不同步|Chanjet 排除；历史 Excel 导入成立|Chanjet 创建账户固定 opening/current=0 且明确不导余额/事实；本组 93 笔均来自 G34 Excel 导入和 G45 主档合并|

## 6. 待批准修复方案

### 6.1 推荐方案 A：补齐现役账户期初凭证，停用重复账户先不伪造流水

推荐把 11 个现役账户作为真实账本：将已由 G34 原始数据和首笔流水双重证明的期初迁入目标账户，补一笔 `source_type='OPENING'` 的期初凭证，并以现有 `rebuildChain` 规则重建 `balance_after`。这样当前快照不应改变，却恢复“期初凭证 + 签名流水 = 快照”的可追溯链。

10 个有差异的 WWH 停用账户是迁移后遗留的重复主档，不建议补造业务流水。建议先明确审计口径：运营一致性门禁只覆盖 ACTIVE 账户，并把 `remark` 含 G45 并入标识的停用账户列为有据可查的 retired duplicate。若业务要求全表 54 个账户公式必须为零差异，再在批准后选择 6.3 的归档收口口径。

### 6.2 三段式执行脚本设计（本轮未创建、未执行）

批准后应使用独立运维脚本，不塞业务数据 DML 到 TypeORM 迁移：

1. **前置断言，失败即整单回滚**：锁定 11 对映射；断言来源均 INACTIVE、目标均 ACTIVE、币种/公司一致、目标 `opening_balance=0`；来源无流水、目标流水数合计 93；目标反推期初精确等于来源期初；修前 `current_balance = inferred_opening + signed_sum`；不存在 OPENING 流水；备份目标账户及 93 笔流水原值到受控导出文件。
2. **凭证化修复**：逐目标写入唯一、幂等 txn_no 的 OPENING 流水，金额等于已证期初；同步目标 `opening_balance`；调用等价于 `rebuildChain` 的同事务逻辑按 `(txn_date,id)` 重建派生 `balance_after`。严禁只执行 `UPDATE current_balance`。
3. **后置断言与回滚**：断言 11 个目标差异为 0、当前快照逐分不变、交易业务金额/方向/归属不变、仅新增 11 笔 OPENING；FH-10207 的派生链恢复连续。任一断言失败则 ROLLBACK。回滚脚本按固定 txn_no 删除 11 笔 OPENING、恢复账户与流水备份值，再复核行数和哈希。

OPENING 的 `txn_date` 应固定为各目标首笔业务流水之前，并保留 `source_type='OPENING'`、治理批次号、来源账户编码和审批单号；具体时间戳须由业务确认，不自行猜测。

### 6.3 停用旧账户的业务裁定清单

需用户在执行前选择其一：

- **A1（推荐）**：停用重复账户保持原样，审计规则明确排除有 G45 迁移证据的 retired duplicate；报告和映射永久保留其旧期初/旧期末，避免伪造迁出后的流水。
- **A2（全表硬一致）**：把停用重复账户收口为中性归档壳（`opening_balance=current_balance=0`），同时把修前值写入不可变的治理证据/审批附件和账户备注。该操作含直接改快照，只能作为主数据合并收尾，不能伪装成日常账务动作。
- **不推荐**：为停用来源补一组倒冲 MANUAL 流水。流水实际已改挂至目标，再造倒冲会制造并不存在的业务事件。

另需裁定 FH-10207：是否允许按签名金额重建 3 笔及其后续 `balance_after`（推荐允许；不改金额、方向、日期、账户归属和期末快照）。

## 7. 执行前批准项

本轮请求的批准边界是“方案”，不是生产写授权。后续即使方案获批，执行生产脚本前仍应单独确认目标环境、维护窗口、审批单号、备份位置与操作者。

请明确批准或调整：

1. 11 个现役账户采用方案 A：迁入已证期初 + 补 OPENING 凭证 + 重建派生链；
2. 10 个停用差异账户选择 A1（保留并排除）还是 A2（中性归档）；
3. FH-10207 是否重建异常 `balance_after` 链；
4. OPENING 凭证日期口径（建议为各账户首笔业务流水前一日当地日终）。

## 8. 可复核出处

- 权威重建逻辑：`apps/api/src/modules/finance-v2/services/cash-accounts.service.ts:193-235`
- G34 期初反推及末笔快照回填：`apps/api/migrations/20260608_g34_wangweihua_txns_excel.sql:577-601`
- G45 流水改挂、目标快照回填、来源停用：`apps/api/migrations/20260608_g45_account_dedup_unify.sql:13-58`
- G42 目标主档期初/当前均为零：`apps/api/migrations/20260608_g42_liujie_cash_accounts.sql:1-55`
- 交易实体无状态字段：`apps/api/src/modules/finance-v2/entities/fin-cash-transaction.entity.ts:24-87`
- Chanjet 只建零余额主档、不导事实：`apps/api/src/modules/chanjet/chanjet-erp-master-business-review.service.ts:1400-1420,1455-1484`
- 上轮 21 账户生产只读发现：`docs/ops/cash-account-balance-stale-audit-20260904.md:219-224`

## 9. 执行记录（批准方案落地）

### 9.1 本地工作区库演练与提交

- 治理批次 / APPROVAL-REF：`BAL-RECON-20260904`。
- 回滚演练 run：`local-20260904T071830Z`。备份 SHA-256 校验、11 对映射、22 个账户锁定、来源/目标状态、公司币种、来源无流水、目标 93 笔业务流水、反推期初、修前快照、无既有 OPENING 均通过；写后 11 个公式零差异、原快照逐分不变、93 笔业务流水关键字段不变、11 笔 OPENING、全链连续均通过，最后 `ROLLBACK`；回滚后 OPENING 和非零目标期初残留均为 0。
- 本地提交演练 run：`local-commit-20260904-fixed`。备份目录：`/tmp/phoenix-cash-balance-reconciliation-local-commit-20260904-fixed/`；账户 CSV 11 行、原业务流水 CSV 93 行；SHA-256：账户 `12d79e4e...899f2`、流水 `e6ee8046...b159`、回滚 SQL `072134b2...e76d`。
- 提交后独立只读复验：ACTIVE 账户 `37`、非零差异 `0`；有精确 G45 remark 证据的 retired duplicate `17` 个排除；其他 INACTIVE 非零差异 `0`；11 个 lookup/current 快照逐分不变。
- FH-10207 与其后续流水已按 `(txn_date,id)` 和签名金额重建；金额、方向、日期、账户归属、币种及期末 `279,843,132.53 LAK` 未改变。

### 9.2 生产执行

生产 workflow、备份归档、回滚 SQL 与独立只读公式门禁已纳入本次变更。生产 run 号、artifact/备份位置、断言输出和错误窗口结果须在受保护 workflow 实际执行后补录；在该 run 完成前不得标记生产修复完成。

- 首次生产执行 run `33849353358` 在前置断言阶段拒绝执行：生产 11 个目标账户 `opening_balance` 已非零，且业务流水已由报告快照的 93 笔增长为 426 笔。失败发生在任何 INSERT/UPDATE 之前，事务回滚，无需执行恢复 SQL。该结果证明生产状态已变化，禁止依据旧快照盲写或把 6 月期末余额硬编码为 lookup 基线。
- 通用只读 workflow run `33849458808` 因 SQL 不在其 `readonly-audits/` 路径白名单而在本地 validate 阶段拒绝，未连接生产。后续改用本治理 workflow 的显式 `verify` 只读模式。
- 专用只读 verify run `33850014213` 的生产只读事务通过：全库 77 个账户，其中 ACTIVE 54 个、公式差异 0；17 个带精确 G45 remark 证据的 retired duplicate 排除；其他 INACTIVE 非零差异 0。run 的远端验证步骤成功，后续 artifact 解码因 SSH action 尾部状态行污染而失败；已据此改为 BEGIN/END 标记截取并增加 tar 完整性校验。
- 修正后的独立只读 verify run `33850187212` 全绿，artifact `cash-balance-reconciliation-33850187212`（1,806 bytes，90 天保留）完整上传。证据为：ACTIVE `54`、ACTIVE 公式差异 `0`、G45 retired duplicate `17`、其他 INACTIVE 差异 `0`；11 个目标业务流水 `426`，`source_type='OPENING'` 为 `0`，本治理批次 OPENING 亦为 `0`；`FH-10207` 全链断点 `0`。
- 结论：生产已经处于“11 个目标期初非零且公式/派生链一致，但没有 OPENING 凭证”的部分修复状态。本次批准的硬前置（目标期初为 0、目标业务流水合计 93）已不成立；在重新批准将前置改为“期初等于已证值、动态锁定当前业务流水全集”之前，不执行剩余 11 笔 OPENING 补证，避免绕过已批门禁。

### 9.3 A 续批适配与期初写入溯源（BAL-RECON-20260904B）

用户已重新批准 A，并把执行前置改为“11 个目标期初精确等于已证值 + 动态锁定当前 426 笔业务流水全集”。续批脚本据此收窄为只新增 11 笔 OPENING：不再 UPDATE `opening_balance`，不 UPDATE `current_balance`，也不重写既有 `balance_after`。事务以表级 `SHARE ROW EXCLUSIVE` 锁阻止流水集合出现并发幻行，在锁内计算 426 笔完整行 JSON 指纹，后置逐项比对账户完整行、业务流水数量和指纹；任一不符即 ROLLBACK。凭证日期为各账户首笔业务流水的老挝当地自然日前一日 00:00，批次、审批引用均为 `BAL-RECON-20260904B`。

只读溯源的仓库证据边界如下：

- G42（commit `9edbc10d`，2026-06-08 22:06:09）明确因余额 Excel 无数据，将这些 FH/DP 目标主档的期初和当前余额 seed 为 0；G45（commit `7bb65418`，2026-06-08 22:30:56）只改挂流水、按末笔回填 `current_balance`，没有迁移 `opening_balance`。
- G57（commit `476f9c8c`，2026-06-09 05:59:58）因王玮华反馈期初错误而开放期初编辑及重算能力；G189（commit `d17b9fc8`，2026-06-17 16:38:40）再次记录她反馈两个现金账户期初不准/重复。这只能证明需求来源和可写入口，不能证明她执行了本次 11 个账户的具体写入。
- Git 历史未发现 G45 后有迁移批量回填这 11 个目标期初。首次生产 execute run `33849353358` 在任何 DML 前拒绝，故也不是该 run 写入；其前后部署/治理时间线以 GitHub Actions run ID 留档。
- `fin_cash_accounts` 有 `updated_at/updated_by`，但这是整行最后更新元数据，不是字段级审计；`sys_operation_logs` 也只覆盖被拦截器列入规则的高敏操作。生产只读 trace 将同时导出两者。若日志没有包含 `opening_balance` 的 before/after 事件，则具体写入者和写入时刻只能记为“来源不可考”，不能从最后更新时间或权限授权反推操作者。

生产只读 trace、续批 execute、独立只读复验的 run ID、账户元数据、日志命中、426 笔 SHA-256、错误窗口与 artifact 地址在受保护 workflow 完成后补录。

- 续批前只读 trace/verify run `33851173162`：11 个期初均精确命中证值；账户整行 `updated_by` 均为 `wangweihua`，其中 9 个最后更新时间为 2026-06-17 13:04:10 UTC、FH-10207 为 2026-06-18 02:29:27 UTC、DP-10 为 2026-09-04 07:11:23 UTC；`sys_operation_logs` 命中 0 行。由于 `updated_*` 会被任意账户余额刷新覆盖，DP-10 当日时间也直接证明它不是字段级审计，故最终结论为：账号线索指向 `wangweihua`，但 11 个期初的具体写入者/写入时刻来源不可考。证据边界是账户最后更新元数据、零条操作日志、上述 git/run 时间线。
- 首次续批 execute run `33851277448`：备份及 SHA-256 校验通过，在任何 INSERT 前因脚本额外检查了未获批改写的 DP-10/FH-101 历史派生链而拒绝，事务随 `ON_ERROR_STOP` 连接退出回滚。用户批准的硬边界是 426 笔业务流水哈希不变且只显式要求 FH-10207 链连续，因此该超范围门禁已收窄；DP-10/FH-101 的历史 `balance_after` 缺口独立留档，不在本次只新增 OPENING 的修复范围内。
- 正式 execute run `33851430528`（commit `c36b5326`）全绿并提交：事务锁内账户完整行 MD5 `a383c9c0034f9e2e051e6fe46d18f34e`，426 笔业务流水完整行 MD5 因 GitHub secret masking 仅在日志显示为 `602c975a4***e9807b317a1bf7b01d0f5`；artifact 内原始业务 CSV 为 426 行数据（含表头 427 行），SHA-256 `51f2f935946d33accfa3115ca3d8f7fd703da9c7b143013a5c53517522b16774`。前置、后置、事务 COMMIT、公式审计和 API 错误窗口均 PASS；账户完整行及 426 笔业务流水逐行快照不变，仅新增本批 11 笔 OPENING。备份/回滚目录 `/tmp/phoenix-cash-balance-reconciliation-33851430528/evidence`，artifact `cash-balance-reconciliation-33851430528`，上传包 SHA-256 `61f293f23d3d50d2539132eebe9ca512cb5899632ae16f7d839ef1c78e2024b4`。
- 独立只读复验 run `33851545661`：ACTIVE 54 / 公式差异 0，G45 retired duplicate 17，其他 INACTIVE 差异 0；目标 OPENING 11、本批 OPENING 11、业务流水 426；FH-10207 链断点 0。lookup/current 余额由 execute 的账户完整行前后哈希硬断言证明逐分未变。
- “派生链全连续”需区分本次获批范围与既有遗留：FH-10207 已连续；首次 execute 的只读前置另发现 DP-10 有 12 行、FH-101 有 2 行历史 `balance_after` 不连续。本次红线要求 426 笔业务流水哈希不变且仅新增 OPENING，故不能同时改写这 14 行。最终只读审计增加全 ACTIVE 账户链断点清单，作为下一治理项，不把它误报为本批已修复。
- 最终独立只读 run `33851704339`（commit `fc190151`）全绿，复验结果仍为 ACTIVE 54 / 公式差异 0、OPENING 11 / 本批 11、业务流水 426、FH-10207 断点 0。全 ACTIVE 派生链扫描同时确认共有 6 个既有账户不连续：`CA-202608-00001` 1 行、`CA-202608-00002` 3 行、`CASH_CNY` 3 行、`DP-04` 2 行、`DP-10` 12 行、`FH-101` 2 行。它们不影响账户期末公式零差异，但“全账户派生链全连续”这一附加目标当前客观未满足；受本批“只新增 11 笔 OPENING、426 笔业务事实哈希不变”红线约束，未擅自改写。

## 10. 6 个账户派生链生产只读取证（2026-09-04）

### 10.1 受控执行与零写入证明

本轮使用临时分支 `audit/cash-balance-chain-evidence-20260904`，分支最终 head `6e738c36`；专用 SQL 位于该分支的 `scripts/ops/readonly-audits/cash-balance-chain-breakpoints-20260904.sql`。权威生产只读 run 为 `33854376154`，artifact 为 `production-readonly-audit-33854376154`（日志 SHA-256 `657544f93b9fca032fe297f83ee4ce4e9bbef73e071e72bea68bc289191b5bf6`），run URL：`https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/33854376154`。生产 checkout/API/Web revision 三方均为 `f68947d64b8b27d827392bded6279d3fb7d904f3`。

该 run 只执行 SQL，没有启动 HTTP/API 探针：连接级 `default_transaction_read_only=on`、事务级 `transaction_read_only=on`，SQL 尾部显式 `ROLLBACK`；日志无 `cannot execute`、HTTP bootstrap 或被拒绝的写尝试，最终输出 `PASS AUDIT_SQL_DML_DDL=0` 与 `PASS PRODUCTION_BUSINESS_WRITES=0`。因此本次取证既是零业务写入，也是零 DML/DDL 尝试。

前两个 run `33853898320`、`33854255676` 因通用 workflow 的 HTTP 可选输入带默认值而额外启动默认 GET 探针；连接级 READ ONLY 拒绝了应用启动期写尝试，实际写入仍为 0，但不采用它们作为本轮“零 DML/DDL 尝试”的权威证据。临时分支随后仅把 workflow 的 HTTP 默认值改为空并重跑；该临时改动与审计 SQL均不进入 `main`。远端临时分支按红线保留，不删除。

公式仍为：按 `(txn_date,id)` 升序，`expected_balance_after = opening_balance + 累计非 OPENING 签名金额`，其中 `IN` 为正、`OUT` 为负，`OPENING` 不重复计入。run 硬断言：异常账户 `6`、断点 `23`、ACTIVE 账户期末公式差异 `0`；从各账户首断点起完整导出 `29` 行，交易号仅保留 16 位哈希，备注仅输出分类，未输出 `source_no/source_id/created_by`。

### 10.2 逐账户证据与定因

|账户|完整链|断点|首断点 ID / UTC|首断点后完整链|期末公式差异|定因|
|---|---:|---:|---|---:|---:|---|
|CA-202608-00001|2|1|505 / 2026-08-27 06:12:40|1|0.00|该笔 `AR_RECEIPT` 金额 500.00、预期余额 1,500.00，但记录为 numeric `NaN`。正常写入链可解释 NaN 如何产生，具体触发人/请求来源无字段级日志，记为“代码缺陷确定、触发来源未知”。|
|CA-202608-00002|4|3|507 / 2026-08-27 06:59:37|3|0.00|首笔 `AR_RECEIPT` 后为 NaN，后两笔同类流水继续传播 NaN；金额和期末账户余额均为有限数。代码缺陷确定，触发来源未知。|
|CASH_CNY|3|3|460 / 2026-07-11 02:31:32|3|0.00|三笔 `TRANSFER` 的 `balance_after` 全为 NaN；金额及账户公式有限并收敛。代码缺陷确定，触发来源未知。|
|DP-04|2|2|512 / 2026-08-29 06:34:08|2|0.00|`STORE_SALE` 15.00 与随后 `STORE_SALE_RETURN` 15.00 的 `balance_after` 均为 NaN，期末回到 0。代码缺陷确定，具体销售请求未知。|
|DP-10|69|12|508 / 2026-08-28 05:51:23|12|0.00|前 57 行连续；首断点以后 12 笔 `STORE_SALE/STORE_SALE_RETURN` 全为 NaN。账户期末为有限值 238,947,375.06 且公式差异 0。代码缺陷确定，具体销售请求未知。|
|FH-101|33|2|218 / 2026-06-10 00:00:00|8|0.00|ID 218/219 两笔等额反向 `MANUAL` 均固定偏高 7,900.00；ID 234 起自行回到权威链，后 6 行完全正确。现行 `createManual` 在事务外读余额且没有 `FOR UPDATE`，存在竞争风险，但仅凭现有字段不能证明本次就是并发；精确成因记为未知。|

前五个账户的 21 个断点不是普通金额偏差，而是 PostgreSQL `numeric NaN`。当前 schema 仅给 `balance_after NUMERIC(18,2) NOT NULL`，没有有限值 CHECK；PostgreSQL numeric 允许 NaN。更直接的代码根因是 TypeORM PostgreSQL 驱动对 `UPDATE ... RETURNING` 的 raw 返回值为 `[rows,rowCount]`，但三处代码按普通行数组读取：

- `CashAccountsService.applyBalance` 使用 `res[0].current_balance`；实际 `res[0]` 是 rows 数组。`Number(undefined)` 得到 NaN，影响 AR 收款和资金转账等公共调用方。
- `StorePosService.writeCashTransaction` 与 `writeCashRefund` 使用 `const [upd] = await mgr.query(UPDATE ... RETURNING)` 后读取 `upd.current_balance`；`upd` 同样是 rows 数组，影响门店销售与退款。
- `CashTransactionsService.writeTransaction`、上述调用方及 `CashAccountsService.rebuildChain` 均没有 `Number.isFinite` 防线，DB 也没有拒绝 numeric NaN 的约束，所以 NaN 能落库并沿后续流水传播。

这解释了 source_type 与时间边界，也解释了“账户 `current_balance` 的 SQL 运算正确且最终收敛、插入流水的 JS `balance_after` 却为 NaN”的组合。对具体操作者、请求参数和 FH-101 的 7,900.00 来源，现有脱敏行证据不足，均不作无证推断。

### 10.3 修复边界裁决

不能把脚本写成只按当前 `23` 个异常 ID 打补丁。正确执行范围是**从每个账户首断点起重算全部后续派生链，共 29 行**：前五个账户的 21 行都会实质变化；FH-101 从 ID 218 起共 8 行，其中前 2 行变化、后 6 行按公式重算后应逐分不变。换言之，预期实际变化仍是 23 行，但锁定、计算、备份、哈希和后置验证必须覆盖 29 行完整尾链。这样既不会遗漏传播行，也能证明 FH-101 的自然收敛段没有被误改。

待用户另行批准的精确修复清单：

1. 先修三处 `UPDATE ... RETURNING` 解包，并在所有现金余额/流水入口及 `rebuildChain` 增加 finite 断言；补 AR、TRANSFER、POS sale/return 的 NaN 回归测试。
2. 新增 TypeORM TS schema 迁移，为 `fin_cash_transactions.amount/balance_after` 与 `fin_cash_accounts.opening_balance/current_balance` 增加拒绝 NaN 的 CHECK；迁移加约束前必须由下述数据脚本先清除既有 21 个 NaN。
3. 数据修复只处理 6 个账户、首断点后的 29 行；不改账户期初、当前余额、流水金额、方向、日期、归属、source 字段或任何其他账户。预期 23 行 `balance_after` 改值、6 行值保持不变。
4. 本轮仅报告，不创建或执行生产修复脚本；生产 DML、维护窗口与审批引用须另行明确批准。

### 10.4 三段式数据脚本设计（未创建、未执行）

1. **前置取证与硬断言**：开启单事务并锁定 6 个账户及其流水集合；导出账户行、23 个断点、首断点后 29 行完整尾链并计算 SHA-256；断言账户/币种/期初/当前余额、首断点 ID、完整链行数、尾链行数、`21` 个 NaN + `2` 个有限偏差、ACTIVE 期末公式差异 0 均与 run `33854376154` 一致。任一变化立即 ROLLBACK。
2. **确定性重建**：使用同一事务内的窗口累计公式，从六个首断点分别重算至链尾；UPDATE 目标由“六账户 + 首断点位置”确定，不用手列 23 个 ID。硬断言仅 `balance_after` 可变，预期 UPDATE 命中 29 行、`IS DISTINCT FROM` 的实质变化为 23 行；账户表和其他流水列不得写入。
3. **后置验证与可逆回滚**：断言六账户全链断点 0、全部目标 `balance_after` 非 NaN、全 ACTIVE 期末公式差异仍为 0、六账户期初/当前余额逐分不变、29 行除 `balance_after` 外完整行哈希不变、其他流水全集哈希不变。COMMIT 前生成按主键恢复 29 行原 `balance_after` 的回滚脚本及校验摘要；任一断言失败整单 ROLLBACK。

## 11. `balance_after` 三阶段执行记录

### 11.1 阶段 1：代码止血

- 实现 commit：`8d3c1981`；PR：[#187](https://github.com/ivanzhao299/phoenix-erp-v3/pull/187)。
- 修复 `CashAccountsService.applyBalance`、`StorePosService.writeCashTransaction`、`writeCashRefund` 的 TypeORM raw DML `RETURNING` 解包，统一兼容 `rows[]` 与 `[rows,rowCount]`，空返回受控拒绝。
- 现金账户、流水写入口及 `rebuildChain` 增加有限数断言；`createManual` 的账户读取移入同一事务并使用 `FOR UPDATE`，事务内原子计算快照与更新余额。
- 定向 Jest：7 suites / 34 tests PASS，覆盖 AR_RECEIPT、TRANSFER、POS `STORE_SALE/STORE_SALE_RETURN`、手工流水并发、真实 raw tuple 与 NaN fail-closed。
- 全量 API Jest（`NODE_ENV=test`）：96 suites / 780 tests PASS，1 suite / 6 tests 按既有配置 skipped。API/Web TypeScript 均 0 errors；constraint drift、entity drift、nullable-in-unique 均 PASS；显式批准冻结/安全边界后的 W5 closeout 20/20 PASS。
- PR CI 全绿：regression `33855911123`、security `33855911134`、build `33855911173`、test-only `33855911200`、smoke `33855911150`、Web Vitest `33855911266`。PR 于 merge commit `7ba93975e4122d75d48a3c27b57e3294ee10f550` 合入。
- full deploy run `33856555018` 成功；API/Web 生产 revision 均为 `7ba93975e4122d75d48a3c27b57e3294ee10f550`。迁移前备份 `***-backups/deploy-pre-migration-33856555018/phoenix_erp_pre_7ba93975e412.dump`，SHA-256 `ba5542d1fb4038c054dbef36d67c04be47699e1e9e9cbc95b5fe279d2a776e3d`。确认该 revision 后才解锁阶段 2。

### 11.2 阶段 2：29 行受控派生链重建

- 治理批准引用：`BAL-CHAIN-REBUILD-20260904`；正式执行 bundle 最终 merge revision `7d54aa4cb941369706678ecd04f2b44a61577a0c`。相关 PR 为 [#188](https://github.com/ivanzhao299/phoenix-erp-v3/pull/188)、[#189](https://github.com/ivanzhao299/phoenix-erp-v3/pull/189)、[#190](https://github.com/ivanzhao299/phoenix-erp-v3/pull/190)、[#191](https://github.com/ivanzhao299/phoenix-erp-v3/pull/191)，对应治理提交 `be284164`、`e35f7e64`、`ba0d5667`、`8091c350`。
- 三次 fail-closed 演练分别在任何持久化前/事务内回滚：run `33858451781`（导出命令变量解析，UPDATE 前回滚）、`33859068609`（证据目录权限，UPDATE 前回滚）、`33859855941`（其他流水集合哈希误含目标 29 行，更新后后置断言触发整单回滚）。修正后的完整演练 run `33860469863` 全绿并显式 ROLLBACK。
- 正式生产 execute run `33860555170` 全绿并 COMMIT：动态基线精确命中 6 账户、23 断点、21 NaN + 2 有限偏差、29 行尾链、ACTIVE 期末公式差异 0 及六个首断点 ID；UPDATE 命中 29 行，实质改变 23 行、6 行逐分不变。后置为目标及全 ACTIVE 链断点 0、NaN 0、公式差异 0、账户完整行不变、29 行除 `balance_after` 外不变、其他流水集合不变、API 错误窗口 0。
- 证据/回滚 artifact：`cash-balance-chain-33860555170`，artifact ID `9931954916`，上传 ZIP SHA-256 `642f9710c73006d20c08ab2d88cc6a856ce7f907727c2c8eba8e1db2cea6a25a`，90 天保留。包内 `accounts-before.csv` SHA-256 `5390678a9a3cdd0ec8b6eb43e1e84a527e6027939a1dc9472497a6d840049795`，`rollback.sql` SHA-256 `391616ec211b43e9b1b19b741501ee237ded953711681990741329c1eaf2b59e`；受控执行机位置 `/tmp/phoenix-cash-balance-chain-33860555170/evidence`。
- 独立只读复验 run `33860671646` 全绿：全部 ACTIVE 账户全链断点 0、numeric NaN 0、期末公式差异 0。只有该复验完成后才开始阶段 3。

### 11.3 阶段 3：数据库有限数约束

- 迁移 commit `c7cba985`，约束策略测试 commit `6536eee6`；PR [#192](https://github.com/ivanzhao299/phoenix-erp-v3/pull/192)，merge commit `3d04dbbb6be63e199621faef0cf93a1c37c76142`。新增 TypeORM TS migration `RejectNonFiniteCashBalances1788570000000`，为 `fin_cash_transactions.amount/balance_after`、`fin_cash_accounts.opening_balance/current_balance` 添加并 VALIDATE `CHECK (column <> 'NaN'::numeric)`；`down()` 完整删除四条约束。PostgreSQL `numeric` 无 Infinity，故未加入虚假 Infinity 表达式，也未增加 allowlist。
- 本地验证：API/Web tsc 0 errors；API 96 suites / 780 tests PASS（1 suite / 6 tests skipped）；资金定向 2 suites / 11 tests PASS；约束策略 2 tests PASS；g201 constraint drift、entity drift、nullable-in-unique、阶段 2 policy 3 tests 及只读 audit 输入门禁均 PASS。
- PR CI 全绿：security `33861165408`、build `33861165393`、regression `33861165514`、smoke `33861165383`、Web Vitest `33861165401`、CI/CD test `33861165449`。最初 security attempt 使用加标签前的事件快照失败，添加 `reviewed-frozen-boundary` 后的新 revision run 全绿，未以 allowlist 绕过。
- full deploy run `33861866617` 成功；迁移日志明确记录 `RejectNonFiniteCashBalances1788570000000 has been executed successfully`，API/Web 生产 revision 均为 `3d04dbbb6be63e199621faef0cf93a1c37c76142`。迁移前备份 `***-backups/deploy-pre-migration-33861866617/phoenix_erp_pre_3d04dbbb6be6.dump`，SHA-256 `f70e988a7abb984564f7cc166312945c0cdb87c28f0f04d18aba8683357a6d28`。
- 首次生产只读 audit run `33862940181` 已证明四约束 VALID、NaN 0、六账户 lookup 差异 0，但 audit 自身遗漏了 `source_type='OPENING'` 不计入签名金额的既有语义，因此报出伪断点并只读失败；未写生产。修复 commit `9d3b7d91` 经 PR [#193](https://github.com/ivanzhao299/phoenix-erp-v3/pull/193) 全 CI 通过，merge commit `504b4f2eb173804ec8d15b3f0828f9247fc66ef8`。run `33863560626` 仅因传入不存在的空 HTTP manifest 在本地 validate 拒绝，未连接生产。
- 最终独立生产只读 audit run `33863603094` 全绿：生产 checkout/API/Web revision 均为 `3d04dbbb6be63e199621faef0cf93a1c37c76142`；四条 CHECK 均 `convalidated=true`，四列 numeric NaN 合计 0，ACTIVE 全链断点 0，ACTIVE 期末公式差异 0，六账户 opening/current 与阶段 2 前逐分 lookup 差异 0。输出余额依次为 `1000.00/1500.00`、`2000.00/2160.00`、`1.00/0.00`、`0.00/0.00`、`10494389.06/238947375.06`、`10370.00/3512.00`；60 分钟错误窗口 0。
- 最终 audit artifact：`production-readonly-audit-33863603094`，artifact ID `9933084047`，上传 ZIP SHA-256 `ed343d76e85d64abc268f2195bb9d805316e290a870d6a0e70967567aa0de4bd`，30 天保留。

三阶段最终状态：代码写入层 fail-closed、历史 29 行派生链已受控重建、数据库四列 NaN 约束已 VALID；账户 `opening_balance/current_balance` 在阶段 2 全程未改，业务金额、方向、日期、账户、币种及 source 等事实未改。
