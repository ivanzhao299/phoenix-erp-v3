# Golden Phoenix · 生产初始化数据包（Production Initialization Package）

> 金凤凰控股集团 Pilot Run 初始化数据包 · Phase M4 · 2026-05-31
> **本数据包用于审阅与受控执行，当前阶段不直接导入生产库。**
> 所有脚本幂等、可单独执行、可按顺序执行、不写旧表、不使用明文密码。

---

## 1. 初始化包说明

把 Pilot Run 所需的**组织 / 用户 / 角色 / 用户组织关系 / 司机 / 门店 / 客户 / 供应商 / 车辆**，整理为「可审阅、可验证、可重复执行」的标准 SQL 数据包。每个 SQL 均：

- 幂等：`INSERT ... ON CONFLICT DO NOTHING` 或 `WHERE NOT EXISTS`
- 不覆盖人工已修改数据
- 不写旧表（见 §禁止事项）
- 不使用明文密码

## 2. 执行顺序

```bash
psql -d <db> -f 99-reconcile-zhuzhaoan.sql  # 仅 M2 遗留环境：zhuzhao_an→zhuzhaoan 收敛（全新库为 no-op）
psql -d <db> -f 01-organizations.sql   # 组织树 GROUP/BU/COMPANY/SITE/DEPARTMENT
psql -d <db> -f 02-users.sql           # 系统用户（随机 bcrypt 密码）
psql -d <db> -f 03-user-roles.sql      # 用户角色绑定（含缺失角色诊断）
psql -d <db> -f 04-user-orgs.sql       # 用户组织范围（DataScope，单主标记）
psql -d <db> -f 05-drivers.sql         # 司机档案（不开账号）
psql -d <db> -f 06-stores.sql          # 直营门店
psql -d <db> -f 07-customers.sql       # 客户（当前仅模板，无真实清单）
psql -d <db> -f 08-suppliers.sql       # 供应商（prc2_suppliers）
psql -d <db> -f 09-vehicles.sql        # 车辆（当前无数据，仅模板）
psql -d <db> -f 90-check-init-data.sql # 校验 PASS/FAIL（只读）
```

> 顺序要求：`01 → 02 → 03 → 04` 有依赖（角色/组织绑定需用户与组织先在册）。05~09 相互独立。

## 3. 数据来源

| 来源 | 用途 |
|------|------|
| 名单.xlsx | 用户、司机、客户、供应商原始名录 |
| 金凤凰ERP用户角色清单.xlsx | 用户-角色矩阵 |
| 已确认组织架构 | 集团/事业群/公司/场区树 |
| 用户补充信息 | 宋雷/符强/谢继领/刘杰 职责说明 |
| sys_organizations Runtime | 组织规范编码与层级 |
| sys_role | 现有角色字典 |

## 4. 账号开通原则

- **A 类（必须开）**：集团管理层、财务、采购、销售、仓储、场长、店长 —— 本批 9 人即此类核心。
- **B 类（建议开，待审阅）**：统计员、防疫员、包装主管、品控主管。
- **C 类（暂不开）**：普通饲养员、包装工、装卸工、临时工、**司机**、**收银员（按需）**。

### 账号开通审阅清单（不在本包写入生产，待人工确认）

| 岗位 | 建议角色 | 说明 |
|------|---------|------|
| 各直营店店长 | ROLE_STORE_MGR | 8 店见 06-stores |
| 收银员 | ROLE_CASHIER | 各直营店；不得绑定 GROUP |
| 销售员 | ROLE_SALES_REP | 区域销售 |
| 统计员 | （按场区角色） | 生产统计 |
| 包装主管 | ROLE_PKG_MGR | 包装车间 |
| 品控主管 | ROLE_QA_MGR | 质量 |

> 名单中明确的店长/财务/采购/仓库/销售/统计/品控/包装主管，经业务确认姓名+用户名后，按 02/03/04 同样模式单独批次导入。

## 5. 不开账号人员说明

- **司机**（阿坚/阿喷/阿哨/阿通/阿给）：仅建 `sal_drivers` 档案，不写 `sys_user`，不绑定 GROUP。
- **客户 / 供应商**：仅建主档，不建系统账号。
- **普通工人**：不建账号。

## 6. 待确认事项

### 已闭环（M5 确认表 + 决策）

| # | 事项 | 结论 |
|---|------|------|
| ✅ | 朱召安用户名 | `zhuzhaoan`；存量 `zhuzhao_an` 由 `99-reconcile` 安全改名 |
| ✅ | BU-TRADING 命名 | 凤凰**商贸**事业群（旧名「贸易」由 99-reconcile 订正） |
| ✅ | 符强姓名 | 伏强 → 符强（99-reconcile 订正） |
| ✅ | 刘善军仓储归属 | 东鹏 SITE-DONGPENG-LAYER |
| ✅ | 王玮华数据范围 | GROUP 集团财务中心 |
| ✅ | 宋雷角色 | 主 ROLE_FACTORY_MGR + ROLE_PRC_BUYER + ROLE_FIN_AR |
| ✅ | 朱兆存附加角色 | ROLE_BU_AGRI_GM |
| ✅ | 新增宋明光 | songmingguang / ROLE_WMS_MGR / 孟赛仓储 |
| ✅ | 司机归属 | 阿喷·阿哨→星驰；阿通·阿给→凤凰孟赛；含电话 |
| ✅ | ROLE_GROUP_FINANCE | 映射 ROLE_HQ_FINANCE |

### 仍待补（不阻断主数据导入）

| # | 事项 | 说明 |
|---|------|------|
| 1 | 阿坚司机 | 名单未列，暂保留待核（归属/电话） |
| 2 | 客户疑似重复 | 拉邦吴总/万象吴总、那摩福丽/副丽那摩、khan jun/khnjin lpb、小青系列等，remark 已标记，待人工去重 |
| 3 | 客户老挝文名/区域 | 多条待补中文译名与区域（remark 标 DATA_INCOMPLETE） |
| 4 | 散户/物流公司/中铁路/东鹏 | 是否应建为正式客户（非单一主体/疑承运方/疑内部），待确认 |
| 5 | 供应商个人简称 | 高远/海总/刘总/曾总/匡总/周总等待补全称与联系方式 |
| 6 | 供应商疑似同一 | 勐泰察姜海/老挝勐泰寮(姜海)、刘涛/刘总，待确认 |
| 7 | 老挝东鹏县星驰农业 | 疑本集团关联主体，待确认是否外部供应商（关联交易） |
| 8 | 客户/供应商联系人电话 | 普遍缺失，业务补充 |
| 9 | 门店店长 | 8 店店长姓名待补 |
| 10 | 车辆信息 | 全部待现场补录 |
| 11 | 司机 site_code / 门店 company_code | 表缺列，暂存 remark/region，建议 schema 加列 |
| 9 | 正式客户清单 | 无（仅模板） | 业务交付真实客户名录 |
| 10 | 车辆信息 | 无（仅模板） | 现场补录车牌/车型/载重/归属 |
| 11 | 供应商联系人/电话 | 空（remark=DATA_INCOMPLETE） | 业务补充 |

## 7. 回滚原则

- 所有写入均幂等且仅新增（`ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`），不覆盖人工维护数据。
- **导入前先在备库/事务内预演**：可将各脚本去掉内部 `BEGIN/COMMIT` 后包入单一事务，末尾 `ROLLBACK` 验证（本包已用此法验证 16/16 PASS）。
- 如需撤销，按 `customer_no / supplier_code / driver_code / store_code / username / org_code` 精确删除本批次新增记录；**禁止整表 TRUNCATE/DELETE**。
- `03/04` 含主标记归一化 UPDATE，仅作用于本矩阵 9 人，不影响其他用户。

## 8. Pilot Run 前检查项

- [ ] `90-check-init-data.sql` 全部 PASS
- [ ] 缺失角色清单已处理（ROLE_GROUP_FINANCE 已确认映射 ROLE_HQ_FINANCE）
- [ ] 无 GROUP 误授权给司机/收银员；无 ALL 范围
- [ ] 每用户恰好一个 is_primary 组织
- [ ] §6 待确认事项已逐项闭环（尤其 #1 用户名统一、#9 客户清单）
- [ ] 不写旧表（prc_suppliers / ord_customers / b2b_customers / fin_transactions / log_dispatch）

---

## 禁止事项（硬约束）

- **禁止写表**：`ord_customers`、`b2b_customers`、`prc_suppliers`、`fin_transactions`、`log_dispatch`
- **禁止**：明文密码、默认全局权限、司机绑定 ALL、客户/供应商/普通工人建账号、覆盖人工维护数据
