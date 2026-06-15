# V3 精修 · B 逐用户 impersonation 实测扫描 2026-06-15

> 用影子登录(impersonate)以各角色真实身份打开落地页/工作台，抓 widget 403、范围错、空页面、死路由。

## 工具
- 后端 `POST /api/auth/impersonate`（超管签发目标用户真实会话）+ 前端影子横幅。
- 浏览器注入 token → 打开页面 → 抓控制台 403/404 + 截图。

## 已测角色（7）与结论

| 角色 | 用户 | 落地/主页 | 结论 |
|------|------|-----------|------|
| 超管 | admin | /dashboard | 全量基线 ✓ |
| 店长 | 陈玲 | /store | pos_sales/store_receiving **403→已修**；/home 残留 widget 403(小) |
| 采购 | 王乐金 | /procurement2 | 侧边栏正确，采购审批菜单齐 ✓ |
| 出纳 | 王玮华 | /home + /finance2/cash-accounts | /home 干净；CTA"数据质量驾驶舱"略怪(小) |
| 场长 | 谢继领 | /breeding | 渲染干净但**养殖总览空**（根因见下）|
| 销售经理 | 郭大鹏 | /sales2 | 页面完整、零报错 ✓ |
| 司机 | 阿坚 | /sales2/delivery | 极简侧边栏、最小权限 ✓ |

**核心结论：绝大多数角色页面渲染干净、权限收窄正确，核心健康。** 问题是点状的。

## 关键发现 & 处置

1. **🔴 M-SCOPE-1（系统性·最大根因，G122 修复）**：`sys_user.store_code`（驱动 generic-crud 行级数据范围）陈旧——G114 只更新 sys_user_orgs 绑定、没同步 store_code。32 在岗用户多为 `FARM-MS/STORE-MS-001/AREA-ZHU` 等与 org_code 对不上的旧码 → 行级过滤匹配不到 → 场长看空养殖、店长看空销售等"假空"。
   修复 `migrations/20260615_g122_sync_user_store_code.sql`：store_code ← 主绑定 org_code（GROUP→'ALL'）。
2. **🟢 M-STORE-1（已修）**：门店工作台 pos_sales/store_receiving 403 → 通用 CRUD 补 pos_/store_ 表菜单映射。
3. **🟢 CEO 画面泄漏（已修）**：/dashboard 加页面级守卫 + 中间件根路径/越权回弹改 /home。
4. **🟡 M-FIN-1（小·待清）**：ROLE_HOME 映射 `/finance2/cash` 是死路由(404)，真路由 `/finance2/cash-accounts`。普通用户走 /home 未触发，latent。
5. **⚪ 小记**：/home 店长残留 widget 403；出纳 CTA 偏题；司机配送单"新建"按钮是否该有；brd_farms 有 F-DEBUG 测试行待删。

## 后续
- 部署 G122 后复验：impersonate 谢继领 → /breeding 应看到孟赛场数据。
- 继续 M2…逐模块/逐角色扫；M-FIN-1 等小项批量清。
