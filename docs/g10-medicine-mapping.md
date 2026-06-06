# G10 · 孟赛药品/疫苗 ETL 字段映射 + 等效手工录入审计

完成时间：2026-06-06

## 1. Excel 数据分析

**文件**：`data/药品、疫苗出库明细表.xlsx`

**结构**：
- 1 sheet × 47 行 × 7 列（去标题 = 45 SKU 行）
- 列：药品编号 / 药品名称 / 5.31 库存 / 6.2 出库 / 6.4 出库 / 期末库存

**业务语义**：
- 5.31 库存 = 期初库存（2026-05-31）
- 6/2、6/4 出库流水
- 期末 = 期初 − Σ出库

**特征**：
- 单位混杂：瓶/袋/包/升/公斤/克/桶
- 多数行 5/31 期初 = 期末（无出库变动）
- 4 行有出库流水：
  - 19 四系 6/2 出 63 瓶
  - 21 黏菌素 6/2 出 3.8、6/4 出 2.5 公斤
  - 24 林可霉素 6/2 出 3.8、6/4 出 2.5 公斤

## 2. Schema 容纳度审计

### 2.1 完美容纳 ✓

| 信息 | 落地表 | 字段 |
|---|---|---|
| 药品/疫苗目录 | `brd_medications` | medication_code / medication_name / dosage / status / store_code |
| 期初库存 | `inv_batches` | batch_no='MED-STOCK-{code}' / product_code / qty / warehouse_code='MEDICINE' / source_type='INITIAL' |
| 出库流水 | `inv_ledger` | batch_no / change_type='FARM_OUT_MEDICATION' / qty_change(负数) / log_date / note |

### 2.2 部分容纳 ⚠️

| 信息 | 痛点 | 处理 |
|---|---|---|
| 小数公斤（17.55、3.8 等） | `inv_batches.qty INTEGER` 无小数 | **取整数**（17.55→17、3.8→4）；原始字符串记入 `inv_ledger.note` |
| 单位混杂（瓶/袋/公斤/克）| 无统一 base unit | 单位写入 `brd_medications.dosage` 字段；每个 SKU 用各自单位 |
| "苍蝇药AB 各100袋" | 实为 2 个 SKU | 临时合并 200 袋 / dosage='袋'；业务方后续可拆 2 SKU |

## 3. 等效宋明光手工操作路径

### 3.1 现有页面（已就绪）

| 操作 | 前端页面 | 后端 endpoint | 持权要求 |
|---|---|---|---|
| 药品目录新建 | 主数据中心（无专用页，可走 `/api/crud/brd_medications`）| POST `/api/crud/brd_medications` | `MENU_MASTER:E` 或 fallback |
| 期初入库 | `/breeding/med-stock` 入库 tab | POST `/api/farm/medicine/inbound` | `MENU_FARM_VET:E` |
| 出库登记 | `/breeding/med-stock` 出库 tab | POST `/api/farm/medicine/outbound` | `MENU_FARM_VET:E` |
| 库存查询 | `/breeding/med-stock` 库存 tab | GET `/api/farm/medicine/stock` | `MENU_FARM_VET:V` |
| 流水查询 | `/breeding/med-stock` 流水 tab | GET `/api/farm/medicine/ledger` | `MENU_FARM_VET:V` |

### 3.2 缺失权限

**宋明光当前 24 个菜单权限中无 `MENU_FARM_VET`** → 无法访问 `/breeding/med-stock` 页面或调用 4 个 endpoint。

**G10 mig 同步补齐**：给 `ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR` 加 `MENU_FARM_VET:V,C,E`（INSERT NOT EXISTS）。

### 3.3 手工等效流程（业务方将来日常使用）

```
1. /breeding/med-stock 入库 tab
   - 选药品（从 brd_medications）
   - 录数量 + 备注
   - 提交 → POST /api/farm/medicine/inbound
   - 后端：inv_batches.qty += delta，inv_ledger 写一行 INBOUND
2. /breeding/med-stock 出库 tab
   - 选药品 + 数量 + 鸡舍 + 备注
   - 提交 → POST /api/farm/medicine/outbound
   - 后端：qty -= delta，写 OUTBOUND 流水
```

## 4. ETL 实施（G10 commit）

### 4.1 文件

| 文件 | 用途 |
|---|---|
| `scripts/g10_etl_mengsai_medicine.py` | Excel → SQL 生成器（可重跑） |
| `migrations/20260606_g10_mengsai_medicine_initial.sql` | 365 行 SQL，手动 psql 跑 |
| `apps/api/migrations/20260606_g10_mengsai_medicine_initial.sql` | 镜像供 CI 测试（IF EXISTS 守卫） |
| `docs/g10-medicine-mapping.md` | 本审计报告 |

### 4.2 mig 4 段内容

| § | 数量 | 内容 |
|---|---|---|
| § 1 | 1 行 | `sys_role_menu_permission`：宋明光角色 + `MENU_FARM_VET:V,C,E` |
| § 2 | 45 行 | `brd_medications`：药品目录 INSERT NOT EXISTS |
| § 3 | 45 行 | `inv_batches`：MEDICINE 仓库期末库存批次 |
| § 4 | 5 行 | `inv_ledger`：4 行 6/2 + 6/4 出库流水（黏菌素/林可两个 SKU 各 2 天） |

### 4.3 业务侧可见效果

- 宋明光重新登录后：`/breeding/med-stock` 页面可见 — 6 鸡舍可选 + 45 药品下拉 + 4 行历史出库
- 后续每天用药 → 在 `/breeding/med-stock` 出库 tab 录新行（房间 / 数量 / 备注）
- 库存余额自动更新 + 流水可查询

## 5. 业务连贯性总结

| 维度 | 状态 |
|---|---|
| Excel 字段全栈映射 | ✓ 100%（小数精度有损） |
| 落地表 schema 适配 | ✓ 4 段全 IF EXISTS 兜底 |
| 业务方手工录入入口存在 | ✓ `/breeding/med-stock` |
| 宋明光持权 | ✗→✓ G10 mig 补 MENU_FARM_VET |
| 数据日叠加可行 | ✓ inbound/outbound endpoint runtime 化 |
| 初始数据作用 | ✓ 期末库存 → 后续 ledger 增量 |

## 6. 待业务方决策（mig 跑前）

| 项 | 选项 |
|---|---|
| 小数公斤精度损失 | A. 接受取整（推荐：业务方实际是公斤为单位） / B. 升级 schema qty 为 NUMERIC |
| "苍蝇药 AB 各100袋" | A. 合并 200 袋（当前 ETL 默认） / B. 拆 MED-041A + MED-041B 各 100 |
| dosage 字段语义 | 当前：仅存单位（瓶/袋/公斤）。可后续扩展为"瓶 / 50ml" 等完整剂量描述 |
| 6/3 数据缺失 | Excel 仅有 6/2、6/4 出库列，业务方需确认是否漏录 6/3 |

## 7. 跑 mig 前需用户授权

```bash
# 跑前先在 staging 实测：
docker exec phoenix-v3-db psql -U phoenix_v3 -d phoenix_erp \
  -f /tmp/20260606_g10_mengsai_medicine_initial.sql

# 期望输出：
# NOTICE: § 1 完成 INSERT 1 行（perms_version 自动 bump）
# NOTICE: § 2 完成 INSERT 45 行
# NOTICE: § 3 完成 INSERT 45 行
# NOTICE: § 4 完成 INSERT 5 行
```

---

**Tag**：`v3-g10-medicine-etl`
**Migration**：`migrations/20260606_g10_mengsai_medicine_initial.sql`
**字段覆盖率**：47/47 (100%，小数精度损失记 ledger note)
**权限补齐**：MENU_FARM_VET 加入宋明光角色
