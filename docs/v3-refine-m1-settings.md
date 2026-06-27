# V3 功能精修 · M1 系统设置 2026-06-15

> 第三代代码精修第 1 模块。审计旧代码漂移 + 权限真值 + 浏览器渲染验证。

## 审计结论：M1 整体健康

派 Explore 代理静态扫描 + 逐项人工核实（代理 14 项发现中 **2 项为误判**，已纠正）：

| 类别 | 发现 | 核实结果 |
|---|---|---|
| 死路由 | `/settings/system-init` 卡片 | ✅ 真死链接（无页面）→ 改指 `/pilot-run` |
| 重复卡片 | 设置主页"权限管理"卡 | ✅ 与"角色权限"卡重复、走废弃重定向 → 删除 |
| 死目录 | `apps/api/src/modules/organization/` | ✅ 空目录未注册 → 删 |
| ~~死 API~~ | ~~`/api/system/users`~~ | ❌ 代理误判：`profile` 改密码仍在用，保留 |
| ~~孤儿页~~ | ~~`settings/dict`~~ | ❌ 代理误判：与字典中心联动(3处引用)，保留 |
| 坏 import / 加载隐患 | — | ✅ 0 |

## 权限真值（生产只读 API）

- `MENU_SETTINGS_USER`(用户管理) 有权角色：集团超级管理员 + 人力资源经理 ✓
- `MENU_SETTINGS_IT`(角色/权限/安全) 有权角色：仅集团超级管理员 ✓
- 结论：普通员工（店长/采购/财务）无设置访问权，**权限边界正确**。

## 浏览器渲染（admin 注入登录态）

- 通过 API 取 admin token + cookie 注入 sessionStorage/document.cookie（不输密码），打开 `/settings`。
- 结果：**零控制台报错**，四组卡片布局完整渲染，侧边栏 16 个模块组正常。
- 截图存证：印证生产端仍有重复"权限管理"卡（修复前），佐证清理必要。

## 修复

1. `settings/page.tsx`：删除重复"权限管理"卡；"系统初始化"死链接 → `/pilot-run`。
2. 删空目录 `apps/api/src/modules/organization/`。
3. Web tsc 0 error。

## 浏览器验证基建（后续模块复用）
admin 登录态注入法：`fetch(/api/auth/login)` → set sessionStorage(phoenix_token/user/session_version=v6) + `document.cookie=phoenix_access_token=<cookie_token>`（中间件按此 cookie 做 SSR 门控）。
