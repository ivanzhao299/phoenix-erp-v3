# TypeORM TS 迁移目录 (g195-P4)

> **新 schema/数据迁移一律走本目录,禁止再加裸 SQL 到 `apps/api/migrations/`**(顶级 169 条 baseline 锁定不动)。
> CI 门禁(g195-P5)会拦截违反此规则的 PR。

## 命名约定

```
<timestamp-ms>-<PascalCaseName>.ts
```

- `timestamp-ms` = TypeORM 用此前缀**排序执行**(13 位 ms epoch); `migration:create` / `migration:generate` 自动生成
- `PascalCaseName` = 类名(file 名末段),例如 `AddProductGradeIndex`、`SeedShareholderRoles`

## 创建迁移

### 模式 A: schema 变更 → 从 entity diff 自动生成(推荐)

修改 entity 后:

```bash
cd apps/api
pnpm migration:generate src/database/migrations/AddProductGradeIndex
```

TypeORM 会对比 entity ↔ DB 当前 schema,自动生成 `up()` / `down()` SQL。
**前提**: 本地 DB 是空库或与生产 schema 一致(否则 diff 会包含已存在的列)。

### 模式 B: 数据迁移(seed / 回填 / fix) → 手写

```bash
cd apps/api
pnpm migration:create src/database/migrations/SeedShareholderRoles
```

生成空模板,手填 `up(queryRunner)` 业务逻辑 + `down(queryRunner)` 回滚逻辑。

## 必须项(P5 CI 门禁强制)

每条 TS 迁移必须:

1. **实现 `down()`** — 真实可回滚,不能是 `throw new Error('not implemented')`
2. **幂等表达** — 即便 schema_migrations 表丢失也可重跑(用 `IF NOT EXISTS` / `ON CONFLICT` 等)
3. **数据迁移加事务** — `queryRunner.startTransaction()` 包住多步 DML
4. **不写业务数据 seed 进 schema 迁移** — 用户/组织/客户/供应商等运行时数据走 [`/master-data`](../../modules/master-data/) 接口,不靠迁移落库

## 执行(部署链自动跑)

- **CI**: `scripts/db-migrate.sh` 在裸 SQL 跑完后自动调 `pnpm migration:run`(g195-P3)
- **生产**: `deploy.yml` 在 `docker compose up -d --wait api` 后调 `docker compose exec -T api ./node_modules/.bin/typeorm -d dist/database/data-source.js migration:run`(g195-P3+)
- 本地手动: `cd apps/api && pnpm migration:run` (会先 build 再跑)

## 回滚最后一条

```bash
cd apps/api
pnpm migration:revert
```

回滚到上一条已记录的迁移(查 `migrations` 表)。**生产慎用**——回滚 = 数据可能丢失。

## 查询状态

```bash
cd apps/api
pnpm migration:show
```

显示 `[X] AddProductGradeIndex` (已执行) / `[ ] AddProductGradeIndex` (待执行)。

## 与历史 169 裸 SQL 的关系

g195-P2 桥接脚本 (`scripts/bridge-schema-migrations-to-typeorm.sh`) 已把 169 条
裸 SQL 文件名灌入 TypeORM `migrations` 表 → TypeORM 视它们"全部已执行",此后只
跑本目录新增。**不要**把历史裸 SQL 重命名搬来这里——徒劳且有风险。

## 路线图

参见 `docs/migration-tooling-roadmap.md`。
