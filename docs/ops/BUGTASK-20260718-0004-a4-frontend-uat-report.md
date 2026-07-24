# BUGTASK-20260718-0004 A4 前端修复与 UAT 报告

## 结论

**PASS WITH CONDITIONS**

本地前端门控修复与专项回归验证通过，但不代表生产问题已解决。CI/CD、
生产环境语义冒烟及业务验收仍为关闭问题的必要条件。

## 来源问题

- Bug：`BUG-20260718-0004`
- Task：`BUGTASK-20260718-0004`
- 业务页面：`/mobile/henhouse`
- 关联排查页：`/settings/users`（确认 `linhong` 拥有“养殖场长”角色）
- 现象：养殖场长进入移动端鸡舍管理后被识别为只读，无法新建本场鸡舍。

任务附件未同步到本地。本次修复依据任务合同中的页面快照、角色证据及可复现的
前端权限输入组合完成；附件视觉复核留作生产验收条件。

## 根因

`getMobileAccessLevel` 先读取 JWT 菜单权限。只要权限快照存在，
`MENU_FARM_MASTER:V` 就直接返回 `read`，完全覆盖角色矩阵中
`ROLE_FARM_MGR -> henhouse.write` 的职责授权。

鸡舍移动端的既定语义是：菜单权限控制入口可见性，养殖场长角色允许维护本场数据，
最终数据边界仍由后端 DataScope 约束。原逻辑误把菜单查看动作同时当成了场长职责的
写入判定，因此合法场长被降级为只读。

## 改动文件

- `apps/web/src/lib/mobile-roles.ts`
  - 仅对 `henhouse` 增加受限合并规则：JWT 已允许查看且角色矩阵明确为场长写权限时，
    返回 `write`。
  - 无关菜单权限仍拒绝；非场长的 `V` 权限仍保持只读。
- `apps/web/src/__tests__/mobile-roles.test.ts`
  - 覆盖场长 + `MENU_FARM_MASTER:V` 可写。
  - 覆盖兽医 + `V` 仍只读、场长 + 无关权限仍拒绝。
- `apps/web/src/app/(mobile)/mobile/henhouse/page.tsx`
  - 将首次数据加载调度到 effect 后的任务，消除聚焦 lint 的同步 setState 告警；
    加载条件、请求和页面状态语义不变。
- `docs/ops/BUGTASK-20260718-0004-a4-frontend-uat-report.md`
  - 本任务证据与门禁报告。

## 状态与安全性

- RBAC：入口仍要求鸡舍相关菜单权限；无关权限快照不会回退穿透。
- DataScope：未改请求、组织绑定或后端范围控制；创建仍由系统自动绑定用户归属。
- 权限可见性：非场长只读行为和无权限跳转保持。
- 加载/空态/错误态：页面既有加载、空列表、校验错误、API 错误和重试文案未改。
- 附件 ACL：本页面不涉及附件，未作改动。
- 响应式：改动不涉及布局；移动端表单和列表保持原有 `100svh`、弹性布局及安全区。
  桌面宽度访问同一路由时使用相同组件与门控，不存在视口条件分支。

## 验证

- `cd apps/web && ./node_modules/.bin/vitest run src/__tests__/mobile-roles.test.ts`
  - PASS：1 个测试文件、30 项测试。
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS：0 errors。
- `cd apps/web && ./node_modules/.bin/eslint src/lib/mobile-roles.ts src/__tests__/mobile-roles.test.ts 'src/app/(mobile)/mobile/henhouse/page.tsx'`
  - PASS：0 errors、0 warnings。
- `cd apps/web && env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY NO_PROXY=localhost,127.0.0.1 ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000`
  - 环境条件：Codex 沙箱拒绝监听本地端口，返回
    `listen EPERM: operation not permitted 127.0.0.1:3000`。
- 桌面与移动行为：已完成静态响应式检查。权限结果不依赖视口；鸡舍页使用
  `100svh`、安全区 app bar、弹性纵向内容和全宽表单，在移动及桌面宽度共用同一
  门控与状态组件。由于沙箱端口限制，本轮未完成真实浏览器渲染，须由 CI/runner
  和生产语义冒烟补齐。

## 发布后条件

1. CI/CD 全部通过。
2. 使用 `linhong` 在生产环境重新登录以刷新 JWT，在移动视口验证能看到“新建本场鸡舍”。
3. 验证该账号只能看到并创建其 DataScope 内的本场鸡舍。
4. 使用非场长只读账号验证无新建入口；使用无鸡舍菜单权限账号验证无法进入。
5. 在桌面与移动视口复核加载、空态、接口错误展示。
6. 同步并核对原始截图，完成业务方验收后方可关闭 Bug。
