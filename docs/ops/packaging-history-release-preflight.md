# 包装历史发布前兼容、迁移与回退计划（尚未执行发布）

2026-09-14；交父级复核。本轮仅本地隔离演练，无 push / workflow dispatch / SSH / 生产访问 / 开旗。D1-C、P0–P4，排除P3-E/P5。以下正式命令是待审计划，不是已执行记录，也不是发布批准。

## 实际窗口决定发布顺序

见 `artifacts/packaging-history-compatibility-1789365036521/results.json`：新API源码c6d3b9d2配旧81迁移库，health/readiness为200，warehouse/status、包装trace、history列表/详情为500。旧69d89dd4源码配83迁移库的9个旧GET为200，两个新history路由404。独立81恢复库先执行两条正式TypeORM迁移到83，再启动新API，11个GET均200。关新写策略不足以保护新读路径。

旧版deploy.yml曾先up API再迁移，已在本地 `64c92f38` / `fffbc0bd` 修正：当前workflow拉取本次SHA候选，调用 `scripts/deploy-schema-first.sh` 用固定镜像ID迁移、核验成功后才up API/Web；提前失败保持旧API，API发布强制保留artifacts。该代码尚未发布。旧schema的4个500说明迁移先行仍是必要条件。

旧Node22 bookworm候选证据保留。现已从tracked、排除敏感文件的专属副本，使用未修改的正式API/Web Dockerfile完成Node20 Alpine构建，实际node v20.20.2；最新应用提交cdb49bb1，构建证据`artifacts/entity-node20-1789370342086/results.json`。此前Node22与本地build结果只是阶段证据，不冒充本次镜像；本次仍未发布。

## 执行前硬条件

- 父级先审本地交付及候选镜像/源SHA、原CI结果。原entity393>300失败保留；A/B及父级27–29最小修复后实际267/300通过，仍余267条非零差异。不得改阈值、走fast-css伪装或绕CI；旧scope-audit28fail/1skip仍需父级审，不称全部发布门禁已通过。
- 使用正常CI构建出的固定API/Web镜像digest；验证镜像内两条迁移及数据库连接目标。Node22旧阶段、本地build及本轮正式Node20镜像证据分别列明；最终镜像应与经审交付指纹一致，不自动复用旧阶段image。
- `PRESERVE_ARTIFACTS=true`，保留当前deploy.yml的dirty拒绝门禁。部署目录如有既存未跟踪证据，不清理、不强制覆盖；先由维护者安排独立干净发布目录及保留路径，重新审目标。禁止reset/amend/force/down。
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

## review24–26 后发授权下的本地部署修复（覆盖此前“仅计划、未改workflow”限制）

用户本轮明确要求最小实际修复；现已修改workflow及可测试辅助脚本，仍未push/deploy/生产访问。正常API发布强制 `export PRESERVE_ARTIFACTS=true`，保留dirty门禁与原备份链；拉取本次 `sha-${TARGET_SHA}` API镜像，不依赖可变latest。`scripts/deploy-schema-first.sh <专属证据父目录> <明确候选镜像引用>` 将候选固定为本地镜像ID，使用同ID执行独立migration:run（transaction all、lock_timeout5s、statement_timeout120s）及migration:show。

runner不启动AppModule、不发布端口、不启动依赖、覆盖chown入口、使用phoenix用户；退出容器及日志均保留。show必须存在已执行标记且没有待执行标记，否则失败。成功输出固定镜像ID供随后API up使用；迁移或核验失败则不切新API/Web。`API_SWITCH_STARTED`只有成功核验后才置true，提前失败时旧API不因rollback被重启；捕获候选输出的子shell取消继承ERR trap，使失败只交给外层原rollback一次，退出码仍传播。已有DB/events不down、备份非自动DB覆盖恢复的原则不变。

CI现调用 `scripts/check-entity-schema.sh`，使用新建唯一目录、固定本次timestamp文件名，没有/tmp旧glob，也不删除diff后再计数。普通TypeORM generate模式：exit0+准确成功行+实际文件才进入300门禁；exit1+准确no-changes全文+无artifact+空stderr才允许合法0；异常、缺文件、空artifact、误导日志或部分文件加错误退出均fail closed。stdout/stderr独立保留，PG弃用警告不能冒充成功或零变化。workflow在失败后仍上传本次CI证据（此上传步骤仅代码，未执行）。300未改，旧393反例仍阻断；当前最小修复后真实267/300通过，历史393失败证据保留。

review24–26历史容器演练使用Node22 bookworm与当时dist，仅证明该阶段迁移/验证流程；当时未验证正式Node20。现阶段已经完成正式Node20构建及候选演练，见下节与实施报告。本次仍未发布，仍需正常CI、固定候选镜像、维护写门禁和父级证据复核，不跳过旧scope红灯裁定。


## A/B及review27–29本地补充（仍未发布）

正式Node20构建基线为cdb49bb1，API/Web镜像实际node均v20.20.2，基础node:20-alpine digest sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293。镜像ID及源码归档SHA见构建results；Node20编译产物的TypeORM生成器只生成diff、不执行diff，267/300是真实门禁结果。A/B/十列WMS只改元数据及旧provider，没有新DB迁移，正式迁移总数仍83。旧provider存在NULL/并发问题已按父级授权真实修复回归；其全局事务锁限制legacy并行吞吐，现包装inv_batches路径不使用它。

原393拒绝shell fixture继续拒绝，阈值/allowlist均未变。原scope-audit仍真实FAIL，L4/Q实物未验，新写默认关；远端DB major/部署ref与受控audit dispatch等待父级下一阶段确认bundle/输入，本turn未执行。备份恢复与旧API只读兼容证据保留原测试revision，不追认为当前所有端点/写操作都兼容。最终源码/测试映射与本次停机记录见实施报告及交付receipt。

## Review30追加（未发布）

资金summary授权漏洞已以ebdeb594最小修复，最终f8624273同指纹25适用组+49真实scope HTTP/15审计shell/2payments回归重跑，正式Node20构建、候选及浏览器/P95通过。原raw scope仍2printedPASS/28FAIL/1SKIP保留；新映射不冒称原生产角色配置认证。生产audit34818687355旧执行exit1、空输出原因未知；本轮未重复dispatch。审计workflow本地已增加安全阶段诊断、stderr捕获和~/显式展开，未push。metadata-only新入口仅待审方案，详见packaging-history-readonly-metadata-plan.md；不得为启用新通道提前push main。最终应用/测试/镜像与源码映射以实施报告Review30和review30-final-delivery.json为准，旧镜像仅历史证据。
