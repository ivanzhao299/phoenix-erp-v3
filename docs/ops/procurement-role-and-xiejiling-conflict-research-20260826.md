# 采购员仓库权限与 xiejiling 身份冲突调研（2026-08-26）

> 范围：只读调研与方案，不实施。未改代码、schema、生产数据或授权。
>
> 生产证据：GitHub Actions `Warehouse Domain Production Readonly Audit` run
> `32940369672`（2026-08-26 14:56 SGT，成功）。日志先输出
> `READONLY_GUARD | phoenix_erp | phoenix_v3 | on`，查询同时使用
> `PGOPTIONS=-c default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`。
> 本报告把该 run 记为 **P-20260826**；历史 run 或仓库文件不冒充当前生产。

## 1. 结论摘要

1. **现行机制不是“采购角色 → 采购仓”。** `ROLE_PRC_BUYER` 只提供菜单及 scope
   等级；公司级用户的仓库范围由公司绑定展开为该公司全部 `OPERATIONAL` 仓。
   `qiantao` 因绑定 `COMP-LAO-AGRI`，当前有效集合是孟赛 7 个操作仓，包含与采购
   无关的 `EGG_FARM/EGG_SALES/FINISHED`；其 `sys_user_warehouse_scopes` 没有逐仓行。
2. **把采购员的操作/选仓范围限定为 `FEED/MEDICINE/PURCHASE_RECV/RAW_MATERIAL`
   有合理性，但不应直接把所有库存只读查询也一刀切掉。** 推荐把“可收货/可写仓”和
   “库存只读参考仓”分开；前者按 `usage_type` 规则收敛，后者按菜单和业务场景决定。
3. **近期可用显式授权模板，但现行 COMPANY 算法是“公司全仓 ∪ 显式仓”，给
   qiantao 写 4 行不会收窄任何权限。** 要使模板生效，必须先增加角色/用户限制规则，
   或把账号改成 SITE 语义；后者会混淆组织身份，不建议为权限绕路而改组织。
4. **xiejiling 的冲突是双轨写入漂移，不是当前仓库 DataScope 串场。** 当前生产：
   `sys_user.store_code=SITE-MENGSAI-LAYER`，而唯一组织绑定是
   `SITE-DONGPENG-LAYER`。仓库 DataScope 只认后者；但 legacy 值仍进入 JWT，并被
   Generic CRUD 普通表、农场兼容路径和 POS/门店路径消费，所以它不是“纯展示脏列”，
   仍有旧业务误过滤风险。
5. **当前活跃账号同类冲突全量只有 xiejiling 1 个。** 这是 P-20260826 对全部 ACTIVE
   用户的矩阵比对结果；规则为 legacy 值是 `SITE-*` 且不等于绑定 SITE。非 SITE 旧码、
   无绑定和多绑定异常是另一类问题，不混入本统计。

## 2. 采购员角色考古与生产现状

### 2.1 qiantao 完整绑定

P-20260826 当前生产行：

| 项 | 当前值 |
|---|---|
| user | `159 / qiantao / 钱涛 / status=1(ACTIVE)` |
| legacy store | `COMP-LAO-AGRI` |
| 角色 | `ROLE_PRC_BUYER`, `ROLE_SUPPLIER_MASTER_MGR` |
| 组织 | `COMP-LAO-AGRI`（COMPANY，主绑定；旧快照含 `data_scope_level=COMPANY`） |
| 显式 farm / warehouse | 均无；生产仓授权表总体为 `44 rows / 8 users / 11 warehouses / 0 orphan` |
| WMS 菜单 | `MENU_WMS_VIEW` |
| 90 天 WMS 足迹 | `wms_inbound × LPH_MS_EGG_FARM × 1`，时间 `2026-07-05 02:26:11.972565+00` |

完整采购菜单来自角色配置：`ROLE_PRC_BUYER` 是主采购员，拥有采购申请/订单/收货/
发货/付款的 `V,C,E,X` 及采购主数据、工作流权限（`docs/g84-procurement-go-live-fixes.md:8-15`）。
生产角色与组织快照也可交叉核验
`docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/user_role_inventory.txt:28`
和 `user_org_store_scope_inventory.txt:9`；本报告的账号/角色末态以 P-20260826 为准。

### 2.2 所有采购相关角色与成员

生产角色名及中文标签的可检索口径是 `role_code ILIKE '%PROCUREMENT%' OR
role_code ILIKE '%PRC%' OR role_name_zh LIKE '%采购%'`。当前业务采购员角色为
`ROLE_PRC_BUYER`；未发现另一套 `ROLE_*PROCUREMENT*` 操作角色。P-20260826 的 ACTIVE
成员全量为：

| 角色 | ACTIVE 成员 | 组织/legacy 现状 |
|---|---|---|
| `ROLE_PRC_BUYER` | `qiantao` | `COMP-LAO-AGRI` / `COMP-LAO-AGRI` |
| `ROLE_PRC_BUYER` | `fanzhenhao` | `DEPT-HQ-PROCUREMENT` / `ALL` |
| `ROLE_PRC_BUYER` | `wanglejin` | `DEPT-HQ-PROCUREMENT` / `ALL` |

三人同时都有 `ROLE_SUPPLIER_MASTER_MGR`。区域经理、审批人和供应商主数据经理虽参与
采购链，但不是“采购员仓库操作角色”，不应因流程参与自动获得采购仓写权限。

### 2.3 当前 qiantao 为什么看见 7 仓

`DataScopeService.resolve()` 对非 SITE 的 COMPANY 绑定查询同公司所有 ACTIVE、
`domain='OPERATIONAL'` 仓（`apps/api/src/modules/org/services/data-scope.service.ts:267-283`），
再与组织直接仓和 `sys_user_warehouse_scopes` 并集（同文件 `:189-196,286-328`）。角色
只通过 `sys_data_scopes(role_code,module_code,scope_type)` 决定
`SELF/PROJECT/COMPANY/REGION/GROUP`，表结构没有仓码或仓库类型
（`apps/api/src/modules/org/entities/sys-data-scope.entity.ts:11-36`）。用户显式仓表也只有
`user_id/warehouse_code`，没有角色或 type
（`apps/api/src/modules/org/entities/sys-user-warehouse-scope.entity.ts:10-24`）。

所以 qiantao 的有效仓集合是：

| warehouse | usage(type) | 是否采购域 |
|---|---|---|
| `LPH_MS_FEED` | FEED | 是 |
| `LPH_MS_MEDICINE` | MEDICINE | 是 |
| `LPH_MS_PURCHASE` | PURCHASE_RECV | 是 |
| `LPH_MS_RAW` | RAW_MATERIAL | 是 |
| `LPH_MS_EGG_FARM` | EGG_FARM | 否 |
| `LPH_MS_EGG_SALES` | EGG_SALES | 否 |
| `LPH_MS_FINISHED` | FINISHED | 通常否，除非采购兼管成品 |

结论：系统当前**没有角色→仓库或角色→仓库类型映射机制**。现有 44 条显式授权属于
8 个现场账号；它们不会替代 qiantao 的公司全仓展开。

## 3. 采购流程实际怎样用仓

### 3.1 新采购链（权威路径）

- 采购申请明细 `prc2_request_items.warehouse_code` 可空，申请转 PO 时逐行复制到
  `prc2_order_items`（`requests.service.ts:125-144`；`orders.service.ts:443-460`）；PO
  头没有仓字段（`prc2-order-item.entity.ts:63-64`）。
- 收货头 `prc2_receipts.warehouse_code` 在 DB/DTO 可空，但创建与确认都会调用
  `assertWritableWarehouse`，运行时实质必填（`receipts.service.ts:141-152,215-272`；
  `create-receipt.dto.ts:22-25`）。收货头仓，而不是 PO 行仓，最终决定库存入仓。
- 确认收货调用统一 `WmsService.inboundFromReceipt()`
  （`receipts.service.ts:296-305`）。策略固定为 `PURCHASE`，落账来源
  `PURCHASE_RECEIPT/PROCUREMENT/PURCHASE_INBOUND`
  （`wms-inbound-policy.ts:40-49`）；写边界要求仓存在、为 `OPERATIONAL` 且在用户
  allowedWarehouseCodes 内（`wms.service.ts:44-65,438-525`）。
- 当前校验只验证“可写操作仓”，**不验证仓的 usage 是否与采购匹配**。因此 qiantao
  可以把采购收货选入 `EGG_FARM/EGG_SALES/FINISHED`，这正是设计缺口。

旧 `procurement.service.ts:250-269` 仍有直接插 `inv_batches` 的收货路径，默认 `WH-B`
且没有统一 policy/DataScope 校验；对应路由在 `procurement.controller.ts:77-87`。任何
权限收敛实施前都必须先确认旧入口是否仍可达并同步封口，否则新规则会被旁路。

### 3.2 四仓与采购流的真实耦合

代码没有把 `LPH_MS_PURCHASE/RAW/FEED` 三个具体仓码硬编码到采购服务；它们目前只是
主数据 `type`。唯一精确硬编码是养殖药品服务的 `LPH_MS_MEDICINE`
（`farm-medicine.service.ts:6-11`）。采购链通过用户选定的收货头仓耦合，而非自动按
物料映射。

- `PURCHASE_RECV`：最适合作为到货检验/暂存入口，但是否必须独立取决于是否需要待检、
  拒收、越库及后续移库。当前确认收货直接写 `AVAILABLE`，没有强制“暂存→质检→目标仓”。
- `RAW_MATERIAL`：原料/包材最终存放仓，采购入库合理。
- `FEED`：饲料采购与养殖领用边界；出库 policy 已有 `FEED_DISTRIBUTION`。
- `MEDICINE`：药品/疫苗采购合理，但还受养殖药品专用服务约束。

P-20260826 的 90 天 WMS 记录中 qiantao 唯一一笔是 `EGG_FARM` 入库；这证明现状允许
越域，但单条记录不能证明其职责确需蛋品仓。上一轮业务裁定也标为“无逐仓职责依据”
（`docs/ops/warehouse-type-and-permission-research-20260825.md:355-368`）。

## 4. 采购员是否应限定四类 usage

**裁定：写/操作范围应限定；只读库存参考范围不宜未经业务确认一起砍掉。**

支持论据：最小权限；阻止采购收货误入蛋品/成品仓；规则可跨 SITE 复用；新建仓自动
继承规则，不依赖人工逐账号补行；与既有 G15 usage 值域一致。反对或待确认点：采购员
可能需要看成品库存以判断采购计划；采购兼仓管的小团队可能合法跨域；服务采购不入仓；
`PURCHASE_RECV` 当前没有待检状态机，强制先入暂存仓会增加一次移库；物料与目标 usage
尚无可校验映射，单凭角色只能限制集合，不能保证某 SKU 进正确仓。

正确建模应使用正交维度：`facility_class` 描述设施、`usage_type` 描述库存用途、
capability 描述能力；草案和值域见
`docs/ops/warehouse-type-and-permission-research-20260825.md:188-209`。采购规则挂
`usage_type`，不挂 facility，也不把 `domain` 当 usage；当前生产只有 legacy `type` 和
身份域 `domain`，双维度仍冻结（同报告 `:320-325`）。

## 5. 采购权限候选方案

### A. usage_type 驱动的角色仓库规则（目标方案，推荐）

建立“role + action/read-write + allowed usage”规则：`ROLE_PRC_BUYER` 的采购收货写范围
为上述四类；库存只读范围另配。DataScope 先得公司/SITE候选仓，再与角色 usage 集合
求交；管理员例外仍不得绕过业务仓 usage 校验。

- 优点：语义稳定、跨公司复用、新仓自动纳管、可审计。
- 前置：facility/usage/capability 落地；历史 `type` 映射；采购物料→目标 usage 规则；
  旧采购入口封口；明确多角色取并集还是按当前动作取交集。
- 首批影响：3 名 `ROLE_PRC_BUYER`；实际有公司仓集合的是 qiantao。总部 DEPT 两账号
  当前无 company/site，需单独定义跨公司采购范围，不能因 `store_code=ALL` 放大全局。
- 风险：若把读写共用一个 allowedWarehouseCodes，会误伤库存参考查询。

### B. 近期显式授权模板（过渡方案）

模板目标可列为 `qiantao → LPH_MS_FEED/MEDICINE/PURCHASE/RAW`，但必须同时让 COMPANY
账号进入“显式仓覆盖公司展开”模式；**仅插 4 条在当前并集算法下无效**。

- 优点：无需等待完整类型模型，授权结果直观，可快速复核。
- 缺点：逐账号维护；新增仓不会自动进入；角色变更易残留；覆盖/并集语义需先改清楚。
- 前置：业务确认 qiantao 不兼仓管；明确 read/write；为模板变更设审批与差异审计。
- 影响：至少 qiantao；是否给 fanzhenhao/wanglejin 跨公司仓必须另行批准。

### C. 单据动作级 usage 校验 + 保持库存只读公司范围（低风险过渡，推荐先行顺序）

在采购收货 create/confirm 和通用采购入库入口校验目标仓 usage 属于四类；库存列表仍按
现有菜单与公司范围只读。这样先阻止错误落账，再逐步收窄浏览面。

- 优点：直击数据完整性风险，不影响采购计划的跨仓库存参考。
- 缺点：不是完整仓库保密隔离；所有写入口必须覆盖，旧链尤其危险。
- 前置：定义 service/non-stock、退货、采购暂存例外；建立入口矩阵测试。

建议顺序为 **C → A**；B 只作为已确认人员的小规模过渡，不单独实施。

## 6. xiejiling 生产事实与冲突链

### 6.1 当前生产身份

P-20260826：`xiejiling / 谢继领 / ACTIVE`；角色 `ROLE_FARM_MGR,ROLE_VET`；legacy
`store_code=SITE-MENGSAI-LAYER`；组织绑定 `SITE-DONGPENG-LAYER`，展开 SITE 也是
`SITE-DONGPENG-LAYER`；无显式 farm/warehouse；WMS 菜单为
`MENU_INV_BATCH, MENU_INV_LEDGER, MENU_INV_SOURCE_MODE, MENU_MD_WAREHOUSE,
MENU_WMS_INOUT, MENU_WMS_ISSUE, MENU_WMS_MASTER, MENU_WMS_OP, MENU_WMS_VIEW`。

当前 warehouse DataScope 对 SITE 用户采用“绑定 SITE 的 OPERATIONAL 仓 ∩ 显式授权”
（`data-scope.service.ts:267-297`）。xiejiling 无显式仓，故当前有效仓集合为空，不会因
legacy 孟赛码获得孟赛 7 仓。最近 90 天的 WMS operator 足迹中没有 xiejiling。

“最后活跃时间”不能可靠给出：当前 `sys_user` 证据未证明有 last-login 列；
`sys_operation_logs` 虽有 user/time schema（`20260530_create_missing_sys_tables.sql:146-170`），
但通用审计拦截器的 repository/save 仍被注释
（`apps/api/src/common/interceptors/audit-log.interceptor.ts:70-96`）。因此本报告只给出
“90 天 WMS 无足迹”，不把缺日志写成“90 天未登录”。

### 6.2 根因时间线

1. 初始 RBAC 只有 `sys_user.store_code` 与旧 `sys_store`，字段承担门店/机构范围
   （`apps/api/ddl/01_create_rbac_tables.sql:1-17,64-76`）。
2. 2026-05-30 引入 `sys_user_orgs`，注释即为非管理员数据范围权威
   （`20260530_create_missing_sys_tables.sql:83-104`）。次日 seed 明说它替代 storeCode
   fallback（`20260531_user_org_bindings.sql:1-15`）。
3. G76 明确“双轨打架”，DataScope 删除无绑定时的 store_code fallback；权威规则是
   “公司范围只由 sys_user_orgs 决定”，POS legacy 列降级
   （`docs/g76-rbac-org-scope-architecture.md:8-10,21-29,40-48,79-86`）。
4. G114 重绑在岗用户时先删旧 `sys_user_orgs` 再按期望插入
   （`20260614_g114_user_org_alignment.sql:1-15,49-99`），但没有同步 legacy 列。
5. G122 因 32 名用户两列漂移而批量回填主组织到 store_code
   （`20260615_g122_sync_user_store_code.sql:2-27`）；G129 又让组织管理 API 每次绑定
   后同步主组织并 bump perms_version（`org.service.ts:511-584`）。
6. 仍存在只写 legacy 的用户 API：`system-users.controller.ts:197-252,375-393`；BFF 的
   用户写路径则可独立替换 `sys_user_orgs`（`bff.controller.ts:613-704`）。因此历史 seed、
   批量重绑或绕过 `OrgService` 的端点都可能让两值再次漂移。

**对 xiejiling 的最可能具体成因**：旧身份原为孟赛（历史角色矩阵也曾把其定义为孟赛
场长/技术/防疫负责人，`docs/production-initialization-review-package.md:52-54`）；后来
组织权威绑定被改成东鹏，但该次写入没有经过会调用 `syncPrimaryStoreCode()` 的
OrgService，或发生在 G129 前，故 legacy 值留在孟赛。现有只读证据不能唯一指认操作者
和时刻：操作日志写入链不完整，也未发现可证明该绑定变更的审计行。这里明确标为
**由代码与历史顺序支持的根因推断**，不是伪造的审计结论。

### 6.3 实际影响

- 仓库 DataScope：只认东鹏绑定，且因零显式仓而为空；不是孟赛越权 bug。
- legacy 仍进 JWT：`auth.service.ts:96-100,262-283`，`jwt.strategy.ts:86-99`。
- Generic CRUD 普通表仍按 JWT store_code 过滤/补写；WMS/库存事实已改用
  allowedWarehouseCodes（`generic-crud.controller.ts:396-495`）。
- 农场服务仍把 `SITE-*` legacy 值与 DataScope farm/site 集合并用
  （`farm.service.ts:90-126`），农场销售也用 JWT storeCode
  （`farm-sales.service.ts:47-76`）；POS/日结以它作为门店值
  （`store.service.ts:52-115,243-249`）。

所以冲突同时包含：新仓库范围 fail-closed、旧农场/通用表可能仍按孟赛过滤。结论是
“主权限已接管，但 legacy 消费未清零，仍是功能与错误归属风险”，不能降格为纯脏数据。

### 6.4 同类冲突全量

P-20260826 对全部 ACTIVE 用户按 `legacy store_code LIKE 'SITE-%' AND bound SITE IS NOT
NULL AND store_code <> bound SITE` 比对：

| username | legacy store_code | 权威 SITE 绑定 | 分类 |
|---|---|---|---|
| `xiejiling` | `SITE-MENGSAI-LAYER` | `SITE-DONGPENG-LAYER` | 唯一冲突 |

计数 `1`。停用账号、非 SITE legacy 码、多 SITE 绑定和“无绑定”不在这个同类定义内；
若实施退役，应另跑全状态数据质量审计，不把本次 ACTIVE 结论外推。

## 7. xiejiling 修复候选（均未执行）

### X-A. 以组织绑定为权威，修正 legacy 列（近期推荐）

待业务先确认 xiejiling 的真实任职确为东鹏；若确认，则计划清单为：

```text
sys_user(user_id=<生产只读复核>, username=xiejiling):
  store_code SITE-MENGSAI-LAYER -> SITE-DONGPENG-LAYER
  perms_version + 1，强制旧 JWT 失效
sys_user_orgs: 不改（SITE-DONGPENG-LAYER 为权威）
roles: 不改
warehouse scopes: 不自动新增；按东鹏职责另行审批
```

- 优点：恢复两轨兼容，旧农场/CRUD 不再指向孟赛；改动最小。
- 风险：若组织绑定本身录错，会把错误扩散到 legacy；必须先由人事/场站负责人确认。
- 回滚：保存 before image；单事务恢复旧 store_code/perms_version，并撤销本轮产生的 token
  版本变化。实际执行必须另走审批 workflow，本轮不执行。

若业务确认其实际仍属于孟赛，则反向候选是把 `sys_user_orgs` 恢复孟赛，并由标准
OrgService 同步 legacy；这会真实改变 DataScope，风险更高，不应仅凭旧列自动决定。

### X-B. legacy 列退役（目标方案）

先列出并逐一迁移所有读取/写入点：JWT 兼容字段、Generic CRUD 普通表、farm/farm-sales、
POS/store，以及后台只写 store_code 的用户端点；改为明确的 `store_id` 或组织/SITE
DataScope。消费点清零后停止同步与写入，观察期内只做漂移告警，最后再提出 drop schema
的独立迁移。

- 优点：消除双轨根因，组织、SITE、门店语义不再挤在一个字符串列。
- 缺点：范围大，涉及旧表行归属和 JWT 兼容；不能一次 DROP。
- 前置：消费矩阵、旧数据归属回填、双读比对、token 兼容期、POS 专用门店模型。
- 回滚：停写前保留双读和影子比对；切换后可 feature flag 回旧读，schema 删除必须最后
  且另备份映射。

### X-C. 守护性一致性检查（配合 A/B）

在组织绑定写路径统一调用一个同步服务，并加定时/CI 数据质量检查：有且仅有一个主
SITE 时 legacy SITE 必须相等；POS 用户用专用 store 规则；不允许 API 各自写一半。
它能防复发，但不是 xiejiling 当前数据的替代修复。

## 8. 建议决策与实施前清单

1. 业务确认 qiantao 是“采购员”还是“采购兼仓管”；确认库存只读是否需成品仓。
2. 采购仓写范围采用 C 先封动作、A 后建模；不要把 4 条显式授权当作当前算法下的收窄。
3. 业务确认 xiejiling 当前真实 SITE。若东鹏为真，按 X-A 只改 legacy 并刷新 token；
   若孟赛为真，才更正组织绑定并重新计算 DataScope。
4. 实施前专用只读 preflight 应再次输出 user_id、before image、主绑定唯一性、角色、
   project/farm/warehouse scopes、受影响 JWT 版本及精确回滚 SQL；变更另单审批。
5. 中期执行 X-B + X-C，直到 `store_code` 权限消费为零，再讨论 schema 退役。

本轮完成的是取证与方案；以上候选均未写入生产，也未新增授权。
