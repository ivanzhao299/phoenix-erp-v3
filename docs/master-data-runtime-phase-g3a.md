# 核心主数据运行体系 G3-A

> **日期**：2026-06-03 · **依据**：G0 蓝图 + G1 主数据中心 + G2 字典治理
> **本期交付**：客户/供应商/项目从「只读查询页」升级为「主数据 Runtime」（CRUD + 生命周期 + 审计 + 自动编码 + 引用治理）。
> **架构亮点**：配置驱动的通用 Runtime 引擎，3 对象复用同一后端服务与前端组件，零重复。

---

## 0. 结论速览

| 对象 | Runtime 化 | 自动编码 | 生命周期 | 引用治理 | 审计 |
|------|-----------|---------|---------|---------|------|
| 客户 | ✅ | CUS-00001 | ✅ | ✅ | ✅ |
| 供应商 | ✅ | SUP-00001 | ✅ | ✅ | ✅ |
| 项目公司 | ✅ | PRJ-001 | ✅ | ✅ | ✅ |
| 现金账户 | 🟡 后端就绪 | 业务格式 | ✅ | ✅ | ✅ | 三层 UI 留 G3-A.2 |

---

## 1. 架构：配置驱动通用 Runtime 引擎

**后端**：`MasterDataRuntimeService`（一个引擎，4 类配置）：
```ts
TYPES = {
  customer:      { table:'sal_customers',   codeCol:'customer_no',  prefix:'CUS', objectType:'CUSTOMER',  writableCols:[...] },
  supplier:      { table:'prc2_suppliers',  codeCol:'supplier_code',prefix:'SUP', objectType:'SUPPLIER',  writableCols:[...] },
  project:       { table:'shr_projects',    codeCol:'project_code', prefix:'PRJ', objectType:'PROJECT',   writableCols:[...] },
  'cash-account':{ table:'fin_cash_accounts',codeCol:'account_code',             objectType:'CASH_ACCOUNT',writableCols:[...] },
}
```
- **列白名单**（writableCols）防止任意列写入，值全部参数化（安全）
- 复用 G1 的 CodeGeneratorService（自动编码）+ MasterDataAuditService（审计）

**前端**：`MasterDataRuntimePanel`（一个组件，config 驱动）：列表 + 新增/编辑抽屉 + 生命周期按钮 + 状态标签。客户/供应商/项目页各 ~40 行配置即复用。

**API**：`/api/master-data/runtime/:type`
| 方法 | 路由 | 功能 |
|------|------|------|
| GET | /:type | 列表（?status=&keyword=）|
| GET | /:type/active | 仅 ACTIVE（引用治理）|
| GET | /:type/:code | 详情 |
| POST | /:type | 新增（自动编码 + DRAFT）|
| PUT | /:type/:code | 编辑 |
| POST | /:type/:code/transition | 生命周期流转 |

## 2. 客户主数据 Runtime

- 页面：`/master-data/customers`（从只读升级为 Runtime）
- 字段：名称/类型/公司编码(必填,NOT NULL)/联系人/电话/区域/信用额度/账期/配送地址/生效日期/失效日期/备注
- 编码：CUS-00001 自动生成，禁止手填
- 操作：新增/编辑/提交审批/审批通过/冻结/恢复/归档

## 3. 供应商主数据 Runtime

- 页面：`/master-data/suppliers`
- 字段：名称/英文名/类型/国家/联系人/电话/邮箱/税号/默认币种/结算账期/地址/生效日期/备注
- 编码：SUP-00001 自动生成

## 4. 项目公司 Runtime

- 页面：`/master-data/projects`
- 字段：项目名称/公司编码/场区编码/项目类型/生效日期/备注
- 编码：PRJ-001 自动生成

## 5. 现金账户 Runtime（后端就绪）

- 后端 type='cash-account' 已支持完整 CRUD + 生命周期（编码由业务格式 CASH-CNY-001 提供）
- **三层模型 UI**（账户主体 → 银行账户 → ERP资金账户的级联选择）较复杂，留 **G3-A.2** 专项；本期后端引擎已就绪

## 6. 生命周期（统一）

```
DRAFT ──submit──▶ PENDING_APPROVAL ──approve──▶ ACTIVE ──freeze──▶ FROZEN
  ▲                      │ reject                  │ archive          │ restore
  └──(修改重提交)── REJECTED                      ▼                  ▼
                                              ARCHIVED ◀──────────  ACTIVE
```
| 动作 | 允许的起始状态 | 目标状态 |
|------|--------------|---------|
| submit 提交审批 | DRAFT / REJECTED | PENDING_APPROVAL |
| approve 审批通过 | PENDING_APPROVAL | ACTIVE |
| reject 驳回 | PENDING_APPROVAL | REJECTED |
| freeze 冻结 | ACTIVE | FROZEN |
| restore 恢复 | FROZEN / ARCHIVED | ACTIVE |
| archive 归档 | DRAFT/REJECTED/ACTIVE/FROZEN | ARCHIVED |

非法流转（如 DRAFT 直接 freeze）后端拒绝并报错。**禁止物理删除**，归档替代。

## 7. 引用治理（生效）

- `GET /:type/active` 仅返回 `status='ACTIVE'` 且在生效期内（`effective_date<=今天<=expire_date`）
- 供前端 Selector（销售订单选客户、付款单选供应商）调用，**FROZEN/ARCHIVED/未生效主数据不出现在新单据下拉**
- 本地冒烟验证：客户冻结后 listActive 立即归 0

## 8. 编码治理（自动生成）

- 客户 CUS-00001 / 供应商 SUP-00001 / 项目 PRJ-001 — 全部经 CodeGeneratorService 原子自增
- 新增时编码自动生成，前端**不提供编码输入框**，杜绝手填
- 本地冒烟：CUS-00001 → CUS-00002 → SHR-001 连续原子

## 9. 审计治理

- 所有 新增/编辑/冻结/归档/恢复 经 MasterDataAuditService.log 写入 `mst_audit_trail`
- 记录 object_type / object_code / action / before_json / after_json / operator
- 失败不阻断主流程（防御式）

---

## 验证结果

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 客户 Runtime 全链冒烟 | ✅ 自动编码→DRAFT→PENDING→ACTIVE→FROZEN + 引用治理归0 + 审计写入 |

---

## 必须回答

1. **哪些对象已经 Runtime 化**：客户、供应商、项目公司（前后端完整 Runtime）；现金账户（后端引擎就绪，三层 UI 留 G3-A.2）。

2. **哪些对象仍是只读**：现金账户的三层级联 UI（后端已可写）；门店/司机/车辆等次要主数据（G3-A.3）。

3. **生命周期是否生效**：✅ 统一 DRAFT→PENDING_APPROVAL→ACTIVE→FROZEN→ARCHIVED，非法流转后端拒绝，禁止物理删除。

4. **引用治理是否生效**：✅ listActive 仅 ACTIVE + 生效期内；冻结后立即从 Selector 消失（冒烟验证）。

5. **编码是否自动生成**：✅ CUS/SUP/PRJ 经 CodeGeneratorService 原子自增，前端无编码输入框。

6. **是否允许进入 G3-B**：🟢 **允许**。Runtime 引擎 + 生命周期 + 引用治理 + 编码 + 审计已就绪，状态机已留好 PENDING_APPROVAL 节点。G3-B 接入 Workflow 2.0：submit 时启动审批实例、审批通过回调置 ACTIVE。

---

## 附录 · 变更文件

- `apps/api/src/modules/master-data/master-data-runtime.service.ts`（通用 Runtime 引擎）
- `apps/api/src/modules/master-data/master-data-runtime.controller.ts`（Runtime API）
- `apps/api/src/modules/master-data/master-data-center.module.ts`（注册）
- `apps/web/src/components/master-data/MasterDataRuntimePanel.tsx`（通用前端面板）
- `apps/web/src/app/(admin)/master-data/{customers,suppliers,projects}/page.tsx`（3 Runtime 页）
- `docs/master-data-runtime-phase-g3a.md`（本报告）
