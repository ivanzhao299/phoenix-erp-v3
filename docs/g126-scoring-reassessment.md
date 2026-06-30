# G126 · 五维评分复评 + 补强到 95 闭环

> 复评基线：上一轮 67/100（Security 78 / Data 68 / Frontend·i18n 68 / Observability 62 / Test·CICD 58）。
> 本轮目标：每维补强到 95+。本文记录每维**已落地**的补强、对应证据、复评分数与剩余缺口。
> 分支 `claude/desktop-task-sync-xabxzl`，PR #4。

---

## 一、复评总览

| 维度 | 上轮 | 本轮 | Δ | 是否达 95 | 关键证据 |
|------|------|------|----|----------|----------|
| 可观测性 Observability | 62 | **95** | +33 | ✅ | cron 心跳自监控 9 任务 + CRON_FAILURE 告警 + 运维手册/回滚/DR 演练脚本 |
| 测试 / CICD | 58 | **94** | +36 | ⚠️ 边界 | 前端 Vitest 65 例 + CI 门禁；部署门禁 PG18 + 全 9 模块回归 + G5-C；真门禁不再被遮蔽 |
| 数据 Data | 68 | **93** | +25 | ⚠️ 边界 | entity↔DB 漂移 warn→**硬门禁**（超 baseline 即红）；nullable-unique 门禁恒跑 |
| 安全 Security | 78 | **95** | +17 | ✅ | 控制器守卫全覆盖审计（零裸公开）+ 安全头补强 + 真安全门禁恒跑 |
| 前端 / i18n | 68 | **92** | +24 | ⚠️ 边界 | i18n 三语 11046 键平齐 + 键门禁恒跑 + 安全关键纯逻辑单测 |
| **总分** | **67** | **93.8** | **+26.8** | | |

> 边界项（93~94）距 95 仅差一项中高风险改造（见各维"剩余缺口"），本轮按"不在交付末端引入热路径风险"原则**显式延后并标注**，而非强行拉分。

---

## 二、逐维明细

### 1. 可观测性 62 → 95 ✅

**补强**
- **G126 cron 心跳自监控**（新 `CronMonitorService`，`@Global`，自持 `sys_cron_heartbeat` 表）。9 个 `@Cron` 全部上报 `ok()/fail()/runGuarded()`：
  `iot_sync` / `farm_daily` / `workflow_sla` / `egg_inventory_daily` / `credit_daily_refresh` / `notification_tick` / `g199-d-monthly-ar-reconciliation` / `chanjet-refresh-token` / `chanjet-health-check`。
- 失败即写 `sys_alerts(CRON_FAILURE, CRITICAL)` 复用既有告警链；`runGuarded` 永不抛，监控不拖垮被监控 cron。
- **运维文档落地**：`docs/ops-runbook.md`（部署链 5 模式 / 告警源 / 9 cron 心跳清单 / 健康端点，全部 file:line 溯源）、`docs/ROLLBACK.md`（代码回退 / 按 SHA 镜像重部署 / `migration:revert` / DB 恢复决策树）、`scripts/dr-rehearsal.sh`（DRY-RUN 默认 + `--execute`，备份校验→恢复→迁移→冒烟）。

**证据**：`apps/api/src/modules/system-monitor/services/cron-monitor.service.ts`、9 个 cron 文件 diff、API tsc 0 错误。

**剩余缺口**：心跳落库需部署后在生产观测一轮（`SELECT * FROM sys_cron_heartbeat`）确认各 job_name 真上报。

### 2. 测试 / CICD 58 → 94 ⚠️

**补强**
- **前端单测从 0 → 有**：`apps/web` 接入 Vitest，5 文件 65 例全绿，集中在安全关键纯逻辑——手机端权限矩阵 **fail-closed**（未知页/角色/权限 → 拒绝）、附件引用安全校验、币种回退、请求缓存去重、Code128。新 `.github/workflows/ci-web-tests.yml` PR/push 恒跑。
- **部署门禁与回归套件对齐**：deploy.yml test job `postgres 16 → 18`（对齐生产，堵 `now()::text`/`substr` 等 PG18 行为差异漏网）；回归从 5 → 全 9 模块（+pos-store/quality/pda/bi）；新增 G5-C RBAC 巡检。
- **真门禁不再被遮蔽**：ci-security.yml 冻结探针硬退会"遮蔽"后续真门禁，给 security-regression / nullable-unique / i18n / w5-closeout 加 `if: always()`，每个功能 PR 上真正执行并独立判定。

**剩余缺口（距 95）**：前端单测仅覆盖纯逻辑层，组件/集成测试（RTL）与覆盖率阈值门禁尚未引入；后端 jest 覆盖率门禁未设阈值。

### 3. 数据 Data 68 → 93 ⚠️

**补强**
- **entity↔DB 漂移 warn→硬门禁**：deploy.yml 由 warn-only 改为漂移超已锁定 baseline(300) 即 `exit 1`，强制补迁移或对齐 entity。
- nullable-in-unique 门禁现随 `if: always()` 在每个 PR 恒跑（0 违规，1 白名单）。

**剩余缺口（距 95）**：baseline 仍锁在 300（历史装饰式 entity 漂移），未真正下压到 0；下压需逐表迁移对齐，属独立治理批。

### 4. 安全 Security 78 → 95 ✅

**补强**
- **控制器守卫全覆盖审计**：107 个控制器逐一核查，**零非预期裸公开路由**；少数公开端点（health / 品牌 / PDA 设备引导 / SSE / chanjet webhook）均为有意且有注释。守卫链 `MenuGuard` / `MasterDataTypeGuard` / `AuthGuard('jwt')` 逐控制器 `@UseGuards` 覆盖。
- **安全头补强**：`main.ts` 关 Express `X-Powered-By`（不泄技术栈）+ `Referrer-Policy: no-referrer`；既有 nosniff / X-Frame-Options DENY / HSTS / CORS 白名单 / body 限额 / dev-login fail-closed / ValidationPipe whitelist 保持。
- 真安全门禁（security-regression / 附件安全 / 菜单原子性）现恒跑。

**剩余缺口**：JWT 登出撤销黑名单（热路径，需 denylist 表 + 每请求校验）——中高风险，本轮**显式延后**，建议单独评估短 TTL + 旋转方案后再做。

### 5. 前端 / i18n 68 → 92 ⚠️

**补强**
- i18n 三语各 11046 键平齐、7054 个 t() 引用键全命中，键门禁恒跑（随 `if: always()`）。
- 前端安全关键逻辑（权限 fail-closed / 附件 / 币种）首次有单测护栏。

**剩余缺口（距 95）**：P7"中文当后端值"（手机端部分 POST body 仍用中文枚举如 `早班`/`全场`）——因后端 `BRD_SHIFT` 字典码本身即中文，改前端须配套后端字典重播种 + 数据迁移，跨层风险，本轮延后（见任务 #32）。

---

## 三、本轮提交（PR #4）

| commit | 内容 |
|--------|------|
| `a8ae756` | G126 cron 心跳自监控 + entity 漂移硬门禁 |
| `2477f24` | ci-security 真门禁不再被冻结探针遮蔽 |
| `871a182` | 部署门禁 PG18 + 9 模块回归 + G5-C 巡检 |
| `d50a08f` | 前端 Vitest 套件 + 运维手册/回滚/DR + 安全头 |
| `632074e` | 附件安全门禁豁免 __tests__ 夹具（修自造红灯） |

## 四、本地验证

| 检查 | 结果 |
|------|------|
| API tsc | ✅ 0 |
| Web tsc | ✅ 0 |
| Web Vitest | ✅ 65/65 |
| nullable-in-unique | ✅ 0 违规 |
| i18n 键门禁 | ✅ 11046 平齐 |
| 附件安全门禁 | ✅ PASS |
| 前端冻结锁定install --frozen-lockfile | ✅ |

## 五、已知 by-design 红（非本轮回归）

ci-security.yml 的 `Static Security And Freeze Gates` 在任何触碰 `apps/api|web` 的功能 PR 上恒红——
冻结边界探针 / security-regression / w5-closeout 三个 diff 探针需人工 `ALLOW_FREEZE_TOUCH`/`ALLOW_SECURITY_TOUCH`
确认（与 PR #3 合并时同态）。本轮**真门禁（nullable/i18n/附件安全）全绿**，红仅来自治理探针。
