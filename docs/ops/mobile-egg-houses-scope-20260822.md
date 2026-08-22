# Mobile 产蛋录入鸡舍范围修复（2026-08-22）

## 链路事实

- `/mobile/egg` 在挂载时调用 `mobileApi.getFeedHousesDetail()`，直接把响应行映射为鸡舍列表，没有页面内二次过滤。
- 客户端请求 `GET /api/farm/feed/houses`。修复前 5 分钟内存缓存固定使用 `feedHousesDetail`，key 不含用户或 token；同一 JS 运行时切换账号会复用前一账号的范围数据，命中缓存时甚至不会发起带新 JWT 的请求。
- API 经 `MenuGuard + DataScopeGuard` 写入 `req.dataScope`，再由 `deriveOrgScope(req)` 解析。`ROLE_ADMIN` 在 `DataScopeService.resolve()` 中直接得到 `isGlobal=true`；`storeCode='ALL'` 也有遗留全局兼容，但正常链路以 DataScope 为权威。
- `FarmFeedService.getHouses()` 无参只加 `status='ACTIVE'`，没有 farm/site 限制、JOIN 或 LIMIT。修复前非全局空 scope 调用 `getHouses([], [])`，同样退化为全部 ACTIVE，存在越权风险。

## 生产只读取证

取证 workflow：GitHub Actions run `32564723675`，全程使用 `PGOPTIONS='-c default_transaction_read_only=on'` 和 `BEGIN TRANSACTION READ ONLY`；取证时生产 checkout 为 `943f9bf227ef112443afbcc2f08c899b9eaf149b`，尚未部署本修复。

数据库 `brd_houses`：

| 维度 | 数量 |
| --- | ---: |
| 全表 | 19 |
| ACTIVE | 19 |
| 非 ACTIVE | 0 |
| `LPH_MENGSAI` | 9 |
| `FARM-DP` | 7 |
| `CS-0001` | 1 |
| `F-DEBUG` | 1 |
| `farm_code IS NULL` | 1 |

同一 workflow 用现场生产版本签发的 `ROLE_ADMIN / storeCode=ALL` JWT 请求 `/api/farm/feed/houses`，返回 **19 行**，与数据库 19 个 ACTIVE 鸡舍完全一致。由此排除 admin 判定、无参 SQL、status、JOIN 和 LIMIT 导致“只剩 2 个”的可能。

线上 UI 的那 2 行是浏览器内存中的前一账号缓存响应；缓存未记录来源账号或响应日志，服务端访问日志也不记录响应体，因此无法事后可靠还原两个 code。数据库分组中不存在数量为 2 的 farm/status 集合，这一反证也与固定服务端过滤不吻合。可复现特征是：同一运行时先用场级 token 得到范围列表，再换 admin token，修复前第二次调用不发网络请求并原样返回前一列表；Vitest 已先红后绿覆盖该行为。

## 根因

主根因是 mobile API 的鸡舍缓存 key 未按认证身份隔离。后端 admin 实际已返回 19 行，但页面可被此前任一账号的 5 分钟缓存覆盖，所以换成 admin 后仍显示旧的 2 行。

同时发现并收紧一个独立的 DataScope 安全缺口：非全局用户在 farm/site 范围均为空时，旧 service 把空数组解释成“不加过滤”，会返回全部 ACTIVE。公司组织绑定也没有传入该 feed 查询，和既有 `/api/lookup/houses` 的 company→farm 展开语义不一致。

## 修复

- 鸡舍缓存改为 `feedHousesDetail:<current-token>`；账号/token 改变即使用不同缓存。`invalidateCache('feedHousesDetail')` 同时清理其全部身份子 key。
- admin/global 仍调用无参 `getHouses()`，返回全部 ACTIVE。
- 普通用户把 `deriveOrgScope` 的 farm/site/company 三维范围传入查询；company 维度复用既有 lookup 语义，经 `brd_farms.farm_code/company_code` 限制对应农场鸡舍。
- 非全局且 farm/site/company 均为空时 controller 直接返回空数组信封，不触发数据库全量查询。
- 未增加迁移，未写生产数据库。

## 测试

先红后绿回归：

- API Jest：admin 无参全量、单农场范围透传、空 scope fail-closed。
- Web Vitest：同一运行时 token 从场级切换为 admin 时必须重新请求，不能复用旧鸡舍列表。

本地最终验证：

| 验证 | 结果 |
| --- | --- |
| API `tsc --noEmit` | 0 errors |
| Web `tsc --noEmit` | 0 errors |
| API Jest | 60 suites，516 tests，全绿 |
| Web Vitest | 75 files，426 tests，全绿 |
| freeze boundary | `ALLOW_FREEZE_TOUCH=true` 显式复跑，WARN（预期触及 API/Web），无阻断错误 |

## CI 与部署验证

- 修复代码 main commit：`008fbed878db407ceb9a86219ef84b7d68fdfc50`。
- 报告/部署目标 main commit：`c21009d7f029683955490ac3376bd567f8319438`。
- push-main CI run `32564797571`：成功；Type-check & Regression、全部 schema/constraint/entity 门禁和五组业务回归全绿。
- 显式生产部署 run `32565279981`：`workflow_dispatch`，`mode=full`、`approve_production=true`，成功。选择 full 是因为主根因修复在 Web 缓存层，同时 API 有 DataScope fail-closed 修复；只部署 api 会遗留线上主故障。
- 部署构建的 API image manifest：`sha256:c45023f78ccaa0212d948932190cc7c2263a7913866f73b9f6a132f58ebec2a4`，OCI revision 为目标 commit。
- 部署构建并运行的 Web image：`sha256:b73de77af2f6c0af33eb3f3524f8791d8f2526bd73a24929067c918f08da4273`，OCI revision 为目标 commit。
- 部署后生产只读鸡舍审计 run `32565565557`：checkout SHA 为目标 commit，数据库仍为 19/19 ACTIVE，admin endpoint 返回 19 行。
- 部署后 Web image 只读审计 run `32565576895`：checkout SHA、运行 image digest、OCI revision 三者均与上述目标一致。
