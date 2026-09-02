# G202 订单详情焕新验收核查

> 核查日期：2026-09-02  
> 核查性质：只读核查；未修改业务代码、数据库或生产数据  
> 验收基准：全流程时间轴、链路健康摘要、关联单据卡、危险动作原因留痕

## 1. 结论

四项目标均不能判定为“完整交付”：全流程时间轴、关联单据卡、危险动作原因留痕为**部分交付**；链路健康摘要在代码层已有两条规则，但真实渲染测试当前失败、生产异常样本未能重新取证，因此仍判为**部分交付**。

本轮最关键缺口：

1. process-log 查询旧表 `wf_task_action`，没有聚合当前 Approval Engine 的 `wf_approval_instance_steps`，真实审批人、审批意见、动作时间缺失。
2. 退货只记录创建，提交、审批、质检、入库/完成未进入订单 timeline；AR、部分 WMS 事件的 operator/from-to/comment 不齐。
3. 前端将 WORKFLOW 事件从已排序 timeline 中拆出后集中渲染，破坏跨来源全局时序。
4. 签收关联单据没有 href；详情页没有人工纠偏入口/弹窗。
5. 唯一命中四目标的 jsdom 渲染测试本轮执行时因 `act is not a function` 失败，Playwright 未覆盖四目标。
6. Production Readonly Audit 通道存在，但生产凭据只在 GitHub Environment；本地无法重新取得完整链路订单或异常实例。公开探针只能证明生产健康及未认证端点受保护。

## 2. 四目标 × 三层证据矩阵

| 目标 | 层 1：代码实现 | 层 2：真实渲染测试 | 层 3：生产实证 | 判定 |
|---|---|---|---|---|
| 1. 全流程时间轴 | 有提交、配送、签收、AR、退货创建事件；审批真实动作未聚合，退货后续缺失，多类字段不齐，前端破坏全局排序 | 有 jsdom fixture/断言意图，但本轮目标测试渲染前失败；Playwright 无覆盖 | 未能重新取完整链路样本；既有 2026-09-01 记录也明确完整动作样本为 `NO_SAMPLE` | **部分交付** |
| 2. 链路健康摘要 | 两条规则：签收无 AR、配送完成无签收；UI 红色展示 warnings；无审批挂起超时等规则 | fixture 覆盖签收无 AR 文案，但本轮未通过执行；未覆盖第二条、绿色态、样式及错误态 | 未能重新执行生产存量异常 SQL；既有审计只证明 RECEIVED→AR 一致性 PASS，不证明异常 UI | **部分交付** |
| 3. 关联单据卡 | 配送/AR/退货有 href，签收无 href；UI 仅对 href 渲染 Link | 仅配送链接有测试意图且本轮失败；AR/退货/签收及真实导航均未覆盖 | 未能认证请求真实订单 process-log，也未验证生产页面跳转 | **部分交付** |
| 4. 危险动作要原因 | 取消 UI + DTO 双重必填并写 append-only event；纠偏后端必填并留痕，但详情页无纠偏 UI | 取消按钮门禁有测试意图但本轮失败；未点击确认验证 POST/刷新/失败；纠偏无测试 | 未执行生产写动作（符合只读红线），无生产事件留痕样本可核验 | **部分交付** |

## 3. 层 1：代码实现核查

### 3.1 process-log 聚合与六类节点

端点为 `GET /api/v2/sales/orders/:id/process-log`：

- `apps/api/src/modules/sales-v2/controllers/sales-orders.controller.ts:46-49`
- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts:246-249`
- `apps/api/src/modules/sales-v2/services/sales-order-lifecycle.service.ts:80-107`

服务查询生命周期事件、配送、签收、Workflow、库存、AR、退货七类数据，但 `timeline` 只拼接生命周期事件、`wf_task_action` 和库存；配送/签收/AR/退货原始记录主要进入 `documents`。

| 节点 | 是否进入 timeline | operator / time / source | from-to / 意见 | 核查结论 |
|---|---|---|---|---|
| 提交 | 是，`SUBMITTED` | 齐；current user、事件时间、`SALES_ORDER` | 齐；DRAFT→PENDING_APPROVAL/APPROVED，remark | 基本完整。证据：`sales-orders.service.ts:627-633` |
| 审批 | 部分 | 生命周期 APPROVED/REJECTED 没有真实审批人；真实动作在 `wf_approval_instance_steps` | 拒绝 comment 是占位语，真实意见未聚合；旧 workflow 映射无 from-to | 不完整。端点查 `wf_task_action`（`sales-order-lifecycle.service.ts:86,100`），而当前引擎写 `wf_approval_instance_steps`（`approval-engine.service.ts:615-624,711-720`） |
| 配送 | 是 | 创建/发车/到达较齐；`OUTBOUND_CONFIRMED` operator 无姓名 | 创建/发车/到达有状态；出库、强制完成部分缺 from-to | 部分完整。证据：`delivery-orders.service.ts:287-301,398-402,436-450,478-492,531-537` |
| 签收 | 是 | 正常/异常签收有操作人、事件时间、签收来源 | 有 comment/metadata；未直接使用签收单 `signed_at`，无统一 from-to | 部分完整。证据：`receipts.service.ts:93-101,159-166`、`sales-orders.service.ts:830-836` |
| AR | 是，依赖 `AR_CREATED` 事件 | 有事件时间和 `FINANCE_AR`，operator 缺失 | from-to、comment 缺失 | 不完整。证据：`sales-orders.service.ts:838-862` |
| 退货 | 仅创建 | 创建时 operator/time/source 齐 | 创建有原因/备注，但无 from-to；后续状态不入 timeline | 不完整。证据：`return-orders.service.ts:301-309,315-397` |

生命周期表本身具备 `actor_*`、`occurred_at`、`reason_code`、`comment`、来源和 from/to 字段，并有 append-only trigger（`apps/api/src/database/migrations/1788253200000-AddSalesOrderLifecycleEvents.ts:11-35,59-72`）；问题主要在写入完整度和聚合数据源，而不是表容量。

UI 在 `apps/web/src/app/(admin)/sales2/orders/page.tsx:1236-1247` 先过滤普通事件，再把 WORKFLOW 事件交给 `WorkflowTimeline`。后端虽已统一按时间排序，前端拆组后会把 Workflow 段集中放置，不能保证提交→审批→配送等跨来源的真实时间交错顺序。

### 3.2 链路健康摘要

后端现有且仅有两条规则（`sales-order-lifecycle.service.ts:104-107`）：

1. `RECEIVED_WITHOUT_AR`：订单为 RECEIVED，且订单无 `ar_invoice_id`，也查不到 AR。
2. `DELIVERY_COMPLETED_WITHOUT_RECEIPT`：存在 COMPLETED 配送但无签收记录。

UI 在 `page.tsx:1215-1223` 对 warnings 显示异常态；只对 `RECEIVED_WITHOUT_AR` 提供中文文案，第二条直接显示内部代码。未发现“审批挂起超时”、AR 反链错误、配送已发车长期未到达、退货链路悬挂等检测。

### 3.3 关联单据卡

`sales-order-lifecycle.service.ts:92-97` 生成：

- 配送：`/sales2/delivery?deliveryId=...`
- AR：`/finance2/ar?invoiceId=...`
- 退货：`/sales2/returns?returnId=...`
- 签收：无 href

UI 在 `page.tsx:1225-1233` 对有 href 的单据渲染 Next `Link`，无 href 时只渲染 `span`。因此配送/AR/退货具备代码层深链，签收不满足“可点击直达”。AR 详情卡另有真实链接（`page.tsx:1301-1323`）。

### 3.4 取消与人工纠偏

取消链路完整度较高：

- 前端 textarea + trim 后禁用/提交：`page.tsx:1393-1403`
- DTO `remark` 使用 `@IsString()`、`@IsNotEmpty()`：`sales-order.dto.ts:148-153`
- 服务写 append-only 事件，含 actor、`USER_CANCELLED`、comment、endpoint/module：`sales-orders.service.ts:737-758`

人工纠偏只有后端链路：

- `POST /:id/manual-override`：`sales-orders.controller.ts:90-95`
- DTO reason 必填：`sales-order.dto.ts:166-173`
- 写 `MANUAL_OVERRIDE` 事件及 comment：`sales-orders.service.ts:770-784`

全仓未发现 `apps/web/src` 调用 `manual-override`，订单详情也没有纠偏按钮或理由弹窗。因此“取消”已实现，“纠偏”仅后端能力存在，目标未完整交付。

## 4. 层 2：真实渲染测试核查

### 4.1 本轮真实执行

执行：

```bash
cd apps/web
./node_modules/.bin/vitest run \
  src/__tests__/sales-activity-orders-page.test.ts \
  src/__tests__/sales-activity-ui-contract.test.ts
```

结果：**1 file passed、1 file failed；3 tests passed、13 tests failed**。`sales-activity-orders-page.test.ts` 的 13 个测试均在 `renderPage()` / `afterEach()` 因 `TypeError: act is not a function` 失败，故其中四目标断言只是测试意图，不能作为本轮有效渲染通过证据。源码契约测试 3/3 通过，但不等同于 DOM 渲染验收。

### 4.2 测试意图与缺口

`apps/web/src/__tests__/sales-activity-orders-page.test.ts:70-113` 计划在一个 jsdom 用例中覆盖：

- `RECEIVED_WITHOUT_AR` 中文告警；
- 一个配送 href；
- 一个普通事件和一个 Workflow operator；
- 取消弹窗初始禁用、输入原因后启用。

但即使修复测试运行环境，该用例仍未覆盖：六类完整节点和字段、全局时间排序、第二条健康规则、绿色/错误/空态、AR/退货/签收链接、真实导航、取消 POST body/成功刷新/失败、人工纠偏。

Playwright `apps/web/e2e/sales-activity-orders.spec.ts:36-80` 只覆盖来源 Tab、打开详情、订单明细/POS 深链和 fallback；catch-all 返回空数据，没有断言本次四目标。因此目前没有浏览器级四目标证据。

## 5. 层 3：生产实证

### 5.1 本轮可重复证据

2026-09-02 公开只读请求结果：

- `GET https://erp.eggslao.com/api/health` → HTTP 200，`status=OK`、`env=production`。
- 未认证 `GET https://erp.eggslao.com/api/v2/sales/orders/1/process-log` → HTTP 401，`Unauthorized`。

这证明生产服务可达、process-log 受认证保护；不能证明任何业务节点字段或 UI 行为。

### 5.2 Production Readonly Audit 通道与阻塞

通道定义于 `.github/workflows/production-readonly-audit.yml:1-97`，要求确认词 `APPROVE-PRODUCTION-READONLY-AUDIT`，凭据来自 GitHub Environment secrets。受控脚本 `scripts/ops/run-production-readonly-audit.sh:1-138` 将 HTTP 限制为 GET/HEAD，SQL 强制只读事务和回滚。

本地没有这些生产 secrets，也没有可 dispatch GitHub workflow 的已认证工具；本地 compose 同时因缺少 `JWT_SECRET` 不能作为代理通道。因此本轮没有绕过认证、伪造 token 或创建业务数据，无法：

- 重新取一笔配送+签收+AR（以及审批/退货）的完整链路订单；
- 对 process-log 逐节点断言 operator/time/source/from-to/comment；
- 重新执行生产异常存量 SQL。

既有 `docs/ops/sales-order-lifecycle-audit-20260901.md:399-421` 记录 run `33498297181`：RECEIVED→AR 一致性 PASS、某笔 process-log HTTP 200 且三字段为数组，但“新订单真实动作及跨公司样本”均为 `NO_SAMPLE`。该记录只作背景交叉核验，不替代本轮生产实证，也不足以证明存在完整链路样本。

## 6. 待主 agent 复核的补救方案（另轮实施）

1. process-log 改聚合 `wf_approval_instance_steps`，建立审批步骤到销售订单/流程实例的可靠关联；保留真实 actor、actedAt、comment、步骤前后态。
2. 补齐 AR、WMS、退货各阶段 lifecycle 写入的 operator/from-to/comment/sourceRef；至少覆盖退货提交、审批、质检、入库/完成。
3. 前端按后端统一 timeline 顺序逐项渲染，Workflow 使用专用样式但不拆离全局序列。
4. 为签收建立可落地的详情深链；核验配送/AR/退货目标页确实消费 query 参数并能定位记录。
5. 在订单详情增加受权限控制的人工纠偏入口，复用后端 reason 必填与 append-only 留痕。
6. 修复 React 19 测试中的 `act` 引用/环境，使目标 jsdom 用例真实通过；拆分并覆盖六类节点、两条告警、四类深链和取消/纠偏请求闭环；新增 Playwright 四目标验收。
7. 通过 GitHub Production Readonly Audit 新增/执行专用只读审计：先筛完整链路订单，再认证 GET process-log 并逐字段断言；另查询两条 warning 的生产实例。若无样本，输出 `NO_SAMPLE`，不得以模拟数据冒充生产证据。

## 7. 验收判定

当前状态不是“订单详情焕新完整交付”。代码已有可见骨架和部分留痕闭环，但审批真实性、退货完整性、签收深链、纠偏 UI、有效渲染测试及生产样本证据均未达到四项目标的完整验收标准。建议主 agent 先复核上述缺口和补救范围，再另轮实施。

## 8. 缺口补救执行记录（2026-09-02）

本轮已按 §6 完成代码补救：

1. process-log 改为按 `wf_approval_instances.biz_type='SALES_ORDER' + biz_id=order.id` 聚合 `wf_approval_instance_steps`，输出真实步骤动作、actor、`acted_at`、comment 和 `PENDING → 步骤状态`；销售订单不再误查旧 `wf_task_action`，旧表继续保留给 legacy Workflow Engine。
2. AR 创建事件补齐操作人、状态前后态、comment 和 endpoint；WMS 出库事件补齐操作人及状态；退货创建、提交、审批通过/拒绝、质检开始/完成、回库、完成均追加销售订单 lifecycle 事件。事件表和 append-only 触发器未改动。
3. 前端严格按后端 timeline 数组逐项渲染，Workflow 仅使用紫色边线区分，不再抽离为独立段落。
4. 配送、签收、AR、退货均生成可点击深链；四个目标页消费 `deliveryId/receiptId/invoiceId/returnId` 并打开或滚动定位记录，订单页也消费 `orderId`。
5. 订单详情新增 `MENU_SALES2_ORDER_OVERRIDE:A` 独立门禁的人工纠偏弹窗，目标状态与原因均必填，调用既有 `/manual-override`；取消仍保持原因必填。
6. 健康摘要补齐“配送已完成但缺少签收记录”中文文案，新增审批逾期、发车 48 小时未到达、退货 72 小时未推进三条规则，并保留无告警绿色正常态。
7. Web test/watch 固定 `NODE_ENV=test`，消除宿主 `NODE_ENV=production` 导致 React 19 production bundle 不导出 `act` 的噪声；jsdom 覆盖两条告警、四类深链、全局时间轴及取消/纠偏请求体，Playwright spec 覆盖四项目标。

新增生产只读清单：

- `scripts/ops/readonly-audits/sales-order-detail.sql`
- `scripts/ops/readonly-audits/sales-order-detail.http.json`

清单先筛配送 + 签收 + AR 完整链路订单，再认证 GET process-log 并断言 timeline/document 字段及四类 href；另筛两条既有 warning 的生产实例。无真实样本统一输出 `NO_SAMPLE`，不创建或伪造数据。执行器仍只允许 GET/HEAD，SQL 仍强制只读事务并最终回滚。

本地验证记录：API tsc 与 Web tsc 均 0 errors；Web Vitest 全量 98 files / 515 tests 通过（包括外部 `NODE_ENV=production` 场景）；API lifecycle 定向 Jest 7/7 通过；readonly-audit manifest 校验通过。API 全量为 83/84 suites、702/704 tests，失败仅为既有 `chanjet-callback.controller.spec.ts` 两个 5 秒超时，单文件重跑仍复现。Playwright 2 个 spec 已启动，但本机 Chromium 缺少系统动态库 `libnspr4.so`，在浏览器启动前失败。两项均留待 CI 标准环境复核，不将其记作验收通过。

生产复验已在 full 部署后执行（GitHub run `33603103980`）：

- revision：checkout / API / Web 均为 `9e374df206ef5b04572bb6195c3ab739477dd91a`。
- 完整配送 + 签收 + AR 样本：2 笔，SQL 选样 PASS；认证 GET process-log HTTP 200，timeline/documents/warnings 数组、逐项字段与 DELIVERY/RECEIPT/AR 深链断言 PASS。
- `RECEIVED_WITHOUT_AR`：生产 0 笔，`NO_SAMPLE`。
- `DELIVERY_COMPLETED_WITHOUT_RECEIPT`：生产 0 笔，`NO_SAMPLE`。
- `PRODUCTION_BUSINESS_WRITES=0`，全程只读。

full 部署 run `33602535757` 成功，`Deploy via SSH`、迁移与健康检查全部通过。两类 warning 没有伪造生产样本，后续出现真实异常时可复用同一清单复验。
