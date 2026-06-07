# G14 · daily 日生产日报页面整改

完成时间：2026-06-07

## 1. 业务方反馈（用户实测）

1. 班次显示英文 `BRD_SHIFT_MORNING` 而非"早班"
2. 13 列表格一页宽放不下
3. 找不到保存按钮（在 PageHeader 右上，录入完手指看不到）
4. 字段引用映射不清晰
5. 与 daily-inbound 关系不明
6. 数据无法消费给生产终端

业务方明确：
- 养殖工 = 集蛋员（一人）
- 表格分两行
- 启用自动校验
- **将来可一键转为生产终端数据来源**

## 2. 整改实施

### F1 班次中文 fallback

```ts
const FALLBACK_SHIFT_LABELS: Record<string, string> = {
  'BRD_SHIFT_MORNING': '早班', 'BRD_SHIFT_EVENING': '晚班', ...
};
const shiftLabel = (code) => shiftOptions.find(...)?.label || FALLBACK_SHIFT_LABELS[code] || code;
```

字典加载失败也显示"早班 / 晚班"，不会漏到 dict code 字符串。

### F2 表格双行布局（每班次 2 tr）

| 行 | 列 |
|---|---|
| 1 | 班次（rowSpan=2）/ 产蛋(枚) / 脏蛋 / 破损 / 死亡 / 淘汰 / 淘汰原因 / **9 档分级**（rowSpan=2） |
| 2 | 饲料(kg) / 用水(L) / 自用蛋 / 温度 / 湿度 / 备注 |

7 列宽 × ~110px = 770px，单页可放。班次/9 档分级两列跨两行垂直居中。

### F3 表头 badge 加 5 项

| 项 | 来源 | 颜色 |
|---|---|---|
| 当前存栏 | `brd_flocks.current_qty` 选中舍 | text-primary |
| 合计产蛋 | sum(rows.eggs) | color-primary |
| **产蛋率** | eggs / current_qty × 100 | status-success |
| 合计死淘 | sum(rows.deaths) | text-primary |
| 合计饲料 | sum(rows.feedKg) | text-primary |

录入时实时算 layRate，反馈即时。

### F4 底部大保存按钮

表格下方居中放 240px 大按钮，录入完手指自然下滑可点：

```tsx
<button className={s.btnPrimary} style={{ minWidth: 240, padding: '12px 32px' }}>
  <Save size={18} /> 提交日报
</button>
```

PageHeader 顶部按钮保留供导出/历史快捷使用。

### C1 9 档分级 modal（每班次独立）

- 每个班次表格行有"9 档分级"按钮列（跨两行垂直居中）
- 未录则显示"分级"灰按钮；已录显示 `✓ 1850枚` 绿/橙按钮（按校验通过/超容差）
- 点击 → 弹 modal 显示 product_grades 9 档输入
- modal 顶部实时显示 `产蛋总数 N 枚 · 9 档 sum M 枚 · 差 Δ（容差 X）`
- modal 内"清空"+"确定"按钮

### C2 自动校验（提交前）

```ts
for (const r of rows) {
  const eggs = Number(r.eggs);
  const gradeSum = Σ(r.gradeQty);
  if (gradeSum > 0 && eggs > 0) {
    const diff = abs(gradeSum - eggs);
    const tolerance = max(3, eggs * 0.03);  // 容差 3 枚或 3%
    if (diff > tolerance) {
      // 弹 confirm: "9 档 sum X 与产蛋数 Y 不一致（差 Δ），是否继续？"
      if (!confirmed) return;
    }
  }
}
```

容差宽松（3% 或 3 枚），减少误报；超容差时弹窗让业务方决定继续/修改。

### 数据可消费（生产终端一键导入）

`handleSubmit` payload 携带 9 档 JSON：

```ts
if (Object.keys(eggsByGrade).length > 0)
  payload.eggs_by_grade = eggsByGrade;
```

后端 G9 已实现：
- `farm.service.submitBreedingDailyLog` 接受 `eggs_by_grade` 字段（JSONB）
- 写入 `brd_daily_logs.eggs_by_grade` 列（G9 加的 + GIN 索引）
- 自动派生 eggs_produced/dirty_eggs/broken_eggs 兼容

**生产终端消费链路**：
- 现成 endpoint `GET /api/v3/farm/daily-logs/eggs-breakdown?date=&houseCode=` 聚合返回（G9 已加）
- daily-inbound 页面已有「从日报预填」按钮（G9 已加）调用该 endpoint
- 未来生产车间终端调同款 endpoint → 一键导入 → 写 inv_batches 销售批次

## 3. 业务流（整改后）

```
养殖工/集蛋员（一人）
   ↓
进 /breeding/daily
   ↓
看表头 badge：今日存栏 N 羽 · 产蛋率 X%
   ↓
分班次填表 7 列（第一行）+ 6 列（第二行）
   ↓
（可选）每班次点"9 档分级"按钮 → modal 录 9 档
   ↓
点底部"提交日报"按钮
   ↓
（如填了 9 档）自动校验 sum vs eggs_produced 超容差弹窗确认
   ↓
brd_daily_logs 写入 + eggs_by_grade JSONB
   ↓
未来生产终端调 /eggs-breakdown 一键导入 inv_batches
```

## 4. 与 daily-inbound 关系

| 维度 | daily (本次整改后) | daily-inbound |
|---|---|---|
| 业务侧 | 养殖侧（鸡群健康 + 产蛋） | 销售侧入库（成品批次） |
| 写入表 | `brd_daily_logs` (含 eggs_by_grade) | `inv_batches` 销售批次 |
| 等级颗粒 | 13 字段 + 可选 9 档 modal | 强制 9 档录入 |
| 业务时序 | 即时（养殖工录蛋时） | 集蛋分级后入库 |
| 数据流向 | 写产蛋统计 + 分级（可选）| 拉日报 9 档 → 写销售批次 |

**两页职责清晰**：daily 是统计 + 分级登记，daily-inbound 是成品入库。
**数据互通**：daily 的 eggs_by_grade → daily-inbound 一键导入。

## 5. 文件清单

| 文件 | 改动 |
|---|---|
| `apps/web/src/app/(admin)/breeding/daily/page.tsx` | 班次 fallback + 双行表 + 5 badge + 9 档 modal + 底部按钮 + 自动校验 |

## 6. 验证

- TS 双端 0 errors
- 宋明光重新登录可看到：
  - 班次"早班/晚班"中文
  - 双行表格（7 列宽不溢出）
  - 表头 5 项 badge（含产蛋率实时计算）
  - 每班次"9 档分级"按钮
  - 表格下方大型"提交日报"按钮

---

**Tag**：`v3-g14-daily-redesign`
**改动**：1 文件，~150 行新增
**核心**：双行表 + 9 档可选 + 校验 + 数据可消费
