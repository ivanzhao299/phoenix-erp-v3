# Phoenix ERP V3 — 产品主档治理规则
**Product Master Governance**  
**生效日期**: 2026-05-30  
**版本**: Phase H2

---

## 一、产品主数据四层结构

```
产品（Product）
  └─ 等级（Grade）       ← product_grades 主表
       └─ 包装规格（Spec）← packaging_specs 主表
            └─ SKU       ← product_skus 主表（三元组唯一约束）
```

### 层次说明

| 层次 | 主表 | 主键 | 含义 |
|------|------|------|------|
| 产品 | `mst_products` | `product_code` | 最高级别业务对象（如：鸡蛋、饲料、礼盒）|
| 等级 | `product_grades` | `grade_code` | 质量/品质分级（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）|
| 规格 | `packaging_specs` | `spec_code` | 包装方式和数量（LOOSE/TRAY30/BOX360/GIFT12 等）|
| SKU | `product_skus` | `sku_code` | 产品+等级+规格的唯一销售单元 |

---

## 二、唯一正式主数据表

```
✅ product_grades   — 唯一正式等级主数据（Phase H2 建立）
✅ packaging_specs  — 唯一正式规格主数据（Phase H2 建立）
✅ product_skus     — 唯一正式 SKU 主数据（Phase H2 建立）
✅ mst_products     — 唯一正式产品档案（V3 基线，Phase H2 字段升级）
```

---

## 三、标准等级值集（product_grades）

| grade_code | 含义 | 可销售 | 可入库 | 说明 |
|-----------|------|-------|-------|------|
| `AA` | 特级蛋 | ✅ | ✅ | 出口/礼品级，最高品质 |
| `A` | 一级蛋 | ✅ | ✅ | 标准鲜蛋，主流销售等级 |
| `B` | 二级蛋 | ✅ | ✅ | 批发/食品加工用 |
| `C` | 三级蛋 | ✅ | ✅ | 工厂加工原料，低端市场 |
| `DIRTY` | 脏蛋 | ❌ | ✅ | 外壳污染，需清洁处理后降级销售 |
| `CRACKED` | 裂缝蛋 | ❌ | ✅ | 蛋壳有裂缝，可用于加工，不可零售 |
| `BROKEN` | 破蛋 | ❌ | ❌ | 蛋壳破损，仅作废品处理 |
| `DAMAGED` | 损坏蛋 | ❌ | ❌ | 退货/异常品，质检确认不可用 |

**写入规则**：
- 任何新业务代码使用 grade_code 必须引用此值集
- 禁止在业务代码中硬编码等级字符串（如 `"1级"`、`"A+"` 等自由文本）
- 包装 Terminal 分级 (`pkg_grading_records.outputs_json` 内的等级) 在 H6 规范化前，应使用以上值集

---

## 四、标准包装规格值集（packaging_specs）

| spec_code | 名称 | 每单位数量 | 显示单位 | 说明 |
|----------|------|----------|---------|------|
| `LOOSE` | 散装 | 1 枚 | 枚 | 按枚计，无包装 |
| `TRAY30` | 30枚/托 | 30 枚 | 托 | 标准零售托盘 |
| `TRAY36` | 36枚/托 | 36 枚 | 托 | 大托盘 |
| `BOX360` | 360枚/箱 | 360 枚 | 箱 | 标准整箱（12托×30枚）|
| `BOX720` | 720枚/箱 | 720 枚 | 箱 | 大箱（20托×36枚）|
| `GIFT12` | 礼盒装12枚 | 12 枚 | 盒 | 精装礼盒 |
| `GIFT24` | 礼盒装24枚 | 24 枚 | 盒 | 精装礼盒 |

**写入规则**：
- H3 阶段完成后，`sal_price_items.packaging_spec` 必须引用 `packaging_specs.spec_code`
- H4 阶段完成后，`inv_batches.packaging_spec` 必须引用 `packaging_specs.spec_code`
- 禁止在业务代码中硬编码规格字符串（如 `"30_PCS_TRAY"`、`"30枚每托"` 等）

---

## 五、SKU 主数据规则（product_skus）

### SKU 命名规则

```
sku_code = {产品缩写}-{grade_code}-{spec_code}
示例：EGG-AA-TRAY30、EGG-A-BOX360、EGG-B-LOOSE
```

### SKU 唯一性约束

```sql
CREATE UNIQUE INDEX idx_product_skus_combo
  ON product_skus (product_code, grade_code, spec_code);
```

**规则**：
- 同一 product_code + grade_code + spec_code 组合只能有一个 SKU
- sku_code 由系统自动生成，不允许手动填写任意字符串
- 停用 SKU 不删除，status = 'INACTIVE'

---

## 六、写入规则

### 允许写入 product_grades 的路径

| 路径 | 服务 | 操作 | 权限 |
|------|------|------|------|
| `POST /api/product-master/grades` | `ProductMasterService.createGrade()` | 新建等级 | MENU_MASTER_GRADE E |
| `PUT /api/product-master/grades/:code` | `ProductMasterService.updateGrade()` | 更新等级 | MENU_MASTER_GRADE E |

### 允许写入 packaging_specs 的路径

| 路径 | 服务 | 操作 | 权限 |
|------|------|------|------|
| `POST /api/product-master/specs` | `ProductMasterService.createSpec()` | 新建规格 | MENU_MASTER_PACKAGING E |
| `PUT /api/product-master/specs/:code` | `ProductMasterService.updateSpec()` | 更新规格 | MENU_MASTER_PACKAGING E |

### 允许写入 product_skus 的路径

| 路径 | 服务 | 操作 | 权限 |
|------|------|------|------|
| `POST /api/product-master/skus` | `ProductMasterService.createSku()` | 新建 SKU | MENU_MASTER_SKU E |
| `PUT /api/product-master/skus/:code` | `ProductMasterService.updateSku()` | 更新 SKU | MENU_MASTER_SKU E |

### 禁止操作

| 操作 | 原因 |
|------|------|
| 直接向 product_grades 写入 grade_code 不在标准值集内的值 | 破坏等级主数据一致性 |
| 直接向 packaging_specs 写入 spec_code 随意字符串 | 破坏规格主数据一致性 |
| 删除 product_grades / packaging_specs / product_skus 记录 | 应改为 status=INACTIVE |
| 在业务代码中 hardcode grade_code/spec_code 字符串（不经主数据验证）| 违反主数据治理原则 |

---

## 七、读取规则

### 查询优先级

```
1st  product_grades / packaging_specs / product_skus  — 主路径
2nd  各业务表中冗余的 grade_code / spec_code 字符串   — 只读，逐步淘汰
```

### 下游 Runtime 读取约定（Phase H3/H4/H5 后生效）

| Runtime | 当前读取方式 | Phase H3+ 目标 |
|---------|------------|---------------|
| `sal_price_items` | grade_code + packaging_spec 自由文本 | 引用 sku_code / grade_code FK |
| `inv_batches` | quality_grade 字母编码（独立值集）| 统一到 product_grades.grade_code |
| `sal_order_items` | grade_code + packaging_spec | 加 sku_code 字段 |
| `sal_store_sale_items` | grade_code + packaging_spec | 加 sku_code 字段 |
| `sal_return_items` | grade_code + packaging_spec | 加 sku_code 字段 |

---

## 八、权限矩阵

| 角色 | MENU_MASTER_PRODUCT | MENU_MASTER_GRADE | MENU_MASTER_PACKAGING | MENU_MASTER_SKU |
|------|:-------------------:|:-----------------:|:---------------------:|:---------------:|
| ADMIN | V C E D A X | V C E D A X | V C E D A X | V C E D A X |
| PRODUCT_MGR | V C E D X | V C E D X | V C E D X | V C E D X |
| HQ_FINANCE | V X | V X | V X | V X |
| AUDITOR | V X | V X | V X | V X |
| WMS_MGR | V | V | V | V |
| PKG_MGR | — | V | V | — |
| QC_INSPECTOR | — | V | — | — |
| PRC_BUYER | V | — | — | V |
| REGION_MGR | V | — | — | V |
| CEO | V X | — | — | V X |

---

## 九、Phase 路线图

| Phase | 目标 | 状态 |
|-------|------|------|
| H1 | 产品主档审计 | ✅ 完成 (2026-05-30) |
| H2 | 建立 product_grades / packaging_specs / product_skus 主数据基础层 | ✅ 完成 (2026-05-30) |
| H3 | 价格表接入 SKU（sal_price_items 加 sku_code，等级编码统一）| ⏳ 待 H2 完成后 |
| H4 | 库存批次统一 grade_code（inv_batches.quality_grade → grade_code）| ⏳ 待 H2 完成后 |
| H5 | 销售/POS/退货加 sku_code 字段；旧 POS 封存 | ⏳ 待 H3+H4 完成后 |
| H6 | 包装分级规范化；质量追溯接入 SKU + batch | ⏳ 待 H4 完成后 |
| H7 | 旧字段清理（inv_batches.quality_grade 等冗余字段）| ⏳ 生产稳定 6 个月后 |

---

## 十、违规场景识别

### 场景 A：业务表写入任意 grade_code 字符串

```typescript
// ❌ 违规（H3 后）
await em.query(`INSERT INTO sal_price_items (grade_code, ...) VALUES ('1级', ...)`);

// ✅ 正确
// 先查询 product_grades.grade_code 确认有效值，再写入
await em.query(`INSERT INTO sal_price_items (grade_code, ...) VALUES ('A', ...)`);
```

### 场景 B：包装规格使用自由文本

```typescript
// ❌ 违规（H3 后）
await em.query(`INSERT INTO sal_order_items (packaging_spec, ...) VALUES ('30枚每托', ...)`);

// ✅ 正确
await em.query(`INSERT INTO sal_order_items (packaging_spec, ...) VALUES ('TRAY30', ...)`);
```

### 场景 C：新接口不使用 sku_code（H5 后）

```typescript
// ❌ 违规（H5 后）
const line = { product_code: 'PRD-EGG-RAW', grade_code: 'AA', packaging_spec: 'TRAY30', unit_price: 1500 };

// ✅ 正确（H5 后）
const line = { sku_code: 'EGG-AA-TRAY30', unit_price: 1500 };
// 系统自动从 product_skus 解析 product_code / grade_code / spec_code
```

---

*本文档随代码演进同步更新。如发现违规引用，请在 PR 中标注并创建技术债 Issue。*  
*Last updated: 2026-05-30 Phase H2*
