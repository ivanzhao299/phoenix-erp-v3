# 部署后 5 主体重登冒烟清单 — 2026-06-27

> 承接 full 生产部署(run 28277134665, sha 6eba2829)。Phase C 机器验证已过;
> 本清单是**真登录的人工/自动化复测**,确认菜单·中心卡片·按钮·接口四向一致。
> ⚠️ 迁移 bump 了 `perms_version` → **每个用户先退出再登录领新 JWT**,否则可能短暂看到旧菜单。
> 本会话无生产登录通道,无法代跑;由运维/业务在生产执行,或接自动化 e2e。

## 通用前置
- 每人:登出 → 重新登录 → 确认 JWT 内 `permissions` 为原子码(非粗码)。
- 入口:PC `erp.eggslao.com`。

## 王乐金 wanglejin（ROLE_PRC_BUYER）
1. 左菜单:见「采购管理」全子项 + 「主数据中心/物料·供应商档案」;**不应**见 财务管理/系统设置。
2. 采购中心卡片/按钮:进「付款管理」→ 按 D2,确认按钮 gating(若 W4 未上,按钮可能仍可见但后端拦)。
3. 接口:`POST /api/procurement/v2/payments` → 期望 **403**(BUYER 仅 PAYMENT:V,无 C);`POST .../approve` → 403(无 A);`GET /payments` → 200。
4. 审批:采购订单「审批通过」→ `POST orders/:id/approve` 403(无 A)。

## 刘汉涛 liuhantao（ROLE_HQ_FINANCE 主 +COST/TREASURY/COST_ACCT/ANALYST）
5. 左菜单:财务全模块;**资金账户/资金调拨应可见**(HQ_FINANCE+TREASURY 在派生名单)。
6. 接口:`GET /api/v2/finance/cash/accounts` → 200;`POST /cash/transactions/manual` → 200;采购付款 `approve` → 403。

## 财务（liujie=ROLE_FINANCE_REVIEW_MANAGER 主 / gaoyang=ROLE_FIN_ACCT）
7. **D3 验证**:liujie 侧栏「资金账户/资金调拨」**现在应可见**(1782052 已补 REVIEW_MANAGER 的 `MENU_FIN2_CASH_VIEW`);`GET /cash/accounts` → 应 200(部署前是 403)。
8. liujie:应收/应付/费用卡片可见,审批按钮可用,`approve` → 200。
9. gaoyang:cash-accounts「新建账户」按钮可见(CASH_MASTER:C);`POST /cash/transactions` → 200;`DELETE /cash/transactions/:id`(g103 的 D)→ 200。

## 采购（同王乐金 ROLE_PRC_BUYER，可合并）
10. 复用 §1-4。

## 管理员 admin（ROLE_ADMIN）
11. 12 个一级菜单全显示;任意写/审批/导出接口 → 全 200(`permissions=['*']` 直通)。

## 关键回归点(部署前后差异,重点盯)
- **粗父菜单清零**:任何非 ADMIN 用户不应再因粗码 `MENU_FIN2/PRC2/WORKFLOW/...` 看到越权入口。
- **无断菜单**:确认没有用户因"前端要原子码、DB 没授"而整块菜单消失(Phase C 已过,但人工再确认高频角色)。
- 若发现断菜单/大面积 403 → 按 `docs/ops/runs/w1-db-gate-20260627/03_rollback.md` 评估回滚(migration:revert / 备份恢复 / 旧镜像)。

## 结果记录
- 通过:在 `DECISION_LOG.md` 记 `POST_DEPLOY_5USER_SMOKE: PASS`。
- 异常:记现象 + user + 接口 + 截图,触发修复 Gate。
