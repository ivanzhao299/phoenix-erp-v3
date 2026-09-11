# 包装全屏交班 shiftId 故障独立核查

日期：2026-09-10。状态：**只读核查完成，方案待主 agent 合并复核及用户授权，未实施**。

## 1. 范围与结论

用户实测每次进入包装作业台全屏出现“交班数据加载失败 / shiftId 必须是正整数”。实际字段是 `shiftId`（大写 I），不是 `shiftld`。

**已证源码根因：交班页首次 render 的班次为 null；effect 未等待缓存恢复、未校验 ID，调用 `getActiveGrading(Number(shift?.id))`，构造 `GET /api/packaging/terminal/grading/active?shiftId=NaN`。服务端正整数校验准确拒绝。** 全屏拦截层解除会挂载页面，退出全屏再进入也会重新挂载。有效缓存恢复后会再发合法请求，但前后请求没有取消或序号隔离，旧 400 可在新请求成功后覆盖状态。

这是 2026-09-10 班次级分级契约改造暴露并引入到该调用点的近期源码回归。不能据此宣称已经捕获用户本次生产网络请求，也不能说所有终端页面都会请求交班数据：此报错文案位于交班页，dashboard 本身不调用 `grading/active`。用户进入全屏时的确切路由、缓存内容与网络时序仍需补证。

本任务没有改代码、schema、业务数据或部署；没有生产 POST、生产查询、workflow dispatch/取消/重跑，也没有切换分支、stage、commit、push。只新增本报告，不接管正在进行的库存确认失败核查。

## 2. 基线、近期报告与证据等级

核查时 `git rev-parse HEAD`：`4772c634ad308c1abfeb325c6d73e30412986872`。行号为本地该时点快照，共享工作区后续可能前进。主线程读取 AGENTS.md，并阅读包装提交 500 修复、分级重复治理及 2026-08-22 终端新标签会话/退出导航报告；这些历史报告中的“已部署”指各自留档时间，不等于本轮重新确认生产末态。

| 分类 | 结论与证据 |
|---|---|
| 已证：源码 | 首次无效请求、两个独立 hook 实例、无 cleanup、后端错误文案、契约变更 commit，见后文逐调用点 |
| 已证：本地隔离复现 | 原 API client 与原页面 effect 在内存执行，mock fetch 验证 NaN URL 和旧失败覆盖新成功；非 React DOM/浏览器/生产测试 |
| 已有生产留档 | `docs/ops/runs/packaging-protection-20260910/postdeploy-34457134691.txt:1`：checkout/API/Web revision 一致，部分 SHA 被平台掩码；完整 merge SHA 来自 `release-evidence.json:1-4`：`492ba3c3a67b477e2240b7b5a8762164a80bfd7e` |
| 已有生产 GET 范围 | 上述 postdeploy 文件 `:9-17` 验证 context/shifts/sources、real/test、权限与测试库存阻断，未覆盖交班页加载/active 的 NaN 请求 |
| 配置性证据 | `scripts/ops/readonly-audits/packaging-grading-governance-postdeploy-20260910.http.json:13-17` 设定 pending 缺 shiftId 应为 400；不能替代本次 active 请求实录 |
| 推断 | 用户停留交班路由进入全屏，有效缓存恢复与首个 NaN 请求竞争，符合完整报错现象；缓存损坏/旧 code 也可能触发，但未读取用户缓存 |
| 未知 | 本次精确路由、浏览器/缓存版本、实际 HTTP URL/status/response、400 与合法请求先后顺序、首次出现时间及本次最新运行镜像 |

对 `docs/ops/runs/**` 与现有 readonly HTTP 包检索 `shift-summary|reports/shift|handover|shiftId.*400|shiftId 必须是正整数`，未发现可归属于本症状的生产交班/active 400 实录。不能用“无新 500”排除本次 400。另一库存核查证据不作为这里的网络证明，也不复述其业务人员/记录明细。

## 3. 入口、context 与请求时序

所有路径相对仓库根目录。

| 调用点 | 实际动作、参数与时序 |
|---|---|
| `apps/web/src/app/(terminal)/layout.tsx:51,74-123` | layout 自己调用 `useTerminalContext()`；监听 `fullscreenchange`；非 development 且未全屏时提前 return 遮罩，不渲染 children。点击 `requestFullscreen()`，成功变为全屏后才挂载交班等子页。退出全屏再次卸载 children。开发模式跳过遮罩，但页面的 effect 机制相同 |
| `apps/web/src/hooks/useTerminalContext.ts:58-79,96-116` | 初态 `currentShift:null`。mount effect 才 JSON.parse `phoenix_terminal_context` 并 setState；本次 render 闭包仍是 null。此 hook 的网络同步仅 `GET /exceptions/today`，不是班次 context |
| 同 hook `:82-93,119-129` | `setShift` 持久化 localStorage。不是共享 Provider：每次调用均各自 useState；没有同页订阅广播或 storage 事件同步。顶栏即使显示 OPEN，也不能证明刚挂载的交班实例已经恢复 |
| `shift-close/page.tsx:17-23,46-53`（完整前缀 `apps/web/src/app/(terminal)/terminal/packaging/`） | 首个 effect 不判断 hydrated/OPEN/整数。`shiftId = shift?.id ? String(shift.id) : undefined`；date=`shift?.productionDate`；并发 summary 和 active |
| `apps/web/src/lib/packaging-api.ts:178-184` | summary 的 date/shiftId 均为 truthy 才加入 URLSearchParams。首请求 `/api/packaging/terminal/reports/shift-summary`；恢复后示例 `...?date=2026-09-10&shiftId=42` |
| 同 client `:191-197` | active 无运行时参数检查，模板拼接数字。首请求 `/api/packaging/terminal/grading/active?shiftId=NaN`；恢复后 `...?shiftId=42`。正常字符串数据库 ID 转 Number 可成功；不是正常路径把班次 code 当 ID |
| `apps/api/src/modules/bff/bff.controller.ts:2164-2171` | `Number(shiftId)`，非整数或 <=0 抛 `BadRequestException('shiftId 必须是正整数')`，然后查精确 ID、校验 is_test；当前 active 没有 OPEN 检查 |
| client `:123-131`；交班页 `:80-83,159-169` | 提取响应 message 抛 Error；Promise.all catch 写 loadError，显示交班失败标题及服务端文案。effect 没有取消/序号检查，旧 catch/finally 都能覆盖新请求状态 |
| 交班页 `:115-158` | 无班次/CLOSED 判断发生在 effect 注册之后，不阻止请求。**它在错误渲染分支之前**：无缓存且始终无班次时，最终显示“无开放班次”，不能声称该场景必然显示红色失败页。有 OPEN 缓存或非空非法 ID 时，错误分支才可直接呈现 |
| `shift-open/page.tsx:166-187` | `applyShiftToContext` 用 `String(raw.id ?? '')` 写 id，`raw.shift_code` 写 code，`raw.production_date` 写 productionDate；字段映射正常路径分得开 |

请求顺序：初态 null → effect 发无参 summary + active NaN → storage setState 恢复班次 → effect 重跑发精确班次两请求 → 两组响应任意顺序落入同一状态。若旧失败先于新成功，新成功也没有在 then 清 loadError（只在新请求开始时清），因此旧失败在新请求启动后落地就可能残留；旧 finally 还可过早解除 loading。

### 全屏与非全屏的边界

全屏不是另一个 API 参数或业务模式，只影响挂载。development 非全屏、刷新、直接导航到交班页均可触发同一缺陷。生产退出全屏时 children 不存在，不会“保持一个后台交班组件”；重入会重新触发首请求。`KioskGuard.tsx` 的 hook 没有实际调用，不能把其逻辑当 layout 的运行时机制。

dashboard `apps/web/src/app/(terminal)/terminal/packaging/dashboard/page.tsx:23,197` 只无参读取 summary，并通过按钮导航到 shift-close；未发现全局 layout 自动加载交班 active 的调用。若用户确认故障发生在 dashboard 且未导航交班，需要补真实路由/网络，不能用当前代码推断代替。

## 4. 后端 context、旧缓存与隔离

`GET /api/packaging/terminal/context`（client `packaging-api.ts:135`；BFF `:1335-1381`）返回：

```ts
{ code: 200, data: {
  currentShift: /* DB 原始行或 null */,
  currentSourceBatch: /* DB 原始行或 null */,
  openExceptionCount: number,
  devices: [{ deviceId, deviceType, label, status }]
}}
```

currentShift 是 `production_date=today AND status='OPEN' AND is_test=<mode> ORDER BY opened_at DESC LIMIT 1`；不是按当前终端选择的班次 ID 查询。原始字段 `id/shift_code/production_date/line_id/status/is_test` 需要映射为前端 WorkShift 的 `id/code/productionDate/lineId/...`。当前前端没有调用 `packagingApi.getContext()`，所以本次不是该接口字段拼错直接引起。**不能简单接入它来自动选“最新班次”**：它没有终端/产线/操作者归属过滤，且 `safe()`（BFF `:1324-1326`）会把查询异常降为 null/空列表。

`GET /shifts/today`（BFF `:1385-1395`）返回当日 real 或 test 模式的所有状态班次，含 CLOSED，并非“可安全自动选择的唯一 OPEN”；同样 safe fallback。它不适合在加载失败时悄悄选择首项。

缓存风险已证机制、未证用户实际命中：

- `phoenix_terminal_context` 没有 schema version、用户、公司、mode 命名空间，也没有 shape/整数校验；JSON 合法不代表班次合法。旧对象可能 id 缺失、空串、0、code 字符串或状态陈旧。
- `setShift` 只更换 currentShift，不自动清旧来源/分级/包装；交班页在服务端 outputs 为空时还回退 `ctx.gradingOutputs`（`:56-60`），可带出旧班次缓存。缓存不是服务端归属或剩余量权威。
- `AuthContext.tsx:201-215` logout 清认证存储，没有清 terminal context。换账号后有继承旧班次候选的风险，不能据此断言已实际越权。
- API client `hdr()`（`:86-92`）默认不发 `x-packaging-mode`，当前终端是 real。服务端 `packaging-protection.ts:4-18` 默认 real；显式 test 只允许 ROLE_ADMIN；`assertPackagingMode` 要求行 is_test 与 mode 相等。不能根据 localStorage 的 is_test 自动启用 test。
- Terminal BFF 类 `:1313-1333` 为 JWT + MenuGuard，接收/分级/包装部分路径经 `assertActiveHouseScope` 复用 DataScope；context、summary、active 的班次查询本身缺少逐行公司/仓库过滤。**本报告不把现有鉴权称为完整 DataScope 覆盖**。修复新增精确班次读取/缓存核验须服务端做归属校验，不能靠前端 ID 或管理员样本替代。

## 5. 契约回归与受影响调用方

`git show 534ac6ad82b70f77f50e7358ed754db78390934c`：2026-09-10 09:27:41 +0800，`fix: govern shift grading duplicate submissions`。该次改造将 active 从 date 契约改为必填正整数 shiftId，并把交班页一行从 `getActiveGrading(productionDate)` 改为 `getActiveGrading(Number(shift?.id))`，没有同步补加载 guard。所以并非当前仍发送旧 date 参数，而是迁移调用方时遗漏了初态/空态。旧后端宽泛按日查询会掩盖无班次请求，本次必须保留班次级强校验和隔离，不能回滚该业务防线。BFF active 的 date 注释仍过时，client 的“当日所有批次”注释也需同步修正。

近期治理报告记录 PR #225 merge `f7664fad...`、full deploy run `34426961764`；之后保护部署留档 revision `492ba3c3...`。这支持缺陷代码进入已发布链的判断；本症状的生产首发时刻仍未知。

| 调用方 | 审计结果 / 修复影响 |
|---|---|
| shift-close `:46-83` | 直接故障点；两读取接口必须等上下文就绪和合法 OPEN，再以同一明确 shiftId 查询；加乱序与卸载保护 |
| packing/page.tsx `:63-70` | active 唯一另一运行时调用点；已有合法 ID guard，复用新 client 校验时做回归，不改库存处理 |
| grading/page.tsx `:38-40,58-65` | pending 调用已有 `Number.isInteger && >0 && OPEN` guard；验证共享 context 改造不退化 |
| dashboard/page.tsx `:23` | summary 无参调用有既有用途；不能全局把它直接变为强制 shiftId 而制造新故障。保留兼容读法或显式迁移后再收紧 |
| shift-open `:166-187`、layout、所有 useTerminalContext 消费页 | 如果采用共享 Provider/订阅修复，需要逐页回归切换和缓存，不将全局改造藏在一行 guard 里 |
| shift-close `:86-112` | close 只检查 truthy ID，没确保 OPEN/已加载/当前响应匹配；作为待批方案补前端动作门禁，不执行 POST |

summary（BFF `:1919-1944`）当前把非法 shiftId 当未传，回退当日最新班次；active 严格拒绝，两者并不一致。summary 返回 `shift`、`gradingOutputs/gradedQty`、`shiftPackedBoxes/Eggs`、`shiftWarehousedBoxes/Pallets` 等（`:2019-2037`）。交班不应容忍 fallback，特别是显式传了非法 ID 的场景。

旁项交给合并复核：交班页 `:72-73` 把入库箱数设为 totalPacked、托盘数设为 ceil(totalPacked/25)，没有使用服务端实际入库字段。这不是 shiftId 报错根因，也不在本次直接改动范围；应与库存核查一起判断展示误导风险。

## 6. 本地验证实录与测试缺口

实际执行 `NODE_ENV=test node`（stdin 脚本，不生成文件）：TypeScript transpileModule 编译当前 `packaging-api.ts`；截取交班页 `useEffect` 原文执行；使用隔离 VM 注入空缓存闭包、恢复后的合成班次 42 及 mock fetch。所有 fetch 都断言 GET，不存在真实网络。模拟请求完成顺序为合法两请求先成功、初始 active 后返回 400。

结果 exit 0，断言通过：

```text
NODE_ENV=test
GET /api/packaging/terminal/reports/shift-summary
GET /api/packaging/terminal/grading/active?shiftId=NaN
GET /api/packaging/terminal/reports/shift-summary?date=2026-09-10&shiftId=42
GET /api/packaging/terminal/grading/active?shiftId=42
合法请求完成后 summary.gradedQty=10、loadError=''
初始 400 返回后 loadError='shiftId 必须是正整数'、loading=false
```

另验证 JS 转换：undefined→NaN；null/空串/0→0；`SHIFT-42`→NaN，均不满足现有正整数规则；字符串 `42`→42 满足。42 仅为内存合成 fixture，不是生产班次或方案中的硬编码 ID。

此复现证明原 effect/client 的 URL 与响应竞态，不证明实际 React 挂载或生产响应顺序。没有进行 React DOM、浏览器、生产 HTTP 测试；没有运行 API/Web tsc、全量测试或 scope 门禁，本轮只新增报告，不能引用历史 PASS 作为本轮修复验证。

现有 `apps/web/src/__tests__/packaging-shift-close-summary.test.ts:18-47` 是源码字符串断言，甚至断言包含 `getActiveGrading(Number(shift?.id))`，不执行 hydration/网络。BFF `bff.controller.spec.ts:245-282` 只覆盖合法 summary ID。因而类型检查/静态断言通过不能发现本故障。

## 7. 待主 agent 复核的最小完整修复包

下面是方案，不是已执行改动。建议按“立即止错”和“缓存身份收口”两层评审；只做第一层不应宣称旧缓存/全局 context 已彻底解决。

### A. 立即止错（必需，局部改动）

1. hook 显式提供 hydration 完成状态；交班 effect 在恢复完成前不发任何班次业务请求。统一校验有限、安全正整数 ID 与 OPEN 状态；undefined/null/空串/0/负数/小数/code/过大整数在本地拦截，不转成任意默认 ID。
2. 交班页无有效选择显示“无开放班次/请选择班次”；CLOSED 显示只读已交班状态。错误缓存视为待重新选择，不通过反复 retry 请求 NaN。无 OPEN 不开班、不替用户选最新、不触发任何写操作。
3. 每轮请求绑定 `{user, mode, shiftId, productionDate, requestGeneration}`。effect cleanup 标记失效；then/catch/finally 全部检查 generation 和挂载状态。可再传 AbortSignal 减少无效请求，但不能只依赖 abort。切班立即清 summary、错误、确认弹窗/差异输入并禁用交班；旧响应不得更新新班次。
4. client 的 active/pending ID 参数增加运行时校验；交班 summary 使用要求 ID 的明确调用封装，保持 dashboard 既有无参路径可用。后端正整数校验保持；补接口注释与非法值测试。
5. 交班按钮必须绑定本次已成功加载且核验匹配的 OPEN 班次；loading、error、invalid、CLOSED、身份改变时禁用。服务端仍是关闭动作的最终裁决，不能因为客户端曾读到 OPEN 就绕过事务/权限。

### B. 缓存与权威班次核验（完成用户所列边界必需）

1. layout 下建立单一 terminal 状态 Provider（或等效集中订阅 store），hook 消费同一状态；保留原调用接口以减少跨页变化。存储候选带 schemaVersion、用户身份及 mode，按班次隔离 WIP；切班/退出/换用户清当前内存及不匹配候选。旧无身份缓存不能直接用于交班，要求重新选择确认；不能把旧实物业务数据删除当成缓存清理。
2. 班次必须是用户明确选择或当前身份下已核验的精确 ID。**不直接采用现有 context 的最新 OPEN 作为恢复权威。** 最小复用方向：summary 的显式 shiftId 分支先读取精确班次，检查日期匹配、real/test 与服务端 DataScope，再返回真实 shift 元数据；不存在/不匹配应明确冲突/拒绝，不返回 0 汇总或回退。保留无 ID 的 dashboard 兼容分支，显式非法 ID 返回 400。
3. 对精确交班 summary 读取错误停止使用 `safe()` 的静默 0 fallback，使“查询失败”与“没有 OPEN”可区分。可先读已核验 summary 再请求同 ID active，后者失败保持不可交班；不需要为了止错新增班次表/schema。若主 agent 决定合并读取，应先确认 summary 与 active 的统计口径一致，不能仅为少一个请求直接替换。
4. 服务端归属校验沿用现有 DataScope 服务和班次实际站点/公司关系，实施时先定位并核验映射；对非全局用户解析不出归属时 fail closed，不能推测公司或只做前端过滤。精确读取与 active 必须同一归属规则，避免 UI 修好但直接 API 可越权。此处具体映射实现需在编码前复核，现有 context/shifts/today 本身不能充当 scope 证明。
5. 保持 real 默认、test 显式管理员授权、模式不匹配拒绝。前端缓存永不决定授权 header；不新增普通 UI 测试模式入口。普通交班禁止测试班次，受控测试结束继续走已有专用接口，库存禁入规则保持。
6. 移除交班统计对其他班次/身份缓存的兜底：服务端有效空产出就是空，不重新展示旧 gradingOutputs；失败展示错误而非离线可交班。入库展示问题由主 agent 与另一核查共同确定修复边界。

建议审批范围为上述前端加载/状态、client 校验、精确读取契约与权限防线及对应测试；**不含迁移、历史数据修复、库存规则修改、生产 POST**。如只批准 A，交付须明确 B 仍待办，不声称完整消除缓存/隔离风险。

## 8. 授权后测试清单

全部本地测试显式 `NODE_ENV=test`；使用隔离 fixture，不连接生产。测试需执行组件与 effect，不再只匹配源码字符串。

| 场景 | 必须断言 |
|---|---|
| 初次加载/无缓存 | hydration 前 summary/active 请求 0；无选择后显示明确空态，无 NaN/无参交班请求 |
| 合法缓存/刷新/新标签 | 先核验候选归属和状态；请求始终携带相同合法 ID；顶栏与交班实例状态一致 |
| 全屏进入/退出/重入 | 真实 layout 组合，模拟 fullscreenchange；卸载不更新状态，重入不重复无效请求；development 非全屏也覆盖 |
| 无 OPEN/已关闭 | 无开放班次与读取失败分开；缓存 OPEN、服务端 CLOSED 时只读提示并禁止交班，绝不自动选新班次 |
| 非法缓存 | undefined、空串、0、负数、小数、NaN、code、错误字段、超安全整数、坏 JSON、旧版本均不发非法请求 |
| 班次切换 A→B | 清 A 汇总、确认态与 WIP；晚到 A 成功/失败/finally 都不得污染 B |
| 请求乱序/重试/卸载 | 旧失败晚到、新失败旧成功晚到、连续 retry、StrictMode 重挂载；只有最新请求能落状态 |
| 读取失败 | 401/403/409/500、网络错误、日期/ID不匹配、DB读取失败：明确错误，无静默 0、无缓存兜底、不能交班 |
| 普通用户 DataScope | 已授权精确班次成功；跨公司/仓库归属、无法解析归属拒绝；换用户不复用旧缓存；不得只测管理员 |
| real/test | 同日同线 real/test OPEN 并存；普通 test403、跨模式拒绝；real 不读 test；测试班次不能普通关闭或进库存 |
| 受影响调用方 | packing active、grading pending、dashboard无参summary、shift-open映射、全部 context 消费页与登录退出回归 |

实施后的最终验证由主 agent 执行：API/Web tsc（必要时禁用增量写以遵守当轮范围）、对应 Web DOM 与 API 行为/隔离测试、真实 scope-audit；再执行适用 CI。若涉及归属 SQL，使用独立 PG 验证。真实浏览器验证必须覆盖进入全屏，不用 typecheck/GET200 代替。

## 9. 生产证据补齐、部署与验收计划

本轮没有新增受控审计 SQL/HTTP/工作流资产。补证所需最小信息：用户报错时的路由、时间与时区；脱敏 GET 路径/query/status/message 及请求起止顺序；仅记录缓存 ID 是否有效及状态/版本，不采集 token、姓名、全量 localStorage。400 不一定进入 500 错误表，应查已有 Nginx/access/APM 或浏览器请求。

若已有日志无法提供，新增受控只读审计资产的需求是：只筛 `/grading/active` 与 `/reports/shift-summary` 的短时间窗口，记录非敏感请求字段和实际镜像 revision；必要时精确班次只读归属/状态查询。**必须先向用户说明新增资产范围再创建；本轮未创建、未触发任何 workflow，也不借另一任务分支上传。** 使用既有双层只读保护，不登录创建会话/不 POST，不依赖启动时建表的应用初始化来伪称纯 GET 无写风险。

部署门禁：主 agent 合并两项报告并复核范围 → 用户授权实施 → 独立实现/评审/本地与 CI 验证 → 确认最终发布内容和生产授权后安排部署。前端 A 可评估 web-only；包含 B 的后端契约则需 API/Web 配套发布，无 schema 迁移。不得回滚已部署的分级幂等、VOID 或 test 隔离来规避本错误。共享分支和发布窗口由主 agent 协调，不操作另一运行中核查 workflow。

验收：核对 checkout/API/Web实际 revision；用已存在、明确授权的 real 班次只读进入交班及全屏，确认没有 `shiftId=NaN/undefined/0`，两接口指向同一选择；刷新/退出重入/慢响应重排后不出现旧错误；无班次/CLOSED显示正确状态。普通用户 scope 与管理员 real/test 必须分别验证；无合适测试样本则保留验收缺口，不新建生产测试班次。服务端非法 ID 仍应400。全流程停在确认交班按钮之前，生产 close/grading/packing/warehouse POST 均不属于本次授权。

回退采用已审核的新提交/兼容版本发布，不改写已发布历史、不回退数据库；如果只有 A 发布，明确 B 未完成。上线观察 400 请求率与失败路由，不能只观察 500。

## 10. 主 agent 合并项与停止点

- 本项主因是交班首挂载传 NaN 和请求乱序；库存确认失败是另一调用链，不应混为一个 shiftId 根因。
- 报告中 DataScope 精确核验与入库展示旁项需主 agent 决定与另一方案的交界；实施前亲读拟改代码和核实归属映射。
- 独立交付路径：`docs/ops/packaging-fullscreen-shiftid-investigation.md`。

**未实施。仅完成只读核查与无网络内存复现，唯一新增文件为本报告。等待主 agent 合并复核后向用户报批；代码、schema、业务数据、生产 POST、部署及 git 写操作均未执行。**

## 2026-09-10 授权实施后续

用户已授权实施，与确认入库SKU修复联合推进。最新代码、DOM/PG测试、CI/发布及剩余验收见 [统一实施报告](packaging-sku-shift-implementation-20260910.md)。上文“未授权/未实施”为原只读调查截止状态，不代表本次授权后的进展。
