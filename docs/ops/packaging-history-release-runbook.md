# D1-C 包装历史生产发布执行手册（Runbook）

状态：**等待用户批准执行**。全部只读门禁已关闭（见实施报告 2026-09-15 各节）。

## 发布内容

- 分支：`impl/packaging-history-d1c-local`（HEAD `0d5793e0`，相对 origin/main ahead 48+）
- 范围：D1-C P0–P4（排除 P3-E/P5）、schema-first 部署修复、审计工具、文档
- 迁移：2 个 pending（`PackagingHistoryD1cEvidence1789353300496`、`PackagingHistoryReadIndexes1789362000000`），含 down()，无业务 DML
- 旗标：`PKG_HISTORY_POLICY` 无配置，默认全关；发布不启用任何旗标

## 发布候选就绪证据（本地已验证）

| 检查 | 结果 |
|---|---|
| API tsc --noEmit | exit 0 |
| Web tsc --noEmit | exit 0 |
| nullable-in-unique (g198) | ✅ 0 违规 |
| constraint-drift (g201) | ✅ 0 new drift |
| metadata 预检（生产） | ✅ 2× PASS (34958966261/34959648206) |
| 备份 | ✅ 8 对 dump，部署前 pg_restore --list TOC 校验（deploy.yml 内置） |

## 执行序列（批准后）

1. **合并与推送**：impl → main（用户批准即执行；push main 触发 deploy.yml）
2. **CI（自动）**：type-check、nullable、constraint、迁移 allowlist/down/DML、隔离 PG 迁移、entity gate、回归
3. **构建镜像**：GHCR，`IMAGE_TAG=sha-<release-commit>`
4. **生产部署（deploy.yml 既有逻辑，自动）**：
   ```text
   docker compose up -d --wait db                    # DB 健康
   备份 TOC 校验（pg_restore --list）                # 备份可读
   bash scripts/deploy-schema-first.sh ...           # 迁移先于 API 切换
   API_IMAGE=<new> docker compose up -d --wait api   # 新镜像 API
   docker compose up -d --no-deps --wait web         # Web
   curl /api/health + web 健康                       # 部署健康
   ```

## 部署后验收（本手册新增步骤）

1. dispatch metadata-only 审计，`expected_deploy_sha = <release-commit完整SHA>`（不再是 a53d91f3）；
2. 断言：actualSHA = 新 SHA；镜像 revision label = 新 SHA（消除 73 提交偏差）；
3. 断言：pending=[]（2 迁移已应用）、flags 仍 no_config 全关、backup 新增 1 对 dump；
4. API `/api/health` 200；包装历史只读接口（P1 列表/详情）返回结构正确；
5. 事件表 append-only 核对（迁移仅建表，无数据回填）。

## 回滚预案

- 镜像回退：`IMAGE_TAG=sha-<旧commit>` 重拉旧镜像（deploy.yml 注释既定方案）；
- 数据库：**禁止自动 destructive down()**；迁移 down() 存在但仅人工评审后使用；
- 备份：部署前自动 TOC 校验的 8+1 对 dump 为恢复边界；
- 事件/库存数据：迁移只增不删，回退镜像不丢新表数据。

## 边界声明

- Q/L4（设备出纸、扫码、实物交付、接收事实）未执行：发布后功能旗标保持全关，直至 Q/L4 通过；
- 不发行正式标签（v3-*）直至 Q/L4 验收；
- 本手册不虚构任何包装 33 现场事实。
