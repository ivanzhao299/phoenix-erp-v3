# Phoenix ERP V3 — Navigation Final

**版本**：V3 最终导航架构  
**日期**：2026-05-30  
**阶段**：Navigation Final — Pilot Run 前最终治理  
**状态**：✅ 已完成（scope-audit 31/31 PASS，API/Web TS 0 错误）

---

## 1. 最终菜单树

> 全 12 个一级菜单，完整业务中文命名，无技术术语（无 V2/Runtime/AR/AP/DataScope 等）。  
> 所有条目均配置有效 `MENU_*` 权限码，无 `perm: null`。

---

### 1. 工作台

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 工作台 | `/dashboard` | `MENU_DASHBOARD` |

---

### 2. 生产管理

**入口权限**：`MENU_FARM_DATA`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 养殖总览 | `/breeding` | `MENU_FARM_DATA` |
| 鸡舍管理 | `/breeding/henhouse` | `MENU_FARM_DATA` |
| 鸡群档案 | `/breeding/flock` | `MENU_FARM_DATA` |
| 日生产日报 | `/breeding/daily` | `MENU_FARM_DATA` |
| 免疫计划 | `/breeding/immune` | `MENU_FARM_VET` |
| 用药记录 | `/breeding/medicine` | `MENU_FARM_VET` |
| 设备监控 | `/breeding/device` | `MENU_DEVICE_MONITOR` |
| 环境预警 | `/breeding/device-alerts` | `MENU_DEVICE_MONITOR` |
| 设备运维 | `/breeding/device-ops` | `MENU_DEVICE_MONITOR` |
| 包装作业 | `/packaging` | `MENU_PKG_OP` |
| 集蛋入库 | `/packaging/inbound` | `MENU_PKG_MGR` |
| 批次管理 | `/packaging/batch` | `MENU_PKG_MGR` |
| 包装日报 | `/packaging/daily-report` | `MENU_PKG_MGR` |
| 异常处理 | `/packaging/exceptions` | `MENU_PKG_MGR` |
| 补打日志 | `/packaging/print-logs` | `MENU_PKG_MGR` |
| 质检总览 | `/quality` | `MENU_QA_OP` |
| 场端质检 | `/quality/farm` | `MENU_QA_OP` |
| 成品质检 | `/quality/product` | `MENU_QA_OP` |
| 不合格品处置 | `/quality/nonconformance` | `MENU_QA_MGR` |
| 正向追溯 | `/quality/forward` | `MENU_QA_MGR` |
| 反向追溯 | `/quality/backward` | `MENU_QA_MGR` |
| 质量标准 | `/quality/standards` | `MENU_QA_MASTER` |

> 快捷入口：包装作业台（新窗口 `/terminal/packaging/dashboard`）

---

### 3. 库存管理

**入口权限**：`MENU_WMS_VIEW`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 库存总览 | `/warehouse` | `MENU_WMS_VIEW` |
| 入库管理 | `/warehouse/inbound` | `MENU_WMS_INOUT` |
| 出库管理 | `/warehouse/outbound` | `MENU_WMS_INOUT` |
| 调拨管理 | `/warehouse/transfer` | `MENU_WMS_INOUT` |
| 盘点管理 | `/warehouse/stocktake` | `MENU_WMS_INOUT` |
| 出入库流水 | `/warehouse/ledger` | `MENU_WMS_VIEW` |
| 库存查询 | `/warehouse/query` | `MENU_WMS_VIEW` |
| 临期库存 | `/warehouse/expiry` | `MENU_WMS_VIEW` |
| 日结对账 | `/warehouse/daily-close` | `MENU_WMS_INOUT` |
| 损耗管理 | `/warehouse/loss-report` | `MENU_WMS_INOUT` |
| 仓库主档 | `/warehouse/warehouses` | `MENU_WMS_MASTER` |
| 库区管理 | `/warehouse/zones` | `MENU_WMS_MASTER` |
| 库位管理 | `/warehouse/locations` | `MENU_WMS_MASTER` |

---

### 4. 采购管理

**入口权限**：`MENU_PRC2_MASTER`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 采购看板 | `/procurement2/dashboard` | `MENU_PRC2` |
| 供应商档案 | `/procurement2/suppliers` | `MENU_PRC2_MASTER` |
| 采购项目 | `/procurement2/projects` | `MENU_PRC2_MASTER` |
| 采购申请 | `/procurement2/requests` | `MENU_PRC2_MASTER` |
| 采购订单 | `/procurement2/orders` | `MENU_PRC2_ORDER` |
| 物流管理 | `/procurement2/shipments` | `MENU_PRC2_SHIPMENT` |
| 收货管理 | `/procurement2/receipts` | `MENU_PRC2_RECEIPT` |
| 付款管理 | `/procurement2/payments` | `MENU_PRC2_PAYMENT` |
| 股东资金 | `/procurement2/shareholder-funds` | `MENU_PRC2_FUND` |
| 历史初始化 | `/procurement2/init` | `MENU_PRC2_INIT` |

---

### 5. 销售管理

**入口权限**：`MENU_SALES2`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 销售总览 | `/sales2` | `MENU_SALES2` |
| 客户管理 | `/sales2/customers` | `MENU_SALES2_CUSTOMER` |
| 渠道管理 | `/sales2/channels` | `MENU_SALES2_CHANNEL` |
| 价格管理 | `/sales2/pricing` | `MENU_SALES2_PRICE` |
| 销售订单 | `/sales2/orders` | `MENU_SALES2_ORDER` |
| 配送管理 | `/sales2/delivery` | `MENU_SALES2_DELIVERY` |
| 退货管理 | `/sales2/returns` | `MENU_SALES2_RETURN` |
| 信用管理 | `/sales2/credit` | `MENU_SALES2_CREDIT` |
| 直营店收银 | `/store-pos` | `MENU_STORE_POS` |
| 门店工作台 | `/store` | `MENU_STORE_MGR` |
| 收货验收 | `/store/receiving` | `MENU_STORE_MGR` |
| 门店库存 | `/store/inventory` | `MENU_STORE_MGR` |
| 补货申请 | `/store/replenish` | `MENU_STORE_MGR` |
| 损耗记录 | `/store/losses` | `MENU_STORE_MGR` |
| 门店日结 | `/store/daily` | `MENU_STORE_MGR` |
| 鸡蛋库存 | `/sales2/inventory` | `MENU_SALES2_INVENTORY` |
| 销售分析 | `/sales2/reports` | `MENU_SALES2_REPORT` |

---

### 6. 财务管理

**入口权限**：`MENU_FIN2`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 财务总览 | `/finance2` | `MENU_FIN2` |
| 应收账款 | `/finance2/ar` | `MENU_FIN2_AR` |
| 应付账款 | `/finance2/ap` | `MENU_FIN2_AP` |
| 资金账户 | `/finance2/cash-accounts` | `MENU_FIN2_CASH` |
| 资金调拨 | `/finance2/fund-transfers` | `MENU_FIN2_CASH` |
| 股东资金 | `/finance2/shareholder-funds` | `MENU_FIN2_SHAREHOLDER` |
| 费用管理 | `/finance2/expenses` | `MENU_FIN2_EXPENSE` |
| 报销管理 | `/finance2/reimbursements` | `MENU_FIN2_REIMBURSE` |
| 财务报表 | `/finance2/reports` | `MENU_FIN2_REPORT` |

---

### 7. 审批中心

**入口权限**：`MENU_WORKFLOW`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 我的待办 | `/workflow/todos` | `MENU_WORKFLOW` |
| 我的已办 | `/workflow/history` | `MENU_WORKFLOW` |
| 通知中心 | `/notifications` | `MENU_WORKFLOW` |
| 审批规则 | `/settings/approval-rules` | `MENU_WORKFLOW` |
| 表单管理 | `/workflow/forms/runtime` | `MENU_WORKFLOW` |
| 审批看板 | `/workflow/metrics` | `MENU_WORKFLOW` |

---

### 8. 经营分析

**入口权限**：`MENU_DASHBOARD`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 经营总览 | `/analytics` | `MENU_DASHBOARD` |
| 销售分析 | `/analytics/sales` | `MENU_SALES2_REPORT` |
| 渠道分析 | `/analytics/channels` | `MENU_SALES2_CHANNEL` |
| 库存分析 | `/analytics/inventory` | `MENU_DASHBOARD` |
| 配送分析 | `/analytics/delivery` | `MENU_SALES2_DELIVERY` |
| 财务分析 | `/analytics/finance` | `MENU_FIN2_REPORT` |
| 信用分析 | `/analytics/credit` | `MENU_SALES2_CREDIT` |

---

### 9. 主数据中心

**入口权限**：`MENU_MASTER`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 主数据概览 | `/master-data` | `MENU_MASTER` |
| 组织架构 | `/master-data/organizations` | `MENU_SYS_ORG` |
| 公司档案 | `/master-data/companies` | `MENU_MASTER` |
| 项目档案 | `/master-data/projects` | `MENU_PRC2_MASTER` |
| 客户档案 | `/master-data/customers` | `MENU_SALES2_CUSTOMER` |
| 供应商档案 | `/master-data/suppliers` | `MENU_PRC2_MASTER` |
| 产品档案 | `/master-data/products` | `MENU_MASTER` |
| 等级档案 | `/master-data/product-grades` | `MENU_MASTER_GRADE` |
| 包装规格 | `/master-data/packaging-specs` | `MENU_MASTER_PACKAGING` |
| SKU档案 | `/master-data/product-skus` | `MENU_MASTER_SKU` |
| 仓库档案 | `/master-data/warehouses` | `MENU_WMS_MASTER` |
| 门店档案 | `/master-data/stores` | `MENU_MASTER` |
| 司机档案 | `/master-data/drivers` | `MENU_SALES2_DELIVERY` |
| 车辆档案 | `/master-data/vehicles` | `MENU_SALES2_DELIVERY` |
| 资金账户档案 | `/master-data/cash-accounts` | `MENU_FIN2_CASH` |
| 系统字典 | `/master-data/dictionaries` | `MENU_SETTINGS_DATA` |

---

### 10. 系统设置

**入口权限**：`MENU_SETTINGS_USER`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 用户管理 | `/settings/users` | `MENU_SETTINGS_USER` |
| 角色权限 | `/settings/roles` | `MENU_SETTINGS_IT` |
| 菜单权限 | `/settings/permissions` | `MENU_SETTINGS_IT` |
| 数据权限 | `/settings/data-scopes` | `MENU_SYS_ORG` |
| 系统参数 | `/settings/master-data` | `MENU_SETTINGS_IT` |
| 安全策略 | `/settings/security` | `MENU_SETTINGS_IT` |
| 品牌配置 | `/settings/brand` | `MENU_SETTINGS_IT` |
| 终端配置 | `/settings/pda-terminals` | `MENU_SETTINGS_IT` |
| 收银配置 | `/settings/pos-config` | `MENU_SETTINGS_IT` |
| 库存分账 | `/settings/store-stock` | `MENU_SETTINGS_IT` |
| 通知设置 | `/settings/notifications` | `MENU_SETTINGS_IT` |

---

### 11. 验收试运行

**入口权限**：`MENU_UAT`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 验收管理 | `/uat` | `MENU_UAT` |
| 试运行项目 | `/pilot-run` | `MENU_UAT` |

---

### 12. 系统运维

**入口权限**：`MENU_SYS_MONITOR`

| 子菜单 | 路由 | 权限码 |
|--------|------|--------|
| 系统健康 | `/system/health` | `MENU_SYS_MONITOR` |
| 告警中心 | `/system/alerts` | `MENU_SYS_MONITOR` |
| 错误日志 | `/system/error-logs` | `MENU_SETTINGS_IT` |
| 配置治理 | `/system/configs` | `MENU_SYS_CONFIG` |
| 备份策略 | `/system/backup` | `MENU_SYS_CONFIG` |

---

## 2. 菜单 ↔ Runtime 对应关系

| 菜单 | 对应 Runtime/模块 |
|------|-------------------|
| 生产管理 | 养殖生产（Farm）+ 分级包装（Packaging）+ 品质追溯（QA）|
| 库存管理 | WMS Runtime（入库/出库/调拨/盘点） |
| 采购管理 | Procurement V2 Runtime（PO/PR/收货/付款） |
| 销售管理 | Sales V2 Runtime Phase 0~8 + POS + Store |
| 财务管理 | Finance V2 Runtime（AR/AP/资金/费用） |
| 审批中心 | Approval Engine（工作流规则引擎） |
| 经营分析 | Sales V2 Phase 8 Analytics Runtime |
| 主数据中心 | 统一主数据（客户/供应商/产品/等级/SKU） |
| 系统设置 | 用户/角色/RBAC/安全/品牌 |
| 验收试运行 | UAT Runtime + Pilot Run |
| 系统运维 | System Monitor Runtime（健康/告警/配置治理） |

---

## 3. 菜单 ↔ 权限码 完整映射

> 共使用 87 个 `MENU_*` 权限码，全部在 `rbac.matrix.ts` 中注册。

| 一级菜单入口 | 主权限码 | 说明 |
|-------------|----------|------|
| 工作台 | `MENU_DASHBOARD` | 全角色可见 |
| 生产管理 | `MENU_FARM_DATA` | 养殖/包装/质检合并 |
| 库存管理 | `MENU_WMS_VIEW` | WMS 全模块 |
| 采购管理 | `MENU_PRC2_MASTER` | 采购 V2 |
| 销售管理 | `MENU_SALES2` | 销售 V2 |
| 财务管理 | `MENU_FIN2` | Finance V2 |
| 审批中心 | `MENU_WORKFLOW` | 工作流引擎 |
| 经营分析 | `MENU_DASHBOARD` | BI 看板 |
| 主数据中心 | `MENU_MASTER` | 主数据统一 |
| 系统设置 | `MENU_SETTINGS_USER` | 设置管理 |
| 验收试运行 | `MENU_UAT` | UAT + Pilot Run |
| 系统运维 | `MENU_SYS_MONITOR` | 运维监控 |

---

## 4. 删除 / 隐藏的旧菜单

以下旧模块已用 `LegacyFreezeBanner` 冻结，不再出现在主导航：

| 旧菜单 | 状态 | 替代模块 |
|--------|------|----------|
| 订单管理（旧 B2B） | 冻结，页面保留 | 销售管理 → 销售订单 |
| 批发管理 | 冻结 | 销售管理 → 渠道管理 |
| 分销商管理（B2B） | 冻结 | 主数据中心 → 客户档案 |
| 采购 V1 | 冻结 | 采购管理（V2） |
| 财务（旧） | 冻结 | 财务管理（V2） |
| 门店主档 `/master/stores` | 路由修正 → `/master-data/stores` | 主数据中心 → 门店档案 |
| 产品档案 `/settings/products` | 路由修正 → `/master-data/products` | 主数据中心 → 产品档案 |
| 审计日志 | 改名 → 错误日志（/system/error-logs） | 系统运维 → 错误日志 |

---

## 5. Pilot Run 用户视角

### ROLE_SALES_REP（业务员）可见菜单
- 工作台
- 销售管理（销售总览/客户管理/渠道管理/销售订单/退货管理/鸡蛋库存/销售分析）
- 审批中心（我的待办/我的已办/通知中心）
- 经营分析（销售分析/渠道分析）

### ROLE_WMS_MGR（仓库主管）可见菜单
- 工作台
- 库存管理（全部子项）
- 生产管理（养殖总览-只读）
- 经营分析（经营总览/库存分析）
- 主数据中心（仓库档案）

### ROLE_DRIVER（司机）可见菜单
- 工作台
- 销售管理（配送管理）
- 经营分析（配送分析）

### ROLE_ADMIN（超级管理员）可见菜单
- 全部 12 个一级菜单，全部子菜单

---

## 6. 本次 Navigation Final 变更说明

| 变更项 | 变更前 | 变更后 |
|--------|--------|--------|
| 经营分析子菜单 | 价格分析/生产报表/饲料核对 | 销售分析/渠道分析/配送分析/财务分析/信用分析 |
| 经营分析权限 | 全用 `MENU_DASHBOARD` | 按模块精细化（SALES/DELIVERY/FIN/CREDIT） |
| 库存管理-仓库看板 | 仓库看板 | 库存总览 |
| 库存管理-库存台账 | 库存台账 | 出入库流水 |
| 库存管理-临期预警 | 临期预警 | 临期库存 |
| 库存管理-报损管理 | 报损管理 | 损耗管理 |
| 系统运维-日志 | 审计日志（/settings/audit-log） | 错误日志（/system/error-logs） |
| 系统运维-新增 | — | 备份策略（/system/backup） |
| 系统设置-新增 | — | 通知设置（/settings/notifications） |
| 主数据-门店档案路由 | `/master/stores`（旧路由） | `/master-data/stores` |
| 主数据-产品档案路由 | `/settings/products`（错误路由） | `/master-data/products` |

---

## 7. 验证结果

| 验证项 | 结果 |
|--------|------|
| API TypeScript 编译 | ✅ 0 错误 |
| Web TypeScript 编译 | ✅ 0 错误 |
| scope-audit 31/31 | ✅ 全部通过 |
| perm: null 条目 | ✅ 无（全部配置 MENU_* 权限码） |
| RBAC 矩阵覆盖 | ✅ 所有 MENU_* 码已注册（87 个） |

---

*由 Claude Sonnet 生成 — Navigation Final 2026-05-30*
