# Phoenix ERP V3 — 费用申请与报销体系专项审计报告

> 2026-05-31 · Finance V2 / Expense Runtime / Reimbursement Runtime 是否真正可运行
> **本阶段只审计，不开发、不重构、不改业务逻辑。** 审计方式：8 维度并行代码+DB 扫描 + 三场景闭环验证。
> 审计范围：`apps/api/src/modules/finance-v2/`、`apps/web/src/app/(admin)/finance2/`、本地库 `phoenix_erp`。

---

## 0. 总体结论（一句话）

**代码闭环成立，运行闭环不成立。** 费用申请→审批→报销→付款→资金账户五条链路在代码层面均真实实现、首尾原子衔接、状态机完整、SERIALIZABLE 事务严谨、多公司 DataScope 隔离到位；但运行时存在**两处致命断点**使其退化为「准闭环」：

1. **审批断链（最严重）**：`wf_approval_rules` 全表 0 条 → 任何费用提交即命中「无规则→自动通过」分支(fail-open)，瞬间 APPROVED 并自动生成报销单，**人工审批名存实亡**，招待费/大额费用零管控。
2. **角色断链（严重）**：`ROLE_FIN_ACCT`(财务会计)与 `ROLE_CASH`(出纳)完全不在费用/报销菜单静态矩阵 → **王玮华、朱召安对六类操作全部 403**，出纳无法执行本职的「报销付款」，仅 `ROLE_HQ_FINANCE`(刘杰)能走全流程。

**综合总分：6.5 / 10**（代码 9 分级实现，被运行时审批与权限两处拖累）。

---

## 1. 后端审计（score 9 / YES）

`finance-v2` 后端为**真实完整实现**，无任何 TODO / throw not implemented / 空壳。

| 检查项 | 状态 | 代码位置 |
|--------|------|----------|
| ExpenseRequestsService | ✅ 真实 | `services/expense-requests.service.ts` — create(L90)、createFromFormSubmission(L136)、submit(L257 FOR UPDATE+强制 startApproval)、cancel(L303)、list/findById/getSummary；编号 EXP-YYYYMM-NNNNN(advisory lock) |
| ReimbursementsService | ✅ 真实 | `services/reimbursements.service.ts` — submit(L158)、approveDirect(L199 小额直批)、**pay(L223 SERIALIZABLE 事务：锁报销+锁现金账户→校验余额→扣减→写流水→PAID→联动费用 REIMBURSED，含重复付款防护)**、cancel(L315) |
| ApprovalEngine 回调 | ✅ 真实 | `approval-engine/workflow-biz-registry.service.ts` — register('EXPENSE_REQUEST')(L84)，onApproved(L94)同事务 raw SQL 自动生成 fin_reimbursements(幂等检查 L102)；触发点 `approval-engine.service.ts:349,353,448` |
| Finance Controller | ✅ 真实 | `controllers/fin-expense.controller.ts` 前缀 `/api/v2/finance/expenses`，MenuGuard+DataScopeGuard；费用 8 端点 + 报销 7 端点(含 /pay、/approve-direct) |
| 费用状态机 | ✅ 完整 | DRAFT→PENDING_APPROVAL→APPROVED→REIMBURSED，分支 →REJECTED，DRAFT/REJECTED→CANCELLED；报销 PENDING→[PENDING_APPROVAL→]APPROVED→PAID。两机首尾衔接(PAID 回写费用 REIMBURSED) |

**后端缺口**：① EXPENSE_REQUEST 未单独注册 onRejected(依赖引擎默认置 REJECTED，无业务损害)；② cancel/approveDirect 用 TypeORM repo 而 submit/pay 用 raw SQL+FOR UPDATE，风格混用、cancel 无行锁(风险极小)；③ 报销无独立创建端点(仅审批回调自动生成，无法手工补录)。

---

## 2. 数据库审计（score 7 / PARTIAL）

两表均存在、结构合理(多公司+多币种+Workflow 关联)，但**点名的 8 字段仅 2 个精确命中**，其余以不同命名/形态存在或缺失。

**fin_expense_requests**(23 列)：id, expense_no(uniq), requester_id/name, **company_code**(not null), company_name, project_code/name, expense_type, currency_code, amount_original, exchange_rate, amount_base, base_currency, expense_date, description, **attachment_urls(jsonb)**, form_submission_id, **wf_instance_id**, status(default DRAFT), remark, created_at, updated_at

**fin_reimbursements**(21 列)：id, reimb_no(uniq), expense_request_id(not null), expense_no, employee_id/name, **company_code**(not null), company_name, currency_code, reimb_amount_original/base, exchange_rate, base_currency, **cash_account_id**, cash_account_code, **payment_txn_id**, status(default PENDING), **wf_instance_id**, remark, created_at, updated_at

| 点名字段 | 命中情况 |
|----------|----------|
| company_code | ✅ 双表 NOT NULL，参与复合索引 |
| cash_account_id | ✅ 仅报销表（费用阶段无需出纳账户，合理） |
| workflow_instance_id | ⚠️ 命名为 `wf_instance_id`(双表) |
| approval_status | ⚠️ 以 `status` 承载状态机 |
| payment_reference | ⚠️ 命名为 `payment_txn_id`(仅报销表) |
| attachment_count | ❌ 无；费用表用 attachment_urls(jsonb)，报销表无任何附件字段 |
| site_code | ❌ 双表缺失，无场站级隔离 |
| created_by | ❌ 双表缺失，仅 requester_id/employee_id 业务人字段，无标准审计列 |

**索引**：费用表 pkey + expense_no 唯一 + (company_code,status)；报销表 pkey + reimb_no 唯一 + (company_code,status) + (expense_request_id)。**数据量：两表均 0 行（未投产）**。无 FK 约束(引用完整性靠应用层)。

---

## 3. 前端审计（score 9 / YES）

| 页面 | 状态 | 依据 |
|------|------|------|
| `/finance2/expenses` | **ACTIVE** | 真实列表+新建表单+详情(含 wfTimeline)，Sidebar「财务管理」分组注册，权限码 `MENU_FIN2_EXPENSE`，API 对应后端真实端点 |
| `/finance2/reimbursements` | **ACTIVE** | 真实页面，权限码 `MENU_FIN2_REIMBURSE`，Sidebar 经 hasPermission() 菜单级过滤 |

未发现 LegacyFreeze / 注释屏蔽 / feature flag 隐藏。权限码在 RBAC 菜单种子、rbac.matrix.ts、多份角色授权迁移中均已配置。**唯一隐患**：费用新建表单**无附件上传控件**(见 §8)。

---

## 4. Workflow 审计（score 6.5 / PARTIAL）

费用申请**代码层已真正接入 Workflow 2.0**，链路四环全通：

```
创建/提交 ──submit() 强制 approvalEngine.startApproval({bizType:'EXPENSE_REQUEST'}) ──► wf_instance_id 写回费用表
  ↓ 审批末步通过 approveStep() 同事务调 onApproved()
onApproved 回调 ──raw SQL 幂等 INSERT fin_reimbursements(PENDING, RMB-YYYYMM-NNNNN)──► 报销单自动生成 ✅
```

| 环节 | 状态 | 位置 |
|------|------|------|
| submit 发起审批 | ✅ | expense-requests.service.ts:257 |
| createFromFormSubmission(Native 路径) | ✅ | :136 |
| wf_instance_id 写入 | ✅ | 实体 wfInstanceId，DB 列实测存在 |
| onApproved 自动生成报销单 | ✅ | workflow-biz-registry.service.ts:94 |
| **wf_approval_rules 审批规则数据** | ❌ **BROKEN** | **DB 实测 EXPENSE_REQUEST 0 条、整表 0 条** |

**🔴 致命断点**：`startApproval` 的 resolveRule 返回 null → 命中无规则分支(L137-144) → 直接 `updateBizStatus(APPROVED)+onApproved`，**跳过全部人工审批**。即代码是真审批，运行时退化为「自动批准」，且**无金额下限兜底(fail-open 而非 fail-safe)**，规则缺失静默降级、无告警。

---

## 5. 资金账户审计（score 9 / YES）

报销付款 `pay()` 资金链路**代码层完整闭环**：

```
pay() [SERIALIZABLE 事务]
  ├─ FOR UPDATE 锁 fin_reimbursements + 锁 fin_cash_accounts
  ├─ 校验 current_balance ≥ reimb_amount_base
  ├─ UPDATE 现金账户 current_balance 扣减            ← 扣减余额 ✅
  ├─ INSERT fin_cash_transactions(OUT, REIMBURSEMENT, balance_after 回填)  ← 资金流水 ✅
  ├─ 报销 status=PAID + payment_txn_id              ← 付款记录 ✅
  └─ 联动 fin_expense_requests status=REIMBURSED    ← 状态更新 ✅
```

使用 Finance V2 Cash Runtime(fin_cash_accounts / fin_cash_transactions)。含**重复付款防护**(payment_txn_id 判断)。资金链路是本审计中**最健壮**的一环。运行隐患仅：两表 0 行，从未真实扣过款。

---

## 6. 多公司审计（score 8.5 / YES）

三家公司**均支持独立报销**，隔离链路完整：

| 公司 | 支持 | 依据 |
|------|:----:|------|
| 老挝凤凰农业 COMP-LAO-AGRI | ✅ | sys_organizations org_type=COMPANY 真实存在 |
| 星驰 COMP-LAO-XINGCHI | ✅ | 同上 |
| 凤凰食品 COMP-LAO-FOOD | ✅ | 同上 |

- 两表 `company_code` NOT NULL + 复合索引；Service 全部 `company_code = ANY($n)` 过滤 + `assertOwnership` 归属校验。
- Controller 挂 `DataScopeGuard`，scopedUser 从 CLS dataScope 真实构建 → `DataScopeService.resolve` → sys_user_orgs JOIN sys_organizations 真实组织展开(支持 REGION 兄弟展开、BU 向下穿透)。
- **短板**：无 `site_code`，隔离粒度止于公司级，**同一公司下多场站无法各自报销隔离**(如星驰下东鹏等)。
- **可用性提示**：用户若无 sys_user_orgs 记录则 allowedCompanyCodes 为空 → 看不到自己公司报销(安全侧失败)，需确保三家公司用户均正确配置组织绑定。

---

## 7. 角色审计（score 4 / PARTIAL）🔴

运行时鉴权走**静态矩阵 ROLE_MENU_MATRIX**(MenuGuard 零 DB 查询)，DB `sys_role_menu_permission` 仅供登录构建菜单、**不参与 controller 放行**。

**实际用户-角色绑定(本地库实测)**：刘杰=ROLE_HQ_FINANCE+ROLE_FIN_ACCT;王玮华=仅 ROLE_FIN_ACCT;朱召安(zhuzhao_an)=ROLE_FIN_ACCT+ROLE_CASH。

### 三人 × 六操作权限矩阵（运行时实际）

| 人员(角色) | 费用申请 | 审批 | 报销 | 付款 | 查看 | 导出 |
|------------|:--------:|:----:|:----:|:----:|:----:|:----:|
| **刘杰**(HQ_FINANCE+FIN_ACCT) | ✅E | ✅A | ✅E | ✅E | ✅V | ⚠️无端点 |
| **王玮华**(FIN_ACCT) | ❌403 | ❌403 | ❌403 | ❌403 | ❌403 | ❌ |
| **朱召安**(FIN_ACCT+CASH) | ❌403 | ❌403 | ❌403 | ❌403 | ❌403 | ❌ |

**🔴 核心断链**：
- `ROLE_FIN_ACCT` 完全缺席 MENU_FIN2_EXPENSE/REIMBURSE → 财务会计**连查看都 403**。
- `ROLE_CASH` 在整份 rbac.matrix.ts **零出现** → 出纳对**报销付款(本职)**完全无授权。
- **职责分离缺陷**：付款 pay() 与提交/取消共用 `'E'` 权限码，无独立「付款」维度，RBAC 层**无法分离提交人/审批人/付款人**，违背财务不相容职责。
- **DB 与代码不一致**：DB 中 FIN_ACCT 对 MENU_FIN2_EXPENSE 有 V/C/E → 前端菜单可见、点击却 403(显示与放行错位)。
- create 用 `'E'` 而非 `'C'`；ROLE_CASH 与 ROLE_CASHIER 易混淆;导出 X 无对应后端端点。

---

## 8. 附件审计（score 2.5 / PARTIAL）🔴

| 检查项 | 状态 |
|--------|------|
| 费用申请后端 attachment_urls(jsonb) + DTO + Service | ✅ 后端通(可存 URL 数组) |
| **费用申请前端上传 UI** | ❌ **缺失** — expenses/page.tsx 无 file input，提交不传 attachmentUrls，详情不展示 |
| **报销单附件能力** | ❌ **完全缺失** — fin_reimbursements 无任何 attachment 字段 |
| attachment_count 字段 | ❌ 全系统不存在 |
| 独立附件表/文件元数据 | ❌ 无(仅内联 jsonb，无原名/大小/类型/上传人) |
| 存储后端 | ⚠️ **仅本地磁盘** `process.cwd()/uploads/contracts/`(multer diskStorage)，且**仅采购模块在用**，finance-v2 未接入 |
| OSS / S3 | ❌ 无 ali-oss/@aws-sdk/minio 依赖 |
| 通用组件 FileUploadInput.tsx | ⚠️ 存在但全站无人引用(死代码) |

**结论**：发票/收据/付款截图/合同**用户实际无法上传**——这是完整断链(后端预留、前端缺失、报销表无字段)。存储仅本地磁盘，生产容器重建丢文件。

---

## 9. 业务场景验证

| 场景 | 公司 | 闭环 | 关键阻断 |
|------|------|:----:|----------|
| **场景1 孟赛鸡场采购油费** | COMP-LAO-AGRI | ⚠️ PARTIAL | 审批退化自动批准;油费发票无法上传;付款仅 HQ_FINANCE 可执行;两表 0 行未跑通 |
| **场景2 东鹏养鸡场维修费** | COMP-LAO-XINGCHI | ⚠️ PARTIAL | 无 site_code 无法场站隔离;审批自动批准;维修合同无法上传;出纳无付款权 |
| **场景3 万象食品厂招待费** | COMP-LAO-FOOD | ⚠️ PARTIAL | **招待费这类最需审批的敏感费用反而零审批、无金额兜底(内控风险最高)**;餐饮发票无法留痕;提交/付款共用权限码无法职责分离 |

三场景**技术链路均可走通**(申请→审批→报销→付款→资金流水代码完整)，但**全部因审批 fail-open + 角色错配 + 附件断链而无法真正闭环**。

---

## 10. 评分

| 维度 | 评分 | 说明 |
|------|:----:|------|
| Expense Runtime | **9** | 服务/状态机/事务真实完整 |
| Reimbursement Runtime | **9** | pay() SERIALIZABLE + 资金联动 + 重复付款防护 |
| Workflow Integration | **6** | 代码接入真实，但 wf_approval_rules 0 条退化为自动批准 |
| Cash Integration | **9** | 扣余额/写流水/付款记录/状态更新全闭环 |
| Role Coverage | **4** | FIN_ACCT/CASH 缺席矩阵，两人全 403，职责无法分离 |
| Organization Coverage | **8** | 三公司 DataScope 隔离到位，缺 site_code |
| **总分** | **6.5 / 10** | 代码 A 级，运行时被审批与权限拖累 |

---

## 11. 关键断链清单（按严重度）

| # | 断链 | 严重度 | 性质 |
|---|------|:------:|------|
| 1 | **审批 fail-open**：wf_approval_rules 全表 0 条，提交即自动 APPROVED，无金额兜底，招待费/大额零管控 | 🔴 致命 | 数据/配置缺失 |
| 2 | **角色断链**：ROLE_FIN_ACCT/ROLE_CASH 不在费用报销矩阵，王玮华/朱召安全 403，出纳无法付款 | 🔴 致命 | 权限矩阵缺失 |
| 3 | **职责分离缺陷**：付款与提交共用 'E' 码，无法分离提交/审批/付款人 | 🟠 高 | 内控设计 |
| 4 | **附件凭证断链**：前端无上传、报销表无附件字段，无法留存发票/合同 | 🟠 高 | 前端缺失 |
| 5 | **运行时未验证**：两表 0 行，端到端从未真实跑通 | 🟡 中 | 未投产 |
| 6 | **DB 与代码不一致**：菜单可见但点击 403(DB 有权限、运行不读 DB) | 🟡 中 | 一致性 |
| 7 | **缺 site_code**：仅公司级隔离，多场站无法独立报销 | 🟡 中 | 隔离粒度 |
| 8 | **存储隐患**：仅本地磁盘无 OSS/S3，容器重建丢文件，无独立附件表 | 🟡 中 | 存储 |

---

## 12. 修复建议（仅建议，本阶段不实施）

> 让五条链路从「代码闭环」走到「运行闭环」，需依次解决：

1. **配置审批规则(解 #1)**：为 EXPENSE_REQUEST 在 `wf_approval_rules` 配置按金额/公司的多级审批规则，并将无规则分支由 fail-open 改为 fail-safe(无规则则挂起/拒绝)+告警。
2. **补齐角色矩阵(解 #2/#3)**：在 rbac.matrix.ts 为 ROLE_FIN_ACCT 增费用报销 V/C/E、ROLE_CASH 增报销付款专用权限码(新增 'P' 付款维度)，实现提交/审批/付款职责分离。
3. **打通附件(解 #4/#8)**：finance2 费用/报销页接入 FileUploadInput，报销表加附件字段，建独立附件表 + 接入 OSS/S3。
4. **补字段(解 #7)**：两表加 site_code + created_by，Service 增场站级过滤。
5. **端到端验证(解 #5)**：配置规则与权限后，跑三场景真实数据验证全链路。

---

## 验证（审计为只读，未改任何代码）

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors(未改代码) |
| Web TypeScript | ✅ 0 errors |
| 审计方式 | 8 维度并行代码+DB 扫描 + 综合场景验证（9 agents，只读） |

> 本报告为纯审计产出，未开发功能、未重构、未改业务逻辑、未改数据库。
