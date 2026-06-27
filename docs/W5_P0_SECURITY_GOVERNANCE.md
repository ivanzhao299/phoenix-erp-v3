# W5-P0 安全治理（R0-1 ~ R0-4）

> 编排人：Audit / Integration Agent（feature/agent-audit-integration）
> 日期：2026-06-20
> 阶段：**W5-P0 Security Governance**（W5 的安全红线子轨道，与 M2/M3 主线并行）
> 输入：
> - `docs/W5_READINESS_REVIEW.md`（W5 启动综合体检；§3 权限治理 42/100 + §6 TOP 10 #1~#4 + §12.1 R-1"W5 内修 R0-1~R0-4"条件直接对应本文件 4 子任务包）
> - `docs/AUDIT_INTEGRATION_AGENT_AUDIT.md`（R0-1~R0-4 原始风险描述）
> - `docs/MULTI_AGENT_PHASE2_PLAN.md`（§1 风险排序 + §2.1 Audit Wave 任务）
> - `docs/WAVE1_ACCEPTANCE_REVIEW.md`（W1 PASS WITH CONDITIONS）
> - `docs/M1_ORGANIZATION_MODEL.md` v2.0
> - `docs/M2_PROJECT_CONSOLIDATION.md`
> - 实测核对：`apps/api/src/{auth, modules/permissions, modules/permission-sets, modules/notification, modules/chanjet}` 2026-06-20 现状
>
> 本文件**只做治理方案**，不写业务代码、不新增 migration。落地在 P0-A ~ P0-D
> 四个子任务包中按 wave 拆分。

---

## 0. 总览

W5-P0 安全治理是 MULTI_AGENT_PHASE2_PLAN §2.1 Audit Wave A1-A4 的工程化展开。
4 个 R0 风险已在 W4 完成 + W1 验收后仍**未修复**——这是 W5 的安全红线，必须
在主数据 M2 / M3 实施期间**同步推进**，否则 R0-1/R0-2 持续暴露权限边界、
R0-3 持续暴露 impersonate 风险面、R0-4 持续暴露畅捷通接口被劫持的可能。

### 0.1 风险风险矩阵

| 编号 | 主题 | 风险等级 | 当前状态 | 子任务包 |
|---|---|---|---|---|
| R0-1 | RBAC 矩阵治理 | **P0 灾难** | `/api/permissions/**` + `/api/permission-sets/**` 仅 `AuthGuard('jwt')`，**任意登录用户可改全集团权限** | P0-A |
| R0-2 | Notification 公开接口治理 | **P0 灾难** | `NotificationConfigController` 无任何 guard + `PresenceController` `@RequireMenu` 空跑（无 `@UseGuards`），**匿名可读写** | P0-B |
| R0-3 | Auth Bypass 治理 | **P0 严重** | `AuthService.login` 接受 `bypassPassword` 内部参数；`impersonate` 不禁超管→超管 | P0-C |
| R0-4 | Chanjet 签名 + 接口安全治理 | **P0 灾难** | `/api/chanjet/callback` 公开 + **无签名校验** + `setCertificate` 直接覆盖 + `deepGet` 任意层递归扫 | P0-D |

### 0.2 总工作量与收益（详 §6）

| 维度 | 数字 |
|---|---|
| 总工作量估时 | **5-7 工作日**（含设计 + 实施 + 单测 + 回归 + 灰度） |
| 总风险降低分值（R0 风险） | **R0 从 4 项降至 0 项**，对应安全风险评分 +40 ~ +50 |
| 总生产评分提升 | **生产稳态评分 +25 ~ +30**（按 100 分制，含可用性 / 安全 / 合规三维） |

---

## 1. R0-1 — RBAC 矩阵治理

### 1.1 风险描述

凤凰 ERP V3 全部权限矩阵（角色 × 菜单 × CRUD 操作码 + 权限集 × 用户绑定）
通过两组 RESTful 端点维护：
- `/api/permissions/menus|matrix|stats|effective-perms/:userId|role/:code/perms|role/:code/users|conflicts|check-conflicts|check-role-combo|role/:code/status|who-can`
- `/api/permission-sets`（**两个模块各自注册了一份，路由 1:1 重复**）

实测两组 controller **仅挂 `@UseGuards(AuthGuard('jwt'))`**，无 `@RequireMenu` /
`MenuGuard`，意味着 **任何登录用户（包括 POS 收银员、配送司机、临时工号）
都能调用以下危险端点**：

- `PUT /api/permissions/role/:code/perms` — 批量覆盖任意角色的菜单×CRUD 三元组（事务式 delete + insert）
- `PATCH /api/permissions/role/:code/status` — 停用任意角色（含 ROLE_ADMIN）
- `POST /api/permission-sets/:code/users/:userId` / `bind-user/:userId` — 给任意用户绑权限集
- `PUT /api/permission-sets/:code/items` — 给任意权限集塞任意 perm

此外，`api/permission-sets` 同一 URL 被 `modules/permissions/permission-sets.controller.ts`
与 `modules/permission-sets/permission-sets.controller.ts` **重复注册**，
Nest 按模块加载顺序的最后一个生效（当前是 `modules/permission-sets/`），
两份 service 字段命名（`assignRole/unassignRole` vs `bindRole/unbindRole`）
不一致，前端调谁取决于覆盖。

### 1.2 当前代码位置

| 文件 | 行 | 现状 |
|---|---|---|
| `apps/api/src/modules/permissions/permissions.controller.ts` | 8-9 | `@Controller('api/permissions')` + `@UseGuards(AuthGuard('jwt'))` |
| `apps/api/src/modules/permissions/permission-sets.controller.ts` | 8-9 | `@Controller('api/permission-sets')` + `@UseGuards(AuthGuard('jwt'))`（重复定义 1） |
| `apps/api/src/modules/permission-sets/permission-sets.controller.ts` | 11-12 | `@Controller('api/permission-sets')` + `@UseGuards(AuthGuard('jwt'))`（重复定义 2，当前生效） |
| `apps/api/src/app.module.ts` | 120 / 139 | 两个模块都 import，PermissionSetsModule 在后覆盖 |

### 1.3 风险等级

**P0 灾难**（CVSS 9.8 等价）—— 内网认证用户可在 < 5 秒内通过 1 个 PUT 请求把
自己角色升为 ROLE_ADMIN 同权，或把 ROLE_ADMIN 停用造成集团权限瘫痪。

### 1.4 可能造成的事故

| 事故场景 | 影响面 |
|---|---|
| 临时工号 / 离职未禁用账号 PUT `/role/ROLE_FARM_WORKER/perms` 加 `MENU_FIN2_CASH:V,C,E,D,A,X` | 拿到全财务读写 → 转账伪造 / 现金挪用 |
| 内部攻击者 PATCH `/role/ROLE_ADMIN/status=DEPRECATED` | 全公司管理员功能失效 → 业务停摆 |
| POST `/permission-sets/超管包/bind-user/我自己` | 1 步直升超管 |
| 数据泄露：GET `/permissions/matrix` + `/effective-perms/:userId` | 全集团权限矩阵 + 任意用户权限快照外泄 |

### 1.5 修复方案

**短期收口（W5 内）**：

1. 合并两份 `api/permission-sets` 控制器（保留 `modules/permission-sets/`，删 `modules/permissions/permission-sets.controller.ts` 引用）—— 解 Nest 路由覆盖；
2. 所有 `/api/permissions/*` 与 `/api/permission-sets/*` 端点统一加：
   - `@UseGuards(MenuGuard, DataScopeGuard)`
   - 写端点：`@RequireMenu('MENU_SYS_ROLE', 'E')`
   - 读端点：`@RequireMenu('MENU_SYS_ROLE', 'V')`
   - 高敏写（如 `PATCH /role/:code/status` / `bind-user`）额外加审计 log
3. 在 OperationLogInterceptor 上加白名单：以上所有写端点 100% 写 sys_audit_log，包括 actor / before / after JSON。

**中期（W6+）**：

4. 把 `PUT /role/:code/perms` 改为强制 `?dry_run=1` 预览模式 + 二次确认 token；
5. 给 `MENU_SYS_ROLE` 与 `MENU_SYS_USER` 加 SoD 红线（同一用户不能同时持 V+E）。

### 1.6 涉及模块

| 模块 | 改动 |
|---|---|
| `apps/api/src/modules/permissions/**` | 写 + 删除重复 controller import |
| `apps/api/src/modules/permission-sets/**` | 写（加 guards） |
| `apps/api/src/app.module.ts` | 调模块注册顺序或显式删 `modules/permissions/permission-sets.controller.ts` 的 controllers 注册 |

### 1.7 涉及数据库

- ❌ **不动 schema**
- ✅ sys_audit_log 写入量增加（已存在的表）
- ✅ menu_code `MENU_SYS_ROLE` 需在 sys_menu 注册（已 seed，无需新建）

### 1.8 是否需要迁移

❌ **不需要**（纯 guard / controller 改造）。

### 1.9 验收命令

```bash
# 1) tsc
cd apps/api && ./node_modules/.bin/tsc --noEmit

# 2) 公开端点扫描(必须 0 个未挂 guard 的 /api/permissions/*)
node scripts/check-public-controllers.mjs apps/api/src  # ← W5 Audit 新增
# 期望: 0 hit 在 /api/permissions 与 /api/permission-sets

# 3) g5c-rbac-audit 加非超管 token 测试
API_BASE=http://127.0.0.1:3100 NON_ADMIN_USER=test_cashier NON_ADMIN_PASS=Test@1234 \
  bash scripts/g5c-rbac-audit.sh
# 期望: 非超管调 PUT /api/permissions/role/ROLE_ADMIN/perms → 403

# 4) 重复路由扫描
grep -rn "@Controller('api/permission-sets')" apps/api/src/modules
# 期望: 1 行(唯一定义)

# 5) 真实 curl 验证
TOKEN_CASHIER=$(curl -s -X POST http://127.0.0.1:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test_cashier","password":"Test@1234"}' | jq -r .token)
curl -i -X PUT http://127.0.0.1:3100/api/permissions/role/ROLE_ADMIN/perms \
  -H "Authorization: Bearer $TOKEN_CASHIER" \
  -H 'Content-Type: application/json' \
  -d '{"perms":[]}'
# 期望: HTTP/1.1 403 Forbidden + MENU_PERMISSION_DENIED
```

### 1.10 回滚方案

| 步 | 动作 |
|---|---|
| 1 | `git revert <merge-commit>` → 走标准 deploy.yml |
| 2 | 不涉及 DB；revert 即恢复"裸奔但能用"状态 |
| 3 | 回滚后立即发安全公告（"权限矩阵端点临时回到 W4 状态，正在二次修复"） |

**最坏情况**：回滚后短暂回到裸奔，需 5 分钟内重新修复合并（不允许长期停留）。

---

## 2. R0-2 — Notification 公开接口治理

### 2.1 风险描述

通知模块 4 个 controller 状态：
- `NotificationController` (`/api/notifications`) — ✅ 已挂 `MenuGuard + DataScopeGuard + @RequireMenu('MENU_WORKFLOW', 'V')`
- `NotificationStreamController` (`/api/notifications/stream`) — ⚠ `@Public()` + 手动 JWT 验签（独立维护一份 FALLBACK 密钥）
- `PresenceController` (`/api/system/online-users`, `/api/system/online-count`) — 🔴 写了 `@RequireMenu('MENU_SYSTEM','V')` 但 **没挂 `@UseGuards(MenuGuard)`**，注解空跑
- `NotificationConfigController` (`/api/notifications/config/*` 共 17 个 CRUD 端点) — 🔴 **无任何 `@UseGuards` + 无任何 `@RequireMenu`**

后两者实测匿名可调；Presence 暴露在线用户姓名 / 角色 / store_code 清单
（钓鱼定向素材）；NotificationConfig 暴露 + 可改 `sys_notification_rules` /
`sys_notification_templates` / `sys_notification_log`（含手机号 / userId /
业务编号 / 模板正文）。

### 2.2 当前代码位置

| 文件 | 行 | 现状 |
|---|---|---|
| `apps/api/src/modules/notification/notification-config.controller.ts` | 27 | `@Controller('api/notifications/config')` 无任何 guard |
| `apps/api/src/modules/notification/presence.controller.ts` | 11 | `@Controller('api/system')` 无 `@UseGuards`；§21 / §72 写了 `@RequireMenu('MENU_SYSTEM','V')` |
| `apps/api/src/modules/notification/notification-stream.controller.ts` | 27-38 | `@Public()` 自验 JWT（含 FALLBACK 密钥） |
| `apps/api/src/app.module.ts` | 142-167 providers 段 | 无 `APP_GUARD` 全局守卫 → 任何漏挂 `@UseGuards` 的 controller 全匿名 |

### 2.3 风险等级

**P0 灾难**（CVSS 9.4 等价）—— 公网（生产 nginx 已暴露 `/api/*`）即可读
全集团在线用户列表 + 写钓鱼通知模板，攻击门槛 = curl。

### 2.4 可能造成的事故

| 事故场景 | 影响面 |
|---|---|
| `curl /api/system/online-users` | 拿全集团在线用户姓名 + 角色 + storeCode，定向钓鱼素材 |
| `POST /api/notifications/config/rules` 写假规则 + 假模板 | 推送 "请点这里重置密码 https://攻击者.com" 给所有用户 → 凭据窃取 |
| `GET /api/notifications/config/logs` 拉历史推送 | 业务编号 / 用户手机号 / 通知正文外泄 |
| `PUT /api/notifications/config/templates/:id` 改既有模板 | 篡改正常业务通知（如审批通过链接） |

### 2.5 修复方案

**短期收口（W5 内）**：

1. `NotificationConfigController` 加 `@UseGuards(MenuGuard, DataScopeGuard)` + 类级
   `@RequireMenu('MENU_SYS_NOTIFY', 'V')`；写端点（POST/PUT/DELETE/test/retry）覆写为 `'E'`；
2. `PresenceController` 加 `@UseGuards(MenuGuard, DataScopeGuard)`（注解已存在，缺 guard）；
3. `NotificationStreamController` 保持 `@Public`（EventSource 限制）+ 优化：
   - 收到 invalid token 立即 `throwError(() => new UnauthorizedException())` 替代 `{data:{type:'unauthorized'}}` 200
   - 移除独立的 FALLBACK 密钥常量，改用 `auth/jwt-config.ts` 唯一源（与 R0-3 / P0-C 联动）；
4. 在 `sys_menu` 注册 `MENU_SYS_NOTIFY`（若未存在）。

**中期（W6+）**：

5. 把 `MenuGuard` 提升为 `APP_GUARD = MenuGuard`，`@Public()` 反向标注少数公开端点
   （chanjet callback / health / SSE stream / login）；此举杜绝"未来 controller 漏挂"
   的整类风险。属 PLAN §2.1 A5 任务，本批 P0 只准备方案稿，不实施（避免大范围回归）。

### 2.6 涉及模块

| 模块 | 改动 |
|---|---|
| `apps/api/src/modules/notification/**` | NotificationConfigController + PresenceController + NotificationStreamController |
| `apps/api/src/common/guards/menu-registry.service.ts` | FALLBACK_MENU_CODES 加 `MENU_SYS_NOTIFY`（如缺） |
| `apps/api/src/auth/jwt-config.ts` | **新增**单一密钥源（与 P0-C 共享，详 §3.5） |

### 2.7 涉及数据库

- ❌ **不动 schema**
- ✅ `sys_menu` 需有 `MENU_SYS_NOTIFY` 行；若缺，由 P0-B 配套 TS 迁移 seed（INSERT ON CONFLICT DO NOTHING）

### 2.8 是否需要迁移

🟡 **可能需要 1 个 seed-only 迁移**（若 `sys_menu` 中无 `MENU_SYS_NOTIFY`）；含 `@allow-data-dml` 标记 + down() 删行。

### 2.9 验收命令

```bash
# 1) 公开端点扫描
node scripts/check-public-controllers.mjs apps/api/src
# 期望: notification 模块只有 NotificationStreamController 单条 @Public 命中
# (NotificationConfigController + PresenceController 必须有 @UseGuards)

# 2) 匿名 curl 验证 NotificationConfig 403
curl -i http://127.0.0.1:3100/api/notifications/config/rules
# 期望: HTTP/1.1 401 (无 token) 或 403 (有 token 无 MENU_SYS_NOTIFY)

curl -i http://127.0.0.1:3100/api/system/online-users
# 期望: HTTP/1.1 401 (无 token)

# 3) 持 MENU_SYS_NOTIFY:V 的用户 200
TOKEN_NOTIFY_ADMIN=$(...)
curl -sf http://127.0.0.1:3100/api/notifications/config/rules \
  -H "Authorization: Bearer $TOKEN_NOTIFY_ADMIN" | jq '.[0:3]'
# 期望: 返回前 3 条规则

# 4) SSE stream invalid token 行为
curl -i 'http://127.0.0.1:3100/api/notifications/stream?token=invalid'
# 期望: HTTP/1.1 401 (不再是 200 + 'unauthorized' 事件帧)

# 5) menu_code 注册校验
curl -sf http://127.0.0.1:3100/api/sys/menu-registry/stats | jq '.source'
# 期望: 'sys_menu' (从 DB 加载;含 MENU_SYS_NOTIFY)
```

### 2.10 回滚方案

| 步 | 动作 |
|---|---|
| 1 | `git revert <merge-commit>` |
| 2 | 若 P0-B seed 迁移已落，运行 `typeorm migration:revert` 删 sys_menu 行 |
| 3 | 不涉及业务数据；回滚即恢复 W4 状态（裸奔但能用）|

---

## 3. R0-3 — Auth Bypass 治理

### 3.1 风险描述

3 个相关缺陷：

#### 3.1.1 `AuthService.login` 接受内部 `bypassPassword` 参数

`auth.service.ts:59` `login(username, password, ip?, opts?: { bypassPassword?: boolean; impersonatedBy?: { id, username } })`
是**公共方法**，`bypassPassword=true` 时跳过密码校验（行 166）。
仅靠"约定调用方是 controller 层 impersonate"——没有任何运行时鉴权或调用栈检查。
任何注入 `AuthService` 的代码（包括未来的业务 service、未来的 HTTP 端点、未来的 gRPC）
都能 `bypassPassword:true` 拿任意用户的真实 token。

#### 3.1.2 `impersonate` 不禁超管→超管

`auth.controller.ts:47` `POST /api/auth/impersonate` 仅检查调用方是 ROLE_ADMIN
（`isSuper` 行 58-61）；**没有**禁止"目标用户也是 ROLE_ADMIN"。
超管 A 可以 impersonate 超管 B → 拿 B 的真实会话 → 连锁拿其它超管。

#### 3.1.3 `cookie_token` 缺关键字段

`auth.service.ts:301-306` 为 Next.js 中间件签发瘦身 cookie_token，**不含** `perms_version`
也**不含** `impersonatedBy`：
- 用户被吊销权限后 7 天内 cookie_token 仍有效（中间件不知道）
- impersonate 期间页面级请求看不出是影子身份

### 3.2 当前代码位置

| 文件 | 行 | 现状 |
|---|---|---|
| `apps/api/src/auth/auth.service.ts` | 59 | `login(...) opts?: { bypassPassword?: boolean; ... }` 公共方法签名 |
| `apps/api/src/auth/auth.service.ts` | 165-167 | `if (!opts?.bypassPassword && !isPasswordValid) throw UnauthorizedException` |
| `apps/api/src/auth/auth.service.ts` | 301-306 | `cookieToken = jwt.sign({...无 perms_version,无 impersonatedBy})` |
| `apps/api/src/auth/auth.service.ts` | 326-347 | `impersonate()` 无目标白名单 |
| `apps/api/src/auth/auth.controller.ts` | 47-65 | `POST /api/auth/impersonate` 仅 `isSuper` 校验 |
| `apps/api/src/auth/auth.service.ts` | 9 | module-level `const JWT_SECRET = process.env.JWT_SECRET || 'DEV_ONLY...'` |
| `apps/api/src/modules/notification/notification-stream.controller.ts` | 10 | 同字面量 FALLBACK 第二份硬编码（→ P0-C 一并修） |
| `apps/api/src/guards/phoenix-jwt.guard.ts` | 4 | 同字面量第三份硬编码 |
| `apps/api/src/health.controller.ts` | 10 | 第四份 |

### 3.3 风险等级

**P0 严重**（CVSS 8.6 等价）—— 直接被外部攻击的概率低于 R0-1 / R0-2
（需要恶意/疏忽内部代码），但一旦命中即拿真实会话，**审计追溯困难**。

### 3.4 可能造成的事故

| 事故 | 影响 |
|---|---|
| 未来 Agent 写新 service 误用 `AuthService.login({bypassPassword:true})` → 注入到 HTTP 端点 | 任意用户 token 任意签发 |
| 超管 A 长期 impersonate 超管 B 业务 → 操作以 B 名义记录 | 审计责任错位 |
| 用户离职 → 权限吊销但 cookie_token 仍有效 → Next.js 中间件允许页面级 SSR | 数据未授权浏览 |
| 4 处 FALLBACK 密钥任一被改名（grep 漏一处）→ 该处实际走 dev secret | JWT 全集团可伪造 |

### 3.5 修复方案

**短期收口（W5 内）**：

1. **拆 login 与 impersonate**：
   - `login(username, password, ip?)` 改为公共方法，**禁** `bypassPassword`
   - 新建 `private async loginInternal(username, opts: { impersonatedBy })`，仅 impersonate 调用
   - `impersonate(target, adminUser, ip)` 内部调 `loginInternal`，不再绕 login
2. **impersonate 加超管→超管禁令**：
   - target 用户的 roles 含 `ROLE_ADMIN` 或 permissions 含 `*` → `ForbiddenException('禁止 impersonate 管理员账号')`
3. **cookie_token 补字段**：
   - 写入 `perms_version`、`impersonatedBy?`、`roleType`（与 server token 同源）
   - Next.js 中间件读 `perms_version` 后调 `/api/auth/me` 双因子核验（OPTIONAL，本批不做）
4. **JWT FALLBACK 单一源**（与 P0-B / P0-C 联动）：
   - 新建 `apps/api/src/auth/jwt-config.ts`：导出 `JWT_SECRET / JWT_SECRET_PREV / FALLBACK`
   - 4 处文件改 import；删字面量
   - 启动期 `main.ts` 加显式断言：`if (NODE_ENV==='production' && (!JWT_SECRET || JWT_SECRET===FALLBACK)) throw new Error('SEC-CRITICAL JWT_SECRET 未配置')`
5. **impersonate 审计**：
   - 已有 `sys_audit_log INSERT IMPERSONATE`（行 338-345），保留
   - 加 metrics（OperationLogInterceptor 加 impersonate 计数）

### 3.6 涉及模块

| 模块 | 改动 |
|---|---|
| `apps/api/src/auth/**` | auth.service / auth.controller / 新建 jwt-config.ts |
| `apps/api/src/guards/phoenix-jwt.guard.ts` | 改 import jwt-config |
| `apps/api/src/health.controller.ts` | 改 import + 仍可读 fingerprint 但脱敏（4 字符后缀改 hash 前 6 字节） |
| `apps/api/src/modules/notification/notification-stream.controller.ts` | 改 import |

### 3.7 涉及数据库

- ❌ **不动 schema**
- ✅ `sys_audit_log` 已存在（写量增加，已有逻辑）

### 3.8 是否需要迁移

❌ **不需要**（纯 service / controller 改造）。

### 3.9 验收命令

```bash
# 1) tsc + lint
cd apps/api && ./node_modules/.bin/tsc --noEmit
pnpm lint

# 2) FALLBACK 字面量必须仅在 jwt-config.ts 一处
grep -rn "DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD" apps/api/src/
# 期望: 1 行 (apps/api/src/auth/jwt-config.ts)

# 3) bypassPassword 出现在公共签名必须 0 个
grep -rn "bypassPassword" apps/api/src/auth/auth.service.ts | grep -v "private\|loginInternal\|//"
# 期望: 0 行

# 4) impersonate 超管→超管 403
ADMIN_TOKEN=$(curl -s -X POST http://127.0.0.1:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"'$ADMIN_PASS'"}' | jq -r .token)
curl -i -X POST http://127.0.0.1:3100/api/auth/impersonate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username":"wang_ceo"}'  # wang_ceo 含 ROLE_CEO/ROLE_ADMIN
# 期望: HTTP/1.1 403 + 禁止 impersonate 管理员账号

# 5) cookie_token 含 perms_version 与 impersonatedBy
node -e '
  const jwt = require("jsonwebtoken");
  const t = process.argv[1];
  console.log(JSON.stringify(jwt.decode(t), null, 2));
' "$COOKIE_TOKEN" | grep -E 'perms_version|impersonatedBy'
# 期望: 2 行命中

# 6) 启动期 JWT 断言
NODE_ENV=production JWT_SECRET= node dist/main 2>&1 | grep "SEC-CRITICAL"
# 期望: 启动失败 + 错误信息明文

# 7) RBAC 巡检
bash scripts/g5c-rbac-audit.sh
```

### 3.10 回滚方案

| 步 | 动作 | 风险 |
|---|---|---|
| 1 | `git revert <merge-commit>` | 🟢 |
| 2 | 不涉及 DB；不涉及历史 token；JWT 签名算法未变 → 已发放的 token 仍可验 | 🟢 |
| 3 | cookie_token 缺字段不会让旧 token 失效（仅新签发的 cookie 多带字段）| 🟢 |

---

## 4. R0-4 — Chanjet 签名 + 接口安全治理

### 4.1 风险描述

`/api/chanjet/callback`（GET + POST）是畅捷通开放平台消息推送 / 企业授权回调入口。
为了让平台能推 `appTicket` / 企业授权 `certificate`，端点必须公网可达
（`@Public()`）。但当前实现**无任何签名校验** + 用 `deepGet` 在任意 JSON 树
递归找 `certificate` / `authCode` 字段，**任何公网 POST** 都能：

1. 覆盖内部存储的 `certificate`（service `setCertificate` 行 141 直接持久化到 `sys_chanjet_state`）
2. 触发 `fetchCertificateByAuthCode` 用攻击者提供的 authCode 去畅捷通换 cert
3. 链路被切：下次 `getOpenToken` 用攻击者证书 → 畅捷通调用全失败 / 被劫持

加上：
- `decryptMessage` 走 `aes-128-ecb`，且 raw key 失败时 fallback MD5 密钥（探测器误判）
- `POST /api/chanjet/call` 通用代理只要求 `MENU_SYS_CONFIG:V`，任意持 V 权限的人都能调畅捷通任意 path
- 部署链 `inject_env CHANJET_*` 把 GH secret 写进生产服务器 `.env` 明文存放

### 4.2 当前代码位置

| 文件 | 行 | 现状 |
|---|---|---|
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 21-41 | `GET /callback` `@Public()` 无签名校验 |
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 48-134 | `POST /callback` `@Public()` 无签名校验 |
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 55-65 | `deepGet` 任意层递归找 certificate / authCode |
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 28, 68, 128, 392 | `auth.setCertificate(...)` 直接覆盖（无对账） |
| `apps/api/src/modules/chanjet/chanjet-auth.service.ts` | 141-145 | `setCertificate(cert)` 直接 persistState |
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 337-356 | `GET/POST /call` 通用代理，权限 `MENU_SYS_CONFIG:V`（应升 E） |
| `.github/workflows/deploy.yml` | 594-611 | `inject_env CHANJET_*` 明文写 .env |

### 4.3 风险等级

**P0 灾难**（CVSS 9.1 等价）—— 攻击者无需任何凭据即可让畅捷通接口失效或
拿到伪造证书；财务对账 / 应收同步 / 月末关账全链路依赖此接口。

### 4.4 可能造成的事故

| 事故 | 影响 |
|---|---|
| 公网 POST `{certificate:"伪造"}` → 内部 cert 被覆盖 | `getOpenToken` 失败 → AR sync / 应收对账全部失败 |
| 公网 POST `{authCode:"任意值"}` → fetchCertificateByAuthCode | 调用畅捷通 API 失败 + 浪费请求配额 |
| 公网攻击者反复触发回调 | 干扰正常 appTicket 接收节奏 |
| 持 `MENU_SYS_CONFIG:V`（查看权）的非管理员调 `POST /call` | 任意修改畅捷通账套数据 |
| `.env` 明文 CHANJET_APP_SECRET 被备份链路 / 容器逃逸读到 | 畅捷通账号被全权接管 |

### 4.5 修复方案

**短期收口（W5 内）**：

1. **签名校验**：
   - 按畅捷通官方文档实现 `verifyCallbackSignature(headers, body)`，校验 `sign` / `nonce` / `timestamp` 字段
   - 校验失败 → log warn + 返回 200 `{result:'success'}`（畅捷通要求 200，但不消费 body）
   - 校验通过才进 `setCertificate` / `fetchCertificateByAuthCode` 分支
2. **deepGet 收窄**：
   - 只允许在 `bizContent` / `data` / `result` 这 3 个白名单子树扫，不递归任意层
3. **setCertificate 对账**：
   - service 行 141 加 "新值 != 已存值 && 已存值非空 → warn + 拒"
   - 加 sys_audit_log（actor=callback, before/after preview）
4. **POST /call 升 'E'**：
   - 行 348 `@RequireMenu('MENU_SYS_CONFIG', 'V')` → `'E'`
   - 写 sys_audit_log（含 path / method / response.success）
5. **decryptMessage 双试改单试**：
   - 按消息头 `msgType` 决定密钥（rawKey for encryptMsg, MD5 for content），不再 fallback

**中期（W6+）**：

6. **.env 改 secrets manager**（如 vault / SOPS / docker swarm secret）—— 属部署链改造，本批不做
7. **IP 白名单**：在 nginx 层限制 `/api/chanjet/callback` 仅畅捷通官方 IP 段

### 4.6 涉及模块

| 模块 | 改动 |
|---|---|
| `apps/api/src/modules/chanjet/chanjet-callback.controller.ts` | 4 处 setCertificate 调用前加签名校验；deepGet 收窄；POST /call 升 E |
| `apps/api/src/modules/chanjet/chanjet-auth.service.ts` | setCertificate 加对账 + 审计 |
| `apps/api/src/modules/chanjet/chanjet.module.ts` | 无 |

### 4.7 涉及数据库

- ❌ **不动 schema**
- ✅ `sys_audit_log` 写量增加（已有表）
- ✅ `sys_chanjet_state.certificate` 字段值由 service 校验后才更新（已有列）

### 4.8 是否需要迁移

❌ **不需要**。

### 4.9 验收命令

```bash
# 1) tsc
cd apps/api && ./node_modules/.bin/tsc --noEmit

# 2) 无签名 POST 必须不消费 body
curl -i -X POST http://127.0.0.1:3100/api/chanjet/callback \
  -H 'Content-Type: application/json' \
  -d '{"certificate":"attacker_fake_cert"}'
# 期望: HTTP/1.1 200 + {"result":"success"}
# 但检查 DB: sys_chanjet_state.certificate 未变
psql -c "SELECT certificate FROM sys_chanjet_state WHERE key='singleton';"

# 3) deepGet 收窄: certificate 不在 bizContent/data/result 下不被消费
curl -i -X POST http://127.0.0.1:3100/api/chanjet/callback \
  -H 'X-Chanjet-Sign: <valid>' -H 'X-Chanjet-Nonce: <valid>' -H 'X-Chanjet-Timestamp: <valid>' \
  -H 'Content-Type: application/json' \
  -d '{"hidden":{"certificate":"x"}}'
# 期望: 200 但 cert 未变

# 4) POST /call 升 'E' 后,持 V 权限的应 403
TOKEN_V=$(...)  # 持 MENU_SYS_CONFIG:V 但无 E 的 token
curl -i -X POST http://127.0.0.1:3100/api/chanjet/call \
  -H "Authorization: Bearer $TOKEN_V" \
  -H 'Content-Type: application/json' \
  -d '{"path":"/accounting/openapi/cc/anything"}'
# 期望: HTTP/1.1 403 MENU_PERMISSION_DENIED

# 5) setCertificate 对账行为
# 已有 cert 时,POST 不同值 → 拒
# (需畅捷通官方 sign 才能进 setCertificate;此步留待真畅捷通 staging 跑)

# 6) 审计 log
psql -c "SELECT action, entity_type, created_at FROM sys_audit_log
          WHERE action IN ('CHANJET_CALLBACK_REJECT','CHANJET_CALL','CHANJET_CERT_UPDATE')
          ORDER BY created_at DESC LIMIT 10;"
```

### 4.10 回滚方案

| 步 | 动作 | 风险 |
|---|---|---|
| 1 | `git revert <merge-commit>` | 🟡 回滚后 chanjet callback 重新无签名 = 重新裸奔 |
| 2 | 若签名实现错误把正常推送拒了 → 暂时回滚 + 重新核实文档 | 🟡 影响 AR sync 1-2 天 |
| 3 | setCertificate 对账若误拒 → 需 sys_audit_log 反查正确 cert 手工恢复 | 🟢 单条 UPDATE |
| 4 | POST /call 升 E 后若非超管运维拿不到权限 → 临时给 admin 直跑 | 🟢 |

**最坏剧本**：W5 末尾发现签名误拒了真实畅捷通推送 → 1 小时内回滚 + 修文档+
重新发；不阻塞 W5 主线（M2 + Architect 切换都不依赖 chanjet）。

---

## 5. 子任务包（P0-A ~ P0-D）

### 5.1 P0-A — RBAC 矩阵收口

**主线对应**：R0-1
**Owner**：Audit Agent
**依赖**：无（独立子包）
**实施 wave**：W5 第 1-2 天

| Step | 任务 | 类型 |
|---|---|---|
| A1 | 删除 `modules/permissions/permission-sets.controller.ts` 的 controller 注册 | service |
| A2 | `app.module.ts` 调模块顺序 / 显式去重 | service |
| A3 | `PermissionsController` 12 端点加 `@RequireMenu('MENU_SYS_ROLE', V/E)` | service |
| A4 | `PermissionSetsController`（保留版）8 端点同上 | service |
| A5 | OperationLogInterceptor 白名单含 sys_audit_log 写入 | service |
| A6 | 单测 + g5c 验非超管 403 | test |
| A7 | PR + Audit 自审 | review |

**预计工作量**：**0.5-1 工作日**

### 5.2 P0-B — Notification 接口收口

**主线对应**：R0-2
**Owner**：Audit Agent
**依赖**：与 P0-C 共享 jwt-config.ts（按 P0-C 先合后跟）
**实施 wave**：W5 第 2-3 天

| Step | 任务 | 类型 |
|---|---|---|
| B1 | `NotificationConfigController` 加 `@UseGuards(MenuGuard, DataScopeGuard)` + 类级 `@RequireMenu('MENU_SYS_NOTIFY','V')` | service |
| B2 | 写端点（POST/PUT/DELETE/test/retry）覆写 `'E'` | service |
| B3 | `PresenceController` 加 `@UseGuards(MenuGuard, DataScopeGuard)` | service |
| B4 | `NotificationStreamController` invalid token 改抛 401（不再 200 + 'unauthorized'）| service |
| B5 | （若 sys_menu 无 MENU_SYS_NOTIFY）TS 迁移 seed | migration |
| B6 | `menu-registry.service.ts` FALLBACK 列表加 `MENU_SYS_NOTIFY` | service |
| B7 | check-public-controllers.mjs 验 notification 模块仅 1 个 @Public | verify |
| B8 | curl 匿名 401 / 持 V 200 验证 | test |

**预计工作量**：**0.5-1 工作日**

### 5.3 P0-C — Auth Bypass + JWT 单一源

**主线对应**：R0-3
**Owner**：Audit Agent
**依赖**：无（其它 P0 包共享 jwt-config.ts）
**实施 wave**：W5 第 1-3 天（与 P0-A 并行）

| Step | 任务 | 类型 |
|---|---|---|
| C1 | 新建 `apps/api/src/auth/jwt-config.ts` 单一源（JWT_SECRET / FALLBACK 常量） | service |
| C2 | 4 处文件改 import：auth.service / jwt.strategy / phoenix-jwt.guard / health.controller / notification-stream.controller | service |
| C3 | 拆 `AuthService.login` 与 `loginInternal`（私有，仅 impersonate）| service |
| C4 | `impersonate` 加超管→超管禁令 + 测试 | service |
| C5 | `cookie_token` 补 `perms_version` / `impersonatedBy` / `roleType` | service |
| C6 | `main.ts` 启动期加 `NODE_ENV==='production' && !JWT_SECRET` 显式 throw | service |
| C7 | `health.controller` JWT fingerprint 脱敏（4 字符尾改 hash 前 6 字节）| service |
| C8 | 单测 + grep 验单一源 + g5c | test |

**预计工作量**：**1.5-2 工作日**（含调试 + 单测）

### 5.4 P0-D — Chanjet 签名 + 接口安全

**主线对应**：R0-4
**Owner**：Audit Agent
**依赖**：参考畅捷通官方 sign 算法文档（已在 `scripts/chanjet-probe.mjs` / `docs/chanjet-zplus-api-catalog.md` 有部分线索）
**实施 wave**：W5 第 3-5 天（最复杂，最后做）

| Step | 任务 | 类型 |
|---|---|---|
| D1 | 实现 `verifyCallbackSignature(headers, body)`（按畅捷通官方 sign / nonce / timestamp 算法）| service |
| D2 | `POST /api/chanjet/callback` 进 setCertificate 前必校签名；失败 log warn + 200 不消费 | service |
| D3 | `GET /api/chanjet/callback` 同上（query 字段也走签名校验）| service |
| D4 | `deepGet` 收窄到 `bizContent` / `data` / `result` 白名单子树 | service |
| D5 | `chanjet-auth.service.setCertificate` 加 "新值 != 已存值 → warn + 拒"（首次允许）| service |
| D6 | `POST /api/chanjet/call` `@RequireMenu` 升 `'E'` | service |
| D7 | `decryptMessage` 按 msgType 决定密钥（取消 fallback） | service |
| D8 | `sys_audit_log` 记 CHANJET_* 动作 | service |
| D9 | 实测：本地 mock 攻击 + 畅捷通 staging 真推送 | test |
| D10 | nginx 配 IP 白名单建议（部署文档，本批不实施）| docs |

**预计工作量**：**2-3 工作日**（签名实现 + 真实畅捷通联调风险）

---

## 6. 总览：工作量、风险降低、生产评分

### 6.1 预计工作量

| 包 | 工作日 | 关键路径 |
|---|---|---|
| P0-A RBAC 矩阵收口 | 0.5-1 | 独立 |
| P0-B Notification 接口收口 | 0.5-1 | 依赖 C1 jwt-config |
| P0-C Auth Bypass + JWT 单一源 | 1.5-2 | 阻塞 P0-B 部分 step |
| P0-D Chanjet 签名 + 接口安全 | 2-3 | 最复杂；与畅捷通 staging 联调可能延期 |
| **总计** | **5-7 工作日** | — |

**并行收益**：P0-A 与 P0-C 完全并行；P0-B 在 C1 / C2 完成后启动；P0-D 最后单独冲刺。**真实串行最少 4 个工作日（A/C 1.5 + B 1 + D 2-3）**。

### 6.2 预计风险降低分值

按 100 分制安全风险评分：

| 风险 | W5 前评分 | W5 后评分 | 降低 |
|---|---|---|---|
| R0-1 RBAC 任意改写 | -15 | 0 | +15 |
| R0-2 Notification 公开 | -12 | 0 | +12 |
| R0-3 Auth Bypass | -10 | -2（cookie_token 部分仍需 W6+ Next.js 配合）| +8 |
| R0-4 Chanjet 接口劫持 | -15 | -2（IP 白名单部分留 W6）| +13 |
| **R0 合计** | **-52** | **-4** | **+48** |

W4_REVIEW + WAVE1_REVIEW 给 W5 前生产环境风险评级估计在 50-55 分（百分制）；
W5-P0 4 子包合入后可达 **+45 ~ +50 净提升**，叠加 R1/R2 治理后逼近 90 分。

### 6.3 预计生产评分提升

按 100 分制综合生产稳态评分（可用性 / 安全 / 合规 / 治理 / 监控五维）：

| 维度 | W5 前 | W5 后 | 提升 |
|---|---|---|---|
| **可用性**（无 P0 单点） | 70 | 75 | +5（R0-2 阻断钓鱼链路降低事故率） |
| **安全**（权限边界） | 50 | 80 | +30（R0-1/R0-3 直接） |
| **合规**（审计可追溯） | 65 | 78 | +13（4 子包均增 sys_audit_log） |
| **治理**（接口规范度） | 60 | 70 | +10（jwt-config 单一源 + check-public-controllers 红线） |
| **监控**（异常可见性） | 55 | 65 | +10（OperationLogInterceptor + chanjet warn metrics） |
| **综合**（加权平均） | **60** | **75** | **+15 ~ +18** |

总评：**W5-P0 落地 = 安全评分跨入 80 分线 + 综合生产评分跨入 75 分线**。

---

## 7. 跨域协同与合并

### 7.1 与 W5 主线（M2/M3 + ERP/Finance）的关系

| 主线 | 与 W5-P0 关系 |
|---|---|
| M2 biz_projects 扩列 + 数据回填 | 完全并行；P0 不动 biz_projects |
| M3 SITE 子类化迁移 | 完全并行；P0 不动主数据 |
| ERP isAdmin 正则修复（WAVE1 C-1）| 与 P0-C 共享 hasPerm util；建议 ERP 修复合入后再合 P0-C |
| ERP E1/E2 + Finance F6 | 完全独立；P0 不影响 |

### 7.2 合并顺序建议

```
1. ERP isAdmin 正则修复 → main (WAVE1 cond)
2. P0-A RBAC 矩阵收口 → main (W5 第 1-2 天)
3. P0-C Auth Bypass + jwt-config 单一源 → main (W5 第 1-3 天，与 A 并行)
4. P0-B Notification 收口 → main (W5 第 2-3 天，依赖 C 已合)
5. M2/M3 service 改造 → main (并行)
6. P0-D Chanjet 签名 + 接口安全 → main (W5 第 3-5 天)
7. W5 末尾 Audit 总验收 (本批 P0 + M2 + M3 共同跑漂移 / RBAC / public-controllers)
```

每批 PR 单独 tag：`v3-w5-p0-<sub>-YYYYMMDD`。

### 7.3 回滚策略（汇总）

| 子包 | 回滚成本 | 数据损失 |
|---|---|---|
| P0-A | 🟢 5 分钟 revert + 0 数据损失 | 无 |
| P0-B | 🟢 同上（含 menu seed 迁移 revert）| 无 |
| P0-C | 🟢 同上；JWT 算法不变；已发 token 仍验 | 无 |
| P0-D | 🟡 签名误拒可能影响 1-2 天 AR sync；需准备应急 cert 手工恢复 SQL | 无（cert 在 sys_audit_log 可回查）|

任一回滚都不阻塞 M2 / M3 主线；不破坏 W4 / W1 已合入工作。

---

## 8. 验收门禁（W5-P0 总）

```bash
# 通用
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/web && ./node_modules/.bin/tsc --noEmit
pnpm lint
bash scripts/check-entity-drift-baseline.sh .github/entity-drift-baseline.txt
node scripts/check-nullable-in-unique.js
bash scripts/check-ts-migration-down.sh apps/api/src/database/migrations
bash scripts/check-ts-migration-no-data-dml.sh apps/api/src/database/migrations

# W5-P0 专项
# 1) 公开端点扫描(W5 新交付)
node scripts/check-public-controllers.mjs apps/api/src
# 期望: 仅 chanjet/callback(GET+POST) + notification/stream + health + auth/login(若标 Public) 命中

# 2) RBAC 巡检(扩展非超管 403)
NON_ADMIN_USER=test_cashier NON_ADMIN_PASS=Test@1234 bash scripts/g5c-rbac-audit.sh

# 3) JWT FALLBACK 字面量唯一
grep -rn "DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD" apps/api/src/ | wc -l
# 期望: 1

# 4) bypassPassword 仅 private
grep -rn "bypassPassword" apps/api/src/auth/auth.service.ts | grep -vE "private|//"
# 期望: 0

# 5) 漂移基线对账(P0 不动主数据)
node scripts/check-master-data-references.mjs --json > /tmp/mdr-w5-p0-post.json
diff /tmp/mdr-w5-pre.json /tmp/mdr-w5-p0-post.json
# 期望: 仅 W5 主线 M2/M3 引入的变化(P0 不引入)

# 6) sys_audit_log 写入新增类型
psql -c "SELECT action, COUNT(*) FROM sys_audit_log
          WHERE created_at > now() - interval '1 hour'
          GROUP BY action;"
# 期望: 含 IMPERSONATE / PERM_CHANGE / CHANJET_* / NOTIFY_CONFIG_CHANGE
```

---

## 9. 与上游文档一致性

| 上游 | 一致性 |
|---|---|
| W5_READINESS_REVIEW §3 权限治理 42/100 + §6 TOP 10 #1~#4 + §12.1 R-1 + §8.4 W5-AU5/AU7 | ✅ 本文件 P0-A ~ P0-D 工程化展开正是 W5_READINESS R-1 条件的实施；AU7（jwt-config 抽）在 P0-C C1 |
| AUDIT_INTEGRATION_AGENT_AUDIT §0 / §1 / §3 / §4 / §5 | ✅ R0-1~R0-4 风险定义完全继承；本文件是工程化展开 |
| MULTI_AGENT_PHASE2_PLAN §2.1 Audit Wave A1-A4 | ✅ P0-A=A1+A3 / P0-B=A1+A6 部分 / P0-C=A2+A4 / P0-D=A3 |
| WAVE1_ACCEPTANCE_REVIEW §5.1 (isAdmin 正则) | ✅ 不重复但联动（ERP 已自修复 commit 4ff066b，W5-P0 不替它）|
| M1 §10 ROLE + §11.5 DataScope | ✅ P0-A 严格按 MENU_SYS_ROLE 权限；C-2 算法不动 |
| M2 §7 跨域协同 | ✅ P0 不触 biz_projects 任何字段 |
| CLAUDE.md §0.6 好业财铁律 | ✅ P0-D 不连接 fin_ar_invoices 与 chanjet_ar_snapshot |
| PROJECT_COMMAND_CENTER §3 / §7 | ✅ Audit Agent 责任域 100% 自治；不触其它 Agent 主数据 |

---

**W5-P0 安全治理生效日期：2026-06-20。等待 Audit 自审 + 用户拍板 4 子包
启动顺序后正式实施。**
