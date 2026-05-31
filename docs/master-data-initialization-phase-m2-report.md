# Phoenix ERP V3 — Master Data Initialization Phase M2 报告

> 2026-05-31 · 正式用户角色矩阵 V3 + 主数据初始化
> 本阶段为**数据整理**，非功能开发。产出标准初始化数据，为 ERP 正式导入做准备。

---

## 0. 总结

| 验收项 | 结论 |
|--------|------|
| 正式用户角色矩阵 V3 建立 | ✅ `docs/user-role-matrix-v3.md`（核心 10 人 + 待补充类别） |
| 主数据初始化清单建立 | ✅ 司机 5 / 门店 8 / 供应商 6 / 客户模板 |
| 用户·司机·门店·客户·供应商分类清晰 | ✅ A/B/C 账号分类 + 4 类客户 + 供应商类型 |
| 不混入旧表 | ✅ 司机→sal_drivers、门店→mst_stores、供应商→prc_suppliers、客户→sal_customers |
| 幂等导入脚本 | ✅ `scripts/init-master-data-m2.sql`（两遍幂等通过） |
| 校验脚本 | ✅ `scripts/check-master-data-m2.sql`（全 PASS） |
| 是否达到正式导入条件 | ⚠️ **部分达到**（见 §10：客户清单待补充、3 处字段缺口） |

---

## 1. 用户角色矩阵 V3

详见 `docs/user-role-matrix-v3.md`。核心 10 人，含姓名/用户名/主角色/附加角色/所属公司/场区/组织层级/开账号/参与审批/培训等级/备注。

**关键修正：**
- `ROLE_GROUP_FINANCE` → `ROLE_HQ_FINANCE`（C-4.3 已合并，刘杰）
- `ROLE_CASH`（出纳）系统暂无 → init 脚本幂等创建（朱召安）
- 新建用户：宋雷(songlei)、谢继领(xiejiling)、刘杰(liujie)；其余 7 人系统已存在

本地落库校验：10 人在册、角色绑定 19 条、组织绑定 16 条、每人唯一主角色 ✅。

## 2. 账号开通建议

| 分类 | 处理 | 本期人员 |
|------|------|---------|
| **A 类（必须开）** | 集团管理/财务/采购/销售/仓储/场长/店长 | 赵永伟、朱兆存、宋雷、符强、谢继领、刘杰、王玮华、朱召安、刘善军 |
| **B 类（建议开）** | 统计员/防疫员/包装主管/品控主管 | 待补充（防疫已并入谢继领 A 类） |
| **C 类（暂不开）** | 普通饲养员/包装工/装卸工/临时工/**司机** | 阿坚等 5 名司机（仅建档案） |

## 3. 司机初始化（`data/master-data-m2/drivers-init.csv` → sal_drivers）
阿坚、阿喷、阿哨、阿通、阿给（DRV-VTE-001~005），公司 COMP-LAO-FOOD，发出地 SITE-VTE-SLAUGHTER，status=ACTIVE。**暂不开系统账号**，启用 Mobile Delivery 时再决定。落库 5 条 ✅。

## 4. 门店初始化（`stores-init.csv` → mst_stores）
8 直营店：特区/东鹏/会晒/沙耶武里/孟赛/万象/波利坎赛/拉邦（STORE-XC/DP/HS/XB/MX/VTE/BKX/LPB-001）。落库 8 条 ✅。

## 5. 客户初始化（`customers-init.csv` → sal_customers）
⚠️ V2 名单**未提供正式客户清单**。已建 4 类客户结构模板（DISTRIBUTOR/KEY_ACCOUNT/RETAIL/LOGISTICS）。既有 30 条真实客户保持不变，**本期不写入占位客户**，待业务补充真实数据后单独导入。

## 6. 供应商初始化（`suppliers-init.csv` → prc_suppliers）
湖北艾格多、华都峪口、河北峪口、中粮、河南艾特米、临沂众邦（SUP-*-001），status=ACTIVE。落库 6 条 ✅。

## 7. 导入脚本
`scripts/init-master-data-m2.sql` — 全程幂等（ON CONFLICT DO NOTHING / WHERE NOT EXISTS），不覆盖已有正式数据；新用户随机 bcrypt 密码（管理员后续重置）；§3b 将矩阵用户主角色收敛为唯一权威。两遍重复执行无错误 ✅。

## 8. 校验脚本
`scripts/check-master-data-m2.sql` — 检查核心计数、主角色唯一性、重复编码、组织绑定有效性。结果：每人唯一主角色 ✅、组织绑定均有效 ✅、重复编码全 0 ✅。

## 9. 缺失信息清单（正式导入前需补齐）

| # | 缺失项 | 影响 | 建议 |
|---|--------|------|------|
| 1 | **正式客户清单** | 客户主数据无法初始化 | 业务提供经销商/企业/零售/物流客户名录 |
| 2 | 司机 site_code 字段 | sal_drivers 无 site_code 列，暂存 remark | 如需精确场区隔离，加列 site_code |
| 3 | 门店 company_code 字段 | mst_stores 无 company_code 列，公司归属暂存 region | 加列 company_code 以支持按公司隔离 |
| 4 | 供应商 supplier_type/contact_name | prc_suppliers 无 supplier_type、字段名为 contact（非 contact_name） | 加列 supplier_type；类型见 CSV |
| 5 | 司机/供应商联系电话 | 当前为空 | 业务补充 |
| 6 | 符强系统姓名「伏强」 | 与名单「符强」不一致 | 核对正确姓名后更正 sys_user.real_name |
| 7 | 王玮华/朱召安 财务范围 | 暂按集团 GROUP 绑定 | 如需收敛到 COMPANY（财务中心），业务确认 |

## 10. 是否达到正式导入条件

**⚠️ 部分达到 — 可分批导入：**
- ✅ **可正式导入**：用户角色矩阵、组织绑定、司机、门店、供应商（脚本幂等、校验通过、不覆盖旧数据）
- ⏳ **待补齐后导入**：正式客户清单（§9-1）
- 🔧 **建议先补字段**：司机 site_code、门店 company_code、供应商 supplier_type（§9 2-4，不阻断本期，但影响后续精细化）

**结论**：用户/司机/门店/供应商可进入正式导入；客户待补充清单；3 处字段缺口建议在后续 schema 迭代中补齐。

---

## 11. 验证结果（§12）

| 验证项 | 结果 | 说明 |
|--------|------|------|
| API TypeScript | ✅ 0 errors | M2 未改 API 代码 |
| Web TypeScript | ✅ 0 errors | M2 未改 Web 代码 |
| M2 校验脚本 | ✅ 全 PASS | 主角色唯一 + 组织有效 + 重复编码 0 |
| scope-audit.sh | ⚠️ 本地夹具缺失 | 详见下方说明 |

**scope-audit 说明（非 M2 回归）：** scope-audit.sh 登录 6 个 DataScope 专用测试用户（group_admin / ceo_user / mengsai_buyer / vte_project_mgr / factory_acct / shareholder_view，密码 Test@123）。这 6 个用户**不被仓库任何迁移或种子脚本创建**（seed-uat-users.sh 建的是 test_* 系列、密码 Test@1234，属另一测试套件），仅存在于原有本地库/生产库状态中。本地 phoenix_erp 由迁移重建，未含该夹具，故 scope-audit 登录失败。

**M2 本身未触及 DataScope 逻辑或这些测试用户**（仅幂等新增主数据），因此不构成 scope-audit 回归。生产端（夹具完整）scope-audit 不受影响。建议：将这 6 个 DataScope 测试用户的种子纳入仓库脚本，并统一 scope-audit.sh / seed-uat-users.sh 的测试密码（Test@123 vs Test@1234 不一致），作为独立的测试基建修复项。
</content>
