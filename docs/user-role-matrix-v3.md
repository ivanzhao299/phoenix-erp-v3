# 金凤凰控股集团 — 正式用户角色矩阵 V3

> Phase M2 · 2026-05-31 · 数据源：`金凤凰ERP正式用户角色矩阵V2.xlsx` + 系统组织 Runtime（sys_organizations）+ 角色矩阵（sys_role / rbac.matrix.ts）+ 现有 sys_user
> 本文件为**正式初始化标准数据**，非直接导入；导入见 `scripts/init-master-data-m2.sql`。

---

## 一、组织结构（含系统编码）

```
金凤凰控股集团  ORG-GROUP
├── 凤凰农业事业群  BU-AGRI
│   ├── 老挝凤凰农业发展有限公司  COMP-LAO-AGRI
│   │   ├── 孟赛蛋鸡养殖场     SITE-MENGSAI-LAYER
│   │   ├── 孟赛孵化场         SITE-MENGSAI-HATCHERY
│   │   └── 孟赛有机肥生产厂   SITE-MENGSAI-ORGANIC
│   └── 老挝金三角特区星驰养鸡场  COMP-LAO-XINGCHI
│       └── 东鹏蛋鸡养殖场     SITE-DONGPENG-LAYER
└── 凤凰食品事业群  BU-FOOD
    └── 老挝凤凰食品集团有限公司  COMP-LAO-FOOD
        ├── 万象肉鸡养殖场     SITE-VTE-BROILER
        ├── 万象屠宰加工厂     SITE-VTE-SLAUGHTER
        └── 万象饲料厂         SITE-VTE-FEED
```

---

## 二、正式用户角色矩阵 V3（核心 10 人）

| # | 姓名 | 用户名 | 主角色 | 附加角色 | 所属公司 | 所属场区/单位 | 组织层级 | 是否开账号 | 是否参与审批 | 培训等级 | 备注 |
|---|------|--------|--------|---------|---------|------------|---------|:--------:|:----------:|:------:|------|
| 1 | 赵永伟 | zhaoyongwei | ROLE_ADMIN | ROLE_CEO | ORG-GROUP | 全集团 | GROUP | ✅ 是 | ✅ 是 | 高级 | 集团最高管理者；已有账号 |
| 2 | 朱兆存 | zhuzhaocun | ROLE_CEO | ROLE_BU_AGRI_GM | BU-AGRI | 农业事业群 | BU | ✅ 是 | ✅ 是 | 高级 | 股东；经营决策；已有账号 |
| 3 | 宋雷 | songlei | ROLE_PRC_BUYER | ROLE_FIN_AR | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | COMPANY/SITE | ✅ 是 | ✅ 是 | 中级 | 采购负责人 + 销售回款负责人；股东；**新建账号** |
| 4 | 符强 | fuqiang | ROLE_FACTORY_MGR | ROLE_SALES_MGR | COMP-LAO-XINGCHI | SITE-DONGPENG-LAYER | SITE | ✅ 是 | ✅ 是 | 中级 | 东鹏场区全面负责人；股东；已有账号（系统姓名「伏强」需核对） |
| 5 | 谢继领 | xiejiling | ROLE_FARM_MGR | ROLE_VET | COMP-LAO-AGRI | SITE-MENGSAI-LAYER | SITE | ✅ 是 | ✅ 是（用药审批） | 中级 | 场长 + 技术 + 防疫负责人；**新建账号** |
| 6 | 刘杰 | liujie | ROLE_HQ_FINANCE | ROLE_FIN_ACCT | ORG-GROUP | 财务中心 | GROUP/COMPANY | ✅ 是 | ✅ 是 | 高级 | 集团财务负责人；**新建账号**（原表 ROLE_GROUP_FINANCE 已并入 ROLE_HQ_FINANCE） |
| 7 | 王玮华 | wangweihua | ROLE_FIN_ACCT | — | ORG-GROUP | 财务中心 | COMPANY | ✅ 是 | ❌ 否 | 中级 | 财务会计（应收应付）；已有账号 |
| 8 | 朱召安 | zhuzhao_an | ROLE_CASH | — | ORG-GROUP | 财务中心 | COMPANY | ✅ 是 | ❌ 否 | 初级 | 出纳（资金账户）；已有账号；**ROLE_CASH 系统暂无，init 幂等创建** |
| 9 | 刘善军 | liushanjun | ROLE_WMS_MGR | — | ORG-GROUP | 仓储中心 | SITE | ✅ 是 | ❌ 否 | 中级 | 仓储负责人；已有账号 |
| 10 | 阿坚 | ajian | ROLE_DRIVER | — | COMP-LAO-FOOD | SITE-VTE-SLAUGHTER（配送发出地） | SITE | ❌ 否（司机档案） | ❌ 否 | 初级 | 配送司机；按司机原则暂不开账号（现有 ajian 账号系试运行遗留，建议保留观察） |

> 字段说明：
> - **主角色**：用户登录后的默认/主要角色（决定主 Sidebar 与默认 DataScope）。
> - **附加角色**：叠加权限（如 ROLE_FIN_AR / ROLE_VET）。
> - **组织层级**：GROUP > BU > COMPANY > SITE。
> - **是否参与审批**：是否作为内置审批链的审批节点（持 MENU_WORKFLOW 'A'）。

### 角色映射修正说明
| 原表角色 | V3 修正 | 原因 |
|---------|---------|------|
| ROLE_GROUP_FINANCE | **ROLE_HQ_FINANCE** | C-4.3 治理已将 GROUP_FINANCE 合并入 HQ_FINANCE（canonical） |
| ROLE_CASH | **ROLE_CASH（待创建）** | 系统暂无「出纳」角色，init 脚本幂等创建 |

---

## 三、待补充人员类别（来自 V2「待补充人员」）

| 类别 | 建议角色 | 账号分类 | 说明 |
|------|---------|:------:|------|
| 直营店店长 | ROLE_STORE_MGR | A 类 | 各直营店负责人（8 店见 stores-init） |
| 收银员 | ROLE_CASHIER | A 类 | 各直营店收银 |
| 销售员 | ROLE_SALES_REP | A 类 | 区域销售 |
| 包装主管 | ROLE_PKG_MGR | B 类 | 包装车间负责人 |
| 包装员 | ROLE_PKG_OP | C 类 | 包装操作人员 |
| 品控主管 | ROLE_QA_MGR | B 类 | 质量负责人 |
| 品控员 | ROLE_QA_STAFF | B 类 | 质量检查人员 |
| 司机 | ROLE_DRIVER | C 类（建司机档案，不开账号） | 配送司机（5 人见 drivers-init） |

---

## 四、账号开通原则（A/B/C 分类）

| 分类 | 处理 | 涵盖岗位 | 本期人员 |
|------|------|---------|---------|
| **A 类** | **必须开账号** | 集团管理层、财务、采购、销售、仓储、场长、店长 | 赵永伟、朱兆存、宋雷、符强、谢继领、刘杰、王玮华、朱召安、刘善军 + 待补充店长 |
| **B 类** | **建议开账号** | 统计员、防疫员、包装主管、品控主管 | 谢继领（已含 ROLE_VET，归 A）；其余待补充 |
| **C 类** | **暂不开账号** | 普通饲养员、包装工、装卸工、临时工、**司机** | 阿坚等 5 名司机（建司机档案） |

---

## 五、组织绑定（sys_user_orgs，供 DataScope）

| 用户名 | org_code | data_scope_level |
|--------|----------|------------------|
| zhaoyongwei | ORG-GROUP | GROUP |
| zhuzhaocun | BU-AGRI | BU |
| songlei | SITE-MENGSAI-LAYER | SITE |
| fuqiang | SITE-DONGPENG-LAYER | SITE |
| xiejiling | SITE-MENGSAI-LAYER | SITE |
| liujie | ORG-GROUP | GROUP |
| wangweihua | ORG-GROUP | GROUP |
| zhuzhao_an | ORG-GROUP | GROUP |
| liushanjun | ORG-GROUP | GROUP |
| ajian | SITE-VTE-SLAUGHTER | SITE |

> 注：财务/出纳（王玮华/朱召安）按集团财务中心归 GROUP 范围；如需收敛到 COMPANY，后续业务确认。
</content>
