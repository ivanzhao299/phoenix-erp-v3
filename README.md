# Phoenix ERP V3

蛋鸡养殖全链路 ERP 系统 — 养殖 / 包装 / 仓储 / 订单 / POS / 财务 / 质检 / BI

## 快速开始

```bash
# 1) 初始化数据库
bash apps/api/scripts/init_db.sh

# 2) 一键跑 UAT (含启动 API + Web + seed + 76 用例)
bash scripts/finish-v3-uat.sh
```

期望：🟢 76/76 PASS, p95 < 10ms

## 工程结构

```
phoenix-erp/
├── apps/
│   ├── api/        # NestJS 后端 (3100)
│   └── web/        # Next.js 前端 (3000)
├── scripts/
│   ├── finish-v3-uat.sh        # 一键收口
│   ├── seed-uat-users.sh       # 种 9 个 persona
│   ├── seed-uat-fixture.sh     # 种业务基线数据
│   └── uat-runner.sh           # 跑 UAT 76 用例
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## 技术栈

- 前端：Next.js 16 + React 19 + Vanilla CSS
- 后端：NestJS 10 + TypeORM + PostgreSQL 18
- 监控：Prometheus 指标 + 健康检查
- 部署：Docker Compose

详见 [phoenix-erp-tech-stack.md](phoenix-erp-tech-stack.md)。
