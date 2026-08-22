# 编辑保存后列表陈旧修复与部署报告（2026-08-22）

## 1. 根因与取证结论

鸡群档案页的 `load()` 允许 mount GET 与保存后 GET 并发，两个响应都会无条件写入列表 state。旧请求晚返回时可覆盖新请求结果；原有乐观更新也会被随后返回的旧快照覆盖。这是与生产症状一致、代码上可证明存在的竞态窗口。

生产只读取证同时确认了另一项独立风险：部署目录 checkout 与运行 web 镜像曾漂移。修复前 checkout 为 `d5b8224f`，运行镜像 label revision 为 `fd14dea7`（2026-08-20），相对本次修复 main `c5bb3e9d` 落后 30 个 commit。上一轮报告依据 8 月 6 日部署日志推断“16 天未部署”，本次容器级证据将其更正为：运行镜像并非 8 月 6 日版本，但仍落后于 checkout 与 main。

## 2. 修复内容

### 2.1 共享列表加载

- 新增 `LatestRequestRunner`：同一 `useCrud` 实例发起新列表读取时 abort 前一请求，并以 generation 判定发布权。
- 旧调用即使晚完成，也只会得到当前最新请求的结果，避免既有调用方把 stale abort 的 `null` 映射成空列表。
- `useCrud` 的函数签名、返回结构、`fetchRecords` 别名与 `cache: 'no-store'` 保持不变；latest-request-wins 仅作用于 GET 列表读取，不取消 create/update/delete。
- `loading/error` 的旧请求不再覆盖当前请求状态，组件卸载时取消在途列表读取。

### 2.2 鸡群档案页

- 保存成功后取消乐观 map，以受控的最新服务端重拉作为唯一事实源；理由是同时保留乐观 state 与服务端重拉会重新形成两个竞争写源。
- 删除成功后的 `load()` 改为 `await load()`。
- `RightDrawer` 增加向后兼容的 `closeDisabled` 属性；flock 提交期间禁止关闭按钮、Escape、遮罩和侧边栏点击，避免旧提交关闭新抽屉。

### 2.3 独立编辑路由失效协议

- 新增 `saveAndReturn(listPath, router)`：保存成功后 `router.replace()` 到带一次性 `_refresh` token 的列表 URL。
- 新增 `useRefreshToken(load)`：列表挂载时执行一次 load，并用 `history.replaceState` 只清理 `_refresh`，保留其他 query/hash。
- 共享接入 `MasterDataFormPage` 与 `MasterDataRuntimePanel`，覆盖 customers、suppliers、products、bank-accounts、cash-accounts 五组独立编辑/列表页。
- 接入 settings users 与 roles 的详情保存和列表加载。保存成功后直接回列表，避免继续依赖隐含的 App Router 重挂载行为。
- 审计报告其余 B 类页面（采购 orders/payments/requests）已有独立路由返回后 mount/filter/page 明确加载，原审计判定为安全，本轮未扩大改造面；只读/监控详情与 workflow 设计器不是常规保存后返回列表场景，未硬改。

## 3. 测试与门禁

- Web TypeScript：`./node_modules/.bin/tsc --noEmit`，0 errors。
- Web Vitest：71 test files、402 tests 全绿；新增 latest-request-wins 乱序响应/abort 以及刷新 URL 生成、消费、replace 语义测试。
- 约束漂移：`node scripts/check-constraint-drift.js`，0 new drifts、0 warnings（1 条既有 allowlist）。
- `git diff --check`：通过。
- main CI：
  - CI/CD Build & Deploy（普通 push，仅构建）：run 32542056897，成功。
  - CI Web Unit Tests：run 32542056921，成功。
  - AI Delivery CI Build：run 32542056908，成功。
  - AI Delivery CI Security：run 32542056871，成功。

首次完整 Vitest 曾有 2 个旧源码断言失败：它们强制要求已被本轮有意移除的乐观 map，并精确匹配未带 `signal` 的 GET options。测试同步为新契约后全量复跑通过；没有带红灯进入部署。

## 4. 生产版本前后对照

| 阶段 | 只读取证 run | checkout SHA | web image revision | image digest |
|---|---:|---|---|---|
| 部署前 | 32542063737 | `d5b8224f` | `fd14dea7` | `sha256:3a87b1e3325b…d5490213` |
| 部署后 | 32542720006 | `c5bb3e9d` | `c5bb3e9d` | `sha256:66cfe0f7c236…dbea4c42c` |

只读取证 workflow 使用 production environment、runner 与 SSH 双重 UTC 时间窗校验、`set -euo pipefail`，只执行 `git rev-parse`、`docker compose images/ps`、`docker inspect` 和容器内文件读取，无 SQL、无生产写入。

显式 web 部署使用 `mode=web`、`skip_deploy=false`、`approve_production=true`，run 32542472117 成功；目标 SHA 为 `c5bb3e9d30274b864c109beaba2475385b142593`。部署后容器 label revision 与目标 SHA 完全一致。

## 5. 遗留（P3）

- 将遗留 breeding 页面从已 deprecated 的 `useCrud` 迁移到 `crudApi + CrudPage`，最终删除旧 hook。
- 为通用 `CrudPage/DataTable refreshKey` 契约补组件级测试，并逐步统一同页 CRUD 的 `onSaved/onDeleted` 模板。
- workflow 设计器、动态表单和采购详情动作需按业务状态机做交互复测，不应仅凭路由形态批量接入失效协议。
- 可在后续监控中增加“部署 checkout SHA 与运行容器 image revision 一致性”只读告警，防止再次出现仓库/容器漂移。
