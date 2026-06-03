# 上线前最终收口审计 F0 — Final System Hardening Audit

> **任务**：Final System Hardening Phase F0（**只审计，不删除、不重构、不改业务逻辑**）
> **日期**：2026-06-03
> **范围**：apps/api/src · apps/web/src · migrations · ddl · docs · scripts
> **方法**：3 路并行只读扫描 + 菜单/权限映射自查。

---

## 0. 结论速览

- 系统已收口（生产/包装/库存/销售/财务/追溯唯一链），防御机制完备（冻结接口返回 410/403）。
- 清理候选集中在：**孤儿前端页（/members、/master、/wholesale）、已注销的旧 POS 文件、未引用 V2/V3 组件、mock/demo 文件、旧迁移归档**。
- UI 债务大（8197 内联样式 / 928 hex / 657 rgba）→ 长期治理（P3）。
- **F0 不动任何代码**；本报告输出"能删/不能删/改名/统一 UI"清单与清理顺序，供后续阶段执行。

---

## 1. 正式运行模块清单（A 类 · 禁止删除）

| 域 | 模块 | API |
|----|------|-----|
| 销售 | sales-v2（订单/配送/退货/库存/价格/渠道/分析） | /api/v2/sales/* |
| POS | store-pos | /api/v2/store-sales/* |
| 包装（真实车间） | bff PackagingTerminalBffController | /api/packaging/terminal/* |
| 库存 | EggInventoryService / InventorySourceMode / ProductionInbound | （sales-v2 内） |
| 追溯 | traceability | /api/traceability/* |
| 财务 | finance-v2（AR/收款/现金/费用/报销/股东） | /api/v2/finance/* |
| 采购 | procurement2 | /api/v2/prc/* |
| 养殖 | breeding/farm（生产事实） | /api/v3/farm/* |
| 仓储 | wms | /api/inbound/* 等 |
| 包装（管理查询） | terminal/packaging（**查询保留**） | /api/packaging/* |
| 组织/权限/工作流/IoT/主数据 | org/workflow/iot/product-master | — |

> 注：`terminal/packaging.service`（/api/packaging/* admin）虽其库存写入路径已被 BFF 真实流取代，但仍承载分级/包装查询与日报，**前端 packaging-api 仍调用**，归 A 类（查询保留），不删。

## 2. 可删除候选清单（C/D 类）

| 候选 | 类 | 证据 | 风险 |
|------|----|------|------|
| 前端 `/members/*`（5 页） | C | 无 sidebar 入口、无内链；会员模块已下线 | P1 |
| 前端 `/master/*`（5 页） | C | 已被 `/master-data` 取代，无入口 | P1 |
| 前端 `/wholesale/*`（3 页） | C | 无业务引用（批发走 ws_* via BFF/sales2） | P1 |
| `apps/web/src/lib/packaging-mock.ts`（23 行） | D | mock 数据，已被真实 packaging-api 取代 | P1 |
| `apps/api/src/test-trends.ts` | D | 测试脚本（2 console） | P1 |
| `store/pos.{service,controller}.ts` | E→C | R4.1 已从 StoreModule 注销，文件残留（不可达） | P1 |
| 未引用 V2/V3 组件（8 个，0 import） | D | DataTableV2/V3、ModalV2、DrawerV2、KpiCardV2、NavCardV2、StatStripV2、ConfirmDialogV2 | P1 |
| 旧迁移 v3–v14 + JS 脚本（非 2026*） | E | 不在 CI glob（v3_schema_complete 例外保留）；已被 2026* 承接 | P3（归档） |

## 3. 冻结模块清单（E 类 · 只读保留 / 待决定）

| 模块 | 状态 | 建议 |
|------|------|------|
| farm-egg（/api/farm/egg/*） | 写端点 410 冻结；GET stock/ledger 只读（egg-ledger 在用） | **只读保留**（集蛋记录查询） |
| farm-sales（/api/farm/sales/*） | createSale/cancelSale 抛错；getCustomers/getSales 只读 | **只读保留**（客户/历史查询） |
| store/pos（/api/v3/pos） | 已注销 + createSale 抛 403 | **可删文件**（P1） |
| b2b_* 表 | generic-crud 黑名单拦截 | 表保留（兼容），CRUD 已禁 |
| 旧 order 菜单 MENU_ORDER_FIN/WH | rbac 标 [Phase 2D] 冻结 | 保留兼容历史 Token |

## 4. 未引用代码清单

- **后端**：store/pos.{service,controller}.ts（注销孤儿）；test-trends.ts；140 个 DTO/Entity 未见明显孤儿（建议针对冻结模块专项 grep）。
- **前端**：8 个 V2/V3 设计系统组件 0 import；packaging-mock.ts；旧 UI 组件（见 §9）。

## 5. 孤儿接口清单（冻结但仍暴露）

| 路由 | 返回 | 文件 |
|------|------|------|
| POST /api/farm/egg/{inbound,outbound,write-off} | 410 | farm-egg.controller.ts |
| POST /api/farm/sales/{create,cancel} | Error | farm-sales.service.ts |
| POST /api/v3/pos/sales | 403 | store/pos.service.ts（已注销） |
| b2b_* CRUD | 403 | generic-crud（黑名单） |

> 全部为**有意冻结 + 防御返回**，非安全漏洞；上线无碍。可在后续阶段删除注销文件。

## 6. 孤儿页面清单（前端）

- **完全孤儿（无菜单入口 + 无内链，删除候选 P1）**：`/members/*`（5）、`/master/*`（5）、`/wholesale/*`（3）。
- **疑似孤儿（需复核，多为父页可达的详情/聚合页，非真孤儿）**：部分 `/workflow/*`、`/settings/*`、`/shareholders/*` 子页 —— 经 workflow/settings/shareholders 父菜单或详情链接可达，**不建议按孤儿删**，需逐一确认（P2 复核）。
- `/packaging/inbound`：R1 起集蛋入库已收口，该页可能冗余（P2 复核）。

## 7. 孤儿菜单 / 权限清单

- 统计：rbac.matrix MENU **110** · sys_menu **103** · @RequireMenu 实际用 **52**。
- **差集需逐项核对**（P2）：
  - sys_menu 注册但 rbac 提取未匹配（如 MENU_FIN2_*、MENU_FARM_*）—— **部分可能为 grep 提取差异**（这些菜单 finance2/farm 实际在用），需人工确认是否真有"注册未授权→403"项。
  - rbac 定义但无 @RequireMenu 也无 sidebar 引用（110−52 中的未用码）—— 含 sidebar-only 展示菜单（正常）+ 少量真未用码（可清）。
- **旧冻结菜单**：MENU_ORDER_FIN / MENU_ORDER_WH（[Phase 2D] 冻结，保留兼容）；MENU_B2B_SALE（活跃，走 ws_*）。

## 8. V2 / V3 / Legacy 字样清单

| 类型 | 数量 | 处置 |
|------|------|------|
| 后端路由 /api/v3/pos | 1（孤儿） | 随 store/pos 删除（P1） |
| 后端路由 /api/v3/farm、/api/v3/iot | 活跃 | **命名残留，不改**（改路由破坏前端）P2 记录 |
| 前端版本字样（注释/品牌"Phoenix V3"/阶段标记） | ~477 行 | 多为阶段注释/品牌，保留；P3 |
| V2/V3 组件名（8 个，0 用） | 8 | 删除候选（P1）/ 或推广统一（P2） |
| b2b_* 旧表 | 拦截 | 保留兼容 |

> 原则：**路由版本号（/api/v2、/api/v3）已是事实契约，前端依赖，F0 及后续均不改路由**，仅记录。

## 9. UI/UX 不统一清单

| 问题 | 规模 | 处置 |
|------|------|------|
| 重复组件 StatusBadge（3 套：components / ui / design-system） | 3 | 收口到 design-system（P2） |
| 重复 PageHeader（2 套） | 2 | 收口（P2） |
| 重复 DataTable（4 套：DataTable / DataTableV2 / DataTableV3 / data-table） | 4 | 收口到 1 套（P2） |
| 设计系统 V2/V3 组件低使用（8 个 0–5 引用） | 8 | 推广或删（P1/P2） |
| 内联样式 `style={{` | 8,197 处 | 长期 CSS Module/Tailwind 治理（P3） |
| 硬编码 hex 颜色 | 928 处 | CSS 变量化（P3） |
| rgba 颜色 | 657 处 | CSS 变量化（P3） |
| 热点页 | store-pos(179)/sales2 returns(175)/delivery(143) | 优先治理（P3） |

## 10. 模块分类（A–E）汇总

| 类 | 含义 | 示例 |
|----|------|------|
| **A** 正式运行（禁删） | sales-v2 / store-pos / 包装BFF / traceability / finance-v2 / procurement2 / breeding / wms / 包装查询 / org / workflow / iot / product-master |
| **B** 核心但需收口 | UI 组件体系（收口 design-system）/ 内联样式 / 菜单映射核对 |
| **C** 历史遗留（删候选） | /members、/master、/wholesale 前端页 / b2b_*（已拦截）/ 旧 order 残留 |
| **D** 测试/mock/demo（删候选） | packaging-mock.ts / login 测试账号 / test-trends.ts / useTerminalContext mock / *.spec.ts |
| **E** 冻结（待决定） | farm-egg（只读保留）/ farm-sales（只读保留）/ store/pos 文件（可删）/ v3–v14 旧迁移（归档） |

## 11. 风险分级 + 建议清理顺序

**风险分级**：
- **P0（删会影响业务，禁动）**：全部 A 类；farm-egg/farm-sales 只读端点（egg-ledger 在用）；b2b 拦截逻辑；v3_schema_complete 迁移；路由版本号。
- **P1（可安全删，需回归）**：store/pos.{service,controller}.ts（注销孤儿）、`/members` `/master` `/wholesale` 孤儿页、packaging-mock.ts、test-trends.ts、8 个 0 引用 V2/V3 组件。
- **P2（命名/UI/体验）**：重复组件收口（StatusBadge/PageHeader/DataTable）、菜单映射差集核对、`/api/v3/pos` 命名（随删除消除）、疑似孤儿页复核、`/packaging/inbound` 复核。
- **P3（文档/注释/历史）**：内联样式/硬编码颜色长期治理、console.log/TODO/FIXME 清理、v3–v14 旧迁移归档、阶段注释。

**建议清理顺序（后续阶段，非本次）**：
1. **F1**：删 P1 孤儿（前端 /members /master /wholesale + store/pos 文件 + mock/test + 0 引用组件）→ 全量回归 + tsc。
2. **F2**：P2 收口（重复组件统一到 design-system、菜单映射核对补齐、孤儿页复核）。
3. **F3**：P3 长期 UI 治理（内联样式/颜色变量化，按热点页分批）。

> ⚠️ **本阶段（F0）仅审计，未删除/未改任何代码**。以上 F1–F3 为建议路线，需另行授权执行。

---

## 验证

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors（无代码改动） |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |

## 明确回答（验收）

- **哪些能删**：P1 清单（孤儿前端页 /members /master /wholesale、注销的 store/pos 文件、packaging-mock.ts、test-trends.ts、0 引用 V2/V3 组件）。
- **哪些不能删**：P0（全部 A 类 + farm-egg/farm-sales 只读端点 + b2b 拦截 + v3_schema_complete + 路由版本号）。
- **哪些要改名**：原则上**路由版本号不改**（事实契约）；组件 V2/V3 命名随收口统一（P2）；/api/v3/pos 随删除消除。
- **哪些要统一 UI**：重复组件（StatusBadge/PageHeader/DataTable）收口 design-system；内联样式/硬编码颜色变量化（P3）。
- **是否改动业务功能**：❌ 否（F0 纯审计，零代码改动）。
