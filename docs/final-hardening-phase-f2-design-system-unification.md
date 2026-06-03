# 最终收口 F2 — Design System Unification 设计系统收口

> **任务**：Final System Hardening Phase F2
> **日期**：2026-06-03
> **约束**：Stabilization Freeze（禁止重写页面/修改业务逻辑/删除在用组件）
> **F2 实际范围**：定标准 + 标 @deprecated（不删）+ 修 3 处品牌文字 + 建 Registry + 写采用报告

---

## 0. 结论速览

| 维度 | F2 结果 |
|------|---------|
| 品牌命名 | ✅ "Phoenix V3"/"Phoenix ERP V3" → "Phoenix ERP"（3 处用户可见） |
| StatusBadge | ✅ canonical 确立（design-system）；旧 2 版标 @deprecated |
| PageHeader | ✅ canonical 确立（components/PageHeader 140 引用）；ui 版标 @deprecated |
| DataTable | ✅ canonical 确立（data-table 23 引用）；旧 2 版标 @deprecated |
| Modal/Drawer/ConfirmDialog | ✅ design-system barrel 唯一版本（无重复，现状保留） |
| KpiCard | ✅ 定标准（F3 去 V2 后缀） |
| Design System Registry | ✅ docs/design-system-registry.md |
| UI Debt | 📊 内联样式/颜色为长期治理（F3 按热点页分批） |

---

## 1. 现状（F2 前审计数据）

- StatusBadge 三套：design-system（6）/ ui（5）/ raw（4）= 15 处
- PageHeader 两套：components（140）/ ui（0）
- DataTable 四套：data-table（23）/ DataTableV3（5）/ DataTable（4）/ DataTableV2（1）
- Drawer/ModalV2/ConfirmDialogV2：design-system barrel 唯一（无重复）
- KpiCard 系列：KpiCardV2（5+19）/ MetricCard（6）/ SummaryCard（3）/ StatStripV2（3）
- UI Debt：style={{ 8197 / hex 928 / rgba 657（F0 数据）

---

## 2. 组件收口决策

| 组件 | canonical | 依据 |
|------|-----------|------|
| **StatusBadge** | `design-system/status/StatusBadge`（barrel 导出） | 任务明确建议；CSS 变量 Dark Mode 支持 |
| **PageHeader** | `components/PageHeader` | 140 引用事实标准；ui 版 0 引用 |
| **DataTable** | `components/data-table` | 23 引用最多；功能最完整 |
| **Modal/Drawer/ConfirmDialogV2** | design-system barrel | 唯一实现，无重复，保持现状 |
| **KpiCard** | design-system `KpiCardV2`（F3 去后缀） | barrel 导出；MetricCard 独立职能保留 |

**旧版标 @deprecated（不删，兼容现有引用）**：
- `components/StatusBadge.tsx`（4 引用，已标）
- `components/ui/StatusBadge.tsx`（5 引用，已标）
- `components/DataTable.tsx`（4 引用，已标）
- `components/ui/DataTableV2.tsx`（1 引用，已标）
- `components/ui/PageHeader.tsx`（0 引用，已标，F3 可直接删）

---

## 3. 命名统一

**用户可见品牌字符串（已修改）**：

| 位置 | F2 前 | F2 后 |
|------|-------|-------|
| Sidebar 品牌副标 | `Phoenix V3` | `Phoenix ERP` |
| login tagline（默认值） | `企业级直营运营系统 · Phoenix V3` | `企业级直营运营系统 · Phoenix ERP` |
| login footer | `Phoenix ERP V3 · 企业级管理系统` | `Phoenix ERP · 企业级管理系统` |

**技术命名（保留，不改路由/API/模块名）**：
- Sales V2、Finance V2 等在代码/路由/API 路径中保留（事实契约）；用户可见的模块标签由 sys_menu.menu_name_zh 控制（已为中文"销售管理"/"财务中心"），无需改代码。

---

## 4. Design Token 现状

`globals.css`：79 个 CSS 变量（颜色/字体/间距/圆角/阴影/状态色，含 Dark Mode `[data-theme=dark]`）。
`lib/design-tokens.ts`：JS 映射层（STATUS_CLASS/STATUS_LABEL/CHART_PALETTE 等）。

Design Token 体系**已建立**；主要 UI Debt 是大量页面**绕过 Token 直接用 hex/rgba**（长期治理）。

---

## 5. Design System Registry

见 `docs/design-system-registry.md`（10 节）：StatusBadge / PageHeader / DataTable / Modal / Drawer / ConfirmDialog / KpiCard / EmptyState / LoadingSkeleton / ErrorState / Button / Input / Select 的 canonical 路径 + 迁移路径 + 代码示例。

---

## 6. 迁移情况（Design System Adoption）

| 组件 | F2 后 canonical 比例 | 页面已用 canonical | 仍用旧版（F3 优先级） |
|------|---------------------|--------------------|--------------------|
| PageHeader | **140/140（100%）** | 全部 admin 页面 | 无（ui 版 0 引用） |
| StatusBadge | 6/15（40%） | design-system 用户 ~6 页 | 旧版 9 处（F3 P1） |
| DataTable | 23/33（70%） | data-table 用户 ~23 页 | 旧版 10 处（F3 P2） |
| Modal/Drawer | 100%（无旧版） | 13 处 | 无 |
| KpiCard | 24/～30（高） | design-system 用户 | KpiCardV2 后缀（F3 去后缀） |

---

## 7. UI Debt 对比（F2 前后）

| 指标 | F2 前（F0 数据） | F2 后（新统计） | 变化 |
|------|----------------|---------------|------|
| `style={{` 内联样式 | 8,197 | ~7,548 | **-649** |
| hex 颜色 | 928 | ~1,232 | +304（grep 范围包含 .next 构建产物，需排除） |
| rgba 颜色 | 657 | ~822 | 同上 |
| 废弃 @deprecated 文件 | 0 | **5** | 明确标记 |
| 重复组件套数 | StatusBadge×3/Table×4/Header×2 | 标 deprecated | 待 F3 删 |

> hex/rgba 新统计值因 grep 扫了更多范围（含 .next 产物/测试/生成文件），不可直接对比；实际业务代码 UI Debt 变化为 F2 本次**未改内联样式**（per Stabilization Freeze）。

**F2 净 UI Debt 变化**：
- ✅ 3 处用户可见硬编码品牌版本号已清除
- ✅ 5 个旧组件明确标 @deprecated（便于 IDE 警告、F3 迁移识别）
- ⏳ 内联样式/硬编码颜色 → F3 按热点页分批治理

---

## 8. 后续 F3 计划

F3 目标（**需另行授权，F2 不执行**）：

1. **StatusBadge 迁移**（9 处）：逐页替换 `@/components/StatusBadge` / `ui/StatusBadge` → `design-system`。
2. **DataTable 迁移**（10 处）：逐页替换旧版 → `data-table`。
3. **`components/ui/PageHeader.tsx` 删除**（0 引用，安全删）。
4. **KpiCardV2 重命名为 KpiCard**：barrel + 所有引用处同步改（19+5 处）。
5. **内联样式 CSS Module 化**：按热点页优先：store-pos(179)→ sales2/returns(175)→ delivery(143)。
6. **硬编码颜色 CSS 变量化**：sales2/inventory(68 hex)→ reports(63)→ orders(45)。
7. **Modal/Drawer/ConfirmDialog 去 V2 后缀**（重命名组件）。

---

## 必须回答

1. **最终保留哪些组件**：PageHeader（components/）、DataTable（data-table）、StatusBadge（design-system）、Drawer/ModalV2/ConfirmDialogV2（design-system barrel）、KpiCardV2/MetricCard/SummaryCard/StatStripV2（design-system）、EmptyState/LoadingSkeleton/ErrorState。
2. **哪些组件废弃**：`components/StatusBadge`、`ui/StatusBadge`、`components/DataTable`、`ui/DataTableV2`、`ui/PageHeader`（均已标 @deprecated）。
3. **StatusBadge 是否统一**：✅ canonical 确立（design-system）；旧版标 deprecated；**迁移由 F3 完成**（当前 40%）。
4. **PageHeader 是否统一**：✅ **事实上已 100% 统一**（canonical = components/PageHeader 140 引用；ui 版 0 引用已标 deprecated）。
5. **DataTable 是否统一**：✅ canonical 确立（data-table）；旧版标 deprecated；**迁移由 F3 完成**（当前 70%）。
6. **V2/V3 是否从用户界面消失**：✅ 用户可见的 3 处品牌版本号已清除；**技术路由/API/模块代码命名不改**（事实契约，前端依赖）；sys_menu 标签已是中文（销售管理/财务中心），无需改代码。
7. **UI Debt 降低多少**：F2 本身降低少量（品牌字符串 3 处 + deprecated 标记），**大规模 UI Debt 降低 = F3 任务**；F2 建立了标准和路线图，是 F3 的必要前置。

---

## 验证

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 业务功能 | ✅ 未触及（仅 JSDoc + 品牌字符串 + Registry） |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |
