# 好业财全面对接架构方案 - 2026-07-03

## 当前连通性结论

状态：**连接链路已恢复，可进入字段样本采集与全模块对接设计。**

已完成实证：

- 畅捷通消息接收地址验证通过。
- 新 AppTicket 已成功写入 `sys_chanjet_state`。
- `appTicket + certificate -> openToken` 已实测成功。
- `openToken` 有效期：`518400` 秒，即 6 天。
- 账套列表接口已实测成功，返回 3 个账套。
- 当前已将 `openToken` 写入 `sys_chanjet_state.tokens`，过期时间约为 `2026-07-09T02:29:11Z`。

仍需注意：

- 远端 SSH 偶发 `banner exchange timeout`，后续字段探针应尽量通过 ERP 内部受控探针接口或短任务脚本执行，减少长 SSH 依赖。
- 好业财接口对接必须继续保持：**只读优先、审核入账、不可直接污染业务主表**。

## 对接原则

ERP 与财务系统的行业通用做法不是“共用一个数据库”，而是：

1. **ERP 管业务事实**
   - 采购、销售、库存、生产、应收应付明细、合同、附件、审批、DataScope。

2. **财务系统管会计结果**
   - 科目、凭证、总账、辅助核算、期间余额、财务报表。

3. **中间层负责转换、对账、审计**
   - 主数据映射。
   - 单据到凭证草稿。
   - 账套/公司/部门/客户/供应商/科目映射。
   - 期间余额快照。
   - 差异对账。
   - 审批确认后入账。

4. **不得把财务系统接口返回直接写入 ERP 业务主表**
   - 好业财总账/余额数据不能直接写入采购订单、销售订单、应收发票明细、库存批次等业务事实表。
   - 必须落入快照表或中间映射表，经过审核后进入 ERP 财务总账或对账视图。

## 推荐目标架构

```text
ERP 业务域
  采购 / 销售 / 库存 / 生产 / POS / 费用 / 股东资金
        |
        | 业务单据、附件、审批状态
        v
ERP 财务中间层
  chanjet_*_snapshot
  chanjet_master_mapping
  chanjet_voucher_draft
  chanjet_sync_jobs
  chanjet_reconciliation_results
        |
        | 人工审核 / 财务确认 / 差异处理
        v
好业财 OpenAPI
  账套 / 科目 / 部门 / 往来单位 / 凭证 / 总账 / 辅助核算 / 报表
```

## 中间层表设计建议

### 1. `chanjet_account_books`

保存好业财账套与 ERP 公司映射。

| 字段 | 说明 |
|---|---|
| `book_id` | 好业财账套 ID |
| `book_name` | 账套名称 |
| `company_code` | ERP 公司编码 |
| `company_name` | ERP 公司名称 |
| `enabled` | 是否参与同步 |
| `last_probe_at` | 最近探测时间 |

### 2. `chanjet_master_mapping`

统一处理主数据映射。

| 字段 | 说明 |
|---|---|
| `mapping_type` | COMPANY / DEPARTMENT / CUSTOMER / SUPPLIER / CASH_ACCOUNT / SUBJECT / PROJECT |
| `erp_code` | ERP 编码 |
| `erp_name` | ERP 名称 |
| `chanjet_id` | 好业财 ID |
| `chanjet_code` | 好业财编码 |
| `chanjet_name` | 好业财名称 |
| `match_status` | MATCHED / MISSING_IN_ERP / MISSING_IN_CHANJET / CONFLICT / MANUAL |
| `confidence` | 自动匹配置信度 |
| `review_status` | PENDING / APPROVED / REJECTED |

### 3. `chanjet_api_field_catalog`

保存每个接口的字段样本与字段类型。

| 字段 | 说明 |
|---|---|
| `api_domain` | accounting / voucher / report / master-data |
| `api_path` | OpenAPI path |
| `method` | GET / POST |
| `field_path` | JSON 字段路径 |
| `sample_type` | string / number / boolean / array / object / null |
| `sample_value_masked` | 脱敏样本 |
| `observed_count` | 样本出现次数 |
| `first_seen_at` / `last_seen_at` | 首次/最近发现 |

### 4. `chanjet_sync_jobs`

每次同步/探针任务的审计记录。

| 字段 | 说明 |
|---|---|
| `job_type` | PROBE / SNAPSHOT / RECONCILE / IMPORT |
| `book_id` | 账套 |
| `period` | 期间 |
| `status` | RUNNING / SUCCESS / FAIL |
| `request_scope` | 本次接口范围 |
| `result_summary` | 结果摘要 |
| `error_message` | 错误 |

### 5. `chanjet_voucher_draft`

未来 ERP -> 好业财凭证草稿或人工凭证建议。初期不自动写好业财。

| 字段 | 说明 |
|---|---|
| `source_biz_type` | 采购付款 / 销售收款 / 费用报销 / 股东出资等 |
| `source_biz_id` | ERP 单据 ID |
| `voucher_lines` | 借贷分录 JSON |
| `status` | DRAFT / REVIEWED / PUSH_READY / PUSHED / REJECTED |
| `push_allowed` | 是否允许推送 |

## 字段采集范围

第一阶段不直接追求“写凭证”，先全面采集好业财结构与字段。

### A. 账套与基础档案

- 账套列表。
- 部门 / 组织。
- 往来单位：客户、供应商。
- 科目。
- 项目 / 辅助核算。
- 币种。
- 银行账户 / 现金账户，如开放。

### B. 应收 / 应付 / 总账

- 应收统计。
- 应付统计。
- 总账余额。
- 科目余额。
- 辅助核算余额。
- 期间维度。
- 本币 / 原币 / 汇率。

### C. 凭证

- 凭证列表。
- 凭证明细。
- 凭证附件，如开放。
- 凭证状态。

### D. 报表

- 资产负债表。
- 利润表。
- 现金流量表，如开放。
- 明细账 / 科目明细，如开放。

## ERP 与好业财字段共用策略

### 可以共用的字段

| 字段类型 | 共用方式 |
|---|---|
| 公司编码 | ERP `company_code` 与好业财账套建立映射，不要求同名同码 |
| 部门编码 | 建映射表，允许名称一致但编码不同 |
| 客户/供应商编码 | ERP 主数据为主，好业财 ID 为外部映射 |
| 科目编码 | 好业财为主，ERP 只引用映射 |
| 币种 | 统一 `SYS_CURRENCY`，保留好业财原值 |
| 金额 | 保留原币、本币、汇率、精度 |
| 期间 | ERP 日期字段转财务期间 `YYYYMM` |

### 不应直接共用的字段

| 字段类型 | 原因 |
|---|---|
| ERP 单据状态 | 业务审批状态与财务凭证状态不是一回事 |
| 库存批次状态 | 财务系统没有业务库存批次语义 |
| 客户/供应商详细档案 | 两端生命周期不同，应通过映射和对账保持一致 |
| 附件 URL | 必须走 ERP protected file endpoint，不共享裸 URL |
| 审批流 | ERP 审批和财务审核要解耦 |

## 对接模式

### 模式 1：只读快照

适用：

- 账套。
- 科目。
- 部门。
- 往来单位。
- 总账余额。
- 应收 / 应付统计。
- 报表。

流程：

```text
好业财 API -> chanjet_*_snapshot -> 字段 catalog -> 差异报告 -> 人工确认
```

### 模式 2：审核入账

适用：

- 好业财余额进入 ERP 财务总账。
- 已实现应收 g199 路径。

流程：

```text
chanjet_ar_snapshot -> 预览差异 -> 财务总监审核 -> fin_ar_ledger
```

### 模式 3：ERP 单据生成凭证草稿

适用未来阶段：

- 采购付款。
- 销售收款。
- 费用报销。
- 股东出资。
- POS 收银。

流程：

```text
ERP 业务单据 -> 凭证草稿 -> 财务审核 -> 好业财凭证接口
```

初期建议只做草稿和导出，不自动推送。

### 模式 4：双向写入

当前不建议启用。

只有在完成以下条件后才可考虑：

- A2 安全复核。
- 财务 UAT。
- 回滚方案。
- 幂等键。
- 凭证冲销策略。
- 操作审计。

## 第一批攻击目标

### P0-1：好业财字段目录探针

目标：

- 自动拉取所有开放模块的样本 JSON。
- 自动生成字段路径、类型、样本值、出现次数。
- 输出 `docs/ops/runs/chanjet-field-catalog-latest.json` 和 Markdown 报告。

建议新增脚本：

```text
scripts/ops/chanjet-field-catalog-probe.mjs
```

脚本职责：

- 使用现有 `sys_chanjet_state.tokens`。
- 调用 allowlist 内接口。
- 对响应做字段 flatten。
- 自动脱敏。
- 不写业务表。
- 只写 docs/ops/runs 和可选 catalog 表。

### P0-2：账套 / 公司映射确认

目标：

- 3 个好业财账套与 ERP 公司固定映射。
- 输出账套 ID、账套名、ERP company_code。

### P0-3：主数据映射表

目标：

- 客户。
- 供应商。
- 部门。
- 科目。
- 项目。
- 现金账户。

只生成候选，不自动覆盖 ERP 主数据。

### P0-4：应收 / 应付 / 总账对账扩展

当前已有应收 g199。

下一步扩展：

- 应付 AP。
- 现金 / 银行账户余额。
- 费用科目。
- 采购付款与财务凭证勾稽。

## 分阶段路线

### Phase C1：连接与字段发现

目标：知道好业财开放了什么、每个接口返回什么字段。

验收：

- token 自动续期正常。
- 账套列表可稳定拉取。
- 字段目录报告完成。
- 所有字段脱敏样本落地。

### Phase C2：主数据映射

目标：建立 ERP 与好业财的主数据对应关系。

验收：

- 公司 / 部门 / 客户 / 供应商 / 科目 / 项目映射候选完成。
- 冲突项人工确认。
- 未匹配项进入数据 readiness 清单。

### Phase C3：财务只读对账

目标：应收、应付、现金、科目余额先只读对账。

验收：

- ERP 业务账、ERP 财务中间层、好业财余额三方并排。
- 差异自动分类。
- 不写好业财。

### Phase C4：凭证草稿

目标：ERP 单据能生成标准借贷分录草稿。

验收：

- 采购付款、费用报销、销售收款、股东出资可生成凭证草稿。
- 财务人员审核后确认。
- 仍不自动推送好业财。

### Phase C5：受控写入好业财

目标：只在明确批准后推送凭证。

前置：

- 幂等键。
- 冲销策略。
- 回滚流程。
- A2 安全 Gate。
- 财务 UAT。

## 权限与审计

必须使用独立菜单码：

- `MENU_SETTINGS_CHANJET`：配置与诊断。
- `MENU_FIN2_CHANJET_SYNC`：同步快照。
- `MENU_FIN2_CHANJET_MAPPING`：主数据映射。
- `MENU_FIN2_CHANJET_RECONCILE`：对账。
- `MENU_FIN2_CHANJET_VOUCHER_DRAFT`：凭证草稿。
- `MENU_FIN2_CHANJET_PUSH`：未来受控推送。

所有外部调用必须审计：

- 操作人。
- 接口路径。
- 账套。
- 期间。
- 结果。
- 错误。
- 请求范围。

不得记录：

- appSecret。
- openToken。
- appTicket。
- certificate。
- 消息秘钥。

## 数据安全边界

- 好业财 token/certificate 不进前端。
- 前端只调用 ERP 后端。
- 不允许浏览器直接访问好业财 OpenAPI。
- 不允许把好业财错误原文中可能含敏感信息的字段直接透给普通用户。
- 不允许把好业财字段直接映射成 ERP 业务写入字段。

## 下一步实施建议

立刻启动：

1. `CHANJET_FIELD_CATALOG_PROBE_V1`
   - 生成全模块字段目录。
   - 使用当前已恢复 token。

2. `CHANJET_ACCOUNT_BOOK_MAPPING_V1`
   - 锁定 3 个账套与 ERP 公司映射。

3. `CHANJET_MASTER_MAPPING_DRAFT_V1`
   - 客户 / 供应商 / 部门 / 科目 / 项目映射候选。

4. `CHANJET_AP_AR_GL_READONLY_RECONCILIATION_V1`
   - 扩展应付、现金、科目余额只读对账。

暂不启动：

- 自动写凭证。
- 自动改好业财主数据。
- 自动推送业务单据。
- 自动冲销。

## 当前结论

**GO WITH CONDITIONS**

好业财连接链路已恢复，可以开始全模块字段发现和只读对账层建设。第一目标不是直接写好业财，而是建立稳定、可审计、可回滚的中间层，把 ERP 业务事实与财务系统会计结果对齐。

