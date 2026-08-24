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

## 第二轮：真根因（2026-08-24）

### 页面归属勘误

上一轮把“产蛋录入”误定位为 `/mobile/egg`，并修复了它使用的 `/api/farm/feed/houses` 链路。`/mobile/egg` 实为鸡蛋库存页；真正的产蛋录入入口是 mobile home 的 `/mobile/egglog`。上一轮发现的 token 缓存串用与 DataScope fail-open 都是真实缺陷，修复予以保留，但与线上“所有账号只显示 2 个鸡舍”无关。上一轮关于那 2 行来自旧鸡舍缓存的表述据此更正为错误归因。

真实主链路为：`/mobile/egglog` 挂载时调用 `mobileApi.getFlocks()`，后者查询 `GET /api/crud/brd_flocks`，页面再按鸡群的 `house_code`（缺失时回退 `flock_no`）排序并展示。

### 真根因与生产数据对照

修复前 `getFlocks()` 固定请求 `status=LAYING&limit=100`。此前生产只读取证的 10 个鸡群中，恰好只有 2 个状态为 `LAYING`（`FK-MR8VGZS4M0Q`、`FK-MR8TWK22H4Y`），与所有账号看到 2 项完全吻合，因此问题与账号权限无关。

其余鸡群为：5 个 `LPH_MS_F02`～`LPH_MS_F06`（合计约 21 万羽）状态为无效存量值 `ACTIVE`；1 个为 `PEAK`；另有 2 个不属于当前产蛋录入口径。鸡群合法业务语义为 `GROWING / LAYING / PEAK / RETIRED`：`GROWING` 尚未进入产蛋期、`RETIRED` 已退役，均不应出现；`PEAK` 是产蛋高峰期，必须出现。

### 修复与 ACTIVE 处置决策

- 查询改为重复参数 `status=LAYING&status=PEAK`。通用 CRUD 会把重复 query key 解析为数组并生成 PostgreSQL `= ANY($n)`；逗号字符串会被当作单个字面值，不能使用。
- `getFlocks` 缓存 key 改为 `flocks:<current-token>`，避免同一浏览器切换身份后复用前一身份的鸡群范围。既有 `invalidateCache('flocks')` 会同时删除精确 key 与全部 `flocks:` 前缀子 key，无需修改失效逻辑。
- 不临时兼容 `ACTIVE`。该值不属于鸡群状态语义，若纳入查询会把数据污染固化成长期接口契约，也可能在未来误纳其他含义的 ACTIVE 数据。
- 本次不写生产数据库。建议另行授权一次显式生产数据变更，将已确认的 5 个 `LPH_MS_F02`～`LPH_MS_F06` 从 `ACTIVE` 更正为 `LAYING`；执行前应再次只读列出目标主键、当前状态和数量，事务内只更新精确目标并核对受影响行数为 5，保留变更审计与回滚 SQL。

### 回归与验证

Vitest 已按先红后绿执行：红测分别证明旧请求缺少 `PEAK`，以及 token 切换后 `flocks` 缓存串用；修复后断言请求 URL 为 `/api/crud/brd_flocks?status=LAYING&status=PEAK&limit=100`，且 token 切换会发起第二次请求并返回对应身份数据。

本地最终验证：API `tsc --noEmit` 0 errors；Web `tsc --noEmit` 0 errors；API Jest 60 suites、516 tests 全绿；Web Vitest 75 files、428 tests 全绿。此次未改页面表单或主数据输入控件，静态 scope-audit 的适用改动面为空。

main commit `f4a8f3b651a6f14355768c6ca544f275f0277d5e` 已推送。push CI：`32679815784`（完整类型检查、迁移/约束门禁、五组回归与 Web 镜像构建）、`32679815818`（Web Vitest）、`32679815850`（双端 build/typecheck + API Jest）、`32679815790`（安全门禁）全部成功。

显式生产部署 run `32680175771` 使用 `workflow_dispatch`、`mode=web`、`skip_deploy=false`、`approve_production=true`，成功；API image 构建被跳过，仅构建并重启 Web，未运行生产 DB 迁移。部署后 Web image 只读审计 run `32680481428` 成功：生产 checkout 为上述目标 commit，运行 Web image digest 为 `sha256:77b4941233ed1a85f2cf071972e005a06bd5fc8f3b7d9df65d8a9250ac2aeb64`，OCI revision 同为上述目标 commit。Flock 生产只读审计 run `32680483025` 同样确认生产 checkout 和 Web OCI revision 一致，API 容器仍保持上一轮 revision，符合 `mode=web` 预期。

扩展后的生产只读审计 run `32680563656` 成功：生产 `brd_flocks` 状态分布为 `ACTIVE=5 / GROWING=2 / LAYING=2 / PEAK=1`，所以产蛋录入口径 `LAYING + PEAK` 的数据库期望数为 3；用现场 API 容器签发的短期 admin token 请求 `/api/crud/brd_flocks?status=LAYING&status=PEAK&limit=100` 返回 3 行，状态集合严格为 `LAYING,PEAK`，与数据库期望数一致。生产 checkout 仍为部署目标 `f4a8f3b6`；审计全程只读，未写生产数据库。

## 第三轮：ACTIVE 数据修正（2026-08-24）

### 授权与执行边界

用户已显式授权本次生产数据修正：仅允许把 `brd_flocks` 中 `LPH_MS_F02`～`LPH_MS_F06` 且当前 `status='ACTIVE'` 的 5 行更正为 `LAYING`，除此之外零写入。专用 workflow 使用 `approve_production=true`、精确确认词、GitHub `production` environment 和不可并发执行的 concurrency group；只读预检任何断言失败都会阻止更新步骤。

执行前已预写回滚 SQL（仅在需要人工回滚且再次明确授权后使用）：

```sql
UPDATE brd_flocks
   SET status = 'ACTIVE', updated_at = NOW()
 WHERE flock_no IN ('LPH_MS_F02', 'LPH_MS_F03', 'LPH_MS_F04', 'LPH_MS_F05', 'LPH_MS_F06')
   AND status = 'LAYING';
```

### 执行审计

生产修正 workflow run `32682704375`（checkout `a8b38448706cd9a2e2fa43dd267ecb383682bd2d`，生产远端 checkout `f4a8f3b651a6f14355768c6ca544f275f0277d5e`）使用 `approve_production=true` 与精确确认词执行。第 1 段通过 `PGOPTIONS='-c default_transaction_read_only=on'` 和 `BEGIN TRANSACTION READ ONLY` 完成；目标数与其中 `ACTIVE` 数均断言为 5，预检清单如下（原 `updated_at` 均为 NULL）：

| flock_no | farm_code | house_code | current_qty | status | updated_at |
| --- | --- | --- | ---: | --- | --- |
| `LPH_MS_F02` | `LPH_MENGSAI` | `HOUSE_MS_02` | 45,598 | `ACTIVE` | NULL |
| `LPH_MS_F03` | `LPH_MENGSAI` | `HOUSE_MS_03` | 37,500 | `ACTIVE` | NULL |
| `LPH_MS_F04` | `LPH_MENGSAI` | `HOUSE_MS_04` | 44,000 | `ACTIVE` | NULL |
| `LPH_MS_F05` | `LPH_MENGSAI` | `HOUSE_MS_05` | 42,368 | `ACTIVE` | NULL |
| `LPH_MS_F06` | `LPH_MENGSAI` | `HOUSE_MS_06` | 41,700 | `ACTIVE` | NULL |

第 2 段在单事务内再次 `FOR UPDATE` 锁定并断言同一 5 行仍全部为 `ACTIVE`，随后仅对精确 flock_no 且 `status='ACTIVE'` 的行执行更新。审计临时表记录 `RETURNING` 行数为 **5**；5 行均由 `ACTIVE` 变为 `LAYING`，`updated_at` 均由 NULL 变为 `2026-08-24 02:20:04.945788+00`，其他列未更新，事务成功 `COMMIT`。5 行 `current_qty` 合计 211,166 羽。

### 复核结果与并发事实

提交后的即时只读查询得到 `ACTIVE=0 / GROWING=2 / LAYING=8 / PEAK=1`（总数 11），因此 workflow 按预写的 `LAYING=7 / 总数=10` 断言失败，后续步骤被 fail-fast 跳过；失败发生在只读复核段，已提交的精确 5 行修正没有部分更新问题。调查确认生产在前一轮审计之后、本次 workflow 之前已新增 `FK-MT6LRP7S1AF`：`created_at=2026-08-24 02:14:18.506Z`、`house_code=HOUSE_CS_03`、`farm_code=FARM-DP`、`current_qty=100`、初始状态即为 `LAYING`。该行不在授权目标内，本次 UPDATE 未触碰它；它解释了相对原先已确证分布多出的 1 个 `LAYING` 和总数 1。

随后两次独立生产只读审计均成功，未执行任何写入：run `32682756486` 在 `02:20:58Z` 确认上述实际分布，admin API 返回 9 行；run `32682811446` 在 `02:22:02Z`（距事务提交超过 1 分钟）再次确认 `ACTIVE=0 / GROWING=2 / LAYING=8 / PEAK=1`，在 `02:22:12Z` 请求 `/api/crud/brd_flocks?status=LAYING&status=PEAK&limit=100` 返回 **9 行**、状态集合严格为 `LAYING,PEAK`。因此原计划的“总数 10、LAYING 7、接口 8 行”因执行前合法新增的鸡群已不再成立；修正目标本身全部完成且未发生并发写回。
