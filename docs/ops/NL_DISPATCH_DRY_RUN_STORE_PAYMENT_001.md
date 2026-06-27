# NL Dispatch Dry Run: Store Payment Unified Code 001

## 1. Request ID

`REQ-STORE-PAYMENT-UNIFIED-CODE-001`

## 2. Source Natural Language

> 我想让老挝直营店统一使用公司收款码，不再让店员用个人收款码。顾客付款后，系统能自动生成收款记录，并且可以按门店、收款人、日期、支付方式查询。后续最好还能和 ERP 的销售订单、库存、财务收款对上。

## 3. Structured Requirement

| Field | Value |
| --- | --- |
| 原始自然语言 | 我想让老挝直营店统一使用公司收款码，不再让店员用个人收款码。顾客付款后，系统能自动生成收款记录，并且可以按门店、收款人、日期、支付方式查询。后续最好还能和 ERP 的销售订单、库存、财务收款对上。 |
| 业务背景 | 老挝直营店线下收款当前可能存在店员个人收款码，导致公司收款归集、门店对账、财务入账、销售订单和库存链路难以统一。 |
| 业务目标 | 直营店统一使用公司收款码；顾客付款后形成可查询的收款记录；后续具备与销售订单、库存、财务收款对账的设计基础。 |
| 目标用户 | 门店店员、门店主管、财务人员、运营管理人员、审计/稽核人员。 |
| 涉及场景 | 门店收款、支付确认、收款记录查询、门店/收款人/日期/支付方式筛选、销售订单对账、库存出库对账、财务收款对账。 |
| 涉及模块 | POS/门店、销售订单、库存、财务收款、权限、主数据、可能的第三方支付接口、报表查询。 |
| 涉及角色 | 店员、店长、财务出纳/会计、财务主管、系统管理员、运营审计。 |
| 涉及数据 | 门店、收款码、支付渠道、支付流水号、收款记录、收款人、付款时间、币种、金额、销售订单号、库存单据、财务收款单。 |
| 涉及权限 | 谁可查看/确认/作废收款记录；店员是否只能看本店；财务是否跨门店查看；个人收款码禁用后的权限约束。 |
| 涉及财务 | 收款确认、到账核对、财务收款记录、应收/实收对账、币种汇率、多币种报表、可能的好业财或财务系统对账。 |
| 涉及主数据 | 公司、直营店、门店收款账户、支付方式、收款码、收款人、币种、门店 DataScope。 |
| 涉及第三方接口 | 可能涉及支付平台回调、银行/本地支付渠道、BCEL One、静态二维码、第三方支付流水查询；当前未知。 |
| 是否可能涉及 migration | 是。若现有表无法表达门店收款码、支付流水、回调状态、对账状态，正式开发可能涉及 schema/table/column/migration。 |
| 是否需要灰度 | 是。建议先单店灰度，例如孟赛/万象/琅勃拉邦中选择一个试点门店。 |
| 是否需要回滚 | 是。需要保留旧收款流程或门店开关，出现支付回调/收款记录异常时可回退到人工确认流程。 |

## 4. Risk Level

| Field | Value |
| --- | --- |
| 风险等级 | L5 |
| 为什么不是低风险 | 该需求涉及门店真实收款、财务记录、支付渠道、权限、主数据、销售订单、库存和可能的第三方回调；任何错误都可能造成资金归集、财务入账、库存扣减或权限泄露问题。 |
| 必须人工确认因素 | 支付渠道和回调能力未知；是否一店一码未知；自动生成收款记录是否等同财务确认未知；是否自动核销未知；多币种规则未知；是否对接好业财未知；可能涉及 migration/schema。 |
| 当前是否允许自动开发 | 否。 |
| 当前阶段限制 | 只允许进入方案、澄清问题、结构化需求和任务合同草案阶段。 |

## 5. Follow-Up Questions

1. 公司收款码属于哪种渠道：银行码、老挝本地支付、BCEL One、二维码静态码，还是第三方支付平台？
2. 是否有支付平台回调接口，还是只能人工确认到账？
3. 当前收款码是否能区分门店、收银员或销售小票？
4. 业务期望是一店一码，还是集团统一一码？
5. 是否要求自动到账核销，还是先生成待确认收款记录由财务人工确认？
6. 是否必须与 POS 销售小票绑定？
7. 是否允许先做单店灰度？
8. 孟赛 / 万象 / 琅勃拉邦哪个门店先试点？
9. 是否涉及多币种 LAK / RMB / USD？
10. 是否需要对接用友好业财？
11. 收款失败、重复回调、顾客少付/多付时的业务规则是什么？
12. 店员是否允许查看完整收款流水，还是只能查看本人的收银记录？

## 6. Agent Routing Proposal

| Agent | 是否触发 | 触发原因 | 当前状态 | 是否允许改代码 | 是否必须人工确认 |
| --- | --- | --- | --- | --- | --- |
| A1-CI-Runtime-Gate | No | 本轮仅 dry run，不做 CI/runtime 修复；后续正式开发才需要 CI gate。 | not-started | No | Yes before future run |
| A2-Security-Regression-Gate | Yes | 涉及收款权限、店员可见范围、支付 token/callback 安全、审计日志。 | proposal-only | No | Yes |
| A3-Backend-Critical-Path | Yes | 涉及收款记录生成、订单/库存/财务对账链路、支付回调处理。 | proposal-only | No | Yes |
| A4-Frontend-UAT-Smoke | Yes | 涉及门店收款查询页面、筛选条件、权限提示、POS/店员操作路径。 | proposal-only | No | Yes |
| A5-Data-Readiness | Yes | 涉及门店、收款码、支付方式、币种、DataScope、试点门店主数据。 | proposal-only | No | Yes |
| A6-Staging-Deploy-Runbook | Yes | 涉及灰度、支付回调环境、上线/回滚手册。 | proposal-only | No | Yes |
| A7-Final-QA-Gate | Yes | 涉及财务/支付/库存对账闭环，需要最终 GO/HOLD 判断。 | proposal-only | No | Yes |

## 7. Task Contract Drafts

### A2 Security Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A2-STORE-PAYMENT-SECURITY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A2-Security-Regression-Gate |
| Goal | 评估统一公司收款码涉及的权限、支付回调安全、日志脱敏和审计要求。 |
| Inputs | 本 dry-run 文档、用户后续澄清、现有权限/菜单/支付相关文档。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, production config |
| Required checks | Read-only permission surface review; identify required roles and audit events. |
| Acceptance criteria | No auth bypass proposal; no secret logging; per-store DataScope considered; callback replay/signature risk listed. |
| Rollback plan | Revert proposal commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A2_STORE_PAYMENT_SECURITY_PROPOSAL.md |
| PR rule | Report only until approved. |

### A3 Backend Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A3-STORE-PAYMENT-BACKEND |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A3-Backend-Critical-Path |
| Goal | 设计收款记录生成、支付流水去重、订单/库存/财务对账的后端边界。 |
| Inputs | 本 dry-run 文档、支付渠道澄清、现有 POS/销售/财务/库存接口文档。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, business logic |
| Required checks | Read-only API surface audit plan; idempotency and reconciliation model proposal. |
| Acceptance criteria | Distinguish payment received vs finance confirmed; identify idempotency key; no schema change without approval. |
| Rollback plan | Revert proposal commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A3_STORE_PAYMENT_BACKEND_PROPOSAL.md |
| PR rule | Report only until approved. |

### A4 Frontend Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A4-STORE-PAYMENT-UAT |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A4-Frontend-UAT-Smoke |
| Goal | 规划门店收款查询、筛选、权限提示和 POS 操作路径验收。 |
| Inputs | 本 dry-run 文档、目标门店/角色澄清、未来原型或页面路径。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | apps/web/**, apps/api/**, schema/entity/table/column |
| Required checks | UAT scenario list; screenshot evidence plan; role-based visibility checklist. |
| Acceptance criteria | Covers store, cashier, date, payment method filters; no sensitive cross-store visibility; mobile/POS path considered. |
| Rollback plan | Revert proposal commit; no UI changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A4_STORE_PAYMENT_UAT_PROPOSAL.md |
| PR rule | Report only until approved. |

### A5 Data Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A5-STORE-PAYMENT-DATA |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A5-Data-Readiness |
| Goal | 只读核查门店、收款码、支付方式、币种、DataScope 与灰度数据条件。 |
| Inputs | 本 dry-run 文档、试点门店选择、支付渠道和币种澄清。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | apps/api/**, apps/web/**, migrations, schema/entity/table/column, production data writes |
| Required checks | Master data read-only audit plan; data gap list; gray-store readiness checklist. |
| Acceptance criteria | Identifies required master data without modifying it; flags migration needs separately; includes LAK/RMB/USD handling question. |
| Rollback plan | Revert proposal commit; no data changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A5_STORE_PAYMENT_DATA_PROPOSAL.md |
| PR rule | Report only until approved. |

### A6 Deploy Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A6-STORE-PAYMENT-DEPLOY |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A6-Staging-Deploy-Runbook |
| Goal | 规划单店灰度、支付回调环境、上线开关和回滚手册。 |
| Inputs | 本 dry-run 文档、目标试点门店、环境矩阵、支付渠道回调能力。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | deployment execution, production config writes, apps/api/**, apps/web/** |
| Required checks | Gray rollout checklist; rollback decision points; health checks for payment callback and record creation. |
| Acceptance criteria | No production deploy; rollback path documented; staging/prod environment separation listed. |
| Rollback plan | Revert proposal commit; no environment changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A6_STORE_PAYMENT_DEPLOY_PROPOSAL.md |
| PR rule | Report only until approved. |

### A7 Final QA Contract Draft

| Field | Value |
| --- | --- |
| Task ID | ADF-P2-PROPOSAL-A7-STORE-PAYMENT-QA |
| Request ID | REQ-STORE-PAYMENT-UNIFIED-CODE-001 |
| Assigned Agent | A7-Final-QA-Gate |
| Goal | 定义最终 GO / GO WITH CONDITIONS / HOLD / ROLLBACK 验收矩阵。 |
| Inputs | 本 dry-run 文档、A2-A6 后续报告、用户澄清答案。 |
| Allowed files | docs/ops/** only during proposal stage |
| Forbidden files | apps/api/**, apps/web/**, migrations, production deploy |
| Required checks | Cross-agent evidence checklist; release blocker rules; GO/HOLD criteria. |
| Acceptance criteria | Covers finance, data, security, UI, backend, third-party, gray, rollback gates. |
| Rollback plan | Revert proposal commit; no runtime state changed. |
| Human approval required | Yes |
| Auto-code allowed | No |
| Output file | docs/ops/A7_STORE_PAYMENT_QA_PROPOSAL.md |
| PR rule | Report only until approved. |

## 8. Acceptance Criteria Draft

| Area | Criteria |
| --- | --- |
| 业务验收 | 门店不再使用个人收款码；公司收款码使用规则明确；收款记录能按门店、收款人、日期、支付方式查询；异常付款处理规则明确。 |
| 权限验收 | 店员只看授权范围；财务可按授权跨门店查看；管理员权限不被滥用；所有敏感操作可审计。 |
| 财务验收 | 区分支付成功、到账确认、财务收款入账、核销状态；不自动核销财务账除非另行批准；多币种和汇率规则明确。 |
| 数据验收 | 门店、收款码、支付方式、币种、收款人主数据来源明确；支付流水具备唯一键和幂等规则；重复/冲正/退款状态可追溯。 |
| 第三方接口验收 | 明确是否有回调、签名、token、重放保护、失败重试、流水查询；密钥不落日志；测试环境和生产环境隔离。 |
| 前端验收 | POS/门店路径清晰；查询筛选可用；权限提示准确；移动或收银端体验可验。 |
| 后端验收 | 收款记录生成幂等；订单/库存/财务对账边界清晰；错误状态可恢复；不绕过 WMS/财务统一接口。 |
| 日志 / 审计验收 | 记录创建、确认、作废、回调失败、权限拒绝均可审计；不记录支付密钥、token、完整敏感凭证。 |
| 灰度验收 | 明确试点门店、开关、观测指标、回退条件、人工兜底流程。 |
| 回滚验收 | 可关闭新收款流程；保留人工确认路径；回滚后不丢失已生成收款记录；回滚责任人和验证步骤明确。 |

## 9. Explicit Non-Goals

1. 本轮不改业务代码。
2. 本轮不做支付平台正式对接。
3. 本轮不新增 migration。
4. 本轮不改主数据结构。
5. 本轮不直接替换全部门店收款码。
6. 本轮不自动核销财务账。
7. 本轮不部署生产。
8. 本轮不启动 A1-A7。
9. 本轮不修复 A1 runtime/security blockers。

## 10. Dry-Run Result

| Field | Value |
| --- | --- |
| 是否成功生成结构化需求 | Yes |
| 是否触发 Agent 路由 | Yes, proposal-only |
| 是否正确阻止自动开发 | Yes |
| 是否正确要求人工确认 | Yes |
| Next Action | 等待用户确认澄清问题后，才允许生成正式 Requirement Spec 与 Agent 任务合同。 |
