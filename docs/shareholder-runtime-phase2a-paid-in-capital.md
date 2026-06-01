# Phoenix ERP V3 — Shareholder Runtime Phase 2A（历史实缴出资口径）

> 2026-06-01 · 采用**实缴口径**：只记录真实出资，不建立应缴/未缴/差额。

---

## 1. 为什么采用实缴口径

| 项目 | 业务事实 | 口径 |
|------|----------|------|
| 东鹏蛋鸡养殖场 | 股权基本确认，投资约 5000 万，出资基本到位 | 实缴（股权 CONFIRMED） |
| 孟赛蛋鸡养殖场 | 股权结构暂定，最终股比可能按实际投资调整 | 实缴（股权 PROVISIONAL） |
| 万象食品厂 | 股权结构暂定，最终股比可能按实际投资调整 | 实缴（股权 PROVISIONAL） |

孟赛/万象最终股权可能按实际投资重新确认，因此系统应反映**事实（谁出了多少钱）**，而非**理论（应该出多少）**。故 Phase 2A **禁止建立应缴出资、未缴出资、出资差额**等固定资本口径。

## 2. 项目状态（shr_projects.equity_status）

新增字段 `equity_status`（CONFIRMED/PROVISIONAL）：

| 项目 | equity_status | 前端显示 |
|------|:-------------:|----------|
| SHR-DONGPENG-LAYER | CONFIRMED | 已确认股权（绿色徽标） |
| SHR-MENGSAI-LAYER | PROVISIONAL | 暂定股权（橙色徽标） |
| SHR-VTE-FOOD | PROVISIONAL | 暂定股权（橙色徽标） |

## 3. 股权状态（shr_project_equity.equity_status）

新增字段 `equity_status`，与所属项目一致；股权结构页对 PROVISIONAL 项目显示提示：
> ⚠ 当前股权比例为暂定，仅供参考，最终股权以最终确认结果为准。

## 4. 出资台账策略

- **禁止计算**应缴/未缴/差额。
- `unpaid_capital` 为 GENERATED 计算列 → **保留字段**（不删），但**前端隐藏、Dashboard 不显示**。
- 股权结构页**移除 应缴/未缴 列**，仅显示股比 + 股权状态 + 表决权。
- 出资台账 `shr_capital_contributions` 仅记录**真实实缴**（status=CONFIRMED），来源 source_type ∈ BANK_TRANSFER / DIVIDEND_OFFSET / SHAREHOLDER_ADVANCE / OTHER。

### 历史出资导入现状
本阶段已具备实缴台账录入能力（POST /contributions + confirm）。历史实缴数据来源：**老挝鸡场投资款明细、烟台分红转投资、股东资金、银行转账记录、已确认出资记录**。
> ⚠ 这些来源的**逐笔金额尚未提供**（东鹏仅有约 5000 万总额、无逐股东逐笔拆分）。**Phase 2A 不按股比反推分摊**（那等同应缴口径，被禁止）。台账已就绪，待业务提供真实逐笔出资记录后按 CONFIRMED 录入。

## 5. Dashboard 调整

| 显示 | 隐藏 |
|------|------|
| 累计实缴金额（按已确认出资合计） | 应缴金额 |
| 最近出资记录（recentContributions） | 未缴金额 |
| 股权状态（CONFIRMED/PROVISIONAL 徽标） | 出资差额 |
| 股东占比、股东数 | — |

后端 `dashboardProject` 已改实缴口径：返回 `paidInTotal`（已确认出资合计）+ 按股东实缴 + 最近出资 + equityStatus，**不再返回 subscribed/unpaid/差额**。隐藏至 Phase 3 股权最终确认。

### 7-9. 项目专项
- **东鹏（CONFIRMED）**：显示累计实缴 + 股权比例 + 股东占比；暂不强制录应缴，允许未来补录。
- **孟赛（PROVISIONAL）**：显示暂定股比 + 累计实缴 + 「最终股权可能按实际投资调整」说明。
- **万象（PROVISIONAL）**：同孟赛。

## 6. Finance V2 桥接（只读）

新增只读端点 `GET /api/shareholders/finance-bridge`（mode=READ_ONLY）：可查看 Finance V2 `fin_shareholder_contributions` 记录，与 shr 台账并列展示。

**约束**：不自动同步、不自动改账、不自动生成凭证。

**桥接差距清单：**
| # | 差距 | 说明 |
|---|------|------|
| 1 | 两套台账独立 | shr_capital_contributions（股东模块）vs fin_shareholder_contributions（Finance V2），暂不互写 |
| 2 | 一键同步/反向导入 | 待 Phase 3 股权最终确认后评估 |
| 3 | source_type 口径对齐 | 需统一 BANK_TRANSFER/DIVIDEND_OFFSET/SHAREHOLDER_ADVANCE/OTHER |
| 4 | 凭证生成 | Phase 2A 不生成，避免在股权未定时产生会计影响 |

```
shr_capital_contributions ──[只读查看]──▶ fin_shareholder_contributions (Finance V2)
   实缴台账（事实）              不写入/不改账/不生成凭证          现状不受影响
```

## 7. Phase 3 规划

见 `docs/shareholder-runtime-phase3-plan.md` —— 股权最终确认 → 应缴建立 → 未缴计算 → 出资差额 → 股东结算 → 股权重算 → 分红测算 → 资本账户。**仅在股权最终确认后启动。**

---

## 验证（§13）

| 项 | 结果 |
|----|------|
| 迁移幂等 | ✅ ADD COLUMN IF NOT EXISTS + UPDATE WHERE |
| equity_status | ✅ 东鹏 CONFIRMED / 孟赛·万象 PROVISIONAL（项目+股权一致） |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非本阶段回归） |

## 验收对照

| 验收标准 | 达成 |
|----------|:----:|
| 东鹏股权状态 CONFIRMED | ✅ |
| 孟赛/万象 PROVISIONAL | ✅ |
| 系统只记录实缴出资 | ✅ |
| 不计算应缴差额 | ✅（unpaid 字段保留但隐藏） |
| Dashboard 不显示未缴金额 | ✅ |
| 股东驾驶舱反映真实投资 | ✅（实缴口径） |
| 为未来股权最终确认预留空间 | ✅（equity_status + 保留 unpaid 字段 + Phase 3 plan） |

## 改动文件

- `apps/api/migrations/20260601_shareholder_runtime_phase2a_paid_in.sql`（equity_status 字段 + 初始化）
- `apps/api/src/modules/shareholder/entities/`（project + equity 加 equityStatus）
- `apps/api/src/modules/shareholder/services/shareholder.service.ts`（dashboardProject 实缴口径 + financeBridge 只读）
- `apps/api/src/modules/shareholder/controllers/shareholder.controller.ts`（finance-bridge 端点）
- `apps/web/src/lib/shareholder-api.ts` + projects/equity/dashboard 页面（股权状态徽标、隐藏应缴/未缴、暂定提示）
- `docs/shareholder-runtime-phase3-plan.md`
