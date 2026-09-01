# 销售订单页回归分析：来源 Tab 消失与原订单列表空白

> 范围：只读取证与修复设计；未修改业务代码、数据库或生产状态。线上 revision：`0aced49a`。代码根因引入于 `5f854c81`。

## A. 生产取证

### A1. 最近一小时目标端点证据

本轮未取得认证后的 `/api/v2/sales/activity`、`/api/v2/sales/orders` 的 `sys_error_logs` 或 API 容器原始日志，因此不能声称目标窗口内存在或不存在 400/403/500。

- 只读探测时间：2026-09-01 06:40:43–06:40:44 UTC（14:40:43–14:40:44 UTC+8）。两个端点在无 token 请求下均返回 `HTTP/2 401`，响应为 `{"code":401,"message":"Unauthorized","statusCode":401}`；该结果只证明公网鉴权生效，不代表实测账号的响应。
- 本机没有 production SSH/JWT secrets；本地 `docker compose ps` 也因缺少 `JWT_SECRET` 无法解析 compose。未触发远端 workflow，未执行生产写操作。
- 仓库已有可复用的只读取证方式：`.github/workflows/store-price-book-500-readonly-audit.yml:67-82` 以 `default_transaction_read_only=on` 和 `BEGIN TRANSACTION READ ONLY` 查询 `sys_error_logs`，`:105-110` 读取指定窗口的 `phoenix-v3-api` 容器日志。`sys_error_logs` 列表接口本身只支持错误类型/HTTP 状态筛选（`apps/api/src/modules/system-monitor/services/sys-error-logs.service.ts:55-101`），目标 path + 最近一小时应使用只读 SQL或拉取后本地过滤。
- 最近成功的 production run `33477434044` 只验证 Store POS/replenishment，日志中的 `STORE_POS_ERROR_WINDOW=PASS count=0 window=30m` 不覆盖这两个目标端点，不能作为本轮目标窗口证据。

后续执行轮应在生产 secrets 可用时固定绝对起止时间，并同时留存：目标 path 的 `sys_error_logs` 只读 SQL结果、`docker logs --timestamps --since/--until phoenix-v3-api` 原文、实测账号带 token 的两个 HTTP 状态与响应体。该证据用于排除并发的生产异常，但不影响下述可由代码确定复现的 200 响应消费缺陷。

### A2. 菜单权限语义

- 原订单 API 要求 `MENU_SALES2_ORDER:V`：`apps/api/src/modules/sales-v2/controllers/sales-orders.controller.ts:18-31`。
- facade 要求 `MENU_SALES2_ORDER:V`，以 `MENU_STORE_POS` 为 OR 备选：`apps/api/src/modules/store-pos/controllers/sales-activity.controller.ts:6-14`。
- `ROLE_ADMIN` 在 `MenuGuard` 直接放行；`permissions=['*']` 也由通用权限判断放行：`apps/api/src/common/guards/menu.guard.ts:85-106`、`apps/api/src/auth/permissions.util.ts:26-38`。
- facade 内仍按来源独立判断。管理员必有 ORDER；POS 除菜单权限外仍须存在有效 membership、SALES warehouse binding 和 WarehouseScope 交集：`apps/api/src/modules/store-pos/services/sales-activity.service.ts:83-90,117-138`。

因此，“管理员没有 POS Tab”在无可见门店时可以是设计结果；但管理员的 ORDER 来源不会被该规则隐藏。生产当前 admin/实测账号的实际权限行本轮没有取到，不以历史账号材料冒充当前值。

## B. 根因

### B1. 确切缺陷：响应被解包两次

订单页本地通用 helper 在成功响应后无条件返回 `d.data ?? d`：

- `apps/web/src/app/(admin)/sales2/orders/page.tsx:24-39`

facade 正常返回的契约恰好是：

```ts
{
  data: SalesActivityRow[],
  availableSources: ('ORDER' | 'POS')[],
  page: number,
  limit: number,
  hasMore: boolean,
  ...
}
```

出处：`apps/api/src/modules/store-pos/services/sales-activity.service.ts:98-106`；controller 直接返回该对象：`apps/api/src/modules/store-pos/controllers/sales-activity.controller.ts:12-14`。

P3 调用方却把 helper 的返回值继续当完整 facade 对象读取：

- `apps/web/src/app/(admin)/sales2/orders/page.tsx:286-304`
- `setOrders(Array.isArray(res.data) ? res.data : [])`
- `setAvailableSources(Array.isArray(res.availableSources) ? res.availableSources : [])`

实际运行时 `res` 已经是 `SalesActivityRow[]`，所以 `res.data`、`res.availableSources`、`res.hasMore` 均为 `undefined`。正常 HTTP 200 也必然得到：

1. `orders=[]`，随后渲染“暂无销售数据”：`page.tsx:595-610`；
2. `availableSources=[]`，ORDER/POS 两个 Tab 被过滤，仅 ALL 保留：`page.tsx:506-515`；
3. `hasMore=false`。

这同时解释了用户看到的两个症状，不依赖 403、DataScope 空或数据库无数据，是确定性前端契约缺陷。

### B2. 引入提交与旧路径变化

`5f854c81` 把列表从 `/api/v2/sales/orders` 切换到 `/api/v2/sales/activity`，删除 `normalizeSalesOrdersPage()` 的消费，并加入上述二次对象读取。`0aced49a` 只补翻译，没有修改加载逻辑。部署前旧路径能工作，是因为旧调用将 helper 解包后的值再交给兼容多种分页形状的 `normalizeSalesOrdersPage`（`apps/web/src/lib/sales-orders-response.ts:10-33`）；新路径既改变端点，又遗漏了 helper 的既有解包约定。

### B3. 错误处理与降级

- 真实非 2xx 并未被吞掉：helper 在 `page.tsx:33-35` 抛错，`loadOrders` 在 `:305-309` 设置错误文本。
- 但本次是正常 200 的响应形状错配，`Array.isArray(...)?...:[]` 将契约错误伪装成正常空态，没有错误提示。
- 真正请求失败时，代码不清空旧 `orders/availableSources`，会同时显示错误和陈旧数据；错误容器 `page.tsx:570-581` 也没有 `role="alert"`。
- 后端没有发现 admin/global ORDER 被 DataScope 条件误拦：只有非 global 才追加 company 条件，空范围才 `1=0`，见 `sales-activity.service.ts:156-175`。菜单码也均已注册，无 typo。
- 次要风险：POS 来源会再次调用 `DataScopeService.resolve()`；异常可冒泡成 500（`sales-activity.service.ts:122-134`）。这不是本次双症状根因，但修复轮应纳入错误态用例。

### B4. 契约测试为何漏报

`apps/web/src/__tests__/sales-activity-ui-contract.test.ts:5-29` 读取页面源码并仅断言字符串存在，例如 facade URL、`setAvailableSources`、`availableSources.includes(value)`。它没有渲染 React、没有运行 helper，也没有把真实 facade JSON 送入页面。因此错误的生产代码恰好满足全部静态断言。

当前 Vitest 配置是 Node 环境，相关 Web 测试没有 DOM 交互；后端 `sales-activity.service.spec.ts` 覆盖来源选择、SQL/纯函数与禁止写入，但没有 Controller HTTP 响应到页面消费的联动。现有测试证明“代码片段存在”，没有证明“用户能看到 Tab 和订单行”。

## C. 修复方案与测试计划

### C1. 根因修复

执行轮建议采用显式保留响应 envelope 的请求函数，避免继续依赖含糊的 `d.data ?? d`：

1. 为 activity 请求使用 `apiEnvelope<SalesActivityResponse>()`（或让 helper 支持明确的 `unwrapData: false`），运行时校验 `data`、`availableSources`、`hasMore`；不要只改成偶然兼容数组的猜形状逻辑。
2. 契约合法时原样设置行、来源与分页。契约不合法时进入错误态，不得落入“暂无数据”。
3. 明确加载状态转换：新请求开始时保留旧表但标记刷新，失败后显示 `role="alert"` 和“数据可能为旧值”；若产品选择清空旧表，则也须显示错误态，不能显示正常空态。
4. 增加受控降级：facade 网络失败/403/5xx/契约错误时，仅对具备 `MENU_SALES2_ORDER:V` 的用户请求原 `/api/v2/sales/orders`，恢复客户订单列表，将可用来源限定为 ORDER，并显示“联合列表不可用，当前展示客户订单”的持续横幅。POS-only 用户不得借降级调用或展示 ORDER；旧 API 自身仍由后端权限和 DataScope 兜底。
5. facade 恢复后以服务端 `availableSources` 为准；前端权限只用于入口提示，不能扩大服务端返回的来源。

最小热修可以只纠正 envelope 消费即可恢复当前回归；但若不同时加入契约错误态和受控旧 API 降级，下次 facade 的网络/部署故障仍会让客户订单入口整体不可用。

### C2. 回归防线

优先补真实渲染测试，静态源码契约仅保留为辅助：

1. Vitest/jsdom 组件测试：mock facade 返回 ORDER+POS，断言“客户订单”“POS 成交”两个 `role=tab` 和至少一条真实订单号可见；点击客户订单后断言请求包含 `source=ORDER`。
2. 权限/来源矩阵：`availableSources=['ORDER']` 时客户订单可见且 POS 不见；`['POS']` 时相反；`[]` 时仅 ALL。管理员/global 的后端 service 测试必须断言 ORDER 一定进入来源且执行订单查询。
3. 失败矩阵：facade 403、500、fetch reject、200 但 envelope 畸形；断言 loading 结束、`role=alert` 可见、不会伪装为空态。具备 ORDER 权限时断言旧 API 降级、订单行可见和降级横幅；POS-only 时断言绝不调用旧订单 API。
4. Playwright 页面流程：route mock activity/详情/辅助 API，访问 `/sales2/orders` 后验证 Tab、订单行、ORDER 详情请求、POS 深链；再覆盖 facade 失败降级。这一层防止 helper、异步 state 和 DOM 组合再次错配。
5. API 契约测试通过真实 HTTP/controller 层冻结 envelope 字段及类型，避免 service 单测与传输形状脱节。

验收必须至少包含：Web 定向组件测试、Web 全量 Vitest、Web tsc、API facade 定向测试、API tsc、Playwright 页面回归；另以只读生产 token 验证 activity 的 ORDER/ALL 和旧 orders 两个响应，禁止以源码字符串 PASS 代替页面结果。

## D. 影响面

### D1. 直接受影响

- `/sales2/orders` 是仓库内 `/api/v2/sales/activity` 的唯一业务调用方，故本次二次解包的直接 UI 影响集中于该页。
- 该页的客户订单与 POS 联合列表、来源 Tab、分页 `hasMore` 均受影响；订单详情/创建/提交/取消仍使用原 orders API，不属于同一加载缺陷，但入口行消失使用户无法从列表触达详情和动作。
- `/store-pos` 详情深链本身未使用 activity envelope；其授权仍走 membership + warehouse scope，不受二次解包直接影响。

### D2. 同模式风险（非本次已证实故障）

- `/store-pos` 初始化上下文与班次/汇总存在吞错为空的路径：`apps/web/src/app/(admin)/store-pos/page.tsx:327-376`。
- 销售首页统计/分析失败被静默忽略：`apps/web/src/app/(admin)/sales2/page.tsx:90-103`。
- 销售库存页 SKU 失败返回空数组、统计失败静默：`apps/web/src/app/(admin)/sales2/inventory/page.tsx:100-117,1099-1105`。

这些入口没有复用 activity facade，不能归为本次直接回归；但都存在“错误被伪装成空数据”的体验风险，宜另立治理任务，不扩入本次热修。

## 结论

根因不是 POS 权限设计或 admin DataScope，而是 `5f854c81` 中前端 facade 响应消费与既有 `api()` 自动解包约定冲突。它在正常 200 下确定性地产生空订单数组和空来源数组，精准解释“客户订单/POS Tab 不见 + 原订单列表空白”。生产最近一小时目标日志仍是明确证据缺口；该缺口不得阻塞修复已证实的代码缺陷，但执行轮上线前后应补齐只读取证和真实页面回归。

## E. 执行记录（2026-09-01）

### E1. C1 修复

- activity 改用显式保留 envelope 的 `apiEnvelope()`；运行时严格校验 `data`、`availableSources`、`hasMore`、`page`、`limit` 及行来源/标识字段，不接受裸数组猜形状。
- 合法契约原样写入列表、来源与分页；畸形 200 进入错误/降级路径，不再显示“暂无销售数据”。来源初值为空，成功后以服务端 `availableSources` 为唯一依据。
- 刷新保留旧表并设置 `aria-busy`；失败提示使用 `role="alert"`，保留旧值时明确“数据可能为旧值”。
- facade 网络错误、403、5xx 或契约错误时，仅 `MENU_SALES2_ORDER:V` 用户调用旧 `/api/v2/sales/orders`，映射为 ORDER 行并持续显示“联合列表不可用，当前展示客户订单”；POS-only 不调用旧 API。

### E2. C2 回归防线

- Web jsdom 真实渲染：ORDER+POS Tab、真实订单号、Tab 请求 `source=ORDER`、服务端来源三态，以及 403/500/fetch reject/畸形 200 × ORDER 降级/POS-only 禁止降级，共 12 个用例。
- API：补 POS-only/无来源/admin-global ORDER 来源矩阵；admin-global 断言执行订单 SQL 且不追加公司范围条件。
- API HTTP：用 Nest 测试应用 + Supertest 发真实 GET，冻结直出 envelope 的字段和值类型，防止 controller/传输层二次包装。
- Playwright：真实浏览器渲染验证两个 Tab、订单行、ORDER 详情请求与明细、POS scoped 深链，以及 facade 500 后的旧订单降级和持续横幅。

### E3. 本地验证结果

- Web tsc：0 errors。
- API tsc：0 errors。
- Web Vitest：93 files / 495 tests passed。
- API Jest：77 suites / 676 tests passed。
- Playwright 定向流程：2 passed（本机缺少 Chromium 的 NSS/NSPR/ALSA 动态库，验证时仅在项目临时目录解包依赖并通过 `LD_LIBRARY_PATH` 运行；临时文件已清理，未修改系统）。

### E4. CI、PR 与 full 部署

- 修复分支提交并 push，PR [#146](https://github.com/ivanzhao299/phoenix-erp-v3/pull/146)；冻结销售/POS 边界经 `reviewed-frozen-boundary` 标签复核。
- PR 当前 revision `189d3786` 的 Runtime Smoke、Security/Freeze、Web Vitest、Regression、Build、Deploy test-only 全部通过；PR 于 2026-09-01 07:06 UTC 合并。
- merge commit：`6d0fedcbd482b809b495c98f5aab8ee172f96437`。
- full production workflow：run `33480565028`，API/Web 镜像构建、迁移链、服务更新全部成功；随后 amei 只读验收 run `33481426480` 再次确认 checkout/API/Web revision 三者均为 `6d0fedcb`。

### E5. 生产只读补证

专用只读 audit run `33482388165` 于 2026-09-01 07:29–07:30 UTC 完成，全程使用 20 分钟短期 admin/global token；数据库连接同时设置 `PGOPTIONS='-c default_transaction_read_only=on'` 并显式 `BEGIN TRANSACTION READ ONLY`，业务写入为 0。

- revision：checkout/API/Web 均为 `6d0fedcbd482b809b495c98f5aab8ee172f96437`。
- `GET /api/v2/sales/activity?page=1&limit=20&source=ALL`：契约字段类型通过，20 行，`availableSources=['ORDER']`。
- `GET /api/v2/sales/activity?page=1&limit=20&source=ORDER`：契约字段类型通过，20 条真实 ORDER 行；样本 `SO-20260901-00002`。
- `GET /api/v2/sales/orders?page=1&limit=20`：20 条旧接口订单行；样本同为 `SO-20260901-00002`。
- `sys_error_logs` 只读 SQL：最近 1 小时 `request_path` 命中 activity/orders 的记录数为 0。
- 生产 Chromium 真实访问 `/sales2/orders`：`客户订单` role=tab 可见，首行真实订单 `SO-20260901-00002` 可见；不是源码字符串断言。
- 当前 admin/global 生产结果只返回 ORDER 来源，故本次生产页不声称 POS Tab 可见；ORDER+POS 组合及 POS 深链已由本轮 jsdom 与 Playwright route-mock 渲染流程冻结，POS 是否对具体生产账号开放仍以服务端 membership/WarehouseScope 返回为准。
