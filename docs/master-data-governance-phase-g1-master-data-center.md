# 主数据治理 G1 — 主数据中心建设

> **日期**：2026-06-03 · **依据**：docs/master-data-governance-phase-g0-blueprint.md
> **本期范围**：建立主数据中心**基础骨架**（数据层 + 编码服务 + 审计 + 质量检查 + 治理角色 + 导航）。
> **诚实声明**：G1 落地了主数据中心的「地基与公共能力」；各主数据对象的 CRUD 页面逐个改造（客户/供应商/账户）与数据字典中心 UI 属 **G1 后续迭代 / G2**，本期已建好其依赖的统一组件与数据层。

---

## 0. 结论速览

| 维度 | G1 交付 |
|------|---------|
| 主数据中心导航 | ✅ 已有 18 子菜单 + 本期补「银行账户中心 / 数据质量中心」 |
| 统一编码服务 | ✅ CodeGeneratorService（原子自增，杜绝时间戳重号） |
| 主数据审计日志 | ✅ mst_audit_trail + MasterDataAuditService |
| 主数据合并日志 | ✅ mst_merge_log（数据层就绪） |
| 银行账户三层模型 | ✅ mst_account_holders / mst_bank_accounts + fin_cash_accounts 引用列 |
| 主数据治理角色 | ✅ 8 个角色 + rbac 权限矩阵 |
| 数据质量中心 | ✅ 后端检查 + 前端看板页 |
| 数据字典中心 CRUD | ⏳ 数据层在用，CRUD UI 留 G2 治理 |

---

## 1. 主数据中心架构

```
主数据中心（MENU_MASTER_DATA · /master-data）
├── 公共能力层（G1 本期建立）
│   ├── CodeGeneratorService — 统一编码生成（mst_code_seq）
│   ├── MasterDataAuditService — 审计日志（mst_audit_trail）+ 数据质量检查
│   └── 主数据合并日志（mst_merge_log）
├── 主数据对象（既有 + 待 CRUD 化）
│   ├── 客户 / 供应商 / 项目 / 现金账户（当前只读，G1后续补 CRUD）
│   ├── 产品 / SKU / 等级 / 包装规格（已有完整 CRUD）
│   ├── 农场 / 鸡舍 / 鸡群（已有 CRUD）
│   └── 仓库 / 用户 / 角色 / 字典
└── 治理工具（G1 本期）
    ├── 银行账户中心（三层模型）
    ├── 数据质量中心（质量评分 + 问题清单）
    └── 主数据审计（操作历史）
```

## 2. 菜单结构（中文）

既有 18 子菜单（主数据概览/组织架构/公司档案/项目档案/客户档案/供应商档案/产品档案/等级档案/包装规格/SKU档案/仓库档案/门店档案/司机档案/车辆档案/资金账户档案/系统字典/用户组织权限）+ **本期新增**：
- 银行账户中心（/master-data/bank-accounts）
- 数据字典中心（/master-data/dictionaries — 升级命名）
- 数据质量中心（/master-data/quality）
- 主数据审计（/master-data/audit）

## 3. CRUD 能力现状

| 对象 | 当前 | G1 处置 |
|------|------|---------|
| 产品/SKU/等级/包装规格 | ✅ 完整 CRUD | 保持 |
| 农场/鸡舍/鸡群 | ✅ 完整 CRUD | 保持 |
| 用户/角色 | ✅ 完整 CRUD | 保持 |
| **客户/供应商/项目/现金账户** | 仅只读 | **公共能力（编码/审计/生命周期）已就绪，CRUD 页改造 G1 后续** |
| 数据字典 | 仅只读 | CRUD UI 留 G2 |

> 说明：客户/供应商 CRUD 化需逐页接入 CodeGeneratorService（自动生成 CUS-/SUP- 编码）+ 生命周期状态机 + 审计日志 + 审批流。本期已把这些依赖建好，下一迭代逐个页面接入即可，避免一次性大改风险。

## 4. 主数据生命周期

统一状态：`DRAFT → PENDING_APPROVAL → ACTIVE → FROZEN → ARCHIVED`
- customers / suppliers / cash_accounts 表均已有 `status` 字段（沿用 ACTIVE 等值）
- 状态切换 + 状态日志由 MasterDataAuditService.log 记录（FREEZE/ARCHIVE/RESTORE action）
- **禁止物理删除已被引用的主数据**（用归档替代）

## 5. 主数据审计日志（Audit Trail）

- 表：`mst_audit_trail`（object_type / object_code / action / before_json / after_json / operator / reason / created_at）
- 服务：`MasterDataAuditService.log()` — 记录 CREATE/UPDATE/FREEZE/ARCHIVE/RESTORE/MERGE，**失败不阻断主流程**
- 查询：`GET /api/master-data/audit/:objectType/:objectCode`
- 适用：所有主数据（供其他维护模块复用）

## 6. 主数据合并机制（Merge）

- 表：`mst_merge_log`（object_type / source_code / target_code / migrated_refs / operator / reason）
- 设计：CUS-001 + CUS-002 → CUS-001，业务单据引用迁移 + 保留审计 + **禁止物理删除**
- G1 建立数据层与日志结构；合并执行 Service（业务单据自动迁移）留 G1 后续迭代

## 7. 银行账户三层模型

| 层 | 表 | 示例 | 说明 |
|----|----|----|------|
| 第一层 账户主体 | mst_account_holders | 凤凰食品/凤凰农业/赵永伟/宋雷 | holder_type=COMPANY/SHAREHOLDER/INDIVIDUAL |
| 第二层 银行账户 | mst_bank_accounts | 中信8888/平安6666/招行1234 | 关联 holder_code |
| 第三层 ERP资金账户 | fin_cash_accounts | CASH-CNY-001/BANK-LAK-001 | 新增 bank_acc_code/holder_code 引用列 |

**业务单据（付款/收款/调拨）只能引用第三层 ERP 资金账户。**

## 8. 数据字典中心

- 数据层 sys_dict 在用（包装 9 类 + 养殖 6 类）
- 本期升级菜单命名为「数据字典中心」
- 第一批迁入枚举（SYS_CURRENCY/SAL_CUSTOMER_TYPE/FIN_EXPENSE_TYPE/PRC_PAYMENT_METHOD/FIN_FUND_NATURE）+ DictSelect 统一组件 = **G2 数据字典治理专项**

## 9. 角色权限（8 个治理角色）

| 角色 (role_code) | 中文名 | 对主数据中心权限 |
|------------------|--------|----------------|
| ROLE_MASTER_DATA_ADMIN | 主数据管理员 | V,C,E,A,X |
| ROLE_MASTER_DATA_APPROVER | 主数据审批人 | V,A,X |
| ROLE_SUPPLIER_MASTER_MGR | 供应商主数据管理 | V,C,E |
| ROLE_CUSTOMER_MASTER_MGR | 客户主数据管理 | V,C,E |
| ROLE_PRODUCT_MASTER_MGR | 产品主数据管理 | V,C,E |
| ROLE_WAREHOUSE_MASTER_MGR | 仓储主数据管理 | V,C,E |
| ROLE_FARM_MASTER_MGR | 场站主数据管理 | V,C,E |
| ROLE_FIN_ACCOUNT_MASTER_MGR | 资金账户主数据管理 | V,C,E（银行账户中心 X）|

rbac.matrix 新增菜单权限：MENU_MASTER_DATA / MENU_MD_BANK_ACCOUNT / MENU_MD_DICT_CENTER / MENU_MD_QUALITY / MENU_MD_AUDIT。
**原则**：普通业务人员只能引用 ACTIVE 主数据，不在主数据治理角色内即无 C/E 权限。

## 10. 统一编码中心（Code Generator）

- 表：`mst_code_seq`（prefix / current_no / pad_len）
- 服务：`CodeGeneratorService.next(prefix)` — `UPDATE...RETURNING` 行级锁原子自增
- API：`POST /api/master-data/code/next { prefix }`
- 已注册前缀：CUS-00001 / SUP-00001 / SHR-001 / PRJ-001 / FRM-01 / SKU-0001
- **禁止时间戳编码、禁止姓名拼音编码**（本期编码服务从根本杜绝）
- 本地冒烟：连续生成 CUS-00001→CUS-00002→SHR-001，原子自增正确

## 11. 数据质量中心

- 后端：`MasterDataAuditService.qualityChecks()` — 6 项检查（防御式，缺表返回 -1 不可用）
  1. 联系电话重复的客户
  2. 名称重复的供应商
  3. 缺联系人的客户
  4. 缺银行账户的供应商
  5. 未绑定登录账号的股东
  6. 未关联账户主体的资金账户
- API：`GET /api/master-data/quality`（返回质量评分 + 问题清单）
- 前端：`/master-data/quality` 看板页（评分卡 + 问题清单表，中文）

## 12. 验证结果

| 项 | 结果 |
|----|------|
| API TypeScript | ✅ 0 errors |
| Web TypeScript | ✅ 0 errors |
| 迁移本地实跑 | ✅ 幂等（6 前缀/8 角色/4 表/5 菜单）|
| 编码生成冒烟 | ✅ CUS-00001→00002→SHR-001 原子自增 |
| 数据质量检查冒烟 | ✅ 6 项检查可运行 |

---

## 13. G2 实施计划

| 阶段 | 目标 | 先决条件 |
|------|------|---------|
| **G1 后续** | 客户/供应商/账户 CRUD 化（接入编码服务 + 生命周期 + 审计 + 审批）| G1 公共能力（本期已建）|
| **G2 数据字典治理** | 5 个 P1 枚举迁入 sys_dict + sys_dict CRUD UI + DictSelect 统一组件 | G1 字典数据层 |
| **G3 生命周期审批** | 供应商/客户/账户新增走审批流（DRAFT→PENDING→ACTIVE）| G2 + 审批引擎 |
| **G4** | 付款单 6 个 P0 裸字段主数据驱动改造 | G1+G2 |

---

## 必须回答

1. **主数据中心是否建立**：✅ 是。导航 + 公共能力层（编码/审计/质量）+ 治理角色 + 后端模块（MasterDataCenterModule）已建立并注册。

2. **哪些对象支持 CRUD**：产品/SKU/等级/包装规格、农场/鸡舍/鸡群、用户/角色 已有完整 CRUD；客户/供应商/项目/现金账户当前只读（CRUD 公共能力已就绪，逐页改造 G1 后续）。

3. **哪些对象支持生命周期**：客户/供应商/现金账户/股东/项目公司（status 字段 + 审计日志记录状态切换），统一 DRAFT→PENDING_APPROVAL→ACTIVE→FROZEN→ARCHIVED。

4. **Audit Trail 是否建立**：✅ mst_audit_trail 表 + MasterDataAuditService.log() + 查询 API。

5. **Merge 是否建立**：✅ 数据层（mst_merge_log）+ 设计就绪；合并执行 Service 留 G1 后续。

6. **银行账户三层模型是否建立**：✅ mst_account_holders（主体）+ mst_bank_accounts（银行账户）+ fin_cash_accounts 引用列（ERP资金账户），业务单据只引用第三层。

7. **数据字典中心是否建立**：🟡 数据层 sys_dict 在用 + 菜单升级；CRUD UI 与枚举迁移 = G2 专项。

8. **是否允许进入 G2**：🟢 **允许**。G1 已建好主数据中心地基（编码/审计/质量/三层账户/治理角色），G2 进入数据字典治理（迁入 5 枚举 + CRUD + DictSelect）。
