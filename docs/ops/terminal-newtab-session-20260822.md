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

待提交、合并 main、push、CI、显式 `mode=web / approve_production=true` 部署完成后补写 commit、workflow run 与只读 production revision。

## 用户侧复核步骤

1. 登录管理后台，正常操作并跨过一次 token 静默续签窗口后，从侧边栏新标签打开“包装作业台”；应直接进入 `/terminal/packaging/dashboard`，不出现登录页。
2. 清除 `phoenix_access_token` cookie（保留测试账号可重新登录），直接打开带 query 的受保护页；应到 `/login?return=...`，登录后完整回到原路径及 query。
3. 管理员从登录页以 `return=/terminal/packaging/dashboard` 登录，应回包装作业台而非经营仪表盘。
4. 用普通账号构造 `return=https://example.com`、`return=//example.com` 或管理员专属 `/settings/security`；应回角色默认首页，不得外跳或越权。
