# 销售订单信用评估 503 根因核查（SO-20260903-00005）

> 日期：2026-09-03
>
> 范围：只读核查；未修改业务代码、数据库、配置或生产数据
>
> 结论状态：**代码根因边界已收窄，事故实例的底层错误尚未取得，不能把候选原因写成已证实根因**

## 结论摘要

1. `8f853820` 把信用评估异常由 warning 放行改为 503 fail-closed，方向正确，本方案不回退。
2. 当前系统没有独立的“客户 × 公司信用配置表”。信用额度、账期、风险和状态直接存于公司归属的 `sal_customers` 行。客户存在但 `credit_limit=0/payment_terms=0` 是合法默认值，当前语义是不启用额度和账期门槛，不会因此抛异常。
3. 代码中最明确的正常域状态误包装路径是：订单的 `customer_code + company_code` 在 `sal_customers` 中按标准编码及历史编码都找不到 → `NotFoundException` → 提交层把非 403 一律包装为 503。数据库查询、连接等真实基础设施异常也走同一个 503。
4. 因而“无信用档案导致异常”的原假设需要修正：现有模型没有独立信用档案；真正应核对的是订单客户编码与公司归属是否能命中正式客户主档。若能命中，零额度/零账期不会抛错，下一嫌疑才是信用快照 SQL 或数据库基础设施异常。
5. 本次事故的确切分支仍未证实。仓库没有 `SO-20260903-00005` 的日志或数据，本机没有生产 SSH 凭据；现有受控 workflow 只能执行已提交的审计清单，而任务限定最终提交为纯文档，未绕过通道或临时加入生产脚本。
6. 现有观测无法满足“恢复完整底层堆栈”：503 属于 `HttpException`，全局过滤器不会把非 403 HttpException 写入 `sys_error_logs`；提交层日志只写 `err.message`，未传 `err.stack`。容器日志若未轮转，最多可恢复底层错误消息，不能保证有堆栈。

## A. 异常溯源

### A1. 事故锚点与生产证据状态

用户提供的事故锚点：

- 订单：`SO-20260903-00005`
- 公司：`COMP-LAO-XINGCHI`
- 表层响应：HTTP 503，“信用评估服务暂时不可用，订单未提交，请稍后重试”
- 客户编码、提交时间（含时区）、request id：本轮输入未提供，必须从订单行和日志反查

截至本文提交时，没有取得该订单对应的生产订单行、`sys_error_logs` 记录或 API 容器日志原文，因此不能声称客户主档缺失、SQL 报错或连接故障中的任何一个已经发生。

生产只读通道见 `.github/workflows/production-readonly-audit.yml:3-84` 和 `scripts/ops/run-production-readonly-audit.sh:9-49`：SQL 强制 `default_transaction_read_only=on`、`BEGIN TRANSACTION READ ONLY` 并最终 `ROLLBACK`。下一轮经确认执行时应一次性读取：

```sql
SELECT id, order_no, status, company_code, company_name,
       customer_code, customer_name, created_at, updated_at
FROM sal_sales_orders
WHERE order_no = 'SO-20260903-00005';

WITH target AS (
  SELECT customer_code, company_code
  FROM sal_sales_orders
  WHERE order_no = 'SO-20260903-00005'
)
SELECT c.id, c.customer_no, c.legacy_customer_code, c.customer_name,
       c.company_code, c.credit_limit, c.payment_terms,
       c.risk_level, c.status, c.credit_status
FROM sal_customers c, target t
WHERE c.company_code = t.company_code
  AND (c.customer_no = t.customer_code OR c.legacy_customer_code = t.customer_code);
```

日志查询须使用订单 `updated_at` 前后至少 5 分钟的绝对 UTC 窗口。`sys_error_logs` 可查同一请求路径的旁证，但按当前过滤器逻辑，目标 503 预计不会入表；“0 行”不能用来证明没有异常。API 容器应查：

```bash
docker logs --timestamps --since '<UTC-start>' --until '<UTC-end>' phoenix-v3-api 2>&1 \
  | grep -E -B 30 -A 30 'SO-20260903-00005|信用评估失败|QueryFailedError|客户 .* 不存在'
```

此命令必须在受控生产只读 workflow 内执行。Docker 日志只保留 `10m × 3`，若已轮转则应明确记录证据已不可恢复（`docker-compose.yml:15-19,74-78`）。

### A2. 代码调用链

1. `POST /api/v2/sales/orders/:id/submit` 进入 `SalesOrdersService.submit`（`apps/api/src/modules/sales-v2/controllers/sales-orders.controller.ts:65-70`）。
2. 订单有 `customer_code` 时调用 `CustomerCreditService.evaluateCreditStatus(customer_code, company_code)`（`apps/api/src/modules/sales-v2/services/sales-orders.service.ts:566-570`）。
3. `evaluateCreditStatus` 首先调用 `getCustomerArSnapshot`，随后只做内存规则判断（`apps/api/src/modules/sales-v2/services/customer-credit.service.ts:213-256`）。
4. `getCustomerArSnapshot` 先按 `(customer_no, company_code)` 查 `sal_customers`，再按 `(legacy_customer_code, company_code)` 回退；两次均无结果即抛 `NotFoundException('客户 ... 不存在')`（同文件 `:87-106`）。
5. 客户存在后查询 `fin_ar_invoices` 应收聚合（`:108-129`）。该查询没有 catch，SQL/连接错误直接冒泡；最后收款日期查询单独吞错并回退为 null（`:130-138`）。
6. 提交层只原样抛出 403，其他任何异常都包装为目标 503（`apps/api/src/modules/sales-v2/services/sales-orders.service.ts:599-604`）。

### A3. 可抛点分类

| 类别 | 代码行为 | 是否会成为该 503 |
|---|---|---:|
| 客户主档按订单公司无法命中 | 抛 `NotFoundException` | 是，被误包装 |
| 客户存在，额度/账期为 null 或 0 | `?? 0`，继续返回评估 | 否 |
| 客户没有 AR 发票 | 聚合 `COALESCE(...,0)` | 否 |
| 收款日期 SQL 失败 | catch 后按 null | 否（但会隐藏局部故障） |
| 客户查询或 AR 聚合 SQL/连接失败 | 原异常上抛 | 是，合理 fail-closed |
| 黑名单/冻结 | 明确 403 | 否，原样返回 403 |

`8f853820` 的差异证明此前 catch 会记录 warning 后放行；该提交改为记录 error 并抛 503，同时增加了“信用数据库不可用时阻断且不进入事务”的测试（`apps/api/src/modules/sales-v2/services/sales-orders.service.spec.ts:124-138`）。本轮不建议撤销这一收紧。

### A4. 为什么 `sys_error_logs` 不能给出目标堆栈

`AllExceptionsFilter` 对 `HttpException` 直接返回，仅 403 写错误表（`apps/api/src/common/filters/all-exceptions.filter.ts:47-69`）。提交层已把原错误替换为 `ServiceUnavailableException`，因此原始 PostgreSQL 错误也不会再进入过滤器的 PG/Unhandled 分支。生产模式即使写错误表也主动丢弃 stack（同文件 `:140-153`）。此外提交层调用 `logger.error(message)` 时没有传 `err.stack`（`sales-orders.service.ts:599-604`）。

这是确定的可观测性缺口，不应以推测堆栈填补。

## B. 信用语义盘点

### B1. 当前信用模型

- `sal_customers` 是统一正式客户主档；信用字段位于该表，不存在已实现的独立 customer-credit 配置表（`docs/customer-master-consolidation-audit.md:11-23`）。
- 该表含 `company_code`、`credit_limit NOT NULL DEFAULT 0`、`credit_used NOT NULL DEFAULT 0`、`payment_terms NOT NULL DEFAULT 0`、`risk_level`、`status`（`apps/api/migrations/20260527_sales_v2_phase0_baseline.sql:45-78`）。后续增加 `credit_status/last_overdue_at/auto_frozen`（`apps/api/migrations/20260527_sales_v2_phase5_credit_control.sql:24-49`）。
- 新建客户时额度/账期缺省写 0（`apps/api/src/modules/sales-v2/services/customers.service.ts:123-136`）；信用编辑也是直接更新客户行（同文件 `:212-223`）。
- 信用页面展示客户行上的额度/已用额度；客户档案页直接编辑额度与账期（`apps/web/src/app/(admin)/sales2/credit/page.tsx:139-152,227-258`；`apps/web/src/app/(admin)/sales2/customers/page.tsx:634-650`）。

### B2. “无配置”的既有应然口径

仓库没有“无配置必须拒绝”“继承公司默认额度”或“自动进入审批”的正式规范。现有 DDL、创建逻辑和评估规则共同形成的唯一已实现口径是：

- `credit_limit=0`：不触发 `OVER_LIMIT`，即不限额度门槛；
- `payment_terms=0`：不触发“逾期天数超过账期”，即不启用账期门槛；
- 仍有逾期余额时返回 `WARNING`，允许提交但提示；
- 黑名单/冻结仍禁止；
- 客户主档不存在不是“零信用配置”，当前会抛异常。

因此不建议凭空新增 `NO_CREDIT_PROFILE → 按需审批` 政策。若业务希望“零配置必须审批”，那是新的信用政策，需要产品/财务另行确认，不应夹带在本次误伤修复里。

### B3. 散客与 POS CREDIT

`RETAIL` 客户类型被定义为“散客零售”，但 POS 当前不会把匿名散客解析为正式客户编码。建单缺省写 `customer_code=NULL, customer_name='散客'`（`apps/api/src/modules/store-pos/services/store-pos.service.ts:276-305`）。

POS 赊销没有调用 `evaluateCreditStatus`：只要客户编码和名称不同时为空，就扣库存、生成 AR 并完成销售；匿名散客因已有默认名称可通过校验（同文件 `:475-515`）。POS AR 固定 30 天到期，不读客户额度或账期（`:1061-1090`）。既有研究已经把“CREDIT 客户校验会被默认散客绕过、MIXED 可形成无权威客户 AR”列为风险（`docs/ops/store-pos-workstation-v1-research-20260827.md:221`）。

所以“POS 赊销以前能过”不能证明信用评估支持无配置；实际原因是 POS 完全绕过了该服务。这是独立治理缺口，不建议在本次 SO 503 小修中顺带扩张实施范围。

## C. 待确认修复方案

### C1. 推荐最小方案

保持基础设施异常 fail-closed，只拆开“域结果”和“服务故障”：

1. 在信用评估返回值中显式标注配置语义，例如 `policyMode: 'UNLIMITED_DEFAULT' | 'LIMITED'`。客户存在且额度/账期均为 0 时正常返回 `NORMAL/WARNING`，继续沿用现行不限额/不启用账期门槛的口径，不制造新审批政策。
2. 客户主档无法按订单的 `customer_code + company_code` 命中时，返回/抛出稳定的域错误码 `CREDIT_CUSTOMER_MASTER_NOT_FOUND`。提交仍然阻断，但响应应为明确的 409 或 422，并提示“订单客户不属于当前公司或主档已失效，请重新选择/补建客户”，不得伪装成服务不可用，也不得自动放行。
3. 提交层仅把数据库连接、超时、未知执行错误包装为 503；冻结/黑名单继续 403；上述客户主档域错误原样返回。不要用“所有 HttpException 一律透传”这种过宽判断，采用明确的信用域错误类型/错误码白名单。
4. 日志补齐结构化关联：`orderNo/orderId/customerCode/companyCode/errorName/errorCode`，并把真实异常对象或 `err.stack` 传给 logger。客户端不暴露堆栈，生产日志保留诊断能力。
5. 前端对 `CREDIT_CUSTOMER_MASTER_NOT_FOUND` 给出重选客户与跳转客户主数据中心的引导；不自动创建主数据。

### C2. 是否需要 `NO_CREDIT_PROFILE`

当前 schema 下不应把它定义为“独立信用档案不存在”，因为没有这种档案。若仅为 API 表达，可使用 `policyMode='UNLIMITED_DEFAULT'` 描述额度/账期均为 0 的已实现策略。只有经财务确认要引入公司级默认信用政策或独立授信审批档案时，才另立设计与迁移，不放进本次修复。

### C3. 事故数据处置分支

生产只读证据取得后按以下分支裁定：

- **客户主档无匹配**：修代码错误分类；同时由业务人员在 UI 重选 `COMP-LAO-XINGCHI` 下的正式客户，或在主数据中心补建/迁移客户。任何生产数据写入另行确认。
- **客户主档匹配且为零额度/零账期**：该状态本身不是异常；继续追查 AR 聚合 SQL 的原始错误及生产 schema。
- **SQL/连接错误**：保留 503，修复具体基础设施/schema 缺陷；不得通过 catch 放行订单。
- **日志已轮转**：用只读数据复现同一客户快照查询，记录只能完成“可复现根因”，不能冒称恢复了事故时刻堆栈。

## D. 测试计划

### D1. 单元测试

`CustomerCreditService`：

1. 客户存在、额度 0、账期 0、无 AR → `NORMAL + allowOrder=true + requireApproval=false + policyMode=UNLIMITED_DEFAULT`。
2. 同上但有未超规则的逾期余额 → `WARNING`，允许提交。
3. 正式编码未命中、历史编码命中 → 正常评估。
4. 两种编码均未命中 → 稳定域错误 `CREDIT_CUSTOMER_MASTER_NOT_FOUND`。
5. 黑名单/冻结、超额度、超账期、WARNING 的既有优先级全部回归。
6. 客户查询或 AR 查询 reject → 保留原异常供提交层识别为基础设施故障。

`SalesOrdersService.submit`：

1. 域错误 → 409/422 明确文案，订单保持 `DRAFT`，事务未启动。
2. 数据库/未知异常 → 503 原文案，订单保持 `DRAFT`，事务未启动。
3. 冻结/黑名单 → 403。
4. 零配置正常结果 → 进入既有审批/自动批准路径，不因评估本身阻断。
5. 断言结构化日志包含订单、客户、公司和 stack/error code，且 HTTP 响应不泄漏 stack。

### D2. API/数据库集成测试

1. 建立同客户名但不同公司的两行客户，验证必须按 `customer_no/legacy_customer_code + company_code` 精确命中。
2. 建立零额度/零账期客户及无 AR、有 AR 两组数据，验证实际 PostgreSQL 聚合结果与单测一致。
3. 使用事务回滚模拟主档缺失/失效引用，验证错误码而非 503。
4. 模拟数据库不可用或 statement timeout，验证仍为 503 fail-closed。
5. 验证失败提交不更新订单信用快照、不启动审批、不预留库存。

### D3. 生产只读验证与部署后 smoke

实施前先执行 A1 的只读取证并回填本报告。实施后以受控账号验证：

- 事故客户零配置（若确为零配置）得到正常评估；
- 人工构造/已有孤立客户引用得到明确域错误和补档引导；
- 人工注入的信用服务故障仍为 503；
- API 容器日志能以订单号检索到底层 error name/code/stack；
- 订单状态、审批实例、库存预留在所有失败分支均无写入。

最后执行 API tsc、相关 Jest、销售订单 PG integration、Web tsc，并重新跑生产只读 smoke。POS 信用旁路另开治理任务，不作为本修复通过条件。

## 待用户确认

本轮仅交付核查报告。建议下一步先确认执行一次受控生产只读取证，取得订单客户/公司匹配结果及尚存容器日志；随后再根据 C3 分支确认是否实施 C1。未经用户确认，不修改业务代码、迁移、生产数据或部署配置。
