# 采购项目 403 与资金账户公司过滤缺陷闭环（2026-09-08）

## 结论

- 采购项目 403 的根因是同一功能使用了两个菜单码：侧栏与采购角色配置使用
  `MENU_PRC2_PROJECT`，重定向后的统一项目 Runtime 只校验 `MENU_MD_PROJECT`。
  不是 `perms_version` 陈旧，也不是权限集漏合并。
- AR 收款拒绝 DP-10 是正确的后端保护。DP-10 实属东鹏星驰，收款单公司是
  `COMP-LAO-AGRI`；缺陷在于前端下拉没有按单据公司过滤，允许用户误选。
- 本次不改资金、库存权威语义，不执行生产 DML，不修改角色配置。

## 生产只读取证

受保护 GitHub Actions workflow：

- 首次 run `34181919859`：只读事务成功导出用户与权限源后，审计 SQL 使用了
  不存在的 `sys_menu.menu_name` 列而失败；没有生产写入。
- 修正后 run `34182026964`：成功；生产 revision
  `6b01e931ede98094cb6936327ee7155745bb27c7`，checkout/API/Web 三方一致；
  `PASS PRODUCTION_BUSINESS_WRITES=0`。

关键事实：

| 证据 | 生产值 |
|---|---|
| 用户 | `wanglejin` / 王乐金 / ACTIVE / `perms_version=111` |
| 可见角色 | `ROLE_PRC_BUYER`（主）、`ROLE_SUPPLIER_MASTER_MGR` |
| 项目有效权限源 | `role:ROLE_PRC_BUYER → MENU_PRC2_PROJECT:V,C,E,D,A,X` |
| `MENU_MD_PROJECT` | 菜单已注册，但采购专员无授权 |
| 权限集绑定 | 用户直绑 `PSET_PROCUREMENT_APPROVE`，未贡献项目菜单权限 |
| DP-10 | 东鹏星驰（`COMP-LAO-XINGCHI`），LAK，ACTIVE |

因此重新登录只会把同一份 `perms_version=111` 权限矩阵重新签入 JWT，仍会 403；
无需通过 bump 版本或生产 DML 解决。

## 菜单码全链

1. `/procurement2/projects` 侧栏入口要求 `MENU_PRC2_PROJECT`。
2. 页面立即重定向 `/master-data/projects`。
3. `MasterDataRuntimePanel(type="project")` 请求
   `/api/master-data/runtime/project`。
4. `MasterDataTypeGuard` 原先仅接受 `MENU_MD_PROJECT`。
5. 旧 `/api/v2/procurement/projects` 与 `/api/biz/projects` 仍接受采购菜单码，后者已把
   `MENU_MD_PROJECT` 作为兼容码，进一步证明 Runtime 门禁语义不一致。

修复后 project Runtime 明确接受 `MENU_MD_PROJECT` 或 `MENU_PRC2_PROJECT`，前端新增/
编辑按钮使用相同 OR 语义；其他主数据类型仍保持原子菜单隔离。

## 资金账户链与修复

- `/api/lookup/cash-accounts` 已正确实现 `company`、`currency`、ACTIVE 与 DataScope
  的交集过滤；根因是 AR 调用点只传了币种。
- AR 收款现传 `companyCode=form.companyCode`，切换公司时清空旧账户值。
- AP 付款、报销、管理端 POS、终端 POS 原本已传公司，无需改动。
- 资金调拨的转入账户现按转出账户公司与币种过滤；切换转出账户时清空转入账户。
  API 同时拒绝跨公司、跨币种账户组合，防止绕过 UI。
- 股东现金归还现按出资记录公司与币种过滤；执行端同时核对现金账户公司。
- Finance V2 资金账户列表卡片与编辑弹窗新增只读公司展示，格式“名称（编码）”。
  普通编辑不允许迁移公司归属，避免已有流水的历史公司语义被改写；列表公司名从
  `sys_organizations` canonical projection 获取，旧冗余名称仅作 fallback。

## 回归与门禁

本地结果：

- API `tsc --noEmit`：PASS。
- Web `tsc --noEmit`：PASS。
- API 针对性：3 suites / 7 tests PASS；新增 project 双菜单码与调拨同公司/同币种用例。
- API 全量（`NODE_ENV=test`）：97 suites PASS、1 skipped；796 tests PASS、6 skipped。
- Web 全量：105 files / 569 tests PASS；包含资金账户 URL 公司参数与切换公司重载用例。
- 若外层环境保留 `NODE_ENV=production` 直接调用 Jest，畅捷通收敛用例会执行生产等待并
  出现两个 5 秒 timeout；用仓库测试语义 `NODE_ENV=test` 重跑全量为 PASS。

## 前端路由守卫二次闭环（2026-09-08）

### 根因与重定向发起者

后端 Runtime 双菜单码修复上线后，wanglejin 仍被送回运营工作台。实际链路为：

1. 侧栏“采购项目”凭 `MENU_PRC2_PROJECT:V` 展示并进入 `/procurement2/projects`；
2. 兼容页服务器重定向至 `/master-data/projects`；
3. `(admin)/layout.tsx` 对重定向后的最终 pathname 再调用 `canAccessPath()`；
4. Sidebar 路由映射中的“项目档案”原先只认 `MENU_MD_PROJECT:V`，判定失败后由
   `getFirstAccessiblePath()` 选中该用户第一个可见入口，表现为静默进入运营工作台。

因此发起运营工作台回退的是管理端布局的客户端菜单路由守卫，不是 Next middleware、
项目 Runtime 页面或后端 API。修复是在 `/master-data/projects` 菜单映射增加
`altPerms: ['MENU_PRC2_PROJECT']`，与 Runtime 面板、`MasterDataTypeGuard` 的既有 OR
语义完全一致；未给其他 `/master-data/*` 类型增加任何兼容码。

### 全站同款断层审计与修复

审计覆盖 Sidebar 全部叶子路径、兼容重定向、页面 `usePermission`/`can*` 与对应后端
guard，确认并同批收口三处真实断层：

| 页面/入口 | 原断层 | 修复口径 |
|---|---|---|
| 鸡舍管理 | 入口与 generic CRUD 要求 `MENU_FARM_MASTER`，页面按钮误用 `MENU_FARM_DATA` | 页面写操作统一 `MENU_FARM_MASTER:E` |
| 库存调拨 | 入口要求 `MENU_WMS_INOUT`，页面及专用 API 要求 `MENU_INV_BATCH:E` | 入口/路由统一 `MENU_INV_BATCH` |
| 每日工作台“原料入库” | 快捷卡要求 `MENU_INV_MANUAL_INBOUND:E`，目标页及 API 要求 `MENU_WMS_INOUT:C` | 快捷卡统一 `MENU_WMS_INOUT:C` |

旧兼容路径 `/store/daily`、`/settings/organizations`、`/settings/profile`、`/master/orgs`、
`/master-data/user-orgs`、`/settings/permissions` 当前均无 Sidebar 入口，不构成本次“入口码
与目标守卫码不一致”的可达断层。

### 二次闭环验证

- 定向路由权限测试：2 files / 8 tests PASS；新增 wanglejin 等价权限场景，覆盖
  `/procurement2/projects` → `/master-data/projects`，并断言不能进入客户主数据。
- API `tsc --noEmit`：PASS；Web `tsc --noEmit`：PASS。
- 权限静态门禁：frontend menu gates、menu permission atomicity、sensitive menu guards
  全部 PASS（0 findings）。
- Web 全量：106 files / 573 tests PASS。
- API 全量：97 suites PASS、1 skipped；796 tests PASS、6 skipped。
- 首次 API 全量命令误传额外 `--`，Jest 将 `--runInBand` 当成文件 pattern，因“无测试”
  退出；修正为仓库原生 `NODE_ENV=test pnpm test` 后取得上述真实全量结果。
- 部署后只读 manifest 增加三项 wanglejin 断言：JWT 菜单权限为
  `MENU_PRC2_PROJECT:V` 且无 `MENU_MD_PROJECT:V`、旧路径 307 精确指向共享项目页、共享
  项目页返回 200；原 Runtime 200、revision 三方一致和错误窗口断言继续保留。
- PR #208 合并 revision `d8c4ed9caf5dee64a06676c2323e82f8c83695ff`；full deploy run
  `34185942772` 成功（双端镜像、SSH 部署与 smoke 全部完成）。
- 首次 postdeploy readonly run `34186708818` 已确认 checkout/API/Web revision 三方一致，
  随后因审计器按完整字符串比较聚合权限 `MENU_PRC2_PROJECT:V,C,E,D,A,X`，误判缺少
  `MENU_PRC2_PROJECT:V` 而失败；只读事务阻止了启动期遗留 DDL/DML，未产生业务写入。
  审计器已改为按 `menu_code:action-list` 语义解析后重跑。
- 第二次 postdeploy readonly run `34187969095` 已确认 revision 三方一致、wanglejin 权限
  来源与 project Runtime 200；旧兼容页在 Next App Router/RSC 请求语义下返回 200 redirect
  payload，并非传统 307，导致审计器的 307 预期失败。线上断言改为旧路径与最终项目页均
  200；实际客户端跨路径放行和其他主数据隔离由定向路由守卫测试覆盖。

生产部署后使用
`scripts/ops/readonly-audits/procurement-project-cash-account-defects-postdeploy.http.json`
验证：

- wanglejin GET project Runtime 返回 200；
- `company=COMP-LAO-AGRI&currency=LAK` lookup 返回的每一项公司/币种均匹配；
- checkout/API/Web revision 一致；
- 相关接口近 60 分钟错误窗口为 0；
- 审计全过程 `PRODUCTION_BUSINESS_WRITES=0`。

## 变更与回滚

- 代码：project Runtime 门禁兼容、AR/调拨/股东账户公司过滤、资金账户公司展示及服务端
  防绕过校验。
- 运维：新增前置 SQL 与部署后 HTTP 只读审计断言。
- 数据库：无迁移、无生产 DML。
- 回滚：回滚本次代码提交并重新 full deploy；无需数据回滚。

## 部署记录

- 实现 commit：`ec4c543a`；冻结/安全复核触发 commit：`f49ca877`。
- PR：[#206](https://github.com/ivanzhao299/phoenix-erp-v3/pull/206)，全部检查通过后合并。
- merge / production revision：`489fc2a7a6fc9e8d3b295ba890cabb857a0a44f7`。
- full deploy：run `34183317094`，类型检查、回归、API/Web 镜像构建、SSH 部署与通知均成功。
- postdeploy readonly audit：run `34184064157`，checkout/API/Web 三方 revision 一致；
  wanglejin 请求 project Runtime 返回 200；公司/币种过滤后的 cash-account lookup 返回 200
  且逐行断言通过；相关错误窗口 `0`；`PASS PRODUCTION_BUSINESS_WRITES=0`。
