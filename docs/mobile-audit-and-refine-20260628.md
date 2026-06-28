# 手机端全面审计与精修报告 — 2026-06-28

> 方法：4 路并行 agent 审计（27 页全量 / RBAC 角色可用性 / 手机 vs PC 对等性 / 性能缓存样式）
> + 人工逐条**验证**（agent 会过度告警，本报告已剔除误报，仅保留实勘为真的项）。

---

## 〇、上轮（2026-05-29）遗留问题 — 已全部闭环 ✅

| 上轮遗留 | 现状 |
|---|---|
| 🔴 dashboard 调旧 `log_dispatch` 表 | 已改为 `sal_delivery_orders` 汇总（dashboard/page.tsx:350 注释实证） |
| 🟡 `mobile-roles` `delivery.write` 缺 DRIVER | 已补：`write: [ADMIN, LOG_MGR, DRIVER]`（mobile-roles.ts:206） |
| 🟡 SW 版本 v4→v5 | 已升 `phoenix-v3-sw-v5`（sw.js:14） |

手机端页面数 22 → **27**（新增 prc-order、delivery/{orders,receipt,exceptions,performance}、henhouse）。

---

## 一、本轮已修复（前端，已 tsc 0 错）

| # | 问题（实勘为真） | 文件 | 修复 |
|---|---|---|---|
| 1 | **鸡蛋台账「入库/出库」死路**：后端 `farm-egg.controller.ts` 对 inbound/outbound/write-off 返回 **HTTP 410 冻结**（库存已由「库存来源模式」统一管理），但手机页仍提供可填表单 + 保存按钮，填完必报错 | `mobile/egg/page.tsx` | 移除入库/出库 Tab，改为**纯库存查询**页（页面原有「仅供查询」横幅保留）；与后端冻结对齐 |
| 2 | **首页卡片 `key={idx}`**：权限变化致卡片增减时 React 复用错位 | `mobile/home/page.tsx:463` | 改 `key={card.pageKey \|\| card.href \|\| idx}` 稳定键 |
| 3 | **看板 SWR 聚焦狂刷**：`revalidateOnFocus:true` → 每次切回 App 重拉 8 个端点（耗流量/电量），且无 `keepPreviousData` 切日期闪骨架 | `mobile/dashboard/page.tsx:283` | 关聚焦自动刷（保留顶部手动刷新按钮）+ `revalidateOnReconnect` + `keepPreviousData` + dedupe 30s |

---

## 二、agent 误报 — 已验证为假，未改动（留痕避免后续重复踩）

| agent 告警 | 实勘结论 |
|---|---|
| medicine 页 `getDict('SAL_DELIVERY_EXCEPTION')` 复制错误 | **假**：medicine 页根本无此调用 |
| `PAGE_MENU_PERMS.delivery` 错配 `MENU_PKG_OP/MGR` | **假**：那是 `terminal` 条目；delivery 正确映射 `MENU_MOBILE_DELIVERY/MENU_SALES2_DELIVERY`（mobile-roles.ts:332） |
| delivery 页 loadStats/loadOrders «未并行» | **假**：二者在独立 useEffect 并发触发，且刷新走 `Promise.all`（delivery/page.tsx:260-268） |
| henhouse `color:'#fff'` 浅色不可见 | **假**：白字在绿色成功按钮上，深浅色皆正确 |
| procurement-v2 controller «空» | **假**：端点在 Orders/RequestsController，路由可达 |

---

## 三、RBAC 关键澄清 + 角色可用性

**机制（实勘 mobile-roles.ts:450）**：手机端访问级别 = ① 优先看 JWT 权限快照里的 `MENU_*` 原子菜单（即后端 `sys_role_menu_permission` 真实授权）；② 无快照时才回退硬编码角色矩阵。
→ **结论**：「前端矩阵给了 read、后端没授 → 点进去 403」这类 agent 告警**基本不成立**——前端同样先校验 `MENU_*`，缺菜单则**卡片直接不显示**，不会 403。

**真实可用性缺口（属后端菜单授权，非前端 bug）**：
- `PKG_OP`（包装工）、`DRIVER`（司机）、`CASHIER`（收银）等单一岗位角色，手机端可见卡片很少。是否给这些角色补 `MENU_*`（如 PKG_OP 补 `MENU_PKG_OP:V` 看包装统计、DRIVER 看 dashboard），属 RBAC 放权决策。
- ⚠️ 与宋雷同纪律：**不擅自改生产 RBAC**。需先核对 `sys_role_menu_permission` 实况（生产 DB），再按岗位精确授权。本会话无生产 DB 读权限，列为待决策项。

---

## 四、手机 vs PC 对等性 — 真实功能缺口（roadmap，需配后端）

手机端整体覆盖 PC 约 **45%**。已 100% 对等：配送、审批、采购申请/转单、费用申请、看板。**真实「只能回 PC」缺口**（按生产影响）：

| 优先 | 缺口 | 现状 | 需要 |
|---|---|---|---|
| P0 | **WMS 全缺**：盘点 / 出入库 / 调整 / 库存查询 | 手机端 0 页 | 新建移动页 + 后端移动接口（WMS V2） |
| P0 | **质检现场录入 / 不合格处理(NCR)** | 手机端**仅查询** | 新建录入页（拍照+判定）+ 后端 inspections POST |
| P0 | **包装批次录入** | 手机端**仅看统计** | 新建批次页 + 后端 |
| P1 | **POS 简化收银** | 手机端无 | 新建简版 POS（PC 端 store-pos 已全） |
| P1 | 销售退货单 / 历史日报编辑 | 手机端无/只读 | 新建页 |
| P2 | 采购收货/订单编辑、库存调整、趋势多周期 | 部分缺 | 增量补 |

> ⚠️ 这些缺口多数**前端页 + 后端接口都要建**（不是补个按钮）。逐个属中等工作量，需用户排优先级后分阶段推进；不在本轮一次性完成。

---

## 五、性能/样式 — 现状与真实可优化项

**现状比 agent 估计的健康**：已有 SWR 去重缓存、`getCached` TTL（鸡舍/客户/药品/字典）、骨架屏组件、主题 token、SW network-first。多数性能告警为微优化或误报。

**真实可做项（后续批次）**：
- delivery 页用本地硬编码 `const C={}` 配色（delivery/page.tsx:8），不随主题切换 → 深色模式不同步。改用 `useMobileTheme()`。**中等改动，单页**。
- 11 个页面 loading 时无骨架屏（直接白屏/通用 pulse），可逐页接 `MobilePageSkeleton`。
- 非 SWR 页（feed/egg/medicine 等）按需补 AbortController 防快速切日期竞态。
- ⚠️ **不要**给 dashboard 用的 `getKpi/getPackagingReport/...` 加内部 TTL 缓存——它们走 SWR + refreshKey，再加一层会让「手动刷新」失效。

---

## 六、下一步（待用户拍板优先级）

1. **RBAC 放权决策**：是否给 PKG_OP/DRIVER/CASHIER 等补手机端菜单（需先核生产 `sys_role_menu_permission`）。
2. **对等补强排期**：P0 三块（WMS 盘点 / 质检录入 / 包装批次）哪块先做？每块需前后端一起建。
3. **样式/骨架精修**：delivery 主题化 + 补骨架屏，可作为低风险持续批次。
