# 生产管理免疫与用药 MVP 执行方案

## 1. 目标与范围

本方案先交付一条可以稳定运行的生产流程：

```text
鸡群/鸡舍 → 免疫计划/执行 → 疫苗批次扣减
鸡群/鸡舍 → 用药记录 → 药品批次出库 → 停药期 → 鸡蛋销售限制
```

MVP 目标是保证数据归属、库存一致性、状态流转和基本追溯。处方审批、二维码国家追溯、冷链温度、抗菌药统计、长期档案留存和复杂多单位换算列入后续阶段。

## 2. 当前阻断问题

- `brd_vaccinations` 缺少站点归属字段，Generic CRUD 的列表、更新和删除没有完整的场站行级校验。
- 用药页面只写 `brd_medication_records`，没有同步药品库存和 `inv_ledger`。
- 免疫执行只更新状态、日期和执行人，没有扣减疫苗库存。
- Cron 和 BFF 仍读取旧的 `brd_medications`，且 Cron 引用了该表不存在的 `clear_date`。
- 库存不足时使用 `GREATEST(0, qty - amount)`，会产生库存归零和负数流水。
- `batch_no` 唯一索引与前端写入鸡群号冲突，同一鸡群无法建立多个疗程。
- Generic CRUD 缺列时运行时执行 `ALTER TABLE ... ADD COLUMN TEXT`。
- 药品目录和库存服务固定孟赛场站、固定仓库，并混合读取旧仓库批次。
- 用药操作人可由请求体伪造，台账查询丢失鸡舍字段。

## 3. MVP 目标流程

### 3.1 免疫

`PLANNED → OVERDUE → EXECUTED`，支持 `CANCELLED`。

执行接口必须允许计划中和逾期计划执行，并使用幂等键和条件更新防止重复扣库存。

### 3.2 用药

`USING → IN_WITHDRAWAL → CLEARED`，支持 `CANCELLED`。

`withdraw_until` 表示最后一个禁止销售日，销售允许日期为 `withdraw_until + 1`。状态判断统一使用站点业务时区，MVP 站点必须配置明确的时区值。

## 4. 数据模型

### 4.1 兽药/疫苗主数据

继续使用现有 `brd_medications` 作为 MVP 主数据表，新增正式迁移字段：

```text
product_type, active_ingredient, approval_no, specification,
unit_code, default_route, default_withdraw_days, manufacturer, status
```

保留旧字段用于历史兼容，新增字段作为新流程唯一来源。页面保存稳定 code，不保存字典 label。

### 4.2 免疫计划

在 `brd_vaccinations` 增加：

```text
record_no, site_code, company_code, farm_code, vaccine_code,
vaccine_batch_no, vaccine_expire_date, planned_heads, actual_heads,
method_code, dose_value, dose_unit, executor, source_issue_no,
created_by, updated_by
```

增加 `NOT NULL`、状态 CHECK、数量 CHECK、日期索引和站点复合索引。计划唯一键使用 `(site_code, flock_no, plan_date, vaccine_code)`，不使用鸡群号作为记录号。

### 4.3 用药记录

统一 `brd_medication_records` 的新字段：

```text
record_no, course_no, site_code, company_code, farm_code,
flock_no, house_code, medication_code, indication, start_date,
end_date, withdraw_until, dose_value, dose_unit, usage_route,
actual_qty, qty_unit, executor, status, source_issue_no,
remark, created_by, updated_by
```

旧的 `drug_name`、`dosage`、`farm_house` 保留为历史兼容字段，停止新写入。`batch_no` 不再保存鸡群号，库存批次单独使用 `inventory_batch_no`。

### 4.4 用药库存分配

新增 `brd_medication_issue_lines`：

```text
id, medication_record_id, inventory_batch_no, medication_code,
qty, unit_code, inv_ledger_id, created_at
```

该表支持一个疗程分配多个库存批次，也能保留库存流水关联。

## 5. 后端改造

新增专用服务和控制器：

```text
apps/api/src/modules/farm/immune.service.ts
apps/api/src/modules/farm/immune.controller.ts
apps/api/src/modules/farm/medication-record.service.ts
apps/api/src/modules/farm/medication-record.controller.ts
```

核心表禁止继续使用 Generic CRUD 写入。

### 5.1 免疫接口

```text
GET  /api/farm/immune/plans
POST /api/farm/immune/plans
POST /api/farm/immune/plans/:id/execute
POST /api/farm/immune/plans/:id/cancel
```

执行事务内完成鸡群范围校验、疫苗批次校验、库存锁定、疫苗扣减、库存流水、实际头数和执行人写入。

### 5.2 用药接口

```text
GET  /api/farm/medication-records
POST /api/farm/medication-records
POST /api/farm/medication-records/:id/cancel
GET  /api/farm/medication-records/withdrawals
GET  /api/farm/medicine/lots?medication_code=...
```

创建事务内完成场站校验、药品和批次校验、FEFO 分配、库存扣减、用药记录、issue line 和 `inv_ledger` 写入。库存不足返回 409 并回滚全部写入。

库存更新使用可用量条件：

```sql
UPDATE inv_batches
SET qty = qty - $1,
    qty_available = qty_available - $1,
    updated_at = NOW()
WHERE batch_no = $2
  AND status = 'AVAILABLE'
  AND COALESCE(qty_available, qty, 0) >= $1
RETURNING batch_no, qty, qty_available;
```

操作人从 JWT 注入。请求体中的 `operator` 不作为可信来源。

### 5.3 停药和看板

Cron、BFF 和养殖首页统一读取 `brd_medication_records`，按当前用户的 `site_code/farm_code` 范围查询。停药状态计算只保留一套服务端实现。

## 6. 前端改造

### 6.1 免疫页面

修改 `apps/web/src/app/(admin)/breeding/immune/page.tsx`：

- 改用专用免疫 API。
- 使用 ACTIVE 疫苗主数据和 `DictSelect` 的 code/value 对。
- 保存疫苗批号、有效期、实际头数和库存批次。
- 逾期计划提供补执行入口。
- 执行按钮使用编辑权限。
- 防止重复提交并展示扣库存结果。

### 6.2 用药页面

修改 `apps/web/src/app/(admin)/breeding/medicine/page.tsx`：

- 移除 deprecated `useCrud`。
- 使用 ACTIVE 药品选择器和库存批次选择器。
- 增加药品、鸡群、日期、剂量、数量和途径校验。
- 停药日期由后端计算，页面只展示。
- 已执行记录禁止直接修改药品、批次和数量，使用撤销接口产生反向流水。

### 6.3 药品库存页和首页

- `med-stock` 保留库存查询和入库。
- 普通出库改为库存调整，治疗用药只能通过用药记录产生。
- 首页停药预警改读新用药记录表，并按场站范围返回。

## 7. 迁移与切换

新 schema 统一放在 `apps/api/src/database/migrations/` 的 TypeORM TS migration 中，移除核心表的运行时自动补列路径。

迁移顺序：

1. 补字段、索引、CHECK、FK 和 `brd_medication_issue_lines`。
2. 回填鸡群到站点的归属。
3. 映射历史自由文本药品到主数据 code。
4. 删除 `uq_brd_med_rec_batch`，保留历史值并建立疗程号。
5. 统一药品仓库和批次映射，处理旧 `MEDICINE` 仓库数据。
6. 部署专用 API。
7. 部署新页面。
8. 关闭免疫和用药核心表的 Generic CRUD 写入。
9. 做库存、用药记录和流水对账。

无法自动确认站点或药品的历史数据进入 `MIGRATION_REVIEW`，不直接覆盖原值。

## 8. 测试与验收

必须新增：

- 免疫创建、逾期补执行、重复执行幂等测试。
- 用药日期、停药边界和状态转换测试。
- 库存不足、过期批次、FEFO、多批次分配和事务回滚测试。
- 跨站 GET/PUT/DELETE 越权测试。
- Cron、BFF、首页停药预警一致性测试。
- 前端批号 payload、主数据选择、权限、分页和错误提示测试。

MVP 验收条件：

1. 用药记录创建后库存和 `inv_ledger` 同时变化。
2. 库存不足时返回 409，记录、库存和流水均不变化。
3. 同一鸡群可以建立多个疗程。
4. 免疫执行保存批号、实际头数、执行人并只扣库存一次。
5. 普通用户只能访问自己场站的数据。
6. 停药期内的鸡蛋销售被阻断。
7. 首页可以显示当前用户场站的停药预警。
8. 生产请求不再触发动态 `ALTER TABLE`。
9. API/Web 类型检查和相关单测、集成测试通过。

## 9. 分阶段独立会话执行

每个阶段使用一个独立项目会话，阶段完成后由主协调代理核验结果，再启动下一阶段：

1. **会话 A：数据模型与迁移**
2. **会话 B：库存事务和用药服务**
3. **会话 C：免疫服务和状态机**
4. **会话 D：前端页面和首页联动**
5. **会话 E：测试、数据对账和 UAT**
6. **会话 F：部署准备、迁移演练和发布**

每个会话必须提交：修改清单、测试结果、未解决项和下一会话依赖。生产数据库写入、生产迁移和正式发布必须在对应发布门禁确认后执行。

## 10. 后续阶段

处方审批、兽医签名、二维码追溯、冷链温度、供应商凭证、不良反应、抗菌药统计、多单位换算和长期档案留存不纳入本 MVP，待核心链路稳定后单独立项。
