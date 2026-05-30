# Phoenix ERP V3 — Navigation Final

**版本**：V3 最终导航架构  
**日期**：2026-05-30  
**阶段**：Pilot Run 前最终治理

---

## 1. 最终菜单树

> 全 12 个一级菜单，完整业务中文命名，无技术术语。

### 1. 工作台
| 入口 | 路由 | 权限 |
|------|------|------|
| 工作台 | `/dashboard` | `MENU_DASHBOARD` |

---

### 2. 生产管理
> 合并：养殖生产 + 分级包装 + 品质追溯

| 子菜单 | 路由 | 权限 |
|--------|------|------|
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

---

### 3. 库存管理
> 原"仓储库存"改名，统一入口

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 仓库看板 | `/warehouse` | `MENU_WMS_VIEW` |
| 入库管理 | `/warehouse/inbound` | `MENU_WMS_INOUT` |
| 出库管理 | `/warehouse/outbound` | `MENU_WMS_INOUT` |
| 调拨管理 | `/warehouse/transfer` | `MENU_WMS_INOUT` |
| 盘点管理 | `/warehouse/stocktake` | `MENU_WMS_INOUT` |
| 库存台账 | `/warehouse/ledger` | `MENU_WMS_VIEW` |
| 库存查询 | `/warehouse/query` | `MENU_WMS_VIEW` |
| 临期预警 | `/warehouse/expiry` | `MENU_WMS_VIEW` |
| 日结对账 | `/warehouse/daily-close` | `MENU_WMS_INOUT` |
| 报损管理 | `/warehouse/loss-report` | `MENU_WMS_INOUT` |
| 仓库主档 | `/warehouse/warehouses` | `MENU_WMS_MASTER` |
| 库区管理 | `/warehouse/zones` | `MENU_WMS_MASTER` |
| 库位管理 | `/warehouse/locations` | `MENU_WMS_MASTER` |

---

### 4. 采购管理
> Procurement V2 正式入口，旧采购入口已隐藏

| 子菜单 | 路由 | 权限 |
|--------|------|------|
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
> 合并：销售系统 + 直营门店（收银+日结+门店操作）

| 子菜单 | 路由 | 权限 |
|--------|------|------|
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
> Finance V2 统一入口

| 子菜单 | 路由 | 权限 |
|--------|------|------|
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
> 原"工作流"改名，统一审批入口

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 我的待办 | `/workflow/todos` | `MENU_WORKFLOW` |
| 我的已办 | `/workflow/history` | `MENU_WORKFLOW` |
| 通知中心 | `/notifications` | `MENU_WORKFLOW` |
| 审批规则 | `/settings/approval-rules` | `MENU_WORKFLOW` |
| 表单管理 | `/workflow/forms/runtime` | `MENU_WORKFLOW` |
| 审批看板 | `/workflow/metrics` | `MENU_WORKFLOW` |

---

### 8. 经营分析
> 原"数据分析"改名，BI + 多维报表

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 经营总览 | `/analytics` | `MENU_DASHBOARD` |
| 价格分析 | `/analytics/price-review` | `MENU_DASHBOARD` |
| 生产报表 | `/analytics/production` | `MENU_DASHBOARD` |
| 库存分析 | `/analytics/inventory` | `MENU_DASHBOARD` |
| 饲料核对 | `/analytics/feed` | `MENU_DASHBOARD` |

---

### 9. 主数据中心

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 主数据概览 | `/master-data` | `MENU_MASTER` |
| 组织架构 | `/master-data/organizations` | `MENU_SYS_ORG` |
| 公司档案 | `/master-data/companies` | `MENU_MASTER` |
| 项目档案 | `/master-data/projects` | `MENU_PRC2_MASTER` |
| 客户档案 | `/master-data/customers` | `MENU_SALES2_CUSTOMER` |
| 供应商档案 | `/master-data/suppliers` | `MENU_PRC2_MASTER` |
| 产品档案 | `/settings/products` | `MENU_MASTER` |
| 等级档案 | `/master-data/product-grades` | `MENU_MASTER_GRADE` |
| 包装规格 | `/master-data/packaging-specs` | `MENU_MASTER_PACKAGING` |
| SKU档案 | `/master-data/product-skus` | `MENU_MASTER_SKU` |
| 仓库档案 | `/master-data/warehouses` | `MENU_WMS_MASTER` |
| 门店档案 | `/master/stores` | `MENU_MASTER` |
| 司机档案 | `/master-data/drivers` | `MENU_SALES2_DELIVERY` |
| 车辆档案 | `/master-data/vehicles` | `MENU_SALES2_DELIVERY` |
| 资金账户档案 | `/master-data/cash-accounts` | `MENU_FIN2_CASH` |
| 系统字典 | `/master-data/dictionaries` | `MENU_SETTINGS_DATA` |

---

### 10. 系统设置

| 子菜单 | 路由 | 权限 |
|--------|------|------|
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

---

### 11. 验收试运行

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 验收管理 | `/uat` | `MENU_UAT` |
| 试运行项目 | `/pilot-run` | `MENU_UAT` |

---

### 12. 系统运维

| 子菜单 | 路由 | 权限 |
|--------|------|------|
| 系统健康 | `/system/health` | `MENU_SYS_MONITOR` |
| 告警中心 | `/system/alerts` | `MENU_SYS_MONITOR` |
| 审计日志 | `/settings/audit-log` | `MENU_SETTINGS_IT` |
| 配置治理 | `/system/configs` | `MENU_SYS_CONFIG` |

---

## 2. 旧菜单归并清单

| 旧菜单名 | 处置方式 | 归并至 |
|----------|----------|--------|
| 仪表盘 | 改名 | 工作台 |
| 养殖生产 | 合并 | 生产管理 |
| 分级包装 | 合并 | 生产管理 |
| 品质追溯 | 合并 | 生产管理 |
| 仓储库存 | 改名 | 库存管理 |
| 直营门店 | 拆解合并 | 销售管理（收银+日结+门店操作） |
| 销售系统 | 改名 | 销售管理 |
| 工作流 | 改名 | 审批中心 |
| 数据分析 | 改名 | 经营分析 |

---

## 3. 隐藏菜单清单

以下菜单已从 Sidebar 完全隐藏（代码页面保留，可通过直接 URL 访问）：

| 隐藏菜单 | 原因 |
|----------|------|
| 旧采购供应 (`/procurement`) | 已由采购管理取代 |
| 旧订货系统 (`/order`) | 已由销售管理取代 |
| 旧 B2B 分销 (`/b2b`) | 已由渠道管理取代 |
| 旧 POS 销售 (`/pos`) | 已由直营店收银取代 |
| 配送运输 (`/transport`) | 已由配送管理取代 |
| 会员营销 (`/members`) | 功能融入渠道管理 |
| 批发管理 (`/wholesale`) | 功能融入销售管理 |
| 旧财务结算 (`/finance`) | 已由财务管理取代 |
| 旧主数据 (`/master`) | 部分入口保留（门店档案、产品档案） |

---

## 4. 权限映射

| 菜单组 | 组权限 | 主要角色 |
|--------|--------|----------|
| 工作台 | `MENU_DASHBOARD` | CEO, CFO, 总部财务, 区域经理, 农场主管, 销售主管, 审计 |
| 生产管理 | `MENU_FARM_DATA` | 农场主管, 养殖员, 兽医, CEO, 区域经理, WMS主管 |
| 库存管理 | `MENU_WMS_VIEW` | WMS主管, 农场主管, 财务会计, CEO, 区域经理, 审计 |
| 采购管理 | `MENU_PRC2_MASTER` | 采购员, 农场主管, CFO, CEO, 区域经理, 项目经理 |
| 销售管理 | `MENU_SALES2` | 销售主管, 业务员, 门店主管, CEO, 总部财务, 区域经理 |
| 财务管理 | `MENU_FIN2` | CFO, 总部财务, 工厂会计, CEO, 审计 |
| 审批中心 | `MENU_WORKFLOW` | 全员（待办/已办），管理层（审批） |
| 经营分析 | `MENU_DASHBOARD` | CEO, CFO, 总部财务, 区域经理, 农场主管, 销售主管, 审计 |
| 主数据中心 | `MENU_MASTER` | 超管, 运维, HR管理员, 农场主管, 门店主管 |
| 系统设置 | `MENU_SETTINGS_USER` | 超管, 运维, HR管理员 |
| 验收试运行 | `MENU_UAT` | 超管, 运维, CEO, CFO, 销售主管, 审计, Pilot经理 |
| 系统运维 | `MENU_SYS_MONITOR` | 超管, 运维 |

---

## 5. 菜单命名规范

### 禁用术语（已全部替换）

| 禁用词 | 替换示例 |
|--------|----------|
| V2 / V3 | 直接使用业务名称 |
| Runtime | 直接使用功能名称 |
| Workflow | 审批中心 |
| RBAC | 角色权限 / 菜单权限 |
| DataScope | 数据权限 |
| AR | 应收账款 |
| AP | 应付账款 |
| PR | 采购申请 |
| PO | 采购订单 |
| POS | 收银 / 直营店收银 |
| SKU | SKU档案（产品维度可保留） |
| B2B | 渠道管理 |
| Phase X | 不显示阶段标签 |
| 技术注解 | 不在菜单中显示 |

### 命名原则
1. 全中文，业务语言
2. 精确描述功能，不超过 6 字
3. 同类操作（管理/档案/分析）保持一致词汇
4. 禁止首字母缩写（AR/AP/PR/PO/POS）

---

## 6. Pilot Run 用户视角菜单

### 销售管理员（ROLE_SALES_MGR）可见菜单
```
工作台
销售管理
  销售总览 / 客户管理 / 渠道管理 / 价格管理 / 销售订单
  配送管理 / 退货管理 / 信用管理
  直营店收银 / 门店工作台 / 门店日结
  鸡蛋库存 / 销售分析
审批中心
  我的待办 / 我的已办 / 通知中心 / 审批看板
经营分析（经营总览 / 价格分析）
主数据中心（客户档案）
验收试运行
```

### 财务人员（ROLE_HQ_FINANCE / ROLE_FACTORY_ACCT）可见菜单
```
工作台
采购管理（查看权限）
销售管理（销售总览 / 销售分析）
财务管理（全部子菜单）
审批中心
经营分析
主数据中心
验收试运行
```

### 农场主管（ROLE_FARM_MGR）可见菜单
```
工作台
生产管理（全部 22 个子菜单）
库存管理（仓库看板 / 入库 / 出库 / 台账 / 查询）
审批中心
经营分析（生产报表）
主数据中心（基础查看）
验收试运行
```

### 超级管理员（ROLE_ADMIN）可见菜单
```
全部 12 个一级菜单，全部子菜单
```

---

## 7. RBAC 矩阵变更记录（Navigation Final）

| 变更项 | 说明 |
|--------|------|
| `MENU_FARM_DATA` 新增 `ROLE_WMS_MGR: ['V']` | 生产管理合并分级包装后，WMS主管需查看包装入库 |
| `系统设置` 组权限 → `MENU_SETTINGS_USER` | 原 perm:null 改为正式权限（覆盖 ADMIN/SYSOPS/HR_ADMIN） |
| `工作台` 叶节点权限 → `MENU_DASHBOARD` | 原 perm:null 改为正式权限 |
| `生产管理` 组权限 → `MENU_FARM_DATA` | 原三组均为 perm:null，统一合并为此权限 |
| `库存管理` 组权限 → `MENU_WMS_VIEW` | 原 perm:null 改为正式权限 |

---

## 8. 验证结果

| 检查项 | 结果 |
|--------|------|
| Web TypeScript | ✅ 0 errors |
| API TypeScript | ✅ 0 errors |
| scope-audit.sh | ✅ 31/31 PASS |
| perm:null 菜单项 | ✅ 全部消除（个人中心保留在底部固定链接） |
| 技术术语检查 | ✅ 无 V2/Runtime/Workflow/RBAC/DataScope/AR/AP 等 |
| 重复入口检查 | ✅ 无重复（旧菜单全部隐藏） |

---

*文档生成时间：2026-05-30 UTC+8*  
*版本：v1.0 — Navigation Final*
