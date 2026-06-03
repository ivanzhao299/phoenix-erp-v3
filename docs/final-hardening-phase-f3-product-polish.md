# 最终收口 F3 — Product Polish & UX Finalization 产品最终打磨

> **任务**：Final System Hardening Phase F3
> **日期**：2026-06-03
> **约束**：Stabilization Freeze（禁止重写页面/修改业务逻辑/删除在用组件）

---

## 0. 结论速览

| 维度 | F3 结果 |
|------|---------|
| StatusBadge | ✅ **100% 统一**（旧版 0 残留，全部迁 design-system） |
| PageHeader | ✅ **100%**（ui/PageHeader 0 引用文件已删） |
| DataTable | ⚠️ **阻断**（API 不兼容，无法在 Freeze 下迁移，如实记录） |
| KpiCard | ✅ barrel 加 `KpiCard` 别名（KpiCardV2 引用继续工效，F4 去后缀） |
| 用户可见 V2/V3 | ✅ **全部清除**（subtitle 中 "Sales V2 FIFO"/"Sales V2 库存体系" 已改为业务语言） |
| 品牌命名 | ✅ F2 已完成（"Phoenix V3" → "Phoenix ERP"） |

---

## 1. 组件统一结果

### StatusBadge（100% 完成）

| 阶段 | 引用分布 |
|------|---------|
| F0（审计）| design-system 6 / ui 5 / raw 4 = 15 处 |
| F2（标 deprecated）| 结构确立，旧版 9 处待迁 |
| **F3（迁移完成）** | **design-system 全部（14+ 处）/ 旧版 0** |

9 个文件完成迁移（`breeding/henhouse、flock、immune、medicine` + `finance2/ap、expenses、cash-accounts、reimbursements、ar`）。
- 默认 import → named import：`import StatusBadge from '@/components/StatusBadge'` → `import { StatusBadge } from '@/components/design-system'`
- API 兼容（design-system 做 `.toUpperCase()` 归一化，支持相同 status 值）
- 旧版 `components/StatusBadge.tsx`、`ui/StatusBadge.tsx` 现在 0 引用，**可在 F4 安全删除**。

### PageHeader（100% 完成）

- canonical = `@/components/PageHeader`（140 引用）
- `ui/PageHeader.tsx` + `ui/page-header.module.css` 已删（0 引用验证后 git rm）
- 无迁移需要，已是 100%。

### DataTable（阻断，如实记录）

- **根本原因**：`components/data-table` 是后端 CRUD 表格（需 `table` 名 + server fetch）；`components/DataTable` 是前端展示表格（接 `data[]` + `searchKeys` + `filters` + 内置搜索）——**完全不同的组件职能**，不是版本迭代关系。
- **Freeze 约束**：迁移需修改页面 props 传入逻辑（= 重写业务逻辑，禁止）。
- **处置**：更新 `@deprecated` 注释，准确说明不兼容原因；F4 建立 `PresentationalTable` 组件统一前端展示表格职能，再迁移 4 处引用。
- DataTableV2（1 处）状态同上。DataTableV3 在 design-system 内（不计入旧版）。

### KpiCard 别名

- `design-system/index.ts` barrel 加 `export { KpiCardV2 as KpiCard }` + `KpiCardV2Props as KpiCardProps`
- 现有 KpiCardV2 引用不变仍正常工作；新代码可用 `KpiCard`
- F4 目标：将 KpiCardV2 源文件重命名为 KpiCard，统一去 V2 后缀

---

## 2. 命名统一结果

### 用户可见 V2/V3 清除（100%）

| 位置 | F3 前 | F3 后 |
|------|-------|-------|
| breeding/daily-inbound subtitle | `统一进入 Sales V2 FIFO` | `统一进入 FIFO 库存体系` |
| warehouse/source-mode subtitle | `统一进入 Sales V2 库存体系` | `统一进入库存体系` |

- 扫描结果：用户可见 subtitle/title 中 V2/V3 残留 = **0**
- IT 管理页（settings/roles）的 "V3 RBAC" 属管理员技术配置页，合理保留
- sys_menu 菜单标签早已全中文（销售管理/财务中心等），无需改代码

---

## 3. UI Debt 对比

| 指标 | F0（基线）| F3 后 |
|------|----------|-------|
| StatusBadge 旧版引用 | 9 处 | **0** ✅ |
| ui/PageHeader 文件 | 存在（0 引用）| **已删** ✅ |
| 用户可见 V2/V3 字串 | 5 处 subtitle | **0** ✅ |
| @deprecated 组件 | 0 | 4 个（明确标记，待 F4 删） |
| 内联样式 `style={{` | ~7,548 | 未改（F4 按热点页 CSS Module 化） |
| 硬编码 hex/rgba | ~1,200+ | 未改（F4 CSS 变量化） |

**F3 核心收益**：StatusBadge 统一化（9→0 旧版引用）+ 用户界面 V2/V3 归零 + PageHeader 完全收口。

---

## 4. 热点页面 UX（F3 范围内）

F3 Stabilization Freeze 下，热点页面 UX 整治属于"内联样式/硬编码颜色替换"范畴——这是**F4 的主要工作**，F3 不执行大规模内联样式改写（会有业务逻辑风险 + 改动量过大影响稳定性）。

热点页面优先级（F4 执行）：
1. store-pos（179 inline / 56 rgba）→ 最高优先
2. sales2/returns（175 inline / 30 rgba）
3. sales2/delivery（143 inline / 26 rgba）
4. traceability（相对较新，已用 CSS 变量）

---

## 5. Design System 最终状态（F1-F3 后）

| 组件 | 状态 | canonical |
|------|------|-----------|
| StatusBadge | ✅ **100% 统一** | design-system |
| PageHeader | ✅ **100% 统一** | components/PageHeader |
| DataTable（展示型） | ⚠️ 阻断，待 F4 重命名为 PresentationalTable | components/DataTable（暂） |
| DataTable（CRUD型） | ✅ canonical | components/data-table |
| Modal/Drawer/ConfirmDialog | ✅ design-system | design-system barrel |
| KpiCard | ✅ 别名就绪，F4 去后缀 | KpiCardV2→KpiCard |
| MetricCard/SummaryCard/StatStripV2 | ✅ design-system | |
| EmptyState/LoadingSkeleton/ErrorState | ✅ design-system | |

---

## 6. 剩余技术债务（F4 优先级）

**F4-P1（核心）**：
- `components/StatusBadge.tsx` + `components/ui/StatusBadge.tsx` 删除（现 0 引用）
- DataTable API 不兼容问题 → 建 `PresentationalTable` + 迁移 4 处引用
- KpiCardV2 源文件重命名为 KpiCard（去 V2 后缀）

**F4-P2（体验）**：
- 热点页内联样式 CSS Module 化（store-pos / sales2/returns / delivery）
- 硬编码 hex/rgba → CSS 变量化
- Modal/Drawer/ConfirmDialog 去 V2 后缀
- DataTableV2 DataTableV3（UI 组件，非 CRUD）评估迁移到 PresentationalTable

---

## 7. 是否允许进入 S0 Stabilization Freeze

🟢 **允许**。

F1（死代码清理）+ F2（设计系统 canonical 确立）+ F3（StatusBadge 100% 统一 + 品牌命名清除）完成：
- 系统无孤儿代码/接口/mock
- 设计系统 canonical 已确立
- 用户界面无 V2/V3 技术术语
- 旧版组件均有 @deprecated 标记
- API/Web TypeScript 双 0

剩余 UI Debt（内联样式/颜色/DataTable 迁移）是渐进式优化，不阻断上线。**系统已具备企业级产品开放条件。**

---

## 必须回答

1. **StatusBadge 是否完全统一？** ✅ 是。旧版引用归零，全部迁至 design-system。
2. **DataTable 是否完全统一？** ❌ **存在根本阻断**：展示型与 CRUD 型两个 DataTable API 不兼容，迁移等同重写业务逻辑（Freeze 禁止）。F4 建立 PresentationalTable 解决。
3. **PageHeader 是否完全统一？** ✅ 是。components/PageHeader 100%，ui/PageHeader 已删。
4. **V2/V3 是否从用户界面消失？** ✅ 是（用户可见 subtitle/品牌字串全部清除；技术路由/API 保留，合理）。
5. **热点页面是否统一？** ⏳ F3 未执行内联样式改写（Freeze 约束下风险高于收益），F4 优先。
6. **UI Debt 降低多少？** StatusBadge 旧版引用 9→0、用户可见 V2/V3 5→0、ui/PageHeader 删除；内联样式/颜色为 F4 工作。
7. **是否达到产品级开放标准？** 🟢 是。核心业务链路完整、设计系统标准确立、品牌命名统一，可正式面向用户开放。
