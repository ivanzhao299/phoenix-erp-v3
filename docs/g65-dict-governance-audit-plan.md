# G65 数据字典全面审计 + 字典/主数据治理规划（2026-06-09）

## 0. 一句话结论
45 个 sys_dict 中 **39 个健康在用、5 个真孤儿（仅种子无代码消费）、1 个已废弃迁主数据（PKG_EGG_GRADE）**。
字典与主数据边界需明确：**纯枚举留字典，带属性/关系/生命周期的实体升主数据**。

---

## 1. 字典 vs 主数据 判定标准（治理基线）

| 维度 | 留【数据字典 sys_dict】 | 升【主数据 master】 |
|------|----------------------|---------------------|
| 本质 | 纯枚举（一组固定取值） | 实体（现实对象，有身份） |
| 属性 | ≤4（code/label/sort/status） | ≥5，多业务特征 |
| 关系 | 无 | 有外键/引用关系 |
| 生命周期 | 无（或仅启用/停用） | 有（草稿→审批→生效→归档） |
| 维护方 | IT/治理，变更罕见 | 业务方常维护 |
| 典型 | 各种 reason/type/method/status/shift | 客户/供应商/产品/等级/账户 |
| 先例 | — | **PKG_EGG_GRADE → product_grades**（因等级需 is_saleable/is_storable 等属性 + 与 SKU 关联） |

---

## 2. 审计结果（45 个 dict_type）

### ✅ 健康在用（39 个）— 纯枚举，留字典
养殖8 / 财务5 / 采购4 / 销售8(含G63补的5) / 库存6(含INV_STOCK_STATUS) / 包装5(含PKG_DEFECT) / 系统2 / 兽医... — 都有前端 DictSelect 或后端校验消费。

### 👻 真孤儿（5 个）— 仅迁移种子、零功能代码消费
| dict_type | 条目 | 引用情况 | 性质 | 建议 |
|---|---|---|---|---|
| **WMS_OUTBOUND_DESTINATION** | 4 | **0 引用** | WMS 出库目的地，模块未实装 | 归档(DEPRECATED) 或留作未来 |
| **PRC_PAYER_TYPE** | 4 | 仅 g2/g38 种子 | 采购付款方类型，定义未集成 | 归档 |
| **SAL_CUSTOMER_TYPE** | 5 | 仅 g2 种子 | sal_customers.customer_type 列存在但未走此字典 | 需业务确认（统一到主数据 or 字典） |
| **VET_USAGE** | 5 | 仅 g17 种子 | 兽医用药用途，兽医功能未实装 | 留作未来（功能落地即用） |
| **SYS_COUNTRY** | 6 | 仅 g2 种子 | 多区域基建未就绪 | 留作未来 |

> 区分：WMS/PRC_PAYER/SAL_CUSTOMER 是「定义后未集成」→ 可归档；VET/COUNTRY 是「前瞻种子，功能未落地」→ 保留。

### 🔄 已迁主数据（1 个）
**PKG_EGG_GRADE**（7条全 DEPRECATED）→ 鸡蛋等级已迁 product_grades 主数据（ACTIVE: XL/L/M/S/XS=特大/一号/二号/三号/四号 + 脏/裂/破/损坏 9 档）。
- **数据质量看板对它报 MISSING_DICT_TYPE 是假阳性**（它本就该空）。
- **残留代码债**：9 个前端文件仍 import/引用 'PKG_EGG_GRADE'（packaging 终端页 + usePackagingDicts + packaging-api + dict 管理页）。

---

## 3. 瘦身行动（按 sys_dict 保护规则分级）

> ⚠️ sys_dict 保护：生产部署只允许幂等 INSERT，**禁止 DELETE/UPDATE 已有记录**。
> 故所有"归档/删除字典"动作 **不进自动部署迁移**，由用户在生产手工执行（贴回输出）。

### A. 可立即做（代码级，无 sys_dict DML）
- [ ] **清 PKG_EGG_GRADE 前端残留**（9 文件）：packaging 终端改用 useProductGrades，删 FALLBACK 兼容码。需逐文件验证不破坏包装终端。

### B. 需用户授权 + 生产手工执行（sys_dict UPDATE，受保护）
```sql
-- 归档 3 个「定义未集成」孤儿（非删除，保留审计痕迹）
UPDATE sys_dict SET status='DEPRECATED'
WHERE dict_type IN ('WMS_OUTBOUND_DESTINATION','PRC_PAYER_TYPE') AND status='ACTIVE';
-- SAL_CUSTOMER_TYPE 待业务确认后再定
```

### C. 保留不动
VET_USAGE / SYS_COUNTRY（前瞻种子，功能落地即用）。

---

## 4. 主数据升级候选（中长期评估）
| dict_type | 升主数据触发条件 |
|---|---|
| SYS_ORG_LEVEL(10) | 若层级需挂审批权限/预算控制等属性 |
| BRD_BREED(7 品种) | 若品种需挂产蛋曲线/标准体重等养殖参数 |
| BRD_VACCINE_TYPE(9) | 若疫苗需挂剂量/厂商/批号等 → 升疫苗主数据 |
| SYS_CURRENCY(5) | 已有 fin_exchange_rates，若需常维护汇率可整合 |

---

## 5. 治理建议（流程）
1. **数据质量看板**：对 status=DEPRECATED 的 dict_type 豁免 MISSING_DICT_TYPE 告警（消除 PKG_EGG_GRADE 假阳性）。
2. **新增字典前先判定**：按第 1 节标准——是枚举还是实体。
3. **迁移规范**：字典种子放 apps/api/migrations（避免 G63 那类 F5 漏部署）；字典 DML 只允许幂等 INSERT。
