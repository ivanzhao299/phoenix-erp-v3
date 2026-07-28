# 好业财 WMS 入库出库只读等效审计

## 1. 目标与边界

本阶段让 Phoenix ERP 能完整读取、保存、解释和对照好业财采购入库单与销售出库单，为后续同字段同步提供稳定契约。好业财仍是外部财务/进销存事实来源之一，Phoenix ERP 的实际库存仍只能通过 WMS 原子确认事务变更。

本阶段不调用好业财写接口，不修改或删除好业财数据，不把镜像单据直接写入 ERP 库存台账，也不开放自动反向同步。

## 2. 只读接口审计

| 单据 | 官方接口 | 请求 | 账套范围 | 当前状态 |
| --- | --- | --- | --- | --- |
| 采购入库单 | `POST /accounting/openapi/cc/purchasestockin/list/{bookid}` | `page`、`pageSize` 必填 | 每个启用账套 | 已修正 |
| 销售出库单 | `POST /accounting/openapi/cc/salesstockout/list/{bookid}` | `page`、`pageSize` 必填 | 每个启用账套 | 已补全分页 |

官方文档：

- 采购入库：[好业财采购入库单列表](https://open.chanjet.com/md/docs/file/apiFile/zplus/zjkcgl/30644?id=33283)
- 销售出库：[好业财销售出库单列表](https://open.chanjet.com/md/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791)

历史实现使用了不带 `{bookid}` 的旧采购入库路径，并且两个单据都只请求一页。这会造成账套归属不明和数据静默漏读。本轮统一为账套级官方路径，并逐页读取至官方总页数/总行数结束；超过 200 页会 HOLD，而不是截断后报成功。

## 3. 单据业务逻辑

### 3.1 状态

| 好业财 | ERP 工作流解释 | 处理 |
| --- | --- | --- |
| `SUBMITTED` | `PENDING` | 已提交但未形成已确认库存事实 |
| `EFFECTIVE` | `COMPLETED` | 已生效，可参与跨系统对账 |
| 未知状态 | `UNKNOWN` | HOLD，不猜测 |

红蓝单通过 `redBlueFlagEnum` 原样保留。后续写入设计必须识别红字冲销，不能把红字按普通正数单据处理。

### 3.2 入库

好业财采购入库是采购履约/财务库存事实；ERP 入库还包含生产完工、调拨接收、销售退货、盘盈等行业场景。因此两端并非“所有入库类型完全相同”，等效范围是采购入库字段与状态等效，ERP 行业扩展类型继续由 ERP 自己管理。

### 3.3 出库

好业财当前只读契约覆盖销售出库；ERP 还包含生产领用、饲料、兽药、后勤、配件、办公、维修、退供和报废。销售出库参与好业财对账，内部领用保留 ERP 成本对象和独立业务类型，不能伪装成好业财销售出库。

## 4. 字段覆盖

可执行字段契约位于：

- `apps/api/src/modules/chanjet/chanjet-wms-readonly.contract.ts`
- 管理员页面 `/finance2/chanjet-integration` → `库存单据对齐`
- 审计命令 `node scripts/ops/chanjet-wms-readonly-alignment-audit.mjs`

契约覆盖单据头、明细、状态、账套、往来单位、客户、部门、业务员、项目、仓库、币种、源单、发票、物流、双计量、价格、税额、成本、折扣、赠品、批号、序列号和附件元数据。官方响应原文继续无损保存在 `chanjet_read_snapshots` / `chanjet_entity_snapshots.raw_data`，业务常用字段落入本轮扩展列。

附件只保留名称和类型用于业务对照；官方原始 URL 仅作为受控中间层证据，不向普通页面透传。

## 5. 数据权威与同步规则

1. 好业财采购入库/销售出库：只读事实与对账来源。
2. ERP 实际库存：`wms_inbound` / `wms_outbound` 确认后经 `inv_batches`、`inv_ledger` 原子事务形成。
3. 好业财镜像不得直接增减 ERP 库存，避免双记账。
4. 未来写入必须先完成账套、公司、往来单位、仓库、商品、单位、税率和源单映射。
5. 两端金额、数量或状态不一致时进入差异中心，禁止静默覆盖。
6. 每个外部单据按 `source_system + external_book_id + external_document_id` 幂等。

## 6. 当前生产只读证据

部署前生产数据库显示三个启用账套；销售出库已按三个账套保存 scope，采购入库仍残留旧版无账套 scope。两个单据当前样本均为 0 行，因此可以确认接口握手成功，但不能用空样本证明所有字段类型已经经过真实值验证。

部署后必须：

1. 对三个账套分别重跑 `STOCK_IN`、`SALES_STOCK_OUT` 只读同步。
2. 期望 scope 从历史 4 个提升为 6 个。
3. 验证采购入库路径不再出现旧版全局路径。
4. 即使仍为 0 行，也要保留 `GO WITH CONDITIONS`，直到真实单据样本出现。

## 7. 决策

**GO WITH CONDITIONS**

代码契约和 ERP 字段扩展已覆盖官方已公开字段；生产迁移、六个账套 scope 刷新和真实非空样本验证完成后，才可把字段类型结论提升为完全 GO。好业财写入继续禁止。
