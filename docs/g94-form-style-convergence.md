# G94 表单/输入框样式收敛 — 单一真相源 + 补齐缺失原子

> 日期：2026-06-13 ｜ 起因：用户指出"样式交代无数次却一直没解决"，要求反思并收敛全局表单样式欠债。

## 反思（根因）

项目本有完整设计系统（`components/design-system/`），CLAUDE.md 也写了"禁页面 inline / 禁裸 Tailwind 新类"，但**我一直逐元素内联 `style={{}}`**——内联=每个元素一次全新决定，必然漂移，再"用心"也没用。一致性靠**复用同一组件/令牌**，不是逐处小心。这次按"建一次、全局复用"修根。

## 盘点发现：三套打架的输入定义

| 定义 | 位置 | 旧值 |
|------|------|------|
| `inputField` | cockpit-styles.ts（页面内联用） | 8/12 · 圆角8 · 14px · bg-card |
| `fieldInputStyle` | forms/FormField.tsx（TextInput/SelectField 用） | 8/11 · 圆角md · 13.5 · bg-card |
| `.inp` / `.textarea` | ui/admin-ui.module.css（多数 admin 页 className 用） | 9/12 · 圆角6 · 13 · bg-page |

→ 同一行的 input 和 select、不同页之间，padding/圆角/字号/背景全不一样。**缺 `TextAreaInput` 原子**，27 个文件各写各的 `<textarea>`。

## 本轮收敛（地基，已做）

1. **唯一真相源**：`inputField` 与 `fieldInputStyle` 并为同一实体（fieldInputStyle 直接 re-export inputField）；`.inp` 静态度量对齐同值（8/11·圆角md·13.5·bg-card），并保留 `.inp` 的 `:focus` 聚焦环/`:disabled`/`::placeholder`（内联令牌做不到的交互态）。→ **改 1 处令牌 + 1 处 CSS，所有用 inputField 或 s.inp 的页面一次性收敛对齐。**
2. **补齐缺失原子 `TextAreaInput`**（forms/Inputs.tsx）+ 从 design-system index 导出。
3. **新增 `tableInputCell` token**（cockpit-styles）：统一表格行内编辑输入，取代各页自定义 `cellInp`（3/6·圆角4）。
4. 顺手修 G93 遗留：MasterDataRuntimePanel 保存按钮"保存草稿"→"保存"（已无草稿态）。

验证：Web `tsc --noEmit` **0 error**（CSS 变更不影响 tsc；视觉需部署后界面核验）。

## 待收尾的逐页清理（下一批，需逐个核验视觉）

`<textarea className={s.textarea}>` → `<TextAreaInput>`、各页 `cellInp` → `tableInputCell`、纯内联 input → 令牌/组件。重灾区：sales2/pricing、procurement2/payments·orders·requests·receipts·shipments、settings/pda-terminals、mobile/prc-request。**这批我不盲改**——看不到渲染就批量改正是过去翻车的来源；逐个改 + 部署后核验。

## 关于审批流（同批结论）

全局 16 处审批：主数据 16 类建档已被 G93 全转自动；其余 PR/PO/付款/报销/股东/销售订单·退货均为真业务交易，保留人工。唯一边界 `PRICE_BOOK_APPROVAL`（价格册）待用户定。
