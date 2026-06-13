# G92 主数据治理分层 — 类型级 + 字段级审批分流

> 日期：2026-06-13 ｜ 用户拍板：「类型分类按那张表；字段级分流本轮就做」
> 一句话：新增物料这类运营主数据免审批快建；财务/法人类主数据新增走审批，且其**关键字段**的编辑也走审批，**扩展字段**编辑免审批。

---

## 1. 背景与问题

G91 给「采购选物料找不到 → 就地快速新建」铺了 `createQuick`（直接 ACTIVE）。用户随即提出治理问题：

> 新增物料每次都走审批太麻烦。有的字段可以做审批、为了统一集中；有的字段也可以不走审批，怎么样？

排查发现一个更基础的事实：**原 `update()` 对所有主数据、所有字段的编辑都是直接落库，根本没有"编辑走审批"这回事**——审批只存在于"新建路径"（DRAFT → submit → 审批 → ACTIVE）。所以本轮要新增的是「关键字段编辑触发审批」能力，并按类型/字段两级分流。

---

## 2. 分层策略（用户确认）

### 2.1 类型级：新增是否走审批（`approvalOnCreate`）

| 分类 | 类型 | 新增行为 | 理由 |
|------|------|----------|------|
| **运营类（免审批快建）** | material 物料 / sku / grade 等级 / spec 规格 / driver 司机 / vehicle 车辆 | 新建直接 **ACTIVE** | 高频、低风险、业务员现场就要用 |
| **财务·法人类（走审批）** | customer 客户 / supplier 供应商 / project 项目 / cash-account 资金账户 / bank-account 银行账户 / company 公司 / organization 组织 / product 产品 / store 门店 / warehouse 仓库 / dict 字典 | 新建为 **DRAFT** → 提交审批 → ACTIVE | 涉及信用/资金/法人/价格/基础设施，需集中管控 |

> product/store/warehouse/dict 不在用户原表里，按"含价格/法人/基础设施属性"归入审批类（保守默认，生产可在配置里下调）。

### 2.2 字段级：关键字段编辑走审批（`keyFields`）

仅对**审批类**且记录**已 ACTIVE/FROZEN（已生效）**时生效。DRAFT/待审记录（建档中）一律直接改。

| 类型 | 关键字段（走审批） | 扩展字段（免审批，立即生效） |
|------|---------------------|------------------------------|
| customer | 名称·类型·归属公司·信用额度·账期 | 联系人·电话·区域·渠道·配送地址·备注·生效期 |
| supplier | 名称·类型·税号·币种·账期·账期天数 | 联系人·邮箱·电话·地址·国家·备注 |
| project | 名称·归属公司·预算金额·预算币种 | 简称·类型·起止日期·负责人·备注 |
| cash-account | 账户名·归属公司·币种·账户类型·银行账号·持有人 | 开户行名·备注·生效期 |
| bank-account | 行名·账号·户名·币种·归属公司·SWIFT·IBAN | 支行·国家·备注 |
| product | 名称·类目·零售价·批发价·分级/规格开关 | 多语名·单位·保质期·图片·规格 |
| store | 名称·归属公司·店长 | 地址·电话·备注 |
| warehouse | 名称·类型·归属公司·管理员 | 中文名·备注 |
| organization | 名称·上级·类型·归属公司/项目/仓库·负责人·站点 | 简称·层级·排序·备注 |
| company | 名称·上级·法人代表 | 简称·备注 |
| dict | （未配 keyFields → 所有编辑直接落库；sys_dict 另有 DML 授权门槛）||

---

## 3. 实现

### 3.1 配置（`master-data-runtime.service.ts`）
`MdTypeConfig` 新增两字段：`approvalOnCreate?: boolean`（省略=true，走审批）、`keyFields?: string[]`。

### 3.2 新建分流（`create()`）
按 `approvalOnCreate === false` 决定初始状态 `ACTIVE`，否则 `DRAFT`。返回值加 `status`。

### 3.3 编辑分流（`update()`）—— 本轮核心
1. 逐列与原值规范化比较（`eqVal`：null/'' 视同空、两侧数值按数值比、日期取日期比）取出**真正变化**的列；
2. 拆成 `keyChanges`（在 keyFields）/ `extChanges`（其余）；门控仅在审批类 + 记录 ACTIVE/FROZEN 时；
3. **扩展字段立即落库**（+ 审计 UPDATE）；
4. **关键字段** → 事务内写一条 `md_change_requests`（PENDING，暂存变更 JSON + 原值快照）+ 启动 `MD_FIELD_CHANGE` 审批；**不直接改主表**，原值在审批通过前保持生效、记录仍 ACTIVE 可被引用；
5. 返回 `{ pendingChange, changeRequestId, pendingFields, message }`；
6. **降级**：审批链启动失败（未配规则等）→ 事务回滚、直接落库不丢编辑，审计标注 `_degraded`。

### 3.4 审批通过应用变更（`workflow-biz-registry.service.ts` 注册 `MD_FIELD_CHANGE`）
- `tableName: 'md_change_requests'`（引擎末步把该行 status→APPROVED/REJECTED）；
- `onApproved(bizId)`：读变更请求 → 列名正则校验 → `UPDATE <target_table> SET <changes> WHERE <code_col>` 应用回主表 → 置 `applied_at`（幂等）→ 写 `mst_audit_trail`(APPROVE_FIELD_CHANGE)；
- `onRejected`：写 `mst_audit_trail`(REJECT_FIELD_CHANGE)，主表原值不动。
- 注：`target_table`/`code_col` 来自服务端 TYPES 白名单（非用户输入），列名再经 `^[a-z][a-z0-9_]*$` 校验防注入。

### 3.5 迁移（`apps/api/migrations/20260613_g92_md_field_change_governance.sql`）
- 建 `md_change_requests` 台账表（id/status/updated_at 满足引擎回写契约）+ 两索引；
- seed `wf_approval_rules('MD-FIELD-CHANGE-STD', biz_type='MD_FIELD_CHANGE')` + 1 步 `ROLE_MASTER_DATA_APPROVER`；
- 幂等（IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS）。审批人 admin 已由 G3-B 种子兜底授予。

### 3.6 前端（`MasterDataRuntimePanel.tsx`）
`save()` 捕获 PUT 响应；`pendingChange` 为真时显示橙色提示条「关键字段变更已提交审批，通过后生效；原值在通过前保持有效」，可关闭。

---

## 4. 用户 8 题答

1. **物料新增还要审批吗？** 不要。material 归运营类 `approvalOnCreate=false`，新建直接 ACTIVE，业务员就地建档即用。
2. **哪些字段走审批、哪些不走？** 见 §2.2 表：每个审批类主数据列出了关键字段（走审批）与扩展字段（免审批）。
3. **关键字段改了，原来的还能用吗？** 能。关键字段变更落入 `md_change_requests` 等待审批，主记录保持 ACTIVE、原值不变、可继续被单据引用；审批通过才切到新值。
4. **扩展字段改了立刻生效吗？** 是。联系人/电话/地址/备注等立即落库，无需审批。
5. **审批由谁审？** 统一 `ROLE_MASTER_DATA_APPROVER`（与主数据新增审批同审批人），生产可在审批规则页按公司/类型拆多级链。
6. **会不会因为没配审批规则把编辑卡死？** 不会。已 seed 规则 + admin 兜底审批人；万一启动失败，降级为直接落库不丢编辑（审计留痕）。
7. **草稿状态改关键字段也要审批吗？** 不要。仅 ACTIVE/FROZEN（已生效）记录门控；DRAFT/待审记录建档中可自由改。
8. **运营类（SKU/等级/规格/司机/车辆）编辑要审批吗？** 不要。这些类型 `approvalOnCreate=false` 且未配 keyFields，所有编辑直接落库。

---

## 5. 验证

- API `tsc --noEmit`：**0 error**
- Web `tsc --noEmit`：**0 error**
- 迁移幂等性：IF NOT EXISTS / ON CONFLICT / WHERE NOT EXISTS（可重复执行）
- 端到端真实回归（建材料即 ACTIVE、改客户名称转审批、审批通过后主表生效）需生产 token，提交部署后实测/界面点验。

---

## 6. 改动清单

| 文件 | 改动 |
|------|------|
| `apps/api/src/modules/master-data/master-data-runtime.service.ts` | MdTypeConfig 加 approvalOnCreate/keyFields；各类型标注；create 分流；update 字段级分流 + 变更请求 + 降级；eqVal/pick/applyCols 私有方法 |
| `apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts` | 注册 MD_FIELD_CHANGE（onApproved 应用变更 / onRejected 留痕） |
| `apps/api/migrations/20260613_g92_md_field_change_governance.sql` | md_change_requests 表 + 审批规则 + 步骤（幂等） |
| `apps/web/src/components/master-data/MasterDataRuntimePanel.tsx` | save 捕获 pendingChange，橙色提示条透出 |
