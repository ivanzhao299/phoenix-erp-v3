# 编辑保存后列表陈旧数据审计（2026-08-22）

## 1. 症状与审计范围

生产管理 → 鸡群档案（`/breeding/flock`）编辑存栏量并保存后，抽屉关闭但列表仍显示旧值，刷新页面或重新进入后才显示新值。

本次仅做静态只读核查，不修改业务代码、不部署、不提交。范围为 `apps/web/src/app/(admin)/**/page.tsx` 全部 **205** 个页面（`git ls-files` 与文件系统计数一致），并追踪鸡群档案使用的通用 CRUD 前后端链路、部署工作流与仓库内生产部署记录。

判定口径：

- ✅ 安全：成功分支存在可定位的本地更新或服务端重拉，或独立编辑返回后列表明确重新挂载并在 mount 加载。
- 🔴 确认问题：代码路径可证明保存成功后仍保留旧列表，且无自动失效/重拉机制。
- 🟡 疑似：存在竞态或依赖 Next.js 导航生命周期等隐含行为，静态代码不足以证明线上必现。

## 2. 鸡群档案根因五连查

### 2.1 线上版本核对

`await load()` 不是近期未发布改动：

- `git blame` 显示保存成功后 `await load()`、关闭抽屉及其注释来自 commit `35b048156209c292176f0ca4c6ba2e8db5ce1bdd`，时间 **2026-07-18 21:27 +0800**，提交说明 `fix(web): repair BUG-20260716-0001`；代码位于 `apps/web/src/app/(admin)/breeding/flock/page.tsx:287-291`。
- 保存后先做本地 `setFlocks(...map...)` 的乐观更新来自 commit `52d52163949e60127570f2a3e4182c8f3c303cd3`，时间 **2026-07-29 17:24 +0800**；代码位于 `flock/page.tsx:274-285`。
- 仓库内最后一条明确的生产部署记录为 2026-08-06、revision `440cca8f`、Actions run `31065216212`（`docs/ops/runtime-memory/DECISION_LOG.md:2396-2412`）。`440cca8f` 是上述两个 commit 的后代，因此若该记录仍代表线上，线上已包含 `await load()` 与乐观更新。
- 当前 `main` / `origin/main` / `HEAD` 均为 `1dc6f7bc75cb0eb44d495a97aa39bdad2a864811`，但不能据此推断当前生产版本。普通 push 只构建不部署（`.github/workflows/deploy.yml:10-13`）；正式部署仅在 `workflow_dispatch`、`approve_production=true` 时执行（`:596-609`）。部署时服务器会 `git pull --ff-only` 并校验 `HEAD == github.sha`（`:710-716`），镜像同时有 `latest` 与不可变 `sha-<commit>` 标签（`:491-512`）。

**结论：🟡 当前生产 SHA 仍需生产机 `git rev-parse HEAD`、运行容器 image digest 或 GitHub Actions deployment run 才能最终确认；但“线上根本没有刷新代码”不符合仓库中最后一条可核实的生产记录，不应作为首要根因。**

### 2.2 `load()` 与缓存层

- 页面 `load()` 直接调用 `useCrud('brd_flocks').fetchRecords()`，返回后无条件 `setFlocks(...)`（`flock/page.tsx:116-146`）。
- `useCrud.getRecords()` 对 GET 明确设置 `cache: 'no-store'`（`apps/web/src/hooks/useCrud.ts:95-101`）。该页面没有 SWR、React Query、localStorage、dict-cache 或内存单例参与鸡群列表读取。
- 后端 GET 最终是对 `brd_flocks` 的直接 `SELECT *`（`apps/api/src/modules/generic-crud/generic-crud.service.ts:2326-2384`），未发现 Redis/响应缓存。

**结论：✅ 未发现会把同 URL 短时间请求拦截并返回旧响应的缓存层。**

### 2.3 读写数据口径

- 页面读取 `GET /api/crud/brd_flocks`，列表存栏量取 `d.current_qty`（`flock/page.tsx:130-145`）。
- 编辑写入 payload 的 `current_qty`（`:242-256`），调用 `PUT /api/crud/brd_flocks/flock_no/{flock_no}`（`:260-264`；`apps/web/src/hooks/useCrud.ts:103-108`）。
- Generic CRUD 将 `brd_flocks` 主键映射为 `flock_no`（`apps/api/src/modules/generic-crud/generic-crud.controller.ts:607-614`）；更新直接 `UPDATE "brd_flocks" ... RETURNING "flock_no"`（`generic-crud.service.ts:2429-2471`），读取直接命中同一实表，不经过聚合视图或专用 breeding service。
- 仓库链路没有主从读取配置证据。

**结论：✅ 读写同表、同主键、同字段；未发现口径错位、聚合刷新或主从延迟路径。**

### 2.4 本地更新与请求竞态

正常单次保存顺序是可靠的：`await updateRecord(...)` → 本地 `setFlocks(map)` → `await load()` → 关抽屉（`flock/page.tsx:258-291`）。后端 PUT 也会 await SQL 更新完成后才返回（`generic-crud.controller.ts:496-517,557-558`）。

但页面存在可证明的旧响应覆盖窗口：

1. mount effect 启动一次 `load()`，未保存其 AbortController、请求序号或取消函数（`flock/page.tsx:147-163`）；
2. 保存成功又启动一次 `load()`；
3. 每个 `load()` 完成时都无条件 `setFlocks(...)`（`:130-146`）；
4. 若保存后的请求先返回新数据，较早发出的 mount 请求随后才返回，其旧快照会再次覆盖列表；
5. 即使没有跨请求乱序，保存后的 `await load()` 若因任何外部读延迟得到旧数据，也会覆盖刚做的本地乐观更新（`:274-289`）。

`useCrud` 的 10 秒 AbortController 只做单请求超时（`apps/web/src/hooks/useCrud.ts:34-73`），不会取消同一 hook 的前一请求或执行 latest-request-wins。相比之下，通用后端 `DataTable` 会在 effect cleanup 中 abort 前一请求（`apps/web/src/components/data-table/DataTable.tsx:70-106`）。

**结论：🟡 这是当前代码中最具体、与症状一致的根因候选。静态审计能确认竞态存在，但无法证明用户那次操作一定命中了该时序；需浏览器 Network 时间线或临时请求序号日志复现确认。**

### 2.5 抽屉关闭时机与 effect

- 保存路径在 `await load()` 后才 `setShowDrawer(false)`、`setEditId(null)`（`flock/page.tsx:289-291`）。
- `RightDrawer` 的关闭回调在页面只关闭抽屉并清空 `editId`（`:411-414`）；未发现关闭触发列表重算、旧 form 写回或额外 `load()` 的 effect。
- `load` effect 仅依赖稳定的 `load` callback（`:147-163`），普通关闭不会重新触发。

另有旁支竞态：提交 pending 时抽屉仍可通过遮罩、关闭按钮或 Escape 关闭（`apps/web/src/components/RightDrawer.tsx:49-73`）；旧保存完成后仍可能关闭用户新打开的抽屉。这不是本次“旧存栏量”的直接根因，但应一并治理。

**结论：✅ 未发现关抽屉后以旧 state 重算列表的路径；🟡 存在 pending 保存与人工关闭/重开之间的 UI 竞态。**

## 3. 全站普查

### 3.1 A 类：同页抽屉/弹窗编辑

明确识别的 A 类页面均在成功分支调用 `load/loadData/loadList/loadAll/fetchScopes` 或递增传给 `DataTable` 的 `refreshKey`，未找到可凭代码标为 🔴 的漏刷新页。

| 页面（同模式合并） | 刷新机制与证据 | 判定 |
|---|---|---|
| `breeding/flock` | 乐观 map + `await load()`，`page.tsx:273-291`；但 load 无 latest-wins | 🟡 |
| `breeding/henhouse` | 保存/删除后 `loadData()`，`page.tsx:184-229` | ✅ |
| `breeding/immune` | 更新/保存后 `loadData()`，`page.tsx:216-281` | ✅ |
| `breeding/medicine` | create/update 后 `loadData()`，`page.tsx:194-206` | ✅ |
| `quality/farm`, `quality/product` | 保存/删除后 `rf()`，表格接收 `refreshKey`，各 `page.tsx:36-52` | ✅ |
| `quality/backward`, `quality/standards` | 保存/删除后 `refresh()`，分别 `page.tsx:52-95`、`:52-82` | ✅ |
| `quality/nonconformance` | 关闭 NCR、保存后 `load()`，`page.tsx:101-138` | ✅ |
| `store/daily`, `inventory`, `losses`, `receiving`, `replenish` | 统一 `refreshKey` 模式，分别 `page.tsx:36-67` | ✅ |
| `warehouse/warehouses`, `zones` | 保存/删除后 `refresh()`，分别 `page.tsx:45-71`、`:106-164` | ✅ |
| `warehouse/inbound`, `outbound`, `transfer`, `stocktake`, `loss-report` | 保存/删除/状态动作后 `refresh()`；分别 `page.tsx:98-159`、`:184-250`、`:176-261`、`:142-221`、`:138-189` | ✅ |
| `packaging/exceptions` | 保存/删除后 `refresh()`，`page.tsx:85-115` | ✅ |
| `master/farms`, `master/products`, `master/stores` | 保存/删除后递增 `refreshKey`；分别 `page.tsx:73-179`、`:53-68`、`:65-80` | ✅ |
| `sales2/customers` | 客户、渠道保存和状态操作后 `load()`，`page.tsx:251-315,704-730` | ✅ |
| `sales2/pricing` | 价格册/明细保存删除后 `load()`，`page.tsx:284-384,852-896` | ✅ |
| `procurement2/suppliers` | POST/PATCH 后 `load(page)`，`page.tsx:318-350` | ✅ |
| `settings/pda-terminals`, `approval-rules`, `roles`, `dict`, `data-scopes`, `users` | 成功后分别调用 `load/loadAll/fetchScopes/loadData`：`:187-242`, `:369-441`, `:606-668`, `:177-200`, `:128-183`, `:273-313` | ✅ |
| `master-data/organizations` | 保存、删除、状态动作均 `await load()`，`page.tsx:494-589` | ✅ |
| `finance2/cash-accounts`, `shareholder-funds`, `ap`, `ar`, `fund-transfers`, `expenses`, `returns` | 子抽屉回调重拉列表/摘要：分别 `page.tsx:1058-1080`, `:1143-1150`, `:931-939`, `:1289-1294`, `:480`, `:736`, `:1130` | ✅ |
| `procurement2/orders`, `payments`, `requests` 的详情/审批抽屉 | 不是同页 CRUD 编辑抽屉，动作类型杂，未按 A 类逐个推断 | 🟡 |

### 3.2 B 类：独立路由编辑后返回列表

本仓库检索未发现业务编辑页保存后使用 `router.back()`；主要使用 `router.push(固定列表路由)`。App Router 的 `router.push` 不等于数据失效协议，但从独立详情页跳回父列表时，当前列表通常会重新挂载并执行 mount load，因此不能仅凭“没有 `router.refresh()`”判定为必现 bug。

| 页面/路由 | 返回与列表加载证据 | 判定 |
|---|---|---|
| `master-data/{customers,suppliers,products,bank-accounts,cash-accounts}/[code]/edit` | `MasterDataFormPage.tsx:71-93` 保存后 push `listRoute`；列表 `MasterDataRuntimePanel.tsx:194-203` mount/filter 触发 `load()`，`:298-300` 有手动刷新；无 refresh/event 兜底 | 🟡 |
| `settings/users/[id]` | 保存停留详情并 `loadData()`，`page.tsx:151-182`；返回 push 列表 `:416-425`；列表 mount 加载 `settings/users/page.tsx:118-128` | 🟡 |
| `settings/roles/[code]` | 保存停留详情并 `loadAll()`，`page.tsx:252-289`；返回 push 列表 `:539-546`；列表 mount 加载 `settings/roles/page.tsx:372-421` | 🟡 |
| `procurement2/payments/{new,[id]/edit}` | `PaymentForm.tsx:272-280` 保存后 push 列表；列表 mount/filter/page 加载 `payments/page.tsx:155-177` | ✅ |
| `procurement2/requests/{new,[id]/edit}` | `RequestForm.tsx:343-357` push 列表；列表 effect 加载 `requests/page.tsx:242-273` | ✅ |
| `procurement2/orders/{new,[id]/edit}` | `OrderForm.tsx:282-296` push 列表；列表 effect 加载 `orders/page.tsx:302-332` | ✅ |
| `master-data/customers/[code]`, `suppliers/[code]`, `shareholders/capital/[id]`, `breeding/device/[houseCode]` | 只读/监控详情，无保存后返回列表场景；例 `customers/[code]/page.tsx:302-317`、`capital/[id]/page.tsx:22-35` | ✅ |
| workflow submit/designer/form-designer 动态页 | 提交页或设计器，不是常规编辑回列表；例 `forms/submit/[formCode]/page.tsx:478-490`，设计器无可核验返回失效协议 | 🟡 |
| `workflow/instances/[id]` | 取消后详情内 `await load()`，`page.tsx:29-43` | ✅ |

全局未找到 `router.refresh()`、业务数据 CustomEvent、URL refresh key、React Query invalidation；SWR 仅用于移动 Dashboard（`apps/web/src/app/(mobile)/mobile/dashboard/page.tsx:269,285-342`）。因此 B 类目前依赖页面重新挂载，没有跨路由统一失效契约。

### 3.3 C 类：通用组件契约

| 组件 | 契约 | 使用面/判定 |
|---|---|---|
| `CrudForm` | 只 await 页面传入的 `onSubmit(values)`，不关闭抽屉、不刷新列表（`apps/web/src/components/ui/CrudForm.tsx:128-147`） | 调用者必须自行刷新；识别到的 22 个业务页面均有刷新回调，✅ |
| 后端 `DataTable` | `refreshKey` 是 load callback 依赖，变化会 abort cleanup 后重拉（`apps/web/src/components/data-table/DataTable.tsx:70-106`）；组件不知道外部 mutation 是否完成 | 只有页面递增 `refreshKey` 才自动受益，✅ 契约清晰 |
| `CrudPage` | create/update/delete 成功后内部 `refresh()`，并把 key 传给 `DataTable`（`apps/web/src/components/ui/CrudPage.tsx:81-112,178-189`） | 全仓无业务页面实际使用，仅模板自身命中；当前无实际受益面，🟡 |
| 旧 `components/DataTable.tsx` / `DataTableV3` | 纯本地 rows 展示，无 server reload 或 mutation invalidation | 不提供刷新保证，调用方负责，🟡 |

## 4. 只读修复建议

### P0：先确认生产版本与 flock 请求顺序

1. 从生产部署目录、运行容器或 Actions environment 取得真实 SHA/image digest。若早于 `35b048156`，部署包含 2026-07-18 修复的 web 镜像即可补上 `await load()`；若早于 `52d521639`，也缺少 2026-07-29 的乐观更新。
2. 在浏览器 Network 复现，核对 PUT 响应、紧随其后的 GET 响应体，以及是否存在更早 GET 最后完成。仅当 GET 响应体已是新值而 UI 仍旧，才继续查 React state；若最后完成的旧 GET 覆盖新 GET，则竞态得到确认。

### P1：修复 flock 的 latest-request-wins 与乐观更新回退

- 给 `load()` 增加请求序号或 AbortController：仅最新请求允许 `setFlocks`；新 load 开始时取消旧 load。可复用后端 `DataTable` 的 cleanup/abort 思路。
- 保存成功时可选择“乐观更新即最终 UI，后台重拉只在确认是最新且字段有效时合并”，避免一次旧 GET 反向覆盖；或完全取消乐观 map，依赖受控的最新 GET。
- 提交期间禁止抽屉关闭，或把提交绑定到本次 drawer/editId token，避免旧提交关闭新打开的抽屉。
- 删除路径的 `load()` 目前未 await（`flock/page.tsx:218-220`），应与保存路径统一成受控 refresh。

### P2：建立独立编辑路由的统一失效协议

按现有仓库侵入面排序：

1. **保存后带一次性 URL 标记（推荐短期）**：`router.replace('/list?saved=<token>')`，列表 effect 依赖该 token 并 load，完成后清理参数。优点是跨路由明确、刷新/深链可观察；缺点是各列表需接入，URL 会短暂变化。
2. **轻量业务失效事件（推荐中期）**：封装 `invalidateList(resource)`，列表订阅后递增现有 `refreshKey`。最贴合当前 `DataTable + refreshKey` 体系，侵入较低；需要处理卸载订阅、同 tab 范围和事件命名，不能覆盖跨标签页，除非再用 BroadcastChannel/storage event。
3. **`router.refresh()`**：适合 Server Component 数据，但当前大多数管理列表是 Client Component mount fetch；单独调用不保证其本地 state 重拉，因此不能作为本仓库的统一解法，只能配合 remount key 或服务端化。
4. **全局 store/SWR/React Query**：能提供标准 invalidate，但当前管理端几乎没有这套基础；迁移面最大，不建议只为本 bug 引入。

### P3：收敛通用 CRUD

- 把 `CrudPage` 的成功刷新契约修到可实际复用并逐步迁移模板页，或抽出统一 `useRefreshableList`（AbortController + request id + refreshKey）。
- `CrudForm` 保持只负责表单是合理的，但页面模板应强制要求 `onSaved/onDeleted` 返回后触发统一 refresh，避免未来新增页面漏接。

## 5. 建议修复清单（影响面排序）

1. **P0 / 鸡群档案**：确认生产 SHA与 Network 顺序；确认后修 latest-request-wins。该项对应已发生的生产用户问题。
2. **P1 / `useCrud` 遗留页面**：盘点并给并发 GET 增加取消/序号保护；flock 是已确认存在竞态窗口的样本。
3. **P1 / master-data 五个独立编辑页、settings users/roles**：补显式跨路由失效标记，消除对“返回后恰好重新挂载”的隐含依赖。当前标 🟡，不是静态证据确认的生产 bug。
4. **P2 / 22 个 `CrudForm + DataTable` 页面**：保留现有 `refreshKey` 契约并增加通用测试；目前均有成功刷新证据，无需逐页紧急修补。
5. **P3 / workflow 特殊动态页与采购详情动作**：按各自业务状态机做交互复测，避免把非编辑场景误归为 stale-list 缺陷。

## 6. 最终结论

- flock 当前代码确实实现了保存后自动更新，且仓库最后一条可核实生产记录应已包含它；版本落后不是现有证据支持的首要解释。
- 当前最可信的代码级风险是多个 `load()` 无取消/请求序号，旧响应可以覆盖保存后的新列表和本地乐观更新。
- 205 个 admin 页面中，明确识别的同页编辑页均存在成功刷新机制，未发现可标 🔴 的同类漏项。
- 独立编辑页没有统一跨路由失效协议，但固定 push 回父列表通常会重新挂载并加载；因此相关页面按证据标 🟡 或 ✅，没有为了清单完整而臆断标红。
