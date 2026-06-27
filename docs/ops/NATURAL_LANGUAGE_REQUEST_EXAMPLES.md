# Natural Language Request Examples

> Purpose: sample how Codex-Orchestrator classifies plain-language requests before dispatch.

## Example 1: Low-Risk Frontend Copy

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 把登录页按钮文案从“进入系统”改成“登录”。 |
| 结构化需求摘要 | Update one low-risk UI label on the login page. |
| 风险等级 | L1 |
| 是否需要追问 | No, if target page and text are clear. |
| 触发 Agent | A4-Frontend-UAT-Smoke |
| 是否允许自动开发 | Yes, limited to the approved UI file. |
| 是否必须人工批准 | No, unless login security behavior is touched. |
| 验收标准 | Only copy changes; screenshot or grep evidence; no auth logic change; web typecheck if code changed. |
| 不做事项 | Do not change login API, JWT, permission, or session behavior. |

## Example 2: Permission-Related Change

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 财务主管看不到应收菜单，帮我修一下权限。 |
| 结构化需求摘要 | Investigate menu/RBAC visibility for finance manager AR menu. |
| 风险等级 | L3 minimum |
| 是否需要追问 | Yes: user role, expected menu code, environment, sample account. |
| 触发 Agent | A2-Security-Regression-Gate + A3-Backend-Critical-Path + A4-Frontend-UAT-Smoke |
| 是否允许自动开发 | No until investigation and approval. |
| 是否必须人工批准 | Yes before permission behavior change. |
| 验收标准 | Permission matrix evidence; no privilege widening; backend and frontend smoke; audit of affected menu codes. |
| 不做事项 | Do not bypass guards, grant admin globally, or modify unrelated roles. |

## Example 3: Finance-Related Change

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 应收账款页面金额不对，和好业财对不上。 |
| 结构化需求摘要 | Triage AR amount discrepancy between ERP ledger/invoices and Chanjet reference. |
| 风险等级 | L4 if data correction is requested; L3 for read-only triage. |
| 是否需要追问 | Yes: period, company, customer, source screenshot/report. |
| 触发 Agent | A3-Backend-Critical-Path + A5-Data-Readiness + A2-Security-Regression-Gate |
| 是否允许自动开发 | No for financial logic or data mutation without approval. |
| 是否必须人工批准 | Yes. |
| 验收标准 | Read-only reconciliation report; no write to `fin_ar_invoices` from Chanjet; permission evidence; discrepancy list. |
| 不做事项 | Do not run production data fixes, connect Chanjet snapshot to invoice table, or alter accounting rules. |

## Example 4: Master Data Change

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 新增一个养殖场和几个仓库，先让采购能选到。 |
| 结构化需求摘要 | Assess master data setup needed for farm/warehouse selection in procurement. |
| 风险等级 | L4 |
| 是否需要追问 | Yes: company, codes, names, DataScope, environment, approval owner. |
| 触发 Agent | A5-Data-Readiness first, then A3/A4 only if approved. |
| 是否允许自动开发 | No by default. |
| 是否必须人工批准 | Yes. |
| 验收标准 | Read-only baseline report; DataScope impact; no direct CRUD bypass; approved data import path. |
| 不做事项 | Do not add migrations, seed business data in migrations, or bypass master data workflow. |

## Example 5: Third-Party Interface Change

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 畅捷通 webhook token 过期了，帮我改一下回调认证。 |
| 结构化需求摘要 | Investigate Chanjet callback/token authentication issue. |
| 风险等级 | L4 for auth behavior; L3 for read-only diagnostics. |
| 是否需要追问 | Yes: environment, endpoint, current failure, token rotation owner, logs. |
| 触发 Agent | A2-Security-Regression-Gate + A3-Backend-Critical-Path + A6-Staging-Deploy-Runbook |
| 是否允许自动开发 | No until security approval. |
| 是否必须人工批准 | Yes. |
| 验收标准 | No secret exposure; signature/token verification preserved; staging smoke; rollback plan. |
| 不做事项 | Do not log secrets, weaken signature verification, or push config to production. |

## Example 6: Go-Live Deployment Request

| Field | Value |
| --- | --- |
| 用户原始自然语言 | 今天晚上把 W5 上线，如果失败就回滚。 |
| 结构化需求摘要 | Prepare release GO/NO-GO and rollback readiness for W5. |
| 风险等级 | L5 |
| 是否需要追问 | Yes: target environment, release commit, window, approver, rollback owner. |
| 触发 Agent | A6-Staging-Deploy-Runbook + A7-Final-QA-Gate + A1-CI-Runtime-Gate |
| 是否允许自动开发 | No. Docs/runbook updates only if approved. |
| 是否必须人工批准 | Yes, GO/NO-GO required. |
| 验收标准 | CI/runtime pass or explicit conditions; release checklist; rollback runbook; production approval recorded. |
| 不做事项 | Do not deploy, merge main, push, or change server state without explicit approval. |
