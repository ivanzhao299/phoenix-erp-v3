# 鸡群档案保存后列表旧值根因报告（2026-08-22）

## 生产只读取证

- 审计 workflow：`Flock Refresh Production Readonly Audit`，run `32547331004`，UTC 窗口 `2026-08-21 22:00:00` 至 `2026-08-22 08:00:00`。
- 安全属性：runner 与 SSH 端双重 UTC 格式/先后校验；SSH 脚本启用 `set -euo pipefail`；PostgreSQL 同时启用 `default_transaction_read_only=on` 与 `BEGIN TRANSACTION READ ONLY`；未写生产数据库。
- `brd_flocks` 存在 `updated_at`。最近两行（编号已脱敏）分别在 `02:42:10Z`、`02:42:37Z` 更新，数据库实值为 `120`、`900`。这与用户复测时段一致，证明 PUT 已落库，排除“200 但写 0 行”。
- `docker compose ps -a` 仅有一个 API、一个 Web、一个 DB；Nginx 无 Phoenix upstream 轮询，排除多 API 实例。
- Web 镜像 revision 为 `3eb64c249c6e95f4fdce6b198e4809cdb3515bdc`；API 镜像 revision 为 `d5b8224fce22dc00bdfdf34a644c6acc071372dd`。存在发布版本偏斜，但两个 revision 间 `apps/api` 与 `docker-compose.yml` 无差异，不能解释 CRUD 读旧值。
- 公网 HTTPS `/api/crud/brd_flocks` 响应有 ETag，但没有 `Cache-Control`；仓库内 Nest、TypeORM、Redis、Next rewrite 和 Nginx 均无该 CRUD 路径的显式缓存或禁止缓存响应头。

## 根因

结论为 A：PUT 已落库，但通用 CRUD 的认证 GET 响应未声明不可缓存。在 Nginx → Next rewrite → NestJS 的多层链路上，响应携带 ETag 却缺少 `Cache-Control: no-store`，无法从服务端保证写后读一定绕过浏览器或中间缓存。前端请求的 `cache: 'no-store'` 只是客户端请求策略，不应作为服务端数据接口唯一的缓存正确性保证。

生产同时存在 Web/API revision 偏斜，是部署一致性风险；本次用 full 部署一并收口，但 API 两版本代码完全相同，因此不把它误报为本次数据旧值的代码根因。

## 修复

- `GET /api/crud/:table` 统一返回：
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`。
- 保留 Web 侧 `cache: 'no-store'`、LatestRequestRunner 和保存后 `await load()`，形成客户端与服务端双重写后读保证。
- 新增 API 回归测试读取 Nest 路由 metadata，防止未来移除不可缓存响应契约。

## 回归验证

- 回归测试先红：新增断言时 metadata 为 `undefined`，1 failed / 15 passed。
- 修复后：Generic CRUD controller Jest 16/16 passed。
- Web Vitest：71 files、402 tests passed。
- API TypeScript：0 errors。
- Web TypeScript：0 errors。
- `check-constraint-drift`：0 new drifts（1 条既有 allowlist）。

## 部署验证

- main commit：`942266845d4127f96b665cc72802b9b31b2ee721`。
- push CI：run `32547574598` 全绿；Type-check、DDL migration、entity drift、system/breeding/packaging/WMS/finance regression 和 API/Web 镜像构建均成功。
- 显式生产 full 部署：run `32547917777`，`approve_production=true`，成功。
- 部署后只读审计：run `32548211819`，生产 checkout、API 镜像与 Web 镜像 revision 均为 `942266845d4127f96b665cc72802b9b31b2ee721`；单实例拓扑保持不变。

## 用户侧复核

1. 打开鸡群档案，记下某批次当前存栏量。
2. 编辑为明显不同的数字并保存。
3. toast 出现后，不手动刷新页面，确认列表立即显示新值。
4. 再刷新页面，确认仍是相同新值。
5. 若仍异常，在浏览器 Network 中保存该次 PUT 与紧随其后的 GET 响应体及响应头。

## 第二轮取证（用户保存后 GET 到达性）

- 只读审计 workflow 新 run：`32548804093`，UTC 窗口 `2026-08-22 00:22:41` 至 `2026-08-22 03:22:41`，执行成功；生产 checkout、API 镜像与 Web 镜像仍为修复 revision `942266845d4127f96b665cc72802b9b31b2ee721`。
- 数据库只读快照显示三条近期更新：脱敏编号 `FK-…NTU` 于 `03:15:14.428Z` 更新为 `150`、`FK-…H4Y` 于 `03:16:12.478Z` 更新为 `900`、`FK-…M0Q` 于 `03:20:12.199Z` 更新为 `212`，证明该时段确有保存落库活动。
- 本轮 `nginx -T` 关键词输出显示目标 API 反代层存在 `proxy_pass http://127.0.0.1:3100` 且明确配置 `proxy_cache off`，未见启用 Nginx proxy cache 的证据。
- 但当前 `flock-refresh-readonly-audit.yml` 未包含 access-log 路径发现与日志读取命令，仅输出 `nginx -T` 的 `upstream/proxy_pass/proxy_cache` 关键词；因此 run 中没有 `PUT /api/crud/brd_flocks`、`GET /api/crud/brd_flocks`、来源 IP、响应字节数或 User-Agent 日志行，也没有完整 server 块。不能凭数据库 `updated_at` 推断保存后的 GET 是否到达 Nginx，亦不能核实 Nginx 前是否还有 CDN/上游代理。

结论为 **C：日志不足以下结论**。缺少同一三小时窗口内 Nginx access log 的完整 PUT/GET 行，以及完整 `nginx -T` 中目标 server/location 块；在补齐这些只读证据前，A（本机代理直接应答）与 B（GET 已到服务器）均不能成立。本轮未改生产、未改业务代码。

## 第三轮取证：PUT 请求体日志

- 只读审计 workflow run：`32549648645`，production environment，UTC 窗口 `2026-08-22 03:15:00` 至 `2026-08-22 03:25:00`，执行成功。runner 与 SSH 端均执行 UTC 格式、可解析性和起止先后双重校验，SSH 脚本启用 `set -euo pipefail`；本轮仅执行 `docker logs`、`grep`、`tail`、Nginx 配置/日志读取和数据库只读事务，未写生产、未重启容器。
- 目标鸡群在 `03:20:12.199590365Z` 到达 API 的原始日志如下（GitHub Actions 会将与 secret 值碰撞的时间片段显示为 `***`，纳秒时间与本轮 `--since/--until` UTC 窗口、数据库 `updated_at=2026-08-22T03:20:12.199Z` 相互印证）：

```text
2026-08-22T03:20:12.199590365Z [SVC Update START] table=brd_flocks pk=flock_no id=FK-MR8VGZS4M0Q body={"farm_code":"LPH_MENGSAI","farm_name":"孟赛蛋鸡场","source_farm":"SUP-VNSBM-001","house_code":"HOUSE_CS_02","breed_type":"科宝500","start_date":"2026-07-05T00:00:00.000Z","current_qty":212,"placement_age":1,"cost":1,"target_weeks":80,"status":"LAYING","elimination_date":"2027-07-05T00:00:00.000Z","peak_lay_rate":null,"feed_conversion_ratio":null}
2026-08-22T03:20:12.200650711Z [CRUD Update] ✅ success on attempt 0
```

- 同一 UTC 窗口内，`FK-MR8VGZS4M0Q` 的 PUT 请求体依次为：`03:16:16Z current_qty=208`、`03:17:47Z current_qty=207`、`03:18:09Z current_qty=209`、`03:19:18Z current_qty=210`、`03:20:12Z current_qty=212`；每笔均紧随 `success on attempt 0`。窗口内没有 `current_qty=213`，也没有 `failed`。
- Nginx access log 使用 `+0800`：`11:20:12 +0800`（即 `03:20:12Z`）记录 `PUT /api/crud/brd_flocks/flock_no/FK-MR8VGZS4M0Q` 返回 HTTP 200、响应 41 bytes，下一行同秒记录 `GET /api/crud/brd_flocks` 返回 HTTP 200、响应 1061 bytes。来源 IP 已在本文省略，日志未输出 Authorization/token 等请求头。
- 全量末 60 条还发现窗口之外 `03:40:48.102367319Z` 有一笔同鸡群 `current_qty=213`，并于 `03:40:48.103473755Z` `success on attempt 0`；Nginx 同样记录该 PUT 200 及随后 GET 200。这是原 `03:20` 事件后二十分钟的新写入，不能改变原事件请求体为 212 的事实，也不属于“03:20:12 之后还有 PUT 213 但失败/未到达”的 C 情形。

结论为 **A：03:20:12 的 PUT body 中 `current_qty=212`（不是用户声称输入的 213），请求到达 API 后成功落库；截至 `03:25:00Z` 没有其他 213 PUT 或失败 PUT。根因位于前端提交前的表单状态/绑定链路，不在数据库 UPDATE 或服务端持久化。** 此结论取代第二轮因日志不足暂定的 C。

## 第三轮：本地浏览器复现与最终修复

### 真实浏览器复现

- 本地用 Compose PostgreSQL 16 初始化空库并执行冻结 SQL 迁移链，API 以开发登录模式连接本地库；仅在本地插入 `PW-FARM-001`、`PW-HOUSE-001`、`PW-FLOCK-001` 测试数据。
- 仓库原无 Playwright 基建，本轮新增最小配置与鸡群刷新用例。浏览器为 Playwright Chromium 对应的 Chrome for Testing `151.0.7922.34`。
- 宿主缺少 `libnspr4.so` 且无 sudo 权限，改用官方 `mcr.microsoft.com/playwright:v1.62.1-noble` 容器运行浏览器；未伪造宿主执行结果。
- dev 首轮因容器访问 `host.docker.internal` 不在 `allowedDevOrigins`，Turbopack HMR WebSocket 被 Next 拒绝，页面无法作为可靠水合环境，因此不计作业务复现。
- 停止 dev 后执行 `pnpm build`，再用 production server 重测。用例完整执行登录 → `/breeding/flock` → 编辑 `150` 为 `900` → 保存，并监听 PUT 后的 `GET /api/crud/brd_flocks`。
- 红灯证据：GET 响应体含 `current_qty=900`，toast 已出现，但表格 10 秒内始终为 `150羽`。这与生产现象完全一致。

### 最终根因

根因不是 CRUD 请求、React state、DataTable 或 Service Worker，而是 `LanguageContext` 中用于翻译硬编码中文的全局 `MutationObserver`（`HardcodedChineseHydrator`）。它首次看到文本节点 `150羽` 时将其永久保存为“中文原文”。React 随后已把该节点提交为 `900羽`，observer 收到 `characterData` 变更后又在中文模式下写回保存的 `150羽`。

活体调试同时确认：页面 state、DataTable props、目标 `td` 的 React Fiber `memoizedProps.children` 均为 `900羽`，Fiber alternate 为 `150羽`，但 DOM `textContent` 为 `150羽`。说明 React 已完成新值提交，DOM 随后被 React 之外的 observer 篡改；React 之后又因 Fiber 已是 900 而不会重复写 DOM。“当前共 0 个鸡群批次”等含中文的动态文本也受同一缺陷影响。

### 修复与回归

- 中文作为源语言时，MutationObserver 发现 React 写入的新中文动态文本或属性后，更新 WeakMap 中的源值并立即返回，不再恢复首次观察到的旧值。
- 非中文语言仍使用最新中文源值执行硬编码文案翻译；切回中文时仍可从 WeakMap 恢复源文案。
- Playwright 回归同时断言：保存后的 GET 含新数量、toast 出现、同一页面不刷新即可看到新数量，并收集未捕获浏览器异常。
- 同一 production build、同一 Chrome 151 用例修复后通过：`1 passed (3.7s)`。
- Web production build 成功；Web TypeScript `0 errors`；Vitest `71 files / 402 tests passed`。
- `sw.js` 已完整核对：同源 `/api/*` GET 仅 `fetch(req)`，失败返回 503，不读写 Cache；静态 stale-while-revalidate 不覆盖 API，因此不是本次根因。

### CI、部署与只读核实

- 修复提交 `b6cb71c3`，workspace lockfile 补齐提交 `4f6a67f1`；均已合入并推送 main。首个 SHA 的 CI 正确发现根 lockfile 未同步并红灯，补齐后本地 frozen install 通过。
- 最终 SHA `4f6a67f193e39a0a32e7a69caeab088c35044599` 的四条 push CI 全绿：主 CI/CD `32550677434`、Web Unit Tests `32550677303`、AI Delivery CI Build `32550677315`、AI Delivery CI Security `32550677329`。
- 显式生产部署 workflow `32551007319` 使用 `mode=web`、`skip_deploy=false`、`approve_production=true`，成功；API 镜像未重建/未重启，未执行生产迁移。
- 部署后只读 workflow `32551242155` 成功：生产 checkout SHA 为 `4f6a67f193e39a0a32e7a69caeab088c35044599`，Web image revision 同为该 SHA，Web 容器启动时间为本次部署时段；API image revision 保持此前的 `94226684...`，符合 web-only 部署预期。
