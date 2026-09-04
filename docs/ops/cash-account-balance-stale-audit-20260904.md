# 资金账户余额写后不实时刷新核查（2026-09-04）

## 1. 范围、结论与边界

本轮只做静态核查，不修改前后端业务代码。核查对象是两条线上实测链路：财务结算中心应收收款，以及 Terminal 直营店收银。

结论：两处症状属于同一根因家族，且是候选 1 与候选 2 的叠加：

1. `CashAccountSelector` 把权威接口返回的 `currentBalance` 嵌入 option label；lookup 结果按完整 URL 缓存 5 分钟。
2. 收款/收银成功后只刷新本业务列表或汇总，没有失效资金账户 lookup 缓存，也没有触发选择器重新加载。
3. 不是候选 3。两处 label 都来自 `/api/lookup/cash-accounts` 对 `fin_cash_accounts.current_balance` 的实时查询映射，不是 AR/POS 列表接口中的余额快照（`apps/api/src/modules/product-master/controllers/lookup.controller.ts:727-747`）。后端收款、收银均有实际更新账户余额的代码链。

浏览器整页刷新会重新初始化前端模块内存缓存，因此再次请求即可看到新余额；这一行为与用户实测一致。

## 2. A：数据链定位

### 2.1 公共选择器与缓存

- `CashAccountSelector` 根据 `currencyCode/companyCode` 组成 `/lookup/cash-accounts?...`，读取 `currentBalance`，并拼成 `账户名（账户编码 币种）｜余额 ...`（`apps/web/src/components/shared-selectors/MasterDataSelectors.tsx:164-196`）。
- `lookupArr()` 的 key 是 `lookup:${path}`；query string 属于 key，因此示例 key 是 `lookup:/lookup/cash-accounts?currency=CNY&company=...`（同文件 `:29-37,177-184`）。
- `cachedGet()` 是模块内 `Map` 缓存并做 in-flight 去重；`TTL.lookup` 为 5 分钟（`apps/web/src/lib/request-cache.ts:18-43,59-64`）。
- `ScopedSelect` 仅在挂载或序列化后的 `reloadDeps` 改变时执行 loader。资金账户选择器只传 `[currencyCode, companyCode]`，余额变化不是 reload dependency（`MasterDataSelectors.tsx:57-85,171-182`）。
- `invalidateCache(prefix?)` 已支持 prefix 删除，并用全局 `generation` 阻止失效前的在途请求回填；机制不是缺失，缺的是余额业务写成功后的调用（`request-cache.ts:45-56`）。
- 当前明确的业务写后失效范例只有物料快速新建：`invalidateCache('lookup:/lookup/materials')`（`apps/web/src/components/shared-selectors/MaterialPicker.tsx:181-211`）。资金余额写路径未发现对应调用。

### 2.2 应收账款：1000 → 收款 500 → 仍显示 1000

显示位置不是 AR KPI。AR 页中的“账户余额”只存在于录入收款弹窗的 `CashAccountSelector` option label；AR KPI/列表展示的是应收余额，页面不直接请求资金账户列表或账户 summary（`apps/web/src/app/(admin)/finance2/ar/page.tsx:590-599,913-921,980,1087-1088`）。

写入链：

1. 前端先 `POST /api/v2/finance/ar/receipts` 创建草稿，再 `POST /receipts/:id/confirm`；代码注释也明确 confirm 才进入资金账户流水/余额更新（`ar/page.tsx:485-513`）。
2. 后端确认收款锁定对应账户，调用 `CashAccountsService.applyBalance(+amount)`，并写 `AR_RECEIPT` 入账流水（`apps/api/src/modules/finance-v2/services/ar-receipts.service.ts:324-366`）。
3. `applyBalance` 更新 `fin_cash_accounts.current_balance` 并返回新余额（`apps/api/src/modules/finance-v2/services/cash-accounts.service.ts:440-456`）。

成功后的前端处理：

- 顶部“录入收款”只执行 `loadReceipts(1)`、`loadSummary()`、切换 receipts tab（`ar/page.tsx:1293-1297`）。
- 发票详情内录入收款只重载详情、发票列表与 AR summary（`ar/page.tsx:813-817,1298-1301`）。
- `loadSummary()` 请求的是 `/api/v2/finance/ar/summary`，不是现金账户余额接口（`ar/page.tsx:913-921`）。
- 弹窗关闭后再次打开，选择器虽重新挂载，但相同公司/币种 URL 会命中尚未过期的 5 分钟 lookup 缓存。

根因分类：**候选 1 + 候选 2；不是候选 3。**

### 2.3 Terminal 直营店收银

- Terminal 使用 `CashAccountSelector valueField="id" companyCode={companyCode} currencyCode={currency}`（`apps/web/src/app/(terminal)/terminal/store-pos/page.tsx:41`）。label 仍由公共选择器的 `currentBalance` 生成。
- 现金/混合支付调用 `/pay-cash` 或 `/pay-mixed`。成功后清购物车、清实收金额并 `await refresh()`（同文件 `:33`）。
- `refresh()` 只并行读取商品、班次、最近销售，不读取现金账户，也不改变选择器的 company/currency reload key（同文件 `:29`）。
- 后端现金/混合支付调用 `writeCashTransaction`（`apps/api/src/modules/store-pos/services/store-pos.service.ts:423-470,522-547`）；该方法执行 `current_balance = current_balance + amount ... RETURNING current_balance`（同文件 `:985-1024`）。

因此数据库余额已增加，但已挂载的 selector options 保留旧 state；即便触发 loader，相同 lookup URL 在 5 分钟内也可返回旧缓存。

根因分类：**候选 1 + 候选 2；不是候选 3。**

管理端直营店收银同样存在：支付成功只 `clearCart()`、`loadSummary()`、`loadCurrentShift()`，没有资金账户失效/重取（`apps/web/src/app/(admin)/store-pos/page.tsx:602-628`）；账户选择器位于同文件 `:1235-1246`。

## 3. B：request-cache 现状与根因边界

| 项目 | 已核实事实 | 对本问题的含义 |
|---|---|---|
| 缓存介质 | 模块内 `Map`，非 local/session storage（`request-cache.ts:18-22`） | 整页刷新后旧缓存消失 |
| TTL | lookup 5 分钟（`:59-64`） | 同 URL 最长可显示 5 分钟旧余额 |
| key | `lookup:${完整 path}`（`MasterDataSelectors.tsx:29-37`） | 公司/币种不同则不同 key |
| 并发栅栏 | `generation` + 清空 inflight（`request-cache.ts:23-55`） | 已具备安全失效基础 |
| 登录/登出 | 显式 login/logout、影子登录切换会全量失效（`apps/web/src/contexts/AuthContext.tsx:180-216`; `apps/web/src/lib/impersonate.ts:11-26,62-73`） | 身份切换治理不能替代业务写后失效 |
| 余额业务写 | 未发现资金相关成功路径调用 `invalidateCache` | 本轮两个症状的直接缺口 |

后端余额权威语义无需调整。本轮证据只支持修复前端缓存失效和重取契约。

## 4. C：待用户确认的修复方案

### 4.1 推荐方案：专用失效 + 显式 reload token

建议在用户确认后采用两层动作，二者缺一不可：

1. 在公共层封装 `invalidateCashAccountLookups()`，失效 prefix `lookup:/lookup/cash-accounts`。完整 URL 带 query，prefix 可一次覆盖全部公司/币种组合。
2. 为 `CashAccountSelector/ScopedSelect` 增加显式 `refreshKey`（或同义 token）。每个实际改变余额的 mutation 成功后，先失效，再递增本页 token，使已挂载选择器立即重新执行 loader。

只做 invalidate 不够：已挂载选择器的 options 已在 React state 中，删除 Map 不会自动重跑 effect。只改 refreshKey 也不够：loader 仍可能命中旧 Map。两层组合才能保证当前页面立即显示新余额。

建议覆盖所有真正改变 `fin_cash_accounts.current_balance` 或现金流水余额的成功动作：

- AR 收款 confirm；
- AP/采购付款确认；
- 报销付款；
- 资金调拨 execute；
- 股东返还结算 execute；
- Admin/Terminal POS 的 cash、mixed payment 与实际现金退款；
- 资金账户手工流水的新增、编辑、删除、批删、改挂；
- 账户新建、编辑、冻结/恢复/关闭（虽然不一定改余额，但会改变 selector options/label）。

不应在只创建草稿、提交审批、驳回、质检等尚未写现金账户的动作上无差别刷新。

### 4.2 其他方案评估

| 方案 | 评价 |
|---|---|
| 变更响应直接回写余额 | 单页面最快，但各后端响应结构不统一，且无法同步同页其他账户或其他已挂载消费者；可作局部优化，不宜作为唯一契约。 |
| 下拉不显示余额，选中后单独查询 | 能降低“option 快照”误导，但报销、调拨等业务确实依赖选择时余额；会新增端点调用和 UI 状态，仍需处理写后刷新。 |
| 所有 lookup 完全取消缓存 | 能绕开缓存命中，但已挂载 selector 仍不会自行重载，并会牺牲所有低频主数据的既有缓存收益。 |
| 引入 React Query/SWR 全局缓存 | 能提供标准 invalidation，但当前管理端未建立该体系；仅为本问题引入，迁移面过大。 |

### 4.3 同款资金余额消费者清单

| 消费位置 | 显示内容/风险 | 证据 |
|---|---|---|
| 公共 `CashAccountSelector` | option label 含 `currentBalance`，5 分钟 lookup 快照 | `MasterDataSelectors.tsx:164-196` |
| AR 收款 | 选项余额；confirm 后不刷新 | `finance2/ar/page.tsx:485-513,590-599,1293-1301` |
| Admin/Terminal POS | 选项余额；支付/退货后不刷新 | `store-pos/page.tsx:602-628,1235-1246`; `terminal/store-pos/page.tsx:29,33,36,41` |
| 报销付款 | 选项及 `raw.currentBalance` 余额校验；付款后只刷新报销数据 | `finance2/reimbursements/page.tsx:145-160,212-221,454-458` |
| 资金调拨 | 转出账户 `raw.currentBalance` 快照；execute 后只刷新调拨列表 | `finance2/fund-transfers/page.tsx:226-242,314-330` |
| 采购付款 | 付款账户选项；确认付款后只刷新付款列表 | `procurement2/payments/PaymentForm.tsx:272-280,373-375`; `procurement2/payments/page.tsx:239-258` |
| 股东资金 | 结算账户选项/详情账户候选；execute 后未重取账户 | `finance2/shareholder-funds/page.tsx:436-439,494-502,540-555,710-714` |
| 资金账户中心 | 本页列表/KPI会 `load()`，但未同步失效公共 selector lookup | `finance2/cash-accounts/page.tsx:786-823,1058-1083,1118-1135` |
| 财务首页/报表 | 只读 KPI，靠进入页面或手动刷新，无跨页面写入通知 | `finance2/page.tsx:257-329,476-480`; `finance2/reports/page.tsx:399-412,774-801,1241-1281` |

### 4.4 同根因的库存余量清单

这是同一缓存设计家族，不纳入本次资金余额修复范围，但建议后续单列治理：

- `BatchSelector` 把 `qty_available` 嵌入 label，使用同一 5 分钟 lookup 缓存，且没有 reload dependency（`MasterDataSelectors.tsx:445-460`）。
- `CrudForm type="batch"` 的消费者包括质检产品/反向追溯、不合格品、报损、盘点、出库（`apps/web/src/components/ui/CrudForm.tsx:305-313` 及相应页面字段配置）。
- 出库确认只刷新出库单列表，入库确认只刷新入库单列表，均未失效批次 lookup（`warehouse/outbound/page.tsx:246-259`; `warehouse/inbound/page.tsx:141-155`）。
- 仓库看板和门店库存页是停留页面快照，仅有手动刷新；Dashboard KPI 每 60 秒轮询，属于有界延迟（`warehouse/page.tsx:154-170,239-244`; `store/inventory/page.tsx:11-26`; `dashboard/_components/DashboardKPIs.tsx:201-227`）。
- POS 商品卡当前不展示库存数量，未发现“同页库存数字写后不刷新”的直接证据（`store-pos/page.tsx:39-58,930-970`）。

## 5. D：测试计划（实施后执行）

### 5.1 单元/组件测试

1. `request-cache`：预置两个不同 query 的 cash-account key，调用专用 prefix 失效后均重新执行 loader；非 cash lookup 不受影响。
2. generation 竞态：失效前启动旧请求，失效后启动新请求；旧响应不得回填，新响应成为缓存值。
3. `CashAccountSelector`：相同 company/currency 下改变 `refreshKey`，确认 loader 重跑；未改变 token 时不额外请求。
4. mutation 成功/失败：成功必须“失效后 reload”；失败不得清空当前选项或伪造新余额。

### 5.2 页面集成测试

1. AR：账户 1000，确认收款 500；无需关闭页面或刷新浏览器，再打开/查看账户选项应为 1500，AR 收款列表与 summary 仍正常刷新。
2. Terminal：同一购物车币种现金收银成功后，当前账户 option 立即增加；连续两笔交易不得停留在第一笔余额。
3. Admin POS：分别覆盖 CASH、MIXED、整单现金退款；余额增减方向正确。
4. 报销、采购付款、股东返还、资金调拨：分别验证扣款/双账户变动，并验证余额不足校验读取的是刷新后的值。
5. 资金账户中心手工流水：新增、编辑、删除、改挂后，再打开公共 selector 能看到一致余额和账户状态。

### 5.3 网络与回归验收

- DevTools Network 证明写请求成功后发生新的 `/api/lookup/cash-accounts?...` GET，且响应 `currentBalance` 与 UI label 一致。
- 相同公司/币种的多个 selector 不应形成请求风暴；同一刷新周期仍应被 in-flight 去重。
- 公司/币种切换、权限 DataScope、ACTIVE 过滤和 `valueField='code'/'id'` 行为保持不变。
- API/Web TypeScript 检查及相关 Vitest 全部通过；不修改后端余额计算、事务或权威数据源。

## 6. 执行门槛

本报告为核查轮结论，**尚未实施修复**。推荐方案须经主 agent 复核并通知用户确认后，才进入代码实施。

## 7. 修复执行记录（2026-09-04）

用户已确认“双层方案 + 批次同族一并修”，本节取代第 6 节的未实施状态。

### 7.1 已实施

- 公共层新增 `invalidateCashAccountLookups()` 与 `invalidateBatchLookups()`，分别按
  `lookup:/lookup/cash-accounts`、`lookup:/lookup/batches` 前缀精确失效；保留原有
  generation 栅栏与 in-flight 去重。
- `ScopedSelect`、`CashAccountSelector`、`BatchSelector` 支持显式 `refreshKey`；值不变不重取，
  值变化才重新运行 loader。`CrudForm` 通过 `batchRefreshKey` 将页面令牌传至批次选择器。
- 资金余额成功路径已接入：AR 确认收款、采购付款执行、报销付款、资金调拨 execute、
  股东返还结算 execute、Admin/Terminal POS CASH/MIXED 与整单退款、资金账户流水增改删/
  批删/改挂，以及账户新建/编辑/冻结/恢复/关闭/余额重算。草稿、提交审批、驳回等未接入。
- 批次余量成功路径已接入：管理端入库确认、出库确认、调拨 dispatch/receive、扫码签收、
  盘点审批入账、报损审批、销售退货完成回库，以及 Terminal 入库、出库、盘点入账。
  质检 CRUD 与调拨草稿创建未接入。

### 7.2 已执行验证

- Web TypeScript：PASS（0 errors）。
- API TypeScript：PASS（0 errors）。
- Web Vitest 全量：PASS，105 files / 567 tests。
- 专项缓存与选择器：PASS，23 tests；覆盖两类 prefix 精确失效、非目标 lookup 不受影响、
  generation 竞态、相同 refreshKey 不请求、refreshKey 变化后新 GET 与余额 label 更新。
- WMS / Procurement DataScope 写门禁：PASS。
- constraint drift：PASS（0 new drift；1 条既有 allowlist）。
- `git diff --check`：PASS。
- UI audit 为存量统计型检查：本次未新增其所列硬编码颜色或原生弹窗问题。

页面真实金额方向、Network 响应/UI label 一致性与生产权威端点一致性属于部署后只读/UAT
项目，不用 mock 结果替代；CI、PR、full 部署、revision 和生产只读错误窗口结果将在本节继续追加。

### 7.3 CI / 冻结边界复核

- PR #180 已建立。首轮 Runtime Smoke、Web Vitest、V3 regression、Type-check & Regression、
  Typecheck/Build/Basic Tests 均通过。
- 首轮冻结探针按设计阻断 `apps/web` 变更；已逐文件确认仅触及本任务授权的前端写后刷新范围，
  不含 migration、entity、schema、后端余额/库存语义、RBAC 或部署链变更。
- 本地以显式授权运行 `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true` 的 W5 closeout：
  20/20 PASS；PR 已登记 `reviewed-frozen-boundary`，由新的 PR 事件重跑冻结门禁。

### 7.4 合并与部署

- PR #180：7 项检查全部通过后合并。
- main merge revision：`f68947d64b8b27d827392bded6279d3fb7d904f3`。
- full 部署 run：`33844190077`，TypeScript、约束/迁移、entity drift、system/breeding/
  packaging/WMS/finance 回归、API/Web 镜像构建、SSH 部署、Nginx reload 与 Web smoke 全部通过。
- 部署完成时间：2026-09-04 14:30:36（Asia/Singapore）。

部署后只读复验使用专用 SQL + HTTP manifest：校验 checkout/API/Web revision 三方一致、
资金账户 `current_balance = opening_balance + signed transactions`、资金/批次权威 lookup 字段，
以及 60 分钟 lookup 错误窗口；执行结果继续追加于下节。

### 7.5 生产只读复验结果

- 审计 run `33845422094`：PASS；全程 `PRODUCTION_BUSINESS_WRITES=0`。
- revision：checkout/API/Web 均为 `f68947d64b8b27d827392bded6279d3fb7d904f3`。
- `/api/lookup/cash-accounts`：HTTP 200，账户编码、名称、公司、币种、`currentBalance`
  权威字段均有有效样本。
- `/api/lookup/batches`：HTTP 200，批次号、`qty_available`、仓库字段均有有效样本。
- 通用 API 错误窗口：`LIFECYCLE_PROCESS_LOG_ERROR_WINDOW_60M=0`。

附加的“账户快照 = 期初 + 全历史签名流水”强化审计 run `33845313588` 发现 21 个存量账户
不满足该重建公式。该发现不否定本次前端写后刷新修复：lookup 与后端业务写路径都以
`fin_cash_accounts.current_balance` 为当前权威快照；但它属于新的账务数据一致性问题。
遵守本任务“不动后端余额权威语义 / 生产只读”红线，本轮未自动重算、未修数据，也未用
放宽断言掩盖。建议另开数据治理任务，逐账户区分非流水初始化/历史导入与真实漂移后再决定
是否执行受控重算。
