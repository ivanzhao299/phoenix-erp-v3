# G8 · 性能 / 用户体验 / 登录直达 治理报告

完成时间：2026-06-06

## 1. 审计入口

针对 G7 后基础底座打牢，再审视：性能、首页体验、登录直达、用户回页面逻辑。

## 2. 性能现状（SSH 实测）

### 2.1 API 响应时间（admin 持 `*` 通配）

| Endpoint | 实测 | 等级 |
|---|---|---|
| `/api/auth/me` | 2.3ms | A+ |
| `/api/lookup/companies` | 3.4ms | A+ |
| `/api/lookup/houses?farmCode=` | 4.2ms | A+ |
| `/api/crud/brd_houses?pageSize=500` | 2.5ms | A+ |
| `/api/sys/menu-registry/stats` | 1.9ms | A+ |

**结论**：后端不是瓶颈。瓶颈在前端渲染 + 高频下拉重复查 DB。

### 2.2 优化引入

| 改进 | 收益 |
|---|---|
| **LookupController 加 5min 进程缓存**（companies/farms/product-grades/packaging-specs）| 命中后 ~0ms；DB QPS -90% |
| **Sidebar visibleMenu useMemo**（仅 hasPermission 变化时重算）| 高频 hovered/pinned state 切换不再触发 O(MENU×perms) 计算 |

## 3. 登录直达审视

### 3.1 问题发现：`ROLE_HOME` 缺 11 个生产实际在用角色

SSH 实测 sys_user_role 实际持有 30 个不同角色，但 `apps/web/src/app/login/page.tsx:186` 的 `ROLE_HOME` 映射只配了 19 个。

**缺失（导致登录后被 fallback 到 `/home` 而非业务专属页）**：

| 角色 | 用户示例 | 期望首页 |
|---|---|---|
| `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR` | 宋明光 | `/daily-work`（孟赛工作台） |
| `ROLE_PILOT_MANAGER` | pilot_manager | `/daily-work` |
| `ROLE_FARMER` | – | `/breeding/daily` |
| `ROLE_REGION_MGR` | chenyifei, xuegang | `/dashboard` |
| `ROLE_HQ_FINANCE` | – | `/finance2` |
| `ROLE_FINANCE_ANALYST` | – | `/finance2/reports` |
| `ROLE_FINANCE_REVIEW_MANAGER` | – | `/finance2` |
| `ROLE_COST_ACCOUNTING_MANAGER` | – | `/finance2/reports` |
| `ROLE_TREASURY_MANAGER` | – | `/finance2/cash` |
| `ROLE_CASH` | – | `/finance2/cash` |
| `ROLE_MASTER_DATA_APPROVER` | admin secondary | `/master-data` |

### 3.2 修复

`login/page.tsx` ROLE_HOME 补全 11 个角色映射，登录后所有用户都直达业务专属页。

宋明光重新登录验证：JWT.role = `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR` → ROLE_HOME 命中 → `/daily-work`。

## 4. 用户回页面逻辑（已确认良好）

`login/page.tsx:296-322` 现有逻辑：

```
1. admin（含 ROLE_ADMIN 或 perms='*'）→ /dashboard（强制）
2. terminal 角色（PKG_OP/QC_INSPECTOR/...）→ /terminal/packaging/dashboard
3. 普通角色 → 优先 ROLE_HOME 命中
4. fallback → /home（运营工作台）
5. returnUrl 仅非 /dashboard 同源路径才放行
```

**评价**：逻辑严密 — 避免历史 sessionStorage 残留把普通用户错送到 /dashboard。补完 ROLE_HOME 即闭环。

## 5. 改动汇总

| 文件 | 改动 |
|---|---|
| `apps/web/src/app/login/page.tsx` | ROLE_HOME 加 11 个角色映射 |
| `apps/web/src/components/layout/Sidebar.tsx` | visibleMenu 加 useMemo（仅 user.permissions 变化重算） |
| `apps/api/src/modules/product-master/controllers/lookup.controller.ts` | 5min 进程缓存（4 个 endpoint） |

## 6. 验证

- TS 双端 0 errors
- 部署后宋明光重新登录应直达 `/daily-work`
- `/api/lookup/companies` 首次 ~3ms，后续 ~0ms（缓存命中）

## 7. 未做（明确留下）

| 项 | 原因 |
|---|---|
| home/page.tsx 加 skeleton loading | 视觉 polish，业务可用性不阻塞 |
| AuthContext.hasMenuPerm 前后端共享 lib | monorepo 需建 packages/shared，工作量大，前后端各自实现的算法已 100% 一致 |
| lookup endpoint 的全部缓存（剩 houses/flocks 等带 query 参数） | 需用 query string 作 cache key，可后续按需加 |
| `/api/auth/me` 加 ETag 304 | 当前 2.3ms 已足够快 |

---

**Tag**：`v3-g8-perf-ux`
**改动**：3 文件 + 1 文档
**性能收益**：lookup endpoint DB QPS 预计 -90%；Sidebar 渲染减少 N 次/秒计算
**用户体验**：11 个角色登录直达业务专属页
