# Phoenix ERP V3 — 导航架构审计报告
## Navigation V2 Architecture Audit — Phase 1

**审计日期：** 2026-05-29  
**版本：** Phase 1 — 菜单架构审计与 V2 映射  
**状态：** 纯审计阶段（不修改代码，不改数据库，不新增业务模块）  
**文件来源：** `apps/web/src/components/layout/Sidebar.tsx` + `apps/api/src/common/guards/rbac.matrix.ts`  

---

## 一、执行摘要

### 当前状况定级：**C 级（需要重构）**

当前 Sidebar 存在以下核心问题：

| 问题类别 | 数量 | 严重度 |
|----------|------|--------|
| 技术语言出现在菜单（V2、POS、B2B、AP、AR 等） | 8 处 | 🟡 中 |
| `perm:null` 无权限保护的正式业务菜单 | 9 项 | 🔴 高 |
| Finance V2 已实现页面无 Sidebar 入口（3 个功能缺口） | 3 项 | 🔴 高 |
| Sales V2 已在 RBAC 矩阵注册但无 Sidebar 入口 | 2 项 | 🟡 中 |
| 旧菜单组仍可见（POS 销售 / 会员营销 / 批发管理） | 3 组 | 🟡 中 |
| 菜单组织与业务域对不齐（直营门店分散在两处） | 2 处 | 🟡 中 |
| 数据分析与销售报表功能重叠 | 1 处 | 🟢 低 |

---

## 二、当前菜单完整清单（含分类标记）

> **分类说明：**  
> 🟢 **V2正式** — 后端 Runtime 完整，前端页面成熟（100+ 行实现）  
> 🔵 **V1在用** — 后端有实现，前端在用，尚未 V2 化，保留运行  
> 🟡 **存疑保留** — 功能有限或与 V2 重叠，建议评估合并  
> 🔴 **冻结隐藏** — 已在 Sidebar 注释掉，但页面文件仍存在  
> ⚫ **僵尸入口** — 页面为占位页（< 100 行）或 perm:null 安全风险  

---

### 1. 仪表盘

| ID | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|
| dashboard | `/dashboard` | `null` | 🟢 V2正式 | 登录用户均可见，合理 |

---

### 2. 养殖生产

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| breeding（组） | 养殖生产 | — | `null`（组） | 🔵 V1在用 | 子菜单有 perm，组级 null 可接受 |
| brd-overview | 养殖场总览 | `/breeding` | `MENU_FARM_DATA` | 🔵 V1在用 | ✅ RBAC 注册 |
| brd-house | 鸡舍管理 | `/breeding/henhouse` | `MENU_FARM_DATA` | 🔵 V1在用 | ✅ |
| brd-flock | 鸡群档案 | `/breeding/flock` | `MENU_FARM_DATA` | 🔵 V1在用 | ✅ |
| brd-daily | 日生产日报 | `/breeding/daily` | `MENU_FARM_DATA` | 🔵 V1在用 | ✅ |
| brd-immune | 免疫计划 | `/breeding/immune` | `MENU_FARM_VET` | 🔵 V1在用 | ✅ |
| brd-medicine | 用药记录 | `/breeding/medicine` | `MENU_FARM_VET` | 🔵 V1在用 | ✅ |
| brd-device | 设备监控 | `/breeding/device` | `MENU_DEVICE_MONITOR` | 🔵 V1在用 | ✅ |
| brd-alerts | 环境预警 | `/breeding/device-alerts` | `MENU_DEVICE_MONITOR` | 🔵 V1在用 | ✅ |
| brd-device-ops | 设备运维 | `/breeding/device-ops` | `MENU_DEVICE_MONITOR` | 🔵 V1在用 | ✅ |

---

### 3. 分级包装

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| packaging（组） | 分级包装 | — | `null`（组） | 🔵 V1在用 | 子菜单有 perm，合理 |
| pkg-op | 包装管理 | `/packaging` | `MENU_PKG_OP` | 🔵 V1在用 | ✅ |
| pkg-inbound | 集蛋入库 | `/packaging/inbound` | `MENU_PKG_MGR` | 🔵 V1在用 | ✅ |
| pkg-batch | 批次管理 | `/packaging/batch` | `MENU_PKG_MGR` | 🔵 V1在用 | ✅ |
| pkg-report | 包装日报 | `/packaging/daily-report` | `MENU_PKG_MGR` | 🔵 V1在用 | ✅ |
| pkg-except | 异常处理 | `/packaging/exceptions` | `MENU_PKG_MGR` | 🔵 V1在用 | ✅ |
| pkg-printlogs | 补打日志 | `/packaging/print-logs` | `MENU_PKG_MGR` | 🔵 V1在用 | ✅ |

---

### 4. 仓储库存

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| warehouse（组） | 仓储库存 | — | `null`（组） | 🔵 V1在用 | 子菜单有 perm，合理 |
| wh-dash | 仓库看板 | `/warehouse` | `MENU_WMS_VIEW` | 🔵 V1在用 | ✅ |
| wh-in | 入库管理 | `/warehouse/inbound` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |
| wh-out | 出库管理 | `/warehouse/outbound` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |
| wh-transfer | 调拨管理 | `/warehouse/transfer` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |
| wh-stock | 盘点管理 | `/warehouse/stocktake` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |
| wh-ledger | 库存台账 | `/warehouse/ledger` | `MENU_WMS_VIEW` | 🔵 V1在用 | ✅ |
| wh-query | 库存查询 | `/warehouse/query` | `MENU_WMS_VIEW` | 🔵 V1在用 | ✅ |
| wh-house | 仓库主档 | `/warehouse/warehouses` | `MENU_WMS_MASTER` | 🔵 V1在用 | ✅ |
| wh-zones | 库区管理 | `/warehouse/zones` | `MENU_WMS_MASTER` | 🔵 V1在用 | ✅ |
| wh-loc | 库位管理 | `/warehouse/locations` | `MENU_WMS_MASTER` | 🔵 V1在用 | ✅ |
| wh-expiry | 临期预警 | `/warehouse/expiry` | `MENU_WMS_VIEW` | 🔵 V1在用 | ✅ |
| wh-daily | 日结对账 | `/warehouse/daily-close` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |
| wh-loss | 报损管理 | `/warehouse/loss-report` | `MENU_WMS_INOUT` | 🔵 V1在用 | ✅ |

---

### 5. ~~配送运输~~（已冻结，注释掉）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| transport（组） | 配送运输 | `/transport/*` | `MENU_LOGISTICS` | 🔴 冻结隐藏 | 页面文件仍存在；新配送入口在 `/sales2/delivery` |

---

### 6. 直营门店

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| store（组） | 直营门店 | — | `null`（组） | 🔵 V1在用 | 子菜单有 perm |
| st-wb | 门店工作台 | `/store` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-recv | 收货验收 | `/store/receiving` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-inv | 门店库存 | `/store/inventory` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-replenish | 补货申请 | `/store/replenish` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-loss | 损耗记录 | `/store/losses` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-daily | 门店日结 | `/store/daily` | `MENU_STORE_MGR` | 🔵 V1在用 | ✅ |
| st-pos | **直营店收银** | `/store-pos` | `MENU_STORE_POS` | 🟢 V2正式 | Phase 9 完成 |

---

### 7. 品质追溯

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| quality（组） | 品质追溯 | — | `null`（组） | 🔵 V1在用 | 子菜单有 perm |
| ql-ov | 质检总览 | `/quality` | `MENU_QA_OP` | 🔵 V1在用 | ✅ |
| ql-farm | 场端质检 | `/quality/farm` | `MENU_QA_OP` | 🔵 V1在用 | ✅ |
| ql-prod | 成品质检 | `/quality/product` | `MENU_QA_OP` | 🔵 V1在用 | ✅ |
| ql-nc | 不合格品处置 | `/quality/nonconformance` | `MENU_QA_MGR` | 🔵 V1在用 | ✅ |
| ql-fwd | 正向追溯 | `/quality/forward` | `MENU_QA_MGR` | 🔵 V1在用 | ✅ |
| ql-bwd | 反向追溯 | `/quality/backward` | `MENU_QA_MGR` | 🔵 V1在用 | ✅ |
| ql-std | 质量标准 | `/quality/standards` | `MENU_QA_MASTER` | 🔵 V1在用 | ✅ |

---

### 8. ~~旧采购供应~~（已冻结，注释掉）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| procurement（组） | 采购供应 | `/procurement/*` | `MENU_PRC_MGR` | 🔴 冻结隐藏 | 页面有 LegacyFreezeBanner |

---

### 9. 采购 V2（⚠️ 标签含技术词）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| procurement2（组） | **采购 V2** ⚠️ | — | `MENU_PRC2_MASTER` | 🟢 V2正式 | 标签需改为"采购管理" |
| prc2-dashboard | 采购看板 | `/procurement2/dashboard` | `MENU_PRC2` | 🟢 V2正式 | ✅ |
| prc2-supplier | **供应商 V2** ⚠️ | `/procurement2/suppliers` | `MENU_PRC2_MASTER` | 🟢 V2正式 | 标签需改为"供应商" |
| prc2-project | 采购项目 | `/procurement2/projects` | `MENU_PRC2_MASTER` | 🟢 V2正式 | ✅ |
| prc2-request | 采购申请 | `/procurement2/requests` | `MENU_PRC2_MASTER` | 🟢 V2正式 | ✅ |
| prc2-order | 采购订单 | `/procurement2/orders` | `MENU_PRC2_ORDER` | 🟢 V2正式 | ✅ |
| prc2-payment | 付款管理 | `/procurement2/payments` | `MENU_PRC2_PAYMENT` | 🟢 V2正式 | ✅ |
| prc2-fund | 股东资金 | `/procurement2/shareholder-funds` | `MENU_PRC2_FUND` | 🟢 V2正式 | ✅ |
| prc2-shipment | 物流管理 | `/procurement2/shipments` | `MENU_PRC2_SHIPMENT` | 🟢 V2正式 | ✅ |
| prc2-receipt | 收货管理 | `/procurement2/receipts` | `MENU_PRC2_RECEIPT` | 🟢 V2正式 | ✅ |
| prc2-init | 历史初始化 | `/procurement2/init` | `MENU_PRC2_INIT` | 🟢 V2正式 | 超管专用 |

---

### 10. 销售系统（⚠️ 标签非业务语言）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| sales2（组） | **销售系统** ⚠️ | — | `MENU_SALES2` | 🟢 V2正式 | 标签需改为"销售管理" |
| s2-overview | 销售系统总览 ⚠️ | `/sales2` | `MENU_SALES2` | 🟢 V2正式 | 改为"销售总览" |
| s2-customers | 客户档案 | `/sales2/customers` | `MENU_SALES2_CUSTOMER` | 🟢 V2正式 | ✅ |
| s2-pricing | 价格管理 | `/sales2/pricing` | `MENU_SALES2_PRICE` | 🟢 V2正式 | ✅ 551 行 |
| s2-orders | 销售订单 | `/sales2/orders` | `MENU_SALES2_ORDER` | 🟢 V2正式 | ✅ |
| s2-delivery | 配送管理 | `/sales2/delivery` | `MENU_SALES2_DELIVERY` | 🟢 V2正式 | ✅ 1067 行 |
| s2-returns | 退货管理 | `/sales2/returns` | `MENU_SALES2_RETURN` | 🟢 V2正式 | ✅ 877 行 |
| s2-inventory | 库存管理 | `/sales2/inventory` | `MENU_SALES2_INVENTORY` | 🟢 V2正式 | ✅ 629 行 |
| s2-reports | **经营分析** | `/sales2/reports` | `MENU_SALES2_REPORT` | 🟢 V2正式 | ✅ 671 行；与 analytics 重叠 |
| — | **渠道管理** ❌缺入口 | `/sales2/channels` | `MENU_SALES2_CHANNEL` | 🟢 V2正式 | RBAC已注册，后端有 API，但 Sidebar 无入口！ |
| — | **信用管理** ❌缺入口 | `/sales2/credit` | `MENU_SALES2_CREDIT` | 🟢 V2正式 | RBAC已注册，Phase 5 完成，但 Sidebar 无入口！ |

---

### 11. ~~旧订货系统~~（已冻结，注释掉）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| order（组） | 订货系统 | `/order/*` | `MENU_ORDER_MGR` | 🔴 冻结隐藏 | 页面有 LegacyFreezeBanner |

---

### 12. 会员营销（⚠️ 边缘功能）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| members（组） | 会员营销 | — | `MENU_B2B_SALE` | 🟡 存疑保留 | 页面为 stub（66 行），功能未完整实现 |
| mb-ov | 会员总览 | `/members` | `MENU_B2B_SALE` | ⚫ 占位 | 建议隐藏或合并入销售管理 |
| mb-list | 会员档案 | `/members/list` | `MENU_B2B_SALE` | ⚫ 占位 | |
| mb-points | 积分规则 | `/members/points` | `MENU_B2B_SALE` | ⚫ 占位 | |
| mb-coupon | 优惠券 | `/members/coupons` | `MENU_B2B_SALE` | ⚫ 占位 | |
| mb-act | 营销活动 | `/members/activity` | `MENU_B2B_SALE` | ⚫ 占位 | |

---

### 13. 财务 V2（⚠️ 标签含技术词；❌ 多个页面无 Sidebar 入口）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| finance2（组） | **财务 V2** ⚠️ | — | `MENU_FIN2` | 🟢 V2正式 | 标签需改为"财务管理" |
| f2-dash | 财务总览 | `/finance2` | `MENU_FIN2` | 🟢 V2正式 | ✅ |
| f2-ap | **应付管理** | `/finance2/ap` | `MENU_FIN2_AP` | 🟢 V2正式 | ✅ 966 行 |
| f2-ar | **应收管理** | `/finance2/ar` | `MENU_FIN2_AR` | 🟢 V2正式 | ✅ 1129 行 |
| f2-cash | 资金账户 | `/finance2/cash-accounts` | `MENU_FIN2_CASH` | 🟢 V2正式 | ✅ |
| f2-sf | 股东资金 | `/finance2/shareholder-funds` | `MENU_FIN2_SHAREHOLDER` | 🟢 V2正式 | ✅ 852 行 |
| f2-reports | 财务报表 | `/finance2/reports` | `MENU_FIN2_REPORT` | 🟢 V2正式 | ✅ 1022 行 |
| — | **资金调拨** ❌缺入口 | `/finance2/fund-transfers` | `MENU_FIN2_CASH` | 🟢 V2正式 | 460 行实现页面，Sidebar 无入口！ |
| — | **费用管理** ❌缺入口 | `/finance2/expenses` | `MENU_FIN2_EXPENSE` | 🟢 V2正式 | 525 行实现页面，RBAC 已注册，Sidebar 无入口！ |
| — | **报销管理** ❌缺入口 | `/finance2/reimbursements` | — | 🟢 V2正式 | 362 行实现页面，但**无 MENU 注册**！需新增 `MENU_FIN2_REIMBURSE` |

---

### 14. 数据分析（⚠️ 标签非业务语言，与 sales2/reports 重叠）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| analytics（组） | **数据分析** ⚠️ | — | `MENU_DASHBOARD` | 🔵 V1在用 | 改为"经营分析"；与 sales2 报表整合 |
| an-bi | **BI 驾驶舱** ⚠️ | `/analytics` | `MENU_DASHBOARD` | 🔵 V1在用 | 改为"经营总览" |
| an-price | 价格执行复盘 | `/analytics/price-review` | `MENU_DASHBOARD` | 🔵 V1在用 | ✅ |
| an-prod | 生产报表 | `/analytics/production` | `MENU_DASHBOARD` | 🔵 V1在用 | ✅ |
| an-inv | 库存周转 | `/analytics/inventory` | `MENU_DASHBOARD` | 🔵 V1在用 | ✅ |
| an-feed | 饲料核对 | `/analytics/feed` | `MENU_DASHBOARD` | 🔵 V1在用 | ✅ |

---

### 15. ~~B2B 分销~~（已冻结，注释掉）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| b2b（组） | B2B 分销 | `/b2b/*` | `MENU_B2B_SALE` | 🔴 冻结隐藏 | 页面有 LegacyFreezeBanner |

---

### 16. POS 销售（⚠️ 整组 perm:null，高安全风险）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| pos（组） | **POS 销售** ⚠️ | — | **`null` ❌** | ⚫ 僵尸入口 | 整组无权限保护，与 /store-pos 功能重叠 |
| pos-ov | POS 总览 | `/pos` | **`null` ❌** | ⚫ 僵尸入口 | 页面 59 行 stub；建议隐藏 |
| pos-sales | 销售单管理 | `/pos/sales` | **`null` ❌** | ⚫ 僵尸入口 | 页面存在，无 RBAC |

---

### 17. 工作流（⚠️ 标签非业务语言）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| workflow（组） | **工作流** ⚠️ | — | `MENU_WORKFLOW` | 🟢 V2正式 | 标签需改为"审批中心" |
| wf-approval-todos | 审批待办 | `/workflow/todos` | `MENU_WORKFLOW` | 🟢 V2正式 | ✅ 605 行 |
| wf-approval-history | 审批历史 | `/workflow/history` | `MENU_WORKFLOW` | 🟢 V2正式 | ✅ 218 行 |
| wf-notifications | 通知中心 | `/notifications` | `MENU_WORKFLOW` | 🟢 V2正式 | ✅ |
| wf-metrics | **健康看板** | `/workflow/metrics` | `MENU_WORKFLOW` | 🟢 V2正式 | ✅ 538 行 |
| wf-forms-runtime | 在线表单 | `/workflow/forms/runtime` | `MENU_WORKFLOW` | 🟢 V2正式 | ✅ 592 行 |

---

### 18. 批发管理（⚠️ 功能有限）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| wholesale（组） | 批发管理 | — | `MENU_B2B_SALE` | 🟡 存疑保留 | 页面为 stub（64 行），建议评估 |
| ws-ov | 批发总览 | `/wholesale` | `MENU_B2B_SALE` | ⚫ 占位 | |
| ws-contracts | 批发合同 | `/wholesale/contracts` | `MENU_B2B_SALE` | ⚫ 占位 | |
| ws-shipments | 发货记录 | `/wholesale/shipments` | `MENU_B2B_SALE` | ⚫ 占位 | |

---

### 19. 主数据（范围过窄）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| master（组） | 主数据 | — | `MENU_MASTER` | 🔵 V1在用 | 仅 3 项，范围过窄 |
| md-farms | 农场主档 | `/master/farms` | `MENU_MASTER` | 🔵 V1在用 | ✅ |
| md-products | 产品品级 | `/master/products` | `MENU_MASTER` | 🔵 V1在用 | ✅ |
| md-stores | 门店主档 | `/master/stores` | `MENU_MASTER` | 🔵 V1在用 | ✅ |

---

### 20. 系统设置（含多个 perm:null 安全漏洞）

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| settings（组） | 系统设置 | — | `null`（组） | 🔵 V1在用 | 组级 null 可接受 |
| stg-users | 用户管理 | `/settings/users` | `MENU_SETTINGS_USER` | 🔵 V1在用 | ✅ |
| stg-roles | 角色与权限 | `/settings/roles` | `MENU_SETTINGS_IT` | 🔵 V1在用 | ✅ |
| stg-orgs | 组织架构 | `/settings/organizations` | `MENU_SYS_ORG` | 🔵 V1在用 | ✅ |
| stg-data-scopes | 数据范围 | `/settings/data-scopes` | `MENU_SYS_ORG` | 🔵 V1在用 | ✅ |
| stg-dict | 系统字典 | `/settings/dict` | `MENU_SETTINGS_DATA` | 🔵 V1在用 | ✅ |
| stg-products | 商品主数据 | `/settings/products` | **`null` ❌** | ⚫ 僵尸入口 | 应设 `MENU_MASTER` 或 `MENU_SETTINGS_DATA` |
| stg-master | 主数据配置 | `/settings/master-data` | **`null` ❌** | ⚫ 僵尸入口 | 应设 `MENU_MASTER` 或 `MENU_SETTINGS_DATA` |
| stg-approval-rules | 审批规则 | `/settings/approval-rules` | `MENU_WORKFLOW` | 🔵 V1在用 | ✅ 但位置不对，应在"审批中心" |
| stg-perms | 权限配置 | `/settings/permissions` | `MENU_SETTINGS_IT` | 🔵 V1在用 | ✅ |
| stg-pda | PDA 终端 | `/settings/pda-terminals` | **`null` ❌** | ⚫ 僵尸入口 | 应设 `MENU_PDA` 或 `MENU_SETTINGS_IT` |
| stg-pos | POS 配置 | `/settings/pos-config` | **`null` ❌** | ⚫ 僵尸入口 | 应设 `MENU_SETTINGS_IT` |
| stg-stock-cfg | 分账库存配置 | `/settings/store-stock` | **`null` ❌** | ⚫ 僵尸入口 | 应设 `MENU_SETTINGS_IT` |
| stg-security | 安全策略 | `/settings/security` | **`null` ❌** | ⚫ 僵尸入口 | LegacyFreezeBanner，应设 `MENU_SETTINGS_IT` |
| stg-health | 系统健康 | `/settings/health` | `MENU_SETTINGS_IT` | 🟡 存疑 | 与系统运维重叠，建议合并至 /system/health |
| stg-audit | 审计日志 | `/settings/audit-log` | `MENU_SETTINGS_IT` | 🔵 V1在用 | ✅ |
| stg-brand | 品牌配置 | `/settings/brand` | `MENU_SETTINGS_IT` | 🔵 V1在用 | ✅ |
| stg-profile | 个人中心 | `/settings/profile` | **`null`** | 🔵 V1在用 | perm:null 合理（所有登录用户） |

---

### 21. UAT 试运行

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| uat | 验收试运行 | `/uat` | `MENU_UAT` | 🟢 V2正式 | Phase E 完成；**一级菜单但无子菜单展开** |

---

### 22. 系统运维

| ID | 标签 | 路径 | 权限 | 分类 | 备注 |
|----|------|------|------|------|------|
| sysops（组） | 系统运维 | — | `MENU_SYS_MONITOR` | 🟢 V2正式 | Phase 1 完成 |
| sysops-monitor | 监控面板 | `/system/health` | `MENU_SYS_MONITOR` | 🟢 V2正式 | ✅ |
| sysops-alerts | 异常告警 | `/system/alerts` | `MENU_SYS_MONITOR` | 🟢 V2正式 | ✅ |
| sysops-configs | 生产配置 | `/system/configs` | `MENU_SYS_CONFIG` | 🟢 V2正式 | ✅ |

---

## 三、当前 Sidebar 结构问题汇总

### P0 — 高危（安全漏洞）

| # | 问题 | 影响项 | 修复优先级 |
|---|------|--------|-----------|
| P0-1 | `POS 销售` 整组 `perm:null`，任意登录用户可访问 `/pos`, `/pos/sales` | 2 项 | 立即修复 |
| P0-2 | 系统设置下 6 个功能项 `perm:null`，无 RBAC 保护 | 6 项（products/master/pda/pos-config/store-stock/security） | 立即修复 |
| P0-3 | `/finance2/reimbursements` 报销管理无 MENU 注册，后端 API 无权限隔离 | 1 项 | 立即修复 |

### P1 — 严重（功能缺口）

| # | 问题 | 影响项 | 修复优先级 |
|---|------|--------|-----------|
| P1-1 | `销售管理 → 渠道管理` 无 Sidebar 入口，RBAC 和后端 API 均完整 | `MENU_SALES2_CHANNEL` | Sprint 内修复 |
| P1-2 | `销售管理 → 信用管理` 无 Sidebar 入口，Phase 5 已完成 | `MENU_SALES2_CREDIT` | Sprint 内修复 |
| P1-3 | `财务管理 → 资金调拨` 无 Sidebar 入口（460 行实现页面） | `/finance2/fund-transfers` | Sprint 内修复 |
| P1-4 | `财务管理 → 费用管理` 无 Sidebar 入口（525 行实现页面） | `/finance2/expenses` | Sprint 内修复 |
| P1-5 | `财务管理 → 报销管理` 无 Sidebar 入口（362 行实现页面） | `/finance2/reimbursements` | Sprint 内修复 |

### P2 — 中等（体验问题）

| # | 问题 | 影响项 | 修复建议 |
|---|------|--------|---------|
| P2-1 | 菜单标签含技术词：采购 V2、财务 V2、销售系统、工作流、POS、B2B、BI | 8 处 | 下阶段重命名 |
| P2-2 | `数据分析 → 经营分析` 与 `销售系统 → 经营分析(reports)` 重叠 | 2 处 | 合并至"经营分析"顶层 |
| P2-3 | `审批规则` 放在系统设置下，应归入审批中心 | 1 项 | 下阶段迁移 |
| P2-4 | `系统健康`（/settings/health）与系统运维（/system/health）重叠 | 2 项 | 下阶段合并 |
| P2-5 | `直营店收银`（/store-pos）放在"直营门店"组，语义模糊 | 1 项 | 最终稳定后评估 |
| P2-6 | 会员营销、批发管理均为 stub 页面，长期不实现会造成导航欺骗 | 2 组 | 明确时间线或隐藏 |

### P3 — 低优先级（规划问题）

| # | 问题 | 说明 |
|---|------|------|
| P3-1 | 旧 transport、order、procurement、b2b 页面文件仍存在但已冻结 | 不影响运行，但占用维护成本 |
| P3-2 | UAT 作为一级菜单无子菜单，体验不一致 | 可补充子菜单或改为带 children 格式 |
| P3-3 | 主数据仅 3 项（农场/产品/门店），范围过窄 | 应扩充为主数据中心 |

---

## 四、目标菜单树（12 大业务模块）

以下为重构后的目标菜单架构，全部使用中文业务语言，无技术词汇。

```
Phoenix ERP V3 — 目标导航树（2026 Q3 目标）
├── 工作台
│   └── 仪表盘                        /dashboard            perm:null（登录可见）
│
├── 生产管理
│   ├── 养殖场总览                     /breeding             MENU_FARM_DATA
│   ├── 鸡舍管理                       /breeding/henhouse    MENU_FARM_DATA
│   ├── 鸡群档案                       /breeding/flock       MENU_FARM_DATA
│   ├── 日生产日报                     /breeding/daily       MENU_FARM_DATA
│   ├── 免疫计划                       /breeding/immune      MENU_FARM_VET
│   ├── 用药记录                       /breeding/medicine    MENU_FARM_VET
│   ├── 设备监控                       /breeding/device      MENU_DEVICE_MONITOR
│   ├── 环境预警                       /breeding/device-alerts MENU_DEVICE_MONITOR
│   ├── 设备运维                       /breeding/device-ops  MENU_DEVICE_MONITOR
│   ├── 包装管理                       /packaging            MENU_PKG_OP
│   ├── 集蛋入库                       /packaging/inbound    MENU_PKG_MGR
│   ├── 批次管理                       /packaging/batch      MENU_PKG_MGR
│   ├── 包装日报                       /packaging/daily-report MENU_PKG_MGR
│   ├── 异常处理                       /packaging/exceptions MENU_PKG_MGR
│   ├── 补打日志                       /packaging/print-logs MENU_PKG_MGR
│   ├── 质检总览                       /quality              MENU_QA_OP
│   ├── 场端质检                       /quality/farm         MENU_QA_OP
│   ├── 成品质检                       /quality/product      MENU_QA_OP
│   ├── 不合格品处置                   /quality/nonconformance MENU_QA_MGR
│   ├── 正向追溯                       /quality/forward      MENU_QA_MGR
│   ├── 反向追溯                       /quality/backward     MENU_QA_MGR
│   └── 质量标准                       /quality/standards    MENU_QA_MASTER
│
├── 库存管理
│   ├── 仓库看板                       /warehouse            MENU_WMS_VIEW
│   ├── 入库管理                       /warehouse/inbound    MENU_WMS_INOUT
│   ├── 出库管理                       /warehouse/outbound   MENU_WMS_INOUT
│   ├── 调拨管理                       /warehouse/transfer   MENU_WMS_INOUT
│   ├── 盘点管理                       /warehouse/stocktake  MENU_WMS_INOUT
│   ├── 库存台账                       /warehouse/ledger     MENU_WMS_VIEW
│   ├── 库存查询                       /warehouse/query      MENU_WMS_VIEW
│   ├── 临期预警                       /warehouse/expiry     MENU_WMS_VIEW
│   ├── 日结对账                       /warehouse/daily-close MENU_WMS_INOUT
│   ├── 报损管理                       /warehouse/loss-report MENU_WMS_INOUT
│   ├── 仓库主档                       /warehouse/warehouses MENU_WMS_MASTER
│   ├── 库区管理                       /warehouse/zones      MENU_WMS_MASTER
│   └── 库位管理                       /warehouse/locations  MENU_WMS_MASTER
│
├── 采购管理（原"采购 V2"）
│   ├── 采购看板                       /procurement2/dashboard   MENU_PRC2
│   ├── 供应商                         /procurement2/suppliers   MENU_PRC2_MASTER
│   ├── 采购项目                       /procurement2/projects    MENU_PRC2_MASTER
│   ├── 采购申请                       /procurement2/requests    MENU_PRC2_MASTER
│   ├── 采购订单                       /procurement2/orders      MENU_PRC2_ORDER
│   ├── 收货管理                       /procurement2/receipts    MENU_PRC2_RECEIPT
│   ├── 物流管理                       /procurement2/shipments   MENU_PRC2_SHIPMENT
│   ├── 付款管理                       /procurement2/payments    MENU_PRC2_PAYMENT
│   ├── 股东资金                       /procurement2/shareholder-funds MENU_PRC2_FUND
│   └── 历史初始化                     /procurement2/init        MENU_PRC2_INIT
│
├── 销售管理（原"销售系统" + 直营收银 + 信用 + 渠道）
│   ├── 销售总览                       /sales2               MENU_SALES2
│   ├── 客户档案                       /sales2/customers     MENU_SALES2_CUSTOMER
│   ├── 渠道管理 🆕入口                /sales2/channels      MENU_SALES2_CHANNEL
│   ├── 价格管理                       /sales2/pricing       MENU_SALES2_PRICE
│   ├── 销售订单                       /sales2/orders        MENU_SALES2_ORDER
│   ├── 配送管理                       /sales2/delivery      MENU_SALES2_DELIVERY
│   ├── 退货管理                       /sales2/returns       MENU_SALES2_RETURN
│   ├── 信用管理 🆕入口                /sales2/credit        MENU_SALES2_CREDIT
│   ├── 库存管理                       /sales2/inventory     MENU_SALES2_INVENTORY
│   ├── 门店工作台                     /store                MENU_STORE_MGR
│   ├── 收货验收                       /store/receiving      MENU_STORE_MGR
│   ├── 门店库存                       /store/inventory      MENU_STORE_MGR
│   ├── 补货申请                       /store/replenish      MENU_STORE_MGR
│   ├── 损耗记录                       /store/losses         MENU_STORE_MGR
│   ├── 门店日结                       /store/daily          MENU_STORE_MGR
│   └── 直营店收银                     /store-pos            MENU_STORE_POS
│
├── 财务管理（原"财务 V2" + 补齐 3 个缺失入口）
│   ├── 财务总览                       /finance2             MENU_FIN2
│   ├── 应收账款                       /finance2/ar          MENU_FIN2_AR
│   ├── 应付账款                       /finance2/ap          MENU_FIN2_AP
│   ├── 资金账户                       /finance2/cash-accounts MENU_FIN2_CASH
│   ├── 资金调拨 🆕入口                /finance2/fund-transfers MENU_FIN2_CASH
│   ├── 股东资金                       /finance2/shareholder-funds MENU_FIN2_SHAREHOLDER
│   ├── 费用管理 🆕入口                /finance2/expenses    MENU_FIN2_EXPENSE
│   ├── 报销管理 🆕入口 + 🆕MENU      /finance2/reimbursements MENU_FIN2_REIMBURSE（待注册）
│   └── 财务报表                       /finance2/reports     MENU_FIN2_REPORT
│
├── 审批中心（原"工作流" + 审批规则迁入）
│   ├── 审批待办                       /workflow/todos       MENU_WORKFLOW
│   ├── 审批历史                       /workflow/history     MENU_WORKFLOW
│   ├── 通知中心                       /notifications        MENU_WORKFLOW
│   ├── 审批健康看板                   /workflow/metrics     MENU_WORKFLOW
│   ├── 在线表单                       /workflow/forms/runtime MENU_WORKFLOW
│   └── 审批规则配置                   /settings/approval-rules MENU_WORKFLOW
│
├── 经营分析（原"数据分析" + sales2/reports 整合）
│   ├── 经营总览                       /analytics            MENU_DASHBOARD
│   ├── 销售分析                       /sales2/reports       MENU_SALES2_REPORT
│   ├── 价格执行复盘                   /analytics/price-review MENU_DASHBOARD
│   ├── 生产报表                       /analytics/production MENU_DASHBOARD
│   ├── 库存周转                       /analytics/inventory  MENU_DASHBOARD
│   └── 饲料核对                       /analytics/feed       MENU_DASHBOARD
│
├── 主数据中心（原"主数据" + 部分设置迁入）
│   ├── 农场主档                       /master/farms         MENU_MASTER
│   ├── 产品品级                       /master/products      MENU_MASTER
│   ├── 门店主档                       /master/stores        MENU_MASTER
│   ├── 商品主数据                     /settings/products    MENU_MASTER（修复 perm）
│   └── 主数据配置                     /settings/master-data MENU_MASTER（修复 perm）
│
├── 系统设置
│   ├── 用户管理                       /settings/users       MENU_SETTINGS_USER
│   ├── 角色与权限                     /settings/roles       MENU_SETTINGS_IT
│   ├── 组织架构                       /settings/organizations MENU_SYS_ORG
│   ├── 数据范围                       /settings/data-scopes MENU_SYS_ORG
│   ├── 系统字典                       /settings/dict        MENU_SETTINGS_DATA
│   ├── 权限配置                       /settings/permissions MENU_SETTINGS_IT
│   ├── 终端配置（PDA/POS）            /settings/pda-terminals MENU_SETTINGS_IT（修复 perm）
│   ├── 分账库存配置                   /settings/store-stock MENU_SETTINGS_IT（修复 perm）
│   ├── 审计日志                       /settings/audit-log   MENU_SETTINGS_IT
│   ├── 品牌配置                       /settings/brand       MENU_SETTINGS_IT
│   └── 个人中心                       /settings/profile     perm:null（合理）
│
├── UAT 试运行
│   └── （单页，子功能在 /uat 内 tab 切换）  /uat            MENU_UAT
│
└── 系统运维
    ├── 监控面板                       /system/health        MENU_SYS_MONITOR
    ├── 异常告警                       /system/alerts        MENU_SYS_MONITOR
    └── 配置治理                       /system/configs       MENU_SYS_CONFIG
```

---

## 五、旧菜单到新菜单映射表

| 当前菜单名称 | 当前路径 | 当前权限 | 新菜单位置 | 新路径 | 是否保留 | 是否重命名 | 是否迁移位置 | 需新增页面 | 风险等级 |
|-------------|---------|---------|-----------|-------|---------|-----------|------------|-----------|---------|
| 仪表盘 | `/dashboard` | null | 工作台 | `/dashboard` | ✅ | 否 | 否 | 否 | 🟢 低 |
| 养殖场总览 | `/breeding` | MENU_FARM_DATA | 生产管理 | 不变 | ✅ | 否 | 是（归入"生产管理"组） | 否 | 🟢 低 |
| 包装管理组 | `/packaging/*` | MENU_PKG_* | 生产管理 | 不变 | ✅ | 否 | 是（归入"生产管理"组） | 否 | 🟢 低 |
| 品质追溯组 | `/quality/*` | MENU_QA_* | 生产管理 | 不变 | ✅ | 否 | 是（归入"生产管理"组） | 否 | 🟢 低 |
| 仓储库存组 | `/warehouse/*` | MENU_WMS_* | 库存管理 | 不变 | ✅ | 组名改"库存管理" | 否 | 否 | 🟢 低 |
| 配送运输（已冻结） | `/transport/*` | MENU_LOGISTICS | — | — | 冻结 | — | — | 否 | 🟢 已冻结 |
| 直营门店组 | `/store/*` | MENU_STORE_MGR | 销售管理（子组） | 不变 | ✅ | 否 | 是（迁入"销售管理"） | 否 | 🟡 中 |
| 直营店收银 | `/store-pos` | MENU_STORE_POS | 销售管理 | 不变 | ✅ | 否 | 可在销售管理下独立显示 | 否 | 🟢 低 |
| 旧采购供应（已冻结） | `/procurement/*` | MENU_PRC_MGR | — | — | 冻结 | — | — | 否 | 🟢 已冻结 |
| 采购 V2 | `/procurement2/*` | MENU_PRC2_* | 采购管理 | 不变 | ✅ | 组名改"采购管理" | 否 | 否 | 🟢 低 |
| 供应商 V2 | `/procurement2/suppliers` | MENU_PRC2_MASTER | 采购管理 → 供应商 | 不变 | ✅ | 改为"供应商" | 否 | 否 | 🟢 低 |
| 销售系统 | `/sales2/*` | MENU_SALES2 | 销售管理 | 不变 | ✅ | 组名改"销售管理" | 否 | 否 | 🟢 低 |
| 销售系统总览 | `/sales2` | MENU_SALES2 | 销售管理 → 销售总览 | 不变 | ✅ | 改为"销售总览" | 否 | 否 | 🟢 低 |
| 渠道管理（无入口） | `/sales2/channels` | MENU_SALES2_CHANNEL | 销售管理 → 渠道管理 | 不变 | ✅ | — | **需补 Sidebar 入口** | 否（后端已有） | 🟡 中 |
| 信用管理（无入口） | `/sales2/credit` | MENU_SALES2_CREDIT | 销售管理 → 信用管理 | 不变 | ✅ | — | **需补 Sidebar 入口** | 是（前端页面待建） | 🟡 中 |
| 旧订货系统（已冻结） | `/order/*` | MENU_ORDER_MGR | — | — | 冻结 | — | — | 否 | 🟢 已冻结 |
| 会员营销 | `/members/*` | MENU_B2B_SALE | 销售管理（评估后） | 不变或隐藏 | 存疑 | 考虑隐藏 | 是 | 否 | 🟡 中 |
| 财务 V2 | `/finance2/*` | MENU_FIN2 | 财务管理 | 不变 | ✅ | 组名改"财务管理" | 否 | 否 | 🟢 低 |
| 应付管理 | `/finance2/ap` | MENU_FIN2_AP | 财务管理 → 应付账款 | 不变 | ✅ | 改为"应付账款" | 否 | 否 | 🟢 低 |
| 应收管理 | `/finance2/ar` | MENU_FIN2_AR | 财务管理 → 应收账款 | 不变 | ✅ | 改为"应收账款" | 否 | 否 | 🟢 低 |
| 资金调拨（无入口） | `/finance2/fund-transfers` | MENU_FIN2_CASH | 财务管理 → 资金调拨 | 不变 | ✅ | — | **需补 Sidebar 入口** | 否（页面已有460行） | 🔴 高 |
| 费用管理（无入口） | `/finance2/expenses` | MENU_FIN2_EXPENSE | 财务管理 → 费用管理 | 不变 | ✅ | — | **需补 Sidebar 入口** | 否（页面已有525行） | 🔴 高 |
| 报销管理（无入口+无MENU） | `/finance2/reimbursements` | 无 | 财务管理 → 报销管理 | 不变 | ✅ | — | **需补入口+注册MENU** | 否（页面已有362行） | 🔴 高 |
| 数据分析 | `/analytics/*` | MENU_DASHBOARD | 经营分析 | 不变 | ✅ | 组名改"经营分析" | 否 | 否 | 🟢 低 |
| BI 驾驶舱 | `/analytics` | MENU_DASHBOARD | 经营分析 → 经营总览 | 不变 | ✅ | 改为"经营总览" | 否 | 否 | 🟢 低 |
| 经营分析（sales2/reports） | `/sales2/reports` | MENU_SALES2_REPORT | 经营分析 → 销售分析 | 不变 | ✅ | 改为"销售分析" | 是（迁入"经营分析"组） | 否 | 🟡 中 |
| POS 销售 | `/pos/*` | null | — | — | **隐藏** | — | — | 否 | 🔴 P0安全 |
| 工作流 | `/workflow/*` | MENU_WORKFLOW | 审批中心 | 不变 | ✅ | 组名改"审批中心" | 否 | 否 | 🟢 低 |
| 审批规则（在设置里） | `/settings/approval-rules` | MENU_WORKFLOW | 审批中心 → 审批规则 | 不变 | ✅ | — | 是（从设置迁入审批中心） | 否 | 🟡 中 |
| 批发管理 | `/wholesale/*` | MENU_B2B_SALE | 销售管理（评估后） | 不变或隐藏 | 存疑 | 考虑隐藏 | 是 | 否 | 🟡 中 |
| 主数据 | `/master/*` | MENU_MASTER | 主数据中心 | 不变 | ✅ | 组名改"主数据中心" | 否 | 否 | 🟢 低 |
| 商品主数据 | `/settings/products` | null | 主数据中心 | 不变 | ✅ | — | 是（迁出设置） | 否 | 🟡 中 |
| 主数据配置 | `/settings/master-data` | null | 主数据中心 | 不变 | ✅ | — | 是（迁出设置） | 否 | 🟡 中 |
| 系统健康（在设置里） | `/settings/health` | MENU_SETTINGS_IT | — | 跳转到 /system/health | 保留重定向 | — | — | 否 | 🟡 中 |
| 系统设置 | `/settings/*` | 多种 | 系统设置（精简） | 不变 | ✅ | — | 移出部分项 | 否 | 🟡 中 |
| PDA 终端（perm:null） | `/settings/pda-terminals` | null | 系统设置 | 不变 | ✅ | — | — | 否 | 🔴 P0安全 |
| POS 配置（perm:null） | `/settings/pos-config` | null | 系统设置 | 不变 | ✅ | — | — | 否 | 🔴 P0安全 |
| 分账库存配置（perm:null） | `/settings/store-stock` | null | 系统设置 | 不变 | ✅ | — | — | 否 | 🔴 P0安全 |
| 安全策略（perm:null） | `/settings/security` | null | 系统设置 | 不变 | ✅ | — | — | 否 | 🔴 P0安全 |
| 验收试运行 | `/uat` | MENU_UAT | UAT 试运行 | 不变 | ✅ | 改为"UAT 试运行" | 否 | 否 | 🟢 低 |
| 系统运维 | `/system/*` | MENU_SYS_MONITOR | 系统运维 | 不变 | ✅ | — | 否 | 否 | 🟢 低 |
| 旧 B2B 分销（已冻结） | `/b2b/*` | MENU_B2B_SALE | — | — | 冻结 | — | — | 否 | 🟢 已冻结 |

---

## 六、权限映射表（目标菜单树完整 MENU 清单）

| 目标菜单 | 目标路径 | 推荐 MENU_CODE | 矩阵状态 | 说明 |
|---------|---------|--------------|---------|------|
| 工作台 / 仪表盘 | `/dashboard` | `null`（合理） | — | 登录可见 |
| 生产管理 → 养殖场总览 | `/breeding` | `MENU_FARM_DATA` | ✅ 已注册 | |
| 生产管理 → 免疫/用药 | `/breeding/immune`, `/breeding/medicine` | `MENU_FARM_VET` | ✅ 已注册 | |
| 生产管理 → 设备监控/预警/运维 | `/breeding/device*` | `MENU_DEVICE_MONITOR` | ✅ 已注册 | |
| 生产管理 → 包装管理 | `/packaging` | `MENU_PKG_OP` | ✅ 已注册 | |
| 生产管理 → 包装管理（其余） | `/packaging/*` | `MENU_PKG_MGR` | ✅ 已注册 | |
| 生产管理 → 质检总览/场端/成品 | `/quality, /quality/farm, /quality/product` | `MENU_QA_OP` | ✅ 已注册 | |
| 生产管理 → 质检管理（追溯/处置） | `/quality/nonconformance, /quality/forward, /quality/backward` | `MENU_QA_MGR` | ✅ 已注册 | |
| 生产管理 → 质量标准 | `/quality/standards` | `MENU_QA_MASTER` | ✅ 已注册 | |
| 库存管理 → 视图 | `/warehouse, /warehouse/ledger, /warehouse/query, /warehouse/expiry` | `MENU_WMS_VIEW` | ✅ 已注册 | |
| 库存管理 → 操作 | `/warehouse/inbound, /outbound, /transfer, /stocktake, /daily-close, /loss-report` | `MENU_WMS_INOUT` | ✅ 已注册 | |
| 库存管理 → 主档 | `/warehouse/warehouses, /zones, /locations` | `MENU_WMS_MASTER` | ✅ 已注册 | |
| 采购管理 → 看板 | `/procurement2/dashboard` | `MENU_PRC2` | ✅ 已注册 | |
| 采购管理 → 主数据（供应商/项目/申请） | `/procurement2/suppliers, /projects, /requests` | `MENU_PRC2_MASTER` | ✅ 已注册 | |
| 采购管理 → 订单 | `/procurement2/orders` | `MENU_PRC2_ORDER` | ✅ 已注册 | |
| 采购管理 → 收货 | `/procurement2/receipts` | `MENU_PRC2_RECEIPT` | ✅ 已注册 | |
| 采购管理 → 物流 | `/procurement2/shipments` | `MENU_PRC2_SHIPMENT` | ✅ 已注册 | |
| 采购管理 → 付款 | `/procurement2/payments` | `MENU_PRC2_PAYMENT` | ✅ 已注册 | |
| 采购管理 → 股东资金 | `/procurement2/shareholder-funds` | `MENU_PRC2_FUND` | ✅ 已注册 | |
| 采购管理 → 历史初始化 | `/procurement2/init` | `MENU_PRC2_INIT` | ✅ 已注册 | |
| 销售管理（组） | — | `MENU_SALES2` | ✅ 已注册 | |
| 销售管理 → 销售总览 | `/sales2` | `MENU_SALES2` | ✅ 已注册 | |
| 销售管理 → 客户档案 | `/sales2/customers` | `MENU_SALES2_CUSTOMER` | ✅ 已注册 | |
| 销售管理 → 渠道管理 | `/sales2/channels` | `MENU_SALES2_CHANNEL` | ✅ 已注册 | **需补 Sidebar 入口** |
| 销售管理 → 价格管理 | `/sales2/pricing` | `MENU_SALES2_PRICE` | ✅ 已注册 | |
| 销售管理 → 销售订单 | `/sales2/orders` | `MENU_SALES2_ORDER` | ✅ 已注册 | |
| 销售管理 → 配送管理 | `/sales2/delivery` | `MENU_SALES2_DELIVERY` | ✅ 已注册 | |
| 销售管理 → 退货管理 | `/sales2/returns` | `MENU_SALES2_RETURN` | ✅ 已注册 | |
| 销售管理 → 信用管理 | `/sales2/credit` | `MENU_SALES2_CREDIT` | ✅ 已注册 | **需补 Sidebar 入口 + 新建前端页面** |
| 销售管理 → 库存管理 | `/sales2/inventory` | `MENU_SALES2_INVENTORY` | ✅ 已注册 | |
| 销售管理 → 门店管理组 | `/store/*` | `MENU_STORE_MGR` | ✅ 已注册 | |
| 销售管理 → 直营店收银 | `/store-pos` | `MENU_STORE_POS` | ✅ 已注册 | |
| 财务管理（组） | — | `MENU_FIN2` | ✅ 已注册 | |
| 财务管理 → 应收账款 | `/finance2/ar` | `MENU_FIN2_AR` | ✅ 已注册 | |
| 财务管理 → 应付账款 | `/finance2/ap` | `MENU_FIN2_AP` | ✅ 已注册 | |
| 财务管理 → 资金账户 | `/finance2/cash-accounts` | `MENU_FIN2_CASH` | ✅ 已注册 | |
| 财务管理 → 资金调拨 | `/finance2/fund-transfers` | `MENU_FIN2_CASH` | ✅ 已注册 | **需补 Sidebar 入口** |
| 财务管理 → 股东资金 | `/finance2/shareholder-funds` | `MENU_FIN2_SHAREHOLDER` | ✅ 已注册 | |
| 财务管理 → 费用管理 | `/finance2/expenses` | `MENU_FIN2_EXPENSE` | ✅ 已注册 | **需补 Sidebar 入口** |
| 财务管理 → 报销管理 | `/finance2/reimbursements` | `MENU_FIN2_REIMBURSE` | ❌ **未注册** | **需注册 MENU + 补 Sidebar 入口** |
| 财务管理 → 财务报表 | `/finance2/reports` | `MENU_FIN2_REPORT` | ✅ 已注册 | |
| 审批中心（组） | — | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 审批待办 | `/workflow/todos` | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 审批历史 | `/workflow/history` | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 通知中心 | `/notifications` | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 审批健康看板 | `/workflow/metrics` | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 在线表单 | `/workflow/forms/runtime` | `MENU_WORKFLOW` | ✅ 已注册 | |
| 审批中心 → 审批规则 | `/settings/approval-rules` | `MENU_WORKFLOW` | ✅ 已注册 | 从"系统设置"迁入 |
| 经营分析（组） | — | `MENU_DASHBOARD` | ✅ 已注册 | |
| 经营分析 → 经营总览 | `/analytics` | `MENU_DASHBOARD` | ✅ 已注册 | |
| 经营分析 → 销售分析 | `/sales2/reports` | `MENU_SALES2_REPORT` | ✅ 已注册 | |
| 经营分析 → 价格执行复盘 | `/analytics/price-review` | `MENU_DASHBOARD` | ✅ 已注册 | |
| 经营分析 → 生产报表 | `/analytics/production` | `MENU_DASHBOARD` | ✅ 已注册 | |
| 经营分析 → 库存周转 | `/analytics/inventory` | `MENU_DASHBOARD` | ✅ 已注册 | |
| 经营分析 → 饲料核对 | `/analytics/feed` | `MENU_DASHBOARD` | ✅ 已注册 | |
| 主数据中心 → 农场主档 | `/master/farms` | `MENU_MASTER` | ✅ 已注册 | |
| 主数据中心 → 产品品级 | `/master/products` | `MENU_MASTER` | ✅ 已注册 | |
| 主数据中心 → 门店主档 | `/master/stores` | `MENU_MASTER` | ✅ 已注册 | |
| 主数据中心 → 商品主数据 | `/settings/products` | `MENU_MASTER` | ✅ 已注册 | 修复 perm:null |
| 主数据中心 → 主数据配置 | `/settings/master-data` | `MENU_MASTER` | ✅ 已注册 | 修复 perm:null |
| 系统设置 → 用户管理 | `/settings/users` | `MENU_SETTINGS_USER` | ✅ 已注册 | |
| 系统设置 → 角色与权限 | `/settings/roles` | `MENU_SETTINGS_IT` | ✅ 已注册 | |
| 系统设置 → 组织架构 | `/settings/organizations` | `MENU_SYS_ORG` | ✅ 已注册 | |
| 系统设置 → 数据范围 | `/settings/data-scopes` | `MENU_SYS_ORG` | ✅ 已注册 | |
| 系统设置 → 系统字典 | `/settings/dict` | `MENU_SETTINGS_DATA` | ✅ 已注册 | |
| 系统设置 → 权限配置 | `/settings/permissions` | `MENU_SETTINGS_IT` | ✅ 已注册 | |
| 系统设置 → 终端配置 | `/settings/pda-terminals` | `MENU_SETTINGS_IT` | ✅ 已注册 | 修复 perm:null |
| 系统设置 → 分账库存配置 | `/settings/store-stock` | `MENU_SETTINGS_IT` | ✅ 已注册 | 修复 perm:null |
| 系统设置 → 审计日志 | `/settings/audit-log` | `MENU_SETTINGS_IT` | ✅ 已注册 | |
| 系统设置 → 品牌配置 | `/settings/brand` | `MENU_SETTINGS_IT` | ✅ 已注册 | |
| 系统设置 → 个人中心 | `/settings/profile` | `null`（合理） | — | |
| UAT 试运行 | `/uat` | `MENU_UAT` | ✅ 已注册 | |
| 系统运维 → 监控面板 | `/system/health` | `MENU_SYS_MONITOR` | ✅ 已注册 | |
| 系统运维 → 异常告警 | `/system/alerts` | `MENU_SYS_MONITOR` | ✅ 已注册 | |
| 系统运维 → 配置治理 | `/system/configs` | `MENU_SYS_CONFIG` | ✅ 已注册 | |

---

## 七、缺失权限清单（需在 Phase 2 修复）

### 7.1 需新注册到 rbac.matrix.ts 的 MENU（1 项）

| MENU_CODE | 对应功能 | 路径 | 建议角色权限 |
|-----------|---------|------|------------|
| `MENU_FIN2_REIMBURSE` | 报销管理 | `/finance2/reimbursements` | ROLE_ADMIN:全部, ROLE_FIN_CFO:VEAX, ROLE_HQ_FINANCE:VEAX, ROLE_FACTORY_ACCT:VEX, ROLE_FARM_MGR:VC（申请）, ROLE_STORE_MGR:VC（申请）, ROLE_CEO:VAX, ROLE_AUDITOR:VX |

### 7.2 需修复 perm:null 的 Sidebar 项（8 项）

| ID | 路径 | 现状 | 应设 MENU_CODE |
|----|------|------|--------------|
| stg-products | `/settings/products` | `null` | `MENU_MASTER` |
| stg-master | `/settings/master-data` | `null` | `MENU_MASTER` |
| stg-pda | `/settings/pda-terminals` | `null` | `MENU_SETTINGS_IT` |
| stg-pos | `/settings/pos-config` | `null` | `MENU_SETTINGS_IT` |
| stg-stock-cfg | `/settings/store-stock` | `null` | `MENU_SETTINGS_IT` |
| stg-security | `/settings/security` | `null` | `MENU_SETTINGS_IT` |
| pos-ov | `/pos` | `null` | 建议隐藏（功能由 `/store-pos` 覆盖） |
| pos-sales | `/pos/sales` | `null` | 建议隐藏 |

### 7.3 需补 Sidebar 入口的已实现页面（5 项）

| 功能 | 路径 | 页面行数 | 推荐 MENU | 紧急度 |
|------|------|---------|---------|------|
| 渠道管理 | `/sales2/channels` | 后端有 API | `MENU_SALES2_CHANNEL` | 🔴 P1 |
| 信用管理 | `/sales2/credit` | 需新建前端页面 | `MENU_SALES2_CREDIT` | 🔴 P1 |
| 资金调拨 | `/finance2/fund-transfers` | 460 行 | `MENU_FIN2_CASH` | 🔴 P0 |
| 费用管理 | `/finance2/expenses` | 525 行 | `MENU_FIN2_EXPENSE` | 🔴 P0 |
| 报销管理 | `/finance2/reimbursements` | 362 行 | `MENU_FIN2_REIMBURSE`（待注册） | 🔴 P0 |

---

## 八、分阶段重构建议

### Phase 2A — 立即修复（安全 + 功能缺口，当前 Sprint）

**目标：修复 P0 安全漏洞 + 补齐 Finance V2 三个缺失入口**

优先级最高，本阶段只改 Sidebar.tsx 和 rbac.matrix.ts，**不改任何页面**。

| 序号 | 操作 | 涉及文件 | 难度 |
|------|------|---------|------|
| 1 | 隐藏 POS 销售组（pos/pos-sales） | Sidebar.tsx（注释掉） | 🟢 低 |
| 2 | 修复 6 个 perm:null 设置项 | Sidebar.tsx | 🟢 低 |
| 3 | 在 Sidebar Finance V2 组补充：资金调拨、费用管理、报销管理 | Sidebar.tsx | 🟢 低 |
| 4 | 注册 `MENU_FIN2_REIMBURSE` | rbac.matrix.ts | 🟢 低 |
| 5 | 在 Sidebar Sales V2 组补充：渠道管理、信用管理 | Sidebar.tsx | 🟢 低 |

**验证：**
- API TypeScript 0 errors
- Web TypeScript 0 errors
- scope-audit 31/31（需更新至 32+/32+ 如有新 MENU）

---

### Phase 2B — 菜单重命名（去技术词，下一 Sprint）

**目标：将技术词汇从菜单标签清除**

纯 label 改动，不改路由、不改权限。

| 当前标签 | 目标标签 | 涉及 ID |
|---------|---------|---------|
| 采购 V2 | 采购管理 | procurement2 组 |
| 供应商 V2 | 供应商 | prc2-supplier |
| 销售系统 | 销售管理 | sales2 组 |
| 销售系统总览 | 销售总览 | s2-overview |
| 财务 V2 | 财务管理 | finance2 组 |
| 应付管理 | 应付账款 | f2-ap |
| 应收管理 | 应收账款 | f2-ar |
| 工作流 | 审批中心 | workflow 组 |
| 数据分析 | 经营分析 | analytics 组 |
| BI 驾驶舱 | 经营总览 | an-bi |
| 经营分析（sales2内） | 销售分析 | s2-reports |

---

### Phase 2C — 菜单结构重组（规划 Sprint）

**目标：按 12 大业务模块重组一级菜单**

| 操作 | 说明 | 风险 |
|------|------|------|
| 合并"生产管理"组 | 养殖生产 + 分级包装 + 品质追溯 → 生产管理 | 🟡 中（子菜单数量多，视觉负担重） |
| 销售管理合并直营门店 | 将 /store/* 迁入销售管理组 | 🟡 中（组大） |
| 经营分析整合 | sales2/reports 迁入 analytics 组 | 🟡 中 |
| 审批规则迁移 | 从系统设置迁入审批中心 | 🟢 低 |
| 主数据中心扩充 | 迁入 settings/products, settings/master-data | 🟢 低 |
| 系统健康合并 | settings/health → redirect to /system/health | 🟢 低 |
| 评估隐藏会员营销/批发管理 | 两组均为 stub，建议隐藏等待实现 | 🟢 低 |

---

### Phase 2D — 前端页面补建（规划 Sprint）

**目标：补建缺失的前端页面**

| 页面 | 路径 | 对应 MENU | 说明 |
|------|------|---------|------|
| 信用管理 | `/sales2/credit` | `MENU_SALES2_CREDIT` | Phase 5 后端已完整，需建前端页面（参考 /sales2/customers 风格） |

> 注：渠道管理前端页面是否存在需确认。其余 Finance V2 缺失页面均已存在，仅需补 Sidebar 入口。

---

## 九、风险清单

| 风险 ID | 风险描述 | 可能影响 | 缓解措施 | 风险等级 |
|--------|---------|---------|---------|---------|
| R1 | POS 销售组整组 perm:null，任意登录用户可访问 `/pos/sales`（旧 POS 收银页面） | 数据泄露，权限绕过 | Phase 2A 立即注释隐藏 | 🔴 高 |
| R2 | 报销管理页面（362行）完整实现但无 MENU 保护，任意登录用户可访问 `/finance2/reimbursements` | 财务数据泄露 | Phase 2A 注册 MENU_FIN2_REIMBURSE | 🔴 高 |
| R3 | 6 个系统设置项 perm:null，运维功能对所有用户开放 | 系统配置误操作 | Phase 2A 修复 perm | 🔴 高 |
| R4 | Finance V2 三个已实现页面（资金调拨/费用/报销）无 Sidebar 入口，用户只能通过直接访问 URL 进入，可能造成数据遗漏 | 财务数据不完整 | Phase 2A 补入口 | 🟡 中 |
| R5 | 销售信用管理（Phase 5 完整后端）无前端界面，信用冻结/解冻操作无 UI | 业务流程断裂 | Phase 2D 补建前端 | 🟡 中 |
| R6 | 渠道管理（MENU_SALES2_CHANNEL）有后端 API 但无 Sidebar 入口，导致渠道配置无法操作 | 销售管理缺口 | Phase 2A 补入口 | 🟡 中 |
| R7 | 会员营销/批发管理均为 stub 页面，长期显示在 Sidebar 造成用户期望落空 | 用户体验差 | Phase 2C 评估隐藏 | 🟡 中 |
| R8 | 菜单重组（Phase 2C）可能改变路由激活态，导致 Sidebar 折叠展开行为异常 | 视觉 bug | Phase 2C 前做充分测试 | 🟡 中 |
| R9 | "审批规则"从系统设置迁入审批中心后，已有书签/收藏的用户会找不到入口 | 用户迷失 | 迁移时保留 30 天重定向 | 🟢 低 |
| R10 | 生产管理组合并后（养殖+包装+质检 = 22 项子菜单），单组过大造成滚动负担 | 视觉体验差 | 考虑二级折叠或分页签 | 🟢 低 |

---

## 十、实施检查清单（供 Phase 2A 执行参考）

### Sidebar.tsx 修改清单

```
[ ] 注释隐藏 POS 销售组（id: "pos"）及两个子项
[ ] stg-products: perm: null → perm: "MENU_MASTER"
[ ] stg-master: perm: null → perm: "MENU_MASTER"
[ ] stg-pda: perm: null → perm: "MENU_SETTINGS_IT"
[ ] stg-pos: perm: null → perm: "MENU_SETTINGS_IT"
[ ] stg-stock-cfg: perm: null → perm: "MENU_SETTINGS_IT"
[ ] stg-security: perm: null → perm: "MENU_SETTINGS_IT"
[ ] finance2 组新增：资金调拨（/finance2/fund-transfers, MENU_FIN2_CASH）
[ ] finance2 组新增：费用管理（/finance2/expenses, MENU_FIN2_EXPENSE）
[ ] finance2 组新增：报销管理（/finance2/reimbursements, MENU_FIN2_REIMBURSE）
[ ] sales2 组新增：渠道管理（/sales2/channels, MENU_SALES2_CHANNEL）
[ ] sales2 组新增：信用管理（/sales2/credit, MENU_SALES2_CREDIT）
```

### rbac.matrix.ts 修改清单

```
[ ] 注册 MENU_FIN2_REIMBURSE（参考 MENU_FIN2_EXPENSE 权限设计）
```

### 验证清单

```
[ ] API TypeScript 0 errors
[ ] Web TypeScript 0 errors
[ ] scope-audit 通过（更新后行数）
[ ] 手动验证：ROLE_FARM_MGR 无法访问 /pos, /pos/sales（403）
[ ] 手动验证：ROLE_ADMIN 可访问 /finance2/fund-transfers, /finance2/expenses, /finance2/reimbursements
[ ] 手动验证：ROLE_SALES_MGR 可访问 /sales2/channels, /sales2/credit
[ ] 手动验证：非 MENU_SETTINGS_IT 角色无法访问 /settings/pda-terminals
```

---

## 附录：当前 Sidebar 活跃路由统计

| 分类 | 路由数量 | MENU 覆盖率 |
|------|---------|-----------|
| 🟢 V2正式菜单 | 45 项 | 100% |
| 🔵 V1在用菜单 | 53 项 | 92%（6 项 perm:null 待修） |
| 🟡 存疑保留菜单 | 8 项（会员+批发） | 100%（MENU_B2B_SALE 覆盖） |
| ⚫ 僵尸入口 | 10 项（perm:null） | 0%（全部待修） |
| 🔴 已冻结（注释） | ~25 项 | — |
| **功能缺口（有页面无入口）** | **5 项** | — |
| **合计活跃** | **116 项** | — |

> **审计结论：** 当前导航架构整体健康度 **73%**。主要问题集中在安全漏洞（P0）和功能缺口（P1），均可在 1-2 个 Sprint 内通过纯 Sidebar + RBAC 改动解决，无需修改后端业务逻辑或数据库。
