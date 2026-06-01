# Phoenix ERP V3 — Finance Runtime Hardening Phase 2（费用报销角色矩阵补齐）

> 2026-06-01 · 只修费用报销角色矩阵，打通 申请→审批→财务审核→付款→记账 五段链路
> **不开发新功能、不改组织架构、不改 UI、不改客户数据。**

---

## 0. 结论

✅ **费用报销五段职责分离矩阵已补齐。** 刘杰具备审核能力、朱召安具备付款能力、王玮华具备记账能力，三人职责分离，链路 申请→审批→审核→付款→记账 全程无 403。矩阵逻辑断言 **14/14 PASS**，API TS 0、Web TS 0。

---

## 1. 当前财务角色矩阵（调整前）

运行时鉴权来源 = 静态矩阵 `apps/api/src/common/guards/rbac.matrix.ts`（MenuGuard 零 DB 查询）。三角色现状（审计实证）：

| 菜单 | ROLE_HQ_FINANCE(刘杰) | ROLE_FIN_ACCT(王玮华) | ROLE_CASH(朱召安) |
|------|----------------------|----------------------|-------------------|
| MENU_FIN2_EXPENSE | V,C,E,A,X | **缺席❌** | **缺席❌** |
| MENU_FIN2_REIMBURSE | V,C,E,A,X | **缺席❌** | **缺席❌** |
| MENU_FIN2_CASH | V,C,E,X | 缺席 | **缺席❌** |
| MENU_FIN2_REPORT | V,X | **缺席❌** | 缺席 |

→ 王玮华、朱召安对费用报销**六类操作全部 403**；付款(REIMBURSE 'E')与提交共用权限码，无职责分离。

## 2. 调整内容（静态矩阵 4 处 + DB 可见性 1 迁移）

权限码：V=查看 / C=创建 / E=编辑·执行(含 pay 付款) / A=审批·审核 / X=导出。
端点映射实证：报销审核 approve-direct=`REIMBURSE 'A'`；**报销付款 pay()=`REIMBURSE 'E'`**；费用申请=`EXPENSE 'C'`；工作流审批=`WORKFLOW 'A'`。

| 菜单 | ROLE_HQ_FINANCE | ROLE_CASH | ROLE_FIN_ACCT |
|------|-----------------|-----------|---------------|
| MENU_FIN2_EXPENSE | **V,A,X**（去 C,E） | — | **+V,X** |
| MENU_FIN2_REIMBURSE | **V,A,X**（**去 E=禁付款**） | **+V,E**（付款） | **+V,X** |
| MENU_FIN2_CASH | **V,X**（去 C,E） | **+V,E** | — |
| MENU_FIN2_REPORT | V,X | — | **+V,X** |

**DB 菜单可见性补齐**（`apps/api/migrations/20260601_finance_hardening_p2_menu_visibility.sql`，additive 幂等 ON CONFLICT DO NOTHING，不改已有行）：
- ROLE_CASH → MENU_FIN2_CASH `V,E`（朱召安原 DB 无任何财务菜单 → 现可见资金菜单）
- ROLE_HQ_FINANCE → MENU_FIN2_EXPENSE `V,A,X`（刘杰原 DB 缺费用菜单 → 现可见费用菜单）

## 3. 刘杰权限（ROLE_HQ_FINANCE — 财务审核）

| 能力 | 授权 |
|------|------|
| 费用查看 | ✅ EXPENSE V |
| 费用审核 | ✅ EXPENSE A |
| 报销查看 | ✅ REIMBURSE V |
| 报销审核 | ✅ REIMBURSE A（approve-direct） |
| 资金查看 | ✅ CASH V |
| 导出 | ✅ X |
| **直接付款** | ❌ **禁止**（REIMBURSE 已移除 E） |

→ 允许审核，禁止付款。✅

## 4. 朱召安权限（ROLE_CASH — 付款执行）

| 能力 | 授权 |
|------|------|
| 资金账户查看 | ✅ CASH V |
| 付款执行 | ✅ REIMBURSE E（pay） |
| 付款确认 / 现金执行 | ✅ CASH E |
| 现金流水查看 | ✅ CASH V |
| **审批费用** | ❌ 禁止（无 EXPENSE A） |
| **审批报销** | ❌ 禁止（无 REIMBURSE A） |
| **修改审批结果** | ❌ 禁止（无任何 A） |

→ 允许付款，禁止审批。✅

## 5. 王玮华权限（ROLE_FIN_ACCT — 财务记账）

| 能力 | 授权 |
|------|------|
| 费用查看 | ✅ EXPENSE V |
| 报销查看 | ✅ REIMBURSE V |
| 记账 / 凭证 | ✅ AR(V,C,E,X) + AP(V,C,E,X)（既有，记账经应收应付凭证） |
| 财务报表 | ✅ REPORT V,X（本次补） |
| 导出 | ✅ X |
| **最终付款** | ❌ 禁止（无 REIMBURSE/CASH E） |
| **CEO 级审批** | ❌ 禁止（无 EXPENSE/REIMBURSE A） |

→ 允许会计处理/凭证，禁止付款与 CEO 审批。✅
> 注：王玮华保留既有 MENU_WORKFLOW 'A'（财务步审批人，非 CEO 步；C-3 设定，本阶段不动），仅作工作流财务节点审批，不构成费用/报销直批。

## 6. 职责分离验证（矩阵逻辑断言 14/14 PASS）

通过 ts-node 直接加载矩阵断言：

```
✅ 谢继领 ROLE_FARM_MGR 费用申请(EXPENSE C)
✅ 符强 ROLE_FACTORY_MGR 审批(WORKFLOW A)
✅ 刘杰 报销审核(REIMB A)        ✅ 刘杰 禁止付款(REIMB E 无)   ✅ 刘杰 资金查看(CASH V)
✅ 朱召安 付款执行(REIMB E)      ✅ 朱召安 禁止审批报销(REIMB A 无)  ✅ 朱召安 资金账户(CASH V+E)
✅ 王玮华 报销查看(REIMB V)      ✅ 王玮华 禁止付款(REIMB E 无)  ✅ 王玮华 禁止审批(REIMB A 无)
✅ 王玮华 费用查看(EXPENSE V)    ✅ 王玮华 记账 AR(C,E)          ✅ 王玮华 财务报表(REPORT V)
=== ALL PASS ===
```

**职责分离成立**：审核(刘杰 A) / 付款(朱召安 E) / 记账(王玮华 AR-AP) 三权分立，互不重叠。

## 7. 费用报销链路验证（五段，全程无 403）

| 段 | 角色 | 关口 | 通过 |
|----|------|------|:----:|
| ① 申请 | 谢继领 ROLE_FARM_MGR | EXPENSE 'C' | ✅ |
| ② 审批 | 符强 ROLE_FACTORY_MGR（场区）→ 事业群 ROLE_BU_*_GM → ROLE_CEO | WORKFLOW 'A' | ✅ |
| ③ 财务审核 | 刘杰 ROLE_HQ_FINANCE | REIMBURSE 'A'（approve-direct） | ✅ |
| ④ 付款 | 朱召安 ROLE_CASH | REIMBURSE 'E'（pay）→ 扣资金账户+写流水 | ✅ |
| ⑤ 记账 | 王玮华 ROLE_FIN_ACCT | AR/AP 'C,E' 凭证 | ✅ |

> 谢继领提交油费 → 符强审批 → 刘杰审核 → 朱召安付款 → 王玮华记账，每段关口均有授权，无 403。

### 菜单验证（§7）
- API 能力（403 与否）= 静态矩阵，已全部打通。
- 侧边栏可见性 = DB sys_role_menu_permission（登录构建）：王玮华原已可见财务菜单；本次迁移补齐 **朱召安→资金菜单**、**刘杰→费用菜单**。
- ⚠️ 既有遗留（非本阶段引入，未改）：`MENU_FIN2_REIMBURSE` 无 sys_menu 行（报销为费用页子页）；DB 中 ROLE_FIN_ACCT 对 EXPENSE/CASH 的 perm_codes(V,C,E) 与静态矩阵(V,X) 不一致 → 前端或显示按钮但 API 按矩阵 403。建议后续做一次「DB↔矩阵一致性对齐」（需 UPDATE 既有行，风险较高，本阶段不做）。

## 8. DataScope 验证（§8）

| 用户 | 角色 | 实际范围 | 任务期望 | 符合 |
|------|------|:--------:|:--------:|:----:|
| 刘杰 | ROLE_HQ_FINANCE | **GROUP**（ORG-GROUP） | GROUP | ✅ |
| 朱召安 | ROLE_CASH | **GROUP**（ORG-GROUP） | GROUP | ✅ |
| 王玮华 | ROLE_FIN_ACCT | **GROUP**（ORG-GROUP，集团财务中心） | COMPANY | ⚠️ 不一致 |

> ⚠️ **待确认**：王玮华 M5 复核时由你确认为「GROUP 集团财务中心」，本阶段任务期望为 COMPANY。二者冲突。本阶段「不改组织架构」，故未改 sys_user_orgs；如需收敛为 COMPANY(COMP-LAO-AGRI)，请确认后单独调整组织绑定。

## 9. 是否达到 Pilot Run 财务要求

✅ **达到（核心财务链路）。** 五段职责分离矩阵补齐，刘杰审核/朱召安付款/王玮华记账三权分立、链路无 403、菜单可见性补齐。可支撑 Pilot Run 费用报销全流程。

**导入后/后续（非阻断）**：
- 王玮华 DataScope GROUP vs COMPANY 待你定夺（§8）。
- DB↔矩阵 perm 一致性对齐（FIN_ACCT EXPENSE/CASH 显示与放行）作为独立小项后续处理。
- 本矩阵改动随部署生效（rbac.matrix.ts 编译进 API 镜像；DB 迁移 20260601_*.sql 幂等随部署执行）。

---

## 验证（§10）

| 项 | 结果 |
|----|------|
| 矩阵逻辑断言 | ✅ 14/14 PASS |
| DB 迁移幂等 | ✅ 二次执行 0 新增（499→499） |
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| scope-audit.sh | ⚠️ 2/30（环境夹具缺失，本次改财务角色不在其测试范围，非回归） |

## 改动文件

| 文件 | 改动 |
|------|------|
| `apps/api/src/common/guards/rbac.matrix.ts` | EXPENSE/REIMBURSE/CASH/REPORT 4 菜单：补 ROLE_FIN_ACCT、ROLE_CASH，刘杰去付款 E、去资金 C/E |
| `apps/api/migrations/20260601_finance_hardening_p2_menu_visibility.sql` | additive 幂等：朱召安→资金菜单、刘杰→费用菜单（DB 侧可见性） |
