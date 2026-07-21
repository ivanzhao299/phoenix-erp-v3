# BUGTASK-20260721-0001 前端修复与 UAT 记录

- 来源问题：`BUG-20260721-0001`「作业台-分级，采集数量和剩余数量有问题」
- 受影响业务页：`/terminal/packaging/grading`（问题由 `/bug-reports` 提报）
- 技术结论：**PASS WITH CONDITIONS**
- 发布结论：**HOLD**

## 根因与修复

集蛋接口字段语义为：`total_qty` 是总采集数，`received_qty` 是扣除脏蛋、裂纹蛋后实际接收的可分级数。集蛋页已按该语义展示；分级页却把 `received_qty` 当成总采集数，再减一次 `dirty_qty` 和 `cracked_qty`，因此验收样例被错误计算为 `780 - 10 - 10 = 760`。

分级页现统一归一化接口数据：采集数取 `total_qty`，可分级/剩余上限直接取 `received_qty`，不再重复扣减。兼容旧响应：缺少净接收字段时才使用 `总数 - 脏蛋 - 裂纹蛋`。

验收样例现在为：总采集 `800`、脏蛋 `10`、裂纹蛋 `10`、可分级及初始剩余 `780`。

## 变更文件

- `apps/web/src/app/(terminal)/terminal/packaging/grading/page.tsx`
- `apps/web/src/lib/grading-source.ts`
- `apps/web/src/lib/grading-source.test.ts`
- `docs/ops/BUGTASK-20260721-0001-frontend-uat.md`

未修改 API、数据库、迁移、RBAC、DataScope、审计或附件 ACL。

## 验证结果

| 检查 | 结果 |
|---|---|
| `cd apps/web && ./node_modules/.bin/vitest run src/lib/grading-source.test.ts` | PASS，2/2 |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS，0 errors |
| `git diff --check` | PASS |
| `cd apps/web && next build` | 环境阻塞：Turbopack 拒绝指向沙箱文件系统根之外的 `apps/web/node_modules` 软链 |
| 800/10/10 数量回归 | PASS：采集 800，可分级/初始剩余 780 |
| 加载、空态、提交错误态 | PASS（相关状态和渲染分支未改动） |
| 权限可见性 | PASS（路由、菜单与权限代码未改动） |
| 桌面/移动布局静态复核 | PASS（未改 DOM/CSS，原终端三栏响应行为保持） |
| 真实浏览器 viewport smoke | 未执行：沙箱禁止监听端口，`next dev -p 3000` 返回 `listen EPERM 0.0.0.0:3000` |

## Gate

保持 **HOLD**。当前仅能判定 **PASS WITH CONDITIONS**：需在正常依赖目录环境完成 production build 与 CI/CD；之后以桌面和移动端 viewport 打开 `/terminal/packaging/grading`，使用真实权限账号复核 800/10/10 显示为采集 800、剩余 780；随后完成生产 smoke 与业务验收，才能声明问题已解决。
