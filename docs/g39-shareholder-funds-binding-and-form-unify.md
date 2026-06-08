# G39 · 股东资金记录抽屉：股东↔公司绑定 + 表单控件全局化

> 触发：UAT 反馈「新建股东资金记录」抽屉 ① 股东与公司未绑定（可错配）② 输入框样式不统一、显得乱。
> 立项 2026-06-08。映射欠债 A1（业务约束缺失）/ C4（input 多版本）。

## 一、股东↔公司绑定（用户定规则：先选公司再选股东）

### 数据模型现状
`shr_shareholders` 无 company_code 列；股东↔公司是**经持股派生**：
`shr_project_equity`(股东↔项目) → `shr_projects.company_code`。权威映射：
- 东鹏 COMP-LAO-XINGCHI：朱兆存/赵永伟/宋雷/符强/朱召安/陈逸飞
- 孟赛 COMP-LAO-AGRI：朱兆存/赵永伟/宋雷
- 万象食品厂 COMP-LAO-FOOD：朱兆存/赵永伟/薛刚

（宋雷跨 2 公司、赵永伟/朱兆存全集团 → 非 1:1，故不加固定列，改用「公司→股东」收窄。）

### 实现
- 后端 `GET /api/lookup/shareholders?companyCode=` —— 传公司则只返回该公司名下持股股东
  （equity JOIN projects 派生）；不传则全部 ACTIVE（付款单等兼容）。
- 前端 `ShareholderSelector` 加 `companyCode` 属性，随其变化自动重载
  （`ScopedSelect` 新增 `reloadDeps`）。
- 抽屉重排为**公司在前、股东在后**；切换公司即清空已选股东；未选公司时股东下拉禁用，
  占位提示「请先选择公司」。→ 杜绝股东/公司错配。

## 二、表单控件全局化（消除「乱」）

根因：同一抽屉里 4 类控件视觉不一致——
- ScopedSelect / DictSelect：`padding 8/12 · 圆角7 · 字号13 · bg-card`
- 原生 `<input className={inputFieldClass}>`（G37 引入）：`圆角8 · 字号14 · bg-page`

→ 同行 input 与 select 高度/圆角/底色错位。

修复：
- `cockpit-styles.inputFieldClass` token 对齐选择器（`rounded-[7px] text-[13px] bg-bg-card`），
  input 与 select 渲染完全一致。
- 抽屉内 10 处重复的 label 内联样式（`text-text-muted fontSize:12 fontWeight:600`）
  收口为全局 `formLabel`。显示文本/小节标题（未结余额、单号、结算记录、金额）非字段
  label，保留。

## 三、改动清单
- `apps/api/src/modules/product-master/controllers/lookup.controller.ts` — shareholders 加 companyCode 过滤
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx` — ScopedSelect.reloadDeps + ShareholderSelector.companyCode
- `apps/web/src/components/design-system/cockpit-styles.ts` — inputFieldClass 对齐选择器 token
- `apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx` — 公司前置 + 股东按公司过滤 + label 全局化

## 四、验证
- API tsc 0 / Web tsc 0 ✅
- ShareholderSelector 向后兼容：payments / procurement2 未传 companyCode → 行为不变。
- 运行期冒烟（需服务起后）：选公司→股东下拉只列该公司股东；换公司→股东清空重列；
  所有控件等高对齐。

## 五、登账（未本阶段处理）
- `procurement2/shareholder-funds` 是同名兄弟页，若也走「新建股东资金记录」，可比照本阶段统一。
