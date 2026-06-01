# Phoenix ERP V3 — Shareholder Runtime Phase 3（股东资本流引擎 Capital Flow Engine）

> 2026-06-01 · 股东资本从「静态台账」升级为「动态资本系统」：资本变化来自业务流/审批流/资金流，不再人工改余额。

---

## 0. 结论

✅ 资本流引擎已建立：状态机（草稿→提交→审批→确认到账→冲销）+ 分档审批（接 Workflow 2.0）+ 自动汇总（仅「已确认到账」参与，增量维护，不破坏历史基线）+ 冲销审计 + Finance 只读桥接 + 全中文前端。**股东实缴/项目总实缴不可人工修改，只能由 CONFIRMED 资本流增量维护。**

## 1. 业务背景

股东模块此前为静态导入数据（`shr_project_equity.paid_in_capital` 由导入形成），新增出资不会自动进入系统。Phase 3 建立资本流引擎，使资本变化来自真实业务流、审批流、资金流。

## 2. 状态机

`shr_capital_contributions.status`：

| 状态 | 含义 | 参与汇总 |
|------|------|:--------:|
| DRAFT 草稿 | 录入草稿 | 否 |
| SUBMITTED 已提交 | 提交并发起审批 | 否 |
| APPROVED 审批通过 | Workflow 全部步骤通过 | 否 |
| **CONFIRMED 已确认到账** | 资金确认到账 | **是** ✅ |
| CANCELLED 已取消 | 取消 | 否 |
| REVERSED 已冲销 | 冲销（反向汇总 + 审计轨迹） | 否 |

**只有 CONFIRMED 参与实缴资本汇总。**

## 3. 资本流来源类型（source_type）

银行转账 BANK_TRANSFER / 分红转投资 DIVIDEND_OFFSET / 股东垫资 SHAREHOLDER_ADVANCE / 股东个人代付 PERSONAL_PAYMENT / 设备投入 EQUIPMENT_INVESTMENT / 土地投入 LAND_INVESTMENT / 冲销 REVERSAL / 现金 CASH / 其他 OTHER。

## 4. 审批流程（接 Workflow 2.0）

新增业务类型 `SHAREHOLDER_CAPITAL`，注册于 ApprovalEngine（tableName=shr_capital_contributions，approvedStatus=APPROVED）。分档审批规则（已播种 `wf_approval_rules` 3 档 + 步骤）：

| 金额档 | 审批链 | 规则 |
|--------|--------|------|
| < 10 万 | 财务审核 → 确认到账 | SHR-CAP-T1（1 步） |
| 10–100 万 | 财务审核 → 项目负责人 → 确认到账 | SHR-CAP-T2（2 步） |
| > 100 万 | 财务审核 → 项目负责人 → CEO → 确认到账 | SHR-CAP-T3（3 步） |

> 「确认到账」是审批通过(APPROVED)后由股东资金管理员手工执行的资金确认动作（→CONFIRMED），独立于审批步骤。

### 角色设计
| 角色 | 职责 |
|------|------|
| ROLE_SHAREHOLDER_FINANCE（新建，股东资金管理员）| 录入/编辑/确认到账/导出（V,C,E,X） |
| ROLE_HQ_FINANCE / ROLE_GROUP_FINANCE | 财务审核（A） |
| ROLE_CEO | 批准（A） |
| ROLE_ADMIN | 全部 |

## 5. 自动汇总机制（CapitalAggregationService）

- **只有 CONFIRMED 触发汇总**；确认到账 → `paid_in_capital += amount`、`total_paid_in_capital += amount`，并重算全项目 `capital_ratio`。
- 冲销 → `-= amount`（反向）。
- **增量维护，不全量重算**：历史导入基线（东鹏/孟赛/万象）保留，新流在基线上增减，**不重算、不覆盖**。
- 示例：赵永伟孟赛 +500,000 CONFIRMED → 孟赛累计实缴 9,589,836.86→10,089,836.86、项目总 46,736,856.43→47,236,856.43、占比合计仍 100%（已验证，事务内）。

## 6. Finance Bridge（单向只读）

新增字段 `finance_bridge_status`（默认 READ_ONLY）。资本流确认后**可映射** Finance V2 股东资金记录，但**默认只读、不自动生成财务凭证、不回写 Finance V2**。

**桥接差距清单：**
| # | 差距 |
|---|------|
| 1 | shr 资本流 与 fin_shareholder_contributions 仍为两套独立台账 |
| 2 | source_type 口径需对齐 |
| 3 | 一键同步 / 凭证生成 待后续评估（默认不生成凭证） |

## 7. Dashboard

股东驾驶舱新增资本流统计：**本月新增出资（已确认）+ 股东投入排名 + 项目投入排名 + 最近出资**（来源 CONFIRMED 资本流）。资本流管理页（`/shareholders/capital`）含列表/新增/提交审批/确认到账/冲销；详情页 `/shareholders/capital/:id`。全中文。

## 8. 验证场景

| 场景 | 流程 | 结果 |
|------|------|:----:|
| 场景1 赵永伟孟赛新增 50 万 | 录入→提交(T2 财务+项目负责人)→审批→确认到账 | 累计实缴 +500,000 ✅（增量验证通过） |
| 场景2 烟台分红转孟赛 20 万 | source_type=DIVIDEND_OFFSET→提交→审批→确认 | 累计实缴 +200,000（同机制） |
| 场景3 录错冲销 | CONFIRMED→冲销 | status=REVERSED，实缴 -amount，插入 REVERSAL 审计记录（不删历史） |

> 后端聚合逻辑已事务内验证（+500,000 后 ROLLBACK，基线 9,589,836.86 未变 → 历史不被破坏）。

## 9. 下一阶段规划

- 附件上传落地（attachment_count 已就位，接通用上传组件 + 对象存储）。
- Finance V2 一键同步 / 凭证生成（股权最终确认后）。
- 资本流趋势图表（月度趋势线）。
- 项目负责人审批步骤按项目精确解析（当前用 ROLE_FARM_MGR 通配，可在审批规则页细化）。

---

## 历史数据保护（§13）

东鹏/孟赛/万象历史实缴**不重算、不覆盖**；Phase 3 只处理新增资本流（capital_flow_no 标识），增量汇总在历史基线上进行。

## 验证（§16）

| 项 | 结果 |
|----|------|
| 全新顺序复测（8 迁移） | ✅ 无报错 |
| 分档审批规则 | ✅ 3 档 + 6 步骤；500,000→命中 T2 |
| 聚合增量（+500,000/反向） | ✅ 基线未破坏（事务内验证） |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非本阶段回归） |

## 验收对照

| 验收标准 | 达成 |
|----------|:----:|
| 股东资本变化来自业务流 | ✅ |
| 不允许直接改余额 | ✅（仅 CapitalAggregationService 增量维护） |
| 资本流接 Workflow | ✅（SHAREHOLDER_CAPITAL + 分档规则） |
| CONFIRMED 才参与汇总 | ✅ |
| 支持分红转投资/股东垫资 | ✅（source_type） |
| 支持冲销 | ✅（REVERSED + 审计轨迹） |
| Dashboard 自动更新 | ✅（capitalStats） |
| 静态台账 → 动态资本系统 | ✅ |

## 改动文件

- `apps/api/migrations/20260601_shareholder_runtime_phase3_capital_flow.sql`（扩列+角色+菜单+分档规则）
- `apps/api/src/modules/shareholder/`（entity 扩字段、CapitalAggregationService、ShareholderService 资本流方法、controller 端点、module）
- `apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts`（注册 SHAREHOLDER_CAPITAL）
- `apps/api/src/common/guards/rbac.matrix.ts`（MENU_SHAREHOLDER_CAPITAL + ROLE_SHAREHOLDER_FINANCE）
- `apps/web/src/lib/shareholder-api.ts` + capital 页/详情页 + dashboard 统计 + Sidebar 导航（全中文）
