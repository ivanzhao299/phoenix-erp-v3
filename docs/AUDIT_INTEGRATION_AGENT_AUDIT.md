# Audit / Integration Agent — 第一轮审计报告

> 范围：`apps/api/src/auth`、`apps/api/src/common/guards`、`apps/api/src/guards`、
> `apps/api/src/modules/permissions`、`apps/api/src/modules/permission-sets`、
> `apps/api/src/modules/chanjet`、`apps/api/src/modules/notification`、
> `.github/workflows/*`、`scripts/*`。
> 立场：只审计，不改业务代码；本报告先把"权限绕过 / 角色可见性 / 组织隔离 /
> 接口安全 / 测试 / CI 风险" 5 个维度的问题摆全，分级标注严重度（P0/P1/P2）和
> 处置建议；具体修补由 Architect / Finance / ERP Agent 在各自分支落地，再回到
> Audit Agent 校验。
> 分支：`feature/agent-audit-integration` · 日期：2026-06-20

---

## 0. TL;DR — 必须先处理的 3 件事

1. **P0：`/api/permissions/**` 与 `/api/permission-sets/**` 仅做 JWT 校验，无角色
   或 menu 检查 → 任意登录用户（包括收银员、POS、生产端等）可以读 / 改 / 改写
   全集团 RBAC 矩阵、向自己绑权限集，权限模型可被一次性 takeover。
2. **P0：`/api/notifications/config/**` 完全无 `@UseGuards`、无 `@RequireMenu`，
   匿名用户可读写 `sys_notification_rules` / `sys_notification_templates` /
   `sys_notification_channels` / `sys_notification_log`，包含模板（XSS/钓鱼向量）
   和接收人配置。同模块的 `PresenceController` 虽写了 `@RequireMenu` 但没挂
   `MenuGuard`，注解空跑，online-users / online-count 同样匿名可拉。
3. **P0：`auth.controller.impersonate`（影子登录）只在控制器层判定 ROLE_ADMIN，
   `auth.service.impersonate` 不做二次校验也不写"目标用户限制"**。任何 token 中
   `roles` 含 `ROLE_ADMIN` 或 `permissions` 含 `'*'` 的会话都能拿到任意用户的
   真实 token（含运行期下发到前端的 `cookie_token`），且 `bypassPassword` 是
   service 内部参数 — 一旦 service 被其它模块调用就有静默绕过密码风险。

后续 P1 / P2 见各章节。

---

## 1. 登录 / JWT 链路

### 1.1 文件清单

| 文件 | 角色 |
|---|---|
| `apps/api/src/auth/auth.controller.ts` | `/api/auth/login` `refresh` `impersonate` `me` |
| `apps/api/src/auth/auth.service.ts` | 三路权限合并、密码校验、影子登录 |
| `apps/api/src/auth/jwt.strategy.ts` | Passport JWT 策略 + `perms_version` 对账 |
| `apps/api/src/auth/permissions-resolver.ts` | grant/deny 合并（已配单测） |
| `apps/api/src/auth/permissions.util.ts` | `hasPerm` 工具 |
| `apps/api/src/guards/phoenix-jwt.guard.ts` | 非 Passport 的轻量 JWT guard（用在少数 controller） |
| `apps/api/src/common/guards/menu.guard.ts` | `MenuGuard` = Passport JWT + RBAC perm 校验 |
| `apps/api/src/common/guards/master-data-type.guard.ts` | 主数据 `:type` 项级原子鉴权 |
| `apps/api/src/common/guards/roles.guard.ts` | 极少使用，仅 `@Roles()` 限制 |

### 1.2 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| L-01 | **P0** | `auth.service.login` 接受内部参数 `opts.bypassPassword` 跳过密码校验，没有"调用方鉴权" | `auth.service.ts:59,166` | 控制器层校验了 ROLE_ADMIN，但 `login()` 是公共方法，任何 service 注入 `AuthService` 后都能 `bypassPassword:true` 拿任意 token。建议把 impersonate 与 login 拆成不同方法（或 private + facade），并禁止 `bypassPassword` 出现在 login 主路径。 |
| L-02 | **P0** | `impersonate` 没有"超管→超管"二次拦截 | `auth.service.ts:326-347` | 超管 A 可以 impersonate 超管 B（连锁拿其他超管会话）；缺少目标白名单 / 风险用户黑名单 / 二次 MFA。建议禁止 impersonate 任何持 `ROLE_ADMIN` 的用户，并在生产关闭非 QA 域名 IP。 |
| L-03 | P1 | `cookie_token` 是单独签发的瘦身 JWT，里面**没有** `perms_version` 也**没有** `impersonatedBy` 标记 | `auth.service.ts:301-306,290` | Next.js 中间件按 cookie_token 鉴权时拿不到撤权信号，被解除权限的用户在 cookie_token 仍有效期内能继续走页面 SSR；impersonate 期间的页面级请求看不出是影子身份。建议把 `perms_version` 和 `impersonatedBy` 也写进 cookie_token。 |
| L-04 | P1 | `MenuGuard` 第 5 步对 `ROLE_ADMIN` 直接放行，未走 `perms_version` 对账 | `menu.guard.ts:87-90`、注释 "保留 menu 注册检查" | 超管被吊销时（DB perms_version++）仍然能用旧 token 操作所有菜单，与 G6 设计原意冲突。建议要么 `super.canActivate` 已经覆盖 perms_version 校验（确认顺序）、要么对超管显式查 DB。 |
| L-05 | P1 | 顶层 `auth.service.ts:9` 是 **module-level** `const JWT_SECRET = process.env.JWT_SECRET \|\| FALLBACK` | `auth.service.ts:9` | 仅 `JwtStrategy` 构造函数在 prod 模式抛错；如果运行时未设 `NODE_ENV=production`（dev/staging 镜像复用 / Compose 漏注），fallback 默认密钥实际生效。建议把启动期断言提到 `main.ts`，并加 `expect JWT_SECRET length>=32`。 |
| L-06 | P1 | `notification-stream.controller.ts` 自带一套 JWT 验签，硬编码同样的 FALLBACK 密钥 | `notification-stream.controller.ts:10,14` | 又一份"易漂移"密钥常量；如果有人改 auth.service / jwt.strategy 的 FALLBACK 命名忘了改这里，SSE 走 dev 密钥就被打穿。建议抽 `auth/jwt-config.ts` 唯一源。 |
| L-07 | P2 | `verifyWithRotation` 静默回退到 `JWT_SECRET_PREV`，无审计日志 | `auth.service.ts:22-32` | 轮换期内"哪些请求走了旧 key"无可观测性，无法判定轮换是否安全完成（CLAUDE.md 写 7 天后删 PREV 但没度量）。建议在 `verifyWithRotation` 走旧 key 时打 warn 计数。 |
| L-08 | P2 | dev 直登 `admin/admin123` 在 CI workflow 里 `ENABLE_DEV_LOGIN: "true"` | `auth.service.ts:62-91`、`.github/workflows/deploy.yml:208` | 当前仅在 type-check & regression job 启用；如果 CI 镜像被构建到 staging 用，泄漏严重。建议在 deploy.yml 显式断言生产镜像 `ENABLE_DEV_LOGIN!=true`，并在 service 里 `NODE_ENV==='production'` 永远禁。 |

---

## 2. 守卫 / RBAC

### 2.1 关键事实

- `app.module.ts` **没有** 注册 `APP_GUARD` 全局守卫。每个 controller 必须自己
  `@UseGuards(MenuGuard, DataScopeGuard)` 才能享受鉴权 + 数据范围。
- `MenuGuard` 是 `AuthGuard('jwt')` 子类，等价于"先做 JWT，再判 menu"。
- `PhoenixJwtGuard` 是另一个独立 guard（不通过 Passport），与 `MenuGuard` 共存
  是历史遗留；只要他们各自维护两份密钥常量就有漂移面（见 L-06）。
- `MasterDataTypeGuard` 把 6 个泛型 `/api/master-data/runtime/:type` 端点做项级
  鉴权，逻辑清晰；但白名单 `TYPE_TO_MENU`（`master-data-type.guard.ts:33-52`）
  是硬编码，新主数据类型一加忘了映射就静默回退到超级菜单 `MENU_MASTER_DATA`。
- `RolesGuard` 用得很少（grep 仅 menu.guard / 装饰器），项目实际只走"菜单 +
  perm code" 的 G6 模型；`@Roles()` 是兼容遗物。
- `menu-registry.service.ts` 内置 115 项 fallback snapshot，启动期失败回退；
  这是好兜底，但 fallback 与 sys_menu 漂移时**业务方写新菜单后忘了重启就 403**
  的情况只能靠 5 分钟一次的 `setInterval` 兜底（`main.ts:79-81`）。

### 2.2 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| G-01 | **P0** | 没有全局 `APP_GUARD` → 漏挂 `@UseGuards` 就是匿名公开 | `app.module.ts:142-167` 全文无 `APP_GUARD` | 任何新 controller 忘记 `@UseGuards(MenuGuard, DataScopeGuard)` 就会被全公网调用。当前已经有两个匿名泄漏（见 N-01、N-02）。强烈建议挂 `APP_GUARD = MenuGuard`，结合 `@Public()` 显式放行回调；现状是"白名单忘写就裸奔"。 |
| G-02 | P1 | `DataScopeGuard` 必须接 `MenuGuard` 才能拿到 `@RequireMenu` 元数据；单独挂等于空跑 | `data-scope.guard.ts:21-44` | 文档注释说"需在 MenuGuard 之后执行"，但项目里就有 controller 漏挂 `MenuGuard`（如 `presence.controller.ts`、`notification-config.controller.ts`）→ DataScope 也是空跑 → 即便 hack 后补 menu guard 也漏数据隔离。建议把 DataScope 解析挪到 MenuGuard 内或挂全局。 |
| G-03 | P1 | `MenuGuard` 超管直通跳 perm_version 对账（见 L-04） | `menu.guard.ts:87-90` | 同上 |
| G-04 | P2 | `MasterDataTypeGuard` 硬编码白名单，新增类型回退到 super-menu，权限过宽 | `master-data-type.guard.ts:33-52` 注释 "未列出的类型回退到超级码" | 主数据中心 G-Phase 经常加新 dict_type/主数据类型，加完未同步 → 持有 `MENU_MASTER_DATA` 的人能管它，违反"项级原子"承诺。建议改成 sys_menu 数据驱动（按 `master:<type>` 命名规范查表）。 |
| G-05 | P2 | `MenuGuard` 不打 audit log；只有 `OperationLogInterceptor` 在另一层 | 见 `app.module.ts:148-160` | 想"谁因为缺哪个 perm 被 403" 时只能翻应用日志；建议把 deny 决策落 `sys_audit_log`。 |
| G-06 | P2 | `menu-registry` fallback snapshot 与 sys_menu 漂移没有度量端点上报 | `menu-registry.service.ts:67-107` | 已经有 `getMenuRegistryStats()` 但未在 health 暴露。建议 `/api/health` 里加 `menu_registry: { source, size, last_loaded_at }`。 |

---

## 3. permissions / permission-sets 模块

### 3.1 重复路由 + 缺失鉴权（致命）

**项目里同一 URL `api/permission-sets` 被注册了两次**：

| 文件 | 模块 | 状态 |
|---|---|---|
| `apps/api/src/modules/permissions/permission-sets.controller.ts` | `PermissionsModule`（`app.module.ts:120`） | 全集 9 路由 |
| `apps/api/src/modules/permission-sets/permission-sets.controller.ts` | `PermissionSetsModule`（`app.module.ts:139`） | 全集 9 路由 |

```
grep -n "@Controller('api/permission-sets')" apps/api/src/modules
  permissions/permission-sets.controller.ts:8
  permission-sets/permission-sets.controller.ts:11
```

后注册的会被 Nest 报 RouterExplorer 警告并覆盖前者（具体哪个赢取决于
`app.module.ts` 中模块顺序：当前 `PermissionSetsModule` 在 `PermissionsModule`
后面注册，**实际生效的是 `modules/permission-sets/`**），但两份 service 同时
存在、字段命名（`assignRole/unassignRole` vs `bindRole/unbindRole`）和返回结构
也不一致 → DTO/前端调谁取决于路由覆盖顺序。

### 3.2 权限分级问题

| 端点 | 控制器 | 守卫 | 实际能干什么 |
|---|---|---|---|
| `GET /api/permissions/menus` | `permissions.controller.ts` | `AuthGuard('jwt')` | 任意登录人 → 拉全集团菜单列表 |
| `GET /api/permissions/matrix` | 同 | 同 | 任意登录人 → 拉 N×M 权限大全 |
| `GET /api/permissions/effective-perms/:userId` | 同 | 同 | 任意登录人 → 反查任意用户的有效权限（侦察） |
| `PUT /api/permissions/role/:code/perms` | 同 | 同 | **任意登录人 → 改任意角色的菜单×CRUD 三元组** |
| `POST /api/permissions/check-role-combo` | 同 | 同 | 任意登录人 → 探测 SoD 红线 |
| `PATCH /api/permissions/role/:code/status` | 同 | 同 | **任意登录人 → 停用任意角色**（含 ROLE_ADMIN）|
| `POST /api/permission-sets/:code/users/:userId` | `permission-sets/` | 同 | **任意登录人 → 给任意用户绑权限集**（含 *）|
| `PUT /api/permission-sets/:code/items` | 同 | 同 | **任意登录人 → 给权限集塞任意 perm** |

### 3.3 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| R-01 | **P0** | `PermissionsController` 仅 `AuthGuard('jwt')` | `permissions.controller.ts:8-9` | 收银员 / 仓库员都可改全集团权限。立刻加 `@RequireMenu('MENU_SYS_ROLE','E')` 写端点 + `MenuGuard`；查询端可降 `'V'`。 |
| R-02 | **P0** | 同 `PermissionSetsController`（两份） | `permission-sets/...:12`、`permissions/permission-sets.controller.ts:9` | 同上。两份控制器先合并、再统一挂 `@RequireMenu('MENU_SYS_ROLE','E')`。 |
| R-03 | **P0** | 重复 `@Controller('api/permission-sets')` 路由覆盖 | 上表 | 一份是 "deprecated"、一份是"在用"，但前端无法分辨。决定保留 `modules/permission-sets/` 还是 `modules/permissions/permission-sets.*`，删另一份；删前先 grep 前端调用确定字段约束。 |
| R-04 | P1 | `check-role-combo` 没有写 OperationLog（默写 SoD 检查会泄漏内部矩阵） | `permissions.controller.ts:130-134` | 建议查询端在拒绝/通过时各打一条审计。 |
| R-05 | P1 | `PUT /role/:code/perms` 是"事务全删 + 全插"，无 dry-run 选项 | `permissions.controller.ts:103-114` | 误操作即丢全角色权限；建议前端禁直接保存，强制 diff 预览 + `?dry_run=1`。 |
| R-06 | P2 | `whoCan` 反查不限 menu prefix，任意 menu_code 可查 | `permissions.controller.ts:120-124` | 信息泄漏面虽小但应限制为 `MENU_SYS_*` 持有者。 |

---

## 4. chanjet / 用友好业财集成

### 4.1 守卫现状（这部分做得相对好）

- `ChanjetCallbackController` 类级 `@UseGuards(MenuGuard, DataScopeGuard)`，
  对外回调显式用 `@Public()`（`callback` GET/POST）。
- 业务端点逐个挂了 `@RequireMenu('MENU_SYS_CONFIG','V')` /
  `MENU_FIN2_AR` / `MENU_FIN2_AR_LEDGER`，分级清楚。
- 凭证 / `appTicket` / `certificate` 在 `ChanjetAuthService` 内统一持久化到
  `sys_chanjet_state` 单例行，并按 4 天 cron 续 token。

### 4.2 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| C-01 | **P0** | `GET/POST /api/chanjet/callback` 完全公开，**无签名校验**就消费 `certificate` / `authCode`，并把它写持久化层 | `chanjet-callback.controller.ts:21-134`、`chanjet-auth.service.ts:141-173` | 公网任何人 POST `{"certificate":"伪造串"}` 就把内部证书覆盖成攻击者值，下次 `getOpenToken` 会用攻击者证书去换 token，链路被切。建议加签名校验（畅捷通推送应有 sign 字段，文档需查），同时 `setCertificate` 收到与已存不同值时报警 / 不覆盖。 |
| C-02 | P1 | `deepGet` 在任意 JSON 树里递归找 `certificate` / `authCode`，攻击者可包在任意层 | `chanjet-callback.controller.ts:55-65` | 即便加签名也要先匹配 `bizContent`/`msgType` 才解析。 |
| C-03 | P1 | `POST /api/chanjet/call` 是通用代理，**任何持 `MENU_SYS_CONFIG:V` 的人**都能任意路径 `/accounting/...` 调畅捷通（V 权够低） | `chanjet-callback.controller.ts:347-356` | 写操作的代理至少要 `E`，且记 `sys_audit_log`。 |
| C-04 | P1 | `decryptMessage` 走 `aes-128-ecb`，且密钥 fallback 在 raw 失败时尝试 MD5（双 try） | `chanjet-callback.controller.ts:94-103`、`chanjet-auth.service.ts:180-190` | ECB 本身是平台规范，无可选；但"两个密钥都试"使探测器误以为消息合法。建议失败明确按消息头 `msgType` 决定哪种，不要全部双试。 |
| C-05 | P1 | `inject_env CHANJET_CERT 'secret'` 在 deploy.yml 是把 GitHub Secret 写进服务器 `.env` 明文 | `.github/workflows/deploy.yml:594-611` | 这是部署用法，但 `.env` 在生产盘明文存放、备份链路全暴露。建议改用 `docker compose --env-file` + 离机密管理（vault/SOPS）。 |
| C-06 | P2 | `cronHealthCheck` 失败仅记 `log.error`，不打 sys_notification（运维看不到） | `chanjet-auth.service.ts:111-125` | 建议接 NotificationDispatcher 推 `MENU_FIN2_AR_LEDGER:V` 用户。 |

---

## 5. notification & presence

### 5.1 守卫现状

| 控制器 | `@UseGuards` | `@RequireMenu` | 真实结果 |
|---|---|---|---|
| `notification.controller.ts` | `MenuGuard, DataScopeGuard` ✅ | `MENU_WORKFLOW:V` | OK |
| `notification-stream.controller.ts` | — | `@Public()` + 手动 verify | 半 OK（独立解码） |
| `presence.controller.ts` | **无** ❌ | `MENU_SYSTEM:V` ❌ | **完全匿名** —— @RequireMenu 元数据有人写但没人读 |
| `notification-config.controller.ts` | **无** ❌ | 无 ❌ | **完全匿名 + 全 CRUD** |

### 5.2 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| N-01 | **P0** | `NotificationConfigController` 全套 CRUD 路由匿名 | `notification-config.controller.ts:27-32` 无任何 guard import | 公网可读 `sys_notification_rules` / `templates` / `logs`（含手机号 / userId / 业务编号），可写规则下钓鱼模板。**必须**立刻加 `@UseGuards(MenuGuard)` + `@RequireMenu('MENU_SYS_NOTIFY','V'/'E')`。 |
| N-02 | **P0** | `PresenceController` 写了 `@RequireMenu` 但没挂 `MenuGuard`，注解空跑 | `presence.controller.ts:12-21` 无 `@UseGuards` | 公网可拉在线用户清单 + 各人姓名/角色/store_code → 攻击者可枚举活跃账号、做钓鱼定向。立刻加 `@UseGuards(MenuGuard)`。 |
| N-03 | P1 | `NotificationStreamController` 用 `@Public()` 自验 JWT，自己维护一份 FALLBACK 密钥 | `notification-stream.controller.ts:10` | 见 L-06。建议把 verifyUserId 抽成 `auth/sse-token-verifier.ts` 单一实现。 |
| N-04 | P1 | `unauthorized` 时返回 `{ data: { type: 'unauthorized' } }`（HTTP 200） | `notification-stream.controller.ts:42-43` | EventSource 会"成功连上"并显示 unauthorized 帧；建议直接拒绝（return `throwError(() => new UnauthorizedException())`）或 close stream。 |
| N-05 | P2 | `myPrefs` / `setMyPref` 读 `req.user.userId`，但本控制器无 guard，`req.user` 永远是空 | `notification-config.controller.ts:199-223` | 无声失败：偏好永远落不进库。N-01 修复同步处理。 |
| N-06 | P2 | `online-users` SQL 把 user_id 强转 `bigint[]`，对脏数据已加正则 filter（OK），但 fallback 时 store_code 也直出 | `presence.controller.ts:25-67` | N-02 修后非问题，注意确保仅管理员可看。 |

---

## 6. scripts & GitHub Actions

### 6.1 .github/workflows 概览

| Workflow | 触发 | 备注 |
|---|---|---|
| `deploy.yml` | push main / PR / dispatch | 分层 fast-css/web/api/full；env 含 `JWT_SECRET=ci_test_secret_minlen_32_characters_xx` + `ENABLE_DEV_LOGIN: "true"`（**仅 CI test job 内**，未污染生产） |
| `regression.yml` | push v3-admin / PR | 老回归套，逻辑与 deploy 内 `test` 重复 |
| `dump-prod-schema.yml` | dispatch | 只读拉生产 schema |

### 6.2 风险

| # | 等级 | 风险点 | 证据 | 影响 / 建议 |
|---|---|---|---|---|
| CI-01 | P1 | `deploy.yml` 与 `regression.yml` 跑两套几乎一样的回归 → 维护漂移面 | `deploy.yml:178-361` vs `regression.yml:22-122` | 二者保护分支不同（main vs v3-admin）。建议把 regression.yml 改成"复用 deploy.yml 的 test job"或废弃（v3-admin 已基本退役？请确认）。 |
| CI-02 | P1 | `g5c-rbac-audit.sh` 默认密码 `ADMIN_PASS=along888` 进 git 仓库 | `scripts/g5c-rbac-audit.sh:80` | 这是生产实环境管理员密码（CLAUDE.md 多处出现 `admin/along888`）。即使是默认值，仓库公开化或 fork 后泄漏。建议改为强制要求环境变量、空值即 fail。 |
| CI-03 | P1 | `seed-uat-users.sh`、`smoke-test.sh`、`verify-docker-stack.sh`、`gen-api-docs.sh` 都把 `admin/admin123` 或 `admin/along888` 硬编码 | 见第 6.3 节 grep | 同 CI-02。新增 `check-admin-password-not-in-scripts` 红线扫描。 |
| CI-04 | P1 | `inject_env CHANJET_*` 把 GH secrets 直接 `echo >> .env` | `.github/workflows/deploy.yml:595-611` | 见 C-05。 |
| CI-05 | P1 | `deploy-fast-css` job 复用同一把 `DEPLOY_SSH_KEY` 既作 jumphost proxy_key 又作 target key | `deploy.yml:465-470,481-485` | 一把私钥被攻陷直接打穿生产。建议拆 jumphost / target key。 |
| CI-06 | P2 | `ENABLE_DEV_LOGIN: "true"` 在 deploy.yml env 段 | `deploy.yml:208` | 当前作用域仅 test job 局部 env，未传给镜像构建/部署 step；但风格上易被误复用到 docker compose env。建议加 grep 红线"`ENABLE_DEV_LOGIN` 不得出现在 prod 容器 env 里"。 |
| CI-07 | P2 | `deploy.yml` 执行 nginx reload + 写 `/etc/nginx/conf.d/erp.eggslao.com.conf`，没有备份回滚步骤 | `deploy.yml:676-688` | full 部署里有 `cp ... .bak-$(date +...)`，但 fast-css/web/api mode 不走 nginx；建议在 nginx test 失败时显式 `cp .bak` 回滚。 |
| CI-08 | P2 | `db-migrate.sh` 在生产模式跑 `docker compose exec -T db sh -c psql`，依赖容器名约定 | `scripts/db-migrate.sh:28-29` | 容器更名 / docker compose stack 切换名会静默失败。建议显式 `--project-name` 防漂移。 |

### 6.3 硬编码密码 grep（CI-02/03 证据）

```
scripts/g5c-rbac-audit.sh:80:        ADMIN_PASS="${ADMIN_PASS:-along888}"
scripts/verify-docker-stack.sh:91:  -d '{"username":"admin","password":"admin123"}'
scripts/gen-api-docs.sh:30:      -d '{"username":"admin","password":"admin123"}'
scripts/seed-uat-users.sh:26:    ADMIN_P="${ADMIN_PASS:-admin123}"
scripts/uat-runner.sh:115: declare -a USERS=(admin:admin123 wang_ceo:Test@1234 ...)
scripts/smoke-test.sh:53:    ... -d '{"username":"admin","password":"along888"}'
```

`Test@1234` 是 UAT 9 个 persona 公共密码，文档化 OK；但脚本里 `admin:admin123`
和 `along888` 直入仓库 = 长期债务。

---

## 7. 矩阵汇总：5 个维度 × 风险

| 维度 | P0 | P1 | P2 |
|---|---|---|---|
| 权限绕过 | L-01、L-02、R-01、R-02、R-03、G-01、C-01、N-01、N-02 | L-03、L-04、L-05、L-06、G-02、G-03、C-02、C-03、N-03、N-04 | L-07、L-08、G-04、G-05、G-06、C-04、N-05、N-06 |
| 角色可见性 | R-01、R-02、N-01、N-02 | R-04、R-05 | R-06、G-04 |
| 组织隔离 | — | G-02、G-03 | G-04、G-06 |
| 接口安全 | C-01、N-01、N-02 | C-03、C-04、C-05、N-03、N-04 | C-06 |
| 测试 / CI | — | CI-01、CI-02、CI-03、CI-04、CI-05 | CI-06、CI-07、CI-08 |

---

## 8. 推荐处置顺序（一周内）

1. **D1（今日）** — 修 N-01 / N-02 / R-01 / R-02 / R-03，加 `@UseGuards(MenuGuard)`
   + `@RequireMenu`；合并 / 删除重复的 `api/permission-sets` 控制器。由
   Audit Agent 自己改（属于 `apps/api/src/modules/permissions|permission-sets|notification`，
   均在权限边界内）。
2. **D2** — 修 L-01 / L-02：拆 `login` 与 `impersonate`，禁 impersonate 超管，
   禁 cookie_token 缺少 `impersonatedBy`/`perms_version`。
3. **D3** — 修 C-01：给 `/api/chanjet/callback` 加签名校验（按畅捷通最新文档 sign
   字段），若没有 sign 则限制 source IP / 域名校验。
4. **D4** — CI-02/03：默认值改空 → fail-fast；后续脚本必须显式 `ADMIN_PASS=...`。
5. **D5** — G-01：把 `MenuGuard` 提升为 `APP_GUARD`，`@Public()` 显式标注回调。
6. **D6** — 清理 L-06 / N-03 / health 暴露指纹（health 控制器超出本 Agent 责任，
   交 Architect Agent）。
7. **D7** — 重测 g5c-rbac-audit.sh 覆盖以上修复，确认无回归。

---

## 9. 跨 Agent 协作

| Agent | 需要他们做的事 |
|---|---|
| Architect | health controller 移除 JWT 指纹（L-05 / 部分 G-01）；`master-data-type.guard` 类型表迁到 sys_menu 元数据驱动（G-04） |
| Finance | `finance-v2` 模块逐一过 `@RequireMenu`，把"读 fin_ar_*"端点收紧（与 N-01 同思路反查可能也是问题，需独立审计） |
| ERP Business | `sales-v2 / procurement-v2 / wms / store-pos` controller 抽样补 `@RequireMenu` 检查（不在本轮 5 模块内但风险面相同） |
| Audit (本 Agent) | 第二轮：扫 `apps/api/src/modules/**/*.controller.ts` 找所有 "只挂 `AuthGuard('jwt')` 不挂 `MenuGuard`" 的 controller，列清单交对应 Agent 修 |

---

## 10. 验证方式（修复后自检）

- `node -e "$(cat scripts/check-public-controllers.mjs)"`（**待新增**）：扫所有
  `*.controller.ts`，断言"未挂 `@UseGuards` 也未 `@Public` 的端点 = 0"。
- 扩展 `scripts/g5c-rbac-audit.sh`：用非超管 token 调
  `/api/permissions/role/ROLE_ADMIN/perms`、`/api/permission-sets`、
  `/api/notifications/config/rules`，期望 403；现状会全部 200。
- 加 CI red-line：grep `ENABLE_DEV_LOGIN.*true` 不得出现在生产 compose；
  grep `'admin123'\|'along888'` 不得出现在 scripts/（除非作 fail-fast 默认提示）。

---

**报告完。等待 Architect / Finance / ERP Agent 在各自分支按上述清单修复后，
本 Agent 再开第二轮覆盖回归。**
