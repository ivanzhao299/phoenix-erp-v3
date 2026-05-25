# Phoenix ERP V3 — RBAC 角色权限矩阵

> 生成日期：2026-05-24  
> 数据来源：`apps/api/src/common/guards/rbac.matrix.ts`  
> 引擎版本：MenuGuard + ROLE_MENU_MATRIX

---

## 一、权限码说明

| 权限码 | 含义 |
|:------:|------|
| **V** | View — 查看/读取 |
| **C** | Create — 新增 |
| **E** | Edit — 编辑/更新 |
| **D** | Delete — 删除/停用 |
| **A** | Approve — 审批/审核 |
| **X** | Export — 导出/下载 |

> **未注册菜单（宽松策略）**：若 MENU_CODE 未在矩阵中声明，则任何已登录用户均可访问（等效于全 V）。

---

## 二、角色清单

| 角色代码 | 中文名称 | 职能描述 |
|----------|----------|----------|
| `ROLE_ADMIN` | 集团超级管理员 | 全系统所有权限，含系统配置与初始化 |
| `ROLE_CEO` | 总裁 / CEO | 全模块查看 + 关键审批 + 导出 |
| `ROLE_REGION_MGR` | 区域督导 | 跨场只读看板 + 审批 |
| `ROLE_FARM_MGR` | 农场场长 | 养殖生产全权 + 跨模块只读 |
| `ROLE_BREEDER` | 饲养员 | 养殖日常记录（增/改/看） |
| `ROLE_VET` | 兽医 | 免疫用药记录 + 质检 |
| `ROLE_WMS_MGR` | 仓库管理员 | 仓储全权 + PDA操作 |
| `ROLE_FIN_CFO` | 财务总监 | 财务全权 + 采购付款审批 + 资金管理 |
| `ROLE_FIN_ACCT` | 财务会计 | 财务录入 + 采购付款录入 + 导出 |
| `ROLE_FIN_AR` | 应收会计 | 应收管理录入 |
| `ROLE_PRC_BUYER` | 采购专员 | 采购全流程操作（不含付款审批/股东资金） |
| `ROLE_LOG_MGR` | 物流调度 | 运单管理 + 收货 |
| `ROLE_LOGISTICS_MGR` | 物流管理员 | 配送运输全权 |
| `ROLE_STORE_MGR` | 门店管理员 | 门店库存/收货/日结 + POS |
| `ROLE_CASHIER` | 收银员 | POS收银 + 门店基础操作 |
| `ROLE_SALES_REP` | 销售代表 | 订单创建 |
| `ROLE_AUDITOR` | 审计员 | 全模块只读 + 导出（不可操作） |
| `ROLE_HR_ADMIN` | HR 管理员 | 用户账号管理 |
| `ROLE_SYSOPS` | 系统运维 | 系统配置 + IoT设备管理 |
| `ROLE_DRIVER` | 司机 | 配送任务查看 + 签到 |

---

## 三、权限矩阵（按业务域）

### 3.1 养殖生产

#### MENU_BREEDING — 养殖生产总模块

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_BREEDER | ✅ | ✅ | ✅ | | | |
| ROLE_VET | ✅ | ✅ | ✅ | | | |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

#### MENU_FARM_DATA — 养殖场数据（日报/鸡群/鸡舍）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_BREEDER | ✅ | ✅ | ✅ | | | |
| ROLE_VET | ✅ | | | | | |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

#### MENU_IOT — 设备监控 / IoT

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | | ✅ | | | ✅ |
| ROLE_BREEDER | ✅ | | | | | |
| ROLE_CEO | ✅ | | | | | |
| ROLE_REGION_MGR | ✅ | | | | | |
| ROLE_SYSOPS | ✅ | ✅ | ✅ | ✅ | | |

---

### 3.2 分级包装

#### MENU_PACKAGING — 包装生产

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_BREEDER | ✅ | ✅ | ✅ | | | |
| ROLE_WMS_MGR | ✅ | ✅ | | | | |

---

### 3.3 仓储库存

#### MENU_INVENTORY — 库存总览

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_WMS_MGR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | | | | ✅ |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

#### MENU_WMS — 仓库操作（出入库/调拨/盘点）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_WMS_MGR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

#### MENU_PDA — PDA终端操作

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_WMS_MGR | ✅ | ✅ | ✅ | ✅ | | |
| ROLE_FARM_MGR | ✅ | ✅ | | | | |
| ROLE_BREEDER | ✅ | ✅ | | | | |
| ROLE_CASHIER | ✅ | | | | | |

---

### 3.4 采购供应 V1（旧版）

#### MENU_PROCUREMENT — 采购 V1 主模块

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |

> ⚠️ V1 旧版采购模块，计划在 Phase 8 切换完成后停用。

---

### 3.5 采购供应 V2（新版）

#### MENU_PRC2_MASTER — 主数据（供应商/项目）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_FARM_MGR | ✅ | | | | | |
| ROLE_FIN_CFO | ✅ | | | | | |
| ROLE_CEO | ✅ | | | | | |
| ROLE_REGION_MGR | ✅ | | | | | |

#### MENU_PRC2 — 主模块（申请/订单/物流/收货汇总）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | |
| ROLE_LOG_MGR | ✅ | | ✅ | | | |

#### MENU_PRC2_ORDER — 采购订单（PO）管理

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | |

#### MENU_PRC2_PAYMENT — 付款管理（敏感）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FIN_CFO | ✅ | ✅ | ✅ | | ✅ | ✅ |
| ROLE_FIN_ACCT | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_PRC_BUYER | ✅ | | | | | |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |

#### MENU_PRC2_FUND — 股东资金（高度敏感）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FIN_CFO | ✅ | ✅ | ✅ | | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |

#### MENU_PRC2_SHIPMENT — 物流运单

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_LOG_MGR | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_FARM_MGR | ✅ | | | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | |

#### MENU_PRC2_RECEIPT — 收货入库

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_PRC_BUYER | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_LOG_MGR | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | ✅ | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | |

#### MENU_PRC2_DASHBOARD — 采购看板 & 报表

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | | | | | ✅ |
| ROLE_PRC_BUYER | ✅ | | | | | ✅ |
| ROLE_FARM_MGR | ✅ | | | | | |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | |

#### MENU_PRC2_INIT — 历史数据初始化（仅超管）

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### 3.6 财务结算

#### MENU_FINANCE — 财务主模块

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FIN_CFO | ✅ | ✅ | ✅ | | ✅ | ✅ |
| ROLE_FIN_ACCT | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_FIN_AR | ✅ | ✅ | | | | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |
| ROLE_AUDITOR | ✅ | | | | | ✅ |

#### MENU_FIN_CLOSE — 日结/月结/关账

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FIN_CFO | ✅ | | | | ✅ | ✅ |
| ROLE_FIN_ACCT | ✅ | ✅ | | | | ✅ |
| ROLE_STORE_MGR | ✅ | ✅ | | | | |
| ROLE_CASHIER | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

---

### 3.7 直营门店

#### MENU_STORE — 门店操作

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_STORE_MGR | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_CASHIER | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |

#### MENU_POS — POS 收银前台

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_STORE_MGR | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_CASHIER | ✅ | ✅ | ✅ | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

---

### 3.8 订单系统

#### MENU_ORDERS — 订单管理

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_STORE_MGR | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_CASHIER | ✅ | ✅ | ✅ | | | |
| ROLE_SALES_REP | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | ✅ | ✅ |
| ROLE_FIN_ACCT | ✅ | | | | | ✅ |

---

### 3.9 配送运输

#### MENU_LOGISTICS — 配送运输

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_LOGISTICS_MGR | ✅ | ✅ | ✅ | ✅ | | ✅ |
| ROLE_DRIVER | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

---

### 3.10 品质追溯

#### MENU_QA — 质检总模块

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_FARM_MGR | ✅ | ✅ | ✅ | | | ✅ |
| ROLE_VET | ✅ | ✅ | ✅ | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_AUDITOR | ✅ | | | | | ✅ |

---

### 3.11 数据分析

#### MENU_ANALYTICS — BI 看板 & 数据分析

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | | ✅ |
| ROLE_FIN_CFO | ✅ | | | | | ✅ |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |
| ROLE_FARM_MGR | ✅ | | | | | |
| ROLE_AUDITOR | ✅ | | | | | ✅ |

---

### 3.12 会员 & CRM

#### MENU_CRM — 会员营销

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_STORE_MGR | ✅ | ✅ | ✅ | | | |
| ROLE_CASHIER | ✅ | ✅ | | | | |
| ROLE_REGION_MGR | ✅ | | | | | ✅ |

---

### 3.13 审批流

#### MENU_APPROVAL — 审批中心

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_CEO | ✅ | | | | ✅ | |
| ROLE_REGION_MGR | ✅ | | | | ✅ | |
| ROLE_FARM_MGR | ✅ | | | | ✅ | |
| ROLE_FIN_CFO | ✅ | | | | ✅ | |
| ROLE_AUDITOR | ✅ | | | | | ✅ |

---

### 3.14 系统管理

#### MENU_SYSTEM — 系统配置

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_SYSOPS | ✅ | ✅ | ✅ | ✅ | | |
| ROLE_HR_ADMIN | ✅ | ✅ | ✅ | | | |

#### MENU_USERS — 用户账号管理

| 角色 | V | C | E | D | A | X |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| ROLE_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ROLE_SYSOPS | ✅ | ✅ | ✅ | | | |
| ROLE_HR_ADMIN | ✅ | ✅ | ✅ | ✅ | | |

---

## 四、前端菜单权限码（宽松策略适用）

以下 MENU_CODE 在前端 Sidebar 中用于控制菜单可见性，但**尚未在后端矩阵中注册**，适用宽松策略（已登录即可访问）：

| MENU_CODE | 对应前端页面 | 说明 |
|-----------|-------------|------|
| `MENU_DASHBOARD` | `/dashboard` | 主仪表盘（未注册=全员可见） |
| `MENU_DEVICE_MONITOR` | `/breeding/device*` | IoT 设备监控 |
| `MENU_FARM_VET` | `/breeding/immune` `/breeding/medicine` | 兽医操作专属 |
| `MENU_PKG_OP` | `/packaging` | 包装操作 |
| `MENU_PKG_MGR` | `/packaging/*` | 包装管理 |
| `MENU_WMS_VIEW` | `/warehouse` 看板/台账 | 仓库只读 |
| `MENU_WMS_INOUT` | `/warehouse/inbound` 等 | 仓库出入库 |
| `MENU_WMS_MASTER` | `/warehouse/warehouses` 等 | 仓库主档 |
| `MENU_LOGISTICS_MASTER` | `/transport/vehicles` `/transport/drivers` | 车辆/司机档案 |
| `MENU_STORE_MGR` | `/store/*` | 门店管理 |
| `MENU_PRC_MGR` | `/procurement/*` | 采购 V1 |
| `MENU_PRC_MASTER` | `/procurement/suppliers` | 采购 V1 供应商 |
| `MENU_QA_OP` | `/quality` 基础操作 | 质检操作 |
| `MENU_QA_MGR` | `/quality/nonconformance` 等 | 质检管理 |
| `MENU_QA_MASTER` | `/quality/standards` | 质检标准 |
| `MENU_ORDER_MGR` | `/order/*` | 订单管理 |
| `MENU_ORDER_WH` | `/order/picking` `/order/loading` | 拣货/装车 |
| `MENU_ORDER_FIN` | `/order/credit` | 信用台账 |
| `MENU_FIN_AUDIT` | `/finance/*` | 财务（前端用此码） |
| `MENU_B2B_SALE` | `/b2b/*` `/members/*` | B2B + 会员营销 |
| `MENU_MASTER` | `/master/*` | 主数据管理 |
| `MENU_SETTINGS_USER` | `/settings/users` 等 | 用户设置 |
| `MENU_SETTINGS_IT` | `/settings/security` 等 | IT安全设置 |
| `MENU_SETTINGS_DATA` | `/settings/dict` 等 | 数据字典设置 |

> **建议**：后续可将上述高敏感 MENU_CODE（尤其是 `MENU_FIN_AUDIT`、`MENU_ORDER_MGR`）补充注册到矩阵，以实现细粒度后端控制。

---

## 五、角色权限横向汇总

> ✅ = 有任意权限  ⭐ = 含审批权  🔒 = 高敏感模块

| 角色 | 养殖生产 | 分级包装 | 仓储库存 | 采购V1 | 采购V2 | 付款🔒 | 股东资金🔒 | 财务 | 门店/POS | 订单 | 物流 | 质检 | 系统管理 |
|------|:--------:|:--------:|:--------:|:------:|:------:|:------:|:----------:|:----:|:--------:|:----:|:----:|:----:|:--------:|
| ROLE_ADMIN | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ |
| ROLE_CEO | ✅ | | ✅ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | | ✅⭐ | ✅ | ✅ | |
| ROLE_REGION_MGR | ✅ | | ✅ | | ✅ | | | ✅ | ✅ | ✅⭐ | ✅ | ✅ | |
| ROLE_FARM_MGR | ✅⭐ | ✅ | ✅ | ✅ | ✅ | | | | | | | ✅ | |
| ROLE_BREEDER | ✅ | ✅ | | | | | | | | | | | |
| ROLE_VET | ✅ | | | | | | | | | | | ✅ | |
| ROLE_WMS_MGR | | ✅ | ✅⭐ | | | | | | | | | | |
| ROLE_FIN_CFO | | | | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | ✅⭐ | | | | | |
| ROLE_FIN_ACCT | | | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | ✅ | | | |
| ROLE_FIN_AR | | | | | | | | ✅ | | | | | |
| ROLE_PRC_BUYER | | | | ✅ | ✅ | 只读 | | | | | | | |
| ROLE_LOG_MGR | | | | | ✅ | | | | | | ✅ | | |
| ROLE_LOGISTICS_MGR | | | | | | | | | | | ✅⭐ | | |
| ROLE_STORE_MGR | | | | | | | | ✅ | ✅⭐ | ✅ | | | |
| ROLE_CASHIER | | | | | | | | ✅ | ✅ | ✅ | | | |
| ROLE_SALES_REP | | | | | | | | | | ✅ | | | |
| ROLE_AUDITOR | | | | | | | | ✅ | | | | ✅ | |
| ROLE_HR_ADMIN | | | | | | | | | | | | | ✅ |
| ROLE_SYSOPS | | | | | | | | | | | | | ✅ |
| ROLE_DRIVER | | | | | | | | | | | ✅ | | |

---

## 六、关键安全说明

### 高敏感模块访问控制

| 模块 | 访问限制 | 原因 |
|------|---------|------|
| **股东资金 (MENU_PRC2_FUND)** | 仅 ADMIN / CFO / CEO | 涉及股东出资/借款，财务高度敏感 |
| **历史初始化 (MENU_PRC2_INIT)** | 仅 ADMIN | 批量写入历史数据，操作不可逆 |
| **采购付款 (MENU_PRC2_PAYMENT)** | ADMIN/CFO/ACCT/CEO | 资金流出，审批链路严格管控 |
| **系统配置 (MENU_SYSTEM)** | ADMIN/SYSOPS/HR | 影响全系统运行 |

### 审批权限持有角色

以下角色持有 **A（审批）** 权限：

- 采购订单审批：`ROLE_FIN_CFO`、`ROLE_CEO`、`ROLE_ADMIN`
- 采购付款审批：`ROLE_FIN_CFO`、`ROLE_CEO`、`ROLE_ADMIN`
- 股东资金审批：`ROLE_FIN_CFO`、`ROLE_CEO`、`ROLE_ADMIN`
- 养殖数据审批：`ROLE_FARM_MGR`、`ROLE_ADMIN`
- 财务关账审批：`ROLE_FIN_CFO`、`ROLE_ADMIN`
- 通用审批流：`ROLE_CEO`、`ROLE_REGION_MGR`、`ROLE_FARM_MGR`、`ROLE_FIN_CFO`、`ROLE_ADMIN`

---

*文档由 Claude Code 自动生成，如有权限变更请同步更新 `apps/api/src/common/guards/rbac.matrix.ts` 并重新生成本文档。*
