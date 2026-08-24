# linhong 跨养殖场鸡舍/鸡群越权取证与修复报告

日期：2026-08-24  
生产只读取证：GitHub Actions run `32686156016`（成功）  
取证时生产 revision：`5356788d2bba5c1aebd6131580669b1a24a78ca7`

## 1. 生产只读取证

取证全程使用 `PGOPTIONS='-c default_transaction_read_only=on'` 和只读 SQL；API 仅调用两个 GET。linhong 审计 JWT 在生产 API 容器内用运行时密钥签发，有效期 10 分钟，只含真实用户 ID、真实可见角色和两个只读菜单权限，不含 `*`，未输出令牌或密钥。

### 1.1 linhong 授权画像

| 项目 | 生产值 |
|---|---|
| user_id / username / real_name | `7 / linhong / 林宏` |
| store_code / status / perms_version | `ALL / 1 / 444` |
| 有效角色 | `ROLE_FARM_MGR`（主）、`ROLE_VET` |
| sys_data_scopes | 两个角色均无规则（0 行） |
| sys_user_orgs | 仅 1 行：`id=12460, org_id=21, is_primary=true` |
| 绑定组织 | `SITE-DONGPENG-LAYER / 东鹏蛋鸡养殖场 / SITE` |
| data_scope_level | **`GROUP`** |

绑定节点不是公司，而是东鹏养殖场 SITE；但该行的 `data_scope_level='GROUP'` 按 G124 明确语义会直接得到 `isGlobal=true`。

### 1.2 东鹏与孟赛组织结构

| 养殖场 | SITE | 公司 | brd_farms.farm_code |
|---|---|---|---|
| 东鹏蛋鸡养殖场 | `SITE-DONGPENG-LAYER` | `COMP-LAO-XINGCHI` | `FARM-DP` |
| 孟赛蛋鸡养殖场 | `SITE-MENGSAI-LAYER` | `COMP-LAO-AGRI` | `LPH_MENGSAI` |

两场属于不同公司。绑定东鹏 SITE 且使用 SITE 范围应只展开东鹏；绑定公司则按既有三维 OR 语义展开该公司全部养殖场。

### 1.3 生产 API 实测

| 接口 | linhong 返回 | 结论 |
|---|---:|---|
| `/api/crud/brd_flocks?...` | 9 群：孟赛 8、东鹏 1 | 明确跨场 |
| `/api/farm/feed/houses` | 19 栋（全量 ACTIVE） | 明确全局化 |

生产当前 ACTIVE 鸡舍按 farm_code：`FARM-DP=8`、`LPH_MENGSAI=9`，另有 `CS-0001=1`、`F-DEBUG=1`。东鹏 8 栋中包含测试命名的 `HOUSE_CS_03`、`HOUSE_CS_04`；用户预期 7 栋与生产现存 8 栋不一致，需要业务确认哪一栋应停用/归档，本文不改生产数据。

## 2. 失守闸门判定

| 闸门 | 判定 | 证据 |
|---|---|---|
| G1：CRUD 对 brd_flocks 无农场过滤 | **命中** | `brd_flocks/brd_houses` 的 scope field 为 null；虽调用 `resolveTableScope`，普通 GET 未消费 breeding scope。linhong 实测鸡群 9（孟赛 8、东鹏 1）。 |
| G2：绑定在公司而非农场 | **不命中** | 唯一绑定为东鹏 SITE `org_id=21`，不是公司。 |
| G3：GROUP 数据范围 | **命中** | 唯一 `sys_user_orgs` 行 `data_scope_level='GROUP'`；角色 scope 规则 0 行。G124 因此明确判全局。 |
| G4：dataScope 缺失 + 无 storeCode fail-open | **本次未触发，静态高危成立** | 本次 guard 正常填充 DataScope，且 token 的 storeCode 为 ALL；但 `deriveOrgScope` 原代码在 DataScope 缺失且无 storeCode 时返回 global。 |

当前事件是 **G1 + G3** 共同失守：G1 让通用鸡群列表没有行级闸门；G3 又让 farm-feed 的有效 DataScope 明确成为 global。G4 不是本次线上请求的直接原因，但属于同一读取链上的独立 fail-open 风险。

## 3. 代码修复

1. 通用 CRUD 为 `brd_farms / brd_houses / brd_flocks` 增加统一 breeding table scope，直接消费 `resolveTableScope` 的 farm/site/company 三维范围。
2. 三维维持既有 OR 语义：单农场绑定只见本场；公司绑定可见该公司全部场；admin/global 保持全量。
3. 对旧鸡舍/鸡群缺少 `site_code/company_code` 的行，通过 `brd_farms.farm_code → mapped_site_code/company_code` 的 EXISTS 回查确定归属，避免本场历史数据被误隐藏。
4. 非 global 且三维均为空时注入 `1=0`，明确 fail-closed。
5. `deriveOrgScope` 缺失 DataScope 时不再因缺少 storeCode 自动判 global；仅显式 admin/`*`/`ALL`/`ORG-GROUP*` legacyGlobal 保持兼容。

本次未改 schema、未新增迁移、未写生产数据。

## 4. 数据配置问题（待授权）

1. `sys_user_orgs.id=12460` 当前 `data_scope_level='GROUP'` 与“只看东鹏场”目标冲突。建议改为 `SITE`，并 bump `sys_user.perms_version` 使旧 token 失效。该操作属于生产数据写入，尚未执行。
2. `sys_user.store_code='ALL'` 是遗留值。代码现以已解析 DataScope 为权威，不再让它覆盖正常 scoped 结果；是否同步改为 `SITE-DONGPENG-LAYER` 需结合其他旧路由盘点后另行授权。
3. `FARM-DP` 当前有 8 栋 ACTIVE，不是预期 7 栋。需业务确认 `HOUSE_CS_03/HOUSE_CS_04` 的保留状态后另行处理。

在第 1 项未获授权前，部署代码修复后 linhong 在 farm-feed 仍会因显式 GROUP 授权看到全量；不能把该结果误报为已修复。

## 5. 回归与验证

先红后绿证据：

- 初次专项 Jest：失败。`findAllBreedingScoped` 不存在；缺 DataScope + 无 storeCode 得到 `isGlobal=true`。
- 实现后专项 Jest：3 suites / 48 tests 通过。
- API 全量 Jest：60 suites / 522 tests 通过。
- API TypeScript：`tsc --noEmit` 通过。
- Web TypeScript：`tsc --noEmit` 通过。
- Web Vitest：75 files / 428 tests 通过。
- 旧 HTTP `test/scope-audit.sh`：本机未启动 API，30 项均为 `HTTP 000`（另 1 项因无 fixture 跳过）；这是运行环境不可达，不是断言回归。真实 breeding scope 由新增 Jest 覆盖，部署后再以生产只读 GET 完成端到端验收。

### 5.1 CI、部署与生产复测

- PR：`#57`，合并到 main revision `c43cb0461076c9fe561deadc5476d42b40462c8b`。
- PR 功能 CI：build/typecheck/tests、regression、Vitest、runtime smoke 全部通过。PR freeze/security 是仓库设计的人工评审闸；显式 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 复核后 W5 20/20 通过，master-data legacy reference 维持 baseline 30/30。
- main push build run：`32687059529`，成功；完整 typecheck/regression、API/Web image build 均通过。
- 显式 API-only 生产部署 run：`32687427992`，成功；`Deploy · api` 完成。
- 部署后生产只读 run：`32687782047`，成功；生产 checkout revision 与 main 一致：`c43cb0461076c9fe561deadc5476d42b40462c8b`。
- admin 回归：19 栋 ACTIVE 鸡舍、9 群 egglog 鸡群，保持全量。
- linhong 部署后：鸡群仍为 9（孟赛 8、东鹏 1），鸡舍仍为 19。结果符合当前 `data_scope_level='GROUP'` 的显式授权语义，证明代码没有偷偷覆盖授权数据；同时也说明用户目标尚未闭环。

## 6. 最终状态

**HOLD（代码修复已部署，账号数据修正待授权）**。

G1、G4 的代码闸门已修复并部署，admin/公司级/正常 scoped 语义有回归覆盖。linhong 仍全局的唯一决定性阻塞是 `sys_user_orgs.id=12460.data_scope_level='GROUP'`；按任务红线未写生产数据。只有获批把该行修正为 SITE（并 bump `perms_version`）后，才能完成“linhong 只见东鹏”最终生产验收。

## 7. 数据范围修改不生效（追加取证与闭环）

### 7.1 手工修改实际写入位置

用户详情页“组织与数据范围”组件提交 `PUT /api/org/user-orgs/:id`，payload 为
`{ dataScopeLevel }`；后端 `OrgService.updateUserOrg()` 保存到
`sys_user_orgs.data_scope_level`。这与 G124 的绑定行判定读取的是同一权威字段，故 S1
不成立。角色范围编辑器 `/settings/data-scopes` 是另一套入口，写
`sys_data_scopes.scope_type`；本次 linhong 的两个角色在该表均无规则。

`sys_user_orgs` 的生产 schema 只有 `created_at`，没有 `updated_at`，因此无法用绑定行
更新时间倒推点击时刻；本轮改用 `sys_user.updated_at`、`perms_version` 变化和 nginx/API
请求日志交叉取证。

### 7.2 与上一轮基线的生产差异

2026-08-24 新一轮生产只读 runs `32695530164`、`32695942841` 显示：

| 项目 | 上一轮 `32686156016` | 本轮 `32695530164` | 判定 |
|---|---|---|---|
| `sys_user_orgs.id=12460.data_scope_level` | `GROUP` | `COMPANY` | UI 修改确已写入 G124 权威字段 |
| 绑定组织 | 东鹏 SITE | 东鹏 SITE | 未改变 |
| `sys_user.store_code` | `ALL` | `SITE-DONGPENG-LAYER` | 正规路径同步成功 |
| `sys_user.perms_version` | `444` | `451` | 旧 JWT 应触发 `PERMS_CHANGED` |
| 可见角色 | FARM_MGR + VET | FARM_MGR + VET | 无 `ROLE_ADMIN` |
| `sys_data_scopes` | 0 行 | 0 行 | 无第二个 GROUP 来源 |

生产 API 容器用当前画像签发的新令牌实测：`/api/crud/brd_flocks` 仅返回东鹏 1 群，
`/api/farm/feed/houses` 仅返回东鹏 8 栋。数据库与后端新请求已经达到“只见东鹏”；
S3 不成立。

日志进一步钉死写路径：nginx 在 `11:56:38–11:56:42`、`13:46:02–13:48:24`
记录到多次 `PUT /api/org/user-orgs/12460`，全部 HTTP 200，Referer 均为
`/settings/users/7`；IP 已在审计输出中脱敏。`sys_user.updated_at=2026-08-24
05:48:25.401329+00`（新加坡时间 13:48:25），与最后一次成功 PUT 相差约 1 秒。
这证明用户操作命中了正规组织绑定端点并执行了同步，不是改到了角色规则或无关字段。
绑定行的 `created_at=2026-06-17 13:04:13.912602+00`，该表无 `updated_at`。

### 7.3 用户仍见全量的原因

S2/S4 共同造成旧会话体验不闭环：

1. 组织绑定路径已有进程内 `DataScopeService.invalidate(userId)`，120 秒缓存命中不续期，
   所以单靠该缓存不能解释“一直不生效”。
2. 原实现仅在同步后的 `store_code` 与旧值不同时 bump `perms_version`。只修改同一组织的
   `data_scope_level` 时可能不 bump，旧 JWT 不会被强制失效。
3. DataScope 缓存 key 不含 `perms_version`。即使旧 JWT 被拒、用户重新登录，同角色的新
   JWT 在多 API 实例或未执行本地 invalidate 的实例上仍可能短暂复用旧全局范围。
4. 手机端鸡群和鸡舍列表以“完整 token”为 key 做 5 分钟内存缓存；TTL 内直接返回旧数组，
   完全不访问 API，因此既看不到新范围，也收不到服务端 `401 PERMS_CHANGED`。这与用户感知
   “修改后仍见全部鸡场”直接吻合。

### 7.4 修复

1. 所有用户组织绑定增改删均无条件递增目标用户 `perms_version`；没有主绑定时保留
   `store_code`，但仍使旧 JWT 失效。
2. DataScope 缓存 key 加入 JWT 的 `perms_version`，新令牌不会命中旧版本范围缓存，覆盖
   多 API 实例场景；既有主动 `invalidate(userId)` 保留。
3. 手机端 `getFlocks()` 和 `getFeedHousesDetail()` 移除 5 分钟 SWR 内存缓存。二者是权限
   敏感列表，下一次读取必须真正请求服务端，以触发权限版本对账和统一重登提示。
4. 既有全局 401 拦截器识别 `PERMS_CHANGED`，会清 session 并跳转登录页；本次确认该链已
   就位，无需另造提示机制。

### 7.5 回归标准

- 先缓存 `perms_version=444` 的 GROUP 结果，再将绑定改为 COMPANY 并以版本 445 解析；
  断言不得复用旧缓存，结果仅含东鹏 site/company。
- 即使主组织 `store_code` 不变，范围同步 SQL 也必须递增 `perms_version`。
- 手机端鸡群/鸡舍范围敏感读取不得走 5 分钟内存缓存，确保下一次操作能收到 401 并重登。

本轮仍遵守“生产只读”：没有代用户修改任何生产范围数据。用户已经自行完成的 COMPANY
修改保留原样；由于东鹏 SITE 隶属独立公司，当前生产结果只包含东鹏场。

## 8. COMPANY 范围与鸡舍列表语义

### 8.1 生产只读取证

补充审计使用 GitHub Actions run `32700087053`（成功）；SQL 均在
`PGOPTIONS='-c default_transaction_read_only=on'` 与显式只读事务中执行，API 仅使用按
生产当前画像签发的 10 分钟 linhong JWT 调用两个 GET。审计时生产 checkout revision 为
`90c798750b0ead3653866fe71d32b6a984db7506`，未写生产数据。

linhong 当前仍只绑定 `SITE-DONGPENG-LAYER`，范围为 `COMPANY`，新令牌画像为
`store_code=SITE-DONGPENG-LAYER`、`perms_version=457`、角色
`ROLE_FARM_MGR + ROLE_VET`，无 ADMIN/GROUP 权限。

#### A. 公司范围是否正确展开

`COMP-LAO-XINGCHI` 的完整组织子树只有一个养殖场 SITE：

| 深度 | 组织类型 | 组织编码 | 业务含义 |
|---:|---|---|---|
| 0 | COMPANY | `COMP-LAO-XINGCHI` | 老挝东鹏县星驰农业发展有限公司 |
| 1 | SITE | `SITE-DONGPENG-LAYER` | 东鹏蛋鸡养殖场 |
| 1 | STORE × 4 | `STORE-DP/HS/XB/XC-001` | 门店，不是养殖场 |
| 2 | DEPARTMENT × 7 | `DEPT-SITE-DONGPENG-LAYER-*` | 东鹏 SITE 下部门 |

`brd_farms` 按 `company_code` 对账同样只有一行：
`FARM-DP / 东鹏蛋鸡场 / COMP-LAO-XINGCHI / SITE-DONGPENG-LAYER / ACTIVE`。
孟赛 `LPH_MENGSAI` 属于 `COMP-LAO-AGRI`，不是星驰公司子场。

新令牌生产 API 对账：

| 集合 | 返回 | 归属 | 与组织期望 |
|---|---:|---|---|
| `/api/farm/feed/houses` | 9 栋 ACTIVE | 全部 `FARM-DP` | 相等 |
| `/api/crud/brd_flocks?status=LAYING&status=PEAK&status=DECLINING&limit=100` | 1 群 | `FARM-DP / HOUSE_CS_04` | 相等 |

因此现象 1 **不是 scope 缺陷**：COMPANY 的语义确实是“该公司下所有养殖场”，但生产主
数据中该公司只有东鹏一个养殖场。三维 OR 与 `brd_farms` company 回查均已正确消费
`allowedCompanyCodes=['COMP-LAO-XINGCHI']`；本轮不改 scope 代码，也没有扩大任何权限。

#### B. egglog 鸡舍集合为何只有一栋

页面只调用 `mobileApi.getFlocks()`，接口限定 `LAYING/PEAK/DECLINING`；页面卡片直接来自
返回的 flock，并以 `house_code || flock_no` 为键。因此当前页面显示集合恰好等于返回
flock 的 `house_code` 去重集合。生产实测两者都是 `{HOUSE_CS_04}`。

取证时东鹏 ACTIVE 鸡舍已经从上一轮的 8 栋变为 **9 栋**；逐栋鸡群状态如下：

| 鸡舍 | 鸡群数 | 在产群数 | 状态 |
|---|---:|---:|---|
| `CS0716` | 1 | 0 | GROWING × 1 |
| `HOUSE_CS_03` | 1 | 0 | RETIRED × 1 |
| `HOUSE_CS_04` | 1 | 1 | LAYING × 1 |
| `HOUSE_DP_01`～`HOUSE_DP_06` | 0 | 0 | 无鸡群 |

即 9 栋中 1 栋可录产蛋日报，另外 8 栋被 egglog 隐藏；这不是 DataScope 过滤，而是录入
对象过滤。

### 8.2 产品语义决策

采用方案 **(a)：维持按在产鸡群推导**，不把 egglog 改成全量鸡舍列表。

理由是产蛋日报的业务事实必须能追溯到实际在产鸡群。当前提交链会携带
`house_code + flock_no`，并据此更新鸡群存栏与产蛋率。虽然后端对缺失 `flock_no` 有
`house_code` 兼容回退，且数据库没有强 FK，但利用该兼容路径让“无鸡群鸡舍”录入会失去
精确鸡群归属，并可能在一舍多群时产生歧义；这不是可接受的新业务语义。

方案 (b) 可以用 `/api/farm/feed/houses` 展示 9 栋 scoped ACTIVE 鸡舍，并将无在产群的
8 栋标为空/禁录，但它不会增加任何可录入对象，只会把“鸡舍总览”混进“产蛋录入”。若
未来产品需要这种信息，应新增清晰的鸡舍状态总览，或先定义一舍多群的选择规则，再把
不可录卡片作为辅助信息接入；不应直接改变现有日报事实模型。

最终口径：`/api/farm/feed/houses` 是 COMPANY scope 下的鸡舍总览；`/mobile/egglog` 是
scope 内在产鸡群的产蛋录入清单。两者集合不同是有意的业务约束，不是权限泄漏或数据
范围漏算。

### 8.3 处置与验收

- 现象 1：组织主数据证明星驰公司仅东鹏一场，按正确行为关闭，不改业务代码。
- 现象 2：生产逐栋状态证明只有 `HOUSE_CS_04` 可形成有鸡群归属的产蛋日报，维持现状。
- admin 对照仍为 19 栋 ACTIVE、9 个在产状态 flock；linhong 为 9 栋、1 个在产 flock，
  证明 COMPANY 过滤生效且 admin 未回归。
- 本轮唯一代码库变更是扩充生产只读审计 workflow 的证据查询；无应用构建物、schema、
  迁移或生产部署。

## 9. DECLINING 显示核查

### 9.1 结论：W1，生产当前没有下降期鸡群

决定性只读取证为 GitHub Actions run `32701748735`（成功），审计窗口为
`2026-08-23 07:29:46Z` 至 `2026-08-24 07:29:46Z`。SQL 使用
`PGOPTIONS='-c default_transaction_read_only=on'` 和显式只读事务；日志与 API 访问记录
仅作读取。取证时数据库状态分布为：

| 状态 | 数量 |
|---|---:|
| GROWING | 2 |
| LAYING | 8 |
| PEAK | 1 |
| RETIRED | 1 |
| DECLINING | **0** |

全量 12 群逐行清单同样没有 DECLINING。东鹏三群分别为：

| flock_no | house_code | 当前状态 | current_qty | updated_at（UTC） |
|---|---|---|---:|---|
| `FK-MRMS8EKGNTU` | `CS0716` | GROWING | 150 | `2026-08-23 03:15:14.428` |
| `FK-MT6LRP7S1AF` | `HOUSE_CS_03` | RETIRED | 100 | `2026-08-24 06:45:51.907` |
| `FK-MT6VCNMDURN` | `HOUSE_CS_04` | LAYING | 1000 | NULL |

因此当前 egglog 无法显示下降期鸡群的直接原因是数据库期望集为空，不是三态查询或
breeding scope 把已有 DECLINING 行过滤掉。W2、W3 的前提 `DECLINING>0` 均不成立。

### 9.2 用户改状态的操作确实落库，但随后被覆盖

生产 API 日志完整记录了同一鸡群 `FK-MT6LRP7S1AF` 的连续更新（UTC；新加坡时间加 8
小时）：

| 时间 | 请求 payload 中的 status | API service 结果 |
|---|---|---|
| `06:44:29.577` | GROWING | success |
| `06:45:29.301` | RETIRED | success |
| `06:45:33.283` | PEAK | success |
| `06:45:43.070` | **DECLINING** | **success** |
| `06:45:51.907` | RETIRED | success |

对应 nginx access log 中 `14:44:29`、`14:45:29`、`14:45:33`、`14:45:43`、
`14:45:51`（新加坡时间）的 PUT 均为 HTTP 200。尤其是 DECLINING 成功写入后，egglog 在
`14:45:47` 发起三态 GET 并得到 HTTP 200；4 秒后该群又被 PUT 为 RETIRED。最终数据库
`updated_at=06:45:51.907Z` 与最后一次 RETIRED 写入精确一致。

这组生产证据同时验证了管理端 PUT 会携带 status、后端接受 DECLINING、数据库写入成功。
它比“本地把测试群改为 DECLINING”更贴近报告现场，故不再用本地模拟替代已发生的生产
事实，也未写任何生产数据。

### 9.3 处置

- 不修改业务代码：`LAYING + PEAK + DECLINING` 查询口径有效，写入链也有效；无可复现缺陷。
- 不部署应用：本轮没有应用构建物、schema 或迁移变更。
- 保留只读审计增强：状态分布、全量鸡群清单和 POST/PUT/PATCH 日志已加入 workflow，便于
  后续同类问题一次取证。
- 请操作方确认 `2026-08-24 14:45:51`（新加坡时间）为何再次选择并保存 RETIRED。若目标
  是让 `HOUSE_CS_03` 出现在产蛋录入，应由有权限的用户把该鸡群最终状态保存为 DECLINING，
  并确认没有紧随其后的 RETIRED 保存；本报告不代用户修改生产业务数据。
