# W5 Readiness Review · 启动前综合评估

> 编排人：Architect / MasterData Agent（feature/agent-architect-masterdata）
> 日期：2026-06-20
> 阶段：W5 启动前综合体检
> 上游：
> - M1 / M2 系列（架构冻结 + 决策合入）
> - WAVE1_ACCEPTANCE_REVIEW.md（W4 + ERP E3/E5/E6 + Finance F1-F5 合入决议）
> - 已落代码：
>   - W4 Foundation `f4f33bc`
>   - ERP E3/E5/E6 `01014a1`
>   - Finance F1-F5 `bec0185`
>   - ERP isAdmin 正则修复 `4ff066b`（WAVE1 §5.1 阻塞条件已消解）
>
> 本文件**只做读写不动业务代码**；对 12 维度逐项打分，给最终 W5 准入决议。

---

## 0. 速读：总分 + 五维分布

| 维度 | 得分 | 等级 |
|---|---|---|
| 1. 系统生产就绪度（总分） | **62 / 100** | 🟡 中等偏上（足以试运行，未达全量上线） |
| 2. 主数据治理完成度 | **63 / 100** | 🟡 |
| 3. 权限治理完成度 | **42 / 100** | 🔴（R0 安全裸奔未关）|
| 4. ERP 治理完成度 | **52 / 100** | 🟡 |
| 5. 财务治理完成度 | **74 / 100** | 🟢（5 大子域已收口）|
| 7. W5 是否允许启动 | ✅ **允许（PASS WITH CONDITIONS）** | 详 §7 |
| 12. 总决议 | **🟡 PASS WITH CONDITIONS** | 见 §12 |

权重：主数据 25% + 权限 25% + ERP 20% + 财务 20% + 跨域协同/CI/runbook 10%。
计算：63×0.25 + 42×0.25 + 52×0.20 + 74×0.20 + 60×0.10 = 61.85 ≈ **62**。

---

## 1. 系统生产就绪度评分（0~100）

### 1.1 评分准则

| 区间 | 等级 | 含义 |
|---|---|---|
| 0-29 | 🔴 FAIL | 生产严禁 |
| 30-49 | 🟠 高风险 | 仅小范围试点（≤ 1 个 site，可监控）|
| 50-69 | 🟡 中等 | 允许阶段性试运行（场区 / 单店）|
| 70-84 | 🟢 良好 | 允许多 site / 多店并行上线 |
| 85-100 | 🟢 优 | 全量上线 |

### 1.2 分维度评分明细

| 维度 | 得分 | 关键证据 |
|---|---|---|
| 主数据治理 | 63 | M1/M2 架构冻结 ✅；W4 Foundation 落地 ✅；W5 服务改造未启动；M3/M5 未定稿 |
| 权限治理 | 42 | E6 PBAC ✅ + isAdmin fix ✅；R0-1 RBAC 矩阵 / R0-2 notification / R0-3 impersonate / R0-4 chanjet **全部未修** |
| ERP 治理 | 52 | E3+E5+E6 ✅；E1 store_code / E2 customer FK / E4 FIFO 合并 / E7 byProjectManager 未做 |
| 财务治理 | 74 | F1+F2+F3+F4 service 已合入 ✅；F5 文档已出；F6 shareholder bridge 未做 |
| 跨域协同 / CI / runbook | 60 | check-master-data-references.mjs ✅；check-public-controllers.mjs 未出；deploy.yml 稳定但未挂 W5 红线 |
| **加权总分** | **62** | 落入 🟡 中等 = 允许阶段性试运行 |

### 1.3 影响因素

**加分项**（+）：
- 三轮代码改造（W4 / ERP / Finance）全部 tsc 0 error
- 漂移基线 prc2_suppliers 13→14 hit（健康增长），4 个旧 canonical 持平
- isAdmin 正则缺陷已在主线修复（4ff066b）
- 架构冻结 + 决策书层级清晰，后续 wave 引用承诺核验全部 ✅

**减分项**（−）：
- **R0 安全裸奔 4 项未关**（权限维度大幅扣分）
- sys_user_scopes 合表 / DataScope 6 维输出未实施（W7 范围，但全模块依赖）
- store_code 一词三义未拆，POS 上线前阻塞（W6 范围）
- M3 / M5 子文档未定稿（Architect 域待办）
- ERP isAdmin 单测虽 19 条，但 PBAC 整体覆盖率审计未跑

---

## 2. 主数据治理完成度

### 2.1 模块矩阵（63/100）

| 模块 / 子项 | 状态 | 加权 | 得分 |
|---|---|---|---|
| W4 sys_organization_type_rules 表 + 9 seed | ✅ 已落 | 10 | 10 |
| W4 biz_site_aliases 表 + 9 行 seed（孟赛 7 + 东鹏 2） | ✅ 已落（未扩展至全 site） | 10 | 7 |
| W4 master-data extended-gov center（site/BU/shareholder）| ✅ 已落 | 8 | 8 |
| W4 governance details.extended 行数统计 | ✅ 已落 | 7 | 7 |
| M1 架构冻结 + C-1~C-7 决策合入主文档 | ✅ v2.0 已合入 | 12 | 12 |
| M2 子文档（D-1~D-6 决策已拍）| ✅ 草稿 + 决策落档；主文档按 D-* 修订未做 | 10 | 6 |
| M3 子文档（SITE 子类化迁移 + brd_houses FK + W4 seed 三行合并）| ❌ 未启动 | 10 | 0 |
| M5 子文档（/api/master/* 退役清单）| ❌ 未启动 | 5 | 0 |
| biz_projects 扩 5 列 TS 迁移 | ❌ 未启动（W5 范围）| 8 | 0 |
| 数据回填三步法（D-1 snapshot → dry-run → apply） | ❌ 未启动（W5 范围）| 5 | 0 |
| ACTIVE 后 company_code 不可变 service / trigger | ❌ 未落（W5 范围）| 5 | 0 |
| 主数据 hit 漂移基线（W4 = 4 项旧 canonical 持平）| ✅ check 脚本就绪 | 5 | 4 |
| sys_organization_type_rules service 接入 | ❌ 未接（W6 范围）| 5 | 0 |
| brd_houses.site_code FK 收口（user 拍板 #3）| ❌ 未启动（W5/W6 M3 范围）| - | 已计入 M3 |
| **总分** | | **100** | **63 / 100** |

### 2.2 关键证据

- W4 验收：`migration:run` 后 sys_organization_type_rules 9 行 + biz_site_aliases 表存在性 warn 兜底 + extended-gov center 在 `/operations/centers` 第 7 卡可见
- 漂移基线：W4 check 脚本输出 prc2_projects 6 / shr_projects 6 / brd_farms 27 / sys_store 3，全部按 M1/M2 预定收敛路径
- M1 v2.0：947 → 1120 行；7 决策合入；与 user 拍板 4 条 0 冲突；Audit 已 PASS
- M2 决策书 6 项：D-1 snapshot 三步 / D-2 capital_status biz 唯一权威 / D-3 prc2 W10+ / D-4 F2 W8 后 / D-5 pattern 文档先 / D-6 W6 拆三子

### 2.3 减分点

- biz_site_aliases 仅 2 个 site 入种（孟赛 + 东鹏），万象 / 拉邦等其它 site 未入
- M3 子文档缺位是阻塞 W6+ 大动作的硬瓶颈
- W4 seed 中 DEPARTMENT 行缺 `'DEPARTMENT'` 自嵌套，W6 接入前必须 UPDATE seed（M1 §8.2 C-1 已承诺）

---

## 3. 权限治理完成度

### 3.1 模块矩阵（42/100）

| 模块 / 子项 | 状态 | 加权 | 得分 |
|---|---|---|---|
| **R0 安全裸奔** | | | |
| R0-1 `/api/permissions/**` + `/api/permission-sets/**` 仅 JWT 无 menu 检查 | ❌ 未修 | 15 | 0 |
| R0-2 `/api/notifications/config/**` + presence 匿名公开 | ❌ 未修 | 12 | 0 |
| R0-3 auth.service.login bypassPassword + impersonate 无目标限制 | ❌ 未修 | 10 | 0 |
| R0-4 `/api/chanjet/callback` 无签名校验 | ❌ 未修 | 8 | 0 |
| **PBAC 改造（已做部分）** | | | |
| E6 procurement.getApprovers 改 PBAC | ✅ | 5 | 5 |
| E6 workflow.service.isAdmin → PBAC + 正则修复（4ff066b）| ✅ | 5 | 5 |
| E6 assignment-resolver.byCompanyFinance 改 PBAC | ✅ | 4 | 4 |
| **DataScope** | | | |
| F1 DataScope CLS 命名收口（finance-v2 13 service）| ✅ | 5 | 5 |
| F2 DataScope 项目维度补齐 + ProjectSelector | ✅（兼容策略）| 5 | 4 |
| DataScope 5 步合并算法（C-2 W7 实施）| 🟡 文档定型未实施 | 8 | 4 |
| **架构层** | | | |
| APP_GUARD 全局化（PLAN A5）| ❌ 未做（W1）| 8 | 0 |
| check-public-controllers.mjs 红线脚本 | ❌ 未出 | 5 | 0 |
| JWT 唯一源（auth/jwt-config.ts）| ❌ 未抽 | 5 | 0 |
| **DEPT 嵌套防护（C-1）** | | | |
| service ancestor 环检测 + 自环 trigger | ❌ 未落（W5 范围）| 5 | 0 |
| W4 seed DEPARTMENT 自嵌套 UPDATE（W6 前置）| ❌ 未落 | 5 | 0 |
| **scope 严格语义（C-3）** | | | |
| sys_user_orgs "漏绑 COMPANY" 扫描 | ❌ 未跑（W5 范围）| 5 | 0 |
| **跨域** | | | |
| chanjet ar-sync 单向 + fin_ar_invoices 不连接 | ✅（CLAUDE.md §0.6 隔离）| 5 | 5 |
| g5c-rbac-audit.sh 默认密码强制 fail-fast | ❌ 未做 | 5 | 0 |
| **总分** | | **100** | **42 / 100** |

### 3.2 关键证据

- ERP isAdmin 修复：`workflow-admin.util.ts` 19 个 Jest 用例全过；commit 4ff066b
- E6 三处硬编码角色清理已 grep 验证（procurement.service:60 / workflow.service:84 / assignment-resolver:215）
- F1 grep 验证：`scopeAll|companyCodes` 在 finance-v2 仅余 1 处注释字符串（ap-invoices.service.ts:27）
- R0 风险来自 AUDIT_INTEGRATION_AGENT_AUDIT.md，本节直接继承未变

### 3.3 减分点（高权重）

- **R0-1 ~ R0-4 共占 45 分**，全部未关。任何登录用户可改 RBAC 矩阵、写通知模板、公网钓鱼 token —— 这是当前最大的 PASS WITH CONDITIONS 来源
- DataScope 5 步算法仅文档化（W7 实施），W5 期间业务 service 仍走旧 union 逻辑
- check-public-controllers.mjs 红线脚本未出 → 新 controller 漏 `@UseGuards` 无法监测

---

## 4. ERP 治理完成度

### 4.1 模块矩阵（52/100）

| 模块 / 子项 | 状态 | 加权 | 得分 |
|---|---|---|---|
| **E3 prc2_ap_ledger 供应商收口** | ✅ resolveSupplier 收口 4 个写入路径 | 10 | 10 |
| **E5 inv_batches.status 字典化** | ✅ assertInvStockStatus 守 3 个 INSERT | 10 | 10 |
| **E6 角色硬编码清理 + isAdmin 修复** | ✅ + 19 单测 | 10 | 10 |
| **E1 inv_batches.store_code → owning_company_code** | ❌ 未做（W6 范围，依赖 M3）| 15 | 0 |
| **E2 sal_store_sales.customer_code FK** | ❌ 未做（W6 范围）| 10 | 0 |
| **E4 POS FIFO 双路径合并（sku vs product+grade）** | ❌ 未做（W7 范围）| 8 | 0 |
| **E7 workflow.byProjectManager 切 biz_projects** | ❌ 未做（W8 范围）| 8 | 0 |
| **默认仓硬编码迁出 sys_config**（WMS-VTE-MAIN / INBOUND-DOCK / ST-VTE-001 / ALL）| ❌ 未做 | 6 | 0 |
| **prc2_suppliers canonical 引用健康增长**（13→14） | ✅ | 3 | 3 |
| **E5 fallback EXPIRED/LOCKED 数据质量评估** | 🟡 自承延后到 W5 | 5 | 2 |
| **门店日结 daily_close 流程稳定** | ✅ G83 已落地 | 5 | 5 |
| **库存唯一台账（CLAUDE.md §6）**（wms / packaging / store-pos 统一入口）| 🟡 部分（仅 wms + packaging 真统一；store-pos 半旁路）| 5 | 3 |
| **store_code 一词三义现状**（inv_batches.store_code / wms_locations.store_code='ALL' / mst_stores.store_code）| 🔴 未拆 | 5 | 0 |
| **tsc 0 error + check-master-data-references 持平** | ✅ | 5 | 5 |
| **PR description 验收清单（按 PLAN §8.1 要求）** | ✅ ERP/Finance 都贴了 | 2 | 2 |
| **回归测试覆盖**（regr:system / breeding / wms / pos-store / packaging）| 🟡 ERP 自承运行；CI 监控未全绿 | 3 | 2 |
| **总分** | | **100** | **52 / 100** |

### 4.2 关键证据

- E3：`orders.service.ts:resolveSupplier` 4 处调用（create / convertFromRequest / update / approve）；prc2_suppliers hit 14
- E5：`wms.service.ts:assertInvStockStatus` + 进程缓存 + fallback 7 态
- E6 + isAdmin：commit 01014a1 + 4ff066b；workflow-admin.util.ts 单测 11 正 / 8 反全过
- WAVE1 §1 / §3 全部 PASS

### 4.3 减分点

- **E1 store_code 拆家未做** = POS 上线 / 老挝直营店阻塞核心（详 §11）
- **E2 customer FK 未加** = AR 赊销对账风险持续（CRD 风险）
- **E4 FIFO 双路径未合** = 幽灵库存风险（CLAUDE.md §6 唯一台账违背）
- 默认仓硬编码散落（service 改造时点未定）
- E5 fallback EXPIRED/LOCKED 比 CLAUDE.md §7 五态多 2 态，过渡兼容；W5 数据质量 agent 评估未跑

---

## 5. 财务治理完成度

### 5.1 模块矩阵（74/100）

| 模块 / 子项 | 状态 | 加权 | 得分 |
|---|---|---|---|
| **F1 DataScope CLS 命名收口** | ✅ 13 service + 7 controller | 12 | 12 |
| **F2 项目维度补齐 + ProjectSelector** | ✅ 兼容策略 NULL OR ANY | 12 | 11 |
| **F3 reimbursements.pay 旁路收口** | ✅ qr 模式 + 单入口 CashTransactionsService | 10 | 10 |
| **F4 AP 手工付款端点** | ✅ SERIALIZABLE 事务 + 锁顺序 + 双维 DataScope | 12 | 12 |
| **F5 attachment_urls 方案文档** | ✅ docs/fin-attachment-extension-plan.md（仅文档）| 8 | 8 |
| **F6 shareholder-finance bridge** | ❌ 用户排除 | 12 | 0 |
| **fin_ar_invoices ↔ chanjet_ar_snapshot 隔离**（CLAUDE.md §0.6）| ✅ | 8 | 8 |
| **fin_cash_transactions 单入口写流水**（writeTransaction）| ✅ F3 已收口 | 8 | 8 |
| **F2 "NULL OR ANY" 过渡策略注释** | 🟡 service 内有注释；策略升级时点 D-4 拍 W8 后 | 5 | 3 |
| **fin_ap / fin_ar / fin_ar_receipts attachment_urls 字段** | ❌ 仅方案；DDL 在 F5 评审后 W6+ | 5 | 0 |
| **F2 sys_user_project_scopes 覆盖度审计**（Audit 协同）| ❌ 未跑（W5 范围）| 5 | 0 |
| **tsc 0 error + drift 持平** | ✅ | 3 | 3 |
| **总分** | | **100** | **74 / 100** |

### 5.2 关键证据

- F1 grep 验证：`scopeAll|user\.dataScope\.companyCodes` 在 finance-v2 = 1 处（注释字符串）
- F2 grep 验证：`allowedProjectCodes` 命中 ≥ 10 处（ap / ar / expense + receipts 子流）
- F3 grep 验证：reimbursements.pay 不再有内部 INSERT fin_cash_transactions / UPDATE fin_cash_accounts
- F4 controller `@Post('invoices/:id/pay')` + `@RequireMenu('MENU_FIN2_AP', 'E')` + 双维校验

### 5.3 减分点

- F6 未做（用户排除；M2 D-2 双签流程已为后续 wave 落点）
- F2 兼容策略 NULL OR ANY 升级时点延后到 W8 后（D-4）— 此 wave 维持
- attachment_urls DDL 在 F5 评审后 W6+ 落地

---

## 6. 剩余最高风险 TOP 10

> 综合 R0 / R1 / R2 + WAVE1 / M1 / M2 review 评出本时点 TOP 10。
> 等级：🔴 灾难 / 🟠 重大 / 🟡 中等 / 🟢 治理欠债。

| Rank | 风险 | 等级 | 触发模块 | 阻塞 |
|---|---|---|---|---|
| **#1** | RBAC 矩阵可被任意登录用户改写（R0-1 `/api/permissions/**` + `/api/permission-sets/**` 双重注册 + 无 menu 检查） | 🔴 | Audit 责任 | W5 启动可继续，但**生产上线必须先关**；ANY 角色一键提权 |
| **#2** | 通知配置 + 在线用户匿名公开（R0-2 `/api/notifications/config/**` 无 guard + presence 注解空跑） | 🔴 | Audit 责任 | 同上；钓鱼 / 用户清单泄漏 |
| **#3** | auth.service.login bypassPassword 内部参数无调用方鉴权 + impersonate 无目标白名单（R0-3） | 🔴 | Audit 责任 | 同上；任何 service 注入 AuthService 可拿任意 token |
| **#4** | chanjet callback 公网无签名（R0-4） | 🔴 | Audit 责任 | 同上；攻击者覆盖 certificate 切断 token 链 |
| **#5** | `inv_batches.store_code` 一词三义（≈ company_code + 'ALL' 兜底 + 与 mst_stores.store_code 同名异义） | 🟠 | ERP E1 / W6 / 依赖 M3 | 老挝直营店 / 万象 POS 上线阻塞（详 §11） |
| **#6** | `sal_store_sales.customer_code` 无 FK 到 mst_customers | 🟠 | ERP E2 / W6 | 赊销 AR 对账风险；老挝直营店上线阻塞 |
| **#7** | POS FIFO 双路径并存（sku vs product+grade 各扣各的） | 🟠 | ERP E4 / W7 | 幽灵库存风险（CLAUDE.md §6 违背）|
| **#8** | DataScope 5 步算法仅文档化未实施（5 张范围表并集逻辑各 service 自实现）| 🟡 | Architect W7（C-2）| 业务 service 在不同模块看到不同范围；W7 落地前每新业务接入有遗漏风险 |
| **#9** | `shr_projects` 与 `biz_projects` 双轨 + workflow.byProjectManager 仍读 prc2_projects | 🟡 | M2 W6 + W8 | 项目主数据双源；shr 与 finance bridge 软对账 |
| **#10** | 默认仓 / 库位硬编码（WMS-VTE-MAIN / INBOUND-DOCK / ST-VTE-001 / ALL）散落 service | 🟢 | ERP / Architect 协 | 跨公司采购入库可能默认 ALL 破隔离；M3/M5 配套出 sys_config 方案 |

**附加观察（不在 TOP 10 但需追）**：
- 前端 6→7 卡片渲染未跑（WAVE1 C-cond-5 follow-up）
- E5 fallback EXPIRED/LOCKED 与 CLAUDE.md §7 五态不符（数据质量域评估延后到 W5）
- biz_site_aliases seed 仅孟赛 + 东鹏覆盖（万象 / 拉邦未入种）

---

## 7. W5 是否允许启动

### 7.1 启动前置核验

| 前置 | 来源 | 状态 |
|---|---|---|
| M1 v2.0 决策合入主文档 | M1 changelog | ✅ |
| M1 §8.2 DEPARTMENT 自嵌套勘误承诺 | M1 v2.0 §8.2 | ✅ |
| M2 子文档评审通过 + 用户拍板 D-1~D-6 | M2 决策书 | ✅ |
| M2 主文档按 D-* 修订 | M2 §9.1 立即执行项 | 🟡 **未做**（Architect 待 PR）|
| M3 子文档定稿（SITE 子类化 + status 同步 + 占位行 + brd_houses FK）| M2 / WAVE1 C-cond-3 | 🟡 **未做**（Architect 待启动）|
| M5 子文档定稿（/api/master/* 退役清单）| M2 §15.3 | 🟡 **未做**（不阻塞 W5 核心；可并行）|
| ERP isAdmin 正则修复合入 | WAVE1 C-cond-1 | ✅（4ff066b 已合入主线）|
| Finance F1-F5 合入 | WAVE1 C-cond-2 | ✅（bec0185 已合入主线）|
| Finance F2 "NULL OR ANY" 注释文档化 | WAVE1 C-cond-2 跟进 | 🟡 F2 service 已加注释；策略文档化在 D-4 |
| E5 EXPIRED/LOCKED 数据质量评估清单 | WAVE1 C-cond-4 | 🟡 W5 内启动评估 |
| 前端 6→7 卡片渲染验证 | WAVE1 C-cond-5 | 🟡 W5 集成回归 |
| Audit `check-public-controllers.mjs` 红线脚本 | PLAN A6 + WAVE1 §10.1 | ❌ 未出 |

### 7.2 W5 启动评估

W5 **允许启动**，但触发条件分层：

1. **🟢 立即可启动**（依赖已就位的"前置 ✅"项）：
   - M2 主文档按 D-* 修订（Architect 单独 PR；§7.1 已 ✅ 的项目支撑此 PR 合入）
   - M3 子文档撰写（独立 Architect 任务）
   - W5 内独立的小任务（详 §8）

2. **🟡 有条件可启动**（依赖 §7.1 🟡 项分批完成）：
   - W5-A2 biz_projects 扩列 TS 迁移 → 必须先合入 M2 主文档修订
   - W5-A3 数据回填 → 必须先有 M2 主文档（D-1 三步法落档）+ 业务方拍板回填清单流程
   - W5-A11 FK 预演 → 必须 staging 环境就绪

3. **🔴 不允许启动**（依赖未完成的关键前置）：
   - 涉及 R0 安全的任何"借 W5 启动"操作（如新建 controller 漏 guard）
   - W6 / W7 / W8 范围任何任务（M2 §8.5 永禁项）

### 7.3 与 WAVE1 §10.4 W5 合并顺序的对比

| WAVE1 顺序 | 当前实际 | 差距 |
|---|---|---|
| 1. ERP isAdmin 修复 → main | ✅ 4ff066b | 已完成 |
| 2. Finance F1-F5 → main | ✅ bec0185 | 已完成 |
| 3. Architect M2 / M3 文档稿 → 评审 | 🟡 M2 主稿在；按 D-* 修订未做；M3 未启 | 需启动 |
| 4. 用户拍板 M2 / M3 | 🟡 M2 D-1~D-6 已拍；M3 未拍 | 进行中 |
| 5. Architect biz_projects 扩列 TS 迁移 → main | ❌ 未启 | W5 内 |
| 6. ERP byProjectManager 灰度开关 | ❌ 不动（W8）| W8 后置 |
| 7. Audit check-public-controllers.mjs → main | ❌ 未出 | W5 内 |
| 8. F5 attachment_urls 迁移 → main | ❌ 跨入 W6 | 跨入 W6 |

**判定**：✅ **允许进入 W5 阶段**，但实施前需先做 Architect M2 修订 PR + M3 子文档定稿（§9.1 / §10.1 启动顺序）。

---

## 8. W5 允许启动任务清单

按 M2 §8.1 + M2 决策书 D-1 ~ D-6 + 跨 Agent 协同 + WAVE1 §10.1，允许在 W5 期间
启动的任务：

### 8.1 Architect 主任务（M2 / M3 / W4 衍生）

| 编号 | 任务 | 依赖 |
|---|---|---|
| W5-A0 | 三表 snapshot（biz_projects / shr_projects / prc2_projects → backups/）| D-1 |
| W5-A1 | M2 主文档按 D-1 ~ D-6 修订 PR | D-1~D-6 已拍 |
| W5-A1b | M3 子文档定稿（SITE 子类化迁移 + status 同步 + 占位行 + brd_houses FK） | M1 v2.0 |
| W5-A2 | biz_projects 扩 5 列 TS 迁移（nullable ADD COLUMN） | M2 主文档修订 |
| W5-A3 | 数据回填 dry-run → 业务方拍板 → apply（D-1 三步法）| A2 上线 + Q-1 流程 |
| W5-A4 | biz_projects.project_manager_user_id 字段回填 | A2 上线 |
| W5-A5 | biz_projects.capital_status / equity_status / is_shareholder_managed 回填 | A2 上线（D-2 主权）|
| W5-A6 | ACTIVE 后 company_code 不可变 service update path | M1 C-4 |
| W5-A7 | C-4 DB trigger（ACTIVE 后 company_code 不可变）| A2 + A6 |
| W5-A8 | master-data/operations.service.ts:56,169 改读 biz_projects（修 S-W4/S-W5）| Architect 自承 W5 例外 |
| W5-A9 | 漂移基线对账（期望 shr_projects 6→4） | A8 |
| W5-A10 | C-5 唯一公司违规扫描 | A2 |
| W5-A11 | FK 预演 in staging（D-6 W6a 前置） | A2 + A3 完成 |
| W5-A12 | master-data-runtime service 加 pattern 软校验（D-5）| - |
| W5-A13 | C-1 service ancestor 环检测 + 自环 trigger（M1 §8.2）| - |
| W5-A14 | C-1 W4 seed UPDATE 准备（DEPARTMENT 自嵌套 W6 前置）| - |
| W5-A15 | C-3 sys_user_orgs 扫描"漏绑 COMPANY"清单 | - |

### 8.2 Finance Agent 协同任务

| 编号 | 任务 | 依赖 |
|---|---|---|
| W5-F1 | F2 "NULL OR ANY" 过渡策略 service 注释文档化（WAVE1 C-cond-2 跟进）| F2 已合入 |
| W5-F2 | F5 attachment_urls 方案文档评审（与 Architect 评 DDL）| F5 文档 |
| W5-F3 | F2 sys_user_project_scopes 覆盖度审计（与 Audit + Architect 协）| F2 已合入 |
| W5-F4 | shareholder bridge 文档 F6 启动（独立 wave）| D-2 双签流程 |

### 8.3 ERP Agent 协同任务

| 编号 | 任务 | 依赖 |
|---|---|---|
| W5-E0 | 前端 6→7 卡片渲染验证（WAVE1 C-cond-5）| W4 落地 |
| W5-E1' | E1 store_code 准备稿（service 改造草稿 + 默认仓 sys_config 草稿；**不实施**）| M3 子文档 |
| W5-E2' | E2 customer_code FK service 收口写入路径准备（**不加 DDL**）| M3 |
| W5-E5d | E5 fallback EXPIRED/LOCKED 数据质量评估清单（WAVE1 C-cond-4）| F5 - |

### 8.4 Audit Agent 协同任务

| 编号 | 任务 | 依赖 |
|---|---|---|
| W5-AU1 | `scripts/check-public-controllers.mjs` 红线脚本出稿（PLAN A6）| - |
| W5-AU2 | M2 主文档修订 PR review | A1 |
| W5-AU3 | M3 子文档定稿 review | A1b |
| W5-AU4 | W5 末 wave 验收 | 全部 |
| W5-AU5 | R0-1 ~ R0-4 修复 PR（独立 wave，可与 M2/M3 并行）| AUDIT_INTEGRATION_AGENT_AUDIT.md |
| W5-AU6 | g5c-rbac-audit.sh 默认密码 fail-fast | - |
| W5-AU7 | JWT 唯一源 auth/jwt-config.ts 抽 | - |

### 8.5 跨 Agent 协同

| 项 | 责任 |
|---|---|
| M2 主文档 D-2 双签流程文档化 | Architect + Finance |
| F6 shareholder bridge 启动 | Finance 主 + Architect 协 |
| M3 子文档（SITE 子类化）| Architect 主 + ERP 复审业务流不破坏 |

---

## 9. W5 必须冻结任务清单

> 任何下表项目在 W5 期间被启动 = 红线，PR 不予合入。

| 编号 | 冻结项 | 来源 | 解锁波次 |
|---|---|---|---|
| F-1 | `shr_projects` schema 改名 / FK / 数据迁移 | M2 §8.2 / D-6 | W6a-b-c |
| F-2 | `inv_batches.store_code` 改名 / `owning_company_code` 增列 | M1 §6 / M2 §2.4 | W6（依赖 M3）|
| F-3 | `sal_store_sales.customer_code` FK 落 | ERP E2 | W6（service 收口后）|
| F-4 | POS FIFO 路径合并（删 product+grade 路径）| ERP E4 | W7 |
| F-5 | `sys_user_scopes` 合表 | M1 §11.5 / 母规划 §5.7 | W7 |
| F-6 | DataScope 5 步算法 service 实施（DataScopeService 改造）| M1 §11.5 C-2 | W7 |
| F-7 | `workflow.assignment-resolver.byProjectManager` 切 biz_projects | M2 §8.4 E7 | W8（依赖 W5-A4 字段回填）|
| F-8 | `approval-engine/workflow-biz-registry.service.ts` PROJECT tableName / mdAuditHook 替换 | M2 §6.1 P-2~P-4 | W8 |
| F-9 | `prc2_projects` DROP TABLE / DROP COLUMN / RENAME / 清空数据 | M2 §2.2 / D-3 | W10+（评估）|
| F-10 | Finance F2 升级严格 ANY 策略（删 NULL OR） | M2 D-4 | W8 后评估 |
| F-11 | DB CHECK CONSTRAINT 命名 pattern | M2 D-5 | W8 后评估 |
| F-12 | W6 五步串行单 wave 一锅煮 | M2 D-6 | 永禁；必拆 W6a/W6b/W6c |
| F-13 | 多法人合资 project schema 扩展 | M1 C-5 / M2 §8.5 | 永禁（扩展评审）|
| F-14 | ACTIVE 后改 biz_projects.company_code | M1 C-4 / M2 §8.5 | 永禁（除业务重组 SOP）|
| F-15 | 物理删除 sys_organizations PROJECT/WAREHOUSE 占位行 | M1 §12 / M2 §2.4 | 永禁 |
| F-16 | 新建 sys_organizations(PROJECT/WAREHOUSE) 占位行 | M1 §4.2 / §6.2 C-7 | W6+ type_rules service 接入后硬阻 |
| F-17 | shareholder 域单签合入（缺 Finance 复审）| M2 D-2 | 永禁 |
| F-18 | shr_project_attrs.capital_status / equity_status 长期保留 | M2 D-2 | W6 末 DROP COLUMN |
| F-19 | mst_stores ↔ SITE status 同步用 DB trigger | M1 §7.5 C-6 | 永禁（用 service）|

---

## 10. 孟赛鸡场试运行前必须完成事项

> 孟赛蛋鸡场 `SITE-MENGSAI-LAYER`（site_business_type=FARM）作为首批试运行场区
> 的最低准入清单。**Site 阶段（≤ 1 个 site 试运行）**对应总分 50-69 区间。

### 10.1 必须 ✅（生产上线硬门槛）

| # | 项 | 当前状态 | 责任 | 时点 |
|---|---|---|---|---|
| GM-1 | 孟赛 site 在 sys_organizations 存在（org_type=SITE, site_business_type=FARM）| ✅（已建 SITE-MENGSAI-LAYER）| Architect | 已就位 |
| GM-2 | 孟赛历史 farm_code 别名映射齐全（LPH_MENGSAI / FARM001 / FARM-MS）| ✅（biz_site_aliases 7 行 seed）| Architect | 已就位 |
| GM-3 | brd_houses 6 行（HOUSE_MS_01 ~ HOUSE_MS_06）映射至 SITE-MENGSAI-LAYER | ✅（G109 已落，6 房挂场）| Architect | 已就位 |
| GM-4 | farm.service 兼容 `(farm_code OR site_code OR company_code)` 并集 scope | ✅（G98 兼容期）| ERP | 已就位 |
| GM-5 | brd_daily_logs 日报路径稳定（多 shift 支持）| ✅（A1 修复）| ERP | 已就位 |
| GM-6 | inv_batches.status 五态走 INV_STOCK_STATUS 字典 | ✅（E5 fallback 兼容 7 态过渡）| ERP | 已就位 |
| GM-7 | 场长（user）权限稳定：MENU_FARM_DAILY:E + MENU_BRD_FLOCK:V | ✅（G118 PBAC + isAdmin fix）| Audit / ERP | 已就位 |
| GM-8 | 库存唯一台账（CLAUDE.md §6）—— 入库 / 出库 / 调拨 / 损耗走 wms.service 单入口 | ✅（packaging + wms 已收口；store-pos 在孟赛不涉及）| ERP | 已就位 |
| GM-9 | DataScope farm + company 并集（孟赛场长可见）| ✅（G98）| Architect | 已就位 |

### 10.2 强烈建议 🟡（试运行风险缓解）

| # | 项 | 当前状态 | 责任 | 时点 |
|---|---|---|---|---|
| GM-10 | R0-1 ~ R0-4 关闭（任何权限越权风险）| ❌ 未关 | Audit | W5 内 |
| GM-11 | 漂移基线 brd_farms 27 hit 缓解：data-quality 健康检查改读 sys_organizations(SITE,FARM) | 🟡 监测中 | Architect M3 | M3 子文档 |
| GM-12 | E5 fallback EXPIRED/LOCKED 历史数据治理评估 | 🟡 W5 评估 | ERP / 数据质量 | W5 内 |
| GM-13 | farm scope 并集逻辑切到 sys_user_scopes（W7 实施）| 🟡 文档定型；service 走旧逻辑 | Architect W7 | W7 |

### 10.3 不影响试运行（可延后）

| # | 项 | 时点 |
|---|---|---|
| GM-14 | brd_houses.site_code FK DDL 落地 | M3 子文档（W6+）|
| GM-15 | sys_organization_type_rules service 接入（FARM 子类硬校验）| W6 |
| GM-16 | 漂移脚本 brd_farms 收敛归零 | W6+ M1 落 SiteSelector + service 切到 site_code |
| GM-17 | data-quality master-data-health 表清单更新 | W6（与 shr_projects 同 wave）|

### 10.4 孟赛试运行准入决议

**✅ 允许**孟赛蛋鸡场（≤ 1 个 site）开始 W5 期间的**养殖业务试运行**（日报 /
鸡群 / 库存批次 / 包装），前提：
1. R0-1 ~ R0-4 在 W5 内关闭（最高紧急）
2. 场长操作 SOP 文档化（避免权限越权操作）
3. 数据日级别 snapshot + 监控异常告警

**❌ 不允许**孟赛场区涉及以下流程的扩展：
- 直接销售给客户（走 sal_store_sales 路径 → 等 E2 customer FK）
- 跨公司 owning_company_code 库存（等 E1 store_code 拆家）
- 任何 sys_user_scopes 维度新授权（等 W7）

---

## 11. 老挝直营店上线前必须完成事项

> 老挝直营店（`SITE-VTE-STORE-01` 等 site_business_type=STORE）。**Multi-site
> 上线**对应总分 70-84 区间，**当前 62 分 → 不达准入**。

### 11.1 必须 ✅（POS 上线硬门槛 — 当前未达）

| # | 项 | 当前状态 | 责任 | 阻塞 |
|---|---|---|---|---|
| LS-1 | 门店 site 在 sys_organizations 存在（org_type=SITE, site_business_type=STORE）| 🟡 部分（万象 1 号店 SITE-VTE-STORE-01）| Architect M3 | M3 |
| LS-2 | mst_stores ↔ SITE status 同步机制落地（M1 C-6）| ❌ 未落（W6）| Architect + ERP | W6 |
| LS-3 | **E1 inv_batches.store_code → owning_company_code 拆家**（user 拍板 #1）| ❌ 未做 | ERP / W6 | W6（依赖 M3）|
| LS-4 | **E2 sal_store_sales.customer_code FK to mst_customers**（赊销 AR）| ❌ 未做 | ERP / W6 | W6 |
| LS-5 | **E4 POS FIFO 双路径合并**（sku 单路径）| ❌ 未做 | ERP / W7 | W7 |
| LS-6 | 默认仓 / 库位硬编码迁出 sys_config（WMS-VTE-MAIN / ST-VTE-001 / ALL）| ❌ 未做 | ERP / W6 | W6 |
| LS-7 | POS daily_close 流程稳定（store-pos.service 单事务）| ✅ G83 已落 | ERP | 已就位 |
| LS-8 | inv_batches.status 走 INV_STOCK_STATUS 字典 | ✅（E5）| ERP | 已就位 |
| LS-9 | DataScope store + company 隔离正确（user 拍板 #2 SITE-*-STORE 主身份）| 🟡（mst_stores.company_code 仍权威；user store_code 错位历史 — G114/G122）| Architect / Audit | 持续监测 |

### 11.2 强烈建议 🟡（上线风险缓解）

| # | 项 | 当前状态 | 责任 | 时点 |
|---|---|---|---|---|
| LS-10 | R0-1 ~ R0-4 关闭（POS 终端最敏感）| ❌ 未关 | Audit | W5 |
| LS-11 | DataScope 5 步算法实施（C-2 W7）| ❌ 仅文档 | Architect / W7 | W7 |
| LS-12 | scope 严格语义实施（C-3）| ❌ 仅文档 | Architect / W5-W7 | W5 + W7 |
| LS-13 | F2 项目过滤策略评估（W8 后）| 🟡 兼容期 | Finance / W8+ | 不阻塞试点，但全量上线前 |
| LS-14 | mst_stores → SITE-*-STORE 历史 store_code 别名映射齐全（biz_site_aliases STORE_CODE 类）| 🟡 仅孟赛 + 东鹏；万象 / 拉邦 store 未入种 | Architect M1 | M3 |

### 11.3 老挝直营店上线决议

**❌ 不允许**老挝直营店进入 POS 量产上线（涵盖万象 / 拉邦 / 多门店并行）。
本时点（62 分）仅满足"≤ 1 个 site 试运行"区间。

**🟡 允许**单一门店（SITE-VTE-STORE-01）做**受限灰度**（< 50 单/天 + 全程
人工监控 + 日 snapshot + 异常告警 + 不开赊销路径）：
1. 必须先关 R0-1 ~ R0-4
2. POS 仅走现金路径（不开 sale_type=CREDIT，避开 LS-4 customer_code FK 风险）
3. owning_company_code 临时按"单仓 ALL"硬绑（不引入多公司库存）
4. 业务方拍板可接受 W6 切表后的双跑期阵痛

**全量上线（多 site）的准入** = 总分 ≥ 70 → 需 W6 完成 LS-2 / LS-3 / LS-4 /
LS-6 + R0-1~R0-4 全关 + W7 完成 LS-5 / LS-11 / LS-12。

---

## 12. 总决议：PASS WITH CONDITIONS

### 12.1 总评：🟡 PASS WITH CONDITIONS

**通过理由**：
1. M1 v2.0 架构冻结 + M2 决策书完整，C-1 ~ C-7 与 D-1 ~ D-6 拍板齐备
2. W4 Foundation / ERP E3/E5/E6 / Finance F1-F5 全部合入主线，tsc 0 error
3. 漂移基线 W4 持平 + isAdmin 缺陷已修
4. 财务子域得分 74 / 100 已达"良好"区间
5. 孟赛蛋鸡场试运行硬门槛全部 ✅（详 §10）

**条件**：

| # | 条件 | 责任 | 截止 |
|---|---|---|---|
| **R-1** | R0-1 ~ R0-4 安全裸奔 4 项在 W5 内修复（**最高紧急**）| Audit | W5 第 1 周 |
| **R-2** | M2 主文档按 D-1 ~ D-6 修订 PR 合入 | Architect | W5-A2 启动前 |
| **R-3** | M3 子文档（SITE 子类化 + status 同步 + 占位行 + brd_houses FK + W4 seed 三行合并）定稿 | Architect | W6 启动前 |
| **R-4** | W5-A3 数据回填三步法（snapshot → dry-run → apply）业务方拍板流程文档化 | Architect + 业务方 | W5-A3 启动前 |
| **R-5** | 前端 6→7 卡片渲染回归（WAVE1 C-cond-5）| ERP | W5 内 |
| **R-6** | `check-public-controllers.mjs` 红线脚本上线（PLAN A6）| Audit | W5 末 |

**不阻塞 W5 启动，但 W5 内必跟进**：
- E5 EXPIRED/LOCKED 数据质量评估（WAVE1 C-cond-4）
- F5 attachment_urls 方案评审 → W6 落 DDL
- M5 master 退役清单（与 M3 并行）

### 12.2 试运行 / 上线决议（综合 §10 / §11）

| 场景 | 决议 |
|---|---|
| 孟赛蛋鸡场养殖业务试运行（≤ 1 site）| ✅ **允许**（前提 R0-1~R0-4 在 W5 内关 + 场长 SOP 文档化）|
| 老挝直营店单门店受限灰度（仅现金路径）| 🟡 **有条件允许**（前提同上 + 4 项 POS 上线限制）|
| 老挝直营店多 site 全量上线 | ❌ **不允许**（需总分 ≥ 70；当前 62）|
| 跨境扩张（新国家 / 新公司）| ❌ **不允许**（需 §14.2 扩展评审 + 多 wave 验证）|

### 12.3 W5 启动顺序建议（综合本评估 + WAVE1 §10.4）

```
Day 1-2:
  1. Audit 启动 R0-1 ~ R0-4 修复 PR(并行)
  2. Architect M2 主文档按 D-* 修订 PR
  3. Architect M3 子文档草稿启动
  4. ERP 前端 6→7 卡片渲染回归

Day 3-5:
  5. Audit M2 修订 PR review + 用户合入
  6. Architect W5-A0 snapshot + W5-A2 biz_projects 扩列迁移
  7. Architect W5-A6/A7 不可变 service + trigger
  8. Architect W5-A12 pattern 软校验
  9. Architect W5-A8 master-data/operations 修
  10. Audit check-public-controllers.mjs 出稿

Day 6-10:
  11. Architect W5-A3 dry-run 业务方拍板 + apply
  12. Architect W5-A4/A5 字段回填 dry-run + apply
  13. Architect W5-A11 FK 预演 in staging
  14. Architect W5-A13 ancestor 检测 + 自环 trigger
  15. Architect W5-A14 W4 seed UPDATE 准备
  16. Architect W5-A15 sys_user_orgs "漏绑 COMPANY" 扫描
  17. Audit R0-1 ~ R0-4 修复合入
  18. ERP W5-E5d EXPIRED/LOCKED 数据质量评估

Day 11-14:
  19. Architect M3 子文档定稿
  20. Audit W5 末 wave 验收
  21. 漂移基线对账（期望 shr_projects 6 → 4）
  22. C-5 唯一公司违规扫描结果
  23. 进入 W6 启动评估
```

### 12.4 W5 验收门禁

```bash
# 通用
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt
node scripts/check-nullable-in-unique.js
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations

# M2 专项
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5.json
# 期望:prc2_projects = 6;shr_projects = 4(A8 修)

# C-5 唯一公司违规
psql -c "SELECT project_code, COUNT(DISTINCT company_code)
           FROM biz_projects
          GROUP BY project_code
          HAVING COUNT(DISTINCT company_code) > 1;"
# 期望 0

# C-4 trigger 存在
psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid='biz_projects'::regclass;"

# C-1 ancestor service 存在(grep)
grep -rn "ancestor.*cycle\|isAncestorCycle" apps/api/src/modules/org/

# C-3 sys_user_orgs 漏绑 COMPANY 清单
psql -c "SELECT u.user_id, u.username,
                ARRAY_AGG(o.org_type ORDER BY o.org_type) AS bound_types
           FROM sys_user u
           JOIN sys_user_orgs uo ON uo.user_id = u.user_id
           JOIN sys_organizations o ON o.id = uo.org_id
          WHERE u.status = 1
          GROUP BY u.user_id, u.username
         HAVING 'DEPARTMENT' = ANY(ARRAY_AGG(o.org_type))
            AND 'COMPANY' != ALL(ARRAY_AGG(o.org_type));"

# Audit R0 关掉的验收
node scripts/check-public-controllers.mjs apps/api/src
# 期望 0 个未挂 guard 也未 @Public 的端点

bash scripts/g5c-rbac-audit.sh
# 期望:非超管对 /api/permissions/role/.../perms 403
```

---

## 13. 与上游文档一致性

| 上游 | 对应章节 | 一致性 |
|---|---|---|
| M1 v2.0 架构冻结 | §2 / §10 / §11 | ✅ |
| M1 C-1 ~ C-7 决策 | §3 (C-1 + C-3) / §10 / §11 | ✅ |
| M2 主文档 + D-1 ~ D-6 决策 | §2 / §8 / §9 | ✅ |
| WAVE1_ACCEPTANCE_REVIEW.md §10 W5 顺序 | §7.3 / §12.3 | ✅ 已对齐 |
| AUDIT_INTEGRATION_AGENT_AUDIT.md R0-1 ~ R0-4 | §3 / §6 / §12.1 | ✅ |
| MASTER_DATA_W4_REVIEW §6 / §7 (ERP/Finance 解锁) | §4 / §5 | ✅ 已就位 |
| user 拍板 4 条（M1 阶段） + 6 项（M2 阶段） | §10 / §11 / §12 | ✅ |
| CLAUDE.md §6 / §7（库存唯一台账 + 状态字典）| §10 GM-6/GM-8 | ✅ |
| MULTI_AGENT_PHASE2_PLAN §1 R0 排序 | §6 | ✅ |

---

**评审完毕。本评估视为 W5 启动评估正式输出。**

**总决议：🟡 PASS WITH CONDITIONS**

- 允许 W5 启动；R-1 ~ R-6 六项条件必须在 W5 内分批关闭
- 允许孟赛蛋鸡场养殖业务试运行（前提 R0-1~R0-4 W5 内关）
- 老挝直营店仅允许单店受限灰度（4 项限制）
- 多 site / 全量上线 / 跨境扩张 = ❌

下一轮评估：W5 末 wave 验收后输出 W6 准入评估。
