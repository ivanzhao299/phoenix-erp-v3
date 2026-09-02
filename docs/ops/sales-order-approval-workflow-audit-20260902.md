# SALES_ORDER 审批工作流完整性核查

> 日期：2026-09-02
> 性质：核查轮，仅代码、测试与生产只读通道核验；未修改业务代码、数据库或生产数据
> 核查基线：`99278459`
> 结论状态：待主 agent 复核；修复另轮执行

## 1. 总结判定

`SALES_ORDER` 已复用系统 `Approval Engine` 的注册、规则、步骤、审批人解析、统一待办和业务回调，主干链路在代码层存在；但本轮判定为 **部分实现，不是完整端到端闭环**。

主要依据：

1. 低价与信用判断使用业务权威服务/快照，且双原因合并为一个 `SALES_ORDER` 实例；但生命周期轮裁定的明确 trigger codes 未落地，只有 `belowFloorPrice/overCredit` 布尔值。
2. 实例和步骤来自 `wf_approval_rules/wf_approval_rule_steps`，审批人经统一 `AssignmentResolverService` 解析，不是旁路自造；但仓库没有 SALES_ORDER 规则 seed，生产是否配置规则本轮无法读取确认。
3. 统一审批中心真实消费 `wf_approval_instance_steps` 并调用统一 approve/reject API；但审批详情只持久化通用摘要，审批人看不到销售订单低价行、底价差额和信用快照。
4. approve/reject 回调注册及事务链在源码中真实存在；库存预留失败可回滚整笔审批事务。现有测试却只验证 mock 注册，没有真实 PostgreSQL/Nest 集成测试证明整条链。
5. 订单取消与 PENDING 审批实例没有双向联动；晚到审批可继续批准已取消订单，是当前最高风险一致性缺口。
6. 本轮无法使用生产凭据执行受控 workflow，生产审批样本结论为 **NO_SAMPLE**。历史只读 run 只证明生命周期/AR 等其他断言，不能替代本轮 SALES_ORDER 审批实证。

## 2. A–F 核查矩阵

| 维度 | 当前事实 | 判定 | 关键差距 |
|---|---|---|---|
| A. 触发层 | 提交仅允许 DRAFT；低价来自价格运行时保存的 `below_floor_price`，信用由提交时 `CustomerCreditService.evaluateCreditStatus()` 评估；低价或需信用审批触发单个 SALES_ORDER 实例 | **部分** | 无明确 trigger codes；`AUTO_APPROVED_NO_RULE` 同时被用于“无需审批”和危险 fail-open，事件语义混杂；信用评估非 403 异常会被降级放行 |
| B. 实例与步骤 | 规则按 bizType/公司/项目/金额匹配；步骤从规则步骤表读取；实例、步骤由 Approval Engine 创建；角色/用户/组织负责人等由统一 resolver 解析 | **部分** | `condition_json`、币种、approvalMode、requiredApprovalCount 未进入真实执行语义；无 SALES_ORDER 规则 seed；无法证明生产规则存在 |
| C. 审批动作 | Web/移动统一审批待办消费 Approval Engine 当前步骤和实例详情；approve/reject 走统一 API；最终状态通过 registry 回写并调用销售回调 | **部分** | 审批页缺客户、低价明细/差额、信用快照；业务类型筛选缺 SALES_ORDER；无真实 DB 集成测试证据 |
| D. 边界异常 | 审批、订单状态、生命周期事件、库存预留处于同一 transaction，预留失败会回滚 | **部分** | 订单取消不取消 PENDING 实例；实例取消不更新订单且不清待办步骤；超时摘要未过滤实例终态/当前步骤；晚审批可复活已取消订单 |
| E. 生产实证 | 只读通道定义完整且本地 manifest 校验 PASS | **NO_SAMPLE** | 当前环境无 production environment 凭据，不能取得实例、审批人、动作时间线和终态一致性样本；历史 run 亦无新订单真实审批样本 |
| F. 设计合理性 | BizRegistry、规则表、步骤表、AssignmentResolver、统一待办和事务回调均与其他 biz type 同构 | **部分** | 销售丰富触发上下文没有贯通规则与审批 UI；通用 Engine 宣称的并行/任一人/计数语义实际未实现；取消双向规则未落地 |

## 3. A — 触发层

### 3.1 低价与信用来源

- 订单建单/改草稿时以价格运行时返回的 `floorPrice` 与实际成交价比较，结果固化为订单 `below_floor_price`；提交读取该快照作为低价审批条件。证据：`apps/api/src/modules/sales-v2/services/sales-orders.service.ts:343-352,493-499,606-608`。
- 提交时重新调用 `CustomerCreditService.evaluateCreditStatus(customer_code, company_code)`。`allowOrder=false` 直接拒绝；`requireApproval=true` 才触发信用审批；WARNING 仅标记。证据：同文件 `:565-603`。
- 风险：信用评估中除 403 外的异常被 warning 后放行（`:598-603`）。这不是“超信用阈值旁路”，但在权威服务故障时属于 fail-open，需业务确认是否符合风控要求。

### 3.2 单实例、多原因与事件

触发表达式为 `belowFloor || needCreditApproval`，统一调用 `startApproval({ bizType: 'SALES_ORDER' })`，符合“不创建两个并行实例”的裁定（`:606-660`）。

但“多触发原因 trigger codes”没有落地：`SUBMITTED`、`APPROVAL_STARTED` 和自动批准事件只记录 `{ belowFloorPrice, overCredit }`，全仓未发现 SALES_ORDER 的 `trigger_code/triggerCodes` 或 `LOW_PRICE/OVER_CREDIT` 受控码。故该整改项判定 **未实现**。

### 3.3 无规则自动批准

Approval Engine 当前默认 fail-safe：无规则或无步骤抛 400；仅 `sys_configs.workflow.fail_open_enabled=true` 时回写批准态、执行回调并返回 null（`apps/api/src/modules/approval-engine/approval-engine.service.ts:110-126,290-320`）。销售 service 收到 null 后写 `AUTO_APPROVED_NO_RULE`（`sales-orders.service.ts:662-670`）。

无需审批的正常订单也写同名 `AUTO_APPROVED_NO_RULE`（`:681-688`），导致“业务无需审批”和“触发审批但系统无规则且危险开关放行”无法仅凭 event_type 区分。事件链存在，但语义不合理。

## 4. B — 实例、步骤与审批人

### 4.1 配置来源

- `WorkflowBizRegistryService` 正式注册 `SALES_ORDER → MENU_SALES2_ORDER / sal_sales_orders / APPROVED / REJECTED / CANCELLED`：`apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:198-207`。
- `startApproval()` 从 `wf_approval_rules` 匹配启用规则，再按 `step_no` 读取 `wf_approval_rule_steps`；创建 `wf_approval_instances` 和 `wf_approval_instance_steps`：`approval-engine.service.ts:136-161,281-424`。
- 规则设计器 UI 已暴露 SALES_ORDER 和统一审批人类型：`apps/web/src/app/(admin)/settings/approval-rules/page.tsx:65-140`。

因此 SALES_ORDER 没有旁路新建自己的审批表或步骤模板，体系选择正确。

### 4.2 审批人解析

统一 `AssignmentResolverService` 支持 ROLE、USER、COMPANY_ROLE、PROJECT_ROLE、ORG_MANAGER、PROJECT_MANAGER、COMPANY_FINANCE、DIRECT_MANAGER，并使用公司/项目/发起人上下文解析。角色类步骤创建单行并保留角色，由任一合格角色成员审批；指定用户类步骤固化用户。证据：`apps/api/src/modules/approval-engine/assignment-resolver.service.ts:6-14,45-100,118-180,249-260`；`approval-engine.service.ts:355-424,540-578`。

### 4.3 配置语义缺口

- 实际规则匹配只用 bizType、enabled、公司、项目、金额；`currencyCode` 参数未使用，`condition_json` 未求值（`approval-engine.service.ts:136-161`）。销售传入的 `conditionOverrides` 因而不能区分低价链、信用链或双触发链。
- entity/DTO 暴露 `SEQUENTIAL/PARALLEL/ANY_ONE`、`requiredApprovalCount`，但 Engine 实际始终按 `current_step_no` 串行推进，未读取上述字段。
- 仓库迁移、TS 迁移、脚本中未找到 SALES_ORDER 规则 seed；采购、费用、股东等有明确 seed。代码支持管理员运行时配置，但缺少可部署、可复现的默认销售审批链。

## 5. C — 审批动作、UI 与回调

### 5.1 操作入口

订单页只有提交、取消、签收和纠偏等订单动作，没有审批通过/拒绝按钮，这是正确权限边界。统一 Web 审批页 `apps/web/src/app/(admin)/workflow/todos/page.tsx` 和移动审批页消费 `/api/workflow/my-tasks`，详情读取 `/api/approval/instances/:id`，通过/拒绝调用 `/approve`、`/reject`（Web `:195-263,389-472`）。后端待办只返回实例 PENDING 且当前步骤 PENDING 的任务，实例详情读取全部步骤（`approval-engine.service.ts:786-880`）。

缺口：Web 业务类型下拉只有 PR/PO/PAYMENT/FUND，没有 SALES_ORDER（`workflow/todos/page.tsx:522-530`）；未筛选时仍能显示原始 SALES_ORDER，不构成完全不可用。

### 5.2 审批上下文

销售提交构造了客户、渠道、低价、应收、逾期、额度和信用状态等 `conditionOverrides`（`sales-orders.service.ts:645-659`），但实例只持久化金额、币种、公司、项目和 subject（`approval-engine.service.ts:333-352`）。统一待办详情只显示这些摘要、步骤及通用表单提交；它不会按 SALES_ORDER 的 bizId 回查订单。

因此审批人能看到金额、公司、订单号/主题，但默认看不到：客户信息、具体低价 SKU、实际价/底价/差额、信用快照与触发原因。订单详情虽能展示这些信息，审批页没有可靠深链或内嵌业务卡片。相较原架构“低价审批记录含具体产品、实际价、底价和差额”的要求，判定 **未满足**。

### 5.3 回调与订单终态

`SalesOrdersService.onApplicationBootstrap()` 读取已有注册并注入真实 approve/reject callback（`sales-orders.service.ts:43-50`）。最后一步通过时，Engine 在同一事务中将实例设为 APPROVED、按 registry 更新订单状态、执行回调；销售回调追加 APPROVED 事件、预留库存、追加 INVENTORY_RESERVED。拒绝路径将实例和订单设为 REJECTED，再追加生命周期事件（`approval-engine.service.ts:626-637,689-732,1004-1017`；`sales-orders.service.ts:697-732`）。

这修正了 2026-09-01 初始生命周期报告“未检出注册代码”的旧结论；当前源码注册真实存在。

### 5.4 测试真实性

定向执行：

```text
cd apps/api && pnpm test -- --runInBand src/modules/sales-v2/services/sales-order-lifecycle.service.spec.ts
PASS: 1 suite / 7 tests
```

但该测试用 mock registry 只断言 callback 被注册为函数，没有执行 callback 或连接真实数据库。销售订单 service spec 只覆盖草稿创建；Approval Engine 无 approveStep/rejectStep 集成测试；Web E2E mock 全部 API。

故“bootstrap 注册存在”是代码事实，“approve/reject→订单状态→生命周期→库存事务闭环可运行”仍缺真实 Nest + PostgreSQL 集成证据，不能仅凭 mock 判完整。

## 6. D — 边界与异常

### 6.1 库存预留失败

`approveStep()` 在 `DataSource.transaction()` 内依次更新步骤、实例、订单并调用 `onApproved`；`reserveInventory()` 使用传入的同一 manager，库存不足抛异常。因此标准审批路径的库存失败会回滚审批步骤、实例、订单状态、生命周期和已做的库存变更（`approval-engine.service.ts:583-637`；`apps/api/src/modules/sales-v2/services/egg-inventory.service.ts:545-598`）。此项代码层 **通过**。

### 6.2 审批超时一致性

订单健康摘要只要任一 workflow 查询行 `step.status='PENDING' && due_at<now` 就报 `APPROVAL_OVERDUE`，没有要求实例仍为 PENDING，也没有限定当前步骤（`apps/api/src/modules/sales-v2/services/sales-order-lifecycle.service.ts:80-97,122-128`）。统一 Workflow 指标则同时过滤实例和步骤 PENDING（`apps/api/src/modules/workflow/workflow-metrics.controller.ts:21-35`）。两者口径不一致。

### 6.3 取消双向规则

- `PENDING_APPROVAL` 不在订单禁止取消集合中；订单 cancel 只释放库存（若适用）、改订单状态和写事件，不调用 `approvalEngine.cancelInstance()`（`sales-orders.service.ts:737-758`）。
- `cancelInstance()` 只改实例状态为 CANCELLED，不更新订单，也不把待办步骤改为 CANCELLED（`approval-engine.service.ts:753-768`）。
- approve callback 不校验订单当前状态；晚到审批仍可更新已取消订单为 APPROVED 并尝试预留库存。

因此生命周期轮明确提出的“双向规则”判定 **未实现**，且会制造订单、实例、步骤三方分叉。

## 7. E — 生产只读实证

既有通道为 `.github/workflows/production-readonly-audit.yml`，要求人工确认词并使用 production environment；runner 以 PostgreSQL read-only transaction + rollback 双重约束 SQL，HTTP 仅允许 GET/HEAD。已在本地执行清单校验：

```text
ASSERTION_SQL_PATH=scripts/ops/readonly-audits/sales-order-lifecycle.sql \
HTTP_ASSERTIONS_PATH=scripts/ops/readonly-audits/sales-order-lifecycle.http.json \
bash scripts/ops/run-production-readonly-audit.sh --validate
PASS audit inputs validated
```

本地没有 production SSH/数据库凭据，compose 又缺必需 `JWT_SECRET`，无法执行生产读取。本轮未绕过通道、未制造样本，以下要求均为 **NO_SAMPLE**：

- SALES_ORDER 审批触发原因分布；
- 实例规则、步骤和实际审批人；
- submit→approve/reject 动作时间线；
- 实例终态与订单状态一致性；
- PENDING 订单/实例/步骤分叉与超时样本。

历史 run `33498297181` 记录旧订单 lifecycle snapshot 26/26、RECEIVED→AR 12/12 一致，但新订单真实动作 `new_orders=0`，明确为 NO_SAMPLE。G202 run `33603103980` 的两笔样本覆盖配送+签收+AR process-log，不是 SALES_ORDER 审批样本。两者仅作通道和外围链路背景，不能升级本轮审批结论。

## 8. F — 与既有 Workflow 体系对比

| 项目 | PR/PO/PAYMENT、费用等 | SALES_ORDER | 评价 |
|---|---|---|---|
| BizRegistry | 统一注册业务表与终态 | 同构，并在 bootstrap 注入回调 | 合理 |
| 规则/步骤 | `wf_approval_rules` + steps；部分模块有迁移 seed | 同一表和 Engine；无仓库 seed | 架构同构，可部署性偏弱 |
| 触发 | 业务 service 决定提交并传金额/组织上下文 | 业务 service 先判断低价/信用，再启动统一实例 | 合理，避免 Engine 知晓销售领域；需标准化 trigger codes |
| 条件分流 | Engine 实际只支持金额/公司/项目 | 丰富 conditionOverrides 未被消费 | 信息断层，低价/信用无法配置不同链 |
| 审批人 | 统一 AssignmentResolver | 同构 | 合理 |
| 执行模式 | 实际单步串行 | 同构 | 与配置表宣称的 PARALLEL/ANY_ONE 不一致，是通用 Engine 缺口 |
| 动作 UI | 统一审批中心/移动端 | 同构 | 合理，但缺业务上下文和 SALES_ORDER 筛选 |
| 最终回写 | registry 状态 + 可选 callback | APPROVED/REJECTED + lifecycle/库存 callback | 同构且事务边界较强 |
| 取消 | Engine 有实例取消能力 | 订单与实例未接通 | 不合理，高风险 |

总体设计方向正确：销售订单应继续复用 Approval Engine，不应另造审批表或专属动作端点。需要修的是上下文贯通、配置执行语义和跨域一致性，而不是替换现有体系。

## 9. 待复核修复方案（另轮实施）

### P0 — 一致性红线

1. 在订单取消 transaction 内锁定订单和关联审批实例：若订单为 PENDING_APPROVAL，只允许取消仍为 PENDING 的实例，并同步将未完成步骤置 CANCELLED；反向实例取消通过 registry callback 将订单从 PENDING_APPROVAL 置 CANCELLED并写关联事件。
2. approve/reject 最终回写增加业务前置状态 CAS：SALES_ORDER 仅允许 `PENDING_APPROVAL → APPROVED/REJECTED`。若订单已 CANCELLED，审批动作失败且不改变实例/库存。
3. 统一超时查询口径：只统计 `instance.status=PENDING`、`step.status=PENDING`、`step_no=current_step_no`。

### P1 — 触发与上下文

1. 定义受控码 `BELOW_FLOOR_PRICE`、`CREDIT_OVER_LIMIT`（最终命名待复核），实例或独立不可变关联表保存 `trigger_codes[]`；生命周期事件同时记录 codes，保留单实例。
2. 拆分事件：正常无需审批使用 `AUTO_APPROVED_NOT_REQUIRED`；仅危险 fail-open 使用 `AUTO_APPROVED_NO_RULE`，并带规则查找结果/开关审计信息。
3. 将审批业务快照持久化为受控 JSON（字段白名单），或提供 registry 的只读详情 resolver。统一审批页为 SALES_ORDER 展示客户、总额、低价行/差额、信用快照和订单深链。
4. 明确信用服务异常策略；建议提交失败或进入可观察的人工风控状态，不应静默按正常信用放行。

### P2 — 配置与 Engine 语义

1. 用 TypeORM TS 迁移提供最小 SALES_ORDER 规则/步骤 seed，或将“生产必须由管理员配置”设为部署前只读门禁；禁止依赖不可追溯的手工现状。
2. 若低价、信用、双触发需要不同审批链，让 `condition_json` 正式消费 trigger codes；否则删除误导性的未执行配置能力并把单链规则写入设计约束。
3. 对 `PARALLEL/ANY_ONE/requiredApprovalCount/currencyCode` 做全局决策：实现真实语义并加集成测试，或从 UI/DTO 隐藏，避免配置成功但运行时忽略。
4. Web 待办筛选和业务类型标签补 SALES_ORDER。

### P3 — 可证明性与生产复验

1. 新增真实 PostgreSQL 测试：低价、超信用、双触发、无规则 fail-safe、approve、reject、库存不足回滚、订单取消与实例取消、晚审批冲突。
2. 测试必须启动真实 Nest application/registry/Approval Engine，断言订单、instance、steps、lifecycle、inventory 五类表；不得只 mock callback。
3. 增加 SALES_ORDER 审批专用 readonly-audit SQL/GET 清单。生产自然样本出现后输出 trigger code 分布、规则/步骤/审批人、动作时间线及订单终态一致性；无样本继续报告 NO_SAMPLE。

## 10. 复核决策点

1. 信用评估系统异常应 fail-close，还是允许提交但强制进入人工审批？
2. 低价、超信用、双触发是否使用同一审批链；如不同，trigger codes 与 `condition_json` 的匹配优先级如何定义？
3. 正常无需审批事件是否批准改名为 `AUTO_APPROVED_NOT_REQUIRED`，历史 `AUTO_APPROVED_NO_RULE` 是否只读解释而不回填？
4. SALES_ORDER 审批规则采用代码 seed，还是生产配置门禁 + 配置导出/版本化？
5. 通用 Engine 的 PARALLEL/ANY_ONE/计数语义是实现，还是从配置层收缩为 SEQUENTIAL？

在上述复核前，本报告不包含业务代码、迁移或生产变更。

## 11. 修复执行记录（2026-09-02）

主 agent 已按复核裁定完成实施：

- P0：SALES_ORDER approve/reject 终态回写增加 `PENDING_APPROVAL` CAS；订单取消和实例取消统一按“实例锁 → 订单锁”顺序，关闭所有未完成步骤，并由 registry `onCancelled` 回写订单及追加生命周期事件；晚到审批在事务内冲突回滚，不改变实例、步骤或库存。超时摘要统一为实例 PENDING、当前步骤 PENDING 且 `step_no=current_step_no`。
- P1：实例新增不可变 `trigger_codes text[]` 与 `context_snapshot jsonb`；受控码为 `BELOW_FLOOR_PRICE`、`CREDIT_OVER_LIMIT`。快照仅保存客户、总额、低价行价格/底价/差额和信用评估最小字段。生命周期各关键事件携带 trigger codes；正常免审改为 `AUTO_APPROVED_NOT_REQUIRED`，危险开关无规则放行保留 `AUTO_APPROVED_NO_RULE` 并记录规则查找和开关审计。信用服务异常改为 503 fail-closed。免审批准同时补齐库存预留。
- P2：`condition_json` 落地封闭语义 `triggerCodes`/`triggerCodesAny`/`triggerCodesAll`；未知键 fail-closed。迁移 `1788337017420-AddSalesOrderApprovalContext.ts` 提供两条 `enabled=false` 的低价/信用示例链和真实 `down()`，部署不自动激活。PARALLEL/ANY_ONE 未改执行语义。
- UI：审批中心补 SALES_ORDER 筛选和标签，详情展示白名单业务卡、触发码、低价明细、信用摘要及 `/sales2/orders?orderId=` 深链。
- 可证明性：新增普通红线测试，以及由 `RUN_PG_INTEGRATION=1` 开启的真实 Nest TestingModule + PostgreSQL 集成套件；CI regression 在完成 schema/migration 后执行。生产只读 SQL 新增 trigger 分布、终态一致性和无分叉断言；零实例明确输出 `NO_SAMPLE`。

本地验证记录：

| 验证 | 结果 |
|---|---|
| API / Web `tsc --noEmit` | PASS / PASS |
| API / Web production build | PASS / PASS |
| 定向 Jest | PASS，2 suites / 12 tests |
| Nest + PostgreSQL 集成 | PASS，approve / reject / cancel+late approve，3 tests；所有夹具位于外层事务并 rollback |
| 迁移真实执行 | PASS，本地 PostgreSQL 执行 72 条 TypeORM migration，本迁移成功 |
| migration DML / nullable unique / constraint drift 门禁 | PASS / PASS / PASS |
| readonly-audit manifest validate | PASS |
| API 全量 Jest | 84 suites / 708 tests PASS；既有 `chanjet-callback.controller.spec.ts` 2 项固定 5s timeout FAIL，定向复跑仍失败 |
| Web 全量 Vitest | 95 files / 489 tests PASS；既有 3 files / 26 tests 因 `act is not a function` FAIL，与本改动无调用栈关联 |

生产只读复验必须在包含新列的 revision 部署后执行；无自然 SALES_ORDER 审批实例时按清单输出 `NO_SAMPLE`，不得制造生产样本。
