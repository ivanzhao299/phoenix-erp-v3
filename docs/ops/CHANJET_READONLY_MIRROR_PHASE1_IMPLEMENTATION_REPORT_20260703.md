# 好业财只读镜像 Phase 1 实施报告

日期：2026-07-03
阶段：CHANJET_READONLY_MIRROR_PHASE1
结论：GO WITH CONDITIONS

## 1. 本轮目标

按用户批准的方案，把好业财对接从“探针 + 中间层骨架”推进到“ERP 端可沉淀好业财只读镜像、字段目录和 ERP 字段差异候选”。

本轮遵守边界：

- 不写好业财。
- 不删除好业财数据。
- 不修改好业财数据。
- 不推送凭证。
- 不把好业财快照直接写入 ERP 业务主表。
- 只写 ERP 自己的 `chanjet_*` 中间层表。

## 2. 新增/修改文件

后端：

- `apps/api/src/modules/chanjet/chanjet-read-snapshot.entity.ts`
- `apps/api/src/modules/chanjet/chanjet-entity-snapshot.entity.ts`
- `apps/api/src/modules/chanjet/chanjet-erp-field-mapping.entity.ts`
- `apps/api/src/database/migrations/1782742000000-CreateChanjetReadonlyMirror.ts`
- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/api/src/modules/chanjet/chanjet.module.ts`

前端：

- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`

文档：

- `docs/ops/CHANJET_READONLY_MIRROR_PHASE1_IMPLEMENTATION_REPORT_20260703.md`

## 3. 新增中间层表

### `chanjet_read_snapshots`

保存好业财只读接口返回的原始镜像快照：

- `book_id`
- `endpoint_key`
- `api_domain`
- `api_path`
- `method`
- `period`
- `payload_hash`
- `row_count`
- `raw_payload`
- `pulled_at`

说明：

- `raw_payload` 只存脱敏后的响应。
- 使用 `book_id + endpoint_key + payload_hash` 防止同一响应无限重复写入。
- 该表是审计与重现用途，不是 ERP 业务事实表。

### `chanjet_entity_snapshots`

保存解析后的标准化实体镜像：

- `entity_type`
- `external_id`
- `external_code`
- `external_name`
- `status`
- `amount`
- `currency`
- `raw_data`

说明：

- 用于 ERP 端汇总、搜索、差异分析。
- 不直接覆盖 ERP 主数据。

### `chanjet_erp_field_mapping`

保存好业财字段与 ERP 字段的适配候选：

- 好业财接口、字段路径、字段类型、脱敏样本。
- ERP 业务域、表、字段、建议类型。
- 匹配状态、风险等级、决策状态、转换规则。

说明：

- 自动分析只生成候选。
- 真正改 ERP schema / DTO / 页面必须另走实现 Gate。

## 4. 新增后端 API

新增受控 API：

- `POST /api/chanjet/integration/mirror/sync`
  - 只读好业财。
  - 写 ERP 中间层快照、实体摘要、字段目录。

- `GET /api/chanjet/integration/mirror/read-snapshots`
  - 查询原始只读快照。

- `GET /api/chanjet/integration/mirror/entity-snapshots`
  - 查询标准化实体镜像。

- `GET /api/chanjet/integration/field-mappings`
  - 查询好业财字段与 ERP 字段差异候选。

- `POST /api/chanjet/integration/field-mappings/analyze`
  - 从字段目录生成 ERP 字段适配候选。

权限：

- 查询：`MENU_FIN2_AR_LEDGER:V`
- 同步 / 分析：`MENU_FIN2_AR_LEDGER:E`

## 5. 只读镜像同步范围

默认镜像同步覆盖：

- 账套列表
- 部门列表
- 往来单位
- 科目列表
- 项目列表
- 资金账号
- 应付统计
- 应收统计
- 付款单列表
- 收款单列表
- 采购订单列表
- 凭证列表
- 科目余额表
- 资产负债表
- 利润表
- 现金流量表

额外可探针范围保留：

- 采购申请单
- 销售订单
- 入库单
- 销售出库单

如好业财权限不足，接口失败会记录到 `chanjet_sync_jobs`，不会中断其它接口的审计结果。

## 6. 前端页面

`/finance2/chanjet-integration` 已增强：

- 新增「只读镜像」页签。
  - 查看标准化实体。
  - 查看原始快照审计。
  - 可触发只读镜像同步。

- 新增「字段差异」页签。
  - 查看好业财字段与 ERP 字段候选映射。
  - 可触发字段差异分析。

- 总览卡片新增：
  - 镜像实体数量。
  - 原始快照数量。
  - 字段差异候选数量。
  - 待归类字段数量。

## 7. 当前限制

1. 真实同步仍依赖生产/运行环境中有效的 `appTicket / certificate / openToken`。
2. 本轮没有执行真实好业财写入，也没有实现凭证推送。
3. 字段差异是自动候选，不代表最终 ERP schema 设计。
4. 好业财部分接口可能需要模块权限或参数补充，失败会进入作业审计。
5. 当前只做第一页 / 默认请求体的镜像基础能力，分页深拉取需要 Phase 2 加强。

## 8. 验证结果

- API typecheck：PASS
- Web typecheck：PASS
- TS migration down() gate：PASS
- TS migration no-data-DML gate：PASS
- Nullable unique gate：PASS

## 9. 是否触碰边界

- 是否写好业财：否
- 是否删除好业财数据：否
- 是否修改好业财数据：否
- 是否推送凭证：否
- 是否写 ERP 业务主表：否
- 是否新增 migration：是，仅 ERP 中间层建表 migration
- 是否部署：否
- 是否 push：否

## 10. 下一步建议

1. 执行一次受控 `mirror/sync`，确认真实可读模块。
2. 针对失败接口补参数和权限说明。
3. 增加分页拉取能力，支持完整重现好业财开放模块数据。
4. 生成 `CHANJET_ERP_FIELD_GAP_REPORT`，把差异按 P0/P1/P2 分类。
5. 启动 ERP 字段适配 Gate，只改 ERP，不写好业财。
6. 最后再进入凭证草稿规则和写好业财前置 Gate。
