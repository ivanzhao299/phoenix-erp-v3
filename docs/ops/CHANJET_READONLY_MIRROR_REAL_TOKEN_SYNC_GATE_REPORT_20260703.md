# 好业财只读镜像真实同步 Gate 报告

日期：2026-07-03
阶段：CHANJET_READONLY_MIRROR_REAL_TOKEN_SYNC_GATE
结论：HOLD

## 1. 本轮目标

在 Phase 1 已完成的好业财只读镜像中间层基础上，尝试进入真实 token 环境同步 Gate：

1. 确认 ERP 中间层表是否存在。
2. 确认 API 是否可调用。
3. 确认是否具备受控调用 `/api/chanjet/integration/mirror/sync` 的认证 token。
4. 确认是否可见好业财鉴权链配置。
5. 如条件满足，执行只读同步。

## 2. 执行边界

- 写好业财：否
- 删除好业财数据：否
- 修改好业财数据：否
- 推送凭证：否
- 部署：否
- push：否
- 生产 DB 写入：否

允许范围：

- 本地 ERP DB 中间层建表检查。
- 已审查的 ERP 自有中间层表结构落库。
- 只读 Gate dry-run。
- 生成审计报告。

## 3. 新增 Gate Runner

新增：

- `scripts/ops/chanjet-readonly-mirror-sync.mjs`

能力：

1. 读取本地 env 文件和运行环境，但不打印密钥。
2. 检查 ERP DB 连接。
3. 检查 `chanjet_read_snapshots`、`chanjet_entity_snapshots`、`chanjet_erp_field_mapping` 是否存在。
4. 检查 API health。
5. 检查 `PHOENIX_ADMIN_TOKEN` / `PHOENIX_AUTH_TOKEN` 是否存在。
6. 检查好业财配置是否可见。
7. dry-run 默认不执行同步。
8. `--execute` 只有在所有前置条件通过时才调用只读镜像 API。
9. 输出：
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
   - `docs/ops/runs/chanjet-readonly-mirror-sync-latest.md`

## 4. 本地中间层表状态

执行前：

- `chanjet_read_snapshots`：缺失
- `chanjet_entity_snapshots`：缺失
- `chanjet_erp_field_mapping`：缺失

处理：

- 只执行已审查迁移 `1782742000000-CreateChanjetReadonlyMirror.ts` 的 create-only up SQL。
- 未执行 TypeORM 全量 migration runner，避免误跑其它历史迁移。
- 未写好业财。
- 未写 ERP 业务主表。

执行后：

- `chanjet_read_snapshots`：存在
- `chanjet_entity_snapshots`：存在
- `chanjet_erp_field_mapping`：存在

## 5. 当前阻断项

Gate runner dry-run 结果为 HOLD：

1. 本地 API 未运行或 `/api/health` 不可访问：
   - `http://127.0.0.1:3100/api/health`

2. 当前运行环境没有受控 API token：
   - 未发现 `PHOENIX_ADMIN_TOKEN`
   - 未发现 `PHOENIX_AUTH_TOKEN`

3. 当前 worktree 未发现好业财本地配置：
   - 未发现 `.env` / `apps/api/.env` 中的可用好业财鉴权链。

4. 本地 DB 还缺历史 `sys_chanjet_state` 表，说明本地库不是完整迁移状态。未自动补历史迁移，避免扩大本轮 Gate 范围。

## 6. 是否执行真实同步

未执行。

原因：

- 无 API token。
- 无可见好业财鉴权链。
- 本地 API 未运行。

本轮没有伪造快照，没有伪造字段结果，没有向好业财发起写请求。

## 7. 验证结果

- `node --check scripts/ops/chanjet-readonly-mirror-sync.mjs`：PASS
- `node scripts/ops/chanjet-readonly-mirror-sync.mjs --dry-run --output-dir docs/ops/runs`：HOLD，符合 fail-closed 预期
- ERP 中间层表存在性：PASS

## 8. 下一步

推荐下一 Gate：

`CHANJET_READONLY_MIRROR_EXECUTE_WITH_RUNTIME_TOKEN`

前置条件：

1. 在已部署或本地可登录 API 环境提供 `PHOENIX_ADMIN_TOKEN` / `PHOENIX_AUTH_TOKEN`。
2. API `/api/health` 可访问。
3. 运行环境具备好业财 `appTicket / certificate / openToken` 链路。
4. 确认执行命令只调用：
   - `POST /api/chanjet/integration/mirror/sync`
   - 不调用任何好业财写接口。

命令模式：

```bash
PHOENIX_ADMIN_TOKEN=<redacted> node scripts/ops/chanjet-readonly-mirror-sync.mjs --execute --output-dir docs/ops/runs
```

## 9. 当前结论

HOLD。

原因不是代码缺失，而是当前本地执行环境缺少真实同步所需 API 运行态和认证链。平台侧已具备执行器、表结构和 UI；下一步需要在有有效 token 的运行环境执行只读镜像同步。
