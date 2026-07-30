# 好业财 WMS / 银行账户同步 P0 整改报告

日期：2026-07-30

结论：`GO_WITH_CONDITIONS`

## 本轮解决的问题

### 1. 现金 / 银行余额伪差异

根因不是数据本身，而是比较口径错误：

- 好业财 `GL_BALANCE` 使用 CNY 本位币期末余额。
- ERP `fin_cash_accounts.current_balance` 保存账户原币余额，当前同时存在 CNY、LAK、THB、USD。
- 原实现先把 ERP 多币种原币金额直接相加，再与好业财 CNY 本位币求差。
- `financeDifferenceDiagnosis()` 已声明“禁止跨币种直接求和”，但 reconciliation、read model、card authority 三层仍各自计算差异，形成实现矛盾。

整改后：

- 新增 `comparisonComparable` 和 `comparisonReason`。
- 好业财与 ERP 的余额都带 `currency/amount/rows` 分币种明细。
- 口径不可比时 `diff` 和 `diffRate` 固定为 `null`。
- 财务卡片不得绕过 reconciliation 自行重新计算差异。
- 前端显示“口径不可比”和各币种余额，不再展示虚假的巨大差额。
- 好业财本位币余额仍可作为只读财务权威值；ERP 原币余额仅作为分币种辅助证据。

### 2. WMS 供应商权限无效重试

六个失败 Scope 均为好业财返回 `50111`：

- `OTHER_STOCK_IN`，3 个账套。
- `RETAIL_STOCK_OUT`，3 个账套。

整改后：

- 每个权限阻断明确输出 `retryable: false`。
- 所需动作固定为 `OPEN_PROVIDER_READONLY_SCOPE`。
- guardrail 明确 `providerPermissionAutomaticRetryAllowed: false`。
- 页面按钮从“只读重试”调整为“授权后复检”。
- 页面明确提示：只有好业财开放接口权限后才执行一次人工复检，后台不得自动循环重试。

## 当前数据与双端能力

| 领域 | 好业财只读镜像 | ERP 映射 | ERP 业务写入 | ERP → 好业财 |
|---|---:|---:|---|---|
| WMS 单据 | 2,685 张 / 9,930 行 | 16 / 187 主身份 | 0，保持隔离 | Outbox 准备，外部传输关闭 |
| 银行账户目录 | 49 条 | 37 / 49 | 不覆盖余额 | 写回关闭 |
| 现金银行余额 | CNY 本位币 1,634,534.07 | 按币种并列展示 | 不直接写余额 | 禁止余额写回 |

历史 WMS 单据不得直接重放进 ERP。后续仍采用“即时库存期初 + 水位点后增量单据”方案，且所有库存事实必须经过 ERP WMS 统一服务。

## 未自动关闭的条件项

1. 好业财需开放六个 50111 只读 Scope；这是供应商授权动作，ERP 代码不能自行修复。
2. WMS 还有 171 个源身份缺少可证明的 ERP 主数据目标；当前没有唯一精确候选，不允许模糊自动映射。
3. 银行账户还有 12 条 `SOURCE_ONLY`；须先完成账户归属、币种和组织核验。
4. 在账户映射和汇率口径完成前，跨币种汇总差异保持关闭。
5. 好业财外部写入、库存事实晋升和银行余额写回继续关闭。

## 验证结果

- API TypeScript：PASS。
- Web TypeScript：PASS。
- API production build：PASS。
- Web production build（Webpack）：PASS，230 个静态页面 / 路由生成完成。
- `chanjet-integration.service.spec.ts`：81 / 81 PASS。
- `chanjet-wms-bridge.service.spec.ts`：20 / 20 PASS。
- JSON locale：PASS。
- `git diff --check`：PASS。
- W5 closeout gate：PASS（本轮明确审查好业财敏感路径，使用
  `ALLOW_FREEZE_TOUCH=true` 和 `ALLOW_SECURITY_TOUCH=true` 记录授权范围）。

本机 Turbopack 构建入口发现 `apps/web/node_modules/next` 仍指向旧
`codex-orchestrator` worktree 的依赖目录；源码未为该本地依赖污染增加配置绕行，
并已用同一份源码完成 Webpack production build。该环境债不影响本轮代码结论，
后续应在不改业务代码的维护窗口重建主仓库依赖目录。

## 安全边界

- 未写好业财。
- 未修改或删除好业财数据。
- 未晋升 ERP 库存事实。
- 未修改 ERP 银行余额。
- 未执行 migration。
- 未 push。
- 未部署。

## 下一 Gate

1. `CHANJET_PROVIDER_SCOPE_PERMISSION_REPAIR`
2. 授权完成后仅复检六个失败目标，要求 85 / 85 新鲜。
3. `CHANJET_WMS_AND_BANK_MASTER_MAPPING_CLOSURE`
4. `CHANJET_WMS_OPENING_BALANCE_CANARY_PRECHECK`
5. `CHANJET_BANK_ACCOUNT_READ_MODEL_ALIGNMENT`
