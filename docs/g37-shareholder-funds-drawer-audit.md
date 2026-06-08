# G37 · 股东资金记录抽屉逐项审计 + 公司下拉越权收口

> 触发：UAT 反馈「新建股东资金记录」抽屉股东选不了 + 王玮华能选到万象食品厂。
> 立项日：2026-06-08。映射欠债总账：A1(权限粒度) / C4(input 多版本) / D(字典) / F5(顶级 migrations 漏部署)。

---

## 一、症状 → 根因 → 修复

| # | 症状 | 根因 | 修复 |
|---|------|------|------|
| 1 | **股东下拉无法选择**（空） | `ShareholderSelector` 走 `/api/shareholders`（`@RequireMenu(MENU_SHAREHOLDER_VIEW,'V')`）。出纳王玮华无该菜单权限 → 403 → 列表空。对比公司下拉走 `/api/lookup/companies`（仅 JWT）能拉到，故「公司能选、股东不能」。 | 新增 `GET /api/lookup/shareholders`（仅 JWT，不绑 MENU，返回 ACTIVE 股东 `{code,name}`）；`ShareholderSelector` 切此端点。对齐 G5-B lookup 范式。 |
| 2 | **资金类型下拉为空** | `FIN_CONTRIBUTION_TYPE` 字典种子只存在于**顶级** `migrations/20260604_g4a_finance_dict_seed.sql`。G36 已确认生产 Deploy 只跑 `apps/api/migrations/2026*.sql`，顶级目录从未执行 → 生产 sys_dict 缺此类（连带 `FIN_RECEIPT_METHOD` 同样缺失）。 | 新增 `apps/api/migrations/20260608_g37_finance_dict_reseed.sql`，幂等补种 `FIN_CONTRIBUTION_TYPE`(5) + `FIN_RECEIPT_METHOD`(5)。`FIN_EXPENSE_TYPE`/`FIN_FUND_NATURE` 已由 G2 种子覆盖，不重复。 |
| 3 | **王玮华能选到万象食品厂公司** | 后端 DataScope 正确（王玮华 `allowedCompanyCodes={COMP-LAO-AGRI, COMP-LAO-XINGCHI}`，G34 已排除万象 `COMP-LAO-FOOD`），所有 `fin_*` 查询天然过滤。但**前端公司下拉 `/api/lookup/companies` 不按 DataScope 过滤**，返回全集团公司 → 万象泄漏到可选项（能选但后端会拒，账实/体验割裂）。 | `/api/lookup/companies` 加 DataScope 过滤：非全局用户只返回 `allowedCompanyCodes` 内公司；admin/GROUP（isGlobal）照旧全量。CLS user 由全局 `AuditLogInterceptor` 在 handler 前注入，controller 内主动调 `DataScopeService.resolve` 取范围（本路由不经 DataScopeGuard）。 |
| 4 | **抽屉「样式/元素没有全局化」** | 抽屉主体已全局化（cockpit-styles drawer*、各 Selector、DictSelect、AttachmentUploader，0 处硬编码颜色）。**但表单 input 用本地 `const inpClass` Tailwind 串，且在两个抽屉组件里重复定义 2 次**，未用设计系统统一来源（欠债 C4）。搜索框却用了全局 `inputField` → 同页两套。 | cockpit-styles 新增 canonical `inputFieldClass`；本页两处 `inpClass` 收口为单一来源。 |

---

## 二、抽屉字段逐项审计（新建股东资金记录）

| 字段 | 控件 | 主数据/字典源 | 状态 |
|------|------|--------------|------|
| 股东 * | `ShareholderSelector` | `/api/lookup/shareholders`（ACTIVE） | ✅ 修复后可选 |
| 股东姓名 | readOnly input | onPick 自动带出 | ✅ 编码禁手填 |
| 公司 * | `CompanySelector` | `/api/lookup/companies`（**按 DataScope**） | ✅ 修复后万象不可见 |
| 公司名称 | readOnly input | onPick 自动带出 | ✅ |
| 货币 * | `DictSelect SYS_CURRENCY` | sys_dict（G2 已种） | ✅ |
| 金额 * | number input | — | ✅ B 类业务字段 |
| 预计归还日期 | date input | — | ✅ B 类 |
| 资金类型 * | `DictSelect FIN_CONTRIBUTION_TYPE` | sys_dict | ✅ 修复后有选项 |
| 出资凭证 | `AttachmentUploader` | `/api/upload/contract` | ✅ 禁 URL 文本框 |
| 备注 | textarea | — | ✅ E 类 |

---

## 三、逻辑关系厘清（用户要求「整理清楚」）

- **DataScope（后端，账实权威）**：王玮华 = `{COMP-LAO-AGRI, COMP-LAO-XINGCHI}` + `SITE-DONGPENG-LAYER`，**不含**万象 `COMP-LAO-FOOD`。所有 `fin_*` 读写按此过滤——后端从未越权，G34 已正确隔离。
- **Lookup（前端下拉）**：原设计「仅 JWT、不绑 MENU、不绑 scope」是为让业务录入用户能拉主数据（G5-B）。问题在于**公司选择**这类带 scope 语义的主数据也走了无 scope 的 lookup → 可选项超出本人范围。G37 对 `companies` 端点补 DataScope，**其余 lookup（客户/供应商/股东等无公司 scope 语义者）维持仅 JWT**。
- **结论**：王玮华看不到万象 = 正确终态。修复点在前端下拉 scope，**不需要改王玮华的 scope 数据**（其 scope 本就正确）。

---

## 四、改动清单

**后端**
- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`
  - 新增 `GET /api/lookup/shareholders`（仅 JWT）
  - `companies()` 加 DataScope 过滤（注入 `ClsService` + `DataScopeService`，`resolveCompanyScope()`）
- `apps/api/migrations/20260608_g37_finance_dict_reseed.sql`（幂等补种 2 类财务字典）

**前端**
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx` — `ShareholderSelector` 切 `/lookup/shareholders`
- `apps/web/src/components/design-system/cockpit-styles.ts` — 新增 `inputFieldClass`
- `apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx` — `inpClass` 收口为 `inputFieldClass`

---

## 五、验证

- API tsc 0 errors ✅
- Web tsc 0 errors ✅
- 生产待跑：`20260608_g37_finance_dict_reseed.sql`（幂等 INSERT，符合 sys_dict 保护规则；运行需用户在生产执行）
- 运行期待办（需服务起后冒烟）：王玮华登录 → 公司下拉仅见 2 家、股东下拉可选、资金类型有选项。

---

## 六、同类风险外溢提醒（未在本阶段处理，登账）

- **F5 顶级 migrations 漏部署**：顶级 `migrations/20260604_g4a_finance_dict_seed.sql` 内 `FIN_PAYER_TYPE` 等若被其它财务单据 DictSelect 引用，可能同样在生产为空。建议后续阶段全量比对「顶级 seed 引用的 dict_type」vs「apps/api/migrations 实际种过的」，一次性补齐。
- **公司 scope 外溢**：其它 15 处 `CompanySelector` 现已统一受益于 `companies` 端点 scope 化；若有页面**确需**跨 scope 选公司（如集团合并报表），需显式走 admin 路径，不应放宽 lookup。
