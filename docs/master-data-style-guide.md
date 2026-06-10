# 主数据中心样式全局标准（2026-06-10）

> 基于 22 页样式审计。所有主数据页面统一到此标准；新页必须遵守。
> 来源：design-system + cockpit-styles（单一来源），禁止页面自写 inline/Tailwind 混搭。

## 全局标准（统一目标）

| 元素 | 用什么（唯一） | 禁止 |
|---|---|---|
| 页面容器 | `<div style={{ padding: "24px 32px" }}>` + `<PageHeader/>` | 自写标题栏 |
| 顶栏标题 | 自动取侧边栏中文 label（layout `pathTitle`） | 露英文路由名 |
| 搜索框 | `style={inputField}`（cockpit-styles） | 裸 inline / Tailwind 类 |
| 主按钮 | `style={primaryActionButton}` | 自写 inline |
| 次按钮/刷新 | `style={secondaryActionButton}` | 自写 inline / Tailwind |
| KPI/统计卡 | `KpiCardV2`（design-system）或 `cockpitCard` | 自写 inline 卡 |
| 抽屉 | `MasterDataDetailDrawer`（档案）/ `DrawerV2` | 自写抽屉 |
| 对话框 | `ConfirmDialogV2` / `ModalV2` | 自写 modal |
| 徽章 | `inlineBadge(tone)`（cockpit-styles） | 裸 span / Tailwind |
| 空状态 | `<EmptyState/>`（design-system） | 裸 div / 自写 |
| 字典类型名 | `dictTypeLabel()`（lib/dict-type-labels） | 露英文 dict_type |
| 颜色/尺寸 | CSS 变量 `var(--xxx)` | 硬编码 #fff / rgba |

## 现状（审计 + 整顿后）

- ✅ **14 个档案页**：PageHeader + MasterDataCenterStrip + MasterDataRuntimePanel + EmptyState + inlineBadge —— 标准模板，天然一致。
- ✅ **organizations**：全 cockpit-styles，标杆。
- ✅ **companies / 字典中心 / 字典编辑器 / 治理 / 首页 等**：已统一搜索框、刷新按钮、字典类型名、顶栏标题（G79-7~10）。
- ✅ **顶栏标题**：全 app 取侧边栏中文 label，杜绝英文路由名（G79-8）。

## 已知较大后续（非本轮·量大）

- **表格组件统一**：当前 3 种实现并存（admin-ui `s.table` / MasterDataRuntimePanel 内联 / 原生 table）。建议新建 design-system `DataTable` 统一替换。视觉上各表格已正常，属代码债，单列处理。
- 个别自写 KPI 卡（首页 6 中心卡为业务定制多指标卡，合理保留，已用 var() token）。
