# Phoenix ERP V3 — Finance Responsibility Matrix（财务责任矩阵）

> 2026-06-02 · 集团财务中心岗位责任与数据范围对照表。
> 权限模型：**岗位权限 + DataScope（公司/场区）+ ShareholderScope（项目）**，缺一不可。

---

## 责任矩阵

| 岗位 | 人员 | 负责公司 | 负责场区/项目 | 查看 | 审核 | 付款 | 分析 | 备注 |
|------|------|---------|--------------|:----:|:----:|:----:|:----:|------|
| 财务审核经理<br>ROLE_FINANCE_REVIEW_MANAGER | 刘杰 | COMP-LAO-AGRI<br>COMP-LAO-XINGCHI<br>COMP-LAO-FOOD | 三公司全部场区 | ✅ | ✅ | ❌ | ✅ | 审核人，非付款人；凭证/入库/收款/费用/工资/往来/成本/利润审核 |
| 资金经理<br>ROLE_TREASURY_MANAGER | 王玮华 | COMP-LAO-AGRI | SITE-MENGSAI-LAYER<br>(孟赛) | 孟赛 | ❌ | ✅ | ❌ | 付款人；孟赛付款/银行/收款/资金日报；**禁东鹏、禁万象** |
| 资金专员<br>ROLE_TREASURY_MANAGER | 朱召安 | COMP-LAO-XINGCHI | SITE-DONGPENG-LAYER<br>(东鹏) | 东鹏 | ❌ | ✅ | ❌ | 付款人；东鹏收付款/资金日报；**禁孟赛、禁万象** |
| 财务分析经理 + 成本核算经理<br>ROLE_FINANCE_ANALYST<br>+ ROLE_COST_ACCOUNTING_MANAGER | 刘汉涛 | （三公司，对应其三项目）| SHR-DONGPENG-LAYER<br>SHR-MENGSAI-LAYER<br>SHR-VTE-FOOD | ✅ | ❌ | ❌ | ✅ | 分析核算人，非审核非付款；成本/利润核算、经营/股东投资分析、资本流录入；**ShareholderScope 按项目控制** |

## 数据范围说明

- **DataScope（公司级）**：财务表(fin_*)仅含 `company_code` 维度。用户绑定 COMPANY 组织 → `resolve()` 解析出 `allowedCompanyCodes` → 财务查询 `WHERE company_code = ANY(...)`。
  - 王玮华=`[COMP-LAO-AGRI]`，朱召安=`[COMP-LAO-XINGCHI]`，刘杰/刘汉涛=三公司。
- **ShareholderScope（项目级）**：股东驾驶舱/资本流/项目收益按 `shr_shareholder_scopes.project_code` 控制。
  - 刘汉涛=`[SHR-DONGPENG-LAYER, SHR-MENGSAI-LAYER, SHR-VTE-FOOD]`。

## 公司—场区—项目对应

| 公司 | 公司名 | 场区 | 股东项目 |
|------|--------|------|---------|
| COMP-LAO-AGRI | 老挝凤凰农业发展有限公司 | SITE-MENGSAI-LAYER 孟赛蛋鸡场 | SHR-MENGSAI-LAYER |
| COMP-LAO-XINGCHI | 老挝金三角特区星驰养鸡场 | SITE-DONGPENG-LAYER 东鹏蛋鸡场 | SHR-DONGPENG-LAYER |
| COMP-LAO-FOOD | 老挝凤凰食品集团有限公司 | SITE-VTE-* 万象 | SHR-VTE-FOOD |

## 职责分离矩阵（同一笔费用报销）

| 环节 | 岗位 | 人员 | 权限 |
|------|------|------|------|
| 申请 | 业务岗 | 场长/部门 | C |
| 业务审批 | 业务负责人(ORG_MANAGER) | 动态 | A |
| 财务审核 | 财务审核经理 | 刘杰 | A（审核，无付款）|
| 付款执行 | 资金经理 | 王玮华/朱召安 | E（付款，无审核）|

**审核人 ≠ 付款人**：刘杰审不碰钱，王玮华/朱召安付不审单。
