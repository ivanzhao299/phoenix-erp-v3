# Phoenix ERP — Dark Mode Compatibility Checklist（暗色兼容清单)

> Phase UI-2.1 · 暗色基线。后续页面迁移(UI-2.9)必须逐项过此清单。
> 机制:`globals.css` 的 `:root`(浅色)/ `[data-theme="dark"]`(暗色)双套 CSS 变量 + `@custom-variant dark`。
> 切换:`ThemeContext` 写 `<html data-theme="dark|light">`,默认 dark,localStorage 持久化。

---

## 暗色变量完整性(UI-2.1 审查结论)

`globals.css` 颜色类 token **明/暗双版本已齐全**(UI-2.1 补齐 `--status-neutral` 暗色后):

| Token | 浅色 | 暗色 | 状态 |
|-------|------|------|:----:|
| --color-primary | #1F3864 | #4A78B5 | ✅ |
| --color-accent | #2563EB | #60A5FA | ✅ |
| --status-success | #2E7D32 | #66BB6A | ✅ |
| --status-warning | #F9A825 | #FFD54F | ✅ |
| --status-danger | #C62828 | #EF5350 | ✅ |
| --status-info | #1976D2 | #64B5F6 | ✅ |
| --status-neutral | #757575 | #9E9E9E | ✅ UI-2.1 补 |
| --status-special | #6A1B9A | #BA68C8 | ✅ |
| --text-primary | #212121 | #FAFAFA | ✅ |
| --text-secondary | #757575 | #BDBDBD | ✅ |
| --text-disabled | #BDBDBD | #616161 | ✅ |
| --bg-page/card/muted/sidebar | 浅 | 深 | ✅ |
| --border | #E0E0E0 | #424242 | ✅ |
| --shadow-sm/md/lg | 浅 | 深(更重) | ✅ |
| --glass-bg/border | 浅 | 深 | ✅ |

> 结论:**暗色机制本身健全**。暗色破损全部来自页面"绕过 token 写死 hex",而非变量缺失。修复路径 = 把页面 hex 换成 token。

---

## 页面迁移逐项检查清单

迁移任一页面到暗色兼容,逐项核对(每项必须用 token,不得硬编码):

- [ ] **文字**:主文字 `var(--text-primary)`、次要 `var(--text-secondary)`、禁用 `var(--text-disabled)`;深底上文字用 `var(--text-on-dark)`。无 `#212121`/`#666`/`#333`。
- [ ] **背景**:卡片 `var(--bg-card)`、页面 `var(--bg-page)`、浅块 `var(--bg-muted)`。无 `#fff`/`#fafafa`。
- [ ] **边框**:`var(--border)`。无 `#e5e7eb`/`#eee`/`#ccc`。
- [ ] **Hover**:列表/行 hover 用 `var(--bg-muted)` 或 token 类;暗色下可见。无固定浅灰 hover。
- [ ] **表格**:表头背景用 `var(--bg-muted)`(非 `#1F4E79` 白字);斑马纹/hover/边框走 token;状态列用 `<StatusBadge>`。
- [ ] **输入框**:边框 `var(--border)`、聚焦色 `var(--color-primary)`(统一,非各页 indigo/emerald)、背景 `var(--bg-card)`、占位 `var(--text-disabled)`;暗色下边框可见。
- [ ] **弹窗**:遮罩 `rgba(0,0,0,.4)`(允许,中性)或 Radix Dialog;卡体 `var(--bg-card)` + `var(--border)`;暗色不刺眼。
- [ ] **抽屉**:用 `RightDrawer`(已暗色兼容),不手写 `background:#fff`。
- [ ] **品牌色**:主色块/标题/强调条 `var(--color-primary)`,暗色自动转亮蓝。无 `#1F4E79`。
- [ ] **状态/分级/风险色**:`STATUS_CLASS`/`GRADE_PALETTE`/`SEVERITY_PALETTE`;图表 `CHART_PALETTE`(中间明度,明暗均可读)。
- [ ] **阴影**:`var(--shadow-sm|md|lg)`(暗色自动加重)。无 `0 1px 3px rgba(0,0,0,.08)` 字面量。

---

## 验证方法

1. 切到暗色(`<html data-theme="dark">` 或主题开关),逐页目视:**文字看得清、卡片不刺眼、边框可见、hover/选中明显、表头不再是白字深蓝块、输入框边框可见**。
2. 跑 `bash scripts/ui-audit-check.sh`:目标页 **硬编码 hex = 0**。
3. 对照本清单 11 项全绿。

## 当前高危页面(待迁移,UI-2.9 优先序)

| 优先 | 页面/模块 | 暗色问题 |
|:-:|------|------|
| 🔴 | shareholders 全模块 | 深蓝 `#1F4E79` 表头/标题 + 白底硬编码,暗色完全破损 |
| 🔴 | uat | 浅色 hex 硬编码,暗色刺眼 |
| 🔴 | store-pos | 全硬编码(独立语言,需令牌化而非并入) |
| 🟠 | sales2/returns·delivery·orders·inventory | hex 无 dark: 覆盖 |
| 🟠 | settings/users、workflow/forms、breeding | 混合硬编码 |
