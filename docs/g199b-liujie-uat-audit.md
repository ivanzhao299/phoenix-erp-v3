# 刘杰(财务审核经理 / 财务总监 / 总部财务审计)UAT 审计 v1

> **审计时间**: 2026-06-19
> **审计方式**: zhaoyongwei 影子登录 → 逐页 take_screenshot + take_snapshot
> **截图目录**: `data/_liujie-uat/01-17 .png`(已 gitignore)
> **铁律**: 本文件**只列问题不动手**。等用户拍板每条修/不修/暂缓,我才小步改+截图比对再推

## 用户身份
- **username**: liujie(ID 155)
- **角色**: 财务审核经理 / 财务总监 / 总部财务审计 +4(共 7 个角色)
- **门店**: ALL(集团视角)
- **核心场景**: 应收应付审核 / 现金账户监控 / 三方对账(g199-C)/ 月末关账(g199-E)

## 已审 16 页(去重)

| 页面 | URL | 关键发现 |
|------|-----|----------|
| 仪表盘 | `/dashboard` | 问题 #1 影子头像 / 问题 #2 非财务 KPI |
| 财务总览 | `/finance2` | 问题 #6 缺 g199 入口 |
| 应收账款 | `/finance2/ar` | 问题 #7 录入按钮 / 空数据 |
| 应付账款 | `/finance2/ap` | 同 #7 / 空数据 |
| 应收总账 | `/finance2/ar-ledger` | 数据 OCR_PENDING_VERIFY(待入账) |
| **应收三方对账** | `/finance2/ar-reconciliation` | 60 行差异(56 重大) / 问题 #3 #4 #5 |
| 好业财同步 | `/finance2/chanjet-sync` | 公司下拉正确(对比 #3) |
| 资金账户 | `/finance2/cash-accounts` | 58 账户 / KPI 正常 |
| 资金调拨 | `/finance2/fund-transfers` | 空数据 / OK |
| 股东资金 | `/finance2/shareholder-funds` | 11 笔记录 / OK |
| 费用管理 | `/finance2/expenses` | 空数据 / OK |
| 报销管理 | `/finance2/reimbursements` | 空数据 / OK |
| **🔴 财务报表** | `/finance2/reports` | **P1 React #310 崩页** |
| 审批待办 | `/workflow/todos` | 0 条 / OK |
| BI 经营驾驶舱 | `/analytics` | 同 #2 / 全养殖 KPI |
| 财务分析(BI) | `/analytics/finance` | 路由错 → 实指向 `/finance2/reports`(同上崩) |

---

## 问题清单

### 🔴 P1 — 高优(影响核心场景)

#### #8 财务报表页 React #310 崩 — **影响最大,刘杰核心场景之一**
- **现象**: `/finance2/reports` 进入显示 error boundary "页面出现了意外错误",刷新无效
- **截图**: `data/_liujie-uat/14-reports.png`
- **Console 错误**:
  ```
  Error: Minified React error #310
  at I (...0twrzxil6zr7m.js:1:3462) ← page 组件内
  ```
- **React #310 含义**: 通常是 **hooks 调用违规**(条件 hook / hook 数量在 render 间不一致),少数是 useMemo 依赖问题
- **影响**:
  1. 财务总监打不开"经营报表" — 12 只读聚合报表(账龄/资金日报/费用统计/可支配资金/项目财务)全废
  2. BI 经营分析 → 财务分析 同路径,也连带崩
- **位置(推测)**: `apps/web/src/app/(admin)/finance2/reports/page.tsx`
- **状态**: ⏳ 等用户决定(强烈建议立刻修)

### 🟡 P2 — 中优(体验/一致性)

#### #1 影子模式头像缩写显示错误
- 显示 "A" 应为 "刘"。位置: `Sidebar.tsx` 头像 cell + 顶栏 ProfileButton。
- 根因推测: applySession 时 user.realNameZh 没写入

#### #2 仪表盘 + BI 驾驶舱对财务总监不适配
- 刘杰看到的是养殖/POS/库存 KPI,**0 财务相关数字**
- 影响: 财务总监打开 ERP 第一眼看不到关键数字(现金余额 / 应收 / 应付 / 当月差异)
- 建议: 按 role 路由到 `/finance2`,或在 `/dashboard` 加财务卡片(隐藏养殖 KPI)

#### #3 三方对账"公司"下拉重复 + 缺凤凰食品 code
- 同时显示 code 和 中文名(应只显示中文),且 COMP-LAO-FOOD 缺 code 行
- 位置: `apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:76-93` UNION ALL SELECT DISTINCT 漏对 name 去重
- 对比: 好业财同步页公司下拉**正确**(同模型不同 service),证实 dimensions() bug

#### #4 期间下拉是零散日期,不是 g199 期望的月初
- 显示 `2026-06-07` / `2026-06-06` / `2026-06-04` 等当天日期,而非 `2026-06-01`
- 影响: 对账数据按"导入日"切片,而非"会计期间月份" — 刘杰对账逻辑混乱
- 双管修: 历史 fin_ar_ledger UPDATE period_date 到月初 + UI 期间下拉过滤只展示月初

#### #5 三方对账"公司"列显示英文 code
- 表格里 `COMP-LAO-AGRI` 应显示"凤凰农业"
- 前端 `companies` 数组已有 code↔name 映射,一行 lookup 即可

### 🟢 P3 — 低优(锦上添花)

#### #6 财务总览"功能模块"缺 g199 三大入口卡片
- 应收三方对账 / 好业财同步 / 应收总账 三张卡未在 `/finance2` 卡片区
- 侧边栏有,但财务总览首页是常用入口

#### #7 应收账款 / 应付账款页对财务总监显示"录入/新建"按钮
- "录入收款"/"新建应收发票"/"从采购单导入"/"新建应付发票" 等
- 财务总监 = 审核角色,不该执行录入
- 建议: 按 perm 'C/E' 显示按钮,'V' 隐藏

---

## 修复优先级建议

| 顺序 | 项 | 工时估 | 影响范围 | 模式 |
|------|---|--------|----------|------|
| 1 | **#8 修财务报表 React #310** | 1-2h | 财务总监所有报表 | api(改 page.tsx) |
| 2 | #3 三方对账下拉去重 | 30min | ar-reconciliation 1 页 | api(改 service SQL) |
| 3 | #5 公司列中文化 | 15min | 同上 | web mode |
| 4 | #4 期间月初化 | 1h(UI 30min + 数据 SQL 30min) | 同上 + 数据迁移 | api |
| 5 | #1 影子头像 fallback | 30min | 全站 | web mode |
| 6 | #2 财务驾驶舱 | 2-4h(新增组件) | dashboard / analytics | web mode |
| 7 | #6 财务总览补 g199 卡片 | 30min | finance2 | web mode |
| 8 | #7 按钮按 perm 隐藏 | 1h(ar/ap/cash 等多页) | finance2/* | web mode |

**总计**: ~7-12h(P1+P2 大约 1 天工作量)

---

## 良性观察(已工作正常,不动)

- ✅ 影子模式横幅清晰显示(由 zhaoyongwei 发起)
- ✅ 菜单按角色裁剪正确:刘杰看不到生产/全链追溯/系统设置/系统运维
- ✅ 真实数据:三方对账实测 60 行差异,Cron(g199-D)上线就能直接报警这些差异
- ✅ 财务总览 6 KPI(现金/应收/应付/报销/可支配/股东)正常显示
- ✅ 多币种 KPI 用 ¥ ₭ ฿ $ 符号区分,且有"原币混合"标识防误读
- ✅ 资金账户 58 个账户卡片渲染正确
- ✅ 应收总账 KPI 含"期末本币(CNY)"独立可比一栏,设计合理
- ✅ 用户之前提的"中国财务术语"已落实("可支配资金"非"净头寸")
