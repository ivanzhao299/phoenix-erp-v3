# B4 老挝凤凰农业蛋鸡项目｜ERP 分级包装中心 Terminal 作业台改优需求说明

版本：v1.0  
用途：交给 Claude Code / Codex / 开发团队作为功能改造输入文档  
范围：ERP「分级包装中心」模块，PC 端保持功能树，生产现场改造为触控一体机 Terminal 作业台

---

## 0. 给 Claude Code 的执行说明

请基于本需求文档，检查现有代码仓库并完成 ERP「分级包装中心」模块的产品化改造方案与代码实现。实现时遵循以下原则：

1. PC 端现有功能树不删除、不重构为完全不同的信息架构，除非代码中存在明显问题。PC 端继续承担配置、审核、查询、报表、追溯和管理职能。
2. 新增或优化生产现场 Terminal 端页面。Terminal 端不照搬 PC 菜单，而是采用「今日任务 + 当前批次 + 扫码/质检/分级/包装/打印/入库/异常」的一屏式作业台。
3. 优先保障业务闭环：来源批次接收、首检放行、分级、包装、标签打印、箱码/托盘码绑定、成品入库、异常处理、包装日报、追溯查询。
4. 所有关键动作需要留痕。不得通过直接覆盖数据的方式修改生产、质检、库存、标签、批次记录。
5. 若后端 API 尚未完整存在，请先定义 TypeScript 类型、接口契约、mock 数据和页面状态机，再预留真实 API 接入点。
6. 若代码仓库已有 UI 框架、状态管理、路由、权限、接口封装、测试框架，请沿用现有技术栈，不要引入不必要的新依赖。
7. 所有关键流程需要补充单元测试、集成测试或 E2E 测试用例，尤其是批次状态流转、首检拦截、标签补打、入库平衡、异常闭环。

建议交付物：

- Terminal 端页面/路由/组件
- 业务状态机与枚举定义
- 数据模型 TypeScript 类型或接口定义
- API 契约或 mock service
- 批次、质检、标签、入库、异常的校验规则
- 测试用例
- 开发 README 或模块说明

---

## 1. 项目背景

当前 ERP 中「分级包装中心」采用 PC 管理端功能树形式，包含：

- 集蛋作业台
- 集蛋入库
- 分级作业
- 包装作业
- 首检录入
- 标签打印
- 批次管理
- 包装日报
- 异常处理

该结构适合办公室人员、主管、质检、仓库、数据内勤和管理层使用，但不适合生产现场触控一体机。生产现场人员需要的是连续作业流，而不是菜单检索。

因此，本次优化的核心是：

- PC 端保持功能树，用于配置、审核、复盘、报表和追溯。
- Terminal 端改造成现场作业台，用于扫码、接收、首检、分级、包装、打印、入库、异常处理和交班。

---

## 2. 业务目标

分级包装中心需要实现以下业务目标：

1. 一批一号：每个来源批次、分级批次、包装批次均有唯一编号。
2. 一筐一码/一箱一码/一托一码：容器、箱、托盘均可扫码追溯。
3. 首检前置：未完成首检或首检未放行的批次，不得进入包装、标签打印和成品入库。
4. 标签防错：标签模板、产品、等级、规格、批次、日期、箱码必须匹配。
5. 异常隔离：破损、脏污、渗漏、地面蛋、混批、标签错打、设备故障必须进入异常流程。
6. 账实平衡：投入数量与分级产出、包装产出、破损、报废、抽检消耗、库存入库之间必须可解释。
7. 全链路追溯：从销售箱码可反查到包装批次、分级批次、来源批次、鸡舍、产蛋日期、班次、操作人、QC 记录。
8. 现场易用：Terminal 页面必须适配触控屏、大按钮、少输入、扫码优先、设备状态可见。

---

## 3. 角色与权限

| 角色 | 主要职责 | Terminal 权限 |
|---|---|---|
| 现场操作员 | 接收、分级、包装、扫码、基础异常上报 | 可执行当前任务，不可放行/冻结/补打高风险标签 |
| 班组长 | 开班、交班、差异确认、异常初审 | 可确认差异、提交交班、授权部分补录 |
| QC/质检员 | 首检、复检、扣留、放行、报废建议 | 可录入首检、放行/扣留/复检 |
| 仓管员 | 成品入库、库位、托盘接收 | 可扫码入库、确认库位 |
| 生产主管 | 作业监控、批次复核、异常关闭 | 可查看全局、冻结/解冻批次、关闭异常 |
| IT/设备运维 | 设备状态、打印、扫码、采集服务 | 可查看设备状态，不可修改业务结果 |
| 管理层 | 报表、追溯、绩效、损耗分析 | 只读或审批权限 |

权限原则：

- 操作员只能处理当前任务。
- QC 放行是进入包装和入库的闸口。
- 标签补打、批次冻结、报废、红冲、库存调整必须受控。
- 所有关键动作写入审计日志。

---

## 4. 一期范围

一期建议实现以下功能：

1. Terminal 首页：今日任务、当前批次、设备状态、异常提醒。
2. 开班/点检：班次、人员、产线、设备、卫生点检。
3. 来源批次接收：扫码接收集蛋批次，确认数量、重量、容器数。
4. 首检录入：抽检、破损、脏污、渗漏、异形、地面蛋、QC 结论。
5. 分级作业：按等级记录产出，支持手工录入和后续设备对接。
6. 包装作业：按包装规格卡片操作，绑定包材批次。
7. 标签打印：随包装自动打印，补打需授权和原因。
8. 成品入库：箱码/托盘码绑定，扫码入库。
9. 异常处理：异常上报、隔离、复检、返工、报废、关闭。
10. 包装日报：班次维度自动生成交班日报。
11. 追溯查询：支持箱码/批次码正向、反向追溯。

二期再考虑：

- 分级机深度集成
- 视觉识别
- 自动称重
- 自动码垛
- BI 损耗分析
- 客户订单驱动包装
- 多语言标签模板管理深化

---

## 5. PC 端与 Terminal 端信息架构

| 当前 PC 功能 | PC 端定位 | Terminal 端优化方式 |
|---|---|---|
| 集蛋作业台 | 生产计划、班次看板、产线监控 | 今日任务首页，只显示现场当前任务和状态 |
| 集蛋入库 | 入库单、库存、库位、审批 | 扫来源批次码，确认筐数、蛋数、重量 |
| 分级作业 | 分级规则、历史查询、产出复盘 | 实时分级产出看板，大按钮录入或设备采集 |
| 包装作业 | 包装工单、规格、BOM、成本核算 | 规格卡片化，扫包材，自动生成箱码 |
| 首检录入 | QC 标准配置、检验记录复核 | 首检作为放行闸口，未放行不得包装/入库 |
| 标签打印 | 模板管理、批量补打、权限控制 | 正常随包装打印，补打受控 |
| 批次管理 | 拆批、并批、冻结、追溯 | Terminal 仅显示当前批次卡，不开放复杂编辑 |
| 包装日报 | 管理报表、班组绩效、损耗分析 | Terminal 只显示交班小结，PC 端做分析 |
| 异常处理 | 审批、原因分析、整改闭环 | Terminal 一键上报，PC 端复核关闭 |

---

## 6. Terminal 首页设计

建议路由：

```text
/terminal/packaging/dashboard
```

页面定位：生产现场分级包装作业台首页。

顶部固定信息：

- 场区
- 产线
- 班次
- 操作员
- 当前工单
- 当前来源批次
- QC 状态
- 网络状态
- 打印机状态
- 扫码枪状态
- 电子秤状态
- 分级机状态
- 未关闭异常数

中间区域分三块：

1. 当前批次卡
   - 来源批次号
   - 场区
   - 鸡舍
   - 鸡群
   - 产蛋日期
   - 集蛋时间
   - 接收数量
   - 接收重量
   - 当前状态

2. 当前作业动作
   - 开班/点检
   - 接收批次
   - 首检
   - 开始分级
   - 开始包装
   - 标签打印
   - 入库交接
   - 异常上报
   - 交班

3. 实时产出
   - A级大码
   - A级中码
   - A级小码
   - B级
   - 脏污蛋
   - 破损蛋
   - 淘汰蛋
   - 待复检蛋
   - 已包装箱数
   - 已入库托盘数

底部防错提醒区：

- 未扫来源批次
- 首检未放行
- 包材批次未绑定
- 标签模板与 SKU 不匹配
- 当前输出超过输入平衡
- 打印机离线
- 电子秤离线
- 分级机离线
- 存在未关闭异常

交互原则：

- 扫码优先，手工录入兜底。
- 按钮尺寸适配触控屏，建议主操作按钮高度不低于 64px。
- 关键状态用颜色 + 文案双重提示，不能只依赖颜色。
- 高风险动作二次确认，例如完成入库、报废、补打、冻结、关闭异常。
- 页面不显示复杂菜单，只显示当前作业相关动作。

---

## 7. 开班/点检页面

建议路由：

```text
/terminal/packaging/shift-open
```

功能：创建或确认当前班次，绑定人员、产线、设备和基础卫生点检。

字段：

- shift_id
- shift_code
- production_date
- site_id
- line_id
- team_id
- operator_id
- supervisor_id
- terminal_id
- printer_id
- scanner_id
- scale_id
- grader_id
- hygiene_check_result
- device_check_result
- opened_at

点检项目：

- 扫码枪在线
- 标签打印机在线
- 电子秤在线
- 分级机在线或人工模式确认
- 网络在线或离线缓存可用
- 本地采集服务在线
- 包装区域卫生已确认
- 空箱/蛋托/标签等包材已准备

校验规则：

- 未开班不得进行接收、首检、分级、包装和入库。
- 关键设备离线时允许进入人工模式，但必须记录原因。
- 点检未完成不得开始作业。

---

## 8. 来源批次接收页面

建议路由：

```text
/terminal/packaging/source-receive
```

功能：接收来自鸡舍/集蛋线/集蛋入库模块的来源批次。

主要动作：

1. 扫来源批次码。
2. 系统带出场区、鸡舍、鸡群、产蛋日期、预计数量、预计重量。
3. 现场确认实收筐数、托盘数、蛋数、重量、异常数量。
4. 提交接收。
5. 批次状态变更为「待首检」。

字段：

- source_batch_id
- source_batch_code
- site_id
- house_id
- flock_id
- lay_date
- collection_time
- expected_qty
- received_qty
- expected_weight
- received_weight
- container_count
- tray_count
- dirty_qty
- broken_qty
- floor_egg_qty
- variance_reason
- received_by
- received_at

校验规则：

- 来源批次码不得重复接收。
- 实收数量与预计数量差异超过阈值时必须录入差异原因并生成异常。
- 来源批次接收完成后才能进入首检。
- 批次一旦进入分级或包装，不允许直接修改接收数量，只能走调整或红冲。

---

## 9. 首检录入页面

建议路由：

```text
/terminal/packaging/qc-first-inspection
```

功能：QC 对来源批次进行首检，并给出放行、扣留、复检、报废等结论。

字段：

- inspection_id
- source_batch_id
- sample_qty
- broken_qty
- dirty_qty
- leaking_qty
- abnormal_shape_qty
- floor_egg_qty
- average_weight
- shell_cleanliness_result
- odor_result
- container_cleanliness_result
- photo_urls
- qc_result
- qc_comment
- inspector_id
- inspected_at

QC 结果枚举：

```ts
type QCResult =
  | 'PENDING'
  | 'PASSED'
  | 'CONDITIONAL_RELEASE'
  | 'ON_HOLD'
  | 'RECHECK_REQUIRED'
  | 'REJECTED'
  | 'SCRAPPED';
```

业务规则：

- PENDING：待检，不允许分级包装。
- PASSED：合格，允许进入分级包装。
- CONDITIONAL_RELEASE：让步放行，需要授权角色签名并记录原因。
- ON_HOLD：扣留，只能进入异常隔离或复检。
- RECHECK_REQUIRED：复检中，不允许包装入库。
- REJECTED/SCRAPPED：不得进入正常生产流程。

关键拦截：

- 未首检不得进入包装。
- 未放行不得打印正式成品标签。
- 首检扣留批次不得入成品库存。
- QC 记录与批次强绑定，后续追溯必须可查。

---

## 10. 分级作业页面

建议路由：

```text
/terminal/packaging/grading
```

功能：记录来源批次进入分级线后的等级产出。

字段：

- grading_batch_id
- source_batch_id
- line_id
- shift_id
- grading_rule_version
- started_by
- started_at
- finished_at
- input_qty
- input_weight
- output_large_a_qty
- output_medium_a_qty
- output_small_a_qty
- output_b_qty
- dirty_qty
- broken_qty
- rejected_qty
- recheck_qty
- loss_qty

页面布局：

- 左侧：来源批次和投入数量。
- 中间：当前分级状态、开始/暂停/恢复/完成。
- 右侧：各等级实时产出，大数字显示。
- 底部：异常上报、手工修正、提交包装待办。

校验规则：

- QC 未放行不得开始分级。
- 分级规则版本必须记录。
- 输出数量不得明显超过输入数量。
- 若输出与输入差异超过允许损耗阈值，完成分级时必须录入差异原因。
- 设备采集数据与人工修正数据必须分开记录，不得覆盖原始采集值。

---

## 11. 包装作业页面

建议路由：

```text
/terminal/packaging/packing
```

功能：按包装规格进行包装，绑定包材批次，生成箱码/托盘码。

页面形式：规格卡片。

规格卡片示例：

- 30 枚纸托/箱
- 360 枚周转箱
- 12 盒/箱
- 客户定制规格

字段：

- packaging_batch_id
- grading_batch_id
- product_id
- grade
- sku_id
- packaging_spec_id
- material_batch_ids
- label_template_id
- planned_box_count
- actual_box_count
- eggs_per_box
- total_egg_qty
- total_weight
- packed_by
- packed_at

包材绑定：

- 蛋托批次
- 纸箱批次
- 标签批次
- 胶带/封箱耗材
- 托盘
- 其他客户指定包材

校验规则：

- 未绑定包材批次不得完成包装。
- 包装规格必须与产品、等级、标签模板匹配。
- 包装数量不能超过当前可包装等级余量。
- 包装完成后生成箱码。
- 箱码未校验不得入库。

---

## 12. 标签打印页面

建议路由：

```text
/terminal/packaging/label-print
```

功能：随包装动作自动打印标签，并受控处理补打。

正常打印：

- 包装完成后自动生成箱码。
- 系统根据 SKU、等级、包装规格、目的市场选择标签模板。
- 打印完成后记录 print_log。
- 打印后要求扫码校验箱码。

补打规则：

- 普通操作员不得自由补打。
- 补打需要班组长、QC 或仓库授权。
- 补打必须关联原箱码。
- 补打必须记录原因。
- 系统需记录原标签码、新标签码、补打次数、补打人、补打时间。
- 已入库或已出库标签补打需要更高权限。

字段：

- print_log_id
- box_code
- packaging_batch_id
- label_template_id
- print_type: NORMAL | REPRINT
- printer_id
- printed_by
- printed_at
- reprint_reason
- old_label_code
- new_label_code
- print_status

标签内容建议包含：

- 品牌/公司
- 产品名称
- 等级
- 规格
- 枚数/重量
- 产蛋日期
- 包装日期
- 批次号
- 箱码/二维码
- 储存条件
- 目的市场需要的语言字段

---

## 13. 成品入库页面

建议路由：

```text
/terminal/packaging/warehouse-handover
```

功能：包装完成后，扫码箱码/托盘码，仓库确认接收。

字段：

- receipt_id
- packaging_batch_id
- pallet_code
- box_codes
- warehouse_id
- location_id
- received_box_count
- received_egg_qty
- received_weight
- handed_over_by
- received_by
- received_at

业务规则：

- 箱码未打印或未校验不得入库。
- QC 未放行不得入库。
- 批次冻结不得入库。
- 入库数量必须与包装完成数量一致；差异需要仓管或班长确认原因。
- 入库后不得直接修改包装记录，只能走调整单或红冲。

---

## 14. 异常处理页面

建议路由：

```text
/terminal/packaging/exceptions
```

功能：现场快速上报异常，PC 端复核、处理、关闭。

异常类型：

```ts
type ExceptionType =
  | 'QUANTITY_VARIANCE'
  | 'BROKEN_RATE_HIGH'
  | 'DIRTY_RATE_HIGH'
  | 'LEAKING_EGG'
  | 'FLOOR_EGG'
  | 'MIXED_BATCH'
  | 'LABEL_MISMATCH'
  | 'PRINT_FAILURE'
  | 'SCANNER_FAILURE'
  | 'SCALE_FAILURE'
  | 'GRADER_FAILURE'
  | 'NETWORK_FAILURE'
  | 'QC_REJECTED'
  | 'WAREHOUSE_VARIANCE'
  | 'MANUAL_CORRECTION'
  | 'OTHER';
```

异常状态：

```ts
type ExceptionStatus =
  | 'REPORTED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RECHECK_REQUIRED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';
```

字段：

- exception_id
- exception_type
- related_batch_id
- related_box_code
- severity
- quantity
- description
- photo_urls
- reported_by
- reported_at
- assigned_to
- action_taken
- closed_by
- closed_at

处理方式：

- 继续观察
- 班长复核
- QC 复检
- 设备维修
- 批次隔离
- 返工
- 降级
- 报废
- 退回
- 关闭

业务规则：

- 重大异常未关闭不得交班。
- 混批、标签错打、QC 拒绝类异常必须冻结相关批次。
- 异常关闭必须记录处理结果和责任人。

---

## 15. 交班日报页面

建议路由：

```text
/terminal/packaging/shift-close
```

功能：班次结束时自动生成包装日报和交班摘要。

日报字段：

- shift_id
- production_date
- site_id
- line_id
- operator/team
- received_qty
- received_weight
- graded_qty
- packed_qty
- warehoused_qty
- large_a_qty
- medium_a_qty
- small_a_qty
- b_grade_qty
- broken_qty
- dirty_qty
- rejected_qty
- scrap_qty
- sample_consumed_qty
- variance_qty
- variance_reason
- open_exception_count
- closed_exception_count
- printer_failure_minutes
- grader_downtime_minutes
- submitted_by
- submitted_at

交班规则：

- 有未关闭重大异常时不得直接交班。
- 投入产出不平衡时必须录入差异原因。
- 交班后数据不允许直接修改，只能走调整/红冲。
- PC 端可查看并审核班次日报。

---

## 16. 批次状态机

建议统一批次状态：

```ts
type BatchStatus =
  | 'PENDING_RECEIVE'
  | 'RECEIVED'
  | 'PENDING_QC'
  | 'QC_PASSED'
  | 'QC_CONDITIONAL_RELEASE'
  | 'QC_ON_HOLD'
  | 'GRADING_IN_PROGRESS'
  | 'GRADING_COMPLETED'
  | 'PACKING_IN_PROGRESS'
  | 'PACKING_COMPLETED'
  | 'PENDING_WAREHOUSE'
  | 'WAREHOUSED'
  | 'FROZEN'
  | 'REWORKING'
  | 'SCRAPPED'
  | 'CANCELLED';
```

标准流转：

```text
PENDING_RECEIVE
  -> RECEIVED
  -> PENDING_QC
  -> QC_PASSED / QC_CONDITIONAL_RELEASE
  -> GRADING_IN_PROGRESS
  -> GRADING_COMPLETED
  -> PACKING_IN_PROGRESS
  -> PACKING_COMPLETED
  -> PENDING_WAREHOUSE
  -> WAREHOUSED
```

异常流转：

```text
PENDING_QC -> QC_ON_HOLD -> REWORKING / SCRAPPED / QC_PASSED
任意关键状态 -> FROZEN -> 解冻回到冻结前状态
PACKING_COMPLETED -> REWORKING -> PACKING_COMPLETED
```

状态机要求：

- 每次状态变更必须记录操作人、时间、终端、原因。
- 状态不可随意回退。
- 已入库批次不能直接修改业务数据。
- 冻结批次不能包装、打印、入库、出库。

---

## 17. 数据模型建议

### 17.1 WorkShift

```ts
interface WorkShift {
  id: string;
  code: string;
  productionDate: string;
  siteId: string;
  lineId: string;
  teamId: string;
  operatorIds: string[];
  supervisorId?: string;
  terminalId: string;
  status: 'OPEN' | 'PAUSED' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
}
```

### 17.2 SourceBatch

```ts
interface SourceBatch {
  id: string;
  code: string;
  siteId: string;
  houseId: string;
  flockId: string;
  layDate: string;
  collectionTime?: string;
  expectedQty?: number;
  receivedQty?: number;
  expectedWeight?: number;
  receivedWeight?: number;
  status: BatchStatus;
  qcResult?: QCResult;
  createdAt: string;
}
```

### 17.3 GradingBatch

```ts
interface GradingBatch {
  id: string;
  code: string;
  sourceBatchId: string;
  lineId: string;
  shiftId: string;
  gradingRuleVersion: string;
  inputQty: number;
  inputWeight?: number;
  outputs: GradingOutput[];
  status: BatchStatus;
  startedAt?: string;
  finishedAt?: string;
}

interface GradingOutput {
  grade: 'A_LARGE' | 'A_MEDIUM' | 'A_SMALL' | 'B' | 'DIRTY' | 'BROKEN' | 'REJECTED' | 'RECHECK';
  qty: number;
  weight?: number;
}
```

### 17.4 PackagingBatch

```ts
interface PackagingBatch {
  id: string;
  code: string;
  gradingBatchId: string;
  productId: string;
  skuId: string;
  grade: string;
  packagingSpecId: string;
  materialBatchIds: string[];
  labelTemplateId: string;
  plannedBoxCount?: number;
  actualBoxCount: number;
  eggsPerBox: number;
  totalEggQty: number;
  totalWeight?: number;
  status: BatchStatus;
  packedBy: string;
  packedAt?: string;
}
```

### 17.5 BoxCode 与 PalletCode

```ts
interface BoxCode {
  code: string;
  packagingBatchId: string;
  productId: string;
  skuId: string;
  grade: string;
  eggQty: number;
  weight?: number;
  labelPrinted: boolean;
  labelVerified: boolean;
  status: 'CREATED' | 'PRINTED' | 'VERIFIED' | 'WAREHOUSED' | 'VOIDED';
}

interface PalletCode {
  code: string;
  boxCodes: string[];
  warehouseId?: string;
  locationId?: string;
  status: 'CREATED' | 'WAREHOUSED' | 'VOIDED';
}
```

### 17.6 QCInspection

```ts
interface QCInspection {
  id: string;
  sourceBatchId: string;
  sampleQty: number;
  brokenQty: number;
  dirtyQty: number;
  leakingQty: number;
  abnormalShapeQty: number;
  floorEggQty: number;
  averageWeight?: number;
  result: QCResult;
  comment?: string;
  photoUrls?: string[];
  inspectorId: string;
  inspectedAt: string;
}
```

### 17.7 LabelPrintLog

```ts
interface LabelPrintLog {
  id: string;
  boxCode: string;
  packagingBatchId: string;
  labelTemplateId: string;
  printerId: string;
  printType: 'NORMAL' | 'REPRINT';
  status: 'PENDING' | 'PRINTED' | 'FAILED' | 'VOIDED';
  printedBy: string;
  printedAt: string;
  reprintReason?: string;
  oldLabelCode?: string;
  newLabelCode?: string;
}
```

### 17.8 ExceptionTicket

```ts
interface ExceptionTicket {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  relatedBatchId?: string;
  relatedBoxCode?: string;
  quantity?: number;
  description?: string;
  photoUrls?: string[];
  reportedBy: string;
  reportedAt: string;
  assignedTo?: string;
  actionTaken?: string;
  closedBy?: string;
  closedAt?: string;
}
```

### 17.9 AuditLog

```ts
interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  operatorId: string;
  terminalId?: string;
  createdAt: string;
}
```

---

## 18. API 契约建议

若现有后端不是 REST，可按同等语义改成 GraphQL、tRPC 或项目已有接口风格。

```text
GET  /api/terminal/context
POST /api/packaging/shifts/open
POST /api/packaging/shifts/{shiftId}/close
GET  /api/packaging/tasks/today
POST /api/packaging/source-batches/receive
POST /api/packaging/qc/first-inspections
POST /api/packaging/grading/start
PATCH /api/packaging/grading/{gradingBatchId}/outputs
POST /api/packaging/grading/{gradingBatchId}/finish
POST /api/packaging/packing/start
POST /api/packaging/packing/{packagingBatchId}/boxes
POST /api/packaging/packing/{packagingBatchId}/finish
POST /api/packaging/labels/print
POST /api/packaging/labels/reprint
POST /api/packaging/warehouse/receipts
POST /api/packaging/exceptions
PATCH /api/packaging/exceptions/{exceptionId}
GET  /api/packaging/reports/shift-summary
GET  /api/packaging/traceability/by-code/{code}
```

接口统一要求：

- 所有 POST/PATCH 请求携带 idempotencyKey。
- idempotencyKey 建议由 terminalId + operationId + batchId 组成。
- 所有关键接口返回当前批次最新状态。
- 所有失败返回明确错误码，便于 Terminal 显示现场可理解的提示。

错误码示例：

```ts
type PackagingErrorCode =
  | 'SHIFT_NOT_OPEN'
  | 'SOURCE_BATCH_NOT_FOUND'
  | 'SOURCE_BATCH_ALREADY_RECEIVED'
  | 'QC_NOT_PASSED'
  | 'BATCH_FROZEN'
  | 'MATERIAL_BATCH_REQUIRED'
  | 'LABEL_TEMPLATE_MISMATCH'
  | 'BOX_CODE_NOT_VERIFIED'
  | 'OUTPUT_EXCEEDS_INPUT'
  | 'OPEN_CRITICAL_EXCEPTION_EXISTS'
  | 'DEVICE_OFFLINE'
  | 'IDEMPOTENCY_CONFLICT';
```

---

## 19. 核心校验规则

| 控制点 | 规则 |
|---|---|
| 未开班 | 禁止接收、首检、分级、包装、入库 |
| 无来源批次 | 禁止首检、分级、包装 |
| 首检未放行 | 禁止包装、标签打印、入库 |
| 批次扣留 | 只能进入异常、复检、返工、报废 |
| 包材未绑定 | 禁止包装完成 |
| 标签模板不匹配 | 禁止打印 |
| 箱码未扫码校验 | 禁止入库 |
| 输出大于输入 | 禁止交班，必须录入差异原因 |
| 批次冻结 | 禁止包装、打印、入库、出库 |
| 补打标签 | 必须授权、必须记录原因 |
| 已入库数据修改 | 禁止直接修改，只允许调整/红冲 |
| 未关闭重大异常 | 禁止交班 |

---

## 20. 设备与离线能力

Terminal 现场可能连接以下设备：

- 触控一体机
- 扫码枪
- 标签打印机
- 电子秤
- 分级机
- 摄像头
- 本地采集服务/Windows Agent
- 局域网打印服务

实现建议：

1. Terminal 前端不直接管理复杂驱动。
2. 打印、称重、分级机采集等由本地 Agent 或边缘服务处理。
3. ERP 前端向本地服务发送 JSON 指令，本地服务转为 ZPL/TSPL/串口/设备协议。
4. 打印失败允许重试，但不得重复生成新箱码。
5. 断网时允许本地暂存关键采集记录，恢复后同步。
6. 任何离线同步都必须具备幂等键，避免重复入库、重复打印、重复提交。

设备状态对象建议：

```ts
interface DeviceStatus {
  deviceId: string;
  deviceType: 'SCANNER' | 'PRINTER' | 'SCALE' | 'GRADER' | 'CAMERA' | 'LOCAL_AGENT';
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'UNKNOWN';
  lastHeartbeatAt?: string;
  message?: string;
}
```

---

## 21. 测试方案

### 21.1 功能测试

| 场景 | 验证点 | 通过标准 |
|---|---|---|
| 正常开班 | 人员、班次、产线、设备点检 | 生成可用班次 |
| 来源批次接收 | 扫码、数量、重量、差异 | 批次状态进入待首检 |
| 首检合格 | QC 录入、放行 | 批次允许分级包装 |
| 首检扣留 | QC 拒绝/扣留 | 禁止包装、打印、入库 |
| 分级作业 | 等级产出、损耗、完成 | 产出生成包装待办 |
| 包装作业 | 规格、包材、箱码 | 生成正确箱码 |
| 标签打印 | 模板、打印、扫码校验 | 标签与箱码一致 |
| 补打标签 | 权限、原因、日志 | 补打全程留痕 |
| 成品入库 | 箱码、托盘、库位 | 入库数量与包装一致 |
| 异常处理 | 上报、处理、关闭 | 异常状态完整流转 |
| 交班日报 | 汇总、差异、未关闭异常 | 满足规则后可交班 |

### 21.2 数据回测

建议取最近 2—4 周真实业务数据做回测。数据范围包括：

- 来源批次
- 集蛋入库
- 分级记录
- 包装记录
- 标签记录
- 入库记录
- 异常记录
- 库存调整

回测目标：

1. 批次链路是否完整。
2. 投入、分级产出、包装产出、报废、入库是否平衡。
3. 标签是否能反查来源批次。
4. 异常是否有原因、处理人、处理结果。
5. 新规则是否造成大量误拦截。
6. 历史典型异常是否能被识别。

输出物：

- 数据差异清单
- 规则参数调整表
- 异常原因分析
- 上线风险清单

### 21.3 设备联调测试

| 设备/能力 | 测试内容 | 验收标准 |
|---|---|---|
| 扫码枪 | 连续扫描 100 次 | 不丢码、不重复入账 |
| 打印机 | 连续打印、失败重试 | 标签正确，重打留痕 |
| 电子秤 | 重量读取、异常读数 | 数据准确，异常提示 |
| 分级机 | 自动采集或人工模式 | 数据不重复、不丢失 |
| 本地 Agent | 重启、离线、恢复 | 自动恢复连接 |
| 网络 | 断网、恢复同步 | 不丢数据，不重复提交 |

### 21.4 彩排测试

采用三轮彩排：

1. 办公室沙盘彩排：生产、QC、仓库、包装、IT、财务一起跑流程，不写正式库存。
2. 现场影子运行：选择 1 条产线、1 个班次，旧流程为主账，新 Terminal 同步采集。
3. 小范围准上线：选择一个班次正式写入库存，班长和数据内勤同步复核。

必须演练的突发场景：

- 断网
- 断电
- 打印失败
- 扫码失败
- 电子秤/分级机异常
- 首检不合格
- 标签错打
- 数量差异

### 21.5 UAT 验收

参与角色：

- 现场操作员
- 班组长
- QC
- 仓管
- 包装负责人
- 数据内勤
- 生产主任
- 场长
- 财务/成本人员
- IT 运维

UAT 场景：

- 正常接收、首检、分级、包装、入库
- 首检不合格
- 批次扣留
- 批次冻结/解冻
- 标签补打
- 包材批次绑定
- 交接差异
- 断网补传
- 设备故障
- 日报提交
- 批次追溯
- 权限越权拦截

建议验收标准：

- 关键作业扫码完成率 ≥ 95%
- 标签错打 = 0
- 未放行批次入库 = 0
- 断网数据丢失 = 0
- 重复入库 = 0
- 批次追溯查询可在 30 秒内完成
- 交班账实差异全部有原因记录
- P0 问题为 0
- P1 问题已关闭或有明确替代流程

---

## 22. 开发优先级建议

### 第一优先级

1. 定义批次状态机和核心枚举。
2. 实现 Terminal 首页。
3. 实现开班/点检。
4. 实现来源批次接收。
5. 实现首检放行拦截。
6. 实现分级和包装基础流程。
7. 实现标签打印日志和补打审计。
8. 实现成品入库。
9. 实现异常上报。
10. 实现交班日报。

### 第二优先级

1. 设备状态实时刷新。
2. 本地 Agent 对接。
3. 离线缓存和同步。
4. 分级机数据采集。
5. 电子秤读数。
6. 二维码追溯详情页。

### 第三优先级

1. BI 损耗分析。
2. 多语言标签模板。
3. 客户订单驱动包装。
4. 视觉识别。
5. 自动码垛与库位优化。

---

## 23. Claude Code 首轮执行任务建议

请 Claude Code 在代码仓库中按以下顺序执行：

1. 识别现有 ERP 前端结构、路由、菜单、权限、API 封装、状态管理和测试框架。
2. 找到「分级包装中心」相关模块文件。
3. 在不破坏 PC 功能树的前提下，新增 Terminal 作业台入口。
4. 定义核心类型：BatchStatus、QCResult、ExceptionType、ExceptionStatus、WorkShift、SourceBatch、GradingBatch、PackagingBatch、BoxCode、PalletCode、QCInspection、ExceptionTicket、LabelPrintLog、AuditLog。
5. 建立 mock 数据和 mock service，先跑通 Terminal 页面。
6. 实现首页 dashboard：任务卡、当前批次、设备状态、异常提醒、快捷动作。
7. 实现来源接收、首检、分级、包装、标签、入库、异常、交班页面的最小可用版本。
8. 添加业务校验规则。
9. 添加测试用例，覆盖状态流转、首检拦截、标签补打、入库平衡、异常闭环。
10. 输出 README，说明模块入口、数据流、接口依赖、测试方式和后续待接入项。

---

## 24. 最终验收口径

该模块完成后，应达到以下效果：

1. PC 端仍然可以按原功能树进行管理操作。
2. 现场 Terminal 端可以不进入复杂菜单，直接完成一整班分级包装作业。
3. 每个来源批次、分级批次、包装批次、箱码、托盘码均可追溯。
4. 首检未放行的批次无法进入包装、标签打印和成品入库。
5. 标签打印和补打均可审计。
6. 包材批次与包装批次绑定。
7. 分级包装投入产出可平衡，差异可解释。
8. 异常可上报、处理、关闭，重大异常未关闭不得交班。
9. 断网、打印失败、设备异常等现场问题有明确处理路径。
10. 班次日报自动生成，管理层可在 PC 端复盘产量、损耗、异常和库存。

---

## 25. 关键词索引

- 分级包装中心
- Terminal 作业台
- 集蛋接收
- 首检放行
- 分级作业
- 包装作业
- 标签打印
- 箱码
- 托盘码
- 批次追溯
- 异常隔离
- 包材批次
- 入库交接
- 交班日报
- 状态机
- 幂等
- 离线缓存
- 本地 Agent
