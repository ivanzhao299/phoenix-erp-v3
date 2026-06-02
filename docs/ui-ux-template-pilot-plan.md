# Phoenix ERP V3 — Page Template 试点迁移计划（UI-2.3）

> 用页面模板验证整套 Design System V2。**本阶段只定计划,不执行迁移**(迁移需单独授权,会改业务页面)。
> 每个试点迁移后必须:业务逻辑/API/权限不变,只换 UI;过 `dark-mode-checklist.md` 11 项 + `ui-audit-check.sh`(该页 hex=0)。

---

## 试点页面与模板映射

### P0 高风险（首批,验证模板有效性)
| 试点页 | UI-1 分 | 套用模板 | 迁移要点 |
|--------|:-:|---------|---------|
| **shareholders/capital** | 3.0 | `LedgerTemplate` + `ConfirmDialogV2` | KPI→KpiCardV2;SummaryBar→StatStripV2;表头#1F4E79→DataTableV3;prompt 冲销→ConfirmDialogV2;补暗色 |
| **uat/page** | 2.5 | `MasterDataTemplate` | 真正用 PageHeaderV2;手写 table→DataTableV3;SEVERITY_COLOR→SEVERITY_PALETTE |
| **sales2/returns** | 3.0 | `DocumentTemplate`/`MasterDataTemplate` | 手写 overlay→DrawerV2;自写 Badge→StatusBadge;175 内联 hex 清零 |
| **store-pos** | 2.0 | `WorkbenchTemplate` | 套 WorkbenchKit;139 hex 令牌化;保留收银独立体验 |

### P1 中风险
| 试点页 | 套用模板 | 要点 |
|--------|---------|------|
| **settings/users** | `ConfigTemplate` / `MasterDataTemplate` | 107 内联清理;手写 table→DataTableV3;Level 色→token |
| **master-data/products** | `MasterDataTemplate` | 手写 table→DataTableV3;NavCard 已规范 |
| **workflow/todos** | `ApprovalTemplate` | 套审批模板;WorkflowTimeline;状态色统一 |

### P2 稳定优化
| 试点页 | 套用模板 | 要点 |
|--------|---------|------|
| **finance2/page** | `DashboardTemplate` | 局部 KpiCard→KpiCardV2;原生 confirm→ConfirmDialogV2 |
| **analytics** | `DashboardTemplate` + `ChartCard` | GRADE_COLORS→GRADE_PALETTE;图表→CHART_PALETTE |
| **executive** | `DashboardTemplate` | 接驾驶舱模板 |

---

## 试点执行顺序(建议)

1. **shareholders/capital**(首个) —— 综合分最低、暗色破损、且是本会话刚增强的核心模块,迁移收益最直观,用它跑通"LedgerTemplate + 组件"完整闭环,暴露模板缺陷。
2. **uat/page** —— 单文件、易改、收益快,验证 MasterDataTemplate。
3. **store-pos** —— 验证 WorkbenchTemplate / WorkbenchKit(独立语言)。
4. 其余按 P0→P1→P2 推进。

## 每个试点的验收口径

- [ ] 业务逻辑/接口调用/权限**完全不变**(只换 UI 层)
- [ ] 页面套用对应 PageTemplate,无自建骨架
- [ ] `ui-audit-check.sh`:该页**硬编码 hex = 0**、无原生 confirm/prompt、无页面级 STATUS_COLOR
- [ ] `dark-mode-checklist.md` 11 项全绿(暗色可用)
- [ ] Web TS 0、回归无破坏
- [ ] 迁移前后**功能对比一致**(截图/手测)

## 风险控制

- **逐页一个 PR**,可独立回滚;一次只动一个页面。
- 全站 `ui-audit-check.sh --strict` 棘轮:hex 总量(基线 3205)随每次试点**只降不升**。
- P3 procurement2 作为标杆参照,基本不动。

---

> 注:本计划为 UI-2.3 产物。实际迁移(改业务页面)属后续阶段,需用户显式放开"禁止改 shareholders/sales2/store-pos 等页面"的限制后执行。
