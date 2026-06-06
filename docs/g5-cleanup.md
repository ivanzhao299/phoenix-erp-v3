# G5 Cleanup — 遗留项扫尾报告

完成时间：2026-06-06

## 1. 范围

G5-A → G5-D 推完后梳理 8 项遗留，本期完成 5 项，2 项留 G5++。

## 2. 已完成（commit + tag `v3-g5-cleanup`）

### ❼ sys_dict.PKG_EGG_GRADE 标 DEPRECATED

- migration `20260606_g5_cleanup_pkg_egg_grade_deprecated.sql`
- BFF dicts 已不读该字典 → 安全停用
- 主数据中心 UI 仍可展示但状态显示为"已废弃"

### ❺ glp1a2_meng_sai_master_data 其它 4 张表镜像 apps/api/migrations

- mst_products / prc2_suppliers / sal_customers / fin_cash_accounts 全补全
- 每段 IF EXISTS 兜底，CI 测试库无表时段内跳过
- 现 CI 测试库与生产 schema 更接近

### ❸ G5-A++ isMenuRegistered 改读 sys_menu 缓存

- 新增 `apps/api/src/common/guards/menu-registry.service.ts`
- 启动期（main.ts bootstrap 后）调用 `hydrateMenuRegistry(em)`
  - 从 sys_menu 表加载所有 menu_code 到 Set
  - 失败回退到 rbac.matrix.ts keys
- MenuGuard 改 import 路径：`./rbac.matrix` → `./menu-registry.service`
- 业务方在主数据中心加菜单不再需要改代码 + 重新部署，只需重启 API 服务（或后续加 reload endpoint）

### ❹ G5-E /master/farms 页面级 perm 守卫

- 加 `usePermission("MENU_MASTER")` 检查
- 无权限用户进入页面 → 显示"无权限"提示，不渲染 CrudForm
- 业务录入用户（如孟赛生产数据主管）不再能进入此页

### ❽ G5-C 巡检加 POST/PUT 覆盖

- `scripts/g5c-rbac-audit.sh` 加 `check_write_method` 函数
- admin POST `/api/product-master/grades` 期望 400（守卫通过但 body 校验拒）
- 业务上不实际改变数据，仅验"endpoint 守卫存在且 admin 能命中"

## 3. 未完成（留 G5++ 独立 sprint）

### ❷ G5-D++ generic-crud 切到 DataScope

**为什么不本期做**：generic-crud 是所有表通用入口，每次请求都跑 DataScope 解析会影响性能（DB 查询 + 缓存逻辑），需要专门设计：
- 缓存 dataScope 在请求生命周期（CLS 已有）
- 表→维度映射表（buildScopeFilter）单独抽象
- 影响 15+ 业务表的行级过滤，需逐表验证

**临时状态**：仍用 `req.user.storeCode` + 我前面修的 `BRD_SCOPE_FIELD` 表分维度 — 工作正常但不优雅。

### ❻ daily 页面「按 9 档录入」UI

**为什么不本期做**：后端已 ready（`brd_daily_logs.eggs_by_grade` JSONB + service 接受字段），但前端 UI 改动大：
- 每个班次行加"分档"抽屉 / popover
- 9 档输入与"总产蛋数"自动校验和
- 与现有 row 表格视觉布局协调

**临时状态**：业务方可在 daily-inbound 页面录 9 档（独立提交），与 daily 日报双轨录入。eggs_by_grade 字段已可被后端接受，前端 UI 后补即可。

## 4. 后续 Roadmap

```
G5-cleanup (今天)：5 项 quick wins ✅
G5-D++     (1-2 周)：generic-crud DataScope 改造 + scope-audit 自动化
G5-cleanup++ (1 周)：daily 9 档录入 UI
G5-E++     (随后)：剩余 8 个主数据维护页（mst_products/prc2_suppliers 等）加同款 perm 守卫
```

---

**Tag**：`v3-g5-cleanup`
**Migrations 新增**：2
**Code 改动**：5 文件
**Scripts 改动**：g5c-rbac-audit.sh
