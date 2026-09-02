# 新建销售订单公司下拉无数据：根因分析与修复设计

日期：2026-09-02

范围：只读分析；未修改业务代码、数据库、生产配置

线上现象：`admin` 与销售经理 `guodapeng` 在新建销售订单时公司下拉均无数据

## 1. 结论

确切破坏点是销售订单生命周期轮中的提交 `08c65377`（随后合入 merge revision `da4920c4`）：该提交从 `AppModule` 移除了全局 `AuditLogInterceptor`，但 `/api/lookup/companies` 仍只使用原生 `AuthGuard('jwt')`，并继续假定该 interceptor 会把 JWT 用户写入 CLS。

因此请求虽已通过 JWT，`LookupController.resolveCompanyScope()` 读取 `this.cls.get('user')` 时仍得到 `undefined`，立即 fail-closed 为非全局空范围；`companies()` 随后正常返回 `{ code: 200, data: [] }`。这解释了管理员与 `guodapeng` 同时为空：请求根本没有进入 `ROLE_ADMIN` 或用户组织绑定的 DataScope 计算。

这不是权限配置问题，也不是 `/api/org/organizations` 被 410 化：销售订单当前实际调用的是 `/api/lookup/companies`。V1-5 提交 `fb241b0c` 只改门店首页两个 locale key，与任何 selector、lookup 或 org 端点无关。

## 2. 证据链

### 2.1 前端实际请求链

1. 新建订单公司字段使用共享 `CompanySelector`：`apps/web/src/app/(admin)/sales2/orders/page.tsx:792-796`。
2. `CompanySelector` 请求 `/lookup/companies`，而不是 `/org/organizations`：`apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:141-150`。
3. 共享 API client 补 `/api` 前缀，实际 HTTP 路径为 `GET /api/lookup/companies`：`apps/web/src/lib/api-client.ts:10,100-109,121-133`。
4. `lookupArr()` 接受数组或 `{ data: [] }`：`MasterDataSelectors.tsx:29-37`；因此后端的 `{ code: 200, data: [] }` 会被当作一次成功的空结果，不会抛错。
5. 若请求本身失败，`ScopedSelect` 也会在 catch 中 `setOpts([])`；因 `CompanySelector` 未传 `errorMessage`，失败提示仍为空：`MasterDataSelectors.tsx:55-92`。这是独立存在的“吞错伪装空态”缺陷，但本次主路径无需异常即可产生空态。

### 2.2 后端断链

1. `LookupController` 类级 guard 是 `@UseGuards(AuthGuard('jwt'))`：`apps/api/src/modules/product-master/controllers/lookup.controller.ts:24-25`。原生 guard 只把用户放到 `request.user`，不会写入 CLS。
2. `resolveCompanyScope()` 明确从 `this.cls.get('user')` 读取用户；无用户时返回非全局空范围：`lookup.controller.ts:35-54`。
3. `companies()` 对非全局且无公司范围的情况直接返回 `{ code: 200, data: [] }`：`lookup.controller.ts:107-140`。
4. 管理员本应在 `DataScopeService.resolve()` 第一个分支得到 `isGlobal: true`：`apps/api/src/modules/org/services/data-scope.service.ts:79-105`；但 CLS 为空使调用在此之前就被短路。
5. `guodapeng` 的历史组织绑定为 `data_scope_level='GROUP'`：`apps/api/migrations/20260614_g114_user_org_alignment.sql:62-79`，按当前 DataScope 逻辑同样本应全局；其同样为空进一步印证问题发生在 DataScope 入口前。

### 2.3 引入提交

`08c65377` 的 `apps/api/src/app.module.ts` diff 删除了：

```ts
{
  provide: APP_INTERCEPTOR,
  useClass: AuditLogInterceptor,
},
```

旧 interceptor 除打印审计记录外，还执行：

```ts
if (request.user && !this.cls.get('user')) {
  this.cls.set('user', request.user);
}
```

出处：`apps/api/src/common/interceptors/audit-log.interceptor.ts:32-39`。当前 `AppModule` 的退役说明见 `apps/api/src/app.module.ts:154-165`。

同仓库的 `MenuGuard` 已包含正确的认证上下文桥接：JWT 通过后把 `req.user` 写入 CLS；无 `@RequireMenu` 时仅要求登录，不增加菜单权限：`apps/api/src/common/guards/menu.guard.ts:50-80`。这正是 lookup 类端点需要的语义。

### 2.4 最近三轮排除

| 变更 | 结论 |
|---|---|
| `da4920c4` 销售订单生命周期轮 | **命中根因**。其源提交 `08c65377` 退役全局 interceptor，破坏依赖 CLS、但只挂原生 JWT guard 的 lookup 链。订单页面对 CompanySelector 本身的调用未改变。 |
| `fb241b0c` V1-5 退役轮尾提交 | 排除。只修改 `apps/web/src/app/(admin)/store/page.tsx` 两个 locale key。 |
| `43cf4c4a` / `6af62d92` / `08c65377` 生命周期提交链 | 破坏位于 `08c65377` 的 `AppModule`；CompanySelector、lookup company SQL、org controller 均未在该轮被直接编辑。 |

## 3. 生产只读取证状态

### 3.1 已有生产证据

- 既有 Production Readonly Audit run `33498297181` 成功，仓库报告记录生产 checkout/API/Web 运行 revision 均为 `da4920c4185258d6da7b14383bfc24b16610d558`，并输出 `PRODUCTION_BUSINESS_WRITES=0`：`docs/ops/sales-order-lifecycle-audit-20260901.md:395-426`。
- 用户在该生产版本上实测 `admin` 与 `guodapeng` 同时为空；结合上述确定性代码路径，二者均会在 CLS 缺用户处分支为 `200 + data: []`。

### 3.2 本轮未获得的证据（明确保留缺口）

本轮未直接执行带 token 的 `/api/lookup/companies`、`/api/org/organizations` 探针，也未查询生产 `sys_error_logs`/容器日志。原因是受控 workflow 只允许执行已提交在 `scripts/ops/readonly-audits/` 的清单；当前仓库只有销售订单生命周期清单，不包含公司 lookup，而本任务又限定最终提交必须为纯文档。为避免绕过通道或把临时生产审计脚本混入纯文档提交，本轮没有伪造或替代这部分证据。

按代码语义，本次主故障是正常的 `200 + data: []`，预计不会写入 `sys_error_logs`，容器日志也不一定有错误；这只是待探针验证的预期，不冒充生产日志事实。下一轮若要求补生产实测，应先以独立、经审查的 readonly audit 清单同时输出：

- admin：`GET /api/lookup/companies` 的 status、`data.length`、响应顶层形状；
- admin：`GET /api/org/organizations?type=COMPANY` 的 status、行数、响应形状，用作旁路对照；
- `guodapeng`：同两项，并输出解析后的 `isGlobal`/公司数量（禁止输出 token）；
- 事故窗口内 `sys_error_logs.request_path` 对两个端点的计数；
- API 容器同窗口相关 5xx/异常计数；
- 结尾固定输出 `PRODUCTION_BUSINESS_WRITES=0`。

## 4. 本地复现与 DataScope 语义

已执行现有 DataScope 单测：

```text
data-scope.service.spec.ts: 1 suite / 6 tests PASS
data-scope-row-equivalence.spec.ts + data-scope.guard.spec.ts: 2 suites / 16 tests PASS
```

这些测试证明 DataScope 算法本身的 admin/global 与 company-scoped 行集合语义正常，但没有覆盖“只挂原生 JWT guard 的 LookupController 是否把用户写入 CLS”。本地 API 未启动（`127.0.0.1:3100` 连接失败），系统也无 `psql`，因此没有声称完成真实本地 HTTP/数据库复现。

可重复的失败模型为：

```text
AuthGuard('jwt') -> request.user 有值 -> CLS user 仍为空
-> resolveCompanyScope() 返回 { isGlobal:false, companyCodes:[] }
-> companies() 返回 200 { code:200, data:[] }
```

admin 与普通销售经理使用同一模型都会空。修复后才分别进入：

- admin：`ROLE_ADMIN` 硬短路，`isGlobal=true`，查询全部 ACTIVE COMPANY；
- 普通销售经理：按 `allowedCompanyCodes` 查询；
- 当前 `guodapeng`：历史 GROUP 绑定使其为 global（这不等于所有销售经理角色默认 global）。

## 5. 最小修复方案（下一轮实施）

### P0：恢复 lookup 的认证上下文桥接

将 `LookupController` 类级 guard 从：

```ts
@UseGuards(AuthGuard('jwt'))
```

改为：

```ts
@UseGuards(MenuGuard)
```

该 controller 已导入 `MenuGuard`。`MenuGuard` 无 `@RequireMenu` 时仍是“仅 JWT”，不会重新引入 `MENU_SYS_ORG`/主数据维护权限；同时它会把 `request.user` 写入 CLS。现有材料快捷创建方法已有局部 `@UseGuards(MenuGuard)` + `@RequireMenu(...)`，其权限语义保持不变。

不要恢复已退役的 `AuditLogInterceptor`：其审计职责已被正式退役，恢复全局 interceptor 会扩大影响面并重新引入伪审计输出。也不要放宽 DataScope 或给 admin/销售经理补权限，因为权限算法并非根因。

### P0：加入后端回归测试

为 `LookupController` 增加 HTTP/guard 集成测试，真实经过 guard，而不是直接调用 `companies()`：

1. 先红：admin JWT 请求 `/api/lookup/companies`，断言 DataScope 收到 `ROLE_ADMIN`，响应有公司；旧代码应返回空。
2. 先红：company-scoped 用户只返回其授权公司；旧代码应返回空。
3. 绿：两例通过，且无 `@RequireMenu` 的普通业务用户不会因缺 `MENU_MD_COMPANY:V` 得到 403。
4. 绿：无 JWT 仍为 401；scope 解析真实异常仍 fail-closed，不能扩成全局。

### P1：消除吞错伪装空态

给 `CompanySelector` 传入明确的 `emptyMessage` 与 `errorMessage`，或让 `ScopedSelect` 提供全局默认错误文案。必须区分：

- 200 空数组：`当前账号无可用公司，请联系管理员检查数据范围`；
- HTTP/网络失败：`公司数据加载失败，请重试`。

同时在 catch 中保留可观测性（受控前端错误上报或至少 console error，避免记录 token/响应敏感数据）。P1 不应替代 P0；只改提示会让链路继续坏着。

### P1：缓存隔离

当前缓存 key 是固定 `lookup:/lookup/companies`，不含用户或权限版本：`apps/web/src/lib/request-cache.ts:13-37`。同一浏览器切换账号时可能在 5 分钟内复用上一用户结果。修复设计应在登出/登录/用户切换时清空 lookup 缓存，或将稳定的用户/`permsVersion` 纳入 key。此风险不是本次“两位用户都为空”的主因，但会污染修复后的验收。

## 6. 同类影响面

`resolveCompanyScope()` 被同一 `LookupController` 内多个 lookup 使用，因此根因不是销售订单专属：所有只依赖该类级原生 JWT guard、又调用 `resolveCompanyScope()` 的公司域 lookup 都可能 fail-closed 为空。应以符号级测试盘点，不只点修 `/companies`。

- `CompanySelector` 影响销售订单、销售退货、销售配送，以及财务、采购、主数据运行时、通用 CrudForm 等页面。
- `CustomerSelector` 走独立 `/lookup/customers`，同属该 LookupController 且按公司 scope 过滤，销售订单/退货客户下拉可能同样为空。
- `SkuSelector` 走 `/product-master/skus?status=ACTIVE`，不是同一 controller/DataScope 链，不能因公司修复而假定有问题或已修复。
- `ChannelSelector` 走 `/v2/sales/channels`，其 controller 使用 `MenuGuard + DataScopeGuard`，不是同一上下文断链；仍应以销售订单表单 smoke 验证。
- `/api/org/organizations` 是主数据管理视角，带 `MenuGuard + DataScopeGuard`，不是 CompanySelector 当前数据源；它适合作为生产旁路对照，不应把 CompanySelector 改回该受菜单权限约束的旧端点。

修复轮应增加矩阵 smoke：销售订单的公司/客户/渠道/SKU，销售退货的公司/客户/SKU，销售配送的公司，以及至少一个财务和采购 CompanySelector 页面。预期只有共享 lookup/DataScope 断链项由 P0 改变；独立端点若失败需另立根因，禁止捆绑放宽权限。

## 7. 先红后绿验证计划

### 红灯（修复前固化）

1. guard 集成测试证明 JWT 已认证但 CLS user 为空，admin `/lookup/companies` 返回空。
2. company-scoped fixture 同样返回空。
3. 组件测试模拟 500，证明当前 UI 只显示空下拉、无错误文本。
4. 组件测试模拟 200 空数组，证明当前 UI 无“无授权/无数据”解释。

### 绿灯（修复后）

1. admin/global 返回全部 ACTIVE COMPANY；受限用户仅返回授权公司；无 JWT 为 401。
2. 普通业务用户不要求主数据维护菜单，确认 `MenuGuard` 在无 `@RequireMenu` 时仅认证。
3. `CustomerSelector` 等同 controller scope lookup 做至少一组 global/受限用户回归。
4. 前端明确区分失败与空数据；账号切换后不复用前一账号缓存。
5. API `tsc --noEmit`、Web `tsc --noEmit`、相关 Jest/Vitest、真 scope-audit 全部通过。
6. 部署后通过 Production Readonly Audit 对 admin 与受限用户重跑两端点矩阵；记录 revision、status、数量和 `PRODUCTION_BUSINESS_WRITES=0`，不得制造业务数据。

## 8. 实施边界

下一轮只需改 guard、补测试和空态可观测性；不改公司数据、不改用户权限、不改 DataScope 算法、不恢复 AuditLogInterceptor、不把 CompanySelector 回退到旧 org 管理端点。生产迁移不需要 schema 或数据写入。

## 9. 执行记录（2026-09-02）

### 9.1 P0 修复与符号级覆盖

- `LookupController` 类级 guard 已由 `AuthGuard('jwt')` 改为 `MenuGuard`。无 `@RequireMenu` 的 lookup 仍只要求登录；`materials/quick` 原有方法级 `@RequireMenu` 保持不变。未恢复 `AuditLogInterceptor`。
- `resolveCompanyScope()` 全部 15 个消费方法均由同一类级 guard 覆盖：`companies` / `projects` / `sites` / `customers` / `suppliers` / `departments` / `shareholders` / `users` / `warehouses` / `stores` / `farms` / `houses` / `flocks` / `cashAccounts` / `batches`。未发现绕过该 controller 类级 guard 的消费点。
- 新增 guard 级 HTTP 集成测试，真实经过 `Passport JWT -> MenuGuard -> CLS middleware -> controller -> DataScopeService`，覆盖 admin 公司/客户非空、company-scoped 仅授权公司、无额外菜单权限不 403、无 JWT 401、scope 异常 fail-closed 空范围。

### 9.2 P1 空态、错误与缓存隔离

- `CompanySelector` 区分 `200 + []` 与请求失败，分别显示“当前账号无可用公司，请联系管理员检查数据范围”和“公司数据加载失败，请重试”；`CustomerSelector` 同步覆盖对应链路。`ScopedSelect` catch 保留不含 token/响应体的受控 `console.error`。
- 登录、登出、进入/退出影子账号均清理 request cache。`request-cache` 新增 generation 栅栏并清理 in-flight map，阻止旧账号在途请求于切换后回填新会话。

### 9.3 生产只读探针

- 新增 `company-customer-lookup.sql` 与 `company-customer-lookup.http.json`，继续使用受控 `production-readonly-audit` 通道。
- HTTP 矩阵包含 admin / guodapeng 的 `/api/lookup/companies`、`/api/lookup/customers`、`/api/org/organizations?type=COMPANY` 旁路对照；输出 status、`data.length`、DataScope `isGlobal` 和 company count，且 lookup 数组必须非空。
- SQL `sys_error_logs` 与 API 容器日志各检查近 60 分钟 companies/customers 错误窗口，必须为 0；通道仍保留 revision 三方一致硬检查与 `PRODUCTION_BUSINESS_WRITES=0`。

### 9.4 本地验证

| 门禁 | 结果 |
|---|---|
| API `tsc --noEmit` | PASS，0 errors |
| Web `tsc --noEmit` | PASS，0 errors |
| API 全量 Jest | PASS，80 suites / 695 tests |
| Web 全量 Vitest | PASS，94 files / 503 tests |
| Lookup guard HTTP 集成测试 | PASS，5/5 |
| 生产只读清单 `--validate` | PASS |
| `apps/api/test/scope-audit.sh` | 已真实执行；本地 API 未启动，HTTP 均为 `000`，0 pass / 30 fail / 1 skip，不冒充 PASS |

生产部署 revision、readonly audit run 及两账号实测数量在合并部署后追记。
