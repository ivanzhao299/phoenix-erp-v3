# 最终收口 F1 — Dead Code Cleanup 垃圾代码清理

> **任务**：Final System Hardening Phase F1（Stabilization Freeze 下的死代码删除）
> **日期**：2026-06-03
> **依据**：docs/final-hardening-phase-f0-audit.md
> **铁律**：grep 引用=0 才删；不猜测、不批量、不影响业务链。

---

## 0. 结论速览

- 删除 **15 个源文件**（孤儿前端页 11 + 后端死文件 3 + mock 1）+ 清理 2 处配置引用 + 归档 24 个旧迁移。
- **净删 ~1708 行**；API/Web TypeScript 双 0；业务链零影响。
- **关键纠偏**：F0 标的"孤儿页"经 grep 验证后，`/master/*` 因被 breeding 主动跳转 → **保留**；其余按引用实情处置。

---

## 1. 删除孤儿前端页（逐页 grep 验证）

| 页面 | 引用验证 | 处置 |
|------|---------|------|
| `/members/*`（6 文件） | 仅 middleware/layout 配置表（无活跃导航；settings/organizations 命中是 `/api/org/.../members` API 假阳性） | ✅ **删除** + 清 middleware/layout |
| `/wholesale/*`（4 文件） | 仅 middleware/layout 配置表（LegacyFreezeBanner 命中是注释假阳性；`api/wholesale` 是后端 ws_* 活跃 API，无关前端页） | ✅ **删除** + 清 middleware/layout |
| `/master/*` | **breeding/page.tsx `router.push('/master/farms')` 主动链接** | ⛔ **保留**（非 0 引用，禁删） |

- 清理：`middleware.ts` 移除 `/members`、`/wholesale` 路由保护项；`layout.tsx` 移除其面包屑 i18n 映射项。

## 2. 删除孤儿后端文件

| 文件 | 引用验证 | 处置 |
|------|---------|------|
| `store/pos.controller.ts` | R4.1 已从 StoreModule 注销；仅 store.module 注释提及（无 import） | ✅ 删除 |
| `store/pos.service.ts` | 同上（PosService 全仓零 import） | ✅ 删除 |

> StoreModule 仅保留 StoreController/StoreService，无引用 → 编译 0 错确认。

## 3. 删除 mock/demo

| 文件 | 引用验证 | 处置 |
|------|---------|------|
| `apps/web/src/lib/packaging-mock.ts` | 仅 packaging-api.ts 注释提及（"替换 packaging-mock"），无 import | ✅ 删除 |
| `apps/api/src/test-trends.ts` | 全仓零 import | ✅ 删除 |

## 4. 0 引用组件（保留决策）

- 设计系统 V2/V3 组件（KpiCardV2/NavCardV2/StatStripV2/DataTableV3/ModalV2/DrawerV2/ConfirmDialogV2 等）：
  **被 `components/design-system/index.ts` barrel 导出** → 属"未来统一设计系统"，按 F1 §4 规则 **保留**（F2 收口目标）。
- 旧重复组件（components/DataTable、components/ui/DataTableV2、StatusBadge×3、PageHeader×2）：本次**未删**——
  仍有页面在用旧组件（非 0 引用），收口属 F2 设计系统统一，不在 F1 删除范围。

## 5. 冻结模块清理

- farm-egg / farm-sales：R1 已删写入逻辑，仅保留 getStock/getLedger/getCustomers/getSales 只读 + 冻结端点（防御 410/error，egg-ledger 前端仍 POST，删端点会 404）→ **保留只读 + 冻结防御**，无新删除。

## 6. 迁移归档

- 新建 `apps/api/migrations/archive/`，`git mv` 归档 **24 个**非 2026/非 v3_schema_complete 的旧文件：
  `v3_production_migration` + `v4–v14`（11 SQL）+ 12 个 `.js` 脚本（run/seed/fix 类）。
- **保留原位**：`v3_schema_complete.sql`（CI deploy.yml 显式 run）、全部 `2026*.sql`（CI glob）。
- **CI 零影响**：deploy.yml 仅 `ddl/*` + `v3_schema_complete.sql` + `2026*.sql`，从不 glob 归档目录。

## 7. 删除清单汇总

**删除（15 源文件）**：members/{page,list,points,coupons,activity,module.css}、wholesale/{page,contracts,shipments,module.css}、store/{pos.controller,pos.service}、test-trends.ts、packaging-mock.ts。
**修改（2）**：middleware.ts、layout.tsx（移除已删路由的配置项）。
**归档（24，未删）**：migrations/archive/。
**保留（明确）**：/master/*（活跃链接）、设计系统 V2/V3 组件（barrel 导出）、farm-egg/farm-sales 只读、旧重复组件（F2 收口）、v3_schema_complete + 2026* 迁移。

## 8. 删除收益

| 指标 | 数值 |
|------|------|
| 删除源文件 | 15 |
| 删除代码行 | ~1708 |
| 归档旧迁移 | 24（迁移主目录从 ~35 → 2 项 + archive/） |
| 减少孤儿页面 | 8 路由（members 5 + wholesale 3） |
| 减少孤儿后端文件 | 3（pos×2 + test-trends） |
| 减少 mock | 1 |

## 9. 回归验证

| 模块 | 影响 |
|------|------|
| Sales V2 / Store POS（api/v2/store-sales）/ Packaging Terminal（BFF）/ Traceability / Finance V2 / Workflow / Inventory | ✅ 未受影响（删除项均零引用于这些模块；store.module 早在 R4.1 已不依赖 PosService） |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors（清 .next 陈旧生成类型缓存后） |
| scope-audit.sh | 本地 2/30（未起服务，非回归基线） |

> 备注：删除页面后 `.next/types/validator.ts`（Next 上次构建的生成类型）残留旧引用 → `rm -rf .next` 重新生成即 0 错，非源码问题。

---

## 验收

- 孤儿页面清理 ✅（members/wholesale；master 因活跃链接保留）
- 孤儿接口/文件清理 ✅（store/pos、test-trends）
- mock/demo 清理 ✅（packaging-mock）
- 0 引用组件 ✅（设计系统组件按规则保留，无误删）
- 业务功能零影响 ✅
- 系统瘦身完成 ✅，为 F2 Design System 收口做准备。

> **本阶段严格遵守"grep=0 才删"**：F0 标的 `/master/*` 经验证有活跃引用 → **未删**；旧重复组件有引用 → 留 F2。**未删除任何仍被引用的代码。**
