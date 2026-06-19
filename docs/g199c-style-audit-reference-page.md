# g199c 样式治理 · 参考页深度审计

> **方法**: 选三方对账 `/finance2/ar-reconciliation` 作参考页(元素覆盖最全),
>            实际渲染 getComputedStyle 抽样,逐元素列问题 → 用户拍板 → 小步修 → 截图比对 → 抽 token → 后续批量推广
> **铁律**(基于 [feedback_standardize_one_page_first](../memory/feedback_standardize_one_page_first.md)): 不再一刀切批量改,1 页打磨完再推广
> **截图**: `data/_liujie-uat/ref-01-fullpage.png` 全页 + 后续元素特写

---

## 一、实测样式抽样表(每元素实际渲染值)

| 元素 | 样式实测 | 评估 |
|------|----------|------|
| `<h1>` 页标题 | 24px / 700 / 深蓝 #1F3864 | ✅ 合理 |
| `<h2>` 子标题 | 16px / 700 / 深蓝 #1F3864 | ✅ 合理 |
| KPI 标签 | 12px / 灰 #6B7280 / mb 4px | ✅ 合理 |
| KPI 数值 | 20px / 700 / 绿/红/灰 / monospace | ✅ 合理 |
| Select 下拉 | **12px** / padding 5/10 / h 30px / 圆角 4 / 边框 #E0E0E0 | ⚠️ 12 偏小 |
| Button "对账" | 14px / padding 8/16 / h 37px / 圆角 6 / 蓝 #3B82F6 | ✅ 合理 |
| Chip "全部 60"(active) | 12px / padding 6/12 / 圆角 16 / 灰底白字 | ✅ 合理 |
| Chip "预警 N"(inactive) | 12px / 透明底 / 边框+字 #D97706 | ✅ 合理 |
| `<th>` 表头 | 13px / 500 / 灰 / **无下边框 borderBottom: 0** | ⚠️ 缺线 |
| `<td>` 表格行 | 13px / 行高 19.5 / 主文色 | ✅ 合理 |
| 差异行高亮 | 浅红 #FEF2F2 / 浅黄 #FFFBEB | ✅ 合理 |
| 差异原因 chip | **11px** / padding 2/6 / 圆角 4 / 黄底棕字 | ⚠️ 11 太小 + 3 行堆叠挤 |

---

## 二、问题清单(只列不修,等用户拍板)

### 🟡 P2-A 表头无下边框 — 数据扫读迷失感
**位置**: 第 122 行 `<thead style={{ background: '#f9fafb' }}>`
**现状**: th 实测 `borderBottom: 0px`(jsx 写了 background='#f9fafb' 但实测背景 transparent — 推测 CSS 被覆盖或写法不对)
**痛点**: 表头和数据没分隔线,纵向滚一段数据后,扫读时表头第一行混淆
**建议**: th 加 `border-bottom: 1px solid var(--border)` + 背景色真生效

### 🟡 P2-B 差异原因 chip 过小过挤
**位置**: line 257-264 `<span style={{ fontSize: 11, padding: '2px 6px' }}>`
**现状**: 11px(比表格正文 13px 还小 2px)+ padding 2/6(挤) + 3 行堆叠表格行高变高
**痛点**: 这是**决策信息**(差异原因猜测) 字号最该清楚,但反而最小
**建议** A: 字号提到 12px,padding 3/8,3 行原因压缩成"已合并显示"
**建议** B(更稳): 鼠标 hover 展开,默认只显示最重的一条

### 🟢 P3-A 顶栏 select(中文/英文/ລາວ)与业务 select 同款 12px
**位置**: 顶栏语言切换 select
**痛点**: 顶栏装饰性下拉 12px OK,但业务的"公司"/"期间"也用 12px,有点小
**建议**(可选): 业务 select 用 13.5px(与 td 同号),顶栏装饰 12px 保留

### 🟢 P3-B monospace → tabular-nums(v2 修正)
**位置**: KPI 数值 + 表格数字列
**v1 结论(已废弃)**: 指定明确 monospace 字体栈
**v2 结论(正确做法,源于推广时发现 ar-ledger 早就这么写)**:
  用 `fontVariantNumeric: 'tabular-nums'` —— 启用字体内的等宽数字 lookup,
  **保留原字体外观**(中文/英文文本仍然漂亮),数字列对齐效果同样好。
  monospace 会把整列变代码字体,中文 fallback 难看。
**修法**: 全 finance2 内 `fontFamily: 'monospace'` 全部替换为 `fontVariantNumeric: 'tabular-nums'`
**实测影响范围**: ar-reconciliation(4 处)/ chanjet-sync(10 处)/ ar(1 处)= 15 处

### 🟢 P3-C 表格行高 19.5px + padding 10/12 + 多差异原因 3 行堆叠
**位置**: tbody td
**现状**: 单原因行 ~40px;3 原因行 ~80px。同一表格高低不齐
**建议**: 接 P2-B,差异原因合并/省略后,行高自然统一

---

## 三、参考页规范建议(等用户拍板后写为统一 token)

如果上述 P2/P3 修后,**抽出全站规范**:

```
// design-system token(暂列)
TABLE_TH:
  fontSize: 13
  fontWeight: 500
  color: var(--text-secondary)
  background: var(--bg-muted)
  borderBottom: 1px solid var(--border)
  padding: 10px 12px

TABLE_TD:
  fontSize: 13
  lineHeight: 1.5
  color: var(--text-primary)
  padding: 10px 12px

BUSINESS_SELECT (区别于装饰 select):
  fontSize: 13
  padding: 6px 28px 6px 11px
  height: 32
  borderRadius: 6  // 与 button "对账" 圆角一致
  border: 1px solid var(--border)

INLINE_HINT_CHIP (差异原因等):
  fontSize: 12  // 不低于表格正文,毕竟是决策信息
  padding: 3px 8px
  borderRadius: 4
  lineHeight: 1.4
  最多显示 1 条 + hover 展开
```

---

## 四、不动的(已经合理)

- ✅ KPI 卡 4 块,字号层级清楚(12 标签 + 20 值)
- ✅ Button "对账" 14/8/16 配色 OK
- ✅ Chip 全部/预警/差异 三色一致 16px 圆角
- ✅ 飘红/飘黄行配色合理(rgba 浅色不刺眼)
- ✅ h1/h2 字号梯度清楚
- ✅ 差异原因配色(黄底棕字)主次明确
- ✅ 影子模式横幅醒目不抢戏

---

## 五、行动建议

| 顺序 | 项 | 影响范围 | 修法 | 工时 |
|------|---|----------|------|------|
| 1 | **P2-A** 表头加下边框 + 真背景 | 三方对账(后续推广所有表) | inline style 改 thead/th | 10min |
| 2 | **P2-B** 差异原因 chip 字号 + 压缩 | 三方对账 | inline style 改 span + 数组 slice(0,1) | 20min |
| 3 | **P3-A** 业务 select 字号 13 | 三方对账 + 其它对账类 | inline style 改 select | 10min(限三方对账,后续推广) |
| 4 | **P3-B** monospace 字体栈 | KPI 数值 + 数字列 | inline style 改 | 5min |
| 5 | **P3-C** 自动 follow P2-B | — | — | 0 |

**总计**: ~45min 内打磨完三方对账参考页,**全部 fast-css 通道(纯 CSS 调)** 3-10s 上线。

---

## 六、不在本轮做(留后续)

- 整页布局重排(KPI / 筛选 / 表格相对位置)
- 颜色 token 重新设计(色板)
- 黑暗模式适配
- 移动端响应式
- 表格列宽固定/拖拽
- 表格列定制
- 行级 actions(查看明细抽屉)
