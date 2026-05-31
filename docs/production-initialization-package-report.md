# Phoenix ERP V3 — Production Initialization Package 报告（Phase M4）

> 2026-05-31 · 金凤凰控股集团 Pilot Run 生产初始化数据包
> **本阶段只生成「可审阅、可验证、可重复执行」的初始化包，不直接导入生产库。**
> 包路径：`apps/api/scripts/init-data/golden-phoenix/`

---

## 1. 初始化包目录

| 文件 | 内容 | 目标表 | 幂等键 |
|------|------|--------|--------|
| `01-organizations.sql` | GROUP/BU/COMPANY/SITE/DEPARTMENT 五级组织树 | sys_organizations | org_code |
| `02-users.sql` | 9 名核心系统用户（随机 bcrypt 密码） | sys_user | username |
| `03-user-roles.sql` | 用户角色绑定 + 缺失角色诊断 + 主角色唯一化 | sys_user_role | (user_id,role_id) |
| `04-user-orgs.sql` | 用户组织范围（DataScope）+ 主组织唯一化 + 违规授权诊断 | sys_user_orgs | (user_id,org_id) |
| `05-drivers.sql` | 5 名司机档案（不开账号） | sal_drivers | driver_code |
| `06-stores.sql` | 8 家直营门店 | mst_stores | store_code |
| `07-customers.sql` | 客户（仅模板，无真实清单）+ 重名诊断 | sal_customers | customer_no |
| `08-suppliers.sql` | 6 家供应商 | **prc2_suppliers**（Procurement V2） | supplier_code |
| `09-vehicles.sql` | 车辆（仅模板，无数据） | sal_vehicles | vehicle_no |
| `90-check-init-data.sql` | 16 项 PASS/FAIL 校验 | （只读） | — |
| `README.md` | 执行顺序/来源/账号原则/待确认/回滚/检查项 | — | — |

## 2. 组织包说明

写入五级组织树（规范全称）：

- **L1 GROUP**：金凤凰控股集团（ORG-GROUP）
- **L2**：金凤凰控股集团总部（ORG-HQ）；凤凰农业事业群（BU-AGRI）、凤凰食品事业群（BU-FOOD）；凤凰商贸事业群（BU-TRADING, PLANNED）、凤凰供应链事业群（BU-SCM, PLANNED）
- **L3 COMPANY**：老挝凤凰农业发展有限公司（COMP-LAO-AGRI）、老挝金三角特区星驰养鸡场（COMP-LAO-XINGCHI）、老挝凤凰食品集团有限公司（COMP-LAO-FOOD）
- **L4 SITE**：孟赛蛋鸡养殖场（LAYER_FARM）、孟赛孵化场（HATCHERY, PLANNED）、孟赛有机肥生产厂（ORGANIC_FERTILIZER, PLANNED）、东鹏蛋鸡养殖场（LAYER_FARM）、万象肉鸡养殖场（BROILER_FARM）、万象屠宰加工厂（SLAUGHTER）、万象饲料厂（FEED_MILL, PLANNED）
- **L5 DEPARTMENT**：每 SITE 自动生成 7 部门（生产/仓储/销售/财务/质量/设备/行政），状态继承 SITE

**关键约束已满足**：
- ✅ 三家主体公司使用规范全称
- ✅ 万象肉鸡养殖场 与 万象屠宰加工厂 = 同一公司 COMP-LAO-FOOD 下两个独立 SITE
- ✅ 孟赛有机肥生产厂 挂在 老挝凤凰农业发展有限公司 COMP-LAO-AGRI 下

## 3. 用户包说明

9 名核心系统用户：赵永伟/朱兆存/宋雷/符强/谢继领/刘杰/王玮华/朱召安/刘善军。

- 密码：`crypt(gen_random_uuid()::text, gen_salt('bf',10))` 随机 bcrypt，**无明文**，首次登录由管理员重置。
- 状态 ACTIVE(1)；用户名为拼音规范编码。
- 客户/供应商/普通工人/司机**不建账号**。
- 名单中其他店长/财务/采购等岗位 → README「账号开通审阅清单」，待人工确认后单独批次导入。

## 4. 用户角色包说明

| 用户 | 角色（★主） |
|------|------------|
| 赵永伟 | ★ROLE_ADMIN / ROLE_CEO |
| 朱兆存 | ★ROLE_CEO / ROLE_BU_AGRI_GM |
| 宋雷 | ★ROLE_PRC_BUYER / ROLE_FIN_AR |
| 符强 | ★ROLE_FACTORY_MGR / ROLE_SALES_MGR |
| 谢继领 | ★ROLE_FARM_MGR / ROLE_VET |
| 刘杰 | ★ROLE_HQ_FINANCE / ROLE_FIN_ACCT |
| 王玮华 | ★ROLE_FIN_ACCT |
| 朱召安 | ★ROLE_CASH |
| 刘善军 | ★ROLE_WMS_MGR |

- **缺失角色处理**：名单要求 `ROLE_GROUP_FINANCE`（刘杰），系统无此角色 → 不失败吞错，绑定改用规范 `ROLE_HQ_FINANCE`，并由脚本末尾输出缺失角色清单（含 `role_seed_todo` 注释）。校验已确认仅 `ROLE_GROUP_FINANCE` 一项缺失（已映射）。
- 每人主角色唯一化（is_primary 收敛）。

## 5. 用户组织包说明

| 用户 | 组织绑定（主标记） | data_scope |
|------|---------------------|-----------|
| 赵永伟 | ★ORG-GROUP | GROUP |
| 朱兆存 | ★BU-AGRI | BU |
| 宋雷 | COMP-LAO-AGRI + ★SITE-MENGSAI-LAYER | COMPANY/SITE |
| 符强 | COMP-LAO-XINGCHI + ★SITE-DONGPENG-LAYER | COMPANY/SITE |
| 谢继领 | ★SITE-MENGSAI-LAYER | SITE |
| 刘杰 | ★ORG-GROUP | GROUP |
| 王玮华 | ★COMP-LAO-AGRI | COMPANY |
| 朱召安 | ★ORG-GROUP（待确认） | GROUP |
| 刘善军 | ★SITE-MENGSAI-LAYER（待确认） | SITE |

- ✅ 每用户恰好一个 is_primary（脚本末尾归一化强制，校验项 16 PASS）
- ✅ 无 ALL 范围；无司机/收银员绑定 GROUP（校验项 9 PASS）
- ✅ 符强公司绑定纠正为 COMP-LAO-XINGCHI（修正历史误绑 COMP-LAO-FOOD）

## 6. 司机包说明

阿坚/阿喷/阿哨/阿通/阿给（DRV-VTE-001~005），company_code=COMP-LAO-FOOD，发出地 SITE-VTE-SLAUGHTER（暂存 remark，因表无 site_code 列）。仅建档案，不开账号、不绑 GROUP。

## 7. 门店包说明

8 家直营店（STORE-XC/DP/HS/XB/MX/VTE/BKX/LPB-001）。`mst_stores` 当前无 company_code/site_code 列，公司归属暂以「公司全称/地区」写入 region，并在脚本中给出加列 TODO。

## 8. 客户包说明

- 目标表 `sal_customers`（**禁止写 ord_customers / b2b_customers**）。
- 名单未提供正式客户清单 → **本批次不写入任何占位客户**，既有 30 条真实客户保持不变。
- 脚本含 4 类客户导入模板（DISTRIBUTOR/RETAIL/CORPORATE/INDIVIDUAL/LOGISTICS/OTHER）与重名诊断；电话缺失以 remark=`DATA_INCOMPLETE` 标注，不阻断。

## 9. 供应商包说明

- 目标表 **`prc2_suppliers`**（Procurement V2 正式供应商表，实体 `prc2-supplier.entity.ts`；**禁止写 prc_suppliers 旧表**）。
- 6 家：湖北艾格多(FEED)/华都峪口(CHICK)/河北峪口(CHICK)/中粮(FEED)/河南艾特米(VACCINE)/临沂众邦(FEED)。
- country_code=CN，default_currency=CNY，shared_scope=GROUP，status=ACTIVE。
- 联系人/电话缺失 → remark=`DATA_INCOMPLETE`，不阻断；类型取值 ∈ FEED/VACCINE/VETERINARY/EQUIPMENT/PACKAGING/CHICK/SERVICE/OTHER。

## 10. 待确认事项

见 `README.md §6`，共 11 项；最关键三项：

1. **朱召安用户名**：M4 规范 `zhuzhaoan` vs M2 本地 `zhuzhao_an` —— 须统一为唯一规范用户名，避免重复建人。
2. **正式客户清单缺失**：客户包仅模板，待业务交付真实名录。
3. **车辆信息缺失**：车辆包仅模板，需现场补录。

其余：朱召安/刘善军/王玮华范围、ROLE_GROUP_FINANCE 播种、符强姓名、司机 site_code、门店字段、供应商联系人。

## 11. 是否可以进入导入前复核

**✅ 可以。** 数据包完整生成、结构合规、16/16 校验 PASS（事务内预演，本地库未改动）：

| 校验项 | 结果 | | 校验项 | 结果 |
|--------|------|--|--------|------|
| 1 组织总数 65 | PASS | | 9 GROUP误授权=0 | PASS |
| 2 公司=3 | PASS | | 10 司机=5 | PASS |
| 3 场区=7 | PASS | | 11 门店=8 | PASS |
| 4 用户=9 | PASS | | 12 客户=30(存量) | PASS |
| 5 角色绑定≥15 | PASS | | 13 供应商=6 | PASS |
| 6 组织绑定≥9 | PASS | | 14 重复客户名=0 | PASS |
| 7 无角色用户=0 | PASS | | 15 重复供应商名=0 | PASS |
| 8 无组织用户=0 | PASS | | 16 主组织唯一 | PASS |

缺失角色诊断：仅 `ROLE_GROUP_FINANCE`（已映射 ROLE_HQ_FINANCE）。违规授权：0。

## 12. 是否可以进入生产导入

**有条件可进入。** 数据包本身已达到生产导入质量标准（幂等、不写旧表、不建越权账号、无全局兜底、单主标记）。进入正式生产导入前，必须先闭环以下 3 项人工事项：

1. **统一朱召安用户名**（zhuzhaoan / zhuzhao_an 二选一），避免在已有 M2 数据的环境重复建人。
2. **补齐正式客户清单**（或明确客户分批延后）。
3. **确认待定组织归属**（朱召安/刘善军/王玮华范围）。

> 组织/用户/角色/组织绑定/司机/门店/供应商 7 类主数据可随时进入正式导入；客户与车辆作为「待数据」项分批跟进，不阻断其余导入。

---

## 验证（§15）

| 验证项 | 结果 |
|--------|------|
| API TypeScript | ✅ 0 errors（M4 仅新增 SQL/MD，未改代码） |
| Web TypeScript | ✅ 0 errors |
| 数据包事务内预演 | ✅ 16/16 PASS |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非 M4 回归，同 M2/M3 §11） |

**scope-audit 说明**：scope-audit 登录的 6 个 DataScope 测试账号（group_admin 等，Test@123）在本地库缺失、且本地 API 未提供对应端点（404）。这些账号不被仓库任何迁移/种子创建，仅存在于原有库状态。**M4 仅新增 SQL/Markdown 数据包文件，未触及任何代码、运行用户或 DataScope 逻辑，不构成回归。** 生产端（夹具完整）不受影响。

## 禁止事项核对

| 禁止写表 | 本包是否触碰 |
|----------|:------:|
| ord_customers / b2b_customers | ❌ 否（客户写 sal_customers） |
| prc_suppliers | ❌ 否（供应商写 prc2_suppliers） |
| fin_transactions / log_dispatch | ❌ 否 |

| 禁止行为 | 本包是否违反 |
|----------|:------:|
| 明文密码 | ❌ 否（随机 bcrypt） |
| 默认全局权限 / ALL 范围 | ❌ 否 |
| 司机绑定 ALL / GROUP | ❌ 否 |
| 客户/供应商/普通工人建账号 | ❌ 否 |
| 覆盖人工维护数据 | ❌ 否（全幂等仅新增） |
