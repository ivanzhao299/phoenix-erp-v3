# 包装历史发布前兼容、迁移与回退计划（尚未执行发布）

2026-09-14；交父级复核。本轮仅本地隔离演练，无 push / workflow dispatch / SSH / 生产访问 / 开旗。D1-C、P0–P4，排除P3-E/P5。以下正式命令是待审计划，不是已执行记录，也不是发布批准。

## 实际窗口决定发布顺序

见 `artifacts/packaging-history-compatibility-1789365036521/results.json`：新API源码c6d3b9d2配旧81迁移库，health/readiness为200，warehouse/status、包装trace、history列表/详情为500。旧69d89dd4源码配83迁移库的9个旧GET为200，两个新history路由404。独立81恢复库先执行两条正式TypeORM迁移到83，再启动新API，11个GET均200。关新写策略不足以保护新读路径。

`.github/workflows/deploy.yml:857–865` 先 `up --wait api` 后在新API执行TS迁移，869才起Web；`scripts/db-migrate.sh` 的prod分支跳过TS，不会提前补齐这两条。health成功不能放行这个窗口。计划采用**候选镜像一次性迁移进程先行，成功后才切换API/Web**；不直接用现有默认顺序发布本功能。本轮未修改整条部署链。

## 执行前硬条件

- 父级先审本地交付及候选镜像/源SHA、原CI结果。entity 393>300是实际硬门禁；不得以“旧基线也393”跳过、改阈值、走fast-css伪装或绕CI。当前不能声称具备通过该门禁的发布条件。
- 使用正常CI构建出的固定API/Web镜像digest；验证镜像内两条迁移及数据库连接目标。本文本地验证是源码+现有依赖/PG18，不代表候选Docker镜像本身已实测。
- `PRESERVE_ARTIFACTS=true`，保留deploy.yml715的dirty拒绝门禁。部署目录如有既存未跟踪证据，不清理、不强制覆盖；先由维护者安排独立干净发布目录及保留路径，重新审目标。禁止reset/amend/force/down。
- 维护门禁须覆盖Web与直接API、后台业务写任务及其他写入方；先阻止新业务写并等待在途事务结束。旧API可以维持只读服务；未验证旧业务写与83兼容，不以GET通过推导写兼容。
- 核验实际DB major=18；本地为18.6，compose文件仍写postgres:16-alpine，CI服务写18。未访问生产核实，不能依据文件注释断言生产版本。不得随功能发布顺带升级DB major或重建db服务。
- 所有精确公司/场 `PKG_HISTORY_POLICY` 新写仍关闭，无配置则默认全false；不创建启用配置，不发行正式码。Q/L4实物资格仍未验。

## 正式操作模板（仅计划）

命令在审定发布目录运行；变量通过维护者已有合法环境提供，不输出配置、密码或token。下面的 `CANDIDATE_API_IMAGE` / `CANDIDATE_WEB_IMAGE` 必须是通过CI并经复核的digest，`RELEASE_EVIDENCE_DIR` 是新建且专属的证据目录，文件名必须唯一。`TARGET_SHA`为审定源码，`MIGRATION_RUN_NAME`为唯一容器名。

```bash
set -euo pipefail
export PRESERVE_ARTIFACTS=true
: "${CANDIDATE_API_IMAGE:?reviewed digest required}"
: "${CANDIDATE_WEB_IMAGE:?reviewed digest required}"
: "${RELEASE_EVIDENCE_DIR:?dedicated evidence directory required}"
: "${MIGRATION_RUN_NAME:?unique retained container name required}"
: "${TARGET_SHA:?reviewed source SHA required}"
test "$(git rev-parse HEAD)" = "$TARGET_SHA"
test -z "$(git status --porcelain --untracked-files=all)"
test ! -e "$RELEASE_EVIDENCE_DIR/pre-migration.dump"
# 在已建立维护写门禁、在途事务结束后备份；DB容器内使用既有环境，不打印凭据。
(set -C; docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$RELEASE_EVIDENCE_DIR/pre-migration.dump")
docker compose exec -T db pg_restore --list < "$RELEASE_EVIDENCE_DIR/pre-migration.dump" > "$RELEASE_EVIDENCE_DIR/pre-migration.toc"
sha256sum "$RELEASE_EVIDENCE_DIR/pre-migration.dump" > "$RELEASE_EVIDENCE_DIR/pre-migration.sha256"
# 同一备份必须先在独立恢复库实际restore并对账，不向原库pg_restore。
# 保持旧API镜像运行；run不发布端口、不启动Nest、不启动cron，不用--rm保留退出证据。
API_IMAGE="$CANDIDATE_API_IMAGE" docker compose run --no-deps \
  --name "$MIGRATION_RUN_NAME" --user phoenix \
  -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:run --transaction all \
  > "$RELEASE_EVIDENCE_DIR/migration.log" 2>&1
# 上条非0则set -e停止，不切新API/Web；审SQLSTATE、锁持有者及事务回滚后再决定重试。
API_IMAGE="$CANDIDATE_API_IMAGE" docker compose run --no-deps \
  --name "${MIGRATION_RUN_NAME}-show" --user phoenix \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:show \
  > "$RELEASE_EVIDENCE_DIR/migration-show.log" 2>&1
# 人工检查两条迁移已执行、五表/函数/触发器/索引与WMS reason列完整，事件计数无损后才继续。
API_IMAGE="$CANDIDATE_API_IMAGE" docker compose up -d --no-deps --wait api
WEB_IMAGE="$CANDIDATE_WEB_IMAGE" docker compose up -d --no-deps --wait web
```

模板中的schema核验/独立恢复/维护门禁是显式停点，不能自动略过。若复用现workflow，必须在它到857之前完成同一候选镜像的上述迁移与核验；现861重复migration:run应为无待执行，不把0条当首次迁移成功。覆盖entrypoint避免默认上传卷chown；不读取上传内容。候选镜像用户/工具路径应先在隔离镜像验证，不能把模板当作已验证生产命令。恢复与角色ACL应按目标集群治理；本地restore用了 `--no-owner --no-privileges`，仅证明业务schema/数据/序列，不证明生产角色、ACL、外部文件或PITR。

切换后仍保持新功能写关闭，检查health、readiness及本报告列出的真实旧入口、新history窗口；health单独不足。普通账号读取验证使用当次合法会话，不复用旧auth artifact。确认窗口后才能解除维护门禁；正式入库/打印/签收和Q开启需另有现场验收事实，本轮没有执行。

## 失败、锁与回退

本地锁演练：恢复83库保留1536事件，事务A持ACCESS SHARE；事务B设lock_timeout250ms，先建sentinel再ALTER原单表，实际55P03约252ms；ROLLBACK后sentinel和新增列均不存在，解锁重试ALTER成功后仍回滚，所有public表与序列digest不变。此为代表DDL事务与锁超时证明，不声称重演了每条迁移在每个锁点的竞争。

迁移失败且事务all回滚：保持旧API、写维护门禁和备份，不切新API，不自动无限重试。排查后才能重新执行候选迁移。若迁移已成功、后续API/Web失败：回退固定旧镜像并**保留83 schema与所有事件**。deploy.yml662–714自身也是镜像/代码回退，不自动恢复DB；保留模式使用switch而非默认hard reset，但仍需审定目录与镜像，不执行破坏性历史操作。

严禁对已有events/boxes/claims/operations的库执行down。旧镜像读兼容只覆盖本次9个GET，启动初始化写均被只读角色拒绝；业务写回退仍需维护门禁。数据库灾难恢复是人工独立流程：保留事故库、备份之后新增事件及外部实物事实，另库restore、校验表/序列/事件及增量归并，审定切换；不能自动把在线DB覆盖到备份时间点而丢掉签收事件。
