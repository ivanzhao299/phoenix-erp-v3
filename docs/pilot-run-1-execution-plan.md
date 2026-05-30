# Phoenix ERP V3 — Pilot Run 1 执行计划

**项目编号**：PR-20260530-0001  
**项目名称**：孟赛鸡场 + 直营店 + 经销商 综合试运行  
**状态**：RUNNING  
**周期**：2026-05-30 ~ 2026-06-13（14 天）  
**负责角色**：ROLE_PILOT_MANAGER / ROLE_ADMIN  

---

## 一、试运行范围

| 业务线 | 场景 | 负责人 | 状态 |
|--------|------|--------|------|
| 孟赛鸡场销售订单 | B2B 批发 + 信用控制 | 销售经理 | RUNNING |
| 直营门店 POS | 零售收银 + FIFO 出库 | 门店主管 | RUNNING |
| 经销商订单 | 分销商下单 + 配送 | 业务员 | RUNNING |
| 销售退货 | 质检 + 回库 + AR Credit Note | 仓库主管 | RUNNING |
| 鸡蛋库存 FIFO | 批次入库 + FIFO 消耗 + 预警 | 仓库主管 | RUNNING |
| 应收账款 | AR 发票自动生成 + 收款录入 | 财务 | RUNNING |
| 审批流 | 低价审批 / 信用超额审批 | 销售经理 | RUNNING |

---

## 二、每日评分体系

### 2.1 总分计算

```
总分（0~100）= 销售分 × 25% + 库存分 × 20% + 配送分 × 20%
             + 财务分 × 15% + 审批分 × 10% + 稳定性分 × 10%
```

**CRITICAL issue 存在时，总分上限为 70 分**

### 2.2 状态等级

| 等级 | 条件 | 行动要求 |
|------|------|----------|
| 🟢 GREEN | 总分 ≥ 80 | 正常运行，持续观察 |
| 🟡 YELLOW | 60 ≤ 总分 < 80 | 24 小时内完成问题排查 |
| 🔴 RED | 总分 < 60 | 立即升级处理，启动应急预案 |

### 2.3 各维度评分规则

#### 销售维度（权重 25%）
- 有订单活动 → +60 分
- 销售额 > 0 → +20 分
- 退货率 < 20% → +20 分

#### 库存维度（权重 20%）
- 有可用批次 → +70 分
- 批次数 > 5 → +30 分

#### 配送维度（权重 20%）
- 当日签收率 ≥ 90% → 100 分
- 当日签收率 ≥ 70% → 80 分
- 当日签收率 ≥ 50% → 60 分
- 当日签收率 < 50% → 40 分
- 无配送任务 → 70 分（基准分）

#### 财务维度（权重 15%）
- 基础分 70
- AR 发票当日生成 → +30 分

#### 审批维度（权重 10%）
- 无待审批 → 100 分
- ≤ 3 条待审批 → 80 分
- ≤ 10 条待审批 → 60 分
- > 10 条待审批 → 40 分

#### 稳定性维度（权重 10%）
- 0 个 open issues → 100 分
- ≤ 2 个 → 85 分
- ≤ 5 个 → 70 分
- ≤ 10 个 → 55 分
- > 10 个 → 30 分

---

## 三、上线准备度评估

同时满足以下 4 条件，方可申请生产上线：

1. **试运行天数 ≥ 14 天**
2. **无 CRITICAL 未解决问题**
3. **open issues ≤ 5 个**
4. **综合评分 ≥ 80 分**

---

## 四、问题反馈规则（UAT Feedback Loop）

### 4.1 严禁渠道
- ❌ 微信群/钉钉随手截图反馈
- ❌ 口头反馈
- ❌ 直接找 IT 人员私下修复

### 4.2 标准流程
1. 发现问题 → 进入 **UAT 问题反馈** 页面录入
2. 填写字段：标题、严重程度（CRITICAL/HIGH/MEDIUM/LOW）、问题描述、复现步骤、截图
3. 系统自动关联到当前 pilot_run_id
4. IT 人员认领 → 更新状态（IN_PROGRESS → RESOLVED → CLOSED）
5. 每日日报自动统计 issue 数量，纳入评分

### 4.3 严重程度定义

| 级别 | 定义 | 响应时限 |
|------|------|----------|
| CRITICAL | 核心流程中断（无法下单/出库/收款） | 2 小时内 |
| HIGH | 重要功能异常，有临时方案可绕过 | 8 小时内 |
| MEDIUM | 功能不符预期，但不影响核心业务 | 3 个工作日 |
| LOW | 优化建议、UI 问题 | 择期处理 |

---

## 五、Dashboard 实时指标

访问路径：**系统菜单 → 验收试运行 → 试运行中心**

| 指标卡片 | 数据来源 |
|----------|----------|
| 今日订单数 | sal_sales_orders |
| 今日销售额 | sal_sales_orders.total_amount |
| 今日配送数 / 已签收 | sal_delivery_orders |
| 今日退货数 | sal_return_orders |
| 今日收款笔数 | sal_store_sales |
| 未解决问题数 | uat_feedbacks（OPEN+IN_PROGRESS） |
| 今日已解决 | uat_feedbacks（RESOLVED/CLOSED 当日） |
| 今日异常 | open issues + 待审批过多 |
| 上线准备度 | 4 条件自动评估 |

---

## 六、API 端点

```
GET  /api/uat/pilot-runs/:id/dashboard      — 完整 Dashboard（权限：MENU_UAT V）
GET  /api/uat/pilot-runs/:id/score          — 快速评分（权限：MENU_UAT V）
POST /api/uat/pilot-runs/:id/daily-report   — 生成日报（权限：MENU_UAT C）
GET  /api/uat/pilot-runs/:id/daily-reports  — 日报列表（权限：MENU_UAT V）
```

---

## 七、日报生成

- **自动**：建议配置 Scheduler 在每天 23:00 自动调用 `generateDailyReport()`
- **手动**：Dashboard 页右上角"生成今日日报"按钮
- **幂等**：同一 pilot_run_id + report_date 多次调用只 UPSERT 一条，安全重复执行

---

## 八、RBAC 权限

| 角色 | 权限 |
|------|------|
| ROLE_ADMIN | V C E D A X |
| ROLE_PILOT_MANAGER | V C E |
| ROLE_SYSOPS | V C E A |
| ROLE_CEO | V X |
| ROLE_SALES_MGR | V C E |
| ROLE_AUDITOR | V X |

---

## 九、数据表

| 表名 | 用途 |
|------|------|
| uat_pilot_runs | 试运行项目主档（project_no, scope_desc, status, go_live_ready） |
| pilot_daily_reports | 每日日报（6 维评分 + 业务指标） |
| uat_feedbacks | 问题反馈（含 pilot_run_id 关联） |

---

## 十、技术依赖

- **PilotRunDashboardService** — 实时聚合 + 评分引擎 + 日报 UPSERT
- **PilotRunDashboardController** — 4 个 REST 端点
- **Migration** — `20260530_pilot_run_1_execution_center.sql`
- **Frontend** — `/apps/web/src/app/(admin)/pilot-run/page.tsx`
- **Git Tag** — `v3-pilot-run-1-execution-center-20260530`

---

*文档版本：v1.0 · 生效日期：2026-05-30*
