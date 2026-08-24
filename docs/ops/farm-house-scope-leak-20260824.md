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
