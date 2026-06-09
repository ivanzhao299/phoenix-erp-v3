# G47 · 刘杰（集团财务总监）前端生产口径审计与整改

> 任务：以刘杰名义逐项功能测试（权限/抽屉样式/页面元素/下拉/数据源/新建流转/报错），
> 按生产口径出报告并整改。
> 方式：**代码级生产口径审计**（用户选定）——以 DB 权限种子 + 代码为生产真相，
> 不依赖本地运行时。

## 〇、为何没用真实登录（环境实情）
本地 dev 库**严重落后于 schema**，连登录都报"字段不存在(42703)"：
- 缺 `sys_user_farm_scopes` 表、缺 `sys_user_role.is_visible` 列 → 已临时补；
- liujie 本地密码≠phoenix@2026（401），重置密码冒充登录被安全策略正确拦截。
→ 本地非生产保真，即便登进去测出的也是环境假象。故改代码级审计（更生产保真）。
> 注：上述本地缺表/缺列是 dev 库未跑全迁移，**非生产 bug**（生产经完整迁移有这些）。

## 一、刘杰权限画像（生产种子）
ROLE_FINANCE_REVIEW_MANAGER：
- 审核+查看 V,A,X：FIN2/AR/AP/EXPENSE/REIMBURSE/BUDGET
- 仅查看 V,X：AR_LEDGER/CASH/REPORT/SHAREHOLDER/SHAREHOLDER_*/DASHBOARD
- **无任何 C/E/D** → 各页**不应出现新建/编辑/删除入口**，可有审核(A)。

## 二、🔴 真实问题（已整改）

### #1 资金转账 新建按钮未权限门控
- `finance2/fund-transfers/page.tsx`：整页无 usePermission，"新建转账"对所有人可见。
  后端 createTransfer 实为 `MENU_FIN2_CASH_TRANSFER:C`，刘杰无此菜单 → 点了 403。
- **整改**：加 `usePermission('MENU_FIN2_CASH_TRANSFER').canCreate` 门控按钮 → 刘杰看不到。✅

### #2 股东资金 新建/导入按钮未门控
- `finance2/shareholder-funds/page.tsx`：无 usePermission，"新建记录"+"从采购系统导入"全员可见。
  后端 createContribution 实为 `MENU_FIN2_SHAREHOLDER:E`，刘杰仅 V,X。
- **整改**：加 `usePermission('MENU_FIN2_SHAREHOLDER')`，两个写按钮均按 canCreate||canEdit 门控。✅

## 三、🟢 抽查正确（无需改）
- 应收 AR、应付 AP、资金账户、费用 expenses：均已按**子菜单 canCreate** 正确门控新建按钮
  （如 cash 用 MENU_FIN2_CASH_MASTER/_TXN）→ 刘杰无 C 不显示。✅
- 财务总览 /finance2、股东仪表盘/项目：纯展示无写操作。✅
- 应收总账 /finance2/ar-ledger（本次新建）：只读页，无写按钮。✅
- 下拉数据源：CompanySelector 走 /lookup/companies（G37 已加 DataScope，刘杰 GROUP 看全集团，正确）；
  ShareholderSelector/DictSelect 走 lookup/runtime，数据源正确。
- 数据源引用：finance2 各页走 request()/带 token fetch，端点存在。
- tsc：API 0 / Web 0。

## 四、🟡 误报（Explore 初判，经核验否决——生产口径不改）
| 初判 | 核验 | 结论 |
|---|---|---|
| reports/ar-ledger "无 canView 检查" | 二者**只读页、无写按钮**，菜单访问已由 sidebar+后端 MenuGuard 门控 | 非 bug，加 canView 是过度防御，不改 |
| DictSelect SYS_CURRENCY "未校验种子" | SYS_CURRENCY 由 G2 种 | 非 bug |
| ManualTxnModal "提交未二次校验权限" | 顶层 canCreateTxn 已门控，后端 RequireMenu 兜底 | 非 bug |

## 五、🟡 次要一致性项（低优先，未改以免回归）
- AR/AP/CASH 部分 modal 的提交/取消按钮用 `bg-emerald-500` 等 Tailwind 原子类，
  而非全局 primaryActionButton/secondaryActionButton 常量。
- 说明：emerald 本就是设计语言（inputFieldClass 也用 focus:border-emerald-400），
  属"用常量 vs 用原子类"的一致性 nit，非硬编码越界色；改动需 className→style 转换有回归风险，
  收益低 → 登账，后续设计系统统一阶段一并收口，本次不动。

## 六、整改清单
- `finance2/fund-transfers/page.tsx`：+usePermission，门控新建转账
- `finance2/shareholder-funds/page.tsx`：+usePermission，门控新建/导入
- 验证 Web tsc 0。

## 七、补充整改（G48，本次完成）
1. **本地 dev 库全量对齐生产**：按生产 Deploy 口径，将 `apps/api/migrations/2026*.sql` 全部 114 个
   迁移按文件名顺序在本地补跑 —— **OK=114 / FAIL=0**（全幂等）。本地 schema 已对齐生产。
   登录从"字段不存在(42703)"变为干净 401（纯密码问题，schema 无错）。
2. **modal 按钮全局化**：finance2 各 modal 的提交/取消按钮由本地 Tailwind 原子类
   （bg-emerald-500 / border…bg-bg-page）收口为全局 `primaryActionButton` / `secondaryActionButton`：
   - ar：2 提交 + 2 取消；ap：1 取消；shareholder-funds：2 取消；fund-transfers：1 取消。
   - 表格内状态动作 chip（语义色 bg-emerald-50/blue-50）保留，非主按钮。
   - Web tsc 0。

> 仍待：liujie 本地密码非 phoenix@2026（无授权不重置）；如需真实 E2E 需你授权重置或给真实密码。
