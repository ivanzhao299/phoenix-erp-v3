# G5-B · Lookup endpoint 范式化报告

完成时间：2026-06-06

## 1. 目标

业务录入页面（生产端 / 移动端）常用的"基础数据下拉"统一走 `/api/lookup/*`：
- **不绑 MENU 权限**（仅 JWT 校验），让业务录入用户能拉到主数据
- **统一字段命名**（camelCase 输出）
- **支持 query 过滤**（companyCode / farmCode 等），减少前端 client-side filter

## 2. 改动概览

### 2.1 后端 LookupController 新增 10 个端点

| Endpoint | 来源表 | 替代 |
|---|---|---|
| `GET /api/lookup/customers` | sal_customers | `/master-data/runtime/customer/active` |
| `GET /api/lookup/suppliers` | prc2_suppliers | `/master-data/runtime/supplier/active` |
| `GET /api/lookup/users` | sys_user | `/users`（需 MENU_USER_MGR） |
| `GET /api/lookup/warehouses?companyCode=` | wms_warehouses | `/crud/wms_warehouses` |
| `GET /api/lookup/stores?companyCode=` | mst_stores | `/crud/mst_stores` |
| `GET /api/lookup/farms` | brd_farms | `/crud/brd_farms` |
| `GET /api/lookup/houses?farmCode=` | brd_houses | `/crud/brd_houses` |
| `GET /api/lookup/flocks?houseCode=&farmCode=` | brd_flocks | `/crud/brd_flocks` |
| `GET /api/lookup/cash-accounts?currency=` | fin_cash_accounts | `/v2/finance/cash/accounts` |
| `GET /api/lookup/dict/:dictType` | sys_dict | `/crud/sys_dict?dict_type=` |

加上 G5-B 之前已有的 5 个（product-grades / packaging-specs / companies / projects / sites）共 **15 个公开 lookup 端点**。

### 2.2 前端 selectors 切换

`apps/web/src/components/shared-selectors/MasterDataSelectors.tsx` 10 个 Selector 改 endpoint：

- `CustomerSelector` → `/lookup/customers`
- `SupplierSelector` → `/lookup/suppliers`
- `UserSelector` → `/lookup/users`
- `WarehouseSelector` → `/lookup/warehouses?companyCode=`
- `StoreSelector` → `/lookup/stores?companyCode=`
- `FarmSelector` → `/lookup/farms`
- `HouseSelector` → `/lookup/houses?farmCode=`
- `FlockSelector` → `/lookup/flocks?houseCode=&farmCode=`
- `CashAccountSelector` → `/lookup/cash-accounts?currency=`
- `CompanySelector` → `/lookup/companies`（G5-B 前已切）

字段命名统一改 camelCase（warehouseCode/houseCode/currentQty 等）。

### 2.3 未改动（保留旧路径，影响小）

- `ProjectSelector` — 走 `/biz/projects/active`（已是公开 endpoint，不必改）
- `ZoneSelector / LocationSelector` — 维度二级过滤；后续 G5-B++ 可加 `/lookup/zones?warehouseCode=` 等
- `ChannelSelector / DriverSelector / VehicleSelector` — 走 V2 Runtime 路径，业务上通常 admin/sales 操作不阻塞业务录入
- `ShareholderSelector` — 走 `/shareholders`，专属财务
- `SkuSelector / GradeSelector / SpecSelector` — 等级/规格已切 lookup；SKU 走 product-master/skus 暂保留
- `ShiftSelector` — 走 `/crud/sys_dict?dict_type=PKG_SHIFT`，可替换为 `/lookup/dict/PKG_SHIFT`（本期未改）

## 3. 跨阶段联动

- **依赖 G5-A**：MenuGuard 改纯动态后，本期前端切 endpoint 不再担心"老角色访问 lookup 仍 403"
- **服务于 G5-C**：后续巡检脚本可专门检查 `/api/lookup/*` 在非 ADMIN 用户下都返 200

## 4. 影响面

- 所有业务录入页面（日报、入库、采购、销售、财务等）下拉**对宋明光等业务录入用户开放**
- 无副作用：原 endpoint 保留，admin 后台业务不变；前端组件命名签名向后兼容
- 新增 10 个公开 endpoint 仅 read，无写操作；DataScope 仍由 service 层兜底（lookup 端点为下拉用，不主动按用户范围过滤 — 由消费方按需 query 维度）

## 5. 验证

- TS 双端 0 errors
- CI 跑 migration 不变（lookup 是代码改动，无 migration）
- 部署后 SSH curl admin token 测：
  - `/api/lookup/customers` → 200 + 11 行客户（GLP-1A-2 seed）
  - `/api/lookup/houses?farmCode=LPH_MENGSAI` → 200 + 6 行
  - `/api/lookup/dict/BRD_SHIFT` → 200 + 4 行（MORNING/EVENING/NIGHT/DAY）

---

**Tag**：`v3-g5-b-lookup-unified`
**Migration**：无（纯代码）
