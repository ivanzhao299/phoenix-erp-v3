# Phoenix ERP V3 — Shareholder Runtime Phase 1（股东权益与出资台账）

> 2026-06-01 · 建立股东权益、应缴/实缴/未缴出资、按项目/公司/场区授权的查看范围基础 Runtime。

---

## 1. 业务背景

金凤凰控股集团下多个项目/公司/场区股东结构不一致，部分项目出资未完全按股比到位。本阶段建立股东权益与出资台账 Runtime，并以**按项目授权的查看范围**替代「单一大角色看全集团」。

## 2. 股东权限设计原则

- **股东查看权限 = 按项目/公司/场区授权（shr_shareholder_scopes）**，不依赖 ROLE_SHAREHOLDER 单一大角色。
- 驾驶舱「菜单」只决定能否打开；「能看到哪些项目」由 scope 决定。
- **无 scope → 看不到任何项目数据**（fail-safe）。
- ROLE_ADMIN 例外（全局）；其余角色按 scope 过滤。

## 3. 项目股权结构

| 项目 | 编码 | 公司 | 场区 | 出资状态 | 股东(股比%) |
|------|------|------|------|----------|------------|
| 东鹏蛋鸡养殖场 | SHR-DONGPENG-LAYER | COMP-LAO-XINGCHI | SITE-DONGPENG-LAYER | **PAID_IN_FULL** | 朱兆存59.8 / 赵永伟17.5 / 宋雷7.5 / 符强6.5 / 朱召安4.35 / 陈逸飞4.35 |
| 孟赛蛋鸡养殖场 | SHR-MENGSAI-LAYER | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | PARTIALLY_PAID | 朱兆存50 / 赵永伟25 / 宋雷25 |
| 万象食品厂 | SHR-VTE-FOOD | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | PARTIALLY_PAID | 朱兆存30 / 赵永伟30 / 薛峰40 |

三项目股比合计均 = **100.00%**（误差 0）。

## 4. 数据库表设计（`migrations/20260601_shareholder_runtime_phase1.sql`，幂等）

| 表 | 用途 | 关键字段 |
|----|------|----------|
| `shr_projects` | 股东项目 | project_code(uniq), company_code, site_code, project_type, capital_status |
| `shr_shareholders` | 股东档案 | shareholder_code(uniq), shareholder_name, linked_user_id |
| `shr_project_equity` | 项目股权结构 | project_code+shareholder_code(uniq), equity_ratio(百分比), subscribed/paid_in, **unpaid_capital(计算列)** |
| `shr_capital_contributions` | 出资台账 | contribution_no(uniq), amount, source_type, status(DRAFT/CONFIRMED/CANCELLED) |
| `shr_shareholder_scopes` | 股东查看范围 | user_id, scope_type(GROUP/BU/COMPANY/SITE/PROJECT), scope_code, project_code, can_* |

- `unpaid_capital` 为 PostgreSQL **GENERATED 计算列** = 应缴 - 实缴（DB 维护，TypeORM 标 insert/update:false）。
- `equity_ratio` 按百分比保存（如 59.8）；约束允许小数 0.01 误差。

## 5. API 清单（`@Controller('api/shareholders')`，MenuGuard）

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | /projects · /projects/:code | MENU_SHAREHOLDER_VIEW 'V' |
| POST/PATCH | /projects · /projects/:code | MENU_SHAREHOLDER_MANAGE 'C'/'E' |
| GET/POST/PATCH | / · /:code（股东档案） | VIEW 'V' / MANAGE 'C'/'E' |
| GET/POST/PATCH | /equity | VIEW 'V' / MANAGE 'C'/'E' |
| GET/POST | /contributions | CONTRIBUTION 'V'/'C' |
| POST | /contributions/:id/confirm · /cancel | CONTRIBUTION 'A'(确认) / 'E'(取消) |
| GET/POST/DELETE | /scopes | SCOPE 'V'/'C'/'D' |
| GET | /dashboard · /dashboard/:code | DASHBOARD 'V'（scope 过滤） |

## 6. 权限设计（rbac.matrix.ts 静态矩阵 + DB sys_role_menu_permission）

| 菜单 | ADMIN | CEO | HQ_FINANCE | FIN_ACCT | AUDITOR | 其他 |
|------|:-----:|:---:|:----------:|:--------:|:-------:|------|
| VIEW | 全 | V,X | V,X | V,X | V,X | — |
| MANAGE | 全 | V,C,E,A,X | V,C,E,X | V | V,X | — |
| CONTRIBUTION | 全 | V,A,X | V,C,E,**A**(确认) | V,**C**(录入),X | V,X | — |
| SCOPE | 全 | V,C,E,D,X | V,C,E,D,X | — | V | — |
| DASHBOARD | V,X | V,X | V,X | V,X | V,X | FACTORY_MGR/CASH V,X(股东本人) |

- **股东本人**（朱兆存=CEO、符强/宋雷=FACTORY_MGR、朱召安=CASH、赵永伟=ADMIN）通过其角色可打开驾驶舱，**实际可见项目由 scope 控制**，不因角色获全局。
- 静态矩阵=API 放行；DB sys_menu+sys_role_menu_permission=前端侧边栏可见性（已同步）。

## 7. 股东范围控制

| 用户 | scope_type | 范围 | 可见项目 |
|------|:----------:|------|----------|
| 赵永伟 | GROUP | ORG-GROUP | 全部（持股3项目） |
| 朱兆存 | GROUP | ORG-GROUP | 全部（⚠️待确认是否全集团查看） |
| 宋雷 | PROJECT×2 | 孟赛 + 东鹏 | SHR-MENGSAI-LAYER + SHR-DONGPENG-LAYER（东鹏7.5%） |
| 符强 | PROJECT | 东鹏 | SHR-DONGPENG-LAYER |
| 朱召安 | PROJECT | 东鹏 | SHR-DONGPENG-LAYER |
| 陈逸飞 / 薛峰 | — | 无系统用户 | 仅建股东档案，不建 scope |

驾驶舱解析逻辑 `resolveAccessibleProjects`：ROLE_ADMIN→ALL；GROUP/BU→ALL；PROJECT→指定项目；COMPANY/SITE→匹配项目；无 scope→空（不显示任何项目）。

## 8. 与 Finance V2 耦合

**耦合差距清单：**

| 项 | 现状 |
|----|------|
| 是否已有 fin_shareholder_contributions | ✅ 存在（Finance V2，另含 fin_shareholder_settlements、prc2_shareholder_funds） |
| 是否需要桥接 | 是 — 本阶段 `shr_capital_contributions` **保持独立台账**，不破坏现有 Finance V2 股东资金 |
| 是否需要一键同步 | 建议 Phase 2：`shr_capital_contributions` 确认(CONFIRMED)后可选写入 `fin_shareholder_contributions` |
| 是否需从既有「股东资金」反向生成 | 建议 Phase 2：提供反向导入，把 fin_shareholder_contributions / 烟台分红转投资 / 老挝鸡场投资款明细 归集为 shr_capital_contributions |

本阶段**先建独立台账**，不强制回填历史；不改动 Finance V2 现有逻辑。

## 9. 后续历史出资导入计划

1. 归集「老挝鸡场投资款明细」「烟台分红转投资」等历史数据 → shr_capital_contributions（source_type=BANK_TRANSFER / DIVIDEND_OFFSET 等）。
2. 回填各项目 shr_project_equity 的 subscribed_capital / paid_in_capital → 自动算出 unpaid_capital。
3. 与 fin_shareholder_contributions 做一致性对账，建立桥接/同步。
4. 扩展驾驶舱接入经营指标（销售/库存/AR/AP/现金/分红预留/利润）。

## 10. 风险与待确认项

| # | 项 | 说明 |
|---|----|------|
| 1 | 朱兆存查看范围 | 默认 GROUP（全集团），待业务确认是否收敛 |
| 2 | 应缴/实缴金额 | 本阶段未回填（仅股比），待历史出资导入 |
| 3 | 陈逸飞/薛峰 | 无系统用户，仅股东档案；如需登录查看需先建账号再绑 scope |
| 4 | BU scope 展开 | 当前 BU 简化为等同集团，后续按 BU→公司精确展开 |
| 5 | Finance V2 桥接 | 独立台账，同步策略待 Phase 2 |
| 6 | 驾驶舱指标 | 本阶段仅基础卡片（出资状态/股东数/股比），经营指标后续接入 |

---

## 验证（§10）

| 项 | 结果 |
|----|------|
| 迁移幂等 | ✅ 二次执行 0 新增 |
| 三项目股比合计 | ✅ 均 100.00% |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，本模块新增不在其测试范围，非回归） |

## 交付清单

- `apps/api/migrations/20260601_shareholder_runtime_phase1.sql`（5 表 + 初始化 + 菜单注册 + 授权）
- `apps/api/src/modules/shareholder/`（5 entities + dto + service + controller + module）
- `apps/api/src/app.module.ts`（注册 ShareholderModule）
- `apps/api/src/common/guards/rbac.matrix.ts`（5 个 MENU_SHAREHOLDER_*）
- `apps/web/src/lib/shareholder-api.ts` + `apps/web/src/app/(admin)/shareholders/`（6 页面）
- `apps/web/src/components/layout/Sidebar.tsx`（股东权益中心导航组）
