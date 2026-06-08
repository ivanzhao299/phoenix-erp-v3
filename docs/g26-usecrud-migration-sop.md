# G26-C · useCrud → crudApi 迁移 SOP

> 立账日：2026-06-08 | 欠债 ID：C2

## 状态

| 项 | 说明 |
|---|---|
| useCrud | G21-3 已加 @deprecated 注释 |
| 当前使用 | 5 个业务页（daily/flock/immune/medicine/henhouse）|
| 迁移策略 | 渐进迁移，不在单 G 阶段强推 |

## 迁移步骤（每页约 50-100 行改动）

### 1. import 调整
```ts
// 删
import { useCrud } from '@/hooks/useCrud';

// 加
import { crudApi } from '@/lib/api-client';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
```

### 2. hook 替换
```ts
// 旧
const { fetchRecords, createRecord, updateRecord } = useCrud('brd_vaccinations');
const { fetchRecords: fetchHouses } = useCrud('brd_houses');

// 新
const toast = useToast();
const { showConfirm } = useDialog();
// 不需要 hook 实例化，crudApi 直接使用
```

### 3. 调用替换
```ts
// 旧
const data = await fetchRecords({ limit: 1000 });

// 新
const res = await crudApi.list('brd_vaccinations', { pageSize: 1000 });
const data = res.data;  // 注意：crudApi.list 返 { data, total }
```

### 4. 成功/失败 toast（useCrud 自动 alert，crudApi 不带）
```ts
// 旧
const ok = await createRecord(payload, '免疫计划创建成功');
// 自动 showAlert 成功/失败

// 新
try {
  await crudApi.create('brd_vaccinations', payload);
  toast.success('免疫计划创建成功');
} catch (e) {
  // G25-B：api-error 全局 toast 已自动捕获，无需再手动 toast.error
}
```

### 5. 删除前 confirm（useCrud 自动 showConfirm）
```ts
// 旧
await deleteRecord(id);  // 内部自动 showConfirm + showAlert

// 新
const ok = await showConfirm({
  type: 'danger',
  title: '确认删除',
  message: '删除后无法恢复，确认继续？',
});
if (!ok) return;
await crudApi.delete('brd_vaccinations', id);
toast.success('删除成功');
```

### 6. 自定义 id 列（如 brd_flocks 用 flock_no）
```ts
// 旧
await updateRecord(editId, payload, 'flock_no', '更新成功');

// 新（crudApi 默认 id 列，自定义需手动 fetch）
await fetch(`/api/crud/brd_flocks/flock_no/${editId}`, {
  method: 'PUT',
  headers: { ... },
  body: JSON.stringify(payload),
});
// 或：扩展 crudApi 加 updateByColumn 方法
```

## 迁移优先级

| 页 | 优先级 | 理由 |
|---|---|---|
| immune | 低 | 业务复杂，UX 完整，业务方未报问题 |
| medicine | 中 | G21-4 已部分改造（切表），剩余 1 处可清 |
| flock | 低 | 复杂场站+鸡舍级联，UAT 风险高 |
| henhouse | 低 | 同 flock |
| daily | 低 | 825 行复杂业务页，G19-A 刚重构过 |

## 何时迁移

- ❌ 不要为治理而治理（业务方未报问题时不强迁）
- ✅ 业务方报具体 bug 时顺手迁移
- ✅ 新功能加到旧页面时，借机迁移
- ✅ ESLint 规则 G27+ 可阻止新 useCrud 引用

## 暂不做完整迁移的原因

1. 5 页业务复杂度高（总 1700+ 行）
2. useCrud 内置 alert/confirm UX 难以 1:1 替代
3. crudApi 不支持自定义 id 列（需扩展或手动 fetch）
4. 业务方未明确报"保存不弹窗"等 UX 问题
5. G24/G25 已解决高优先级问题
