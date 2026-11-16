# Issue #532：库存分类与养鸡场普通销售修复方案

## 1. 已批准业务口径

系统当前采用 8 档质量等级：

```text
GRADE_0、GRADE_1、GRADE_2、GRADE_3、GRADE_4、GRADE_5、DIRTY、BROKEN
```

销售库存分类只有两类：

```text
STANDARD
DEFECT_SALE
```

`DIRTY/BROKEN` 的原始质量等级继续保留用于生产、质量和批次追溯，但在养鸡场库存销售中与普通库存使用同一客户、订单、价格、出库和结算流程。

直营门店和 POS 只能使用 `STANDARD`，不能使用 `DEFECT_SALE`。

## 2. 当前阻塞点

1. 缺陷等级策略使用 `sale_enabled=false` 和 `qty_available=0`，无法进入养鸡场普通销售。
2. 销售库存查询和 FIFO 只按 `AVAILABLE + qty_available`，无法区分养鸡场销售与门店销售。
3. WMS 破损入库可能缺少标准 `BROKEN` 等级和销售分类。
4. 批次没有统一的库存分类字段，跨模块写入容易漂移。
5. 历史隔离批次不能直接全部放开销售。

## 3. 目标数据契约

```text
inv_batches.qty                  物理数量
inv_batches.qty_available        可用于销售或普通出库的数量
inv_batches.inventory_class      STANDARD | DEFECT_SALE
inv_batches.quality_grade        原始质量等级
inv_batches.grade_code_std       标准质量等级
inv_batches.status               AVAILABLE | QUARANTINE | DAMAGED | ...
```

可销售批次必须满足：

```text
status = AVAILABLE
qty_available > 0
inventory_class 与销售上下文匹配
```

映射规则：

```text
GRADE_0..GRADE_5 -> STANDARD
DIRTY/BROKEN     -> DEFECT_SALE
```

## 4. 实施阶段

### P1：Schema 和策略

- 新增 `inv_batches.inventory_class`；
- 增加检查约束和查询索引；
- 提供统一 `resolveInventoryClass`；
- 更新 8 档等级策略：`DIRTY/BROKEN` 可销售、默认 `AVAILABLE`；
- 更新缺陷 SKU 的养鸡场库存销售范围；
- 使用 `scripts/backfill-inventory-class.mjs` 编写并执行审计和历史回填。

### P2：库存写链

统一修改生产日报、WMS 收货、包装入库、调拨接收和库存调整：

- 每个新批次都必须写 `inventory_class`；
- `DIRTY/BROKEN` 写入 `AVAILABLE + DEFECT_SALE`；
- WMS `broken_qty` 必须写 `quality_grade=BROKEN`；
- 等级、SKU、库存分类不一致时拒绝写入。

### P3：销售上下文

现有销售流程不拆分，只增加服务端上下文：

```text
FARM_SALES -> STANDARD + DEFECT_SALE
STORE_POS  -> STANDARD
```

上下文由销售入口、仓库域和 DataScope 推导，不能由客户端自由传入。

养鸡场 FIFO 继续使用现有订单、预留和出库流程；默认按保质期、入库日期、库存分类排序，前端不得自行改变规则。

### P4：查询和 Web

- `/warehouse/query` 增加库存分类筛选；
- 养鸡场销售库存显示两类库存；
- 门店/POS 查询只返回 `STANDARD`；
- 入库结果显示质量等级和库存分类；
- 不新增缺陷客户、缺陷订单或专用缺陷销售页面。

### P5：历史数据

仅自动回填满足以下条件的历史批次：

```text
grade_code_std IN ('DIRTY','BROKEN')
status = AVAILABLE
仓库属于养鸡场销售范围
未过期
公司、仓库、SKU 归属明确
```

`QUARANTINE/DAMAGED/FROZEN`、空等级、过期和归属异常批次必须人工复核。

### P6：验证和发布

- API/Web 类型检查、Lint 和单元测试；
- PostgreSQL 入库→销售→出库→台账集成测试；
- 门店/POS 负向测试；
- 生产只读审计；
- migration 先行；
- 回填脚本 dry-run 后再 apply；
- 发布后执行养鸡场销售和门店隔离冒烟。

## 5. 验收矩阵

| 场景 | 预期结果 |
|---|---|
| 正常等级入库 | `STANDARD + AVAILABLE` |
| DIRTY 入库 | `DEFECT_SALE + AVAILABLE` |
| BROKEN 入库 | `DEFECT_SALE + AVAILABLE` |
| 养鸡场普通销售 | 可查询、可 FIFO、可正常出库 |
| 直营门店销售 | 不返回 `DEFECT_SALE` |
| POS 手工指定缺陷批次 | 后端拒绝 |
| 销售取消 | 恢复 `qty_available` |
| 销售与报废并发 | 不超扣、台账守恒 |
| 历史隔离批次 | 不自动放开 |
| 退役等级 | 不得重新激活 |

## 6. 发布暂停条件

出现以下任一情况必须暂停：

- ACTIVE 等级不是 8 档；
- `DIRTY/BROKEN` 缺少库存分类；
- 养鸡场无法销售 `DEFECT_SALE`；
- 门店/POS 可以销售 `DEFECT_SALE`；
- 销售和台账数量不一致；
- 历史隔离库存被无审批放开。
