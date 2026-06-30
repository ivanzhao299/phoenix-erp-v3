# Phoenix ERP V3 — 生产级评价计分卡

> 2026-06-29 · 5 维度并行评估（各维 read-only 取证 file:line）→ 加权综合
> 方法：Security / Data / Frontend / Observability / Testing 五维各 0-100，按生产关键度加权。

## 总分：**67 / 100（C+）** — 可上线，但有明确补强项

| 维度 | 分 | 评级 | 权重 | 一句话 |
|---|---|---|---|---|
| 安全 · RBAC · 数据域 | **78** | B | 0.22 | 最强项：认证扎实、后端鉴权覆盖 102/106、原生 SQL 强参数化、好业财签名完整；P0 提权历史已修 |
| 数据层 · 迁移 · 一致性 | **68** | C+ | 0.20 | 迁移治理纪律强（多道硬门禁），但 entity↔DB 漂移 warn-only + TS 链不自洽 |
| 前端 · 性能 · i18n | **68** | C+ | 0.20 | 架构好（懒加载/缓存/ErrorBoundary/PWA），但 i18n 实际覆盖被 fallback 掩盖 + 中文当后端值 |
| 可观测性 · 运维 | **62** | D | 0.20 | 日志/健康/指标/备份齐，但**无告警触达人** + **恢复从未演练** |
| 测试 · CI/CD | **58** | D | 0.18 | 治理门禁强 + tsc 硬卡，但单测不进 CI、前端 0 测试、独立回归流水线坏 |

**结论**：核心业务逻辑、权限、迁移治理是**生产级**的；拉低分的是**运维可观测性（告警/恢复）**与**测试安全网**这两块"上线后才致命"的能力，以及 i18n/数据一致性的若干真 bug。

---

## 一、严重弱项（critical / high，跨维度排序）

### 🔴 Critical
1. **无告警触达人**（运维）：`sys_alerts.createAlert` 是死代码（0 调用、无 POST 入口）→ "open alerts" 恒为 0；全 API 无 email/SMS/外部 webhook。生产 500 只落 `sys_error_logs`，靠人去拉看板，**没人被叫醒**。
2. **恢复从未演练**（运维）：项目自己的就绪门禁 `P1-007` 把恢复/回滚标 **HOLD**；`pg_dump` 备份有，但 `pg_restore` 可恢复性**未验证**、无 DR 演练。
3. **中文当后端值**（前端，数据完整性）：`egglog` 发 `shift:'早班'`、`medicine` 发 `house_code:'全场'`、`prc-request` 发 `unit:'件'`、`delivery/receipt:174` `setExceptionType('缺货')` 覆盖 `SHORTAGE` 码——中文字面量进库当业务键，破坏跨语言/报表/join。**（receipt 那处已即时修复，见 §三）**

### 🟠 High
4. **sys_user 列黑名单失效**（安全）：`COLUMN_BLACKLIST` 键写成 `sys_users`（复数）≠ 实表 `sys_user`，致 `password_hash/role/status` 写保护形同虚设——持 `MENU_SETTINGS_USER:E` 者可经 `/api/crud` 直接改密码/角色提权。**（已即时修复，见 §三）**
5. **i18n 实际覆盖被掩盖**（前端）：**1203/1848 个 `ui.*` 键不在任何 locale 文件**，只渲染中文 fallback → en/lo 用户看到 ~1200 条中文；**92/207 个 PC 管理页仍有 1453 处未包裹中文 JSX**（115 页干净）。PC 有效翻译覆盖约 55-60%（手机端近完整，仅 16 处）。⚠️ 本会话的 i18n 战役覆盖了所处理的 ~70 个模块页，但全站 207 页仍有存量债。
6. **entity↔DB 漂移 warn-only**（数据）：漂移 ~256-300 行、门禁仅 warn；4 张最漂移表（sys_user/sal_customers/fin_cash_accounts/prc_purchase_orders）是"装饰式 entity"，今日仅因走原生 SQL 才安全——任何未来 ORM 调用 = `column does not exist` 500 地雷。
7. **TS 迁移链不自洽**（数据）：TS 迁移只 ALTER/seed、假设基线表已存在；规范 schema 一半活在冻结历史 SQL。CI 用 `db-migrate.sh` 全量重建可复现，但不靠 TS 链单独可建。
8. **回归/测试安全网薄**（测试）：独立 `regression.yml` 起 API 打**未播种**的空库（无 migrate 步）→ 9 套全挂；单测因已知 arity bug **从不进 CI**；**前端 0 测试**。（注：`deploy.yml` 的 test job 播种正确、可过——坏的是独立那条。）
9. **运维盲区**（运维）：镜像只打 `latest`（无版本回滚目标）+ 部署即 prune 旧镜像；9 个 cron 静默失败无心跳；IoT 厂商 API 故障被 demo-fallback **掩盖**（改写 collect_time=now 时移历史）；IoT 阈值告警（如鸡舍温度）只写表不推送。

---

## 二、强项（值得保住）

- **安全**：bcrypt + 生产启动硬校验 JWT_SECRET、双密钥轮换、登录限流、`perms_version` 30s 即时失权；后端 102/106 控制器有 `@UseGuards` 且都配 `@RequireMenu`；~1600 原生 SQL 强参数化无注入面；好业财 webhook HMAC+时间窗+nonce+timing-safe。
- **数据**：down()/no-DML(g197-H)/nullable-unique(g198)/allowlist 冻结 全是**硬红门禁**且对应真实生产事故；`inv_batches` 单一台账（FOR UPDATE+配对 inv_ledger）；7 维数据质量模块跑运行时完整性探针。
- **前端**：3 语懒加载（替掉 796KB 饿汉）、request/dict 缓存、根 ErrorBoundary+per-route error.tsx、PWA、0 个 @ts-ignore、组件复用强（design-system 131 文件）。
- **运维**：全局 `AllExceptionsFilter` 落库每条 500/403、PG 码转安全文案、生产隐栈；真 Prometheus `/api/metrics`；队列化 pg_dump 备份带完整性校验；分级部署 + 部署后 migration:run + 健康检查 + 部署 webhook。
- **测试/CI**：tsc --noEmit 双端硬卡；迁移治理门禁成体系。

---

## 三、本次即时修复（quick-win，已落地）

| 项 | 维度/级别 | 修复 |
|---|---|---|
| **#4 sys_user 列黑名单** | 安全/High | `generic-crud.controller.ts` 黑名单键 `sys_users`→补 `sys_user`（两名都列防回归），堵住经 /api/crud 直写 password_hash/role/status 提权面 |
| **#3 receipt 异常类型** | 前端/Critical | `delivery/receipt/[orderId]:174` `setExceptionType('缺货')`→`'SHORTAGE'`，停止把中文写进 exceptionType |

验证：API tsc 0 / Web tsc 0。

---

## 四、补强计划（按 严重度×低成本 排序，待拍板）

| # | 补强项 | 维度 | 级别 | 成本 | 说明/做法 |
|---|---|---|---|---|---|
| P1 | **接入真告警** | 运维 | 🔴 | M | 让 AllExceptionsFilter(500) + cron catch 调 `sys_alerts.createAlert` 并复用 deploy.yml 的飞书/钉钉/Slack webhook 外推；补 sys_alerts 写入与展示 |
| P2 | **恢复/DR 演练** | 运维 | 🔴 | M | 对隔离目标跑一次 pg_restore 证明可恢复 + RTO/RPO，关掉 P1-007 HOLD；补带护栏的 restore.sh |
| P3 | **regression.yml 补播种** | 测试 | 🟠 | S | 起 API 前加 `MIG_MODE=ci bash db-migrate.sh`（镜像 deploy.yml）；并设 PGUSER 止 `role root` |
| P4 | **打开单测门禁** | 测试 | 🟠 | S | 修 procurement.service.spec arity，ci-build 把 deferred echo 换成真跑 jest |
| P5 | **镜像 SHA 标签** | 运维 | 🟠 | S | 镜像打 per-commit SHA、停 prune 上一镜像，给回滚一个确定目标 |
| P6 | **cron 心跳自监控** | 运维 | 🟠 | M | 每 job 记 last-success，超窗即告警；去掉 IoT 掩盖故障的 demo-fallback；IoT 阈值告警走 notification dispatcher 推送 |
| P7 | **清中文当后端值** | 前端 | 🔴 | M | egglog 班次/medicine 全场/prc 单位等改字典码；审计所有手机 POST body 的中文值 |
| P8 | **i18n 补齐** | 前端 | 🟠 | L | 回填 1203 个缺失 ui.* 键到 zh/en/lo + 包裹 92 页 1453 处裸中文 + 加"t() 键必须三语齐全"的 CI 门禁 |
| P9 | **漂移门禁转红 + entity 对齐** | 数据 | 🟠 | L | 对齐 4 张装饰式 entity 到 DB 实列（或标 @decorative 排除 ORM），再把 entity-drift 从 warn 转红 |
| P10 | **MenuGuard 全局化** | 安全 | 🟡 | M | 升为 APP_GUARD + `@Public()` 显式放行，未挂守卫的控制器默认 deny 而非匿名 |
| P11 | **FE canAccessPath 改 fail-closed** | 安全 | 🟡 | M | 未在 Sidebar 树的 ~63 路由当清单逐一登记，或路由→菜单全注册 |
| P12 | **DB-level FK + token 撤销 + 结构化日志** | 数据/安全/运维 | 🟡 | L | 高价值台账表补 FK；登出 jti 黑名单 + 短 access TTL；pino + trace ID |

**建议落地顺序**：先 P3/P4/P5（S 成本、快速止血测试与回滚）→ P1/P2/P6（运维上线必备的告警+恢复）→ P7（数据脏值）→ 其余按窗口排。

---

## 五、一句话总评

> **业务/权限/迁移治理是生产级的（B/C+），但"上线后才致命"的运维可观测性（无人被告警、恢复没演练）和测试安全网是最大短板，加上 i18n 覆盖被 fallback 掩盖的真实债。补强优先级：先把告警与恢复演练做实，再补测试播种与镜像版本化。**
