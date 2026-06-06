# G5-D · Scope 类型化拆分（部分实施 + 完整 plan）

完成时间：2026-06-06

## 1. 现状审计

### 1.1 已有的好基础

`DataScopeService.DataScopeContext` 接口已经有相对完整的维度拆分：

```ts
interface DataScopeContext {
  isGlobal: boolean;
  scopeLevel: 'SELF' | 'PROJECT' | 'COMPANY' | 'REGION' | 'GROUP';
  allowedCompanyCodes: string[];
  allowedProjectCodes: string[];
  allowedWarehouseCodes: string[];
  allowedFarmCodes: string[]; // G4-E
  userId: string;
}
```

**注入方式**：`DataScopeGuard` 在 controller 装好后，将 `DataScopeContext` 写入 CLS，service 层通过 `cls.get('dataScope')` 读取做行级过滤。

### 1.2 缺失

| 缺失 | 影响 |
|---|---|
| **`allowedSiteCodes`**（SITE 维度） | 业务录入用户绑 SITE（如孟赛 `SITE-MENGSAI-LAYER`）后，其 SITE 范围未被 DataScope 加载 |
| **`generic-crud.controller`** 行级过滤不读 DataScope | 仍用旧 `req.user.storeCode` 二选一逻辑，与 DataScope 双轨 |
| **storeCode 在 JWT 是 string** | 语义模糊（既可能是公司、SITE、也可能是 ALL）；类型化要求拆为 `companyCodes/siteCodes/...` |

## 2. 本期实施（最小可行）

### 2.1 DataScopeContext 加 `allowedSiteCodes`

`apps/api/src/modules/org/services/data-scope.service.ts`：

- 接口扩列 `allowedSiteCodes: string[]`
- 解析逻辑：`sys_user_orgs` JOIN `sys_organizations` 加查 `org_type` 和 `site_code` 字段
- 当用户绑定的 org 是 `SITE` 类型时，`siteCodes.add(org_code)`（如 `SITE-MENGSAI-LAYER`）
- 兼容老字段：`sys_organizations.site_code` 列若已填，也加入

### 2.2 影响

- 现有 controller 仍可正常工作（多了个字段，没人读不破坏）
- 后续接入 `allowedSiteCodes` 行级过滤的 controller 可读到了 SITE 维度

## 3. 留待 G5-D++（未实施，需要专门 sprint）

### 3.1 generic-crud.controller 切到 DataScope

当前 `apps/api/src/modules/generic-crud/generic-crud.controller.ts` 行级过滤逻辑：

```ts
// 旧：基于 storeCode 字段二选一
const scopeField = table.startsWith('brd_') ? 'farm_code' : 'store_code';
const effectiveQuery = isGlobal ? query : { ...query, [scopeField]: userStoreCode };
```

应改为：

```ts
const ds = this.cls.get('dataScope'); // 注入 DataScopeContext
const filter = buildScopeFilter(table, ds); // 表 → 维度映射
const effectiveQuery = isGlobal ? query : { ...query, ...filter };
```

`buildScopeFilter` 按表 schema 拼 IN 子句：
- `brd_*` → `site_code IN (...)` 或 `farm_code IN (...)`
- `fin_*` → `company_code IN (...)`
- `inv_*` → `warehouse_code IN (...)` + `site_code IN (...)`
- `wms_*` → `warehouse_code IN (...)`
- 等等

工作量：~15 个 controller 各加 `DataScopeGuard` + 切过滤逻辑，含真测试覆盖 4-6h。

### 3.2 JWT.storeCode 拆分（前端兼容）

`storeCode: string` → `userScope: { companyCodes, siteCodes, farmCodes }`

需同步：
- `auth.service` 登录时输出新结构
- 前端 sessionStorage 解析层兼容老 storeCode
- 全部 selectors 已通过 G5-B lookup endpoint 隔离，前端改动小

### 3.3 业务行级隔离的真测试

`scripts/g5d-scope-audit.sh`：

- 用宋明光 token 调 `/api/crud/brd_daily_logs` → 应只返孟赛 SITE 行
- 用 ROLE_FARM_MGR (storeCode='ALL') 调 → 应全返
- 跨站点访问被拒（如孟赛角色去调东鹏数据应 403/空）

## 4. 影响面（本期实施）

- 现有用户：无任何行为变化（多个字段没人读）
- 业务录入用户（如宋明光）：`allowedSiteCodes` 已加载，下一个用此字段的 controller 即得益

## 5. 后续 Roadmap

```
G5-D    (今天)：DataScope 加 siteCodes 维度 ✅
G5-D-1  (1 周内)：generic-crud 切到 DataScopeContext + buildScopeFilter
G5-D-2  (1 周内)：scripts/g5d-scope-audit.sh + CI 集成
G5-D-3  (2 周内)：JWT.storeCode → userScope 强类型，前端兼容层
G5-E    (与 D 解耦)：/master/farms 等主数据维护页加页面级 perm 守卫
```

---

**Tag**：`v3-g5-d-scope-typed`
**改动**：`apps/api/src/modules/org/services/data-scope.service.ts`
**未实施**：generic-crud 行级过滤改造、JWT 拆分（留 G5-D++）
