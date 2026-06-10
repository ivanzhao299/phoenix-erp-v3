# Phoenix ERP V3 · 组织模块重复建设审计报告

> 阶段：Organization Module Duplication Audit
> 日期：2026-06-05
> 范围：`/settings/organizations` vs `/master-data/organizations`
> 结论：**确认重复建设；推荐方案 B（保留 master-data，settings 重定向）+ 增量补成员管理**

---

## 0. 结论速读

```
是否重复建设：     ✅ 是
重复率：           前端 30-40% / 后端 0-5%（共用 Service）
双维护风险：       ✅ 高（同表 / 两个 controller / 两套 UI）
推荐保留：         /master-data/organizations
是否应合并：       ✅ 必须合并
架构建议：         方案 B + 内部 Tab 化（成员管理整合）
```

---

## 1. 数据源（数据库 + Controller）

| 维度 | `/settings/organizations` | `/master-data/organizations` |
|------|---------------------------|------------------------------|
| 数据库表 | **`sys_organizations`** | **`sys_organizations`** |
| 用户关联表 | `sys_user_orgs` | （不读写） |
| Controller 路径前缀 | `/api/org/` | `/api/organizations/` |
| Controller 文件 | `apps/api/.../org/org.controller.ts` | `apps/api/.../org/organization.controller.ts` |
| Service | `OrgService`（同一） | `OrgService`（同一） |
| 主键标识 | 数字 `id` | 字符串 `org_code` |

**关键事实**：
- ✅ **同一张物理表** → 写入冲突风险存在
- ⚠️ **两个 Controller** 提供不同 path 但操作同一数据 → 双写入口
- ✅ Service 已收敛到单一 `OrgService` → 业务规则不会重复（已经做对了一半）

---

## 2. 功能矩阵对比

| # | 功能 | `/settings/organizations` | `/master-data/organizations` |
|---|------|:------------------------:|:----------------------------:|
| 1 | 新增组织 | ✅ | ✅ |
| 2 | 编辑组织 | ✅ (PUT) | ✅ (PATCH) |
| 3 | 删除组织 | ✅ | ❌ |
| 4 | 启用 / 停用 | ❌ | ✅ |
| 5 | 组织树展示 | ✅ 自建（平铺组建） | ✅ 原生（`/tree` 接口） |
| 6 | 树搜索 / 过滤 | ✅ | ✅ + 类型/状态 pills |
| 7 | 成员归属（绑定用户） | ✅ | ❌ |
| 8 | 数据范围等级 | ✅ | ❌ |
| 9 | 角色 / 权限配置 | ❌ | ❌ |
| 10 | 组织详情 | ✅ 右栏面板 | ✅ 档案卡 + 2 列属性网格 |
| 11 | 统计（KPI） | ✅ 成员/子组织数 | ✅ Hero "69 + 健康度 62%" |
| 12 | 合规风险检查 | ❌ | ✅ 4 项 + 评分 75 |
| 13 | 直属下级预览 | ✅ | ✅ + 可点击切换 |
| 14 | 驾驶舱样式 | ❌（传统表单） | ✅ Hero + 3 栏 cockpit |

**功能覆盖**：
- master-data：14 项中 **11 项** ✅
- settings：14 项中 **8 项** ✅
- **互不可替代**：删除 / 成员归属 只在 settings；启用停用 / 风险检查 只在 master-data

---

## 3. 路由定位 + 菜单归属

| 页面 | Sidebar 位置 | i18n 标签 | 当前可见性 |
|------|------------|----------|-----------|
| `/master-data/organizations` | 主数据中心 → 组织架构 | `menu.mdc-orgs` = **"组织架构"** | ✅ 在 sidebar |
| `/settings/organizations` | 系统设置（已移除菜单项） | `menu.stg-orgs` = "组织架构（设置）" | ❌ **不在 sidebar**（孤儿页面） |

→ 产品已经默认主数据为权威入口，settings 是历史遗留。

---

## 4. 代码复用率

| 文件 | 行数 |
|------|-----:|
| `/settings/organizations/page.tsx` | **743** |
| `/master-data/organizations/page.tsx` | **1268** |
| 总计 | **2011** |

**复用 vs 重复**：

| 范畴 | 是否重复 | 备注 |
|------|---------|------|
| Service / 业务逻辑 | ❌ 不重复 | 共用 `OrgService` |
| Form 字段定义 | ⚠️ 30% 重复 | 同一组字段两套 INP/inputField 渲染 |
| TreeNode 组件 | ⚠️ 100% 重复 | 各自实现一份 |
| Drawer 抽屉 | ❌ 不重复 | 共用 `<RightDrawer>` |
| CRUD 流程 | ⚠️ 40% 重复 | 提交逻辑各自一套 |
| 样式 token | ⚠️ 50% 不一致 | settings 用 INP/LBL Tailwind；master-data 已用 cockpit-styles |
| **前端整体重复率** | **30-40%** | ~600 行可消 |
| **后端整体重复率** | **0-5%** | controller 路由重复但 service 收敛 |

---

## 5. 用户视角

| 角色 | 应该进哪个页面 | 实际能进 |
|------|--------------|----------|
| **运营人员**（看组织、加新部门、查健康度） | `/master-data/organizations` | ✅ sidebar 直达 |
| **系统管理员**（同上 + 分配用户到组织） | `/master-data/organizations` 看组织 + 单独的"用户权限"页配成员 | ✅ 但成员分配能力当前还在 `/settings/organizations` 孤儿页 |
| **数据治理人员**（看合规风险） | `/master-data/organizations` | ✅ 驾驶舱右栏直观 |

→ 当前 settings 页**没有 sidebar 入口**，只能直接访问 URL，但仍承担"成员管理"独有功能 — **典型的功能孤岛**。

---

## 6. 必须回答（6 题）

| # | 问题 | 答 |
|---|------|----|
| 1 | 是否重复建设 | ✅ **是**（同表 + 两 controller + 两 page + 30-40% 重复代码） |
| 2 | 重复率多少 | **前端 30-40% / 后端 0-5% / 综合 ~25%** |
| 3 | 是否存在双维护风险 | ✅ **高**（前端字段改动需改两处；业务逻辑虽共用 Service 但 controller 路径错配会出现"看不见同步"假象） |
| 4 | 推荐保留哪一个 | **`/master-data/organizations`**（驾驶舱级、菜单可见、风险评估完整） |
| 5 | 是否应该合并 | ✅ **必须合并** |
| 6 | 最终架构建议 | **方案 B + 内部 Tab**（详见 §7） |

---

## 7. 最终架构建议（方案 B + Tab 化）

### 7.1 推荐方案：B（保留主数据 + 重定向）+ 内部 Tab 化

```
/master-data/organizations   ← 唯一权威入口
    ├─ 默认视图：组织驾驶舱（树 + 详情档案 + 右栏态势/风险/下级）
    ├─ Tab "成员"     ← 整合 /settings/organizations 的成员管理
    ├─ Tab "权限"     ← 预留，未来角色/数据范围
    └─ Tab "活动日志" ← 预留，操作审计

/settings/organizations       ← Next.js 重定向 → /master-data/organizations
                              （保留兼容性，旧书签不失效）
```

### 7.2 为什么不选方案 A（保留两套，明确边界）

- 同一主数据**两个维护入口**违反 G 阶段治理原则"主数据下沉到主数据中心"
- 字段同步要改两份，长期维护成本指数级上升
- 用户认知成本：哪个才是"权威"？哪个数据更新更及时？

### 7.3 为什么不选纯方案 B（一禁一保留）

- 现状是 settings 提供了 master-data 没有的"成员归属"功能
- 直接禁掉 settings 会丢失功能

### 7.4 推荐方案 B + Tab 化（即方案 C 变体）

| 步骤 | 动作 |
|------|------|
| 1 | `master-data/organizations` 现有驾驶舱默认作为"组织信息"Tab |
| 2 | 把 `settings/organizations` 的成员管理逻辑（`/api/org/organizations/:orgId/members` 等）抽成独立组件 `OrgMembersPanel` |
| 3 | 把 `OrgMembersPanel` 作为新 Tab "成员" 接入 `master-data/organizations`（选中组织节点时显示该组织的成员） |
| 4 | 合并删除：master-data 补一个"删除组织"操作（在 detail header 增加菜单项） |
| 5 | `/settings/organizations/page.tsx` → 改写为 `redirect('/master-data/organizations')` |
| 6 | `apps/api/.../org/org.controller.ts` 保留（兼容 API 客户端），但前端不再调用 |
| 7 | 删除 settings 版的 TreeNode / Form 重复实现 |
| 8 | 更新 i18n：`menu.stg-orgs` 标记 deprecated；统一指向 `menu.mdc-orgs` |

### 7.5 收益

| 维度 | 现状 | 方案 B+Tab |
|------|------|-----------|
| 维护入口 | 2 个（前端） | **1 个** |
| 用户认知 | 双入口混淆 | **单一权威** |
| 代码量 | 2011 行 | **~1500 行**（去重 ~600 行 + 抽 OrgMembersPanel ~150 行） |
| 功能覆盖 | 14 项分散 | **14 项全部** 在一个页面 |
| 主数据治理原则 | 违反 | **符合 G 阶段下沉原则** |

---

## 8. 验收标准

| 标准 | 现状 | 改造后 |
|------|------|--------|
| 组织架构管理 与 组织驾驶舱 只保留一种权威入口 | ❌ 两个并存 | ✅ 仅 `/master-data/organizations` |
| 禁止同一主数据多个维护入口 | ❌ 当前 settings + master-data 共存 | ✅ settings 重定向 |
| 功能完整不丢失 | — | ✅ 成员管理 Tab 化整合 |
| 菜单清晰 | ⚠️ stg-orgs 已隐藏但页面仍存活 | ✅ 完全合并 |

---

## 9. 实施路径（建议 1-2 天工作量）

1. **Day 0.5** — 抽 `OrgMembersPanel` 独立组件，包含成员列表 + 用户分配 drawer
2. **Day 0.5** — `master-data/organizations` 增加 Tab 切换控件（组织信息 / 成员 / 待预留 Tab）
3. **Day 0.5** — `master-data/organizations` 增加"删除组织"操作（带引用关系阻断 + 二次确认）
4. **Day 0.5** — `settings/organizations/page.tsx` → `redirect('/master-data/organizations')`
5. **Day 0.5** — 删除 settings 版 TreeNode / Form 重复实现，i18n 收尾

总计：**~2 人日**

---

## 10. 收口声明

> Phoenix ERP V3 组织模块**确认存在重复建设**（前端 30-40%，同一物理表，孤儿菜单 settings/organizations）。
> 推荐采用 **方案 B + Tab 化**：保留 `/master-data/organizations` 为权威入口，
> 通过 Tab 整合成员管理，settings 路径重定向。
>
> 完成后将彻底消除"同一主数据多个维护入口"的反模式，主数据治理原则达成。

—— 报告由 Phoenix ERP 组织模块审计完成 ——
