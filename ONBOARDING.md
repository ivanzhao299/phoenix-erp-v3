# Phoenix ERP V3 — 新人 1 小时上手

> 目标：让新加入的开发拿到代码后 1 小时内能跑通本地 + 提一个最小 PR。

---

## 0. TL;DR

```bash
# 1. clone
git clone https://github.com/ivanzhao299/phoenix-erp.git
cd phoenix-erp                   # 进入 monorepo 根 (即 ABC/)

# 2. 选其一：
#    A) 容器化（最快，需 Docker）
cp .env.docker.example .env       # 改 JWT_SECRET / DB_PASSWORD
bash scripts/verify-docker-stack.sh

#    B) 本地（需 Node 20 + pnpm + 本机 PostgreSQL）
pnpm install
cp apps/api/.env.example apps/api/.env   # 填本机 PG 凭证
pnpm dev                          # 同时起 api + web

# 3. 跑回归确认环境 OK
cd apps/api && pnpm test:smoke
```

---

## 1. 我是谁、要做什么

V3 是 V2 (SQLite + Express) 的现代化重构：

| 维度 | V2 (旧) | V3 (新) |
|------|---------|---------|
| 后端 | Express + SQLite | **NestJS 10 + PostgreSQL 18** |
| 前端 | React Vite SPA | **Next.js 16 + React 19 PWA** |
| 部署 | 单进程 | **Docker compose / 可拆 K8s** |
| 鉴权 | 自写 session | **JWT (bcrypt + dual-secret rotation)** |
| 测试 | 零 | **集成 369/369 + 单元 40/40** |

阶段二已 100% 完成（V3 = V2 + 增强）。当前阶段三：上线 + V2 封存。

---

## 2. 仓库结构

```
ABC/                              ← monorepo 根
├── apps/
│   ├── api/                      ← NestJS 后端 (端口 3100)
│   │   ├── src/
│   │   │   ├── auth/             ← JWT/RBAC/login
│   │   │   ├── common/           ← guards, decorators, filters
│   │   │   └── modules/          ← 业务模块（每个一个目录）
│   │   │       ├── breeding/
│   │   │       ├── packaging/    (= terminal)
│   │   │       ├── wms/
│   │   │       ├── store/        (= POS + 门店)
│   │   │       ├── order/
│   │   │       ├── finance/
│   │   │       ├── quality/
│   │   │       ├── master/       (= 系统设置 + 用户管理)
│   │   │       ├── bff/          (= dashboard/analytics 聚合)
│   │   │       └── generic-crud/ ← 白名单表自动 CRUD
│   │   ├── scripts/              ← 11 个 *-regression.sh + e2e
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                      ← Next.js 16 前端 (端口 3000)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (admin)/      ← 后台管理页
│       │   │   ├── login/
│       │   │   └── trace/        ← 公开追溯页
│       │   └── components/
│       └── public/
│           ├── manifest.json     ← PWA
│           └── sw.js
├── _archive/
│   ├── phoenix-backend-v2-sqlite/  ← V2 代码归档
│   ├── v2-migration-scripts/        ← 一次性迁移脚本
│   └── v2-final-snapshot-*.sql.gz   ← V2 数据最终快照
├── scripts/
│   ├── verify-docker-stack.sh
│   ├── backup-db.sh
│   ├── archive-v2-tables.sh
│   └── gen-api-docs.sh
├── docker-compose.yml
├── .github/workflows/
│   └── regression.yml            ← CI: 11 套 + e2e
├── pnpm-workspace.yaml
├── DEPLOYMENT.md                 ← 部署
├── RUNBOOK.md                    ← 运维
├── CODE_QUALITY.md               ← 测试/lint 基线
├── API.md                        ← 233 个端点清单
└── ONBOARDING.md                 ← 你正在看的
```

---

## 3. 第一次运行

### 3.1 容器方式（5 分钟）

```bash
# 装 Docker Desktop (macOS) 或 docker-ce (Linux)
docker --version    # 期望 24+

# 一行起 stack
bash scripts/verify-docker-stack.sh
# → 自动生成 .env / 拉镜像 / build / up / 烟雾测试 / down

# 想保留 stack 跑后续测试：
KEEP=1 bash scripts/verify-docker-stack.sh
# 之后访问：
#   http://localhost:3100/api/health
#   http://localhost:3100/api/metrics
```

### 3.2 本地方式（10 分钟）

需要：Node 20 + pnpm 9 + 本机 PostgreSQL 18。

```bash
# 1) 装依赖
pnpm install

# 2) 本机 PG：建库 + 用户
psql postgres -c "CREATE USER phoenix_v3 WITH PASSWORD 'dev123';"
psql postgres -c "CREATE DATABASE phoenix_erp OWNER phoenix_v3;"

# 3) 拷 .env
cp apps/api/.env.example apps/api/.env
# 编辑：DB_PASSWORD=dev123 / JWT_SECRET=随便填 ≥32 字符

# 4) 起服务
pnpm dev          # 并发启动 api (3100) + web (3000)
# 或分开：
pnpm dev:api      # 只起后端
pnpm dev:web      # 只起前端

# 5) 验证
curl http://localhost:3100/api/health
# 浏览器：http://localhost:3000
# 登录：admin / admin123 (dev 模式宽松)
```

---

## 4. 跑测试

```bash
cd apps/api

# 单元测试（40 个）
pnpm test
pnpm test:cov     # + 覆盖率报告

# 集成回归（11 套，369 个）
pnpm test:smoke              # 全 11 套
pnpm test:e2e                # 仅 E2E 端到端
pnpm test:regr:order         # 仅订单模块
pnpm test:regr:finance       # 仅财务模块

# Lint
pnpm lint
pnpm lint:fix
```

> 集成测试需要 API + PG 已经跑起来。每个套件 30 秒～1 分钟。

---

## 5. 提一个最小 PR（实战）

假设你要加一个 GET 端点 `/api/example/hello`：

```bash
# 1) 新分支
git checkout -b feat/example-hello

# 2) 加文件 apps/api/src/modules/example/example.controller.ts
mkdir -p apps/api/src/modules/example
cat > apps/api/src/modules/example/example.controller.ts <<'EOF'
import { Controller, Get } from '@nestjs/common';

@Controller('api/example')
export class ExampleController {
  @Get('hello')
  hello() {
    return { code: 200, msg: 'hello, V3' };
  }
}
EOF

# 3) 模块文件
cat > apps/api/src/modules/example/example.module.ts <<'EOF'
import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
@Module({ controllers: [ExampleController] })
export class ExampleModule {}
EOF

# 4) 注册到 app.module.ts
# 在 import 区加：import { ExampleModule } from './modules/example/example.module';
# 在 imports 数组加：ExampleModule,

# 5) 类型检查 + lint
cd apps/api && npx tsc --noEmit && pnpm lint

# 6) 重启 api，测一下
# 假设 docker compose 已经在跑：
docker compose restart api
curl http://localhost:3100/api/example/hello

# 7) 跑相关回归确认没破坏其他
pnpm test:regr:system   # 选一个相关的

# 8) 提交 + PR
git add -A && git commit -m "feat(example): add hello endpoint"
git push -u origin feat/example-hello
# 去 GitHub 开 PR；CI 会自动跑 369/369 回归
```

---

## 6. 关键约定

### 6.1 命名

- 文件：kebab-case (`sales-engine.service.ts`)
- 类：PascalCase (`SalesEngineService`)
- 方法：camelCase (`validateOrder`)
- DB 表：snake_case 单数（V3 canonical：`sys_user`, `ord_orders`, `inv_batches`）
- DB 列：snake_case (`created_at`, `total_amount`)
- 业务单号前缀：
  - 订单：`ODR-YYYYMMDD-XXXXXX`
  - POS 销售：`S-YYYYMMDD-XXXXXX`
  - 批次：`BAT-YYYYMMDD-...`
  - AP 凭证：`AP-<timestamp>`
  - 日结：`DCL-YYYYMMDD-<store>`

### 6.2 SQL

- **永远参数化**：`$1`, `$2`，禁止字符串拼接
- 跨步事务：用 `em.transaction(async mgr => { ... })`
- 子步可能失败但不能毒化主事务：用 `SAVEPOINT sp_xxx` + try/catch
- 写库存的操作必须同步写 `inv_ledger`（守恒原则）
- 改 schema：写到 `generic-crud.service.ts` 的 boot migration list（IF NOT EXISTS 包裹）

### 6.3 鉴权

- 受保护路由：`@UseGuards(AuthGuard('jwt'))` 或 `@UseGuards(MenuGuard)`
- 按菜单授权：`@RequireMenu('MENU_XXX', 'V'|'C'|'E'|'D'|'A'|'X')`
- 公开路由：不加 guard，但在 controller class 注释里显式说明
- Token：从 `req.user.username / role / storeCode` 取，**禁止信 body 里的 store_code / cashier**

### 6.4 错误响应

- 业务错误：`throw new BadRequestException('...')` / `ForbiddenException` / `NotFoundException` / `ConflictException`
- 不要 `return { code: 500 }` —— 让 NestJS filter 统一处理
- 抛 BadRequest 时 body 可传对象：`throw new BadRequestException({ code: 400, error_type: 'PRICE_LIMIT_ERROR', ... })`

### 6.5 测试

- 新加 controller 至少配一个 `*.spec.ts`（单元）或在对应 `*-regression.sh` 加一个用例（集成）
- 集成测试用真实 PG + HTTP，更能反映 V3 实际行为
- 改公共业务（如 SalesEngine）：跑全部 11 套件确认无回归

---

## 7. 常用 Cheat Sheet

```bash
# 看运行中容器
docker compose ps

# 进 db
docker compose exec db psql -U phoenix_v3 -d phoenix_erp

# 看实时 api 日志
docker compose logs -f --tail=100 api

# 单测某个模块
cd apps/api && npx jest src/auth/permissions-resolver.spec.ts

# 类型检查（不编译）
cd apps/api && npx tsc --noEmit

# 全量回归（~3 分钟）
cd apps/api && pnpm test:regr

# 仅 E2E
cd apps/api && pnpm test:e2e

# 生成 API.md
bash scripts/gen-api-docs.sh > API.md
```

---

## 8. 文档地图

| 想了解 | 看 |
|--------|---|
| 部署到生产 | [DEPLOYMENT.md](DEPLOYMENT.md) |
| 故障排查 / 例行运维 | [RUNBOOK.md](RUNBOOK.md) |
| 测试 / Lint / 覆盖率基线 | [CODE_QUALITY.md](CODE_QUALITY.md) |
| API 端点清单 | [API.md](API.md) (自动生成) |
| V2 → V3 数据迁移历史 | `_archive/v2-migration-scripts/README.md` |
| 阶段二完成情况 | git tag `v3-stage2-done` 的 commit message |

---

## 9. 卡住了？

1. 先看 [RUNBOOK.md 故障速查](RUNBOOK.md#2-故障速查表)
2. 跑 `curl /api/health` 看 `status` 字段
3. 跑 `npx tsc --noEmit` 看是不是编译错
4. 跑 `pnpm test:regr:<your-module>` 看是不是测试坏了
5. 都不行 → 找 on-call（[联系人](RUNBOOK.md#0-联系人--一线工具)）

欢迎加入 Phoenix ERP V3 团队 🐔🚀
