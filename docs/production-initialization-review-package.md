# Phoenix ERP V3 — Production Initialization Review Package（Phase M5）

> 2026-05-31 · 金凤凰控股集团 Pilot Run 生产初始化**人工复核包**
> **本阶段不导入生产、不改业务逻辑、不开发功能/页面。** 仅输出最终导入确认表，供管理层审核。
> 审核确认后进入 **M6 Production Import**。
> 数据来源：M4 数据包 `apps/api/scripts/init-data/golden-phoenix/` + 组织 Runtime（sys_organizations）

---

## 阅读说明

- **确认列**：管理层在 `□` 中打勾确认，或在备注写修正意见。
- **待确认项**：标 ⚠️，须业务/管理层定夺后方可导入。
- **导入目标表**：组织 `sys_organizations`、用户 `sys_user`、角色 `sys_user_role`、组织范围 `sys_user_orgs`、司机 `sal_drivers`、门店 `mst_stores`、客户 `sal_customers`、供应商 `prc2_suppliers`、车辆 `sal_vehicles`。**不写任何旧表。**

---

## 1. 组织架构导入确认表

| 组织编码 | 组织名称 | 类型 | 上级组织 | 状态 | 确认 | 备注 |
|----------|----------|------|----------|------|:----:|------|
| ORG-GROUP | 金凤凰控股集团 | GROUP | — | ACTIVE | □ | 集团根节点 |
| BU-AGRI | 凤凰农业事业群 | BU | ORG-GROUP | ACTIVE | □ | |
| BU-FOOD | 凤凰食品事业群 | BU | ORG-GROUP | ACTIVE | □ | |
| BU-TRADING | 凤凰商贸事业群 | BU | ORG-GROUP | PLANNED | □ | ⚠️ 库内现名「凤凰**贸易**事业群」，需定夺「商贸/贸易」 |
| BU-SCM | 凤凰供应链事业群 | BU | ORG-GROUP | PLANNED | □ | |
| COMP-LAO-AGRI | 老挝凤凰农业发展有限公司 | COMPANY | BU-AGRI | ACTIVE | □ | 规范全称 |
| COMP-LAO-XINGCHI | 老挝金三角特区星驰养鸡场 | COMPANY | BU-AGRI | ACTIVE | □ | 规范全称 |
| COMP-LAO-FOOD | 老挝凤凰食品集团有限公司 | COMPANY | BU-FOOD | ACTIVE | □ | 规范全称 |
| SITE-MENGSAI-LAYER | 孟赛蛋鸡养殖场 | SITE | COMP-LAO-AGRI | ACTIVE | □ | LAYER_FARM |
| SITE-MENGSAI-ORGANIC | 孟赛有机肥生产厂 | SITE | COMP-LAO-AGRI | PLANNED | □ | ORGANIC_FERTILIZER；挂农业公司✅ |
| SITE-DONGPENG-LAYER | 东鹏蛋鸡养殖场 | SITE | COMP-LAO-XINGCHI | ACTIVE | □ | LAYER_FARM |
| SITE-VTE-BROILER | 万象肉鸡养殖场 | SITE | COMP-LAO-FOOD | ACTIVE | □ | BROILER_FARM |
| SITE-VTE-SLAUGHTER | 万象屠宰加工厂 | SITE | COMP-LAO-FOOD | ACTIVE | □ | SLAUGHTER；与肉鸡场同公司双SITE✅ |
| SITE-VTE-FEED | 万象饲料厂 | SITE | COMP-LAO-FOOD | PLANNED | □ | FEED_MILL |

**附加既有节点（非 M5 必列，但库中存在）**：`ORG-HQ` 金凤凰控股集团总部（DEPARTMENT/L2）、`SITE-MENGSAI-HATCHERY` 孟赛孵化场（SITE/PLANNED）、各 SITE 下 7 标准部门（DEPARTMENT，共 49）。

### 组织待确认项清单
1. ⚠️ **BU-TRADING 命名**：「凤凰商贸事业群」 vs 库内「凤凰贸易事业群」。
2. 孟赛孵化场（SITE-MENGSAI-HATCHERY）是否纳入本期组织确认（M5 主清单未列，库中已存 PLANNED）。
3. ORG-HQ 总部与各 SITE 部门（DEPARTMENT）是否一并随主数据导入或后置。

---

## 2. 正式系统用户导入确认表

| 姓名 | 用户名 | 主角色 | 附加角色 | 所属公司 | 所属场区 | 层级 | 开账号 | 参与审批 | 培训等级 | 确认 | 备注 |
|------|--------|--------|---------|---------|---------|:----:|:------:|:--------:|:------:|:----:|------|
| 赵永伟 | zhaoyongwei | ROLE_ADMIN | ROLE_CEO | 集团 | 全集团 | GROUP | ✅ | ✅ | 高级 | □ | 集团最高管理者 |
| 朱兆存 | zhuzhaocun | ROLE_CEO | ROLE_BU_AGRI_GM | 农业群 | — | BU | ✅ | ✅ | 高级 | □ | 股东；经营决策 |
| 宋雷 | songlei | ROLE_PRC_BUYER | ROLE_FIN_AR | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | SITE | ✅ | ✅ | 中级 | □ | 股东；孟赛采购+销售回款 |
| 符强 | fuqiang | ROLE_FACTORY_MGR | ROLE_SALES_MGR | COMP-LAO-XINGCHI | SITE-DONGPENG-LAYER | SITE | ✅ | ✅ | 中级 | □ | 股东；星驰负责人，生产销售经营。⚠️ 系统历史名「伏强」需核对 |
| 谢继领 | xiejiling | ROLE_FARM_MGR | ROLE_VET | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | SITE | ✅ | ✅(用药) | 中级 | □ | 孟赛场长；技术/防疫/生产统计 |
| 刘杰 | liujie | ROLE_HQ_FINANCE | ROLE_FIN_ACCT | 集团 | 财务中心 | GROUP | ✅ | ✅ | 高级 | □ | 集团财务；记账/工资/报表。⚠️ 原名单 ROLE_GROUP_FINANCE→映射 ROLE_HQ_FINANCE |
| 王玮华 | wangweihua | ROLE_FIN_ACCT | — | COMP-LAO-AGRI | 财务中心 | COMPANY | ✅ | ❌ | 中级 | □ | 财务会计 |
| 朱召安 | zhuzhaoan | ROLE_CASH | — | 集团 | 财务中心 | GROUP | ✅ | ❌ | 初级 | □ | ⚠️ 用户名 zhuzhaoan vs M2 本地 zhuzhao_an，须统一 |
| 刘善军 | liushanjun | ROLE_WMS_MGR | — | — | SITE-MENGSAI-LAYER | SITE | ✅ | ❌ | 中级 | □ | ⚠️ 仓储归属待确认（默认孟赛） |

### 账号分类与总数

| 分类 | 说明 | 人员 | 数量 |
|------|------|------|:----:|
| **A 立即开账号** | 核心管理/财务/采购/销售/仓储/场长 | 赵永伟、朱兆存、宋雷、符强、谢继领、刘杰、王玮华、朱召安、刘善军 | **9** |
| **B 建议开账号** | 店长/收银/销售员/统计/品控/包装主管（待业务确认姓名+用户名） | 名单其他拟开账号人员 | 待补（见 §账号开通审阅清单） |
| **C 暂不开账号** | 普通饲养员/包装工/装卸工/临时工/司机/收银（按需） | 阿坚等司机 + 普通工人 | — |

**本期 A 类账号总数：9。** B 类候选岗位见 M4 README「账号开通审阅清单」，须管理层确认实际人员后单独批次导入。

---

## 3. 司机档案导入确认表

| 司机编码 | 姓名 | 所属公司 | 所属场区 | 开账号 | 确认 | 备注 |
|----------|------|----------|----------|:------:|:----:|------|
| DRV-VTE-001 | 阿坚 | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | ❌ | □ | 仅建档案 |
| DRV-VTE-002 | 阿喷 | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | ❌ | □ | |
| DRV-VTE-003 | 阿哨 | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | ❌ | □ | |
| DRV-VTE-004 | 阿通 | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | ❌ | □ | |
| DRV-VTE-005 | 阿给 | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER | ❌ | □ | |

- **是否需要 Mobile Delivery**：⚠️ 待管理层决策。当前 5 名司机仅建档案、不开账号。若启用移动配送（签收/路线/超时预警），需为司机开 ROLE_DRIVER 账号并补车辆/手机号。**建议 Pilot Run 阶段先不启用，配送用纸质/线下，二期再上 Mobile Delivery。**
- 注：`sal_drivers` 无 site_code 列，场区暂存 remark（建议加列）。

---

## 4. 门店档案导入确认表

| 门店编码 | 门店名称 | 归属公司 | 归属区域 | 店长 | 开店长账号 | 确认 | 备注 |
|----------|----------|----------|----------|------|:----------:|:----:|------|
| STORE-XC-001 | 特区直营店 | COMP-LAO-XINGCHI | 金三角特区 | ⚠️待定 | □ | □ | |
| STORE-DP-001 | 东鹏直营店 | COMP-LAO-XINGCHI | 东鹏 | ⚠️待定 | □ | □ | |
| STORE-HS-001 | 会晒直营店 | COMP-LAO-XINGCHI | 会晒(博胶省) | ⚠️待定 | □ | □ | |
| STORE-XB-001 | 沙耶武里直营店 | COMP-LAO-AGRI | 沙耶武里省 | ⚠️待定 | □ | □ | |
| STORE-MX-001 | 孟赛直营店 | COMP-LAO-AGRI | 孟赛(乌多姆赛省) | ⚠️待定 | □ | □ | |
| STORE-VTE-001 | 万象直营店 | COMP-LAO-FOOD | 万象市 | ⚠️待定 | □ | □ | |
| STORE-BKX-001 | 波利坎赛直营店 | COMP-LAO-FOOD | 波利坎赛省 | ⚠️待定 | □ | □ | |
| STORE-LPB-001 | 拉邦直营店 | COMP-LAO-AGRI | 琅勃拉邦省 | ⚠️待定 | □ | □ | |

- **门店归属确认**：8 店归属公司已按区域映射（特区/东鹏/会晒→星驰；沙耶武里/孟赛/拉邦→农业；万象/波利坎赛→食品），请管理层核对。
- ⚠️ **店长信息缺失**：8 店均无店长姓名，需业务补充后决定是否开 ROLE_STORE_MGR 账号（B 类）。
- 注：`mst_stores` 无 company_code/site_code 列，归属暂存 region（建议加列）。

---

## 5. 客户档案导入确认表

| 客户编码 | 客户名称 | 类型 | 联系人 | 电话 | 区域 | 状态 | 确认 | 备注 |
|----------|----------|------|--------|------|------|------|:----:|------|
| — | — | — | — | — | — | — | — | ⚠️ **名单未提供正式客户清单，本期无客户可确认** |

### 客户分类结构（待真实数据填入）

| 类型 | 编码前缀 | 说明 |
|------|---------|------|
| 经销商 DISTRIBUTOR | CUS-DIST-* | 各区域经销商 |
| 企业客户 CORPORATE | CUS-CORP-* | 企业/单位客户 |
| 零售客户 RETAIL | CUS-RTL-* | 散客/门店零售 |
| 物流客户 LOGISTICS | CUS-LOG-* | 配送/物流方 |
| 其他 OTHER | CUS-OTH-* | |

- **重复客户清单**：无（本期无真实客户写入）。既有 30 条 demo 客户（实表）经检查无重名、无重复电话。
- **待确认客户清单**：⚠️ **全部待补充** —— 须业务交付经销商/企业/零售/物流客户名录（姓名、联系人、电话、区域、归属公司）。客户为 C 类阻断项之一（无数据）。
- 导入目标 `sal_customers`，**禁止写 ord_customers / b2b_customers**，客户不建系统账号。

---

## 6. 供应商档案导入确认表

| 供应商编码 | 供应商名称 | 类型 | 联系人 | 电话 | 状态 | 确认 | 备注 |
|------------|------------|------|:------:|:----:|------|:----:|------|
| SUP-HBAGD-001 | 湖北艾格多 | 饲料 FEED | ⚠️空 | ⚠️空 | ACTIVE | □ | 饲料/添加剂 |
| SUP-HDYK-001 | 华都峪口 | 雏鸡 CHICK | ⚠️空 | ⚠️空 | ACTIVE | □ | 种鸡/雏鸡 |
| SUP-HBYK-001 | 河北峪口 | 雏鸡 CHICK | ⚠️空 | ⚠️空 | ACTIVE | □ | 种鸡/雏鸡 |
| SUP-COFCO-001 | 中粮 | 饲料 FEED | ⚠️空 | ⚠️空 | ACTIVE | □ | 饲料原料 |
| SUP-HNATM-001 | 河南艾特米 | 疫苗 VACCINE | ⚠️空 | ⚠️空 | ACTIVE | □ | 兽药/疫苗 |
| SUP-LYZB-001 | 临沂众邦 | 饲料 FEED | ⚠️空 | ⚠️空 | ACTIVE | □ | 饲料/物料 |

- **重复供应商清单**：无（编码与名称均唯一）。
- ⚠️ **联系人/电话全部缺失**（remark 标 DATA_INCOMPLETE），不阻断导入，建议业务补充。
- 类型字典：饲料 FEED / 兽药 VETERINARY / 疫苗 VACCINE / 设备 EQUIPMENT / 包材 PACKAGING / 雏鸡 CHICK / 服务 SERVICE / 其他 OTHER。
- 导入目标 **`prc2_suppliers`（Procurement V2）**，**禁止写 prc_suppliers 旧表**。
- ⚠️ **遗留提示**：M2 曾将这 6 家写入旧表 `prc_suppliers`，M4/M6 统一改用 `prc2_suppliers`，旧表数据须在 M6 前清理或忽略（避免双源）。

---

## 7. 车辆档案导入确认表

| 车辆编码 | 车牌号 | 司机 | 归属场区 | 状态 | 确认 |
|----------|--------|------|----------|------|:----:|
| — | — | — | — | — | — |

- ⚠️ **车辆信息缺失**：名单未提供车牌/车型/载重/归属。**列入待补录清单**，现场补录后单独导入 `sal_vehicles`。
- 与 Mobile Delivery 决策联动：若不启用移动配送，车辆可后置。

---

## 8. 角色组织范围确认表

| 姓名 | 角色 | 组织层级 | 组织范围 | 审批权限 | 确认 | 业务匹配 |
|------|------|:--------:|----------|:--------:|:----:|---------|
| 赵永伟 | ROLE_ADMIN+ROLE_CEO | GROUP | ★ORG-GROUP（全集团） | ✅ | □ | 集团统管 ✅ |
| 朱兆存 | ROLE_CEO+ROLE_BU_AGRI_GM | BU | ★BU-AGRI（农业群） | ✅ | □ | 农业群经营 ✅ |
| **宋雷** | ROLE_PRC_BUYER+ROLE_FIN_AR | SITE | COMP-LAO-AGRI + ★SITE-MENGSAI-LAYER | ✅ | □ | 孟赛采购+销售回款，场区级范围 ✅ |
| **符强** | ROLE_FACTORY_MGR+ROLE_SALES_MGR | SITE | COMP-LAO-XINGCHI + ★SITE-DONGPENG-LAYER | ✅ | □ | 星驰/东鹏生产销售经营 ✅（公司绑定已纠正） |
| **谢继领** | ROLE_FARM_MGR+ROLE_VET | SITE | ★SITE-MENGSAI-LAYER | ✅(用药) | □ | 孟赛场长+技术防疫 ✅ |
| **刘杰** | ROLE_HQ_FINANCE+ROLE_FIN_ACCT | GROUP | ★ORG-GROUP（集团财务） | ✅ | □ | 集团记账/工资/报表，集团级 ✅ |
| 王玮华 | ROLE_FIN_ACCT | COMPANY | ★COMP-LAO-AGRI | ❌ | □ | 公司财务会计 ✅ |
| 朱召安 | ROLE_CASH | GROUP | ★ORG-GROUP | ❌ | □ | 出纳；范围待确认 |
| 刘善军 | ROLE_WMS_MGR | SITE | ★SITE-MENGSAI-LAYER | ❌ | □ | 仓储；归属待确认 |

**重点 4 人业务匹配检查**：
- **宋雷**：采购+销售回款双职 → ROLE_PRC_BUYER(主)+ROLE_FIN_AR，场区范围 SITE-MENGSAI-LAYER。✅ 匹配。
- **符强**：星驰负责人，生产销售经营 → ROLE_FACTORY_MGR(主)+ROLE_SALES_MGR，COMP-LAO-XINGCHI+东鹏。✅ 匹配（已纠正历史误绑食品集团）。
- **谢继领**：场长+技术+防疫 → ROLE_FARM_MGR(主)+ROLE_VET（用药审批），SITE-MENGSAI-LAYER。✅ 匹配。
- **刘杰**：集团财务，各公司记账/工资/报表 → ROLE_HQ_FINANCE(主)+ROLE_FIN_ACCT，集团范围。✅ 匹配（原 ROLE_GROUP_FINANCE 已映射规范角色）。

**约束已满足**：每人恰好 1 个主组织；无 ALL 范围；无司机/收银员绑 GROUP。

---

## 9. 导入风险清单

### 🟢 A 类 — 可直接导入

- 组织树（14 主体 + 既有部门，结构完整、规范全称、归属正确）
- 9 名核心系统用户（随机 bcrypt 密码、角色/组织绑定齐全、主标记唯一）
- 角色绑定 + 组织范围（重点 4 人业务匹配）
- 司机 5 名（仅档案）
- 门店 8 家（归属已映射）
- 供应商 6 家（编码/名称唯一）

### 🟡 B 类 — 建议修正后导入

| # | 项 | 建议 |
|---|----|------|
| B1 | 朱召安用户名 zhuzhaoan / zhuzhao_an | **导入前必须二选一**，避免重复建人 |
| B2 | BU-TRADING「商贸/贸易」命名 | 管理层定夺统一 |
| B3 | 符强姓名 符强/伏强 | 核对后更正 real_name |
| B4 | 供应商联系人/电话缺失 | 业务补充（不阻断） |
| B5 | 门店店长信息缺失 | 补充后决定开店长账号 |
| B6 | 旧表 prc_suppliers 遗留 6 行 | M6 前清理，统一用 prc2_suppliers |
| B7 | 表字段缺口（司机 site_code/门店 company_code/供应商 supplier_type 已在 prc2） | schema 迭代加列（不阻断） |

### 🔴 C 类 — 禁止导入（无数据）

| # | 项 | 原因 |
|---|----|------|
| C1 | 正式客户清单 | 名单未提供，无真实数据 |
| C2 | 车辆档案 | 信息缺失，待现场补录 |

---

## 10. 正式导入建议

1. **先闭环 B1**（朱召安用户名）—— 唯一会导致重复建人的硬阻断，必须定夺。
2. **A 类 7 类主数据按 M4 数据包顺序导入**：组织→用户→角色→组织范围→司机→门店→供应商。
3. **B2/B3 命名修正**随导入一并处理（组织名/姓名）。
4. **客户（C1）与车辆（C2）分批延后**，待业务/现场补数据后单独导入，不阻断主数据。
5. **旧表清理（B6）**：M6 前确认 prc_suppliers 6 行作废，统一 prc2_suppliers。
6. **Mobile Delivery 决策**：建议 Pilot Run 不启用，司机仅建档案。

---

## 11. 最终判断

### 是否达到 Production Import 条件？

**有条件达到。** 7 类主数据（组织/用户/角色/组织范围/司机/门店/供应商）结构合规、校验通过（M4 16/16 PASS）、不写旧表、无越权账号，**可进入正式导入**；前置硬条件为 **B1 朱召安用户名定夺**。客户/车辆作为「待数据」分批跟进，不阻断。

### 是否达到 Pilot Run 条件？

**基本达到。** 核心组织、9 名系统用户、角色与数据范围、司机/门店/供应商档案齐备，足以支撑 Pilot Run 的「组织+人员+采购+门店」闭环。**销售/配送闭环受「客户清单缺失」限制** —— Pilot Run 初期可先跑采购、库存、生产、财务记账；销售待客户名录补齐后接入。

### 还缺哪些业务信息？

| 优先级 | 缺失信息 | 影响 |
|:------:|----------|------|
| 🔴 高 | 朱召安用户名统一决策 | 阻断用户导入 |
| 🔴 高 | 正式客户名录（经销商/企业/零售/物流） | 阻断销售闭环 |
| 🟡 中 | 门店店长姓名 | 影响店长账号开通 |
| 🟡 中 | 供应商联系人/电话 | 采购联络不全 |
| 🟡 中 | 车辆信息（车牌/车型/归属） | 影响配送/Mobile Delivery |
| 🟢 低 | BU-TRADING 命名、符强姓名核对 | 数据规范性 |

---

## 12. 验证（§12）

| 验证项 | 结果 | 说明 |
|--------|------|------|
| API TypeScript | ✅ 0 errors | M5 仅新增文档 |
| Web TypeScript | ✅ 0 errors | 同上 |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，非 M5 回归） | 见下 |

**scope-audit 说明**：登录的 6 个 DataScope 测试账号（group_admin 等，Test@123）在本地库缺失、本地 API 端点 404；这些账号不被仓库任何迁移/种子创建，仅存在于原有库状态。**M5 仅新增 Markdown 文档，未触及任何代码、用户或 DataScope 逻辑，不构成回归。** 生产端（夹具完整）不受影响。建议作为独立测试基建修复项：将 6 账号种子纳入仓库、统一测试密码（Test@123 vs seed-uat 的 Test@1234）。

---

## 验收对照

| 验收标准 | 达成 |
|----------|:----:|
| 所有初始化数据形成最终确认表 | ✅ 8 类确认表 |
| 用户/客户/供应商/门店/司机完全分离 | ✅ 各独立表与确认表 |
| 组织归属清晰 | ✅ 14 主体 + 上下级 |
| 角色归属清晰 | ✅ §8 角色范围表 |
| 达到正式导入前人工审核条件 | ✅ 待管理层勾选确认 |
