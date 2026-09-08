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

待 CI、PR 合并、full deploy 与生产复验完成后补录最终 commit、PR、deploy run、revision
及 postdeploy audit run。
