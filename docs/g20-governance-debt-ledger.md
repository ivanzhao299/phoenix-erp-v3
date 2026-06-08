# Phoenix ERP G20+ 治理欠债总账与路线图

> **立账日**：2026-06-08
> **触发**：宋明光 UAT 暴露"修修补补"无法解决根因，立全栈总账
> **目标**：分阶段彻底清，禁止单点修补；用户每报新症状先映射到本总账

---

## 一、欠债大类（7 大类 ~30 项）

### A. 权限模型

| ID | 欠债 | 表现 | 影响 |
|---|---|---|---|
| A1 | menu_code 粒度太粗 | `MENU_FIN2_CASH` 同时含[账户主档+收付记账+流水查询] → 宋明光被赋 C 权后**可建账户** | 🔴 严重 |
| A2 | 前端权限 check 双轨 | `can(['ROLE_X'])` 与 `hasPermission(menu, op)` 并存 | 🟡 中 |
| A3 | TABLE_PERM_MAP 100+ 行 hardcode | crud.constants 静态白名单 | 🟡 中 |
| A4 | controller @RequireMenu 大量散用 | 跨域场景靠 altMenus 兜底（杂乱） | 🟢 低 |
| A5 | 角色矩阵混乱 | ROLE_FARM_MGR / ROLE_FARM_OP / ROLE_BREEDER / ROLE_FARMER / ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR — 谁是谁、持什么 perm 无文档 | 🟡 中 |
| A6 | RBAC 白名单 hardcode | 加新角色都要改代码 | 🟡 中 |

### B. 信息架构（IA）

| ID | 欠债 | 表现 |
|---|---|---|
| B1 | home 内 SHORTCUTS+BusinessOverview 重叠 | "库存" + "库存中心" 都指向 `/warehouse` |
| B2 | home / daily-work / sidebar 三处入口含义重叠 | G18-4 删 redirect 但 KPI/Tiles 仍杂糅 |
| B3 | 业务模型混淆 | `brd_medications` 8 列主档 vs medicine 页存 batch_no/disease 业务字段；feed 台账 vs 单据未定 |
| B4 | sidebar 子菜单 15+ 项无优先级 | |
| B5 | PageHeader 按钮 + DataTable 按钮重复 | G20-1 已修一波，边角页面待审计 |

### C. 组件复用

| ID | 欠债 |
|---|---|
| C1 | CrudPage 模板 G18 建好但仅 outbound 1 页用 |
| C2 | useCrud vs crudApi 两套客户端并存 |
| C3 | DictSelect 与 hardcoded `<select>` 并存（sales2/inventory 等 G20-1 才修） |
| C4 | KpiCard/StatusBadge/DataTable 多版本散布 |

### D. 字典/i18n

| ID | 欠债 |
|---|---|
| D1 | HouseSelector 仍用前端硬编码 HOUSE_TYPE_ZH map（G18-1 临时补） |
| D2 | 无全局 `<EnumLabel type code />` 组件 |
| D3 | dict_label_lo 老挝语大量空 |
| D4 | product_grades 9 档与 sys_dict PKG_EGG_GRADE 14 档历史并存 |

### E. 业务表 schema

| ID | 欠债 |
|---|---|
| E1 | brd_medications 只有 8 列（主档），medicine 页存 batch_no/disease 等业务字段 |
| E2 | wms_outbound G17 才加 warehouse_code/batch_no/attachment_url（之前永远写不进） |
| E3 | brd_daily_logs G19 才加 mortality_reason |
| E4 | brd_immune/brd_vaccinations/med_stock 等表关系不明 |

### F. CI/CD 与可观测性

| ID | 欠债 |
|---|---|
| F1 | vendor history API 真返回结构靠 dump 才知（缺接口契约文档） |
| F2 | 后端 error 日志没接到前端反馈 |
| F3 | prod schema 与 mig 一致性无自动审计（G15 inv_ledger 缺列才发现） |
| F4 | 部署后无 smoke test |

### G. 移动端

| ID | 欠债 |
|---|---|
| G1 | mobile-* 页 G18 治理未同步 |
| G2 | mobile daily 字段与 PC 不同步（G19-A 死亡原因 mobile 没加） |

---

## 二、分阶段路线图

### G20 阶段（本周 · 立宪+止血）

| # | 任务 | 解决欠债 |
|---|---|---|
| **G20-2** | **menu_code 粒度治理**：MENU_FIN2_CASH 拆 MASTER/TXN/VIEW；其它财务 menu 同步；新 sys_menu seed mig | A1 |
| **G20-3** | **home IA 立宪**：BusinessOverview 改纯指标卡（删 href），不再重叠 SHORTCUTS | B1 |
| **G20-4** | **角色矩阵立宪**：写 `docs/g20-role-matrix.md` | A5 |
| **G20-5** | **CrudPage 推广 5 页**：breeding/flock + feed + medicine + warehouse/transfer + warehouse/stocktake | C1 + B5 |

### G21 阶段（下周 · 模板化）

| # | 任务 | 解决欠债 |
|---|---|---|
| G21-1 | 删 TABLE_PERM_MAP 100+ 行 hardcode（G19-D PBAC-first 验证 2 周稳定后） | A3 + A6 |
| G21-2 | 抽全局 `<EnumLabel>` + `<EnumSelect>` 组件 | C3 + D1 + D2 |
| G21-3 | 删 useCrud，收口 crudApi | C2 |
| G21-4 | brd_medications 拆 `brd_medication_records` 业务记录表 | E1 |

### G22 阶段（可观测性+移动端）

| # | 任务 | 解决欠债 |
|---|---|---|
| G22-1 | prod schema 自动审计 CI step | F3 |
| G22-2 | 部署后 smoke test | F4 |
| G22-3 | vendor API 契约文档 | F1 |
| G22-4 | mobile-* 治理同步 | G1 + G2 |

---

## 三、原则约定

1. **不再修单页**：用户每报新症状先映射到本总账编号；如是已知欠债，归阶段；若全新 → 加入清单
2. **每阶段一次推完**：G 阶段 SOP（审计→改造→字典→报告→验证→commit+tag）
3. **memory 同步**：本文档同时写入 `~/.claude/projects/-Users-mac/memory/project_g20_governance_debt.md`
4. **症状追溯映射**：宋明光 2 个最新症状 → A1 (建账户) + B1 (库存重复) → G20-2 + G20-3 即解决
