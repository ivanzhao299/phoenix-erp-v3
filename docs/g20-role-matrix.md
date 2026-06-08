# Phoenix ERP 角色矩阵（G20-4 立宪）

> **立账日**：2026-06-08
> **目标**：所有 50+ 角色立宪化清单，含含义/职责/持权 menu 概要/store_code 维度
> **欠债 ID**：A5（角色矩阵混乱）→ 本文档落档解决

---

## 一、角色分层（按业务域）

### 1. 集团/治理类
| ROLE | 名 | 持权范围 | store_code 维度 |
|---|---|---|---|
| ROLE_ADMIN | 集团超级管理员 | 全部 (`*`) | ALL |
| ROLE_CEO | 集团总裁 | 全模块 V | ORG-GROUP-* |
| ROLE_BU_AGRI_GM | 农业事业群总经理 | 农业域全 V/C/E | ORG-GROUP-AGRI |
| ROLE_BU_FOOD_GM | 食品事业群总经理 | 食品域全 V/C/E | ORG-GROUP-FOOD |
| ROLE_PILOT_MANAGER | 试运行负责人 | 跨域 V + 治理 | ALL |

### 2. 主数据治理类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_MASTER_DATA_ADMIN | 主数据管理员 | MENU_MASTER:V,C,E |
| ROLE_MASTER_DATA_APPROVER | 主数据审批人 | MENU_MASTER:V,A |
| ROLE_CUSTOMER_MASTER_MGR | 客户主数据管理 | MENU_MASTER_CUSTOMER:V,C,E |
| ROLE_SUPPLIER_MASTER_MGR | 供应商主数据管理 | MENU_MASTER_SUPPLIER:V,C,E |
| ROLE_PRODUCT_MASTER_MGR | 产品主数据管理 | MENU_MASTER_PRODUCT/SKU:V,C,E |
| ROLE_FARM_MASTER_MGR | 场站主数据管理 | MENU_MASTER_FARM/HOUSE:V,C,E |
| ROLE_WAREHOUSE_MASTER_MGR | 仓储主数据管理 | MENU_MASTER_WAREHOUSE:V,C,E |
| ROLE_FIN_ACCOUNT_MASTER_MGR | 资金账户主数据管理 | **MENU_FIN2_CASH_MASTER:V,C,E** ← G20-2 新粒度 |

### 3. 财务类
| ROLE | 名 | 持权范围（G20-2 后） |
|---|---|---|
| ROLE_FIN_CFO | 财务总监 | MENU_FIN2:V,C,E,A 全部 |
| ROLE_FIN_ACCT | 财务会计 | MENU_FIN2:V,C,E |
| ROLE_FIN_AR | 应收专员 | MENU_FIN2_AR:V,C,E |
| ROLE_FIN_COST | 成本会计 | MENU_FIN2_EXPENSE/AP:V,C,E |
| ROLE_CASH | 出纳 | **MENU_FIN2_CASH_TXN:V,C** + CASH_VIEW:V（不含 MASTER）|
| ROLE_CASHIER | 前台收银员 | **MENU_FIN2_CASH_TXN:V,C** （店内现金收付）|
| ROLE_TREASURY_MANAGER | 资金经理 | MENU_FIN2_CASH:V,C,E,A 全部 |
| ROLE_SHAREHOLDER_FINANCE | 股东资金管理员 | MENU_FIN2_SHAREHOLDER:V,C,E |
| ROLE_FINANCE_ANALYST | 财务分析经理 | MENU_FIN2:V + 报表导出 |
| ROLE_FINANCE_REVIEW_MANAGER | 财务审核经理 | MENU_FIN2:V,A |
| ROLE_COST_ACCOUNTING_MANAGER | 成本核算经理 | MENU_FIN2_EXPENSE:V,C,E |
| ROLE_HQ_FINANCE | 总部财务审计 | MENU_FIN2:V + 跨场审计 |

### 4. 养殖类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_FARM_MGR | 养殖场长 | MENU_FARM_*:V,C,E,A |
| ROLE_FACTORY_MGR | 场区经理 | MENU_FARM_*:V,C,E（场区限定）|
| ROLE_FARMER | 饲养员 | MENU_FARM_DAILY:V,E（仅录数据）|
| ROLE_VET | 驻场兽医 | MENU_FARM_VET:V,C,E + IMMUNE |
| **ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR** | **孟赛生产数据主管** | **MENU_FARM_*:V,C,E + MENU_PROD_*:V,C,E + MENU_WMS_VIEW:V + MENU_INV_*:V,C,E + MENU_FIN2_CASH_TXN:V,C（G20-2 修后）** |
| ROLE_QA_MGR | 品控总监 | MENU_FARM_QA + MENU_QA_*:V,C,E,A |
| ROLE_QA_STAFF | 质检专员 | MENU_QA_*:V,C,E |

### 5. 包装/生产类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_PKG_MGR | 车间主任 | MENU_PKG_*:V,C,E,A |
| ROLE_PKG_OP | 包装工人 | MENU_PKG_OP:V,C |
| ROLE_LINE_SUPERVISOR | 班组长 | MENU_PKG_*:V,C,E |
| ~~ROLE_PKG_OPERATOR~~ | [已废弃] 包装操作员 | — |
| ~~ROLE_QC_INSPECTOR~~ | [已废弃] 质检员 | — |

### 6. 仓储/物流类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_WMS_MGR | 仓储经理 | MENU_WMS_*:V,C,E,A + MENU_INV_*:V,C,E |
| ROLE_WMS_OP | 仓管理货员 | MENU_WMS_INOUT:V,C,E |
| ROLE_WH_CLERK | 仓管员 | MENU_WMS_VIEW + MENU_INV_BATCH:V |
| ROLE_PDA_OP | PDA 作业员 | MENU_WMS_INOUT:V,C（PDA 端）|
| ROLE_LOG_MGR | 物流调度 | MENU_SALES2_DELIVERY:V,C,E |
| ROLE_DRIVER | 司机 | MENU_SALES2_DELIVERY:V（移动端）|

### 7. 销售/商务类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_SALES_MGR | 销售经理 | MENU_SALES2_*:V,C,E,A |
| ROLE_SALES_REP | 业务员 | MENU_SALES2_ORDER:V,C,E |
| ROLE_B2B_MGR | 大客总监 | MENU_SALES2_*:V,C,E（B2B）|
| ROLE_CUSTOMER_B2B | 自助订货用户 | MENU_SALES2_ORDER:V,C（外部客户端）|
| ROLE_STORE_MGR | 直营店店长 | MENU_SALES2_*:V,C,E（门店）|
| ROLE_REGION_MGR | 区域督导 | MENU_SALES2_*:V + 跨店看板 |

### 8. 采购类
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_PRC_BUYER | 采购专员 | MENU_PRC2_*:V,C,E |

### 9. HR
| ROLE | 名 | 持权范围 |
|---|---|---|
| ROLE_HR_MANAGER | 人力资源经理 | MENU_HR_*:V,C,E,A |

---

## 二、宋明光（业务方核心用户）权限明细

**ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR · store_code=SITE-MENGSAI-LAYER**

| menu | perm | 业务用途 |
|---|---|---|
| MENU_DASHBOARD | V | 看 home 运营仪表 |
| MENU_BREEDING | V,C,E | 养殖业务父 menu |
| MENU_FARM_DAILY | V,E | 录日报 |
| MENU_FARM_DATA | V,C,E | 养殖数据（鸡舍/鸡群档案） |
| MENU_FARM_FEED | V,C,E | 饲料台账 |
| MENU_FARM_VET | V,C,E | 兽药记录 |
| MENU_FARM_QA | V | 看质检 |
| MENU_INV_BATCH | V,C,E | 库存批次 |
| MENU_INV_LEDGER | V,C,E | 库存流水 |
| MENU_INV_MANUAL_INBOUND | V,C,E | 手工入库 |
| MENU_WMS_INOUT | V,C,E | 出入库作业 |
| MENU_WMS_VIEW | V | 库存查看 |
| MENU_PROD_COLLECTION | V,C,E | 集蛋记录 |
| MENU_PROD_INBOUND | V,C,E | 日产蛋入库 |
| ~~MENU_FIN2_CASH~~ ~~V,C,E~~ | **V**（G20-2 收口） | 看流水 |
| **MENU_FIN2_CASH_TXN**（新）| **V,C** | 收付记账 |
| **MENU_FIN2_CASH_VIEW**（新）| V | 看账户列表 |
| ~~MENU_FIN2_CASH_MASTER~~ | **无** | 禁止建账户（G20-2 修复） |
| MENU_MASTER_GRADE | V | 看等级主档 |
| MENU_MASTER_PACKAGING | V | 看包装规格 |
| MENU_MASTER_PRODUCT | V | 看产品 |
| MENU_MASTER_SKU | V | 看 SKU |
| MENU_WORKFLOW | V | 看工作流 |
| MOBILE_* | V/C | 移动端录入（5+ menu）|

---

## 三、G20-2 收口前后对比

**问题**：宋明光持 `MENU_FIN2_CASH:V,C,E` → cash-accounts 页面"新建账户/收款/付款"按钮**全显示** → 业务方原意只想给"记账权"

**G20-2 治理后**：
- `MENU_FIN2_CASH:V`（保留看主页）
- `MENU_FIN2_CASH_VIEW:V`（看账户列表+流水）
- `MENU_FIN2_CASH_TXN:V,C`（收/付款记账）✓
- `MENU_FIN2_CASH_MASTER:无`（禁止建账户）✓
- 前端 cash-accounts/page.tsx 按钮按子 menu 显隐
- 实测预期：宋明光**仅看到"收款 / 付款"两按钮，"新建账户"按钮自动隐藏**

---

## 四、维护约定

1. **新增角色**：必须先来本文档登记 → 再写 mig seed sys_role + sys_role_menu_permission
2. **删除角色**：本文档标记 `~~~~` 删除线，**至少保留 3 个月**追溯
3. **menu 粒度变化**（如 G20-2 拆 MENU_FIN2_CASH）→ 本文档同步更新所有持该 menu 的角色权限映射
4. **业务方报权限问题**：先查本文档，对应角色是否含权 → 是 → 前端按钮 bug；否 → 业务方申请 + 文档加权
5. **欠债映射**：本文档解决 [A5 角色矩阵混乱]
