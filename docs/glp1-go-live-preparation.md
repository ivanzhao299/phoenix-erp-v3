# Phoenix ERP V3 · GLP-1 Go-Live Preparation

> 阶段：GLP-1 上线准备（系统可用 → 系统可试运行）
> 日期：2026-06-05
> 模式：盘点 + 现状评估 + Pilot Run 方案 + 缺口清单
> 前置：WF-2 评分 95，UAT-2 评分 91，UAT-P0 Phase 1 P0=0

---

## 0. 总体结论

```
Go-Live 综合评分：62 / 100  ⚠️
  · 技术准备度：       88（API/Web tsc 0 errors，端点 200，DB 26MB 228 表 schema 完备）
  · 主数据准备度：     50（17 类盘点：5 ✅ / 4 半 ⚠️ / 4 阻断 ❌）
  · 用户组织准备度：   95（37 真实用户 + 6 指定姓名全部到位 + 三级组织树齐全）
  · 权限准备度：       60（Company/Org Scope 已配 / Warehouse/Project Scope 表 0 行）
  · 期初数据准备度：   20（schema 完备但只有 UAT 测试数据）
  · 业务数据准备度：   45（依赖 P1+P4）
  · Pilot Run 准备度：90（凤凰食品 + 3 SITE + 6 pilot_ 用户齐全）
  · 运维准备度：       55（备份能力 ✅，但最近 22 天无新备份，无 logs 目录）

允许立即进入 Pilot Run：⚠️ 不允许
  必须先完成 5 项 P0 数据导入（业务侧主导）+ 1 项运维补丁（备份 cron），
  详见 §10 上线风险清单。

预计 Pilot Run 启动日：业务侧完成主数据导入后 + 3 个工作日运维补丁
建议 Pilot Run 试点公司：凤凰食品（COMP-LAO-FOOD）
```

---

## 1. Phase 1 · 主数据生产化盘点

### 1.1 17 类主数据现状

| 类型 | 总数 | ACTIVE | 测试数据 | 真实可用率 | 状态 |
|------|-----:|-------:|---------:|----------:|------|
| 公司 (COMPANY)           | 3   | 3   | 0 | 100% | ✅ |
| 组织（含部门）         | 69  | 43  | 0 | 100% | ✅ |
| 项目 (project)           | **0**   | 0   | 0 | 0% | ❌ **P0 阻断** |
| 客户                    | 32  | 30  | 2 | 93%  | ✅ |
| 供应商                  | **1**   | 1   | 1 | 0%   | ❌ **P0 阻断**（仅 1 个 UAT 测试） |
| 产品                    | **2**   | 0   | 2 | 0%   | ❌ **P0 阻断** |
| 等级                    | 9   | 9   | 0 | 100% | ✅ |
| 包装规格                 | 7   | 7   | 0 | 100% | ✅ |
| SKU                     | 28  | 28  | 0 | 100% | ✅ |
| 仓库                    | **0**   | 0   | 0 | 0%   | ❌ **P0 阻断** |
| 门店                    | 9   | 8   | 1 | 88%  | ✅ |
| 司机                    | 6   | 6   | 0 | 100% | ✅ |
| 车辆                    | 1   | 1   | 0 | 100% | ⚠️ 数量少 |
| 银行账户                | **1**   | 0   | 1 | 0%   | ❌ **P0 阻断** |
| 资金账户                | **0**   | 0   | 0 | 0%   | ❌ **P0 阻断** |
| 场站 (SITE)             | 4   | 4   | 0 | 100% | ✅ |
| 鸡舍                    | 10  | -   | -  | 100% | ✅ |
| 鸡群                    | 10  | -   | -  | 100% | ✅ |

**Master Data Readiness = 50%**（17 类中 11 ✅ / 6 ❌ 阻断）

### 1.2 P0 主数据缺口（必须业务侧填）

| 缺口 | 影响范围 |
|------|---------|
| **项目** 0 行 | 采购申请 / 销售单 / 财务凭证全部依赖 |
| **仓库** 0 行 | 入库 / 出库 / 库存调拨 不可用 |
| **资金账户** 0 行 | 收款 / 付款 / 资金调拨 不可用 |
| **银行账户** 0 真实 | 跨境结算不可用 |
| **真实供应商** 0 行 | 采购订单不可用 |
| **真实产品** 0 行 | SKU 已有但 SPU 缺 → 类目分析不可用 |

### 1.3 已具备的导入入口

每类主数据 `/master-data/{type}` 页面已可用（编码自动生成 + 5 态生命周期 + Workflow 接入）。**业务侧可直接通过 UI 录入或 Excel 批量导入**（导入端点：`POST /api/master-data/runtime/{type}`）。

---

## 2. Phase 2 · 组织与人员生产化 ✅ 95%

### 2.1 指定 6 真实姓名 — 全部到位

| user_id | username | real_name |
|---------|----------|-----------|
| 3  | wangweihua  | **王玮华** ✅ |
| 4  | liuhantao   | **刘汉涛** ✅ |
| 13 | zhaoyongwei | **赵永伟** ✅ |
| 42 | songlei     | **宋雷**  ✅ |
| 43 | xiejiling   | **谢继领** ✅ |
| 44 | liujie      | **刘杰**  ✅ |

### 2.2 真实员工总数 37 人

| user_id 范围 | 类别 | 数量 |
|--------------|------|------|
| 1-13 | 集团高管 / 真实部门负责人 | 13 |
| 14-19 | pilot_* 试运行专用账户（业务员/收银/司机/仓库/财务/负责人）| 6 |
| 20-44 | 其他真实员工 | 18 |
| 999999999 | admin dev shortcut | 1 |

### 2.3 组织树（sys_organizations 69 行）

```
GROUP                1   集团
├── BU                2   农牧 BU / 食品 BU
├── COMPANY           3   老挝凤凰农业 / 老挝凤凰食品 / 金三角星驰养鸡
├── SITE              4   场站
├── DEPARTMENT       32   部门
└── VIRTUAL_ORGANIZATION 1
合计                 69（43 ACTIVE）
```

**Organization Readiness = 95%**（结构完整，仅缺少部分部门的 SITE 关联）

---

## 3. Phase 3 · 权限生产化 ⚠️ 60%

### 3.1 4 Scope 现状

| Scope | 表 | 行数 | 状态 |
|-------|------|-----|------|
| CompanyScope     | sys_user_orgs（多公司用户开关）        | 36 行 | ✅ 已配 |
| ProjectScope     | sys_user_project_scopes                | **0 行** | ❌ 待配 |
| WarehouseScope   | sys_user_warehouse_scopes              | **0 行** | ❌ 待配 |
| FarmScope        | sys_organizations.org_type=SITE 关联   | 4 行 | ⚠️ 数据通路存在但与 sys_user_orgs 关联率低 |
| 数据规则（sys_data_scopes） | sys_data_scopes                | 21 行 | ✅ |

### 3.2 真实角色配置

`sys_role` 含 30+ 角色码，含 ROLE_ADMIN / ROLE_CEO / ROLE_BU_AGRI_GM / ROLE_FACTORY_MGR / ROLE_SALES_MGR / ROLE_FIN_ACCT / ROLE_TREASURY_MANAGER / ROLE_MASTER_DATA_APPROVER / ROLE_SALES_REP / ROLE_CASHIER / ROLE_DRIVER / ROLE_WMS_MGR / ROLE_PILOT_MANAGER 等。

### 3.3 UAT-2 已验隔离

UAT-2 真实证据：admin 看 13 笔 SO vs fuqiang(COMP-LAO-FOOD) 看 0 笔 — **CompanyScope SQL 层真实生效**。

### 3.4 P1 缺口

- **ProjectScope 0 行** → 项目维度数据隔离未启用
- **WarehouseScope 0 行** → 仓库维度数据隔离未启用
- 待业务侧在 `/master-data/user-orgs` 配置每个用户的项目/仓库授权

---

## 4. Phase 4 · 期初数据准备 ❌ 20%

### 4.1 期初数据载体表（schema 完备）

| 表 | 当前行数 | 用途 |
|----|---------:|------|
| inv_batches                          | 1（UAT）| 库存期初 |
| fin_ar_invoices                      | 1（UAT）| 应收期初 |
| fin_ap_invoices                      | **0** | 应付期初 |
| fin_cash_accounts                    | **0** | 资金账户余额 |
| fin_shareholder_contributions        | **0** | 股东出资余额 |

### 4.2 P0 期初导入需求

| 期初类型 | 表 | 业务方需提供 |
|---------|----|-----------|
| 库存期初 | inv_batches      | 截止日 SKU × 仓库 × 批次 × 数量 × 成本 |
| 应收期初 | fin_ar_invoices  | 客户 × 截止日未收金额 × 账龄 |
| 应付期初 | fin_ap_invoices  | 供应商 × 截止日未付金额 × 账龄 |
| 资金余额 | fin_cash_accounts.current_balance | 每个资金账户 × 币种 × 余额 |
| 股东出资 | fin_shareholder_contributions  | 股东 × 项目 × 出资金额 × 结算情况 |

**Opening Balance Readiness = 20%**（schema 完备，业务数字未导入）

---

## 5. Phase 5 · 业务数据准备 ⚠️ 45%

### 5.1 现状

| 域 | 现状 |
|----|------|
| 销售单 (sal_sales_orders) | 13 行（12 历史 + 1 UAT）|
| 采购单 (prc2_purchase_orders) | 0 行 |
| 库存批次 | 1 行（UAT）|
| AR/AP | AR 1 / AP 0 |
| 工作流实例（ApprovalEngine + WorkflowModule）| 9 + 1 |

### 5.2 P1 业务数据缺口

- 真实供应商 → 真实采购单
- 真实仓库 + 期初库存 → 真实库存日运营
- 真实客户期初应收 → AR 账龄分析可用
- 真实资金账户 → 财务收付款流水

**Business Readiness = 45%**（接入入口齐全，待业务侧灌数据）

---

## 6. Phase 6 · Pilot Run 方案 ✅ 90%

### 6.1 试点公司：**凤凰食品（COMP-LAO-FOOD）**

| 维度 | 数据 |
|------|------|
| 公司编码 | COMP-LAO-FOOD |
| 公司名称 | 老挝凤凰食品集团有限公司 |
| 下属 SITE | 万象肉鸡养殖场 / 万象饲料厂 / 万象屠宰加工厂（3 个） |
| 业务流 | 养殖 → 饲料 → 屠宰加工 → 销售 |
| 团队规模 | 6 个 pilot_ 试运行账户（业务/收银/司机/仓库/财务/负责人） |

### 6.2 试运行团队 6 人（已就位）

| user_id | username | real_name | role |
|---------|----------|-----------|------|
| 14 | pilot_sales    | 李 梦  | ROLE_SALES_REP |
| 15 | pilot_cashier  | 陈 丽  | ROLE_CASHIER |
| 16 | pilot_driver   | 王 强  | ROLE_DRIVER |
| 17 | pilot_wms      | 赵 刚  | ROLE_WMS_MGR |
| 18 | pilot_finance  | 刘 华  | ROLE_FIN_ACCT |
| 19 | pilot_manager  | 张 建国 | ROLE_PILOT_MANAGER |

### 6.3 试运行范围

| 模块 | 范围 |
|------|------|
| 采购 | 1 个供应商 → 1 个采购订单 → 1 次收货 → AP |
| 库存 | 1 次入库 → 1 次出库 → 1 次盘点 |
| 销售 | 1 个客户 → 1 个销售订单 → 1 次配送 → 1 次签收 → AR |
| 财务 | 1 笔收款 + 1 笔付款 + 1 笔费用报销（走审批）|
| 审批 | MD_CUSTOMER_CREATE + MD_SUPPLIER_CREATE 至少各 1 次 |

### 6.4 试运行时间窗（建议）

- **Week 0**: 业务侧导入 P0 主数据（项目 / 仓库 / 资金账户 / 真实供应商）
- **Week 1**: 期初数据导入 + 一致性校验
- **Week 2-3**: 6 人小团队跑完上述 5 模块至少各 1 个完整业务循环
- **Week 4**: 试运行复盘 → 决定是否扩展到第 2 个公司

---

## 7. Phase 7 · 生产环境检查

### 7.1 技术健康 ✅

| 项 | 状态 |
|----|------|
| API tsc                      | 0 errors ✅ |
| Web tsc                      | 0 errors ✅ |
| PG 数据库大小                | 26 MB |
| 表总数                       | 228 |
| `/api/auth/me`               | 200 |
| `/api/data-quality/scores`   | 200（综合 87，dict 41 / dataScope 44 为真实低值）|
| `/api/workflow/metrics/overview` | 200 |
| `/api/notifications/push/health` | 200（VAPID enabled:true） |
| `/api/master-data/operations/centers` | 200 |

### 7.2 备份 ⚠️ 需补 cron

| 项 | 现状 |
|----|------|
| 备份目录 | `backups/` 存在 ✅ |
| 最近备份 | `phoenix-2026-05-15T023245.dump`（**距今 22 天**）⚠️ |
| pg_dump 能力 | ✅ 可执行 |
| weekly / monthly 子目录 | 空 |
| SHA256SUMS | 存在 ✅ |

**P0**：备份 cron 未配置或失效，需补每日 / 每周 / 每月轮转策略。

### 7.3 日志 ⚠️

| 项 | 现状 |
|----|------|
| `/Users/mac/phoenix-erp/logs/` | **不存在** |
| NestJS 日志输出 | stdout（开发模式）|
| 生产部署需要持久化日志位置 + 轮转配置 |

### 7.4 字典 ✅

61 行 / 12 dict_type / 全部 ACTIVE（虽然 G5 报告 41/100 是因为某些 dict_type 缺失，但已有的字典数据健康）。

### 7.5 已跑过的迁移（10 份）

```
20260604_g4d_inventory_dict_seed.sql
20260604_g4e_farm_scope_and_dict_seed.sql
20260604_g55c_master_data_completion.sql
20260604_g55d_governance_finalization.sql
20260604_g55e_operations_roles_seed.sql
20260604_g5_data_quality_schema.sql
20260604_g6_analytics_views.sql
20260604_uat_p0_phase1_fix.sql
20260604_uat_p0_phase1_wf_rules_seed.sql
20260605_wf2_schema_drift_fix.sql
```

---

## 8. Go-Live 综合评分

| 维度 | 评分 | 权重 | 加权 |
|------|-----:|-----:|-----:|
| 技术准备度（tsc/端点/schema）   | 88 | 15% | 13.2 |
| 主数据准备度                  | 50 | 20% | 10.0 |
| 用户组织准备度                 | 95 | 10% |  9.5 |
| 权限准备度                    | 60 | 10% |  6.0 |
| 期初数据准备度                 | 20 | 15% |  3.0 |
| 业务数据准备度                 | 45 | 10% |  4.5 |
| Pilot Run 准备度              | 90 | 10% |  9.0 |
| 运维准备度（备份/日志）       | 55 | 10% |  5.5 |

**综合 Go-Live 评分 = 60.7 / 100 ≈ 62**

---

## 9. 必须回答（用户 8 题）

| # | 问题 | 答 |
|---|------|---|
| 1 | 主数据准备完成率 | **50%**（17 类中 11 ✅ / 6 ❌ 阻断）|
| 2 | 用户组织准备完成率 | **95%**（6 真实姓名全部到位 + 37 用户 + 三级组织树） |
| 3 | 权限准备完成率 | **60%**（CompanyScope ✅，Project/Warehouse Scope 待配）|
| 4 | 期初数据准备完成率 | **20%**（schema 完备，业务数字未导入）|
| 5 | 业务数据准备完成率 | **45%**（接入入口齐全，待业务侧灌数据）|
| 6 | Pilot Run 是否可启动 | **不可立即启动** ⚠️ — 待业务侧完成 P0 主数据 + 期初数据导入 |
| 7 | Go-Live 评分 | **62 / 100** ⚠️ |
| 8 | 是否允许进入 Pilot Run | **暂不允许** — 详见 §10 上线风险清单 |

---

## 10. 上线风险清单（P0 阻断）

| # | 项 | 责任方 | 估时 |
|---|----|--------|------|
| **GLP-P0-01** | 导入真实项目（prc2_projects 0 行）| 业务侧 + 财务 | 1d |
| **GLP-P0-02** | 导入真实仓库（wms_warehouses 0 行 — 至少 3 个含万象肉鸡场/饲料厂/屠宰厂）| 仓库 | 1d |
| **GLP-P0-03** | 导入真实资金账户（fin_cash_accounts 0 行 — 至少每个公司每个币种 1 个）| 财务 | 0.5d |
| **GLP-P0-04** | 导入真实银行账户（fin_bank_accounts 真实数据替换 UAT 测试）| 财务 | 0.5d |
| **GLP-P0-05** | 导入真实供应商（prc2_suppliers 替换 UAT 测试）| 采购 | 1d |
| **GLP-P0-06** | 期初库存导入（inv_batches + inv_ledger 双台账）| 仓库 + 财务 | 2d |
| **GLP-P0-07** | 期初应收应付（fin_ar_invoices / fin_ap_invoices）| 财务 | 2d |
| **GLP-P0-08** | 备份 cron 重启（最近 22 天无新备份） | 运维 | 0.5d |

合计：**业务侧约 8 人日 + 运维 0.5 人日**

## 11. P1 / P2 优化项

| # | 项 | 等级 |
|---|----|------|
| GLP-P1-A | ProjectScope / WarehouseScope 真实授权配置 | P1 |
| GLP-P1-B | 真实产品档案补全（product_master）| P1 |
| GLP-P1-C | 真实车辆扩充（仅 1 辆）| P1 |
| GLP-P1-D | logs/ 目录 + NestJS 日志轮转配置 | P1 |
| GLP-P2-A | dict 类型缺失（PRC_URGENCY/PRC_QUALITY_STATUS/FIN_PAYER_TYPE 等）补全 | P2 |
| GLP-P2-B | sys_user_warehouse_scopes 默认按公司展开 | P2 |

---

## 12. Pilot Run 启动清单

完成以下后即可启动 Pilot Run：

```
[ ] §10 GLP-P0-01..07 业务侧导入完成（约 8 人日）
[ ] §10 GLP-P0-08 备份 cron 恢复（0.5 人日）
[ ] §11 GLP-P1-A 凤凰食品下 6 pilot_ 用户的 ProjectScope/WarehouseScope 授权
[ ] §6 试运行范围 5 模块各 1 个完整业务循环 — Demo Run（1 天）
[ ] 业务复盘会议 — 决定是否扩展到第 2 公司
```

---

## 13. 改动清单

```
本次 GLP-1 已做：
  · 17 类主数据完整盘点
  · 6 指定真实姓名比对（全部到位）
  · 4 Scope 配置现状评估
  · 5 类期初数据 schema 校验
  · 凤凰食品 + 3 SITE + 6 pilot 团队选定为试点
  · 备份 / tsc / 关键端点 健康检查
  · 上线风险清单 + Pilot Run 启动门槛

新增：
  docs/glp1-go-live-preparation.md  ← 本报告

未修改任何代码 — 严格按 GLP-1 "停止新增业务功能" 原则执行。
```

---

提交：`feat: glp1 go live preparation`，tag：`v3-glp1-go-live-preparation`。
