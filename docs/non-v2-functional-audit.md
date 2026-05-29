# Phoenix ERP V3 — Non-V2 模块功能审计报告
**审计日期**: 2026-05-29  
**审计范围**: 所有非 V2 模块（前端 `/admin` 路由 + 后端 `modules/`）  
**目的**: 为左侧菜单正式重组（Navigation Refactor Phase 2B）提供前置依据  
**结论**: 共 25 个前端路由、14 个后端模块，分 A/B/C/D/E 五级，输出 4 阶段清理计划

---

## 一、Executive Summary

| 维度 | 数据 |
|------|------|
| 前端总路由数 | 25 |
| 后端总模块数 | 14（非V2） + 5（V2） |
| 完全健康（A级）| 9 个模块 |
| 需迁移/增强（B级）| 7 个模块 |
| 已有V2替代但未切换（C级）| 4 个模块 |
| 已冻结/待删除（D级）| 5 个模块 |
| 死代码（E级）| 3 个 stub 文件 |

**一句话定级**: Non-V2 模块整体偏旧，其中 5 个已冻结（sidebar 已注释）、4 个有 V2 替代版等待正式切换，9 个核心业务模块健康在用。Navigation Refactor 可安全推进，但需先完成 C 级模块的 V2 切换声明。

---

## 二、扫描范围与方法

### 前端扫描
- **路径**: `apps/web/src/app/(admin)/`
- **方法**: 扫描全部 25 个一级路由目录，读取 `page.tsx` 首部确认 API 调用模式，检查 sidebar 菜单注释状态
- **工具验证**: 逐一确认 `LegacyFreezeBanner` 组件存在性、`/api/v2/` 调用比例

### 后端扫描
- **路径**: `apps/api/src/modules/`
- **方法**: 列举全部模块目录，统计 controller/service 文件、代码行数，检查 `app.module.ts` 注册状态
- **交叉验证**: 检查 V2 跨模块依赖（FinanceV2Module、SalesV2Module 导入关系）

---

## 三、全量模块清单

### 3.1 V2 核心模块（保留，不属本审计范围）

| 模块 | 后端路径 | 前端路由 | 代码规模 | 状态 |
|------|----------|----------|----------|------|
| Sales V2 | `sales-v2/` | `/sales2` | 9,304行 / 12控制器 | ✅ 生产级 |
| Finance V2 | `finance-v2/` | `/finance2` | 8,669行 / 8控制器 | ✅ 生产级 |
| Procurement V2 | `procurement-v2/` | `/procurement2` | 7,494行 / 10控制器 | ✅ 生产级 |
| Approval Engine | `approval-engine/` | N/A（被workflow消费） | 1,796行 | ✅ 生产级 |
| Workflow | `workflow/` | `/workflow` | 4,463行 / 6控制器 | ✅ 生产级 |
| Master Data V2 | `org/` + BFF | `/master-data` | 1,121行 | ✅ 生产级 |

### 3.2 非V2模块全量清单

| # | 前端路由 | 后端模块 | 前端API模式 | 业务域 | 分级 |
|---|----------|----------|-------------|--------|------|
| 1 | `/breeding` | `farm/` + `iot/` | `/api/crud/*` + `/api/farm-device/*` | 养殖生产 | **A** |
| 2 | `/packaging` | `terminal/` | `/api/packaging/terminal/*` | 分级包装 | **A** |
| 3 | `/warehouse` | `wms/` | `/api/crud/wms_*` + `/api/stocktake/*` | 仓储库存 | **A** |
| 4 | `/store` | `store/` | `/api/crud/pos_*` + `/api/crud/store_*` | 直营门店 | **A** |
| 5 | `/store-pos` | `store-pos/` + `store/` | `/api/v2/store-sales/*` (partial) | 零售收银 | **A** |
| 6 | `/quality` | `quality/` | `/api/crud/qa_*` | 品质追溯 | **A** |
| 7 | `/settings` | `master/` + `permissions/` | `/api/users` + `/api/crud/sys_*` | 系统设置 | **A** |
| 8 | `/workflow` | `workflow/` | `/api/workflow/*` + `/api/approval/*` | 工作流审批 | **A** |
| 9 | `/dashboard` | `bff/` (DashboardBffController) | `/api/dashboard/kpi` | 主看板 | **A** |
| 10 | `/members` | `bff/` (WholesaleBffController) | `/api/crud/crm_members` | 会员营销 | **B** |
| 11 | `/wholesale` | `bff/` (WholesaleBffController) | `/api/crud/b2b_customers` + `/api/crud/` | 批发管理 | **B** |
| 12 | `/analytics` | `bff/` (AnalyticsBffController) | `/api/analytics/dashboard` | 数据分析 | **B** |
| 13 | `/master` | `master/` | `/api/crud/brd_farms` + `/api/crud/mst_*` | 旧主数据 | **B** |
| 14 | `/notifications` | `notification/` | `/api/notifications/*` | 通知中心 | **B** |
| 15 | `/uat` | `uat/` | `/api/uat/*` | 验收试运行 | **B** |
| 16 | `/system` | `system-monitor/` | `/api/system/monitor/*` | 系统运维 | **B** |
| 17 | `/order` | `order/` | `/api/crud/ord_*` + `/api/orders` | 订货系统（旧） | **C** |
| 18 | `/wholesale` (重叠) | `bff/` | `/api/crud/b2b_customers` | B2B分销（旧） | **C** |
| 19 | `/b2b` | N/A（无专用模块） | `/api/crud/b2b_customers` | B2B分销（旧） | **C** |
| 20 | `/procurement` | `procurement/` | `/api/crud/prc_*` + `/api/procurement/*` | 旧采购 | **C** |
| 21 | `/transport` | N/A（模块不存在） | `/api/crud/` | 旧配送运输 | **D** |
| 22 | `/pos` | `store/` (partial) | `/api/crud/pos_*` | 旧POS（安全漏洞） | **D** |
| 23 | — | `procurement/` stub | N/A | compat stub | **E** |
| 24 | — | `terminal/` stub | N/A | compat stub | **E** |
| 25 | — | `iot/` stub | N/A | compat stub | **E** |

---

## 四、分级详细说明

### 🟢 A 级 — 健康在用，直接保留

#### A1. `/breeding` — 养殖生产
**后端**: `farm/`（5个controller + 5个service，1,372行） + `iot/`（4个controller + 2个service，1,573行）  
**前端**: 14个子页面（henhouse、flock、daily、immune、medicine、device、device-alerts、device-ops、egg-ledger、feed、henreport、med-stock）  
**API**: `/api/crud/brd_*`、`/api/farm/*`、`/api/farm-device/*`、`/api/v3/iot/devices`  
**业务覆盖**: 鸡舍管理 → 存栏日报 → 产蛋台账 → 饲料台账 → 用药台账 → IoT设备监控 → 设备告警  
**健康评估**: ✅ 全链路覆盖，IoT设备监控已升级至 v3 端点，无重大技术债  
**Navigation建议**: 保留，建议重命名为"养殖生产"（当前sidebar已是此名），合并设备监控子项

---

#### A2. `/packaging` — 分级包装
**后端**: `terminal/`（4个controller + 4个service，1,661行）  
**前端**: 6个子页面（inbound、batch、daily-report、exceptions、print-logs）+ 包装作业台快捷入口  
**API**: `/api/packaging/terminal/*`、`/api/packaging/operators`  
**业务覆盖**: 入库报工 → 批次管理 → 日报统计 → 异常处理 → 标签重印  
**健康评估**: ✅ 专用 terminal 端点，有独立 PDA 管理（`api/pda`），含作业台入口跳转  
**Navigation建议**: 保留，建议归入"生产运营"分组

---

#### A3. `/warehouse` — 仓储库存
**后端**: `wms/`（4个controller + 2个service，1,206行）  
**前端**: 13个子页面（inbound、outbound、transfer、stocktake、ledger、query、warehouses、zones、locations、expiry、daily-close、loss-report）  
**API**: `/api/crud/wms_*`、`/api/inventory/*`、`/api/stocktake/*`、`/api/inbound/*`、`/api/outbound/*`  
**业务覆盖**: 入库 → 出库 → 移库 → 盘点 → 台账查询 → 仓库主数据 → 临期预警 → 日结 → 损耗  
**健康评估**: ✅ 仓储全链路。注意：WMS 与 `order/` 模块有 `forwardRef` 循环依赖，后者冻结后可消除  
**Navigation建议**: 保留，建议归入"仓储物流"分组

---

#### A4. `/store` — 直营门店
**后端**: `store/`（2个controller + 2个service，1,053行）  
**前端**: 6个子页面（receiving、inventory、replenish、losses、daily）  
**API**: `/api/crud/pos_sales`、`/api/crud/store_*`、`/api/crud/inv_batches`  
**业务覆盖**: 门店收货 → 门店库存 → 补货申请 → 损耗登记 → 日结对账  
**健康评估**: ✅ 直营门店的日常运营流程完整，独立于配送链路  
**Navigation建议**: 与 `/store-pos` 合并为"直营门店"分组

---

#### A5. `/store-pos` — 零售收银
**后端**: `store-pos/`（1个controller + 2个service，1,030行，API: `/api/v2/store-sales/*`）  
**前端**: 1个页面（POS台面：商品目录 | 购物车 | 结账）  
**API**: `/api/v2/store-sales/*`（V2端点，生产级）  
**业务覆盖**: 扫码/选品 → 加购 → 优惠券 → 收款 → 找零 → 小票  
**健康评估**: ✅ 已用V2 API，与 `store-pos` NestJS 模块对应，Sales V2 的零售入口  
**Navigation建议**: 归入"直营门店"分组，作为收银入口

---

#### A6. `/quality` — 品质追溯
**后端**: `quality/`（1个controller + 1个service，400行）  
**前端**: 7个子页面（farm、product、nonconformance、forward、backward、standards）  
**API**: `/api/crud/qa_*`、`/api/quality/*`  
**业务覆盖**: 农场品质检验 → 产品QC → 不合格品管理 → 正向/反向溯源 → 质量标准  
**健康评估**: ✅ 完整质量管理体系，溯源链路与 Sales V2 退货质检衔接  
**Navigation建议**: 保留，建议归入"品质管理"分组

---

#### A7. `/settings` — 系统设置
**后端**: `master/`（2个controller + 0个service，379行） + `permissions/`（2个controller + 2个service，958行）  
**前端**: 17个子页面（users、roles、organizations、data-scopes、dict、products、master-data、approval-rules、permissions、pda-terminals、pos-config、store-stock、security、health、audit-log、brand、profile）  
**API**: `/api/users`、`/api/crud/sys_*`、`/api/permissions/*`、`/api/system/*`、`/api/approval/rules`  
**业务覆盖**: 完整系统管理功能  
**健康评估**: ✅ 生产必需，其中 `approval-flows` 页面是重定向 stub（跳转至 approval-rules），不影响功能  
**Navigation建议**: 保留，确保"系统设置"固定在sidebar底部

---

#### A8. `/workflow` — 工作流审批
**后端**: `workflow/`（6个controller + 8个service/scheduler，4,463行）  
**前端**: 多个子页面（todos、history、metrics、forms/runtime、builder、designer、instances 等）  
**API**: `/api/workflow/*`、`/api/approval/*`  
**业务覆盖**: 审批中心 → 表单设计 → 流程配置 → 指标监控  
**健康评估**: ✅ Workflow 2.0 完整，被 Procurement V2 / Finance V2 / Sales V2 调用  
**Navigation建议**: 保留，独立分组"审批工作流"

---

#### A9. `/dashboard` — 主看板
**后端**: `bff/DashboardBffController`（`/api/dashboard/kpi`）  
**前端**: 1个主页面 + `_components/`  
**业务覆盖**: 全场经营KPI看板  
**健康评估**: ✅ 入口页，所有角色默认落地页  
**Navigation建议**: 固定在顶部，不纳入分组列表

---

### 🟡 B 级 — 功能可用，存在痛点/技术债，建议中期优化

#### B1. `/members` — 会员营销
**后端**: 无专用模块；BFF 中 `WholesaleBffController` 处理 b2b 相关；会员数据通过 `GenericCrudModule` 操作 `crm_members` 表  
**前端**: 5个子页面（list、points、coupons、activity）  
**技术债**:  
- 无专用后端服务，全靠 generic-crud，无会员等级变更逻辑，无积分兑换业务规则  
- `crm_members` 表字段未建索引，大数据量查询慢  
- 与 Sales V2 客户体系（`sal_customers`）完全独立，存在客户数据孤岛  
**业务影响**: 低（目前会员营销功能浅）  
**建议**: 中期将会员主档与 `sal_customers` 合并，新增积分/优惠券 V2 Service

---

#### B2. `/wholesale` — 批发管理
**后端**: `BffModule/WholesaleBffController`（BFF层直接查 `b2b_customers` 表，无独立 Wholesale 模块）  
**前端**: 3个子页面（contracts、shipments）+ `LegacyFreezeBanner`  
**技术债**:  
- 前端有 LegacyFreezeBanner，说明功能已被标记为迁移中  
- 实际批发合同、发货单操作均通过 generic-crud 而非 Sales V2 的 sal_orders/sal_delivery_orders  
- `b2b_customers` 与 `sal_customers` 两套客户主档未合并（Sales V2 审计中已记录此问题）  
**建议**: 批发业务应迁移至 Sales V2 渠道管理（`sal_channels`），本模块应标记 D 级后清理

---

#### B3. `/analytics` — 数据分析
**后端**: `bff/AnalyticsBffController`（`/api/analytics/dashboard`）+ `sales-v2/SalesAnalyticsController`  
**前端**: 5个子页面（price-review、production、inventory、feed）  
**技术债**:  
- 前端 analytics 调的是旧 `/api/analytics/dashboard`，而 Sales V2 已有完整11维分析端点（`/api/v2/sales/analytics/*`）  
- 生产趋势/库存周转图表数据源与 Sales V2 Egg Inventory Runtime 重叠  
- price-review 页面与 Sales V2 价格审查功能（`/sales2/pricing`）功能重叠  
**建议**: 短期重定向旧分析端点至 V2，中期合并为"经营分析"统一入口

---

#### B4. `/master` — 旧主数据（Legacy）
**后端**: `master/`（`/api/master/*` + `/api/system/users`）  
**前端**: 5个子页面（farms、products、stores、orgs）sidebar 标注"[Legacy] 旧主数据入口"  
**技术债**:  
- 与 `/master-data`（新主数据中心，V2）功能重叠  
- 部分数据（farms、stores）是 `breeding/` 和 `store/` 的主数据，不应单独作为入口  
- `master.controller` 使用 EntityManager 直接查询，无 Service 层  
**建议**: 将仍在用的主数据（产品等级、门店主档）迁入 `/master-data`，本页删除

---

#### B5. `/notifications` — 通知中心
**后端**: `notification/`（`notification.service` + `push-notification.service`，440行）  
**前端**: 1个页面  
**技术债**: 功能简单、完整，但桌面端通知中心与移动端通知中心（`/mobile/notifications`）使用同一后端，未做桌面/移动端适配分层  
**建议**: 保留，低优先级优化，长期可与 Workflow 待办合并为统一消息中心

---

#### B6. `/uat` — 验收试运行
**后端**: `uat/`（5个controller + 5个service，1,007行）  
**前端**: 1个聚合页面  
**评估**: UAT 系统本身是内部工具，功能完整，技术债极低  
**建议**: 保留，Navigation Refactor 中可放入"运维工具"分组或作为独立功能

---

#### B7. `/system` — 系统运维
**后端**: `system-monitor/`（4个controller + 4个service，798行）  
**前端**: 3个子页面（health、alerts、configs）  
**评估**: 生产监控完整，无技术债  
**建议**: 保留，归入"系统运维"分组，与 `/settings` 分开

---

### 🔴 C 级 — 已有V2替代，等待正式切换

#### C1. `/order` — 订货系统（旧）
**后端**: `order/`（1个controller + 2个service，633行，含 `sales-engine.service`）  
**前端**: 8个子页面（approval、picking、loading、credit、customers、farm-sales、prices），sidebar 已注释，显示 LegacyFreezeBanner  
**V2替代**: `sales-v2/` → `/sales2/orders`  
**残留问题**:  
- `order/` 模块仍在 `app.module.ts` 注册，被 `store/` 依赖（forwardRef 循环）  
- `wms/` 模块也依赖 `order/`（出库联动）→ 此依赖需用 Sales V2 的 `SalesOrdersService` 替代  
- `/order/farm-sales` 子页面已混用 `/api/v2/` 端点，说明迁移工作已部分进行  
**风险**: `order/` 删除前需确认 `wms/` 的出库联动已切换至 Sales V2  
**建议**: Phase A（见第六章）中完成依赖切换后，注释掉模块注册

---

#### C2. `/b2b` — B2B分销（旧）
**后端**: 无专用模块（BFF 层处理）  
**前端**: 4个子页面（customers、orders、distributor-grading），sidebar 已注释，显示 LegacyFreezeBanner  
**V2替代**: `sales-v2/` → `/sales2` + `sal_channels`（分销渠道）  
**残留问题**: `b2b_customers` 表仍被 BFF 使用，`WholesaleBffController` 未废弃  
**建议**: 确认 B2B 客户已全部迁入 `sal_customers`（渠道类型=DISTRIBUTOR）后，注释 BFF Controller

---

#### C3. `/procurement` — 旧采购（冻结）
**后端**: `procurement/`（1个controller + 1个service，1,009行）+ 空 stub `procurement-v2-compat.service.ts`  
**前端**: 7个子页面，sidebar 已注释，显示 LegacyFreezeBanner  
**V2替代**: `procurement-v2/` → `/procurement2`  
**残留问题**:  
- `procurement/` 模块仍在 `app.module.ts` 注册（活跃，非注释）  
- `procurement-v2-compat.service.ts` 是空 stub，可直接删除（E级）  
**建议**: 确认无前端调用后，从 `app.module.ts` 移除注册

---

#### C4. `/transport` — 旧配送运输（冻结）
**后端**: 无对应模块（后端无 transport module）  
**前端**: 7个子页面（wave、tracking、receipt、exceptions、vehicles、drivers），sidebar 已注释，显示 LegacyFreezeBanner  
**V2替代**: `sales-v2/delivery-orders` → `/sales2/delivery`  
**残留问题**: 前端页面文件仍存在于代码库，占用路由命名空间  
**建议**: Phase B 直接删除 `/transport` 目录

---

### ⚫ D 级 — 已冻结，安全隐患，需立即处理

#### D1. `/pos` — 旧POS（安全漏洞）
**后端**: `store/pos.controller`（共用 store 模块）  
**前端**: 2个页面（page.tsx、sales/page.tsx），sidebar 注释原因：`perm:null` 安全漏洞  
**问题**: 此路由没有任何权限检查（perm:null），任何登录用户均可访问  
**V2替代**: `/store-pos`  
**建议**: **立即**（Phase A 第一步）删除 `/pos` 前端目录，或在 layout 加硬编码权限检查

---

### ⚪ E 级 — 死代码，直接删除

| 文件 | 位置 | 说明 |
|------|------|------|
| `procurement-v2-compat.service.ts` | `modules/procurement/` | 空 stub，无任何实现代码 |
| `terminal-v2-compat.service.ts` | `modules/terminal/` | 空 stub，无任何实现代码 |
| `iot-v2-compat.service.ts` | `modules/iot/` | 空 stub，无任何实现代码 |

---

## 五、重点问题专项分析

### 5.1 模块循环依赖问题

```
order/ ←→ wms/ (forwardRef 循环)
order/ ← store/ (store 导入 OrderModule)
```

**根因**: `WmsService.confirmOutbound()` 调用了 `OrderService.updateStatus()`，而 `OrderService` 又需要 `WmsModule` 创建出库单。这是 Sales V2 前的历史设计。  
**解法**: Sales V2 已有完整的 `SalesOrdersService` + `DeliveryOrdersService`，WMS 出库应通过 Sales V2 的 adapter 联动，`order/` 模块可随之解依赖。

### 5.2 客户主档孤岛问题

Phoenix ERP 现有三套客户主档并存：
- `ord_customers`（`order/` 模块，B2B散客）
- `b2b_customers`（BFF 直查，分销商）
- `sal_customers`（Sales V2，统一客户主档）
- `crm_members`（members 模块，会员客户）

Sales V2 设计中 `sal_customers` 是唯一正确主档，其余为遗留数据。导航重组后需明确哪个是"权威入口"。

### 5.3 分析/BI 端点重叠问题

| 前端路由 | 调用端点 | 数据源 |
|---------|---------|--------|
| `/analytics` | `/api/analytics/dashboard` | BFF 直查多表 |
| `/sales2/reports` | `/api/v2/sales/analytics/*` | Sales V2 分析服务（11维） |
| `/mobile/delivery/performance` | `/api/v2/mobile/delivery/performance` | Sales V2 移动端 |

三套分析入口调用不同端点，数据口径不一致，建议中期合并至 Sales V2 Analytics。

### 5.4 Sidebar 菜单与模块边界不一致

当前 Sidebar 共有 **18个一级分组/模块入口**，其中：
- "会员营销"和"批发管理"实际共用 `bff/WholesaleBffController`，前端权限标注均为 `MENU_B2B_SALE`
- "主数据"入口重复：`/master`（旧）和 `/master-data`（V2）同时显示  
- "工作流"和"审批规则"分属 `/workflow` 和 `/settings/approval-rules`，配置入口分散

### 5.5 Store / POS 双栈共存

| 模块 | 后端 | 前端 | API | 状态 |
|------|------|------|-----|------|
| 旧POS | `store/pos.controller` | `/pos` | `/api/crud/pos_*` | D级-安全漏洞 |
| 旧门店 | `store/store.controller` | `/store` | `/api/crud/store_*` | A级 |
| 新POS | `store-pos/` | `/store-pos` | `/api/v2/store-sales/*` | A级 |

旧 `/pos` 需立即删除，`/store` 和 `/store-pos` 应在 Navigation 中统一归入"直营门店"分组。

---

## 六、能力评分（10 分制）

| 维度 | 评分 | 说明 |
|------|------|------|
| 养殖生产完整性 | 8/10 | IoT已升v3，存栏/产蛋/饲料/用药全覆盖；缺自动预警规则引擎 |
| 包装生产完整性 | 8/10 | 分级/PDA/标签链路完整；缺与Sales V2库存的实时对接 |
| 仓储WMS完整性 | 7/10 | 全链路但与Sales V2出库联动靠旧order模块（需重构） |
| 门店管理完整性 | 8/10 | store+store-pos双轨，POS已V2；旧/pos漏洞是扣分点 |
| 品质追溯完整性 | 7/10 | 溯源链路完整；与Sales V2退货质检的数据流向需验证 |
| 客户/会员体系 | 4/10 | 四套主档孤岛，最差维度 |
| 批发/B2B体系 | 3/10 | 已冻结，仅残留BFF，等待迁入Sales V2 |
| 分析/BI体系 | 5/10 | 三套重叠端点，口径不一 |
| 系统管理/RBAC | 9/10 | 完整，permissions + data-scope + workflow规则全覆盖 |
| 导航可用性 | 5/10 | 18个入口过多，V2/Non-V2混排，用户认知负担重 |

---

## 七、技术债清单

### CRITICAL
| 问题 | 位置 | 影响 |
|------|------|------|
| `/pos` 无鉴权（perm:null） | `apps/web/src/app/(admin)/pos/` | 任何登录用户可访问POS收银台 |
| `order/`↔`wms/` forwardRef 循环依赖 | `apps/api/src/modules/` | 启动顺序敏感，V2迁移阻塞点 |

### HIGH
| 问题 | 位置 | 影响 |
|------|------|------|
| 四套客户主档孤岛 | `ord_customers`、`b2b_customers`、`sal_customers`、`crm_members` | 客户数据不一致，销售分析口径偏差 |
| WMS出库联动依赖旧order模块 | `wms/wms.service.ts` | Sales V2 delivery切换后出库联动失效风险 |
| `procurement/` 模块仍注册但前端已冻结 | `app.module.ts` | 增加启动开销，干扰模块依赖图 |

### MEDIUM
| 问题 | 位置 | 影响 |
|------|------|------|
| `/master` 和 `/master-data` 双入口 | sidebar + app目录 | 用户混乱，主数据权威源不明确 |
| `/wholesale` LegacyFreezeBanner 但仍在菜单 | sidebar | 用户点击后看到冻结提示，体验差 |
| 三套 analytics 端点口径不一致 | `/analytics`、`/sales2/reports`、`/mobile` | 同一时间段数据可能不同 |
| 空 compat stub 文件（3个） | procurement/terminal/iot 模块 | 无功能，占用代码空间，误导阅读 |

### LOW
| 问题 | 位置 | 影响 |
|------|------|------|
| `master/` 无 Service 层，controller 直接 EntityManager | `master/master.controller.ts` | 难以单测，缺事务管理 |
| `settings/approval-flows` 是 redirect stub | `/settings/approval-flows/page.tsx` | 死路由，应删除或合并 |
| 通知中心桌面/移动端未分层 | notification 模块 | 消息类型混杂，不影响功能 |

---

## 八、保留 vs 清理资产清单

### ✅ 完全保留（A级 + V2）
| 资产 | 类型 | 原因 |
|------|------|------|
| `farm/` + `iot/` 模块 | 后端 | 养殖生产核心，无V2替代 |
| `terminal/` 模块 | 后端 | 包装PDA核心，无V2替代 |
| `wms/` 模块 | 后端 | 仓储WMS核心，无V2替代 |
| `store/` 模块 | 后端 | 门店管理核心 |
| `store-pos/` 模块 | 后端 | 新POS，已V2 API |
| `quality/` 模块 | 后端 | 品质追溯，无V2替代 |
| `master/` 模块 | 后端 | settings/users功能依赖 |
| `permissions/` 模块 | 后端 | RBAC管理 |
| `notification/` 模块 | 后端 | 通知推送 |
| `uat/` 模块 | 后端 | 验收管理工具 |
| `system-monitor/` 模块 | 后端 | 生产监控 |
| `/breeding` 路由树 | 前端 | 养殖生产 |
| `/packaging` 路由树 | 前端 | 包装生产 |
| `/warehouse` 路由树 | 前端 | 仓储管理 |
| `/store` + `/store-pos` | 前端 | 门店+收银 |
| `/quality` 路由树 | 前端 | 品质管理 |
| `/settings` 路由树 | 前端 | 系统设置 |
| `/workflow` 路由树 | 前端 | 工作流审批 |
| `/dashboard` | 前端 | 主看板 |

### 🟡 迁移后保留（完成迁移工作后仍保留入口，但切换至V2）
| 资产 | 迁移目标 | 迁移工作量 |
|------|----------|----------|
| `/analytics` 分析页 | 重定向至 `/sales2/reports` | 小（redirect） |
| `/wholesale` 批发入口 | 归入 `/sales2` 渠道管理 | 中 |
| `/members` 会员入口 | 待 CRM V2 建立后迁入 | 大 |

### ❌ 清理目标（按优先级）
| 资产 | 类型 | 清理条件 | 优先级 |
|------|------|----------|--------|
| `/pos` 前端目录 | 前端路由 | 立即（安全漏洞） | P0 |
| 3个 compat stub 文件 | 后端空文件 | 立即（无条件） | P0 |
| `/transport` 前端目录 | 前端路由（冻结） | 确认无引用后 | P1 |
| `/b2b` 前端目录 | 前端路由（冻结） | 确认无引用后 | P1 |
| `/order` 前端目录 | 前端路由（冻结） | 依赖切换完成后 | P2 |
| `order/` 后端模块注册 | app.module.ts | WMS解依赖完成后 | P2 |
| `/procurement` 前端目录 | 前端路由（冻结） | 已冻结，可删 | P1 |
| `procurement/` 模块注册 | app.module.ts | 无外部依赖，可移除 | P1 |
| `/master` 旧主数据路由 | 前端路由（重叠） | 迁入master-data后 | P2 |
| `WholesaleBffController` | 后端BFF | B2B客户迁入sal_customers后 | P3 |
| `/settings/approval-flows` redirect | 前端stub | 可直接删除 | P3 |

---

## 九、四阶段清理计划

### Phase A — 立即修复（1-2天，无需业务验证）
**目标**: 消除安全隐患 + 删除死代码

| 任务 | 文件 | 风险 |
|------|------|------|
| 删除 `/pos` 前端目录（安全漏洞） | `apps/web/src/app/(admin)/pos/` | 无（已冻结，有V2替代） |
| 删除3个空compat stub | `procurement/terminal/iot` 模块目录 | 无 |
| 删除 `/settings/approval-flows` redirect stub | `apps/web/src/app/(admin)/settings/approval-flows/` | 无（sidebar已注释） |
| 从 `app.module.ts` 移除 `procurement/` 模块注册 | `apps/api/src/app.module.ts` | 低（前端已冻结，无调用） |

---

### Phase B — 路由清理（3-5天，需快速验证）
**目标**: 删除所有已冻结的前端目录

| 任务 | 前提 | 影响 |
|------|------|------|
| 删除 `/transport` 前端目录 | 确认无其他路由引用 | 无（后端从未有此模块） |
| 删除 `/b2b` 前端目录 | 确认无路由跳转引用 | 无（BFF仍服务wholesale） |
| 删除 `/procurement` 前端目录 | Phase A 中后端已移除注册 | 无 |
| 将 `/wholesale` 添加迁移公告 | N/A | 提示用户切换至 /sales2 |

---

### Phase C — 依赖切换（1-2周，需完整测试）
**目标**: 解除 order↔wms 循环依赖

| 任务 | 详情 |
|------|------|
| WMS 出库联动切换至 Sales V2 | `wms/wms.service.ts` 中 `OrderService.updateStatus()` 调用改为调用 `SalesOrdersService`（或通过事件总线解耦） |
| 删除 `store/` 中 `OrderModule` 导入 | `store.module.ts` 中 forwardRef 解除 |
| 从 `app.module.ts` 注释 `OrderModule` | 前提：WMS和Store均不再依赖 |
| 删除 `/order` 前端目录 | 前提：OrderModule 注销后 |

---

### Phase D — 主档整合（2-4周，需业务确认）
**目标**: 统一客户主档，合并分析入口

| 任务 | 详情 |
|------|------|
| `b2b_customers` 数据迁入 `sal_customers` | 渠道类型设为 DISTRIBUTOR，迁移脚本需幂等 |
| `ord_customers` 数据迁入 `sal_customers` | 渠道类型按原有 customer_type 映射 |
| `crm_members` 关联 `sal_customers` | 添加 `sal_customer_id` 外键，会员与客户挂钩 |
| 旧分析端点重定向至 Sales V2 Analytics | `/api/analytics/dashboard` → `/api/v2/sales/analytics/*` |
| 删除 `/master` 旧主数据路由 | 确认全部数据已在 `/master-data` 中可见 |

---

## 十、Navigation Refactor Phase 2B 前置条件

基于本审计，Phase 2B（左侧菜单重组）的**最低前置条件**：

### 必须完成（阻塞 Navigation Refactor）
- [ ] Phase A 全部完成（删除 /pos 安全漏洞、删除 compat stubs）
- [ ] 确认 `/wholesale` 和 `/b2b` 在新菜单中的归属（归入 Sales V2 还是独立保留）
- [ ] 确认 `/master`（旧）在新菜单中的处理方式（隐藏 or 删除 or 重定向）

### 建议完成（不阻塞但强烈推荐）
- [ ] Phase B 路由清理（删除已冻结前端目录，减少混淆）
- [ ] `/analytics` 统一至 Sales V2 分析入口

### 可延后（Navigation Refactor 完成后再处理）
- [ ] Phase C 依赖切换
- [ ] Phase D 主档整合

---

## 十一、推荐的 Navigation 新结构（12模块设计参考）

基于本审计结果，推荐的 sidebar 重组方向如下（供 Phase 2B 参考）：

| 序号 | 分组名称 | 子模块 | 对应现有路由 |
|------|----------|--------|------------|
| 1 | 经营看板 | 日报 KPI | `/dashboard` |
| 2 | 养殖生产 | 鸡舍/存栏/产蛋/饲料/用药/IoT | `/breeding` |
| 3 | 分级包装 | 班次/批次/日报/异常/标签 | `/packaging` |
| 4 | 仓储物流 | 入库/出库/移库/盘点/台账 | `/warehouse` |
| 5 | 直营门店 | 门店管理 + 收银台 | `/store` + `/store-pos` |
| 6 | 销售管理 | 客户/价格/订单/配送/退货 | `/sales2` |
| 7 | 采购管理 | 供应商/申购/订单/收货/付款 | `/procurement2` |
| 8 | 财务管理 | 应收/应付/现金/报销/报表 | `/finance2` |
| 9 | 品质管理 | 农场检验/产品QC/溯源/不合格 | `/quality` |
| 10 | 审批工作流 | 待办/历史/表单/流程配置 | `/workflow` |
| 11 | 数据分析 | 经营/价格/生产/库存分析 | `/sales2/reports`（统一入口） |
| 12 | 系统管理 | 用户/角色/权限/字典/主数据/设置 | `/settings` + `/master-data` |

**辅助入口**（不计入12模块）: 通知中心、UAT验收、系统运维

---

## 十二、Git 节点

```bash
git add docs/non-v2-functional-audit.md
git commit -m "docs: audit non-v2 functionality before navigation restructure"
git tag v3-non-v2-functional-audit-20260529
git push && git push origin v3-non-v2-functional-audit-20260529
```

---

*审计基于 2026-05-29 代码快照，不包含 V2 模块内部详情（详见 sales-v2-architecture-audit.md、finance-v2-architecture.md 等专项报告）*
