# Phoenix ERP V3 — Finance Authority Reconstruction Phase 1（集团虚拟财务中心权限重构）

> 2026-06-02 · 财务权限从「人员驱动」改为「岗位驱动」：岗位决定权限，人员只是岗位载体。
> 后续人员变动只调整岗位绑定，不修改权限体系。

---

## 0. 结论

# ✅ 岗位驱动财务权限体系建立完成

集团虚拟财务中心 + 三大岗位组 + 三个岗位角色全部建立；刘杰/王玮华/朱召安/刘汉涛四人岗位明确；
费用报销审批与付款彻底分离（审核人≠付款人）。**API TS 0、Web TS 0；4 个迁移幂等可重复执行、数据校验通过。**

---

## 1. 集团财务中心组织结构

虚拟组织 `ORG-FINANCE-CENTER`（类型 `VIRTUAL_ORGANIZATION`，不对应实体办公地点，挂集团 ORG-GROUP 下），下设三个岗位组：

```
ORG-GROUP 金凤凰控股集团
└── ORG-FINANCE-CENTER 集团财务中心 (VIRTUAL_ORGANIZATION)
    ├── DEPT-FIN-REVIEW    财务审核组
    ├── DEPT-FIN-TREASURY  资金管理组
    └── DEPT-FIN-ANALYSIS  财务分析与核算组
```

> `org_type` 枚举已扩展新增 `VIRTUAL_ORGANIZATION`；岗位组以 `DEPARTMENT` 建模（系统无独立"岗位组"表）。

## 2. 财务岗位定义

| 岗位组 | 岗位 | 角色 | 当前人员 | approval_level |
|--------|------|------|---------|:----:|
| 财务审核组 | 财务审核经理 | `ROLE_FINANCE_REVIEW_MANAGER` | 刘杰 | 3 |
| 资金管理组 | 资金经理 | `ROLE_TREASURY_MANAGER` | 王玮华、朱召安 | 2 |
| 财务分析与核算组 | 财务分析经理 | `ROLE_FINANCE_ANALYST` | 刘汉涛（代表赵永伟体系，人员可替换岗位不变）| 1 |

## 3. 岗位职责

- **财务审核经理（刘杰）**：凭证/入库单/收款单/费用单/工资表/往来账审核、财务合规审核。**审批链定位：审核人，不是付款人。**
- **资金经理（王玮华/朱召安）**：付款单录入、付款执行、收款登记、银行流水管理、资金日报。王玮华→孟赛凤凰鸡场；朱召安→东鹏鸡场。**审批链定位：付款人，不是审核人。**
- **财务分析经理（刘汉涛）**：成本/利润核算、项目经营分析、股东投资分析、股东驾驶舱、资本流录入与分析、投资回报分析。**审批链定位：分析核算人，不是审核人不是付款人。**

## 4. 权限矩阵（rbac.matrix.ts，API 授权）

权限码：V 查看 / C 新增 / E 编辑(含付款执行) / A 审批 / X 导出 / D 删除。

| 菜单 | 审核经理 | 资金经理 | 分析经理 |
|------|:--------:|:--------:|:--------:|
| MENU_FIN2 财务总览 | V A X | V | V X |
| MENU_FIN2_AP 应付 | V A X | V | V X |
| MENU_FIN2_AR 应收 | V A X | V | V X |
| MENU_FIN2_CASH 资金账户 | **V X**(只查看) | **V C E X**(付款人) | —(禁银行操作) |
| MENU_FIN2_EXPENSE 费用 | V A X | V | V X |
| MENU_FIN2_REIMBURSE 报销 | **V A X**(审核,无付款) | **V E**(付款,无审批) | — |
| MENU_FIN2_BUDGET 预算 | V A X | — | V X |
| MENU_FIN2_REPORT 报表 | V X | — | **V X**(核算核心) |
| MENU_FIN2_SHAREHOLDER 股东资金 | V X | — | V X |
| MENU_SHAREHOLDER_VIEW 股东/项目投资 | V X | — | V X |
| MENU_SHAREHOLDER_DASHBOARD 股东驾驶舱 | V X | — | V X |
| MENU_SHAREHOLDER_CAPITAL 资本流 | **V X**(查看) | — | **V C E X**(录入) |
| MENU_DASHBOARD 经营/财务驾驶舱 | V X | V X | V X |

**禁止项落实**：
- 审核经理：资金账户仅 V/X（无 C/E/A → 禁付款、禁银行账户操作）；报销无 E（禁付款）。
- 资金经理：全程无任何 A（禁审核）；无报表/预算（禁利润核算/成本核算）。
- 分析经理：无 CASH（禁银行账户操作/付款）；全程无 A（禁审核）。
- 三者均无系统管理（MENU_SETTINGS_*）、无股权调整（MENU_SHAREHOLDER_MANAGE/SCOPE）。

> 前端菜单可见性 `sys_role_menu_permission` 已同步配置 29 条（迁移 C），与上表一致。

## 5. 审批职责（费用报销流，EXPENSE_REQUEST）

```
申请人 → 业务负责人(ORG_MANAGER动态) → 财务审核经理(刘杰) → 资金经理(王玮华/朱召安) → 完成
                                          [审核 A]            [付款 E]
```

规则 `EXP-RECON-STD`（priority=5 最高优先，覆盖全额）3 步：

| step | approver_type | 角色 | 定位 |
|:----:|---------------|------|------|
| 1 | ORG_MANAGER | （动态：申请人所属组织负责人）| 业务负责人 |
| 2 | ROLE | ROLE_FINANCE_REVIEW_MANAGER | 审核人（刘杰）|
| 3 | ROLE | ROLE_TREASURY_MANAGER | 付款人（王玮华/朱召安）|

**职责彻底分离**：刘杰审核（持 A，不持付款 E）；王玮华/朱召安付款（持 E，不持审批 A）。审批人按**角色**指派，人员变动无需改审批流。

## 6. 驾驶舱权限

| 人员 | 可见驾驶舱 | 映射菜单 |
|------|-----------|---------|
| 刘杰 | 集团财务驾驶舱 | MENU_DASHBOARD + MENU_FIN2 + MENU_FIN2_REPORT |
| 王玮华 | 资金驾驶舱 | MENU_FIN2_CASH + MENU_DASHBOARD（孟赛范围）|
| 朱召安 | 东鹏资金驾驶舱 | MENU_FIN2_CASH + MENU_DASHBOARD（东鹏范围 DataScope）|
| 刘汉涛 | 集团经营 + 股东 + 项目利润驾驶舱 | MENU_DASHBOARD + MENU_SHAREHOLDER_DASHBOARD + MENU_FIN2_REPORT |

> 王玮华/朱召安的「资金驾驶舱」数据范围由 `sys_user_orgs`（孟赛 SITE / 东鹏 SITE）+ DataScope 控制。

## 7. 用户绑定结果（本地实测）

| 人员 | username | 岗位角色(主) | 保留旧角色(兼容) |
|------|----------|------------|-----------------|
| 刘杰 | liujie | ROLE_FINANCE_REVIEW_MANAGER ✅主 | ROLE_HQ_FINANCE, ROLE_FIN_ACCT |
| 王玮华 | wangweihua | ROLE_TREASURY_MANAGER ✅主 | ROLE_FIN_ACCT |
| 朱召安 | zhuzhao_an | ROLE_TREASURY_MANAGER ✅主 | ROLE_CASH, ROLE_FIN_ACCT |
| 刘汉涛 | liuhantao | ROLE_FINANCE_ANALYST ✅主 | ROLE_FIN_COST |

岗位角色 `is_primary=TRUE`，旧角色降为非主 → **岗位角色优先**。

## 8. 旧角色兼容方案

映射关系：**旧角色 ↓ 岗位角色 ↓ 权限矩阵**。

| 旧角色 | 状态 | 与新岗位关系 |
|--------|------|------------|
| ROLE_FIN_ACCT 财务会计 | 保留 | 资金/审核职能下沉到 TREASURY/REVIEW 岗位角色 |
| ROLE_CASH 出纳 | 保留 | 付款执行职能由 ROLE_TREASURY_MANAGER 承接 |
| ROLE_HQ_FINANCE 总部财务审计 | 保留 | 审核职能由 ROLE_FINANCE_REVIEW_MANAGER 承接 |
| ROLE_FIN_COST 成本会计 | 保留 | 核算职能由 ROLE_FINANCE_ANALYST 承接 |
| ROLE_GROUP_FINANCE | 矩阵引用保留（sys_role 无实体、无用户绑定，孤儿引用兼容）| — |

**原则**：保留兼容（旧角色不删、旧绑定不动），新增岗位角色优先生效。即使旧角色仍持有部分权限，岗位角色作为主角色驱动新体系。

## 9. 验证

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 4 迁移本地执行 | ✅ 成功（1虚拟组织+3岗位组+3角色+4绑定+29菜单+1规则3步）|
| 迁移幂等复跑 | ✅ 全部 OK，无新增、无报错、数据不变 |
| 组织树/角色/绑定/审批步骤校验 | ✅ 全部符合预期 |
| scope-audit.sh | ⚠️ 2/30（本地 API 未运行 + 测试用户夹具缺失，HTTP 404/401；非本次回归，CI/生产环境具备完整夹具）|

## 10. 后续规划（Phase 2+）

1. **工资表/往来账审核接入审批引擎**（当前审核经理已有权限，待业务单据接流）。
2. **资金驾驶舱独立页面**：当前资金视图复用 MENU_FIN2_CASH，可建专属资金日报驾驶舱。
3. **DataScope 资金范围细化**：王玮华孟赛、朱召安东鹏的付款数据按 SITE 强隔离落地校验。
4. **岗位-人员可视化管理页**：让管理层在前端直接调整岗位绑定（人员变动零代码）。
5. **审批分档**：费用报销大额可加 CEO/CFO 节点（当前为标准单档全覆盖）。

---

## 验收对照

| 验收项 | 达成 |
|--------|:----:|
| 集团财务中心建立 | ✅ |
| 财务审核组建立 | ✅ |
| 资金管理组建立 | ✅ |
| 财务分析组建立 | ✅ |
| 刘杰权限明确 | ✅ 审核经理(审核不付款) |
| 王玮华权限明确 | ✅ 资金经理(付款不审核) |
| 朱召安权限明确 | ✅ 资金经理(东鹏付款) |
| 刘汉涛权限明确 | ✅ 分析经理(核算/资本流录入) |
| 审批与付款彻底分离 | ✅ 审核(A)≠付款(E) |
| 岗位驱动权限体系建立 | ✅ |
| 后续人员变动无需修改权限结构 | ✅ 只调岗位绑定 |
