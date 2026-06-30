# Phoenix ERP V3 — Rollback Procedures

> 出事时怎么退。每条命令都对齐仓库真实机制（`.github/workflows/deploy.yml` / `scripts/db-migrate.sh` / `scripts/ops/restore-runner.sh`）。
> 配套：[ops-runbook.md](./ops-runbook.md) · [ops/DR_RESTORE_DRILL.md](./ops/DR_RESTORE_DRILL.md)。

---

## 0. 决策树（先判故障类型）

| 症状 | 走哪条 | 关键风险 |
|---|---|---|
| 部署后前端/接口炸，**没改 DB schema**（mode=web/fast-css，`run_mig=false`） | §1 代码回滚 或 §2 镜像回滚 | 低，无需碰 DB |
| 部署后炸，且本次 **跑了迁移**（mode=api/full，`run_mig=true`） | §1/§2 + §3 迁移回滚 | 高，DML 可能不可逆 |
| 数据层损坏 / 误删 / 迁移把数据写坏 | §4 数据库恢复 | 最高，停业务 |

> 本次部署是否跑了迁移：看 deploy.yml 的 `detect-changes` 输出 `run_mig`（mode=api/full 为 `true`，deploy.yml:169-180），或部署日志里是否出现 `── 执行 TypeORM TS 迁移(api 容器内) ──`（deploy.yml:679）。

---

## 1. 代码回滚（revert commit → 重跑流水线）—— 首选

最干净，走正常 CI 门禁。

```bash
# 在本地仓库
git revert <bad-sha>            # 生成反向 commit；多个 commit 用 git revert <a>^..<b>
git push origin main            # 触发 deploy.yml（自动 detect-changes 选 mode）
```

- push `main` 自动触发完整流水线（test 门禁 → build-push → deploy，deploy.yml:22-24）。
- revert 若**包含 migration 文件**，会再次 `run_mig`——确保被 revert 的迁移有可逆 `down()`（CI 门禁 `check-ts-migration-down.sh` 已强制，deploy.yml:259-260），否则 schema 回退要走 §3。
- 适用：希望保留可审计历史、不赶时间（流水线 web 2-5min / api 5-12min）。

> ⚠️ 不要 `git reset --hard` / `git push --force` 改写 main 历史（CLAUDE.md 红线）。回退一律用 `git revert`。

---

## 2. 镜像回滚（重拉上一个 per-SHA 镜像）—— 最快，不重新构建

`build-push` 给每次 commit 推了**不可变** per-SHA tag `sha-<full-commit-sha>`（deploy.yml:436-447；除 `latest` 外）。registry 保留，可直接重拉旧镜像，无需重建。

```bash
# SSH 进生产机，进部署目录（deploy.yml 用 secrets.DEPLOY_PATH，默认 ~/phoenix-erp）
cd ~/phoenix-erp

# 1) 找上一个good commit 的完整 sha（GHCR 上 tag 名即 sha-<full40>）
#    本地 git log 取，或在 GHCR packages 页面看 phoenix-erp-v3/api、/web 的 tag
GOOD_SHA=<上一个good的完整commit-sha>

# 2) 覆盖 compose 里用的镜像 tag，重拉旧镜像、滚动重启
#    docker-compose.yml 用 IMAGE_PREFIX/{api,web}:<tag>；默认 latest。
#    回滚时把目标 tag 指向 sha-<GOOD_SHA>：
export IMAGE_TAG="sha-${GOOD_SHA}"     # 与 deploy.yml:444-447 注释的回滚约定一致
docker compose pull api web
docker compose up -d --no-deps --wait api
docker compose up -d --no-deps --wait web

# 3) 冒烟
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS http://127.0.0.1:3000/ -o /dev/null && echo OK
```

- 前提：`docker-compose.yml` 的镜像引用支持 `${IMAGE_TAG}` 变量覆盖。**TODO（需在生产 compose 确认）**：仓库根 `docker-compose.yml` 是否已参数化 tag。若写死 `:latest`，需先改 compose 的 image 行再 `up`。deploy.yml 仅证明 per-SHA tag **存在于 registry**（deploy.yml:444-447），未在 workflow 内证明 compose 的变量名 —— 故此处的 `IMAGE_TAG` 名按注释约定，落地前请核对 compose。
- 适用：紧急止血、且本次**没动 DB**（否则旧镜像配新 schema 仍可能炸 → 同时走 §3/§4）。

---

## 3. TypeORM 迁移回滚（`migration:revert`）

仅针对 `apps/api/src/database/migrations/` 的 **TS 迁移**。每条 TS 迁移强制实现 `down()`（CI 门禁 deploy.yml:259-260）。

```bash
# SSH 进生产机，在 api 容器内执行（与 deploy.yml:680-682 跑 migration:run 的入口一致）
cd ~/phoenix-erp
docker compose exec -T api ./node_modules/.bin/typeorm \
  -d dist/database/data-source.js migration:revert
```

- `migration:revert` **每次只回退最近一条**已执行迁移。回退 N 条要跑 N 次。
- 回退顺序 = 应用顺序的逆序（TypeORM 按 `migrations` 表时间戳倒序 revert）。
- 裸 SQL 迁移（顶级 `migrations/` 46 条、`apps/api/migrations/` 169 条）**已冻结，无 down 概念**（CLAUDE.md）；它们经 `schema_migrations` 记录"跑过即跳过"（db-migrate.sh:52-77）。要撤销裸 SQL 的 schema 变更，只能手写反向 DDL 走新迁移，或走 §4 整库恢复。
- ⚠️ 含数据 DML 的迁移（白名单豁免 `@allow-data-dml`）其 `down()` 未必能完整还原已变更的业务数据 → 数据层不确定时直接走 §4。

**标准操作顺序（部署炸 + 跑过迁移）**：
1. 先 §3 `migration:revert` 把 schema 退回旧版（**先退 DB**）。
2. 再 §1 revert commit 或 §2 镜像回滚把**代码**退回旧版。
3. 冒烟 `/api/health` + `/api/readiness`。
> 顺序要点：让代码与 schema 版本匹配。若先退代码（旧代码）但 DB 还是新 schema，旧代码可能命中不认识的列（CLAUDE.md g197：`column does not exist` → 500）；反之新代码配旧 schema 同样炸。两者必须一起退。

---

## 4. 数据库恢复（最重，停业务场景）

机制见 `scripts/ops/restore-runner.sh` + [ops/DR_RESTORE_DRILL.md](./ops/DR_RESTORE_DRILL.md)。备份由 `scripts/ops/backup-runner.sh` 产出 `--format=custom` 的 `*.dump`。

```bash
# 4.1 先确认有可用备份 + 评估 RPO（最近一次 SUCCESS 备份时间）
#     查 sys_backup_records（restore-runner.sh 会先 pg_restore --list 校验完整性）

# 4.2 演练校验（零风险，不碰任何业务库）—— 恢复到一次性临时库验证可恢复性
RESTORE_FILE=/var/backups/phoenix-erp/phoenix_BK-最新.dump \
DB_HOST=<host> DB_PORT=5432 DB_USER=<user> DB_PASSWORD=<pwd> \
  scripts/ops/restore-runner.sh         # 无 CONFIRM → 仅演练校验（restore-runner.sh:56-70）

# 4.3 恢复到副本库验证业务可用（不动生产）
RESTORE_FILE=... DB_NAME=phoenix_erp_verify CONFIRM=RESTORE \
DB_HOST=... DB_USER=... DB_PASSWORD=... \
  scripts/ops/restore-runner.sh
# 把应用临时指向 phoenix_erp_verify，跑 scripts/smoke-test.sh

# 4.4 生产恢复（仅重大事故，双人复核）—— 脚本会先做 pre-restore safety dump 再覆盖
RESTORE_FILE=... DB_NAME=phoenix_erp ALLOW_PROD=yes CONFIRM=RESTORE \
DB_HOST=... DB_USER=... DB_PASSWORD=... \
  scripts/ops/restore-runner.sh
# 脚本：pre-restore_*.dump → pg_restore --clean --if-exists（restore-runner.sh:72-86）
```

- 生产恢复护栏：`DB_NAME` 命中 `PROD_DB_NAMES`（默认 `phoenix_erp`）且无 `ALLOW_PROD=yes` → 直接退出（restore-runner.sh:48-54）。
- 恢复前**自动**对目标库 safety dump（除非 `SKIP_SAFETY=yes`，restore-runner.sh:74-81）→ 恢复失败可用它回退。
- 恢复后立即冒烟 `scripts/smoke-test.sh`（DR_RESTORE_DRILL.md:25）。

---

## 5. fast-css 回滚

`fast-css` 部署只 scp 一个 CSS 文件到 `/opt/phoenix/static-overrides/runtime-design-system.css`（deploy.yml:478-491），无容器/DB 变更。回滚 = revert 该文件 commit 后 push（再触发一次 fast-css，deploy.yml:147-148），或手工把上一版 CSS scp 覆盖回去。

---

## 6. 回滚后必做

1. 冒烟：`GET /api/health`（status=OK）、`GET /api/readiness`（READY）、`scripts/smoke-test.sh`。
2. 查 `sys_alerts` 是否仍在刷 `API_5XX` / `CRON_FAILURE`（见 ops-runbook §2）。
3. 看 `/api/metrics`：`phoenix_up=1`、业务 gauge 恢复正常区间。
4. 记录事故时间线 + RTO/RPO（DR_RESTORE_DRILL.md 第 4 节表格）。
