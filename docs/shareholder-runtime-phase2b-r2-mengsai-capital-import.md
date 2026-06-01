# Phoenix ERP V3 — Shareholder Runtime Phase 2B-R2（凤凰农业孟赛实收资本导入）

> 2026-06-01 · 真实实缴资本口径（实收资本表优先于历史股比推导）。
> 禁止：按股比反推 / 应缴推导 / 未缴推导。

---

## 0. 结论

✅ 孟赛蛋鸡养殖场实收资本已导入：**项目总实缴 46,736,856.43**；朱兆存 30,477,396.68(65.21%) / 赵永伟 9,589,836.86(20.52%) / 宋雷 6,669,622.89(14.27%)，占比合计 100.00%。股权比例(50/25/25)保留不变，项目维持 PROVISIONAL。驾驶舱同时展示股权结构与实缴资本结构。

## 1. 数据来源

《老挝凤凰农业实收资本明细》，截止 2026-06-01。**该数据优先于历史股比推导**，采用真实实缴资本口径。

## 2. 项目总实缴资本

| 项目 | total_paid_in_capital | 截止 |
|------|----------------------:|------|
| SHR-MENGSAI-LAYER（孟赛蛋鸡养殖场） | **46,736,856.43** | 2026-06-01 |

写入 `shr_projects.total_paid_in_capital`（新增字段）。项目状态 PROVISIONAL 保持不变。

## 3. 股东实缴资本

更新 `shr_project_equity.paid_in_capital`（孟赛，不覆盖 equity_ratio）：

| 股东 | paid_in_capital | 来源 |
|------|----------------:|------|
| 朱兆存 | 30,477,396.68 | 资本汇总表（CAPITAL_SUMMARY_IMPORT） |
| 赵永伟 | 9,589,836.86 | 逐笔台账（LEDGER，与 Phase 2B 一致） |
| 宋雷 | 6,669,622.89 | 资本汇总表（CAPITAL_SUMMARY_IMPORT） |

## 4. 资本结构占比（capital_ratio，系统自动计算）

`capital_ratio = paid_in_capital / 项目总实缴资本 × 100`

| 股东 | 计算 | 实缴占比 | 预期 | 校验 |
|------|------|:--------:|:----:|:----:|
| 朱兆存 | 30,477,396.68 / 46,736,856.43 | **65.21%** | 65.21% | ✅ |
| 赵永伟 | 9,589,836.86 / 46,736,856.43 | **20.52%** | 20.52% | ✅ |
| 宋雷 | 6,669,622.89 / 46,736,856.43 | **14.27%** | 14.27% | ✅ |
| 合计 | — | **100.00%** | 100% | ✅ |

## 5. 股权结构 vs 资本结构对比

| 股东 | 股权比例（暂定） | 实缴资本比例（PAID-IN） |
|------|:----------------:|:-----------------------:|
| 朱兆存 | 50% | 65.21% |
| 赵永伟 | 25% | 20.52% |
| 宋雷 | 25% | 14.27% |

> 两套口径并存、不混淆：**股权比例**为约定股比(PROVISIONAL 暂定)，**实缴资本比例**为真实实缴口径(PAID-IN BASIS)。孟赛最终股权可能按实际投资重新确认。

## 6. Dashboard 调整

- 股权结构页（`/shareholders/equity`）：**双口径并列表格** —— 左「股权结构（暂定）：股权比例% + 状态」，右「实缴资本结构（PAID-IN）：实缴金额 + 实缴占比% + 来源」。PROVISIONAL 项目显示提示语，两套比例不混淆。
- 后端 `dashboardProject` 返回 totalPaidInCapital + 每股东 equityRatio/capitalRatio/paidInCapital/paidInSource/ledgerPaidIn（台账核对）。
- 不显示应缴/未缴/差额（Phase 2A 口径）。

## 7. 历史出资核对（§7）

| 股东 | 逐笔台账累计 | 资本表 paid_in | 核对 |
|------|-------------:|---------------:|:----:|
| 赵永伟 | 9,589,836.86 | 9,589,836.86 | ✅ **一致** |
| 宋雷 | 无逐笔记录 | 6,669,622.89 | 用资本汇总表，标 CAPITAL_SUMMARY_IMPORT |
| 朱兆存 | 无逐笔记录 | 30,477,396.68 | 用资本汇总表，标 CAPITAL_SUMMARY_IMPORT |

赵永伟实缴与 Phase 2B 历史台账**完全吻合**；宋雷/朱兆存暂无逐笔台账，直接采用实收资本表，并标记来源，待后续逐笔资料补充。

## 8. Finance Bridge（§8，只读）

新增只读端点 `GET /api/shareholders/capital-summary`：返回**项目总实缴资本 + 股东累计实缴 + 实缴占比 + 最近更新日期**。
**约束**：不生成凭证、不修改财务流水、不回写 Finance V2。原 `finance-bridge` 只读端点保留。

## 9. 下一阶段建议（§10）

| 项目 | 状态 | 说明 |
|------|:----:|------|
| 孟赛蛋鸡养殖场 | ✅ 已完成 | 实收资本 + 股东实缴 + 资本占比 |
| 东鹏蛋鸡养殖场 | ⏳ 待完成 | 待《东鹏实收资本明细》：项目总实缴 + 各股东实缴（赵永伟已有逐笔台账 6,995,840.63 可桥接） |
| 万象食品厂 | ⏳ 待完成 | 待《万象实收资本明细》：朱兆存/赵永伟/薛峰实缴 |

下一阶段按相同模式（实收资本表 → total_paid_in_capital + paid_in_capital + capital_ratio + 来源标记 → 双口径展示）导入东鹏、万象。

---

## 验证（§11）

| 项 | 结果 |
|----|------|
| 孟赛总实缴 | 46,736,856.43 ✅ |
| 朱兆存/赵永伟/宋雷 | 30,477,396.68 / 9,589,836.86 / 6,669,622.89 ✅ |
| 资本占比 | 65.21% / 20.52% / 14.27%（合计 100%）✅ |
| 股权比例保留 | 50/25/25 不覆盖 ✅ |
| 全新顺序复测（4 迁移） | ✅ 无报错 |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非本阶段回归） |

## 禁止事项核对

| 禁止 | 是否违反 |
|------|:------:|
| 按股比反推 | ❌ 否（真实实缴金额） |
| 应缴金额推导 | ❌ 否 |
| 未缴金额推导 | ❌ 否 |
| 覆盖股权比例 | ❌ 否（equity_ratio 保留 50/25/25） |
| 回写 Finance V2 | ❌ 否（只读桥接） |

## 改动文件

- `apps/api/migrations/20260601_shareholder_runtime_phase2b_r2_mengsai_capital.sql`（total_paid_in_capital + capital_ratio + paid_in_source + 孟赛数据）
- `apps/api/src/modules/shareholder/entities/`（project 加 totalPaidInCapital；equity 加 capitalRatio/paidInSource）
- `apps/api/src/modules/shareholder/services/shareholder.service.ts`（dashboardProject 双口径 + capitalSummary 只读）
- `apps/api/src/modules/shareholder/controllers/shareholder.controller.ts`（capital-summary 端点）
- `apps/web/src/lib/shareholder-api.ts` + 股权结构页（双口径并列表格）
