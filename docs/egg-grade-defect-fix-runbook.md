# Issue #532：8 档蛋品与养鸡场缺陷销售库存 Runbook

> 本 Runbook 以 `origin/main` 的 8 档终态和“养鸡场缺陷库存按普通库存销售”批准口径为准。
> 质量等级仍为 `GRADE_0..GRADE_5 + DIRTY + BROKEN`；库存销售分类只有 `STANDARD` 和 `DEFECT_SALE`。
> `CRACKED`、`DAMAGED` 继续退役，不得重新激活。

## 业务目标

| 质量等级 | inventory_class | 养鸡场销售 | 直营门店/POS |
|---|---|---:|---:|
| `GRADE_0..GRADE_5` | `STANDARD` | 允许 | 允许 |
| `DIRTY` | `DEFECT_SALE` | 允许 | 禁止 |
| `BROKEN` | `DEFECT_SALE` | 允许 | 禁止 |

客户、价格、订单、出库、结算和收款均复用普通客户及普通销售流程，不新增缺陷客户或独立缺陷销售单据。

## 发布前置条件

```bash
export DATABASE_URL='postgresql://<user>:<pass>@<host>:5432/<db>'
node -e "console.log('node ok')"
git log --oneline -1
```

确认部署代码包含库存分类迁移、统一分类解析、养鸡场销售上下文和门店/POS `STANDARD` 限制。生产环境只允许受控发布流程执行 migration；不得在应用启动时自动写库。

## 步骤 1：等级与 SKU 策略审计

```bash
node scripts/seed-grade-inventory-policy.mjs --audit
node scripts/seed-grade-inventory-policy.mjs --dry-run
```

验收要求：

- `product_grades` 恰有 8 行 `ACTIVE`；
- `DIRTY/BROKEN` 的 `stock_managed=true`、`sale_enabled=true`、`default_stock_status=AVAILABLE`；
- `CRACKED/DAMAGED` 不得为 `ACTIVE`；
- 8 档 SKU 均存在且具备库存使用范围；
- 缺陷 SKU 的养鸡场销售范围已启用。

策略脚本的 `--apply` 必须在业务负责人确认 audit 输出后执行。脚本不得创建未经批准的公司、仓库或客户范围。

## 步骤 2：库存分类迁移与历史数据审计

应用 TypeORM schema migration 后执行受控审计/回填脚本：

```bash
node scripts/backfill-inventory-class.mjs --audit
node scripts/backfill-inventory-class.mjs --dry-run
```

分类规则：

```text
GRADE_0..GRADE_5 -> STANDARD
DIRTY/BROKEN     -> DEFECT_SALE
```

分类脚本只回填库存分类，不会改变数量或状态；只有满足以下条件的批次才可作为可销售缺陷库存：

```text
grade_code_std IN ('DIRTY','BROKEN')
status = 'AVAILABLE'
warehouse 属于养鸡场库存范围
批次未过期
公司、仓库和 SKU 归属明确
```

`QUARANTINE`、`DAMAGED`、`FROZEN`、等级为空、归属不明或已过期批次即使被标记为 `DEFECT_SALE`，也必须继续保持不可销售状态并进入人工复核清单，不得通过分类回填直接放开销售。

只有在 audit 输出确认无异常、且业务负责人批准后，才可执行：

```bash
node scripts/backfill-inventory-class.mjs --apply
```

## 步骤 3：生产与 WMS 入库核验

抽测生产日报、WMS 收货和包装入库各一笔：

```text
正常等级：status=AVAILABLE, qty_available=qty, inventory_class=STANDARD
DIRTY：status=AVAILABLE, qty_available=qty, inventory_class=DEFECT_SALE
BROKEN：status=AVAILABLE, qty_available=qty, inventory_class=DEFECT_SALE
```

WMS `broken_qty` 生成的批次必须明确写入 `quality_grade=BROKEN`、`grade_code_std=BROKEN`，不得出现空等级或 `qty_available=0` 的新销售批次。

每笔入库必须同时存在对应的 `inv_ledger` 入库记录，且等级、分类、SKU、公司和仓库一致。

## 步骤 4：养鸡场普通销售核验

使用现有客户、现有销售订单和现有出库确认流程：

1. 选择养鸡场库存仓库；
2. 选择普通客户；
3. 创建标准销售订单；
4. 执行批次/FIFO；
5. 确认普通销售出库；
6. 核对销售单、批次和库存台账。

养鸡场销售允许 `STANDARD` 与 `DEFECT_SALE`。建议排序为过期日期、入库日期、库存分类，其中 `STANDARD` 默认优先；具体优先级必须由服务端固定，前端不得自行决定。

## 步骤 5：直营门店和 POS 隔离核验

使用门店/POS 销售入口查询同一仓库范围：

- `DEFECT_SALE` 不得出现在可售批次列表；
- FIFO 不得锁定 `DEFECT_SALE`；
- 手工传入缺陷批次号必须由后端拒绝；
- 门店库存查询和销售报表不得包含缺陷销售库存。

场景由服务端根据销售入口、仓库域和用户 DataScope 推导，禁止信任客户端传入的销售上下文参数。

## 步骤 6：异常库存处置

缺陷处置 API 仅用于非销售例外：报废、退回源头、清洗复检、加工处理和历史隔离批次。正常 `AVAILABLE + DEFECT_SALE` 批次优先走普通销售流程。

销售和处置必须锁定同一批次并使用同一 `qty_available`，保证并发情况下不会重复扣减。所有动作必须写入 `inv_ledger` 并保留来源单号、批次号和操作员。

## 回滚与暂停条件

以下任一条件出现时暂停发布或回滚应用版本：

- 8 档 ACTIVE 集合不一致；
- `CRACKED/DAMAGED` 被重新激活；
- `DIRTY/BROKEN` 批次缺少 `inventory_class`；
- 养鸡场销售看不到已批准的 `DEFECT_SALE`；
- 门店/POS 能看到或销售 `DEFECT_SALE`；
- 销售和处置台账不守恒；
- 历史 `QUARANTINE/DAMAGED` 批次被自动放开。

代码回滚使用受控版本回退；生产数据库已执行的数据回填不得通过破坏性回滚处理，必须走新的前向修复脚本。

## 禁止事项

- 不恢复 `CRACKED`、`DAMAGED` 为 ACTIVE；
- 不新增缺陷客户或缺陷销售订单体系；
- 不让客户端决定 `FARM_SALES` 或 `STORE_POS`；
- 不把 `DEFECT_SALE` 写入直营门店库存；
- 不把业务数据回填写入 schema migration；
- 不通过 `qty_available=0` 表示正常可销售缺陷库存。
