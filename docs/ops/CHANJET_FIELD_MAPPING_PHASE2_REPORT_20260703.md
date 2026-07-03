# 好业财字段语义映射 Phase 2 报告

日期：2026-07-03
阶段：CHANJET_FIELD_MAPPING_PHASE2
结论：GO WITH CONDITIONS

## 1. 本轮目标

在好业财只读镜像已经可稳定落库后，补齐“字段语义映射与 ERP 适配层”的可执行报告能力。

目标不是写入好业财，也不是直接改 ERP 业务表，而是把好业财字段候选按业务域、风险等级、端点和改造优先级聚合，形成下一轮 ERP 字段适配的任务入口。

## 2. 新增能力

新增脚本：

- `scripts/ops/chanjet-field-mapping-report.mjs`

脚本输出：

- `docs/ops/runs/chanjet-field-mapping-report-latest.json`
- `docs/ops/runs/chanjet-field-mapping-report-latest.md`

脚本读取 ERP 中间层表：

- `chanjet_erp_field_mapping`
- `chanjet_entity_snapshots`，如存在
- `chanjet_master_mapping`，如存在

## 3. 报告内容

报告包含：

1. 字段总数、已匹配数、待处理数。
2. API metadata 字段数量。
3. 虚假客户/供应商目标表残留数量。
4. 按 endpoint 的字段覆盖情况。
5. 按 ERP domain / risk / match_status 的聚合统计。
6. Top open fields。
7. 自动生成 improvement backlog。

## 4. 改造优先级

### P0-FINANCE-MAPPING

范围：

- 往来单位
- 金额 / 余额
- 会计科目
- 凭证
- 应收 / 应付统计

建议：先冻结字段字典和转换规则，不直接改业务表；确认后进入 ERP 适配层 DTO/API/UI Gate。

### P1-MASTER-DATA-MAPPING

范围：

- 部门
- 项目
- 币种
- 客户 / 供应商
- 资金账号

建议：对账 ERP 主数据编码，补映射关系和人工审核状态，禁止自动覆盖 ERP 主数据。

### P1-REPORTING-MAPPING

范围：

- 资产负债表
- 利润表
- 现金流量表
- 科目余额表

建议：保持只读快照，建立报表查询模型和口径说明，禁止直接替换 ERP 财务事实表。

### P2-CLASSIFICATION

范围：

- 未归类字段
- 低风险字段
- 可忽略字段

建议：批量人工分类，确认是否忽略、归入元数据或进入后续 schema 设计。

## 5. 安全边界

本轮未执行：

- 写好业财：否
- 删除好业财数据：否
- 修改好业财数据：否
- 推送凭证：否
- 写 ERP 业务表：否
- migration：否
- deploy：仅脚本提交后随 CI/CD 更新仓库，不执行数据库结构变更

## 6. 本地验证

- `node --check scripts/ops/chanjet-field-mapping-report.mjs`：PASS
- `node scripts/ops/chanjet-field-mapping-report.mjs --output-dir docs/ops/runs --top 60`：PASS

生产复跑结果：字段候选 1677，已匹配 183，待处理 1494，高风险开放项 1341，API metadata 183，虚假客户/供应商目标表残留 0，envelope 误分类残留 0。

## 7. 下一步建议

1. 在生产环境基于真实只读镜像数据运行字段语义映射报告。
2. 优先处理 P0-FINANCE-MAPPING。
3. 生成 ERP 适配层字段字典，先做只读查询 / 汇总 / 对账，不写好业财。
4. 待字段字典确认后，再按 Gate 进入 ERP DTO/API/UI 改造。

## 8. 生产中间层复跑摘要

- Decision: GO_WITH_CONDITIONS
- Total mapped field candidates: 1677
- Matched fields: 183
- Pending fields: 1494
- High/Critical open fields: 1341
- API metadata fields: 183
- Fake counterparty targets: 0
- Envelope business-target noise: 0
- 最高优先级 endpoint: /accounting/gl/AcctgTrans/acctgTransFuzzySearch/3537748712226818

输出文件：

- docs/ops/runs/chanjet-field-mapping-report-latest.json
- docs/ops/runs/chanjet-field-mapping-report-latest.md
