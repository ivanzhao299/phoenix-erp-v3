# 新标签页包装作业台会话修复（2026-08-22）

## 会话链全景

### 登录写入

- PC 登录在 `apps/web/src/app/login/page.tsx:282-308` 调用 `/api/auth/login`，把完整 `token`、用户资料和瘦身 `cookie_token` 交给 `AuthContext.login`。
- `apps/web/src/contexts/AuthContext.tsx:176-193` 同时写 `sessionStorage` 与 `localStorage` 的 `phoenix_token` / `phoenix_user`，瘦身 token 同时写两处 `phoenix_cookie_token`，并写 `phoenix_access_token` cookie。
- cookie 由 `apps/web/src/lib/auth-session.ts:6-21` 从 JWT `exp` 计算剩余秒数，属性为 `path=/; max-age=<exp-now>; SameSite=Lax`。它是 JS cookie，不能设置 HttpOnly；当前代码也未设置 Secure/Domain。maxAge 与实际 JWT exp 精确对齐，而非另设固定寿命。
- API 在 `apps/api/src/auth/auth.service.ts:297-315` 用同一 `JWT_EXPIRES_IN` 同时签发完整 token 与瘦身 cookie token。源码默认值为 7 天（`apps/api/src/auth/auth.service.ts:9-16`），可被生产环境变量覆盖；所谓“约 8 小时”若为生产实值，也会直接体现在 exp 中并被 cookie 沿用。
- 客户端恢复在 `apps/web/src/contexts/AuthContext.tsx:39-70,126-140` 优先 sessionStorage、再 fallback localStorage，并回填当前标签的 sessionStorage。此恢复只会在 middleware 已允许首个请求后运行。

### Middleware 裁决

- `apps/web/src/middleware.ts:137-165` 只读取 cookie `phoenix_access_token`。缺失即登录；存在时结构解码 JWT，并用 10 秒时钟偏差检查 exp。Edge 层不验签，签名仍由 API `JwtAuthGuard` 验证，安全强度没有降低。
- 修复后，无 token、不可解析、已过期三条分支都把完整 `pathname + search` 写入 `return`（`apps/web/src/middleware.ts:96-98,142-165`），`reason=expired` 风格保留。`URLSearchParams.set` 负责正确编码。
- `/terminal/*` 的现有路由守卫判据是“已认证”；包装页面的 `MENU_PKG_MGR:E` 等仍是页面/动作权限。`/settings/system-init` 与 `/settings/security` 是 middleware 明确的管理员专属路由。

### 登录后落点

- 修复前，PC 登录对管理员先写死 `/dashboard`，terminal 角色先写死角色首页，只有普通角色的部分 return 会被采用，因此用户虽带着 `return=/terminal/packaging/dashboard` 到登录页，目标仍被落点分支丢弃。
- 修复后 `apps/web/src/app/login/page.tsx:313-335` 和移动登录统一调用 `apps/web/src/lib/auth-navigation.ts:7-42`：安全且有权的 return 优先，失败才回落原角色落点。
- 白名单只接受单斜杠开头且经 URL 规范化后仍同源的站内路径；拒绝 `https://...`、`//host/...`、反斜杠 host、非路径协议和不可解析输入，防止开放重定向。管理员专属路径继续核对 ROLE_ADMIN / ROLE_SYSOPS / `*`，dashboard 要求 `MENU_DASHBOARD:V`；terminal 依照现有实际路由守卫，仅要求认证，动作权限不变。

## 根因与复现推演

最可能根因是两项叠加：

1. 初次登录写入本身完整且 cookie 与 JWT exp 对齐；问题发生在续签。修复前 `AuthContext` 和 `api-client` 的 refresh 只更新当前标签 sessionStorage，未更新 localStorage 和瘦身 cookie。于是后台标签继续用已续签 token 正常调用 API，但服务端首导航看到的 cookie 仍旧且可能已过期，新标签必被送登录。这与线上“旧标签仍活、新标签跳登录”完全吻合。
2. middleware 在当前基线其实已经携带 pathname；“目标丢失”发生在登录成功后的角色落点逻辑。管理员 return 被 `/dashboard` 覆盖，正好吻合线上第二步。

备选解释：cookie 在登录时因浏览器策略被拒、被手动清理，或旧版本曾把超 4KB 完整 JWT 写 cookie，也会造成相同首导航结果。当前登录使用瘦身 cookie token且 SameSite=Lax/path=/，正常同站新标签不会因为 sessionStorage 隔离而丢 cookie；因此在 cookie 正常且未过期时，middleware 没有额外把 terminal 路径弹回登录的分支。

修复后的续签在 `apps/web/src/lib/auth-session.ts:42-68` 并行续签完整 token 与瘦身 token，两者成功后才一起提交到 sessionStorage、localStorage 和 cookie。这样不需要 API 改动，也避免将可能超 4KB 的完整 JWT 塞入 cookie。

遗留旧会话说明：若部署前已形成“完整 token 已续签、瘦身 cookie 已过期超过 refresh 的 5 分钟宽限”的分裂状态，客户端不能安全重签瘦身 token，也不会退回写可能超 4KB 的完整 token；该会话会再登录一次，但 B 修复保证回原目标。此次登录后以及后续续签均保持三处一致。

## 测试与验证

- 新增 `auth-navigation.test.ts`：覆盖站内路径、带 query、中文路径、外链/双斜杠/协议拒绝、有效有权 return 优先、管理员专属路径无权回落。
- 新增 `auth-session.test.ts`：覆盖 cookie maxAge 与 JWT exp 对齐，以及刷新后完整/瘦身 token 同步写入两种 storage 与 cookie。
- Web TypeScript：`cd apps/web && ./node_modules/.bin/tsc --noEmit`，0 errors。
- Web Vitest 全量：75 files、425 tests 全绿；包含 terminal-navigation、flock refresh、packaging workbench/navigation 等既有回归。
- Production build：`pnpm --filter web build` 成功，231 个静态页面完成生成。
- Playwright `terminal-exit-navigation.spec.ts` 已实际尝试，3 条均在浏览器启动前被宿主缺少 `libnspr4.so` 阻断（exit 127），没有进入页面逻辑；当前 3000/3100 也无可用真实栈和凭据。因此未伪报浏览器 PASS，复现以以上代码证据链与纯函数回归替代。

## 部署验证

- 实现 commit：`96a5f5a3`；合并 main 并 push 后 revision：`8bd2f74841a5ea3e37a50de6787feebc0c8f0648`。
- main CI 全绿：Web Vitest run `32560663556`、AI Delivery Security `32560663561`、AI Delivery Build `32560663642`、Build & Deploy CI `32560663698`。最后一条包含 API/Web typecheck、build 及 system/breeding/packaging/wms/finance 回归，并成功构建推送 web 镜像；push 事件没有生产部署。
- 显式生产部署 run `32560973016`：workflow_dispatch 输入 `mode=web`、`skip_deploy=false`、`approve_production=true`，目标 SHA `8bd2f748...`；Type-check & Regression、Build & Push web、Deploy · web 全部成功，API image job按模式跳过实际构建，未执行生产数据库迁移。
- 只读生产镜像审计 run `32561221325` 成功：`DEPLOY_CHECKOUT_SHA=8bd2f748...`；运行中 web 容器 OCI label `org.opencontainers.image.revision=8bd2f748...`，checkout 与实际容器镜像 revision 一致。审计仅执行 git/docker inspect 与容器内版本读取，无生产写入。

## 用户侧复核步骤

1. 登录管理后台，正常操作并跨过一次 token 静默续签窗口后，从侧边栏新标签打开“包装作业台”；应直接进入 `/terminal/packaging/dashboard`，不出现登录页。
2. 清除 `phoenix_access_token` cookie（保留测试账号可重新登录），直接打开带 query 的受保护页；应到 `/login?return=...`，登录后完整回到原路径及 query。
3. 管理员从登录页以 `return=/terminal/packaging/dashboard` 登录，应回包装作业台而非经营仪表盘。
4. 用普通账号构造 `return=https://example.com`、`return=//example.com` 或管理员专属 `/settings/security`；应回角色默认首页，不得外跳或越权。

## 第三轮：复现与真正根因

### 生产日志证据

- 生产只读审计 run `32562500691` 覆盖近 6 小时，确认用户后台标签仍持续成功请求 `GET/PUT /api/crud/brd_flocks`（HTTP 200），排除“整个浏览器会话已经失活”。
- 定向只读审计 run `32562555470` 复用了同一 SSH 安全模式，只增加 `docker logs` 与 nginx access log 的筛选，不写数据库、不重启服务。`2026-08-22 15:32:51 +0800` 首次请求 `/terminal/packaging/dashboard` 后，紧接着出现 `/login?return=%2Fterminal...`，**没有 `reason=expired`**；`15:33:18` 登录 200 后，`15:33:24` 再开 terminal，下一秒仍出现同样的无 reason 登录 URL。`16:20:23` 后台还成功 refresh，`16:20:34` 再开 terminal，仍在下一秒落登录。
- 该形态不是 middleware 的过期/解析失败分支：这两条分支都会带 `reason=expired`。顶层 terminal 文档请求已经 200，随后客户端 RSC 请求才进入登录页，说明 middleware cookie 实际存在且可解析，客户端 hydration 后又主动判成未登录。

### 真实浏览器复现证据

- 本地使用 production build、真实 Nest API、PostgreSQL 16 和开发专用真实登录入口（`admin/admin123`，API 正常签发 8h 完整 JWT 与 slim JWT），Chromium 运行于官方 Playwright `v1.62.1-noble` 容器。没有 mock token，也没有手工注入 storage/cookie。
- 修复前新增回归 `e2e/terminal-newtab-session.spec.ts`：登录响应 200；`phoenix_access_token` 前缀为 `eyJhbGciOiJI`、共 3 段；session/local 的 `phoenix_token` 和 `phoenix_cookie_token` 四项均存在。`context.newPage()` 后 local token 仍可见，但最终 URL 是 `/login?return=%2Fterminal%2Fpackaging%2Fdashboard`，用例失败，症状完成真实复现。
- 修复后以同一 production build/API/浏览器重跑：最终 URL 保持 `/terminal/packaging/dashboard`，1/1 passed（1.8s）。

### 真正根因与修复

`AuthContext.readStoredAuth()` 的 session 版本迁移分支是断点。新标签拥有空的 sessionStorage（部分浏览器也可能复制一份旧 sessionStorage），但共享 localStorage。代码发现 `phoenix_session_version !== v6` 后清理 session、写入 v6，随后立即 `return { user: null, token: null }`，所以同一次 mount 永远到不了紧接着的 localStorage fallback。TerminalLayout 在 hydration 后看到 `loading=false && user=null`，主动执行 `router.replace('/login?return=...)`。这也解释了生产日志中“terminal 顶层请求 200、下一次 RSC 才到登录”以及“登录后从原后台标签再次打开仍重复失败”的矛盾。

修复仅移除该提前 return：版本不一致时仍清理当前标签的旧 session 数据，但在同一次恢复中继续读取共享 localStorage、回填 sessionStorage，再由既有恢复逻辑重写 middleware cookie。JWT 校验、SameSite、cookie path、middleware 分流与 return 白名单均未放宽。

### 写入—消费对齐矩阵

| 路径 | 完整 token | slim token | cookie | 消费方/结果 |
|---|---|---|---|---|
| PC 登录 | session + local | session + local | `phoenix_access_token` | API Bearer、middleware、新标签恢复 |
| 移动登录 | session + local | session + local | `phoenix_access_token` | 移动 API、middleware、新标签恢复 |
| 静默续签 | session + local 原子更新 | session + local 原子更新 | 同步更新 | `api-client`、`packaging-api`、AuthContext |
| storage 恢复 | local → 当前标签 session | local → 当前标签 session/cookie 来源 | 同步重写 | 本轮修复保证首次 mount 不再提前退出 |
| middleware | 不读取 | 不直接读取 storage | 只读 `phoenix_access_token` | `/mobile`、`/terminal`、admin/V2 守卫 |
| 客户端 API | 主要读 `phoenix_token` | 不用于 API 鉴权 | 不用于 Bearer | 完整 permissions 保持不变 |

### 为什么上两轮没修好

第一轮只改变了入口行为；第二轮依据代码推演，把真实问题误归因到续签分裂，并补了 return 落点。两轮都没有运行“真实登录 → 新 page → terminal”的浏览器用例，因而遗漏了 hydration 阶段的 session 版本提前 return。第二轮单测只验证刷新写入与纯函数导航，无法覆盖 AuthProvider 首次 mount 和 TerminalLayout 的组合。本轮生产请求时序与真实浏览器失败先共同复现，才修改一行控制流，并把该链路保留为 E2E 回归。

### 第三轮验证与部署

- 本地 API/Web `tsc --noEmit` 均 0 errors；Web Vitest 75 files / 425 tests 全绿；production build 231 pages 成功；真实登录 Playwright 新标签回归 1/1 passed。
- PR `#56` 合并为 main revision `943f9bf227ef112443afbcc2f08c899b9eaf149b`。main CI：Security `32563042659`、Vitest `32563042605`、Build `32563042623`、Build & Deploy CI `32563042572` 全绿；后者包含 API/Web typecheck、迁移门禁、entity drift、system/breeding/packaging/wms/finance regression 与 web 镜像构建。
- 显式 web 部署 run `32563346192` 成功，`Deploy · web` 完成；API 镜像构建按 web 模式跳过，未运行生产数据库写入。
- 部署后生产只读审计 run `32563556439` 成功：`DEPLOY_CHECKOUT_SHA=943f9bf...`，运行 web 容器 `org.opencontainers.image.revision=943f9bf...`，启动时间为本次部署窗口；checkout 与 web 容器 revision 一致。
