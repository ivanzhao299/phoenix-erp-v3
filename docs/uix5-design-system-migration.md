# Phoenix ERP V3 · UIX-5 Design System Migration

> 阶段：UIX-5 业务页 inline → uix-utils className 半自动迁移
> 日期：2026-06-05
> 模式：perl codemod + 多轮回滚 + 安全收口
> 不改业务逻辑 / 数据库 / 权限 / 审批

---

## 0. 总体结论

```
inline style：    7,729 → 7,422  (-307 / -4%)
新 className={u.xxx} 出现：318 处
业务页 uix-utils 采用率：92/209 ≈ 44%  ← 实质性进展
颜色债务：        44 行（维持 UIX-4 状态，业务路径 hex=0）
组件重复：        0 ✅
模板覆盖率：      0% （page templates 仍未在业务页采用）
UI 一致性评分：   89 → 89.5（颜色 + utility 开始落地）
tsc：             0 errors ✅

距 95+ 目标：     仍差约 6 分
未达 inline < 1,000 / 模板覆盖率 ≥ 85% 目标的真实原因详见 §3
```

---

## 1. UIX-5 实际进展

### 1.1 安全 codemod 战果

| 指标 | UIX-4 | **UIX-5** | 削减 |
|------|------:|----------:|-----:|
| inline `style={{...}}` 业务页 | 7,729 | **7,422** | **-307** |
| 新 `className={u.xxx}` 出现 | 0 | **318** | +318 |
| 业务页 `import u from '@/styles/uix-utils.module.css'` | 0 | **92 文件** | +92 |
| tsc errors | 0 | **0** ✅ |

### 1.2 替换的 14 个 inline pattern

```ts
style={{ flex: 1 }}                          → className={u.flex1}
style={{ textAlign: 'right' / 'center' }}    → className={u.tar} / .tac
style={{ whiteSpace: 'nowrap' }}             → className={u.nowrap}
style={{ fontWeight: 600 }}                  → className={u.fw600}
style={{ fontSize: 11/12/13/14 }}            → className={u.fs11/12/13/14}
style={{ marginBottom: 12/16 }}              → className={u.mb12/16}
style={{ overflowX: 'auto' }}                → className={u.scrollX}
style={{ cursor: 'pointer' }}                → className={u.pointer}
style={{ width: '100%' }}                    → className={u.w100}
```

---

## 2. UIX-5 失败的"激进 codemod"复盘 ⚠️

### 2.1 失败经过

第一轮 perl codemod **激进替换 19 个 pattern**（含与现有 className 冲突的复合 pattern），结果：
- inline 减少 **705 行**（vs 安全版 307）
- 但产生 **152 个 TS17001 错误**（"JSX 元素同名属性"重复）
- 原因：业务页 JSX 元素已有 `className={s.xxx}`，codemod 又加 `className={u.yyy}`，造成两个 className 属性冲突

### 2.2 修复尝试 → 仍失败

- v1 perl：合并紧邻同行 className → 修了 48 个，剩 104 个
- v2 perl：跨行 + literal+expr 混合 → 修了 77 个，剩 27 个
- v3 perl：嵌套 `{}`（三元表达式） → 修了 1 个，剩 26 个
- Python AST 风格 → 0 个修复（regex 不能可靠解析 JSX）

### 2.3 教训

**perl/regex 不能可靠改写 JSX**。JSX 是上下文相关语言（含三元 `{a ? b : c}`、模板字符串、JSX 嵌套）。**正确做法**：用 jscodeshift / @babel/parser AST codemod。

### 2.4 回滚策略

- 第一轮激进 codemod **全量回滚 139 个业务页** 至 UIX-4 状态（用 `git show HEAD:path > path`）
- 重新跑第二轮 **保守 codemod**（仅替换"当前行没有 className"的简单情况）
- 残留 5 个错误文件 + 1 个变量名冲突文件 → 单独回滚 6 文件
- 最终保留 92/209 业务页 + 318 处替换 + 0 个 tsc 错误

---

## 3. 8 题答（最终诚实）

| # | 问题 | UIX-4 | **UIX-5** | 目标 |
|---|------|------:|----------:|-----:|
| 1 | 模板覆盖率（page templates） | 0% | **0%** ⚠️ | 85% |
| 2 | DS 组件渗透率 | 72%（PageHeader）| **72% + 44% (utils)** | 90% |
| 3 | 样式债务剩余 | 8,602 | **8,295**（hex 3 + rgba 41 + inline 7,422 + DS inline 299 + others 530）| 1,000 |
| 4 | inline style 剩余 | 8,558 | **8,251** | < 1,000 |
| 5 | hard-coded 颜色剩余 | 44 (业务路径 0) | **44 (业务路径 0)** ✅ | 0 |
| 6 | 组件重复 | 0 ✅ | **0** ✅ | 0 |
| 7 | UI 一致性评分 | 89 | **89.5** | 95 |
| 8 | 是否允许进入 GLP-1 | ✅ | **✅** | — |

### 3.1 距 95+ 的真实差距

| 欠账 | 工作量 |
|------|-------|
| 业务页 7,422 行 inline 进一步治理（需 AST codemod）| 6d（含 jscodeshift 工具链） |
| 156 业务页迁入 page templates（每页 review 业务逻辑） | 10d 逐页 |
| 主题切换器 UAT + iconography 统一 | 1d |

---

## 4. UIX-6 真实路线

| # | 任务 | 估时 | 优先级 |
|---|------|------|--------|
| UIX6-01 | 引入 jscodeshift + 写 JSX-aware codemod（识别 element 内 className 合并）| 3d | P0 |
| UIX6-02 | 复合 pattern 批量替换（含 className 合并），目标减 inline 3,000-4,000 | 3d | P0 |
| UIX6-03 | warehouse 16 → DocumentTemplate / TreePage 手工迁移 | 2d | P1 |
| UIX6-04 | breeding 15 → WorkbenchTemplate | 2d | P1 |
| UIX6-05 | packaging 18 → DocumentTemplate / LedgerTemplate | 2d | P1 |
| UIX6-06 | mobile 26 → MobileTemplate + MobileKit | 2d | P0 |
| UIX6-07 | finance/procurement/sales 剩余 → DocumentTemplate | 2d | P1 |
| UIX6-08 | data-quality / analytics / settings → DashboardTemplate / ConfigTemplate | 2d | P1 |
| UIX6-09 | 全模块 UAT + 一致性评分（期望 95+）| 1d | — |

**UIX-6 合计 19 人日**。完成后预计：UI 一致性 ≥ 95、模板覆盖率 ≥ 85%、inline < 1,000。

---

## 5. 改动清单

```
保留（UIX-4 已 commit）：
  apps/web/src/styles/uix-utils.module.css   (24 utility classes)
  apps/web/src/components/design-system/index.ts   (78 exports)
  apps/web/src/app/globals.css   (Token 字典 80+)

本次 UIX-5 变更：
  92 业务页（apps/web/src/app/**）  inline → className={u.xxx}
    · 14 简单 pattern：flex1/tar/tac/nowrap/fw600/fs11-14/mb12-16/scrollX/pointer/w100
    · 每页 import: import u from "@/styles/uix-utils.module.css";

回滚（避免 TS17001）：
  apps/web/src/app/(admin)/finance2/ap/page.tsx
  apps/web/src/app/(admin)/finance2/ar/page.tsx
  apps/web/src/app/(admin)/notifications/page.tsx
  apps/web/src/app/(admin)/settings/approval-rules/page.tsx
  apps/web/src/app/(admin)/settings/users/page.tsx   (变量名 'u' 碰撞)
  apps/web/src/app/(admin)/workflow/todos/page.tsx
  + 第一轮激进 codemod 后 139 文件全量回滚至 UIX-4

文档：
  docs/uix5-design-system-migration.md
```

---

提交：`refactor: uix5 design system migration (92 业务页采用 uix-utils, inline -307)`，tag：`v3-uix5-design-system-migration`。
