# Phoenix ERP V3 — Master Data Initialization Phase M3 · 正式导入前预演（Dry Run）

> 2026-05-31 · 在 M2 标准初始化数据基础上进行**只读预演**
> **不正式写入生产数据**；目标是先验证数据质量，再判断是否可进入 M4 正式导入。
> 验证库：本地 `phoenix_erp`（由迁移重建）；数据源：`scripts/init-master-data-m2.sql` + `data/master-data-m2/*.csv` + `docs/user-role-matrix-v3.md`

---

## 0. 预演结论速览

| 维度 | 结果 | 严重项 |
|------|------|:------:|
| 一、组织验证 | ✅ 通过 | 0 |
| 二、用户验证 | ⚠️ 通过（含 B 类修正项） | 0 严重 |
| 三、司机验证 | ⚠️ 通过（1 既有非规范编码） | 0 严重 |
| 四、门店验证 | ✅ 通过 | 0 |
| 五、客户验证 | ⏳ 模板就绪，正式清单缺失 | — |
| 六、供应商验证 | ⚠️ 通过（联系人缺失） | 0 严重 |
| 七、导入模拟 | ✅ 幂等安全（二次执行 0 新增） | 0 |
| **最终判断** | **有条件达到正式导入条件**（先处理 B 类） | — |

**一句话定级：** 主数据**结构合规、无严重重复、组织树完整**，可进入正式导入；但存在 **5 人「双主组织绑定」+ 符强公司绑定错误**两类需先修正的 B 类问题，建议补一段「组织主标记唯一化」脚本后再进入 M4。

---

## 一、组织验证

### 组织树预览（65 节点）

```
ORG-GROUP 金凤凰控股集团 (GROUP, ACTIVE)
├── BU-AGRI 凤凰农业事业群 (BU)
│   ├── COMP-LAO-AGRI 老挝凤凰农业发展有限公司 (COMPANY)
│   │   ├── SITE-MENGSAI-HATCHERY 孟赛孵化场 (SITE, PLANNED) ┐
│   │   ├── SITE-MENGSAI-LAYER 孟赛蛋鸡养殖场 (SITE, ACTIVE) ├ 各含 7 部门 DEPT
│   │   └── SITE-MENGSAI-ORGANIC 孟赛有机肥生产厂 (SITE, PLANNED) ┘
│   └── COMP-LAO-XINGCHI 老挝金三角特区星驰养鸡场 (COMPANY)
│       └── SITE-DONGPENG-LAYER 东鹏蛋鸡养殖场 (SITE, ACTIVE) + 7 部门
├── BU-FOOD 凤凰食品事业群 (BU)
│   └── COMP-LAO-FOOD 老挝凤凰食品集团有限公司 (COMPANY)
│       ├── SITE-VTE-BROILER 万象肉鸡养殖场 (SITE, ACTIVE) ┐
│       ├── SITE-VTE-FEED 万象饲料厂 (SITE, PLANNED) ├ 各含 7 部门
│       └── SITE-VTE-SLAUGHTER 万象屠宰加工厂 (SITE, ACTIVE) ┘
├── BU-SCM 凤凰供应链事业群 (BU, PLANNED)
├── BU-TRADING 凤凰贸易事业群 (BU, PLANNED)
└── ORG-HQ 金凤凰控股集团总部 (DEPARTMENT, ACTIVE)
```

### 层级完整性

| 层级 | org_type | 数量 |
|------|----------|:----:|
| GROUP | 集团 | 1 |
| BU | 事业群 | 4（含 2 个 PLANNED：供应链/贸易） |
| COMPANY | 公司 | 3 |
| SITE | 场区/工厂 | 7 |
| DEPARTMENT | 部门 | 50（+ ORG-HQ 总部） |
| **合计** | | **65** |

### 异常检查

| 检查项 | 结果 |
|--------|------|
| 孤儿节点（parent 不存在） | ✅ 0 |
| 重复编码 | ✅ 无 |
| 错误层级（子 level ≠ 父 level+1） | ✅ 无 |
| 根节点数（应=1） | ✅ 1（ORG-GROUP） |

> 说明：GROUP/BU/COMPANY/SITE/DEPARTMENT 五级齐全。M2/M3 矩阵用户全部绑定到 ACTIVE 节点。PLANNED 节点（孵化场/有机肥/饲料厂/供应链群/贸易群）为规划占位，不影响本期导入。

---

## 二、用户验证

### 计数

| # | 指标 | 数值 | 结果 |
|---|------|:----:|------|
| 1 | 矩阵用户在册 | 10 / 10 | ✅ |
| 2 | 角色绑定数 | 19 | ✅ |
| 3 | 组织绑定数 | 16 | ⚠️（含 5 人多绑定，见下） |
| 4 | 缺失组织绑定的用户 | 无 | ✅ |
| 5 | 缺失角色绑定的用户 | 无 | ✅ |
| 6 | 重复用户名 | 无 | ✅ |

### 重点 6 人（必须正确）— 全部正确 ✅

| 用户名 | 姓名 | 主角色 ★ + 附加角色 | 组织绑定 |
|--------|------|---------------------|----------|
| zhaoyongwei | 赵永伟 | ★ROLE_ADMIN / ROLE_CEO | ORG-GROUP(GROUP,主) ✅ |
| zhuzhaocun | 朱兆存 | ★ROLE_CEO / ROLE_BU_AGRI_GM | BU-AGRI(BU,主) ⚠️+ORG-GROUP(主) |
| songlei | 宋雷 | ★ROLE_PRC_BUYER / ROLE_FIN_AR | SITE-MENGSAI-LAYER(SITE,主) ✅ |
| fuqiang | 伏强 | ★ROLE_FACTORY_MGR / ROLE_SALES_MGR / ROLE_REGION_MGR | SITE-DONGPENG-LAYER(主) ⚠️+COMP-LAO-FOOD(主) |
| xiejiling | 谢继领 | ★ROLE_FARM_MGR / ROLE_VET | SITE-MENGSAI-LAYER(SITE,主) ✅ |
| liujie | 刘杰 | ★ROLE_HQ_FINANCE / ROLE_FIN_ACCT | ORG-GROUP(GROUP,主) ✅ |

- **主角色 6/6 正确**，附加角色匹配 V3 矩阵。角色主标记唯一性：**全 10 人 PASS**（M2 §3b 已收敛）。
- 注：fuqiang 多一个 `ROLE_REGION_MGR`（既有附加角色，无害）；姓名系统为「伏强」，名单为「符强」需核对。

### ⚠️ 组织绑定问题（B 类，需修正）

| 用户 | 组织绑定（主标记） | 问题 |
|------|---------------------|------|
| **fuqiang** | SITE-DONGPENG-LAYER(主) + **COMP-LAO-FOOD(主)** | ① 双主标记；② **公司绑定错误**：东鹏属星驰 `COMP-LAO-XINGCHI`，不应绑食品集团 `COMP-LAO-FOOD` |
| liushanjun | ORG-GROUP(主) + SITE-MENGSAI-LAYER(主) + COMP-LAO-AGRI | 双主标记（3 绑定 2 主） |
| wangweihua | ORG-HQ(主) + ORG-GROUP(主) | 双主标记 |
| zhuzhao_an | ORG-GROUP(主) + ORG-HQ(主) | 双主标记 |
| zhuzhaocun | BU-AGRI(主) + ORG-GROUP(主) | 双主标记 |

> 根因：这些是**早于 M2 的既有组织绑定**；M2 `§4` 用 `WHERE NOT EXISTS` 新增绑定时已跳过它们，且 M2 仅做了「角色」主标记唯一化（§3b），**未做「组织」主标记唯一化**。DataScope 以主组织决定默认数据范围，双主会导致范围判定不确定。
> 修正建议：在 init 脚本补 `§4b 组织主标记唯一化`（镜像 §3b），并单独纠正 fuqiang 的公司绑定。**详见 §8 风险清单 B 类。**

---

## 三、司机验证（sal_drivers）

| 检查项 | 结果 |
|--------|------|
| DB 现存 | 6 条（M2 的 DRV-VTE-001~005 共 5 + 既有 DRV-MS-001） |
| 含 `ALL` / 空场区·公司 | ✅ 无 |
| 重复 driver_code | ✅ 无 |

| driver_code | 姓名 | company_code | 备注 |
|-------------|------|--------------|------|
| DRV-MS-001 | 王 强 | **MENGSE** | ⚠️ 既有；company_code 非规范编码（应为 COMP-LAO-AGRI / SITE-MENGSAI-LAYER） |
| DRV-VTE-001~005 | 阿坚/阿喷/阿哨/阿通/阿给 | COMP-LAO-FOOD | ✅ M2 导入，规范 |

> M2 5 名司机全部合规。既有 `DRV-MS-001` 的 `MENGSE` 不是规范 org_code，建议清洗为标准编码（B 类，不阻断本期 5 人导入）。
> 表结构无 `site_code` 列，CSV 的 site_code 暂存于 remark（M2 已记录）。

---

## 四、门店验证（mst_stores）

| 检查项 | 结果 |
|--------|------|
| DB 现存 STORE-* | 8 条 |
| 编码唯一性 | ✅ 全部唯一，无重复 |

STORE-XC/DP/HS/XB/MX/VTE/BKX/LPB-001 — 8 家直营店全部就绪。CSV 含 `company_code` 列，但 `mst_stores` 表无该列，公司归属暂存 `region`（M2 已记录，建议 M4 前加列）。

---

## 五、客户验证

### customers-init.csv（仅模板）

`customers-init.csv` **仅为 4 类客户结构模板**（DISTRIBUTOR/KEY_ACCOUNT/RETAIL/LOGISTICS），含 4 行示例占位（`CUS-*-EXAMPLE`，status=DRAFT），**init SQL 不写入占位行**。V2 名单未提供正式客户清单。

| 检查项（针对模板） | 结果 |
|--------------------|------|
| 客户类型缺失 | ✅ 模板均含 customer_type |
| 区域缺失 | ⚠️ 示例行 region=「待补充」（占位，不导入） |
| 名称/手机重复 | ✅ 无（仅 4 示例） |

### 既有 sal_customers 实表（30 条）— 全部干净 ✅

| 检查项 | 结果 |
|--------|------|
| 客户总数 | 30 |
| 客户名称重复 | ✅ 无 |
| contact_phone 重复（非空） | ✅ 无 |
| customer_type 缺失 | ✅ 0 |
| region_code 缺失 | ✅ 0 |
| contact_phone 缺失 | ✅ 0 |

类型分布：RETAIL 19 / DISTRIBUTOR 5 / KEY_ACCOUNT 5 / DIRECT_STORE 1。

### 📋 客户清洗清单

| # | 项 | 状态 | 处理 |
|---|----|------|------|
| 1 | 正式经销商/企业/零售/物流客户名录 | ❌ 缺失 | 业务提供真实清单后单独导入（C 类：本期无数据可导） |
| 2 | 既有 30 条实表 | ✅ 干净 | 保持不变，不被 M2/M3 改写 |
| 3 | 模板占位行 | ✅ 不导入 | 仅作结构参考 |

---

## 六、供应商验证（prc_suppliers）

| 检查项 | 结果 |
|--------|------|
| DB 现存 SUP-* | 6 条 |
| 重复 supplier_code | ✅ 无 |
| 重复供应商名称 | ✅ 无 |
| 联系人 contact | ⚠️ 6/6 全部为空 |
| 电话 phone | ⚠️ 6/6 全部为空 |
| 类型 supplier_type | ⚠️ 表无该列（类型存于 CSV/报告） |

### 📋 供应商清洗清单

| supplier_code | 名称 | 类型(CSV) | 联系人 | 电话 |
|---------------|------|-----------|:------:|:----:|
| SUP-HBAGD-001 | 湖北艾格多 | 饲料/添加剂 | ∅ | ∅ |
| SUP-HDYK-001 | 华都峪口 | 种鸡/雏鸡 | ∅ | ∅ |
| SUP-HBYK-001 | 河北峪口 | 种鸡/雏鸡 | ∅ | ∅ |
| SUP-COFCO-001 | 中粮 | 饲料原料 | ∅ | ∅ |
| SUP-HNATM-001 | 河南艾特米 | 兽药/疫苗 | ∅ | ∅ |
| SUP-LYZB-001 | 临沂众邦 | 饲料/物料 | ∅ | ∅ |

> 6 家供应商**编码与名称无重复、可导入**；但**全部缺联系人/电话**，且表缺 `supplier_type` 列。建议业务补联系人，schema 迭代加 `supplier_type`（B 类，不阻断导入）。

---

## 七、导入模拟（§7）

**方式：** 在本地库执行 `init-master-data-m2.sql`，对比执行前后计数（脚本全程幂等，含 ON CONFLICT DO NOTHING / WHERE NOT EXISTS）。**不写正式生产库。**

### 二次执行（幂等安全验证）

| 对象 | 本次新增 |
|------|:--------:|
| 用户 / 角色 / 角色绑定 / 组织绑定 | 0 / 0 / 0 / 0 |
| 司机 / 门店 / 供应商 / 客户 | 0 / 0 / 0 / 0 |

✅ **幂等性确认**：因 M2 已落库，再次执行**全部 0 新增**，不覆盖、不重复——脚本可安全重复运行。

### 全新生产库预计新增（从空库导入的静态预估）

| 对象 | 预计新增 | 来源 |
|------|:--------:|------|
| 角色 | +1 | ROLE_CASH（出纳） |
| 用户 | +3 | songlei / xiejiling / liujie |
| 角色绑定 | +16 | §3 VALUES 16 行 |
| 组织绑定 | +10 | §4 VALUES 10 行 |
| 司机 | +5 | DRV-VTE-001~005 |
| 门店 | +8 | STORE-* |
| 供应商 | +6 | SUP-* |
| 客户 | +0 | 无正式清单 |

---

## 八、风险清单

### 🟢 A 类 — 可直接导入

- 组织树（65 节点，结构完整无异常）
- 司机 5 名（DRV-VTE-001~005）
- 门店 8 家（STORE-*，编码唯一）
- 供应商 6 家（SUP-*，编码唯一）— 联系人后补
- 矩阵 10 人 + 角色绑定（角色主标记已唯一）

### 🟡 B 类 — 建议修正后导入

| # | 问题 | 建议修正 |
|---|------|----------|
| B1 | **5 人双主组织绑定**（fuqiang/liushanjun/wangweihua/zhuzhao_an/zhuzhaocun） | 在 init 补 `§4b 组织主标记唯一化`（镜像 §3b 角色逻辑），按 V3 矩阵收敛每人唯一主组织 |
| B2 | **fuqiang 公司绑定错误** COMP-LAO-FOOD | 删除/改为 COMP-LAO-XINGCHI（东鹏属星驰） |
| B3 | fuqiang 姓名「伏强」vs 名单「符强」 | 业务核对后更正 sys_user.real_name |
| B4 | 既有司机 DRV-MS-001 company_code=`MENGSE` 非规范 | 清洗为规范 org_code |
| B5 | 6 家供应商缺联系人/电话 | 业务补充 |
| B6 | 表字段缺口：司机 site_code / 门店 company_code / 供应商 supplier_type | schema 迭代加列（不阻断本期） |

### 🔴 C 类 — 禁止导入（无数据 / 数据不全）

| # | 问题 | 原因 |
|---|------|------|
| C1 | 正式客户清单 | V2 名单未提供，无真实数据可导，待业务补充 |
| C2 | customers-init.csv 占位示例行 | 仅模板，禁止写入生产 |

---

## 九、正式导入建议

1. **先补一段组织主标记唯一化（§4b）**：解决 B1 五人双主问题，使 DataScope 默认范围确定。
2. **单独纠正 fuqiang 公司绑定（B2）**：将 COMP-LAO-FOOD 改为 COMP-LAO-XINGCHI 或移除。
3. **A 类即可入库**：组织 / 司机 5 / 门店 8 / 供应商 6 / 用户角色矩阵，幂等脚本已验证安全。
4. **客户分批延后（C1）**：待业务交付正式客户名录后，按 4 类结构单独导入。
5. **联系人/字段缺口（B5/B6）**：不阻断导入，作为后续数据补全 + schema 迭代项跟进。

---

## 十、最终判断

### 是否达到 Production Data Import 条件？

**有条件达到。**
- ✅ 组织树完整、无孤儿/无重复/无层级错误
- ✅ 无严重重复（用户名/编码/客户名/手机号全无严重重复）
- ✅ 角色绑定正确、角色主标记唯一、重点 6 人全部正确
- ✅ 导入脚本幂等安全（二次执行 0 新增）
- ⚠️ 存在 **2 项 B 类组织绑定问题**（5 人双主 + fuqiang 错误公司），属「建议修正后导入」，非阻断性严重错误

### 是否可以进入 M4 正式导入？

**可以进入 M4，但建议在 M4 开头先执行两步修正（B1+B2 组织绑定收敛），再做正式落库。** 客户清单作为 C 类延后分批导入，不阻断用户/组织/司机/门店/供应商的正式导入。

| 验收标准 | 结果 |
|----------|------|
| 所有主数据通过 Dry Run | ✅（客户为模板，标注延后） |
| 无严重重复 | ✅ |
| 无错误组织绑定 | ⚠️ 5 人双主 + fuqiang 错误公司（B 类，已列修正方案） |
| 无错误角色绑定 | ✅ |
| 可以安全进入正式导入阶段 | ✅ 有条件（先做 B1+B2 修正） |

---

## 十一、环境验证（§11）

| 验证项 | 结果 | 说明 |
|--------|------|------|
| API TypeScript | ✅ 0 errors | M3 为只读预演，未改代码 |
| Web TypeScript | ✅ 0 errors | 同上 |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非 M3 回归） | 见下 |

**scope-audit 说明（与 M2 §11 同源，非 M3 回归）：** scope-audit 登录的 6 个 DataScope 测试账号（group_admin/ceo_user/mengsai_buyer/vte_project_mgr/factory_acct/shareholder_view，Test@123）**在本地库全部缺失**，且本地 API 未提供对应端点（/finance/accounts 返回 404）。这些账号不被仓库任何迁移/种子创建，仅存在于原有本地/生产库状态。**M3 是纯只读 Dry Run，未触及任何代码、用户或 DataScope 逻辑**，故不构成回归。生产端（夹具完整）不受影响。建议将这 6 个测试账号种子纳入仓库、统一测试密码，作为独立测试基建修复项。
</content>
</invoke>
