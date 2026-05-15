# Phoenix ERP V3 — 代码质量基线

> 阶段二完结时一次性盘点。每次重大变更应回到这份文档对账。
> 截止 commit ≥ `49cdc1f` + sqlite3 移除 + 阶段三准备（V2 归档/Docker/PWA/E2E）

---

## 1. 测试覆盖（双轨）

V3 采用 **单元测试 + 集成回归** 双轨制：

### 1.1 单元测试（jest, `npm test`）

| 指标 | 当前 |
|------|------|
| 套数 | 5 个 spec |
| 测试用例 | 40 |
| 全 PASS | ✅ |
| 语句覆盖率 | 12.85% |
| 分支覆盖率 | 7.45% |
| 函数覆盖率 | 10.63% |
| 行覆盖率 | 11.15% |

覆盖的关键模块：
- `auth/permissions-resolver.ts` — **100%**（RBAC 解析器）
- `auth/jwt-rotation.spec.ts` — JWT 双密钥旋转
- `modules/procurement` controller + service
- `modules/wms/inventory.service`

未覆盖的高优先级（写单测可显著拉高数字）：
- `auth/auth.service.ts`（login + token + perms 链路）
- `modules/permissions/*` （permission-sets / permissions）
- `modules/order/order.service.ts`（状态机 + 信用 + WMS 联动）
- `modules/store/pos.service.ts`（V2 fidelity sessions + 幂等）

### 1.2 集成回归（bash + curl + psql, `npm run test:regr`）

| 套件 | 用例数 | 状态 |
|------|------|------|
| `system-regression.sh` | 30 | ✅ |
| `breeding-regression.sh` | 24 | ✅ |
| `packaging-regression.sh` | 49 | ✅ |
| `wms-regression.sh` | 41 | ✅ |
| `pos-store-regression.sh` | 58 | ✅ |
| `order-regression.sh` | 33 | ✅ |
| `finance-regression.sh` | 29 | ✅ |
| `quality-regression.sh` | 22 | ✅ |
| `pda-regression.sh` | 31 | ✅ |
| `bi-regression.sh` | 23 | ✅ |
| `e2e-order-flow.sh` | 29 | ✅ |
| **合计** | **369** | **✅** |

集成测试触达每个 controller + service 的真实 HTTP 路径，实际功能覆盖率远高于 jest 数字。

---

## 2. Lint 基线

| 范围 | 工具 | Errors | Warnings | 状态 |
|------|------|--------|----------|------|
| `apps/api/src/**/*.ts` | ESLint 9 (flat config) | **0** | 507 | ✅ baseline locked |
| `apps/web/src/**/*.{ts,tsx}` | ESLint + Next config | 581 | 138 | ⚠️ 历史债 |

### apps/api 规则
配置文件：`apps/api/eslint.config.mjs`
- `@typescript-eslint/no-explicit-any` → **warn**（不阻断 CI；新代码逐步收紧）
- `@typescript-eslint/ban-ts-comment` → **error**（@ts-ignore 必须带原因 ≥5 字符）
- `no-async-promise-executor` → **error**
- `no-useless-catch` → warn
- 未使用变量 `^_` 前缀豁免

CI 中 `pnpm test:lint` 仅在 errors > 0 时阻断；warnings 数量会展示。

### apps/web 历史债说明
719 条 lint 问题（581 errors / 138 warnings）几乎全部是 `Unexpected any. Specify a different type`。
**根因**：早期 V3 前端在与 V2 后端 schema 对齐时大量用 `any` 兜底。
**清理策略**：按 module 渐进式收紧（每改一个页面顺手补类型），不一次性硬 fix。
**当前不阻断 CI**（web/.eslint config 在调试中），但 PR review 应要求至少不新增 `any`。

---

## 3. TypeScript 严格度

| 项 | apps/api | apps/web |
|---|---------|---------|
| `strict` | `false` | **`true`** ✅ |
| `strictNullChecks` | `false` | (随 strict) |
| `noImplicitAny` | `false` | (随 strict) |
| `target` | ES2021 | ES2017 |
| `module` | commonjs | esnext |

### 收紧路线（建议未来 3 个 sprint 渐进）

1. **第一步**（低风险）：API tsconfig 加 `"noImplicitOverride": true`
2. **第二步**：API 加 `"noFallthroughCasesInSwitch": true`
3. **第三步**：API 加 `"strictNullChecks": true` — **会引爆大量编译错误**，需配额修
4. **第四步**：API 加 `"noImplicitAny": true` — 同上

每一步都先在本地 build 看影响面再合入。

---

## 4. 类型安全 — 关键路径已写死

虽然 strict 没全开，以下高风险代码已用判别联合 / 强类型保护：

| 路径 | 保护方式 |
|------|---------|
| `order/sales-engine.service.ts` | `ValidationResult` 判别联合 (passed: true / false) |
| `auth/jwt.strategy.ts` | `JwtPayload` 接口 |
| `modules/order/order.service.ts` | `VALID_TRANSITIONS` 白名单 + 字符串字面量 |
| `common/guards/menu.guard.ts` | Perm 字面量 `'V'\|'C'\|'E'\|'D'\|'A'\|'X'` |

---

## 5. 安全 checklist

- ✅ 密钥：JWT_SECRET / DB_PASSWORD 全部 env，不进 git
- ✅ 密码哈希：bcrypt（V2 scrypt 已弃用）
- ✅ SQL 注入：所有 query 用 `$1` 参数化，未发现拼接
- ✅ RBAC：MenuGuard + RequireMenu decorator 强制
- ✅ V2 残表：已 DROP（`phoenix_v2_residual_tables` metric 应为 0）
- ⚠️ 输入校验：class-validator 已装但只在部分 DTO 启用；未来需统一推广

---

## 6. 监控指标（runtime 健康）

`GET /api/metrics`（Prometheus 文本格式）暴露：

```
phoenix_up                              1
phoenix_uptime_seconds                  528
phoenix_jwt_loaded                      1
phoenix_jwt_rotation_active             0
phoenix_node_memory_rss_bytes           ...
phoenix_node_memory_heap_used_bytes     ...
phoenix_orders_total{status="..."}      x
phoenix_inv_batches_total{status="..."} x
phoenix_pos_sales_today_total           x
phoenix_v2_residual_tables              0   ← 阶段三验收点
```

接 Grafana / Datadog 即可看实时趋势。

---

## 7. 常用命令

```bash
# 单元测试
cd apps/api && npm test
cd apps/api && npm run test:cov     # 含覆盖率

# Lint
cd apps/api && npm run lint
cd apps/api && npm run lint:fix     # 安全 auto-fix

# 集成回归（需 API + PG 已起）
cd apps/api && npm run test:regr     # 跑全部 11 套件 (~3 分钟)
cd apps/api && npm run test:e2e      # 仅 E2E
cd apps/api && npm run test:regr:order   # 仅订单模块

# 类型检查
cd apps/api && npx tsc --noEmit
cd apps/web && pnpm exec next lint
```

---

## 8. 增量规则（新代码应满足）

每个 PR 应：
- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npm run lint` 0 errors（warnings 不超过 baseline + 5）
- [ ] 新增/修改的控制器/服务带至少一个 spec 或 regression 用例
- [ ] 跨模块 schema 改动同步 boot migration（不要写一次性 DDL）
- [ ] 涉及金额/库存的 SQL 必须用 `$1` 参数化
- [ ] 公开端点（无 JWT）显式标注 + 文档化

不满足时 CI 会拦截或 reviewer 应要求修改。
