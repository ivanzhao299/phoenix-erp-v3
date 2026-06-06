# G5-A · RBAC 双轨审计报告

生成时间：2026-06-06T13:01:53.039Z

## 1. 规模总览

| 维度 | 静态矩阵 (rbac.matrix.ts) | 动态 DB (sys_role_menu_permission) |
|---|---|---|
| 角色数 | 55 | 44 |
| (role × menu) 权限单元 | 759 | 730 |

## 2. 仅静态矩阵有（需 seed 进 DB）

共 48 个角色、337 个权限单元在静态矩阵但不在 DB。
迁移后这些权限必须通过 seed migration 物化到 sys_role_menu_permission，
否则切断静态矩阵后老角色（ROLE_FARM_MGR 等）会全面 403。

| 角色 | 缺失 menu 数 |
|---|---|
| `ROLE_ADMIN` | 58 |
| `ROLE_AUDITOR` | 48 |
| `ROLE_B2B_MGR` | 1 |
| `ROLE_BU_AGRI_GM` | 2 |
| `ROLE_BU_FOOD_GM` | 2 |
| `ROLE_CASH` | 1 |
| `ROLE_CASHIER` | 8 |
| `ROLE_CEO` | 21 |
| `ROLE_CUSTOMER_MASTER_MGR` | 1 |
| `ROLE_FACTORY_ACCT` | 14 |
| `ROLE_FACTORY_MGR` | 5 |
| `ROLE_FARMER` | 5 |
| `ROLE_FARM_MASTER_MGR` | 1 |
| `ROLE_FARM_MGR` | 20 |
| `ROLE_FINANCE_REVIEW_MANAGER` | 1 |
| `ROLE_FIN_ACCOUNT_MASTER_MGR` | 2 |
| `ROLE_FIN_ACCT` | 9 |
| `ROLE_FIN_AR` | 1 |
| `ROLE_FIN_CFO` | 8 |
| `ROLE_GROUP_FINANCE` | 1 |
| `ROLE_HQ_FINANCE` | 8 |
| `ROLE_HQ_OPS` | 1 |
| `ROLE_HR_ADMIN` | 8 |
| `ROLE_MASTER_DATA_ADMIN` | 5 |
| `ROLE_MASTER_DATA_APPROVER` | 1 |
| `ROLE_PKG_MGR` | 1 |
| `ROLE_PKG_OPERATOR` | 1 |
| `ROLE_PRC_BUYER` | 1 |
| `ROLE_PRODUCT_MASTER_MGR` | 1 |
| `ROLE_PRODUCT_MGR` | 4 |
| `ROLE_PROJECT_MGR` | 9 |
| `ROLE_QA_MGR` | 3 |
| `ROLE_QA_STAFF` | 2 |
| `ROLE_QC_INSPECTOR` | 1 |
| `ROLE_REGION_MGR` | 26 |
| `ROLE_SALES_MGR` | 4 |
| `ROLE_SALES_REP` | 1 |
| `ROLE_SHAREHOLDER_FINANCE` | 1 |
| `ROLE_SHAREHOLDER_VIEW` | 3 |
| `ROLE_STORE_MGR` | 9 |
| `ROLE_SUPPLIER_MASTER_MGR` | 1 |
| `ROLE_SYSOPS` | 16 |
| `ROLE_TREASURY_MANAGER` | 1 |
| `ROLE_VET` | 5 |
| `ROLE_WAREHOUSE_MASTER_MGR` | 1 |
| `ROLE_WMS_MGR` | 10 |
| `ROLE_WMS_OP` | 2 |
| `ROLE_WORKFLOW_ADMIN` | 2 |

## 3. 仅 DB 有（动态新增 / 自定义角色）

共 38 个角色、308 个权限单元在 DB 但不在静态矩阵。
这是 MenuGuard 静态查询拒绝它们的原因（如 ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR）。
迁 DB 后这些角色将自动得到正确响应。

| 角色 | menu 数 | 类型推断 |
|---|---|---|
| `ROLE_ADMIN` | 13 | 未知 |
| `ROLE_B2B_MGR` | 10 | 未知 |
| `ROLE_BU_AGRI_GM` | 8 | 未知 |
| `ROLE_BU_FOOD_GM` | 4 | 未知 |
| `ROLE_CASH` | 1 | 未知 |
| `ROLE_CASHIER` | 6 | 未知 |
| `ROLE_CEO` | 38 | 未知 |
| `ROLE_CUSTOMER_B2B` | 2 | 未知 |
| `ROLE_DRIVER` | 2 | 未知 |
| `ROLE_FACTORY_MGR` | 6 | 未知 |
| `ROLE_FARMER` | 5 | 未知 |
| `ROLE_FARM_MGR` | 17 | 未知 |
| `ROLE_FIN_ACCT` | 10 | 未知 |
| `ROLE_FIN_AR` | 6 | 未知 |
| `ROLE_FIN_CFO` | 10 | 未知 |
| `ROLE_FIN_COST` | 5 | 未知 |
| `ROLE_HQ_FINANCE` | 5 | 未知 |
| `ROLE_HR_MANAGER` | 6 | 未知 |
| `ROLE_LINE_SUPERVISOR` | 1 | 未知 |
| `ROLE_LOG_MGR` | 9 | 未知 |
| `ROLE_MASTER_DATA_ADMIN` | 4 | 自定义/扩展 |
| `ROLE_MASTER_DATA_APPROVER` | 4 | 自定义/扩展 |
| `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR` | 24 | 自定义/扩展 |
| `ROLE_PDA_OP` | 3 | 未知 |
| `ROLE_PKG_MGR` | 10 | 未知 |
| `ROLE_PKG_OP` | 7 | 未知 |
| `ROLE_PRC_BUYER` | 4 | 未知 |
| `ROLE_PRODUCT_MASTER_MGR` | 4 | 未知 |
| `ROLE_QA_MGR` | 13 | 未知 |
| `ROLE_QA_STAFF` | 5 | 未知 |
| `ROLE_REGION_MGR` | 5 | 未知 |
| `ROLE_SALES_MGR` | 8 | 未知 |
| `ROLE_SALES_REP` | 8 | 未知 |
| `ROLE_STORE_MGR` | 12 | 未知 |
| `ROLE_VET` | 11 | 未知 |
| `ROLE_WH_CLERK` | 5 | 未知 |
| `ROLE_WMS_MGR` | 10 | 未知 |
| `ROLE_WMS_OP` | 7 | 未知 |

## 4. 权限冲突（双方都有但 codes 不同）

共 54 处冲突。
**关键发现**：冲突项大部分是 DB 比矩阵更精细（业务方实际治理痕迹）。
例 `ROLE_HQ_FINANCE MENU_FIN2_CASH`：矩阵 V,X / DB C,E,V,X — DB 加了 C,E 赋权。
又如 `ROLE_FARM_MGR MENU_BREEDING`：矩阵 A,C,D,E,V,X / DB C,E,V — DB 收紧了。

**修正策略**：以 **DB 为权威**，冲突保留 DB；矩阵 only 部分 INSERT 补齐缺口。
（之前我以为矩阵是真相 → 错。DB 才是业务方手动治理过的真相）

| 角色 | menu | 静态矩阵 | DB |
|---|---|---|---|
| `ROLE_ADMIN` | `MENU_MD_DICT_CENTER` | C,D,E,V,X | A,C,D,E,V,X |
| `ROLE_ADMIN` | `MENU_MD_QUALITY` | V,X | A,C,D,E,V,X |
| `ROLE_ADMIN` | `MENU_MD_AUDIT` | V,X | A,C,D,E,V,X |
| `ROLE_FARM_MGR` | `MENU_BREEDING` | A,C,D,E,V,X | C,E,V |
| `ROLE_FARM_MGR` | `MENU_FARM_DAILY` | A,C,D,E,V | C,E,V,X |
| `ROLE_FARM_MGR` | `MENU_WMS_VIEW` | V,X | V |
| `ROLE_FARM_MGR` | `MENU_WORKFLOW` | A,V | V |
| `ROLE_FARM_MGR` | `MENU_FARM_VET` | A,C,D,E,V,X | E,V |
| `ROLE_FARM_MGR` | `MENU_DEVICE_MONITOR` | E,V,X | V |
| `ROLE_FARM_MGR` | `MENU_PKG_OP` | C,E,V,X | V |
| `ROLE_FARM_MGR` | `MENU_QA_OP` | C,E,V,X | V |
| `ROLE_VET` | `MENU_QA_OP` | C,E,V | V |
| `ROLE_CEO` | `MENU_FARM_DAILY` | V | V,X |
| `ROLE_CEO` | `MENU_ORG_VIEW` | V | V,X |
| `ROLE_CEO` | `MENU_ORG_USER_SCOPE` | V | V,X |
| `ROLE_CEO` | `MENU_WORKFLOW` | A,V,X | A,C,D,E,V,X |
| `ROLE_CEO` | `MENU_FARM_VET` | V,X | V |
| `ROLE_REGION_MGR` | `MENU_WMS_VIEW` | V,X | V |
| `ROLE_REGION_MGR` | `MENU_STORE_MGR` | V,X | E,V |
| `ROLE_REGION_MGR` | `MENU_B2B_SALE` | V,X | E,V,X |
| `ROLE_WMS_MGR` | `MENU_WMS_VIEW` | A,C,D,E,V,X | V,X |
| `ROLE_WMS_MGR` | `MENU_WMS_INOUT` | A,C,D,E,V,X | C,E,V,X |
| `ROLE_WMS_MGR` | `MENU_WMS_MASTER` | C,D,E,V,X | C,E,V |
| `ROLE_WMS_MGR` | `MENU_ORDER_WH` | C,D,E,V | E,V |
| `ROLE_QA_MGR` | `MENU_QA_OP` | A,C,E,V | V,X |
| `ROLE_QA_MGR` | `MENU_QA_MGR` | A,C,D,E,V | A,C,E,V,X |
| `ROLE_PKG_MGR` | `MENU_PACKAGING` | A,C,D,E,V | C,E,V |
| `ROLE_PKG_MGR` | `MENU_PKG_OP` | C,E,V | V,X |
| `ROLE_PKG_MGR` | `MENU_PKG_MGR` | A,C,D,E,V | C,E,V,X |
| `ROLE_FACTORY_MGR` | `MENU_PKG_OP` | C,E,V | A,C,E,V |
| `ROLE_FACTORY_MGR` | `MENU_QA_OP` | C,E,V | A,C,E,V |
| `ROLE_WMS_OP` | `MENU_WMS_INOUT` | C,E,V | C,V |
| `ROLE_FIN_ACCT` | `MENU_FIN2_EXPENSE` | V,X | C,E,V |
| `ROLE_FIN_ACCT` | `MENU_WORKFLOW` | A,V,X | V,X |
| `ROLE_FIN_ACCT` | `MENU_ORDER_FIN` | V,X | C,E,V |
| `ROLE_BU_AGRI_GM` | `MENU_WMS_VIEW` | V,X | A,V,X |
| `ROLE_BU_FOOD_GM` | `MENU_WMS_VIEW` | V,X | A,V,X |
| `ROLE_CASHIER` | `MENU_STORE_MGR` | C,V | V |
| `ROLE_FIN_CFO` | `MENU_WORKFLOW` | A,V,X | A,C,D,E,V,X |
| `ROLE_FIN_CFO` | `MENU_DASHBOARD` | V,X | V |
| `ROLE_FIN_CFO` | `MENU_ORDER_FIN` | A,V,X | V,X |
| `ROLE_LOG_MGR` | `MENU_LOGISTICS` | C,D,E,V,X | C,E,V,X |
| `ROLE_LOG_MGR` | `MENU_LOGISTICS_MASTER` | C,D,E,V | C,E,V |
| `ROLE_LOG_MGR` | `MENU_SALES2` | C,E,V | V |
| `ROLE_FIN_AR` | `MENU_FIN2` | C,E,V | V |
| `ROLE_STORE_MGR` | `MENU_WORKFLOW` | A,V | V |
| `ROLE_STORE_MGR` | `MENU_STORE_MGR` | C,D,E,V,X | C,E,V,X |
| `ROLE_STORE_MGR` | `MENU_STORE_POS` | A,C,D,E,V,X | C,E,V |
| `ROLE_HQ_FINANCE` | `MENU_FIN2_CASH` | V,X | C,E,V,X |
| `ROLE_HQ_FINANCE` | `MENU_FIN2_EXPENSE` | A,V,X | A,C,E,V,X |
| `ROLE_HQ_FINANCE` | `MENU_DASHBOARD` | V,X | V |
| `ROLE_SALES_MGR` | `MENU_DASHBOARD` | V,X | V |
| `ROLE_DRIVER` | `MENU_SALES2_DELIVERY` | C,E,V | E,V |
| `ROLE_CASH` | `MENU_FIN2_CASH` | E,V | C,E,V |

## 5. 详细缺失清单（仅静态矩阵有）

seed migration 将照此清单 INSERT 进 sys_role_menu_permission。

### `ROLE_ADMIN`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | A,C,D,E,V,X |
| `MENU_APPROVAL` | A,C,D,E,V,X |
| `MENU_B2B_SALE` | A,C,D,E,V,X |
| `MENU_BREEDING` | A,C,D,E,V,X |
| `MENU_BU_AGRI_OVERVIEW` | A,C,D,E,V,X |
| `MENU_BU_FOOD_OVERVIEW` | A,C,D,E,V,X |
| `MENU_CRM` | A,C,D,E,V,X |
| `MENU_DASHBOARD` | A,C,D,E,V,X |
| `MENU_DEVICE_MONITOR` | A,C,D,E,V,X |
| `MENU_FARM_DAILY` | A,C,D,E,V,X |
| `MENU_FARM_DATA` | A,C,D,E,V,X |
| `MENU_FARM_VET` | A,C,D,E,V,X |
| `MENU_FIN2_REIMBURSE` | A,C,D,E,V,X |
| `MENU_FINANCE` | A,C,D,E,V,X |
| `MENU_FIN_AUDIT` | V,X |
| `MENU_FIN_CLOSE` | A,C,D,E,V,X |
| `MENU_INVENTORY` | A,C,D,E,V,X |
| `MENU_IOT` | A,C,D,E,V,X |
| `MENU_LOGISTICS` | A,C,D,E,V,X |
| `MENU_LOGISTICS_MASTER` | A,C,D,E,V,X |
| `MENU_MASTER` | A,C,D,E,V,X |
| `MENU_MASTER_GRADE` | A,C,D,E,V,X |
| `MENU_MASTER_PACKAGING` | A,C,D,E,V,X |
| `MENU_MASTER_PRODUCT` | A,C,D,E,V,X |
| `MENU_MASTER_SKU` | A,C,D,E,V,X |
| `MENU_ORDERS` | A,C,D,E,V,X |
| `MENU_ORDER_FIN` | A,C,D,E,V,X |
| `MENU_ORDER_MGR` | A,C,D,E,V,X |
| `MENU_ORDER_WH` | A,C,D,E,V,X |
| `MENU_PACKAGING` | A,C,D,E,V,X |
| `MENU_PDA` | A,C,D,E,V,X |
| `MENU_PKG_MGR` | A,C,D,E,V,X |
| `MENU_PKG_OP` | A,C,D,E,V,X |
| `MENU_POS` | A,C,D,E,V,X |
| `MENU_PRC_MASTER` | A,C,D,E,V,X |
| `MENU_PRC_MGR` | A,C,D,E,V,X |
| `MENU_PROCUREMENT` | A,C,D,E,V,X |
| `MENU_QA` | A,C,D,E,V,X |
| `MENU_QA_MASTER` | A,C,D,E,V,X |
| `MENU_QA_MGR` | A,C,D,E,V,X |
| `MENU_QA_OP` | A,C,D,E,V,X |
| `MENU_SETTINGS_DATA` | A,C,D,E,V,X |
| `MENU_SETTINGS_IT` | A,C,D,E,V,X |
| `MENU_SETTINGS_USER` | A,C,D,E,V,X |
| `MENU_STORE` | A,C,D,E,V,X |
| `MENU_STORE_MGR` | A,C,D,E,V,X |
| `MENU_STORE_POS` | A,C,D,E,V,X |
| `MENU_SYSTEM` | A,C,D,E,V,X |
| `MENU_SYS_CONFIG` | A,C,D,E,V,X |
| `MENU_SYS_MONITOR` | A,C,D,E,V,X |
| `MENU_UAT` | A,C,D,E,V,X |
| `MENU_USERS` | A,C,D,E,V,X |
| `MENU_WMS` | A,C,D,E,V,X |
| `MENU_WMS_INBOUND` | A,C,D,E,V,X |
| `MENU_WMS_INOUT` | A,C,D,E,V,X |
| `MENU_WMS_MASTER` | A,C,D,E,V,X |
| `MENU_WMS_OUTBOUND` | A,C,D,E,V,X |
| `MENU_WMS_VIEW` | A,C,D,E,V,X |

### `ROLE_AUDITOR`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | V,X |
| `MENU_APPROVAL` | V,X |
| `MENU_B2B_SALE` | V,X |
| `MENU_DASHBOARD` | V,X |
| `MENU_FIN2` | V,X |
| `MENU_FIN2_AP` | V,X |
| `MENU_FIN2_AR` | V,X |
| `MENU_FIN2_BUDGET` | V,X |
| `MENU_FIN2_CASH` | V,X |
| `MENU_FIN2_EXPENSE` | V,X |
| `MENU_FIN2_REIMBURSE` | V,X |
| `MENU_FIN2_REPORT` | V,X |
| `MENU_FIN2_SHAREHOLDER` | V,X |
| `MENU_FINANCE` | V,X |
| `MENU_FIN_AUDIT` | V,X |
| `MENU_INV_BATCH` | V,X |
| `MENU_INV_LEDGER` | V,X |
| `MENU_INV_SOURCE_MODE` | V,X |
| `MENU_MASTER_GRADE` | V,X |
| `MENU_MASTER_PACKAGING` | V,X |
| `MENU_MASTER_PRODUCT` | V,X |
| `MENU_MASTER_SKU` | V,X |
| `MENU_MD_AUDIT` | V,X |
| `MENU_MOBILE_DELIVERY` | V,X |
| `MENU_QA` | V,X |
| `MENU_QA_MGR` | V,X |
| `MENU_QA_OP` | V,X |
| `MENU_SALES2` | V,X |
| `MENU_SALES2_CHANNEL` | V,X |
| `MENU_SALES2_CREDIT` | V,X |
| `MENU_SALES2_CUSTOMER` | V,X |
| `MENU_SALES2_DELIVERY` | V,X |
| `MENU_SALES2_INVENTORY` | V,X |
| `MENU_SALES2_ORDER` | V,X |
| `MENU_SALES2_PRICE` | V,X |
| `MENU_SALES2_REPORT` | V,X |
| `MENU_SALES2_RETURN` | V |
| `MENU_SHAREHOLDER_CAPITAL` | V,X |
| `MENU_SHAREHOLDER_CONTRIBUTION` | V,X |
| `MENU_SHAREHOLDER_DASHBOARD` | V,X |
| `MENU_SHAREHOLDER_MANAGE` | V,X |
| `MENU_SHAREHOLDER_SCOPE` | V |
| `MENU_SHAREHOLDER_VIEW` | V,X |
| `MENU_STORE_POS` | V,X |
| `MENU_TRACEABILITY_VIEW` | V,X |
| `MENU_UAT` | V,X |
| `MENU_WMS_VIEW` | V,X |
| `MENU_WORKFLOW` | V,X |

### `ROLE_B2B_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |

### `ROLE_BU_AGRI_GM`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_BU_AGRI_OVERVIEW` | A,C,E,V,X |

### `ROLE_BU_FOOD_GM`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_BU_FOOD_OVERVIEW` | A,C,E,V,X |

### `ROLE_CASH`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_REIMBURSE` | E,V |

### `ROLE_CASHIER`

| menu_code | perm_codes |
|---|---|
| `MENU_CRM` | C,V |
| `MENU_FINANCE` | C,V |
| `MENU_FIN_CLOSE` | C,V |
| `MENU_ORDERS` | C,E,V |
| `MENU_ORDER_MGR` | C,E,V |
| `MENU_PDA` | V |
| `MENU_POS` | C,E,V |
| `MENU_STORE` | C,V |

### `ROLE_CEO`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | V,X |
| `MENU_BREEDING` | V,X |
| `MENU_BU_AGRI_OVERVIEW` | V,X |
| `MENU_BU_FOOD_OVERVIEW` | V,X |
| `MENU_FIN2_REIMBURSE` | A,V,X |
| `MENU_FINANCE` | A,V,X |
| `MENU_INVENTORY` | V,X |
| `MENU_INV_BATCH` | V,X |
| `MENU_INV_LEDGER` | V,X |
| `MENU_IOT` | V |
| `MENU_MASTER_DATA` | V,X |
| `MENU_MASTER_PRODUCT` | V,X |
| `MENU_MASTER_SKU` | V,X |
| `MENU_MD_QUALITY` | V,X |
| `MENU_PKG_PACKAGING` | V,X |
| `MENU_PROCUREMENT` | A,V,X |
| `MENU_PROD_COLLECTION` | V,X |
| `MENU_PROD_INBOUND` | V,X |
| `MENU_QA` | V,X |
| `MENU_STORE_POS` | V,X |
| `MENU_UAT` | V,X |

### `ROLE_CUSTOMER_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |

### `ROLE_FACTORY_ACCT`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2` | C,E,V,X |
| `MENU_FIN2_AP` | C,E,V,X |
| `MENU_FIN2_AR` | C,E,V,X |
| `MENU_FIN2_CASH` | C,V,X |
| `MENU_FIN2_EXPENSE` | C,E,V,X |
| `MENU_FIN2_REIMBURSE` | C,E,V,X |
| `MENU_PRC2_DASHBOARD` | V |
| `MENU_PRC2_MASTER` | V |
| `MENU_PRC2_ORDER` | V |
| `MENU_PRC2_PROJECT` | V |
| `MENU_PRC2_RECEIPT` | V |
| `MENU_PRC2_REQUEST` | V |
| `MENU_PRC2_SHIPMENT` | V |
| `MENU_PRC2_SUPPLIER` | V |

### `ROLE_FACTORY_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_FARM_DAILY` | A,C,D,E,V |
| `MENU_PACKAGING` | A,C,E,V |
| `MENU_PROD_COLLECTION` | C,E,V |
| `MENU_WMS_INOUT` | C,E,V |

### `ROLE_FARMER`

| menu_code | perm_codes |
|---|---|
| `MENU_IOT` | V |
| `MENU_PACKAGING` | C,E,V |
| `MENU_PDA` | C,V |
| `MENU_PKG_OP` | C,E,V |
| `MENU_PROD_COLLECTION` | C,V |

### `ROLE_FARM_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |

### `ROLE_FARM_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | V |
| `MENU_FIN2_REIMBURSE` | C,V |
| `MENU_FINANCE` | C |
| `MENU_INVENTORY` | C,V,X |
| `MENU_IOT` | E,V,X |
| `MENU_MASTER` | V |
| `MENU_ORDER_WH` | C,V |
| `MENU_PACKAGING` | C,E,V,X |
| `MENU_PDA` | C,V |
| `MENU_PKG_MGR` | A,C,D,E,V,X |
| `MENU_PKG_PACKAGING` | C,E,V |
| `MENU_PRC_MASTER` | V |
| `MENU_PROCUREMENT` | C,V |
| `MENU_QA` | C,E,V,X |
| `MENU_QA_MASTER` | C,E,V |
| `MENU_QA_MGR` | A,C,D,E,V,X |
| `MENU_WMS` | C,V |
| `MENU_WMS_INBOUND` | C,V |
| `MENU_WMS_INOUT` | C,E,V |
| `MENU_WMS_OUTBOUND` | C,V |

### `ROLE_FINANCE_REVIEW_MANAGER`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_REIMBURSE` | A,V,X |

### `ROLE_FIN_ACCOUNT_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |
| `MENU_MD_BANK_ACCOUNT` | C,E,V,X |

### `ROLE_FIN_ACCT`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_REIMBURSE` | V,X |
| `MENU_FINANCE` | C,E,V,X |
| `MENU_INVENTORY` | V,X |
| `MENU_ORDERS` | V,X |
| `MENU_PROCUREMENT` | V,X |
| `MENU_SHAREHOLDER_MANAGE` | V |
| `MENU_STORE` | V,X |
| `MENU_STORE_MGR` | V,X |
| `MENU_WMS_VIEW` | V,X |

### `ROLE_FIN_AR`

| menu_code | perm_codes |
|---|---|
| `MENU_FINANCE` | C,V,X |

### `ROLE_FIN_CFO`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | V,X |
| `MENU_FIN2_REIMBURSE` | A,C,E,V,X |
| `MENU_FINANCE` | A,C,E,V,X |
| `MENU_MD_BANK_ACCOUNT` | A,V,X |
| `MENU_PROCUREMENT` | A,V,X |
| `MENU_SHAREHOLDER_DASHBOARD` | V,X |
| `MENU_TRACEABILITY_VIEW` | V,X |
| `MENU_UAT` | V,X |

### `ROLE_GROUP_FINANCE`

| menu_code | perm_codes |
|---|---|
| `MENU_SHAREHOLDER_CAPITAL` | A,V,X |

### `ROLE_HQ_FINANCE`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_REIMBURSE` | A,V,X |
| `MENU_MASTER_GRADE` | V,X |
| `MENU_MASTER_PACKAGING` | V,X |
| `MENU_MASTER_PRODUCT` | V,X |
| `MENU_MASTER_SKU` | V,X |
| `MENU_MD_QUALITY` | V,X |
| `MENU_STORE_POS` | V,X |
| `MENU_UAT` | V |

### `ROLE_HQ_OPS`

| menu_code | perm_codes |
|---|---|
| `MENU_MOBILE_DELIVERY` | V,X |

### `ROLE_HR_ADMIN`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER` | C,E,V |
| `MENU_ORG_MANAGE` | C,D,E,V |
| `MENU_ORG_USER_SCOPE` | C,E,V,X |
| `MENU_ORG_VIEW` | C,D,E,V |
| `MENU_SETTINGS_USER` | C,D,E,V |
| `MENU_SYSTEM` | C,E,V |
| `MENU_SYS_ORG` | C,D,E,V |
| `MENU_USERS` | C,D,E,V |

### `ROLE_MASTER_DATA_ADMIN`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | A,C,E,V,X |
| `MENU_MD_AUDIT` | V,X |
| `MENU_MD_BANK_ACCOUNT` | C,E,V,X |
| `MENU_MD_DICT_CENTER` | C,E,V,X |
| `MENU_MD_QUALITY` | V,X |

### `ROLE_MASTER_DATA_APPROVER`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | A,V,X |

### `ROLE_PKG_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |

### `ROLE_PKG_OPERATOR`

| menu_code | perm_codes |
|---|---|
| `MENU_PACKAGING` | C,E,V |

### `ROLE_PRC_BUYER`

| menu_code | perm_codes |
|---|---|
| `MENU_PROCUREMENT` | C,D,E,V,X |

### `ROLE_PRODUCT_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |

### `ROLE_PRODUCT_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_GRADE` | C,D,E,V,X |
| `MENU_MASTER_PACKAGING` | C,D,E,V,X |
| `MENU_MASTER_PRODUCT` | C,D,E,V,X |
| `MENU_MASTER_SKU` | C,D,E,V,X |

### `ROLE_PROJECT_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_PRC2_DASHBOARD` | V |
| `MENU_PRC2_MASTER` | C,E,V |
| `MENU_PRC2_ORDER` | C,E,V |
| `MENU_PRC2_PROJECT` | C,E,V |
| `MENU_PRC2_RECEIPT` | C,E,V |
| `MENU_PRC2_REQUEST` | C,E,V |
| `MENU_PRC2_SHIPMENT` | C,E,V |
| `MENU_PRC2_SUPPLIER` | V |
| `MENU_WORKFLOW` | A,V |

### `ROLE_QA_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_FARM_DAILY` | V |
| `MENU_TRACEABILITY_EXPORT` | V,X |

### `ROLE_QA_STAFF`

| menu_code | perm_codes |
|---|---|
| `MENU_FARM_DAILY` | V |
| `MENU_TRACEABILITY_VIEW` | V |

### `ROLE_QC_INSPECTOR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_GRADE` | V |

### `ROLE_REGION_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_ANALYTICS` | V,X |
| `MENU_BREEDING` | V,X |
| `MENU_CRM` | V,X |
| `MENU_DEVICE_MONITOR` | V |
| `MENU_FARM_DAILY` | V |
| `MENU_FARM_VET` | V,X |
| `MENU_FINANCE` | V,X |
| `MENU_INVENTORY` | V,X |
| `MENU_IOT` | V |
| `MENU_LOGISTICS_MASTER` | V |
| `MENU_MASTER_PRODUCT` | V |
| `MENU_MASTER_SKU` | V |
| `MENU_MOBILE_DELIVERY` | V,X |
| `MENU_ORDERS` | A,V,X |
| `MENU_POS` | V,X |
| `MENU_QA` | V,X |
| `MENU_QA_MASTER` | V |
| `MENU_QA_MGR` | V,X |
| `MENU_QA_OP` | V,X |
| `MENU_STORE` | V,X |
| `MENU_STORE_POS` | V,X |
| `MENU_WMS` | V,X |
| `MENU_WMS_INBOUND` | V,X |
| `MENU_WMS_INOUT` | V,X |
| `MENU_WMS_MASTER` | V,X |
| `MENU_WMS_OUTBOUND` | V,X |

### `ROLE_SALES_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_B2B_SALE` | A,C,D,E,V,X |
| `MENU_MOBILE_DELIVERY` | A,C,D,E,V,X |
| `MENU_UAT` | C,E,V |

### `ROLE_SALES_REP`

| menu_code | perm_codes |
|---|---|
| `MENU_ORDERS` | C,V |

### `ROLE_SHAREHOLDER_FINANCE`

| menu_code | perm_codes |
|---|---|
| `MENU_SHAREHOLDER_DASHBOARD` | V,X |

### `ROLE_SHAREHOLDER_VIEW`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_SHAREHOLDER` | V |
| `MENU_PRC2_FUND` | V |
| `MENU_SHAREHOLDER_DASHBOARD` | V,X |

### `ROLE_STORE_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_B2B_SALE` | V |
| `MENU_CRM` | C,E,V |
| `MENU_FIN2_REIMBURSE` | C,V |
| `MENU_FINANCE` | C,V |
| `MENU_MASTER` | V |
| `MENU_ORDERS` | C,D,E,V,X |
| `MENU_ORG_VIEW` | V |
| `MENU_POS` | C,D,E,V,X |
| `MENU_STORE` | C,D,E,V,X |

### `ROLE_SUPPLIER_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |

### `ROLE_SYSOPS`

| menu_code | perm_codes |
|---|---|
| `MENU_DEVICE_MONITOR` | C,D,E,V |
| `MENU_IOT` | C,D,E,V |
| `MENU_MASTER` | C,D,E,V |
| `MENU_ORG_MANAGE` | C,E,V |
| `MENU_ORG_USER_SCOPE` | C,E,V |
| `MENU_ORG_VIEW` | C,E,V |
| `MENU_SETTINGS_DATA` | C,D,E,V |
| `MENU_SETTINGS_IT` | C,D,E,V |
| `MENU_SETTINGS_USER` | C,E,V |
| `MENU_SYSTEM` | C,D,E,V |
| `MENU_SYS_CONFIG` | E,V |
| `MENU_SYS_MONITOR` | A,V |
| `MENU_SYS_ORG` | C,E,V |
| `MENU_UAT` | A,C,E,V |
| `MENU_USERS` | C,E,V |
| `MENU_WORKFLOW` | A,V |

### `ROLE_TREASURY_MANAGER`

| menu_code | perm_codes |
|---|---|
| `MENU_FIN2_REIMBURSE` | E,V |

### `ROLE_VET`

| menu_code | perm_codes |
|---|---|
| `MENU_APPROVAL` | A,V |
| `MENU_FARM_DAILY` | C,E,V |
| `MENU_QA` | C,E,V |
| `MENU_QA_MASTER` | C,E,V |
| `MENU_QA_MGR` | C,E,V |

### `ROLE_WAREHOUSE_MASTER_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_MASTER_DATA` | C,E,V |

### `ROLE_WMS_MGR`

| menu_code | perm_codes |
|---|---|
| `MENU_FARM_DATA` | V |
| `MENU_INVENTORY` | A,C,D,E,V,X |
| `MENU_PACKAGING` | C,V |
| `MENU_PDA` | C,D,E,V |
| `MENU_PKG_MGR` | C,E,V |
| `MENU_PKG_OP` | C,V |
| `MENU_WMS` | A,C,D,E,V,X |
| `MENU_WMS_INBOUND` | A,C,D,E,V,X |
| `MENU_WMS_OUTBOUND` | A,C,D,E,V,X |
| `MENU_WORKFLOW` | A,V |

### `ROLE_WMS_OP`

| menu_code | perm_codes |
|---|---|
| `MENU_INV_BATCH` | V |
| `MENU_INV_MANUAL_INBOUND` | C,V |

### `ROLE_WORKFLOW_ADMIN`

| menu_code | perm_codes |
|---|---|
| `MENU_UAT` | C,E,V |
| `MENU_WORKFLOW` | A,C,D,E,V,X |

## 6. 决策建议

### 6.1 迁移策略（修正后 — DB 优先）

1. **DB 为权威，矩阵补缺**：
   - 第 2 节 matrix only → INSERT 进 DB（NOT EXISTS 兜底）
   - 第 3 节 DB only → 保留不动（自定义角色 + 业务方加的菜单）
   - 第 4 节冲突项 → **保留 DB 值**（业务方实际治理痕迹比矩阵更可信）
3. **改造 MenuGuard**：
   - 删除 `hasMenuPermission(userRoles, ...)` 调用
   - 只保留 JWT.permissions 字符串检查（今天已加的 fallback 升级为主路径）
   - `isMenuRegistered` 改成查启动期缓存的 sys_menu 表
4. **`rbac.matrix.ts` 标 deprecated**
   - 文件保留作为初始化 seed 源头（开发者本地新建环境用）
   - 不再被 MenuGuard 引用

### 6.2 风险与回滚

- **风险**：seed migration 跑错会让所有用户失去权限。
  - 缓解：先在本地 / staging DB 跑一遍，跑通 scripts 再上生产。
  - 回滚 SQL：先 SELECT ... INTO backup_sys_role_menu_permission 备份。
- **风险**：MenuGuard 改造后老角色登录的旧 JWT 仍然有效但 perms_version 已变。
  - 缓解：seed migration 触发 perms_version+1，老 JWT 自动失效，用户被迫重登。

### 6.3 后续

- 完成 G5-A 后，G5-B（lookup endpoint 范式化）才能稳定改 selectors（不用担心 MENU 守卫错配）
- G5-C 自动化巡检需要全量 sys_role_menu_permission 作为真相基线
- G5-D Scope 类型化与 RBAC 解耦，可独立推进

---

生成自 `scripts/g5a-rbac-audit.mjs`；数据源 `rbac.matrix.ts` + `/tmp/g5a_db_perms.psv`。