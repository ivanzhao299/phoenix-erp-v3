# 包装运行体系专项审计 Phase P1B

> **任务**：Packaging Runtime Audit Phase P1B（纯审计，不开发/不重构/不新增功能）
> **日期**：2026-06-02
> **背景**：P1A 已上线，`TEMP_PRODUCTION_INBOUND` 为过渡库存来源；长期目标是
> `PACKAGING_INBOUND` 成为唯一库存入口。本审计回答：包装模块是否真的达到车间运行 +
> 唯一库存入口标准，距离切换 `PACKAGING_INBOUND` 还差什么。
> **方法**：3 路并行只读代码审计 + 关键处理器实读核对（BFF terminal flow / packaging.service / labels / 链路）。

---

## 🔴 最重要结论（先说）

> **包装模块存在两套完全并行、互不相通的实现，真实车间流程不生成任何库存。**

| 实现 | API 表面 | 处理者 | 写什么 | 谁在用 |
|------|---------|--------|--------|--------|
| **A · 真实车间流** | `/api/packaging/terminal/*` | `bff.controller.ts` | 仅 `pkg_grading_records` / `pkg_packing_records` / `pkg_handover_records`（JSONB 记录表） | **全部前端车间页面** |
| **B · Admin/Service 流** | `/api/packaging/*` | `packaging.service.ts`（completeShift/submitGrade/packComplete + Phase 1 库存钩子） | `inv_batches` / `inv_ledger` / 调 `completePackagingBatch` | **没有任何前端调用** |

**实证**：
- BFF `packing/submit`（line 1582）只 `INSERT pkg_packing_records`，**不写 `inv_batches`**；
  `grading/submit`（1450）只写 `pkg_grading_records`；`warehouse/confirm`（1662）只写 `pkg_handover_records`。
- 全仓 `grep` 前端调用 `/api/packaging/tasks/*pack-complete`、`/api/packaging/shifts/*/complete` → **零结果**。
- 即：我在生产链路收口 Phase 1 把库存联动接到了 `packaging.service.packComplete`，但**那条 admin 流没有任何前端在用** → Phase 1 的包装→库存联动在生产中是**孤儿代码**；真实车间走的 BFF 流**完全不生成库存**。

**直接推论**：现在若把模式切到 `PACKAGING_INBOUND`，车间正常作业将产出 **0 可售库存**（销售无货）。
→ **P1A 保留 `TEMP_PRODUCTION_INBOUND` 过渡模式的决策是正确且必要的。**

---

## 1. 包装业务链路

**真实车间链路（BFF terminal flow，前端实际走的）**：
```
开班 shift-open → 集蛋接收 source-receive → 首检 qc-inspection
  → 分级 grading/submit → 包装 packing/submit → 标签打印 label-print
  → 成品交接 warehouse/confirm → 交班 shift-close → 异常 exceptions
        ↓（写入）
   pkg_source_batches / pkg_grading_records / pkg_packing_records /
   pkg_handover_records / pkg_qc_inspections / pkg_work_shifts / pkg_exceptions
        ↓
   ❌ 不写 inv_batches / inv_ledger —— 库存链路在此断裂
```

**库存生成链路（Service flow，无人调用）**：
```
completeShift → inv_batches(EGG-* 鲜蛋) → submitGrade → inv_batches(PRD-EGG-{grade})
  → packComplete → inv_batches(PRD-EGG-*-PACK, legacy) + wms_inbound
    → completePackagingBatch（Phase 1）→ inv_batches(EGG-YYYYMMDD-*, PACKAGING_INBOUND) → FIFO
        ↑ 完整且正确，但前端无人触发
```

**结论**：包装"作业链路"作为**记录系统**是完整可用的；但"包装→库存"在真实流程中**断链**。

---

## 2. 包装任务体系

| 能力 | 状态 | 说明 |
|------|------|------|
| 包装计划 | 🟡 半成品 | 无独立计划表；plan_qty 寄生在 pkg_tasks（且 pkg_tasks 属 Service 流） |
| 包装任务 | ✅（双轨） | Service 流 pkg_tasks（GRADING/PACKING/REMAINDER）；BFF 流用 records 表，不建 pkg_tasks |
| 包装工位/产线 | ✅ 表存在 | `pkg_work_shifts`(site_id/line_id/operator/supervisor)，开/关班、卫生/设备点检 |
| 包装班组 | 🟡 半成品 | 仅 shift_type(AM/PM/NIGHT)，无 team 表 |
| 包装班次 | ✅ | BFF `pkg_work_shifts` open/close；Service `pkg_shifts` |
| 包装人员 | ✅ | operator/supervisor 字段 + getOperators 取系统用户 |
| 包装效率 | ❌ 缺失 | 无产能/耗时/人效聚合 |
| 包装日报 | ✅ | `reports/shift-summary` + Service `daily-report`/`daily-report-range` |

---

## 3. 包装批次体系

| 表 | 写入流 | 生命周期 |
|----|--------|---------|
| `pkg_shifts` | Service | 创建→PENDING→DONE；支持 reopen（级联清库存/反向流水） |
| `pkg_tasks` | Service | GRADING: PENDING→DONE；PACKING: PENDING→COMPLETED；REMAINDER→MERGED；支持 CANCELLED/reopen |
| `pkg_source_batches` | **BFF** | PENDING_RECEIVE→RECEIVED→QC_PASS/FAIL |
| `pkg_grading_records` | **BFF** | 一次性 JSONB 记录（outputs_json + total_output） |
| `pkg_packing_records` | **BFF** | 一次性 JSONB 记录（batches_json + boxes/eggs） |
| `pkg_handover_records` | **BFF** | 一次性 JSONB 记录（boxes/pallet/location/receiver） |

- 创建/执行/完成/取消/重开/追溯：**Service 流齐全**（pkg_shifts/pkg_tasks 状态机完整）。
- **BFF 流是"流水账"式记录**：无状态机、无批次实体、无取消/重开，仅按 code 幂等 INSERT。
- 两套批次语义不互通：BFF 的 `pkg_packing_records.code`(PKG-*) 与 Service 的 `pkg_tasks.task_no`(PACK-*) 无关联。

---

## 4. 分级体系

- 等级主数据 `product_grades`(grade_code, is_saleable, is_storable) **完整**：AA/A/B/C/DIRTY/BROKEN/CRACKED/DAMAGED。
- **Service 流**：submitGrade 按 is_saleable 拆 inv_batches（可售 AVAILABLE / 不可售 QUARANTINE+qty_available=0），真正参与库存/SKU/销售。
- **BFF 流（真实车间）**：grading/submit 只把 `outputs_json={等级:数量}` 写 `pkg_grading_records`，**不查 is_saleable、不写 inv_batches** → 等级在真实流程中**不参与库存/销售**，仅作记录与"净可分级量"校验。
- 结论：等级链路在 Service 流完整、在真实 BFF 流断裂。

---

## 5. 标签打印体系

| 字段 | 支持 |
|------|------|
| 批次号 batch_no | ✅ |
| 等级 grade_code/name | ✅ |
| 规格 pack_name | ✅ |
| 包装/生产日期 | ✅（可配置显隐） |
| 保质期 expiry | ✅（可配置） |
| 条码 Code128 | ✅（前端 SVG 动态生成，箱码 PH-XXXXXX-GX-YYY） |
| 二维码 QR | ❌ 未实现 |
| SKU 码 | ❌ 未实现 |

- 后端 `lbl_records` 审计表记录每次打印（含补打原因 reprintLog）；尺寸预设 50×25/40×30/60×40/80×50mm，kiosk 直打。
- 结论：**标签打印达到车间可用**（条码+核心字段齐全），缺 QR/SKU（非阻断）。

---

## 6. 包装损耗体系

- 集蛋班次：dirty_eggs/broken_eggs/bad_eggs。
- 首检 `pkg_qc_inspections`：broken/dirty/leaking/abnormal_shape/floor_egg_qty + 壳清洁/气味/容器 OK + PASS/FAIL。
- pkg_tasks（Service）：breakage_qty/breakage_rate/presort_dirty/broken_qty/discrepancy_qty。
- 不可售等级经 `product_grades.is_saleable=false` → QUARANTINE 隔离（Service 流）。
- 异常 `pkg_exceptions`：类型/严重度/批次/数量/照片/OPEN-CLOSED。
- 结论：**损耗采集完整**（车间级）；但**损耗统计报表缺失**（无汇总/趋势/占比看板），且不可售隔离只在 Service 流生效。

---

## 7. 包装效率体系

- 有基础数据：`pkg_work_shifts`(operator/supervisor/opened_at/closed_at/site/line)、pkg_tasks(start_time/graded_at/completed_at/by)。
- **缺**：产能(throughput/h)、单任务耗时、人效、工位效率、班组对比的**聚合接口与报表**。
- 移动端 `mobile/packaging` 有 7 日趋势（箱数/任务数），属产出趋势非效率分析。
- 结论：**效率体系基本缺失**（有原料数据、无分析）。

---

## 8. 包装与库存联动（重点）

- **真实车间流（BFF）：完全不生成库存。** packing/submit 只写 pkg_packing_records。
- **Service 流：库存联动完整**（含 Phase 1 的 EGG-YYYYMMDD-* 统一可售批次、PACKAGING_INBOUND 流水、幂等、互斥门控、legacy 隔离），**但无前端调用**。
- `PRD-EGG-*` 在 Service 流被正确标 `legacy_source=PACKAGING_INTERMEDIATE`（FIFO 排除），可售批次走 `EGG-YYYYMMDD-*`。
- 结论：**包装→库存联动在真实流程中断裂（P0）**；联动代码正确但接错了流（孤儿）。

---

## 9. 包装与销售联动

- 链路设计：包装批次 → inv_batches(EGG-YYYYMMDD-*) → sal_order_items(FIFO PATH A SKU / PATH B product+grade) → POS → 退货回库。
- **断链位置**：第一环（包装批次 → inv_batches）在真实 BFF 流即断 → 后续销售/POS/退货拿不到包装产出的库存。
- 次生风险：即便接通，SKU 主数据不全 → 销售走 PATH B(product+grade)，若销售指定等级与包装产出等级不匹配则 FIFO 无货。
- 结论：**销售联动不闭环**（根因是第 8 节的库存断链）。

---

## 10. 包装菜单体系

**当前**（Sidebar 生产管理组）：包装作业、包装批次、包装日报、异常处理、补打日志 + 质检；车间台 `(terminal)/terminal/packaging/*` 10 页。

**建议结构（任务给定）对比**：

| 建议菜单 | 现状 |
|---------|------|
| 包装任务 | 🟡 分散在 terminal（无统一"任务"入口） |
| 集蛋记录 | ✅ Phase 1 已加 /breeding/egg-ledger |
| 分级作业 | ✅ terminal/grading |
| 包装作业 | ✅ terminal/packing |
| 标签打印 | ✅ terminal/label-print |
| 包装日报 | ✅ admin/daily-report + mobile |
| 包装效率 | ❌ 缺 |
| 包装异常 | ✅ terminal+admin/exceptions |
| 场端质检 | ✅ quality/farm |
| 成品质检 | ✅ quality/product + terminal/qc-inspection |
| 包装追溯 | 🟡 labels/trace 仅含 packing→grading→source→house，未连库存/销售 |

---

## 11. Packaging Readiness Score

| 维度 | 分(0-10) | 依据 |
|------|---------|------|
| 包装任务 | 7 | 真实 terminal 全流程可用（记录级） |
| 分级 | 6 | BFF 记录 + 净可分级校验好；不参与真实库存 |
| 包装 | 6 | BFF 记录可用；不生成库存 |
| 标签打印 | 6 | 条码+核心字段齐；无 QR/SKU |
| **库存联动** | **2** | **真实流零库存；联动接在孤儿 admin 流** |
| **销售联动** | **2** | 因库存断链而不闭环 |
| 追溯 | 5 | 包装内部追溯好；未连库存/销售 |
| 损耗 | 6 | 采集完整；无统计报表 |
| 效率 | 3 | 有原料数据；无分析 |

> **综合就绪度：≈ 4.3 / 10**
> 车间"记录系统"成熟（≈7），但作为"唯一库存入口"的核心目的（库存+销售联动）≈2。

---

## 12. P0 / P1 / P2 问题清单

**P0（阻断 PACKAGING_INBOUND 切换）**
1. **两套并行实现**：真实车间走 BFF terminal flow（零库存），库存联动在无人调用的 Service flow。必须收口为一条，并把库存生成接到真实流（BFF packing/submit 或 warehouse/confirm）。
2. **真实包装产出不进 inv_batches**：包装完成不生成可售库存 → 切 PACKAGING_INBOUND 即"有产无货"。

**P1（车间可用但影响闭环质量）**
3. BFF 记录表与 Service 批次语义不互通（pkg_packing_records.code ↔ pkg_tasks.task_no 无关联），追溯断在库存前。
4. 不可售等级隔离（is_saleable）仅 Service 流生效，BFF 流不区分。
5. SKU 主数据不全 → 销售 PATH B 等级匹配脆弱。
6. 包装追溯未连 inv_batches → 销售 → 客户。

**P2（体验/管理增强）**
7. 效率体系缺失（产能/人效/工位/耗时聚合）。
8. 损耗统计报表缺失（仅采集无看板）。
9. 标签无 QR/SKU。
10. 包装计划/班组为半成品。

---

## 13. 明确回答

**1. 包装模块真实完成度？**
作为**车间记录系统**：≈70%（开班/集蛋/首检/分级/包装/标签/交接/交班/异常全流程真实可用）。
作为**库存生成入口**：≈20%（真实流程不写 inv_batches；库存联动代码正确但接在无人调用的孤儿流）。
综合就绪度 **≈4.3/10**。

**2. 是否达到车间实际使用标准？**
**基本达到（作为记录/作业系统）。** 真实 terminal 10 页面全可用、有校验、有异常阻断、有标签直打，现场能跑作业。

**3. 是否达到唯一库存入口标准？**
**未达到（根本性断裂）。** 真实包装流程零库存产出，切 PACKAGING_INBOUND 会导致销售无货。

**4. 距离 PACKAGING_INBOUND 还差什么？**
- 收口两套并行实现为一条主流程；
- 把库存生成（createProductionBatch / completePackagingBatch）接到**真实 BFF 车间流**（packing/submit 或 warehouse/confirm 节点）；
- 打通 BFF 记录 → inv_batches → 销售 的追溯（batch_no 关联）；
- 不可售等级隔离纳入真实流；
- （次要）SKU 绑定、效率/损耗报表、QR。

**5. 下一步：重构还是直接上线？**
**必须先重构（收口），不可直接上线 PACKAGING_INBOUND。**
- 现在切换 = 现场无库存。
- 正确路径：**保持 `TEMP_PRODUCTION_INBOUND` 运行**（P1A 已就绪，现场不受影响）→ 下一阶段做"包装运行体系收口 P1C"：统一两套流 + 把库存联动接到真实车间流 → 灰度验证（单 SITE 切 PACKAGING_INBOUND 跑通 包装→库存→销售）→ 再全量切换、冻结 TEMP。

**是否达到 PACKAGING_INBOUND 切换条件：❌ 否。** 建议过渡期继续 `TEMP_PRODUCTION_INBOUND`，下阶段执行收口重构 P1C。

---

## 附录 · 关键证据文件

- `apps/api/src/modules/bff/bff.controller.ts`：真实车间流 `grading/submit`(1450) / `packing/submit`(1582) / `warehouse/confirm`(1662) — 均不写 inv_batches。
- `apps/api/src/modules/terminal/packaging.service.ts`：库存生成流 completeShift/submitGrade/packComplete（+ Phase 1 completePackagingBatch 钩子）— 无前端调用。
- `apps/api/src/modules/terminal/packaging.controller.ts`：`/api/packaging/*`（admin/孤儿流路由）。
- `apps/web/src/lib/packaging-api.ts`：前端全部走 `/api/packaging/terminal/*`（BFF 流）。
- `apps/api/src/modules/sales-v2/services/packaging-inventory-integration.service.ts`：Phase 1 库存联动（正确但接错流）。
- 库存联动正确性：`EGG-YYYYMMDD-*` 统一命名、`PACKAGING_INBOUND` 流水、幂等键 `packaging_batch_ref`、互斥门控、`legacy_source` 隔离 —— 设计无误，仅"接入点"错。
