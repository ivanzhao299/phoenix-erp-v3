# G5-C · 非 ADMIN RBAC 自动化巡检报告

完成时间：2026-06-06

## 1. 目标

CI 自动跑一组关键 endpoint 的鉴权测试：admin 必通、自定义业务录入用户在 G5-A/B 后必通、未授权路径仍拒。任何 RBAC 改动后自动验证防回归。

## 2. 实施

### 2.1 巡检脚本

`scripts/g5c-rbac-audit.sh`（bash）：

- **Phase 1**：admin 用 ADMIN_PASS 登录 → 调 10+ 关键 endpoint 应全 200
  - `/api/lookup/*`（companies / farms / houses / customers / suppliers / users / cash-accounts / product-grades / dict/:type）
  - `/api/crud/brd_houses?pageSize=500`（验 G3-A 修复）
  - `/api/v3/farm/daily-logs/eggs-breakdown`（验 G3-B 新 endpoint）

- **Phase 2**（可选，需 SONG_PASS 环境变量）：宋明光 token 调业务录入路径应 200（不再 MENU_PERMISSION_DENIED）

- **Phase 3**：admin 调主数据维护 endpoint 应 200，验主数据守卫存在但 admin 不受阻

### 2.2 CI 集成

`.github/workflows/regression.yml` 在 Module regression 后追加：

```yaml
- name: G5-C RBAC audit (admin + key endpoints)
  env:
    API_BASE: http://localhost:3100
  run: bash scripts/g5c-rbac-audit.sh "$API_BASE"
```

- 失败 → exit 1 → CI 红灯
- 显示 PASS/FAIL 矩阵 + 失败明细可直接粘 PR review
- ADMIN_PASS 从 env 取，CI 通过 secret 注入（避免硬编码）

## 3. 巡检覆盖范围

| Phase | 用户 | 路径 | 期望 |
|---|---|---|---|
| 1 | admin | `/lookup/*` × 9 | 200 |
| 1 | admin | `/crud/brd_houses` | 200 |
| 1 | admin | `/eggs-breakdown` | 200 |
| 2 (可选) | songmingguang | 业务录入路径 | 200 |
| 3 | admin | `/product-master/grades` | 200 |

## 4. 防回归场景

CI 跑过 G5-C 后能立即发现：

| 场景 | 触发条件 | 拦截位置 |
|---|---|---|
| LookupController 漏注册端点 | 新加 lookup 没在 module 注册 | `/lookup/customers` 404 |
| MenuGuard 改回静态矩阵 | 误删动态 fallback | admin 之外的角色拒 |
| 主数据守卫错配 | RequireMenu 用错 menu_code | 405/403 |
| migration 漏跑 | g5a backfill 没执行 | admin 跑非 admin 端点拒 |

## 5. 后续

- **G5-C++**：扩展覆盖 POST/PUT 写操作（需测试用户的密码 secret）
- **G5-D**：scope 类型化后，可在巡检里加 storeCode 隔离验证（业务录入用户跨站点请求应拒）
- 长期：建立"角色 × endpoint × 期望状态"配置文件 `rbac-matrix.yml`，让业务方在 PR 里改 yml 即更新巡检矩阵

---

**Tag**：`v3-g5-c-rbac-audit-ci`
**Script**：`scripts/g5c-rbac-audit.sh`
**CI**：`.github/workflows/regression.yml`
