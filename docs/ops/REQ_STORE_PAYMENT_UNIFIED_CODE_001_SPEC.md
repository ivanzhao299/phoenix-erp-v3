# Requirement Spec: Unified Store Payment Code 001

## Request Intake

| Field | Value |
| --- | --- |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| 原始自然语言 | 老挝直营店现在收款码分散，很多店员用个人收款码收款，后续不好对账，也不好监管。我希望先做一个统一收款管理方案：先不一定马上自动对接银行或支付平台，第一步可以先把每个门店的公司收款码、收款账户、收款人、门店、币种、付款截图、付款时间、金额、订单或销售小票关联起来。店员上传或录入后，ERP 里能形成收款记录，管理人员能按门店、日期、收款人、币种、支付方式查询。后续再考虑和 POS、库存、财务、用友好业财对接。 |
| 业务背景 | 老挝直营店收款码分散，店员个人收款码混用，导致公司资金归集、门店对账、监管审计和后续财务入账困难。 |
| 业务目标 | 建立统一收款管理方案，先支持公司收款码与人工录入/上传形成 ERP 收款记录，再逐步扩展到 POS、库存、财务和好业财对接。 |
| 目标用户 | 店员、店长、直营网点管理人员、财务人员、运营审计、系统管理员。 |
| 使用场景 | 店员录入顾客付款；上传付款截图；关联门店、收款账户、币种、金额、付款时间、订单或销售小票；管理人员查询和稽核。 |
| 当前痛点 | 个人码收款不可控；收款归属不清；付款截图和订单割裂；跨门店对账困难；后续财务和库存对账缺少统一来源。 |
| 期望结果 | ERP 形成统一收款记录，支持按门店、日期、收款人、币种、支付方式查询，并为后续对接 POS/库存/财务/好业财预留边界。 |
| 涉及模块 | 门店/POS、销售订单、库存、财务收款、附件、主数据、权限、审计日志、未来第三方支付接口。 |
| 涉及角色 | 店员、店长、财务出纳、财务主管、运营管理、审计、系统管理员。 |
| 涉及数据 | 公司收款码、收款账户、门店、收款人、币种、支付方式、付款截图、付款时间、金额、订单号、销售小票号、收款记录状态。 |
| 涉及权限 | 店员录入本店收款；店长查看本店；财务按授权跨门店查询；管理员维护收款配置；敏感操作审计。 |
| 涉及财务 | 收款记录不是自动财务核销；需区分已录入、待确认、已确认、已作废、已对账等状态；后续才对接财务收款或好业财。 |
| 涉及主数据 | 公司、门店、收款账户、收款码、币种、支付方式、收款人、门店 DataScope。 |
| 涉及第三方接口 | MVP-1 不直接对接；后续可能涉及银行/本地支付/BCEL One/第三方支付平台/好业财。 |
| 是否涉及 migration | MVP-1 很可能涉及，除非已有可复用表完整覆盖收款记录和附件关联。正式开发前必须人工确认 schema 策略。 |
| 是否需要灰度 | 是，建议先选择一个老挝直营店单店灰度。 |
| 是否需要回滚 | 是，需要支持关闭新入口、回退人工台账/旧流程，并保留已录入记录的可审计状态。 |

## Risk Classification

| Field | Value |
| --- | --- |
| 风险等级 | L5 |
| 为什么不是低风险 | 涉及真实收款、财务对账、门店权限、附件凭证、主数据、POS/库存/财务未来链路，且可能需要 migration/schema。 |
| 哪些部分可先做低风险 MVP | 仅做方案、只读数据核查、页面原型、字段字典设计、人工录入流程草案、灰度/回滚文档。 |
| 哪些部分必须后置 | 自动支付回调、自动核销、库存联动、财务入账、好业财对接、全门店替换收款码、生产部署。 |
| 是否允许自动开发 | 否。当前只允许需求草案和 proposal-only 合同。 |
| 是否必须人工批准 | 是。进入任何实现、migration、权限变更、财务联动、第三方对接前必须人工批准。 |

## Clarification Questions

### P0 必须确认，否则不能进入开发

1. MVP-1 是否允许新增表/字段，还是必须复用现有表？
2. 试点门店是哪一个：孟赛、万象、琅勃拉邦，或其它门店？
3. 公司收款码和收款账户由谁维护，是否已有主数据来源？
4. 收款记录是店员录入后直接有效，还是必须店长/财务确认？
5. 订单或销售小票关联在 MVP-1 是否必填，还是可选？
6. 店员、店长、财务分别能查看哪些门店和哪些字段？
7. 付款截图是否必须上传，附件权限和保留周期如何要求？
8. MVP-1 是否明确不做自动核销和第三方支付回调？

### P1 建议确认，可影响方案

1. 支付方式范围：现金、银行转账、BCEL One、二维码、其它？
2. 是否涉及 LAK / RMB / USD 多币种，是否需要汇率字段？
3. 收款账户是一店一码、一店多码，还是集团统一码？
4. 重复录入、错录、作废、退款如何处理？
5. 查询是否需要导出或打印对账单？
6. 是否需要与现有 POS 小票号规则对齐？

### P2 可后置确认

1. 后续是否对接好业财，采用汇总还是明细同步？
2. 是否接银行或支付平台回调，签名/token/重试机制如何设计？
3. 是否要接库存出库或销售订单自动对账？
4. 是否需要移动端扫码录入或收银端快捷入口？

## MVP Scope Recommendation

### MVP-1: Manual Unified Payment Record

| Field | Value |
| --- | --- |
| 目标 | 建立统一公司收款码和人工录入/上传收款记录的闭环。 |
| 包含功能 | 门店收款码/账户选择；收款人、门店、币种、支付方式、金额、付款时间、付款截图、订单/小票可选关联；管理查询。 |
| 不包含功能 | 第三方回调、自动到账、自动核销、库存联动、好业财同步、全门店强制切换。 |
| 风险 | L4-L5，因可能涉及 schema、权限、财务凭证边界。 |
| 是否需要 migration | 很可能需要，待 P0 确认。 |
| 是否需要人工批准 | 是。 |
| 建议触发 Agent | A5 read-only first, then A2/A3/A4; A6/A7 for gray and acceptance. |

### MVP-2: POS / Sales Receipt Link

| Field | Value |
| --- | --- |
| 目标 | 将收款记录与 POS 小票或销售订单建立稳定关联。 |
| 包含功能 | 小票/订单查询关联、状态校验、查询筛选、异常关联提示。 |
| 不包含功能 | 自动库存扣减、自动财务核销、第三方支付对账。 |
| 风险 | L4。 |
| 是否需要 migration | 可能需要关联字段或中间表。 |
| 是否需要人工批准 | 是。 |
| 建议触发 Agent | A3 + A4 + A5 + A2. |

### MVP-3: Finance Receipt / Chanjet Integration

| Field | Value |
| --- | --- |
| 目标 | 将确认后的收款记录与 ERP 财务收款或好业财对账流程衔接。 |
| 包含功能 | 财务确认、对账状态、汇总报表、好业财接口方案评估。 |
| 不包含功能 | 直接把未确认门店记录入账；绕过财务审核；改写好业财规则。 |
| 风险 | L5。 |
| 是否需要 migration | 可能需要。 |
| 是否需要人工批准 | 是，财务负责人必须确认。 |
| 建议触发 Agent | A3 + A5 + A2 + A7. |

### MVP-4: Payment Callback / Auto Reconciliation

| Field | Value |
| --- | --- |
| 目标 | 对接支付平台回调或流水查询，实现自动生成或自动匹配收款记录。 |
| 包含功能 | 回调验签、幂等去重、失败重试、流水查询、自动匹配规则。 |
| 不包含功能 | 未验签回调入账；无人工复核的高风险自动核销。 |
| 风险 | L5。 |
| 是否需要 migration | 大概率需要。 |
| 是否需要人工批准 | 是，安全、财务、运维共同批准。 |
| 建议触发 Agent | A2 + A3 + A5 + A6 + A7. |

## Business Plan

MVP-1 should be treated as a controlled internal ERP collection record workflow, not as a payment gateway integration. The safest first step is to define company collection account data, store scope, manual entry fields, attachment handling, confirmation states, query permissions, and a single-store gray rollout.

## Page Requirements

1. Store payment record list with filters: store, date range, receiver, currency, payment method, status.
2. Store payment record create/edit form for manual entry and payment screenshot upload.
3. Read-only detail page with audit trail.
4. Management view for store managers and finance users.
5. Clear state labels: draft/ submitted / confirmed / voided / reconciled, pending final policy.

## API Requirements

1. API surface must enforce DataScope and role permissions.
2. Create/update/void/confirm endpoints must be explicitly separated.
3. Attachment upload must use approved attachment flow.
4. Query API must support store, receiver, date, payment method, currency, and status.
5. Future callback endpoints must be separate from MVP-1 and require A2 approval.

## Data Requirements

1. Required fields: store, receiver, currency, amount, payment time, payment method, collection account/code, screenshot, creator.
2. Optional or conditional fields: POS receipt number, sales order number, customer, remarks.
3. Audit fields: created_by, created_at, updated_by, updated_at, confirmed_by, confirmed_at, voided_by, voided_at.
4. Idempotency and unique rules must be designed before any payment callback or auto import.

## Permission Requirements

1. Store clerk: create and view own/store records only.
2. Store manager: view and review own store records.
3. Finance: cross-store view and confirmation according to DataScope.
4. Admin: configure accounts/codes with audit.
5. No user can silently modify confirmed financial records without audit.

## Audit Log Requirements

1. Record creation, edit, submit, confirm, void, attachment change, permission denial.
2. Do not log payment secrets, tokens, or sensitive full account credentials.
3. Log actor, timestamp, store, action, before/after summary, and reason for void/adjustment.

## Finance Impact

MVP-1 creates operational collection records only. It must not automatically create accounting receipts, AR settlement, or Chanjet entries until finance approves MVP-3.

## Master Data Impact

Requires review of store, company, collection account, currency, payment method, user/store scope, and attachment policies. A5 must perform read-only readiness before implementation.

## Third-Party Interface Impact

No third-party payment interface in MVP-1. Future integration must handle callback signature, token rotation, replay protection, retry, idempotency, and environment separation.

## Acceptance Standards

| Area | Standard |
| --- | --- |
| 前端验收 | Forms and list filters cover MVP-1 fields; role-specific views are clear; screenshot upload path is usable; no payment callback UI implied. |
| 后端验收 | APIs enforce DataScope; record lifecycle is explicit; attachment and audit handling are defined; no auto finance settlement. |
| 安全验收 | No personal collection code as default; no cross-store leakage; audit events exist; secrets are not logged. |
| 数据验收 | Required fields, status model, master data sources, and possible migration are approved before implementation. |
| 部署验收 | Single-store gray plan exists; no production rollout without GO decision. |

## Gray Launch Plan

1. Pick one Laos direct store after P0 confirmation.
2. Enable MVP-1 only for approved roles.
3. Keep legacy/manual fallback during pilot.
4. Compare ERP records with actual account receipts daily.
5. Expand only after finance and store manager sign-off.

## Rollback Plan

1. Disable new entry/menu or feature flag.
2. Preserve already created records as read-only audit evidence.
3. Return store to prior manual collection verification process.
4. Finance confirms no duplicate or missing receipt records.

## Explicit Non-Goals

1. No business code in this intake phase.
2. No automatic payment platform integration in MVP-1.
3. No automatic finance settlement or write to Chanjet.
4. No migration/schema/entity/table/column change before approval.
5. No all-store forced rollout.
6. No production deployment.
7. No A1 blocker fix.

## Pending User Confirmation

See P0/P1/P2 clarification questions above. P0 answers are required before formal implementation planning.
