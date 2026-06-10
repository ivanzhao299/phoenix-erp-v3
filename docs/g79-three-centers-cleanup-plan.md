# G79 — 主数据中心 / 系统设置中心 / 数据字典 全面整顿+重构总方案（2026-06-10）

> 基于 4 路并行审计（主数据 / 系统设置 / 数据字典 / 侧边栏样式）汇总。
> 原则：易于维护、距离最短、效率最高；架构/结构/安全/美观/科学/长远。

---

## 0. 总体健康度
| 中心 | V2/V3 重构率 | 主要问题 |
|---|---|---|
| 主数据中心 | 高（13 实体走统一 Runtime 引擎 + 9 自写治理页） | 2 页无权限门(安全)；2 页样式未统一 |
| 系统设置中心 | 中（用户/角色/数据范围 已 V3；其余 V2/占位） | **3~4 个冗余/重复页**；5 个页未挂侧边栏(隐藏) |
| 数据字典 | 中（2 个字典页并存） | **双页重复**；权限码跨域；2 处硬编码枚举未字典化 |

---

## 1. 🔴 冗余/重复（最该先清——"距离最短"）

| 冗余项 | 现状 | 处理 |
|---|---|---|
| **数据字典双页** | `/master-data/dictionaries`(产品化展示) + `/settings/dict`(老编辑器) 两套独立 UI | **合并为单一权威页**（方向待定，见决策①） |
| `/settings/products` | 与 `/master-data/products` 重复（模板遗留） | 删除/重定向到主数据 |
| `/settings/health` | 与 `/system/health` 重复 | 删除/重定向 |
| `/settings/organizations` | 已重定向到 `/master-data/organizations` ✅ | 已处理，确认 |

---

## 2. 🔴 安全漏洞（架构/安全维度）

| 页面 | 问题 | 处理 |
|---|---|---|
| `/master-data/operations` | **无任何权限检查**（前端+后端都缺） | 加 usePermission + 后端 guard |
| `/master-data/governance` | **无权限检查** | 加 usePermission(MENU_MD_QUALITY 或新码) |
| `/settings/dict`、`/master-data/dictionaries`、pending、quality | 仅前端检查、后端无 guard | 后端补 guard |

---

## 3. 🟠 侧边栏结构 / 权限码（结构/科学维度）

### 隐藏页（存在但侧边栏没链接）
`/settings/audit-log`、`/settings/approval-flows`、`/settings/approval-rules`、`/settings/profile`、`/settings/master-data`
→ 要么补链、要么删除、要么挂到正确中心（审批配置→审批中心）。

### 权限码跨域/过聚合
| 权限码 | 问题 | 建议 |
|---|---|---|
| `MENU_SETTINGS_DATA` | 字典在主数据中心却用"设置"权限域 | 统一为 `MENU_MD_DICT`（字典归主数据） |
| `MENU_SYS_ORG` | 组织/公司/用户组织 3 项共用 | 可细分(MD_ORG/MD_COMPANY/MD_USER_ORG)——长远 |
| `MENU_SETTINGS_IT` | 10 个设置项共用一个码 | 可细分(ROLE/PERM/BRAND/POS…)——长远 |

### 主数据中心子项过长（23 项平铺）
建议**分组小标题**（组织/商业/产品/仓储/财务/治理）让"相关聚拢、好找"。

---

## 4. 🟡 样式统一（美观维度）
- 95% 页面已用 design-system / cockpit-styles。
- 待统一：`/settings/dict`、`/master-data/governance`、`/settings/brand`（硬编码 inline style）→ 改 cockpit token。
- `/settings/data-scopes` 是 V3 标杆，其余对齐它。

---

## 5. 🟡 硬编码枚举未字典化（违反"字典禁硬编码"约定）
| 页面 | 硬编码 | 应建字典 |
|---|---|---|
| mobile/delivery exception | SHORTAGE/DAMAGED/REJECTED/EXPIRED/OTHER | `SAL_DELIVERY_EXCEPTION`(已存在?接上) |
| terminal/packaging label-print | 5 个重印原因 | `PKG_REPRINT_REASON`(新建) |

---

## 6. 执行优先级
- **P0（立即·清冗余+堵洞）**：字典双页合并；删/重定向 /settings/products、/settings/health；operations/governance 加权限门。
- **P1（结构）**：隐藏页补链或删；权限码 MENU_SETTINGS_DATA→MENU_MD_DICT；主数据中心子项分组。
- **P2（样式+字典化）**：3 页样式统一；2 处硬编码枚举字典化。
- **P3（长远）**：权限码进一步细分；超大页拆组件。

---

## 7. 待决策（影响后续执行方向）
1. **字典权威页方向**：保留 `/master-data/dictionaries` 还是 `/settings/dict` 作唯一入口？
2. **冗余 settings 页**：/settings/products、/settings/health 删除还是重定向？
3. **侧边栏重构力度**：只补链+清冗余，还是连带子项分组+权限码规范化一起做？
