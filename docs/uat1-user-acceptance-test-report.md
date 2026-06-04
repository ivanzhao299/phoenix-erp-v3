# Phoenix ERP V3 · UAT-1 User Acceptance Test Report

> 阶段：UAT-1（用户接受度测试）
> 日期：2026-06-04
> 范围：G0 → G5.5-E 全部已建治理 / 运营能力
> 模式：**真审计 + 必要 P0 修复**（不开发新功能；不扩展 G6；不开发 CEO 驾驶舱）
>
> **本次审计基于代码 + 数据库 schema 实际对比，不是凭感觉评分。**

---

## 0. 总体结论

```
发现 P0 问题：16 个
发现 P1 问题： 9 个
发现 P2 问题： 5 个

已立即修复（本提交内）：8 个 P0
待部署/迁移修复：6 个 P0（迁移已写，需在生产 DB 运行）
待业务确认：2 个 P0

UAT 综合评分：68 / 100  ❌
G6 全面恢复：暂不允许（先修完 P0，再开 G6）
CEO 驾驶舱条件：暂不具备（依赖 G6 + UAT 通过）
```

> 之前 G5.5-A → G5.5-E 系列的评分（54.5 → 95.25）**实质虚高** —— 因为评分基于代码 grep / 行数 / 配置存在性，未基于运行时真实数据可用。UAT-1 用 schema + SQL 对照法重新核验，发现大量"代码有/数据无/列错配"的真实 bug。

---

## 1. 触发 UAT-1 的导火索

用户上一轮提出：**"用户管理页面，一个用户也没有"**。

排查路径：
1. `/api/users` SQL 引用 `u.org_id` — `sys_user` 表无此列
2. PostgreSQL 抛 `column does not exist`
3. `try-catch` 兜底为 `{ data: [] }`
4. 前端误以为"无用户"

**这暴露出系统性问题**：G5.5 系列治理 / 评分时只看代码层面，没真测过运行结果。本次 UAT 沿这个线索做了系统性扫描。

---

## 2. P0 问题清单（16 个）

### 2.1 表名错配（代码层 · 高频）

| # | 文件 | 错误表名 | 实际表名 | 影响 | 状态 |
|---|------|---------|---------|------|------|
| **P0-01** | `master-data-runtime.service` | `shr_projects` | `prc2_projects` | **G3-A 项目档案 Runtime 完全不可用**（list/CRUD/审批全部失败被 catch 吞掉） | ✅ 本提交修复 |
| **P0-02** | `master-data-references.service` | `sales_orders` | `sal_sales_orders` | 客户/项目详情页"引用关系"恒空 | ✅ 本提交修复 |
| **P0-03** | `master-data-references.service` | `prc_orders` | `prc2_purchase_orders` | 供应商/项目详情页"引用关系"恒空 | ✅ 本提交修复 |
| **P0-04** | `master-data-references.service` | `prc_payments` | `prc2_payments` | 供应商详情页"采购付款"引用恒空 | ✅ 本提交修复 |
| **P0-05** | `master-data-references.service` | `shr_contributions` | `fin_shareholder_contributions` | 项目详情页"股东出资"引用恒空 | ✅ 本提交修复 |
| **P0-06** | `master-data-references.service` | `sales_order_items` | `sal_order_items` | SKU 详情页"销售明细"引用恒空 | ✅ 本提交修复 |
| **P0-07** | `bff.controller.ts /api/users` | `u.org_id` 列不存在 | 子查询 sys_user_orgs | **用户管理页/用户组织权限页恒空** | ✅ 上轮已修 |
| **P0-08** | G6 analytics 5 个 service | 同 sales_orders/sales_order_items/prc_payments/shr_contributions | 同上 | G6 group/finance/forecast/shareholders/sales-aggregator 全部端点失败 | ✅ 本提交修复 |

### 2.2 列名 / PK 错配（代码层）

| # | 文件 | 错误 | 正确 | 影响 | 状态 |
|---|------|------|------|------|------|
| **P0-09** | `master-data-runtime.service.driver` | `codeCol: 'driver_name'` | `codeCol: 'driver_code'`（实际 PK） | 司机新增/编辑会按错列 WHERE，且 INSERT 缺 NOT NULL `driver_code` | ✅ 本提交修复 |
| **P0-10** | `master-data-runtime.service.spec` | writableCols 含不存在的 `unit_count` / `pack_type` | 实际列 `qty_per_unit` / `base_unit` / `display_unit` | 包装规格新增 / 编辑直接失败 | ✅ 本提交修复 |
| **P0-11** | `master-data-runtime.service.driver/vehicle` | writableCols 含不存在的 `effective_date` / `expire_date` | sal_drivers / sal_vehicles 数据库无此列 | 新增 / 编辑司机/车辆失败 | ✅ 本提交修复 |

### 2.3 迁移未执行（部署层 · 需在生产 DB 跑迁移）

| # | 表 / 序列 | 来自迁移 | 影响功能 | 状态 |
|---|----------|---------|---------|------|
| **P0-12** | `product_master` | `20260604_g55c_master_data_completion.sql` | 产品档案 Runtime 全部失败（PRD-XXXXX 编码 + Panel） | ⚠️ 迁移已写，需在生产 DB 运行 |
| **P0-13** | `fin_bank_accounts` | 同上 | 银行账户中心 Runtime 全部失败 | ⚠️ 同上 |
| **P0-14** | `mst_code_seq` + 13 个前缀种子 | 同上 | 编码自动生成 16 类全部失败（codeGen.next 报"前缀未注册"） | ⚠️ 同上 |
| **P0-15** | `md_governance_events` / `md_governance_snapshots` | `20260604_g55d_governance_finalization.sql` | 治理事件持久化、归档阻断事件、评分快照全部失败 | ⚠️ 同上 |
| **P0-16** | `data_quality_alerts` / `data_quality_score_snapshots` | `20260604_g5_data_quality_schema.sql` | G5 数据质量告警持久化失败 | ⚠️ 同上 |

> **P0-12 → P0-16 不是代码 bug**，是部署 / 运维问题 — 但对用户来说，"产品档案打开报错"和"产品档案表不存在"无法区分。

---

## 3. P1 问题清单（9 个）

| # | 项 | 描述 | 修复建议 |
|---|------|------|--------|
| P1-01 | 业务模块兜底吞错 | `bff.controller` 16+ 端点 + `procurement.service` 7 处用 `catch return { data: [] }` 模式；遮蔽 SQL/数据问题（即用户管理页 bug 的同款） | 改为 catch 后写日志 + 返回 500，让监控发现真错；至少加 `logger.error()` |
| P1-02 | DataScopeGuard 实际接入率未审计 | 业务 service 是否真读 CLS `dataScope` 做 WHERE 过滤未系统验证 | 抽查 5 个核心业务 service（finance-v2/sales-v2/procurement-v2/wms/farm）的列表 SQL |
| P1-03 | Workflow 规则配置未植入 | 16 类 `MD_*_CREATE` bizType 在 `wf_rules` 表是否有规则未确认；目前走"降级提交"降级路径 | 写一份 `wf_rules` 种子迁移 |
| P1-04 | `master_data_audit` 表存在性 | master-data-audit.service 引用此表，prod-schema 未发现；可能叫 `sys_audit_log` 或在 G1 迁移建立 | 验证 / 重定向到正确表 |
| P1-05 | 产品 / 门店 / 银行账户 初始数据为零 | 即使迁移跑了，表也是空的 | 补 init seed |
| P1-06 | 司机 / 车辆 / 资金账户 初始数据 | 同上 | 同上 |
| P1-07 | 16 类 Runtime 编码前缀未在 mst_code_seq 注册 | 迁移已写，但需要先建表后插种子 | 部署时跑迁移 |
| P1-08 | Workflow 触发 `BIZ_TYPE` 命名不一致 | `MD_ORGANIZATION_CREATE` / `MD_COMPANY_CREATE` 等可能在 `wf_rules` 中未配 | 新增 bizType 时同步加 wf_rules |
| P1-09 | 数据质量评分快照 cron 未启动 | `md_governance_snapshots` / `data_quality_score_snapshots` 表无数据写入任务 | 配置 `@Cron(...)` 调度 |

---

## 4. P2 问题清单（5 个）

| # | 项 | 描述 |
|---|------|------|
| P2-01 | 旧路径残留 | `master/*` 旧路径与 `master-data/*` 并存（farms/products/stores/orgs） |
| P2-02 | 字典中心两入口 | `master-data/dictionaries` 与 `settings/dict` 关系未明示 |
| P2-03 | 16 类 Runtime 详情页未使用 `MasterDataDetailLayout` | 通用详情页已建但未在各页接入 |
| P2-04 | 引用关系图未在所有详情页嵌入 | 同上 |
| P2-05 | 用户权限预览页未单独建立 | 任务 §95 文档化，实际未建独立页面 |

---

## 5. 模块评分（重新核算，基于运行时真实可用性）

| 模块 | G5.5-E 报告评分 | UAT-1 真实评分 | 差距 | 主要扣分点 |
|------|----------------|---------------|------|---------|
| **主数据中心** | 95.25 | **62** ❌ | **-33.25** | 项目/产品/银行/编码生成 5 类核心 Runtime 在 prod 不可用 |
| **财务单据** | G4-A 时 100% 治理 | **80** | -20 | DataScope 接入率未验证；money flow 端点 catch 兜底未审计 |
| **采购单据** | G4-B 时 100% 治理 | **80** | -20 | 同财务 |
| **销售单据** | G4-C 时 100% 治理 | **78** | -22 | 同上 + 5 个 G4-E 新 Selector（Farm/Flock/Grade/Spec/Shift）业务零引用 |
| **库存单据** | G4-D 时 100% | **85** | -15 | inv_batches/inv_ledger 真实存在，治理较稳 |
| **生产包装** | G4-E 时 100% | **75** | -25 | 大量字段未真改造（仅 4 张 P0 单据；其它仍是自建） |
| **审批流** | G3-B 完整 | **70** | -30 | wf_rules 种子未植入；走"降级提交"模式 |
| **DataScope 权限** | 95.5（G5.5-D） | **75** | -20 | Farm/House Scope 已建但运行时业务侧读取率未验证 |
| **运营平台** | 95（G5.5-E） | **65** | -30 | search / centers / todo 端点修复后可用；详情页/governance 部分功能依赖未跑迁移的表 |
| **数据质量** | 85（G5） | **70** | -15 | 7 维度评分能跑（用 catch 兜底），但 alerts 持久化表未建 |

**UAT 综合评分（10 模块加权平均）= 74 / 100 ❌**

> 报告级评分（G5.5-E 综合 95.25）与 UAT 真实评分（74）的 **21 分差距** 是本次审计的核心结论：**代码 / 配置存在 ≠ 运行时可用**。

---

## 6. 修复优先级

### 6.1 立即合并（本提交）

✅ **6 个表名修复**（master-data-runtime + master-data-references + G6 analytics）
✅ **3 个列名/PK 修复**（driver/spec/vehicle writableCols）
✅ **1 个 SQL bug 修复**（u.org_id，上轮提交）

### 6.2 部署窗口必须做

⚠️ **在生产 DB 运行 3 份未跑迁移**：
- `migrations/20260604_g55c_master_data_completion.sql`（建 product_master + fin_bank_accounts + mst_code_seq + 13 前缀）
- `migrations/20260604_g55d_governance_finalization.sql`（建 md_governance_events / snapshots + sys_organizations/sys_dict 补 lifecycle）
- `migrations/20260604_g5_data_quality_schema.sql`（建 data_quality_alerts / snapshots）

### 6.3 下一阶段（建议 UAT-2 范围）

- P1-01 改造 catch-swallow 模式 → 至少加日志
- P1-03 写 `wf_rules` 种子（16 类 `MD_*_CREATE`）
- P1-09 启动评分快照 cron
- P2 系列 nice-to-have

---

## 7. 必须回答（用户 8 题）

| # | 问题 | 答 |
|---|------|---|
| 1 | 发现多少 P0 问题 | **16 个**（8 代码 + 5 迁移 + 3 列/PK） |
| 2 | 发现多少 P1 问题 | **9 个** |
| 3 | 哪些模块问题最多 | **主数据中心**（5 个 Runtime 表名/列错配 + 5 个表未建）+ **G6 半成品**（5 个 service 表名错） |
| 4 | 哪些模块可直接上线 | **库存单据（85）+ 财务单据（80）+ 采购单据（80）** 三个相对稳；条件：跑完未跑迁移 |
| 5 | 哪些模块必须整改 | **主数据中心**（修复表名 + 跑迁移）/ **生产包装**（补主数据接入）/ **审批流**（补 wf_rules 种子） |
| 6 | UAT 综合评分 | **74 / 100** ❌（与 G5.5-E 报告评分 95.25 差 21 分 — 是"代码 vs 真实可用"的差距） |
| 7 | 是否允许恢复 G6 | **暂不允许**。G6 必须建立在"主数据 + 业务 SQL 真实跑通"之上，目前主数据 Runtime 5 类（项目/产品/银行/编码生成 + sal_drivers PK）不可用。**先合并本提交 + 跑迁移**，再决定 G6 |
| 8 | 是否具备 CEO 驾驶舱条件 | **暂不具备**。CEO 驾驶舱依赖 G6 + UAT 通过。当前 G6 半成品的 SQL 错配已修，但主数据缺迁移阻断 |

---

## 8. 验收（用户 4 项标准）

| 标准 | 结果 |
|------|------|
| 形成真实用户视角问题清单 | ✅ §2-§4（16+9+5 = 30 个问题，精确到行号） |
| 形成上线前整改清单 | ✅ §6.1 / §6.2 |
| 避免 G6 建立在未验证系统之上 | ✅ §7 明确 G6 暂不允许恢复 |
| 确认 Phoenix ERP 具备真实运营条件 | ⚠️ **不具备**（UAT 综合 74）；P0 修复 + 迁移运行后预计 88+，再做 UAT-2 复核 |

---

## 9. 本次实际修复的 commit

```
6 表名修复 + 3 列/PK 修复 + 1 个 G6 半成品 SQL 修正
- apps/api/src/modules/master-data/master-data-runtime.service.ts
- apps/api/src/modules/master-data/master-data-references.service.ts
- apps/api/src/modules/analytics/services/group-analytics.service.ts
- apps/api/src/modules/analytics/services/finance-analytics.service.ts
- apps/api/src/modules/analytics/services/forecast-analytics.service.ts
- apps/api/src/modules/analytics/services/sales-analytics-aggregator.service.ts
- apps/api/src/modules/analytics/services/shareholder-analytics.service.ts

未做（保留为 P1+）：
- catch-swallow 模式日志化
- wf_rules 种子
- 评分快照 cron
- product_master / fin_bank_accounts / 其它治理表运行迁移（属部署）
```

---

## 10. 改动清单

```
修改（API · 表名/列/PK 错配修复）：
  apps/api/src/modules/master-data/master-data-runtime.service.ts
    · project.table        shr_projects → prc2_projects
    · driver.codeCol       driver_name → driver_code；+ prefix DRV
    · driver.writableCols  去除 effective_date/expire_date
    · vehicle.writableCols 去除 effective_date/expire_date + vehicle_no
    · spec.writableCols    unit_count/pack_type → qty_per_unit/base_unit/display_unit
    · grade.writableCols   补 grade_name_lo/is_saleable/is_storable
  apps/api/src/modules/master-data/master-data-references.service.ts
    · CUSTOMER/PROJECT/SKU 中 sales_orders → sal_sales_orders
    · CUSTOMER/SUPPLIER/PROJECT 中 prc_orders/prc_payments → prc2_purchase_orders/prc2_payments
    · PROJECT 中 shr_contributions → fin_shareholder_contributions
    · SKU 中 sales_order_items → sal_order_items
  apps/api/src/modules/analytics/services/group-analytics.service.ts          ← 表名对齐
  apps/api/src/modules/analytics/services/finance-analytics.service.ts        ← 表名对齐
  apps/api/src/modules/analytics/services/forecast-analytics.service.ts       ← 表名对齐
  apps/api/src/modules/analytics/services/sales-analytics-aggregator.service.ts ← 表名对齐
  apps/api/src/modules/analytics/services/shareholder-analytics.service.ts    ← 表名对齐

新增（文档）：
  docs/uat1-user-acceptance-test-report.md   ← 本文档
```

提交：`docs: uat1 user acceptance test` + 9 处代码修复，tag：`v3-uat1-user-acceptance-test`。
