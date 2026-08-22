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

待 full 部署完成后补录 workflow run、API/Web revision 与公网响应头。

## 用户侧复核

1. 打开鸡群档案，记下某批次当前存栏量。
2. 编辑为明显不同的数字并保存。
3. toast 出现后，不手动刷新页面，确认列表立即显示新值。
4. 再刷新页面，确认仍是相同新值。
5. 若仍异常，在浏览器 Network 中保存该次 PUT 与紧随其后的 GET 响应体及响应头。
